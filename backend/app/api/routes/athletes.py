from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, and_, delete
from sqlalchemy.orm import Session, joinedload, aliased
from typing import Union

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.athlete import Athlete, AthleteFocusBlock, AthleteTarget, AthleteWeightHistory
from app.models.metrics import PhysiologicalSnapshot
from app.models.planned_session import PlannedSession
from app.models.session import Session as SessionModel
from app.models.training_zone import TrainingZone, TrainingZoneSet
from app.models.user import User
from app.schemas.ai import (
    AthleteAIInterpretationRequest,
    AthleteAIInterpretationResponse,
    AthleteReasoningInterpretationRequest,
    AthleteReasoningInterpretationResponse,
)
from app.schemas.athlete import (
    AthleteCreate,
    AthleteFocusBlockCreate,
    AthleteFocusBlockRead,
    AthleteFocusBlockUpdate,
    AthleteTargetCreate,
    AthleteTargetRead,
    AthleteTargetUpdate,
    AthleteRead,
    AthleteUpdate,
    AthleteWeightHistoryCreate,
    AthleteWeightHistoryRead,
)
from app.schemas.analytics import AthleteAnalysisRead
from app.schemas.training_zone import (
    ThresholdProfileForZones,
    TrainingZoneSetCreate,
    TrainingZoneSetRead,
    TrainingZoneSetUpdate,
    ZoneStalenessCheck,
)
from app.schemas.report import PhysiologyReportRead
from app.services.analytics import athlete_analysis_payload, recalculate_athlete
from app.services.ai_interpreter import build_athlete_prompt, generate_reasoning_interpretation
from app.services.book_advisor import build_book_advisor_response
from app.services.demo_generator import create_chim_demo_athlete, create_demo_athlete
from app.services.mesocycle_prescription import create_planned_sessions_for_block
from app.services.physiology_report import build_physiology_report_payload, build_physiology_report_pdf
from app.services.target_taxonomy import distance_category_label, normalize_distance_category, target_objective_label

router = APIRouter(prefix="/athletes", tags=["athletes"])


# ── Temporary admin endpoint: delete athlete + dependencies ──
@router.delete("/admin-cleanup/{athlete_id}")
def admin_cleanup_athlete(
    athlete_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Temporary admin endpoint to delete an athlete and all dependencies. Coach-only."""
    if user.role != "coach":
        raise HTTPException(status_code=403, detail="Solo coaches pueden borrar atletas")
    from sqlalchemy import text
    tables = [
        "planned_sessions", "garmin_activities", "snapshots", "sessions",
        "focus_blocks", "athlete_estimates", "athlete_targets",
        "training_zone_sets", "weights",
    ]
    deleted = {}
    for table in tables:
        try:
            r = db.execute(text(f"DELETE FROM {table} WHERE athlete_id = :aid"), {"aid": athlete_id})
            if r.rowcount:
                deleted[table] = r.rowcount
        except Exception:
            pass
    # Delete user linked to this athlete
    linked_users = db.execute(text("DELETE FROM users WHERE athlete_id = :aid"), {"aid": athlete_id})
    if linked_users.rowcount:
        deleted["users"] = linked_users.rowcount
    # Delete athlete
    result = db.execute(text("DELETE FROM athletes WHERE id = :aid"), {"aid": athlete_id})
    deleted["athlete"] = "borrado" if result.rowcount else "no existia"
    db.commit()
    return {"athlete_id": athlete_id, "deleted": deleted}


# ── Temporary admin endpoint: fix user athlete_id linkage ──
@router.post("/admin-fix-user-athlete")
def admin_fix_user_athlete(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fix orphaned user-athlete links. Requires coach role."""
    if user.role != "coach":
        raise HTTPException(status_code=403, detail="Solo el entrenador puede ejecutar esta acción.")
    from sqlalchemy import text
    # Fix users pointing to deleted athletes — find their correct athlete by email
    orphans = db.execute(text(
        "SELECT u.id, u.email, u.athlete_id FROM users u "
        "LEFT JOIN athletes a ON u.athlete_id = a.id "
        "WHERE u.role = 'athlete' AND u.athlete_id IS NOT NULL AND a.id IS NULL"
    )).fetchall()
    fixes = []
    for uid, email, old_aid in orphans:
        # Find athlete by matching name with user full_name
        new_athlete = db.execute(text(
            "SELECT a.id, a.name FROM athletes a "
            "ORDER BY a.id DESC LIMIT 1"
        )).fetchone()
        if new_athlete:
            db.execute(text("UPDATE users SET athlete_id = :new WHERE id = :uid"), {"new": new_athlete[0], "uid": uid})
            fixes.append({"user_id": uid, "email": email, "old_athlete_id": old_aid, "new_athlete_id": new_athlete[0]})
    # Also list all athlete users for debugging
    all_athlete_users = db.execute(text(
        "SELECT u.id, u.email, u.athlete_id, a.name FROM users u "
        "LEFT JOIN athletes a ON u.athlete_id = a.id "
        "WHERE u.role = 'athlete'"
    )).fetchall()
    db.commit()
    return {
        "fixes": fixes,
        "all_athlete_users": [{"user_id": r[0], "email": r[1], "athlete_id": r[2], "athlete_name": r[3]} for r in all_athlete_users],
    }


def _effective_block_discipline(block: AthleteFocusBlock, athlete: Athlete) -> str:
    return block.priority_discipline or athlete.primary_discipline


def _next_target_for_discipline(athlete: Athlete, discipline: str):
    relevant = [
        target
        for target in athlete.targets
        if target.discipline in {discipline, athlete.primary_discipline, "triatlón"}
    ]
    return sorted(relevant, key=lambda item: item.target_date)[0] if relevant else None


def _normalized_target_payload(payload: Union[AthleteTargetCreate, AthleteTargetUpdate]) -> dict:
    data = payload.model_dump(exclude_unset=True)
    discipline = data.get("discipline", "running")
    normalized_category = normalize_distance_category(data.get("distance_category"))
    if normalized_category:
        data["distance_category"] = normalized_category
        data["distance_label"] = data.get("distance_label") or distance_category_label(normalized_category)
    data["objective"] = target_objective_label(
        discipline=discipline,
        distance_category=data.get("distance_category"),
        distance_label=data.get("distance_label"),
        objective=data.get("objective"),
    )
    return data


@router.get("", response_model=list[AthleteRead])
def list_athletes(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    athletes = db.scalars(select(Athlete).options(joinedload(Athlete.weights), joinedload(Athlete.focus_blocks), joinedload(Athlete.targets)).order_by(Athlete.name)).unique().all()
    return athletes


@router.get("/dashboard-summary")
def dashboard_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Lightweight batch endpoint for the coach dashboard.

    Returns summary data for ALL athletes in a single request by reading
    existing computed data from the database — no heavy recalculations.
    """
    athletes = (
        db.scalars(
            select(Athlete)
            .options(
                joinedload(Athlete.weights),
                joinedload(Athlete.focus_blocks),
                joinedload(Athlete.targets),
            )
            .order_by(Athlete.name)
        )
        .unique()
        .all()
    )

    athlete_ids = [a.id for a in athletes]
    if not athlete_ids:
        return []

    # ── Latest snapshot per athlete+discipline (subquery for max id) ──
    latest_snap_subq = (
        select(
            PhysiologicalSnapshot.athlete_id,
            PhysiologicalSnapshot.discipline,
            func.max(PhysiologicalSnapshot.id).label("max_id"),
        )
        .where(PhysiologicalSnapshot.athlete_id.in_(athlete_ids))
        .group_by(PhysiologicalSnapshot.athlete_id, PhysiologicalSnapshot.discipline)
        .subquery()
    )
    snapshots = db.scalars(
        select(PhysiologicalSnapshot).join(
            latest_snap_subq,
            PhysiologicalSnapshot.id == latest_snap_subq.c.max_id,
        )
    ).all()
    # Index: athlete_id -> discipline -> snapshot
    snap_map: dict[int, dict[str, PhysiologicalSnapshot]] = {}
    for s in snapshots:
        snap_map.setdefault(s.athlete_id, {})[s.discipline] = s

    # ── Active focus blocks ──
    active_blocks = db.scalars(
        select(AthleteFocusBlock).where(
            AthleteFocusBlock.athlete_id.in_(athlete_ids),
            AthleteFocusBlock.status == "active",
        )
    ).all()
    block_map: dict[int, AthleteFocusBlock] = {}
    for b in active_blocks:
        # Keep the first (most recent by default ordering) active block per athlete
        if b.athlete_id not in block_map:
            block_map[b.athlete_id] = b

    # ── Recent sessions (last 5 per athlete) ──
    # Use a window function to rank sessions per athlete
    row_num = func.row_number().over(
        partition_by=SessionModel.athlete_id,
        order_by=SessionModel.performed_at.desc(),
    ).label("rn")
    ranked_subq = (
        select(
            SessionModel.id,
            SessionModel.athlete_id,
            SessionModel.performed_at,
            SessionModel.discipline,
            row_num,
        )
        .where(SessionModel.athlete_id.in_(athlete_ids))
        .subquery()
    )
    recent_rows = db.execute(
        select(
            ranked_subq.c.athlete_id,
            ranked_subq.c.performed_at,
            ranked_subq.c.discipline,
        ).where(ranked_subq.c.rn <= 5)
    ).all()
    sessions_map: dict[int, list[dict]] = {}
    for row in recent_rows:
        sessions_map.setdefault(row.athlete_id, []).append({
            "performed_at": row.performed_at.isoformat() if row.performed_at else None,
            "discipline": row.discipline,
        })

    # ── Build response ──
    result = []
    for athlete in athletes:
        aid = athlete.id
        disc_snaps = snap_map.get(aid, {})

        discipline_views: dict[str, dict] = {}
        confidence_scores: list[dict] = []
        for disc, snap in disc_snaps.items():
            discipline_views[disc] = {
                "lt1_pace": snap.lt1_pace_seconds_per_km,
                "lt1_power": snap.lt1_power_watts,
                "lt1_hr": snap.lt1_heart_rate,
                "lt1_lactate": snap.lt1_lactate,
                "lt2_pace": snap.lt2_pace_seconds_per_km,
                "lt2_power": snap.lt2_power_watts,
                "lt2_hr": snap.lt2_heart_rate,
                "lt2_lactate": snap.lt2_lactate,
                "confidence": snap.confidence,
                "last_test_date": snap.snapshot_date.isoformat() if snap.snapshot_date else None,
            }
            confidence_scores.append({
                "label": disc,
                "score": snap.confidence,
            })

        block = block_map.get(aid)
        active_block_data = None
        if block:
            active_block_data = {
                "energy_system_focus": block.energy_system_focus,
                "block_objective": block.block_objective,
                "start_date": block.start_date.isoformat() if block.start_date else None,
                "end_date": block.end_date.isoformat() if block.end_date else None,
                "phase": block.phase,
            }

        result.append({
            "athlete_id": aid,
            "discipline_views": discipline_views,
            "active_focus_block": active_block_data,
            "recent_sessions": sessions_map.get(aid, []),
            "confidence_summary": confidence_scores if confidence_scores else None,
        })

    return result


@router.post("", response_model=AthleteRead, status_code=status.HTTP_201_CREATED)
def create_athlete(payload: AthleteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    athlete = Athlete(
        name=payload.name,
        date_of_birth=payload.date_of_birth,
        sex=payload.sex,
        weight=payload.weight,
        height=payload.height,
        primary_discipline=payload.primary_discipline,
        goal_category=payload.goal_category,
        training_goal=payload.training_goal,
        notes=payload.notes,
        created_at=payload.created_at,
        coach_id=user.id if user.role == "coach" else None,
    )
    athlete.weights = [AthleteWeightHistory(**entry.model_dump()) for entry in payload.weights]
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


@router.get("/{athlete_id}", response_model=AthleteRead)
def get_athlete(athlete_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    athlete = db.scalar(select(Athlete).options(joinedload(Athlete.weights), joinedload(Athlete.focus_blocks), joinedload(Athlete.targets)).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    return athlete


@router.patch("/{athlete_id}", response_model=AthleteRead)
def update_athlete(athlete_id: int, payload: AthleteUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    athlete = db.scalar(select(Athlete).options(joinedload(Athlete.weights), joinedload(Athlete.focus_blocks), joinedload(Athlete.targets)).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    updated_fields = payload.model_dump(exclude_unset=True)
    for field, value in updated_fields.items():
        setattr(athlete, field, value)

    # Cascade threshold update if threshold-related fields changed
    THRESHOLD_FIELDS = {"ftp_cycling_watts", "ftpa_running_pace", "css_swimming_pace", "training_hr_max", "hr_rest"}
    changed_threshold_fields = THRESHOLD_FIELDS & set(updated_fields.keys())
    if changed_threshold_fields:
        from app.services.threshold_cascade import cascade_threshold_update
        FIELD_DISCIPLINE_MAP = {
            "ftp_cycling_watts": "ciclismo",
            "ftpa_running_pace": "running",
            "css_swimming_pace": "natación",
            "training_hr_max": None,  # affects all disciplines
            "hr_rest": None,
        }
        disciplines_to_cascade: set[str] = set()
        for field in changed_threshold_fields:
            disc = FIELD_DISCIPLINE_MAP.get(field)
            if disc is None:
                disciplines_to_cascade = {"running", "ciclismo", "natación"}
                break
            disciplines_to_cascade.add(disc)
        for disc in disciplines_to_cascade:
            try:
                cascade_threshold_update(db, athlete_id, disc)
            except Exception:
                pass  # Don't block athlete update if cascade fails

    db.commit()
    db.refresh(athlete)
    return athlete


@router.post("/{athlete_id}/weights", response_model=AthleteWeightHistoryRead, status_code=status.HTTP_201_CREATED)
def add_athlete_weight(
    athlete_id: int,
    payload: AthleteWeightHistoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    athlete = db.scalar(select(Athlete).options(joinedload(Athlete.weights), joinedload(Athlete.focus_blocks), joinedload(Athlete.targets)).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    same_day_entries = sorted(
        [entry for entry in athlete.weights if entry.recorded_at == payload.recorded_at],
        key=lambda item: item.id,
        reverse=True,
    )
    if same_day_entries:
        entry = same_day_entries[0]
        entry.weight = payload.weight
        entry.source = payload.source
        for duplicate in same_day_entries[1:]:
            db.delete(duplicate)
    else:
        entry = AthleteWeightHistory(athlete_id=athlete_id, **payload.model_dump())
        db.add(entry)
    athlete.weight = payload.weight
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/{athlete_id}/focus-blocks", response_model=AthleteFocusBlockRead, status_code=status.HTTP_201_CREATED)
def add_focus_block(
    athlete_id: int,
    payload: AthleteFocusBlockCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    athlete = db.scalar(
        select(Athlete)
        .options(joinedload(Athlete.focus_blocks), joinedload(Athlete.sessions), joinedload(Athlete.targets))
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    if payload.status == "active":
        target_discipline = payload.priority_discipline or athlete.primary_discipline
        for block in athlete.focus_blocks:
            if block.status == "active" and _effective_block_discipline(block, athlete) == target_discipline:
                block.status = "completed"
                if block.end_date is None or block.end_date >= payload.start_date:
                    block.end_date = payload.start_date

    block = AthleteFocusBlock(athlete_id=athlete_id, **payload.model_dump())
    db.add(block)
    db.flush()

    if block.status == "active":
        # Auto-generate zones if needed
        from app.services.zone_generator import ensure_zones_for_athlete
        try:
            _zone_set, _zone_warning = ensure_zones_for_athlete(db, athlete_id, target_discipline)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("ensure_zones_for_athlete failed for athlete %s: %s", athlete_id, exc)

        try:
            create_planned_sessions_for_block(
                db,
                athlete,
                block,
                target=_next_target_for_discipline(athlete, target_discipline),
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Failed to generate sessions for block %s: %s", block.id, exc, exc_info=True)

    db.commit()
    db.refresh(block)
    return block


@router.patch("/{athlete_id}/focus-blocks/{block_id}", response_model=AthleteFocusBlockRead)
def update_focus_block(
    athlete_id: int,
    block_id: int,
    payload: AthleteFocusBlockUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    athlete = db.scalar(
        select(Athlete)
        .options(joinedload(Athlete.focus_blocks), joinedload(Athlete.sessions), joinedload(Athlete.targets))
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    block = next((item for item in athlete.focus_blocks if item.id == block_id), None)
    if block is None:
        raise HTTPException(status_code=404, detail="Focus block not found")

    updates = payload.model_dump(exclude_unset=True)
    if updates.get("status") == "active":
        target_discipline = updates.get("priority_discipline") or block.priority_discipline or athlete.primary_discipline
        for active in athlete.focus_blocks:
            if active.id == block_id:
                continue
            if active.status == "active" and _effective_block_discipline(active, athlete) == target_discipline:
                active.status = "completed"
                if active.end_date is None:
                    active.end_date = updates.get("start_date") or block.start_date

    for field, value in updates.items():
        setattr(block, field, value)

    if block.status == "active":
        try:
            create_planned_sessions_for_block(
                db,
                athlete,
                block,
                target=_next_target_for_discipline(athlete, _effective_block_discipline(block, athlete)),
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Failed to generate sessions for block %s: %s", block.id, exc, exc_info=True)

    db.commit()
    db.refresh(block)
    return block


@router.post("/{athlete_id}/targets", response_model=AthleteTargetRead, status_code=status.HTTP_201_CREATED)
def add_athlete_target(
    athlete_id: int,
    payload: AthleteTargetCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    target = AthleteTarget(athlete_id=athlete_id, **_normalized_target_payload(payload))
    db.add(target)
    db.commit()
    db.refresh(target)
    return target


@router.patch("/{athlete_id}/targets/{target_id}", response_model=AthleteTargetRead)
def update_athlete_target(
    athlete_id: int,
    target_id: int,
    payload: AthleteTargetUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    target = db.scalar(select(AthleteTarget).where(AthleteTarget.id == target_id, AthleteTarget.athlete_id == athlete_id))
    if target is None:
        raise HTTPException(status_code=404, detail="Target not found")
    for field, value in _normalized_target_payload(payload).items():
        setattr(target, field, value)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{athlete_id}/targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_athlete_target(
    athlete_id: int,
    target_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    target = db.scalar(select(AthleteTarget).where(AthleteTarget.id == target_id, AthleteTarget.athlete_id == athlete_id))
    if target is None:
        raise HTTPException(status_code=404, detail="Target not found")
    db.delete(target)
    db.commit()


@router.delete("/targets/all", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_targets(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Bulk-delete every athlete target. One-time admin action."""
    db.execute(delete(AthleteTarget))
    db.commit()


@router.delete("/{athlete_id}/focus-blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_focus_block(
    athlete_id: int,
    block_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    block = db.scalar(select(AthleteFocusBlock).where(AthleteFocusBlock.id == block_id, AthleteFocusBlock.athlete_id == athlete_id))
    if block is None:
        raise HTTPException(status_code=404, detail="Focus block not found")
    db.delete(block)
    db.commit()


# ── Training Zones CRUD ─────────────────────────────────────────────────────


@router.get("/{athlete_id}/training-zones", response_model=list[TrainingZoneSetRead])
def list_training_zone_sets(
    athlete_id: int,
    discipline: str = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = (
        select(TrainingZoneSet)
        .options(joinedload(TrainingZoneSet.zones))
        .where(TrainingZoneSet.athlete_id == athlete_id)
    )
    if discipline:
        q = q.where(TrainingZoneSet.discipline == discipline)
    if active_only:
        q = q.where(TrainingZoneSet.is_active == True)  # noqa: E712
    q = q.order_by(TrainingZoneSet.created_at.desc())
    return db.scalars(q).unique().all()


@router.get("/{athlete_id}/training-zones/active", response_model=TrainingZoneSetRead)
def get_active_training_zone_set(
    athlete_id: int,
    discipline: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    zone_set = db.scalars(
        select(TrainingZoneSet)
        .options(joinedload(TrainingZoneSet.zones))
        .where(
            TrainingZoneSet.athlete_id == athlete_id,
            TrainingZoneSet.discipline == discipline,
            TrainingZoneSet.is_active == True,  # noqa: E712
        )
    ).first()
    if zone_set is None:
        raise HTTPException(status_code=404, detail="No hay zonas activas para esta disciplina.")
    return zone_set


@router.get("/{athlete_id}/training-zones/threshold-profile", response_model=ThresholdProfileForZones)
def threshold_profile_for_zones(
    athlete_id: int,
    discipline: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Devuelve el perfil de umbral del atleta para la disciplina indicada.

    El entrenador lo usa como referencia al crear zonas: ve si el ancla es
    individual (multi-sesión), fisiológico (2.0/4.0 mmol) o análisis (sesión única).
    """
    from app.models.metrics import PhysiologicalSnapshot
    from app.schemas.training_zone import ThresholdItemForZones

    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Buscar snapshot más reciente para la disciplina
    snapshot = db.scalars(
        select(PhysiologicalSnapshot)
        .where(PhysiologicalSnapshot.athlete_id == athlete_id, PhysiologicalSnapshot.discipline == discipline)
        .order_by(PhysiologicalSnapshot.snapshot_date.desc())
    ).first()

    # Fallback: if no exact discipline match, search any snapshot for this athlete.
    # Handles triathlon athletes (sessions stored as "running"/"ciclismo" but
    # primary_discipline is "triatlón") and discipline naming mismatches.
    if snapshot is None:
        snapshot = db.scalars(
            select(PhysiologicalSnapshot)
            .where(PhysiologicalSnapshot.athlete_id == athlete_id)
            .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        ).first()

    if snapshot is None:
        return ThresholdProfileForZones(
            source="none",
            source_label="Sin datos de umbral",
        )

    payload = snapshot.payload or {}

    def _pace_label(seconds: float | None) -> str | None:
        if seconds is None or seconds <= 0:
            return None
        mins = int(seconds) // 60
        secs = int(seconds) % 60
        return f"{mins}:{secs:02d}/km"

    def _item_from_ref(ref: dict) -> ThresholdItemForZones:
        pace = ref.get("estimated_pace_seconds_per_km")
        return ThresholdItemForZones(
            lactate=ref.get("target_lactate", 0),
            pace_seconds_per_km=pace,
            heart_rate=ref.get("estimated_hr_at_target"),
            power_watts=ref.get("estimated_power_watts"),
            pace_label=_pace_label(pace),
        )

    # Extract practical thresholds from dynamic engine (available in all sources)
    practical_lt1_item: ThresholdItemForZones | None = None
    practical_lt2_item: ThresholdItemForZones | None = None
    dynamic = payload.get("dynamic_thresholds")
    if dynamic:
        chronic = dynamic.get("chronic", {})
        prac_lt1 = chronic.get("practical_lt1")
        prac_lt2 = chronic.get("practical_lt2")
        if prac_lt1:
            practical_lt1_item = _item_from_ref(prac_lt1)
        if prac_lt2:
            practical_lt2_item = _item_from_ref(prac_lt2)

    # Priority: individual > dynamic/physiological > analysis thresholds
    individual = payload.get("individual_thresholds")
    if individual and individual.get("data_quality", {}).get("sufficient") is not False:
        lt1_ind = individual.get("lt1_individual")
        lt2_ind = individual.get("lt2_individual")
        return ThresholdProfileForZones(
            lt1=ThresholdItemForZones(
                lactate=lt1_ind.get("lactate", 2.0),
                pace_seconds_per_km=lt1_ind.get("pace_seconds_per_km"),
                heart_rate=lt1_ind.get("heart_rate"),
                power_watts=lt1_ind.get("power_watts"),
                pace_label=_pace_label(lt1_ind.get("pace_seconds_per_km")),
            ) if lt1_ind else None,
            lt2=ThresholdItemForZones(
                lactate=lt2_ind.get("lactate", 4.0),
                pace_seconds_per_km=lt2_ind.get("pace_seconds_per_km"),
                heart_rate=lt2_ind.get("heart_rate"),
                power_watts=lt2_ind.get("power_watts"),
                pace_label=_pace_label(lt2_ind.get("pace_seconds_per_km")),
            ) if lt2_ind else None,
            practical_lt1=practical_lt1_item,
            practical_lt2=practical_lt2_item,
            source="individual",
            source_label="Individual (multi-sesión)",
            confidence=lt2_ind.get("confidence") if lt2_ind else None,
            snapshot_date=str(snapshot.snapshot_date),
        )

    if dynamic:
        chronic = dynamic.get("chronic", {})
        ref_2 = chronic.get("reference_2mmol")
        ref_4 = chronic.get("reference_4mmol")
        if ref_2 or ref_4:
            return ThresholdProfileForZones(
                lt1=_item_from_ref(ref_2) if ref_2 else None,
                lt2=_item_from_ref(ref_4) if ref_4 else None,
                practical_lt1=practical_lt1_item,
                practical_lt2=practical_lt2_item,
                source="physiological",
                source_label="Fisiológico (2.0 / 4.0 mmol)",
                confidence=ref_4.get("confidence_score") if ref_4 else None,
                snapshot_date=str(snapshot.snapshot_date),
            )

    # Real thresholds (detected from curve shape)
    real = payload.get("real_thresholds")
    if real:
        lt1_real = real.get("lt1_real") or real.get("lt1_practical_real")
        lt2_real = real.get("lt2_real") or real.get("lt2_practical_real")
        if lt1_real or lt2_real:
            def _item_from_real(r: dict) -> ThresholdItemForZones:
                pace = r.get("pace_seconds_per_km")
                return ThresholdItemForZones(
                    lactate=r.get("lactate", 0),
                    pace_seconds_per_km=pace,
                    heart_rate=r.get("heart_rate"),
                    power_watts=r.get("power_watts"),
                    pace_label=_pace_label(pace),
                )
            return ThresholdProfileForZones(
                lt1=_item_from_real(lt1_real) if lt1_real else None,
                lt2=_item_from_real(lt2_real) if lt2_real else None,
                practical_lt1=practical_lt1_item,
                practical_lt2=practical_lt2_item,
                source="real",
                source_label="Umbral real (forma de curva)",
                confidence=real.get("data_quality", {}).get("signal_score"),
                snapshot_date=str(snapshot.snapshot_date),
            )

    # Fallback: session analysis thresholds
    thresholds = payload.get("thresholds", [])
    lt1_th = next((t for t in thresholds if t.get("name", "").lower().startswith("lt1")), None)
    lt2_th = next((t for t in thresholds if t.get("name", "").lower().startswith("lt2")), None)
    return ThresholdProfileForZones(
        lt1=ThresholdItemForZones(
            lactate=lt1_th.get("lactate", 2.0),
            pace_seconds_per_km=lt1_th.get("pace_seconds_per_km"),
            heart_rate=lt1_th.get("heart_rate"),
            power_watts=lt1_th.get("power_watts"),
            pace_label=_pace_label(lt1_th.get("pace_seconds_per_km")),
        ) if lt1_th else None,
        lt2=ThresholdItemForZones(
            lactate=lt2_th.get("lactate", 4.0),
            pace_seconds_per_km=lt2_th.get("pace_seconds_per_km"),
            heart_rate=lt2_th.get("heart_rate"),
            power_watts=lt2_th.get("power_watts"),
            pace_label=_pace_label(lt2_th.get("pace_seconds_per_km")),
        ) if lt2_th else None,
        practical_lt1=practical_lt1_item,
        practical_lt2=practical_lt2_item,
        source="analysis",
        source_label="Análisis de sesión",
        confidence=lt2_th.get("confidence") if lt2_th else None,
        snapshot_date=str(snapshot.snapshot_date),
    )


@router.get("/{athlete_id}/training-zones/staleness-check", response_model=ZoneStalenessCheck)
def check_zone_staleness(
    athlete_id: int,
    discipline: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Compare active zones' threshold_context vs current thresholds.

    Returns is_stale=True when the practical LT2 pace/power has shifted
    by ≥3% or HR by ≥5 bpm since zones were created (Seiler 2006).
    """
    from app.models.metrics import PhysiologicalSnapshot

    # 1. Get active zone set
    active = db.scalars(
        select(TrainingZoneSet)
        .where(
            TrainingZoneSet.athlete_id == athlete_id,
            TrainingZoneSet.discipline == discipline,
            TrainingZoneSet.is_active == True,  # noqa: E712
        )
    ).first()
    if active is None:
        return ZoneStalenessCheck(is_stale=False, reason="No hay zonas activas")

    # 2. Get current snapshot (with fallback to any discipline for triathlon athletes)
    snapshot = db.scalars(
        select(PhysiologicalSnapshot)
        .where(PhysiologicalSnapshot.athlete_id == athlete_id, PhysiologicalSnapshot.discipline == discipline)
        .order_by(PhysiologicalSnapshot.snapshot_date.desc())
    ).first()
    if snapshot is None:
        snapshot = db.scalars(
            select(PhysiologicalSnapshot)
            .where(PhysiologicalSnapshot.athlete_id == athlete_id)
            .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        ).first()
    if snapshot is None:
        return ZoneStalenessCheck(is_stale=False, reason="Sin datos de umbral")

    # 3. Extract current practical thresholds
    payload = snapshot.payload or {}
    dynamic = payload.get("dynamic_thresholds", {})
    chronic = dynamic.get("chronic", {})
    current_prac_lt2 = chronic.get("practical_lt2", {})
    current_prac_lt1 = chronic.get("practical_lt1", {})

    # Fallback to real thresholds if no dynamic practical thresholds
    if not current_prac_lt2 and not current_prac_lt1:
        real = payload.get("real_thresholds", {})
        current_prac_lt2 = real.get("lt2_practical_real") or real.get("lt2_real") or {}
        current_prac_lt1 = real.get("lt1_practical_real") or real.get("lt1_real") or {}

    if not current_prac_lt2 and not current_prac_lt1:
        return ZoneStalenessCheck(is_stale=False, reason="Sin umbrales prácticos actuales")

    # 4. Extract zone-creation thresholds from threshold_context
    ctx = active.threshold_context or {}
    old_prac_lt2 = ctx.get("practical_lt2", {})
    old_prac_lt1 = ctx.get("practical_lt1", {})

    result = ZoneStalenessCheck(
        zones_created_at=str(active.created_at.date()) if active.created_at else None,
        zones_threshold_source=active.threshold_source,
        current_snapshot_date=str(snapshot.snapshot_date),
    )

    # 5. Compute deltas
    reasons = []

    # LT2 pace
    old_pace = old_prac_lt2.get("estimated_pace_seconds_per_km") or old_prac_lt2.get("pace_seconds_per_km")
    new_pace = current_prac_lt2.get("estimated_pace_seconds_per_km")
    if old_pace and new_pace:
        delta = new_pace - old_pace
        result.lt2_pace_delta_seconds = round(delta, 1)
        if abs(delta / old_pace) >= 0.03:
            reasons.append(f"LT2 pace cambió {abs(delta):.0f}s/km ({abs(delta/old_pace)*100:.0f}%)")

    # LT2 HR
    old_hr = old_prac_lt2.get("estimated_hr_at_target") or old_prac_lt2.get("heart_rate")
    new_hr = current_prac_lt2.get("estimated_hr_at_target")
    if old_hr and new_hr:
        delta = int(new_hr - old_hr)
        result.lt2_hr_delta = delta
        if abs(delta) >= 5:
            reasons.append(f"LT2 FC cambió {abs(delta)} bpm")

    # LT2 power
    old_pow = old_prac_lt2.get("estimated_power_watts") or old_prac_lt2.get("power_watts")
    new_pow = current_prac_lt2.get("estimated_power_watts")
    if old_pow and new_pow:
        delta = round(new_pow - old_pow, 1)
        result.lt2_power_delta = delta
        if abs(delta / old_pow) >= 0.03:
            reasons.append(f"LT2 potencia cambió {abs(delta):.0f}W ({abs(delta/old_pow)*100:.0f}%)")

    # LT1 pace
    old_p1 = old_prac_lt1.get("estimated_pace_seconds_per_km") or old_prac_lt1.get("pace_seconds_per_km")
    new_p1 = current_prac_lt1.get("estimated_pace_seconds_per_km")
    if old_p1 and new_p1:
        delta = new_p1 - old_p1
        result.lt1_pace_delta_seconds = round(delta, 1)
        if abs(delta / old_p1) >= 0.03:
            reasons.append(f"LT1 pace cambió {abs(delta):.0f}s/km ({abs(delta/old_p1)*100:.0f}%)")

    # LT1 HR
    old_h1 = old_prac_lt1.get("estimated_hr_at_target") or old_prac_lt1.get("heart_rate")
    new_h1 = current_prac_lt1.get("estimated_hr_at_target")
    if old_h1 and new_h1:
        delta = int(new_h1 - old_h1)
        result.lt1_hr_delta = delta
        if abs(delta) >= 5:
            reasons.append(f"LT1 FC cambió {abs(delta)} bpm")

    # LT1 power
    old_pw1 = old_prac_lt1.get("estimated_power_watts") or old_prac_lt1.get("power_watts")
    new_pw1 = current_prac_lt1.get("estimated_power_watts")
    if old_pw1 and new_pw1:
        delta = round(new_pw1 - old_pw1, 1)
        result.lt1_power_delta = delta
        if abs(delta / old_pw1) >= 0.03:
            reasons.append(f"LT1 potencia cambió {abs(delta):.0f}W")

    if not reasons and not old_prac_lt2 and current_prac_lt2:
        reasons.append("Zonas creadas sin contexto de umbral — imposible verificar")
        result.is_stale = True
    elif reasons:
        result.is_stale = True

    result.reason = "; ".join(reasons) if reasons else "Zonas actualizadas"
    return result


@router.post("/{athlete_id}/training-zones", response_model=TrainingZoneSetRead, status_code=status.HTTP_201_CREATED)
def create_training_zone_set(
    athlete_id: int,
    payload: TrainingZoneSetCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Desactivar sets existentes de la misma disciplina
    existing = db.scalars(
        select(TrainingZoneSet).where(
            TrainingZoneSet.athlete_id == athlete_id,
            TrainingZoneSet.discipline == payload.discipline,
            TrainingZoneSet.is_active == True,  # noqa: E712
        )
    ).all()
    for zone_set in existing:
        zone_set.is_active = False

    from datetime import datetime, timezone

    zone_set = TrainingZoneSet(
        athlete_id=athlete_id,
        discipline=payload.discipline,
        name=payload.name,
        threshold_source=payload.threshold_source,
        threshold_context=payload.threshold_context,
        notes=payload.notes,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    for z in payload.zones:
        zone_set.zones.append(TrainingZone(**z.model_dump()))
    db.add(zone_set)
    db.commit()
    db.refresh(zone_set)

    # Regenerate structured workouts for future planned sessions of this discipline
    updated_count = _regenerate_future_workouts(db, athlete_id, payload.discipline)

    # Attach session count to response (not a DB column, just response-level info)
    result = TrainingZoneSetRead.model_validate(zone_set)
    result.sessions_updated = updated_count
    return result


def _regenerate_future_workouts(db: Session, athlete_id: int, discipline: str) -> int:
    """Regenerate structured_workout_payload for future planned sessions.

    Called when training zones are updated so Garmin pushes reflect new targets.
    Only touches sessions that haven't been coach-edited.
    Returns number of sessions updated.
    """
    from datetime import date as date_type
    from app.services.planned_session_publication import prepare_planned_session_for_publish

    future_sessions = db.scalars(
        select(PlannedSession).where(
            PlannedSession.athlete_id == athlete_id,
            PlannedSession.discipline == discipline,
            PlannedSession.scheduled_date >= date_type.today(),
            PlannedSession.status == "planned",
        )
    ).all()

    count = 0
    for session in future_sessions:
        # Skip coach-edited workouts
        existing = session.structured_workout_payload
        if isinstance(existing, dict):
            sp = existing.get("source_payload") or {}
            if sp.get("coach_edited"):
                continue
        try:
            prepare_planned_session_for_publish(session, db=db)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("prepare_planned_session_for_publish failed for session %s: %s", session.id, exc)
            continue
        count += 1

    if count > 0:
        db.commit()
    return count


@router.patch("/{athlete_id}/training-zones/{zone_set_id}", response_model=TrainingZoneSetRead)
def update_training_zone_set(
    athlete_id: int,
    zone_set_id: int,
    payload: TrainingZoneSetUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    zone_set = db.scalars(
        select(TrainingZoneSet)
        .options(joinedload(TrainingZoneSet.zones))
        .where(TrainingZoneSet.id == zone_set_id, TrainingZoneSet.athlete_id == athlete_id)
    ).first()
    if zone_set is None:
        raise HTTPException(status_code=404, detail="Zone set not found")

    if payload.name is not None:
        zone_set.name = payload.name
    if payload.notes is not None:
        zone_set.notes = payload.notes
    if payload.zones is not None:
        # Full replace: delete old zones, add new
        for old_zone in list(zone_set.zones):
            db.delete(old_zone)
        for z in payload.zones:
            zone_set.zones.append(TrainingZone(**z.model_dump()))
    db.commit()
    db.refresh(zone_set)
    return zone_set


@router.patch("/{athlete_id}/training-zones/{zone_set_id}/activate", response_model=TrainingZoneSetRead)
def activate_training_zone_set(
    athlete_id: int,
    zone_set_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    zone_set = db.scalars(
        select(TrainingZoneSet)
        .options(joinedload(TrainingZoneSet.zones))
        .where(TrainingZoneSet.id == zone_set_id, TrainingZoneSet.athlete_id == athlete_id)
    ).first()
    if zone_set is None:
        raise HTTPException(status_code=404, detail="Zone set not found")

    # Desactivar otros sets de la misma disciplina
    others = db.scalars(
        select(TrainingZoneSet).where(
            TrainingZoneSet.athlete_id == athlete_id,
            TrainingZoneSet.discipline == zone_set.discipline,
            TrainingZoneSet.id != zone_set_id,
            TrainingZoneSet.is_active == True,  # noqa: E712
        )
    ).all()
    for other in others:
        other.is_active = False

    zone_set.is_active = True
    db.commit()
    db.refresh(zone_set)
    return zone_set


@router.delete("/{athlete_id}/training-zones/{zone_set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_training_zone_set(
    athlete_id: int,
    zone_set_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    zone_set = db.scalar(
        select(TrainingZoneSet).where(TrainingZoneSet.id == zone_set_id, TrainingZoneSet.athlete_id == athlete_id)
    )
    if zone_set is None:
        raise HTTPException(status_code=404, detail="Zone set not found")
    db.delete(zone_set)
    db.commit()


@router.delete("/{athlete_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_athlete(athlete_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    db.delete(athlete)
    db.commit()


@router.post("/{athlete_id}/recalculate")
def recalculate(athlete_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        return recalculate_athlete(db, athlete_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{athlete_id}/interpolate-cycling-from-running")
def interpolate_cycling(athlete_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Interpola umbrales de ciclismo (FC) a partir de la FC de running.

    HR bridge (Millet 2009, Hue 1998): la FC en ciclismo es ~5-10 bpm
    menor que en running a la misma intensidad metabólica.
    Guarda un snapshot de ciclismo con umbrales en HR (sin watts).
    """
    from datetime import date as date_cls
    from app.models.metrics import PhysiologicalSnapshot
    from app.services.threshold_interpolation import interpolate_running_to_cycling

    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Buscar el snapshot running más reciente
    running_snapshot = db.scalars(
        select(PhysiologicalSnapshot)
        .where(PhysiologicalSnapshot.athlete_id == athlete_id)
        .where(PhysiologicalSnapshot.discipline == "running")
        .order_by(PhysiologicalSnapshot.snapshot_date.desc())
    ).first()

    if running_snapshot is None:
        raise HTTPException(
            status_code=400,
            detail="No hay datos de running para interpolar. Realiza primero un test de lactato en carrera a pie."
        )

    if not running_snapshot.lt2_heart_rate:
        raise HTTPException(
            status_code=400,
            detail="El test de running no tiene frecuencia cardíaca en LT2. Necesaria para interpolar."
        )

    # Interpolar
    result = interpolate_running_to_cycling(
        lt1_heart_rate=running_snapshot.lt1_heart_rate,
        lt2_heart_rate=running_snapshot.lt2_heart_rate,
        athlete_level=athlete.athlete_level or "trained",
    )

    if result.lt2_hr_cycling is None:
        raise HTTPException(
            status_code=400,
            detail="No se pudo interpolar. " + "; ".join(result.warnings)
        )

    # Construir curva interpolada: tomar puntos de running con lactato y degradar HR
    from app.models.session import Session as AthleteSession, SessionInterval, LactateSample
    hr_offset = result.hr_offset_applied
    running_sessions = db.scalars(
        select(AthleteSession)
        .options(joinedload(AthleteSession.intervals).joinedload(SessionInterval.lactate_sample))
        .where(AthleteSession.athlete_id == athlete_id, AthleteSession.discipline == "running")
        .order_by(AthleteSession.performed_at.desc())
    ).unique().all()

    interpolated_curve: list[dict] = []
    for session in running_sessions:
        for interval in session.intervals:
            sample = interval.lactate_sample
            if sample is None or interval.heart_rate_avg is None:
                continue
            interpolated_curve.append({
                "session_date": session.performed_at.date().isoformat(),
                "interval_label": f"Bloque {interval.order_index}",
                "lactate_mmol": sample.lactate_mmol,
                "heart_rate_cycling": interval.heart_rate_avg - hr_offset,
                "heart_rate_running": interval.heart_rate_avg,
                "power_watts": None,
                "pace_running": interval.pace_seconds_per_km,
            })

    # Crear snapshot de ciclismo interpolado (solo HR, sin watts)
    today = date_cls.today()
    snapshot = PhysiologicalSnapshot(
        athlete_id=athlete_id,
        session_id=running_snapshot.session_id,
        snapshot_date=today,
        discipline="ciclismo",
        power_source="interpolated_from_running",
        lt1_heart_rate=result.lt1_hr_cycling,
        lt2_heart_rate=result.lt2_hr_cycling,
        method="hr_bridge_millet2009_hue1998",
        confidence=result.confidence,
        summary=(
            f"HR interpolada desde running (−{result.hr_offset_applied} bpm). "
            f"{result.method_detail}"
        ),
        payload={
            "source": "interpolated_from_running",
            "running_snapshot_id": running_snapshot.id,
            "running_snapshot_date": str(running_snapshot.snapshot_date),
            "hr_offset_applied": result.hr_offset_applied,
            "method_detail": result.method_detail,
            "warnings": result.warnings,
            "thresholds": [
                {
                    "name": "LT1",
                    "lactate": None,
                    "pace_seconds_per_km": None,
                    "power_watts": None,
                    "heart_rate": result.lt1_hr_cycling,
                    "heart_rate_running": result.lt1_hr_running,
                    "power_source": "interpolated_from_running",
                    "confidence": result.confidence,
                    "method": "hr_bridge_millet2009_hue1998",
                    "rationale": f"HR LT1 running ({result.lt1_hr_running} bpm) − {result.hr_offset_applied} bpm = {result.lt1_hr_cycling} bpm",
                    "methods_compared": [],
                    "agreement_score": 0.0,
                    "evidence_level": "interpolated",
                },
                {
                    "name": "LT2",
                    "lactate": None,
                    "pace_seconds_per_km": None,
                    "power_watts": None,
                    "heart_rate": result.lt2_hr_cycling,
                    "heart_rate_running": result.lt2_hr_running,
                    "power_source": "interpolated_from_running",
                    "confidence": result.confidence,
                    "method": "hr_bridge_millet2009_hue1998",
                    "rationale": f"HR LT2 running ({result.lt2_hr_running} bpm) − {result.hr_offset_applied} bpm = {result.lt2_hr_cycling} bpm",
                    "methods_compared": [],
                    "agreement_score": 0.0,
                    "evidence_level": "interpolated",
                },
            ],
            "power_pending": True,
            "power_note": "Para estimar watts, se necesitan entrenamientos en bici con potenciómetro.",
            "interpolated_curve": interpolated_curve,
        },
    )
    db.add(snapshot)

    # Activar preferencia
    athlete.cycling_interpolated_from_running = True

    # Cascade threshold update for cycling
    try:
        from app.services.threshold_cascade import cascade_threshold_update
        cascade_threshold_update(db, athlete_id, "ciclismo")
    except Exception:
        pass

    db.commit()

    return {
        "status": "ok",
        "lt1_hr_cycling": result.lt1_hr_cycling,
        "lt2_hr_cycling": result.lt2_hr_cycling,
        "lt1_hr_running": result.lt1_hr_running,
        "lt2_hr_running": result.lt2_hr_running,
        "hr_offset_applied": result.hr_offset_applied,
        "confidence": result.confidence,
        "warnings": result.warnings,
        "snapshot_id": snapshot.id,
    }


@router.get("/{athlete_id}/analysis", response_model=AthleteAnalysisRead)
def athlete_analysis(athlete_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
        if athlete is None:
            raise HTTPException(status_code=404, detail="Athlete not found")
        return athlete_analysis_payload(db, athlete_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{athlete_id}/physiology-report", response_model=PhysiologyReportRead)
def athlete_physiology_report(
    athlete_id: int,
    discipline: str = None,
    power_source: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        return build_physiology_report_payload(db, athlete_id, discipline=discipline, power_source=power_source)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Athlete not found":
            raise HTTPException(status_code=404, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc


@router.get("/{athlete_id}/physiology-report/pdf")
def athlete_physiology_report_pdf(
    athlete_id: int,
    discipline: str = None,
    power_source: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        pdf_bytes, filename = build_physiology_report_pdf(db, athlete_id, discipline=discipline, power_source=power_source)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Athlete not found":
            raise HTTPException(status_code=404, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{athlete_id}/ai-interpretation", response_model=AthleteAIInterpretationResponse)
def athlete_ai_interpretation(
    athlete_id: int,
    payload: AthleteAIInterpretationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if athlete.sessions:
        recalculate_athlete(db, athlete_id)
    try:
        analysis = athlete_analysis_payload(db, athlete_id)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("athlete_analysis_payload crashed for athlete %s: %s", athlete_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno en análisis del atleta: {exc}") from exc
    goal_used = payload.custom_goal or athlete.training_goal or "Sin objetivo definido"
    question_used = payload.question or ""
    model, interpretation = build_book_advisor_response(
        analysis,
        question=question_used,
        focus=payload.focus,
        goal=goal_used,
    )
    return AthleteAIInterpretationResponse(
        athlete_id=athlete_id,
        model=model,
        goal_used=goal_used,
        interpretation=interpretation,
    )


@router.post("/{athlete_id}/reasoning-interpretation", response_model=AthleteReasoningInterpretationResponse)
def athlete_reasoning_interpretation(
    athlete_id: int,
    payload: AthleteReasoningInterpretationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    if athlete is None:
        raise HTTPException(status_code=404, detail="Athlete not found")

    try:
        analysis = athlete_analysis_payload(db, athlete_id)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("athlete_analysis_payload crashed for athlete %s: %s", athlete_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno en análisis del atleta: {exc}") from exc
    goal_used = payload.custom_goal or athlete.training_goal or "Sin objetivo definido"
    prompt = build_athlete_prompt(
        analysis,
        goal=goal_used,
        focus=payload.focus,
        question=payload.question,
    )

    try:
        provider, model, interpretation = generate_reasoning_interpretation(
            analysis,
            goal=goal_used,
            provider=payload.provider,
            focus=payload.focus,
            question=payload.question,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Reasoning provider failed: {exc}") from exc

    return AthleteReasoningInterpretationResponse(
        athlete_id=athlete_id,
        provider=provider,
        model=model,
        goal_used=goal_used,
        interpretation=interpretation,
        prompt=prompt if payload.include_prompt else None,
    )


@router.post("/generate-demo", response_model=AthleteRead, status_code=status.HTTP_201_CREATED)
def generate_demo_athlete(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    athlete = create_demo_athlete(db, coach=user if user.role == "coach" else None)
    return athlete


@router.post("/generate-demo-chim", response_model=AthleteRead, status_code=status.HTTP_201_CREATED)
def generate_demo_chim(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    athlete = create_chim_demo_athlete(db, coach=user if user.role == "coach" else None)
    return athlete

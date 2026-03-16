"""Auto-generate training zones from athlete thresholds.

Called when an athlete has no active zones for a discipline and the coach
creates a mesocycle or publishes sessions. The 7-zone model matches the
frontend TrainingZonesEditor suggestZonesFromProfile() logic exactly.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.athlete import Athlete
from app.models.training_zone import TrainingZone, TrainingZoneSet


# ── Zone colours ────────────────────────────────────────────────────────────

_ZONE_COLORS = [
    "#3a9a5b", "#2e8b57", "#b58a2e", "#d4a017",
    "#c27a2e", "#c44040", "#7c3aed",
]

# ── Running presets ─────────────────────────────────────────────────────────

_RUNNING_ZONES = [
    ("E1 - Recuperación", "Trote suave, recuperación activa."),
    ("E2 - Fondo aeróbico", "Base aeróbica, conversación cómoda. Incluye sub-LT1."),
    ("LT1 - Umbral aeróbico", "Zona de LT1 práctico."),
    ("Tempo", "Entre LT1 y LT2 prácticos. Maratón pace, medio fondo."),
    ("LT2 - Umbral anaeróbico", "Zona de LT2 práctico. Referencia para intervalos de umbral."),
    ("VO2max", "Potencia aeróbica máxima, intervalos 2-6 min."),
    ("ANC - Anaeróbico", "Capacidad anaeróbica, esfuerzos <2 min."),
]

_CYCLING_ZONES = [
    ("Z1 - Recuperación", "Pedaleo suave, recuperación activa."),
    ("Z2 - Resistencia", "Base aeróbica, larga duración."),
    ("Z3 - Tempo", "Esfuerzo sostenido, entre LT1 y LT2."),
    ("Z4 - Umbral (FTP)", "Potencia de umbral funcional, ~40-60 min."),
    ("Z5 - VO2max", "Potencia aeróbica máxima, intervalos 3-8 min."),
    ("Z6 - Capacidad anaeróbica", "Esfuerzos 30s-2 min, alta potencia."),
    ("Z7 - Neuromuscular", "Sprints <30s, potencia máxima."),
]

_SWIMMING_ZONES = [
    ("Z1 - Recuperación", "Nado suave, técnica y recuperación."),
    ("Z2 - Aeróbico base", "Resistencia aeróbica, larga distancia."),
    ("Z3 - Aeróbico medio", "Nado constante sub-CSS."),
    ("Z4 - Sub-umbral", "Justo debajo de CSS, series 400-1000m."),
    ("Z5 - CSS/Umbral", "Critical Swim Speed, series 100-400m."),
    ("Z6 - VO2max", "Intervalos 50-200m a máxima intensidad aeróbica."),
    ("Z7 - Anaeróbico", "Sprints 25-100m, velocidad máxima."),
]


def _r(val: float | None) -> int | None:
    return round(val) if val is not None else None


def _rf(val: float | None) -> float | None:
    return round(val, 1) if val is not None else None


class _ThresholdProfile:
    """Minimal threshold profile extracted from snapshot payload."""

    def __init__(self, payload: dict):
        self.lt1_pace: float | None = None
        self.lt2_pace: float | None = None
        self.lt1_hr: int | None = None
        self.lt2_hr: int | None = None
        self.lt1_power: float | None = None
        self.lt2_power: float | None = None
        self.prac_lt1_pace: float | None = None
        self.prac_lt2_pace: float | None = None
        self.prac_lt1_hr: int | None = None
        self.prac_lt2_hr: int | None = None
        self.prac_lt1_power: float | None = None
        self.prac_lt2_power: float | None = None
        self.source: str = "none"
        self.confidence: float | None = None

        dynamic = payload.get("dynamic_thresholds")
        if dynamic:
            chronic = dynamic.get("chronic", {})
            self._extract_practical(chronic)

        individual = payload.get("individual_thresholds")
        if individual and individual.get("data_quality", {}).get("sufficient") is not False:
            lt1 = individual.get("lt1_individual") or {}
            lt2 = individual.get("lt2_individual") or {}
            self.lt1_pace = lt1.get("pace_seconds_per_km")
            self.lt2_pace = lt2.get("pace_seconds_per_km")
            self.lt1_hr = lt1.get("heart_rate")
            self.lt2_hr = lt2.get("heart_rate")
            self.lt1_power = lt1.get("power_watts")
            self.lt2_power = lt2.get("power_watts")
            self.source = "individual"
            self.confidence = lt2.get("confidence")
        elif dynamic:
            chronic = dynamic.get("chronic", {})
            ref2 = chronic.get("reference_2mmol") or {}
            ref4 = chronic.get("reference_4mmol") or {}
            self.lt1_pace = ref2.get("estimated_pace_seconds_per_km")
            self.lt2_pace = ref4.get("estimated_pace_seconds_per_km")
            self.lt1_hr = ref2.get("estimated_hr_at_target")
            self.lt2_hr = ref4.get("estimated_hr_at_target")
            self.lt1_power = ref2.get("estimated_power_watts")
            self.lt2_power = ref4.get("estimated_power_watts")
            self.source = "physiological"
            self.confidence = ref4.get("confidence_score")
        else:
            thresholds = payload.get("thresholds", [])
            lt1_th = next((t for t in thresholds if t.get("name", "").lower().startswith("lt1")), {})
            lt2_th = next((t for t in thresholds if t.get("name", "").lower().startswith("lt2")), {})
            if lt1_th or lt2_th:
                self.lt1_pace = lt1_th.get("pace_seconds_per_km")
                self.lt2_pace = lt2_th.get("pace_seconds_per_km")
                self.lt1_hr = lt1_th.get("heart_rate")
                self.lt2_hr = lt2_th.get("heart_rate")
                self.lt1_power = lt1_th.get("power_watts")
                self.lt2_power = lt2_th.get("power_watts")
                self.source = "analysis"
                self.confidence = lt2_th.get("confidence")

        # Use practical thresholds where available, falling back to physiological
        if self.prac_lt1_pace is None:
            self.prac_lt1_pace = self.lt1_pace
        if self.prac_lt2_pace is None:
            self.prac_lt2_pace = self.lt2_pace
        if self.prac_lt1_hr is None:
            self.prac_lt1_hr = self.lt1_hr
        if self.prac_lt2_hr is None:
            self.prac_lt2_hr = self.lt2_hr
        if self.prac_lt1_power is None:
            self.prac_lt1_power = self.lt1_power
        if self.prac_lt2_power is None:
            self.prac_lt2_power = self.lt2_power

    def _extract_practical(self, chronic: dict):
        prac_lt1 = chronic.get("practical_lt1") or {}
        prac_lt2 = chronic.get("practical_lt2") or {}
        if prac_lt1:
            self.prac_lt1_pace = prac_lt1.get("estimated_pace_seconds_per_km")
            self.prac_lt1_hr = prac_lt1.get("estimated_hr_at_target")
            self.prac_lt1_power = prac_lt1.get("estimated_power_watts")
        if prac_lt2:
            self.prac_lt2_pace = prac_lt2.get("estimated_pace_seconds_per_km")
            self.prac_lt2_hr = prac_lt2.get("estimated_hr_at_target")
            self.prac_lt2_power = prac_lt2.get("estimated_power_watts")

    @property
    def has_data(self) -> bool:
        return self.source != "none"


def _build_running_zones(p: _ThresholdProfile) -> list[dict]:
    """Build 7 running zones from thresholds (Seiler 2010, Faude 2009)."""
    pLt1Pace = p.prac_lt1_pace
    pLt2Pace = p.prac_lt2_pace
    pLt1Hr = p.prac_lt1_hr
    pLt2Hr = p.prac_lt2_hr
    lt2Pace = p.lt2_pace
    lt2Hr = p.lt2_hr

    def pace_at(frac):
        if pLt1Pace and pLt2Pace:
            return round(pLt1Pace + (pLt2Pace - pLt1Pace) * frac)
        return None

    def hr_at(frac):
        if pLt1Hr and pLt2Hr:
            return round(pLt1Hr + (pLt2Hr - pLt1Hr) * frac)
        return None

    return [
        {  # E1
            "pace_upper_seconds": _rf(pLt1Pace * 1.15) if pLt1Pace else None,
            "hr_upper": _r(pLt1Hr * 0.85) if pLt1Hr else None,
        },
        {  # E2
            "pace_lower_seconds": _rf(pLt1Pace * 1.15) if pLt1Pace else None,
            "pace_upper_seconds": _rf(pLt1Pace),
            "hr_lower": _r(pLt1Hr * 0.85) if pLt1Hr else None,
            "hr_upper": _r(pLt1Hr) if pLt1Hr else None,
        },
        {  # LT1
            "pace_lower_seconds": _rf(pLt1Pace),
            "pace_upper_seconds": _rf(pace_at(0.35)),
            "hr_lower": _r(pLt1Hr) if pLt1Hr else None,
            "hr_upper": hr_at(0.35),
        },
        {  # Tempo
            "pace_lower_seconds": _rf(pace_at(0.35)),
            "pace_upper_seconds": _rf(pace_at(0.70)),
            "hr_lower": hr_at(0.35),
            "hr_upper": hr_at(0.70),
        },
        {  # LT2
            "pace_lower_seconds": _rf(pace_at(0.70)),
            "pace_upper_seconds": _rf(pLt2Pace * 0.97) if pLt2Pace else None,
            "hr_lower": hr_at(0.70),
            "hr_upper": _r(pLt2Hr * 1.02) if pLt2Hr else None,
        },
        {  # VO2max
            "pace_lower_seconds": _rf(lt2Pace * 0.97) if lt2Pace else (_rf(pLt2Pace * 0.94) if pLt2Pace else None),
            "pace_upper_seconds": _rf(lt2Pace * 0.88) if lt2Pace else (_rf(pLt2Pace * 0.85) if pLt2Pace else None),
            "hr_lower": _r(lt2Hr * 1.02) if lt2Hr else (_r(pLt2Hr * 1.05) if pLt2Hr else None),
        },
        {  # ANC
            "pace_lower_seconds": _rf(lt2Pace * 0.88) if lt2Pace else (_rf(pLt2Pace * 0.85) if pLt2Pace else None),
        },
    ]


def _build_cycling_zones(p: _ThresholdProfile) -> list[dict]:
    """Build 7 Coggan-style cycling zones from FTP = practical LT2 power."""
    ftp = p.prac_lt2_power
    lt1P = p.prac_lt1_power or (_r(ftp * 0.75) if ftp else None)
    pLt1Hr = p.prac_lt1_hr
    pLt2Hr = p.prac_lt2_hr

    return [
        {  # Z1
            "hr_upper": _r(pLt1Hr * 0.82) if pLt1Hr else None,
            "power_upper": _rf(ftp * 0.55) if ftp else None,
        },
        {  # Z2
            "hr_lower": _r(pLt1Hr * 0.82) if pLt1Hr else None,
            "hr_upper": _r(pLt1Hr) if pLt1Hr else None,
            "power_lower": _rf(ftp * 0.55) if ftp else None,
            "power_upper": _rf(lt1P) if lt1P else None,
        },
        {  # Z3
            "hr_lower": _r(pLt1Hr) if pLt1Hr else None,
            "hr_upper": _r(pLt2Hr * 0.92) if pLt2Hr else None,
            "power_lower": _rf(lt1P) if lt1P else None,
            "power_upper": _rf(ftp * 0.90) if ftp else None,
        },
        {  # Z4
            "hr_lower": _r(pLt2Hr * 0.92) if pLt2Hr else None,
            "hr_upper": _r(pLt2Hr * 1.02) if pLt2Hr else None,
            "power_lower": _rf(ftp * 0.90) if ftp else None,
            "power_upper": _rf(ftp * 1.05) if ftp else None,
        },
        {  # Z5
            "hr_lower": _r(pLt2Hr * 1.02) if pLt2Hr else None,
            "power_lower": _rf(ftp * 1.05) if ftp else None,
            "power_upper": _rf(ftp * 1.20) if ftp else None,
        },
        {  # Z6
            "power_lower": _rf(ftp * 1.20) if ftp else None,
            "power_upper": _rf(ftp * 1.50) if ftp else None,
        },
        {  # Z7
            "power_lower": _rf(ftp * 1.50) if ftp else None,
        },
    ]


def _build_swimming_zones(p: _ThresholdProfile) -> list[dict]:
    """Build 7 swimming zones from CSS = practical LT2 pace."""
    css = p.prac_lt2_pace
    pLt1Hr = p.prac_lt1_hr
    pLt2Hr = p.prac_lt2_hr

    def hr_at(frac):
        if pLt1Hr and pLt2Hr:
            return round(pLt1Hr + (pLt2Hr - pLt1Hr) * frac)
        return None

    return [
        {  # Z1
            "pace_upper_seconds": _rf(css * 1.25) if css else None,
            "hr_upper": _r(pLt1Hr * 0.82) if pLt1Hr else None,
        },
        {  # Z2
            "pace_lower_seconds": _rf(css * 1.25) if css else None,
            "pace_upper_seconds": _rf(css * 1.12) if css else None,
            "hr_lower": _r(pLt1Hr * 0.82) if pLt1Hr else None,
            "hr_upper": _r(pLt1Hr * 0.92) if pLt1Hr else None,
        },
        {  # Z3
            "pace_lower_seconds": _rf(css * 1.12) if css else None,
            "pace_upper_seconds": _rf(css * 1.05) if css else None,
            "hr_lower": _r(pLt1Hr * 0.92) if pLt1Hr else None,
            "hr_upper": _r(pLt1Hr) if pLt1Hr else None,
        },
        {  # Z4
            "pace_lower_seconds": _rf(css * 1.05) if css else None,
            "pace_upper_seconds": _rf(css * 1.01) if css else None,
            "hr_lower": _r(pLt1Hr) if pLt1Hr else None,
            "hr_upper": hr_at(0.85),
        },
        {  # Z5
            "pace_lower_seconds": _rf(css * 1.01) if css else None,
            "pace_upper_seconds": _rf(css * 0.97) if css else None,
            "hr_lower": hr_at(0.85),
            "hr_upper": _r(pLt2Hr) if pLt2Hr else None,
        },
        {  # Z6
            "pace_lower_seconds": _rf(css * 0.97) if css else None,
            "pace_upper_seconds": _rf(css * 0.90) if css else None,
            "hr_lower": _r(pLt2Hr) if pLt2Hr else None,
        },
        {  # Z7
            "pace_lower_seconds": _rf(css * 0.90) if css else None,
        },
    ]


def _zone_presets(discipline: str):
    if discipline == "ciclismo":
        return _CYCLING_ZONES
    if discipline in {"natación", "natacion"}:
        return _SWIMMING_ZONES
    return _RUNNING_ZONES


def _zone_builders(discipline: str):
    if discipline == "ciclismo":
        return _build_cycling_zones
    if discipline in {"natación", "natacion"}:
        return _build_swimming_zones
    return _build_running_zones


def get_active_zone_set(db: Session, athlete_id: int, discipline: str) -> TrainingZoneSet | None:
    """Get the active zone set for an athlete+discipline, or None."""
    return db.scalars(
        select(TrainingZoneSet)
        .options(joinedload(TrainingZoneSet.zones))
        .where(
            TrainingZoneSet.athlete_id == athlete_id,
            TrainingZoneSet.discipline == discipline,
            TrainingZoneSet.is_active == True,  # noqa: E712
        )
    ).first()


def auto_generate_zones(
    db: Session,
    athlete_id: int,
    discipline: str,
    *,
    snapshot_payload: dict | None = None,
) -> tuple[TrainingZoneSet | None, str | None]:
    """Auto-generate training zones from thresholds if none exist.

    Returns:
        (zone_set, warning_message) — zone_set is None if no threshold data available.
    """
    # Check if active zones already exist
    existing = get_active_zone_set(db, athlete_id, discipline)
    if existing is not None:
        return existing, None

    # Get threshold data from snapshot
    if snapshot_payload is None:
        from app.models.metrics import PhysiologicalSnapshot
        snapshot = db.scalars(
            select(PhysiologicalSnapshot)
            .where(
                PhysiologicalSnapshot.athlete_id == athlete_id,
                PhysiologicalSnapshot.discipline == discipline,
            )
            .order_by(PhysiologicalSnapshot.snapshot_date.desc())
        ).first()
        if snapshot is None:
            return None, None
        snapshot_payload = snapshot.payload or {}

    profile = _ThresholdProfile(snapshot_payload)
    if not profile.has_data:
        return None, None

    # Get athlete name for warning
    athlete = db.scalar(select(Athlete).where(Athlete.id == athlete_id))
    athlete_name = athlete.name if athlete else f"Atleta #{athlete_id}"

    # Build zones
    builder = _zone_builders(discipline)
    presets = _zone_presets(discipline)
    zone_values = builder(profile)

    # Deactivate any existing sets for this discipline
    existing_sets = db.scalars(
        select(TrainingZoneSet).where(
            TrainingZoneSet.athlete_id == athlete_id,
            TrainingZoneSet.discipline == discipline,
            TrainingZoneSet.is_active == True,  # noqa: E712
        )
    ).all()
    for zs in existing_sets:
        zs.is_active = False

    # Create the zone set
    zone_set = TrainingZoneSet(
        athlete_id=athlete_id,
        discipline=discipline,
        name=f"Zonas auto — {discipline} ({datetime.now(timezone.utc).strftime('%b %Y')})",
        threshold_source=profile.source,
        threshold_context={
            "auto_generated": True,
            "source": profile.source,
            "lt1_pace": profile.lt1_pace,
            "lt2_pace": profile.lt2_pace,
            "lt1_hr": profile.lt1_hr,
            "lt2_hr": profile.lt2_hr,
            "lt1_power": profile.lt1_power,
            "lt2_power": profile.lt2_power,
            "confidence": profile.confidence,
        },
        notes="Zonas auto-generadas desde umbrales. Verificar antes de usar.",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )

    for i, (label, desc) in enumerate(presets):
        vals = zone_values[i] if i < len(zone_values) else {}
        zone_set.zones.append(TrainingZone(
            zone_number=i + 1,
            zone_label=label,
            zone_color=_ZONE_COLORS[i] if i < len(_ZONE_COLORS) else "#6b7280",
            pace_lower_seconds=vals.get("pace_lower_seconds"),
            pace_upper_seconds=vals.get("pace_upper_seconds"),
            hr_lower=vals.get("hr_lower"),
            hr_upper=vals.get("hr_upper"),
            power_lower=vals.get("power_lower"),
            power_upper=vals.get("power_upper"),
            description=desc,
        ))

    db.add(zone_set)
    db.flush()

    warning = f"Zonas auto-generadas para {athlete_name} ({discipline}). Verifícalas."
    return zone_set, warning


def ensure_zones_for_athlete(
    db: Session,
    athlete_id: int,
    discipline: str,
) -> tuple[TrainingZoneSet | None, str | None]:
    """Ensure active zones exist for athlete+discipline.

    If no active zones, auto-generates them from thresholds.
    Returns (zone_set, warning) — warning is set if auto-generated.
    """
    existing = get_active_zone_set(db, athlete_id, discipline)
    if existing is not None:
        return existing, None
    return auto_generate_zones(db, athlete_id, discipline)

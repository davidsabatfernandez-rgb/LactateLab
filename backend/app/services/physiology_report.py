from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from math import floor
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.athlete import Athlete
from app.models.session import Session as AthleteSession, SessionInterval
from app.services.analytics import _build_individual_thresholds, _normalized_power_source


_REPORT_MIN_INDIVIDUAL_SAMPLES = 15


@dataclass
class ReportStage:
    stage_number: int
    duration_seconds: int
    load_value: float
    load_label: str
    heart_rate_bpm: Optional[int]
    lactate_mmol: float
    cadence: Optional[int]


def _format_seconds(total_seconds: int) -> str:
    minutes = floor(total_seconds / 60)
    seconds = max(0, total_seconds % 60)
    return f"{minutes}:{str(seconds).zfill(2)}"


def _format_pace(seconds_per_km: Optional[float], discipline: str) -> str:
    if seconds_per_km is None:
        return "n/d"
    if discipline == "natación":
        per_100m = seconds_per_km / 10
        minutes = floor(per_100m / 60)
        seconds = round(per_100m % 60)
        return f"{minutes}:{str(seconds).zfill(2)}/100m"
    minutes = floor(seconds_per_km / 60)
    seconds = round(seconds_per_km % 60)
    return f"{minutes}:{str(seconds).zfill(2)}/km"


def _format_load(value: Optional[float], discipline: str, athlete_weight: Optional[float] = None) -> str:
    if value is None:
        return "n/d"
    if discipline == "ciclismo":
        if athlete_weight and athlete_weight > 0:
            return f"{round(value)} W ({value / athlete_weight:.2f} W/kg)"
        return f"{round(value)} W"
    return _format_pace(value, discipline)


def _format_hr(value: Optional[float], decimals: int = 0) -> str:
    if value is None:
        return "n/d"
    if decimals == 0:
        return f"{round(value)} bpm"
    return f"{value:.{decimals}f} bpm"


def _compute_age(date_of_birth: Optional[date]) -> Optional[int]:
    if not date_of_birth:
        return None
    today = date.today()
    return today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))


def _discipline_label(discipline: str) -> str:
    if discipline == "running":
        return "carrera a pie"
    if discipline == "ciclismo":
        return "ciclismo"
    if discipline == "natación":
        return "natación"
    if discipline == "triatlón":
        return "triatlón"
    return discipline


def _stage_load(interval, discipline: str) -> Optional[float]:
    if discipline == "ciclismo":
        return interval.power_watts
    return interval.pace_seconds_per_km


def _matching_discipline_sessions(
    sessions: list[AthleteSession],
    discipline: str,
    as_of: datetime,
    power_source: Optional[str] = None,
) -> list[AthleteSession]:
    comparable: list[AthleteSession] = []
    for session in sorted(sessions, key=lambda item: item.performed_at):
        if session.performed_at > as_of:
            continue
        if session.discipline != discipline:
            continue
        if discipline == "ciclismo" and power_source is not None and _normalized_power_source(session) != power_source:
            continue
        comparable.append(session)
    return comparable


def _count_comparable_lactate_samples(
    sessions: list[AthleteSession],
    discipline: str,
    as_of: datetime,
    power_source: Optional[str] = None,
) -> int:
    total = 0
    for session in _matching_discipline_sessions(sessions, discipline, as_of, power_source=power_source):
        for interval in session.intervals:
            sample = interval.lactate_sample
            if sample is None:
                continue
            if _stage_load(interval, discipline) is None:
                continue
            total += 1
    return total


def _map_individual_threshold_for_report(
    threshold: Optional[dict],
    discipline: str,
    athlete_weight: Optional[float],
) -> Optional[dict]:
    if not threshold:
        return None
    metric_value = threshold.get("power_watts") if discipline == "ciclismo" else threshold.get("pace_seconds_per_km")
    if metric_value is None:
        return None
    support_count = len(threshold.get("supporting_sessions") or [])
    return {
        "name": threshold.get("name") or "Umbral individual",
        "anchor_mmol": round(float(threshold.get("lactate") or 0.0), 2),
        "metric_value": float(metric_value),
        "metric_label": _format_load(metric_value, discipline, athlete_weight),
        "heart_rate_bpm": round(threshold["heart_rate"]) if threshold.get("heart_rate") is not None else None,
        "interpretation": (
            f"Estimación individual longitudinal construida desde {support_count} sesiones comparables "
            "que superan filtros de protocolo, retraso de muestra y forma de curva."
        ),
        "confidence": round(float(threshold.get("confidence") or 0.0), 2) if threshold.get("confidence") is not None else None,
        "agreement_score": round(float(threshold.get("agreement_score") or 0.0), 2) if threshold.get("agreement_score") is not None else None,
        "evidence_level": threshold.get("evidence_level"),
        "supporting_sessions": support_count,
    }


def _is_incremental_candidate(session: AthleteSession) -> bool:
    tokens = " ".join(
        item.lower()
        for item in [
            session.session_type or "",
            session.goal or "",
            session.comments or "",
        ]
    )
    return any(token in tokens for token in ("incremental", "umbral", "threshold", "test", "eval", "profile"))


def _extract_stage_rows(session: AthleteSession, discipline: str) -> list[ReportStage]:
    stages: list[ReportStage] = []
    for interval in sorted(session.intervals, key=lambda item: item.order_index):
        if interval.lactate_sample is None:
            continue
        load_value = _stage_load(interval, discipline)
        if load_value is None:
            continue
        stages.append(
            ReportStage(
                stage_number=interval.order_index,
                duration_seconds=interval.duration_seconds,
                load_value=float(load_value),
                load_label=_format_load(load_value, discipline),
                heart_rate_bpm=interval.heart_rate_avg,
                lactate_mmol=float(interval.lactate_sample.lactate_mmol),
                cadence=interval.cadence,
            )
        )
    return stages


def _monotonic_score(stages: list[ReportStage], discipline: str) -> int:
    if len(stages) < 2:
        return 0
    checks = 0
    for previous, current in zip(stages, stages[1:]):
        if discipline == "ciclismo":
            checks += 1 if current.load_value >= previous.load_value else 0
        else:
            checks += 1 if current.load_value <= previous.load_value else 0
    return checks


def _select_best_incremental_session(
    athlete: Athlete,
    discipline: str,
    power_source: Optional[str] = None,
) -> tuple[AthleteSession | None, list[ReportStage]]:
    candidates: list[tuple[int, datetime, AthleteSession, list[ReportStage]]] = []
    for session in athlete.sessions:
        if session.discipline != discipline:
            continue
        if power_source and session.power_source not in {power_source, None}:
            continue
        stages = _extract_stage_rows(session, discipline)
        if len(stages) < 3:
            continue
        score = len(stages) * 10
        score += _monotonic_score(stages, discipline) * 3
        if _is_incremental_candidate(session):
            score += 30
        if any(stage.heart_rate_bpm is not None for stage in stages):
            score += 4
        candidates.append((score, session.performed_at, session, stages))

    if not candidates:
        return None, []

    best = sorted(candidates, key=lambda item: (item[0], item[1]), reverse=True)[0]
    return best[2], best[3]


def _interpolate_threshold(stages: list[ReportStage], target_lactate: float) -> tuple[Optional[float], Optional[float]]:
    for stage in stages:
        if abs(stage.lactate_mmol - target_lactate) < 1e-6:
            return stage.load_value, stage.heart_rate_bpm

    for left, right in zip(stages, stages[1:]):
        if left.lactate_mmol == right.lactate_mmol:
            continue
        if (left.lactate_mmol - target_lactate) * (right.lactate_mmol - target_lactate) <= 0:
            ratio = (target_lactate - left.lactate_mmol) / (right.lactate_mmol - left.lactate_mmol)
            load_value = left.load_value + (right.load_value - left.load_value) * ratio
            heart_rate = None
            if left.heart_rate_bpm is not None and right.heart_rate_bpm is not None:
                heart_rate = left.heart_rate_bpm + (right.heart_rate_bpm - left.heart_rate_bpm) * ratio
            return load_value, heart_rate
    return None, None


def _closest_stage_to_lactate(stages: list[ReportStage], target_lactate: float) -> Optional[ReportStage]:
    if not stages:
        return None
    return min(stages, key=lambda stage: abs(stage.lactate_mmol - target_lactate))


def _mean(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def _categorize_profile(
    baseline_lactate: Optional[float],
    rise_after_lt1: Optional[float],
    threshold_gap_ratio: Optional[float],
) -> str:
    if baseline_lactate is not None and rise_after_lt1 is not None and threshold_gap_ratio is not None:
        if baseline_lactate <= 1.35 and rise_after_lt1 <= 1.15 and threshold_gap_ratio >= 0.08:
            return "Perfil aeróbico robusto"
        if baseline_lactate >= 1.6 or rise_after_lt1 >= 1.75 or threshold_gap_ratio <= 0.05:
            return "Perfil con sesgo glucolítico"
    return "Perfil fisiológico equilibrado"


def _describe_aerobic_profile(baseline_lactate: Optional[float], lt1_load: Optional[float], discipline: str) -> list[str]:
    if baseline_lactate is None:
        return [
            "La eficiencia aeróbica de base solo puede interpretarse de forma parcial porque faltan muestras iniciales suficientes antes del primer umbral práctico."
        ]
    if baseline_lactate <= 1.35:
        return [
            f"El inicio de la curva se mantiene bajo y relativamente estable, lo que sugiere una buena economía aeróbica y una capacidad útil para sostener carga antes de { _format_load(lt1_load, discipline) }.",
            "La cinética previa al primer umbral no muestra una subida prematura de lactato, señal compatible con una base aeróbica bien asentada.",
        ]
    if baseline_lactate <= 1.6:
        return [
            "La parte inicial del test es razonablemente estable, aunque no especialmente baja. Esto apunta a una base aeróbica funcional pero todavía mejorable en términos de limpieza y eficiencia.",
            "No hay una deriva excesiva antes del primer umbral, pero sí margen para reforzar continuidad extensiva y economía subumbral.",
        ]
    return [
        "El lactato asciende relativamente pronto en la primera parte del test, patrón compatible con una eficiencia aeróbica de base todavía poco consolidada.",
        "En términos prácticos conviene reforzar el trabajo de base y la repetición de estímulos estables antes de cargar demasiado la zona media.",
    ]


def _describe_anaerobic_profile(rise_after_lt1: Optional[float], peak_lactate: float) -> list[str]:
    if rise_after_lt1 is None:
        return ["La contribución glucolítica solo puede describirse de forma prudente porque el tramo posterior al primer umbral tiene pocas referencias."]
    if rise_after_lt1 <= 1.15:
        return [
            "La pendiente de lactato tras el primer umbral es relativamente contenida, lo que sugiere una entrada progresiva en dominios más exigentes y una tolerancia razonable a intensidades próximas al umbral.",
            f"El pico de {peak_lactate:.1f} mmol/L indica que el atleta sí puede activar el componente glucolítico, pero no lo hace de forma abrupta.",
        ]
    if rise_after_lt1 <= 1.7:
        return [
            "La subida posterior a LT1 es clara pero no descontrolada. El perfil parece capaz de sostener el trabajo de umbral, aunque con un coste metabólico ya apreciable al acercarse a intensidades altas.",
            f"El pico de {peak_lactate:.1f} mmol/L es coherente con un perfil mixto, útil para rendimiento de resistencia con margen de mejora en tolerancia específica.",
        ]
    return [
        "La curva acelera rápido después del primer umbral, un patrón compatible con una contribución glucolítica marcada y con una acumulación temprana de lactato al salir de la zona aeróbica.",
        f"El pico de {peak_lactate:.1f} mmol/L refuerza la lectura de un perfil más reactivo arriba que estable abajo.",
    ]


def _describe_threshold_structure(
    lt1_load: Optional[float],
    lt2_load: Optional[float],
    threshold_gap_ratio: Optional[float],
    discipline: str,
) -> list[str]:
    if lt1_load is None or lt2_load is None:
        return [
            "La relación entre los dos umbrales no puede definirse con suficiente precisión porque el test no cruza de forma limpia ambos anclajes fisiológicos de referencia."
        ]
    base_sentence = (
        f"Con LT1 fisiológico en {_format_load(lt1_load, discipline)} y LT2 fisiológico en "
        f"{_format_load(lt2_load, discipline)}, la estructura del perfil es utilizable para prescripción práctica."
    )
    if threshold_gap_ratio is None:
        return [base_sentence]
    if threshold_gap_ratio >= 0.08:
        return [
            base_sentence,
            "La distancia entre ambos puntos sugiere una zona aeróbica relativamente amplia y una buena transición entre base y trabajo de umbral.",
        ]
    if threshold_gap_ratio <= 0.05:
        return [
            base_sentence,
            "La separación entre LT1 y LT2 es relativamente estrecha, señal de una ventana aeróbica más comprimida y de menor margen antes de acumular lactato de forma relevante.",
        ]
    return [
        base_sentence,
        "La separación entre ambos umbrales es intermedia: hay espacio funcional entre base y umbral, aunque todavía no destaca por amplitud.",
    ]


def _describe_limiting_factors(
    baseline_lactate: Optional[float],
    rise_after_lt1: Optional[float],
    threshold_gap_ratio: Optional[float],
) -> list[str]:
    factors: list[str] = []
    if baseline_lactate is not None and baseline_lactate > 1.55:
        factors.append("Base aeróbica con margen de mejora: el lactato sale de niveles relativamente altos demasiado pronto.")
    if rise_after_lt1 is not None and rise_after_lt1 > 1.7:
        factors.append("Acumulación rápida de lactato tras LT1: la durabilidad en intensidades medias-altas parece limitada.")
    if threshold_gap_ratio is not None and threshold_gap_ratio < 0.05:
        factors.append("Zona entre umbrales estrecha: hay poco margen funcional entre trabajo extensivo y trabajo de umbral.")
    if not factors:
        factors.append("No aparece un limitante dominante único; el siguiente salto parece depender más de consolidar continuidad y especificidad que de corregir una debilidad extrema.")
    return factors


def _build_zones(
    discipline: str,
    lt1_load: Optional[float],
    lt2_load: Optional[float],
    lt1_hr: Optional[float],
    lt2_hr: Optional[float],
    athlete_weight: Optional[float],
) -> list[dict[str, str]]:
    if lt1_load is None or lt2_load is None:
        return []

    if discipline == "ciclismo":
        midpoint = (lt1_load + lt2_load) / 2
        high_aerobic_floor = max(0.0, lt1_load * 0.88)
        vo2_ceiling = lt2_load * 1.08
        bands = [
            ("Zona 1", "Recuperación y descarga", f"< {_format_load(high_aerobic_floor, discipline, athlete_weight)}"),
            ("Zona 2", "Base aeróbica", f"{_format_load(high_aerobic_floor, discipline, athlete_weight)} - {_format_load(lt1_load, discipline, athlete_weight)}"),
            ("Zona 3", "Tempo controlado", f"{_format_load(lt1_load, discipline, athlete_weight)} - {_format_load(midpoint, discipline, athlete_weight)}"),
            ("Zona 4", "Umbral", f"{_format_load(midpoint, discipline, athlete_weight)} - {_format_load(lt2_load, discipline, athlete_weight)}"),
            ("Zona 5", "VO2max", f"{_format_load(lt2_load, discipline, athlete_weight)} - {_format_load(vo2_ceiling, discipline, athlete_weight)}"),
            ("Zona 6", "Capacidad anaeróbica", f"> {_format_load(vo2_ceiling, discipline, athlete_weight)}"),
        ]
    else:
        gap = max(10.0, lt1_load - lt2_load)
        z1_floor = lt1_load + max(18.0, gap * 0.8)
        z2_floor = lt1_load + max(8.0, gap * 0.35)
        midpoint = lt1_load - (gap / 2)
        z5_ceiling = max(1.0, lt2_load - max(8.0, gap * 0.4))
        bands = [
            ("Zona 1", "Recuperación y descarga", f"> {_format_load(z1_floor, discipline)}"),
            ("Zona 2", "Base aeróbica", f"{_format_load(z1_floor, discipline)} - {_format_load(lt1_load, discipline)}"),
            ("Zona 3", "Tempo controlado", f"{_format_load(lt1_load, discipline)} - {_format_load(midpoint, discipline)}"),
            ("Zona 4", "Umbral", f"{_format_load(midpoint, discipline)} - {_format_load(lt2_load, discipline)}"),
            ("Zona 5", "VO2max", f"{_format_load(lt2_load, discipline)} - {_format_load(z5_ceiling, discipline)}"),
            ("Zona 6", "Capacidad anaeróbica", f"< {_format_load(z5_ceiling, discipline)}"),
        ]

    hr_labels: list[Optional[str]] = [None] * 6
    if lt1_hr is not None and lt2_hr is not None:
        midpoint_hr = (lt1_hr + lt2_hr) / 2
        hr_labels = [
            f"< {round(max(lt1_hr - 8, 0))} bpm",
            f"{round(max(lt1_hr - 8, 0))} - {round(lt1_hr)} bpm",
            f"{round(lt1_hr)} - {round(midpoint_hr)} bpm",
            f"{round(midpoint_hr)} - {round(lt2_hr)} bpm",
            f"{round(lt2_hr)} - {round(lt2_hr + 6)} bpm",
            f"> {round(lt2_hr + 6)} bpm",
        ]

    return [
        {
            "zone": zone,
            "objective": objective,
            "primary_label": primary_label,
            "heart_rate_label": hr_labels[index],
        }
        for index, (zone, objective, primary_label) in enumerate(bands)
    ]


def _scientific_disclaimer() -> str:
    return (
        "Este informe utiliza 2.0 mmol/L y 4.0 mmol/L como anclajes operativos para definir el primer y el segundo umbral con un criterio práctico y estandarizado. "
        "No deben leerse como verdades fisiológicas absolutas: la respuesta de lactato varía mucho entre atletas, el LT1 real suele requerir un pool más amplio de observaciones "
        "y un único test incremental no siempre identifica con exactitud el inicio de la inflexión aeróbica. Aun así, para la toma de decisiones de entrenamiento, estos anclajes "
        "ofrecen una base sólida, consistente y clínicamente útil para prescribir zonas, comparar test y seguir la evolución del atleta."
    )


def _target_metric_summary(target) -> Optional[str]:
    if target.discipline == "triatlón":
        parts = [
            f"Run {target.target_running_pace_label}" if target.target_running_pace_label else None,
            f"Swim {target.target_swim_pace_label}" if target.target_swim_pace_label else None,
            f"Bike {round(target.target_cycling_power_watts)} W" if target.target_cycling_power_watts else None,
        ]
        return " · ".join(part for part in parts if part) or None
    if target.discipline == "ciclismo":
        return f"{round(target.target_power_watts)} W" if target.target_power_watts else None
    return target.target_pace_label or target.target_running_pace_label


def _relevant_targets(athlete: Athlete, discipline: str) -> list:
    return sorted(
        [
            target
            for target in athlete.targets
            if target.discipline in {discipline, "triatlón"}
        ],
        key=lambda item: item.target_date,
    )


def _target_goal_summary(athlete: Athlete, discipline: str) -> Optional[str]:
    targets = _relevant_targets(athlete, discipline)
    if not targets:
        return None
    return " · ".join(target.objective for target in targets[:3] if target.objective)


def _target_competition_summary(athlete: Athlete, discipline: str) -> Optional[str]:
    targets = _relevant_targets(athlete, discipline)
    if not targets:
        return None
    target = targets[0]
    detail_parts = [
        target.distance_label,
        _target_metric_summary(target),
        target.priority_level,
    ]
    details = " · ".join(part for part in detail_parts if part)
    if details:
        return f"{target.target_date.isoformat()} · {details}"
    return target.target_date.isoformat()


def _future_shift_summary(
    profile_tag: str,
    discipline: str,
    lt1_load: float,
    lt2_load: float,
    athlete_weight: Optional[float],
) -> str:
    lt1_label = _format_load(lt1_load, discipline, athlete_weight)
    lt2_label = _format_load(lt2_load, discipline, athlete_weight)
    if profile_tag == "Perfil con sesgo glucolítico":
        return (
            f"El objetivo del siguiente bloque debería ser mover LT1 hacia la derecha desde {lt1_label} y ensanchar la franja útil hasta LT2, "
            "para que el atleta sostenga más carga aeróbica antes de empezar a pagar un coste metabólico alto."
        )
    return (
        f"El objetivo del siguiente bloque debería ser consolidar LT1 en {lt1_label} y desplazar LT2 hacia la derecha desde {lt2_label}, "
        "de forma que el atleta sostenga más ritmo o potencia específica sin perder control interno."
    )


def _wrap_line(text: str, width: int = 92) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines = [words[0]]
    for word in words[1:]:
        candidate = f"{lines[-1]} {word}"
        if len(candidate) <= width:
            lines[-1] = candidate
        else:
            lines.append(word)
    return lines


class _ScientificPdfBuilder:
    def __init__(self):
        self.width = 595
        self.height = 842
        self.margin_x = 42
        self.margin_top = 54
        self.margin_bottom = 44
        self.pages: list[list[str]] = [[]]
        self.y = self.height - self.margin_top

    def _escape(self, text: str) -> str:
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        return safe.encode("cp1252", errors="replace").decode("cp1252")

    def add_page(self):
        self.pages.append([])
        self.y = self.height - self.margin_top

    @property
    def page(self) -> list[str]:
        return self.pages[-1]

    def ensure_space(self, height_needed: float):
        if self.y - height_needed < self.margin_bottom:
            self.add_page()

    def set_fill(self, color: tuple[float, float, float]):
        self.page.append(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg")

    def set_stroke(self, color: tuple[float, float, float]):
        self.page.append(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG")

    def rect(self, x: float, y: float, w: float, h: float, *, fill=None, stroke=None, line_width: float = 1.0):
        self.page.append(f"{line_width:.2f} w")
        if fill:
            self.set_fill(fill)
        if stroke:
            self.set_stroke(stroke)
        operator = "B" if fill and stroke else "f" if fill else "S"
        self.page.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re {operator}")

    def line(self, x1: float, y1: float, x2: float, y2: float, color: tuple[float, float, float], width: float = 1.0, dash: Optional[str] = None):
        self.page.append(f"{width:.2f} w")
        if dash:
            self.page.append(f"[{dash}] 0 d")
        else:
            self.page.append("[] 0 d")
        self.set_stroke(color)
        self.page.append(f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def text(self, x: float, y: float, text: str, *, font: str = "F1", size: int = 10, color=(0.1, 0.15, 0.18)):
        self.set_fill(color)
        self.page.append(f"BT /{font} {size} Tf {x:.2f} {y:.2f} Td ({self._escape(text)}) Tj ET")

    def text_block(self, x: float, top_y: float, text: str, width: float, *, font: str = "F1", size: int = 10, color=(0.1, 0.15, 0.18), leading: Optional[float] = None):
        char_width = max(size * 0.44, 4.1)
        max_chars = max(14, int(width / char_width))
        lines: list[str] = []
        for paragraph in text.split("\n"):
            lines.extend(_wrap_line(paragraph, max_chars))
        current_y = top_y
        for line in lines:
            self.text(x, current_y, line, font=font, size=size, color=color)
            current_y -= leading or (size + 4)
        return current_y

    def block_metrics(self, text: str, width: float, *, size: int = 10, leading: Optional[float] = None) -> tuple[list[str], float]:
        char_width = max(size * 0.44, 4.1)
        max_chars = max(14, int(width / char_width))
        lines: list[str] = []
        for paragraph in text.split("\n"):
            lines.extend(_wrap_line(paragraph, max_chars))
        line_height = leading or (size + 4)
        return lines, len(lines) * line_height

    def footer(self):
        for index, page in enumerate(self.pages, start=1):
            self.pages[index - 1] = page + [
                "[] 0 d",
                "0.95 0.95 0.96 rg",
                f"{self.margin_x:.2f} 18.00 {self.width - self.margin_x * 2:.2f} 18.00 re f",
                "0.45 0.50 0.54 rg",
                f"BT /F1 8 Tf {self.margin_x:.2f} 24.00 Td (Lactate Lab · Informe fisiológico premium) Tj ET",
                f"BT /F1 8 Tf {self.width - self.margin_x - 40:.2f} 24.00 Td (Página {index}) Tj ET",
            ]

    def build(self) -> bytes:
        self.footer()
        font_regular_id = 1
        font_bold_id = 2
        pages_id = 3
        objects: list[bytes] = []

        def _add_object(data: bytes) -> int:
            objects.append(data)
            return len(objects)

        _add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        _add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        _add_object(b"<< /Type /Pages /Count 0 /Kids [] >>")

        page_ids: list[int] = []
        for commands in self.pages:
            stream = "\n".join(commands).encode("cp1252", errors="replace")
            content_id = _add_object(f"<< /Length {len(stream)} >>\nstream\n".encode("cp1252") + stream + b"\nendstream")
            page_obj = (
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {self.width} {self.height}] "
                f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode("cp1252")
            page_id = _add_object(page_obj)
            page_ids.append(page_id)

        kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
        objects[pages_id - 1] = f"<< /Type /Pages /Count {len(page_ids)} /Kids [{kids}] >>".encode("cp1252")
        catalog_id = _add_object(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("cp1252"))

        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(len(output))
            output.extend(f"{index} 0 obj\n".encode("cp1252"))
            output.extend(obj)
            output.extend(b"\nendobj\n")
        xref_offset = len(output)
        output.extend(f"xref\n0 {len(objects) + 1}\n".encode("cp1252"))
        output.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.extend(f"{offset:010d} 00000 n \n".encode("cp1252"))
        output.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode("cp1252")
        )
        return bytes(output)


def _render_pdf_cover(pdf: _ScientificPdfBuilder, report: dict):
    ink = (0.08, 0.08, 0.08)
    muted = (0.36, 0.36, 0.36)
    accent = (0.62, 0.28, 0.08)
    paper = (1, 1, 1)

    pdf.rect(0, 0, pdf.width, pdf.height, fill=paper)
    pdf.line(pdf.margin_x, 804, pdf.width - pdf.margin_x, 804, ink, 1.2)
    pdf.text(pdf.margin_x, 782, "INFORME FISIOLÓGICO", font="F2", size=9, color=muted)
    pdf.text(pdf.margin_x, 748, report["athlete_name"], font="F2", size=28, color=ink)
    pdf.text_block(pdf.margin_x, 722, report["report_subtitle"], width=460, font="F1", size=12, color=muted, leading=16)

    meta_y = 676
    meta_lines = [
        ("Disciplina", _discipline_label(report["discipline"]).title()),
        ("Objetivo", report["profile"].get("performance_goal") or "Sin objetivo cargado"),
        ("Referencia", report["profile"].get("target_competition") or "Sin referencia competitiva"),
        ("Perfil", report["profile_tag"]),
        ("Test", f"{report['test_summary']['performed_at'].date()} · {report['test_summary']['stage_count']} etapas · pico {report['test_summary']['peak_lactate_mmol']:.1f} mmol/L"),
        ("Atleta", f"{report['profile'].get('age') or 'n/d'} años · {report['profile'].get('sex') or 'n/d'} · {report['profile'].get('weight_kg') or 'n/d'} kg"),
    ]
    for index, (label, value) in enumerate(meta_lines):
        line_y = meta_y - index * 24
        pdf.text(pdf.margin_x, line_y, label, font="F2", size=8, color=accent)
        pdf.text_block(pdf.margin_x + 82, line_y, value, width=420, font="F1", size=10, color=ink, leading=12)

    abstract_y = 506
    pdf.text(pdf.margin_x, abstract_y, "Resumen ejecutivo", font="F2", size=12, color=ink)
    summary_y = abstract_y - 22
    for item in report["final_coach_summary"]:
        pdf.rect(pdf.margin_x, summary_y - 4, 4, 4, fill=(0.18, 0.18, 0.18))
        summary_y = pdf.text_block(
            pdf.margin_x + 14,
            summary_y,
            item,
            width=pdf.width - pdf.margin_x * 2 - 20,
            font="F1",
            size=10,
            color=ink,
            leading=14,
        ) - 10

    method_title_y = summary_y - 10
    pdf.text(pdf.margin_x, method_title_y, "Marco de lectura", font="F2", size=12, color=ink)
    method_text = (
        "Este documento prioriza LT1 y LT2 fisiológicos anclados a 2.0 y 4.0 mmol/L sobre el último test incremental válido de la disciplina visible. "
        f"Los LT Individual solo se muestran si la base comparable reúne al menos {report['individual_threshold_min_samples']} muestras y el consenso longitudinal es suficiente. "
        "La intención es ofrecer una lectura útil, sobria y trazable para prescripción, seguimiento y comparación futura."
    )
    method_end_y = pdf.text_block(pdf.margin_x, method_title_y - 22, method_text, width=pdf.width - pdf.margin_x * 2, font="F1", size=9, color=muted, leading=13)
    pdf.y = method_end_y - 20


def _draw_stage_curve(pdf: _ScientificPdfBuilder, report: dict):
    ink = (0.12, 0.18, 0.21)
    muted = (0.38, 0.43, 0.46)
    accent = (0.72, 0.40, 0.22)
    pdf.ensure_space(330)
    pdf.text(pdf.margin_x, pdf.y, "Curva incremental y lectura de umbrales", font="F2", size=15, color=ink)
    pdf.y -= 18
    pdf.text_block(
        pdf.margin_x,
        pdf.y,
        (
            "La figura resume la progresión del lactato frente a la carga del test incremental. "
            "Las líneas verticales marcan LT1 y LT2 fisiológicos anclados a 2.0 y 4.0 mmol/L."
            if not report.get("individual_thresholds")
            else "La figura resume la progresión del lactato frente a la carga del test incremental. Las líneas verticales muestran los anclajes fisiológicos y, cuando la evidencia lo permite, la referencia individual longitudinal."
        ),
        width=pdf.width - pdf.margin_x * 2,
        font="F1",
        size=9,
        color=muted,
        leading=13,
    )
    pdf.y -= 48
    chart_x = pdf.margin_x
    chart_y = pdf.y - 220
    chart_w = pdf.width - pdf.margin_x * 2
    chart_h = 210
    pdf.rect(chart_x, chart_y, chart_w, chart_h, fill=(0.996, 0.995, 0.992), stroke=(0.87, 0.87, 0.85))
    pdf.rect(chart_x, chart_y + chart_h - 28, chart_w, 28, fill=(0.95, 0.946, 0.938))

    plot_left = chart_x + 48
    plot_bottom = chart_y + 34
    plot_w = chart_w - 66
    plot_h = chart_h - 58
    pdf.line(plot_left, plot_bottom, plot_left, plot_bottom + plot_h, (0.62, 0.66, 0.70), 1.0)
    pdf.line(plot_left, plot_bottom, plot_left + plot_w, plot_bottom, (0.62, 0.66, 0.70), 1.0)

    stages = report["stages"]
    discipline = report["discipline"]
    loads = [stage["load_value"] for stage in stages]
    lactates = [stage["lactate_mmol"] for stage in stages]
    if discipline == "ciclismo":
        min_load, max_load = min(loads), max(loads)
        def map_x(value: float) -> float:
            if max_load == min_load:
                return plot_left + plot_w / 2
            return plot_left + ((value - min_load) / (max_load - min_load)) * plot_w
    else:
        min_load, max_load = min(loads), max(loads)
        def map_x(value: float) -> float:
            if max_load == min_load:
                return plot_left + plot_w / 2
            return plot_left + ((max_load - value) / (max_load - min_load)) * plot_w

    all_thresholds = report["thresholds"] + report.get("individual_thresholds", [])
    max_lactate = max(max(lactates), max(threshold["anchor_mmol"] for threshold in all_thresholds)) + 0.6
    def map_y(value: float) -> float:
        return plot_bottom + (value / max_lactate) * plot_h

    for grid_index in range(1, 5):
        value = (max_lactate / 4) * grid_index
        y = map_y(value)
        pdf.line(plot_left, y, plot_left + plot_w, y, (0.88, 0.90, 0.92), 0.7, dash="2 3")
        pdf.text(chart_x + 8, y - 3, f"{value:.1f}", font="F1", size=8, color=muted)

    polyline_points = [(map_x(stage["load_value"]), map_y(stage["lactate_mmol"])) for stage in stages]
    for left, right in zip(polyline_points, polyline_points[1:]):
        pdf.line(left[0], left[1], right[0], right[1], (0.16, 0.25, 0.78), 1.8)
    smooth_points = []
    for index, stage in enumerate(stages):
        if index == 0 or index == len(stages) - 1:
            adjusted = stage["lactate_mmol"]
        else:
            adjusted = stages[index - 1]["lactate_mmol"] * 0.22 + stage["lactate_mmol"] * 0.56 + stages[index + 1]["lactate_mmol"] * 0.22
        smooth_points.append((map_x(stage["load_value"]), map_y(adjusted)))
    for left, right in zip(smooth_points, smooth_points[1:]):
        pdf.line(left[0], left[1], right[0], right[1], (0.84, 0.31, 0.22), 1.5)

    for stage, (x, y) in zip(stages, polyline_points):
        pdf.rect(x - 2, y - 2, 4, 4, fill=(0.08, 0.10, 0.14))
        pdf.text(x - 6, y + 8, str(stage["stage_number"]), font="F1", size=7, color=muted)

    threshold_colors = {
        "LT1 fisiológico": (0.18, 0.34, 0.83),
        "LT2 fisiológico": (0.83, 0.42, 0.21),
        "LT1 Individual": (0.22, 0.58, 0.36),
        "LT2 Individual": (0.68, 0.30, 0.19),
    }
    for index, threshold in enumerate(all_thresholds):
        metric_value = threshold.get("metric_value")
        if metric_value is None:
            continue
        x = map_x(metric_value)
        color = threshold_colors.get(threshold["name"], (0.30, 0.30, 0.30))
        pdf.line(x, plot_bottom, x, plot_bottom + plot_h, color, 1.3, dash="5 3")
        label_y = plot_bottom + plot_h - 10 - (index % 2) * 12
        label = threshold["name"]
        pdf.text(x + 4, label_y, label, font="F2", size=8, color=color)
        label_text = threshold["metric_label"]
        card_w = min(96, max(54, 16 + len(label_text) * 3.6))
        card_x = min(max(x - card_w / 2, plot_left + 2), plot_left + plot_w - card_w - 2)
        pdf.rect(card_x, plot_bottom - 28, card_w, 18, fill=(1, 1, 1), stroke=color, line_width=0.8)
        pdf.text(card_x + 6, plot_bottom - 21, label_text, font="F2", size=7, color=color)

    pdf.text(plot_left + plot_w / 2 - 40, chart_y + 10, "Carga de trabajo", font="F2", size=9, color=ink)
    pdf.text(chart_x + 10, chart_y + chart_h - 18, "Lactato (mmol/L)", font="F2", size=9, color=ink)
    pdf.text(plot_left + 4, chart_y + chart_h - 18, "Línea real", font="F1", size=8, color=(0.16, 0.25, 0.78))
    pdf.text(plot_left + 70, chart_y + chart_h - 18, "Ajuste visual", font="F1", size=8, color=accent)

    if stages:
        left_stage = stages[0]
        right_stage = stages[-1]
        pdf.text(plot_left - 14, plot_bottom - 14, left_stage["load_label"], font="F1", size=7, color=muted)
        pdf.text(plot_left + plot_w - 26, plot_bottom - 14, right_stage["load_label"], font="F1", size=7, color=muted)

    pdf.y = chart_y - 24


def _render_threshold_cards(pdf: _ScientificPdfBuilder, report: dict):
    thresholds = report["thresholds"]
    if not thresholds:
        return
    ink = (0.10, 0.10, 0.10)
    muted = (0.36, 0.36, 0.36)
    accents = [(0.20, 0.20, 0.20), (0.62, 0.28, 0.08)]
    columns = 2
    gap = 12
    card_w = (pdf.width - pdf.margin_x * 2 - gap) / columns
    card_h = 104
    rows = (len(thresholds) + columns - 1) // columns
    pdf.ensure_space(rows * (card_h + gap) + 26)
    pdf.text(pdf.margin_x, pdf.y, "LT fisiológicos de anclaje", font="F2", size=14, color=ink)
    pdf.y -= 16
    pdf.text_block(
        pdf.margin_x,
        pdf.y,
        "Estos dos puntos sostienen la lectura principal del informe y la construcción de zonas. Se presentan con prioridad visual por ser la base práctica más sólida del documento.",
        width=pdf.width - pdf.margin_x * 2,
        font="F1",
        size=9,
        color=muted,
        leading=12,
    )
    pdf.y -= 34
    top = pdf.y
    for index, threshold in enumerate(thresholds):
        row = index // columns
        column = index % columns
        x = pdf.margin_x + column * (card_w + gap)
        y_top = top - row * (card_h + gap)
        accent = accents[index % len(accents)]
        pdf.rect(x, y_top - card_h, card_w, card_h, fill=(1, 1, 1), stroke=(0.86, 0.86, 0.86))
        pdf.rect(x, y_top - 6, card_w, 6, fill=accent)
        pdf.text(x + 12, y_top - 20, threshold["name"], font="F2", size=9, color=accent)
        pdf.text(x + 12, y_top - 40, threshold["metric_label"], font="F2", size=17, color=ink)
        secondary = f"Anclaje {threshold['anchor_mmol']:.1f} mmol/L"
        tertiary = f"{threshold.get('heart_rate_bpm') or 'n/d'} bpm"
        pdf.text(x + 12, y_top - 56, secondary, font="F1", size=9, color=muted)
        pdf.text(x + 12, y_top - 68, tertiary, font="F1", size=9, color=muted)
        interpretation = threshold["interpretation"]
        if len(interpretation) > 106:
            interpretation = f"{interpretation[:103]}..."
        pdf.text_block(x + 12, y_top - 82, interpretation, width=card_w - 24, font="F1", size=8, color=muted, leading=10)
    pdf.y = top - rows * (card_h + gap) - 6


def _render_individual_threshold_cards(pdf: _ScientificPdfBuilder, report: dict):
    thresholds = report.get("individual_thresholds") or []
    note = report.get("individual_threshold_note")
    if not thresholds and not note:
        return

    ink = (0.10, 0.10, 0.10)
    muted = (0.36, 0.36, 0.36)
    title_h = 54
    card_h = 96
    gap = 12
    columns = 2
    card_w = (pdf.width - pdf.margin_x * 2 - gap) / columns
    rows = (len(thresholds) + columns - 1) // columns if thresholds else 0
    note_height = pdf.block_metrics(
        note or "",
        pdf.width - pdf.margin_x * 2 - 28,
        size=9,
        leading=12,
    )[1]
    block_height = title_h + (rows * (card_h + gap) if thresholds else 0) + (note_height + 34 if note else 0)
    pdf.ensure_space(block_height + 12)

    pdf.text(pdf.margin_x, pdf.y, "Contexto individual longitudinal", font="F2", size=14, color=ink)
    pdf.y -= 16
    pdf.text_block(
        pdf.margin_x,
        pdf.y,
        "Esta capa solo aparece cuando la base comparable es suficientemente amplia. No sustituye a los anclajes principales; añade contexto individual para el mismo deportista.",
        width=pdf.width - pdf.margin_x * 2,
        font="F1",
        size=9,
        color=muted,
        leading=12,
    )
    pdf.y -= 34

    if thresholds:
        accents = [(0.20, 0.20, 0.20), (0.62, 0.28, 0.08)]
        top = pdf.y
        for index, threshold in enumerate(thresholds):
            row = index // columns
            column = index % columns
            x = pdf.margin_x + column * (card_w + gap)
            y_top = top - row * (card_h + gap)
            accent = accents[index % len(accents)]
            pdf.rect(x, y_top - card_h, card_w, card_h, fill=(1, 1, 1), stroke=(0.86, 0.86, 0.86))
            pdf.rect(x, y_top - 6, card_w, 6, fill=accent)
            pdf.text(x + 12, y_top - 20, threshold["name"], font="F2", size=9, color=accent)
            pdf.text(x + 12, y_top - 40, threshold["metric_label"], font="F2", size=15, color=ink)
            support_label = f"{threshold.get('supporting_sessions') or 0} sesiones soporte"
            confidence_label = (
                f"Confianza {round((threshold.get('confidence') or 0) * 100)}%"
                if threshold.get("confidence") is not None
                else "Confianza n/d"
            )
            pdf.text(x + 12, y_top - 56, support_label, font="F1", size=9, color=muted)
            pdf.text(x + 12, y_top - 68, confidence_label, font="F1", size=9, color=muted)
            interpretation = threshold["interpretation"]
            if len(interpretation) > 94:
                interpretation = f"{interpretation[:91]}..."
            pdf.text_block(x + 12, y_top - 80, interpretation, width=card_w - 24, font="F1", size=8, color=muted, leading=10)
        pdf.y = top - rows * (card_h + gap) - 2

    if note:
        box_h = note_height + 32
        pdf.rect(pdf.margin_x, pdf.y - box_h, pdf.width - pdf.margin_x * 2, box_h, fill=(0.992, 0.992, 0.992), stroke=(0.86, 0.86, 0.86))
        pdf.text(pdf.margin_x + 14, pdf.y - 18, "Criterio editorial de inclusión", font="F2", size=9, color=(0.10, 0.10, 0.10))
        pdf.text_block(
            pdf.margin_x + 14,
            pdf.y - 36,
            note,
            width=pdf.width - pdf.margin_x * 2 - 28,
            font="F1",
            size=9,
            color=(0.22, 0.22, 0.22),
            leading=12,
        )
        pdf.y -= box_h + 12
    else:
        pdf.y -= 10


def _render_metric_cards(pdf: _ScientificPdfBuilder, report: dict):
    pdf.ensure_space(108)
    individual_status = (
        "Disponible en anexo"
        if report.get("individual_thresholds")
        else "No incluido"
    )
    cards = [
        ("Pico de lactato", f"{report['test_summary']['peak_lactate_mmol']:.1f} mmol/L", f"{report['test_summary']['stage_count']} etapas válidas"),
        ("Duración media", _format_seconds(report["test_summary"]["average_stage_duration_seconds"]), report["test_summary"]["load_start_label"] + " a " + report["test_summary"]["load_end_label"]),
        ("Pool comparable", f"{report['individual_threshold_sample_count']} muestras", f"Mínimo editorial {report['individual_threshold_min_samples']}"),
        ("Lectura individual", individual_status, report["profile_tag"]),
    ]
    pdf.text(pdf.margin_x, pdf.y, "Datos clave del test", font="F2", size=12, color=(0.10, 0.10, 0.10))
    pdf.y -= 16
    for title, value, detail in cards:
        pdf.line(pdf.margin_x, pdf.y - 4, pdf.width - pdf.margin_x, pdf.y - 4, (0.88, 0.88, 0.88), 0.8)
        pdf.text(pdf.margin_x, pdf.y - 18, title.upper(), font="F2", size=7, color=(0.45, 0.45, 0.45))
        pdf.text(pdf.margin_x + 120, pdf.y - 18, value, font="F2", size=11, color=(0.10, 0.10, 0.10))
        pdf.text_block(pdf.margin_x + 280, pdf.y - 18, detail, width=220, font="F1", size=8, color=(0.36, 0.36, 0.36), leading=10)
        pdf.y -= 28
    pdf.y -= 6


def _section_body(report: dict, key: str) -> list[str]:
    for section in report.get("sections", []):
        if section.get("key") == key:
            return section.get("body", [])
    return []


def _render_editorial_intro(pdf: _ScientificPdfBuilder, report: dict):
    ink = (0.09, 0.09, 0.09)
    muted = (0.36, 0.36, 0.36)
    pdf.ensure_space(120)
    pdf.text(pdf.margin_x, pdf.y, "Cómo leer este informe", font="F2", size=15, color=ink)
    pdf.y -= 18
    intro = (
        "El documento se organiza en cuatro bloques: tomas de lactato, zonas de entreno, conclusiones y plan a futuro. "
        "La idea no es solo enseñar una curva, sino traducir el test a decisiones prácticas y a una dirección clara para el siguiente bloque."
    )
    pdf.text_block(pdf.margin_x, pdf.y, intro, width=pdf.width - pdf.margin_x * 2, font="F1", size=10, color=muted, leading=14)
    pdf.y -= 46


def _draw_goal_shift_chart(pdf: _ScientificPdfBuilder, report: dict):
    ink = (0.10, 0.10, 0.10)
    muted = (0.38, 0.38, 0.38)
    accent = (0.62, 0.28, 0.08)
    pdf.ensure_space(190)
    pdf.text(pdf.margin_x, pdf.y, "Dirección objetivo del siguiente bloque", font="F2", size=14, color=ink)
    pdf.y -= 18

    if report["profile_tag"] == "Perfil con sesgo glucolítico":
        title = "Desplazar LT1 y ensanchar la base aeróbica"
        note = "Buscamos que el atleta sostenga más trabajo útil antes de empezar a pagar un coste metabólico alto."
        current_lt1 = 0.34
        current_lt2 = 0.66
        target_lt1 = 0.46
        target_lt2 = 0.74
    else:
        title = "Sostener LT1 y desplazar LT2 hacia la derecha"
        note = "Buscamos que el atleta mantenga la base actual y sostenga más ritmo o potencia específica con menor coste interno."
        current_lt1 = 0.38
        current_lt2 = 0.68
        target_lt1 = 0.40
        target_lt2 = 0.80

    pdf.text_block(pdf.margin_x, pdf.y, title, width=pdf.width - pdf.margin_x * 2, font="F2", size=12, color=ink, leading=15)
    pdf.y -= 22
    pdf.text_block(pdf.margin_x, pdf.y, note, width=pdf.width - pdf.margin_x * 2, font="F1", size=9, color=muted, leading=12)
    pdf.y -= 40

    chart_x = pdf.margin_x
    chart_y = pdf.y - 76
    chart_w = pdf.width - pdf.margin_x * 2
    row_h = 28
    pdf.rect(chart_x, chart_y, chart_w, 92, fill=(1, 1, 1), stroke=(0.86, 0.86, 0.86))
    label_w = 52
    track_x = chart_x + label_w
    track_w = chart_w - label_w - 20

    def draw_lane(y_top: float, label: str, lt1_pos: float, lt2_pos: float, lt1_text: str, lt2_text: str, target: bool = False):
        pdf.text(chart_x + 8, y_top - 17, label, font="F2", size=8, color=muted)
        pdf.line(track_x, y_top - 12, track_x + track_w, y_top - 12, (0.74, 0.74, 0.74), 1.0)
        for pos, code, text in ((lt1_pos, "LT1", lt1_text), (lt2_pos, "LT2", lt2_text)):
            x = track_x + track_w * pos
            color = accent if target else ink
            pdf.line(x, y_top - 24, x, y_top, color, 1.4)
            pdf.text(x + 4, y_top - 8 if code == "LT1" else y_top - 20, code, font="F2", size=8, color=color)
            pdf.text(x + 4, y_top - 19 if code == "LT1" else y_top - 31, text, font="F1", size=7, color=color)

    draw_lane(chart_y + 70, "Hoy", current_lt1, current_lt2, report["thresholds"][0]["metric_label"], report["thresholds"][1]["metric_label"])
    draw_lane(chart_y + 36, "Objetivo", target_lt1, target_lt2, "más a la derecha", "más sostenible", target=True)
    pdf.y = chart_y - 18


def _render_stage_table(pdf: _ScientificPdfBuilder, report: dict):
    def draw_header():
        pdf.text(pdf.margin_x, pdf.y, "Tabla técnica del test incremental", font="F2", size=14, color=(0.09, 0.20, 0.24))
        pdf.y -= 18
        header_y = pdf.y
        pdf.rect(pdf.margin_x, header_y - 18, pdf.width - pdf.margin_x * 2, 18, fill=(0.93, 0.95, 0.97))
        for index, label in enumerate(headers):
            pdf.text(columns[index], header_y - 12, label, font="F2", size=8, color=(0.35, 0.39, 0.42))
        pdf.y = header_y - 26

    columns = [pdf.margin_x, pdf.margin_x + 52, pdf.margin_x + 200, pdf.margin_x + 300, pdf.margin_x + 388]
    headers = ["Etapa", "Carga", "FC", "Lactato", "Duración"]
    pdf.ensure_space(54)
    draw_header()
    for stage in report["stages"]:
        if pdf.y - 18 < pdf.margin_bottom:
            pdf.add_page()
            draw_header()
        pdf.rect(pdf.margin_x, pdf.y - 12, pdf.width - pdf.margin_x * 2, 16, fill=(0.985, 0.985, 0.985), stroke=(0.92, 0.92, 0.92), line_width=0.4)
        values = [
            str(stage["stage_number"]),
            stage["load_label"],
            f"{stage['heart_rate_bpm']} bpm" if stage.get("heart_rate_bpm") else "n/d",
            f"{stage['lactate_mmol']:.1f} mmol/L",
            _format_seconds(stage["duration_seconds"]),
        ]
        for index, value in enumerate(values):
            pdf.text(columns[index], pdf.y - 6, value, font="F1", size=8, color=(0.18, 0.21, 0.24))
        pdf.y -= 18
    pdf.y -= 8


def _render_zone_table(pdf: _ScientificPdfBuilder, report: dict):
    zone_heights = [
        max(
            pdf.block_metrics(zone["objective"], 200, size=9, leading=12)[1],
            pdf.block_metrics(zone["primary_label"], 120, size=9, leading=12)[1],
            pdf.block_metrics(zone.get("heart_rate_label") or "FC no disponible", 92, size=8, leading=11)[1],
        ) + 14
        for zone in report["zones"]
    ]
    pdf.ensure_space(34 + sum(zone_heights))
    pdf.text(pdf.margin_x, pdf.y, "Zonas personalizadas de entrenamiento", font="F2", size=14, color=(0.10, 0.10, 0.10))
    pdf.y -= 18
    zone_accent = {
        "Zona 1": (0.78, 0.78, 0.78),
        "Zona 2": (0.70, 0.74, 0.70),
        "Zona 3": (0.76, 0.74, 0.68),
        "Zona 4": (0.76, 0.68, 0.62),
        "Zona 5": (0.70, 0.58, 0.52),
        "Zona 6": (0.58, 0.52, 0.52),
    }
    for zone, row_h in zip(report["zones"], zone_heights):
        pdf.ensure_space(row_h + 8)
        pdf.rect(pdf.margin_x, pdf.y - row_h + 4, pdf.width - pdf.margin_x * 2, row_h, fill=(1, 1, 1), stroke=(0.88, 0.88, 0.88))
        pdf.rect(pdf.margin_x + 10, pdf.y - row_h + 8, 48, row_h - 8, fill=zone_accent.get(zone["zone"], (0.72, 0.74, 0.78)))
        pdf.text(pdf.margin_x + 18, pdf.y - 14, zone["zone"].replace("Zona ", "Z"), font="F2", size=10, color=(1, 1, 1))
        pdf.text_block(pdf.margin_x + 72, pdf.y - 10, zone["objective"], width=200, font="F1", size=9, color=(0.30, 0.30, 0.30), leading=12)
        pdf.text_block(pdf.margin_x + 288, pdf.y - 10, zone["primary_label"], width=112, font="F2", size=9, color=(0.10, 0.10, 0.10), leading=12)
        pdf.text_block(pdf.margin_x + 416, pdf.y - 10, zone.get("heart_rate_label") or "FC no disponible", width=92, font="F1", size=8, color=(0.42, 0.42, 0.42), leading=11)
        pdf.y -= row_h + 6
    pdf.y -= 6


def _render_report_chapter(pdf: _ScientificPdfBuilder, number: str, title: str, paragraphs: list[str]):
    ink = (0.10, 0.10, 0.10)
    muted = (0.36, 0.36, 0.36)
    estimated = 44 + sum(pdf.block_metrics(paragraph, pdf.width - pdf.margin_x * 2 - 56, size=10, leading=14)[1] for paragraph in paragraphs) + len(paragraphs) * 14
    pdf.ensure_space(estimated)
    pdf.text(pdf.margin_x, pdf.y, number, font="F2", size=10, color=muted)
    pdf.text(pdf.margin_x + 28, pdf.y, title, font="F2", size=15, color=ink)
    pdf.line(pdf.margin_x + 28, pdf.y - 6, pdf.width - pdf.margin_x, pdf.y - 6, (0.84, 0.84, 0.84), 0.9)
    pdf.y -= 24
    for paragraph in paragraphs:
        pdf.rect(pdf.margin_x + 28, pdf.y - 6, 4, 4, fill=(0.18, 0.18, 0.18))
        pdf.y = pdf.text_block(
            pdf.margin_x + 40,
            pdf.y,
            paragraph,
            width=pdf.width - pdf.margin_x * 2 - 52,
            font="F1",
            size=10,
            color=(0.18, 0.21, 0.24),
            leading=14,
        )
        pdf.y -= 12
    pdf.y -= 18


def _render_limitations_and_summary(pdf: _ScientificPdfBuilder, report: dict):
    if report["limitations"]:
        content_height = sum(pdf.block_metrics(f"- {item}", pdf.width - pdf.margin_x * 2 - 28, size=9, leading=13)[1] for item in report["limitations"])
        box_h = content_height + 34
        pdf.ensure_space(box_h + 14)
        pdf.rect(pdf.margin_x, pdf.y - box_h, pdf.width - pdf.margin_x * 2, box_h, fill=(0.992, 0.992, 0.992), stroke=(0.84, 0.84, 0.84))
        pdf.text(pdf.margin_x + 14, pdf.y - 18, "Limitaciones y condiciones de lectura", font="F2", size=10, color=(0.12, 0.12, 0.12))
        current_y = pdf.y - 36
        for item in report["limitations"]:
            current_y = pdf.text_block(pdf.margin_x + 14, current_y, f"- {item}", width=pdf.width - pdf.margin_x * 2 - 28, font="F1", size=9, color=(0.28, 0.22, 0.20), leading=13)
        pdf.y = current_y - 18

    summary_height = sum(pdf.block_metrics(f"- {item}", pdf.width - pdf.margin_x * 2 - 28, size=10, leading=14)[1] for item in report["final_coach_summary"])
    summary_box_h = summary_height + 40
    pdf.ensure_space(summary_box_h + 14)
    pdf.rect(pdf.margin_x, pdf.y - summary_box_h, pdf.width - pdf.margin_x * 2, summary_box_h, fill=(0.986, 0.986, 0.986), stroke=(0.84, 0.84, 0.84))
    pdf.text(pdf.margin_x + 14, pdf.y - 18, "Resumen final para el entrenador", font="F2", size=11, color=(0.10, 0.10, 0.10))
    current_y = pdf.y - 38
    for item in report["final_coach_summary"]:
        current_y = pdf.text_block(pdf.margin_x + 14, current_y, f"- {item}", width=pdf.width - pdf.margin_x * 2 - 28, font="F1", size=10, color=(0.16, 0.21, 0.18), leading=14)
    pdf.y = current_y - 16

    disclaimer_height = pdf.block_metrics(report["disclaimer"], pdf.width - pdf.margin_x * 2 - 28, size=9, leading=13)[1]
    disclaimer_box_h = disclaimer_height + 40
    pdf.ensure_space(disclaimer_box_h)
    pdf.rect(pdf.margin_x, pdf.y - disclaimer_box_h, pdf.width - pdf.margin_x * 2, disclaimer_box_h, fill=(0.992, 0.992, 0.992), stroke=(0.84, 0.84, 0.84))
    pdf.text(pdf.margin_x + 14, pdf.y - 18, "Consideración científica", font="F2", size=10, color=(0.10, 0.10, 0.10))
    pdf.text_block(pdf.margin_x + 14, pdf.y - 38, report["disclaimer"], width=pdf.width - pdf.margin_x * 2 - 28, font="F1", size=9, color=(0.20, 0.24, 0.30), leading=13)
    pdf.y -= disclaimer_box_h + 12


def _build_scientific_pdf(report: dict) -> bytes:
    pdf = _ScientificPdfBuilder()
    _render_pdf_cover(pdf, report)
    pdf.add_page()
    _render_editorial_intro(pdf, report)
    _render_metric_cards(pdf, report)
    _render_threshold_cards(pdf, report)
    _draw_stage_curve(pdf, report)
    _draw_goal_shift_chart(pdf, report)
    _render_individual_threshold_cards(pdf, report)
    _render_stage_table(pdf, report)
    pdf.add_page()
    _render_zone_table(pdf, report)
    _render_report_chapter(pdf, "I", "Tomas de lactato", _section_body(report, "lactate_sampling"))
    _render_report_chapter(pdf, "II", "Zonas de entreno", _section_body(report, "training_zones"))
    _render_report_chapter(pdf, "III", "Conclusiones", _section_body(report, "conclusions"))
    _render_report_chapter(pdf, "IV", "Plan a futuro", _section_body(report, "future_plan"))
    _render_limitations_and_summary(pdf, report)
    return pdf.build()


def build_physiology_report_payload(
    db: Session,
    athlete_id: int,
    discipline: Optional[str] = None,
    power_source: Optional[str] = None,
) -> dict:
    athlete = db.scalar(
        select(Athlete)
        .options(
            joinedload(Athlete.targets),
            joinedload(Athlete.focus_blocks),
            joinedload(Athlete.weights),
            joinedload(Athlete.sessions)
            .joinedload(AthleteSession.intervals)
            .joinedload(SessionInterval.lactate_sample),
        )
        .where(Athlete.id == athlete_id)
    )
    if athlete is None:
        raise ValueError("Athlete not found")

    effective_discipline = discipline or athlete.primary_discipline
    session, stages = _select_best_incremental_session(athlete, effective_discipline, power_source=power_source)
    if session is None or not stages:
        raise ValueError("No hay datos suficientes de test incremental para generar el informe")

    lt1_load, lt1_hr = _interpolate_threshold(stages, 2.0)
    lt2_load, lt2_hr = _interpolate_threshold(stages, 4.0)

    lt1_is_approximate = False
    lt2_is_approximate = False
    if lt1_load is None:
        closest_lt1_stage = _closest_stage_to_lactate(stages, 2.0)
        if closest_lt1_stage is None:
            raise ValueError("No hay datos suficientes de test incremental para generar el informe")
        lt1_load = closest_lt1_stage.load_value
        lt1_hr = closest_lt1_stage.heart_rate_bpm
        lt1_is_approximate = True
    if lt2_load is None:
        closest_lt2_stage = _closest_stage_to_lactate(stages, 4.0)
        if closest_lt2_stage is None:
            raise ValueError("No hay datos suficientes de test incremental para generar el informe")
        lt2_load = closest_lt2_stage.load_value
        lt2_hr = closest_lt2_stage.heart_rate_bpm
        lt2_is_approximate = True

    baseline_lactate = _mean([stage.lactate_mmol for stage in stages[:2]])
    peak_lactate = max(stage.lactate_mmol for stage in stages)
    rise_after_lt1 = None
    post_lt1 = [stage.lactate_mmol for stage in stages if stage.lactate_mmol >= 2.0]
    if len(post_lt1) >= 2:
        rise_after_lt1 = (post_lt1[-1] - post_lt1[0]) / (len(post_lt1) - 1)

    gap_raw = (lt2_load - lt1_load) if effective_discipline == "ciclismo" else (lt1_load - lt2_load)
    threshold_gap_ratio = abs(gap_raw / lt1_load) if lt1_load else None
    profile_tag = _categorize_profile(baseline_lactate, rise_after_lt1, threshold_gap_ratio)
    limitations: list[str] = []
    if not any(stage.heart_rate_bpm is not None for stage in stages):
        limitations.append("La sesión no aporta frecuencia cardiaca en todas las etapas, así que parte de la prescripción debe apoyarse sobre todo en carga externa.")
    if not any(stage.cadence is not None for stage in stages):
        limitations.append("No hay cadencia útil en las etapas del test, por lo que la lectura mecánica del gesto queda limitada.")
    if len(stages) < 4:
        limitations.append("El test tiene pocas etapas válidas; el informe es utilizable, pero la estabilidad del ajuste mejoraría con una rampa algo más densa.")
    if power_source is None and effective_discipline == "ciclismo" and session.power_source:
        limitations.append(f"El informe se apoya en el potenciómetro '{session.power_source}'. Si alternas indoor y outdoor, conviene contrastarlos por separado.")
    if lt1_is_approximate:
        closest_lt1_stage = _closest_stage_to_lactate(stages, 2.0)
        limitations.append(
            "LT1 operativo construido con la etapa observada más cercana a 2.0 mmol/L "
            f"({closest_lt1_stage.lactate_mmol:.1f} mmol/L en {closest_lt1_stage.load_label}) porque la curva no cruza ese anclaje de forma limpia."
        )
    if lt2_is_approximate:
        closest_lt2_stage = _closest_stage_to_lactate(stages, 4.0)
        limitations.append(
            "LT2 operativo construido con la etapa observada más cercana a 4.0 mmol/L "
            f"({closest_lt2_stage.lactate_mmol:.1f} mmol/L en {closest_lt2_stage.load_label}) porque la curva no cruza ese anclaje de forma limpia."
        )

    target_goal = _target_goal_summary(athlete, effective_discipline)
    target_competition = _target_competition_summary(athlete, effective_discipline)
    active_block = next(
        (
            block
            for block in athlete.focus_blocks
            if block.status == "active" and (block.priority_discipline or athlete.primary_discipline) in {effective_discipline, athlete.primary_discipline}
        ),
        None,
    )
    comparable_power_source = _normalized_power_source(session) if effective_discipline == "ciclismo" else None
    comparable_sessions = _matching_discipline_sessions(
        athlete.sessions,
        effective_discipline,
        session.performed_at,
        power_source=comparable_power_source,
    )
    individual_threshold_sample_count = _count_comparable_lactate_samples(
        athlete.sessions,
        effective_discipline,
        session.performed_at,
        power_source=comparable_power_source,
    )
    individual_threshold_note: Optional[str] = None
    individual_thresholds: list[dict] = []
    try:
        individual_payload = _build_individual_thresholds(
            sessions=comparable_sessions,
            discipline=effective_discipline,
            power_source=comparable_power_source,
        )
        individual_quality = individual_payload.get("data_quality") or {}
        if individual_threshold_sample_count >= _REPORT_MIN_INDIVIDUAL_SAMPLES and individual_quality.get("sufficient"):
            for item in (
                _map_individual_threshold_for_report(individual_payload.get("lt1_individual"), effective_discipline, athlete.weight),
                _map_individual_threshold_for_report(individual_payload.get("lt2_individual"), effective_discipline, athlete.weight),
            ):
                if item is not None:
                    individual_thresholds.append(item)
            if not individual_thresholds:
                individual_threshold_note = (
                    "La base longitudinal supera el mínimo de muestras, pero no hay consenso suficiente para publicar LT Individual con seguridad."
                )
        elif individual_threshold_sample_count < _REPORT_MIN_INDIVIDUAL_SAMPLES:
            individual_threshold_note = (
                "Los LT Individual no se incluyen en este informe porque la piscina comparable reúne "
                f"{individual_threshold_sample_count} muestras y el mínimo editorial se ha fijado en "
                f"{_REPORT_MIN_INDIVIDUAL_SAMPLES}."
            )
        else:
            reason = str(individual_quality.get("reason") or "no hay señal longitudinal suficiente").rstrip(".")
            individual_threshold_note = (
                "La piscina comparable supera el mínimo de muestras, pero los LT Individual no se publican "
                f"porque {reason.lower()}."
            )
    except Exception:
        individual_threshold_note = (
            "No fue posible consolidar LT Individual longitudinales para este informe. "
            "Los LT fisiológicos anclados siguen siendo válidos para lectura práctica."
        )

    sections = [
        {
            "key": "lactate_sampling",
            "title": "Tomas de lactato",
            "body": [
                f"Test incremental del {session.performed_at.date().isoformat()} con {len(stages)} etapas válidas entre {stages[0].load_label} y {stages[-1].load_label}.",
                f"Duración media por etapa: {_format_seconds(round(_mean([stage.duration_seconds for stage in stages]) or 0))}. Pico de lactato: {peak_lactate:.1f} mmol/L.",
                f"Referencia actual del informe: LT1 {_format_load(lt1_load, effective_discipline, athlete.weight)} y LT2 {_format_load(lt2_load, effective_discipline, athlete.weight)}.",
            ],
        },
        {
            "key": "training_zones",
            "title": "Zonas de entreno",
            "body": [
                "Las zonas se apoyan en LT1 y LT2 fisiológicos anclados a 2.0 y 4.0 mmol/L.",
                "Por debajo de LT1 construyes base; alrededor de LT2 desarrollas ritmo o potencia sostenible; por encima de LT2 el coste sube más rápido.",
                "Carga externa y frecuencia cardiaca deben leerse juntas, no como sistemas separados.",
            ],
        },
        {
            "key": "conclusions",
            "title": "Conclusiones",
            "body": [
                f"Lectura global: {profile_tag.lower()}.",
                _describe_threshold_structure(lt1_load, lt2_load, threshold_gap_ratio, effective_discipline)[0],
                _describe_limiting_factors(baseline_lactate, rise_after_lt1, threshold_gap_ratio)[0],
                (
                    "Fortaleza probable: capacidad de sostener trabajo aeróbico con una transición razonablemente ordenada hacia intensidades de umbral."
                    if profile_tag != "Perfil con sesgo glucolítico"
                    else "Fortaleza probable: capacidad de activar intensidades altas, aunque con margen claro de mejora en estabilidad aeróbica."
                ),
            ],
        },
        {
            "key": "future_plan",
            "title": "Plan a futuro",
            "body": [
                (
                    f"Objetivo competitivo actual: {target_goal}."
                    if target_goal
                    else "Falta un objetivo cargado en la pestaña de objetivos; conviene fijarlo para afinar la dirección del bloque."
                ),
                _future_shift_summary(profile_tag, effective_discipline, lt1_load, lt2_load, athlete.weight),
                (
                    f"Intención del bloque activo: {active_block.block_intent}."
                    if active_block and active_block.block_intent
                    else "El siguiente bloque debería fijar una sola prioridad fisiológica clara para que el próximo retest sea comparable."
                ),
                "Repetir una sesión ancla y un retest comparable en 3-6 meses para verificar si la curva se ha movido en la dirección buscada.",
            ],
        },
    ]

    thresholds = [
        {
            "name": "LT1 fisiológico",
            "anchor_mmol": 2.0,
            "metric_value": lt1_load,
            "metric_label": _format_load(lt1_load, effective_discipline, athlete.weight),
            "heart_rate_bpm": round(lt1_hr) if lt1_hr is not None else None,
            "interpretation": (
                "Anclaje fisiológico de trabajo estable construido sobre 2.0 mmol/L para definir el dominio aeróbico sostenible."
                if not lt1_is_approximate
                else "Anclaje fisiológico aproximado usando la etapa observada más cercana a 2.0 mmol/L."
            ),
        },
        {
            "name": "LT2 fisiológico",
            "anchor_mmol": 4.0,
            "metric_value": lt2_load,
            "metric_label": _format_load(lt2_load, effective_discipline, athlete.weight),
            "heart_rate_bpm": round(lt2_hr) if lt2_hr is not None else None,
            "interpretation": (
                "Anclaje fisiológico de alta exigencia construido sobre 4.0 mmol/L para trabajo de umbral y esfuerzos prolongados."
                if not lt2_is_approximate
                else "Anclaje fisiológico aproximado usando la etapa observada más cercana a 4.0 mmol/L."
            ),
        },
    ]

    zones = _build_zones(effective_discipline, lt1_load, lt2_load, lt1_hr, lt2_hr, athlete.weight)
    report = {
        "athlete_id": athlete.id,
        "athlete_name": athlete.name,
        "generated_on": datetime.now(timezone.utc),
        "discipline": effective_discipline,
        "power_source": session.power_source if effective_discipline == "ciclismo" else None,
        "profile_tag": profile_tag,
        "profile": {
            "full_name": athlete.name,
            "age": _compute_age(athlete.date_of_birth),
            "sex": athlete.sex,
            "weight_kg": athlete.weight,
            "discipline": effective_discipline,
            "performance_goal": target_goal,
            "target_competition": target_competition,
            "training_background": athlete.goal_category,
            "coach_notes": athlete.notes,
        },
        "test_summary": {
            "session_id": session.id,
            "performed_at": session.performed_at,
            "power_source": session.power_source,
            "stage_count": len(stages),
            "total_duration_seconds": sum(stage.duration_seconds for stage in stages),
            "average_stage_duration_seconds": round(_mean([stage.duration_seconds for stage in stages]) or 0),
            "peak_lactate_mmol": peak_lactate,
            "load_start_label": stages[0].load_label,
            "load_end_label": stages[-1].load_label,
        },
        "stages": [
            {
                "stage_number": stage.stage_number,
                "duration_seconds": stage.duration_seconds,
                "load_value": stage.load_value,
                "load_label": stage.load_label,
                "heart_rate_bpm": stage.heart_rate_bpm,
                "lactate_mmol": stage.lactate_mmol,
                "cadence": stage.cadence,
            }
            for stage in stages
        ],
        "thresholds": thresholds,
        "individual_thresholds": individual_thresholds,
        "individual_threshold_sample_count": individual_threshold_sample_count,
        "individual_threshold_min_samples": _REPORT_MIN_INDIVIDUAL_SAMPLES,
        "individual_threshold_note": individual_threshold_note,
        "zones": zones,
        "sections": sections,
        "limitations": limitations,
        "disclaimer": _scientific_disclaimer(),
        "final_coach_summary": [
            f"{profile_tag}.",
            f"LT1 en {_format_load(lt1_load, effective_discipline, athlete.weight)} y LT2 en {_format_load(lt2_load, effective_discipline, athlete.weight)}.",
            "Usar este informe como base de prescripción y comparación con futuros retests bajo protocolo similar.",
        ],
        "report_title": "Informe fisiológico aplicado",
        "report_subtitle": f"{athlete.name} · Test incremental de {_discipline_label(effective_discipline)}",
    }
    return report


def build_physiology_report_pdf(
    db: Session,
    athlete_id: int,
    discipline: Optional[str] = None,
    power_source: Optional[str] = None,
) -> tuple[bytes, str]:
    report = build_physiology_report_payload(db, athlete_id, discipline=discipline, power_source=power_source)
    filename = f"informe-fisiologico-{report['athlete_name'].lower().replace(' ', '-')}-{report['discipline']}.pdf"
    return _build_scientific_pdf(report), filename

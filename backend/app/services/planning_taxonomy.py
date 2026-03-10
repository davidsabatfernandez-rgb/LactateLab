from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable


@dataclass(frozen=True)
class CanonicalSessionType:
    key: str
    public_label: str
    energy_system_focus: str
    mesocycle_role: str
    block_type_hint: str
    description: str


@dataclass(frozen=True)
class CanonicalBlockType:
    key: str
    public_label: str
    purpose: str
    typical_structure: str
    olbrecht_rationale: str


@dataclass(frozen=True)
class SessionTaxonomyMatch:
    canonical_session_type: str
    public_label: str
    energy_system_focus: str
    mesocycle_role: str
    block_type_hint: str
    confidence: float
    matched_terms: list[str]
    rationale: str


SESSION_TAXONOMY: dict[str, CanonicalSessionType] = {
    "test_aerobic_profile": CanonicalSessionType(
        key="test_aerobic_profile",
        public_label="Test aeróbico de perfil",
        energy_system_focus="Assessment",
        mesocycle_role="decision_point",
        block_type_hint="testing_decision_block",
        description="Evalúa la capacidad aeróbica o el comportamiento del umbral para decidir el siguiente bloque.",
    ),
    "test_anaerobic_profile": CanonicalSessionType(
        key="test_anaerobic_profile",
        public_label="Test anaeróbico de perfil",
        energy_system_focus="Assessment",
        mesocycle_role="decision_point",
        block_type_hint="testing_decision_block",
        description="Evalúa capacidad glicolítica, torque o potencia anaeróbica para ajustar el equilibrio capacidad/power.",
    ),
    "technical_assessment": CanonicalSessionType(
        key="technical_assessment",
        public_label="Evaluación técnica",
        energy_system_focus="Technique",
        mesocycle_role="support",
        block_type_hint="technical_rebuild_block",
        description="Revisión de técnica o skill con intención diagnóstica, no de carga fisiológica principal.",
    ),
    "aerobic_capacity_easy": CanonicalSessionType(
        key="aerobic_capacity_easy",
        public_label="Capacidad aeróbica extensiva",
        energy_system_focus="Aerobic Capacity",
        mesocycle_role="capacity",
        block_type_hint="aerobic_capacity_block",
        description="Trabajo suave y sostenible para acumular volumen útil con bajo coste metabólico.",
    ),
    "lt1_extensive": CanonicalSessionType(
        key="lt1_extensive",
        public_label="Trabajo LT1 extensivo",
        energy_system_focus="Aerobic Capacity",
        mesocycle_role="capacity",
        block_type_hint="aerobic_capacity_block",
        description="Bloques extensivos en torno a LT1 para ampliar estabilidad subumbral y tolerancia de trabajo.",
    ),
    "lt2_extensive": CanonicalSessionType(
        key="lt2_extensive",
        public_label="Trabajo LT2",
        energy_system_focus="Aerobic Power",
        mesocycle_role="specific_build",
        block_type_hint="threshold_development_block",
        description="Bloques sostenidos o fraccionados cerca de LT2 para elevar la potencia/ritmo específico sostenible.",
    ),
    "vo2_power": CanonicalSessionType(
        key="vo2_power",
        public_label="Potencia aeróbica",
        energy_system_focus="Aerobic Power",
        mesocycle_role="power",
        block_type_hint="aerobic_power_block",
        description="Trabajo de VO2 o repeticiones intensas para empujar la potencia aeróbica y la utilización de oxígeno.",
    ),
    "anaerobic_capacity": CanonicalSessionType(
        key="anaerobic_capacity",
        public_label="Capacidad anaeróbica",
        energy_system_focus="Anaerobic Capacity",
        mesocycle_role="support",
        block_type_hint="glycolytic_support_block",
        description="Trabajo glicolítico o neuromuscular breve para modular la capacidad anaeróbica o el torque.",
    ),
    "strength_support": CanonicalSessionType(
        key="strength_support",
        public_label="Fuerza de soporte",
        energy_system_focus="Neuromuscular Support",
        mesocycle_role="support",
        block_type_hint="technical_rebuild_block",
        description="Fuerza general o específica para sostener la adaptación del bloque sin ser el estímulo metabólico principal.",
    ),
    "technique_skill": CanonicalSessionType(
        key="technique_skill",
        public_label="Técnica y skill",
        energy_system_focus="Technique",
        mesocycle_role="support",
        block_type_hint="technical_rebuild_block",
        description="Trabajo técnico para mejorar economía, mecánica y eficiencia antes de escalar carga.",
    ),
    "recovery_regeneration": CanonicalSessionType(
        key="recovery_regeneration",
        public_label="Recuperación y regeneración",
        energy_system_focus="Recovery",
        mesocycle_role="recovery",
        block_type_hint="recovery_consolidation_block",
        description="Sesión orientada a descargar fatiga y favorecer supercompensación.",
    ),
    "competition_specific": CanonicalSessionType(
        key="competition_specific",
        public_label="Trabajo específico de competición",
        energy_system_focus="Specific Performance",
        mesocycle_role="specific_build",
        block_type_hint="competition_specific_block",
        description="Sesión orientada al gesto o ritmo/potencia objetivo de la prueba, ya en fase específica.",
    ),
    "mixed_session": CanonicalSessionType(
        key="mixed_session",
        public_label="Sesión mixta",
        energy_system_focus="Mixed",
        mesocycle_role="mixed",
        block_type_hint="threshold_development_block",
        description="Sesión con más de un objetivo fisiológico relevante que debe leerse por estructura y bloque.",
    ),
    "general_endurance": CanonicalSessionType(
        key="general_endurance",
        public_label="Resistencia general",
        energy_system_focus="General Endurance",
        mesocycle_role="capacity",
        block_type_hint="aerobic_capacity_block",
        description="Sesión de fondo o continuidad sin una firma metabólica más específica claramente declarada.",
    ),
}


BLOCK_TAXONOMY: dict[str, CanonicalBlockType] = {
    "aerobic_capacity_block": CanonicalBlockType(
        key="aerobic_capacity_block",
        public_label="Bloque de capacidad aeróbica",
        purpose="Aumentar estabilidad subumbral, tolerancia de volumen y base sostenible.",
        typical_structure="2+1 o 3+1 según nivel y fatiga acumulada.",
        olbrecht_rationale="La capacidad suele desarrollarse durante más tiempo y sirve de base antes de apretar el trabajo específico.",
    ),
    "threshold_development_block": CanonicalBlockType(
        key="threshold_development_block",
        public_label="Bloque de desarrollo de umbral",
        purpose="Empujar LT1/LT2 en la disciplina objetivo sin perder control del coste fisiológico.",
        typical_structure="2+1 con sesiones comparables y progresión conservadora.",
        olbrecht_rationale="El umbral debe crecer sobre una base previa y seguir siendo medible mediante repetición y test.",
    ),
    "aerobic_power_block": CanonicalBlockType(
        key="aerobic_power_block",
        public_label="Bloque de potencia aeróbica",
        purpose="Mejorar la parte alta del sistema aeróbico y acercar la preparación a demandas más intensas.",
        typical_structure="1-2 semanas fuertes seguidas de descarga clara.",
        olbrecht_rationale="La fase power suele ser más corta y más próxima a la especificidad competitiva.",
    ),
    "glycolytic_support_block": CanonicalBlockType(
        key="glycolytic_support_block",
        public_label="Bloque de soporte anaeróbico",
        purpose="Modular capacidad glicolítica o torque sin convertirla en la identidad dominante del plan.",
        typical_structure="Inserciones breves dentro de bloques mayores.",
        olbrecht_rationale="Olbrecht no busca máximos absolutos indiscriminados, sino un nivel óptimo según prueba y perfil.",
    ),
    "technical_rebuild_block": CanonicalBlockType(
        key="technical_rebuild_block",
        public_label="Bloque técnico y de soporte",
        purpose="Corregir limitantes mecánicos, técnicos o de fuerza que frenan la expresión fisiológica.",
        typical_structure="Puede convivir con capacidad o abrir una fase correctiva corta.",
        olbrecht_rationale="La técnica y la disciplina limitante condicionan la utilidad real del trabajo metabólico.",
    ),
    "recovery_consolidation_block": CanonicalBlockType(
        key="recovery_consolidation_block",
        public_label="Bloque de recuperación y consolidación",
        purpose="Reducir fatiga para permitir supercompensación y releer el estado del atleta.",
        typical_structure="1 semana más ligera o microfase de descarga.",
        olbrecht_rationale="La adaptación emerge cuando la carga baja lo suficiente como para consolidar el trabajo previo.",
    ),
    "testing_decision_block": CanonicalBlockType(
        key="testing_decision_block",
        public_label="Bloque de test y decisión",
        purpose="Medir el perfil fisiológico antes de abrir o redirigir el siguiente mesociclo.",
        typical_structure="Test principal + recuperación + decisión de siguiente foco.",
        olbrecht_rationale="El plan no se construye por receta, sino por feedback fisiológico repetible.",
    ),
    "competition_specific_block": CanonicalBlockType(
        key="competition_specific_block",
        public_label="Bloque específico de competición",
        purpose="Transferir la base acumulada al ritmo/potencia/coste real de la prueba objetivo.",
        typical_structure="Más corto, más fino y más condicionado por la fecha objetivo.",
        olbrecht_rationale="La especificidad sube al acercarse la prueba, sin perder de vista el equilibrio entre sistemas.",
    ),
}


@dataclass(frozen=True)
class _Rule:
    session_key: str
    patterns: tuple[str, ...]
    confidence: float
    rationale: str


RULES: tuple[_Rule, ...] = (
    _Rule(
        session_key="technical_assessment",
        patterns=("tecnica.*test", "técnica.*test", "video", "viraje", "grabar", "assessment"),
        confidence=0.88,
        rationale="Se detecta una revisión técnica o skill con intención diagnóstica.",
    ),
    _Rule(
        session_key="test_anaerobic_profile",
        patterns=("glyc.profile", "glyco.cap", "glyc.cap", "test torque", "torque test", "glyc"),
        confidence=0.94,
        rationale="Se detecta un test glicolítico, de torque o anaeróbico.",
    ),
    _Rule(
        session_key="test_aerobic_profile",
        patterns=("aerobic.profile", "css test", "test lactato", "test carrera", "test bike", "incremental", "eval"),
        confidence=0.92,
        rationale="Se detecta un test orientado a perfilar el sistema aeróbico o el umbral.",
    ),
    _Rule(
        session_key="strength_support",
        patterns=("fuerza", "strength", "gym", "gimnasio", "pull ups", "box squat", "movilidad"),
        confidence=0.88,
        rationale="Se detecta un trabajo de fuerza o soporte general.",
    ),
    _Rule(
        session_key="recovery_regeneration",
        patterns=("rest day", "day off", "walk", "movilidad", "recovery", "regener"),
        confidence=0.76,
        rationale="Se detecta una sesión de descarga o regeneración.",
    ),
    _Rule(
        session_key="competition_specific",
        patterns=("half pace", "race pace", "5km pace", "transition", "t2:", "compet"),
        confidence=0.84,
        rationale="Se detecta una orientación clara a ritmo o situación específica de competición.",
    ),
    _Rule(
        session_key="vo2_power",
        patterns=("vo2", "30-30", "40''/30''", "20''/15''", "hill sprints", "hills vo2", "sit"),
        confidence=0.9,
        rationale="Se detecta trabajo de potencia aeróbica o repeticiones muy intensas.",
    ),
    _Rule(
        session_key="lt2_extensive",
        patterns=("lt2", "tempo", "threshold", "2 x 20", "3 x 2km", "1km lt2", "half pace"),
        confidence=0.88,
        rationale="Se detecta trabajo próximo al segundo umbral o tempo competitivo.",
    ),
    _Rule(
        session_key="lt1_extensive",
        patterns=("lt1", " d1", "ar ", "z2", "aerobic", "d2/lt1", "4 x 6' lt1"),
        confidence=0.84,
        rationale="Se detecta trabajo controlado extensivo en torno a LT1 o base aeróbica.",
    ),
    _Rule(
        session_key="anaerobic_capacity",
        patterns=("max", "parach", "neuro", "anaer", "hcss", "torque"),
        confidence=0.78,
        rationale="Se detecta componente neuromuscular o glicolítica relevante.",
    ),
    _Rule(
        session_key="technique_skill",
        patterns=("tecnica", "técnica", "drill", "kickboard", "snorkel", "pull", "skill"),
        confidence=0.8,
        rationale="Se detecta una sesión principalmente técnica.",
    ),
)


def _normalized_parts(*parts: str | None) -> str:
    joined = " ".join(part or "" for part in parts).lower()
    joined = joined.replace("_", " ")
    return re.sub(r"\s+", " ", joined).strip()


def infer_session_taxonomy(
    *,
    title: str | None = None,
    description: str | None = None,
    coach_comments: str | None = None,
    workout_type: str | None = None,
) -> SessionTaxonomyMatch:
    text = _normalized_parts(title, description, coach_comments, workout_type)
    matched_terms: list[str] = []
    matched_rules: list[_Rule] = []

    for rule in RULES:
        for pattern in rule.patterns:
            if pattern in text:
                matched_rules.append(rule)
                matched_terms.append(pattern)
                break

    if len(matched_rules) > 1:
        keys = {rule.session_key for rule in matched_rules}
        if {"lt1_extensive", "lt2_extensive"} & keys and {"vo2_power", "anaerobic_capacity"} & keys:
            session = SESSION_TAXONOMY["mixed_session"]
            return SessionTaxonomyMatch(
                canonical_session_type=session.key,
                public_label=session.public_label,
                energy_system_focus=session.energy_system_focus,
                mesocycle_role=session.mesocycle_role,
                block_type_hint=session.block_type_hint,
                confidence=0.74,
                matched_terms=matched_terms,
                rationale="La sesión mezcla dos o más objetivos fisiológicos principales y debe leerse en el contexto del bloque.",
            )

    if matched_rules:
        best_rule = matched_rules[0]
        session = SESSION_TAXONOMY[best_rule.session_key]
        return SessionTaxonomyMatch(
            canonical_session_type=session.key,
            public_label=session.public_label,
            energy_system_focus=session.energy_system_focus,
            mesocycle_role=session.mesocycle_role,
            block_type_hint=session.block_type_hint,
            confidence=best_rule.confidence,
            matched_terms=matched_terms,
            rationale=best_rule.rationale,
        )

    if workout_type in {"Run", "Bike", "Swim"}:
        session = SESSION_TAXONOMY["general_endurance"]
        return SessionTaxonomyMatch(
            canonical_session_type=session.key,
            public_label=session.public_label,
            energy_system_focus=session.energy_system_focus,
            mesocycle_role=session.mesocycle_role,
            block_type_hint=session.block_type_hint,
            confidence=0.52,
            matched_terms=[],
            rationale="No aparece una firma fisiológica clara; se clasifica como resistencia general por disciplina.",
        )

    session = SESSION_TAXONOMY["recovery_regeneration"]
    return SessionTaxonomyMatch(
        canonical_session_type=session.key,
        public_label=session.public_label,
        energy_system_focus=session.energy_system_focus,
        mesocycle_role=session.mesocycle_role,
        block_type_hint=session.block_type_hint,
        confidence=0.45,
        matched_terms=[],
        rationale="No hay suficiente señal específica; se usa una clasificación conservadora.",
    )


def session_taxonomy_catalog() -> list[CanonicalSessionType]:
    return list(SESSION_TAXONOMY.values())


def block_taxonomy_catalog() -> list[CanonicalBlockType]:
    return list(BLOCK_TAXONOMY.values())


def allowed_public_reference_types_for_discipline(discipline: str) -> tuple[str, ...]:
    if discipline == "ciclismo":
        return ("FTP", "VO2max")
    if discipline == "natación":
        return ("VO2max",)
    return ("5K", "10K", "HM", "Maratón", "VO2max")


def summarize_mesocycle_bias(session_types: Iterable[str]) -> str:
    session_type_set = set(session_types)
    if "test_aerobic_profile" in session_type_set or "test_anaerobic_profile" in session_type_set:
        return "Bloque con punto de decisión y testing integrado."
    if "lt2_extensive" in session_type_set or "vo2_power" in session_type_set:
        return "Bloque orientado a desarrollo específico y potencia aeróbica."
    if "lt1_extensive" in session_type_set or "aerobic_capacity_easy" in session_type_set:
        return "Bloque orientado a capacidad aeróbica y estabilidad subumbral."
    if "technical_assessment" in session_type_set or "technique_skill" in session_type_set:
        return "Bloque con fuerte componente técnico o correctivo."
    return "Bloque mixto todavía sin identidad dominante clara."

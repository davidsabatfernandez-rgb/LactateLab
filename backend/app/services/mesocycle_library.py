from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class PlanningFoundation:
    foundation_id: str
    title: str
    summary: str
    anchor: str


@dataclass(frozen=True)
class MesocycleTemplate:
    template_id: str
    discipline: str
    block_type: str
    public_label: str
    summary: str
    primary_focus: str
    secondary_focus: str
    typical_structure: str
    typical_duration_weeks: tuple[int, int]
    key_session_families: list[str]
    control_points: list[str]
    progression_rules: list[str]
    entry_checks: list[str]
    exit_checks: list[str]
    csv_rationale: str
    evidence_rationale: str


FOUNDATION_PILLARS: tuple[PlanningFoundation, ...] = (
    PlanningFoundation(
        foundation_id="coach_first",
        title="El entrenador decide primero",
        summary="El sistema no debe adivinar la debilidad principal del atleta: debe ayudarte a ordenar la decisión y validar si el bloque elegido tiene sentido.",
        anchor="Olbrecht · planificación sistemática + coach-led",
    ),
    PlanningFoundation(
        foundation_id="capacity_before_specificity",
        title="Capacidad antes que especificidad fina",
        summary="En el CSV y en la literatura aparecen fases largas de base/capacidad y fases más cortas de umbral, power y competición. No conviene vivir siempre en la zona media exigente.",
        anchor="CSV del entrenador · Olbrecht · Seiler · Issurin",
    ),
    PlanningFoundation(
        foundation_id="one_main_problem",
        title="Una limitante principal por bloque",
        summary="En triatlón y endurance complejo, el bloque funciona mejor si prioriza una disciplina o limitante clara. Lo accesorio acompaña, pero no manda.",
        anchor="Olbrecht en triatlón · disciplina débil primero",
    ),
    PlanningFoundation(
        foundation_id="supercompensation",
        title="La descarga revela la adaptación",
        summary="La recuperación no es relleno: sirve para dejar emerger la mejora y medirla sin confundirla con fatiga residual. La descarga forma parte del mesociclo.",
        anchor="Olbrecht · supercompensación · Mujika",
    ),
)


TEMPLATES: tuple[MesocycleTemplate, ...] = (
    MesocycleTemplate(
        template_id="run_aerobic_capacity",
        discipline="running",
        block_type="aerobic_capacity_block",
        public_label="Base aeróbica de carrera",
        summary="Bloque para consolidar trabajo extensivo, estabilidad subumbral y economía antes de apretar la especificidad.",
        primary_focus="Capacidad aeróbica",
        secondary_focus="Economía de carrera",
        typical_structure="2+1",
        typical_duration_weeks=(3, 4),
        key_session_families=["Rodajes extensivos", "LT1 extensivo", "Progresivos suaves"],
        control_points=["Sesión ancla LT1 repetible", "FC a ritmo subumbral", "Respuesta de lactato en trabajo extensivo"],
        progression_rules=["Subir minutos o densidad, no ambas a la vez", "Mantener una semana final de descarga clara"],
        entry_checks=["Bloque previo incompleto o sin base sólida", "Coste fisiológico alto en trabajo extensivo"],
        exit_checks=["Menor lactato a carga comparable", "Más estabilidad de FC y ritmo en LT1"],
        csv_rationale="En el CSV dominan rodajes AR/D1 y bloques LT1 como base recurrente antes de secuencias más específicas.",
        evidence_rationale="Encaja con una distribución mayoritariamente por debajo del umbral y con fases de capacidad más largas que las específicas.",
    ),
    MesocycleTemplate(
        template_id="run_threshold",
        discipline="running",
        block_type="threshold_development_block",
        public_label="Desarrollo LT1-LT2 de carrera",
        summary="Bloque para traducir la base previa en ritmo sostenible y tolerancia al trabajo de umbral.",
        primary_focus="LT1/LT2",
        secondary_focus="Ritmo de referencia",
        typical_structure="2+1",
        typical_duration_weeks=(3, 4),
        key_session_families=["Bloques LT1 largos", "Series LT2 tipo 1k-2k", "Sesiones mixtas LT1->LT2"],
        control_points=["Sesión comparable LT2", "Ritmo/FC a umbral", "Lactato a misma densidad"],
        progression_rules=["Progresar por tiempo útil o por densidad", "No acumular dos sesiones medias exigentes seguidas"],
        entry_checks=["Base aeróbica estable", "Último bloque de capacidad con respuesta favorable"],
        exit_checks=["Mayor ritmo sostenible a lactato comparable", "Mejor tolerancia al trabajo LT2"],
        csv_rationale="El CSV muestra secuencias muy repetidas de LT1 y LT2 en carrera como siguiente escalón tras la base.",
        evidence_rationale="Alineado con el uso de trabajo cercano al umbral para elevar el rendimiento específico sin perder control del coste fisiológico.",
    ),
    MesocycleTemplate(
        template_id="run_aerobic_power",
        discipline="running",
        block_type="aerobic_power_block",
        public_label="Potencia aeróbica de carrera",
        summary="Bloque corto para elevar la parte alta del sistema aeróbico una vez consolidada la base y el umbral.",
        primary_focus="VO2",
        secondary_focus="Mantener LT2",
        typical_structure="1+1 o 2+1",
        typical_duration_weeks=(2, 3),
        key_session_families=["VO2 tipo 30/30", "Repeticiones de 3'-4'", "Cuestas cortas con transferencia aeróbica"],
        control_points=["Sesión VO2 tolerable", "No deterioro del trabajo umbral", "Recuperación entre estímulos"],
        progression_rules=["Muy poca densidad acumulada", "Descarga obligatoria después del bloque"],
        entry_checks=["Base y LT2 razonablemente consolidados", "Objetivo no demasiado lejano"],
        exit_checks=["Mejor respuesta en sesiones altas", "Sin caída clara de LT2 o economía"],
        csv_rationale="En el CSV aparece como fase más corta y menos frecuente que LT1/LT2, normalmente en bloques mixtos o previos a afinado.",
        evidence_rationale="Coherente con la evidencia de bloques más breves de alta intensidad y con el uso estratégico, no continuo, del trabajo intenso.",
    ),
    MesocycleTemplate(
        template_id="run_competition_specific",
        discipline="running",
        block_type="competition_specific_block",
        public_label="Especificidad de carrera",
        summary="Bloque para acercar la carga al gesto, ritmo y coste de la prueba objetivo.",
        primary_focus="Especificidad competitiva",
        secondary_focus="Ritmo objetivo",
        typical_structure="2+1 o taper corto",
        typical_duration_weeks=(2, 4),
        key_session_families=["Half pace", "Ritmo de competición", "Sesión ancla de prueba"],
        control_points=["Ritmo objetivo con coste controlado", "Sensación de frescura", "Respuesta aguda vs crónica"],
        progression_rules=["Subir especificidad mientras baja el ruido de carga general", "No abrir más estímulos nuevos"],
        entry_checks=["Competición cercana", "Base y umbral ya construidos"],
        exit_checks=["Mejor transferencia al ritmo objetivo", "Llegar fresco al target"],
        csv_rationale="El CSV usa sesiones half pace y ritmos específicos como fase más fina y menos extensa.",
        evidence_rationale="Coherente con el afinado progresivo y con la reducción del volumen no específico al acercarse la competición.",
    ),
    MesocycleTemplate(
        template_id="bike_aerobic_capacity",
        discipline="ciclismo",
        block_type="aerobic_capacity_block",
        public_label="Base aeróbica ciclista",
        summary="Bloque para acumular tiempo útil, sostener cadencia estable y mejorar eficiencia subumbral.",
        primary_focus="Capacidad aeróbica",
        secondary_focus="Cadencia y economía",
        typical_structure="2+1 o 3+1",
        typical_duration_weeks=(3, 5),
        key_session_families=["AR largos", "D2 estable", "LT1 extensivo en bici"],
        control_points=["Sesión ancla en potencia controlada", "Lactato a potencia subumbral", "Cadencia sostenible"],
        progression_rules=["Subir tiempo útil antes que intensidad", "Definir si el bloque progresa por minutos o por W"],
        entry_checks=["Poca base reciente", "Necesidad de estabilidad a baja/mediana intensidad"],
        exit_checks=["Menor coste a potencia comparable", "Mayor tolerancia al tiempo útil"],
        csv_rationale="En bici el CSV está dominado por AR, D2 y trabajo LT1 como esqueleto de la preparación.",
        evidence_rationale="Alineado con una distribución donde predomina el trabajo bajo umbral y con bloques de base más largos que los específicos.",
    ),
    MesocycleTemplate(
        template_id="bike_threshold",
        discipline="ciclismo",
        block_type="threshold_development_block",
        public_label="Desarrollo FTP/LT2 ciclista",
        summary="Bloque para acercar la base aeróbica a potencia sostenible alta sin perder comparabilidad de lactato.",
        primary_focus="FTP/LT2",
        secondary_focus="Torque/cadencia útil",
        typical_structure="2+1",
        typical_duration_weeks=(3, 4),
        key_session_families=["3 x 20' LT1/LT2", "Half pace", "Bloques largos a potencia controlada"],
        control_points=["Potencia a 2-4 mmol", "FC a potencia objetivo", "Respuesta de torque/cadencia"],
        progression_rules=["Aumentar tiempo útil o densidad, no ambos", "Mantener una sesión claramente extensiva cada semana"],
        entry_checks=["Base ciclista consolidada", "Último bloque de base favorable"],
        exit_checks=["Más potencia sostenible con coste similar", "Mayor solidez en trabajo largo de umbral"],
        csv_rationale="El CSV muestra mucho 3 x 20', 3 x 30' y 4 x 20' como bloques centrales de bici.",
        evidence_rationale="Coherente con la lógica de trasladar capacidad a potencia sostenible antes de abrir fases más agresivas.",
    ),
    MesocycleTemplate(
        template_id="bike_aerobic_power",
        discipline="ciclismo",
        block_type="aerobic_power_block",
        public_label="Potencia aeróbica ciclista",
        summary="Bloque corto para empujar la parte alta del sistema aeróbico tras consolidar base y umbral.",
        primary_focus="Potencia aeróbica",
        secondary_focus="Mantener FTP",
        typical_structure="1+1 o 2+1",
        typical_duration_weeks=(2, 3),
        key_session_families=["VO2 en bici", "30/30", "Bloques tipo 3'-5'"],
        control_points=["Sesión alta tolerable", "No degradar LT2", "Recuperación suficiente entre días de carga"],
        progression_rules=["Muy baja cantidad total de sesiones duras", "Descarga clara al final"],
        entry_checks=["Trabajo de umbral ya consolidado", "Objetivo suficientemente próximo"],
        exit_checks=["Mejor respuesta en esfuerzos altos", "Sin deriva excesiva del coste lactato/FC"],
        csv_rationale="En bici aparece menos que LT1/LT2 y como complemento, no como bloque troncal permanente.",
        evidence_rationale="Consistente con el uso puntual de alta intensidad en bloques cortos dentro de la periodización de resistencia.",
    ),
    MesocycleTemplate(
        template_id="bike_competition_specific",
        discipline="ciclismo",
        block_type="competition_specific_block",
        public_label="Especificidad ciclista",
        summary="Bloque para transferir el trabajo previo a la potencia, cadencia y coste específicos de la prueba.",
        primary_focus="Especificidad competitiva",
        secondary_focus="Potencia de prueba",
        typical_structure="2+1 o taper corto",
        typical_duration_weeks=(2, 4),
        key_session_families=["Half pace", "Torque específico", "Sesiones ancla de competición"],
        control_points=["Potencia objetivo con lactato esperado", "Frescura neuromuscular", "Respuesta específica"],
        progression_rules=["Bajar ruido de carga no específica", "Evitar sumar demasiadas sesiones medias"],
        entry_checks=["Prueba próxima", "Base y umbral ya construidos"],
        exit_checks=["Transferencia clara a potencia objetivo", "Llegar con piernas frescas"],
        csv_rationale="Las sesiones específicas de bici son menos numerosas y aparecen cerca del trabajo half pace y torque.",
        evidence_rationale="Coherente con la reducción de volumen residual y el aumento de especificidad cerca de la competición.",
    ),
    MesocycleTemplate(
        template_id="swim_technical_rebuild",
        discipline="natación",
        block_type="technical_rebuild_block",
        public_label="Técnica y base acuática",
        summary="Bloque para resolver limitantes técnicas y construir continuidad aeróbica útil en el agua.",
        primary_focus="Técnica",
        secondary_focus="Base aeróbica",
        typical_structure="2+1",
        typical_duration_weeks=(3, 4),
        key_session_families=["Técnica", "Variado", "Aeróbico continuo con foco mecánico"],
        control_points=["Calidad técnica repetible", "Continuidad de brazada", "Economía percibida"],
        progression_rules=["Primero calidad técnica, luego carga", "No subir intensidad si el gesto se degrada"],
        entry_checks=["Disciplina débil o técnica limitante", "Poca continuidad acuática"],
        exit_checks=["Mayor estabilidad técnica", "Mejor continuidad en bloques aeróbicos"],
        csv_rationale="En natación el CSV mezcla mucha base general con sesiones técnicas y test específicos de skill/CSS.",
        evidence_rationale="En deportes técnicos la mejora mecánica condiciona la utilidad real del trabajo fisiológico.",
    ),
    MesocycleTemplate(
        template_id="swim_threshold",
        discipline="natación",
        block_type="threshold_development_block",
        public_label="Desarrollo umbral en agua",
        summary="Bloque para sostener más velocidad de forma económica una vez asentada la técnica.",
        primary_focus="LT1/LT2",
        secondary_focus="CSS",
        typical_structure="2+1",
        typical_duration_weeks=(3, 4),
        key_session_families=["CSS", "Bloques LT1/LT2", "Repeticiones medias con técnica estable"],
        control_points=["CSS repetible", "Lactato/control interno en series medias", "Caída mínima de técnica"],
        progression_rules=["Aumentar metros útiles o densidad", "Nunca sacrificar técnica por carga"],
        entry_checks=["Técnica suficientemente estable", "Base acuática previa"],
        exit_checks=["Mayor velocidad sostenible", "Mejor economía en repeticiones medias"],
        csv_rationale="El CSV incluye CSS TEST y bloques LT1/LT2 una vez establecida la continuidad básica.",
        evidence_rationale="Coherente con construir economía y capacidad antes de exigir más ritmo específico en natación.",
    ),
    MesocycleTemplate(
        template_id="all_recovery_consolidation",
        discipline="all",
        block_type="recovery_consolidation_block",
        public_label="Consolidación y descarga",
        summary="Bloque corto para absorber la carga previa, releer el estado fisiológico y preparar la siguiente fase.",
        primary_focus="Recuperación",
        secondary_focus="Relectura fisiológica",
        typical_structure="1 semana o microfase",
        typical_duration_weeks=(1, 2),
        key_session_families=["Sesiones regenerativas", "Técnica ligera", "Trabajo fácil comparable"],
        control_points=["Fatiga percibida", "Alineación agudo-crónico", "Coste de sesión ancla"],
        progression_rules=["Reducir densidad y tiempo útil", "No convertir la descarga en otra semana media"],
        entry_checks=["Bloque anterior muy denso", "Respuesta negativa o ambigua", "Necesidad de supercompensación"],
        exit_checks=["Más frescura", "Coste fisiológico más limpio", "Mejor disposición para siguiente bloque"],
        csv_rationale="El CSV intercala rest day, walk, recovery y semanas más suaves como soporte recurrente, no como accidente.",
        evidence_rationale="Coherente con taper/descarga y con la necesidad de supercompensación antes de seguir progresando.",
    ),
)


def select_mesocycle_template(discipline: str, block_type: str) -> Optional[MesocycleTemplate]:
    for template in TEMPLATES:
        if template.discipline == discipline and template.block_type == block_type:
            return template
    for template in TEMPLATES:
        if template.discipline == "all" and template.block_type == block_type:
            return template
    return None


def mesocycle_template_by_id(template_id: str | None) -> Optional[MesocycleTemplate]:
    if not template_id:
        return None
    for template in TEMPLATES:
        if template.template_id == template_id:
            return template
    return None


def templates_for_discipline(discipline: str) -> list[MesocycleTemplate]:
    discipline_templates = [template for template in TEMPLATES if template.discipline == discipline]
    shared_templates = [template for template in TEMPLATES if template.discipline == "all"]
    return [*discipline_templates, *shared_templates]

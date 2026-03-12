from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class EvidenceSource:
    source_id: str
    citation: str
    source_type: str
    athlete_level: str
    url: str
    key_takeaway: str


@dataclass(frozen=True)
class WorkoutTemplate:
    template_id: str
    discipline: str
    compatible_block_types: tuple[str, ...]
    session_role: str
    session_family: str
    public_label: str
    summary: str
    objective: str
    dose_guidance: str
    progression_axes: tuple[str, ...]
    control_points: tuple[str, ...]
    expected_adaptations: tuple[str, ...]
    cautions: tuple[str, ...]
    confidence: float
    evidence_ids: tuple[str, ...]
    csv_examples: tuple[str, ...]
    # ── Campos de compatibilidad y dosis (Patch 1) ────────────────────────────
    # Todos tienen default para mantener backward compatibility con los templates existentes.
    fatigue_cost: int = 3
    """Coste de fatiga de 1 (regenerativo) a 5 (VO2/intervalo duro). Guía la ordenación del micro."""
    min_spacing_days_after: int = 1
    """Días mínimos antes de otra sesión de fatigue_cost ≥ 4 tras esta sesión."""
    incompatible_adjacent_families: tuple[str, ...] = ()
    """Familias que NO deben ir en el día siguiente (day_offset +1)."""
    requires_fresh: bool = False
    """True si la sesión requiere estado descansado para producir el estímulo correcto."""
    dose_ladder: tuple[DoseStep, ...] = ()
    """Escalera discreta de dosis ordenada de menor a mayor carga.
    Vacío = la lógica de progresión usa csv_examples como hasta ahora."""
    calentamiento_min: int = 0
    """Minutos de calentamiento típico para esta familia de sesión."""
    calentamiento_template: str = ""
    """Descripción del calentamiento estándar (ej: '15' progresivo + 4 × rectas 15''')."""
    enfriamiento_min: int = 0
    """Minutos de enfriamiento típico."""
    enfriamiento_template: str = ""
    """Descripción del enfriamiento estándar (ej: '10' trote suave')."""
    coach_tips: tuple[str, ...] = ()
    """Consejos de ejecución del entrenador para esta familia de sesión."""


@dataclass(frozen=True)
class DraftSlot:
    day_offset: int
    template_id: str


@dataclass(frozen=True)
class WorkoutVariant:
    label: str
    format_type: str
    dose_example: str
    use_case: str


@dataclass(frozen=True)
class WorkoutVariable:
    name: str
    options: tuple[str, ...]


@dataclass(frozen=True)
class DoseStep:
    """Un peldaño discreto en la escalera de dosis de una familia de sesión.

    Campos:
        step                  – índice ordinal (1 = más suave).
        label                 – etiqueta corta mostrable ("3×8'").
        total_useful_time_min – minutos de trabajo real (sin calentamiento ni recuperaciones).
        rest_min              – pausa entre repeticiones en minutos.
        intensity_zone        – zona de intensidad objetivo ("LT1", "LT2", "VO2", "sub-LT1").
        readiness_required    – "any" | "medium" | "fresh" (estado mínimo del atleta).
        notes                 – nota breve para el entrenador.
    """

    step: int
    label: str
    total_useful_time_min: int
    rest_min: float
    intensity_zone: str
    readiness_required: str
    notes: str
    total_duration_min: int = 0
    """Duración total de la sesión incluyendo calentamiento y enfriamiento (ref: PlannedDuration del entrenador)."""


EVIDENCE_SOURCES: dict[str, EvidenceSource] = {
    "solli_2017_xc": EvidenceSource(
        source_id="solli_2017_xc",
        citation="Solli GS et al. The Training Characteristics of the World's Most Successful Female Cross-Country Skier. Front Physiol. 2017.",
        source_type="case_study",
        athlete_level="world_class",
        url="https://pubmed.ncbi.nlm.nih.gov/29326603/",
        key_takeaway="El volumen alto sigue estando dominado por baja intensidad, con periodización fina del trabajo moderado y alto.",
    ),
    "kenneally_2022_5000": EvidenceSource(
        source_id="kenneally_2022_5000",
        citation="Kenneally M et al. Training Characteristics of a World Championship 5000-m Finalist and Multiple Continental Record Holder Over the Year Leading to a World Championship Final. Int J Sports Physiol Perform. 2022.",
        source_type="case_study",
        athlete_level="world_class",
        url="https://pubmed.ncbi.nlm.nih.gov/34426556/",
        key_takeaway="En un fondista mundialista, la base anual siguió un patrón predominantemente piramidal, con mucha carga por debajo de LT1 y umbral dosificado.",
    ),
    "cejuela_2022_tri": EvidenceSource(
        source_id="cejuela_2022_tri",
        citation="Cejuela R, Sellés-Pérez S. Road to Tokyo 2020 Olympic Games: Training Characteristics of a World Class Male Triathlete. Front Physiol. 2022.",
        source_type="case_study",
        athlete_level="world_class",
        url="https://pubmed.ncbi.nlm.nih.gov/35514361/",
        key_takeaway="El macrocilco del triatleta mundial muestra mucha zona 1, poco umbral y una dosis contenida de trabajo por encima de VT2.",
    ),
    "ronnestad_2016_block": EvidenceSource(
        source_id="ronnestad_2016_block",
        citation="Rønnestad BR et al. 5-week block periodization increases aerobic power in elite cross-country skiers. Scand J Med Sci Sports. 2016.",
        source_type="randomized_controlled_trial",
        athlete_level="elite",
        url="https://pubmed.ncbi.nlm.nih.gov/25648345/",
        key_takeaway="Bloques concentrados de HIT pueden subir la potencia aeróbica si se usan como fase corta y bien contenida, no como estado permanente.",
    ),
    "tonnessen_2020_frequency": EvidenceSource(
        source_id="tonnessen_2020_frequency",
        citation="Tønnessen E et al. Influence of Interval Training Frequency on Time-Trial Performance in Elite Endurance Athletes. Int J Environ Res Public Health. 2020.",
        source_type="controlled_trial",
        athlete_level="elite",
        url="https://pubmed.ncbi.nlm.nih.gov/32375328/",
        key_takeaway="A igualdad de carga intensa total, menos sesiones pero más largas pueden ser útiles para concentrar estímulo y dejar más espacio de recuperación.",
    ),
    "pinot_2015_grand_tour": EvidenceSource(
        source_id="pinot_2015_grand_tour",
        citation="Pinot J, Grappe F. A six-year monitoring case study of a top-10 cycling Grand Tour finisher. J Sports Sci. 2015.",
        source_type="case_study",
        athlete_level="world_class",
        url="https://pubmed.ncbi.nlm.nih.gov/25357188/",
        key_takeaway="El ciclista de alto nivel progresa con más carga total y mejor potencia de 5 min a 4 h, no solo con sesiones duras aisladas.",
    ),
    "mateo_march_2025_wt": EvidenceSource(
        source_id="mateo_march_2025_wt",
        citation="Mateo-March M et al. Training Strategies of World Tour Cyclists: Periodization and Load Distribution Across a Competitive Season. Scand J Med Sci Sports. 2025.",
        source_type="observational_study",
        athlete_level="world_tour",
        url="https://pubmed.ncbi.nlm.nih.gov/41126460/",
        key_takeaway="En World Tour aparecen periodización, distribución de carga y separación clara entre base, trabajo específico y demandas de carrera.",
    ),
    "ronnestad_2022_strength": EvidenceSource(
        source_id="ronnestad_2022_strength",
        citation="Rønnestad BR. Case Report: Effects of Multiple Seasons of Heavy Strength Training on Muscle Strength and Cycling Sprint Power in Elite Cyclists. Front Sports Act Living. 2022.",
        source_type="case_report",
        athlete_level="elite",
        url="https://pubmed.ncbi.nlm.nih.gov/35548458/",
        key_takeaway="La fuerza pesada bien secuenciada puede mejorar fuerza y sprint en ciclistas sin destruir el trabajo de resistencia.",
    ),
    "pla_2019_swim": EvidenceSource(
        source_id="pla_2019_swim",
        citation="Pla R et al. Effects of a 6-Week Period of Polarized or Threshold Training on Performance and Fatigue in Elite Swimmers. Int J Sports Physiol Perform. 2019.",
        source_type="randomized_controlled_trial",
        athlete_level="elite_junior",
        url="https://pubmed.ncbi.nlm.nih.gov/30040002/",
        key_takeaway="En nadadores élite junior, un bloque polarizado de 6 semanas mejoró rendimiento con menos fatiga que un reparto más umbral.",
    ),
    "gonzalez_rave_2022_im": EvidenceSource(
        source_id="gonzalez_rave_2022_im",
        citation="González-Ravé JM et al. Training periodization for a world-class 400 meters individual medley swimmer. Biol Sport. 2022.",
        source_type="case_study",
        athlete_level="world_class",
        url="https://pubmed.ncbi.nlm.nih.gov/36247944/",
        key_takeaway="En natación élite, la temporada combina modelo piramidal en preparación general y bloques polarizados o umbral antes de competir.",
    ),
    "gonzalez_rave_2023_altitude": EvidenceSource(
        source_id="gonzalez_rave_2023_altitude",
        citation="González-Ravé JM et al. Periodization of altitude training: A collective case study of high-level swimmers. Front Physiol. 2023.",
        source_type="collective_case_study",
        athlete_level="international",
        url="https://pubmed.ncbi.nlm.nih.gov/36891142/",
        key_takeaway="Los nadadores internacionales encajan semanas de carga y adaptación con control técnico y fisiológico, no con simple acumulación lineal.",
    ),
    "storen_2011_running_strength": EvidenceSource(
        source_id="storen_2011_running_strength",
        citation="Støren Ø et al. Running stride peak forces inversely determine running economy in elite runners. J Strength Cond Res. 2011.",
        source_type="observational_study",
        athlete_level="elite",
        url="https://pubmed.ncbi.nlm.nih.gov/20093965/",
        key_takeaway="La fuerza máxima y la mecánica de zancada se relacionan con economía de carrera, útil para justificar fuerza de soporte y cuestas cortas.",
    ),
    "vikmoen_2021_tri_strength": EvidenceSource(
        source_id="vikmoen_2021_tri_strength",
        citation="Vikmoen O et al. Strength Training Improves Exercise Economy in Triathletes During a Simulated Triathlon. Int J Sports Physiol Perform. 2021.",
        source_type="controlled_trial",
        athlete_level="long_distance_triathletes",
        url="https://pubmed.ncbi.nlm.nih.gov/33571959/",
        key_takeaway="La fuerza concurrente progresiva puede mejorar economía de ciclismo y carrera sin penalizar masa corporal.",
    ),
}


WORKOUT_TEMPLATES: tuple[WorkoutTemplate, ...] = (
    WorkoutTemplate(
        template_id="run_lt1_extensive",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block", "threshold_development_block"),
        session_role="key",
        session_family="lt1_extensive",
        public_label="LT1 extensivo de carrera",
        summary="Bloques largos y comparables para acumular minutos útiles por debajo o alrededor de LT1.",
        objective="Construir estabilidad subumbral y durabilidad sin disparar el coste interno.",
        dose_guidance="3-5 x 8-15' LT1 o 30-50' continuo controlado.",
        progression_axes=("Subir tiempo útil", "Reducir descansos de forma marginal", "Mantener ritmo comparable"),
        control_points=("Lactato estable", "FC contenida", "Técnica de carrera limpia"),
        expected_adaptations=("Más minutos útiles a igual lactato", "Mejor economía subumbral"),
        cautions=("No subir minutos y densidad a la vez", "No convertirlo en sesión LT2 encubierta"),
        confidence=0.9,
        evidence_ids=("kenneally_2022_5000", "solli_2017_xc"),
        csv_examples=("3 x 10' LT1", "4 x 12' LT1", "40' continuo LT1", "2 x 20' LT1"),
        fatigue_cost=3,
        min_spacing_days_after=1,
        calentamiento_min=20,
        calentamiento_template="15' progresivo suave (6:00→5:20/km) + 4 × rectas 15'' con 1' andando.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote muy suave.",
        coach_tips=(
            "Controla FC a partir del min 3-4 de la 1ª serie para confirmar que estás en LT1.",
            "Si hay deriva cardíaca antes del min 4, la intensidad es demasiado alta.",
        ),
        dose_ladder=(
            DoseStep(1, "3×8'",     24, 1.5, "LT1", "any",    "Introducción; volumen moderado y margen técnico.", 57),
            DoseStep(2, "4×8'",     32, 1.5, "LT1", "any",    "Primera progresión de volumen.", 67),
            DoseStep(3, "3×10'",    30, 1.5, "LT1", "any",    "Repeticiones más largas; misma densidad.", 63),
            DoseStep(4, "4×10'",    40, 1.5, "LT1", "medium", "Primer peldaño de carga media; 40' útiles.", 75),
            DoseStep(5, "3×12'",    36, 2.0, "LT1", "medium", "Aumenta duración de repetición.", 70),
            DoseStep(6, "4×12'",    48, 2.0, "LT1", "medium", "Carga alta de intervalos LT1.", 84),
            DoseStep(7, "2×20'",    40, 3.0, "LT1", "medium", "Transición a bloques continuos.", 73),
            DoseStep(8, "40' cont", 40, 0.0, "LT1", "medium", "Continuo: máxima especificidad LT1.", 70),
        ),
    ),
    WorkoutTemplate(
        template_id="run_long_aerobic",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block", "competition_specific_block"),
        session_role="key",
        session_family="long_aerobic_durability",
        public_label="Tirada aeróbica con durabilidad",
        summary="Sesión larga para consolidar base y tolerancia mecánica.",
        objective="Extender tiempo en zona aeróbica sin deterioro técnico.",
        dose_guidance="75-120' suaves; opcional final controlado en específico.",
        progression_axes=("Subir duración", "Añadir final controlado", "Mejorar fueling"),
        control_points=("Deriva cardiaca", "Cadencia estable", "Sensación de margen"),
        expected_adaptations=("Mejor durabilidad", "Menor coste a igual ritmo"),
        cautions=("No usar cada semana como test", "Si la mecánica cae, recortar"),
        confidence=0.87,
        evidence_ids=("kenneally_2022_5000", "cejuela_2022_tri"),
        csv_examples=("90' E1", "105' E1", "90' + 20' final controlado", "120' aeróbicos"),
    ),
    WorkoutTemplate(
        template_id="run_lt2_cruise",
        discipline="running",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="lt2_cruise_intervals",
        public_label="Cruise intervals LT2",
        summary="Repeticiones medias para sostener ritmo próximo a LT2 sin convertir cada sesión en carrera.",
        objective="Traducir la base a ritmo sostenible y controlado.",
        dose_guidance="4-8 x 800m-1km LT2 o 3 x 2km LT2 con pausas cortas.",
        progression_axes=("Aumentar tiempo útil", "Afinar ritmo", "Reducir variabilidad entre repeticiones"),
        control_points=("Pacing estable", "Lactato esperado", "Última repetición técnicamente limpia"),
        expected_adaptations=("Mayor tolerancia al ritmo de umbral", "Mejor relación ritmo-FC"),
        cautions=("Evitar dos sesiones medias exigentes consecutivas", "No perseguir el reloj si el coste sube"),
        confidence=0.9,
        evidence_ids=("kenneally_2022_5000", "tonnessen_2020_frequency"),
        csv_examples=("6 x 1km LT2", "8 x 800 LT2", "3 x 2km LT2"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills", "vo2_30_30"),
        requires_fresh=True,
        calentamiento_min=20,
        calentamiento_template="15' progresivo (6:00→5:00/km) + 2 × 200m a ritmo LT2 c/1' andando.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote suave.",
        coach_tips=(
            "Las series deben ir siempre en progresión ligera — no empieces demasiado rápido.",
            "El ritmo de la última serie debería ser el mismo o ligeramente más vivo que la primera.",
        ),
        dose_ladder=(
            DoseStep(1, "4×800m",  16, 1.0, "LT2", "fresh", "Introducción; volumen bajo y lectura limpia del ritmo.", 49),
            DoseStep(2, "6×800m",  24, 1.0, "LT2", "fresh", "Añade dos repeticiones; primer volumen útil real.", 59),
            DoseStep(3, "4×1km",   20, 1.25,"LT2", "fresh", "Repeticiones más largas; mejor especificidad.", 54),
            DoseStep(4, "6×1km",   30, 1.25,"LT2", "fresh", "30' útiles a LT2; carga seria.", 66),
            DoseStep(5, "3×2km",   30, 1.5, "LT2", "fresh", "Más similar al tempo competitivo.", 63),
            DoseStep(6, "4×2km",   40, 2.0, "LT2", "fresh", "Carga alta; solo con robustez alta y señal positiva.", 76),
        ),
    ),
    WorkoutTemplate(
        template_id="run_vo2_hills",
        discipline="running",
        compatible_block_types=("aerobic_power_block",),
        session_role="key",
        session_family="vo2_hills",
        public_label="VO2 y cuestas cortas",
        summary="Bloque corto y denso para elevar techo aeróbico con soporte neuromuscular.",
        objective="Mejorar potencia aeróbica sin perder gesto de carrera.",
        dose_guidance="4-6 x 3-4' VO2 o 8-12 repeticiones cortas en cuesta con recuperación amplia.",
        progression_axes=("Añadir una repetición", "Subir tiempo útil", "Mantener calidad"),
        control_points=("Ritmo no colapsa", "Recuperación suficiente", "No se contamina el resto de la semana"),
        expected_adaptations=("Mejor uso de VO2", "Más reclutamiento neuromuscular"),
        cautions=("Bloque corto", "Obliga a descarga posterior", "No mezclar con demasiado LT2"),
        confidence=0.84,
        evidence_ids=("ronnestad_2016_block", "tonnessen_2020_frequency"),
        csv_examples=("5 x 3' VO2max", "6 x 4' VO2max", "10 x 45'' cuesta", "8 x 200m cuesta VO2max"),
        fatigue_cost=5,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_30_30"),
        requires_fresh=True,
        calentamiento_min=20,
        calentamiento_template="15' progresivo suave + 2 × 200m a ritmo VO2 c/2' andando.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote muy suave.",
        coach_tips=(
            "Mantén el ritmo constante en todas las repeticiones — no aceleres en las últimas.",
            "Si el ritmo cae >5'' en la última serie, el volumen es demasiado alto para hoy.",
        ),
        dose_ladder=(
            DoseStep(1, "4×3'",  12, 3.0, "VO2", "fresh", "Introducción; volumen bajo para asentar tolerancia al ritmo alto.", 51),
            DoseStep(2, "5×3'",  15, 3.0, "VO2", "fresh", "Añade una repetición; primer estímulo VO2 real.", 57),
            DoseStep(3, "6×3'",  18, 3.0, "VO2", "fresh", "Seis repeticiones; coste alto pero controlable.", 63),
            DoseStep(4, "4×4'",  16, 4.0, "VO2", "fresh", "Repeticiones más largas; mayor tiempo en VO2.", 58),
            DoseStep(5, "5×4'",  20, 4.0, "VO2", "fresh", "20' útiles; reservar para bloques con respuesta clara.", 66),
            DoseStep(6, "6×4'",  24, 4.0, "VO2", "fresh", "Carga máxima; solo atletas robustos con bloque bien respondido.", 74),
        ),
    ),
    WorkoutTemplate(
        template_id="run_economy_strides",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block", "technical_rebuild_block", "recovery_consolidation_block"),
        session_role="support",
        session_family="economy_strides",
        public_label="Economía, técnica y strides",
        summary="Sesión de soporte para mejorar mecánica y elasticidad sin gran coste metabólico.",
        objective="Mejorar economía y calidad del gesto.",
        dose_guidance="30-50' suaves + 4-8 strides o cuestas cortas muy controladas.",
        progression_axes=("Mejorar calidad técnica", "Añadir pocas repeticiones", "Reducir rigidez innecesaria"),
        control_points=("Sensación de frescura", "Apoyo limpio", "Sin residuo de fatiga al día siguiente"),
        expected_adaptations=("Mejor economía de carrera", "Mejor coordinación"),
        cautions=("No hacer del soporte la sesión dura", "Evitar fatiga excéntrica cerca de días clave"),
        confidence=0.82,
        evidence_ids=("storen_2011_running_strength",),
        csv_examples=("7km E + 6 x strides", "8km E + 5 x strides"),
        fatigue_cost=2,
        min_spacing_days_after=0,
    ),
    WorkoutTemplate(
        template_id="run_specific_durability",
        discipline="running",
        compatible_block_types=("competition_specific_block",),
        session_role="key",
        session_family="specific_durability",
        public_label="Durabilidad específica de carrera",
        summary="Sesión que acerca ritmo y fatiga al contexto competitivo, sin vaciar al atleta.",
        objective="Transferir LT1/LT2 al ritmo objetivo y a la parte final de la prueba.",
        dose_guidance="Bloques a ritmo de competición o final progresivo dentro de tirada controlada.",
        progression_axes=("Acercar ritmo", "Ajustar tiempo en ritmo objetivo", "Practicar nutrición"),
        control_points=("Coste fisiológico razonable", "Ritmo objetivo sostenible", "Fueling bien tolerado"),
        expected_adaptations=("Más durabilidad específica", "Mejor economía al ritmo objetivo"),
        cautions=("Si el target está lejos, no abusar", "No duplicar con otra sesión muy específica"),
        confidence=0.86,
        evidence_ids=("kenneally_2022_5000", "cejuela_2022_tri"),
        csv_examples=("90' con 25' final a ritmo objetivo", "3 x 4km ritmo maratón", "70' progresivo final específico"),
    ),
    WorkoutTemplate(
        template_id="run_lt0_recovery",
        discipline="running",
        compatible_block_types=("recovery_consolidation_block", "aerobic_capacity_block"),
        session_role="recovery",
        session_family="lt0_recovery",
        public_label="Rodaje LT0 / regenerativo",
        summary="Rodaje muy suave para descargar, mantener gesto y llegar limpio a la siguiente sesión útil.",
        objective="Bajar fatiga sin perder continuidad de carrera.",
        dose_guidance="30-55' suaves, opcional con 4 progresivos muy cortos si hay buena frescura.",
        progression_axes=("No progresar por intensidad", "Ajustar duración según fatiga", "Mejorar sensación final"),
        control_points=("RPE baja", "Sin tensión muscular creciente", "Respiración cómoda"),
        expected_adaptations=("Menor fatiga residual", "Más disposición para la siguiente carga"),
        cautions=("No convertirlo en rodaje medio", "Si hay pesadez real, recortar"),
        confidence=0.88,
        evidence_ids=("kenneally_2022_5000", "cejuela_2022_tri"),
        csv_examples=("35' LT0", "45' LT0", "50' LT0 + 4 progresivos"),
        fatigue_cost=1,
        min_spacing_days_after=0,
    ),
    WorkoutTemplate(
        template_id="run_progressive_aerobic",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block", "competition_specific_block"),
        session_role="key",
        session_family="progressive_aerobic",
        public_label="Rodaje progresivo aeróbico",
        summary="Sesión progresiva para mejorar control interno y economía sin entrar pronto en trabajo duro.",
        objective="Construir durabilidad y control de ritmo dentro del dominio aeróbico.",
        dose_guidance="40-75' progresivos, cerrando algo más vivo pero siempre con margen.",
        progression_axes=("Extender minutos finales controlados", "Suavizar la deriva cardiaca", "Mejorar sensación de control"),
        control_points=("Primer tercio fácil", "Final fluido", "Sin cierre agresivo"),
        expected_adaptations=("Más economía y durabilidad aeróbica", "Mejor transición hacia ritmos específicos"),
        cautions=("No usarlo como test semanal", "Si deriva demasiado, volver a rodaje uniforme"),
        confidence=0.84,
        evidence_ids=("kenneally_2022_5000", "solli_2017_xc"),
        csv_examples=("50' progresivo E1->E2", "60' progresivo controlado", "75' progresivo aeróbico"),
    ),
    WorkoutTemplate(
        template_id="run_threshold_continuous",
        discipline="running",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="threshold_continuous",
        public_label="Tempo continuo controlado",
        summary="Bloque continuo sostenido para consolidar ritmo de umbral sin depender solo de repeticiones cortadas.",
        objective="Sostener más tiempo cerca del umbral con coste estable.",
        dose_guidance="20-40' continuos controlados o 2 bloques largos con pausa mínima.",
        progression_axes=("Subir tiempo continuo", "Estabilizar ritmo", "Reducir variabilidad interna"),
        control_points=("Ritmo constante", "FC sin dispararse", "Final sólido pero no agónico"),
        expected_adaptations=("Mayor tolerancia al trabajo continuo de umbral", "Ritmo sostenible más robusto"),
        cautions=("No meterlo pegado a otra sesión LT2", "Si el lactato o RPE se escapan, fraccionar"),
        confidence=0.86,
        evidence_ids=("kenneally_2022_5000", "tonnessen_2020_frequency"),
        csv_examples=("20' LT2", "2 x 15' LT2", "30' LT2 continuo"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_cruise_intervals", "vo2_hills", "vo2_30_30"),
        requires_fresh=True,
        calentamiento_min=15,
        calentamiento_template="15' progresivo suave.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote muy suave.",
        coach_tips=(
            "Busca un ritmo que puedas sostener de principio a fin — si arrancas demasiado rápido, acabarás sufriendo.",
            "El ritmo debe sentirse 'difícil pero controlable', nunca al límite.",
        ),
        dose_ladder=(
            DoseStep(1, "20' cont",  20, 0.0, "LT2", "fresh", "Bloque único continuo; el más repetible y comparable.", 45),
            DoseStep(2, "2×12'",     24, 2.0, "LT2", "fresh", "Fraccionado; permite releer el coste a mitad de sesión.", 52),
            DoseStep(3, "25' cont",  25, 0.0, "LT2", "fresh", "Extensión del continuo; pequeño progreso real.", 50),
            DoseStep(4, "30' cont",  30, 0.0, "LT2", "fresh", "30' sostenidos; referencia clásica de umbral.", 55),
            DoseStep(5, "2×18'",     36, 2.0, "LT2", "fresh", "Fraccionado largo; útil si el continuo es difícil.", 63),
            DoseStep(6, "40' cont",  40, 0.0, "LT2", "fresh", "Carga máxima de tempo continuo; solo con robustez alta.", 65),
        ),
    ),
    WorkoutTemplate(
        template_id="run_hill_sprints",
        discipline="running",
        compatible_block_types=("technical_rebuild_block", "aerobic_power_block", "competition_specific_block"),
        session_role="support",
        session_family="hill_sprints",
        public_label="Cuestas cortas y reactividad",
        summary="Apoyo neuromuscular para mejorar fuerza específica y economía de apoyo con poca carga metabólica total.",
        objective="Activar sin distorsionar la identidad principal del bloque.",
        dose_guidance="5-10 x 8-12'' cuestas o sprints submáximos con recuperación completa.",
        progression_axes=("Añadir pocas repeticiones", "Mejorar calidad de apoyo", "Mantener frescura"),
        control_points=("Máxima calidad", "Recuperación completa", "Sin fatiga residual significativa"),
        expected_adaptations=("Más reactividad", "Mejor economía y rigidez útil"),
        cautions=("No convertirlo en sesión láctica", "Evitar si hay carga muscular alta"),
        confidence=0.8,
        evidence_ids=("storen_2011_running_strength", "ronnestad_2016_block"),
        csv_examples=("6 x 10'' cuesta", "8 x 10'' cuesta", "10 x 8'' sprint en cuesta"),
    ),
    WorkoutTemplate(
        template_id="run_specific_pace_reps",
        discipline="running",
        compatible_block_types=("competition_specific_block",),
        session_role="key",
        session_family="specific_pace_reps",
        public_label="Repeticiones a ritmo objetivo",
        summary="Sesión específica para fijar ritmo competitivo con pausas breves y lectura limpia del coste.",
        objective="Acercar economía y tolerancia al ritmo de carrera o segmento objetivo.",
        dose_guidance="2-5 bloques largos a ritmo objetivo con recuperación corta o trote controlado.",
        progression_axes=("Acercar el ritmo", "Aumentar el tiempo total a ritmo objetivo", "Mejorar fueling y control"),
        control_points=("Regularidad", "Coste interno acorde", "Último bloque aún funcional"),
        expected_adaptations=("Más transferencia al ritmo de competición", "Mayor confianza en el pacing"),
        cautions=("Reservarlo para fases específicas", "No perseguir el ritmo si la base aún no lo sostiene"),
        confidence=0.87,
        evidence_ids=("cejuela_2022_tri", "kenneally_2022_5000"),
        csv_examples=("3 x 3km ritmo media maratón", "5 x 2km ritmo 10k", "2 x 5km ritmo maratón"),
    ),
    WorkoutTemplate(
        template_id="run_e2_steady",
        discipline="running",
        # E2 = zona entre LT1 y LT2 — eso es THR/transición, NO AEC (Olbrecht: AEC es sub-LT1)
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="support",
        session_family="e2_steady",
        public_label="Aeróbico sostenido E2",
        summary="Rodaje sostenido en zona E2 (entre LT1 y LT2), útil como soporte en semanas de umbral.",
        objective="Aumentar tiempo útil en zona aeróbica alta con control interno.",
        dose_guidance="45-75' sostenidos en E2 o aeróbico medio, sin llegar a umbral.",
        progression_axes=("Subir minutos útiles", "Mejorar estabilidad del ritmo", "Reducir deriva cardiaca"),
        control_points=("RPE moderada", "Ritmo constante", "Final controlado"),
        expected_adaptations=("Más soporte del trabajo de umbral", "Mejor economía aeróbica alta"),
        cautions=("No sustituir por costumbre el LT1 extensivo", "Si deriva demasiado, bajar a E1"),
        confidence=0.83,
        evidence_ids=("kenneally_2022_5000", "solli_2017_xc"),
        csv_examples=("50' E2", "60' E2", "75' E2"),
    ),
    WorkoutTemplate(
        template_id="run_lt1_lt2_mix",
        discipline="running",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="lt1_lt2_mix",
        public_label="Mixta LT1-LT2",
        summary="Sesión escalonada para mover al atleta entre dominios fisiológicos cercanos sin romper la continuidad.",
        objective="Conectar base y umbral en una misma sesión con control de densidad.",
        dose_guidance="Bloques mixtos LT1-LT2 tipo 3'-3'-2' o secuencias progresivas comparables.",
        progression_axes=("Aumentar tiempo total del bloque", "Mejorar transición entre ritmos", "Estabilizar el coste"),
        control_points=("Cambios limpios", "Sin irse demasiado arriba en LT2", "Recuperación suficiente"),
        expected_adaptations=("Más tolerancia alrededor del umbral", "Mejor control de cambios de ritmo"),
        cautions=("No usar como cajón desastre cada semana",),
        confidence=0.84,
        evidence_ids=("kenneally_2022_5000", "tonnessen_2020_frequency"),
        csv_examples=("4 x (4' LT1 + 4' LT2)", "3 x (8' LT1 + 5' LT2)", "2 x 20' progresivo LT1->LT2"),
    ),
    WorkoutTemplate(
        template_id="run_vo2_30_30",
        discipline="running",
        compatible_block_types=("aerobic_power_block",),
        session_role="key",
        session_family="vo2_30_30",
        public_label="VO2 30-30 en carrera",
        summary="Repeticiones cortas para acumular trabajo intenso con menor rigidez de ritmo que un intervalo largo.",
        objective="Elevar potencia aeróbica manteniendo economía y control técnico.",
        dose_guidance="1-2 bloques de 10-15 repeticiones 30''/30'' o formatos cercanos.",
        progression_axes=("Añadir repeticiones", "Añadir un segundo bloque", "Mantener calidad en las últimas"),
        control_points=("Ritmo vivo pero controlado", "Últimas repeticiones útiles", "Sin colapso técnico"),
        expected_adaptations=("Más techo aeróbico", "Mejor tolerancia al trabajo fraccionado"),
        cautions=("Bloque corto y denso: descargar después",),
        confidence=0.84,
        evidence_ids=("ronnestad_2016_block", "tonnessen_2020_frequency"),
        csv_examples=("2 x 10 x 30''/30'' VO2", "15 x 30''/30'' VO2", "12 x 40''/20'' VO2"),
        fatigue_cost=5,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills"),
        requires_fresh=True,
    ),
    WorkoutTemplate(
        template_id="run_subthreshold_3min",
        discipline="running",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="subthreshold_3min",
        public_label="Subthreshold 3-min reps",
        summary="Formato de repeticiones medias para sostener ritmo alto controlado sin entrar en acidosis prematura.",
        objective="Acumular trabajo específico de umbral con buena repetibilidad.",
        dose_guidance="6-10 x 3' subthreshold o LT2 bajo con pausa corta.",
        progression_axes=("Añadir repeticiones", "Afinar ritmo", "Reducir oscilaciones"),
        control_points=("Ritmo uniforme", "Coste progresivo razonable", "Última repetición útil"),
        expected_adaptations=("Más consistencia en el ritmo de umbral", "Menor coste por repetición"),
        cautions=("No usar si el atleta aún no tolera trabajo medio",),
        confidence=0.83,
        evidence_ids=("kenneally_2022_5000", "cejuela_2022_tri"),
        csv_examples=("8 x 3' LT2 bajo", "10 x 3' subthreshold", "2 x 6 x 3' LT2 bajo"),
    ),
    WorkoutTemplate(
        template_id="run_brick_transition",
        discipline="running",
        compatible_block_types=("competition_specific_block", "threshold_development_block"),
        session_role="support",
        session_family="brick_transition",
        public_label="Carrera de transición",
        summary="Carrera tras la bici para mejorar la transferencia mecánica y metabólica al gesto de T2.",
        objective="Reducir el desajuste entre bici y carrera en fases específicas.",
        dose_guidance="20-60' tras bici previa, desde rodaje controlado hasta bloques a ritmo objetivo según fase.",
        progression_axes=("Aumentar el tiempo útil tras la bici", "Acercar ritmo objetivo", "Mejorar sensaciones de salida"),
        control_points=("Primeros minutos controlados", "Sin vaciar en exceso", "Buena transición técnica"),
        expected_adaptations=("Mejor tolerancia a la T2", "Más transferencia competitiva"),
        cautions=("No usar demasiado lejos del objetivo", "No forzar si la bici ya dejó mucha fatiga"),
        confidence=0.85,
        evidence_ids=("cejuela_2022_tri",),
        csv_examples=("T2: 20' E2", "T2: 30' progresivo a ritmo objetivo", "T2: 15' suaves + 10' ritmo 10k"),
    ),
    WorkoutTemplate(
        template_id="run_hill_threshold_combo",
        discipline="running",
        compatible_block_types=("aerobic_power_block", "technical_rebuild_block"),
        session_role="support",
        session_family="hill_threshold_combo",
        public_label="Cuestas cortas + bloque aeróbico",
        summary="Combinación de reactividad y control aeróbico para mejorar fuerza útil sin perder lectura del bloque.",
        objective="Aportar fuerza específica y economía de carrera.",
        dose_guidance="Cuestas cortas submáximas seguidas de bloque aeróbico controlado.",
        progression_axes=("Mejorar calidad de las cuestas", "Añadir pocas repeticiones", "Mantener bloque aeróbico limpio"),
        control_points=("Cuestas de calidad", "Sin fatiga láctica alta", "Bloque posterior estable"),
        expected_adaptations=("Más economía y rigidez útil", "Mejor fuerza específica"),
        cautions=("No juntar con otra sesión muy neuromuscular",),
        confidence=0.8,
        evidence_ids=("storen_2011_running_strength", "ronnestad_2016_block"),
        csv_examples=("8 x 10'' cuesta + 20' LT1", "6 x 12'' cuesta + 25' E2", "10 x 8'' cuesta + 3 x 8' LT1"),
    ),
    WorkoutTemplate(
        template_id="run_lt2_short_reps",
        discipline="running",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="lt2_short_reps",
        public_label="LT2 repeticiones cortas",
        summary="Repeticiones cronometradas de 3' a ritmo LT2. Más fáciles de regular que las de distancia; buenas para introducir LT2 o variar el estímulo.",
        objective="Desarrollar tolerancia al ritmo de umbral con pacing sencillo y alta repetibilidad.",
        dose_guidance="6-10 × 3' LT2 con 1' de trote suave entre series.",
        progression_axes=("Añadir repeticiones", "Reducir marginalmente el descanso", "Afinar el ritmo"),
        control_points=("Ritmo estable en todas las repeticiones", "No disparar el ritmo en las primeras", "Última repetición útil"),
        expected_adaptations=("Mayor tolerancia al ritmo LT2", "Mejor control de pacing"),
        cautions=("No empezar demasiado rápido — el ritmo de la última debe ser igual que el de la primera",),
        confidence=0.87,
        evidence_ids=("kenneally_2022_5000", "tonnessen_2020_frequency"),
        csv_examples=("6 x 3' LT2 rec 1'", "9 x 3' LT2 rec 1'", "10 x 3' LT2 rec 1'"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills"),
        requires_fresh=True,
        calentamiento_min=20,
        calentamiento_template="15' progresivo suave + 2 × 200m D:1' andando.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote suave.",
        coach_tips=(
            "El ritmo de las 3' debe ser el mismo que harías en repeticiones de 1km — no más rápido.",
            "La recuperación de 1' es activa (trote suave), no parada.",
        ),
        dose_ladder=(
            DoseStep(1, "6×3'",     18, 1.0, "LT2", "fresh", "Introducción al formato; densidad baja.", 53),
            DoseStep(2, "8×3'",     24, 1.0, "LT2", "fresh", "Primer volumen real de LT2 corto.", 61),
            DoseStep(3, "9×3'",     27, 1.0, "LT2", "fresh", "Clásico de Nacho; buena relación densidad/calidad.", 65),
            DoseStep(4, "10×3'",    30, 1.0, "LT2", "fresh", "Carga alta con formato de máxima repetibilidad.", 69),
            DoseStep(5, "2×(6×3')", 36, 2.0, "LT2", "fresh", "Doble bloque; pausa de 2' entre bloques.", 78),
        ),
    ),
    WorkoutTemplate(
        template_id="run_escalated_intervals",
        discipline="running",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="escalated_intervals",
        public_label="Intervalos escalonados LT1→LT2",
        summary="Cada repetición escala dentro de sí misma: empieza en LT1, sube a LT2 y termina por encima. Formato característico de Nacho.",
        objective="Aprender a gestionar cambios de intensidad y desarrollar tolerancia en toda la zona de umbral.",
        dose_guidance="3-5 × (3' LT1 + 3' LT2 + 2' LT2b) con 1'30 de recuperación.",
        progression_axes=("Añadir una repetición", "Añadir la sección LT2b dentro de cada rep", "Afinar las transiciones"),
        control_points=("Transiciones limpias dentro de cada rep", "No disparar el LT2b", "Última repetición técnicamente correcta"),
        expected_adaptations=("Mejor gestión de cambios de ritmo", "Mayor tolerancia alrededor del umbral"),
        cautions=("El LT2b es solo un toque — si se dispara demasiado, la sesión pierde sentido", "Practica respiración nasal en la sección LT1"),
        confidence=0.85,
        evidence_ids=("kenneally_2022_5000", "cejuela_2022_tri"),
        csv_examples=("3 x (3'LT1+3'LT2)", "4 x (3'LT1+3'LT2)", "5 x (3'LT1+3'LT2+2'LT2b)"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills"),
        requires_fresh=True,
        calentamiento_min=20,
        calentamiento_template="15' progresivo suave + 4 × 15'' rectas.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote suave.",
        coach_tips=(
            "LT1 = el ritmo que puedes mantener 40 min cómodamente. LT2 = el que sostendrías 20-30 min al límite.",
            "Practica respiración nasal durante la sección LT1 para asegurar que la intensidad es correcta.",
        ),
        dose_ladder=(
            DoseStep(1, "3×(3'LT1+3'LT2)",         18, 1.5, "LT1→LT2",  "fresh", "Introducción sin sección LT2b.", 51),
            DoseStep(2, "4×(3'LT1+3'LT2)",         24, 1.5, "LT1→LT2",  "fresh", "Primer volumen útil del formato.", 59),
            DoseStep(3, "4×(3'LT1+3'LT2+2'LT2b)",  32, 1.5, "LT1→LT2b", "fresh", "Añade la sección de remate — carga real.", 67),
            DoseStep(4, "5×(3'LT1+3'LT2+2'LT2b)",  40, 1.5, "LT1→LT2b", "fresh", "Carga máxima del formato; reservar para bloque respondido.", 76),
        ),
    ),
    # ── Nuevas familias extraídas del CSV de Nacho (2026-03-10) ──────────────
    WorkoutTemplate(
        template_id="run_lt1_long_reps",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block", "threshold_development_block"),
        session_role="key",
        session_family="lt1_long_reps",
        public_label="LT1 repeticiones largas",
        summary="Repeticiones de 2-3km a ritmo LT1 para construir tolerancia específica sin entrar en zona LT2.",
        objective="Desarrollar capacidad aeróbica sostenida en bloques de esfuerzo realistas.",
        dose_guidance="3-4 x 2-3km LT1 con descanso de 500m suave entre series.",
        progression_axes=("Aumentar la distancia de cada repetición", "Añadir una repetición", "Reducir el descanso marginalmente"),
        control_points=("Ritmo estable en todas las repeticiones", "FC bajo umbral en la última", "Técnica limpia al final"),
        expected_adaptations=("Más tolerancia al ritmo LT1 sostenido", "Mejor economía en esfuerzos prolongados"),
        cautions=("No subir distancia y repeticiones a la vez", "El descanso de 500m suave es parte de la sesión"),
        confidence=0.88,
        evidence_ids=("kenneally_2022_5000", "cejuela_2022_tri"),
        csv_examples=("3 x 2km LT1 D:500m", "4 x 2km LT1 D:500m", "3 x 3km LT1 D:500m", "4 x 3km LT1 D:500m"),
        fatigue_cost=3,
        min_spacing_days_after=1,
        calentamiento_min=15,
        calentamiento_template="15' progresivo suave.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote suave.",
        coach_tips=(
            "El descanso entre repeticiones es 500m a ritmo 5:45-6:00/km — no te pares.",
            "Mete nutrición si la sesión supera los 70 minutos.",
        ),
        dose_ladder=(
            DoseStep(1, "3×2km",  30, 2.5, "LT1", "any",    "Introducción; repeticiones cortas con margen.", 62),
            DoseStep(2, "4×2km",  40, 2.5, "LT1", "medium", "Carga media; primer volumen real de LT1 largo.", 75),
            DoseStep(3, "3×3km",  45, 3.0, "LT1", "medium", "Repeticiones más largas; mayor especificidad.", 78),
            DoseStep(4, "4×3km",  60, 3.0, "LT1", "medium", "Carga alta; reservar para bloques bien respondidos.", 95),
        ),
    ),
    WorkoutTemplate(
        template_id="run_subthreshold_reps",
        discipline="running",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="subthreshold_reps",
        public_label="SUB-T running (zona entre LT1 y LT2)",
        summary="Repeticiones en la zona justo por encima de LT1 pero sin llegar a LT2. Ritmo sostenible pero exigente.",
        objective="Elevar el techo aeróbico superior sin el coste de una sesión LT2 completa.",
        dose_guidance="3-4 x 6-12' SUB-T con 1-1.5' de trote suave entre series.",
        progression_axes=("Alargar las repeticiones", "Añadir una repetición", "Afinar el ritmo"),
        control_points=("Ritmo constante en todas las repeticiones", "FC estable", "Sensación de 'difícil pero controlable'"),
        expected_adaptations=("Mejor tolerancia entre LT1 y LT2", "Ritmo sostenible elevado"),
        cautions=("No convertirlo en LT2 — el ritmo debe ser mantenible sin esfuerzo máximo", "Control de lactato recomendado"),
        confidence=0.87,
        evidence_ids=("kenneally_2022_5000", "tonnessen_2020_frequency"),
        csv_examples=("3 x 6' SUB-T rec 1'", "4 x 6' SUB-T rec 1'", "2 x 12' SUB-T rec 1'30", "3 x 12' SUB-T rec 1'30"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills"),
        requires_fresh=True,
        calentamiento_min=20,
        calentamiento_template="15' progresivo suave + 4 × rectas 15'' con 1' andando.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote suave.",
        coach_tips=(
            "Ritmo objetivo: justo entre tu pace LT1 y LT2 — sensación de 8/10.",
            "Si tienes lactato: BLa objetivo entre 2.5 y 3.5 mmol.",
        ),
        dose_ladder=(
            DoseStep(1, "3×6'",   18, 1.0, "SUB-T", "fresh", "Introducción; volumen bajo y ritmo calibrado.", 50),
            DoseStep(2, "4×6'",   24, 1.0, "SUB-T", "fresh", "Primera progresión; primer volumen SUB-T real.", 57),
            DoseStep(3, "2×10'",  20, 1.5, "SUB-T", "fresh", "Repeticiones más largas; mejor señal de umbral.", 52),
            DoseStep(4, "4×8'",   32, 1.25,"SUB-T", "fresh", "Carga media; buen equilibrio densidad/calidad.", 66),
            DoseStep(5, "2×12'",  24, 1.5, "SUB-T", "fresh", "Bloques largos; más especificidad competitiva.", 56),
            DoseStep(6, "3×12'",  36, 1.5, "SUB-T", "fresh", "Carga alta; solo con robustez alta y señal positiva.", 69),
        ),
    ),
    WorkoutTemplate(
        template_id="run_uLT1_vo2_combo",
        discipline="running",
        compatible_block_types=("aerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="uLT1_vo2_combo",
        public_label="uLT1 + VO2 combinados",
        summary="Bloques de umbral superior (uLT1) que sandwichean repeticiones VO2 cortas. Formato característico de Nacho.",
        objective="Combinar estímulo aeróbico alto y VO2 en una sola sesión con control del coste total.",
        dose_guidance="8' uLT1 + 2 bloques × VO2 (40''/20'') + 8' uLT1. WU: 3km progresivo + activaciones.",
        progression_axes=("Añadir repeticiones VO2 por bloque", "Añadir un tercer bloque VO2", "Mantener calidad en el uLT1 final"),
        control_points=("uLT1 inicial estable", "Calidad técnica en el VO2", "uLT1 final sostenible"),
        expected_adaptations=("Mejor tolerancia a cambios de ritmo", "Más versatilidad aeróbica"),
        cautions=("Sesión muy exigente — no encadenarla con otra sesión dura", "Si el uLT1 final colapsa, reducir el bloque VO2"),
        confidence=0.85,
        evidence_ids=("ronnestad_2016_block", "tonnessen_2020_frequency"),
        csv_examples=("8' uLT1 + 2 x 6 x 40''/20'' + 8' uLT1", "8' uLT1 + 2 x 8 x 40''/20'' + 8' uLT1", "8' uLT1 + 2 x 10 x 40''/20'' + 8' uLT1"),
        fatigue_cost=5,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills", "vo2_30_30"),
        requires_fresh=True,
        calentamiento_min=20,
        calentamiento_template="3km progresivo (6:00→5:15/km) + 2×200m D:1' andando + 2×15'' rectas D:1' andando.",
        enfriamiento_min=5,
        enfriamiento_template="5' trote muy suave.",
        coach_tips=(
            "El uLT1 es a ~5:00/km — no más rápido. Es la 'base' de la sesión, no el estímulo principal.",
            "Los 20'' entre repeticiones VO2 son 'keep moving' — no te pares, sigue a ~5:15/km.",
            "Si el uLT1 final no sale, la sesión de VO2 fue demasiado larga.",
        ),
        dose_ladder=(
            DoseStep(1, "8'uLT1+2×6×40''+8'uLT1",  40, 0.33, "uLT1+VO2", "fresh", "Introducción; VO2 contenido.", 68),
            DoseStep(2, "8'uLT1+2×8×40''+8'uLT1",  44, 0.33, "uLT1+VO2", "fresh", "Primer estímulo real del formato.", 72),
            DoseStep(3, "8'uLT1+2×10×40''+8'uLT1", 47, 0.33, "uLT1+VO2", "fresh", "Carga alta; solo con robustez alta.", 77),
        ),
    ),
    WorkoutTemplate(
        template_id="bike_lt1_blocks",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block", "threshold_development_block"),
        session_role="key",
        session_family="lt1_blocks",
        public_label="Bloques LT1 en bici",
        summary="Trabajo estable en torno a LT1 para construir base útil y tolerancia al tiempo acoplado.",
        objective="Subir minutos útiles y mejorar economía aeróbica sobre la bici.",
        dose_guidance="3-6 x 10-15' LT1 o 45-90' sostenidos en zona aeróbica alta controlada.",
        progression_axes=("Subir tiempo útil", "Mantener posición aero", "Afinar fueling"),
        control_points=("Deriva de FC", "Relación W/velocidad", "Lactato estable"),
        expected_adaptations=("Mayor estabilidad subumbral", "Más minutos útiles en posición"),
        cautions=("No mezclar demasiada fuerza y LT1 el mismo día", "No convertirlo en sweet spot agresivo"),
        confidence=0.9,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=("3 x 12' LT1", "4 x 15' LT1", "60' continuo LT1", "2 x 20' LT1"),
        fatigue_cost=3,
        min_spacing_days_after=1,
        dose_ladder=(
            DoseStep(1, "3×10'",    30, 2.0, "LT1", "any",    "Introducción conservadora; bloques manejables con buena comparabilidad."),
            DoseStep(2, "4×10'",    40, 2.0, "LT1", "any",    "Primera progresión de volumen; 40 minutos útiles estables."),
            DoseStep(3, "3×15'",    45, 2.0, "LT1", "any",    "Bloques más largos; primer peldaño de carga media."),
            DoseStep(4, "4×15'",    60, 2.0, "LT1", "medium", "60 minutos útiles; carga alta de bloques LT1 en bici."),
            DoseStep(5, "2×25'",    50, 4.0, "LT1", "medium", "Transición a bloques continuos largos; buena especificidad LT1."),
            DoseStep(6, "45' cont", 45, 0.0, "LT1", "medium", "Continuo: máxima especificidad subumbral en bici."),
            DoseStep(7, "60' cont", 60, 0.0, "LT1", "medium", "Carga máxima continua LT1; solo atletas robustos con respuesta positiva."),
        ),
    ),
    WorkoutTemplate(
        template_id="bike_long_endurance",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block", "competition_specific_block"),
        session_role="key",
        session_family="long_endurance",
        public_label="Salida larga aeróbica",
        summary="Sesión larga para construir durabilidad, economía y práctica de nutrición.",
        objective="Sostener potencia aeróbica baja con buen control de fatiga.",
        dose_guidance="2-5 h aeróbicas, con foco en continuidad y nutrición.",
        progression_axes=("Subir tiempo total", "Mejorar fueling", "Añadir tramo específico final"),
        control_points=("Trabajo total en kJ", "Sin caída brusca de potencia", "Fueling tolerado"),
        expected_adaptations=("Más durabilidad", "Mejor soporte del bloque específico"),
        cautions=("No sumar por ego", "Recortar si la recuperación se retrasa"),
        confidence=0.88,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=("2h30 E1", "3h E1", "4h fondo aeróbico", "3h15 continuo"),
    ),
    WorkoutTemplate(
        template_id="bike_lt2_halfpace",
        discipline="ciclismo",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="lt2_halfpace",
        public_label="LT2 / half pace en bici",
        summary="Trabajo sostenido cerca del ritmo o potencia objetivo para pruebas largas.",
        objective="Traducir la base a potencia sostenible y aerodinámicamente útil.",
        dose_guidance="3-4 x 15-30' LT2 o half pace con recuperaciones cortas.",
        progression_axes=("Aumentar tiempo por bloque", "Mejorar estabilidad en aero", "Practicar ingesta"),
        control_points=("Potencia estable", "Coste cardiaco", "Acople técnico"),
        expected_adaptations=("Más potencia sostenible", "Mayor economía específica"),
        cautions=("No repetir demasiados días seguidos", "Si la posición se degrada, cortar antes"),
        confidence=0.91,
        evidence_ids=("cejuela_2022_tri", "mateo_march_2025_wt"),
        csv_examples=("3 x 20' LT2", "2 x 30' half pace", "4 x 15' LT2 aero"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_halfpace", "over_under_threshold", "vo2_power", "vo2_30_30"),
        requires_fresh=True,
        dose_ladder=(
            DoseStep(1, "2×12'",    24, 3.0, "LT2", "fresh", "Introducción; dos bloques comparables con margen de lectura interno."),
            DoseStep(2, "3×12'",    36, 3.0, "LT2", "fresh", "Añade un bloque; primer volumen real de umbral en bici."),
            DoseStep(3, "2×20'",    40, 4.0, "LT2", "fresh", "Bloques más largos; referencia clásica 2×20' de FTP."),
            DoseStep(4, "3×15'",    45, 3.0, "LT2", "fresh", "Más repeticiones de duración media; buen equilibrio densidad/calidad."),
            DoseStep(5, "2×25'",    50, 5.0, "LT2", "fresh", "Bloques largos; alta especificidad de umbral sostenido."),
            DoseStep(6, "3×20'",    60, 4.0, "LT2", "fresh", "Carga máxima de umbral; solo con robustez alta y señal positiva."),
        ),
    ),
    WorkoutTemplate(
        template_id="bike_vo2_power",
        discipline="ciclismo",
        compatible_block_types=("aerobic_power_block",),
        session_role="key",
        session_family="vo2_power",
        public_label="Potencia aeróbica en bici",
        summary="Sesión corta y concentrada para subir potencia aeróbica sin diluir el bloque.",
        objective="Empujar VO2 y potencia alta específica.",
        dose_guidance="4-6 x 3-5' VO2 o 8-12 repeticiones 30''/30'' con control técnico.",
        progression_axes=("Añadir repetición", "Subir tiempo útil", "Mantener calidad"),
        control_points=("Potencia de las últimas repeticiones", "Recuperación entre bloques", "Arrastre al día siguiente"),
        expected_adaptations=("Mejor techo aeróbico", "Más tolerancia a cambios de ritmo"),
        cautions=("Bloque corto", "Descarga posterior casi obligatoria"),
        confidence=0.86,
        evidence_ids=("ronnestad_2016_block", "tonnessen_2020_frequency"),
        csv_examples=("5 x 4' VO2max", "6 x 3' VO2max", "2 x 10 x 30''/30'' VO2"),
        fatigue_cost=5,
        min_spacing_days_after=2,
        requires_fresh=True,
    ),
    WorkoutTemplate(
        template_id="bike_torque_support",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block", "aerobic_power_block", "competition_specific_block"),
        session_role="support",
        session_family="torque_strength",
        public_label="Torque y fuerza específica",
        summary="Soporte neuromuscular para mejorar producción de fuerza sin cambiar la identidad del bloque.",
        objective="Sostener transferencia de fuerza y robustez en pedaleo.",
        dose_guidance="6-10 x 8-15'' fuerza o 4-8 x 1' torque controlado.",
        progression_axes=("Añadir repeticiones", "Mantener calidad", "Separarlo de la sesión clave"),
        control_points=("Cadencia baja controlada", "Sin residuo excesivo", "No altera el día LT2"),
        expected_adaptations=("Más fuerza específica", "Mejor economía de pedaleo"),
        cautions=("No usar como estímulo dominante en semanas duras",),
        confidence=0.8,
        evidence_ids=("ronnestad_2022_strength", "vikmoen_2021_tri_strength"),
        csv_examples=("6 x 10'' torque", "8 x 12'' fuerza específica", "5 x 1' torque baja cadencia"),
    ),
    WorkoutTemplate(
        template_id="bike_transition_specific",
        discipline="ciclismo",
        compatible_block_types=("competition_specific_block",),
        session_role="key",
        session_family="transition_specific",
        public_label="Especificidad de transición",
        summary="Sesión para triatlón donde la bici prepara la carrera posterior sin distorsionar la señal.",
        objective="Aproximar el coste competitivo y la transferencia a T2.",
        dose_guidance="Bici con bloques específicos + carrera corta controlada o sesión de transición separada.",
        progression_axes=("Ajustar potencia objetivo", "Ajustar duración de brick", "Ensayar nutrición"),
        control_points=("Salida a pie controlada", "No vaciar la bici", "Sensación de transferencia"),
        expected_adaptations=("Mejor tolerancia a la transición", "Más especificidad competitiva"),
        cautions=("Usar cerca de la prueba", "No meterlo cuando aún falta base"),
        confidence=0.83,
        evidence_ids=("cejuela_2022_tri",),
        csv_examples=("60' bici + 20' T2 controlada", "2 x 20' race pace + 15' T2", "90' bici específica + 30' transición"),
    ),
    WorkoutTemplate(
        template_id="bike_lt0_recovery",
        discipline="ciclismo",
        compatible_block_types=("recovery_consolidation_block", "aerobic_capacity_block"),
        session_role="recovery",
        session_family="lt0_recovery",
        public_label="Bici LT0 / regenerativa",
        summary="Salida muy suave para mover piernas y bajar fatiga sin contaminar el bloque.",
        objective="Facilitar recuperación y sostener frecuencia.",
        dose_guidance="45-90' muy suaves, preferiblemente con cadencia cómoda y terreno fácil.",
        progression_axes=("Ajustar duración", "Mejorar sensación de soltura", "No tocar intensidad"),
        control_points=("RPE baja", "Piernas más sueltas al acabar", "Sin deriva innecesaria"),
        expected_adaptations=("Mejor recuperación entre sesiones clave", "Más continuidad semanal"),
        cautions=("No esconder trabajo medio", "Si no recupera, recortar"),
        confidence=0.9,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=("60' LT0", "75' LT0", "90' LT0 cadencia cómoda"),
        fatigue_cost=1,
        min_spacing_days_after=0,
    ),
    WorkoutTemplate(
        template_id="bike_fatmax_endurance",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block",),
        session_role="key",
        session_family="fatmax_endurance",
        public_label="Fatmax / fondo controlado",
        summary="Sesión de capacidad extensiva con continuidad alta y coste metabólico contenido.",
        objective="Consolidar base aeróbica larga y eficiencia energética.",
        dose_guidance="2-4 h aeróbicas estables con un tramo largo continuo en zona fácil-alta.",
        progression_axes=("Aumentar tiempo total", "Ajustar ingesta", "Sostener estabilidad de potencia"),
        control_points=("Potencia constante", "Buena tolerancia nutricional", "Sensación de control"),
        expected_adaptations=("Más durabilidad aeróbica", "Menor coste por kJ acumulado"),
        cautions=("No mezclar con otra tirada larga agresiva", "Recortar si afecta a la sesión clave de umbral"),
        confidence=0.87,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=("3h Fatmax", "2h30 E1 estable", "4h fondo controlado"),
    ),
    WorkoutTemplate(
        template_id="bike_cadence_efficiency",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block", "technical_rebuild_block", "competition_specific_block"),
        session_role="support",
        session_family="cadence_efficiency",
        public_label="Cadencia y eficiencia",
        summary="Sesión de soporte para refinar economía de pedaleo y control postural sin subir demasiado la carga interna.",
        objective="Mejorar coordinación y estabilidad sobre la bici.",
        dose_guidance="Bloques de cadencia alta o variable sobre intensidad baja-moderada.",
        progression_axes=("Subir tiempo en el gesto", "Mejorar fluidez", "Mantener postura estable"),
        control_points=("Pedaleo redondo", "Sin rebote", "Sin fatiga excesiva"),
        expected_adaptations=("Mejor economía mecánica", "Más calidad en posición"),
        cautions=("No sustituye al trabajo principal", "No usar si desordena demasiado la técnica"),
        confidence=0.79,
        evidence_ids=("mateo_march_2025_wt", "cejuela_2022_tri"),
        csv_examples=("3 x 8' cadencia alta", "4 x 6' cadencia variable", "45' rodaje con técnica de pedaleo"),
    ),
    WorkoutTemplate(
        template_id="bike_over_under_threshold",
        discipline="ciclismo",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="over_under_threshold",
        public_label="Over-under LT1-LT2",
        summary="Sesión escalonada para mejorar tolerancia a cambios de coste alrededor del umbral.",
        objective="Hacer más estable la potencia sostenible en contextos variables.",
        dose_guidance="Bloques que alternan LT1 alto y LT2 controlado, con recuperación breve.",
        progression_axes=("Aumentar minutos por bloque", "Mejorar estabilidad entre cambios", "Afinar potencia objetivo"),
        control_points=("Transiciones limpias", "Potencia sostenida", "Sin colapso al final"),
        expected_adaptations=("Más tolerancia al coste variable", "Mejor control alrededor del umbral"),
        cautions=("No encadenarlo con otra sesión media exigente",),
        confidence=0.84,
        evidence_ids=("cejuela_2022_tri", "tonnessen_2020_frequency"),
        csv_examples=("4 x 10' over-under LT1-LT2", "3 x 12' LT1 alto -> LT2", "2 x 20' cambios controlados LT1-LT2"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_halfpace", "vo2_power", "vo2_30_30"),
        requires_fresh=True,
        dose_ladder=(
            DoseStep(1, "2×10' O/U",  20, 5.0, "LT1-LT2", "fresh", "Introducción; dos bloques con alternancia LT1 alto / LT2 controlado."),
            DoseStep(2, "3×10' O/U",  30, 5.0, "LT1-LT2", "fresh", "Tres bloques; primer volumen real de over-under."),
            DoseStep(3, "2×15' O/U",  30, 5.0, "LT1-LT2", "fresh", "Bloques más largos; mayor tiempo en la zona de transición."),
            DoseStep(4, "3×12' O/U",  36, 4.0, "LT1-LT2", "fresh", "Densidad media-alta; buen estímulo de tolerancia al cambio."),
            DoseStep(5, "2×20' O/U",  40, 5.0, "LT1-LT2", "fresh", "Carga alta; reservar para atletas robustos con señal positiva."),
        ),
    ),
    WorkoutTemplate(
        template_id="bike_sprint_neuromuscular",
        discipline="ciclismo",
        compatible_block_types=("aerobic_power_block", "competition_specific_block"),
        session_role="support",
        session_family="sprint_neuromuscular",
        public_label="Sprints y activación neuromuscular",
        summary="Activación breve para reclutamiento y punch sin convertir la semana en un bloque glicolítico.",
        objective="Apoyar potencia alta y respuesta neuromuscular.",
        dose_guidance="5-10 sprints muy breves o arranques controlados con recuperación completa.",
        progression_axes=("Añadir pocas repeticiones", "Mejorar calidad", "Mantener frescura posterior"),
        control_points=("Potencia alta de salida", "Recuperación completa", "Sin impacto negativo al día siguiente"),
        expected_adaptations=("Más reclutamiento", "Mejor respuesta a cambios de ritmo"),
        cautions=("Volumen muy contenido", "No mezclar con fatiga alta o torque residual"),
        confidence=0.8,
        evidence_ids=("ronnestad_2022_strength", "ronnestad_2016_block"),
        csv_examples=("6 x 10'' sprint", "8 x 12'' arranque", "10 x 8'' neuromuscular"),
    ),
    WorkoutTemplate(
        template_id="bike_aero_stability",
        discipline="ciclismo",
        compatible_block_types=("competition_specific_block", "threshold_development_block"),
        session_role="support",
        session_family="aero_stability",
        public_label="Estabilidad en posición aero",
        summary="Trabajo para hacer sostenible la potencia útil manteniendo posición y economía.",
        objective="Sostener postura y eficiencia cerca del ritmo objetivo.",
        dose_guidance="Bloques subumbrales o específicos en posición aero con foco técnico claro.",
        progression_axes=("Más tiempo en posición", "Menos cambios posturales", "Potencia más estable"),
        control_points=("Acople estable", "Sin dolor postural creciente", "Buena relación W/velocidad"),
        expected_adaptations=("Más economía específica", "Mejor transferencia al ritmo de prueba"),
        cautions=("Cortar si la postura se degrada",),
        confidence=0.85,
        evidence_ids=("cejuela_2022_tri", "mateo_march_2025_wt"),
        csv_examples=("2 x 20' aero steady", "3 x 15' aero LT2 controlado", "40' aero continuo subumbral"),
    ),
    WorkoutTemplate(
        template_id="bike_endurance_tempo",
        discipline="ciclismo",
        # D2/tempo = zona LT1-LT2 — THR/transición, NO AEC (Olbrecht: AEC = sub-LT1 con spices cortos)
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="endurance_tempo",
        public_label="Endurance con bloques tempo",
        summary="Salida larga con inserciones D2/tempo para mejorar resistencia específica en zona de transición.",
        objective="Construir durabilidad con soporte de potencia media útil.",
        dose_guidance="2.5-5 h con 1-2 bloques largos tipo D2/tempo dentro de la salida.",
        progression_axes=("Alargar el tiempo de los bloques", "Ajustar el momento del bloque dentro de la salida", "Mejorar estabilidad"),
        control_points=("Bloques sostenidos y limpios", "Sin colapso al final", "Fueling correcto"),
        expected_adaptations=("Más durabilidad a potencia media", "Mejor soporte del específico"),
        cautions=("No hacerla cada semana si el bloque principal ya es duro",),
        confidence=0.86,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=("3h con 2 x 25' tempo", "4h con 1 x 40' D2", "3h30 con 3 x 20' tempo"),
    ),
    WorkoutTemplate(
        template_id="bike_lt2_long_reps",
        discipline="ciclismo",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="lt2_long_reps",
        public_label="LT2 de repeticiones largas",
        summary="Formato de umbral largo para consolidar potencia sostenible y pacing en bici.",
        objective="Aumentar tiempo útil en LT2 con buena repetibilidad.",
        dose_guidance="2-3 bloques largos de 8-30' LT2 según fase y perfil.",
        progression_axes=("Extender cada bloque", "Subir una repetición", "Reducir variabilidad entre bloques"),
        control_points=("Potencia estable", "Cadencia consistente", "Sin degradación postural"),
        expected_adaptations=("Más potencia sostenible", "Mejor pacing específico"),
        cautions=("Respetar recuperación entre días",),
        confidence=0.88,
        evidence_ids=("cejuela_2022_tri", "tonnessen_2020_frequency"),
        csv_examples=("2 x 20' LT2", "3 x 12' LT2", "2 x 30' LT2"),
    ),
    WorkoutTemplate(
        template_id="bike_lt2_vo2_combo",
        discipline="ciclismo",
        compatible_block_types=("aerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="lt2_vo2_combo",
        public_label="Combo LT2 + VO2",
        summary="Sesión puente para sostener umbral y añadir una capa de potencia alta dentro del mismo día.",
        objective="Unir potencia sostenible y techo aeróbico cuando el bloque lo necesita.",
        dose_guidance="Bloque LT2 seguido de repeticiones VO2 cortas o sesión de doble estímulo controlado.",
        progression_axes=("Aumentar minutos LT2 o repeticiones VO2, no ambas a la vez", "Mantener calidad global"),
        control_points=("No se colapsa el VO2 tras el LT2", "Recuperación posterior suficiente", "Control del coste"),
        expected_adaptations=("Más versatilidad alrededor del umbral y por encima", "Mejor potencia útil"),
        cautions=("Muy fácil de sobredosificar", "Usar en bloques cortos o atletas robustos"),
        confidence=0.81,
        evidence_ids=("ronnestad_2016_block", "cejuela_2022_tri"),
        csv_examples=("20' LT2 + 4 x 3' VO2", "2 x 12' LT2 + 8 x 30''/30''", "15' LT2 + 5 x 2' VO2"),
    ),
    WorkoutTemplate(
        template_id="bike_vo2_30_30",
        discipline="ciclismo",
        compatible_block_types=("aerobic_power_block",),
        session_role="key",
        session_family="vo2_30_30",
        public_label="VO2 30-30 en bici",
        summary="Formato clásico para acumular tiempo de calidad por encima del umbral con buen control de potencia.",
        objective="Elevar potencia aeróbica y tolerancia a intervalos fraccionados.",
        dose_guidance="1-2 bloques de 8-12 repeticiones 30''/30'' a potencia alta controlada.",
        progression_axes=("Añadir repeticiones", "Añadir un segundo bloque", "Mantener potencia final"),
        control_points=("Potencia sostenida", "Caída mínima entre repeticiones", "No arrastrar exceso al día siguiente"),
        expected_adaptations=("Más techo aeróbico", "Mejor tolerancia a cambios de ritmo"),
        cautions=("Descarga posterior si el bloque es concentrado",),
        confidence=0.86,
        evidence_ids=("ronnestad_2016_block", "tonnessen_2020_frequency"),
        csv_examples=("2 x 8 x 30''/30'' VO2", "12 x 30''/30'' VO2", "10 x 40''/20'' VO2"),
    ),
    WorkoutTemplate(
        template_id="bike_cadmax_neuro",
        discipline="ciclismo",
        compatible_block_types=("technical_rebuild_block", "aerobic_power_block", "competition_specific_block"),
        session_role="support",
        session_family="cadmax_neuro",
        public_label="CadMax / neuromuscular",
        summary="Trabajo breve de cadencia alta o activación neuromuscular para mejorar coordinación y reactividad.",
        objective="Subir calidad mecánica del pedaleo y preparación neuromuscular.",
        dose_guidance="10-20 repeticiones muy breves de cadencia alta o neuromuscular con mucha recuperación.",
        progression_axes=("Añadir pocas repeticiones", "Mejorar fluidez", "Mantener la frescura"),
        control_points=("Cadencia alta limpia", "Sin tensión excesiva", "Recuperación completa"),
        expected_adaptations=("Mejor coordinación", "Más facilidad para acelerar"),
        cautions=("No sustituye el trabajo principal",),
        confidence=0.8,
        evidence_ids=("mateo_march_2025_wt", "ronnestad_2022_strength"),
        csv_examples=("12 x 10'' CadMax", "15 x 8'' neuromuscular", "10 x 12'' alta cadencia"),
    ),
    WorkoutTemplate(
        template_id="bike_submax_lt1_mix",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block", "technical_rebuild_block"),
        session_role="support",
        session_family="submax_lt1_mix",
        public_label="Submax + LT1",
        summary="Sesión mixta para tocar activación breve y luego consolidar bloque aeróbico controlado.",
        objective="Mejorar activación sin perder el foco extensivo.",
        dose_guidance="Repeticiones submáximas breves antes de un bloque principal LT1.",
        progression_axes=("Ajustar pocas repeticiones submáximas", "Extender LT1 posterior", "Mantener calidad técnica"),
        control_points=("Parte submáxima limpia", "LT1 posterior estable", "Sin coste excesivo"),
        expected_adaptations=("Más reactividad con mantenimiento de base", "Mejor control de salida"),
        cautions=("No meter demasiada fatiga neuromuscular antes del LT1",),
        confidence=0.8,
        evidence_ids=("mateo_march_2025_wt", "cejuela_2022_tri"),
        csv_examples=("4 x 20'' submax + 4 x 12' LT1", "6 x 10'' activación + 3 x 15' LT1", "5 x 15'' submax + 40' continuo LT1"),
    ),
    WorkoutTemplate(
        template_id="bike_lt1_to_lt2_blocks",
        discipline="ciclismo",
        compatible_block_types=("threshold_development_block", "aerobic_power_block"),
        session_role="key",
        session_family="lt1_to_lt2_blocks",
        public_label="Bloques progresivos LT1→LT2",
        summary="Cada intervalo empieza en LT1 y progresa a LT2 dentro de la misma repetición. Formato de Nacho para trabajar toda la zona de umbral.",
        objective="Desarrollar tolerancia a la transición entre zonas y elevar el techo aeróbico en bici.",
        dose_guidance="4-6 × 6' con progresión LT1→LT2 dentro de cada rep, 3' suave entre series.",
        progression_axes=("Añadir una repetición", "Alargar la sección LT2 dentro de cada rep", "Reducir marginalmente el descanso"),
        control_points=("Transición limpia dentro de cada rep", "No disparar la potencia al inicio", "Última rep comparable a la primera"),
        expected_adaptations=("Mayor versatilidad aeróbica en bici", "Mejor tolerancia a cambios de intensidad"),
        cautions=("Si la potencia LT2 no es sostenible en las últimas reps, acortar la sesión",),
        confidence=0.86,
        evidence_ids=("cejuela_2022_tri", "mateo_march_2025_wt"),
        csv_examples=("4 x 6' LT1→LT2", "5 x 6' LT1→LT2", "6 x 6' LT1→LT2"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_halfpace", "over_under_threshold", "vo2_power"),
        requires_fresh=True,
        calentamiento_min=15,
        calentamiento_template="10-15' suave 120-140w.",
        enfriamiento_min=15,
        enfriamiento_template="Completar tiempo de sesión rodando suave.",
        coach_tips=(
            "Los primeros 3' de cada rep son a LT1 — resiste la tentación de ir más rápido.",
            "Los últimos 3' suben a LT2 — busca la potencia sostenible, no el máximo.",
        ),
        dose_ladder=(
            DoseStep(1, "4×6' LT1→LT2", 24, 3.0, "LT1-LT2", "fresh", "Introducción al formato.", 85),
            DoseStep(2, "5×6' LT1→LT2", 30, 3.0, "LT1-LT2", "fresh", "Primer volumen real del formato.", 95),
            DoseStep(3, "6×6' LT1→LT2", 36, 3.0, "LT1-LT2", "fresh", "Carga alta; solo con robustez alta.", 105),
        ),
    ),
    WorkoutTemplate(
        template_id="bike_cadmax_lt1_combo",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block", "threshold_development_block"),
        session_role="key",
        session_family="cadmax_lt1_combo",
        public_label="CadMax + bloques LT1",
        summary="Activación neuromuscular con sprints de cadencia máxima seguida de bloques sostenidos LT1. Formato habitual de Nacho.",
        objective="Combinar reclutamiento neuromuscular y base aeróbica específica en una sola sesión.",
        dose_guidance="10-15 × 10'' CadMax + 3-5 × 9-12' LT1.",
        progression_axes=("Añadir repeticiones de CadMax", "Alargar los bloques LT1", "Aumentar el número de bloques LT1"),
        control_points=("Cadencia máxima limpia en cada sprint", "LT1 estable y sin deriva", "Sin fatiga residual al día siguiente"),
        expected_adaptations=("Más reclutamiento neuromuscular", "Mayor soporte de base aeróbica"),
        cautions=("Los sprints CadMax son técnicos — no de potencia máxima", "No meter el combo si hay carga alta de LT2 o VO2 el día anterior"),
        confidence=0.84,
        evidence_ids=("mateo_march_2025_wt", "cejuela_2022_tri"),
        csv_examples=("10 x 10'' CadMax + 3 x 9' LT1", "12 x 10'' CadMax + 4 x 9' LT1", "15 x 10'' CadMax + 5 x 9' LT1", "15 x 10'' CadMax + 5 x 12' LT1"),
        fatigue_cost=3,
        min_spacing_days_after=1,
        calentamiento_min=15,
        calentamiento_template="15' suave 120-140w.",
        enfriamiento_min=15,
        enfriamiento_template="Completar tiempo de sesión rodando suave.",
        coach_tips=(
            "CadMax = cadencia máxima limpia, no máxima potencia. RPM >110-120, sin rebote.",
            "Deja 3-5' suave entre los sprints CadMax y los bloques LT1 para que el sistema se calme.",
        ),
        dose_ladder=(
            DoseStep(1, "10×10''CadMax+3×9'LT1",  27, 2.0, "mix", "any",    "Introducción; volumen LT1 contenido.", 90),
            DoseStep(2, "12×10''CadMax+4×9'LT1",  36, 2.0, "mix", "any",    "Primer volumen real del combo.", 100),
            DoseStep(3, "15×10''CadMax+5×9'LT1",  45, 2.0, "mix", "any",    "Clásico de Nacho; buen equilibrio.", 110),
            DoseStep(4, "15×10''CadMax+5×12'LT1", 60, 2.0, "mix", "medium", "Carga alta; LT1 más largo.", 120),
        ),
    ),
    WorkoutTemplate(
        template_id="bike_subthreshold_blocks",
        discipline="ciclismo",
        compatible_block_types=("threshold_development_block", "aerobic_power_block"),
        session_role="key",
        session_family="subthreshold_blocks",
        public_label="SUB-T ciclismo (bloques por debajo de FTP)",
        summary="Bloques sostenidos justo por debajo del FTP/LT2. Zona entre LT1 y LT2 — exigente pero repetible.",
        objective="Desarrollar la parte alta del dominio aeróbico sin el coste completo de una sesión LT2.",
        dose_guidance="4-2 bloques de 10-30' por debajo de FTP con 3' suave entre series.",
        progression_axes=("Alargar los bloques", "Aumentar el número de repeticiones", "Afinar la potencia objetivo"),
        control_points=("Potencia estable a lo largo del bloque", "FC sin drift excesivo", "Sensación de sostenibilidad"),
        expected_adaptations=("Mayor potencia sostenible en zona alta aeróbica", "Mejor base para sesiones LT2"),
        cautions=("No cruzar el umbral LT2 — si la FC sube sin control, bajar potencia", "Control de lactato recomendado"),
        confidence=0.87,
        evidence_ids=("cejuela_2022_tri", "mateo_march_2025_wt"),
        csv_examples=("4 x 10' SUB-T 3' rec", "4 x 15' SUB-T 3' rec", "3 x 20' SUB-T 3' rec", "2 x 30' SUB-T 4' rec"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("lt2_halfpace", "over_under_threshold", "vo2_power"),
        requires_fresh=True,
        calentamiento_min=15,
        calentamiento_template="10-15' suave 120-140w.",
        enfriamiento_min=15,
        enfriamiento_template="Completar el tiempo de sesión rodando suave.",
        coach_tips=(
            "Potencia objetivo: ~90-95% de FTP — debería sentirse 'exigente pero controlable'.",
            "Si tienes lactato: BLa objetivo entre 2.5 y 3.5 mmol.",
            "90g CHO/h si la sesión supera los 90 minutos.",
        ),
        dose_ladder=(
            DoseStep(1, "4×10' SUB-T",  40, 3.0, "SUB-T", "fresh", "Introducción; bloques cortos con lectura limpia.", 90),
            DoseStep(2, "4×15' SUB-T",  60, 3.0, "SUB-T", "fresh", "Primer volumen real SUB-T en bici.", 110),
            DoseStep(3, "3×20' SUB-T",  60, 3.0, "SUB-T", "fresh", "Bloques más largos; mejor especificidad.", 110),
            DoseStep(4, "4×20' SUB-T",  80, 3.0, "SUB-T", "fresh", "Carga alta; solo con robustez alta y señal positiva.", 130),
            DoseStep(5, "2×30' SUB-T",  60, 4.0, "SUB-T", "fresh", "Máxima especificidad; muy cerca del umbral.", 120),
        ),
    ),
    WorkoutTemplate(
        template_id="swim_technical_alignment",
        discipline="natación",
        compatible_block_types=("technical_rebuild_block", "aerobic_capacity_block"),
        session_role="key",
        session_family="technical_alignment",
        public_label="Técnica y alineación acuática",
        summary="Sesión de skill con feedback y control mecánico explícito.",
        objective="Corregir limitantes de entrada, rolido, respiración o agarre antes de exigir más fisiología.",
        dose_guidance="Educativos, snorkel, pull, aletas y vídeo con descansos completos.",
        progression_axes=("Subir calidad técnica", "Aumentar metros útiles manteniendo técnica", "Reducir asimetrías"),
        control_points=("Vídeo comparable", "Brazada más estable", "Menos desvío lateral"),
        expected_adaptations=("Mejor economía acuática", "Más continuidad técnica"),
        cautions=("No endurecer la carga si la técnica se rompe",),
        confidence=0.92,
        evidence_ids=("gonzalez_rave_2022_im", "gonzalez_rave_2023_altitude"),
        csv_examples=("8 x 50 técnica + 8 x 50 nado", "12 x 50 snorkel y alineación", "6 x 100 pull técnico"),
        fatigue_cost=2,
        min_spacing_days_after=0,
        requires_fresh=True,
    ),
    WorkoutTemplate(
        template_id="swim_aerobic_continuity",
        discipline="natación",
        compatible_block_types=("aerobic_capacity_block", "threshold_development_block"),
        session_role="key",
        session_family="aerobic_continuity",
        public_label="Continuidad aeróbica en agua",
        summary="Sesión para sumar metros útiles a intensidad controlada sin perder calidad mecánica.",
        objective="Construir base específica y tolerancia al volumen de agua.",
        dose_guidance="Series medias o continuo fraccionado a intensidad aeróbica controlada.",
        progression_axes=("Aumentar metros útiles", "Reducir descansos muy gradualmente", "Mantener técnica"),
        control_points=("Tiempo por 100 estable", "Brazadas por largo", "Lactato moderado"),
        expected_adaptations=("Más continuidad", "Menor coste a misma velocidad"),
        cautions=("No sacrificar apoyo y alineación por sumar metros",),
        confidence=0.86,
        evidence_ids=("gonzalez_rave_2022_im", "pla_2019_swim"),
        csv_examples=("3 x 400m LT1 c/30''", "1500m continuo aeróbico", "4 x 300m LT1 c/20''"),
        fatigue_cost=3,
        min_spacing_days_after=1,
        dose_ladder=(
            DoseStep(1, "3×400m c/30''",       24, 0.5,  "LT1", "any",    "Introducción conservadora; series largas con pausa generosa."),
            DoseStep(2, "4×400m c/30''",       32, 0.5,  "LT1", "any",    "Añade una serie; primer volumen real de base continua."),
            DoseStep(3, "3×500m c/30''",       30, 0.5,  "LT1", "any",    "Series más largas; mejor continuidad de brazada."),
            DoseStep(4, "4×500m c/30''",       40, 0.5,  "LT1", "medium", "40 minutos útiles; carga media-alta de base acuática."),
            DoseStep(5, "1500m cont aeróbico", 23, 0.0,  "sub-LT1", "any", "Continuo: máxima especificidad de base y lectura de deriva."),
            DoseStep(6, "2000m AEC frac.",     30, 0.25, "LT1", "medium", "Volumen alto fraccionado; reservar para atletas consolidados."),
        ),
    ),
    WorkoutTemplate(
        template_id="swim_css_threshold",
        discipline="natación",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="css_threshold",
        public_label="CSS / umbral en agua",
        summary="Trabajo de ritmo sostenible para traducir técnica y base a velocidad útil.",
        objective="Sostener más velocidad con coste fisiológico controlado.",
        dose_guidance="6-12 x 100m o 4-8 x 200m a CSS/LT2, pausas cortas.",
        progression_axes=("Aumentar metros a CSS", "Mejorar regularidad", "Mantener longitud de brazada"),
        control_points=("Velocidad estable", "Caída mínima técnica", "Lactato dentro de objetivo"),
        expected_adaptations=("Mayor velocidad sostenible", "Mejor economía en repeticiones medias"),
        cautions=("Si la técnica cae, la carga deja de ser específica",),
        confidence=0.9,
        evidence_ids=("gonzalez_rave_2022_im", "pla_2019_swim"),
        csv_examples=("10 x 100m CSS c/15''", "6 x 200m LT2 c/20''", "4 x 300m CSS c/30''"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        incompatible_adjacent_families=("css_threshold", "vo2_anaerobic", "anc_speed_combo"),
        requires_fresh=True,
        dose_ladder=(
            DoseStep(1, "8×100m CSS c/15''",  14, 0.25, "CSS", "fresh", "Introducción; volumen contenido con referencia clara de ritmo."),
            DoseStep(2, "10×100m CSS c/15''", 17, 0.25, "CSS", "fresh", "Añade dos repeticiones; primer estímulo de umbral real."),
            DoseStep(3, "6×150m CSS c/20''",  16, 0.33, "CSS", "fresh", "Repeticiones más largas; mejor especificidad metabólica."),
            DoseStep(4, "6×200m CSS c/25''",  21, 0.42, "CSS", "fresh", "Mayor volumen por repetición; referencia clásica de umbral en natación."),
            DoseStep(5, "4×300m CSS c/30''",  22, 0.5,  "CSS", "fresh", "Repeticiones largas; alta especificidad para distancias medias."),
            DoseStep(6, "3×400m CSS c/45''",  23, 0.75, "CSS", "fresh", "Carga máxima; solo atletas con técnica estable y robustez alta."),
        ),
    ),
    WorkoutTemplate(
        template_id="swim_race_pace_specific",
        discipline="natación",
        compatible_block_types=("competition_specific_block", "aerobic_power_block"),
        session_role="key",
        session_family="race_pace_specific",
        public_label="Ritmo específico de prueba",
        summary="Bloques rotos o progresivos para acercar técnica y coste a la competición.",
        objective="Ajustar ritmo de prueba sin perder calidad del patrón.",
        dose_guidance="Bloques broken race pace, salidas, virajes o tramos open-water específicos.",
        progression_axes=("Más precisión de ritmo", "Menos deriva técnica", "Mejor pacing"),
        control_points=("Velocidad de referencia", "Virajes/sighting", "Recuperación entre bloques"),
        expected_adaptations=("Mayor transferencia competitiva", "Mejor control del pacing"),
        cautions=("No alargar demasiado el bloque", "Necesita base y técnica previas"),
        confidence=0.84,
        evidence_ids=("gonzalez_rave_2022_im",),
        csv_examples=("3 x (4 x 100m ritmo prueba) c/20''", "2 x 600m open water pace", "8 x 50m salida + ritmo"),
    ),
    WorkoutTemplate(
        template_id="swim_lt1_broken_sets",
        discipline="natación",
        compatible_block_types=("aerobic_capacity_block", "threshold_development_block"),
        session_role="key",
        session_family="lt1_broken_sets",
        public_label="Series rotas LT1",
        summary="Sesión de continuidad aeróbica con descansos cortos para sostener técnica y volumen útil.",
        objective="Aumentar metros de calidad en dominio subumbral.",
        dose_guidance="Bloques de 100-400m con pausas cortas y técnica estable.",
        progression_axes=("Aumentar metros útiles", "Reducir descansos de forma pequeña", "Sostener ritmo"),
        control_points=("Tiempo por serie estable", "Brazada consistente", "Lactato moderado"),
        expected_adaptations=("Más continuidad a ritmo aeróbico", "Mejor tolerancia al volumen útil"),
        cautions=("Si la técnica cae, parar la progresión",),
        confidence=0.87,
        evidence_ids=("gonzalez_rave_2022_im", "pla_2019_swim"),
        csv_examples=("3 x (4 x 100m LT1) c/15''", "6 x 200m LT1 c/20''", "4 x 300m LT1 c/25''"),
        fatigue_cost=3,
        min_spacing_days_after=1,
        dose_ladder=(
            DoseStep(1, "3×(4×100m) c/15''", 24, 0.25, "LT1", "any",    "Series rotas; técnica limpia y lectura fácil del coste."),
            DoseStep(2, "4×(4×100m) c/15''", 32, 0.25, "LT1", "any",    "Añade un bloque; primer volumen serio de base acuática."),
            DoseStep(3, "3×(4×150m) c/20''", 30, 0.33, "LT1", "any",    "Repeticiones más largas; mayor continuidad de brazada."),
            DoseStep(4, "4×(4×150m) c/20''", 40, 0.33, "LT1", "medium", "Carga media-alta; 40 minutos útiles en zona subumbral."),
            DoseStep(5, "6×200m LT1 c/20''", 32, 0.33, "LT1", "medium", "Series medianas; transición hacia formato más específico."),
            DoseStep(6, "4×300m LT1 c/25''", 32, 0.42, "LT1", "medium", "Series largas; máxima especificidad subumbral en piscina."),
        ),
    ),
    WorkoutTemplate(
        template_id="swim_pull_snorkel_alignment",
        discipline="natación",
        compatible_block_types=("technical_rebuild_block", "aerobic_capacity_block"),
        session_role="support",
        session_family="pull_snorkel_alignment",
        public_label="Snorkel, pull y alineación",
        summary="Sesión técnica para reforzar trayectoria de brazada, eje corporal y estabilidad.",
        objective="Reducir asimetrías y mejorar apoyo acuático sin presión de ritmo alto.",
        dose_guidance="Educativos y bloques con snorkel, pull, aletas o material técnico, descansos generosos.",
        progression_axes=("Mejorar calidad del gesto", "Aumentar metros útiles manteniendo la técnica", "Disminuir desviaciones"),
        control_points=("Entrada limpia", "Menos zigzag", "Respiración controlada"),
        expected_adaptations=("Mayor alineación", "Mejor economía técnica"),
        cautions=("No usar material para esconder defectos persistentes",),
        confidence=0.9,
        evidence_ids=("gonzalez_rave_2023_altitude", "gonzalez_rave_2022_im"),
        csv_examples=("10 x 50 snorkel técnico", "6 x 100 pull + alineación", "8 x 75 un brazo + nado completo"),
    ),
    WorkoutTemplate(
        template_id="swim_vo2_anaerobic",
        discipline="natación",
        compatible_block_types=("aerobic_power_block",),
        session_role="key",
        session_family="vo2_anaerobic",
        public_label="VO2 / capacidad anaeróbica en agua",
        summary="Bloque corto e intenso para elevar velocidad alta y tolerancia específica en el agua.",
        objective="Empujar techo aeróbico y capacidad de sostener repeticiones rápidas.",
        dose_guidance="Repeticiones cortas-medias rápidas con recuperación suficiente para preservar calidad.",
        progression_axes=("Añadir una repetición", "Aumentar metros rápidos", "Sostener calidad"),
        control_points=("Tiempo objetivo estable", "Técnica no colapsa", "Recuperación suficiente"),
        expected_adaptations=("Más velocidad alta utilizable", "Mejor tolerancia a ritmos exigentes"),
        cautions=("Bloque corto", "No mantener muchas semanas seguidas"),
        confidence=0.82,
        evidence_ids=("pla_2019_swim", "ronnestad_2016_block"),
        csv_examples=("16 x 50m VO2 c/30''", "10 x 100m fuertes c/45''", "8 x 75m VO2 c/40''"),
        fatigue_cost=5,
        min_spacing_days_after=2,
        requires_fresh=True,
    ),
    WorkoutTemplate(
        template_id="swim_speed_turns",
        discipline="natación",
        compatible_block_types=("competition_specific_block", "aerobic_power_block", "technical_rebuild_block"),
        session_role="support",
        session_family="speed_turns",
        public_label="Velocidad, virajes y transferencias",
        summary="Sesión de calidad para unir velocidad, técnica de viraje y transferencia al ritmo competitivo.",
        objective="Mejorar precisión técnica cuando la velocidad sube.",
        dose_guidance="Repeticiones cortas rápidas, virajes, salidas o transferencias con descansos amplios.",
        progression_axes=("Más precisión", "Más repeticiones de calidad", "Menor caída técnica"),
        control_points=("Viraje limpio", "Velocidad alta reproducible", "Buena transferencia"),
        expected_adaptations=("Más calidad técnica a velocidad alta", "Mejor transferencia competitiva"),
        cautions=("No usar como única sesión rápida de la fase específica",),
        confidence=0.81,
        evidence_ids=("gonzalez_rave_2022_im",),
        csv_examples=("12 x 25m rápidos con viraje", "8 x 50m salida + viraje", "16 x 15m breakout + transferencia"),
    ),
    WorkoutTemplate(
        template_id="swim_open_water_specific",
        discipline="natación",
        compatible_block_types=("competition_specific_block",),
        session_role="key",
        session_family="open_water_specific",
        public_label="Aguas abiertas y orientación",
        summary="Sesión específica para sighting, cambios de ritmo y continuidad sin pared.",
        objective="Acercar la natación al contexto real de triatlón o aguas abiertas.",
        dose_guidance="Bloques continuos o rotos sin referencias fijas, con orientación y cambios controlados.",
        progression_axes=("Más tiempo continuo", "Más precisión de orientación", "Más estabilidad de ritmo"),
        control_points=("Trayectoria limpia", "Sin picos innecesarios", "Buena continuidad"),
        expected_adaptations=("Más transferencia al open water", "Menor coste por desorden táctico"),
        cautions=("No sustituye toda la técnica de piscina",),
        confidence=0.83,
        evidence_ids=("cejuela_2022_tri", "gonzalez_rave_2023_altitude"),
        csv_examples=("3 x 600m sighting controlado", "2 x 1000m open water pace", "20' continuo con cambios de orientación"),
    ),
    WorkoutTemplate(
        template_id="swim_recovery_drills",
        discipline="natación",
        compatible_block_types=("recovery_consolidation_block", "technical_rebuild_block"),
        session_role="recovery",
        session_family="recovery_drills",
        public_label="Recuperación técnica en agua",
        summary="Sesión suave para soltar, mantener sensación de agua y consolidar patrones técnicos.",
        objective="Recuperar sin perder contacto con la mecánica.",
        dose_guidance="Volumen bajo-medio con técnica ligera, espalda, pull suave o patada controlada.",
        progression_axes=("No progresar por carga", "Mejorar sensación de agua", "Acabar más fresco"),
        control_points=("RPE baja", "Agua ligera", "Mejor sensación al terminar"),
        expected_adaptations=("Menor fatiga residual", "Más continuidad técnica"),
        cautions=("No esconder intensidad ni bloques duros cortos",),
        confidence=0.89,
        evidence_ids=("gonzalez_rave_2023_altitude", "pla_2019_swim"),
        csv_examples=("1200m suave + técnica", "8 x 50 espalda / crol suave", "1000m pull muy fácil"),
        fatigue_cost=1,
        min_spacing_days_after=0,
    ),
    WorkoutTemplate(
        template_id="swim_lt0_50s",
        discipline="natación",
        compatible_block_types=("aerobic_capacity_block", "recovery_consolidation_block"),
        session_role="recovery",
        session_family="lt0_50s",
        public_label="LT0 fraccionado 50s",
        summary="Sesión muy controlada de repeticiones cortas para sumar metros y técnica con coste bajísimo.",
        objective="Recuperar y consolidar sensación de agua.",
        dose_guidance="Series muy numerosas y fáciles de 50m con descansos breves o ritmo controlado.",
        progression_axes=("Aumentar metros solo si hay frescura", "Mejorar sensación de agua", "Mantener técnica"),
        control_points=("RPE baja", "Ritmo relajado", "Técnica estable"),
        expected_adaptations=("Más continuidad con poco coste", "Mejor recuperación activa"),
        cautions=("No esconder bloque medio dentro de una sesión fácil",),
        confidence=0.86,
        evidence_ids=("gonzalez_rave_2023_altitude", "pla_2019_swim"),
        csv_examples=("30 x 50m LT0 c/15''", "40 x 50m LT0", "24 x 50m técnica fácil"),
    ),
    WorkoutTemplate(
        template_id="swim_varied_aerobic",
        discipline="natación",
        compatible_block_types=("aerobic_capacity_block", "technical_rebuild_block"),
        session_role="support",
        session_family="varied_aerobic",
        public_label="Variado aeróbico",
        summary="Sesión mezclada para sumar metros, mantener motivación y reforzar patrones sin monotema de intensidad.",
        objective="Construir base general con variedad técnica moderada.",
        dose_guidance="Bloques variados de estilos, patada, técnica y crol continuo en intensidad aeróbica.",
        progression_axes=("Subir metros útiles", "Mejorar continuidad entre bloques", "Mantener calidad técnica"),
        control_points=("Ritmo controlado", "Buena sensación de agua", "Sin picos de lactato"),
        expected_adaptations=("Más continuidad base", "Menor rigidez técnica"),
        cautions=("No usar como excusa para no concretar el foco semanal",),
        confidence=0.8,
        evidence_ids=("gonzalez_rave_2022_im", "gonzalez_rave_2023_altitude"),
        csv_examples=("400 variado + 8 x 100 crol LT1", "3 x (200 estilos + 200 crol)", "1800m variado aeróbico"),
    ),
    WorkoutTemplate(
        template_id="swim_aec_base",
        discipline="natación",
        compatible_block_types=("aerobic_capacity_block", "threshold_development_block"),
        session_role="key",
        session_family="aec_base",
        public_label="AEC / base continua",
        summary="Trabajo de continuidad aeróbica específica en agua para sostener bloques largos y robustos.",
        objective="Aumentar soporte aeróbico útil en piscina.",
        dose_guidance="Series o continuos de volumen medio-alto en intensidad controlada.",
        progression_axes=("Subir volumen útil", "Mejorar regularidad", "Reducir ruido técnico"),
        control_points=("Tiempo por tramo estable", "Técnica constante", "Deriva contenida"),
        expected_adaptations=("Más soporte del umbral y de la competición", "Mejor economía general"),
        cautions=("No perder calidad de brazada por volumen",),
        confidence=0.84,
        evidence_ids=("gonzalez_rave_2022_im", "pla_2019_swim"),
        csv_examples=("3 x 500m aeróbico continuo", "2000m AEC fraccionado", "4 x 400m LT1 c/20''"),
    ),
    WorkoutTemplate(
        template_id="swim_team_quality",
        discipline="natación",
        compatible_block_types=("competition_specific_block", "aerobic_power_block", "threshold_development_block"),
        session_role="key",
        session_family="team_quality",
        public_label="Sesión de club / calidad compartida",
        summary="Sesión de grupo con ritmo vivo, transferencias y estímulo competitivo controlado.",
        objective="Aportar variedad de calidad sin perder el foco fisiológico del bloque.",
        dose_guidance="Trabajo de club con bloques principales definidos y volumen adaptado al foco semanal.",
        progression_axes=("Ajustar metros o repeticiones útiles", "Mantener calidad bajo fatiga social/competitiva"),
        control_points=("No sobrepasar el foco real", "Mantener técnica", "Acabar con margen"),
        expected_adaptations=("Más velocidad útil", "Más tolerancia al contexto competitivo"),
        cautions=("No dejar que el grupo convierta la sesión en otra cosa",),
        confidence=0.79,
        evidence_ids=("gonzalez_rave_2022_im", "cejuela_2022_tri"),
        csv_examples=("Calentamiento + 12 x 100m CSS + técnica", "Club set: 20 x 50m ritmo", "Sesión compartida con bloque principal LT2"),
    ),
    WorkoutTemplate(
        template_id="swim_anc_speed_combo",
        discipline="natación",
        # Fix: sesiones cortas máximas con descanso largo = ANC (Olbrecht). Añadido anaerobic_capacity_block.
        compatible_block_types=("anaerobic_capacity_block", "aerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="anc_speed_combo",
        public_label="ANC natación / series cortas máximas",
        summary="Series cortas casi-máximas con recuperación suficiente: ANC (construir VLamax) o spice AEP.",
        objective="Mejorar tolerancia a ritmos muy altos y reclutamiento.",
        dose_guidance="Series cortas muy rápidas, con recuperación suficiente para preservar calidad.",
        progression_axes=("Añadir pocas repeticiones", "Mejorar calidad técnica a máxima velocidad", "Mantener recuperación"),
        control_points=("Velocidad real alta", "No se desordena la técnica", "Recuperación suficiente"),
        expected_adaptations=("Más punch y velocidad alta", "Más tolerancia a esfuerzos muy intensos"),
        cautions=("Usar poco y bien secuenciado",),
        confidence=0.8,
        evidence_ids=("pla_2019_swim", "ronnestad_2016_block"),
        csv_examples=("12 x 25m ANC c/45''", "8 x 50m máximos c/1'", "2 x (6 x 25m ANC) c/40''"),
    ),
    WorkoutTemplate(
        template_id="swim_restart_rebuild",
        discipline="natación",
        compatible_block_types=("technical_rebuild_block", "recovery_consolidation_block"),
        session_role="recovery",
        session_family="restart_rebuild",
        public_label="Reinicio acuático",
        summary="Sesión puente tras parón, fatiga o pérdida de sensaciones para reordenar técnica y continuidad.",
        objective="Volver a sumar agua sin ruido excesivo.",
        dose_guidance="Volumen medio-bajo, técnica simple y continuidad aeróbica básica.",
        progression_axes=("Aumentar metros muy gradualmente", "Recuperar sensación de agua", "Mantener técnica"),
        control_points=("Sin ahogo ni rigidez", "Mejor sensación al final", "Técnica sencilla"),
        expected_adaptations=("Más continuidad tras pausa", "Mejor reentrada al bloque"),
        cautions=("No reintroducir intensidad demasiado pronto",),
        confidence=0.83,
        evidence_ids=("gonzalez_rave_2023_altitude",),
        csv_examples=("1000m reinicio técnico", "6 x 100m suaves + técnica", "1200m aeróbico fácil"),
    ),
    WorkoutTemplate(
        template_id="swim_strength_velocity",
        discipline="natación",
        compatible_block_types=("aerobic_power_block", "technical_rebuild_block", "competition_specific_block"),
        session_role="support",
        session_family="strength_velocity",
        public_label="Fuerza y velocidad en agua",
        summary="Sesión de soporte para transferir fuerza específica a velocidad sin gran volumen total.",
        objective="Mejorar sensación de agarre y aplicación de fuerza a ritmos altos.",
        dose_guidance="Series cortas o medias con material o foco de fuerza seguido de transferencias rápidas.",
        progression_axes=("Subir calidad de las transferencias", "Ajustar metros rápidos", "Mantener técnica"),
        control_points=("Agarre sólido", "Velocidad limpia", "Sin hundimiento técnico"),
        expected_adaptations=("Más fuerza útil en el agua", "Más transferencia a ritmos altos"),
        cautions=("No convertirlo en una sesión rígida y lenta",),
        confidence=0.79,
        evidence_ids=("gonzalez_rave_2022_im", "cejuela_2022_tri"),
        csv_examples=("8 x 50m palas fuertes + 8 x 25m rápidos", "6 x 100m pull fuerte + 6 x 50m transfer", "12 x 25m resistencia + velocidad"),
    ),
    WorkoutTemplate(
        template_id="strength_general_support",
        discipline="all",
        compatible_block_types=("aerobic_capacity_block", "technical_rebuild_block", "competition_specific_block"),
        session_role="support",
        session_family="general_strength",
        public_label="Fuerza general de soporte",
        summary="Fuerza concurrente simple y sostenible para soportar la adaptación principal del bloque.",
        objective="Mejorar economía y robustez sin contaminar la lectura fisiológica.",
        dose_guidance="2-5 ejercicios básicos, 2-4 series, carga ajustada a la fase.",
        progression_axes=("Mejorar calidad de movimiento", "Subir carga solo cuando hay frescura", "Mantener en competición"),
        control_points=("No arrastra DOMS excesivo", "Técnica sólida", "No empeora la sesión clave siguiente"),
        expected_adaptations=("Mejor economía", "Más robustez mecánica", "Más fuerza útil"),
        cautions=("Separar de sesiones clave", "No forzar fuerza pesada en semanas de descarga"),
        confidence=0.8,
        evidence_ids=("ronnestad_2022_strength", "vikmoen_2021_tri_strength", "storen_2011_running_strength"),
        csv_examples=("Sentadilla + bisagra + core", "Fuerza general 3 x 5", "Circuito fuerza soporte 4 ejercicios", "Empuje + tracción + core"),
    ),
    WorkoutTemplate(
        template_id="strength_anatomical_adaptation",
        discipline="all",
        compatible_block_types=("aerobic_capacity_block", "technical_rebuild_block", "recovery_consolidation_block"),
        session_role="support",
        session_family="anatomical_adaptation",
        public_label="Adaptación anatómica",
        summary="Fase de fuerza simple y tolerable para crear base estructural antes de fuerza más exigente.",
        objective="Preparar tejidos y patrón de fuerza sin mucho coste residual.",
        dose_guidance="Circuitos básicos, cargas moderadas, volumen contenido y técnica limpia.",
        progression_axes=("Mejorar calidad de movimiento", "Subir carga muy gradualmente", "Mantener frescura"),
        control_points=("DOMS contenido", "Patrón correcto", "No empeora la sesión clave"),
        expected_adaptations=("Más robustez estructural", "Mejor tolerancia a fuerza posterior"),
        cautions=("No convertir la sesión en un estímulo principal de fatiga",),
        confidence=0.84,
        evidence_ids=("vikmoen_2021_tri_strength", "storen_2011_running_strength"),
        csv_examples=("Circuito 2 x 10-12 básico", "Adaptación anatómica 6 ejercicios", "Fuerza base con cargas moderadas"),
    ),
    WorkoutTemplate(
        template_id="strength_max_strength",
        discipline="all",
        compatible_block_types=("aerobic_capacity_block", "competition_specific_block"),
        session_role="support",
        session_family="max_strength",
        public_label="Fuerza máxima breve",
        summary="Sesión corta de fuerza pesada bien dosificada para sostener economía y capacidad neuromuscular.",
        objective="Mejorar fuerza útil sin gran volumen accesorio.",
        dose_guidance="Pocos ejercicios principales, series bajas y recuperación completa.",
        progression_axes=("Subir carga progresiva", "Mantener velocidad de ejecución", "Reducir trabajo accesorio innecesario"),
        control_points=("Técnica sólida", "Sin residuo excesivo", "No interfiere en la calidad aeróbica"),
        expected_adaptations=("Más fuerza máxima", "Mejor economía y transferencia"),
        cautions=("No usar en semanas de mucha fatiga acumulada",),
        confidence=0.81,
        evidence_ids=("ronnestad_2022_strength", "vikmoen_2021_tri_strength"),
        csv_examples=("3 x 4 sentadilla + 3 x 4 hip thrust", "4 x 3 fuerza máxima básica", "2 x 3 + 2 x 5 complementarios"),
    ),
    WorkoutTemplate(
        template_id="strength_endurance_circuit",
        discipline="all",
        compatible_block_types=("technical_rebuild_block", "aerobic_capacity_block"),
        session_role="support",
        session_family="strength_endurance_circuit",
        public_label="Fuerza-resistencia",
        summary="Circuito de fuerza-resistencia para reforzar soporte general con poco material y buena adherencia.",
        objective="Sostener robustez y economía general en semanas de construcción.",
        dose_guidance="Circuitos o sets encadenados con repeticiones medias-altas y técnica controlada.",
        progression_axes=("Mejorar continuidad del circuito", "Ajustar repeticiones", "Mantener ejecución limpia"),
        control_points=("No se degrada la técnica", "No deja fatiga excesiva", "Buena adherencia"),
        expected_adaptations=("Más soporte general", "Mejor tolerancia al trabajo concurrente"),
        cautions=("No competir contra el cronómetro",),
        confidence=0.78,
        evidence_ids=("vikmoen_2021_tri_strength", "storen_2011_running_strength"),
        csv_examples=("3 rondas x 6 ejercicios", "Circuito fuerza-resistencia 40''/20''", "2 bloques de 8-12 repeticiones"),
    ),
    WorkoutTemplate(
        template_id="mobility_restore",
        discipline="all",
        compatible_block_types=("recovery_consolidation_block", "technical_rebuild_block"),
        session_role="recovery",
        session_family="mobility_restore",
        public_label="Movilidad y reset",
        summary="Sesión ligera de movilidad para recuperar rango, soltar tensión y facilitar calidad técnica posterior.",
        objective="Mejorar disposición mecánica sin sumar fatiga.",
        dose_guidance="Trabajo breve de hombro, cadera, core o movilidad global, sin componente metabólico relevante.",
        progression_axes=("Mejorar calidad de ejecución", "Ser más consistente", "Ajustar zonas limitantes"),
        control_points=("Más libertad de movimiento", "Menos rigidez", "Sin fatiga añadida"),
        expected_adaptations=("Mejor disposición mecánica", "Más calidad técnica posterior"),
        cautions=("No vender movilidad como sustituto del trabajo principal",),
        confidence=0.8,
        evidence_ids=("gonzalez_rave_2023_altitude", "vikmoen_2021_tri_strength"),
        csv_examples=("Movilidad hombro + escápula", "Reset cadera + tobillo", "20' movilidad global"),
    ),
    WorkoutTemplate(
        template_id="test_profile_anchor",
        discipline="all",
        compatible_block_types=("testing_decision_block", "recovery_consolidation_block"),
        session_role="test",
        session_family="profile_test",
        public_label="Sesión ancla de test",
        summary="Test o sesión comparable para decidir el siguiente bloque y releer el estado del atleta.",
        objective="Obtener una referencia repetible y fisiológicamente interpretable.",
        dose_guidance="Test lactato, CSS, torque o sesión ancla comparable con protocolo estable.",
        progression_axes=("No progresar: comparar", "Protocolizar mejor", "Reducir ruido"),
        control_points=("Mismo protocolo", "Misma frescura", "Misma recogida de datos"),
        expected_adaptations=("No busca adaptación directa", "Busca claridad de decisión"),
        cautions=("No testear fatigado", "No cambiar demasiadas variables a la vez"),
        confidence=0.93,
        evidence_ids=("solli_2017_xc", "cejuela_2022_tri"),
        csv_examples=("Aerobic.profile EVAL", "Test lactato", "CSS TEST (200 & 400m)", "Test torque (4-min)"),
    ),
    WorkoutTemplate(
        template_id="recovery_regeneration",
        discipline="all",
        compatible_block_types=("recovery_consolidation_block", "competition_specific_block", "aerobic_power_block"),
        session_role="recovery",
        session_family="recovery_regeneration",
        public_label="Regeneración y descarga",
        summary="Sesión fácil o descanso activo para permitir que emerja la adaptación.",
        objective="Bajar fatiga y limpiar la señal del siguiente bloque o test.",
        dose_guidance="30-75' muy suaves, técnica ligera o descanso activo.",
        progression_axes=("No progresar", "Mejorar sensación de frescura", "Consolidar rutina"),
        control_points=("RPE baja", "Sensación de piernas más ligeras", "Recuperación al día siguiente"),
        expected_adaptations=("Menor fatiga residual", "Más claridad para el siguiente estímulo"),
        cautions=("No esconder intensidad",),
        confidence=0.95,
        evidence_ids=("solli_2017_xc", "gonzalez_rave_2023_altitude"),
        csv_examples=("40' LT0", "45' natación suave", "60' bici muy suave", "Paseo regenerativo"),
        fatigue_cost=1,
        min_spacing_days_after=0,
    ),
    WorkoutTemplate(
        template_id="full_rest_day",
        discipline="all",
        compatible_block_types=("recovery_consolidation_block", "competition_specific_block"),
        session_role="recovery",
        session_family="full_rest_day",
        public_label="Día completo de descanso",
        summary="Descanso total para absorber carga, bajar fatiga y dejar aparecer la adaptación.",
        objective="Consolidar el bloque y preparar la siguiente carga o competición.",
        dose_guidance="Sin sesión estructurada o con actividad diaria mínima no planificada.",
        progression_axes=("No progresar", "Mejorar sensación de frescura", "Respetar la recuperación"),
        control_points=("Más frescura al día siguiente", "Mejor disposición", "Menos ruido de fatiga"),
        expected_adaptations=("Mayor absorción del bloque", "Más claridad fisiológica"),
        cautions=("No llenarlo con actividad no contabilizada",),
        confidence=0.94,
        evidence_ids=("solli_2017_xc", "cejuela_2022_tri"),
        csv_examples=("Descanso total", "Off", "Sin sesión estructurada"),
        fatigue_cost=1,
        min_spacing_days_after=0,
    ),
    WorkoutTemplate(
        template_id="active_walk_hike",
        discipline="all",
        compatible_block_types=("recovery_consolidation_block", "aerobic_capacity_block"),
        session_role="recovery",
        session_family="active_walk_hike",
        public_label="Caminata / hike activo",
        summary="Actividad suave fuera del deporte principal para mover sin cargar en exceso el sistema específico.",
        objective="Promover recuperación activa y descarga mental.",
        dose_guidance="Paseo, caminata o hike suave sin convertirlo en tirada oculta.",
        progression_axes=("No progresar por carga", "Mejorar sensación de soltura", "Mantener baja exigencia"),
        control_points=("RPE muy baja", "Piernas más sueltas", "No deja residuos"),
        expected_adaptations=("Más recuperación activa", "Menor rigidez general"),
        cautions=("No transformarlo en otra sesión de endurance",),
        confidence=0.86,
        evidence_ids=("solli_2017_xc",),
        csv_examples=("45' caminata", "60' hike suave", "75' paseo activo"),
    ),

    # ════════════════════════════════════════════════════════════════════════
    # SESIONES DEL CSV DE NACHO — patrones reales validados con el entrenador
    # Todas con respaldo en Science of Winning (Olbrecht) y evidencia publicada
    # ════════════════════════════════════════════════════════════════════════

    # ── ANC spice + cola LT1 (patrón Olbrecht Tipo I exacto del CSV) ─────────
    WorkoutTemplate(
        template_id="run_anc_submax_spice",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block", "anaerobic_capacity_block"),
        session_role="key",
        session_family="anc_submax_spice",
        public_label="ANC spice + cola LT1 (patrón Olbrecht)",
        summary="Esfuerzos sub-máximos cortos AL INICIO + cola larga LT1. El patrón AEC Tipo I de Olbrecht extraído directamente del CSV del entrenador.",
        objective="Estimular VLamax y FTIIa con el spice; construir base aeróbica ST con la cola extensiva.",
        dose_guidance="4-5 x 20-30'' al 93-97% → descanso pasivo 60'' → 6-8 x 4' LT1 con 1' descanso.",
        progression_axes=("Alargar la cola LT1 (añadir rep)", "Mantener spice constante", "No subir intensidad del spice"),
        control_points=("Velocidad real alta en el spice", "Cola LT1 limpia sin deriva", "Sin fatiga visible al acabar"),
        expected_adaptations=("Activación mitocondrial dual ST+FTIIa", "Base aeróbica más robusta"),
        cautions=(
            "Spice siempre AL INICIO — Olbrecht: 'the intensive bout at the beginning of the workout'",
            "Descanso pasivo entre el spice y la cola (no trote activo)",
            "La cola es la parte principal — el spice es el condimento",
        ),
        confidence=0.88,
        evidence_ids=("kenneally_2022_5000", "solli_2017_xc"),
        csv_examples=(
            "4 x 20'' Sub-max + 6 x 4' LT1", "5 x 25'' Sub-max + 7 x 4' LT1",
            "4 x 30'' Sub-max + 8 x 4' LT1", "5 x 20'' Sub-max + 3 x 12' LT1",
        ),
        fatigue_cost=4, min_spacing_days_after=2, requires_fresh=True,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills"),
        calentamiento_min=15, calentamiento_template="15' rodaje suave + movilidad.",
        enfriamiento_min=10, enfriamiento_template="10' trote suave sub-LT1.",
        coach_tips=(
            "Es el formato más repetido en el CSV de Nacho: spice corto + cola larga.",
            "La señal clave: si el atleta llega cansado a la cola, el spice era demasiado.",
            "Para VLamax alta: reducir spice a 3 reps o eliminar completamente.",
        ),
        dose_ladder=(
            DoseStep(1, "4×20'' + 6×4' LT1",  0, 2.0, "AEC", "fresh", "Introducción mínima.", 55),
            DoseStep(2, "4×25'' + 7×4' LT1",  0, 2.0, "AEC", "fresh", "Volumen cola +1 rep.", 65),
            DoseStep(3, "5×25'' + 7×4' LT1",  0, 2.0, "AEC", "fresh", "+1 spice, cola igual.", 70),
            DoseStep(4, "5×30'' + 8×4' LT1",  0, 2.0, "AEC", "fresh", "Carga máxima AEC+spice.", 75),
        ),
    ),
    WorkoutTemplate(
        template_id="bike_anc_submax_spice",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block", "anaerobic_capacity_block"),
        session_role="key",
        session_family="anc_submax_spice_bike",
        public_label="MAX + LT1 ciclismo (patrón Nacho)",
        summary="Arrancadas cortas MAX AL INICIO + bloques LT1 extensivos. El '5×10'' MAX + 7×7' LT1' del CSV.",
        objective="Estimular VLamax con las arrancadas y construir base aeróbica ciclista con los bloques LT1.",
        dose_guidance="5-6 x 10'' MAX semi-parado → 2-3' descanso → 5-7 x 7-10' LT1 (170-185W) con 2' descanso.",
        progression_axes=("Alargar los bloques LT1 (+1' por bloque)", "Añadir 1 bloque LT1", "Mantener las arrancadas constantes"),
        control_points=("Potencia pico alta en arrancadas", "Bloques LT1 estables sin deriva", "FC controlada en LT1"),
        expected_adaptations=("Mayor VLamax y fuerza de sprint", "Base aeróbica ciclista más robusta"),
        cautions=(
            "Arrancadas AL INICIO — nunca al final de la salida",
            "Descanso PASIVO entre arrancadas y el bloque LT1 principal",
        ),
        confidence=0.90,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=(
            "5 x 10'' MAX + 7 x 7' LT1 (170-180W)", "6 x 10'' MAX + 6 x 8' LT1",
            "6 x 10'' MAX + 5 x 9' LT1", "6 x 10'' MAX + 5 x 10' LT1",
            "4 x 15'' MAX + 6 x 10' LT1",
        ),
        fatigue_cost=4, min_spacing_days_after=2, requires_fresh=True,
        incompatible_adjacent_families=("lt2_halfpace", "over_under_threshold", "vo2_power"),
        calentamiento_min=10, calentamiento_template="10' suave 100-130w.",
        enfriamiento_min=15, enfriamiento_template="15' sub-LT1 muy suave.",
        coach_tips=(
            "Formato más repetido en el CSV de Nacho con Fuerza MAX + cola LT1.",
            "La cola LT1 es el cuerpo de la sesión — las arrancadas son el spice.",
        ),
        dose_ladder=(
            DoseStep(1, "5×10'' + 5×7' LT1",  0, 2.0, "AEC", "fresh", "Intro conservadora.", 70),
            DoseStep(2, "5×10'' + 6×8' LT1",  0, 2.0, "AEC", "fresh", "Cola más larga.", 80),
            DoseStep(3, "6×10'' + 6×9' LT1",  0, 2.0, "AEC", "fresh", "+1 arrancada, cola ↑.", 90),
            DoseStep(4, "6×10'' + 5×10' LT1", 0, 2.0, "AEC", "fresh", "Carga máxima del CSV.", 100),
        ),
    ),

    # ── Fuerza Q2 — ANC puro en bici ─────────────────────────────────────────
    WorkoutTemplate(
        template_id="bike_fuerza_q2",
        discipline="ciclismo",
        compatible_block_types=("anaerobic_capacity_block",),
        session_role="key",
        session_family="fuerza_q2",
        public_label="Fuerza Q2 — arrancadas semi-paradas",
        summary="Arrancadas semi-paradas (cadencia <40rpm) a máxima velocidad. ANC puro en bici: estimula VLamax con máxima aplicación de fuerza.",
        objective="Desarrollar VLamax (capacidad glucolítica) con máxima aplicación de fuerza desde arranque.",
        dose_guidance="6-12 x 8-10'' semi-parado (<40rpm) a máxima velocidad. Descanso PASIVO 2-3'. Al inicio de la sesión.",
        progression_axes=("Añadir 2 repeticiones", "Mejorar potencia pico", "Mantener descanso completo"),
        control_points=("Potencia pico máxima en cada arrancada", "Descanso completo respetado", "Técnica de pedaleo no colapsa"),
        expected_adaptations=("Mayor VLamax", "Más potencia pico de sprint", "Mejor economía de sprint"),
        cautions=(
            "Semi-parado = cadencia <40-50rpm ANTES del esfuerzo",
            "SOLO al inicio de la sesión — nunca al final",
            "Descanso PASIVO: no pedalear suave, parar completamente 2-3'",
        ),
        confidence=0.91,
        evidence_ids=("ronnestad_2022_strength", "ronnestad_2016_block"),
        csv_examples=(
            "6 x 8'' Fuerza Q2 semi-parado", "8 x 8'' Fuerza Q2",
            "10 x 8'' Fuerza Q2 max velocidad", "12 x 10'' Fuerza Q2",
        ),
        fatigue_cost=4, min_spacing_days_after=2, requires_fresh=True,
        incompatible_adjacent_families=("lt2_halfpace", "over_under_threshold", "vo2_power"),
        calentamiento_min=15, calentamiento_template="15' suave 100-130w cadencia libre.",
        enfriamiento_min=30, enfriamiento_template="30' sub-LT1 muy suave (cola extensiva obligatoria post-ANC).",
        coach_tips=(
            "Si el pico de potencia cae >15% entre la 1ª y la última: descanso insuficiente.",
            "Es exactamente la 'Fuerza Q2' del CSV de Nacho — cientos de sesiones documentadas.",
        ),
        dose_ladder=(
            DoseStep(1, "6×8'' Q2",   0, 3.0, "ANC", "fresh", "ANC mínimo viable.", 60),
            DoseStep(2, "8×8'' Q2",   0, 3.0, "ANC", "fresh", "Volumen estándar del CSV.", 70),
            DoseStep(3, "10×8'' Q2",  0, 3.0, "ANC", "fresh", "Referencia principal Nacho.", 80),
            DoseStep(4, "12×10'' Q2", 0, 3.0, "ANC", "fresh", "Carga alta, solo atletas robustos.", 90),
        ),
    ),

    # ── LT1 escalado (patrón regresivo-progresivo del CSV) ───────────────────
    WorkoutTemplate(
        template_id="run_escalated_lt1",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block", "threshold_development_block"),
        session_role="key",
        session_family="escalated_lt1",
        public_label="LT1 escalado (formato regresivo-progresivo)",
        summary="Repeticiones LT1 en formato decreciente: 15-12-10-8-6' con 1' descanso. Mantiene calidad en cada rep reduciendo la duración.",
        objective="Acumular tiempo útil a LT1 con alta calidad interna mantenida al reducir progresivamente la duración.",
        dose_guidance="15-12-10-8-6' LT1 con 1' descanso activo entre repeticiones. O variante 20-15-12-10' LT1.",
        progression_axes=("Progresar a 20-15-12-10' LT1", "Reducir el descanso a 45''", "Añadir una rep final corta"),
        control_points=("FC y/o lactato estables en todas las reps", "Ritmo LT1 real mantenido", "Sin deriva en últimas reps"),
        expected_adaptations=("Mayor tiempo útil a LT1", "Mejor economía aeróbica", "Más robustez al volumen subumbral"),
        cautions=("No convertirlo en sesión LT2 acelerando en las últimas reps cortas",),
        confidence=0.87,
        evidence_ids=("kenneally_2022_5000", "tonnessen_2020_frequency"),
        csv_examples=(
            "15-12-10-8-6' LT1 D:1'", "20-15-12-10' LT1 D:1'30''",
            "12-10-8-6' LT1 D:1'", "15-12-10' LT1 D:1'",
        ),
        fatigue_cost=3, min_spacing_days_after=1,
        calentamiento_min=15, calentamiento_template="15' progresivo suave.",
        enfriamiento_min=10, enfriamiento_template="10' trote suave.",
        coach_tips=(
            "El formato decreciente permite mantener calidad cuando el atleta empieza a fatigarse.",
            "Olbrecht: volumen útil LT1 progresivo semana a semana — este formato lo consigue manteniendo el peldaño.",
        ),
        dose_ladder=(
            DoseStep(1, "12-10-8-6' LT1",   0, 1.5, "AEC", "normal", "Intro escalado corto.", 36),
            DoseStep(2, "15-12-10-8' LT1",  0, 1.5, "AEC", "normal", "Escalado estándar.", 45),
            DoseStep(3, "15-12-10-8-6' LT1",0, 1.5, "AEC", "normal", "Formato completo del CSV.", 51),
            DoseStep(4, "20-15-12-10' LT1", 0, 1.5, "AEC", "normal", "Variante larga.", 57),
        ),
    ),

    # ── SIT + LT1 progresivo (patrón AEP/THR del CSV) ────────────────────────
    WorkoutTemplate(
        template_id="bike_sit_lt1_progressive",
        discipline="ciclismo",
        compatible_block_types=("aerobic_power_block", "threshold_development_block"),
        session_role="key",
        session_family="sit_lt1_progressive",
        public_label="SIT + LT1 progresivo (patrón del CSV)",
        summary="Bloque D2 + series SIT (Sprint Interval Training 30'') + cola LT1 progresiva. Progresión documentada en el CSV: 6→7→8 SITs.",
        objective="Desarrollar potencia aeróbica alta (AEP) con el SIT y sostener base umbral con la cola LT1.",
        dose_guidance="10' D2 → 6-8 x 30'' SIT D:4' → 3-4 x 12-15' D2/LT1.",
        progression_axes=("Añadir 1 SIT por sesión", "Alargar cola LT1 (+1 rep o +2')", "Mantener SIT en máxima potencia"),
        control_points=("Potencia máxima en cada SIT", "Recuperación completa entre SITs", "Cola LT1 estable sin deriva"),
        expected_adaptations=("Mayor potencia aeróbica", "Más eficiencia cardiovascular a umbral", "Mejor VO2max"),
        cautions=(
            "SIT requiere recuperación COMPLETA (4') entre repeticiones — no reducir",
            "La cola D2/LT1 es parte esencial del estímulo AEC, no saltársela",
        ),
        confidence=0.88,
        evidence_ids=("ronnestad_2016_block", "gibala_2012_sprint"),
        csv_examples=(
            "10' D2 + 6 x 30'' SIT D:4' + 3 x 15' D2/LT1",
            "10' D2 + 7 x 30'' SIT D:4' + 3 x 15' D2",
            "10' D2 + 8 x 30'' SIT D:4' + 4 x 12' D2/LT1",
        ),
        fatigue_cost=5, min_spacing_days_after=2, requires_fresh=True,
        incompatible_adjacent_families=("lt2_halfpace", "over_under_threshold", "vo2_power"),
        calentamiento_min=15, calentamiento_template="15' suave 100-140w.",
        enfriamiento_min=20, enfriamiento_template="20' sub-LT1 muy suave.",
        coach_tips=(
            "Progresión exacta del CSV: semana 1→6 SITs, semana 2→7, semana 3→8. La palanca es la densidad.",
            "Si en el SIT la potencia cae >20% respecto a la 1ª, la recuperación era insuficiente.",
        ),
        dose_ladder=(
            DoseStep(1, "6×30'' SIT + 3×15' LT1", 0, 2.0, "AEP", "fresh", "Intro SIT.", 90),
            DoseStep(2, "7×30'' SIT + 3×15' LT1", 0, 2.0, "AEP", "fresh", "Progresión +1 SIT.", 100),
            DoseStep(3, "8×30'' SIT + 4×12' LT1", 0, 2.0, "AEP", "fresh", "Carga máxima del CSV.", 110),
        ),
    ),

    # ── LT2 torque (rep cortas baja cadencia) ────────────────────────────────
    WorkoutTemplate(
        template_id="bike_lt2_torque_reps",
        discipline="ciclismo",
        compatible_block_types=("threshold_development_block", "competition_specific_block"),
        session_role="key",
        session_family="lt2_torque_reps",
        public_label="LT2 torque — repeticiones baja cadencia",
        summary="Repeticiones LT2 a cadencia baja (50-55rpm) con recuperación a cadencia alta. Estimula fuerza de pedaleo y eficiencia neuromuscular en zona umbral.",
        objective="Desarrollar fuerza específica de umbral y eficiencia de pedaleo a potencia LT2.",
        dose_guidance="5-6 x 1' LT2 @50-55rpm (205-220W) + 2' Z1 @95rpm. Total 5-6 repeticiones.",
        progression_axes=("Añadir 1 repetición", "Alargar a 90'' las repeticiones", "Progresar potencia 5W"),
        control_points=("Cadencia baja mantenida en las reps LT2", "Cadencia alta limpia en la recuperación", "Potencia estable en todas las reps"),
        expected_adaptations=("Mayor fuerza de pedaleo a umbral", "Mejor economía ciclista", "Más reclutamiento muscular LT2"),
        cautions=("No más de 3 semanas consecutivas de torque — riesgo rodilla",),
        confidence=0.85,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=(
            "5 x 1' LT2 @50rpm + 2' Z1 @95rpm",
            "6 x 1' LT2 @55rpm + 2' Z1 @95rpm",
            "5 x 90'' LT2 torque + 2' Z1",
        ),
        fatigue_cost=4, min_spacing_days_after=2,
        calentamiento_min=15, calentamiento_template="15' progresivo suave + 4 x 20'' activación 80%.",
        enfriamiento_min=15, enfriamiento_template="15' suave cadencia libre.",
        coach_tips=(
            "Patrón muy característico del CSV de Nacho: alternancia cadencia baja/alta.",
            "El objetivo es la eficiencia neuromuscular, no solo la potencia.",
        ),
    ),

    # ── VO2 microburst running (uLT1 intro + micro-intervalos) ───────────────
    WorkoutTemplate(
        template_id="run_anc_vo2_short",
        discipline="running",
        compatible_block_types=("aerobic_power_block",),
        session_role="key",
        session_family="anc_vo2_short",
        public_label="uLT1 + VO2 microburst (patrón Nacho)",
        summary="Calentamiento LT1 + micro-intervalos VO2 con progresión de relación trabajo:descanso. Patrón '8' uLT1 + 20×20''/15''' del CSV.",
        objective="Desarrollar potencia aeróbica máxima (VO2max) con alta densidad de estimulación en poco tiempo total.",
        dose_guidance="8' LT1 → 20×20''/15'' recuperación (semana 1) → 18×30''/20'' (semana 2) → 16×40''/30'' (semana 3).",
        progression_axes=("Progresar relación T:D (20/15 → 30/20 → 40/30)", "Mantener intensidad máxima en cada rep", "No añadir más repeticiones — progresar la relación"),
        control_points=("Velocidad VO2max mantenida en primeras 15 reps", "Sin caída >5% en las últimas", "Recuperación insuficiente = ritmo cae"),
        expected_adaptations=("Mayor VO2max utilizable", "Más potencia aeróbica en carrera", "Mejor economía a velocidades altas"),
        cautions=(
            "Máximo 2 sesiones AEP/semana — Olbrecht: 'muy traicionero en recuperación'",
            "La progresión es la relación T:D, no el número de repeticiones",
        ),
        confidence=0.86,
        evidence_ids=("kenneally_2022_5000", "tonnessen_2020_frequency"),
        csv_examples=(
            "8' LT1 + VO2: 20 x 20''/15''", "8' LT1 + VO2: 18 x 30''/20''",
            "8' LT1 + VO2: 16 x 40''/30''",
        ),
        fatigue_cost=5, min_spacing_days_after=2, requires_fresh=True,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills"),
        calentamiento_min=20, calentamiento_template="20' progresivo + 4 x 100m aceleraciones.",
        enfriamiento_min=20, enfriamiento_template="20' sub-LT1 muy suave — obligatorio post-AEP.",
        coach_tips=(
            "Formato exacto de Nacho: 'uLT1 + VO2 micro'. Progresión de 3 semanas documentada.",
            "La clave es la relación T:D — progresar eso, no las repeticiones.",
        ),
        dose_ladder=(
            DoseStep(1, "8' LT1 + 20×20''/15''", 0, 2.0, "AEP", "fresh", "Intro: relación 20/15.", 55),
            DoseStep(2, "8' LT1 + 18×30''/20''", 0, 2.0, "AEP", "fresh", "Progresión T:D 30/20.", 60),
            DoseStep(3, "8' LT1 + 16×40''/30''", 0, 2.0, "AEP", "fresh", "Carga máxima 40/30.", 65),
        ),
    ),

    # ── E2 progresivo medio (zona de transición AEC→THR) ─────────────────────
    WorkoutTemplate(
        template_id="run_e2_progressive_medium",
        discipline="running",
        compatible_block_types=("threshold_development_block",),
        session_role="support",
        session_family="e2_progressive_medium",
        public_label="Progresivo E2 por zonas (transición AEC→THR)",
        summary="Escalada continua de zonas: E1→E2→D2→LT1→E1. Conecta las intensidades sin picos. Sesión de soporte en semanas THR.",
        objective="Conectar las zonas de trabajo de forma continua para mantener robustez aeróbica alta durante semanas de umbral.",
        dose_guidance="10' E1 → 30' E2 → 20' D2 → 10' LT1 activo → 10' E1 bajada. Total 80'.",
        progression_axes=("Alargar el bloque D2 (+5')", "Acortar E1 inicial", "Progresar a LT1 más activo"),
        control_points=("Zonas limpias y separadas", "Sin picos de intensidad", "Bajada limpia al E1 final"),
        expected_adaptations=("Mejor economía en zona media", "Soporte aeróbico durante bloque THR", "Más robustez subumbral"),
        cautions=("No sustituir por una sesión plana — la escalada de zonas es el estímulo",),
        confidence=0.83,
        evidence_ids=("kenneally_2022_5000", "solli_2017_xc"),
        csv_examples=(
            "10' E1 + 30' E2 + 20' D2 + 10' LT1 + 10' E1",
            "10' E1 + 25' E2 + 20' D2 + 15' LT1 + 10' E1",
        ),
        fatigue_cost=3, min_spacing_days_after=1,
        calentamiento_min=0, calentamiento_template="El E1 inicial es el calentamiento.",
        enfriamiento_min=0, enfriamiento_template="El E1 final es el enfriamiento.",
        coach_tips=(
            "Útil el día después de una sesión LT2 — mantiene el volumen sin añadir estrés.",
            "Si el atleta salta la D2 y va directo a LT1, no es un progresivo — corregir.",
        ),
    ),

    # ── Half pace largo ciclismo (3×30' HALF PACE) ───────────────────────────
    WorkoutTemplate(
        template_id="bike_lt2_halfpace_long",
        discipline="ciclismo",
        compatible_block_types=("competition_specific_block", "threshold_development_block"),
        session_role="key",
        session_family="lt2_halfpace_long",
        public_label="Half Pace largo — 3×30' (ciclismo)",
        summary="Versión larga del half-pace: 3 bloques de 30' a potencia sostenible alta. Para atletas con umbral consolidado.",
        objective="Traducir el umbral consolidado en capacidad de sostener potencia alta durante periodos prolongados.",
        dose_guidance="3 x 30' a 210-225W (Half Pace LT1+/LT2-) con 5' descanso. Precedido de 15' suave.",
        progression_axes=("Progresar la potencia 5W/bloque", "Reducir descanso a 4'", "Añadir un 4º bloque de 20'"),
        control_points=("Potencia estable en los 3 bloques", "FC no deriva más de 5bpm entre inicio y final del bloque", "Lactato comparable entre bloques"),
        expected_adaptations=("Más potencia sostenible a umbral", "Mejor economía de pedaleo prolongado"),
        cautions=("Solo con umbral consolidado — no usar como primer estímulo THR",),
        confidence=0.87,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=(
            "3 x 30' HALF PACE (210-225W)", "3 x 30' Half pace D:5'",
            "3 x 25' Half pace + 1 x 15' LT1",
        ),
        fatigue_cost=4, min_spacing_days_after=2,
        calentamiento_min=15, calentamiento_template="15' suave 100-140w.",
        enfriamiento_min=15, enfriamiento_template="15' muy suave para bajar FC.",
        coach_tips=(
            "Versión larga del half-pace del CSV de Nacho: 3×30' vs 3×20' standard.",
            "Solo cuando el atleta ya tiene el umbral suficientemente consolidado.",
        ),
    ),

    # ════════════════════════════════════════════════════════════════════════
    # BLOQUE ANC — Anaerobic Capacity Block (Olbrecht)
    # Objetivo: elevar VLamax (tasa máxima de glucólisis).
    # Patrón: intervalos MUY CORTOS (15-40s), casi-máximos/máximos, descanso PASIVO ≥ tiempo esfuerzo.
    # Uso: base_late + perfil diesel (VLamax baja) + prueba corta (5k, 10k, sprint tri, pool 400).
    # Referencia: Olbrecht SoW cap.2, líneas 1143-1151.
    # ════════════════════════════════════════════════════════════════════════

    WorkoutTemplate(
        template_id="run_anc_short_reps",
        discipline="running",
        compatible_block_types=("anaerobic_capacity_block", "aerobic_capacity_block"),
        session_role="key",
        session_family="anc_short_reps",
        public_label="ANC running — esfuerzos cortos casi-máximos",
        summary="Series muy cortas y explosivas (20-40s) para estimular VLamax sin destruir la base aeróbica.",
        objective="Elevar capacidad glucolítica (VLamax) y tolerancia al esfuerzo corto e intenso.",
        dose_guidance="6-10 x 20-40'' al 93-98% con descanso PASIVO 45-90''. AL INICIO del entreno, seguido de base sub-LT1.",
        progression_axes=("Añadir una repetición", "Ajustar intensidad al 95-98%", "Mantener calidad en todas"),
        control_points=("Velocidad real alta en cada repetición", "Descanso pasivo respetado", "Siguiente serie útil"),
        expected_adaptations=("Mayor capacidad glucolítica (VLamax)", "Mejor tolerancia al esfuerzo corto e intenso"),
        cautions=(
            "Siempre AL INICIO de la sesión — nunca al final (Olbrecht líneas 1066-1067)",
            "Descanso PASIVO obligatorio: sentado o parado, no trote activo",
            "Máximo 1-2 sesiones ANC/semana en fase base",
            "En atletas con VLamax ya alta (ratio LT1/LT2 < 0.79): dosis mínima 3-4 reps",
            "Olbrecht: 'thin ice' — si la base es débil, el ANC puede destruirla",
        ),
        confidence=0.86,
        evidence_ids=("storen_2011_running_strength", "ronnestad_2016_block"),
        csv_examples=("5 x 8'' hill sprints 95-98%", "5 x 20'' strides 95%", "8 x 20'' recta casi-máxima", "3 x 20'' + 2 x 30'' progresivos"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills"),
        calentamiento_min=20,
        calentamiento_template="15-20' rodaje suave + movilidad dinámica ligera.",
        enfriamiento_min=15,
        enfriamiento_template="15-20' rodaje sub-LT1 muy suave (la 'cola extensiva' AEC de Olbrecht).",
        coach_tips=(
            "Si la última serie es peor que la primera, el descanso era insuficiente.",
            "Este es el 'spice' AEC de Olbrecht: siempre al inicio, nunca al final.",
            "En atletas con LT1/LT2 ratio < 0.79 (VLamax alta): reducir a 3 reps o eliminar.",
        ),
    ),
    WorkoutTemplate(
        template_id="bike_anc_power_sprints",
        discipline="ciclismo",
        compatible_block_types=("anaerobic_capacity_block", "aerobic_capacity_block"),
        session_role="key",
        session_family="anc_power_sprints",
        public_label="ANC ciclismo — arrancadas de fuerza cortas",
        summary="Arrancadas semi-paradas a máxima velocidad para estimular VLamax y fuerza específica de sprint.",
        objective="Desarrollar capacidad anaeróbica glucolítica (VLamax) con máxima aplicación de fuerza.",
        dose_guidance="6-12 x 8-15'' semi-parado a velocidad máxima. Descanso PASIVO 2-3'. Seguido de base LT1.",
        progression_axes=("Añadir repeticiones de 2 en 2", "Mejorar potencia pico", "Mantener recuperación completa"),
        control_points=("Potencia pico máxima en cada arrancada", "Descanso completo respetado", "Calidad técnica del pedaleo"),
        expected_adaptations=("Mayor VLamax ciclista", "Más fuerza específica y potencia pico", "Mejor economía de sprint"),
        cautions=(
            "AL INICIO de la sesión, nunca al final de un bloque LT1/LT2",
            "Descanso PASIVO: bajarse de la bici o pedalear muy suave 2-3'",
            "En atletas con VLamax alta: dosis reducida 4-6 repeticiones",
            "Separar 48h de sesión LT2 o VO2",
        ),
        confidence=0.88,
        evidence_ids=("ronnestad_2022_strength", "ronnestad_2016_block"),
        csv_examples=(
            "6 x 8'' Fuerza Q2 semi-parado",
            "8 x 8'' Fuerza Q2 máx velocidad",
            "10 x 8'' Fuerza Q2 máx velocidad",
            "12 x 10'' arrancadas semi-paradas",
        ),
        fatigue_cost=4,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("lt2_halfpace", "over_under_threshold", "vo2_power"),
        calentamiento_min=15,
        calentamiento_template="15' suave 100-130w cadencia libre.",
        enfriamiento_min=30,
        enfriamiento_template="30-45' sub-LT1 muy suave (la 'cola extensiva' AEC de Olbrecht).",
        coach_tips=(
            "Semi-parado = cadencia <40-50rpm antes del esfuerzo. El objetivo es máxima fuerza, no velocidad sostenida.",
            "Si el pico de potencia cae >15% entre sprints: descanso insuficiente.",
            "Estas arrancadas son las 'Fuerza Q2' del CSV de Nacho — formato de referencia con docenas de sesiones reales.",
        ),
        dose_ladder=(
            DoseStep(1, "6×8'' ANC",   0, 2.0, "ANC",  "fresh", "Introducción; pocas repeticiones, máxima calidad.", 60),
            DoseStep(2, "8×8'' ANC",   0, 2.0, "ANC",  "fresh", "Primer volumen real ANC en bici.", 70),
            DoseStep(3, "10×8'' ANC",  0, 2.0, "ANC",  "fresh", "Clásico del CSV — referencia de la mayoría de sesiones.", 80),
            DoseStep(4, "12×10'' ANC", 0, 3.0, "ANC",  "fresh", "Carga alta; solo atletas robustos con señal positiva.", 90),
        ),
    ),
    WorkoutTemplate(
        template_id="swim_anc_capacity_sets",
        discipline="natación",
        compatible_block_types=("anaerobic_capacity_block", "aerobic_capacity_block"),
        session_role="key",
        session_family="anc_capacity_sets",
        public_label="ANC natación — series cortas glucolíticas",
        summary="Series muy cortas y casi-máximas para estimular VLamax en agua. Patrón ANC de Olbrecht.",
        objective="Elevar capacidad anaeróbica glucolítica (VLamax) en natación.",
        dose_guidance="12-20 x 25m casi-máximos con descanso PASIVO 30-45''. AL INICIO, seguido de volumen LT1.",
        progression_axes=("Añadir repeticiones de 2 en 2", "Afinar velocidad", "Mantener calidad estable"),
        control_points=("Velocidad estable en las primeras 8 reps", "Descanso pasivo respetado", "Técnica no colapsa"),
        expected_adaptations=("Mayor VLamax en natación", "Mejor base para AEP y ANP posteriores"),
        cautions=(
            "AL INICIO de la sesión según Olbrecht — nunca al final",
            "Descanso PASIVO (agarrado al borde), no activo",
            "Atletas con VLamax alta: reducir a 8-10 repeticiones",
            "No combinar con CSS/umbral el mismo día",
        ),
        confidence=0.87,
        evidence_ids=("gonzalez_rave_2022_im", "pla_2019_swim"),
        csv_examples=("12 x 25m ANC c/40'' pasivo", "16 x 25m ANC c/35'' pasivo", "3 x (4 x 25m ANC) c/45''"),
        fatigue_cost=4,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("css_threshold", "vo2_anaerobic"),
        calentamiento_min=15,
        calentamiento_template="400-600m suave + 8 x 25m técnica progresiva.",
        enfriamiento_min=20,
        enfriamiento_template="400-800m LT1 muy suave — la 'cola extensiva' de Olbrecht.",
        coach_tips=(
            "Cada 25m = sprint corto real. Si todos salen al mismo tiempo sin diferencia, están demasiado lentos.",
            "Control: insertar un all-out en rep 5 — si es >1.5s más rápido, el resto iba demasiado lento.",
            "Olbrecht: 'puede usarse como spice para AEC' — tiene doble función de ANC puro y spice AEC.",
        ),
    ),

    # ════════════════════════════════════════════════════════════════════════
    # BLOQUE ANP — Anaerobic Power Block (Olbrecht)
    # Objetivo: tolerancia a la acidosis y expresión máxima de potencia anaeróbica.
    # Patrón: velocidad MÁXIMA, distancias muy cortas, descanso MUY BREVE (5-15s).
    # Uso: pre_comp EXCLUSIVAMENTE + pruebas cortas (5k, 10k, sprint tri, pool 400).
    # Referencia: Olbrecht SoW cap.2, líneas 1303-1331. "sprinters concentrate on ANP in competition period"
    # IMPORTANTE: máx 2 semanas consecutivas — "carries more risks than advantages" (Olbrecht línea 1321)
    # ════════════════════════════════════════════════════════════════════════

    WorkoutTemplate(
        template_id="run_anp_sprint_tolerance",
        discipline="running",
        compatible_block_types=("anaerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="anp_sprint_tolerance",
        public_label="ANP running — sprints con descanso mínimo",
        summary="Sprints máximos con descanso muy breve (5-15s) para tolerancia anaeróbica. ANP de Olbrecht.",
        objective="Maximizar ANP: tolerancia a la acidosis y uso de VLamax en sprint final de carrera.",
        dose_guidance="8-12 x 30-60m a velocidad máxima con 5-15'' descanso. Total ≤600m de trabajo real.",
        progression_axes=("Añadir pocas repeticiones", "Reducir marginalmente el descanso", "Mantener velocidad máxima"),
        control_points=("Velocidad máxima en la primera rep", "Caída controlada ≤5% entre 1ª y última", "Técnica de carrera limpia"),
        expected_adaptations=("Mayor tolerancia a la acidosis", "Más ANP utilizable en sprint final"),
        cautions=(
            "SOLO en periodo de competición (pre_comp) — nunca en base_early o base_late",
            "Máximo 2-3 semanas consecutivas (Olbrecht línea 1321: 'más riesgo que beneficio')",
            "ANP baja tanto capacidad aeróbica como anaeróbica — compensar con mucho sub-LT1 en la semana",
            "5-10s de descanso = ANP; 45-90s = ANC. La diferencia es el descanso.",
        ),
        confidence=0.82,
        evidence_ids=("storen_2011_running_strength", "ronnestad_2016_block"),
        csv_examples=("8 x 30m máximos c/10''", "10 x 50m sprint c/10''", "6 x 60m c/15'' descansando"),
        fatigue_cost=5,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills", "vo2_30_30"),
        calentamiento_min=25,
        calentamiento_template="20-25' progresivo suave + 4 x 80m aceleraciones 70-85% con recuperación completa.",
        enfriamiento_min=20,
        enfriamiento_template="20-30' sub-LT1 muy suave — obligatorio post-ANP (Olbrecht: 'el resto muy lento').",
        coach_tips=(
            "ANP real: el primer sprint debe ser el mejor. Si el 5º iguala el 1º, el descanso es demasiado largo (= ANC).",
            "Olbrecht (línea 1316): atletas con ANC moderada ven efectos en 10-17 días.",
            "Usar solo las 6-8 semanas antes de competición objetivo o como test de capacidad anaeróbica.",
        ),
    ),
    WorkoutTemplate(
        template_id="bike_anp_high_intensity",
        discipline="ciclismo",
        compatible_block_types=("anaerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="anp_high_intensity",
        public_label="ANP ciclismo — sprints densos de velocidad máxima",
        summary="Sprints máximos con descanso muy breve (10-15s) para tolerancia anaeróbica. ANP en bici.",
        objective="Elevar ANP: porcentaje de VLamax utilizable durante ataques y finales.",
        dose_guidance="8-15 x 15-30'' a potencia máxima con 5-15'' descanso activo mínimo. Total ≤600m equivalente.",
        progression_axes=("Añadir repeticiones de 2 en 2", "Reducir descanso 2-3s", "Mantener potencia máxima"),
        control_points=("Potencia máxima en primeras reps", "Caída controlada en últimas", "Técnica no colapsa"),
        expected_adaptations=("Más tolerancia a la acidosis", "Mejor punch y capacidad de ataque repetido"),
        cautions=(
            "SOLO periodo específico/pre-competición — no en base general",
            "Máximo 2 semanas consecutivas — luego semana de baja intensidad",
            "Las ANP tiran hacia abajo AEC y ANC — compensar con mucho sub-LT1 la misma semana",
        ),
        confidence=0.81,
        evidence_ids=("ronnestad_2022_strength", "mateo_march_2025_wt"),
        csv_examples=("10 x 20'' MAX c/10'' activo", "12 x 15'' sprint c/10''", "8 x 30'' potencia máxima c/15''"),
        fatigue_cost=5,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("lt2_halfpace", "over_under_threshold", "vo2_power"),
        calentamiento_min=20,
        calentamiento_template="20' suave 100-140w + 4 x 15'' activación 80% max potencia c/2' rec completa.",
        enfriamiento_min=30,
        enfriamiento_template="30-45' sub-LT1 muy suave obligatorio para contrarrestar impacto en capacidades.",
        coach_tips=(
            "Diferencia con ANC: 10'' descanso = ANP; 2-3' descanso = ANC. Mismo estímulo, adaptación diferente.",
            "Olbrecht: 'ANP baja capacidad aeróbica y anaeróbica si el resto no es suficientemente lento'.",
            "Ideal para ciclistas de criterium, triatlón sprint/olímpico, para el sprint final de prueba.",
        ),
    ),
    WorkoutTemplate(
        template_id="swim_anp_tolerance",
        discipline="natación",
        compatible_block_types=("anaerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="anp_tolerance",
        public_label="ANP natación — sprints máximos con mínimo descanso",
        summary="Velocidad máxima con descanso muy breve (5-10s) para tolerancia anaeróbica. ANP puro de Olbrecht.",
        objective="Maximizar ANP: tolerancia a la acidosis y porcentaje de VLamax utilizable en competición.",
        dose_guidance="10-16 x 25-50m a velocidad máxima con 5-10'' descanso. Total ≤400m de trabajo real.",
        progression_axes=("Añadir repeticiones de 2 en 2", "Reducir descanso 2-3s", "Mantener velocidad máxima"),
        control_points=("Velocidad máxima en la primera rep", "Caída controlada", "Técnica básica mantenida"),
        expected_adaptations=("Toughening contra acidosis", "Mayor uso de VLamax en carrera"),
        cautions=(
            "Checklist Olbrecht (líneas 1323-1327): velocidad máxima, distancias cortas, descanso 5-10s",
            "Total ≤250m para nadadores jóvenes; hasta 600m en élite fraccionado con 10-20' entre bloques",
            "SOLO en competition training period; máximo 2 semanas consecutivas",
            "Siempre seguido de trabajo largo y lento sub-LT1 el mismo día o el día siguiente",
        ),
        confidence=0.85,
        evidence_ids=("gonzalez_rave_2022_im", "pla_2019_swim"),
        csv_examples=("12 x 25m máx c/8'' pasivo", "8 x 50m máx c/10''", "2 x (6 x 25m) c/8'' D.15' entre bloques"),
        fatigue_cost=5,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("css_threshold", "vo2_anaerobic", "anc_speed_combo"),
        calentamiento_min=20,
        calentamiento_template="600-800m suave + 8 x 25m progresivos 70-95%.",
        enfriamiento_min=20,
        enfriamiento_template="400-600m sub-LT1 muy suave.",
        coach_tips=(
            "Olbrecht distingue ANP de ANC SOLO por el descanso: 5-10s = ANP; 30-45s pasivo = ANC.",
            "Primera rep debe ser la más rápida. Si la 5ª iguala la 1ª, el descanso es demasiado largo.",
            "Para larga distancia: usar raramente y con dosis mínima (4-6 reps); priorizar AEP.",
        ),
    ),

    # ════════════════════════════════════════════════════════════════════════
    # AEC CON SPICE — Patrón Olbrecht Tipo I
    # El patrón AEC real de Olbrecht: [esfuerzo ANC corto AL INICIO] + [cola extensiva sub-LT1]
    # Estimula mitocondrias FTIIa con el spice y construye base aeróbica con la cola.
    # Referencia: Olbrecht SoW líneas 1053-1067, 1284-1290.
    # ════════════════════════════════════════════════════════════════════════

    WorkoutTemplate(
        template_id="run_aec_spiced",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block",),
        session_role="key",
        session_family="aec_spiced",
        public_label="AEC con spice al inicio (patrón Olbrecht)",
        summary="Esfuerzos cortos intensos AL INICIO + cola larga sub-LT1. Patrón AEC Tipo I de Olbrecht.",
        objective="Estimular mitocondrias FTIIa con el spice y construir base aeróbica ST con la cola extensiva.",
        dose_guidance="[3-5 x 20-30'' ANC al 93-97% con descanso pasivo 60''] → [25-40' sub-LT1 muy controlado].",
        progression_axes=("Alargar la cola extensiva", "Añadir 1 repetición de spice", "Mantener calidad del spice"),
        control_points=("Spice de velocidad real alta", "Cola sub-LT1 limpia sin acelerar", "Sin fatiga acumulada visible al final"),
        expected_adaptations=("Adaptación mitocondrial dual en ST y FTIIa", "Mejor base aeróbica específica", "Más economía subumbral"),
        cautions=(
            "El spice va AL INICIO, nunca al final — Olbrecht líneas 1066-1067",
            "La cola extensiva debe ser sub-LT1 — no LT1 activo ni E2",
            "No convertir el spice en sesión ANC completa — es un 'condimento', no el plato principal",
        ),
        confidence=0.86,
        evidence_ids=("kenneally_2022_5000", "solli_2017_xc"),
        csv_examples=(
            "4 x 20'' rectas progresivas + 30' suave LT0",
            "5 x 8'' cuesta + 35' sub-LT1",
            "3 x 30'' strides 95% + 4 x 10' LT1",
        ),
        fatigue_cost=3,
        min_spacing_days_after=1,
        calentamiento_min=15,
        calentamiento_template="15' progresivo muy suave.",
        enfriamiento_min=5,
        enfriamiento_template="5' andando o trote mínimo.",
        coach_tips=(
            "El spice activa FTIIa; la cola construye base ST — doble estímulo en una sesión.",
            "Si los strides/cuestas acaban siendo el cuerpo de la sesión, es ANC, no AEC con spice.",
            "El atleta debe acabar sin fatiga residual — si no, el spice era demasiado o la cola demasiado larga.",
        ),
    ),
    WorkoutTemplate(
        template_id="bike_aec_spiced",
        discipline="ciclismo",
        compatible_block_types=("aerobic_capacity_block",),
        session_role="key",
        session_family="aec_spiced_bike",
        public_label="AEC con spice en bici — arrancadas + base",
        summary="Arrancadas cortas máximas AL INICIO + base sub-LT1. Patrón AEC Tipo I de Olbrecht en bici.",
        objective="Estimular mitocondrias FTIIa con las arrancadas y construir base aeróbica con bloque sub-LT1.",
        dose_guidance="[4-6 x 8-12'' MAX arrancadas semi-paradas] → [45-75' sub-LT1 continuo].",
        progression_axes=("Añadir 1-2 arrancadas", "Alargar la base sub-LT1", "Mantener calidad de las arrancadas"),
        control_points=("Potencia pico alta en cada arrancada", "Base sub-LT1 limpia sin deriva", "FC controlada durante la base"),
        expected_adaptations=("Mejor estimulación mitocondrial dual", "Base aeróbica más robusta", "Más eficiencia sub-LT1"),
        cautions=(
            "Arrancadas AL INICIO — nunca en medio ni al final de la salida",
            "El bloque sub-LT1 debe ser realmente sub-LT1 — no LT1 activo ni sweet spot",
            "En atletas con VLamax muy alta: reducir arrancadas a 3-4 o eliminar",
        ),
        confidence=0.87,
        evidence_ids=("pinot_2015_grand_tour", "mateo_march_2025_wt"),
        csv_examples=(
            "5 x 10'' MAX + 7 x 7' LT1 (170-180w)",
            "6 x 10'' MAX + 6 x 8' LT1",
            "4 x 8'' arrancadas + 60' continuo sub-LT1",
        ),
        fatigue_cost=3,
        min_spacing_days_after=1,
        calentamiento_min=10,
        calentamiento_template="10' suave 100-130w.",
        enfriamiento_min=10,
        enfriamiento_template="10' muy suave para completar sesión.",
        coach_tips=(
            "Este es exactamente el formato 'MAX + LT1' que usa Nacho repetidamente en el CSV.",
            "Olbrecht: las arrancadas son el spice que estimula FTIIa; la base LT1 estimula ST fibers.",
        ),
    ),
    WorkoutTemplate(
        template_id="swim_aec_spiced",
        discipline="natación",
        compatible_block_types=("aerobic_capacity_block",),
        session_role="key",
        session_family="aec_spiced_swim",
        public_label="AEC con spice en agua — series cortas + cola extensiva",
        summary="ANC corto AL INICIO + volumen sub-LT1. Patrón AEC Tipo I de Olbrecht en natación.",
        objective="Estimular mitocondrias FTIIa y construir base aeróbica específica en agua.",
        dose_guidance="[6-10 x 25m ANC casi-máximos c/40'' pasivo] → [800-1500m sub-LT1 continuo].",
        progression_axes=("Alargar la cola extensiva", "Añadir 1-2 repeticiones ANC", "Mantener calidad del ANC"),
        control_points=("Velocidad alta en las repeticiones ANC", "Cola extensiva relajada", "Sin espiral de fatiga"),
        expected_adaptations=("Adaptación mitocondrial dual FTIIa + ST", "Mejor base aeróbica acuática"),
        cautions=(
            "ANC al INICIO — Olbrecht líneas 1284-1286: 'especia del entrenamiento de capacidad aeróbica'",
            "Cola extensiva a LA1 o más lento, no LT1 activo",
            "No usar si hay test o sesión CSS el día siguiente",
        ),
        confidence=0.84,
        evidence_ids=("gonzalez_rave_2022_im", "pla_2019_swim"),
        csv_examples=(
            "8 x 25m ANC c/40'' + 1200m suave",
            "6 x 25m velocidad + 1500m LT0-LT1",
            "10 x 25m progresivos + 800m técnica suave",
        ),
        fatigue_cost=3,
        min_spacing_days_after=1,
        calentamiento_min=10,
        calentamiento_template="300-400m suave + 4 x 25m técnica.",
        enfriamiento_min=5,
        enfriamiento_template="200m suave para completar.",
        coach_tips=(
            "Formato directo de Olbrecht (línea 1288-1290): velocidad de competición breve + cola muy lenta.",
            "La cola extensiva ACTIVA (no pausa) es parte del estímulo AEC — no saltársela.",
        ),
    ),

    # ════════════════════════════════════════════════════════════════════════
    # AEP REAL — Patrón Olbrecht
    # Diferencia clave vs VO2 intervals: descanso MUY BREVE (5-20s), NO 3-4'.
    # Distancia cercana a la de competición. Iniciado ≥6 semanas antes de comp.
    # Referencia: Olbrecht SoW líneas 1269-1298.
    # ════════════════════════════════════════════════════════════════════════

    WorkoutTemplate(
        template_id="run_aep_race_pace",
        discipline="running",
        compatible_block_types=("aerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="aep_race_pace",
        public_label="AEP running — ritmo competición con descanso mínimo",
        summary="Repeticiones a ritmo de prueba con 10-20'' de descanso. AEP real de Olbrecht en running.",
        objective="Elevar el porcentaje de VO2max utilizable a ritmo de competición.",
        dose_guidance="8-12 x 400m a ritmo objetivo con 10-15'' descanso pasivo. Progresar hacia 6-8 x 800m con 15-20''.",
        progression_axes=("Alargar la repetición", "Reducir el descanso", "Acercar el ritmo al objetivo real"),
        control_points=("Ritmo de prueba mantenido", "Descanso mínimo respetado", "Última repetición útil"),
        expected_adaptations=("Mayor % VO2max en carrera", "Mejor economía específica a ritmo objetivo", "Más potencia aeróbica"),
        cautions=(
            "Iniciar ≥6 semanas antes de competición — AEP tarda 4+ semanas en mostrar efecto (Olbrecht línea 1267)",
            "Máximo 1-2 sesiones AEP/semana — 'muy traicionero' en recuperación (Olbrecht línea 1264)",
            "AEP baja AEC y ANC si el resto de sesiones no son suficientemente lentas",
            "Añadir sesión extra de regeneración la misma semana",
        ),
        confidence=0.84,
        evidence_ids=("kenneally_2022_5000", "tonnessen_2020_frequency"),
        csv_examples=(
            "8 x 400m ritmo objetivo c/12''",
            "10 x 400m race pace c/15'' pasivo",
            "6 x 800m a ritmo 10k c/20''",
        ),
        fatigue_cost=5,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("lt2_cruise_intervals", "threshold_continuous", "vo2_hills"),
        calentamiento_min=20,
        calentamiento_template="20' progresivo + 4 x 100m al ritmo objetivo c/1' recuperación completa.",
        enfriamiento_min=20,
        enfriamiento_template="20' sub-LT1 muy suave — obligatorio post-AEP.",
        coach_tips=(
            "La diferencia con VO2 intervals es el DESCANSO: aquí 10-20s, no 3-4'. Eso es AEP Olbrecht.",
            "Progresión de Olbrecht: semana 1 = 50x100m c/15s → semana 3 = 10x400m c/15s.",
            "Si el ritmo cae >3s/km en las últimas reps: acortar el volumen, no forzar el ritmo.",
        ),
    ),
    WorkoutTemplate(
        template_id="swim_aep_pace_sets",
        discipline="natación",
        compatible_block_types=("aerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="aep_pace_sets",
        public_label="AEP natación — velocidad de prueba con mínimo descanso",
        summary="Series a velocidad de competición con descanso de 5-15s. AEP puro de Olbrecht progresivo.",
        objective="Maximizar el porcentaje de VO2max utilizable en distancias ≥200m.",
        dose_guidance="Fase 1: 20 x 50m c/15s. Fase 2: 10 x 100m c/15s. Fase 3: 6 x 200m c/15s. Velocidad = ritmo de prueba.",
        progression_axes=("Alargar repetición manteniendo el descanso", "Acercar la velocidad al objetivo", "Reducir marginalmente el descanso"),
        control_points=("Velocidad de prueba mantenida", "Descanso 5-15s respetado estrictamente", "Última repetición útil"),
        expected_adaptations=("Mayor % VO2max en carrera", "Mejor economía a velocidad de prueba", "Más potencia aeróbica"),
        cautions=(
            "Solo para distancias ≥200m — no relevante para 50-100m (Olbrecht línea 1256-1259)",
            "Iniciar ≥6 semanas antes de la competición objetivo",
            "Máximo 2 sesiones AEP/semana — 'muy traicionero' en recuperación",
        ),
        confidence=0.88,
        evidence_ids=("gonzalez_rave_2022_im", "pla_2019_swim"),
        csv_examples=(
            "20 x 50m ritmo prueba c/15s",
            "10 x 100m race pace c/15s",
            "6 x 200m c/15s velocidad de prueba",
            "3 x (3 x 100m ritmo prueba) c/15s D.3' entre bloques",
        ),
        fatigue_cost=5,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("css_threshold", "vo2_anaerobic", "anp_tolerance"),
        calentamiento_min=20,
        calentamiento_template="600-800m suave + 6 x 50m progresivos hasta ritmo de prueba.",
        enfriamiento_min=15,
        enfriamiento_template="400-600m muy suave.",
        coach_tips=(
            "Olbrecht (líneas 1277-1281): la distancia sube semana a semana pero el descanso no.",
            "Esta es la sesión 'más traicionera' de Olbrecht: parece fácil al principio pero la recuperación es lenta.",
        ),
    ),

    # ════════════════════════════════════════════════════════════════════════
    # AEC LARGO SUB-LT1 — Patrón Olbrecht Tipo II (regeneración activa de volumen)
    # ════════════════════════════════════════════════════════════════════════

    WorkoutTemplate(
        template_id="run_regenerative_long",
        discipline="running",
        compatible_block_types=("aerobic_capacity_block", "recovery_consolidation_block"),
        session_role="support",
        session_family="regenerative_long",
        public_label="Tirada larga regenerativa AEC",
        summary="Rodaje largo puramente sub-LT1 para AEC Tipo II de Olbrecht: regeneración activa de alto volumen.",
        objective="Construir base aeróbica con volumen sin coste interno relevante. Contrarrestar sesiones intensas.",
        dose_guidance="90-120' exclusivamente sub-LT1. Respiración nasal como control. Sin zonas medias ni finales vivos.",
        progression_axes=("Subir tiempo total muy gradualmente", "Mejorar sensación de frescura al acabar", "Practicar nutrición"),
        control_points=("FC por debajo de LT1 todo el rato", "Sin deriva cardíaca", "Sensación de margen total"),
        expected_adaptations=("Más durabilidad sub-LT1", "Mejor recuperación entre sesiones intensas", "Soporte del AEC"),
        cautions=(
            "Si la FC deriva hacia LT1 activo, bajar el ritmo o caminar tramos",
            "No usar el 'largo' como entrenamiento duro disfrazado",
            "Olbrecht: regeneration training = AEC (línea 1100) — es base, no descanso",
        ),
        confidence=0.89,
        evidence_ids=("kenneally_2022_5000", "solli_2017_xc"),
        csv_examples=("90' E1", "105' E1", "120' aeróbico muy suave", "90' + 20' final controlado"),
        fatigue_cost=2,
        min_spacing_days_after=0,
        calentamiento_min=0,
        calentamiento_template="Primeros 10' son el calentamiento integrado — empezar muy suave.",
        enfriamiento_min=0,
        enfriamiento_template="Última media hora ya es enfriamiento natural.",
        coach_tips=(
            "Control: puedes mantener conversación completa durante toda la sesión.",
            "Respiración nasal como herramienta — si no puedes, baja el ritmo.",
            "Olbrecht: 'incluso el trabajo de regeneración a muy baja intensidad construye capacidad aeróbica'.",
        ),
    ),
    WorkoutTemplate(
        template_id="swim_aec_long_session",
        discipline="natación",
        compatible_block_types=("aerobic_capacity_block",),
        session_role="support",
        session_family="aec_long_session",
        public_label="AEC largo en agua — volumen sub-LT1",
        summary="Alto volumen a intensidad muy baja para construir base aeróbica acuática según Olbrecht.",
        objective="Máxima adaptación cardiovascular y mitocondrial en fibras ST con volumen sostenido a baja intensidad.",
        dose_guidance="2000-3500m continuos o fraccionados en zona sub-LT1. Variedad de materiales.",
        progression_axes=("Subir metros útiles gradualmente", "Mantener técnica limpia", "Añadir variedad de estilos"),
        control_points=("Velocidad estable o levemente progresiva", "Sin picos de FC", "Técnica sostenida"),
        expected_adaptations=("Base aeróbica amplia", "Más eficiencia cardiovascular", "Mayor tolerancia al volumen"),
        cautions=(
            "La intensidad debe ser LA1 o más lento — ni siquiera LT1 activo",
            "No convertir en 'sesión de calidad disfrazada'",
            "Puede incluir técnica, variedad de estilos, snorkel — todo a intensidad baja",
        ),
        confidence=0.85,
        evidence_ids=("gonzalez_rave_2022_im", "gonzalez_rave_2023_altitude"),
        csv_examples=("3000m variado aeróbico", "2500m crol + estilos sub-LT1", "3 x 800m suave c/30s", "4000m fondo aeróbico"),
        fatigue_cost=2,
        min_spacing_days_after=0,
        calentamiento_min=0,
        calentamiento_template="Primeros 400m integrados como calentamiento.",
        enfriamiento_min=0,
        enfriamiento_template="Últimos 200m técnica ligera.",
        coach_tips=(
            "Olbrecht (líneas 1003-1008): AEC = 'alto volumen, baja intensidad, poco descanso'. Esta sesión lo materializa.",
            "Las sesiones '40 x 50m LT0' del CSV son perfectas AEC — continúa con ese formato.",
        ),
    ),

    # ════════════════════════════════════════════════════════════════════════
    # BRICK AEP TRIATLÓN
    # ════════════════════════════════════════════════════════════════════════

    WorkoutTemplate(
        template_id="tri_brick_aep",
        discipline="triatlón",
        compatible_block_types=("aerobic_power_block", "competition_specific_block"),
        session_role="key",
        session_family="brick_aep",
        public_label="Brick AEP triatlón — bici+carrera a ritmo de prueba",
        summary="Brick a potencia y ritmo de competición para AEP específico de triatlón.",
        objective="Transferir AEP a la secuencia real bici-carrera: potencia sostenible + ritmo post-T2.",
        dose_guidance="45-75' bici a potencia de prueba + T2 + 15-25' carrera a ritmo objetivo. Pausa T2 ≤2'.",
        progression_axes=("Alargar el segmento de carrera", "Acercar la potencia de bici al objetivo real", "Reducir tiempo T2"),
        control_points=("Potencia bici estable", "Ritmo carrera post-T2 sostenible", "Buena transición técnica"),
        expected_adaptations=("Mejor transferencia competitiva", "Reducción del desajuste bici-carrera", "Más AEP específico de triatlón"),
        cautions=(
            "Solo fases específicas o pre-competición — no en AEC",
            "Si la carrera post-T2 colapsa, reducir duración/intensidad de la bici",
            "No encadenar con otra sesión exigente el día siguiente",
        ),
        confidence=0.84,
        evidence_ids=("cejuela_2022_tri", "vikmoen_2021_tri_strength"),
        csv_examples=(
            "60' bici race pace + T2: 20' running a ritmo objetivo",
            "75' bici LT2 + T2: 15' a ritmo 10k",
            "2 x 25' potencia prueba + T2: 30' progresivo a ritmo objetivo",
        ),
        fatigue_cost=5,
        min_spacing_days_after=2,
        requires_fresh=True,
        incompatible_adjacent_families=("lt2_halfpace", "lt2_cruise_intervals", "threshold_continuous"),
        calentamiento_min=15,
        calentamiento_template="15' bici suave previo al bloque principal.",
        enfriamiento_min=10,
        enfriamiento_template="10' trote suave post-carrera.",
        coach_tips=(
            "La T2 es parte del entrenamiento: practica cambio de zapatillas, no dejes más de 90s.",
            "Primeros 3' de carrera son críticos: si salen muy rápido o lentos, ajustar la potencia de bici.",
            "Usar lactato post-T2 al minuto 5 de carrera como referencia fisiológica del coste real.",
        ),
    ),
)


WORKOUT_BLUEPRINTS: dict[tuple[str, str], dict[str, tuple[DraftSlot, ...]]] = {
    # ── Running ───────────────────────────────────────────────────────────────
    # build_peak = semana de carga máxima (Olbrecht wave principle)
    # AEC build_peak incluye spice ANC (patrón Olbrecht: esfuerzos cortos AL INICIO)
    ("running", "aerobic_capacity_block"): {
        "load":       (DraftSlot(2, "run_lt1_extensive"),   DraftSlot(4, "run_economy_strides"), DraftSlot(6, "run_long_aerobic"), DraftSlot(1, "strength_general_support")),
        "build":      (DraftSlot(2, "run_lt1_long_reps"),   DraftSlot(4, "run_lt1_extensive"),   DraftSlot(6, "run_long_aerobic")),
        "build_peak": (DraftSlot(2, "run_anc_submax_spice"),DraftSlot(4, "run_lt1_long_reps"),   DraftSlot(6, "run_regenerative_long")),
        "recovery":   (DraftSlot(2, "run_lt0_recovery"),    DraftSlot(4, "run_economy_strides"), DraftSlot(6, "recovery_regeneration")),
    },
    ("running", "threshold_development_block"): {
        "load":       (DraftSlot(2, "run_lt2_cruise"),        DraftSlot(4, "run_lt1_extensive"),    DraftSlot(6, "run_long_aerobic"), DraftSlot(1, "strength_general_support")),
        "build":      (DraftSlot(2, "run_subthreshold_reps"), DraftSlot(4, "run_lt1_long_reps"),    DraftSlot(6, "run_progressive_aerobic")),
        "build_peak": (DraftSlot(2, "run_escalated_lt1"),     DraftSlot(4, "run_lt1_lt2_mix"),      DraftSlot(6, "run_long_aerobic")),
        "recovery":   (DraftSlot(2, "run_lt0_recovery"),      DraftSlot(5, "run_lt1_extensive"),    DraftSlot(6, "test_profile_anchor")),
    },
    ("running", "aerobic_power_block"): {
        "load":       (DraftSlot(2, "run_uLT1_vo2_combo"),  DraftSlot(4, "run_lt1_extensive"),   DraftSlot(6, "run_long_aerobic")),
        "build":      (DraftSlot(2, "run_vo2_hills"),        DraftSlot(5, "run_hill_sprints"),     DraftSlot(6, "run_lt1_extensive")),
        "build_peak": (DraftSlot(2, "run_anc_vo2_short"),   DraftSlot(4, "run_vo2_hills"),        DraftSlot(6, "run_lt1_extensive")),
        "recovery":   (DraftSlot(2, "run_lt0_recovery"),    DraftSlot(5, "run_economy_strides"),  DraftSlot(6, "test_profile_anchor")),
    },
    ("running", "competition_specific_block"): {
        "load":     (DraftSlot(2, "run_specific_durability"), DraftSlot(4, "run_lt2_cruise"),      DraftSlot(6, "run_long_aerobic")),
        "specific": (DraftSlot(2, "run_specific_pace_reps"),  DraftSlot(5, "run_hill_sprints"),    DraftSlot(6, "recovery_regeneration")),
        "recovery": (DraftSlot(2, "run_lt0_recovery"),        DraftSlot(5, "test_profile_anchor")),
    },
    ("running", "technical_rebuild_block"): {
        "load":     (DraftSlot(2, "run_economy_strides"), DraftSlot(4, "run_progressive_aerobic"), DraftSlot(1, "strength_general_support")),
        "recovery": (DraftSlot(2, "run_lt0_recovery"),    DraftSlot(5, "run_hill_sprints")),
    },
    # ── Ciclismo ──────────────────────────────────────────────────────────────
    ("ciclismo", "aerobic_capacity_block"): {
        "load":       (DraftSlot(2, "bike_lt1_blocks"),        DraftSlot(4, "bike_torque_support"),    DraftSlot(6, "bike_long_endurance"), DraftSlot(1, "strength_general_support")),
        "build":      (DraftSlot(2, "bike_fatmax_endurance"),  DraftSlot(5, "bike_cadence_efficiency"),DraftSlot(6, "bike_long_endurance")),
        "build_peak": (DraftSlot(2, "bike_anc_submax_spice"),  DraftSlot(4, "bike_lt1_blocks"),        DraftSlot(6, "bike_long_endurance")),
        "recovery":   (DraftSlot(2, "bike_lt0_recovery"),      DraftSlot(5, "bike_lt1_blocks"),        DraftSlot(6, "test_profile_anchor")),
    },
    ("ciclismo", "threshold_development_block"): {
        "load":       (DraftSlot(2, "bike_lt2_halfpace"),        DraftSlot(4, "bike_lt1_blocks"),   DraftSlot(6, "bike_long_endurance")),
        "build":      (DraftSlot(2, "bike_subthreshold_blocks"), DraftSlot(5, "bike_lt1_blocks"),   DraftSlot(6, "bike_fatmax_endurance")),
        "build_peak": (DraftSlot(2, "bike_over_under_threshold"),DraftSlot(5, "bike_aero_stability"),DraftSlot(6, "bike_fatmax_endurance")),
        "recovery":   (DraftSlot(2, "bike_lt0_recovery"),        DraftSlot(5, "bike_lt1_blocks"),   DraftSlot(6, "test_profile_anchor")),
    },
    ("ciclismo", "aerobic_power_block"): {
        "load":       (DraftSlot(2, "bike_vo2_power"),         DraftSlot(4, "bike_lt1_blocks"),        DraftSlot(6, "bike_torque_support")),
        "build":      (DraftSlot(2, "bike_vo2_power"),         DraftSlot(5, "bike_sprint_neuromuscular"),DraftSlot(6, "bike_long_endurance")),
        "build_peak": (DraftSlot(2, "bike_sit_lt1_progressive"),DraftSlot(5, "bike_vo2_power"),         DraftSlot(6, "bike_long_endurance")),
        "recovery":   (DraftSlot(2, "bike_lt0_recovery"),      DraftSlot(5, "bike_lt1_blocks"),        DraftSlot(6, "test_profile_anchor")),
    },
    ("ciclismo", "competition_specific_block"): {
        "load":     (DraftSlot(2, "bike_lt2_halfpace"),        DraftSlot(5, "bike_transition_specific"), DraftSlot(6, "bike_long_endurance")),
        "specific": (DraftSlot(2, "bike_transition_specific"), DraftSlot(4, "bike_aero_stability"),      DraftSlot(6, "recovery_regeneration")),
        "recovery": (DraftSlot(2, "bike_lt0_recovery"),        DraftSlot(5, "test_profile_anchor")),
    },
    # ── Natación ──────────────────────────────────────────────────────────────
    ("natación", "technical_rebuild_block"): {
        "load":     (DraftSlot(1, "swim_technical_alignment"), DraftSlot(3, "swim_pull_snorkel_alignment"), DraftSlot(5, "strength_general_support")),
        "build":    (DraftSlot(1, "swim_technical_alignment"), DraftSlot(4, "swim_aerobic_continuity"),      DraftSlot(6, "swim_speed_turns")),
        "recovery": (DraftSlot(2, "swim_recovery_drills"),     DraftSlot(5, "test_profile_anchor")),
    },
    ("natación", "aerobic_capacity_block"): {
        "load":       (DraftSlot(1, "swim_aerobic_continuity"), DraftSlot(3, "swim_technical_alignment"),    DraftSlot(5, "swim_lt1_broken_sets")),
        "build":      (DraftSlot(1, "swim_lt1_broken_sets"),    DraftSlot(3, "swim_pull_snorkel_alignment"), DraftSlot(6, "swim_aerobic_continuity")),
        "build_peak": (DraftSlot(1, "swim_anc_capacity_sets"),  DraftSlot(3, "swim_lt1_broken_sets"),        DraftSlot(6, "swim_aec_long_session")),
        "recovery":   (DraftSlot(2, "swim_recovery_drills"),    DraftSlot(5, "swim_technical_alignment")),
    },
    ("natación", "threshold_development_block"): {
        "load":       (DraftSlot(1, "swim_css_threshold"),    DraftSlot(3, "swim_technical_alignment"), DraftSlot(5, "swim_lt1_broken_sets")),
        "build":      (DraftSlot(1, "swim_css_threshold"),    DraftSlot(4, "swim_speed_turns"),          DraftSlot(6, "swim_aerobic_continuity")),
        "build_peak": (DraftSlot(1, "swim_aep_pace_sets"),    DraftSlot(3, "swim_css_threshold"),        DraftSlot(6, "swim_aerobic_continuity")),
        "recovery":   (DraftSlot(2, "swim_recovery_drills"),  DraftSlot(5, "test_profile_anchor")),
    },
    ("natación", "competition_specific_block"): {
        "load":     (DraftSlot(1, "swim_css_threshold"),       DraftSlot(3, "swim_race_pace_specific"), DraftSlot(5, "swim_open_water_specific")),
        "specific": (DraftSlot(1, "swim_open_water_specific"), DraftSlot(4, "swim_speed_turns"),        DraftSlot(6, "recovery_regeneration")),
        "recovery": (DraftSlot(2, "swim_recovery_drills"),     DraftSlot(5, "test_profile_anchor")),
    },

    # ── ANC (Anaerobic Capacity Block) ────────────────────────────────────────
    # Spice ANC AL INICIO de las sesiones + cola extensiva sub-LT1.
    # Olbrecht: el ANC siempre va al inicio, nunca al final.
    ("running", "anaerobic_capacity_block"): {
        "load":       (DraftSlot(2, "run_aec_spiced"),        DraftSlot(4, "run_lt1_extensive"),  DraftSlot(6, "run_long_aerobic")),
        "build":      (DraftSlot(2, "run_anc_submax_spice"),  DraftSlot(4, "run_lt1_long_reps"),  DraftSlot(6, "run_regenerative_long")),
        "build_peak": (DraftSlot(2, "run_anc_short_reps"),    DraftSlot(4, "run_lt1_long_reps"),  DraftSlot(6, "run_regenerative_long")),
        "recovery":   (DraftSlot(2, "run_lt0_recovery"),      DraftSlot(5, "run_economy_strides"),DraftSlot(6, "recovery_regeneration")),
    },
    ("ciclismo", "anaerobic_capacity_block"): {
        "load":       (DraftSlot(2, "bike_aec_spiced"),        DraftSlot(4, "bike_lt1_blocks"),DraftSlot(6, "bike_long_endurance")),
        "build":      (DraftSlot(2, "bike_anc_submax_spice"),  DraftSlot(5, "bike_lt1_blocks"),DraftSlot(6, "bike_fatmax_endurance")),
        "build_peak": (DraftSlot(2, "bike_anc_power_sprints"), DraftSlot(5, "bike_lt1_blocks"),DraftSlot(6, "bike_fatmax_endurance")),
        "recovery":   (DraftSlot(2, "bike_lt0_recovery"),      DraftSlot(5, "bike_lt1_blocks"),DraftSlot(6, "test_profile_anchor")),
    },
    ("natación", "anaerobic_capacity_block"): {
        "load":       (DraftSlot(1, "swim_aec_spiced"),         DraftSlot(3, "swim_aerobic_continuity"),DraftSlot(5, "swim_technical_alignment")),
        "build":      (DraftSlot(1, "swim_anc_capacity_sets"),  DraftSlot(3, "swim_lt1_broken_sets"),   DraftSlot(6, "swim_aec_long_session")),
        "build_peak": (DraftSlot(1, "swim_anc_speed_combo"),    DraftSlot(3, "swim_lt1_broken_sets"),   DraftSlot(6, "swim_aec_long_session")),
        "recovery":   (DraftSlot(2, "swim_recovery_drills"),    DraftSlot(5, "swim_technical_alignment")),
    },

    # ── ANP (Anaerobic Power Block) ───────────────────────────────────────────
    # Pre-comp exclusivamente. Pruebas cortas. Máx 2-3 semanas.
    # Siempre compensar con mucho sub-LT1 en la semana (Olbrecht).
    ("running", "anaerobic_power_block"): {
        "load": (DraftSlot(2, "run_anp_sprint_tolerance"), DraftSlot(4, "run_lt1_extensive"), DraftSlot(6, "run_regenerative_long")),
        "specific": (DraftSlot(2, "run_aep_race_pace"), DraftSlot(5, "run_anp_sprint_tolerance"), DraftSlot(6, "run_lt0_recovery")),
        "recovery": (DraftSlot(2, "run_lt0_recovery"), DraftSlot(5, "test_profile_anchor")),
    },
    ("ciclismo", "anaerobic_power_block"): {
        "load": (DraftSlot(2, "bike_anp_high_intensity"), DraftSlot(4, "bike_lt1_blocks"), DraftSlot(6, "bike_long_endurance")),
        "specific": (DraftSlot(2, "bike_anp_high_intensity"), DraftSlot(5, "bike_aero_stability"), DraftSlot(6, "recovery_regeneration")),
        "recovery": (DraftSlot(2, "bike_lt0_recovery"), DraftSlot(5, "test_profile_anchor")),
    },
    ("natación", "anaerobic_power_block"): {
        "load": (DraftSlot(1, "swim_anp_tolerance"), DraftSlot(3, "swim_aerobic_continuity"), DraftSlot(5, "swim_technical_alignment")),
        "specific": (DraftSlot(1, "swim_aep_pace_sets"), DraftSlot(4, "swim_anp_tolerance"), DraftSlot(6, "swim_recovery_drills")),
        "recovery": (DraftSlot(2, "swim_recovery_drills"), DraftSlot(5, "test_profile_anchor")),
    },
}


def validate_microcycle_spacing(
    slots: list[tuple[int, WorkoutTemplate]],
) -> list[str]:
    """Valida la compatibilidad de un microciclo semanal.

    Args:
        slots: lista de (day_offset, WorkoutTemplate) para la semana.
               day_offset usa convención 1=lunes … 7=domingo.

    Returns:
        Lista de strings de warning (vacía = sin conflictos detectados).
        No lanza excepciones: es una función de advertencia, no de bloqueo.
    """
    warnings: list[str] = []
    sorted_slots = sorted(slots, key=lambda x: x[0])

    for i, (day_i, tmpl_i) in enumerate(sorted_slots):
        for day_j, tmpl_j in sorted_slots[i + 1 :]:
            gap = day_j - day_i

            # Dos sesiones de alta fatiga demasiado próximas
            if (
                tmpl_i.fatigue_cost >= 4
                and tmpl_j.fatigue_cost >= 4
                and gap < tmpl_i.min_spacing_days_after
                and tmpl_i.min_spacing_days_after > 0
            ):
                warnings.append(
                    f"Día {day_i} ({tmpl_i.session_family}, fatiga={tmpl_i.fatigue_cost}) → "
                    f"día {day_j} ({tmpl_j.session_family}, fatiga={tmpl_j.fatigue_cost}): "
                    f"spacing insuficiente (mínimo {tmpl_i.min_spacing_days_after}d, hay {gap}d)."
                )

            # Familias declaradas incompatibles en días consecutivos
            if gap == 1 and tmpl_j.session_family in tmpl_i.incompatible_adjacent_families:
                warnings.append(
                    f"Día {day_i} ({tmpl_i.session_family}) es incompatible con "
                    f"día {day_j} ({tmpl_j.session_family}) en días consecutivos."
                )

            # Sesión que requiere frescura tras sesión de coste ≥ 3
            if gap == 1 and tmpl_j.requires_fresh and tmpl_i.fatigue_cost >= 3:
                warnings.append(
                    f"Día {day_j} ({tmpl_j.session_family}) requiere estado fresco "
                    f"pero día {day_i} ({tmpl_i.session_family}) tiene fatiga={tmpl_i.fatigue_cost}."
                )

    return warnings


ROLE_ORDER = {
    "test": 0,
    "key": 1,
    "support": 2,
    "recovery": 3,
}

BLOCK_ORDER = {
    "aerobic_capacity_block":      0,  # AEC
    "threshold_development_block": 1,  # AEC→AEP transición
    "anaerobic_capacity_block":    2,  # ANC — nuevo (Olbrecht)
    "aerobic_power_block":         3,  # AEP
    "anaerobic_power_block":       4,  # ANP — nuevo (Olbrecht)
    "competition_specific_block":  5,  # COMP
    "technical_rebuild_block":     6,
    "recovery_consolidation_block":7,
    "testing_decision_block":      8,
}


def variants_for_template(template: WorkoutTemplate) -> list[WorkoutVariant]:
    family = template.session_family
    discipline = template.discipline
    objective = template.objective.lower()

    if "lt0" in family or "recovery" in family or family in {"full_rest_day", "active_walk_hike", "mobility_restore"}:
        return [
            WorkoutVariant("Corto", "recovery", "20-40' o volumen mínimo", "Cuando hay fatiga alta o vienes de dos días densos."),
            WorkoutVariant("Estándar", "recovery", template.dose_guidance, "La versión base para consolidar sin añadir ruido."),
            WorkoutVariant("Con técnica", "recovery", "Muy suave + gesto técnico ligero", "Si quieres recuperar sin perder sensaciones."),
        ]

    if family in {"technical_alignment", "pull_snorkel_alignment", "economy_strides", "hill_sprints", "cadence_efficiency", "cadmax_neuro", "speed_turns", "strength_velocity"}:
        return [
            WorkoutVariant("Técnica pura", "quality", "Pocas repeticiones y descansos completos", "Cuando la prioridad es calidad del gesto."),
            WorkoutVariant("Transferencia", "mixed", "Parte técnica + bloque corto aplicando la mejora", "Cuando quieres llevar el gesto a velocidad o carga útil."),
            WorkoutVariant("Recordatorio", "support", "Versión breve de mantenimiento", "Útil dentro de semanas más cargadas."),
        ]

    if "lt1" in family or "aerobic" in family or "fatmax" in family or "aec" in family or "e2" in family:
        return [
            WorkoutVariant("Continuo", "continuous", "1 bloque continuo estable", "Si quieres máxima simplicidad y lectura interna limpia."),
            WorkoutVariant("Bloques largos", "interval", "3-6 repeticiones largas", "Si prefieres repartir el tiempo útil sin salir del foco."),
            WorkoutVariant("Progresivo", "progressive", "Final algo más vivo dentro del mismo dominio", "Cuando buscas transferencia sin convertirlo en umbral."),
        ]

    if "lt2" in family or "threshold" in family or "subthreshold" in family or "cruise" in family or "halfpace" in family or "over_under" in family:
        return [
            WorkoutVariant("Cruise", "interval", "Repeticiones medias con pausa corta", "La opción más repetible y controlable."),
            WorkoutVariant("Bloque largo", "continuous", "1-2 bloques largos continuos", "Útil cuando el atleta tolera ritmo estable y quieres especificidad."),
            WorkoutVariant("Escalonado", "mixed", "Alternancia de LT1 alto-LT2", "Cuando buscas tolerancia a cambios cerca del umbral."),
        ]

    if "vo2" in family or "power" in family or "anc" in family or "anaerobic" in family:
        if discipline == "running":
            return [
                WorkoutVariant("Intervalo clásico", "interval", "4-6 x 3-4' o similar", "Si quieres un estímulo claro y dosificable."),
                WorkoutVariant("30-30", "fractional", "10-20 repeticiones 30''/30''", "Para acumular tiempo intenso con mejor control técnico."),
                WorkoutVariant("Cortas / cuestas", "neuromuscular", "Repeticiones muy cortas y explosivas", "Cuando el foco es potencia y economía."),
            ]
        return [
            WorkoutVariant("Intervalo clásico", "interval", "4-6 repeticiones medias-altas", "La opción principal para potencia aeróbica."),
            WorkoutVariant("30-30", "fractional", "1-2 bloques de 30''/30''", "Si buscas densidad con control."),
            WorkoutVariant("Combinada", "mixed", "Parte alta + apoyo específico", "Cuando el bloque requiere unir techo y transferencia."),
        ]

    if "specific" in family or "transition" in family or "open_water" in family or "race_pace" in family or "pace_reps" in family:
        return [
            WorkoutVariant("Simulación", "specific", "Versión más cercana al contexto competitivo", "Úsala cerca del objetivo."),
            WorkoutVariant("Broken specific", "interval", "Mismo foco pero fraccionado", "Para mantener especificidad con algo menos de fatiga."),
            WorkoutVariant("Controlada", "support", "Menos tiempo a ritmo objetivo", "Cuando solo quieres tocar el foco sin vaciar."),
        ]

    if "strength" in family or "anatomical" in family or "mobility" in family:
        return [
            WorkoutVariant("Base", "general", "Circuito simple o carga moderada", "Ideal en fases de construcción."),
            WorkoutVariant("Intensa breve", "heavy", "Pocas series, mucha calidad", "Para fuerza máxima o transferencia."),
            WorkoutVariant("Recordatorio", "maintenance", "Versión breve de mantenimiento", "Útil en semanas específicas o de descarga."),
        ]

    if "test" in family or "profile" in family:
        return [
            WorkoutVariant("Completo", "test", "Protocolo principal íntegro", "Cuando necesitas decidir el siguiente bloque."),
            WorkoutVariant("Ancla", "benchmark", "Sesión comparable simplificada", "Si quieres seguimiento frecuente con menos coste."),
            WorkoutVariant("Control", "validation", "Versión corta para releer el estado", "Útil al final de descarga o transición."),
        ]

    return [
        WorkoutVariant("Base", "standard", template.dose_guidance, "Versión principal de la sesión."),
        WorkoutVariant("Ligera", "reduced", "Recorta volumen o densidad manteniendo el objetivo", "Útil en semanas con más fatiga."),
        WorkoutVariant("Extendida", "extended", "Añade tiempo útil sin cambiar el foco", "Solo si la respuesta del atleta lo permite."),
    ]


def builder_variables_for_template(template: WorkoutTemplate) -> list[WorkoutVariable]:
    variables: list[WorkoutVariable] = [
        WorkoutVariable("Volumen", ("corto", "medio", "largo")),
        WorkoutVariable("Densidad", ("conservadora", "media", "compacta")),
    ]

    family = template.session_family
    discipline = template.discipline

    if discipline == "running":
        options = ("llano", "mixto", "cuesta") if "hill" in family else ("pista", "asfalto", "mixto")
        variables.append(WorkoutVariable("Terreno", options))
    elif discipline == "ciclismo":
        variables.append(WorkoutVariable("Contexto", ("indoor", "carretera", "mixto")))
        if "aero" in family or "halfpace" in family or "lt2" in family or "specific" in family:
            variables.append(WorkoutVariable("Posición", ("libre", "aero", "mixta")))
        else:
            variables.append(WorkoutVariable("Cadencia", ("baja", "libre", "alta")))
    elif discipline == "natación":
        if "tech" in family or "pull" in family or "alignment" in family:
            variables.append(WorkoutVariable("Material", ("libre", "snorkel/pull", "aletas")))
        else:
            variables.append(WorkoutVariable("Serie", ("corta", "media", "larga")))
        variables.append(WorkoutVariable("Descanso", ("corto", "medio", "completo")))
    else:
        variables.append(WorkoutVariable("Timing", ("inicio", "centro", "fin de semana")))

    if "specific" in family or "transition" in family or "open_water" in family:
        variables.append(WorkoutVariable("Especificidad", ("general", "objetivo", "simulación")))
    elif "test" in family or "profile" in family:
        variables.append(WorkoutVariable("Protocolo", ("completo", "ancla", "control")))
    elif "strength" in family or "mobility" in family:
        variables.append(WorkoutVariable("Carga", ("baja", "media", "alta controlada")))

    return variables[:4]


def evidence_for_ids(source_ids: tuple[str, ...]) -> list[EvidenceSource]:
    return [EVIDENCE_SOURCES[source_id] for source_id in source_ids if source_id in EVIDENCE_SOURCES]


def templates_for_block(discipline: str, block_type: str) -> list[WorkoutTemplate]:
    templates = [
        template
        for template in WORKOUT_TEMPLATES
        if template.discipline in {discipline, "all"} and block_type in template.compatible_block_types
    ]
    return sorted(
        templates,
        key=lambda item: (
            ROLE_ORDER.get(item.session_role, 99),
            -item.confidence,
            item.public_label,
        ),
    )


def templates_for_discipline_library(discipline: str) -> list[WorkoutTemplate]:
    templates = [template for template in WORKOUT_TEMPLATES if template.discipline in {discipline, "all"}]
    return sorted(
        templates,
        key=lambda item: (
            min(BLOCK_ORDER.get(block_type, 99) for block_type in item.compatible_block_types),
            ROLE_ORDER.get(item.session_role, 99),
            -item.confidence,
            item.public_label,
        ),
    )


def _phase_sequence(block_type: str, work_weeks: int, recovery_weeks: int) -> list[str]:
    phases: list[str] = []
    for index in range(work_weeks):
        if block_type == "competition_specific_block" and index == work_weeks - 1:
            phases.append("specific")
        elif index == 0:
            phases.append("load")
        else:
            phases.append("build")
    phases.extend(["recovery"] * max(recovery_weeks, 1))
    return phases


def _blueprint_for(discipline: str, block_type: str) -> dict[str, tuple[DraftSlot, ...]]:
    return WORKOUT_BLUEPRINTS.get((discipline, block_type)) or {
        "load": (DraftSlot(2, "test_profile_anchor"), DraftSlot(5, "recovery_regeneration")),
        "recovery": (DraftSlot(2, "recovery_regeneration"), DraftSlot(5, "test_profile_anchor")),
    }


def _week_load_label(phase: str) -> str:
    return {
        "load": "acumulación",
        "build": "construcción",
        "specific": "especificidad",
        "recovery": "descarga",
    }.get(phase, "construcción")


def _progression_note(template: WorkoutTemplate, phase: str, week_index: int) -> str:
    if phase == "load":
        return f"Semana {week_index}: introducir {template.session_family} con margen técnico y coste interno controlado."
    if phase == "build":
        return f"Semana {week_index}: progresar una sola palanca en {template.session_family} para mantener trazabilidad."
    if phase == "specific":
        return f"Semana {week_index}: acercar {template.session_family} al contexto competitivo sin vaciar al atleta."
    return f"Semana {week_index}: bajar densidad y usar {template.session_family} para consolidar y releer el estado."


def _expected_signal(template: WorkoutTemplate, phase: str) -> str:
    if phase == "recovery":
        return "Debe bajar el coste fisiológico y mejorar la sensación de frescura."
    return template.expected_adaptations[0] if template.expected_adaptations else "Esperar una adaptación específica y medible."


def build_mesocycle_draft(
    discipline: str,
    block_type: str,
    block_label: str,
    structure: str,
    duration_weeks: int,
    work_weeks: int,
    recovery_weeks: int,
    primary_focus: str,
    secondary_focus: Optional[str] = None,
    start_date=None,
    athlete=None,
    target_date=None,
    evaluation_direction: Optional[str] = None,
) -> dict:
    from app.services.mesocycle_prescription import build_prewritten_mesocycle_draft

    return build_prewritten_mesocycle_draft(
        discipline=discipline,
        block_type=block_type,
        block_label=block_label,
        structure=structure,
        duration_weeks=duration_weeks,
        work_weeks=work_weeks,
        recovery_weeks=recovery_weeks,
        primary_focus=primary_focus,
        secondary_focus=secondary_focus,
        start_date=start_date,
        athlete=athlete,
        target_date=target_date,
        evaluation_direction=evaluation_direction,
    )

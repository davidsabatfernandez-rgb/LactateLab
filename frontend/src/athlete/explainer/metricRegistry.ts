// Metric Explainer — Registry of all explainable metrics
// Each entry defines content, chart config, and interpretation rules

export type MetricRange = {
  min: number;
  max: number;
  label: string;
  tone: "positive" | "warning" | "neutral";
  detail: string;
};

export type MetricDefinition = {
  id: string;
  title: string;
  unit: string;
  color: string;
  // Chart
  chartSource: "wellness" | "thresholds" | "readiness" | "custom";
  wellnessKey?: string;
  invertedAxis?: boolean; // lower = better (resting HR, stress)
  // Content
  whatIsThis: string;
  whyItMatters: string;
  howToImprove: string;
  funFact: string;
  // Interpretation
  higherIsBetter: boolean;
  ranges: MetricRange[];
};

export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
  hrv: {
    id: "hrv",
    title: "HRV nocturna",
    unit: "ms",
    color: "#10B981",
    chartSource: "wellness",
    wellnessKey: "hrv",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "La Variabilidad de Frecuencia Cardíaca (HRV) mide las variaciones en el tiempo entre latidos consecutivos. No es un ritmo fijo — tu corazón acelera y frena constantemente, controlado por el sistema nervioso autónomo. Se mide en milisegundos (ms) durante el sueño, cuando el cuerpo está en reposo total.",
    whyItMatters:
      "Es el indicador más fiable de recuperación y estrés fisiológico que existe. Una HRV alta indica que tu sistema parasimpático (el freno) está dominando — señal de que tu cuerpo ha asimilado la carga. Una HRV baja sostenida (3+ días) indica que no estás recuperando bien, ya sea por entrenamiento, estrés mental, mala alimentación o falta de sueño.",
    howToImprove:
      "No persigas un número alto — lo importante es la tendencia. Dormir >7h, reducir alcohol, controlar estrés y respetar descansos post-sesión dura son los factores más impactantes. Los atletas de resistencia suelen ver mejoras de HRV con bloques aeróbicos bien dosificados.",
    funFact:
      "Atletas de élite de resistencia pueden tener HRV >120ms, mientras que la media poblacional ronda los 30-50ms. Sin embargo, la comparación solo tiene sentido contigo mismo — tu baseline personal es lo que importa.",
    ranges: [
      { min: 0, max: 0.85, label: "Baja", tone: "warning", detail: "Tu HRV está por debajo de tu baseline. Puede indicar fatiga acumulada, estrés o falta de sueño. Considera moderar la carga hoy." },
      { min: 0.85, max: 1.05, label: "Normal", tone: "neutral", detail: "Dentro de tu rango habitual. Sin señales de alarma — tu cuerpo está gestionando la carga correctamente." },
      { min: 1.05, max: 999, label: "Alta", tone: "positive", detail: "Recuperación autonómica por encima de tu media. Buena señal para absorber carga de entrenamiento." },
    ],
  },

  sleep: {
    id: "sleep",
    title: "Sueño",
    unit: "h",
    color: "#8B5CF6",
    chartSource: "wellness",
    wellnessKey: "sleepHours",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "El tiempo total de sueño medido por tu dispositivo, incluyendo todas las fases: ligero, profundo, REM y despertares. No es solo 'horas en la cama' — mide el sueño real detectado por sensores de movimiento y frecuencia cardíaca.",
    whyItMatters:
      "El sueño es la herramienta de recuperación más potente que existe. Durante el sueño profundo se libera hormona de crecimiento (reparación muscular), y durante el REM se consolida la memoria motora — es decir, tu cuerpo 'aprende' los patrones de movimiento del entrenamiento. Dormir menos de 7h reduce la capacidad de adaptación al estímulo de entrenamiento hasta un 30%.",
    howToImprove:
      "Prioriza consistencia: acostarte y levantarte a la misma hora. Evita pantallas 1h antes, mantén la habitación fresca (18-20°C) y oscura. Después de sesiones nocturnas intensas, el cuerpo tarda más en bajar el cortisol — planifica las sesiones duras por la mañana si puedes.",
    funFact:
      "El estudio de Stanford con nadadores demostró que extender el sueño a 10h durante 6 semanas mejoró tiempos de sprint un 3% y velocidad de reacción un 9%. El sueño no es tiempo perdido — es entrenamiento invisible.",
    ranges: [
      { min: 0, max: 6, label: "Insuficiente", tone: "warning", detail: "Menos de 6 horas limita seriamente la recuperación. La síntesis proteica y la reparación tisular se reducen. Prioriza dormir más esta noche." },
      { min: 6, max: 7, label: "Mejorable", tone: "neutral", detail: "Aceptable pero por debajo del óptimo para un atleta. La consolidación de adaptaciones se beneficia de 30-60 min más." },
      { min: 7, max: 9, label: "Óptimo", tone: "positive", detail: "Rango ideal para atletas de resistencia. Tu cuerpo tiene tiempo suficiente para completar todos los ciclos de reparación y consolidación." },
      { min: 9, max: 24, label: "Extenso", tone: "neutral", detail: "Más de 9h puede indicar fatiga acumulada o necesidad extra de recuperación. Si es puntual, está bien. Si es constante, evalúa tu carga." },
    ],
  },

  resting_hr: {
    id: "resting_hr",
    title: "FC en reposo",
    unit: "bpm",
    color: "#EF4444",
    chartSource: "wellness",
    wellnessKey: "restingHr",
    invertedAxis: true,
    higherIsBetter: false,
    whatIsThis:
      "Tu frecuencia cardíaca más baja registrada durante el sueño profundo. Es el pulso de tu corazón cuando el cuerpo está en reposo absoluto — sin estímulos, sin digestión activa, sin movimiento. Se mide en latidos por minuto (bpm).",
    whyItMatters:
      "Es un termómetro de tu estado general. Un aumento de +5bpm sobre tu media puede indicar fatiga, enfermedad incubándose, deshidratación o estrés acumulado. A largo plazo, una FC en reposo que baja progresivamente indica mejora de la eficiencia cardíaca — el corazón bombea más sangre por latido.",
    howToImprove:
      "El entrenamiento aeróbico consistente es la forma más efectiva de reducirla a largo plazo. A corto plazo, la hidratación, la temperatura ambiente y el alcohol la afectan directamente. Un aumento puntual no es alarmante — busca tendencias de 3-5 días.",
    funFact:
      "Miguel Induráin tenía una FC en reposo de 28 bpm. Eliud Kipchoge ronda los 33 bpm. Pero no te compares — lo relevante es tu delta personal. Una bajada de 5 bpm en 6 meses de entrenamiento aeróbico bien planificado es un indicador real de adaptación cardiovascular.",
    ranges: [
      { min: -999, max: -3, label: "Muy bajo", tone: "positive", detail: "Tu FC en reposo está significativamente por debajo de tu media. Señal de muy buena recuperación y adaptación cardiovascular." },
      { min: -3, max: 3, label: "Normal", tone: "neutral", detail: "Dentro de tu rango habitual. Sin señales de estrés cardiovascular adicional." },
      { min: 3, max: 5, label: "Elevada", tone: "warning", detail: "Ligeramente por encima de tu media. Puede ser puntual (alcohol, calor, digestión) o acumulación de fatiga." },
      { min: 5, max: 999, label: "Alta", tone: "warning", detail: "FC en reposo significativamente elevada. Si se mantiene 2-3 días, reduce la intensidad y revisa sueño, hidratación y estrés." },
    ],
  },

  stress: {
    id: "stress",
    title: "Estrés",
    unit: "",
    color: "#F59E0B",
    chartSource: "wellness",
    wellnessKey: "stress",
    invertedAxis: true,
    higherIsBetter: false,
    whatIsThis:
      "Un índice de 0 a 100 calculado por Garmin a partir de la variabilidad cardíaca (HRV) a lo largo del día. Mide la activación del sistema nervioso simpático (el acelerador). No mide solo estrés mental — incluye estrés fisiológico por entrenamiento, digestión, temperatura, etc.",
    whyItMatters:
      "Un estrés medio-alto constante (>50) indica que tu sistema nervioso no está teniendo suficiente tiempo en modo parasimpático (recuperación). Esto reduce la calidad del sueño y la capacidad de adaptación al entrenamiento. Es normal que suba durante y después del ejercicio — lo preocupante es que no baje en reposo.",
    howToImprove:
      "Técnicas de respiración (4-7-8, box breathing) activan inmediatamente el parasimpático. Paseos de 15-20 min post-entreno ayudan a bajar el cortisol. Evita cafeína después de las 14h. El estrés mental (trabajo, relaciones) suma igual que el físico — el cuerpo no distingue.",
    funFact:
      "Un estudio de 2019 en Journal of Sports Sciences demostró que atletas con estrés crónico >60 tenían un 40% más de riesgo de lesión. Tu cuerpo te avisa antes de que algo se rompa — aprende a escuchar esta señal.",
    ranges: [
      { min: 0, max: 25, label: "Bajo", tone: "positive", detail: "Excelente equilibrio autonómico. Tu sistema nervioso está en modo recuperación." },
      { min: 25, max: 50, label: "Moderado", tone: "neutral", detail: "Nivel normal de activación. Compatible con entrenamiento regular." },
      { min: 50, max: 75, label: "Alto", tone: "warning", detail: "Activación simpática elevada. Valora si es por entrenamiento reciente o por estrés acumulado." },
      { min: 75, max: 100, label: "Muy alto", tone: "warning", detail: "Señal de alarma. Prioriza recuperación activa, sueño y reducción de estímulos." },
    ],
  },

  body_battery: {
    id: "body_battery",
    title: "Batería corporal",
    unit: "",
    color: "#06B6D4",
    chartSource: "wellness",
    wellnessKey: "bodyBatteryChange",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "Un indicador propietario de Garmin (0-100) que combina HRV, estrés, sueño y actividad para estimar tu energía disponible. Sube con el descanso y baja con el esfuerzo y el estrés. El delta (cambio) te dice cuánto has recargado o gastado en las últimas 24h.",
    whyItMatters:
      "Es una métrica sintética útil para decisiones rápidas. Si tu batería está por debajo de 25 al despertar, es señal clara de que la noche no fue suficiente para recuperar. El delta diario te dice si tu balance energético es positivo (recargas más de lo que gastas) o negativo.",
    howToImprove:
      "La batería sube principalmente durante el sueño profundo y períodos de bajo estrés. Siestas de 20-30 min pueden dar un boost significativo. La clave es no llegar a 0 — cuando la batería se agota completamente, la calidad de cualquier entrenamiento se desploma.",
    funFact:
      "Garmin desarrolló Body Battery usando datos de >10.000 usuarios y correlacionándolo con HRV real medida en laboratorio. Aunque es propietario, la correlación con estado de recuperación medido por marcadores sanguíneos es >0.7.",
    ranges: [
      { min: -999, max: -10, label: "Gastando mucho", tone: "warning", detail: "Tu balance energético es muy negativo. Estás gastando más de lo que recuperas. Reduce estímulos y prioriza descanso." },
      { min: -10, max: 5, label: "Equilibrado", tone: "neutral", detail: "Balance energético neutro. Estás gestionando la carga de forma sostenible." },
      { min: 5, max: 999, label: "Recargando", tone: "positive", detail: "Estás acumulando energía. Buen momento para afrontar sesiones exigentes." },
    ],
  },

  readiness: {
    id: "readiness",
    title: "Predisposición",
    unit: "",
    color: "#6366F1",
    chartSource: "readiness",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "Un score compuesto (0-100) que calculamos combinando tu recuperación, HRV, estrés, sueño y batería corporal. No es un dato de Garmin — es nuestro algoritmo que pondera estas señales para darte una lectura rápida de tu estado.",
    whyItMatters:
      "En lugar de interpretar 5 métricas por separado, la predisposición te da una respuesta directa: ¿cómo estoy hoy? Si está por encima de 60, tu cuerpo está listo para absorber carga. Si está por debajo de 40, cualquier sesión intensa se asimila peor y aumenta el riesgo de sobreentrenamiento.",
    howToImprove:
      "No puedes mejorar la predisposición directamente — mejora los componentes. Duerme más, gestiona el estrés, respeta los días de recuperación activa. La predisposición responde en 24-48h a cambios reales de comportamiento.",
    funFact:
      "Los pesos de nuestro algoritmo están basados en la literatura: sueño tiene el mayor peso (30%), seguido de HRV (25%), estrés (20%), batería (15%) y FC reposo (10%). Esto refleja que el sueño es el predictor #1 de rendimiento al día siguiente.",
    ranges: [
      { min: 0, max: 20, label: "Crítico", tone: "warning", detail: "Tu cuerpo necesita descanso urgente. Cualquier carga intensa hoy probablemente sea contraproducente." },
      { min: 20, max: 40, label: "Bajo", tone: "warning", detail: "Recuperación incompleta. Sesiones suaves o descanso activo son la mejor opción." },
      { min: 40, max: 60, label: "Moderado", tone: "neutral", detail: "Estado aceptable. Puedes entrenar pero modera la intensidad. Buen día para sesiones técnicas o aeróbicas suaves." },
      { min: 60, max: 80, label: "Preparado", tone: "positive", detail: "Buena recuperación. Tu cuerpo está listo para absorber estímulos de entrenamiento." },
      { min: 80, max: 100, label: "Óptimo", tone: "positive", detail: "Estado excelente. Día ideal para sesiones clave o de alta intensidad." },
    ],
  },

  vo2max: {
    id: "vo2max",
    title: "VO2max",
    unit: "ml/kg/min",
    color: "#059669",
    chartSource: "custom",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "El consumo máximo de oxígeno — la cantidad máxima de oxígeno que tu cuerpo puede utilizar por minuto por kilo de peso. Es el techo de tu motor aeróbico. Se estima a partir de tu FC, ritmo y datos de umbrales usando el modelo Swain+ACSM.",
    whyItMatters:
      "Es el predictor más potente de rendimiento en resistencia y, según estudios epidemiológicos, uno de los mejores predictores de longevidad. Cada 1 ml/kg/min de mejora puede traducirse en ~12-15 segundos menos en un 5K. Define el límite superior de lo que puedes hacer aeróbicamente.",
    howToImprove:
      "El entrenamiento más efectivo para mejorar VO2max son los intervalos a 90-95% FCmax (3-5 min ON, 2-3 min OFF). Pero la base aeróbica extensa (LT1) es el cimiento: sin ella, los intervalos VO2 no se asimilan bien. En atletas entrenados, la mejora es de 1-3% por mesociclo bien planificado.",
    funFact:
      "El VO2max más alto jamás registrado fue 97.5 ml/kg/min (Oskar Svendsen, ciclista noruego). Un VO2max >60 te coloca en el top 1% de la población. Pero recuerda: el VO2max define el techo, pero la fracción de utilización (qué % usas en competición) es lo que define el rendimiento real.",
    ranges: [
      { min: 0, max: 35, label: "Bajo", tone: "warning", detail: "Hay mucho margen de mejora. El entrenamiento aeróbico consistente puede mejorar este valor significativamente en pocos meses." },
      { min: 35, max: 45, label: "Moderado", tone: "neutral", detail: "Nivel recreativo-intermedio. Con un plan de entrenamiento estructurado, puedes aspirar a mejoras de 3-5 ml/kg/min en un ciclo de 12-16 semanas." },
      { min: 45, max: 55, label: "Bueno", tone: "positive", detail: "Nivel de atleta recreativo avanzado. Estás por encima de la media poblacional. Las mejoras vienen ahora más de la eficiencia (umbrales) que del techo." },
      { min: 55, max: 65, label: "Muy bueno", tone: "positive", detail: "Nivel competitivo. Tu motor aeróbico es potente. Las ganancias son cada vez más marginales — aquí cuenta mucho la periodización." },
      { min: 65, max: 999, label: "Élite", tone: "positive", detail: "Nivel élite. Estás en la cúspide del rendimiento aeróbico humano." },
    ],
  },

  lt1: {
    id: "lt1",
    title: "Umbral LT1",
    unit: "",
    color: "#22C55E",
    chartSource: "thresholds",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "El primer umbral de lactato — el punto donde el lactato empieza a acumularse por encima de la línea base. Fisiológicamente, es la intensidad máxima a la que puedes entrenar durante horas sin acumular fatiga metabólica significativa. En lactato, corresponde aproximadamente a 1.5-2.0 mmol/L.",
    whyItMatters:
      "Define tu 'zona de combustión de grasa eficiente'. Todo el entrenamiento por debajo de LT1 desarrolla tu base aeróbica sin generar fatiga significativa. Es la zona donde deberías pasar el 70-80% de tu volumen de entrenamiento. Cuanto más alto sea tu LT1 (más rápido puedas ir sin acumular lactato), más eficiente es tu metabolismo aeróbico.",
    howToImprove:
      "Volumen a baja intensidad (polarizado). Sesiones largas justo por debajo de LT1 son el estímulo más efectivo. Los bloques de capacidad aeróbica (AEC en nuestro sistema) están diseñados exactamente para esto. La mejora es lenta pero constante — 2-3% por mesociclo.",
    funFact:
      "Los atletas de ultra-resistencia de élite (Ironman, ultra-trail) tienen un LT1 que puede estar al 75-80% de su VO2max. Esto significa que pueden correr maratones a una intensidad que para su cuerpo es 'fácil'. La clave no es correr más fuerte — es subir el punto donde 'fácil' se convierte en 'difícil'.",
    ranges: [], // Interpretation handled dynamically based on discipline
  },

  lt2: {
    id: "lt2",
    title: "Umbral LT2",
    unit: "",
    color: "#F97316",
    chartSource: "thresholds",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "El segundo umbral de lactato — el punto de máxima intensidad sostenible. Por encima de LT2, el lactato se acumula exponencialmente y solo puedes mantener ese esfuerzo 20-40 minutos. En lactato, corresponde aproximadamente a 3.5-4.5 mmol/L. Es lo que se llama 'umbral anaeróbico' o MLSS.",
    whyItMatters:
      "Es el predictor más fuerte de rendimiento en pruebas de 10K a maratón. Tu ritmo de competición en un medio maratón está directamente vinculado a tu LT2. También define el techo de tus intervalos de 'calidad' — las sesiones clave de tu plan de entrenamiento.",
    howToImprove:
      "Intervalos de crucero al ritmo de LT2 (3-8 min ON, 1-2 min OFF) y tempo runs de 20-40 min justo por debajo de LT2. Los bloques de desarrollo de umbral (THR) y potencia aeróbica (AEP) atacan directamente este punto. La mejora típica es 3-5% en un mesociclo bien ejecutado.",
    funFact:
      "Eliud Kipchoge tiene un LT2 estimado a ~2:55/km. Su récord de maratón (2:01:09) fue corrido a 2:52/km — apenas un 1.7% por encima de su umbral. Los mejores del mundo compiten justo al filo de lo sostenible. Tu LT2 define ese filo.",
    ranges: [], // Interpretation handled dynamically based on discipline
  },

  training_status: {
    id: "training_status",
    title: "Estado de entrenamiento",
    unit: "",
    color: "#EF4444",
    chartSource: "custom",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "Una evaluación de cómo tu cuerpo está respondiendo a la carga de entrenamiento. Combina la relación entre carga aguda (últimos 7 días) y carga crónica (últimos 28 días) con tu estado de recuperación. No es un número de Garmin — lo calculamos a partir de tus datos de actividad y wellness.",
    whyItMatters:
      "Te dice si estás en una fase productiva (tu cuerpo se adapta) o destructiva (acumulas fatiga sin beneficio). Un estado bajo persistente puede indicar sobreentrenamiento o infrarecuperación. Un estado alto sostenido significa que estás en el 'sweet spot' de carga-recuperación.",
    howToImprove:
      "La clave es la progresión gradual: aumentar la carga un 5-10% semanal, no un 30%. Respetar las semanas de descarga (cada 3-4 semanas), dormir >7h, y escuchar las señales de HRV y FC en reposo. Si tu estado baja, no añadas más carga — reduce y deja que el cuerpo asimile.",
    funFact:
      "El concepto de 'supercompensación' fue formalizado por Nikolai Yakovlev en los años 50. La idea es simple: el entrenamiento te daña (baja el estado), la recuperación te reconstruye más fuerte (sube el estado). El arte está en el timing — entrenar demasiado pronto o demasiado tarde pierde el efecto.",
    ranges: [
      { min: 0, max: 20, label: "Desentrenado", tone: "warning", detail: "Tu cuerpo no está recibiendo suficiente estímulo o la recuperación es incompleta. Necesitas consistencia de entrenamiento y buena recuperación." },
      { min: 20, max: 40, label: "Bajo", tone: "warning", detail: "Fase de adaptación o recuperación. Si vienes de un período de carga, es normal. Si es crónico, revisa tu plan." },
      { min: 40, max: 60, label: "Mantenimiento", tone: "neutral", detail: "Tu cuerpo gestiona la carga actual. Estás en un estado estable — bueno para consolidar, pero no para grandes avances." },
      { min: 60, max: 80, label: "Productivo", tone: "positive", detail: "Tu cuerpo está respondiendo bien al entrenamiento. Estás en la zona de adaptación positiva." },
      { min: 80, max: 100, label: "Pico", tone: "positive", detail: "Estado excepcional. Tu cuerpo está en su mejor momento de asimilación. Ideal para sesiones clave." },
    ],
  },

  training_load: {
    id: "training_load",
    title: "Carga de entrenamiento",
    unit: "",
    color: "#6366F1",
    chartSource: "custom",
    invertedAxis: false,
    higherIsBetter: false, // not strictly higher=better, depends on context
    whatIsThis:
      "La carga de entrenamiento se mide en tres componentes: Aguda (últimos 7 días), Crónica (últimos 28 días) y el Ratio A:C entre ambas. Es un modelo basado en el concepto de Banister (1975) de fitness-fatiga, adaptado con los minutos de intensidad y la frecuencia cardíaca de tus sesiones.",
    whyItMatters:
      "El Ratio A:C es la métrica más importante de las tres. Si está entre 0.8 y 1.3 estás en zona segura. Por encima de 1.5 hay riesgo de sobrecarga y lesión. Por debajo de 0.8 estás perdiendo adaptaciones. La carga crónica es tu 'fitness acumulado' — cuanto más alta (con buena recuperación), más preparado estás.",
    howToImprove:
      "La regla de oro es no superar un aumento del 10% semanal en carga aguda. Después de semanas de carga alta, programa una semana de descarga (60-70% del volumen). El Ratio A:C debe estar entre 0.8-1.3 la mayor parte del tiempo. Picos puntuales por encima de 1.3 son aceptables si te recuperas la semana siguiente.",
    funFact:
      "Tim Gabbett, investigador australiano de ciencias del deporte, demostró en 2016 que el riesgo de lesión se multiplica por 4 cuando el Ratio A:C supera 1.5. Pero también demostró que cargas crónicas altas son protectoras — los atletas con más 'fitness acumulado' se lesionan menos. La clave no es entrenar menos, sino entrenar consistente.",
    ranges: [
      { min: 0, max: 0.8, label: "Infraestimulado", tone: "warning", detail: "Tu carga aguda es significativamente menor que tu crónica. Estás perdiendo adaptaciones. Sube el volumen o intensidad gradualmente." },
      { min: 0.8, max: 1.0, label: "Zona óptima baja", tone: "positive", detail: "Carga bien gestionada. Tu cuerpo tiene margen para absorber estímulo sin riesgo." },
      { min: 1.0, max: 1.3, label: "Zona óptima", tone: "positive", detail: "Estás cargando ligeramente por encima de tu media — es la zona de progresión. Vigila la recuperación." },
      { min: 1.3, max: 1.5, label: "Atención", tone: "warning", detail: "Carga aguda alta respecto a tu crónica. Acepta esto si es puntual, pero no lo sostengas más de 1-2 semanas." },
      { min: 1.5, max: 999, label: "Riesgo", tone: "warning", detail: "Ratio A:C peligroso. Riesgo elevado de lesión y sobreentrenamiento. Reduce la carga esta semana." },
    ],
  },
  training_consistency: {
    id: "training_consistency",
    title: "Consistencia de entrenamiento",
    unit: "%",
    color: "#8B5CF6",
    chartSource: "custom",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "La consistencia mide cómo de regular es tu volumen de entrenamiento semana a semana. Se calcula con el coeficiente de variación (CV) de tus últimas 12 semanas: si todas son parecidas, tu consistencia es alta. Si hay semanas de mucho y otras de nada, es baja.",
    whyItMatters:
      "La ciencia del entrenamiento muestra que la regularidad supera al volumen total. Un atleta que entrena 5h cada semana progresa más que uno que entrena 10h una semana y 0h la siguiente. La consistencia permite adaptaciones acumulativas — tus mitocondrias, capilares y enzimas aeróbicas necesitan estímulo repetido y constante.",
    howToImprove:
      "Planifica un volumen mínimo semanal que puedas mantener incluso en semanas ocupadas. Es mejor hacer 3 sesiones cortas que saltarte todo. Usa las semanas de descarga planificadas (no parones totales). Si viajas o tienes imprevistos, haz al menos 1-2 sesiones de mantenimiento.",
    funFact:
      "Un estudio de Esteve-Lanao et al. (2005) demostró que los corredores de élite kenianos no entrenan más que otros — entrenan más consistente. Su coeficiente de variación semanal era <15%, mientras que los corredores amateurs llegan al 40-60%. La magia no está en la semana perfecta, sino en no tener semanas vacías.",
    ranges: [
      { min: 0, max: 40, label: "Muy irregular", tone: "warning", detail: "Tu volumen varía mucho entre semanas. Intenta mantener un mínimo constante." },
      { min: 40, max: 60, label: "Mejorable", tone: "warning", detail: "Hay bastante variación. Busca un ritmo más estable." },
      { min: 60, max: 80, label: "Buena", tone: "positive", detail: "Buen equilibrio entre carga y regularidad. Sigue así." },
      { min: 80, max: 100, label: "Excelente", tone: "positive", detail: "Tu entrenamiento es muy regular. Esto maximiza las adaptaciones." },
    ],
  },
  training_streak: {
    id: "training_streak",
    title: "Racha de entrenamiento",
    unit: "semanas",
    color: "#F59E0B",
    chartSource: "custom",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "Cuenta cuántas semanas consecutivas has entrenado sin interrupción (al menos 1 sesión por semana). Es un indicador simple de adherencia al entrenamiento.",
    whyItMatters:
      "Las adaptaciones fisiológicas requieren semanas de estímulo continuado. Tras 2 semanas sin entrenar pierdes un 7% de VO2max (Mujika & Padilla, 2000). Cada semana que sumas a tu racha es una semana de adaptaciones que no se pierden.",
    howToImprove:
      "El objetivo no es entrenar duro cada semana, sino no dejar semanas vacías. Incluso una sesión suave de 30 minutos cuenta para mantener la racha y preservar adaptaciones. Si estás cansado o lesionado, sustituye por movilidad o natación suave en vez de parar totalmente.",
    funFact:
      "Jerry Seinfeld usaba la técnica de 'no romper la cadena' para escribir chistes todos los días. La psicología del deporte confirma que las rachas crean momentum motivacional — tras 4 semanas consecutivas, la probabilidad de seguir entrenando la semana siguiente sube al 85% (Lally et al., 2010).",
    ranges: [
      { min: 0, max: 2, label: "Empezando", tone: "warning", detail: "Estás construyendo tu rutina. Cada semana que sumes cuenta." },
      { min: 2, max: 4, label: "En marcha", tone: "neutral", detail: "Buena base. El hábito se está formando." },
      { min: 4, max: 8, label: "Racha sólida", tone: "positive", detail: "Más de un mes seguido. Las adaptaciones están consolidándose." },
      { min: 8, max: 999, label: "Imparable", tone: "positive", detail: "Racha impresionante. Tu constancia es tu mayor ventaja competitiva." },
    ],
  },
  volume_change: {
    id: "volume_change",
    title: "Variación de volumen semanal",
    unit: "%",
    color: "#10B981",
    chartSource: "custom",
    invertedAxis: false,
    higherIsBetter: false,
    whatIsThis:
      "Compara tu volumen de entrenamiento de esta semana con la anterior. Un valor positivo indica que has entrenado más, negativo que has entrenado menos. Es un indicador instantáneo de la tendencia de carga.",
    whyItMatters:
      "Incrementos graduales (5-10% semanal) permiten adaptaciones sin riesgo. Aumentos bruscos (>20%) están asociados con mayor riesgo de lesión según el modelo de Tim Gabbett. Descensos controlados son normales en semanas de descarga.",
    howToImprove:
      "Sigue la regla del 10%: no aumentes el volumen semanal más de un 10% respecto a la media de las últimas 4 semanas. Si necesitas bajar, hazlo gradualmente. Alterna 3 semanas de carga progresiva con 1 semana de descarga (60-70% del volumen pico).",
    funFact:
      "El modelo de Banister (1975) de fitness-fatiga demostró que las adaptaciones positivas (fitness) duran más que la fatiga negativa. Esto significa que después de una semana de descarga, tu rendimiento sube porque pierdes fatiga pero conservas fitness. Es el principio de la supercompensación.",
    ranges: [
      { min: -999, max: -30, label: "Descarga fuerte", tone: "warning", detail: "Has reducido mucho el volumen. Si es planificado (descarga), perfecto. Si no, intenta ser más regular." },
      { min: -30, max: -10, label: "Descarga", tone: "neutral", detail: "Reducción moderada respecto a la semana anterior. Normal en semanas de descarga." },
      { min: -10, max: 10, label: "Estable", tone: "positive", detail: "Volumen similar al de la semana anterior. Buena consistencia." },
      { min: 10, max: 20, label: "Progresión", tone: "positive", detail: "Aumento gradual del volumen. Zona segura de progresión." },
      { min: 20, max: 999, label: "Pico de carga", tone: "warning", detail: "Aumento significativo. Vigila la recuperación y no lo sostengas más de 1-2 semanas." },
    ],
  },
  sessions_month: {
    id: "sessions_month",
    title: "Sesiones mensuales",
    unit: "sesiones",
    color: "#0EA5E9",
    chartSource: "custom",
    invertedAxis: false,
    higherIsBetter: true,
    whatIsThis:
      "El número total de sesiones de entrenamiento que has completado en los últimos 30 días, sumando todas las disciplinas. Es un indicador de frecuencia de entrenamiento.",
    whyItMatters:
      "La frecuencia es uno de los tres pilares de la dosis de entrenamiento (junto con volumen e intensidad). Para la mayoría de atletas recreativos, aumentar frecuencia (más sesiones cortas) es más efectivo y seguro que aumentar duración. Cada sesión adicional por semana activa rutas de adaptación diferentes.",
    howToImprove:
      "Si quieres aumentar frecuencia, añade primero sesiones cortas y de baja intensidad (30-40 min zona 1-2). El doble umbral de Seiler sugiere que el 80% de tus sesiones deben ser fáciles. Una sesión extra de recuperación activa entre días duros puede acelerar las adaptaciones sin añadir fatiga significativa.",
    funFact:
      "Stephen Seiler analizó los diarios de entrenamiento de medallistas olímpicos noruegos y encontró que el factor que más correlaciona con el rendimiento no es el volumen total ni la intensidad máxima — es la frecuencia de sesiones fáciles. Los mejores del mundo entrenan fácil 10-12 veces por semana.",
    ranges: [
      { min: 0, max: 8, label: "Baja frecuencia", tone: "warning", detail: "Menos de 2 sesiones por semana. Intenta ser más regular." },
      { min: 8, max: 16, label: "Moderada", tone: "neutral", detail: "2-4 sesiones semanales. Buena base para atletas recreativos." },
      { min: 16, max: 24, label: "Buena frecuencia", tone: "positive", detail: "4-6 sesiones semanales. Frecuencia de grupo de edad competitivo." },
      { min: 24, max: 999, label: "Alta frecuencia", tone: "positive", detail: "Más de 6 sesiones semanales. Frecuencia de atleta serio." },
    ],
  },
};

export const METRIC_IDS = Object.keys(METRIC_REGISTRY);

import { useNavigate } from "react-router-dom";
import { useLang, type Lang } from "../landing/i18n";
import "../styles/landing.css";

/* ─── translations ─── */
const T: Record<Lang, Record<string, string>> = {
  es: {
    nav_how: "Como funciona",
    nav_athlete: "Atleta",
    nav_plans: "Planes",
    nav_compare: "Comparar planes",
    nav_blog: "Blog",
    nav_login: "Entrar",
    hero_title: "Entrenamiento basado en datos reales",
    hero_sub: "Analiza tus tests de lactato, visualiza tu progreso y recibe un plan de entrenamiento adaptado a tu fisiologia. Todo en una plataforma.",
    hero_cta: "Empieza gratis",
    hero_cta2: "Ver planes",
    // Value props
    vp1_title: "Analisis de lactato",
    vp1_desc: "Tests ilimitados con deteccion automatica de umbrales LT1 y LT2.",
    vp2_title: "Umbrales que evolucionan",
    vp2_desc: "Tus umbrales se actualizan con cada nuevo test. Siempre al dia.",
    vp3_title: "Plan personalizado",
    vp3_desc: "Planificacion construida desde tu fisiologia real y tus objetivos.",
    // Section headers
    s_analysis: "Analisis",
    s_analysis_sub: "Desde tu test de campo hasta zonas de entrenamiento reales",
    s_tracking: "Seguimiento",
    s_tracking_sub: "Visualiza como evolucionas test a test",
    s_planning: "Planificacion",
    s_planning_sub: "Un plan real basado en tu fisiologia, no en plantillas genericas",
    s_daily: "Tu dia a dia",
    s_daily_sub: "Todo lo que necesitas antes de salir a entrenar",
    s_recovery: "Recuperacion",
    s_recovery_sub: "Entiende tu estado para tomar mejores decisiones",
    // Features — Analysis
    f_tests_title: "Tests de lactato",
    f_tests_desc: "Sube los datos de tus tests de campo y obten un analisis completo al instante. La plataforma detecta automaticamente tus umbrales LT1 y LT2 usando multiples metodos de deteccion y te muestra un scoring de confianza para cada resultado.",
    f_tests_detail: "Tests ilimitados · Multi-disciplina · Scoring de confianza",
    f_curve_title: "Curva de lactato interactiva",
    f_curve_desc: "Visualiza tu curva completa con marcadores de umbral, puntos de inflexion y bandas de confianza. Compara curvas entre tests para ver tu progresion real.",
    f_curve_detail: "Marcadores LT1/LT2 · Comparacion entre tests · Exportable",
    f_zones_title: "Zonas de entrenamiento reales",
    f_zones_desc: "7 zonas calculadas directamente desde tus datos de lactato — no estimaciones teoricas. Cada zona con su rango en ritmo, frecuencia cardiaca y potencia.",
    f_zones_detail: "Ritmo · FC · Potencia · 7 zonas · Basadas en lactato",
    // Features — Tracking
    f_dynamic_title: "Umbrales dinamicos",
    f_dynamic_desc: "Tus umbrales de entrenamiento se recalculan automaticamente con cada nuevo test que subes. No necesitas esperar semanas para ver un cambio: la plataforma detecta mejoras o retrocesos al instante.",
    f_dynamic_detail: "Actualizacion automatica · Deteccion de tendencia",
    f_evolution_title: "Evolucion de umbrales",
    f_evolution_desc: "Grafico temporal de tu LT1 y LT2 con tendencia visual. Ve exactamente cuanto has mejorado en cada ciclo de entrenamiento y compara periodos.",
    f_evolution_detail: "Historico completo · Tendencia visual · Comparador de periodos",
    f_predictions_title: "Predicciones de carrera",
    f_predictions_desc: "Estimaciones para 5K, 10K, media maraton y maraton basadas en tus umbrales actuales. Con bandas de confianza que indican el rango mas probable.",
    f_predictions_detail: "5K · 10K · Media maraton · Maraton · Bandas de confianza",
    // Features — Planning
    f_plan_title: "Plan por objetivos y fisiologia",
    f_plan_desc: "El plan se construye combinando tus objetivos de carrera con tu perfil fisiologico actual. Seleccion automatica de bloque de entrenamiento, progresion de carga y sesiones adaptadas a tu nivel.",
    f_plan_detail: "Bloques fisiologicos · Progresion automatica · Multi-disciplina",
    f_calendar_title: "Calendario de entrenamiento",
    f_calendar_desc: "Vista semanal con todas tus sesiones planificadas, incluyendo zonas, duracion y tipo de sesion. Organizado por semanas con resumen de volumen.",
    f_calendar_detail: "Vista semanal · Zonas por sesion · Volumen acumulado",
    f_garmin_title: "Envio directo a Garmin",
    f_garmin_desc: "Tus sesiones planificadas se envian automaticamente a tu reloj Garmin. Llegas al entrenamiento y ya esta cargado: calentamiento, intervalos, vuelta a la calma.",
    f_garmin_detail: "Sincronizacion automatica · Sesion completa en el reloj",
    // Features — Daily
    f_session_title: "Sesion del dia",
    f_session_desc: "Tu sesion de hoy con todos los detalles: calentamiento, bloques principales con zona e intensidad, y vuelta a la calma. Todo desglosado paso a paso.",
    f_session_detail: "Desglose por zonas · Duracion · Intensidad objetivo",
    f_wellness_title: "Check-in matutino",
    f_wellness_desc: "Revisa tu estado de recuperacion antes de entrenar. Sueno, HRV, estres y body battery sincronizados desde tu Garmin para tomar mejores decisiones.",
    f_wellness_detail: "Sueno · HRV · Estres · Body Battery · SpO2",
    f_readiness_title: "Readiness",
    f_readiness_desc: "Puntuacion compuesta que resume tu nivel de preparacion para entrenar hoy. Basada en tus metricas de recuperacion y la carga acumulada.",
    f_readiness_detail: "Puntuacion 0-100 · Basada en recuperacion y carga",
    // Features — Recovery
    f_metrics_title: "Tendencias de bienestar",
    f_metrics_desc: "Sigue la evolucion de tus metricas de recuperacion a lo largo del tiempo. Identifica patrones y ajusta tu entrenamiento antes de sobreentrenarte.",
    f_metrics_detail: "14 dias · Tendencia visual · Multiples metricas",
    f_volume_title: "Volumen de entrenamiento",
    f_volume_desc: "12 semanas de volumen desglosado por disciplina. Ve si estas acumulando carga como deberia o si necesitas ajustar.",
    f_volume_detail: "12 semanas · Por disciplina · Carga acumulada",
    f_block_title: "Bloque activo",
    f_block_desc: "Tu bloque fisiologico actual con su justificacion, progresion dentro del ciclo y foco de entrenamiento. Sabe en que fase estas y por que.",
    f_block_detail: "Fase actual · Justificacion · Progresion del ciclo",
    // Mid CTA
    mid_cta_title: "¿Quieres ver que plan incluye cada funcionalidad?",
    mid_cta_btn: "Comparar planes",
    // Bottom CTA
    cta_title: "Empieza a entrenar con datos reales",
    cta_sub: "Crea tu cuenta gratis y sube tu primer test de lactato. Sin tarjeta, sin compromiso.",
    cta_btn: "Crear cuenta gratis",
    cta_btn2: "Ver planes",
    // Badges
    badge_free: "Gratis",
    badge_lactate: "Lactate Lab",
    badge_full: "Plan Completo",
    badge_pro: "Pro+",
    badge_elite: "Elite",
    // Availability label
    avail_from: "Desde",
  },
  en: {
    nav_how: "How it works",
    nav_athlete: "Athlete",
    nav_plans: "Plans",
    nav_compare: "Compare plans",
    nav_blog: "Blog",
    nav_login: "Log in",
    hero_title: "Training based on real data",
    hero_sub: "Analyze your lactate tests, track your progress and get a training plan adapted to your physiology. All in one platform.",
    hero_cta: "Start free",
    hero_cta2: "See plans",
    vp1_title: "Lactate analysis",
    vp1_desc: "Unlimited tests with automatic LT1 and LT2 threshold detection.",
    vp2_title: "Evolving thresholds",
    vp2_desc: "Your thresholds update with every new test. Always up to date.",
    vp3_title: "Personalized plan",
    vp3_desc: "Planning built from your real physiology and your goals.",
    s_analysis: "Analysis",
    s_analysis_sub: "From your field test to real training zones",
    s_tracking: "Tracking",
    s_tracking_sub: "See how you evolve test to test",
    s_planning: "Planning",
    s_planning_sub: "A real plan based on your physiology, not generic templates",
    s_daily: "Your daily training",
    s_daily_sub: "Everything you need before heading out to train",
    s_recovery: "Recovery",
    s_recovery_sub: "Understand your state to make better decisions",
    f_tests_title: "Lactate tests",
    f_tests_desc: "Upload your field test data and get a complete analysis instantly. The platform automatically detects your LT1 and LT2 thresholds using multiple detection methods and shows a confidence score for each result.",
    f_tests_detail: "Unlimited tests · Multi-discipline · Confidence scoring",
    f_curve_title: "Interactive lactate curve",
    f_curve_desc: "View your complete curve with threshold markers, inflection points and confidence bands. Compare curves between tests to see your real progression.",
    f_curve_detail: "LT1/LT2 markers · Test comparison · Exportable",
    f_zones_title: "Real training zones",
    f_zones_desc: "7 zones calculated directly from your lactate data — not theoretical estimates. Each zone with its range in pace, heart rate and power.",
    f_zones_detail: "Pace · HR · Power · 7 zones · Lactate-based",
    f_dynamic_title: "Dynamic thresholds",
    f_dynamic_desc: "Your training thresholds are recalculated automatically with each new test you upload. No need to wait weeks to see a change: the platform detects improvements or setbacks instantly.",
    f_dynamic_detail: "Automatic updates · Trend detection",
    f_evolution_title: "Threshold evolution",
    f_evolution_desc: "Timeline chart of your LT1 and LT2 with visual trend. See exactly how much you've improved in each training cycle and compare periods.",
    f_evolution_detail: "Full history · Visual trend · Period comparator",
    f_predictions_title: "Race predictions",
    f_predictions_desc: "Estimates for 5K, 10K, half marathon and marathon based on your current thresholds. With confidence bands indicating the most likely range.",
    f_predictions_detail: "5K · 10K · Half marathon · Marathon · Confidence bands",
    f_plan_title: "Goal and physiology based plan",
    f_plan_desc: "The plan is built combining your race goals with your current physiological profile. Automatic training block selection, load progression and sessions adapted to your level.",
    f_plan_detail: "Physiological blocks · Auto progression · Multi-discipline",
    f_calendar_title: "Training calendar",
    f_calendar_desc: "Weekly view with all your planned sessions, including zones, duration and session type. Organized by weeks with volume summary.",
    f_calendar_detail: "Weekly view · Zones per session · Accumulated volume",
    f_garmin_title: "Direct push to Garmin",
    f_garmin_desc: "Your planned sessions are sent automatically to your Garmin watch. You arrive at training and it's already loaded: warm-up, intervals, cool-down.",
    f_garmin_detail: "Auto sync · Full session on your watch",
    f_session_title: "Today's session",
    f_session_desc: "Your session today with all the details: warm-up, main blocks with zone and intensity, and cool-down. All broken down step by step.",
    f_session_detail: "Zone breakdown · Duration · Target intensity",
    f_wellness_title: "Morning check-in",
    f_wellness_desc: "Check your recovery status before training. Sleep, HRV, stress and body battery synced from your Garmin to make better decisions.",
    f_wellness_detail: "Sleep · HRV · Stress · Body Battery · SpO2",
    f_readiness_title: "Readiness",
    f_readiness_desc: "Composite score summarizing your readiness to train today. Based on your recovery metrics and accumulated load.",
    f_readiness_detail: "Score 0-100 · Based on recovery and load",
    f_metrics_title: "Wellness trends",
    f_metrics_desc: "Track the evolution of your recovery metrics over time. Identify patterns and adjust your training before overtraining.",
    f_metrics_detail: "14 days · Visual trend · Multiple metrics",
    f_volume_title: "Training volume",
    f_volume_desc: "12 weeks of volume broken down by discipline. See if you're building load as planned or need to adjust.",
    f_volume_detail: "12 weeks · By discipline · Accumulated load",
    f_block_title: "Active block",
    f_block_desc: "Your current physiological block with its rationale, progression within the cycle and training focus. Know what phase you're in and why.",
    f_block_detail: "Current phase · Rationale · Cycle progression",
    mid_cta_title: "Want to see which plan includes each feature?",
    mid_cta_btn: "Compare plans",
    cta_title: "Start training with real data",
    cta_sub: "Create your free account and upload your first lactate test. No card, no commitment.",
    cta_btn: "Create free account",
    cta_btn2: "See plans",
    badge_free: "Free",
    badge_lactate: "Lactate Lab",
    badge_full: "Full Plan",
    badge_pro: "Pro+",
    badge_elite: "Elite",
    avail_from: "From",
  },
  de: {} as Record<string, string>,
  no: {} as Record<string, string>,
  fr: {} as Record<string, string>,
};

function tx(lang: Lang, key: string): string {
  return T[lang]?.[key] || T.es[key] || key;
}

/* ─── badge config ─── */
type BadgeId = "free" | "lactate" | "full" | "pro" | "elite";
const BADGE_COLORS: Record<BadgeId, string> = {
  free: "#9ca3af",
  lactate: "#22c55e",
  full: "#3b82f6",
  pro: "#d26a36",
  elite: "#1a2f38",
};

function PlanBadge({ badge, lang }: { badge: BadgeId; lang: Lang }) {
  const color = BADGE_COLORS[badge];
  const labelKey = `badge_${badge}`;
  return (
    <span className="ac-badge" style={{ background: `${color}14`, color, borderColor: `${color}30` }}>
      {tx(lang, labelKey)}
    </span>
  );
}

/* ─── SVG mockups ─── */
function MockTests() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="24" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Tests de lactato</text>
        <text x="304" y="24" textAnchor="end" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk,sans-serif">3 tests</text>
        {[
          { date: "12 Mar 2026", lt1: "5:12/km", lt2: "4:28/km", conf: "92%", active: true },
          { date: "28 Feb 2026", lt1: "5:18/km", lt2: "4:35/km", conf: "88%", active: false },
          { date: "15 Feb 2026", lt1: "5:22/km", lt2: "4:40/km", conf: "85%", active: false },
        ].map((t, i) => {
          const y = 40 + i * 40;
          return (
            <g key={i}>
              <rect x="12" y={y} width="296" height="34" rx="6" fill={t.active ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)"} stroke={t.active ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"} strokeWidth=".8"/>
              <text x="22" y={y+14} fill={t.active ? "#fff" : "#9aabb4"} fontSize="9" fontWeight="600" fontFamily="Space Grotesk,sans-serif">{t.date}</text>
              <text x="22" y={y+27} fill="#5e7078" fontSize="8" fontFamily="Space Grotesk,sans-serif">Running</text>
              <text x="160" y={y+14} fill="#22c55e" fontSize="9" fontWeight="600" fontFamily="Space Grotesk,sans-serif">LT1 {t.lt1}</text>
              <text x="160" y={y+27} fill="#f97316" fontSize="9" fontWeight="600" fontFamily="Space Grotesk,sans-serif">LT2 {t.lt2}</text>
              <text x="296" y={y+20} textAnchor="end" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk,sans-serif">{t.conf}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MockCurve() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        {/* Grid lines */}
        {[40,70,100,130].map(y=><line key={y} x1="40" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth=".5"/>)}
        {/* Y axis labels */}
        {[{y:40,l:"8"},{y:70,l:"6"},{y:100,l:"4"},{y:130,l:"2"}].map(a=><text key={a.y} x="32" y={a.y+3} textAnchor="end" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">{a.l}</text>)}
        <text x="16" y="16" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">mmol/L</text>
        {/* Curve */}
        <path d="M50 138 C70 136,100 132,140 124 C165 116,190 96,220 68 C240 48,260 34,290 24" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M50 138 C70 136,100 132,140 124 C165 116,190 96,220 68 C240 48,260 34,290 24 L290 150 L50 150 Z" fill="url(#mcg1)" opacity="0.3"/>
        <defs><linearGradient id="mcg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d26a36" stopOpacity=".25"/><stop offset="100%" stopColor="#d26a36" stopOpacity="0"/></linearGradient></defs>
        {[[50,138],[85,135],[120,130],[155,120],[190,98],[225,68],[255,44],[290,24]].map(([cx,cy],i)=>(
          <circle key={i} cx={cx} cy={cy} r="4" fill="#0e1e24" stroke="#d26a36" strokeWidth="2"/>
        ))}
        {/* LT1 */}
        <line x1="138" y1="18" x2="138" y2="150" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="4 3"/>
        <rect x="118" y="10" width="40" height="14" rx="3" fill="#22c55e"/>
        <text x="138" y="20" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="Space Grotesk,sans-serif">LT1</text>
        {/* LT2 */}
        <line x1="218" y1="18" x2="218" y2="150" stroke="#f97316" strokeWidth="1.2" strokeDasharray="4 3"/>
        <rect x="198" y="10" width="40" height="14" rx="3" fill="#f97316"/>
        <text x="218" y="20" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="Space Grotesk,sans-serif">LT2</text>
        {/* Conf badge */}
        <rect x="246" y="122" width="62" height="18" rx="4" fill="rgba(34,197,94,0.15)"/>
        <text x="277" y="134" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Conf: 92%</text>
        {/* X axis */}
        <text x="170" y="164" textAnchor="middle" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">Ritmo (min/km)</text>
      </svg>
    </div>
  );
}

function MockZones() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Zonas de entrenamiento</text>
        {[
          { z: "Z1", label: "Recuperacion", range: "6:00+", color: "#86efac", w: 50 },
          { z: "Z2", label: "Aerobico", range: "5:20 - 6:00", color: "#22c55e", w: 80 },
          { z: "Z3", label: "Tempo", range: "4:50 - 5:20", color: "#3b82f6", w: 110 },
          { z: "Z4", label: "Umbral", range: "4:25 - 4:50", color: "#8b5cf6", w: 150 },
          { z: "Z5", label: "VO2max", range: "4:05 - 4:25", color: "#f59e0b", w: 185 },
          { z: "Z6", label: "Anaerobico", range: "3:45 - 4:05", color: "#ef4444", w: 220 },
          { z: "Z7", label: "Neuromusc.", range: "<3:45", color: "#991b1b", w: 260 },
        ].map((z, i) => {
          const y = 34 + i * 18;
          return (
            <g key={i}>
              <rect x="16" y={y} width={z.w} height="14" rx="3" fill={z.color} opacity="0.4"/>
              <text x="22" y={y+10} fill="#fff" fontSize="7.5" fontWeight="700" fontFamily="Space Grotesk,sans-serif">{z.z}</text>
              <text x={z.w+22} y={y+10} fill="#9aabb4" fontSize="7.5" fontFamily="Space Grotesk,sans-serif">{z.label}</text>
              <text x="304" y={y+10} textAnchor="end" fill="#5e7078" fontSize="7.5" fontFamily="Space Grotesk,sans-serif">{z.range}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MockDynamic() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Umbrales dinamicos</text>
        {/* Grid */}
        {[50,80,110,140].map(y=><line key={y} x1="40" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth=".5"/>)}
        {/* LT1 trend */}
        <polyline points="50,120 90,114 130,108 170,102 210,96 250,90 290,84" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/>
        {/* LT2 trend */}
        <polyline points="50,100 90,94 130,88 170,82 210,76 250,70 290,64" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round"/>
        {/* Confidence band LT2 */}
        <path d="M50 94 90 88 130 82 170 76 210 70 250 64 290 58 L290 70 250 76 210 82 170 88 130 94 90 100 50 106 Z" fill="#f97316" opacity="0.06"/>
        {[50,90,130,170,210,250,290].map((cx,i)=>(
          <g key={i}>
            <circle cx={cx} cy={120-i*6} r="3" fill="#0e1e24" stroke="#22c55e" strokeWidth="1.5"/>
            <circle cx={cx} cy={100-i*6} r="3" fill="#0e1e24" stroke="#f97316" strokeWidth="1.5"/>
          </g>
        ))}
        {/* Legend */}
        <rect x="50" y="148" width="10" height="3" rx="1.5" fill="#22c55e"/><text x="64" y="152" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk,sans-serif">LT1</text>
        <rect x="100" y="148" width="10" height="3" rx="1.5" fill="#f97316"/><text x="114" y="152" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk,sans-serif">LT2</text>
        <text x="170" y="152" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">Ultimos 6 tests</text>
      </svg>
    </div>
  );
}

function MockEvolution() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Evolucion LT1 / LT2</text>
        <text x="304" y="22" textAnchor="end" fill="#22c55e" fontSize="10" fontWeight="700" fontFamily="Space Grotesk,sans-serif">-18s/km</text>
        {/* LT1 */}
        <polyline points="40,130 80,122 120,114 160,106 200,98 240,90 280,82" fill="none" stroke="#22c55e" strokeWidth="1.8" opacity="0.7" strokeLinecap="round"/>
        {/* LT2 */}
        <polyline points="40,110 80,102 120,96 160,88 200,80 240,72 280,64" fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round"/>
        {[40,80,120,160,200,240,280].map((cx,i)=>(
          <g key={i}>
            <circle cx={cx} cy={130-i*8} r="3.5" fill="#0e1e24" stroke="#22c55e" strokeWidth="1.5"/>
            <circle cx={cx} cy={110-i*8+2} r="3.5" fill="#0e1e24" stroke="#f97316" strokeWidth="1.5"/>
          </g>
        ))}
        {["Ene","Feb","Mar","Abr","May","Jun","Jul"].map((m,i)=>(
          <text key={i} x={40+i*40} y="152" textAnchor="middle" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">{m}</text>
        ))}
      </svg>
    </div>
  );
}

function MockPredictions() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Predicciones</text>
        {[
          { x: 12, dist: "5K", time: "19:42", band: "19:28-19:56", conf: 95 },
          { x: 88, dist: "10K", time: "41:08", band: "40:32-41:44", conf: 88 },
          { x: 164, dist: "Media", time: "1:31:20", band: "1:29-1:33", conf: 82 },
          { x: 240, dist: "Maraton", time: "3:12:00", band: "3:08-3:16", conf: 74 },
        ].map((p, i) => (
          <g key={i}>
            <rect x={p.x} y="32" width="70" height="130" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" strokeWidth=".8"/>
            <text x={p.x+35} y="52" textAnchor="middle" fill="#5e7078" fontSize="9" fontWeight="600" fontFamily="Space Grotesk,sans-serif">{p.dist}</text>
            <text x={p.x+35} y="80" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800" fontFamily="Space Grotesk,sans-serif">{p.time}</text>
            <text x={p.x+35} y="98" textAnchor="middle" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">{p.band}</text>
            {/* Conf bar */}
            <rect x={p.x+12} y="112" width="46" height="5" rx="2.5" fill="rgba(255,255,255,0.06)"/>
            <rect x={p.x+12} y="112" width={46*p.conf/100} height="5" rx="2.5" fill="#22c55e" opacity="0.7"/>
            <text x={p.x+35} y="132" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="600" fontFamily="Space Grotesk,sans-serif">{p.conf}%</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MockPlan() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        {/* Goal */}
        <rect x="12" y="10" width="140" height="44" rx="8" fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.15)" strokeWidth=".8"/>
        <circle cx="30" cy="28" r="8" fill="none" stroke="#ef4444" strokeWidth="1.5"/><circle cx="30" cy="28" r="3" fill="#ef4444"/>
        <text x="44" y="26" fill="#fff" fontSize="9" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Maraton Valencia</text>
        <text x="44" y="40" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk,sans-serif">sub 3:15 — 1 Dic</text>
        {/* Physiology */}
        <rect x="168" y="10" width="140" height="44" rx="8" fill="rgba(34,197,94,0.08)" stroke="rgba(34,197,94,0.15)" strokeWidth=".8"/>
        <text x="180" y="28" fill="#22c55e" fontSize="9" fontWeight="600" fontFamily="Space Grotesk,sans-serif">LT2  4:28/km</text>
        <text x="180" y="42" fill="#22c55e" fontSize="9" fontWeight="600" fontFamily="Space Grotesk,sans-serif">LT1  5:05/km</text>
        {/* Arrow */}
        <line x1="80" y1="56" x2="130" y2="72" stroke="#d26a36" strokeWidth="1" opacity=".5"/>
        <line x1="240" y1="56" x2="190" y2="72" stroke="#d26a36" strokeWidth="1" opacity=".5"/>
        <circle cx="160" cy="74" r="3" fill="#d26a36"/>
        <line x1="160" y1="78" x2="160" y2="88" stroke="#d26a36" strokeWidth="1"/>
        {/* Plan */}
        <rect x="12" y="92" width="296" height="68" rx="8" fill="rgba(210,106,54,0.06)" stroke="rgba(210,106,54,0.12)" strokeWidth=".8"/>
        <text x="160" y="112" textAnchor="middle" fill="#d26a36" fontSize="10" fontWeight="800" fontFamily="Space Grotesk,sans-serif">PLAN PERSONALIZADO</text>
        {/* Phases */}
        {[
          { x: 24, w: 80, label: "Base", c: "#3b82f6" },
          { x: 114, w: 80, label: "Especifico", c: "#f59e0b" },
          { x: 204, w: 80, label: "Competicion", c: "#ef4444" },
        ].map((p,i)=>(
          <g key={i}>
            <rect x={p.x} y="122" width={p.w} height="20" rx="4" fill={`${p.c}20`}/>
            <text x={p.x+p.w/2} y="135" textAnchor="middle" fill={p.c} fontSize="8" fontWeight="600" fontFamily="Space Grotesk,sans-serif">{p.label}</text>
          </g>
        ))}
        <text x="160" y="155" textAnchor="middle" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">26 semanas — progresion automatica</text>
      </svg>
    </div>
  );
}

function MockCalendar() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Semana 12</text>
        <text x="304" y="22" textAnchor="end" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk,sans-serif">42 km</text>
        {["L","M","X","J","V","S","D"].map((d,i)=>{
          const x = 14 + i * 43;
          const sessions = [
            null,
            { h: 60, c: "#f59e0b", t: "4x6' Z4" },
            { h: 35, c: "#22c55e", t: "40' Z2" },
            null,
            { h: 55, c: "#8b5cf6", t: "Fuerza" },
            { h: 70, c: "#3b82f6", t: "Long" },
            null,
          ];
          const s = sessions[i];
          return (
            <g key={i}>
              <text x={x+18} y="38" textAnchor="middle" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk,sans-serif">{d}</text>
              {s ? (
                <>
                  <rect x={x} y={150-s.h} width="36" height={s.h} rx="5" fill={`${s.c}30`} stroke={`${s.c}50`} strokeWidth=".5"/>
                  <text x={x+18} y={150-s.h+16} textAnchor="middle" fill={s.c} fontSize="7" fontWeight="600" fontFamily="Space Grotesk,sans-serif">{s.t}</text>
                </>
              ) : (
                <rect x={x} y="140" width="36" height="10" rx="3" fill="rgba(255,255,255,0.03)"/>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MockGarmin() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        {/* Phone side */}
        <rect x="20" y="20" width="100" height="130" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
        <text x="70" y="44" textAnchor="middle" fill="#d26a36" fontSize="8" fontWeight="700" fontFamily="Space Grotesk,sans-serif">PeakAerobic</text>
        <rect x="30" y="52" width="80" height="20" rx="4" fill="rgba(34,197,94,0.1)"/>
        <text x="70" y="66" textAnchor="middle" fill="#22c55e" fontSize="7" fontWeight="600" fontFamily="Space Grotesk,sans-serif">Enviar a Garmin</text>
        <text x="70" y="86" textAnchor="middle" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">4x6' Z4 Umbral</text>
        <text x="70" y="100" textAnchor="middle" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">55 min</text>
        {/* Arrow */}
        <line x1="130" y1="85" x2="176" y2="85" stroke="#d26a36" strokeWidth="1.5" strokeDasharray="4 3"/>
        <polygon points="174,80 184,85 174,90" fill="#d26a36"/>
        {/* Watch */}
        <rect x="190" y="30" width="110" height="110" rx="24" fill="#1a2f38" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5"/>
        <rect x="200" y="40" width="90" height="90" rx="16" fill="#0e1e24"/>
        <text x="245" y="64" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="600" fontFamily="Space Grotesk,sans-serif">SESION CARGADA</text>
        <text x="245" y="84" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="Space Grotesk,sans-serif">4x6' Z4</text>
        <text x="245" y="100" textAnchor="middle" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk,sans-serif">55 min</text>
        <rect x="218" y="108" width="54" height="14" rx="4" fill="rgba(34,197,94,0.2)"/>
        <text x="245" y="119" textAnchor="middle" fill="#22c55e" fontSize="7" fontWeight="700" fontFamily="Space Grotesk,sans-serif">INICIAR</text>
      </svg>
    </div>
  );
}

function MockSession() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Sesion de hoy</text>
        <text x="304" y="22" textAnchor="end" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk,sans-serif">55 min</text>
        {[
          { y: 34, w: 80, c: "#86efac", label: "10' Z1 — Calentamiento", type: "Warm up" },
          { y: 60, w: 180, c: "#f59e0b", label: "4x6' Z4 — Umbral @ 4:30/km", type: "Main set" },
          { y: 86, w: 50, c: "#22c55e", label: "3' Z2 — Recuperacion entre series", type: "Recovery" },
          { y: 112, w: 180, c: "#f59e0b", label: "4x6' Z4 — Umbral @ 4:30/km", type: "Main set" },
          { y: 138, w: 80, c: "#86efac", label: "10' Z1 — Vuelta a la calma", type: "Cool down" },
        ].map((s, i) => (
          <g key={i}>
            <rect x="16" y={s.y} width={s.w} height="18" rx="4" fill={`${s.c}30`}/>
            <text x={s.w + 22} y={s.y + 12} fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk,sans-serif">{s.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MockWellness() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Estado de hoy</text>
        {[
          { label: "Sueno", val: "7h 20m", color: "#3b82f6", pct: 0.82, sub: "85% calidad" },
          { label: "HRV", val: "52 ms", color: "#22c55e", pct: 0.68, sub: "+8% vs 7d" },
          { label: "Estres", val: "28", color: "#f59e0b", pct: 0.35, sub: "Bajo" },
          { label: "Body Battery", val: "74", color: "#8b5cf6", pct: 0.74, sub: "Buen nivel" },
          { label: "SpO2", val: "97%", color: "#ef4444", pct: 0.97, sub: "Normal" },
        ].map((m, i) => {
          const y = 36 + i * 26;
          return (
            <g key={i}>
              <text x="16" y={y+10} fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk,sans-serif">{m.label}</text>
              <text x="100" y={y+10} fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk,sans-serif">{m.val}</text>
              <rect x="170" y={y+2} width="100" height="6" rx="3" fill="rgba(255,255,255,0.06)"/>
              <rect x="170" y={y+2} width={100*m.pct} height="6" rx="3" fill={m.color} opacity="0.6"/>
              <text x="280" y={y+10} fill="#5e7078" fontSize="7" fontFamily="Space Grotesk,sans-serif">{m.sub}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MockReadiness() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <circle cx="160" cy="80" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"/>
        <circle cx="160" cy="80" r="52" fill="none" stroke="#22c55e" strokeWidth="10" strokeDasharray="245 327" strokeLinecap="round" transform="rotate(-90 160 80)"/>
        <text x="160" y="86" textAnchor="middle" fill="#fff" fontSize="30" fontWeight="800" fontFamily="Space Grotesk,sans-serif">78</text>
        <text x="160" y="104" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="600" fontFamily="Space Grotesk,sans-serif">LISTO PARA ENTRENAR</text>
        <text x="60" y="152" textAnchor="middle" fill="#3b82f6" fontSize="7" fontFamily="Space Grotesk,sans-serif">Sueno 82%</text>
        <text x="130" y="152" textAnchor="middle" fill="#22c55e" fontSize="7" fontFamily="Space Grotesk,sans-serif">HRV 68%</text>
        <text x="195" y="152" textAnchor="middle" fill="#f59e0b" fontSize="7" fontFamily="Space Grotesk,sans-serif">Estres 35%</text>
        <text x="260" y="152" textAnchor="middle" fill="#8b5cf6" fontSize="7" fontFamily="Space Grotesk,sans-serif">BB 74%</text>
      </svg>
    </div>
  );
}

function MockMetrics() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Tendencias 14d</text>
        {[
          { label: "Sueno", points: [80,76,82,78,84,80,86,82,84,88,86,90,88,92], color: "#3b82f6", baseY: 30 },
          { label: "HRV", points: [50,54,48,56,52,58,55,60,56,62,58,64,60,66], color: "#22c55e", baseY: 70 },
          { label: "BB", points: [65,68,62,70,66,72,68,74,70,76,72,78,74,80], color: "#8b5cf6", baseY: 110 },
        ].map((m, idx) => (
          <g key={idx}>
            <text x="16" y={m.baseY+14} fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk,sans-serif">{m.label}</text>
            <polyline points={m.points.map((p,i) => `${50+i*18},${m.baseY+28-(p-Math.min(...m.points))*0.8}`).join(" ")} fill="none" stroke={m.color} strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
            <text x="304" y={m.baseY+14} textAnchor="end" fill={m.color} fontSize="8" fontWeight="600" fontFamily="Space Grotesk,sans-serif">+{Math.round((m.points[13]-m.points[0])/m.points[0]*100)}%</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MockVolume() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Volumen semanal</text>
        <text x="304" y="22" textAnchor="end" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk,sans-serif">km/semana</text>
        {[35,42,38,48,30,45,50,55,40,52,48,58].map((h,i)=>{
          const x = 18 + i * 24;
          const isRecovery = i === 4 || i === 8;
          return (
            <g key={i}>
              <rect x={x} y={148-h*1.6} width="18" height={h*1.6} rx="3" fill={isRecovery ? "#9ca3af" : "#3b82f6"} opacity={isRecovery ? "0.3" : "0.5"}/>
              <text x={x+9} y="160" textAnchor="middle" fill="#5e7078" fontSize="6" fontFamily="Space Grotesk,sans-serif">S{i+1}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MockBlock() {
  return (
    <div className="ac-mock">
      <div className="ac-mock__bar">
        <span className="ac-mock__dot" style={{background:"#ef4444"}}/><span className="ac-mock__dot" style={{background:"#f59e0b"}}/><span className="ac-mock__dot" style={{background:"#22c55e"}}/>
      </div>
      <svg viewBox="0 0 320 170" width="100%" preserveAspectRatio="xMidYMid meet">
        <rect width="320" height="170" fill="#0e1e24"/>
        <text x="16" y="22" fill="#fff" fontSize="11" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Bloque activo</text>
        <rect x="12" y="34" width="296" height="44" rx="8" fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.15)" strokeWidth=".8"/>
        <text x="24" y="54" fill="#3b82f6" fontSize="12" fontWeight="700" fontFamily="Space Grotesk,sans-serif">Capacidad Aerobica</text>
        <text x="24" y="70" fill="#9aabb4" fontSize="9" fontFamily="Space Grotesk,sans-serif">Semana 3 de 5 — Base temprana</text>
        <text x="304" y="54" textAnchor="end" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk,sans-serif">60%</text>
        {/* Progress */}
        <rect x="12" y="88" width="296" height="6" rx="3" fill="rgba(255,255,255,0.06)"/>
        <rect x="12" y="88" width={296*0.6} height="6" rx="3" fill="#3b82f6" opacity="0.7"/>
        {/* Weeks */}
        {["Carga","Progresion","Carga max","Recuperacion",""].map((w,i)=>{
          const x = 12 + i*62;
          const active = i === 2;
          return i < 4 ? (
            <g key={i}>
              <rect x={x} y="104" width="56" height="22" rx="4" fill={active ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.03)"} stroke={active ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"} strokeWidth=".5"/>
              <text x={x+28} y="118" textAnchor="middle" fill={active ? "#3b82f6" : "#5e7078"} fontSize="7" fontFamily="Space Grotesk,sans-serif">{w}</text>
            </g>
          ) : null;
        })}
        <text x="16" y="148" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk,sans-serif">Foco: LT1 extensivo + acumulacion de volumen base</text>
      </svg>
    </div>
  );
}

/* ─── feature definitions ─── */
interface Feature {
  titleKey: string;
  descKey: string;
  detailKey: string;
  badges: BadgeId[];
  Mock: () => JSX.Element;
}

interface Section {
  id: string;
  titleKey: string;
  subKey: string;
  features: Feature[];
}

const SECTIONS: Section[] = [
  {
    id: "analysis", titleKey: "s_analysis", subKey: "s_analysis_sub",
    features: [
      { titleKey: "f_tests_title", descKey: "f_tests_desc", detailKey: "f_tests_detail", badges: ["lactate"], Mock: MockTests },
      { titleKey: "f_curve_title", descKey: "f_curve_desc", detailKey: "f_curve_detail", badges: ["free"], Mock: MockCurve },
      { titleKey: "f_zones_title", descKey: "f_zones_desc", detailKey: "f_zones_detail", badges: ["lactate"], Mock: MockZones },
    ],
  },
  {
    id: "tracking", titleKey: "s_tracking", subKey: "s_tracking_sub",
    features: [
      { titleKey: "f_dynamic_title", descKey: "f_dynamic_desc", detailKey: "f_dynamic_detail", badges: ["lactate"], Mock: MockDynamic },
      { titleKey: "f_evolution_title", descKey: "f_evolution_desc", detailKey: "f_evolution_detail", badges: ["lactate"], Mock: MockEvolution },
      { titleKey: "f_predictions_title", descKey: "f_predictions_desc", detailKey: "f_predictions_detail", badges: ["free"], Mock: MockPredictions },
    ],
  },
  {
    id: "planning", titleKey: "s_planning", subKey: "s_planning_sub",
    features: [
      { titleKey: "f_plan_title", descKey: "f_plan_desc", detailKey: "f_plan_detail", badges: ["full", "pro"], Mock: MockPlan },
      { titleKey: "f_calendar_title", descKey: "f_calendar_desc", detailKey: "f_calendar_detail", badges: ["full"], Mock: MockCalendar },
      { titleKey: "f_garmin_title", descKey: "f_garmin_desc", detailKey: "f_garmin_detail", badges: ["full"], Mock: MockGarmin },
    ],
  },
  {
    id: "daily", titleKey: "s_daily", subKey: "s_daily_sub",
    features: [
      { titleKey: "f_session_title", descKey: "f_session_desc", detailKey: "f_session_detail", badges: ["full"], Mock: MockSession },
      { titleKey: "f_wellness_title", descKey: "f_wellness_desc", detailKey: "f_wellness_detail", badges: ["free"], Mock: MockWellness },
      { titleKey: "f_readiness_title", descKey: "f_readiness_desc", detailKey: "f_readiness_detail", badges: ["free"], Mock: MockReadiness },
    ],
  },
  {
    id: "recovery", titleKey: "s_recovery", subKey: "s_recovery_sub",
    features: [
      { titleKey: "f_metrics_title", descKey: "f_metrics_desc", detailKey: "f_metrics_detail", badges: ["free"], Mock: MockMetrics },
      { titleKey: "f_volume_title", descKey: "f_volume_desc", detailKey: "f_volume_detail", badges: ["free"], Mock: MockVolume },
      { titleKey: "f_block_title", descKey: "f_block_desc", detailKey: "f_block_detail", badges: ["full"], Mock: MockBlock },
    ],
  },
];

/* ─── component ─── */
export function AthleteCatalogPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  function t(key: string) { return tx(lang, key); }

  let globalIdx = 0;

  return (
    <div className="lp ac-page">
      {/* nav */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <a href="/" className="lp-nav__brand" onClick={e => { e.preventDefault(); navigate("/"); }}>PeakAerobic</a>
          <div className="lp-nav__right">
            <a href="/#how" className="lp-nav__link" onClick={e => { e.preventDefault(); navigate("/#how"); }}>{t("nav_how")}</a>
            <a href="/athlete-catalog" className="lp-nav__link lp-nav__link--active">{t("nav_athlete")}</a>
            <a href="/#pricing" className="lp-nav__link" onClick={e => { e.preventDefault(); navigate("/#pricing"); }}>{t("nav_plans")}</a>
            <a href="/compare-plans" className="lp-nav__link" onClick={e => { e.preventDefault(); navigate("/compare-plans"); }}>{t("nav_compare")}</a>
            <a href="/resources" className="lp-nav__link" onClick={e => { e.preventDefault(); navigate("/resources"); }}>{t("nav_blog")}</a>
            <a href="/login" className="lp-nav__link" onClick={e => { e.preventDefault(); navigate("/login"); }}>{t("nav_login")}</a>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section className="ac-hero">
        <div className="lp-w">
          <h1 className="ac-hero__title">{t("hero_title")}</h1>
          <p className="ac-hero__sub">{t("hero_sub")}</p>
          <div className="ac-hero__actions">
            <button className="ac-hero__cta" onClick={() => navigate("/register")}>{t("hero_cta")}</button>
            <button className="ac-hero__cta ac-hero__cta--ghost" onClick={() => navigate("/compare-plans")}>{t("hero_cta2")}</button>
          </div>
        </div>
      </section>

      {/* 3 value props */}
      <section className="ac-vp">
        <div className="lp-w ac-vp__grid">
          {[1,2,3].map(n => (
            <div key={n} className="ac-vp__card">
              <h3 className="ac-vp__card-title">{t(`vp${n}_title`)}</h3>
              <p className="ac-vp__card-desc">{t(`vp${n}_desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* feature sections */}
      {SECTIONS.map((sec, secIdx) => (
        <section key={sec.id} className={`ac-sec ${secIdx % 2 === 1 ? "ac-sec--alt" : ""}`}>
          <div className="lp-w">
            <div className="ac-sec__header">
              <h2 className="ac-sec__title">{t(sec.titleKey)}</h2>
              <p className="ac-sec__sub">{t(sec.subKey)}</p>
            </div>

            <div className="ac-sec__features">
              {sec.features.map((feat) => {
                const idx = globalIdx++;
                const reversed = idx % 2 === 1;
                return (
                  <div key={feat.titleKey} className={`ac-feat ${reversed ? "ac-feat--rev" : ""}`}>
                    <div className="ac-feat__mock">
                      <feat.Mock />
                    </div>
                    <div className="ac-feat__body">
                      <div className="ac-feat__badges">
                        {feat.badges.map(b => <PlanBadge key={b} badge={b} lang={lang} />)}
                      </div>
                      <h3 className="ac-feat__title">{t(feat.titleKey)}</h3>
                      <p className="ac-feat__desc">{t(feat.descKey)}</p>
                      <p className="ac-feat__detail">{t(feat.detailKey)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* mid CTA after planning section */}
          {sec.id === "planning" && (
            <div className="lp-w ac-mid-cta">
              <p className="ac-mid-cta__text">{t("mid_cta_title")}</p>
              <button className="ac-mid-cta__btn" onClick={() => navigate("/compare-plans")}>{t("mid_cta_btn")}</button>
            </div>
          )}
        </section>
      ))}

      {/* bottom CTA */}
      <section className="ac-bottom-cta">
        <div className="lp-w ac-bottom-cta__inner">
          <h2 className="ac-bottom-cta__title">{t("cta_title")}</h2>
          <p className="ac-bottom-cta__sub">{t("cta_sub")}</p>
          <div className="ac-bottom-cta__actions">
            <button className="ac-hero__cta" onClick={() => navigate("/register")}>{t("cta_btn")}</button>
            <button className="ac-hero__cta ac-hero__cta--ghost" onClick={() => navigate("/compare-plans")}>{t("cta_btn2")}</button>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="lp-footer">
        <div className="lp-w lp-footer__row">
          <span className="lp-footer__brand">PeakAerobic</span>
          <span className="lp-footer__copy">&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}

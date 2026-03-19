import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LangProvider, useLang, LANG_LABELS, type Lang } from "../landing/i18n";

/* ── Intersection Observer hook for scroll animations ── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ── Scroll-animated section wrapper ── */
function AnimSection({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const { ref, visible } = useInView(0.1);
  return (
    <div ref={ref} className={`lp-anim ${visible ? "lp-anim--in" : ""} ${className}`} id={id}>
      {children}
    </div>
  );
}

/* ── Language selector ── */
function LangSwitch() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="lp-lang">
      <button type="button" className="lp-lang__btn" onClick={() => setOpen(!open)}>
        {lang.toUpperCase()}
      </button>
      {open && (
        <div className="lp-lang__drop">
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <button key={l} type="button" className={`lp-lang__opt ${l === lang ? "lp-lang__opt--on" : ""}`} onClick={() => { setLang(l); setOpen(false); }}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   i18n
   ═══════════════════════════════════════════════ */

interface EliteFeature { title: string; desc: string }
interface PlanDef { name: string; price: string; desc: string; features: string[]; featured?: boolean; elite?: boolean }

interface TDict {
  /* Pain-point opening */
  pain_h1: string; pain_sub: string;
  pain_1: string; pain_2: string; pain_3: string; pain_4: string;
  pain_cta: string;

  /* Showcase 01-06 */
  f1_num: string; f1_title: string; f1_desc: string;
  f1_b1: string; f1_b2: string; f1_b3: string;
  f1_screen: string; f1_badge_lt1: string; f1_badge_lt2: string; f1_badge_conf: string;

  f2_num: string; f2_title: string; f2_desc: string;
  f2_b1: string; f2_b2: string; f2_b3: string;
  f2_screen: string;

  f3_num: string; f3_title: string; f3_desc: string;
  f3_b1: string; f3_b2: string; f3_b3: string;
  f3_screen: string;

  f4_num: string; f4_title: string; f4_desc: string;
  f4_b1: string; f4_b2: string; f4_b3: string;
  f4_screen: string;

  f5_num: string; f5_title: string; f5_desc: string;
  f5_b1: string; f5_b2: string; f5_b3: string;
  f5_screen: string;

  f6_num: string; f6_title: string; f6_desc: string;
  f6_b1: string; f6_b2: string; f6_b3: string;
  f6_screen: string;

  /* Phone mockup section */
  phone_h2: string; phone_sub: string;
  phone_b1: string; phone_b2: string; phone_b3: string;
  phone_session_title: string; phone_readiness_title: string;
  phone_nav_today: string; phone_nav_week: string; phone_nav_progress: string; phone_nav_recovery: string;

  app_ey: string; app_h2: string; app_sub: string;
  app_today: string; app_zones: string; app_progress: string;

  paths_ey: string; paths_h2: string;
  path_self_title: string; path_self_desc: string; path_self_plan: string;
  path_ai_title: string; path_ai_desc: string; path_ai_plan: string;
  path_elite_title: string; path_elite_desc: string;

  elite_ey: string; elite_h2: string; elite_sub: string;
  elite_features: EliteFeature[];
  elite_cta: string;

  plans_ey: string; plans_h2: string; plans_sub: string;
  plans: PlanDef[];

  cta_h2: string; cta_sub: string; cta_btn: string; cta_compare: string;

  nav_home: string; nav_pricing: string;
}

const T: Record<string, TDict> = {
  es: {
    /* Pain-point opening */
    pain_h1: "Entrenas mucho. No sabes si entrenas bien.",
    pain_sub: "Tus zonas vienen de una formula. Tu plan no sabe nada de ti. Tu progreso es invisible. Y cada vez que corres fuerte, no sabes si estas construyendo o destruyendo.",
    pain_1: "Zonas del reloj basadas en 220 menos tu edad. No en tu sangre.",
    pain_2: "Meses haciendo zona 2 sin saber si realmente estas en zona 2.",
    pain_3: "Planes genericos que no saben si necesitas base o umbral.",
    pain_4: "Sentirte bien no significa estar bien. Sin datos, es adivinanza.",
    pain_cta: "Empieza gratis",

    // 01 — Threshold Detection
    f1_num: "01", f1_title: "Tus zonas de Garmin no son tus zonas reales",
    f1_desc: "Tu reloj usa una formula. Tu cuerpo no funciona con formulas. Sube un test de lactato y el sistema detecta tus umbrales reales cruzando tres metodos independientes, con un score de confianza en cada estimacion.",
    f1_b1: "Deteccion cruzada con score de confianza",
    f1_b2: "Outliers detectados y descartados automaticamente",
    f1_b3: "Funciona con ritmo, potencia o ambos",
    f1_screen: "Analisis de lactato",
    f1_badge_lt1: "LT1: 5:12/km",
    f1_badge_lt2: "LT2: 4:24/km",
    f1_badge_conf: "Confianza: 0.87",

    // 02 — Training Zones
    f2_num: "02", f2_title: "Cada zona calculada desde tu sangre, no desde una formula",
    f2_desc: "Z1 a Z5 en ritmo, potencia y frecuencia cardiaca. Calculadas desde tus umbrales reales, no desde formulas genericas. Se actualizan cada vez que subes un test nuevo.",
    f2_b1: "7 zonas: Recovery, Base, LT1, Sub-T, LT2, VO2, Anaerobico",
    f2_b2: "Ritmo, potencia y FC en cada zona",
    f2_b3: "Se actualizan con cada test nuevo",
    f2_screen: "Zonas de entrenamiento",

    // 03 — Calendar & Planning
    f3_num: "03", f3_title: "Un plan que sabe lo que necesitas esta semana",
    f3_desc: "No un plan generico de 16 semanas. Un plan que analiza tus puntos debiles, selecciona el bloque correcto y genera sesiones reales con dosis progresiva. Sincronizacion directa a Garmin.",
    f3_b1: "Sesiones estructuradas: calentamiento, bloque, vuelta a calma",
    f3_b2: "Mesociclos automaticos basados en tu perfil",
    f3_b3: "Sincronizacion directa a Garmin Connect",
    f3_screen: "Planificacion — Semana 2/4",

    // 04 — VO2max & Metabolic Profile
    f4_num: "04", f4_title: "Sabes cuanto entrenas. No sabes como funciona tu motor.",
    f4_desc: "VO2max, capacidad glucolitica, ratio aerobico y utilizacion fraccional. Todo extraido de tu curva de lactato y tu frecuencia cardiaca. Sabes exactamente donde estas fuerte y donde tienes margen.",
    f4_b1: "VO2max estimado desde tu curva y tu FC",
    f4_b2: "Perfil de combustible: grasa vs carbohidratos por zona",
    f4_b3: "Clasificacion automatica de tu perfil metabolico",
    f4_screen: "Perfil metabolico",

    // 05 — Race Predictions
    f5_num: "05", f5_title: "Deja de adivinar tu ritmo de maraton",
    f5_desc: "5K, 10K, media maraton, maraton. Predicciones calculadas desde tu fisiologia real, no desde una tabla de ritmos. Con rango de confianza para que sepas cuanto fiarte.",
    f5_b1: "Rango de confianza en cada prediccion",
    f5_b2: "Basadas en umbrales, VO2max y capacidad glucolitica",
    f5_b3: "Push directo de objetivos a Garmin",
    f5_screen: "Predicciones de carrera",

    // 06 — Recovery & Readiness
    f6_num: "06", f6_title: "Sentirte bien no significa estar bien",
    f6_desc: "Conecta tu Garmin o Apple Watch. El sistema cruza HRV, sueno, estres y body battery. Un score de readiness te dice si estas listo para la sesion del dia o si necesitas bajar.",
    f6_b1: "HRV, sueno, estres, body battery y SpO2",
    f6_b2: "Score de readiness que cruza todas las metricas",
    f6_b3: "Tendencia a 30 dias para detectar fatiga acumulada",
    f6_screen: "Recuperacion y readiness",

    // Phone mockup
    phone_h2: "Tu entrenamiento en tu bolsillo",
    phone_sub: "Sesion del dia, estado de recuperacion y progresion. Todo accesible desde tu movil, sincronizado con tu Garmin.",
    phone_b1: "Sesion del dia con estructura detallada",
    phone_b2: "Score de readiness en tiempo real",
    phone_b3: "Sincronizacion bidireccional con Garmin",
    phone_session_title: "SESION DE HOY",
    phone_readiness_title: "READINESS",
    phone_nav_today: "Hoy",
    phone_nav_week: "Semana",
    phone_nav_progress: "Progreso",
    phone_nav_recovery: "Recup.",

    // App Frame
    app_ey: "TU PORTAL", app_h2: "Todo en un vistazo", app_sub: "Sesion del dia, estado de recuperacion, zonas actualizadas y progresion test a test. Sin cambiar de app.",
    app_today: "Hoy", app_zones: "Zonas", app_progress: "Progresion",

    // 3 Paths
    paths_ey: "TU DECIDES COMO ENTRENAR",
    paths_h2: "Por tu cuenta, con IA o con un fisiologo real",
    path_self_title: "Auto-gestion", path_self_desc: "Calendario, sesiones estructuradas y tus datos. Tu marcas el ritmo.", path_self_plan: "Pro",
    path_ai_title: "Planificacion inteligente", path_ai_desc: "El sistema selecciona bloques, dosis y progresion basandose en tu perfil. Asesor integrado para resolver dudas.", path_ai_plan: "Pro+",
    path_elite_title: "Fisiologo personal", path_elite_desc: "Un profesional asignado a ti. Contacto 24h, videollamadas semanales, cada sesion revisada.",

    // Elite
    elite_ey: "ELITE", elite_h2: "Tu fisiologo personal, siempre disponible",
    elite_sub: "No es un chatbot. No es un plan generico. Es un fisiologo del ejercicio titulado que conoce tus datos, revisa cada sesion y ajusta tu planificacion cada semana.",
    elite_features: [
      { title: "Fisiologo asignado a tu perfil", desc: "Un profesional que conoce tu historial, tus tests, tus objetivos y tu contexto. No empiezas de cero en cada consulta." },
      { title: "Contacto directo 24h", desc: "WhatsApp o Telegram. Pregunta lo que necesites, cuando lo necesites. Sin esperas, sin tickets de soporte." },
      { title: "Videollamada semanal", desc: "Revision de la semana, ajuste del plan, resolucion de dudas. 30 minutos cara a cara con tu fisiologo." },
      { title: "Cada sesion explicada", desc: "No solo que hacer, sino por que. Tu fisiologo justifica cada entrenamiento basandose en tu estado actual." },
      { title: "Re-planificacion semanal", desc: "El plan se ajusta cada semana segun tus datos, tu feedback y tu disponibilidad real. Nada es rigido." },
      { title: "IA + ciencia integrada", desc: "Acceso al asesor de ciencia con respuestas personalizadas basadas en tu perfil y literatura actualizada." },
    ],
    elite_cta: "Solicitar Elite",

    // Plans
    plans_ey: "PLANES", plans_h2: "Empieza gratis. Escala cuando lo necesites.", plans_sub: "Sin permanencia. Cambia o cancela en cualquier momento.",
    plans: [
      { name: "Starter", price: "0 EUR", desc: "Para probar la plataforma", features: ["2 tests de lactato", "Zonas Z1-Z5", "Predicciones de carrera", "Perfil basico", "1 disciplina"] },
      { name: "Pro", price: "12,99 EUR", desc: "Atleta auto-gestionado", features: ["Tests ilimitados", "Progresion dinamica", "Calendario y graficas", "Analisis de sesion", "Multi-disciplina", "Alertas de retest"] },
      { name: "Pro+", price: "29,99 EUR", desc: "Planificacion completa", features: ["Todo Pro +", "Mesociclos automaticos", "Planificacion inteligente", "Garmin sync bidireccional", "Perfil metabolico avanzado", "Asesor de ciencia"], featured: true },
      { name: "Elite", price: "199 EUR", desc: "Fisiologo personal 24/7", features: ["Todo Pro+ +", "Fisiologo personal asignado", "Contacto directo 24h", "Videollamadas semanales", "Cada sesion explicada", "Re-planificacion semanal"], elite: true },
    ],

    // CTA
    cta_h2: "Empieza hoy", cta_sub: "2 analisis incluidos. Sin tarjeta. Sube tu primer test o introduce tu FC.", cta_btn: "Crear cuenta gratis", cta_compare: "Comparar planes",

    nav_home: "Inicio", nav_pricing: "Precios",
  },

  en: {
    /* Pain-point opening */
    pain_h1: "You train a lot. You don't know if you train right.",
    pain_sub: "Your zones come from a formula. Your plan knows nothing about you. Your progress is invisible. And every time you push hard, you don't know if you're building or breaking.",
    pain_1: "Watch zones based on 220 minus your age. Not on your blood.",
    pain_2: "Months doing zone 2 without knowing if you're actually in zone 2.",
    pain_3: "Generic plans that don't know if you need base or threshold.",
    pain_4: "Feeling good doesn't mean being good. Without data, it's guesswork.",
    pain_cta: "Start free",

    f1_num: "01", f1_title: "Your Garmin zones are not your real zones",
    f1_desc: "Your watch uses a formula. Your body doesn't work with formulas. Upload a lactate test and the system detects your real thresholds by cross-validating three independent methods, with a confidence score on each estimate.",
    f1_b1: "Cross-validated detection with confidence score",
    f1_b2: "Outliers detected and discarded automatically",
    f1_b3: "Works with pace, power or both",
    f1_screen: "Lactate analysis",
    f1_badge_lt1: "LT1: 5:12/km",
    f1_badge_lt2: "LT2: 4:24/km",
    f1_badge_conf: "Confidence: 0.87",

    f2_num: "02", f2_title: "Every zone calculated from your blood, not from a formula",
    f2_desc: "Z1 to Z5 in pace, power and heart rate. Calculated from your real thresholds, not from generic formulas. Updated every time you upload a new test.",
    f2_b1: "7 zones: Recovery, Base, LT1, Sub-T, LT2, VO2, Anaerobic",
    f2_b2: "Pace, power and HR for each zone",
    f2_b3: "Updated with each new test",
    f2_screen: "Training zones",

    f3_num: "03", f3_title: "A plan that knows what you need this week",
    f3_desc: "Not a generic 16-week plan. A plan that analyzes your weak points, selects the right block and generates real sessions with progressive dosing. Direct Garmin sync.",
    f3_b1: "Structured sessions: warm-up, main block, cool-down",
    f3_b2: "Automatic mesocycles based on your profile",
    f3_b3: "Direct Garmin Connect sync",
    f3_screen: "Planning — Week 2/4",

    f4_num: "04", f4_title: "You know how much you train. You don't know how your engine works.",
    f4_desc: "VO2max, glycolytic capacity, aerobic ratio and fractional utilization. Extracted from your lactate curve and heart rate. Know exactly where you are strong and where you have room to grow.",
    f4_b1: "VO2max estimated from your curve and HR",
    f4_b2: "Fuel profile: fat vs carbohydrates per zone",
    f4_b3: "Automatic metabolic profile classification",
    f4_screen: "Metabolic profile",

    f5_num: "05", f5_title: "Stop guessing your marathon pace",
    f5_desc: "5K, 10K, half marathon, marathon. Predictions calculated from your real physiology, not from a pace table. With confidence range so you know how much to trust.",
    f5_b1: "Confidence range on every prediction",
    f5_b2: "Based on thresholds, VO2max and glycolytic capacity",
    f5_b3: "Direct goal push to Garmin",
    f5_screen: "Race predictions",

    f6_num: "06", f6_title: "Feeling good doesn't mean being good",
    f6_desc: "Connect your Garmin or Apple Watch. The system crosses HRV, sleep, stress and body battery. A readiness score tells you if you're ready for the day's session or need to back off.",
    f6_b1: "HRV, sleep, stress, body battery and SpO2",
    f6_b2: "Readiness score crossing all metrics",
    f6_b3: "30-day trend to detect accumulated fatigue",
    f6_screen: "Recovery & readiness",

    // Phone mockup
    phone_h2: "Your training in your pocket",
    phone_sub: "Today's session, recovery status and progression. All accessible from your phone, synced with your Garmin.",
    phone_b1: "Today's session with detailed structure",
    phone_b2: "Real-time readiness score",
    phone_b3: "Bidirectional Garmin sync",
    phone_session_title: "TODAY'S SESSION",
    phone_readiness_title: "READINESS",
    phone_nav_today: "Today",
    phone_nav_week: "Week",
    phone_nav_progress: "Progress",
    phone_nav_recovery: "Recov.",

    app_ey: "YOUR PORTAL", app_h2: "Everything at a glance", app_sub: "Today's session, recovery status, updated zones and test-to-test progression. Without switching apps.",
    app_today: "Today", app_zones: "Zones", app_progress: "Progression",

    paths_ey: "YOU DECIDE HOW TO TRAIN",
    paths_h2: "On your own, with AI or with a real physiologist",
    path_self_title: "Self-managed", path_self_desc: "Calendar, structured sessions and your data. You set the pace.", path_self_plan: "Pro",
    path_ai_title: "Smart planning", path_ai_desc: "The system selects blocks, doses and progression based on your profile. Integrated advisor for questions.", path_ai_plan: "Pro+",
    path_elite_title: "Personal physiologist", path_elite_desc: "A professional assigned to you. 24h contact, weekly video calls, every session reviewed.",

    elite_ey: "ELITE", elite_h2: "Your personal physiologist, always available",
    elite_sub: "It's not a chatbot. It's not a generic plan. It's a qualified exercise physiologist who knows your data, reviews every session and adjusts your planning every week.",
    elite_features: [
      { title: "Physiologist assigned to your profile", desc: "A professional who knows your history, tests, goals and context. You don't start from zero each time." },
      { title: "Direct 24h contact", desc: "WhatsApp or Telegram. Ask whatever you need, whenever you need it. No waiting, no support tickets." },
      { title: "Weekly video call", desc: "Week review, plan adjustment, question resolution. 30 minutes face to face with your physiologist." },
      { title: "Every session explained", desc: "Not just what to do, but why. Your physiologist justifies every workout based on your current state." },
      { title: "Weekly re-planning", desc: "The plan adjusts every week based on your data, feedback and real availability. Nothing is rigid." },
      { title: "Integrated science advisor", desc: "Access to the AI science advisor with personalized answers based on your profile and updated literature." },
    ],
    elite_cta: "Request Elite",

    plans_ey: "PLANS", plans_h2: "Start free. Scale when you need it.", plans_sub: "No commitment. Change or cancel anytime.",
    plans: [
      { name: "Starter", price: "EUR 0", desc: "Try the platform", features: ["2 lactate tests", "Z1-Z5 zones", "Race predictions", "Basic profile", "1 discipline"] },
      { name: "Pro", price: "EUR 12.99", desc: "Self-managed athlete", features: ["Unlimited tests", "Dynamic progression", "Calendar & charts", "Session analysis", "Multi-discipline", "Retest alerts"] },
      { name: "Pro+", price: "EUR 29.99", desc: "Complete planning", features: ["All Pro +", "Auto mesocycles", "Smart planning", "Garmin sync bidirectional", "Advanced metabolic profile", "Science advisor"], featured: true },
      { name: "Elite", price: "EUR 199", desc: "Personal physiologist 24/7", features: ["All Pro+ +", "Personal physiologist assigned", "Direct 24h contact", "Weekly video calls", "Every session explained", "Weekly re-planning"], elite: true },
    ],

    cta_h2: "Start today", cta_sub: "2 analyses included. No card required. Upload your first test or enter your HR.", cta_btn: "Create free account", cta_compare: "Compare plans",

    nav_home: "Home", nav_pricing: "Pricing",
  },
};

/* ═══════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════ */
function AthleteInner() {
  const { t: _t, lang } = useLang();
  const navigate = useNavigate();
  const c = T[lang] || T.es;

  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <a href="/" className="lp-nav__brand" onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate("/"); }}>PeakAerobic</a>
          <div className="lp-nav__right">
            <a href="/" className="lp-nav__link" onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate("/"); }}>{c.nav_home}</a>
            <a href="/coach" className="lp-nav__link">{_t("nav_coach")}</a>
            <a href="#pricing" className="lp-nav__link">{c.nav_pricing}</a>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{_t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════
          1. PAIN-POINT OPENING — dark bg, no banner
         ══════════════════════════════════════════ */}
      <section className="lp-section lp-section--dark" style={{ paddingTop: 120, paddingBottom: 72 }}>
        <div className="lp-w" style={{ maxWidth: 720, textAlign: "center" }}>
          <h1 className="lp-h2 lp-h2--light" style={{ fontSize: "clamp(32px, 5vw, 48px)", marginBottom: 20, lineHeight: 1.1 }}>
            {c.pain_h1}
          </h1>
          <p className="lp-sub lp-sub--light" style={{ maxWidth: 600, marginBottom: 32 }}>
            {c.pain_sub}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start", maxWidth: 520, margin: "0 auto 36px", textAlign: "left" }}>
            {[c.pain_1, c.pain_2, c.pain_3, c.pain_4].map((p: string, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: "#d26a36", fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 2 }}>--</span>
                <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, lineHeight: 1.55 }}>{p}</span>
              </div>
            ))}
          </div>
          <button className="lp-btn-solid lp-btn--hero" onClick={() => navigate("/register")}>{c.pain_cta}</button>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          2. SHOWCASE 01 — Threshold Detection
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">{c.f1_num}</span>
              <h3 className="lp-showcase__title">{c.f1_title}</h3>
              <p className="lp-showcase__desc">{c.f1_desc}</p>
              <ul className="lp-showcase__bullets">
                <li>{c.f1_b1}</li>
                <li>{c.f1_b2}</li>
                <li>{c.f1_b3}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">{c.f1_screen}</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <svg viewBox="0 0 400 180" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <linearGradient id="alc1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d26a36" stopOpacity=".12" /><stop offset="100%" stopColor="#d26a36" stopOpacity="0" /></linearGradient>
                    </defs>
                    {[30,60,90,120,150].map(y => <line key={y} x1="40" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth=".5" />)}
                    <path d="M50 155 C80 153, 120 148, 170 140 C220 125, 260 100, 300 65 C330 40, 350 22, 370 15 L370 160 L50 160 Z" fill="url(#alc1)" />
                    <path d="M50 155 C80 153, 120 148, 170 140 C220 125, 260 100, 300 65 C330 40, 350 22, 370 15" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round" />
                    {[[50,155],[90,152],[130,148],[170,140],[210,128],[250,108],[290,75],[330,42],[360,20]].map(([cx,cy],i) => (
                      <circle key={i} cx={cx} cy={cy} r="4.5" fill="#fff" stroke="#d26a36" strokeWidth="2" />
                    ))}
                    <line x1="155" y1="10" x2="155" y2="160" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5 3" />
                    <rect x="135" y="4" width="40" height="16" rx="4" fill="#22c55e" opacity=".15" />
                    <text x="155" y="15" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="700" fontFamily="Space Grotesk">LT1</text>
                    <line x1="275" y1="10" x2="275" y2="160" stroke="#f97316" strokeWidth="1.5" strokeDasharray="5 3" />
                    <rect x="255" y="4" width="40" height="16" rx="4" fill="#f97316" opacity=".15" />
                    <text x="275" y="15" textAnchor="middle" fill="#f97316" fontSize="10" fontWeight="700" fontFamily="Space Grotesk">LT2</text>
                    <rect x="310" y="50" width="72" height="20" rx="6" fill="#0e1e24" opacity=".9" />
                    <text x="346" y="63" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Conf: 0.87</text>
                    <text x="36" y="155" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">1</text>
                    <text x="36" y="120" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">2</text>
                    <text x="36" y="90" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">4</text>
                    <text x="36" y="60" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">6</text>
                    <text x="36" y="30" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">8</text>
                    <text x="210" y="176" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">mmol/L</text>
                  </svg>
                  <div className="lp-showcase__screen-footer">
                    <span className="lp-showcase__badge lp-showcase__badge--green">{c.f1_badge_lt1}</span>
                    <span className="lp-showcase__badge lp-showcase__badge--orange">{c.f1_badge_lt2}</span>
                    <span className="lp-showcase__badge lp-showcase__badge--dark">{c.f1_badge_conf}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          3. SHOWCASE 02 — Training Zones (reversed, warm)
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">{c.f2_num}</span>
              <h3 className="lp-showcase__title">{c.f2_title}</h3>
              <p className="lp-showcase__desc">{c.f2_desc}</p>
              <ul className="lp-showcase__bullets">
                <li>{c.f2_b1}</li>
                <li>{c.f2_b2}</li>
                <li>{c.f2_b3}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">{c.f2_screen}</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <div style={{ padding: "12px 16px" }}>
                    <div className="lp-app-frame__zones-header" style={{ display: "grid", gridTemplateColumns: "16px 60px 1fr 80px 80px", gap: 4, fontSize: 10, color: "#9aabb4", fontWeight: 600, marginBottom: 6 }}>
                      <span></span><span></span><span></span><span>FC</span><span>{lang === "es" ? "Ritmo" : "Pace"}</span>
                    </div>
                    {[
                      { name: "REC", hr: "< 130", pace: "> 6:10", color: "#10B981" },
                      { name: "BASE", hr: "130-145", pace: "5:30-6:10", color: "#22c55e" },
                      { name: "LT1", hr: "145-156", pace: "4:50-5:30", color: "#3B82F6" },
                      { name: "SUB-T", hr: "156-164", pace: "4:30-4:50", color: "#8B5CF6" },
                      { name: "LT2", hr: "164-172", pace: "4:10-4:30", color: "#F59E0B" },
                      { name: "VO2", hr: "172-184", pace: "3:50-4:10", color: "#EF4444" },
                      { name: "ANC", hr: "> 184", pace: "< 3:50", color: "#DC2626" },
                    ].map(z => (
                      <div key={z.name} style={{ display: "grid", gridTemplateColumns: "16px 60px 1fr 80px 80px", gap: 4, alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(0,0,0,0.04)", fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: z.color, display: "inline-block" }} />
                        <span style={{ fontWeight: 700, color: "#1a2f38" }}>{z.name}</span>
                        <span />
                        <span style={{ color: "#5e7078" }}>{z.hr}</span>
                        <span style={{ color: "#5e7078" }}>{z.pace}</span>
                      </div>
                    ))}
                  </div>
                  <div className="lp-showcase__screen-footer">
                    <span className="lp-showcase__badge lp-showcase__badge--green">Running</span>
                    <span className="lp-showcase__badge lp-showcase__badge--dark">{lang === "es" ? "Actualizado hoy" : "Updated today"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          4. SHOWCASE 03 — Calendar & Planning
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">{c.f3_num}</span>
              <h3 className="lp-showcase__title">{c.f3_title}</h3>
              <p className="lp-showcase__desc">{c.f3_desc}</p>
              <ul className="lp-showcase__bullets">
                <li>{c.f3_b1}</li>
                <li>{c.f3_b2}</li>
                <li>{c.f3_b3}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">{c.f3_screen}</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <div className="lp-showcase__calendar">
                    <div className="lp-showcase__cal-header">
                      {(lang === "es" ? ["Lun","Mar","Mie","Jue","Vie","Sab","Dom"] : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]).map(d => (
                        <span key={d} className="lp-showcase__cal-day-label">{d}</span>
                      ))}
                    </div>
                    <div className="lp-showcase__cal-grid">
                      {[
                        { type: "rest", label: lang === "es" ? "Descanso" : "Rest" },
                        { type: "key", label: lang === "es" ? "4x6' intervalos" : "4x6' intervals", badge: lang === "es" ? "CALIDAD" : "KEY" },
                        { type: "easy", label: lang === "es" ? "40' rodaje suave" : "40' easy run" },
                        { type: "rest", label: lang === "es" ? "Descanso" : "Rest" },
                        { type: "rest", label: lang === "es" ? "Descanso" : "Rest" },
                        { type: "key", label: lang === "es" ? "5x4' ritmo fuerte" : "5x4' threshold", badge: lang === "es" ? "CALIDAD" : "KEY" },
                        { type: "long", label: lang === "es" ? "1h30 tirada larga" : "1h30 long run", badge: lang === "es" ? "LARGO" : "LONG" },
                      ].map((d, i) => (
                        <div key={i} className={`lp-showcase__cal-cell lp-showcase__cal-cell--${d.type}`}>
                          {d.badge && <span className={`lp-showcase__cal-badge lp-showcase__cal-badge--${d.type}`}>{d.badge}</span>}
                          <span className="lp-showcase__cal-label">{d.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="lp-showcase__cal-meta">
                      <span className="lp-showcase__badge lp-showcase__badge--dark">{lang === "es" ? "Base aerobica" : "Aerobic base"}</span>
                      <span className="lp-showcase__badge lp-showcase__badge--orange">{lang === "es" ? "Semana de carga" : "Load week"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          5. SHOWCASE 04 — VO2max & Metabolic Profile (reversed, warm)
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">{c.f4_num}</span>
              <h3 className="lp-showcase__title">{c.f4_title}</h3>
              <p className="lp-showcase__desc">{c.f4_desc}</p>
              <ul className="lp-showcase__bullets">
                <li>{c.f4_b1}</li>
                <li>{c.f4_b2}</li>
                <li>{c.f4_b3}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">{c.f4_screen}</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <div className="lp-showcase__kpi-row">
                    <div className="lp-showcase__kpi">
                      <span className="lp-showcase__kpi-label">VO2max</span>
                      <span className="lp-showcase__kpi-val" style={{color:"#d26a36"}}>54.2</span>
                      <span className="lp-showcase__kpi-unit">ml/kg/min</span>
                    </div>
                    <div className="lp-showcase__kpi">
                      <span className="lp-showcase__kpi-label">VLamax</span>
                      <span className="lp-showcase__kpi-val" style={{color:"#8b5cf6"}}>0.42</span>
                      <span className="lp-showcase__kpi-unit">mmol/L/s</span>
                    </div>
                    <div className="lp-showcase__kpi">
                      <span className="lp-showcase__kpi-label">FU @ LT2</span>
                      <span className="lp-showcase__kpi-val" style={{color:"#22c55e"}}>82%</span>
                      <span className="lp-showcase__kpi-unit">VO2max</span>
                    </div>
                  </div>
                  <svg viewBox="0 0 400 120" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                    <text x="50" y="28" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk" fontWeight="600">{lang === "es" ? "Aerobico" : "Aerobic"}</text>
                    <rect x="120" y="18" width="240" height="16" rx="4" fill="#e5e7eb" opacity=".5" />
                    <rect x="120" y="18" width="192" height="16" rx="4" fill="#22c55e" opacity=".7" />
                    <text x="318" y="30" fill="#22c55e" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">HIGH</text>
                    <text x="50" y="56" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk" fontWeight="600">{lang === "es" ? "Glucolitico" : "Glycolytic"}</text>
                    <rect x="120" y="46" width="240" height="16" rx="4" fill="#e5e7eb" opacity=".5" />
                    <rect x="120" y="46" width="120" height="16" rx="4" fill="#8b5cf6" opacity=".6" />
                    <text x="246" y="58" fill="#8b5cf6" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">MODERATE</text>
                    <text x="50" y="84" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk" fontWeight="600">LT1/LT2</text>
                    <rect x="120" y="74" width="240" height="16" rx="4" fill="#e5e7eb" opacity=".5" />
                    <rect x="120" y="74" width="204" height="16" rx="4" fill="#f59e0b" opacity=".6" />
                    <text x="330" y="86" fill="#f59e0b" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">0.85</text>
                    <rect x="130" y="98" width="140" height="20" rx="6" fill="#0e1e24" opacity=".9" />
                    <text x="200" y="112" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">{lang === "es" ? "Diesel — Larga distancia" : "Diesel — Long distance"}</text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          6. SHOWCASE 05 — Race Predictions
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">{c.f5_num}</span>
              <h3 className="lp-showcase__title">{c.f5_title}</h3>
              <p className="lp-showcase__desc">{c.f5_desc}</p>
              <ul className="lp-showcase__bullets">
                <li>{c.f5_b1}</li>
                <li>{c.f5_b2}</li>
                <li>{c.f5_b3}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">{c.f5_screen}</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <div className="lp-showcase__predictions">
                    {[
                      { dist: "5K", time: "19:42", pace: "3:56/km" },
                      { dist: "10K", time: "41:08", pace: "4:07/km" },
                      { dist: lang === "es" ? "Media" : "Half", time: "1:31:24", pace: "4:20/km" },
                      { dist: lang === "es" ? "Maraton" : "Marathon", time: "3:12:40", pace: "4:34/km" },
                    ].map(p => (
                      <div key={p.dist} className="lp-showcase__pred-row">
                        <span className="lp-showcase__pred-dist">{p.dist}</span>
                        <span className="lp-showcase__pred-time">{p.time}</span>
                        <span className="lp-showcase__pred-pace">{p.pace}</span>
                      </div>
                    ))}
                  </div>
                  <div className="lp-showcase__garmin-push">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
                    <span>Push to Garmin Connect</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          7. SHOWCASE 06 — Recovery & Readiness (reversed, warm)
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">{c.f6_num}</span>
              <h3 className="lp-showcase__title">{c.f6_title}</h3>
              <p className="lp-showcase__desc">{c.f6_desc}</p>
              <ul className="lp-showcase__bullets">
                <li>{c.f6_b1}</li>
                <li>{c.f6_b2}</li>
                <li>{c.f6_b3}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">{c.f6_screen}</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "16px 20px" }}>
                    <svg viewBox="0 0 80 80" width="72" height="72">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" strokeWidth="5" opacity=".3" />
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#22c55e" strokeWidth="5" strokeDasharray="146 201" strokeLinecap="round" transform="rotate(-90 40 40)" />
                      <text x="40" y="44" textAnchor="middle" fill="#1a2f38" fontSize="18" fontWeight="800" fontFamily="Space Grotesk">72</text>
                    </svg>
                    <div className="lp-showcase__kpi-row" style={{ flex: 1, flexWrap: "wrap" }}>
                      {[
                        { label: "HRV", val: "48ms", color: "#22c55e" },
                        { label: lang === "es" ? "Sueno" : "Sleep", val: "6.8h", color: "#3b82f6" },
                        { label: lang === "es" ? "Estres" : "Stress", val: "28", color: "#f59e0b" },
                        { label: "Battery", val: "74%", color: "#8b5cf6" },
                      ].map(k => (
                        <div key={k.label} className="lp-showcase__kpi">
                          <span className="lp-showcase__kpi-label">{k.label}</span>
                          <span className="lp-showcase__kpi-val" style={{ color: k.color }}>{k.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="lp-showcase__screen-footer">
                    <span className="lp-showcase__badge lp-showcase__badge--green">{lang === "es" ? "Listo para entrenar" : "Ready to train"}</span>
                    <span className="lp-showcase__badge lp-showcase__badge--dark">Garmin + Apple Watch</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          7b. PHONE MOCKUP SECTION
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section">
          <div className="lp-w">
            <div className="lp-phone-section">
              <div className="lp-phone-section__text">
                <h2 className="lp-phone-section__title">{c.phone_h2}</h2>
                <p className="lp-phone-section__desc">{c.phone_sub}</p>
                <div className="lp-phone-section__badges">
                  <span className="lp-showcase__badge lp-showcase__badge--green">{c.phone_b1}</span>
                  <span className="lp-showcase__badge lp-showcase__badge--orange">{c.phone_b2}</span>
                  <span className="lp-showcase__badge lp-showcase__badge--dark">{c.phone_b3}</span>
                </div>
              </div>
              <div className="lp-phone">
                <div className="lp-phone__notch" />
                <div className="lp-phone__screen">
                  <div className="lp-phone__header">
                    <svg width="14" height="14" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="#d26a36" strokeWidth="2.5"/><path d="M10 20 L16 10 L22 20" stroke="#d26a36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                    PeakAerobic
                  </div>
                  <div className="lp-phone__card">
                    <span className="lp-phone__card-title">{c.phone_session_title}</span>
                    <span className="lp-phone__badge">LT2</span>
                    <span className="lp-phone__workout-name">4x6{"'"} LT2 cruise intervals</span>
                    <div className="lp-phone__steps">
                      {[
                        { label: lang === "es" ? "Calent." : "Warm-up", dur: "15'", color: "#22c55e" },
                        { label: "4x6' LT2", dur: "24'", color: "#F59E0B" },
                        { label: "Rec 3'", dur: "12'", color: "#10B981" },
                        { label: lang === "es" ? "V. calma" : "Cool-down", dur: "10'", color: "#22c55e" },
                      ].map((s: { label: string; dur: string; color: string }) => (
                        <div key={s.label} className="lp-phone__step">
                          <span className="lp-phone__step-bar" style={{ background: s.color }} />
                          <span>{s.label}</span>
                          <span style={{ color: "rgba(255,255,255,0.4)" }}>{s.dur}</span>
                          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 8 }}>{s.color === "#F59E0B" ? "LT2" : "Z1"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="lp-phone__card">
                    <span className="lp-phone__card-title">{c.phone_readiness_title}</span>
                    <div className="lp-phone__wellness">
                      <svg viewBox="0 0 56 56" width="48" height="48">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray="100 138" strokeLinecap="round" transform="rotate(-90 28 28)" />
                        <text x="28" y="32" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="Space Grotesk">72</text>
                      </svg>
                      <div className="lp-phone__wellness-grid">
                        <div className="lp-phone__wellness-item"><span className="lp-phone__wellness-val">48ms</span><span className="lp-phone__wellness-lbl">HRV</span></div>
                        <div className="lp-phone__wellness-item"><span className="lp-phone__wellness-val">6.8h</span><span className="lp-phone__wellness-lbl">{lang === "es" ? "Sueno" : "Sleep"}</span></div>
                        <div className="lp-phone__wellness-item"><span className="lp-phone__wellness-val">28</span><span className="lp-phone__wellness-lbl">{lang === "es" ? "Estres" : "Stress"}</span></div>
                        <div className="lp-phone__wellness-item"><span className="lp-phone__wellness-val">74%</span><span className="lp-phone__wellness-lbl">Battery</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="lp-phone__nav">
                    <div className="lp-phone__nav-item lp-phone__nav-item--active">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {c.phone_nav_today}
                    </div>
                    <div className="lp-phone__nav-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {c.phone_nav_week}
                    </div>
                    <div className="lp-phone__nav-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                      {c.phone_nav_progress}
                    </div>
                    <div className="lp-phone__nav-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                      {c.phone_nav_recovery}
                    </div>
                  </div>
                </div>
                <div className="lp-phone__bar" />
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          8. APP FRAME MOCKUP — dark section
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section lp-section--dark">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{c.app_ey}</p>
            <h2 className="lp-h2 lp-h2--light">{c.app_h2}</h2>
            <p className="lp-sub lp-sub--light">{c.app_sub}</p>

            <div className="lp-app-frame">
              <div className="lp-app-frame__topbar">
                <div className="lp-app-frame__logo">
                  <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="#d26a36" strokeWidth="2.5"/><path d="M10 20 L16 10 L22 20" stroke="#d26a36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                  <span>PeakAerobic</span>
                </div>
                <div className="lp-app-frame__user">
                  <span>{"Mar\u00eda S."}</span>
                  <div className="lp-app-frame__avatar">MS</div>
                </div>
              </div>

              <div className="lp-app-frame__main">
                <div className="lp-app-frame__col lp-app-frame__col--wide">
                  <div className="lp-app-frame__card">
                    <div className="lp-app-frame__card-header">
                      <span className="lp-app-frame__card-title">{c.app_today}</span>
                      <span className="lp-app-frame__card-phase">Base — Sem 2/4</span>
                    </div>
                    <div className="lp-app-frame__session">
                      <span className="lp-app-frame__badge">{lang === "es" ? "CALIDAD" : "KEY"}</span>
                      <span className="lp-app-frame__workout-name">4x6{"'"} LT2 cruise intervals</span>
                    </div>
                    <div className="lp-app-frame__session-meta">
                      <span>Zona LT2</span><span>52 min</span><span>TSS 68</span>
                    </div>
                    <div className="lp-app-frame__steps">
                      {[
                        { label: lang === "es" ? "Calentamiento" : "Warm-up", dur: "15'", zone: "Z1-Z2", color: "#22c55e" },
                        { label: "4x6' LT2", dur: "24'", zone: "LT2", color: "#F59E0B" },
                        { label: "Rec 3'", dur: "12'", zone: "Z1", color: "#10B981" },
                        { label: lang === "es" ? "Vuelta calma" : "Cool-down", dur: "10'", zone: "Z1", color: "#22c55e" },
                      ].map(s => (
                        <div key={s.label} className="lp-app-frame__step">
                          <span className="lp-app-frame__step-bar" style={{ background: s.color }} />
                          <span className="lp-app-frame__step-label">{s.label}</span>
                          <span className="lp-app-frame__step-dur">{s.dur}</span>
                          <span className="lp-app-frame__step-zone">{s.zone}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lp-app-frame__card lp-app-frame__card--wellness">
                    <div className="lp-app-frame__wellness">
                      <svg viewBox="0 0 80 80" width="64" height="64" className="lp-app-frame__readiness-ring">
                        <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                        <circle cx="40" cy="40" r="32" fill="none" stroke="#22c55e" strokeWidth="5" strokeDasharray="146 201" strokeLinecap="round" transform="rotate(-90 40 40)" />
                        <text x="40" y="44" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="800" fontFamily="Space Grotesk">72</text>
                      </svg>
                      <div className="lp-app-frame__wellness-grid">
                        {[
                          { val: "6.8h", lbl: lang === "es" ? "Sueno" : "Sleep" },
                          { val: "48ms", lbl: "HRV" },
                          { val: "28", lbl: lang === "es" ? "Estres" : "Stress" },
                          { val: "74%", lbl: "Battery" },
                        ].map(m => (
                          <div key={m.lbl} className="lp-app-frame__wellness-item">
                            <span className="lp-app-frame__wellness-val">{m.val}</span>
                            <span className="lp-app-frame__wellness-lbl">{m.lbl}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lp-app-frame__col lp-app-frame__col--narrow">
                  <div className="lp-app-frame__card">
                    <div className="lp-app-frame__card-header">
                      <span className="lp-app-frame__card-title">{c.app_zones}</span>
                      <span className="lp-app-frame__card-phase">Running</span>
                    </div>
                    <div className="lp-app-frame__zones">
                      <div className="lp-app-frame__zones-header">
                        <span></span><span></span><span>FC</span><span>{lang === "es" ? "Ritmo" : "Pace"}</span>
                      </div>
                      {[
                        { name: "REC", hr: "< 130", pace: "> 6:10", color: "#10B981" },
                        { name: "BASE", hr: "130-145", pace: "5:30-6:10", color: "#22c55e" },
                        { name: "LT1", hr: "145-156", pace: "4:50-5:30", color: "#3B82F6" },
                        { name: "SUB-T", hr: "156-164", pace: "4:30-4:50", color: "#8B5CF6" },
                        { name: "LT2", hr: "164-172", pace: "4:10-4:30", color: "#F59E0B" },
                        { name: "VO2", hr: "172-184", pace: "3:50-4:10", color: "#EF4444" },
                        { name: "ANC", hr: "> 184", pace: "< 3:50", color: "#DC2626" },
                      ].map(z => (
                        <div key={z.name} className="lp-app-frame__zone-row">
                          <span className="lp-app-frame__zone-pip" style={{ background: z.color }} />
                          <span className="lp-app-frame__zone-name">{z.name}</span>
                          <span className="lp-app-frame__zone-val">{z.hr}</span>
                          <span className="lp-app-frame__zone-val">{z.pace}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lp-app-frame__card">
                    <div className="lp-app-frame__card-header">
                      <span className="lp-app-frame__card-title">{c.app_progress}</span>
                    </div>
                    <svg viewBox="0 0 260 80" className="lp-app-frame__chart" preserveAspectRatio="xMidYMid meet">
                      {[15,35,55].map(y => <line key={y} x1="10" y1={y} x2="250" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth=".5" />)}
                      <path d="M20 65 L60 60 L100 54 L140 48 L180 41 L220 33 L245 28" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                      {[20,60,100,140,180,220,245].map((x,i) => <circle key={`lt2-${i}`} cx={x} cy={65-i*6.2} r="3" fill="#0e1e24" stroke="#f97316" strokeWidth="1.5" />)}
                      <path d="M20 72 L60 69 L100 66 L140 63 L180 59 L220 56 L245 52" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
                      {["Oct","Nov","Dic","Ene","Feb","Mar","Abr"].map((m,i) => (
                        <text key={m} x={20+i*37.5} y="78" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="6" fontFamily="Space Grotesk">{m}</text>
                      ))}
                    </svg>
                    <div className="lp-app-frame__chart-legend">
                      <span style={{color:"#f97316"}}>LT2 4:24/km</span>
                      <span style={{color:"#22c55e"}}>LT1 5:12/km</span>
                      <span style={{color:"rgba(255,255,255,0.4)"}}>-14s {lang === "es" ? "en 6 meses" : "in 6 months"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lp-app-frame__bottomnav">
                {[
                  { id: "today", label: lang === "es" ? "Hoy" : "Today", active: true, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                  { id: "week", label: lang === "es" ? "Semana" : "Week", active: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
                  { id: "progress", label: lang === "es" ? "Progreso" : "Progress", active: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
                  { id: "recovery", label: lang === "es" ? "Recuperacion" : "Recovery", active: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> },
                ].map(tab => (
                  <div key={tab.id} className={`lp-app-frame__nav-btn ${tab.active ? "lp-app-frame__nav-btn--active" : ""}`}>
                    {tab.icon}
                    <span>{tab.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          9. THREE PATHS — self / AI / elite
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section">
          <div className="lp-w">
            <p className="lp-ey">{c.paths_ey}</p>
            <h2 className="lp-h2">{c.paths_h2}</h2>
            <div className="al-three-paths al-three-paths--light">
              <div className="al-tpath al-tpath--light">
                <h3 className="al-tpath__title al-tpath__title--dark">{c.path_self_title}</h3>
                <p className="al-tpath__desc al-tpath__desc--dark">{c.path_self_desc}</p>
                <span className="lp-showcase__badge lp-showcase__badge--dark">{c.path_self_plan}</span>
              </div>
              <div className="al-tpath al-tpath--light al-tpath--accent-light">
                <h3 className="al-tpath__title al-tpath__title--dark">{c.path_ai_title}</h3>
                <p className="al-tpath__desc al-tpath__desc--dark">{c.path_ai_desc}</p>
                <span className="lp-showcase__badge lp-showcase__badge--orange">{c.path_ai_plan}</span>
              </div>
              <div className="al-tpath al-tpath--light al-tpath--gold-light">
                <h3 className="al-tpath__title al-tpath__title--dark">{c.path_elite_title}</h3>
                <p className="al-tpath__desc al-tpath__desc--dark">{c.path_elite_desc}</p>
                <span className="al-tpath__badge-gold">Elite</span>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          10. ELITE EXPANDED — dark bg, gold theme
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section al-elite-section">
          <div className="lp-w">
            <p className="lp-ey" style={{ color: "#d4af37" }}>{c.elite_ey}</p>
            <h2 className="lp-h2" style={{ color: "#fff" }}>{c.elite_h2}</h2>
            <p className="lp-sub" style={{ color: "rgba(255,255,255,0.65)", maxWidth: 720, margin: "0 auto 40px" }}>{c.elite_sub}</p>
            <div className="al-elite-features">
              {c.elite_features.map((f: EliteFeature, i: number) => (
                <div key={i} className="al-elite-feat">
                  <h4 className="al-elite-feat__title">{f.title}</h4>
                  <p className="al-elite-feat__desc">{f.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32, textAlign: "center" }}>
              <button className="lp-btn-solid al-elite-cta" onClick={() => navigate("/register")}>{c.elite_cta}</button>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          11. PLANS — 4-column pricing grid, dark bg
         ══════════════════════════════════════════ */}
      <AnimSection>
        <section className="lp-section lp-section--dark" id="pricing">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{c.plans_ey}</p>
            <h2 className="lp-h2 lp-h2--light">{c.plans_h2}</h2>
            <p className="lp-sub lp-sub--light">{c.plans_sub}</p>

            <div className="lp-pricing__grid lp-pricing__grid--four">
              {c.plans.map((p: PlanDef) => (
                <div key={p.name} className={`lp-pricing__card${p.featured ? " lp-pricing__card--proplus" : ""}${p.elite ? " lp-pricing__card--elite" : ""}`}>
                  {p.elite && <span className="lp-pricing__badge-elite">Premium</span>}
                  <span className="lp-pricing__plan-name">{p.name}</span>
                  <div className="lp-pricing__price">
                    <span className="lp-pricing__amount">{p.price}</span>
                    <span className="lp-pricing__period">/{lang === "es" ? "mes" : "mo"}</span>
                  </div>
                  <p className="lp-pricing__plan-desc">{p.desc}</p>
                  <ul className="lp-pricing__features">
                    {p.features.map((f: string, fi: number) => (
                      <li key={fi}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.elite ? "#c9a44c" : p.featured ? "#6366f1" : "#22c55e"} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button className={`lp-btn-solid lp-pricing__cta${p.elite ? " lp-btn--elite" : ""}${p.featured ? " lp-btn--proplus" : ""}`} onClick={() => navigate("/register")} type="button">
                    {lang === "es" ? (p.elite ? "Solicitar" : "Empezar") : (p.elite ? "Request" : "Get started")}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <a href="/compare-plans" className="lp-btn-ghost" style={{ fontSize: 15 }}>{c.cta_compare}</a>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══════════════════════════════════════════
          12. CTA
         ══════════════════════════════════════════ */}
      <section className="lp-cta-section">
        <div className="lp-w lp-cta-section__inner">
          <h2 className="lp-h2">{c.cta_h2}</h2>
          <p className="lp-sub">{c.cta_sub}</p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="lp-btn-solid" onClick={() => navigate("/register")}>{c.cta_btn}</button>
            <a href="/compare-plans" className="lp-btn-ghost" onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate("/compare-plans"); }}>{c.cta_compare}</a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-foot">
        <div className="lp-w lp-foot__inner">
          <span className="lp-foot__brand">PeakAerobic</span>
          <span className="lp-foot__line">{_t("foot_tagline")}</span>
          <a href="/resources" className="lp-foot__link">{_t("foot_resources")}</a>
          <a href="/privacy" className="lp-foot__link">{_t("foot_privacy")}</a>
        </div>
      </footer>
    </div>
  );
}

export function AthleteLandingPage() {
  return (
    <LangProvider>
      <AthleteInner />
    </LangProvider>
  );
}

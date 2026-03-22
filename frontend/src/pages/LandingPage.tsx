import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LangProvider, useLang, LANG_LABELS, type Lang } from "../landing/i18n";
import { LactateDemo } from "../landing/LactateDemo";
import { api } from "../lib/api";
import "../styles/landing.css";

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

/* ── Animated hero curve ── */
function HeroCurve() {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 400); return () => clearTimeout(t); }, []);

  return (
    <svg viewBox="0 0 520 220" className="lp-hcurve" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id="hcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d26a36" stopOpacity=".14" />
          <stop offset="100%" stopColor="#d26a36" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 80, 120, 160].map((y) => (
        <line key={y} x1="50" y1={y} x2="500" y2={y} stroke="#1a2f38" strokeWidth=".3" opacity=".12" />
      ))}
      <text x="38" y="164" textAnchor="end" fill="#a3b1b8" fontSize="9" fontFamily="Space Grotesk">1</text>
      <text x="38" y="124" textAnchor="end" fill="#a3b1b8" fontSize="9" fontFamily="Space Grotesk">2</text>
      <text x="38" y="84" textAnchor="end" fill="#a3b1b8" fontSize="9" fontFamily="Space Grotesk">4</text>
      <text x="38" y="44" textAnchor="end" fill="#a3b1b8" fontSize="9" fontFamily="Space Grotesk">8</text>

      <path d="M60 175 C100 173, 160 168, 210 162 C260 150, 300 130, 340 100 C370 76, 400 42, 440 20 C460 12, 480 10, 500 14 L500 200 L60 200 Z" fill="url(#hcg)" className={`lp-hcurve__fill ${on ? "lp-hcurve__fill--on" : ""}`} />
      <path d="M60 175 C100 173, 160 168, 210 162 C260 150, 300 130, 340 100 C370 76, 400 42, 440 20 C460 12, 480 10, 500 14" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round" className={`lp-hcurve__line ${on ? "lp-hcurve__line--on" : ""}`} />
      {[[60,175],[110,172],[160,168],[210,162],[250,155],[290,138],[330,108],[365,80],[400,50],[440,22]].map(([cx,cy],i) => (
        <circle key={i} cx={cx} cy={cy} r="4" fill="#fff" stroke="#d26a36" strokeWidth="2" className={`lp-hcurve__dot ${on ? "lp-hcurve__dot--on" : ""}`} style={{ animationDelay: `${0.6 + i * 0.08}s` }} />
      ))}
      <line x1="195" y1="30" x2="195" y2="200" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="5 3" opacity=".6" />
      <rect x="172" y="24" width="46" height="18" rx="4" fill="#22c55e" opacity=".12" className={`lp-hcurve__tag ${on ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.2s" }} />
      <text x="195" y="36" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="700" fontFamily="Space Grotesk" className={`lp-hcurve__tag ${on ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.2s" }}>LT1</text>
      <line x1="335" y1="30" x2="335" y2="200" stroke="#f97316" strokeWidth="1.2" strokeDasharray="5 3" opacity=".6" />
      <rect x="312" y="24" width="46" height="18" rx="4" fill="#f97316" opacity=".12" className={`lp-hcurve__tag ${on ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.4s" }} />
      <text x="335" y="36" textAnchor="middle" fill="#f97316" fontSize="9" fontWeight="700" fontFamily="Space Grotesk" className={`lp-hcurve__tag ${on ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.4s" }}>LT2</text>
      <rect x="400" y="60" width="88" height="22" rx="6" fill="#0e1e24" opacity=".85" className={`lp-hcurve__tag ${on ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.7s" }} />
      <text x="444" y="75" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk" className={`lp-hcurve__tag ${on ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.7s" }}>Fiabilidad: alta</text>
    </svg>
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

/* ── Scroll-animated section wrapper ── */
function AnimSection({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const { ref, visible } = useInView(0.1);
  return (
    <div ref={ref} className={`lp-anim ${visible ? "lp-anim--in" : ""} ${className}`} id={id}>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Inline translations — LANDING_T
   ══════════════════════════════════════════════════════ */
const LANDING_T: Record<string, Record<string, string>> = {
  es: {
    /* Nav */
    nav_how: "Como funciona",
    nav_pricing: "Planes",
    nav_compare: "Comparar planes",
    nav_enter: "Entrar",

    /* Hero */
    hero_h1: "¿Estas entrenando en la zona correcta? Solo tu fisiologia tiene la respuesta.",
    hero_sub: "PeakAerobic analiza tu test de lactato con 7+ metodos cientificos y calcula tus zonas reales — no estimaciones, no formulas, no suposiciones. ¿Aun no haces tests de lactato? Empieza gratis con tus datos de frecuencia cardiaca.",
    hero_cta_primary: "Analiza tu test de lactato →",
    hero_cta_secondary: "¿Aun no testas? Empieza con tu FC →",
    hero_trust: "Deteccion multi-metodo · 7+ algoritmos validados · Running · Ciclismo · Natacion",

    /* Problem */
    problem_ey: "El problema",
    problem_h2: "El 70% de los atletas entrena con zonas equivocadas",
    problem_hr_title: "Si entrenas con frecuencia cardiaca",
    problem_hr_1: "220−edad tiene ±10-20 ppm de error. Tu Garmin usa esta formula.",
    problem_hr_2: "Zonas de running ≠ zonas de ciclismo. Si usas las mismas, una esta mal.",
    problem_hr_3: "La deriva cardiaca sube tu FC 10-20 ppm en ejercicio estable. Sin lactato como ancla, persigues un objetivo que se mueve.",
    problem_lac_title: "Si ya haces tests de lactato",
    problem_lac_1: "Analizar a ojo detecta 1 punto. 7+ algoritmos muestran donde coinciden.",
    problem_lac_2: "INSCYD cobra €150-350 por test. Tu mereces analisis ilimitados.",
    problem_lac_3: "Un test sin seguimiento es un dato aislado. El valor esta en la evolucion.",

    /* How it works */
    how_ey: "Como funciona",
    how_h2: "Dos caminos. Una plataforma.",
    how_hr_title: "Empiezo con frecuencia cardiaca",
    how_hr_1_title: "Crea tu perfil",
    how_hr_1_text: "FC maxima, FC reposo, deporte y nivel. Zonas iniciales desde FC.",
    how_hr_2_title: "Entrena con zonas estimadas",
    how_hr_2_text: "Sugerencias diarias basadas en tus zonas de FC.",
    how_hr_3_title: "Haz tu primer test de lactato",
    how_hr_3_text: "Cuando estes listo, sube los datos y descubre tus zonas REALES.",
    how_lac_title: "Ya tengo datos de lactato",
    how_lac_1_title: "Sube tu test",
    how_lac_1_text: "Cualquier protocolo, cualquier formato.",
    how_lac_2_title: "Analisis multi-metodo",
    how_lac_2_text: "7+ algoritmos con scoring de confianza.",
    how_lac_3_title: "Tracking y evolucion",
    how_lac_3_text: "Cada test actualiza tu perfil fisiologico.",
    how_converge: "Los dos caminos llevan al mismo sitio: zonas reales calculadas desde tu fisiologia.",

    /* Demo */
    demo_ey: "Pruebalo",
    demo_h2: "Mira como funciona el motor de analisis",

    /* App showcase */
    ap_ey: "Tu portal de atleta",
    ap_h2: "Todo en una app",
    ap_1_title: "Zonas reales, no formulas",
    ap_1_desc: "7 zonas desde lactato real. FC, ritmo y potencia.",
    ap_2_title: "Evolucion de umbrales",
    ap_2_desc: "Tu LT1/LT2 evoluciona test a test.",
    ap_3_title: "Predicciones de carrera",
    ap_3_desc: "5K a maraton con bandas de confianza.",
    ap_4_title: "Tu dia, de un vistazo",
    ap_4_desc: "Readiness, sesion detallada y bienestar.",
    ap_5_title: "Semana y calendario",
    ap_5_desc: "Vista semanal con zonas y volumen.",
    ap_6_title: "Objetivos de carrera",
    ap_6_desc: "Define carreras con fecha y marca. El plan se adapta.",

    /* AI spotlight */
    ai_ey: "Lo que nos hace diferentes",
    ai_h2: "IA que planifica. Un fisiologo que valida.",
    ai_engine_title: "El motor de IA",
    ai_engine_1: "Periodizacion por bloques basada en tus brechas fisiologicas",
    ai_engine_2: "Se adapta a tus umbrales de lactato, no a formulas genericas",
    ai_engine_3: "Ajusta cuando la vida se interpone",
    ai_engine_4: "Envia sesiones estructuradas a tu Garmin",
    ai_human_title: "La revision humana",
    ai_human_1: "David revisa tu plan y datos cada semana",
    ai_human_2: "Detecta lo que los algoritmos no ven",
    ai_human_3: "Valida transiciones de bloque y progresion",
    ai_human_4: "No es un chatbot — es un fisiologo real",
    ai_price_anchor: "Un entrenador personal cobra €150-300/mes. PeakAerobic AI Plan: €19,99/mes — con revision semanal incluida.",

    /* Pricing */
    price_ey: "Planes",
    price_h2: "Empieza gratis. Mejora cuando estes listo.",
    price_period: "mes",
    price_free_name: "Gratis",
    price_free_amount: "0€",
    price_free_desc: "Para empezar",
    price_free_f1: "Zonas estimadas desde FC",
    price_free_f2: "2 tests de lactato con analisis completo",
    price_free_f3: "Sugerencia diaria de entrenamiento",
    price_free_f4: "1 prediccion de carrera",
    price_free_f5: "Sincronizacion Garmin/Strava",
    price_free_cta: "Empieza gratis",
    price_ai_name: "AI Plan",
    price_ai_badge: "Popular",
    price_ai_amount: "19,99€",
    price_ai_desc: "Analisis completo + plan de entrenamiento",
    price_ai_f1: "Tests de lactato ilimitados",
    price_ai_f2: "7 zonas desde datos reales",
    price_ai_f3: "Umbrales dinamicos + evolucion",
    price_ai_f4: "Plan IA completo por objetivos",
    price_ai_f5: "Periodizacion inteligente por bloques",
    price_ai_f6: "Envio a Garmin automatico",
    price_ai_f7: "Revision semanal por David",
    price_ai_cta: "Elige AI Plan",
    price_elite_name: "Elite",
    price_elite_badge: "Coaching 1:1",
    price_elite_amount: "199€",
    price_elite_desc: "Coaching completo con fisiologo",
    price_elite_f1: "Todo lo de AI Plan +",
    price_elite_f2: "Llamada semanal 30 min",
    price_elite_f3: "WhatsApp/Telegram 24h",
    price_elite_f4: "Coach ajusta y re-planifica",
    price_elite_f5: "Feedback por sesion",
    price_elite_f6: "Multi-disciplina ilimitado",
    price_elite_cta: "Contactar a David",
    price_bottom_1: "¿Buscas solo analisis? Lactate Lab desde 7,99€/mes. ¿Necesitas mas?",
    price_bottom_link: "Ver Pro+ y Elite →",
    price_bottom_2: "Todos los planes incluyen deteccion multi-metodo de LT1/LT2 con scoring de confianza.",

    /* FAQ */
    faq_ey: "Preguntas frecuentes",
    faq_q1: "¿Necesito un test de lactato?",
    faq_a1: "No. Empieza gratis con FC. Pero si tienes datos, el analisis es mucho mas preciso.",
    faq_q2: "No hago tests de lactato. ¿PeakAerobic es para mi?",
    faq_a2: "Si. Empieza con tus datos de FC — recibiras zonas estimadas, sugerencias y predicciones. Cuando hagas tu primer test, PeakAerobic recalculara todo con datos reales.",
    faq_q3: "¿Que tan precisas son las zonas de FC?",
    faq_a3: "Las zonas de FC tienen un margen de ±10-20 ppm. Somos transparentes: las zonas de HR son estimaciones. Las zonas de lactato son mediciones. Por eso mostramos tu nivel de confianza.",
    faq_q4: "¿En que se diferencia de INSCYD o TrainingPeaks?",
    faq_a4: "INSCYD cobra €150-350/test y necesita un coach certificado. TrainingPeaks es un calendario sin analisis de lactato. PeakAerobic combina ambos desde 7,99€/mes.",
    faq_q5: "¿Quien revisa mi plan cada semana?",
    faq_a5: "David, fisiologo del ejercicio y fundador. No es un chatbot.",
    faq_q6: "¿Necesito un medidor de lactato caro?",
    faq_a6: "Los medidores portatiles cuestan 150-300€ (Lactate Plus, Lactate Pro 2). Es la misma inversion que 1-2 tests de laboratorio, pero puedes testar ilimitado.",
    faq_q7: "¿Que deportes cubre?",
    faq_a7: "Running, ciclismo, natacion y triatlon. Con zonas especificas por deporte.",
    faq_q8: "¿Mis datos estan seguros?",
    faq_a8: "Tus datos son tuyos. No compartimos nada con terceros.",

    /* Final CTA */
    cta_h2: "Deja de adivinar. Empieza a entrenar con datos reales.",
    cta_btn: "Empieza gratis →",
    cta_sub: "Sin tarjeta de credito. Sin compromiso.",
    cta_placeholder: "tu@email.com",
    cta_submit: "Solicitar acceso",
    cta_done: "Solicitud recibida. Te contactaremos pronto.",

    /* Footer */
    foot_tagline: "Entrenamiento basado en tu fisiologia",
    foot_privacy: "Privacidad",
    foot_compare: "Comparar planes",
  },
  en: {
    /* Nav */
    nav_how: "How it works",
    nav_pricing: "Plans",
    nav_compare: "Compare plans",
    nav_enter: "Log in",

    /* Hero */
    hero_h1: "Are you training in the right zone? Only your physiology has the answer.",
    hero_sub: "PeakAerobic analyzes your lactate test with 7+ scientific methods and calculates your real zones — no estimates, no formulas, no guessing. Don't do lactate tests yet? Start free with your heart rate data.",
    hero_cta_primary: "Analyze your lactate test →",
    hero_cta_secondary: "No tests yet? Start with your HR →",
    hero_trust: "Multi-method detection · 7+ validated algorithms · Running · Cycling · Swimming",

    /* Problem */
    problem_ey: "The problem",
    problem_h2: "70% of athletes train with wrong zones",
    problem_hr_title: "If you train with heart rate",
    problem_hr_1: "220−age has ±10-20 bpm error. Your Garmin uses this formula.",
    problem_hr_2: "Running zones ≠ cycling zones. If you use the same, one is wrong.",
    problem_hr_3: "Cardiac drift raises your HR 10-20 bpm in steady exercise. Without lactate as anchor, you're chasing a moving target.",
    problem_lac_title: "If you already do lactate tests",
    problem_lac_1: "Eyeballing detects 1 point. 7+ algorithms show where they agree.",
    problem_lac_2: "INSCYD charges €150-350 per test. You deserve unlimited analysis.",
    problem_lac_3: "A test without tracking is isolated data. The value is in evolution.",

    /* How it works */
    how_ey: "How it works",
    how_h2: "Two paths. One platform.",
    how_hr_title: "I start with heart rate",
    how_hr_1_title: "Create your profile",
    how_hr_1_text: "Max HR, resting HR, sport and level. Initial HR-based zones.",
    how_hr_2_title: "Train with estimated zones",
    how_hr_2_text: "Daily suggestions based on your HR zones.",
    how_hr_3_title: "Do your first lactate test",
    how_hr_3_text: "When ready, upload data and discover your REAL zones.",
    how_lac_title: "I already have lactate data",
    how_lac_1_title: "Upload your test",
    how_lac_1_text: "Any protocol, any format.",
    how_lac_2_title: "Multi-method analysis",
    how_lac_2_text: "7+ algorithms with confidence scoring.",
    how_lac_3_title: "Tracking and evolution",
    how_lac_3_text: "Each test updates your physiological profile.",
    how_converge: "Both paths lead to the same place: real zones calculated from your physiology.",

    /* Demo */
    demo_ey: "Try it",
    demo_h2: "See how the analysis engine works",

    /* App showcase */
    ap_ey: "Your athlete portal",
    ap_h2: "Everything in one app",
    ap_1_title: "Real zones, not formulas",
    ap_1_desc: "7 zones from real lactate. HR, pace and power.",
    ap_2_title: "Threshold evolution",
    ap_2_desc: "Your LT1/LT2 evolves test by test.",
    ap_3_title: "Race predictions",
    ap_3_desc: "5K to marathon with confidence bands.",
    ap_4_title: "Your day, at a glance",
    ap_4_desc: "Readiness, detailed session and wellness.",
    ap_5_title: "Week and calendar",
    ap_5_desc: "Weekly view with zones and volume.",
    ap_6_title: "Race objectives",
    ap_6_desc: "Define races with date and goal. The plan adapts.",

    /* AI spotlight */
    ai_ey: "What makes us different",
    ai_h2: "AI that plans. A physiologist who validates.",
    ai_engine_title: "The AI engine",
    ai_engine_1: "Block periodization based on your physiological gaps",
    ai_engine_2: "Adapts to your lactate thresholds, not generic formulas",
    ai_engine_3: "Adjusts when life gets in the way",
    ai_engine_4: "Pushes structured sessions to your Garmin",
    ai_human_title: "The human review",
    ai_human_1: "David reviews your plan and data every week",
    ai_human_2: "Catches what algorithms miss",
    ai_human_3: "Validates block transitions and progression",
    ai_human_4: "Not a chatbot — a real physiologist",
    ai_price_anchor: "A personal coach costs €150-300/mo. PeakAerobic AI Plan: €19.99/mo — with weekly review included.",

    /* Pricing */
    price_ey: "Plans",
    price_h2: "Start free. Upgrade when you're ready.",
    price_period: "mo",
    price_free_name: "Free",
    price_free_amount: "€0",
    price_free_desc: "To get started",
    price_free_f1: "HR-based zone estimation",
    price_free_f2: "2 lactate tests with full analysis",
    price_free_f3: "Daily training suggestion",
    price_free_f4: "1 race prediction",
    price_free_f5: "Garmin/Strava sync",
    price_free_cta: "Start free",
    price_ai_name: "AI Plan",
    price_ai_badge: "Popular",
    price_ai_amount: "€19.99",
    price_ai_desc: "Full analysis + training plan",
    price_ai_f1: "Unlimited lactate tests",
    price_ai_f2: "7 zones from real data",
    price_ai_f3: "Dynamic thresholds + evolution",
    price_ai_f4: "Full AI plan by objectives",
    price_ai_f5: "Smart block periodization",
    price_ai_f6: "Auto-push to Garmin",
    price_ai_f7: "Weekly review by David",
    price_ai_cta: "Choose AI Plan",
    price_elite_name: "Elite",
    price_elite_badge: "1:1 Coaching",
    price_elite_amount: "€199",
    price_elite_desc: "Full coaching with physiologist",
    price_elite_f1: "Everything in AI Plan +",
    price_elite_f2: "Weekly 30-min call",
    price_elite_f3: "WhatsApp/Telegram 24h",
    price_elite_f4: "Coach adjusts and re-plans",
    price_elite_f5: "Per-session feedback",
    price_elite_f6: "Unlimited multi-discipline",
    price_elite_cta: "Contact David",
    price_bottom_1: "Just want analysis? Lactate Lab from €7.99/mo. Need more?",
    price_bottom_link: "See Pro+ and Elite →",
    price_bottom_2: "All plans include multi-method LT1/LT2 detection with confidence scoring.",

    /* FAQ */
    faq_ey: "FAQ",
    faq_q1: "Do I need a lactate test?",
    faq_a1: "No. Start free with HR. But if you have data, the analysis is much more precise.",
    faq_q2: "I don't do lactate tests. Is PeakAerobic for me?",
    faq_a2: "Yes. Start with your HR data — you'll get estimated zones, suggestions and predictions. When you do your first test, PeakAerobic will recalculate everything with real data.",
    faq_q3: "How accurate are HR zones?",
    faq_a3: "HR zones have a ±10-20 bpm margin. We're transparent: HR zones are estimates. Lactate zones are measurements. That's why we show your confidence level.",
    faq_q4: "How is it different from INSCYD or TrainingPeaks?",
    faq_a4: "INSCYD charges €150-350/test and needs a certified coach. TrainingPeaks is a calendar without lactate analysis. PeakAerobic combines both from €7.99/mo.",
    faq_q5: "Who reviews my plan each week?",
    faq_a5: "David, exercise physiologist and founder. Not a chatbot.",
    faq_q6: "Do I need an expensive lactate meter?",
    faq_a6: "Portable meters cost €150-300 (Lactate Plus, Lactate Pro 2). Same investment as 1-2 lab tests, but you can test unlimited.",
    faq_q7: "What sports does it cover?",
    faq_a7: "Running, cycling, swimming and triathlon. With sport-specific zones.",
    faq_q8: "Is my data secure?",
    faq_a8: "Your data is yours. We don't share anything with third parties.",

    /* Final CTA */
    cta_h2: "Stop guessing. Start training with real data.",
    cta_btn: "Start free →",
    cta_sub: "No credit card. No commitment.",
    cta_placeholder: "you@email.com",
    cta_submit: "Request access",
    cta_done: "Request received. We'll be in touch soon.",

    /* Footer */
    foot_tagline: "Training based on your physiology",
    foot_privacy: "Privacy",
    foot_compare: "Compare plans",
  },
};

/* Helper: get translated string, fallback to en */
function useLandingT() {
  const { lang } = useLang();
  return (key: string): string => {
    const l = (lang === "es" ? "es" : "en") as string;
    return LANDING_T[l]?.[key] ?? LANDING_T["en"]?.[key] ?? key;
  };
}

/* ══════════════════════════════════════════
   Inner landing (has access to useLang)
   ══════════════════════════════════════════ */
function LandingInner() {
  const t = useLandingT();
  const navigate = useNavigate();
  const [emailBottom, setEmailBottom] = useState("");
  const [submittedBottom, setSubmittedBottom] = useState(false);

  async function handleBeta(e: React.FormEvent, value: string, onDone: () => void) {
    e.preventDefault();
    if (!value.trim()) return;
    try {
      await api.betaSignup(value.trim());
      onDone();
    } catch {
      const list = JSON.parse(localStorage.getItem("pa-beta-signups") || "[]");
      list.push({ email: value.trim(), ts: new Date().toISOString() });
      localStorage.setItem("pa-beta-signups", JSON.stringify(list));
      onDone();
    }
  }

  /* Checkmark SVG helper for pricing */
  const check = (color: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
  );

  /* Bullet SVG helper */
  const bullet = (color: string) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" fill={color} opacity="0.7" /></svg>
  );

  return (
    <div className="lp">
      {/* ── 1. NAV ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand">PeakAerobic</span>
          <div className="lp-nav__right">
            <a href="#how" className="lp-nav__link lp-nav__link--hide-mobile">{t("nav_how")}</a>
            <a href="#pricing" className="lp-nav__link lp-nav__link--hide-mobile">{t("nav_pricing")}</a>
            <button type="button" className="lp-nav__link lp-nav__link--hide-mobile" onClick={() => navigate("/compare-plans")} style={{ background: "none", border: "none", cursor: "pointer" }}>{t("nav_compare")}</button>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══ 2. HERO — Split layout ══ */}
      <section className="lp-hero">
        <div className="lp-hero__inner">
          <div className="lp-hero__content">
            <h1 className="lp-hero__h1">{t("hero_h1")}</h1>
            <p className="lp-hero__sub">{t("hero_sub")}</p>
            <div className="lp-hero__ctas">
              <button className="lp-btn-solid lp-btn--hero" onClick={() => navigate("/compare-plans")} type="button">
                {t("hero_cta_primary")}
              </button>
              <button className="lp-btn-solid lp-btn--hero-ghost" onClick={() => navigate("/compare-plans")} type="button">
                {t("hero_cta_secondary")}
              </button>
            </div>
            <p className="lp-hero__trust">{t("hero_trust")}</p>
          </div>
          <div className="lp-hero__curve-wrap">
            <HeroCurve />
          </div>
        </div>
      </section>

      {/* ══ 3. THE PROBLEM — Two panels ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="problem">
          <div className="lp-w">
            <p className="lp-ey">{t("problem_ey")}</p>
            <h2 className="lp-h2">{t("problem_h2")}</h2>
            <div className="lp-problem__panels">
              {/* HR panel */}
              <div className="lp-problem__panel lp-problem__panel--red">
                <h3 className="lp-problem__panel-title">{t("problem_hr_title")}</h3>
                <ul className="lp-problem__list">
                  <li>{bullet("#ef4444")}<span>{t("problem_hr_1")}</span></li>
                  <li>{bullet("#ef4444")}<span>{t("problem_hr_2")}</span></li>
                  <li>{bullet("#ef4444")}<span>{t("problem_hr_3")}</span></li>
                </ul>
              </div>
              {/* Lactate panel */}
              <div className="lp-problem__panel lp-problem__panel--orange">
                <h3 className="lp-problem__panel-title">{t("problem_lac_title")}</h3>
                <ul className="lp-problem__list">
                  <li>{bullet("#f97316")}<span>{t("problem_lac_1")}</span></li>
                  <li>{bullet("#f97316")}<span>{t("problem_lac_2")}</span></li>
                  <li>{bullet("#f97316")}<span>{t("problem_lac_3")}</span></li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 4. HOW IT WORKS — Two paths ══ */}
      <AnimSection>
        <section className="lp-section lp-section--dark" id="how">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{t("how_ey")}</p>
            <h2 className="lp-h2 lp-h2--light">{t("how_h2")}</h2>
            <div className="lp-how__paths">
              {/* HR path */}
              <div className="lp-how__path lp-how__path--green">
                <h3 className="lp-how__path-title">{t("how_hr_title")}</h3>
                {(["1","2","3"] as const).map(n => (
                  <div key={n} className="lp-how__path-step">
                    <span className="lp-how__path-num">{n}</span>
                    <div>
                      <h4 className="lp-how__path-step-title">{t(`how_hr_${n}_title`)}</h4>
                      <p className="lp-how__path-step-text">{t(`how_hr_${n}_text`)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Lactate path */}
              <div className="lp-how__path lp-how__path--orange">
                <h3 className="lp-how__path-title">{t("how_lac_title")}</h3>
                {(["1","2","3"] as const).map(n => (
                  <div key={n} className="lp-how__path-step">
                    <span className="lp-how__path-num">{n}</span>
                    <div>
                      <h4 className="lp-how__path-step-title">{t(`how_lac_${n}_title`)}</h4>
                      <p className="lp-how__path-step-text">{t(`how_lac_${n}_text`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="lp-how__converge">{t("how_converge")}</p>
          </div>
        </section>
      </AnimSection>

      {/* ══ 5. INTERACTIVE DEMO ══ */}
      <AnimSection>
        <section className="lp-section lp-section--light" id="demo">
          <div className="lp-w">
            <p className="lp-ey">{t("demo_ey")}</p>
            <h2 className="lp-h2">{t("demo_h2")}</h2>
          </div>
        </section>
      </AnimSection>
      <LactateDemo />

      {/* ══ 6. THE APP — 6 feature cards (3x2) ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="athlete-portal">
          <div className="lp-w">
            <p className="lp-ey">{t("ap_ey")}</p>
            <h2 className="lp-h2">{t("ap_h2")}</h2>

            <div className="lp-showcase__grid">
              {/* Card 1: Zones */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    {[
                      { y: 10, w: 40, color: "#86efac", label: "Z1" },
                      { y: 24, w: 65, color: "#22c55e", label: "Z2" },
                      { y: 38, w: 90, color: "#3b82f6", label: "Z3" },
                      { y: 52, w: 115, color: "#8b5cf6", label: "Z4" },
                      { y: 66, w: 140, color: "#f59e0b", label: "Z5" },
                      { y: 80, w: 165, color: "#ef4444", label: "Z6" },
                    ].map((z, i) => (
                      <g key={i}>
                        <rect x="12" y={z.y} width={z.w} height="10" rx="5" fill={z.color} opacity="0.7" />
                        <text x={z.w + 16} y={z.y + 8} fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">{z.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_1_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_1_desc")}</p>
              </div>

              {/* Card 2: Evolution */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    <polyline points="20,75 50,68 80,58 110,48 140,38 170,30" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                    <polyline points="20,65 50,60 80,52 110,44 140,36 170,28" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                    {[[20,75],[50,68],[80,58],[110,48],[140,38],[170,30]].map(([cx,cy],i) => (
                      <circle key={`g${i}`} cx={cx} cy={cy} r="3" fill="#fff" stroke="#22c55e" strokeWidth="1.5" />
                    ))}
                    {[[20,65],[50,60],[80,52],[110,44],[140,36],[170,28]].map(([cx,cy],i) => (
                      <circle key={`o${i}`} cx={cx} cy={cy} r="3" fill="#fff" stroke="#f97316" strokeWidth="1.5" />
                    ))}
                    <circle cx="150" cy="12" r="3" fill="#22c55e" /><text x="158" y="15" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">LT1</text>
                    <circle cx="175" cy="12" r="3" fill="#f97316" /><text x="183" y="15" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">LT2</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_2_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_2_desc")}</p>
              </div>

              {/* Card 3: Predictions */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    {[
                      { x: 14, dist: "5K", time: "19:42" },
                      { x: 60, dist: "10K", time: "41:08" },
                      { x: 106, dist: "Media", time: "1:31" },
                      { x: 152, dist: "Marat.", time: "3:12" },
                    ].map((p, i) => (
                      <g key={i}>
                        <rect x={p.x} y="12" width="40" height="76" rx="8" fill="rgba(210,106,54,0.04)" stroke="rgba(210,106,54,0.1)" strokeWidth="1" />
                        <text x={p.x + 20} y="28" textAnchor="middle" fill="#9ca3af" fontSize="7" fontWeight="600" fontFamily="Space Grotesk">{p.dist}</text>
                        <text x={p.x + 20} y="50" textAnchor="middle" fill="#1a2f38" fontSize="12" fontWeight="800" fontFamily="Space Grotesk">{p.time}</text>
                        <rect x={p.x + 6} y="70" width="28" height="4" rx="2" fill="#e5e7eb" />
                        <rect x={p.x + 6} y="70" width={20 - i * 3} height="4" rx="2" fill="#22c55e" opacity="0.7" />
                        <text x={p.x + 20} y="82" textAnchor="middle" fill="#9ca3af" fontSize="6" fontFamily="Space Grotesk">{["95%","88%","82%","74%"][i]}</text>
                      </g>
                    ))}
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_3_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_3_desc")}</p>
              </div>

              {/* Card 4: Today */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    <circle cx="50" cy="50" r="28" fill="none" stroke="#e5e7eb" strokeWidth="5" />
                    <circle cx="50" cy="50" r="28" fill="none" stroke="#22c55e" strokeWidth="5" strokeDasharray="132 176" strokeLinecap="round" transform="rotate(-90 50 50)" />
                    <text x="50" y="55" textAnchor="middle" fill="#1a2f38" fontSize="16" fontWeight="800" fontFamily="Space Grotesk">78</text>
                    <rect x="95" y="20" width="90" height="12" rx="4" fill="#e5e7eb" />
                    <rect x="95" y="38" width="70" height="8" rx="3" fill="#f3f4f6" />
                    <rect x="95" y="55" width="90" height="24" rx="6" fill="rgba(34,197,94,0.08)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
                    <text x="140" y="71" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">LISTO</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_4_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_4_desc")}</p>
              </div>

              {/* Card 5: Week */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    {[0,1,2,3,4,5,6].map(i => {
                      const x = 12 + i * 26;
                      const colors = ["transparent", "#f59e0b", "#22c55e", "transparent", "#f59e0b", "#3b82f6", "transparent"];
                      const heights = [0, 50, 30, 0, 45, 60, 0];
                      return (
                        <g key={i}>
                          {heights[i] > 0 && <rect x={x} y={88 - heights[i]} width="20" height={heights[i]} rx="4" fill={colors[i]} opacity="0.6" />}
                          <text x={x + 10} y="98" textAnchor="middle" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">{["L","M","X","J","V","S","D"][i]}</text>
                        </g>
                      );
                    })}
                    <text x="12" y="16" fill="#1a2f38" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">Semana 12</text>
                    <text x="188" y="16" textAnchor="end" fill="#9ca3af" fontSize="8" fontFamily="Space Grotesk">42 km</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_5_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_5_desc")}</p>
              </div>

              {/* Card 6: Objectives */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    <rect x="12" y="12" width="176" height="34" rx="8" fill="rgba(239,68,68,0.06)" stroke="rgba(239,68,68,0.15)" strokeWidth="1" />
                    <rect x="12" y="12" width="3" height="34" rx="1.5" fill="#ef4444" />
                    <text x="24" y="28" fill="#1a2f38" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">{"Maraton Valencia"}</text>
                    <text x="24" y="40" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">{"sub 3:15"}</text>
                    <text x="170" y="32" textAnchor="end" fill="#ef4444" fontSize="7" fontWeight="700" fontFamily="Space Grotesk">ALTA</text>
                    <rect x="12" y="52" width="176" height="34" rx="8" fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.15)" strokeWidth="1" />
                    <rect x="12" y="52" width="3" height="34" rx="1.5" fill="#f59e0b" />
                    <text x="24" y="68" fill="#1a2f38" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">10K San Silvestre</text>
                    <text x="24" y="80" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">{"sub 40:00"}</text>
                    <text x="170" y="72" textAnchor="end" fill="#f59e0b" fontSize="7" fontWeight="700" fontFamily="Space Grotesk">MEDIA</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_6_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_6_desc")}</p>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 7. AI PLAN SPOTLIGHT ══ */}
      <AnimSection>
        <section className="lp-section lp-section--dark" id="ai-spotlight">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{t("ai_ey")}</p>
            <h2 className="lp-h2 lp-h2--light">{t("ai_h2")}</h2>
            <div className="lp-ai__cols">
              <div className="lp-ai__col">
                <h3 className="lp-ai__col-title">{t("ai_engine_title")}</h3>
                <ul className="lp-ai__list">
                  <li>{check("#22c55e")}<span>{t("ai_engine_1")}</span></li>
                  <li>{check("#22c55e")}<span>{t("ai_engine_2")}</span></li>
                  <li>{check("#22c55e")}<span>{t("ai_engine_3")}</span></li>
                  <li>{check("#22c55e")}<span>{t("ai_engine_4")}</span></li>
                </ul>
              </div>
              <div className="lp-ai__col">
                <h3 className="lp-ai__col-title">{t("ai_human_title")}</h3>
                <ul className="lp-ai__list">
                  <li>{check("#d26a36")}<span>{t("ai_human_1")}</span></li>
                  <li>{check("#d26a36")}<span>{t("ai_human_2")}</span></li>
                  <li>{check("#d26a36")}<span>{t("ai_human_3")}</span></li>
                  <li>{check("#d26a36")}<span>{t("ai_human_4")}</span></li>
                </ul>
              </div>
            </div>
            <p className="lp-ai__price-anchor">{t("ai_price_anchor")}</p>
          </div>
        </section>
      </AnimSection>

      {/* ══ 8. PRICING — 3 tiers ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="pricing">
          <div className="lp-w">
            <p className="lp-ey">{t("price_ey")}</p>
            <h2 className="lp-h2">{t("price_h2")}</h2>

            <div className="lp-pricing__main-grid">
              {/* Free */}
              <div className="lp-pricing__card">
                <span className="lp-pricing__plan-name">{t("price_free_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_free_amount")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_free_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_free_f1","price_free_f2","price_free_f3","price_free_f4","price_free_f5"] as const).map(k => (
                    <li key={k}>{check("#9ca3af")}{t(k)}</li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--ghost lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_free_cta")}</button>
              </div>

              {/* AI Plan — highlighted */}
              <div className="lp-pricing__card lp-pricing__card--highlighted">
                <span className="lp-pricing__badge">{t("price_ai_badge")}</span>
                <span className="lp-pricing__plan-name">{t("price_ai_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_ai_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_ai_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_ai_f1","price_ai_f2","price_ai_f3","price_ai_f4","price_ai_f5","price_ai_f6","price_ai_f7"] as const).map(k => (
                    <li key={k}>{check("#d26a36")}{t(k)}</li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--accent lp-pricing__cta" onClick={() => navigate("/compare-plans")} type="button">{t("price_ai_cta")}</button>
              </div>

              {/* Elite */}
              <div className="lp-pricing__card">
                <span className="lp-pricing__badge lp-pricing__badge--gold">{t("price_elite_badge")}</span>
                <span className="lp-pricing__plan-name">{t("price_elite_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_elite_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_elite_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_elite_f1","price_elite_f2","price_elite_f3","price_elite_f4","price_elite_f5","price_elite_f6"] as const).map(k => (
                    <li key={k}>{check("#c9a44c")}{t(k)}</li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--elite lp-pricing__cta" onClick={() => navigate("/compare-plans")} type="button">{t("price_elite_cta")}</button>
              </div>
            </div>

            <p className="lp-pricing__bottom-note">
              {t("price_bottom_1")}{" "}
              <a href="/compare-plans" className="lp-pricing__bottom-link" onClick={(e) => { e.preventDefault(); navigate("/compare-plans"); }}>{t("price_bottom_link")}</a>
            </p>
            <p className="lp-pricing__bottom-note">{t("price_bottom_2")}</p>
          </div>
        </section>
      </AnimSection>

      {/* ══ 9. FAQ ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="faq">
          <div className="lp-w">
            <div className="lp-faq__wrap">
              <p className="lp-ey">{t("faq_ey")}</p>
              <div className="lp-faq__list">
                {(["1","2","3","4","5","6","7","8"] as const).map(n => (
                  <details key={n} className="lp-faq__item">
                    <summary className="lp-faq__q">{t(`faq_q${n}`)}</summary>
                    <p className="lp-faq__a">{t(`faq_a${n}`)}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 10. FINAL CTA ══ */}
      <section className="lp-section lp-section--dark" id="cta">
        <div className="lp-w">
          <div className="lp-cta-section__inner">
            <h2 className="lp-h2 lp-h2--light">{t("cta_h2")}</h2>
            {submittedBottom ? (
              <div className="lp-done">{t("cta_done")}</div>
            ) : (
              <>
                <div className="lp-cta__btn-row">
                  <button className="lp-btn-solid lp-btn--hero" onClick={() => navigate("/login")} type="button">
                    {t("cta_btn")}
                  </button>
                </div>
                <p className="lp-sub lp-sub--light" style={{ marginBottom: 32 }}>{t("cta_sub")}</p>
                <form className="lp-form" onSubmit={(e) => handleBeta(e, emailBottom, () => setSubmittedBottom(true))}>
                  <input type="email" className="lp-form__input lp-form__input--dark" placeholder={t("cta_placeholder")} value={emailBottom} onChange={(e) => setEmailBottom(e.target.value)} required />
                  <button type="submit" className="lp-btn-solid lp-btn--accent">{t("cta_submit")}</button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 11. Footer ── */}
      <footer className="lp-foot">
        <div className="lp-w lp-foot__inner">
          <span className="lp-foot__brand">PeakAerobic</span>
          <span className="lp-foot__line">{t("foot_tagline")}</span>
          <div className="lp-foot__links">
            <a href="/privacy" className="lp-foot__link">{t("foot_privacy")}</a>
            <a href="/compare-plans" className="lp-foot__link" onClick={(e) => { e.preventDefault(); navigate("/compare-plans"); }}>{t("foot_compare")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Export with LangProvider wrapper ── */
export function LandingPage() {
  return (
    <LangProvider>
      <LandingInner />
    </LangProvider>
  );
}

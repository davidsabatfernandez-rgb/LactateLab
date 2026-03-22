import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LangProvider, useLang, LANG_LABELS, type Lang } from "../landing/i18n";
import { LactateDemo } from "../landing/LactateDemo";
import { api } from "../lib/api";

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

/* ── Inline translations ── */
const BETA_T: Record<string, Record<string, string>> = {
  es: {
    nav_home: "Inicio",
    nav_demo: "Demo",
    nav_pricing: "Planes",
    nav_faq: "FAQ",
    nav_enter: "Entrar",

    hero_h1: "Tus zonas est\u00E1n mal. Nosotros las arreglamos.",
    hero_sub: "El \u00FAnico sistema que convierte tus datos de lactato en zonas reales, an\u00E1lisis fisiol\u00F3gico y planes de entrenamiento personalizados.",
    hero_cta: "Prueba gratis",
    hero_note: "Beta privada \u00B7 Plazas limitadas \u00B7 Tambi\u00E9n funciona solo con frecuencia card\u00EDaca",

    problem_ey: "El problema",
    problem_h2: "El 70% entrena con zonas equivocadas",
    problem_1: "220\u2212edad tiene \u00B110-20 ppm de error. Tu Garmin usa esta f\u00F3rmula.",
    problem_2: "Zonas de running \u2260 zonas de ciclismo. Si usas las mismas, una est\u00E1 mal.",
    problem_3: "Un test sin an\u00E1lisis es un n\u00FAmero en una libreta.",
    problem_4: "VLamax, brechas de capacidad y predicciones necesitan m\u00E1s que un Excel.",

    how_ey: "C\u00F3mo funciona",
    how_h2: "Tres pasos a zonas reales",
    how_1_title: "Sube tu test",
    how_1_text: "Cualquier protocolo, cualquier formato. \u00BFA\u00FAn no testas? Empieza solo con FC.",
    how_2_title: "Analizamos tus datos",
    how_2_text: "7+ m\u00E9todos cient\u00EDficos detectan tus umbrales reales y tus debilidades fisiol\u00F3gicas.",
    how_3_title: "Prescribimos tu entrenamiento",
    how_3_text: "Planes por objetivos que atacan tus puntos d\u00E9biles. Se adaptan semana a semana.",

    demo_ey: "Pru\u00E9balo",
    demo_h2: "Pru\u00E9balo ahora \u2014 sin registro",
    demo_sub: "Introduce datos de ejemplo y mira el an\u00E1lisis multi-m\u00E9todo en directo.",

    ap_ey: "Tu portal de atleta",
    ap_h2: "Todo lo que un atleta serio necesita",
    ap_1_title: "Zonas reales, no f\u00F3rmulas",
    ap_1_desc: "7 zonas desde lactato real. FC, ritmo y potencia.",
    ap_2_title: "Evoluci\u00F3n de umbrales",
    ap_2_desc: "Tu LT1/LT2 evoluciona test a test. Tendencia visual.",
    ap_3_title: "Predicciones de carrera",
    ap_3_desc: "5K a marat\u00F3n con bandas de confianza.",
    ap_4_title: "Tu d\u00EDa, de un vistazo",
    ap_4_desc: "Readiness, sesi\u00F3n detallada y m\u00E9tricas de bienestar.",
    ap_5_title: "Semana y calendario",
    ap_5_desc: "Vista semanal con distribuci\u00F3n por zonas y volumen.",
    ap_6_title: "Objetivos de carrera",
    ap_6_desc: "Define carreras con fecha y marca. El plan se adapta.",

    sci_ey: "La ciencia detr\u00E1s",
    sci_h2: "Basado en fisiolog\u00EDa revisada por pares",
    sci_1_title: "7+ m\u00E9todos de detecci\u00F3n",
    sci_1_text: "No usamos una f\u00F3rmula. Ejecutamos Baseline Rise, ModDmax, Sustained Increase y m\u00E1s. Mostramos d\u00F3nde coinciden.",
    sci_2_title: "Scoring de confianza",
    sci_2_text: "Cada umbral viene con su puntuaci\u00F3n de acuerdo entre m\u00E9todos. Sabes exactamente cu\u00E1nto confiar.",
    sci_3_title: "No es una caja negra",
    sci_3_text: "Ves cada m\u00E9todo, cada punto, cada decisi\u00F3n. Calibrado con Faude 2009, Bishop 1998, Billat 2003.",
    sci_author: "Desarrollado por David Sabat, fisi\u00F3logo del deporte",

    price_ey: "Planes",
    price_h2: "Elige tu plan",
    price_sub: "Precios de beta \u2014 bloquea tu precio para siempre.",
    price_period: "mes",
    price_bottom: "Todos los planes incluyen detecci\u00F3n multi-m\u00E9todo de LT1/LT2 con scoring de confianza.",
    price_secondary_label: "\u00BFBuscas algo m\u00E1s espec\u00EDfico?",

    price_free_name: "Gratis",
    price_free_amount: "0\u20AC",
    price_free_desc: "Para empezar",
    price_free_f1: "5 zonas estimadas desde FC",
    price_free_f2: "2 tests de lactato (demo)",
    price_free_f3: "Sugerencia diaria de entrenamiento",
    price_free_f4: "1 predicci\u00F3n de carrera",
    price_free_f5: "Sincronizaci\u00F3n Garmin/Strava",
    price_free_cta: "Empieza gratis",

    price_ai_name: "Plan IA",
    price_ai_badge: "Popular",
    price_ai_amount: "19,99\u20AC",
    price_ai_desc: "An\u00E1lisis completo + plan de entrenamiento",
    price_ai_f1: "Tests de lactato ilimitados",
    price_ai_f2: "7 zonas desde datos reales",
    price_ai_f3: "Umbrales din\u00E1micos + evoluci\u00F3n",
    price_ai_f4: "Plan IA completo por objetivos",
    price_ai_f5: "Periodizaci\u00F3n inteligente por bloques",
    price_ai_f6: "Env\u00EDo a Garmin autom\u00E1tico",
    price_ai_f7: "Revisi\u00F3n semanal por David (email)",
    price_ai_cta: "Solicitar acceso",

    price_elite_name: "Elite",
    price_elite_badge: "Coaching 1:1",
    price_elite_amount: "199\u20AC",
    price_elite_desc: "Coaching completo con fisi\u00F3logo",
    price_elite_f1: "Todo lo de Plan IA +",
    price_elite_f2: "Llamada semanal 30 min",
    price_elite_f3: "WhatsApp/Telegram 24h",
    price_elite_f4: "Coach ajusta y re-planifica",
    price_elite_f5: "Feedback por sesi\u00F3n",
    price_elite_f6: "Multi-disciplina ilimitado",
    price_elite_cta: "Contactar a David",

    price_lab_name: "Lactate Lab",
    price_lab_amount: "7,99\u20AC",
    price_lab_desc: "Solo an\u00E1lisis, sin plan de entrenamiento",
    price_lab_f1: "Tests ilimitados",
    price_lab_f2: "7 zonas desde datos reales",
    price_lab_f3: "Umbrales din\u00E1micos",
    price_lab_f4: "Evoluci\u00F3n test a test",
    price_lab_f5: "Predicciones todas las distancias",
    price_lab_f6: "VLamax num\u00E9rico + brecha de capacidad",
    price_lab_cta: "Empieza a analizar",

    price_pro_name: "PRO+",
    price_pro_amount: "34,99\u20AC",
    price_pro_desc: "Multi-deporte + anal\u00EDtica avanzada",
    price_pro_f1: "Todo lo de Plan IA +",
    price_pro_f2: "Plan IA multi-disciplina",
    price_pro_f3: "Detecci\u00F3n de estancamiento",
    price_pro_f4: "VO2max + VLamax longitudinal",
    price_pro_f5: "IA Q&A + PubMed + tus datos",
    price_pro_f6: "HRV/sue\u00F1o 30 d\u00EDas + correlaciones",
    price_pro_f7: "Objetivos ilimitados",
    price_pro_cta: "Solicitar acceso",

    faq_ey: "Preguntas frecuentes",
    faq_h2: "FAQ",
    faq_q1: "\u00BFNecesito un test de lactato?",
    faq_a1: "No. Empieza gratis con FC. Pero si tienes datos, el an\u00E1lisis es mucho m\u00E1s preciso.",
    faq_q2: "No hago tests de lactato. \u00BFPeakAerobic es para m\u00ED?",
    faq_a2: "S\u00ED. Empieza con tus datos de FC \u2014 recibir\u00E1s zonas estimadas, sugerencias de entrenamiento y predicciones. Cuando hagas tu primer test, PeakAerobic recalcular\u00E1 todo con datos reales.",
    faq_q3: "\u00BFC\u00F3mo se diferencia de INSCYD?",
    faq_a3: "INSCYD es una herramienta profesional para coaches ($200-450/test). PeakAerobic est\u00E1 hecho para atletas, desde 7,99\u20AC/mes, con planes de entrenamiento incluidos.",
    faq_q4: "\u00BFC\u00F3mo se diferencia de Garmin Coach o TrainerRoad?",
    faq_a4: "Esos trabajan desde estimaciones de FC o potencia. PeakAerobic trabaja desde datos reales de lactato (o FC si empiezas). Nuestras zonas son fisiol\u00F3gicas, no estad\u00EDsticas.",
    faq_q5: "\u00BFNecesito un medidor de lactato caro?",
    faq_a5: "Los medidores port\u00E1tiles cuestan 150-300\u20AC (Lactate Plus, Lactate Pro 2). Es la misma inversi\u00F3n que 1-2 tests de laboratorio, pero puedes testar ilimitado.",
    faq_q6: "\u00BFQu\u00E9 es la beta privada?",
    faq_a6: "Acceso anticipado limitado. Revisamos cada solicitud personalmente. Bloqueas tu precio para siempre.",
    faq_q7: "\u00BFQu\u00E9 deporte cubre?",
    faq_a7: "Running, ciclismo, nataci\u00F3n y triatl\u00F3n. Con zonas espec\u00EDficas por deporte.",
    faq_q8: "\u00BFQu\u00E9 incluye la revisi\u00F3n semanal?",
    faq_a8: "David revisa tu plan, tus datos y te env\u00EDa un an\u00E1lisis personalizado por email cada semana.",
    faq_q9: "\u00BFMis datos est\u00E1n seguros?",
    faq_a9: "Tus datos son tuyos. No compartimos nada con terceros.",

    cta_h2: "\u00DAnete a la beta privada",
    cta_sub: "Plazas limitadas. Solo aceptamos atletas comprometidos.",
    cta_placeholder: "tu@email.com",
    cta_btn: "Solicitar acceso",
    cta_done: "Solicitud recibida. Te contactaremos pronto.",

    foot_tagline: "Entrenamiento basado en tu fisiolog\u00EDa",
    foot_privacy: "Privacidad",
  },
  en: {
    nav_home: "Home",
    nav_demo: "Demo",
    nav_pricing: "Plans",
    nav_faq: "FAQ",
    nav_enter: "Log in",

    hero_h1: "Your zones are wrong. We fix them.",
    hero_sub: "The only system that turns your lactate data into real zones, physiological analysis and personalized training plans.",
    hero_cta: "Try free",
    hero_note: "Private beta \u00B7 Limited spots \u00B7 Also works with heart rate only",

    problem_ey: "The problem",
    problem_h2: "70% train with wrong zones",
    problem_1: "220\u2212age has \u00B110-20 bpm error. Your Garmin uses this formula.",
    problem_2: "Running zones \u2260 cycling zones. If you use the same, one is wrong.",
    problem_3: "A test without analysis is a number in a notebook.",
    problem_4: "VLamax, capacity gaps and predictions need more than a spreadsheet.",

    how_ey: "How it works",
    how_h2: "Three steps to real zones",
    how_1_title: "Upload your test",
    how_1_text: "Any protocol, any format. No tests yet? Start with HR only.",
    how_2_title: "We analyze your data",
    how_2_text: "7+ scientific methods detect your real thresholds and physiological weaknesses.",
    how_3_title: "We prescribe your training",
    how_3_text: "Objective-based plans that target your weak points. Adapt week by week.",

    demo_ey: "Try it",
    demo_h2: "Try it now \u2014 no signup needed",
    demo_sub: "Enter sample data and see the multi-method analysis live.",

    ap_ey: "Your athlete portal",
    ap_h2: "Everything a serious athlete needs",
    ap_1_title: "Real zones, not formulas",
    ap_1_desc: "7 zones from real lactate. HR, pace and power.",
    ap_2_title: "Threshold evolution",
    ap_2_desc: "Your LT1/LT2 evolves test by test. Visual trend.",
    ap_3_title: "Race predictions",
    ap_3_desc: "5K to marathon with confidence bands.",
    ap_4_title: "Your day, at a glance",
    ap_4_desc: "Readiness, detailed session and wellness metrics.",
    ap_5_title: "Week and calendar",
    ap_5_desc: "Weekly view with zone distribution and volume.",
    ap_6_title: "Race objectives",
    ap_6_desc: "Define races with date and goal. The plan adapts.",

    sci_ey: "The science behind",
    sci_h2: "Built on peer-reviewed physiology",
    sci_1_title: "7+ detection methods",
    sci_1_text: "We don't use one formula. We run Baseline Rise, ModDmax, Sustained Increase and more. We show where they agree.",
    sci_2_title: "Confidence scoring",
    sci_2_text: "Every threshold comes with its agreement score between methods. You know exactly how much to trust it.",
    sci_3_title: "Not a black box",
    sci_3_text: "You see every method, every point, every decision. Calibrated with Faude 2009, Bishop 1998, Billat 2003.",
    sci_author: "Developed by David Sabat, sport physiologist",

    price_ey: "Plans",
    price_h2: "Choose your plan",
    price_sub: "Beta pricing \u2014 lock your price forever.",
    price_period: "mo",
    price_bottom: "All plans include multi-method LT1/LT2 detection with confidence scoring.",
    price_secondary_label: "Looking for something more specific?",

    price_free_name: "Free",
    price_free_amount: "\u20AC0",
    price_free_desc: "To get started",
    price_free_f1: "5 estimated zones from HR",
    price_free_f2: "2 lactate tests (demo)",
    price_free_f3: "Daily training suggestion",
    price_free_f4: "1 race prediction",
    price_free_f5: "Garmin/Strava sync",
    price_free_cta: "Start free",

    price_ai_name: "AI Plan",
    price_ai_badge: "Popular",
    price_ai_amount: "\u20AC19.99",
    price_ai_desc: "Full analysis + training plan",
    price_ai_f1: "Unlimited lactate tests",
    price_ai_f2: "7 zones from real data",
    price_ai_f3: "Dynamic thresholds + evolution",
    price_ai_f4: "Full AI plan by objectives",
    price_ai_f5: "Smart block periodization",
    price_ai_f6: "Auto-push to Garmin",
    price_ai_f7: "Weekly review by David (email)",
    price_ai_cta: "Request access",

    price_elite_name: "Elite",
    price_elite_badge: "1:1 Coaching",
    price_elite_amount: "\u20AC199",
    price_elite_desc: "Full coaching with physiologist",
    price_elite_f1: "Everything in AI Plan +",
    price_elite_f2: "Weekly 30-min call",
    price_elite_f3: "WhatsApp/Telegram 24h",
    price_elite_f4: "Coach adjusts and re-plans",
    price_elite_f5: "Per-session feedback",
    price_elite_f6: "Unlimited multi-discipline",
    price_elite_cta: "Contact David",

    price_lab_name: "Lactate Lab",
    price_lab_amount: "\u20AC7.99",
    price_lab_desc: "Analysis only, no training plan",
    price_lab_f1: "Unlimited tests",
    price_lab_f2: "7 zones from real data",
    price_lab_f3: "Dynamic thresholds",
    price_lab_f4: "Evolution test by test",
    price_lab_f5: "All-distance predictions",
    price_lab_f6: "VLamax numeric + capacity gap",
    price_lab_cta: "Start analyzing",

    price_pro_name: "PRO+",
    price_pro_amount: "\u20AC34.99",
    price_pro_desc: "Multi-sport + advanced analytics",
    price_pro_f1: "Everything in AI Plan +",
    price_pro_f2: "Multi-discipline AI plan",
    price_pro_f3: "Stagnation detection",
    price_pro_f4: "VO2max + VLamax longitudinal",
    price_pro_f5: "AI Q&A + PubMed + your data",
    price_pro_f6: "HRV/sleep 30 days + correlations",
    price_pro_f7: "Unlimited objectives",
    price_pro_cta: "Request access",

    faq_ey: "Frequently asked questions",
    faq_h2: "FAQ",
    faq_q1: "Do I need a lactate test?",
    faq_a1: "No. Start free with HR. But if you have data, the analysis is much more precise.",
    faq_q2: "I don't do lactate tests. Is PeakAerobic for me?",
    faq_a2: "Yes. Start with your HR data \u2014 you'll get estimated zones, training suggestions and predictions. When you do your first test, PeakAerobic will recalculate everything with real data.",
    faq_q3: "How is it different from INSCYD?",
    faq_a3: "INSCYD is a professional tool for coaches ($200-450/test). PeakAerobic is built for athletes, from \u20AC7.99/mo, with training plans included.",
    faq_q4: "How is it different from Garmin Coach or TrainerRoad?",
    faq_a4: "Those work from HR or power estimates. PeakAerobic works from real lactate data (or HR if you're starting). Our zones are physiological, not statistical.",
    faq_q5: "Do I need an expensive lactate meter?",
    faq_a5: "Portable meters cost \u20AC150-300 (Lactate Plus, Lactate Pro 2). Same investment as 1-2 lab tests, but you can test unlimited.",
    faq_q6: "What is the private beta?",
    faq_a6: "Limited early access. We review each application personally. Lock your price forever.",
    faq_q7: "What sports does it cover?",
    faq_a7: "Running, cycling, swimming and triathlon. With sport-specific zones.",
    faq_q8: "What does the weekly review include?",
    faq_a8: "David reviews your plan, your data, and sends you a personalized analysis via email every week.",
    faq_q9: "Is my data secure?",
    faq_a9: "Your data is yours. We don't share anything with third parties.",

    cta_h2: "Join the private beta",
    cta_sub: "Limited spots. We only accept committed athletes.",
    cta_placeholder: "you@email.com",
    cta_btn: "Request access",
    cta_done: "Request received. We'll be in touch soon.",

    foot_tagline: "Training based on your physiology",
    foot_privacy: "Privacy",
  },
};

/* Helper: get translated string, fallback to es */
function useBetaT() {
  const { lang } = useLang();
  return (key: string): string => {
    const l = (lang === "es" ? "es" : "en") as string;
    return BETA_T[l]?.[key] ?? BETA_T["es"]?.[key] ?? key;
  };
}

/* ══════════════════════════════════════════
   Inner landing (has access to useLang)
   ══════════════════════════════════════════ */
function LandingInner() {
  const t = useBetaT();
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

  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand">PeakAerobic</span>
          <div className="lp-nav__right">
            <a href="#demo" className="lp-nav__link lp-nav__link--hide-mobile">{t("nav_demo")}</a>
            <a href="#pricing" className="lp-nav__link lp-nav__link--hide-mobile">{t("nav_pricing")}</a>
            <a href="#faq" className="lp-nav__link lp-nav__link--hide-mobile">{t("nav_faq")}</a>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══ 1. HERO ══ */}
      <section className="lp-hero">
        <div className="lp-hero__inner">
          <div className="lp-hero__content">
            <h1 className="lp-hero__h1">{t("hero_h1")}</h1>
            <p className="lp-hero__sub">{t("hero_sub")}</p>
            <button className="lp-btn-solid lp-btn--hero" onClick={() => navigate("/login")} type="button">
              {t("hero_cta")}
            </button>
            <p className="lp-hero__note">{t("hero_note")}</p>
          </div>
          <div className="lp-hero__curve-wrap">
            <HeroCurve />
          </div>
        </div>
      </section>

      {/* ══ 2. THE PROBLEM — warm bg, 2x2 grid ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="problem">
          <div className="lp-w">
            <p className="lp-ey">{t("problem_ey")}</p>
            <h2 className="lp-h2">{t("problem_h2")}</h2>
            <div className="lp-problem__grid">
              {(["1","2","3","4"] as const).map(n => (
                <div key={n} className="lp-problem__card">
                  <div className="lp-problem__icon">
                    {n === "1" && (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    )}
                    {n === "2" && (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round"><path d="M4 20 L8 16 L12 18 L16 12 L20 8" /><circle cx="8" cy="16" r="1.5" fill="#f97316" /><circle cx="16" cy="12" r="1.5" fill="#f97316" /></svg>
                    )}
                    {n === "3" && (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round"><path d="M4 20 C8 19 12 16 16 10 C18 6 20 4 22 3" /><circle cx="10" cy="16" r="1.5" fill="#22c55e" stroke="#22c55e" strokeWidth="1" /><circle cx="18" cy="6" r="1.5" fill="#f97316" stroke="#f97316" strokeWidth="1" /></svg>
                    )}
                    {n === "4" && (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9 L21 9" opacity=".3" /><path d="M8 14 L11 17 L16 11" strokeWidth="2.5" /></svg>
                    )}
                  </div>
                  <p className="lp-problem__text">{t(`problem_${n}`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 3. HOW IT WORKS — dark bg, 3 steps ══ */}
      <AnimSection>
        <section className="lp-section lp-section--dark" id="how">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{t("how_ey")}</p>
            <h2 className="lp-how__h2">{t("how_h2")}</h2>
            <div className="lp-how__steps">
              {(["1","2","3"] as const).map((n, i) => (
                <div key={n} className="lp-how__step">
                  {i > 0 && <div className="lp-how__connector" />}
                  <div className="lp-how__icon">
                    {n === "1" && (
                      <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
                        <rect x="6" y="4" width="20" height="24" rx="3" />
                        <path d="M10 12 L22 12" opacity=".3" />
                        <path d="M12 18 L20 18" opacity=".2" />
                        <path d="M16 2 L16 6" />
                      </svg>
                    )}
                    {n === "2" && (
                      <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 26 C10 25, 14 22, 18 16 C22 10, 26 5, 28 4" />
                        <circle cx="11" cy="23" r="2" fill="#22c55e" stroke="#22c55e" strokeWidth="1" />
                        <circle cx="22" cy="10" r="2" fill="#f97316" stroke="#f97316" strokeWidth="1" />
                      </svg>
                    )}
                    {n === "3" && (
                      <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
                        <rect x="4" y="4" width="24" height="24" rx="3" />
                        <path d="M4 12 L28 12" opacity=".3" />
                        <rect x="8" y="16" width="5" height="4" rx="1" fill="#d26a36" opacity=".2" stroke="none" />
                        <rect x="15" y="16" width="5" height="4" rx="1" fill="#d26a36" opacity=".4" stroke="none" />
                        <rect x="22" y="16" width="5" height="4" rx="1" fill="#d26a36" opacity=".6" stroke="none" />
                        <rect x="8" y="22" width="5" height="4" rx="1" fill="#22c55e" opacity=".3" stroke="none" />
                      </svg>
                    )}
                  </div>
                  <div className="lp-how__num">{n}</div>
                  <h4 className="lp-how__step-title">{t(`how_${n}_title`)}</h4>
                  <p className="lp-how__step-desc">{t(`how_${n}_text`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 4. INTERACTIVE DEMO — light bg ══ */}
      <AnimSection>
        <section className="lp-section lp-section--light" id="demo">
          <div className="lp-w">
            <p className="lp-ey">{t("demo_ey")}</p>
            <h2 className="lp-h2">{t("demo_h2")}</h2>
            <p className="lp-sub">{t("demo_sub")}</p>
          </div>
        </section>
      </AnimSection>
      <LactateDemo />

      {/* ══ 5. THE APP — warm bg, 6 feature cards (3x2) ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="athlete-portal">
          <div className="lp-w">
            <p className="lp-ey">{t("ap_ey")}</p>
            <h2 className="lp-h2">{t("ap_h2")}</h2>

            <div className="lp-showcase__grid">
              {/* Card 1: Zones — Row 1 Analysis */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    {[
                      { y: 14, w: 45, color: "#86efac", label: "Recuperaci\u00F3n" },
                      { y: 28, w: 70, color: "#22c55e", label: "Base" },
                      { y: 42, w: 95, color: "#3b82f6", label: "Aer\u00F3bico" },
                      { y: 56, w: 120, color: "#8b5cf6", label: "Moderado" },
                      { y: 70, w: 145, color: "#f59e0b", label: "Umbral" },
                      { y: 84, w: 170, color: "#ef4444", label: "Intenso" },
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

              {/* Card 2: Evolution — Row 1 Analysis */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    <polyline points="20,75 50,68 80,58 110,48 140,38 170,30" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="20,65 50,60 80,52 110,44 140,36 170,28" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
                    {[[20,75],[50,68],[80,58],[110,48],[140,38],[170,30]].map(([cx,cy],i) => (
                      <circle key={i} cx={cx} cy={cy} r="3" fill="#fff" stroke="#f97316" strokeWidth="1.5" />
                    ))}
                    <circle cx="155" cy="15" r="3" fill="#f97316" /><text x="163" y="18" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">LT2</text>
                    <circle cx="178" cy="15" r="3" fill="#22c55e" /><text x="186" y="18" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">LT1</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_2_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_2_desc")}</p>
              </div>

              {/* Card 3: Predictions — Row 1 Analysis */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    {[
                      { x: 14, dist: "5K", time: "19:42", pace: "3:56" },
                      { x: 60, dist: "10K", time: "41:08", pace: "4:07" },
                      { x: 106, dist: "Media", time: "1:31", pace: "4:20" },
                      { x: 152, dist: "Marat\u00F3n", time: "3:12", pace: "4:34" },
                    ].map((p, i) => (
                      <g key={i}>
                        <rect x={p.x} y="12" width="40" height="76" rx="8" fill="rgba(210,106,54,0.04)" stroke="rgba(210,106,54,0.1)" strokeWidth="1" />
                        <text x={p.x + 20} y="28" textAnchor="middle" fill="#9ca3af" fontSize="7" fontWeight="600" fontFamily="Space Grotesk">{p.dist}</text>
                        <text x={p.x + 20} y="48" textAnchor="middle" fill="#1a2f38" fontSize="11" fontWeight="800" fontFamily="Space Grotesk">{p.time}</text>
                        <text x={p.x + 20} y="62" textAnchor="middle" fill="#d26a36" fontSize="7" fontFamily="Space Grotesk">{p.pace}</text>
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

              {/* Card 4: Today — Row 2 Training */}
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

              {/* Card 5: Week — Row 2 Training */}
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
                          <rect x={x} y={88 - heights[i]} width="20" height={heights[i]} rx="4" fill={colors[i] || "transparent"} opacity="0.2" />
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

              {/* Card 6: Objectives — Row 2 Training */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    <rect x="12" y="12" width="176" height="34" rx="8" fill="rgba(239,68,68,0.06)" stroke="rgba(239,68,68,0.15)" strokeWidth="1" />
                    <rect x="12" y="12" width="3" height="34" rx="1.5" fill="#ef4444" />
                    <text x="24" y="28" fill="#1a2f38" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">{"Marat\u00F3n Valencia"}</text>
                    <text x="24" y="40" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">{"sub 3:15 \u00B7 254 d\u00EDas"}</text>
                    <text x="170" y="32" textAnchor="end" fill="#ef4444" fontSize="7" fontWeight="700" fontFamily="Space Grotesk">ALTA</text>
                    <rect x="12" y="52" width="176" height="34" rx="8" fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.15)" strokeWidth="1" />
                    <rect x="12" y="52" width="3" height="34" rx="1.5" fill="#f59e0b" />
                    <text x="24" y="68" fill="#1a2f38" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">10K San Silvestre</text>
                    <text x="24" y="80" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">{"sub 40:00 \u00B7 284 d\u00EDas"}</text>
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

      {/* ══ 6. SCIENCE CREDIBILITY — dark bg ══ */}
      <AnimSection>
        <section className="lp-section lp-section--dark" id="science">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{t("sci_ey")}</p>
            <h2 className="lp-h2 lp-h2--light">{t("sci_h2")}</h2>
            <div className="lp-science__grid">
              <div className="lp-science__item">
                <h3 className="lp-science__item-title">{t("sci_1_title")}</h3>
                <p className="lp-science__item-text">{t("sci_1_text")}</p>
              </div>
              <div className="lp-science__item">
                <h3 className="lp-science__item-title">{t("sci_2_title")}</h3>
                <p className="lp-science__item-text">{t("sci_2_text")}</p>
              </div>
              <div className="lp-science__item">
                <h3 className="lp-science__item-title">{t("sci_3_title")}</h3>
                <p className="lp-science__item-text">{t("sci_3_text")}</p>
              </div>
            </div>
            <p className="lp-science__author">{t("sci_author")}</p>
          </div>
        </section>
      </AnimSection>

      {/* ══ 7. PRICING — warm bg, 5 tiers ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="pricing">
          <div className="lp-w">
            <p className="lp-ey">{t("price_ey")}</p>
            <h2 className="lp-h2">{t("price_h2")}</h2>
            <p className="lp-sub">{t("price_sub")}</p>

            {/* Main 3 tiers */}
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
                <button className="lp-btn-solid lp-btn--accent lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_ai_cta")}</button>
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
                <button className="lp-btn-solid lp-btn--elite lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_elite_cta")}</button>
              </div>
            </div>

            {/* Secondary 2 tiers */}
            <p className="lp-pricing__secondary-label">{t("price_secondary_label")}</p>
            <div className="lp-pricing__secondary-grid">
              {/* Lactate Lab */}
              <div className="lp-pricing__card">
                <span className="lp-pricing__plan-name">{t("price_lab_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_lab_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_lab_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_lab_f1","price_lab_f2","price_lab_f3","price_lab_f4","price_lab_f5","price_lab_f6"] as const).map(k => (
                    <li key={k}>{check("#3b82f6")}{t(k)}</li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--blue lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_lab_cta")}</button>
              </div>

              {/* PRO+ */}
              <div className="lp-pricing__card">
                <span className="lp-pricing__plan-name">{t("price_pro_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_pro_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_pro_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_pro_f1","price_pro_f2","price_pro_f3","price_pro_f4","price_pro_f5","price_pro_f6","price_pro_f7"] as const).map(k => (
                    <li key={k}>{check("#8b5cf6")}{t(k)}</li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--purple lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_pro_cta")}</button>
              </div>
            </div>

            <p className="lp-pricing__bottom-note">{t("price_bottom")}</p>
          </div>
        </section>
      </AnimSection>

      {/* ══ 8. FAQ — warm bg ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="faq">
          <div className="lp-w">
            <div className="lp-faq__wrap">
              <p className="lp-ey">{t("faq_ey")}</p>
              <h2 className="lp-h2">{t("faq_h2")}</h2>
              <div className="lp-faq__list">
                {(["1","2","3","4","5","6","7","8","9"] as const).map(n => (
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

      {/* ══ 9. FINAL CTA — dark bg ══ */}
      <section className="lp-section lp-section--dark" id="cta">
        <div className="lp-w">
          <div className="lp-cta-section__inner">
            <h2 className="lp-h2 lp-h2--light">{t("cta_h2")}</h2>
            <p className="lp-sub lp-sub--light">{t("cta_sub")}</p>
            {submittedBottom ? (
              <div className="lp-done">{t("cta_done")}</div>
            ) : (
              <form className="lp-form" onSubmit={(e) => handleBeta(e, emailBottom, () => setSubmittedBottom(true))}>
                <input type="email" className="lp-form__input lp-form__input--dark" placeholder={t("cta_placeholder")} value={emailBottom} onChange={(e) => setEmailBottom(e.target.value)} required />
                <button type="submit" className="lp-btn-solid lp-btn--accent">{t("cta_btn")}</button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-foot">
        <div className="lp-w lp-foot__inner">
          <span className="lp-foot__brand">PeakAerobic</span>
          <span className="lp-foot__line">{t("foot_tagline")}</span>
          <a href="/privacy" className="lp-foot__link">{t("foot_privacy")}</a>
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

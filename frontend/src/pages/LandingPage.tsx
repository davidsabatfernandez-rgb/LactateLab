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

/* ── Mini SVG icons for feature cards ── */
function IconCurve() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <path d="M4 26 C10 25, 14 22, 18 16 C22 10, 26 5, 28 4" />
      <circle cx="11" cy="23" r="2" fill="#22c55e" stroke="#22c55e" strokeWidth="1" />
      <circle cx="22" cy="10" r="2" fill="#f97316" stroke="#f97316" strokeWidth="1" />
    </svg>
  );
}

function IconDynamic() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <path d="M4 24 L10 20 L16 22 L22 14 L28 8" />
      <circle cx="10" cy="20" r="2" fill="#d26a36" opacity=".3" />
      <circle cx="22" cy="14" r="2" fill="#d26a36" opacity=".6" />
      <circle cx="28" cy="8" r="2" fill="#d26a36" />
    </svg>
  );
}

function IconPredict() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="6" width="24" height="20" rx="3" />
      <path d="M4 13 L28 13" opacity=".3" />
      <path d="M10 18 L14 22 L22 12" strokeWidth="2.5" />
    </svg>
  );
}

function IconPlan() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="4" width="24" height="24" rx="3" />
      <path d="M4 12 L28 12" opacity=".3" />
      <rect x="8" y="16" width="5" height="4" rx="1" fill="#d26a36" opacity=".2" stroke="none" />
      <rect x="15" y="16" width="5" height="4" rx="1" fill="#d26a36" opacity=".4" stroke="none" />
      <rect x="22" y="16" width="5" height="4" rx="1" fill="#d26a36" opacity=".6" stroke="none" />
      <rect x="8" y="22" width="5" height="4" rx="1" fill="#22c55e" opacity=".3" stroke="none" />
    </svg>
  );
}

function IconRecovery() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <path d="M4 20 Q8 12, 12 18 Q16 24, 20 14 Q24 4, 28 16" />
    </svg>
  );
}

function IconGarmin() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <circle cx="16" cy="16" r="11" />
      <path d="M16 8 L16 16 L22 16" />
      <path d="M10 27 L10 30" opacity=".4" />
      <path d="M22 27 L22 30" opacity=".4" />
    </svg>
  );
}

function IconThreshold() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" strokeLinecap="round">
      <path d="M6 38 C14 36, 20 32, 26 22 C30 14, 34 8, 42 6" stroke="#d26a36" strokeWidth="2.5" />
      <line x1="18" y1="6" x2="18" y2="42" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3" opacity=".6" />
      <line x1="32" y1="6" x2="32" y2="42" stroke="#f97316" strokeWidth="1.5" strokeDasharray="4 3" opacity=".6" />
      <text x="18" y="46" textAnchor="middle" fill="#22c55e" fontSize="7" fontWeight="700" fontFamily="Space Grotesk">LT1</text>
      <text x="32" y="46" textAnchor="middle" fill="#f97316" fontSize="7" fontWeight="700" fontFamily="Space Grotesk">LT2</text>
    </svg>
  );
}

function IconTracking() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" strokeLinecap="round">
      <path d="M6 36 L14 30 L22 28 L30 22 L38 16 L44 12" stroke="#d26a36" strokeWidth="2.5" />
      {[6,14,22,30,38,44].map((x,i) => <circle key={i} cx={x} cy={36-i*4.8} r="3" fill="#fff" stroke="#d26a36" strokeWidth="2" />)}
      <path d="M30 22 L38 16 L44 12" stroke="#d26a36" strokeWidth="2.5" strokeDasharray="4 3" opacity=".5" />
    </svg>
  );
}

function IconEngine() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" strokeLinecap="round">
      <rect x="4" y="8" width="40" height="32" rx="4" stroke="#d26a36" strokeWidth="2" />
      <path d="M4 18 L44 18" stroke="#d26a36" strokeWidth="1" opacity=".3" />
      <rect x="10" y="23" width="8" height="6" rx="2" fill="#d26a36" opacity=".15" />
      <rect x="20" y="23" width="8" height="6" rx="2" fill="#d26a36" opacity=".3" />
      <rect x="30" y="23" width="8" height="6" rx="2" fill="#d26a36" opacity=".5" />
      <rect x="10" y="31" width="8" height="5" rx="2" fill="#22c55e" opacity=".2" />
      <rect x="20" y="31" width="8" height="5" rx="2" fill="#22c55e" opacity=".35" />
      <path d="M12 12 L18 12" stroke="#d26a36" strokeWidth="2" opacity=".5" />
    </svg>
  );
}

function IconRace() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" strokeLinecap="round">
      <circle cx="24" cy="24" r="18" stroke="#d26a36" strokeWidth="2" />
      <path d="M24 10 L24 24 L34 28" stroke="#d26a36" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="2.5" fill="#d26a36" />
      <path d="M14 40 L14 44" stroke="#d26a36" strokeWidth="1.5" opacity=".3" />
      <path d="M34 40 L34 44" stroke="#d26a36" strokeWidth="1.5" opacity=".3" />
    </svg>
  );
}

function IconRun() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <circle cx="28" cy="8" r="4" />
      <path d="M18 44 L22 30 L28 24 L34 28 L38 20" />
      <path d="M14 36 L22 30" />
      <path d="M28 24 L24 16" />
    </svg>
  );
}

function IconBike() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <circle cx="14" cy="32" r="8" />
      <circle cx="36" cy="32" r="8" />
      <path d="M14 32 L22 16 L30 32" />
      <path d="M30 32 L36 32" />
      <path d="M22 16 L32 16" />
    </svg>
  );
}

function IconSwim() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <circle cx="34" cy="14" r="4" />
      <path d="M30 20 L24 28 L18 24" />
      <path d="M24 28 L28 36" />
      <path d="M6 34 Q12 28 18 34 Q24 40 30 34 Q36 28 42 34" strokeWidth="2.2" />
    </svg>
  );
}

function IconTri() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <path d="M8 38 L24 10 L40 38 Z" />
      <circle cx="24" cy="22" r="4" fill="rgba(210,106,54,0.15)" />
      <path d="M16 32 L32 32" strokeWidth="1.5" opacity=".4" />
    </svg>
  );
}

function IconCoachDash() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="4" width="24" height="20" rx="3" />
      <circle cx="12" cy="14" r="3" opacity=".4" />
      <circle cx="22" cy="11" r="2" opacity=".3" />
      <path d="M4 28 L28 28" strokeWidth="1.5" opacity=".2" />
    </svg>
  );
}

function IconScience() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <path d="M12 4 L12 14 L5 26 Q4 28, 6 28 L26 28 Q28 28, 27 26 L20 14 L20 4" />
      <path d="M10 4 L22 4" />
      <circle cx="14" cy="22" r="1.5" fill="#d26a36" opacity=".4" stroke="none" />
      <circle cx="19" cy="24" r="1" fill="#22c55e" opacity=".5" stroke="none" />
    </svg>
  );
}

function IconWorkout() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
      <rect x="6" y="8" width="4" height="16" rx="1" opacity=".3" />
      <rect x="14" y="4" width="4" height="24" rx="1" opacity=".5" />
      <rect x="22" y="12" width="4" height="12" rx="1" opacity=".7" />
    </svg>
  );
}

/* ── Inline translations for the beta landing ── */
const BETA_T: Record<string, Record<string, string>> = {
  es: {
    nav_home: "Inicio",
    nav_demo: "Demo",
    nav_pricing: "Planes",
    nav_faq: "FAQ",
    nav_enter: "Entrar",

    hero_h1: "Entrena seg\u00FAn tu cuerpo, no seg\u00FAn una f\u00F3rmula",
    hero_sub: "An\u00E1lisis de lactato multi-m\u00E9todo, zonas reales, planes de entrenamiento por objetivos y seguimiento de tu evoluci\u00F3n fisiol\u00F3gica \u2014 todo en una app.",
    hero_cta_primary: "Analiza tu test de lactato",
    hero_cta_secondary: "\u00BFA\u00FAn no testas? Empieza con tu FC",
    hero_note: "Beta privada \u00B7 Plazas limitadas \u00B7 Revisi\u00F3n semanal con fisi\u00F3logo",

    pain_hr_title: "El 70% de los atletas entrena con zonas equivocadas",
    pain_hr_1: "220\u2212edad tiene un error de \u00B110-20 ppm. Tu Garmin usa esta f\u00F3rmula por defecto.",
    pain_hr_2: "Si Zona 2 te parece imposiblemente lenta, el problema no es tu forma f\u00EDsica \u2014 son tus zonas. La mayor\u00EDa est\u00E1n calculadas con una f\u00F3rmula que no te representa.",
    pain_hr_3: "La deriva card\u00EDaca sube tu FC 10-20 ppm en ejercicio estable. Sin umbrales de lactato como ancla, persigues un objetivo que se mueve.",
    pain_hr_4: "Zonas de running \u2260 zonas de ciclismo. Si usas las mismas para ambos, una est\u00E1 mal.",
    pain_lac_title: "Un test sin an\u00E1lisis es un n\u00FAmero en una libreta",
    pain_lac_1: "Mirar la curva a ojo detecta 1 punto de inflexi\u00F3n. PeakAerobic ejecuta 7+ algoritmos validados y muestra d\u00F3nde coinciden.",
    pain_lac_2: "Un test te dice d\u00F3nde est\u00E1s hoy. El seguimiento longitudinal muestra si tu entrenamiento funciona.",
    pain_lac_3: "INSCYD cobra 150-350\u20AC por an\u00E1lisis. T\u00FA mereces an\u00E1lisis ilimitado por una fracci\u00F3n del coste.",
    pain_lac_4: "VLamax, brechas de capacidad y predicciones de carrera necesitan m\u00E1s que un Excel.",

    how_ey: "C\u00F3mo funciona",
    how_h2: "Dos caminos, un destino: entrenar mejor",
    how_path_hr: "Entreno con frecuencia card\u00EDaca",
    how_hr_1_title: "Crea tu perfil",
    how_hr_1_text: "Introduce FC m\u00E1xima, FC reposo, deporte y nivel",
    how_hr_2_title: "Detectamos tus debilidades",
    how_hr_2_text: "El sistema analiza tus datos y encuentra d\u00F3nde necesitas mejorar",
    how_hr_3_title: "Recibe entrenamientos espec\u00EDficos",
    how_hr_3_text: "Prescribimos sesiones dise\u00F1adas para atacar tus puntos d\u00E9biles y mejorar tu rendimiento",
    how_path_lac: "Ya hago tests de lactato",
    how_lac_1_title: "Sube tu test",
    how_lac_1_text: "Cualquier protocolo, cualquier formato",
    how_lac_2_title: "An\u00E1lisis multi-m\u00E9todo",
    how_lac_2_text: "7+ algoritmos con scoring de confianza",
    how_lac_3_title: "Plan basado en tus brechas",
    how_lac_3_text: "Detectamos tus debilidades fisiol\u00F3gicas y prescribimos entrenamientos espec\u00EDficos para cerrarlas",
    how_converge: "Empieces por donde empieces, PeakAerobic detecta tus debilidades reales y prescribe entrenamientos espec\u00EDficos para mejorarlas.",

    demo_ey: "Pru\u00E9balo t\u00FA mismo",
    demo_h2: "Demo interactiva",

    ap_ey: "Tu portal de atleta",
    ap_h2: "Todo lo que necesitas. En una sola app.",
    ap_sub: "Entreno del dia, semana, progreso, zonas, objetivos — todo conectado a tu fisiologia real.",
    ap_1_title: "Tu dia, de un vistazo",
    ap_1_desc: "Readiness score, sesion del dia con cada paso detallado, y metricas de bienestar. Sabes exactamente que hacer y como te encuentras.",
    ap_2_title: "Semana y calendario",
    ap_2_desc: "Vista semanal con sesiones por disciplina, distribucion de zonas y volumen. Arrastra para reorganizar. Sincroniza con Google Calendar.",
    ap_3_title: "Evolucion de umbrales y predicciones",
    ap_3_desc: "Ve como evolucionan tu LT1 y LT2 test a test. Predicciones de carrera actualizadas con bandas de confianza para 5K, 10K, media y maraton.",
    ap_4_title: "Zonas reales, no formulas",
    ap_4_desc: "7 zonas calculadas desde tu lactato real. FC, ritmo y potencia para cada zona. Actualizadas cada vez que subes un test.",
    ap_5_title: "Objetivos que dirigen tu plan",
    ap_5_desc: "Define tus carreras con fecha, disciplina y marca objetivo. El sistema analiza tus brechas, selecciona el bloque de periodizacion optimo y construye tu plan semanal alrededor de tus objetivos.",
    ap_6_title: "Predicciones de carrera",
    ap_6_desc: "Predicciones actualizadas para todas las distancias con bandas de confianza. 5K, 10K, media y marat\u00F3n basadas en tu fisiolog\u00EDa real.",

    obj_ey: "Entrena por objetivos",
    obj_h2: "Tu carrera manda. El plan se construye solo.",
    obj_sub: "Define tu objetivo, nosotros analizamos tus brechas fisiol\u00F3gicas, seleccionamos el bloque de periodizaci\u00F3n \u00F3ptimo y prescribimos cada sesi\u00F3n. Semana a semana, el plan se adapta a tu progreso real.",
    obj_step1_title: "Define tu objetivo",
    obj_step1_text: "Marat\u00F3n Valencia sub 3:15, Ironman 70.3, 10K sub 40... con fecha y prioridad.",
    obj_step2_title: "Analizamos tus brechas",
    obj_step2_text: "El motor fisiol\u00F3gico detecta d\u00F3nde necesitas mejorar: LT2, capacidad aer\u00F3bica, VLamax...",
    obj_step3_title: "Bloque de periodizaci\u00F3n \u00F3ptimo",
    obj_step3_text: "IA selecciona el bloque \u00F3ptimo (capacidad aer\u00F3bica, umbral, potencia...) con duraci\u00F3n y dosis espec\u00EDficas.",
    obj_step4_title: "Plan semanal adaptativo",
    obj_step4_text: "Sesiones prescritas con estructura, zonas y envío a Garmin. Se adapta según tu bienestar y resultados.",
    obj_mock_gap: "Brecha detectada",
    obj_mock_gap_detail: "LT2 necesita +16s/km",
    obj_mock_block: "Bloque seleccionado",
    obj_mock_block_detail: "Desarrollo de umbral \u00B7 4 semanas",
    obj_mock_sessions: "Sesiones prescritas",

    price_ey: "Planes",
    price_h2: "Elige tu plan",
    price_sub: "Desde el laboratorio de lactato hasta coaching completo. Precios de beta \u2014 bloquea tu precio para siempre.",
    price_period: "mes",
    price_bottom: "Todos los planes incluyen detecci\u00F3n multi-m\u00E9todo de LT1/LT2 con scoring de confianza.",

    price_free_name: "Gratis",
    price_free_amount: "0\u20AC",
    price_free_desc: "Para empezar con frecuencia card\u00EDaca",
    price_free_f1: "5 zonas estimadas desde FC",
    price_free_f2: "2 tests de lactato (demo)",
    price_free_f3: "Sugerencia diaria (1 sesi\u00F3n)",
    price_free_f4: "1 predicci\u00F3n de carrera b\u00E1sica",
    price_free_f5: "Sincronizaci\u00F3n Garmin/Strava",
    price_free_f6: "1 objetivo de carrera",
    price_free_cta: "Empieza gratis",

    price_lab_name: "Lactate Lab",
    price_lab_amount: "7,99\u20AC",
    price_lab_desc: "Para quien ya testa lactato",
    price_lab_f1: "Tests de lactato ilimitados",
    price_lab_f2: "7 zonas desde datos reales",
    price_lab_f3: "Umbrales din\u00E1micos por sesi\u00F3n",
    price_lab_f4: "Evoluci\u00F3n de umbrales test a test",
    price_lab_f5: "Predicciones todas las distancias",
    price_lab_f6: "Comparaci\u00F3n de sesiones lado a lado",
    price_lab_f7: "VLamax num\u00E9rico + brecha de capacidad",
    price_lab_cta: "Empezar",

    price_ai_name: "Plan IA",
    price_ai_badge: "Popular",
    price_ai_amount: "19,99\u20AC",
    price_ai_desc: "Plan completo con periodizaci\u00F3n inteligente",
    price_ai_f1: "Todo lo de Lactate Lab +",
    price_ai_f2: "Plan IA completo (1 disciplina)",
    price_ai_f3: "Periodizaci\u00F3n inteligente por bloques",
    price_ai_f4: "Calendario: hoy + semana + zonas",
    price_ai_f5: "Env\u00EDo a Garmin autom\u00E1tico",
    price_ai_f6: "David revisa tu plan + datos semanal",
    price_ai_f7: "Test de deriva de FC guiado",
    price_ai_f8: "Hasta 3 objetivos con prioridad",
    price_ai_cta: "Solicitar acceso",

    price_pro_name: "PRO+",
    price_pro_badge: "Multi-disciplina",
    price_pro_amount: "34,99\u20AC",
    price_pro_desc: "Para atletas multi-deporte y obsesionados con los datos",
    price_pro_f1: "Todo lo de Plan IA +",
    price_pro_f2: "Plan IA multi-disciplina",
    price_pro_f3: "Detecci\u00F3n de estancamiento",
    price_pro_f4: "VO2max + VLamax longitudinal",
    price_pro_f5: "IA Q&A + PubMed + tus datos",
    price_pro_f6: "HRV/sue\u00F1o 30 d\u00EDas + correlaciones",
    price_pro_f7: "Predicciones: durabilidad + gluc\u00F3geno + qu\u00E9 pasa si",
    price_pro_f8: "Objetivos ilimitados multi-disciplina",
    price_pro_cta: "Solicitar acceso",

    price_elite_name: "Elite",
    price_elite_badge: "Coaching 1:1",
    price_elite_amount: "199\u20AC",
    price_elite_desc: "Coaching completo con fisi\u00F3logo del deporte",
    price_elite_f1: "Todo lo de PRO+ +",
    price_elite_f2: "Coach valida y ajusta tu plan",
    price_elite_f3: "Llamada semanal 30 min",
    price_elite_f4: "WhatsApp/Telegram 24h",
    price_elite_f5: "Coach re-planifica semanalmente",
    price_elite_f6: "Feedback del coach por sesi\u00F3n",
    price_elite_f7: "Asesor\u00EDa nutricional",
    price_elite_cta: "Contactar",

    proof_ey: "Atletas que ya lo usan",
    proof_h2: "Resultados reales",
    proof_1_text: "Pensaba que mi umbral estaba en 4:30. Estaba en 4:08. Llevaba meses entrenando demasiado suave.",
    proof_1_role: "Runner \u00B7 Media marat\u00F3n",
    proof_2_text: "INSCYD me cobraba 200\u20AC por test. Ahora tengo an\u00E1lisis ilimitado por 8\u20AC/mes y veo c\u00F3mo evolucionan mis umbrales.",
    proof_2_role: "Ciclista \u00B7 Granfondo",
    proof_3_text: "Descubr\u00ED que mis zonas de bici estaban 8 ppm por debajo de las de running. Por eso no mejoraba en bici.",
    proof_3_role: "Triatleta \u00B7 Ironman 70.3",

    faq_ey: "Preguntas frecuentes",
    faq_h2: "FAQ",
    faq_q1: "\u00BFNecesito un test de lactato?",
    faq_a1: "No. Empieza gratis con FC. Pero si tienes datos, el an\u00E1lisis es mucho m\u00E1s preciso.",
    faq_q2: "No hago tests de lactato. \u00BFPeakAerobic es para m\u00ED?",
    faq_a2: "S\u00ED. Empieza gratis con tus datos de frecuencia card\u00EDaca \u2014 recibir\u00E1s zonas estimadas, sugerencias de entrenamiento y predicciones. Cuando hagas tu primer test, PeakAerobic recalcular\u00E1 todo con datos reales.",
    faq_q3: "\u00BFQu\u00E9 tan precisas son las zonas basadas en FC?",
    faq_a3: "Las zonas de FC tienen un margen de \u00B110-20 ppm. PeakAerobic usa las mejores f\u00F3rmulas disponibles, pero somos transparentes: las zonas de HR son estimaciones. Las zonas de lactato son mediciones. Por eso mostramos tu nivel de confianza.",
    faq_q4: "\u00BFNecesito un medidor de lactato caro?",
    faq_a4: "Los medidores port\u00E1tiles cuestan 150-300\u20AC (Lactate Plus, Lactate Pro 2). Es la misma inversi\u00F3n que 1-2 tests de laboratorio, pero puedes hacer tests ilimitados.",
    faq_q5: "\u00BFPuedo usar los datos de mi Garmin/Strava?",
    faq_a5: "Puedes usar tu FC m\u00E1xima y reposo de Garmin/Strava para zonas iniciales. Pero las zonas que te dan est\u00E1n basadas en 220-edad \u2014 una f\u00F3rmula con \u00B110-20 ppm de error.",
    faq_q6: "\u00BFQu\u00E9 es la beta privada?",
    faq_a6: "Acceso anticipado limitado. Revisamos cada solicitud personalmente.",
    faq_q7: "\u00BFQu\u00E9 deporte cubre?",
    faq_a7: "Running, ciclismo, nataci\u00F3n y triatl\u00F3n. Con zonas espec\u00EDficas por deporte.",
    faq_q8: "\u00BFQu\u00E9 incluye la revisi\u00F3n semanal?",
    faq_a8: "David revisa tu plan, tus datos y te env\u00EDa un an\u00E1lisis personalizado por email cada semana.",
    faq_q9: "\u00BFCu\u00E1ndo deber\u00EDa hacer mi primer test de lactato?",
    faq_a9: "Cuando quieras. Empieza con FC, y cuando sientas curiosidad o llegues a una meseta, haz tu primer test. Muchos atletas empiezan gratis y testan despu\u00E9s de 4-8 semanas.",
    faq_q10: "\u00BFMis datos est\u00E1n seguros?",
    faq_a10: "Tus datos son tuyos. No compartimos nada con terceros.",

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

    hero_h1: "Train according to your body, not a formula",
    hero_sub: "Multi-method lactate analysis, real zones, objective-based training plans and physiological evolution tracking \u2014 all in one app.",
    hero_cta_primary: "Analyze your lactate test",
    hero_cta_secondary: "No tests yet? Start with your HR",
    hero_note: "Private beta \u00B7 Limited spots \u00B7 Weekly review with physiologist",

    pain_hr_title: "70% of athletes train with wrong zones",
    pain_hr_1: "220\u2212age has an error of \u00B110-20 bpm. Your Garmin uses this formula by default.",
    pain_hr_2: "If Zone 2 feels impossibly slow, the problem isn't your fitness \u2014 it's your zones. Most are calculated with a formula that doesn't represent you.",
    pain_hr_3: "Cardiac drift raises your HR 10-20 bpm during steady exercise. Without lactate thresholds as an anchor, you're chasing a moving target.",
    pain_hr_4: "Running zones \u2260 cycling zones. If you use the same for both, one is wrong.",
    pain_lac_title: "A test without analysis is a number in a notebook",
    pain_lac_1: "Eyeballing the curve catches 1 inflection point. PeakAerobic runs 7+ validated algorithms and shows where they agree.",
    pain_lac_2: "One test tells you where you are today. Longitudinal tracking shows if your training is working.",
    pain_lac_3: "INSCYD charges \u20AC150-350 per analysis. You deserve unlimited analysis for a fraction of the cost.",
    pain_lac_4: "VLamax, capacity gaps, and race predictions need more than a spreadsheet.",

    how_ey: "How it works",
    how_h2: "Two paths, one destination: train better",
    how_path_hr: "I train with heart rate",
    how_hr_1_title: "Create your profile",
    how_hr_1_text: "Enter max HR, resting HR, sport and level",
    how_hr_2_title: "We detect your weaknesses",
    how_hr_2_text: "The system analyzes your data and finds where you need to improve",
    how_hr_3_title: "Get specific workouts",
    how_hr_3_text: "We prescribe sessions designed to target your weak points and improve your performance",
    how_path_lac: "I already do lactate tests",
    how_lac_1_title: "Upload your test",
    how_lac_1_text: "Any protocol, any format",
    how_lac_2_title: "Multi-method analysis",
    how_lac_2_text: "7+ algorithms with confidence scoring",
    how_lac_3_title: "Plan based on your gaps",
    how_lac_3_text: "We detect your physiological weaknesses and prescribe specific workouts to close them",
    how_converge: "No matter where you start, PeakAerobic detects your real weaknesses and prescribes specific workouts to improve them.",

    demo_ey: "Try it yourself",
    demo_h2: "Interactive demo",

    ap_ey: "Your athlete portal",
    ap_h2: "Everything you need. One app.",
    ap_sub: "Today's training, weekly view, progress, zones, objectives — all connected to your real physiology.",
    ap_1_title: "Your day, at a glance",
    ap_1_desc: "Readiness score, today's session with every step detailed, and wellness metrics. Know exactly what to do and how you feel.",
    ap_2_title: "Week and calendar",
    ap_2_desc: "Weekly view with sessions by discipline, zone distribution and volume. Drag to reorganize. Sync with Google Calendar.",
    ap_3_title: "Threshold evolution and predictions",
    ap_3_desc: "Watch your LT1 and LT2 evolve test by test. Race predictions updated with confidence bands for 5K, 10K, half and marathon.",
    ap_4_title: "Real zones, not formulas",
    ap_4_desc: "7 zones calculated from your real lactate. HR, pace and power for each zone. Updated every time you upload a test.",
    ap_5_title: "Objectives that drive your plan",
    ap_5_desc: "Define your races with date, discipline and goal time. The system analyzes your gaps, selects the optimal periodization block and builds your weekly plan around your objectives.",
    ap_6_title: "Race predictions",
    ap_6_desc: "Updated predictions for all distances with confidence bands. 5K, 10K, half and marathon based on your real physiology.",

    obj_ey: "Train by objectives",
    obj_h2: "Your race decides. The plan builds itself.",
    obj_sub: "Define your goal, we analyze your physiological gaps, select the optimal periodization block and prescribe each session. Week by week, the plan adapts to your real progress.",
    obj_step1_title: "Define your objective",
    obj_step1_text: "Valencia Marathon sub 3:15, Ironman 70.3, 10K sub 40... with date and priority.",
    obj_step2_title: "We analyze your gaps",
    obj_step2_text: "The physiological engine detects where you need to improve: LT2, aerobic capacity, VLamax...",
    obj_step3_title: "Optimal periodization block",
    obj_step3_text: "AI selects the optimal block (aerobic capacity, threshold, power...) with specific duration and dose.",
    obj_step4_title: "Adaptive weekly plan",
    obj_step4_text: "Prescribed sessions with structure, zones and Garmin push. Adapts based on your wellness and results.",
    obj_mock_gap: "Gap detected",
    obj_mock_gap_detail: "LT2 needs +16s/km",
    obj_mock_block: "Block selected",
    obj_mock_block_detail: "Threshold development \u00B7 4 weeks",
    obj_mock_sessions: "Prescribed sessions",

    price_ey: "Plans",
    price_h2: "Choose your plan",
    price_sub: "From lactate lab to full coaching. Beta pricing \u2014 lock your price forever.",
    price_period: "mo",
    price_bottom: "All plans include multi-method LT1/LT2 detection with confidence scoring.",

    price_free_name: "Free",
    price_free_amount: "\u20AC0",
    price_free_desc: "Start with heart rate",
    price_free_f1: "5 estimated zones from HR",
    price_free_f2: "2 lactate tests (demo)",
    price_free_f3: "Daily suggestion (1 session)",
    price_free_f4: "1 basic race prediction",
    price_free_f5: "Garmin/Strava sync",
    price_free_f6: "1 race objective",
    price_free_cta: "Start free",

    price_lab_name: "Lactate Lab",
    price_lab_amount: "\u20AC7.99",
    price_lab_desc: "For those who test lactate",
    price_lab_f1: "Unlimited lactate tests",
    price_lab_f2: "7 zones from real data",
    price_lab_f3: "Dynamic thresholds per session",
    price_lab_f4: "Threshold evolution test to test",
    price_lab_f5: "Predictions for all distances",
    price_lab_f6: "Side-by-side session comparison",
    price_lab_f7: "Numeric VLamax + capacity gap",
    price_lab_cta: "Get started",

    price_ai_name: "AI Plan",
    price_ai_badge: "Popular",
    price_ai_amount: "\u20AC19.99",
    price_ai_desc: "Full plan with smart periodization",
    price_ai_f1: "Everything in Lactate Lab +",
    price_ai_f2: "Full AI plan (1 discipline)",
    price_ai_f3: "Smart block periodization",
    price_ai_f4: "Calendar: today + week + zones",
    price_ai_f5: "Auto-push to Garmin",
    price_ai_f6: "David reviews your plan + data weekly",
    price_ai_f7: "Guided HR drift test",
    price_ai_f8: "Up to 3 objectives with priority",
    price_ai_cta: "Request access",

    price_pro_name: "PRO+",
    price_pro_badge: "Multi-discipline",
    price_pro_amount: "\u20AC34.99",
    price_pro_desc: "For multi-sport athletes and data obsessives",
    price_pro_f1: "Everything in AI Plan +",
    price_pro_f2: "Multi-discipline AI plan",
    price_pro_f3: "Stagnation detection",
    price_pro_f4: "VO2max + VLamax longitudinal",
    price_pro_f5: "AI Q&A + PubMed + your data",
    price_pro_f6: "HRV/sleep 30 days + correlations",
    price_pro_f7: "Predictions: durability + glycogen + what if",
    price_pro_f8: "Unlimited multi-discipline objectives",
    price_pro_cta: "Request access",

    price_elite_name: "Elite",
    price_elite_badge: "1:1 Coaching",
    price_elite_amount: "\u20AC199",
    price_elite_desc: "Full coaching with sport physiologist",
    price_elite_f1: "Everything in PRO+ +",
    price_elite_f2: "Coach validates and adjusts your plan",
    price_elite_f3: "Weekly 30-min call",
    price_elite_f4: "WhatsApp/Telegram 24h",
    price_elite_f5: "Coach re-plans weekly",
    price_elite_f6: "Coach feedback per session",
    price_elite_f7: "Nutritional advice",
    price_elite_cta: "Contact",

    proof_ey: "Athletes already using it",
    proof_h2: "Real results",
    proof_1_text: "I thought my threshold was at 4:30. It was at 4:08. I'd been training too easy for months.",
    proof_1_role: "Runner \u00B7 Half marathon",
    proof_2_text: "INSCYD charged me \u20AC200 per test. Now I have unlimited analysis for \u20AC8/mo and I can see how my thresholds evolve.",
    proof_2_role: "Cyclist \u00B7 Granfondo",
    proof_3_text: "I discovered my bike zones were 8 bpm below my running zones. That's why I wasn't improving on the bike.",
    proof_3_role: "Triathlete \u00B7 Ironman 70.3",

    faq_ey: "Frequently asked questions",
    faq_h2: "FAQ",
    faq_q1: "Do I need a lactate test?",
    faq_a1: "No. Start free with HR. But if you have data, the analysis is much more precise.",
    faq_q2: "I don't do lactate tests. Is PeakAerobic for me?",
    faq_a2: "Yes. Start free with your heart rate data \u2014 you'll get estimated zones, training suggestions and predictions. When you do your first test, PeakAerobic will recalculate everything with real data.",
    faq_q3: "How accurate are HR-based zones?",
    faq_a3: "HR zones have a margin of \u00B110-20 bpm. PeakAerobic uses the best formulas available, but we're transparent: HR zones are estimates. Lactate zones are measurements. That's why we show your confidence level.",
    faq_q4: "Do I need an expensive lactate meter?",
    faq_a4: "Portable meters cost \u20AC150-300 (Lactate Plus, Lactate Pro 2). Same investment as 1-2 lab tests, but you can test unlimited times.",
    faq_q5: "Can I use my Garmin/Strava data?",
    faq_a5: "You can use your max HR and resting HR from Garmin/Strava for initial zones. But the zones they give you are based on 220-age \u2014 a formula with \u00B110-20 bpm error.",
    faq_q6: "What is the private beta?",
    faq_a6: "Limited early access. We review each application personally.",
    faq_q7: "What sports does it cover?",
    faq_a7: "Running, cycling, swimming and triathlon. With sport-specific zones.",
    faq_q8: "What does the weekly review include?",
    faq_a8: "David reviews your plan, your data, and sends you a personalized analysis via email every week.",
    faq_q9: "When should I do my first lactate test?",
    faq_a9: "Whenever you want. Start with HR, and when you get curious or hit a plateau, do your first test. Many athletes start free and test after 4-8 weeks.",
    faq_q10: "Is my data secure?",
    faq_a10: "Your data is yours. We don't share anything with third parties.",

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

  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand">PeakAerobic</span>
          <div className="lp-nav__right">
            <a href="#" className="lp-nav__link" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t("nav_home")}</a>
            <a href="#demo" className="lp-nav__link">{t("nav_demo")}</a>
            <a href="#pricing" className="lp-nav__link">{t("nav_pricing")}</a>
            <a href="#faq" className="lp-nav__link">{t("nav_faq")}</a>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══ 1. HERO — Universal problem with dual CTA ══ */}
      <section className="lp-hero lp-hero--product">
        <div className="lp-hero__content">
          <h1 className="lp-hero__h1">
            {t("hero_h1")}
          </h1>
          <p className="lp-hero__sub">{t("hero_sub")}</p>

          <div className="lp-hero__ctas">
            <button className="lp-btn-solid lp-hero__cta-primary" onClick={() => navigate("/login")} type="button">
              {t("hero_cta_primary")}
            </button>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="lp-hero__cta-secondary"
            >
              {t("hero_cta_secondary")}
            </button>
          </div>
          <p className="lp-hero__note">{t("hero_note")}</p>
        </div>

        {/* App mockups — kept from original */}
        <div className="lp-hero__mockups">
          {/* Browser — Coach dashboard */}
          <div className="lp-hero-browser">
            <div className="lp-hero-browser__bar">
              <div className="lp-hero-browser__dots">
                <span style={{ background: "#ff5f57" }} /><span style={{ background: "#febc2e" }} /><span style={{ background: "#28c840" }} />
              </div>
              <div className="lp-hero-browser__url">peakAerobic.com/dashboard</div>
            </div>
            <div className="lp-hero-browser__screen">
              <div className="lp-hero-browser__header">
                <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="#d26a36" strokeWidth="2.5"/><path d="M10 20 L16 10 L22 20" stroke="#d26a36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                <span>PeakAerobic</span>
                <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Coach Panel</span>
              </div>
              <div className="lp-hero-browser__card">
                <span className="lp-hero-browser__card-title">Curva de lactato — Running</span>
                <svg viewBox="0 0 200 80" className="lp-hero-browser__curve">
                  <defs>
                    <linearGradient id="heroLacGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d26a36" stopOpacity="0.3"/>
                      <stop offset="100%" stopColor="#d26a36" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <path d="M10 65 Q40 63 70 58 T120 40 T160 18 T190 5" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M10 65 Q40 63 70 58 T120 40 T160 18 T190 5 V80 H10 Z" fill="url(#heroLacGrad)"/>
                  <circle cx="40" cy="62" r="3" fill="#fff" stroke="#d26a36" strokeWidth="1.5"/>
                  <circle cx="70" cy="58" r="3" fill="#fff" stroke="#d26a36" strokeWidth="1.5"/>
                  <circle cx="100" cy="48" r="3" fill="#fff" stroke="#d26a36" strokeWidth="1.5"/>
                  <circle cx="130" cy="34" r="3" fill="#fff" stroke="#d26a36" strokeWidth="1.5"/>
                  <circle cx="160" cy="18" r="3" fill="#fff" stroke="#d26a36" strokeWidth="1.5"/>
                  <line x1="70" y1="5" x2="70" y2="75" stroke="#22c55e" strokeWidth="1" strokeDasharray="3 2" opacity="0.7"/>
                  <text x="70" y="4" textAnchor="middle" fill="#22c55e" fontSize="6" fontWeight="700">LT1</text>
                  <line x1="130" y1="5" x2="130" y2="75" stroke="#f97316" strokeWidth="1" strokeDasharray="3 2" opacity="0.7"/>
                  <text x="130" y="4" textAnchor="middle" fill="#f97316" fontSize="6" fontWeight="700">LT2</text>
                </svg>
              </div>
              <div className="lp-hero-browser__row">
                <div className="lp-hero-browser__th" style={{ borderColor: "#22c55e" }}>
                  <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 9 }}>LT1</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>4:28/km</span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>148 bpm</span>
                </div>
                <div className="lp-hero-browser__th" style={{ borderColor: "#f97316" }}>
                  <span style={{ color: "#f97316", fontWeight: 700, fontSize: 9 }}>LT2</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>3:52/km</span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>172 bpm</span>
                </div>
                <div className="lp-hero-browser__th" style={{ borderColor: "#8B5CF6" }}>
                  <span style={{ color: "#8B5CF6", fontWeight: 700, fontSize: 9 }}>VO2max</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>52.4</span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>ml/kg/min</span>
                </div>
              </div>
              <div className="lp-hero-browser__card" style={{ borderLeft: "3px solid #d26a36" }}>
                <span className="lp-hero-browser__card-title">Bloque recomendado</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>Desarrollo de umbral</span>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>Margen de mejora detectado \u00B7 4 semanas</span>
              </div>
            </div>
          </div>

          {/* Phone — Athlete app */}
          <div className="lp-phone lp-hero__phone">
            <div className="lp-phone__notch" />
            <div className="lp-phone__screen">
              <div className="lp-phone__header">
                <svg width="14" height="14" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="#d26a36" strokeWidth="2.5"/><path d="M10 20 L16 10 L22 20" stroke="#d26a36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                Hoy
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0 8px" }}>
                <svg viewBox="0 0 56 56" width="44" height="44">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                  <circle cx="28" cy="28" r="22" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray="110 138" strokeLinecap="round" transform="rotate(-90 28 28)" />
                  <text x="28" y="32" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="Space Grotesk">78</text>
                </svg>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", display: "block" }}>Listo para entrenar</span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>HRV 52ms \u00B7 7.2h sueno \u00B7 Estres 24</span>
                </div>
              </div>
              <div className="lp-phone__card">
                <span className="lp-phone__card-title">Entreno de hoy</span>
                <span className="lp-phone__badge">Calidad</span>
                <span className="lp-phone__workout-name">Intervalos de umbral</span>
                <div className="lp-phone__steps">
                  {[
                    { label: "Calentamiento", dur: "15'", color: "#22c55e" },
                    { label: "4x6' ritmo fuerte", dur: "24'", color: "#F59E0B" },
                    { label: "Recuperacion", dur: "12'", color: "#10B981" },
                    { label: "Vuelta calma", dur: "10'", color: "#22c55e" },
                  ].map((s: { label: string; dur: string; color: string }) => (
                    <div key={s.label} className="lp-phone__step">
                      <span className="lp-phone__step-bar" style={{ background: s.color }} />
                      <span>{s.label}</span>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>{s.dur}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lp-phone__card">
                <span className="lp-phone__card-title">Carga de entrenamiento</span>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>1.12</span>
                  <span style={{ fontSize: 8, color: "#22c55e", fontWeight: 600 }}>Zona optima</span>
                </div>
              </div>
              <div className="lp-phone__nav">
                <div className="lp-phone__nav-item lp-phone__nav-item--active">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Hoy
                </div>
                <div className="lp-phone__nav-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Semana
                </div>
                <div className="lp-phone__nav-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  Progreso
                </div>
                <div className="lp-phone__nav-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  Recup
                </div>
              </div>
            </div>
            <div className="lp-phone__bar" />
          </div>
        </div>
      </section>

      {/* ══ 2. TWO PAIN PANELS — Side by side ══ */}
      <AnimSection>
        <section className="lp-section lp-section--dark" id="pain">
          <div className="lp-w">
            <div className="lp-pain__grid">
              {/* Panel Left: HR Athletes */}
              <div className="lp-pain__panel lp-pain__panel--hr">
                <div className="lp-pain__header">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  <h3 className="lp-pain__title">{t("pain_hr_title")}</h3>
                </div>
                <ul className="lp-pain__list">
                  {(["pain_hr_1","pain_hr_2","pain_hr_3","pain_hr_4"] as const).map(k => (
                    <li key={k} className="lp-pain__item">
                      <span className="lp-pain__x lp-pain__x--red">x</span>
                      <span>{t(k)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Panel Right: Lactate Athletes */}
              <div className="lp-pain__panel lp-pain__panel--lac">
                <div className="lp-pain__header">
                  <IconCurve />
                  <h3 className="lp-pain__title">{t("pain_lac_title")}</h3>
                </div>
                <ul className="lp-pain__list">
                  {(["pain_lac_1","pain_lac_2","pain_lac_3","pain_lac_4"] as const).map(k => (
                    <li key={k} className="lp-pain__item">
                      <span className="lp-pain__x lp-pain__x--orange">x</span>
                      <span>{t(k)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 4. HOW IT WORKS — Two parallel paths ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="how">
          <div className="lp-w">
            <p className="lp-ey">{t("how_ey")}</p>
            <h2 className="lp-h2">{t("how_h2")}</h2>

            <div className="lp-how-paths">
              {/* Path Left: HR */}
              <div className="lp-how-paths__card lp-how-paths__card--hr">
                <div className="lp-how-paths__header">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  <span className="lp-how-paths__label">{t("how_path_hr")}</span>
                </div>
                {(["1","2","3"] as const).map(n => (
                  <div key={n} className="lp-how-paths__step">
                    <div className="lp-how-paths__num lp-how-paths__num--green">{n}</div>
                    <div>
                      <h4 className="lp-how-paths__step-title">{t(`how_hr_${n}_title`)}</h4>
                      <p className="lp-how-paths__step-text">{t(`how_hr_${n}_text`)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Path Right: Lactate */}
              <div className="lp-how-paths__card lp-how-paths__card--lac">
                <div className="lp-how-paths__header">
                  <IconCurve />
                  <span className="lp-how-paths__label">{t("how_path_lac")}</span>
                </div>
                {(["1","2","3"] as const).map(n => (
                  <div key={n} className="lp-how-paths__step">
                    <div className="lp-how-paths__num lp-how-paths__num--orange">{n}</div>
                    <div>
                      <h4 className="lp-how-paths__step-title">{t(`how_lac_${n}_title`)}</h4>
                      <p className="lp-how-paths__step-text">{t(`how_lac_${n}_text`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Convergence line */}
            <div className="lp-how-paths__converge">
              <div className="lp-how-paths__converge-line" />
              <p className="lp-how-paths__converge-text">
                {t("how_converge")}
              </p>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 5. INTERACTIVE DEMO ══ */}
      <AnimSection>
        <section className="lp-section" id="demo">
          <div className="lp-w">
            <p className="lp-ey">{t("demo_ey")}</p>
            <h2 className="lp-h2">{t("demo_h2")}</h2>
          </div>
        </section>
      </AnimSection>
      <LactateDemo />

      {/* ══ 6. ATHLETE PORTAL SHOWCASE — Cards on white ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="athlete-portal">
          <div className="lp-w">
            <p className="lp-ey">{t("ap_ey")}</p>
            <h2 className="lp-h2">{t("ap_h2")}</h2>
            <p className="lp-sub">{t("ap_sub")}</p>

            <div className="lp-showcase__grid">
              {/* Card 1: Today */}
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
                <h3 className="lp-showcase__card-title">{t("ap_1_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_1_desc")}</p>
              </div>

              {/* Card 2: Week */}
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
                <h3 className="lp-showcase__card-title">{t("ap_2_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_2_desc")}</p>
              </div>

              {/* Card 3: Evolution */}
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
                <h3 className="lp-showcase__card-title">{t("ap_3_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_3_desc")}</p>
              </div>

              {/* Card 4: Zones */}
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
                <h3 className="lp-showcase__card-title">{t("ap_4_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_4_desc")}</p>
              </div>

              {/* Card 5: Objectives */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#f8fafb" />
                    <rect x="12" y="12" width="176" height="34" rx="8" fill="rgba(239,68,68,0.06)" stroke="rgba(239,68,68,0.15)" strokeWidth="1" />
                    <rect x="12" y="12" width="3" height="34" rx="1.5" fill="#ef4444" />
                    <text x="24" y="28" fill="#1a2f38" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">Marat\u00F3n Valencia</text>
                    <text x="24" y="40" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">sub 3:15 \u00B7 254 d\u00EDas</text>
                    <text x="170" y="32" textAnchor="end" fill="#ef4444" fontSize="7" fontWeight="700" fontFamily="Space Grotesk">ALTA</text>
                    <rect x="12" y="52" width="176" height="34" rx="8" fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.15)" strokeWidth="1" />
                    <rect x="12" y="52" width="3" height="34" rx="1.5" fill="#f59e0b" />
                    <text x="24" y="68" fill="#1a2f38" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">10K San Silvestre</text>
                    <text x="24" y="80" fill="#9ca3af" fontSize="7" fontFamily="Space Grotesk">sub 40:00 \u00B7 284 d\u00EDas</text>
                    <text x="170" y="72" textAnchor="end" fill="#f59e0b" fontSize="7" fontWeight="700" fontFamily="Space Grotesk">MEDIA</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_5_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_5_desc")}</p>
              </div>

              {/* Card 6: Predictions */}
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
                <h3 className="lp-showcase__card-title">{t("ap_6_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_6_desc")}</p>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 6b. OBJECTIVE-BASED TRAINING — Pipeline ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="objectives">
          <div className="lp-w">
            <p className="lp-ey">{t("obj_ey")}</p>
            <h2 className="lp-h2">{t("obj_h2")}</h2>
            <p className="lp-sub">{t("obj_sub")}</p>

            {/* Pipeline steps */}
            <div className="lp-pipeline__grid">
              {([
                { n: "1", icon: <IconRace />, key: "obj_step1" },
                { n: "2", icon: <IconCurve />, key: "obj_step2" },
                { n: "3", icon: <IconEngine />, key: "obj_step3" },
                { n: "4", icon: <IconPlan />, key: "obj_step4" },
              ] as const).map((step, i) => (
                <div key={step.n} className="lp-pipeline__step">
                  {i > 0 && (
                    <div className="lp-pipeline__connector" />
                  )}
                  <div className="lp-pipeline__icon">
                    {step.icon}
                  </div>
                  <div className="lp-pipeline__num">{step.n}</div>
                  <h4 className="lp-pipeline__title">{t(`${step.key}_title`)}</h4>
                  <p className="lp-pipeline__text">{t(`${step.key}_text`)}</p>
                </div>
              ))}
            </div>

            {/* Visual mockup: objective → gap → block → sessions */}
            <div className="lp-obj-mock">
              {/* Objective card */}
              <div className="lp-obj-mock__objective">
                <IconRace />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "Space Grotesk" }}>Marat&oacute;n Valencia — sub 3:15</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "Space Grotesk" }}>1 dic 2026 &middot; 254 d&iacute;as &middot; Prioridad alta</div>
                </div>
              </div>

              {/* Arrow */}
              <div style={{ textAlign: "center", margin: "4px 0" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4 L10 16 M6 12 L10 16 L14 12" stroke="#d26a36" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>

              {/* Gap + Block side by side */}
              <div className="lp-obj-mock__duo">
                <div className="lp-obj-mock__duo-card lp-obj-mock__duo-card--gap">
                  <div className="lp-obj-mock__duo-label lp-obj-mock__duo-label--orange">{t("obj_mock_gap")}</div>
                  <div className="lp-obj-mock__duo-value">{t("obj_mock_gap_detail")}</div>
                </div>
                <div className="lp-obj-mock__duo-card lp-obj-mock__duo-card--block">
                  <div className="lp-obj-mock__duo-label lp-obj-mock__duo-label--green">{t("obj_mock_block")}</div>
                  <div className="lp-obj-mock__duo-value">{t("obj_mock_block_detail")}</div>
                </div>
              </div>

              {/* Arrow */}
              <div style={{ textAlign: "center", margin: "4px 0" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4 L10 16 M6 12 L10 16 L14 12" stroke="#d26a36" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>

              {/* Sessions preview */}
              <div className="lp-obj-mock__sessions">
                <div className="lp-obj-mock__sessions-label">{t("obj_mock_sessions")}</div>
                <div className="lp-obj-mock__sessions-grid">
                  {[
                    { day: "Lun", session: null, type: "rest" },
                    { day: "Mar", session: "6\u00D74' LT2", type: "key" },
                    { day: "Mie", session: "40' Z2", type: "easy" },
                    { day: "Jue", session: null, type: "rest" },
                    { day: "Vie", session: "Tempo", type: "key" },
                    { day: "Sab", session: "24km Z2", type: "long" },
                    { day: "Dom", session: null, type: "rest" },
                  ].map((d, i) => {
                    const bg = d.type === "key" ? "rgba(245,158,11,0.12)" : d.type === "easy" ? "rgba(34,197,94,0.08)" : d.type === "long" ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)";
                    const border = d.type === "key" ? "1px solid rgba(245,158,11,0.25)" : d.type === "long" ? "1px solid rgba(59,130,246,0.2)" : "1px solid rgba(255,255,255,0.06)";
                    return (
                      <div key={i} style={{ background: bg, border, borderRadius: 8, padding: "8px 4px", textAlign: "center", minHeight: 48, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.4)", fontFamily: "Space Grotesk" }}>{d.day}</span>
                        {d.session && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", fontFamily: "Space Grotesk", lineHeight: 1.3 }}>{d.session}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 7. PRICING — 5 tiers ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="pricing">
          <div className="lp-w">
            <p className="lp-ey">{t("price_ey")}</p>
            <h2 className="lp-h2">{t("price_h2")}</h2>
            <p className="lp-sub">{t("price_sub")}</p>

            {/* Row 1: 3 cards */}
            <div className="lp-pricing__grid lp-pricing__grid--three">
              {/* Free */}
              <div className="lp-pricing__card">
                <span className="lp-pricing__plan-name">{t("price_free_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_free_amount")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_free_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_free_f1","price_free_f2","price_free_f3","price_free_f4","price_free_f5","price_free_f6"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_free_cta")}</button>
              </div>

              {/* Lactate Lab */}
              <div className="lp-pricing__card">
                <span className="lp-pricing__plan-name">{t("price_lab_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_lab_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_lab_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_lab_f1","price_lab_f2","price_lab_f3","price_lab_f4","price_lab_f5","price_lab_f6","price_lab_f7"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_lab_cta")}</button>
              </div>

              {/* AI Plan — highlighted */}
              <div className="lp-pricing__card lp-pricing__card--proplus">
                <span className="lp-pricing__badge lp-pricing__badge--accent">{t("price_ai_badge")}</span>
                <span className="lp-pricing__plan-name">{t("price_ai_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_ai_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_ai_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_ai_f1","price_ai_f2","price_ai_f3","price_ai_f4","price_ai_f5","price_ai_f6","price_ai_f7","price_ai_f8"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--coach lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_ai_cta")}</button>
              </div>
            </div>

            {/* Row 2: 2 cards centered */}
            <div className="lp-pricing__grid lp-pricing__grid--two">
              {/* PRO+ */}
              <div className="lp-pricing__card lp-pricing__card--proplus">
                <span className="lp-pricing__badge lp-pricing__badge--gradient">{t("price_pro_badge")}</span>
                <span className="lp-pricing__plan-name">{t("price_pro_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_pro_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_pro_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_pro_f1","price_pro_f2","price_pro_f3","price_pro_f4","price_pro_f5","price_pro_f6","price_pro_f7","price_pro_f8"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--coach lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_pro_cta")}</button>
              </div>

              {/* Elite */}
              <div className="lp-pricing__card lp-pricing__card--elite">
                <span className="lp-pricing__badge lp-pricing__badge--gold">{t("price_elite_badge")}</span>
                <span className="lp-pricing__plan-name">{t("price_elite_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_elite_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_elite_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_elite_f1","price_elite_f2","price_elite_f3","price_elite_f4","price_elite_f5","price_elite_f6","price_elite_f7"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a44c" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--elite lp-pricing__cta" onClick={() => navigate("/login")} type="button">{t("price_elite_cta")}</button>
              </div>
            </div>

            <p className="lp-pricing__bottom-note">
              {t("price_bottom")}
            </p>
          </div>
        </section>
      </AnimSection>

      {/* ══ 8. SOCIAL PROOF ══ */}
      <AnimSection>
        <section className="lp-section" id="proof">
          <div className="lp-w">
            <p className="lp-ey">{t("proof_ey")}</p>
            <h2 className="lp-h2">{t("proof_h2")}</h2>
            <div className="lp-proof__grid">
              {(["1","2","3"] as const).map(n => (
                <div key={n} className="lp-proof__card">
                  <div className="lp-proof__avatar">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                      <circle cx="20" cy="20" r="20" fill="rgba(210,106,54,0.1)" />
                      <circle cx="20" cy="16" r="6" fill="rgba(210,106,54,0.25)" />
                      <path d="M8 36 Q8 26 20 26 Q32 26 32 36" fill="rgba(210,106,54,0.15)" />
                    </svg>
                  </div>
                  <blockquote className="lp-proof__text">"{t(`proof_${n}_text`)}"</blockquote>
                  <span className="lp-proof__role">{t(`proof_${n}_role`)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 9. FAQ — 10 questions ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="faq">
          <div className="lp-w">
            <p className="lp-ey">{t("faq_ey")}</p>
            <h2 className="lp-h2">{t("faq_h2")}</h2>
            <div className="lp-faq__list">
              {(["1","2","3","4","5","6","7","8","9","10"] as const).map(n => (
                <details key={n} className="lp-faq__item">
                  <summary className="lp-faq__q">{t(`faq_q${n}`)}</summary>
                  <p className="lp-faq__a">{t(`faq_a${n}`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 10. FINAL CTA — Beta signup form ══ */}
      <section className="lp-cta-section" id="acceso">
        <div className="lp-w lp-cta-section__inner">
          <h2 className="lp-h2">{t("cta_h2")}</h2>
          <p className="lp-sub">{t("cta_sub")}</p>
          {submittedBottom ? (
            <div className="lp-done">{t("cta_done")}</div>
          ) : (
            <form className="lp-form" onSubmit={(e) => handleBeta(e, emailBottom, () => setSubmittedBottom(true))}>
              <input type="email" className="lp-form__input" placeholder={t("cta_placeholder")} value={emailBottom} onChange={(e) => setEmailBottom(e.target.value)} required />
              <button type="submit" className="lp-btn-solid">{t("cta_btn")}</button>
            </form>
          )}
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

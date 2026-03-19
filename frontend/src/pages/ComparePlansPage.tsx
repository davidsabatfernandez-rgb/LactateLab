import { useNavigate } from "react-router-dom";
import "../styles/landing.css";

const FEATURES = [
  { key: "analysis", label: { es: "Análisis de test de lactato", en: "Lactate test analysis" } },
  { key: "tests_limit", label: { es: "Tests disponibles", en: "Available tests" } },
  { key: "dynamic_thresholds", label: { es: "Progresión dinámica de umbrales con scoring", en: "Dynamic threshold progression with scoring" } },
  { key: "confidence", label: { es: "Sistema de confianza de lactato por sesión", en: "Per-session lactate confidence system" } },
  { key: "calendar", label: { es: "Calendario de auto-gestión", en: "Self-managed training calendar" } },
  { key: "workout_review", label: { es: "Revisión de entrenos con gráficas de valor", en: "Workout review with visual value charts" } },
  { key: "history", label: { es: "Histórico multi-disciplina", en: "Multi-discipline history" } },
  { key: "zones", label: { es: "Zonas de entrenamiento auto-calculadas", en: "Auto-calculated training zones" } },
  { key: "predictions", label: { es: "Predicciones de carrera", en: "Race predictions" } },
  { key: "goal_planning", label: { es: "Planificación por objetivo (maratón, Ironman, 10K...)", en: "Goal-based planning (marathon, Ironman, 10K...)" } },
  { key: "mesocycles", label: { es: "Generador de mesociclos con progresión automática", en: "Mesocycle generator with automatic progression" } },
  { key: "metabolic", label: { es: "Perfil metabólico: VO2max, VLamax, gaps", en: "Metabolic profile: VO2max, VLamax, gaps" } },
  { key: "garmin", label: { es: "Push de sesiones estructuradas a Garmin", en: "Structured sessions push to Garmin" } },
  { key: "retest", label: { es: "Alertas de retesteo + reportes", en: "Retest alerts + reports" } },
  { key: "coach", label: { es: "Coach fisiólogo personal asignado", en: "Personal physiology coach assigned" } },
  { key: "contact", label: { es: "Contacto 24h por WhatsApp / Telegram", en: "24h contact via WhatsApp / Telegram" } },
  { key: "videocalls", label: { es: "Videollamadas semanales de seguimiento", en: "Weekly follow-up video calls" } },
  { key: "session_explained", label: { es: "Cada sesión explicada al detalle", en: "Every session explained in detail" } },
  { key: "replanning", label: { es: "Re-planificación semanal según feedback", en: "Weekly re-planning based on feedback" } },
];

type Val = true | false | string;
const PLANS: { name: string; price: { es: string; en: string }; values: Record<string, Val> }[] = [
  {
    name: "Starter",
    price: { es: "0€/mes", en: "€0/mo" },
    values: {
      analysis: true, tests_limit: "2", dynamic_thresholds: false, confidence: false,
      calendar: false, workout_review: false, history: false, zones: true,
      predictions: true, goal_planning: false, mesocycles: false, metabolic: false,
      garmin: false, retest: false, coach: false, contact: false,
      videocalls: false, session_explained: false, replanning: false,
    },
  },
  {
    name: "Pro",
    price: { es: "12,99€/mes", en: "€12.99/mo" },
    values: {
      analysis: true, tests_limit: { es: "Ilimitados", en: "Unlimited" } as any,
      dynamic_thresholds: true, confidence: true, calendar: true, workout_review: true,
      history: true, zones: true, predictions: true,
      goal_planning: false, mesocycles: false, metabolic: false,
      garmin: false, retest: false, coach: false, contact: false,
      videocalls: false, session_explained: false, replanning: false,
    },
  },
  {
    name: "Pro+",
    price: { es: "29,99€/mes", en: "€29.99/mo" },
    values: {
      analysis: true, tests_limit: { es: "Ilimitados", en: "Unlimited" } as any,
      dynamic_thresholds: true, confidence: true, calendar: true, workout_review: true,
      history: true, zones: true, predictions: true,
      goal_planning: true, mesocycles: true, metabolic: true,
      garmin: true, retest: true, coach: false, contact: false,
      videocalls: false, session_explained: false, replanning: false,
    },
  },
  {
    name: "Elite",
    price: { es: "199€/mes", en: "€199/mo" },
    values: {
      analysis: true, tests_limit: { es: "Ilimitados", en: "Unlimited" } as any,
      dynamic_thresholds: true, confidence: true, calendar: true, workout_review: true,
      history: true, zones: true, predictions: true,
      goal_planning: true, mesocycles: true, metabolic: true,
      garmin: true, retest: true, coach: true, contact: true,
      videocalls: true, session_explained: true, replanning: true,
    },
  },
];

function Cell({ val }: { val: Val }) {
  if (val === true) return <span className="cp-yes">&#10003;</span>;
  if (val === false) return <span className="cp-no">—</span>;
  return <span className="cp-text">{typeof val === "object" ? (val as any).es : val}</span>;
}

export function ComparePlansPage() {
  const navigate = useNavigate();
  const lang = "es";

  return (
    <div className="cp-page">
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <a href="/" className="lp-nav__brand" onClick={(e) => { e.preventDefault(); navigate("/"); }}>PeakAerobic</a>
          <div className="lp-nav__right">
            <a href="/" className="lp-nav__link" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
              {lang === "es" ? "← Volver" : "← Back"}
            </a>
          </div>
        </div>
      </nav>

      <div className="cp-container">
        <h1 className="cp-title">{lang === "es" ? "Comparativa de planes" : "Plan comparison"}</h1>
        <p className="cp-subtitle">{lang === "es" ? "Encuentra el plan que se adapta a tu nivel y objetivos." : "Find the plan that fits your level and goals."}</p>

        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead>
              <tr>
                <th className="cp-feature-col"></th>
                {PLANS.map(p => (
                  <th key={p.name} className="cp-plan-col">
                    <span className="cp-plan-name">{p.name}</span>
                    <span className="cp-plan-price">{p.price[lang]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map(f => (
                <tr key={f.key}>
                  <td className="cp-feature-cell">{f.label[lang]}</td>
                  {PLANS.map(p => {
                    const v = p.values[f.key];
                    const display = typeof v === "object" ? (v as any)[lang] : v;
                    return <td key={p.name} className="cp-val-cell"><Cell val={display} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cp-ctas">
          <button className="lp-btn-solid" onClick={() => navigate("/register")}>
            {lang === "es" ? "Empieza gratis" : "Start free"}
          </button>
          <a href="/#pricing" className="lp-btn-ghost" onClick={(e) => { e.preventDefault(); navigate("/"); setTimeout(() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }), 100); }}>
            {lang === "es" ? "Ver precios" : "See pricing"}
          </a>
        </div>
      </div>
    </div>
  );
}

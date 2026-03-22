import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang, type Lang } from "../landing/i18n";
import "../styles/landing.css";

/* ─── inline translations ─── */
const T: Record<Lang, Record<string, string>> = {
  es: {
    back: "\u2190 Volver",
    title: "Comparativa de planes",
    subtitle: "Encuentra el plan que se adapta a tu nivel y objetivos.",
    popular: "Popular",
    monthly: "Mensual",
    quarterly: "Trimestral (-10%)",
    annual: "Anual (-20%)",
    per_quarter: "/tri",
    per_year: "/a\u00f1o",
    per_month: "/mes",
    start_free: "Empieza gratis",
    choose: "Elegir",
    contact_us: "Contactar",
    cat_lactate: "AN\u00c1LISIS DE LACTATO",
    cat_plan: "PLAN DE ENTRENAMIENTO",
    cat_metrics: "AN\u00c1LISIS Y M\u00c9TRICAS",
    cat_support: "OBJETIVOS Y SOPORTE",
    bottom_note:
      "Todos los planes incluyen detecci\u00f3n multi-m\u00e9todo completa de LT1/LT2 con scoring de acuerdo y m\u00e9tricas de confianza. El plan gratuito est\u00e1 limitado a 2 tests.",
    // features
    f_upload: "Subir tests de lactato",
    f_detection: "Detecci\u00f3n LT1/LT2",
    f_confidence: "Puntuaci\u00f3n de confianza",
    f_dynamic: "Umbrales din\u00e1micos",
    f_evolution: "Evoluci\u00f3n de umbrales",
    f_compare: "Comparaci\u00f3n de sesiones",
    f_vlamax: "Estimaci\u00f3n VLamax",
    f_ai_plan: "Plan de entrenamiento personalizado",
    f_blocks: "Periodizaci\u00f3n por bloques",
    f_calendar: "Vistas del calendario",
    f_garmin: "Env\u00edo a Garmin",
    f_adapt: "Adaptaci\u00f3n del plan",
    f_review: "Revisi\u00f3n semanal de David",
    f_zones: "Zonas de entrenamiento",
    f_race_pred: "Predicciones de carrera",
    f_goals: "Objetivos de carrera",
    f_support: "Soporte",
    f_videocalls: "Videollamadas",
  },
  en: {
    back: "\u2190 Back",
    title: "Plan comparison",
    subtitle: "Find the plan that fits your level and goals.",
    popular: "Popular",
    monthly: "Monthly",
    quarterly: "Quarterly (-10%)",
    annual: "Annual (-20%)",
    per_quarter: "/qtr",
    per_year: "/yr",
    per_month: "/mo",
    start_free: "Start free",
    choose: "Choose",
    contact_us: "Contact us",
    cat_lactate: "LACTATE ANALYSIS",
    cat_plan: "TRAINING PLAN",
    cat_metrics: "ANALYSIS & METRICS",
    cat_support: "GOALS & SUPPORT",
    bottom_note:
      "All plans include full multi-method LT1/LT2 detection with agreement scoring and confidence metrics. The free plan is limited to 2 tests.",
    f_upload: "Upload lactate tests",
    f_detection: "LT1/LT2 detection",
    f_confidence: "Confidence scoring",
    f_dynamic: "Dynamic thresholds",
    f_evolution: "Threshold evolution",
    f_compare: "Session comparison",
    f_vlamax: "VLamax estimation",
    f_ai_plan: "Personalized training plan",
    f_blocks: "Block periodisation",
    f_calendar: "Calendar views",
    f_garmin: "Push to Garmin",
    f_adapt: "Plan adaptation",
    f_review: "David's weekly review",
    f_zones: "Training zones",
    f_race_pred: "Race predictions",
    f_goals: "Race goals",
    f_support: "Support",
    f_videocalls: "Video calls",
  },
  de: {} as Record<string, string>,
  no: {} as Record<string, string>,
  fr: {} as Record<string, string>,
};

/* helper: fall back to es if key missing */
function tx(lang: Lang, key: string): string {
  return T[lang]?.[key] || T.es[key] || key;
}

/* ─── plan definitions ─── */
interface Plan {
  id: string;
  name: string;
  monthlyPrice: number; // EUR
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  { id: "free", name: "Free", monthlyPrice: 0 },
  { id: "lactate", name: "Lactate Lab", monthlyPrice: 7.99 },
  { id: "ai", name: "Plan Completo", monthlyPrice: 19.99, highlighted: true },
  { id: "pro_plus", name: "Pro+", monthlyPrice: 34.99 },
  { id: "elite", name: "Elite", monthlyPrice: 199 },
];

type Cycle = "monthly" | "quarterly" | "annual";

function formatPrice(monthly: number, cycle: Cycle, lang: Lang): string {
  if (monthly === 0) return "\u20ac0";
  const suffix =
    cycle === "monthly"
      ? tx(lang, "per_month")
      : cycle === "quarterly"
        ? tx(lang, "per_quarter")
        : tx(lang, "per_year");
  if (cycle === "monthly") return `\u20ac${monthly.toFixed(2).replace(".", ",")}${suffix}`;
  if (cycle === "quarterly") {
    const total = +(monthly * 3 * 0.9).toFixed(2);
    return `\u20ac${total.toFixed(2).replace(".", ",")}${suffix}`;
  }
  // annual
  const total = +(monthly * 12 * 0.8).toFixed(2);
  return `\u20ac${total.toFixed(2).replace(".", ",")}${suffix}`;
}

/* ─── feature rows ─── */
type Category = "lactate" | "plan" | "metrics" | "support";

interface FeatureRow {
  key: string;
  category: Category;
  values: Record<string, string>; // plan id -> cell text, "✓" or "—"
}

const V = "\u2713";
const D = "\u2014";

const ES_FEATURES: FeatureRow[] = [
  // LACTATE
  {
    key: "f_upload",
    category: "lactate",
    values: {
      free: "2 tests (demo)",
      lactate: "Ilimitados",
      ai: "Ilimitados",
      pro_plus: "Ilimitados",
      elite: "Ilimitados + revisi\u00f3n coach",
    },
  },
  {
    key: "f_detection",
    category: "lactate",
    values: {
      free: "Multi-m\u00e9todo + scoring",
      lactate: "Multi-m\u00e9todo + scoring",
      ai: "Multi-m\u00e9todo + scoring",
      pro_plus: "Multi-m\u00e9todo + scoring",
      elite: "Completo + coach valida",
    },
  },
  {
    key: "f_confidence",
    category: "lactate",
    values: {
      free: V,
      lactate: V,
      ai: V,
      pro_plus: V,
      elite: `${V} + coach interpreta`,
    },
  },
  {
    key: "f_dynamic",
    category: "lactate",
    values: {
      free: D,
      lactate: "Cada sesi\u00f3n actualiza",
      ai: V,
      pro_plus: "Modelos agudo + cr\u00f3nico",
      elite: "+ coach gestiona",
    },
  },
  {
    key: "f_evolution",
    category: "lactate",
    values: {
      free: D,
      lactate: "Progresi\u00f3n test a test",
      ai: V,
      pro_plus: "+ VO2max + VLamax longitudinal",
      elite: "+ coach anota",
    },
  },
  {
    key: "f_compare",
    category: "lactate",
    values: {
      free: D,
      lactate: "2 sesiones lado a lado",
      ai: V,
      pro_plus: "Superposici\u00f3n m\u00faltiple",
      elite: V,
    },
  },
  {
    key: "f_vlamax",
    category: "lactate",
    values: {
      free: "Baja/Media/Alta",
      lactate: "Num\u00e9rico + brecha",
      ai: "Proxy desde FC o lactato",
      pro_plus: "Num\u00e9rico + brecha",
      elite: "+ interpretaci\u00f3n",
    },
  },
  // PLAN
  {
    key: "f_ai_plan",
    category: "plan",
    values: {
      free: "Sugerencia diaria (1 sesi\u00f3n)",
      lactate: `${D} (herramienta de an\u00e1lisis)`,
      ai: "Plan completo 1 disciplina",
      pro_plus: "Plan multi-disciplina",
      elite: "Completo + coach ajusta",
    },
  },
  {
    key: "f_blocks",
    category: "plan",
    values: {
      free: D,
      lactate: D,
      ai: "Seleccion fisiologica de bloque",
      pro_plus: "+ detecci\u00f3n estancamiento",
      elite: "Coach selecciona + override",
    },
  },
  {
    key: "f_calendar",
    category: "plan",
    values: {
      free: "Solo hoy",
      lactate: D,
      ai: "Hoy + semana + zonas",
      pro_plus: "+ mes + Google Calendar",
      elite: "+ coach ajusta semanalmente",
    },
  },
  {
    key: "f_garmin",
    category: "plan",
    values: {
      free: D,
      lactate: D,
      ai: "Env\u00edo al reloj",
      pro_plus: "+ sincronizaci\u00f3n autom\u00e1tica",
      elite: "+ coach monitoriza",
    },
  },
  {
    key: "f_adapt",
    category: "plan",
    values: {
      free: D,
      lactate: D,
      ai: "Auto-adapta. David valida semanal.",
      pro_plus: "+ re-planifica por bienestar",
      elite: "Coach re-planifica semanalmente",
    },
  },
  {
    key: "f_review",
    category: "plan",
    values: {
      free: D,
      lactate: D,
      ai: `${V} (email)`,
      pro_plus: `${V} an\u00e1lisis m\u00e1s profundo`,
      elite: "Coaching 1:1 completo",
    },
  },
  // METRICS
  {
    key: "f_zones",
    category: "metrics",
    values: {
      free: "5 zonas b\u00e1sicas (FC)",
      lactate: "7 zonas desde lactato",
      ai: "7 zonas desde FC o lactato",
      pro_plus: "7 zonas + ajuste din\u00e1mico",
      elite: "7 zonas + coach modifica",
    },
  },
  {
    key: "f_race_pred",
    category: "metrics",
    values: {
      free: "1 distancia",
      lactate: "Todas las distancias",
      ai: "Todas + bandas confianza",
      pro_plus: "+ durabilidad + gluc\u00f3geno",
      elite: "+ coach contextualiza",
    },
  },
  // SUPPORT
  {
    key: "f_goals",
    category: "support",
    values: {
      free: "1 objetivo",
      lactate: "1 objetivo",
      ai: "Hasta 3 con prioridad",
      pro_plus: "Ilimitados + multi-disciplina",
      elite: "Ilimitados + coach gestiona",
    },
  },
  {
    key: "f_support",
    category: "support",
    values: {
      free: "FAQ",
      lactate: "Email",
      ai: "Email + nota semanal David",
      pro_plus: "Email prioritario",
      elite: "24h WhatsApp/Telegram",
    },
  },
  {
    key: "f_videocalls",
    category: "support",
    values: {
      free: D,
      lactate: D,
      ai: D,
      pro_plus: D,
      elite: "Semanal 30 min",
    },
  },
];

const EN_FEATURES: FeatureRow[] = [
  {
    key: "f_upload",
    category: "lactate",
    values: {
      free: "2 tests (demo)",
      lactate: "Unlimited",
      ai: "Unlimited",
      pro_plus: "Unlimited",
      elite: "Unlimited + coach review",
    },
  },
  {
    key: "f_detection",
    category: "lactate",
    values: {
      free: "Multi-method + scoring",
      lactate: "Multi-method + scoring",
      ai: "Multi-method + scoring",
      pro_plus: "Multi-method + scoring",
      elite: "Full + coach validates",
    },
  },
  {
    key: "f_confidence",
    category: "lactate",
    values: {
      free: V,
      lactate: V,
      ai: V,
      pro_plus: V,
      elite: `${V} + coach interprets`,
    },
  },
  {
    key: "f_dynamic",
    category: "lactate",
    values: {
      free: D,
      lactate: "Updates each session",
      ai: V,
      pro_plus: "Acute + chronic models",
      elite: "+ coach manages",
    },
  },
  {
    key: "f_evolution",
    category: "lactate",
    values: {
      free: D,
      lactate: "Test-to-test progression",
      ai: V,
      pro_plus: "+ VO2max + VLamax longitudinal",
      elite: "+ coach annotates",
    },
  },
  {
    key: "f_compare",
    category: "lactate",
    values: {
      free: D,
      lactate: "2 sessions side by side",
      ai: V,
      pro_plus: "Multi-session overlay",
      elite: V,
    },
  },
  {
    key: "f_vlamax",
    category: "lactate",
    values: {
      free: "Low/Medium/High",
      lactate: "Numeric + gap",
      ai: "Proxy from HR or lactate",
      pro_plus: "Numeric + gap",
      elite: "+ interpretation",
    },
  },
  {
    key: "f_ai_plan",
    category: "plan",
    values: {
      free: "Daily suggestion (1 session)",
      lactate: `${D} (analysis tool)`,
      ai: "Full plan 1 discipline",
      pro_plus: "Plan multi-discipline",
      elite: "Full + coach adjusts",
    },
  },
  {
    key: "f_blocks",
    category: "plan",
    values: {
      free: D,
      lactate: D,
      ai: "Physiological block selection",
      pro_plus: "+ stagnation detection",
      elite: "Coach selects + override",
    },
  },
  {
    key: "f_calendar",
    category: "plan",
    values: {
      free: "Today only",
      lactate: D,
      ai: "Today + week + zones",
      pro_plus: "+ month + Google Calendar",
      elite: "+ coach adjusts weekly",
    },
  },
  {
    key: "f_garmin",
    category: "plan",
    values: {
      free: D,
      lactate: D,
      ai: "Push to watch",
      pro_plus: "+ auto-sync",
      elite: "+ coach monitors",
    },
  },
  {
    key: "f_adapt",
    category: "plan",
    values: {
      free: D,
      lactate: D,
      ai: "Auto-adapts. David validates weekly.",
      pro_plus: "+ re-plans based on wellness",
      elite: "Coach re-plans weekly",
    },
  },
  {
    key: "f_review",
    category: "plan",
    values: {
      free: D,
      lactate: D,
      ai: `${V} (email)`,
      pro_plus: `${V} deeper analysis`,
      elite: "Full 1:1 coaching",
    },
  },
  {
    key: "f_zones",
    category: "metrics",
    values: {
      free: "5 basic zones (HR)",
      lactate: "7 zones from lactate",
      ai: "7 zones from HR or lactate",
      pro_plus: "7 zones + dynamic adjust",
      elite: "7 zones + coach modifies",
    },
  },
  {
    key: "f_race_pred",
    category: "metrics",
    values: {
      free: "1 distance",
      lactate: "All distances",
      ai: "All + confidence bands",
      pro_plus: "+ durability + glycogen",
      elite: "+ coach contextualises",
    },
  },
  {
    key: "f_goals",
    category: "support",
    values: {
      free: "1 goal",
      lactate: "1 goal",
      ai: "Up to 3 with priority",
      pro_plus: "Unlimited + multi-discipline",
      elite: "Unlimited + coach manages",
    },
  },
  {
    key: "f_support",
    category: "support",
    values: {
      free: "FAQ",
      lactate: "Email",
      ai: "Email + David's weekly note",
      pro_plus: "Priority email",
      elite: "24h WhatsApp/Telegram",
    },
  },
  {
    key: "f_videocalls",
    category: "support",
    values: {
      free: D,
      lactate: D,
      ai: D,
      pro_plus: D,
      elite: "Weekly 30 min",
    },
  },
];

function featuresForLang(lang: Lang): FeatureRow[] {
  if (lang === "en") return EN_FEATURES;
  return ES_FEATURES; // default to ES for de/no/fr too
}

const CATEGORY_KEYS: Category[] = ["lactate", "plan", "metrics", "support"];
function catLabel(cat: Category, lang: Lang): string {
  const map: Record<Category, string> = {
    lactate: tx(lang, "cat_lactate"),
    plan: tx(lang, "cat_plan"),
    metrics: tx(lang, "cat_metrics"),
    support: tx(lang, "cat_support"),
  };
  return map[cat];
}

/* ─── styles ─── */
const S = {
  page: {
    minHeight: "100vh",
    background: "#fff",
    fontFamily: "'Source Sans 3', 'Manrope', sans-serif",
    color: "#1a1a2e",
  } as React.CSSProperties,
  container: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "100px 20px 60px",
  } as React.CSSProperties,
  title: {
    fontSize: 36,
    fontWeight: 800,
    textAlign: "center" as const,
    marginBottom: 8,
  } as React.CSSProperties,
  subtitle: {
    fontSize: 18,
    textAlign: "center" as const,
    color: "#666",
    marginBottom: 32,
  } as React.CSSProperties,
  cycleRow: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
    marginBottom: 32,
  } as React.CSSProperties,
  cycleBtn: (active: boolean) =>
    ({
      padding: "8px 20px",
      borderRadius: 24,
      border: active ? "2px solid #e8772e" : "2px solid #ddd",
      background: active ? "#fef5ee" : "#fff",
      color: active ? "#e8772e" : "#666",
      fontWeight: 600,
      fontSize: 14,
      cursor: "pointer",
    }) as React.CSSProperties,
  tableWrap: {
    overflowX: "auto" as const,
    WebkitOverflowScrolling: "touch" as const,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
  } as React.CSSProperties,
  table: {
    width: "100%",
    minWidth: 900,
    borderCollapse: "collapse" as const,
    fontSize: 14,
  } as React.CSSProperties,
  thFeature: {
    position: "sticky" as const,
    left: 0,
    background: "#fafafa",
    zIndex: 2,
    padding: "14px 16px",
    textAlign: "left" as const,
    fontWeight: 600,
    minWidth: 200,
    borderBottom: "2px solid #e5e7eb",
  } as React.CSSProperties,
  thPlan: (highlighted: boolean) =>
    ({
      padding: "14px 12px",
      textAlign: "center" as const,
      fontWeight: 700,
      minWidth: 140,
      borderBottom: "2px solid #e5e7eb",
      background: highlighted ? "#fef5ee" : "#fafafa",
      position: "sticky" as const,
      top: 0,
      zIndex: 1,
    }) as React.CSSProperties,
  planName: {
    display: "block",
    fontSize: 16,
    fontWeight: 800,
  } as React.CSSProperties,
  planPrice: {
    display: "block",
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  } as React.CSSProperties,
  badge: {
    display: "inline-block",
    background: "#e8772e",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 10px",
    borderRadius: 12,
    marginBottom: 4,
  } as React.CSSProperties,
  catRow: {
    background: "#f3f4f6",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1,
    color: "#888",
    textTransform: "uppercase" as const,
  } as React.CSSProperties,
  catCell: {
    padding: "10px 16px",
    position: "sticky" as const,
    left: 0,
    background: "#f3f4f6",
    zIndex: 2,
  } as React.CSSProperties,
  featureCell: {
    padding: "10px 16px",
    fontWeight: 600,
    position: "sticky" as const,
    left: 0,
    background: "#fff",
    zIndex: 2,
    borderBottom: "1px solid #f0f0f0",
    minWidth: 200,
  } as React.CSSProperties,
  valCell: (highlighted: boolean) =>
    ({
      padding: "10px 12px",
      textAlign: "center" as const,
      borderBottom: "1px solid #f0f0f0",
      background: highlighted ? "#fffbf5" : "#fff",
      fontSize: 13,
      lineHeight: 1.4,
    }) as React.CSSProperties,
  check: { color: "#16a34a", fontWeight: 700, fontSize: 16 } as React.CSSProperties,
  dash: { color: "#ccc", fontSize: 16 } as React.CSSProperties,
  ctaRow: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap" as const,
    marginTop: 40,
    marginBottom: 16,
  } as React.CSSProperties,
  ctaBtn: (highlighted: boolean) =>
    ({
      padding: "12px 28px",
      borderRadius: 10,
      border: "none",
      background: highlighted ? "#e8772e" : "#1a1a2e",
      color: "#fff",
      fontWeight: 700,
      fontSize: 15,
      cursor: "pointer",
      minWidth: 140,
    }) as React.CSSProperties,
  note: {
    textAlign: "center" as const,
    fontSize: 13,
    color: "#888",
    maxWidth: 720,
    margin: "24px auto 0",
    lineHeight: 1.6,
  } as React.CSSProperties,
};

/* ─── component ─── */
export function ComparePlansPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const [cycle, setCycle] = useState<Cycle>("monthly");

  const features = featuresForLang(lang);

  /* group features by category */
  const grouped: { cat: Category; rows: FeatureRow[] }[] = CATEGORY_KEYS.map((cat) => ({
    cat,
    rows: features.filter((f) => f.category === cat),
  }));

  function renderCell(text: string) {
    if (text === V) return <span style={S.check}>{V}</span>;
    if (text === D) return <span style={S.dash}>{D}</span>;
    // check marks with extra text
    if (text.startsWith(V)) return <span><span style={S.check}>{V}</span>{text.slice(1)}</span>;
    return <span>{text}</span>;
  }

  return (
    <div style={S.page}>
      {/* nav */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <a
            href="/"
            className="lp-nav__brand"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            PeakAerobic
          </a>
          <div className="lp-nav__right">
            <a
              href="/"
              className="lp-nav__link"
              onClick={(e) => {
                e.preventDefault();
                navigate("/");
              }}
            >
              {tx(lang, "back")}
            </a>
          </div>
        </div>
      </nav>

      <div style={S.container}>
        <h1 style={S.title}>{tx(lang, "title")}</h1>
        <p style={S.subtitle}>{tx(lang, "subtitle")}</p>

        {/* billing cycle selector */}
        <div style={S.cycleRow}>
          {(["monthly", "quarterly", "annual"] as Cycle[]).map((c) => (
            <button key={c} style={S.cycleBtn(cycle === c)} onClick={() => setCycle(c)}>
              {tx(lang, c)}
            </button>
          ))}
        </div>

        {/* comparison table */}
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thFeature}></th>
                {PLANS.map((p) => (
                  <th key={p.id} style={S.thPlan(!!p.highlighted)}>
                    {p.highlighted && <span style={S.badge}>{tx(lang, "popular")}</span>}
                    <span style={S.planName}>{p.name}</span>
                    <span style={S.planPrice}>{formatPrice(p.monthlyPrice, cycle, lang)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <>
                  {/* category header */}
                  <tr key={`cat-${g.cat}`} style={S.catRow}>
                    <td style={S.catCell} colSpan={1}>
                      {catLabel(g.cat, lang)}
                    </td>
                    {PLANS.map((p) => (
                      <td
                        key={p.id}
                        style={{
                          ...S.catRow,
                          background: p.highlighted ? "#fef0e0" : "#f3f4f6",
                        }}
                      />
                    ))}
                  </tr>
                  {/* feature rows */}
                  {g.rows.map((f) => (
                    <tr key={f.key}>
                      <td style={S.featureCell}>{tx(lang, f.key)}</td>
                      {PLANS.map((p) => (
                        <td key={p.id} style={S.valCell(!!p.highlighted)}>
                          {renderCell(f.values[p.id] || D)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* CTA buttons */}
        <div style={S.ctaRow}>
          {PLANS.map((p) => (
            <button
              key={p.id}
              style={S.ctaBtn(!!p.highlighted)}
              onClick={() => navigate("/login")}
            >
              {p.monthlyPrice === 0
                ? tx(lang, "start_free")
                : p.monthlyPrice >= 199
                  ? tx(lang, "contact_us")
                  : `${tx(lang, "choose")} ${p.name}`}
            </button>
          ))}
        </div>

        {/* bottom note */}
        <p style={S.note}>{tx(lang, "bottom_note")}</p>
      </div>
    </div>
  );
}

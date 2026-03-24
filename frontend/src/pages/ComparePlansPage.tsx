import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LangProvider, useLang, LANG_LABELS, type Lang } from "../landing/i18n";
import "../styles/landing.css";

/* ─── inline translations ─── */
const T: Record<Lang, Record<string, string>> = {
  es: {
    title: "Encuentra tu plan",
    subtitle: "Todos incluyen análisis multi-método de LT1/LT2 con scoring de confianza.",
    popular: "Recomendado",
    monthly: "Mensual",
    quarterly: "Trimestral",
    annual: "Anual",
    discount_q: "-10%",
    discount_a: "-20%",
    per_quarter: "/tri",
    per_year: "/año",
    per_month: "/mes",
    start_free: "Empieza gratis",
    try_14: "Unirse al plan",
    book_call: "Reservar llamada",
    cat_analysis: "ANÁLISIS",
    cat_planning: "PLANIFICACIÓN",
    cat_support: "SOPORTE",
    // nav
    nav_how: "Cómo funciona",
    nav_pricing: "Planes",
    nav_compare: "Comparar planes",
    nav_blog: "Blog",
    nav_enter: "Entrar",
    // footer
    foot_tagline: "Entrenamiento basado en tu fisiología",
    foot_privacy: "Privacidad",
    foot_compare: "Comparar planes",
    // plan descriptions
    desc_free: "Para curiosos y primeras pruebas",
    desc_lactate: "Para atletas que se testean regularmente",
    desc_pro: "Motor fisiológico, planificación, Garmin y soporte por email. 1 disciplina.",
    desc_pro_plus: "Todo Pro para hasta 3 disciplinas. Running, ciclismo y natación.",
    desc_elite: "Atención personal con un especialista dedicado",
    // feature rows - Analysis
    f_upload: "Subida de tests",
    f_detection: "Detección LT1/LT2",
    f_zones: "Zonas de entrenamiento",
    f_dynamic: "Umbrales dinámicos",
    f_race_pred: "Predicciones de carrera",
    f_multi: "Multi-disciplina",
    // feature rows - Planning
    f_engine: "Motor fisiológico",
    f_calendar: "Calendario semanal",
    f_garmin: "Envío a Garmin",
    f_block_sel: "Selección de bloque",
    f_dose: "Dose ladders",
    f_meso_lib: "Biblioteca de mesociclos",
    // feature rows - Support
    f_review: "Revisión semanal",
    f_contact: "Contacto directo",
    f_race_strategy: "Estrategia de carrera",
  },
  en: {
    title: "Find your plan",
    subtitle: "All plans include multi-method LT1/LT2 detection with confidence scoring.",
    popular: "Recommended",
    monthly: "Monthly",
    quarterly: "Quarterly",
    annual: "Annual",
    discount_q: "-10%",
    discount_a: "-20%",
    per_quarter: "/qtr",
    per_year: "/yr",
    per_month: "/mo",
    start_free: "Start free",
    try_14: "Join plan",
    book_call: "Book a call",
    cat_analysis: "ANALYSIS",
    cat_planning: "PLANNING",
    cat_support: "SUPPORT",
    nav_how: "How it works",
    nav_pricing: "Plans",
    nav_compare: "Compare plans",
    nav_blog: "Blog",
    nav_enter: "Log in",
    foot_tagline: "Training based on your physiology",
    foot_privacy: "Privacy",
    foot_compare: "Compare plans",
    desc_free: "For the curious and first tests",
    desc_lactate: "For athletes who test regularly",
    desc_pro: "Physiological engine, planning, Garmin & email support. 1 discipline.",
    desc_pro_plus: "Everything in Pro for up to 3 disciplines. Running, cycling & swimming.",
    desc_elite: "Personal attention with a dedicated specialist",
    f_upload: "Test uploads",
    f_detection: "LT1/LT2 detection",
    f_zones: "Training zones",
    f_dynamic: "Dynamic thresholds",
    f_race_pred: "Race predictions",
    f_multi: "Multi-discipline",
    f_engine: "Physiological engine",
    f_calendar: "Weekly calendar",
    f_garmin: "Push to Garmin",
    f_block_sel: "Block selection",
    f_dose: "Dose ladders",
    f_meso_lib: "Mesocycle library",
    f_review: "Weekly review",
    f_contact: "Direct contact",
    f_race_strategy: "Race strategy",
  },
  de: {
    title: "Finde deinen Plan",
    subtitle: "Alle beinhalten Multi-Methoden-LT1/LT2-Erkennung mit Konfidenz-Scoring.",
    popular: "Empfohlen",
    monthly: "Monatlich",
    quarterly: "Quartalsweise",
    annual: "Jährlich",
    discount_q: "-10%",
    discount_a: "-20%",
    per_quarter: "/Quartal",
    per_year: "/Jahr",
    per_month: "/Monat",
    start_free: "Kostenlos starten",
    try_14: "Plan beitreten",
    book_call: "Gespräch buchen",
    cat_analysis: "ANALYSE",
    cat_planning: "PLANUNG",
    cat_support: "SUPPORT",
    nav_how: "So funktioniert's",
    nav_pricing: "Pläne",
    nav_compare: "Pläne vergleichen",
    nav_blog: "Blog",
    nav_enter: "Anmelden",
    foot_tagline: "Training basierend auf deiner Physiologie",
    foot_privacy: "Datenschutz",
    foot_compare: "Pläne vergleichen",
    desc_free: "Für Neugierige und erste Tests",
    desc_lactate: "Für Athleten, die regelmäßig testen",
    desc_pro: "Physiologische Engine, Planung, Garmin und E-Mail-Support. 1 Disziplin.",
    desc_pro_plus: "Alles aus Pro für bis zu 3 Disziplinen. Laufen, Radfahren und Schwimmen.",
    desc_elite: "Persönliche Betreuung mit einem dedizierten Spezialisten",
    f_upload: "Test-Uploads",
    f_detection: "LT1/LT2-Erkennung",
    f_zones: "Trainingszonen",
    f_dynamic: "Dynamische Schwellenwerte",
    f_race_pred: "Wettkampfprognosen",
    f_multi: "Multi-Disziplin",
    f_engine: "Physiologische Engine",
    f_calendar: "Wochenkalender",
    f_garmin: "Push an Garmin",
    f_block_sel: "Blockauswahl",
    f_dose: "Dose Ladders",
    f_meso_lib: "Mesozyklus-Bibliothek",
    f_review: "Wöchentliche Überprüfung",
    f_contact: "Direkter Kontakt",
    f_race_strategy: "Wettkampfstrategie",
  },
  no: {
    title: "Finn planen din",
    subtitle: "Alle inkluderer multi-metode LT1/LT2-deteksjon med konfidensscoring.",
    popular: "Anbefalt",
    monthly: "Månedlig",
    quarterly: "Kvartalsvis",
    annual: "Årlig",
    discount_q: "-10%",
    discount_a: "-20%",
    per_quarter: "/kvartal",
    per_year: "/år",
    per_month: "/mnd",
    start_free: "Start gratis",
    try_14: "Bli med i planen",
    book_call: "Book en samtale",
    cat_analysis: "ANALYSE",
    cat_planning: "PLANLEGGING",
    cat_support: "STØTTE",
    nav_how: "Slik fungerer det",
    nav_pricing: "Planer",
    nav_compare: "Sammenlign planer",
    nav_blog: "Blogg",
    nav_enter: "Logg inn",
    foot_tagline: "Trening basert på din fysiologi",
    foot_privacy: "Personvern",
    foot_compare: "Sammenlign planer",
    desc_free: "For nysgjerrige og første tester",
    desc_lactate: "For utøvere som tester regelmessig",
    desc_pro: "Fysiologisk motor, planlegging, Garmin og e-poststøtte. 1 disiplin.",
    desc_pro_plus: "Alt i Pro for opptil 3 disipliner. Løping, sykling og svømming.",
    desc_elite: "Personlig oppmerksomhet med en dedikert spesialist",
    f_upload: "Testopplastinger",
    f_detection: "LT1/LT2-deteksjon",
    f_zones: "Treningssoner",
    f_dynamic: "Dynamiske terskelverdier",
    f_race_pred: "Konkurranseprognoser",
    f_multi: "Multi-disiplin",
    f_engine: "Fysiologisk motor",
    f_calendar: "Ukentlig kalender",
    f_garmin: "Push til Garmin",
    f_block_sel: "Blokkvalg",
    f_dose: "Dose ladders",
    f_meso_lib: "Mesosyklusbibliotek",
    f_review: "Ukentlig gjennomgang",
    f_contact: "Direkte kontakt",
    f_race_strategy: "Konkurransestrategi",
  },
  fr: {
    title: "Trouve ton plan",
    subtitle: "Tous incluent la détection multi-méthode SL1/SL2 avec scoring de confiance.",
    popular: "Recommandé",
    monthly: "Mensuel",
    quarterly: "Trimestriel",
    annual: "Annuel",
    discount_q: "-10%",
    discount_a: "-20%",
    per_quarter: "/trim",
    per_year: "/an",
    per_month: "/mois",
    start_free: "Commencer gratuitement",
    try_14: "Rejoindre le plan",
    book_call: "Réserver un appel",
    cat_analysis: "ANALYSE",
    cat_planning: "PLANIFICATION",
    cat_support: "SUPPORT",
    nav_how: "Comment ça marche",
    nav_pricing: "Plans",
    nav_compare: "Comparer les plans",
    nav_blog: "Blog",
    nav_enter: "Connexion",
    foot_tagline: "Entraînement basé sur ta physiologie",
    foot_privacy: "Confidentialité",
    foot_compare: "Comparer les plans",
    desc_free: "Pour les curieux et les premiers tests",
    desc_lactate: "Pour les athlètes qui se testent régulièrement",
    desc_pro: "Moteur physiologique, planification, Garmin et support email. 1 discipline.",
    desc_pro_plus: "Tout ce qu'offre Pro pour jusqu'à 3 disciplines. Course, cyclisme et natation.",
    desc_elite: "Attention personnelle avec un spécialiste dédié",
    f_upload: "Import de tests",
    f_detection: "Détection SL1/SL2",
    f_zones: "Zones d'entraînement",
    f_dynamic: "Seuils dynamiques",
    f_race_pred: "Prédictions de course",
    f_multi: "Multi-discipline",
    f_engine: "Moteur physiologique",
    f_calendar: "Calendrier hebdomadaire",
    f_garmin: "Envoi vers Garmin",
    f_block_sel: "Sélection de bloc",
    f_dose: "Dose ladders",
    f_meso_lib: "Bibliothèque de mésocycles",
    f_review: "Revue hebdomadaire",
    f_contact: "Contact direct",
    f_race_strategy: "Stratégie de course",
  },
};

function tx(lang: Lang, key: string): string {
  return T[lang]?.[key] || T.es[key] || key;
}

/* ─── plan definitions ─── */
interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  highlighted?: boolean;
  color: string;
}

const PLANS: Plan[] = [
  { id: "free",      name: "Gratis",        monthlyPrice: 0,     color: "#9ca3af" },
  { id: "lactate",   name: "Lactate Lab",   monthlyPrice: 7.99,  color: "#22c55e" },
  { id: "pro",       name: "Pro",           monthlyPrice: 19.99, color: "#3b82f6" },
  { id: "pro_plus",  name: "Pro+",          monthlyPrice: 39.99, highlighted: true, color: "#d26a36" },
  { id: "elite",     name: "Elite",         monthlyPrice: 199,   color: "#1a2f38" },
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
  const total = +(monthly * 12 * 0.8).toFixed(2);
  return `\u20ac${total.toFixed(2).replace(".", ",")}${suffix}`;
}

/* ─── feature rows ─── */
type Category = "analysis" | "planning" | "support";

interface FeatureRow {
  key: string;
  category: Category;
  /** Values per plan id. Use V for checkmark, D for dash, or a string. */
  values: Record<string, string>;
}

const V = "\u2713";
const D = "\u2014";

const FEATURES_ES: FeatureRow[] = [
  // Analysis
  { key: "f_upload",    category: "analysis", values: { free: "3/mes",      lactate: "Ilimitados", pro: "Ilimitados", pro_plus: "Ilimitados", elite: "Ilimitados" } },
  { key: "f_detection", category: "analysis", values: { free: "Basica",     lactate: "Avanzada (7 metodos)", pro: "Avanzada", pro_plus: "Avanzada", elite: "Avanzada" } },
  { key: "f_zones",     category: "analysis", values: { free: "3 zonas",    lactate: "7 zonas",    pro: "7 zonas",    pro_plus: "7 zonas",    elite: "7 zonas" } },
  { key: "f_dynamic",   category: "analysis", values: { free: D,            lactate: "Agudos",     pro: "Agudos + Cronicos", pro_plus: "Agudos + Cronicos", elite: "Agudos + Cronicos" } },
  { key: "f_race_pred", category: "analysis", values: { free: V,            lactate: V,            pro: V,            pro_plus: V,            elite: V } },
  { key: "f_multi",     category: "analysis", values: { free: "1",          lactate: "1",          pro: "1",           pro_plus: "Hasta 3",   elite: "Multi" } },
  // Planning
  { key: "f_engine",    category: "planning", values: { free: D,            lactate: D,            pro: "Supervisado",  pro_plus: "Supervisado", elite: "Dedicado por tu especialista" } },
  { key: "f_calendar",  category: "planning", values: { free: D,            lactate: D,            pro: V,             pro_plus: V,            elite: V } },
  { key: "f_garmin",    category: "planning", values: { free: D,            lactate: D,            pro: V,             pro_plus: V,            elite: V } },
  { key: "f_block_sel", category: "planning", values: { free: D,            lactate: D,            pro: "Automática",  pro_plus: "Automática", elite: "Personalizada" } },
  { key: "f_dose",      category: "planning", values: { free: D,            lactate: D,            pro: V,             pro_plus: V,            elite: V } },
  { key: "f_meso_lib",  category: "planning", values: { free: D,            lactate: D,            pro: V,             pro_plus: V,            elite: "Personalizada" } },
  // Support
  { key: "f_review",       category: "support", values: { free: D, lactate: D, pro: "Motor",  pro_plus: "Motor",    elite: "Especialista dedicado" } },
  { key: "f_contact",      category: "support", values: { free: D, lactate: D, pro: "Email",  pro_plus: "Email",    elite: "WhatsApp + videollamada" } },
  { key: "f_race_strategy", category: "support", values: { free: D, lactate: D, pro: D,       pro_plus: D,          elite: V } },
];

const FEATURES_EN: FeatureRow[] = [
  { key: "f_upload",    category: "analysis", values: { free: "3/month",    lactate: "Unlimited",  pro: "Unlimited",  pro_plus: "Unlimited",  elite: "Unlimited" } },
  { key: "f_detection", category: "analysis", values: { free: "Basic",      lactate: "Advanced (7 methods)", pro: "Advanced", pro_plus: "Advanced", elite: "Advanced" } },
  { key: "f_zones",     category: "analysis", values: { free: "3 zones",    lactate: "7 zones",    pro: "7 zones",    pro_plus: "7 zones",    elite: "7 zones" } },
  { key: "f_dynamic",   category: "analysis", values: { free: D,            lactate: "Acute",      pro: "Acute + Chronic", pro_plus: "Acute + Chronic", elite: "Acute + Chronic" } },
  { key: "f_race_pred", category: "analysis", values: { free: V,            lactate: V,            pro: V,            pro_plus: V,            elite: V } },
  { key: "f_multi",     category: "analysis", values: { free: "1",          lactate: "1",          pro: "1",           pro_plus: "Up to 3",   elite: "Multi" } },
  { key: "f_engine",    category: "planning", values: { free: D,            lactate: D,            pro: "Supervised",   pro_plus: "Supervised",  elite: "Dedicated specialist" } },
  { key: "f_calendar",  category: "planning", values: { free: D,            lactate: D,            pro: V,             pro_plus: V,            elite: V } },
  { key: "f_garmin",    category: "planning", values: { free: D,            lactate: D,            pro: V,             pro_plus: V,            elite: V } },
  { key: "f_block_sel", category: "planning", values: { free: D,            lactate: D,            pro: "Automatic",   pro_plus: "Automatic",  elite: "Personalized" } },
  { key: "f_dose",      category: "planning", values: { free: D,            lactate: D,            pro: V,             pro_plus: V,            elite: V } },
  { key: "f_meso_lib",  category: "planning", values: { free: D,            lactate: D,            pro: V,             pro_plus: V,            elite: "Custom" } },
  { key: "f_review",       category: "support", values: { free: D, lactate: D, pro: "Engine",  pro_plus: "Engine",   elite: "Dedicated specialist" } },
  { key: "f_contact",      category: "support", values: { free: D, lactate: D, pro: "Email",   pro_plus: "Email",    elite: "WhatsApp + video call" } },
  { key: "f_race_strategy", category: "support", values: { free: D, lactate: D, pro: D,        pro_plus: D,          elite: V } },
];

function featuresForLang(lang: Lang): FeatureRow[] {
  if (lang === "en") return FEATURES_EN;
  return FEATURES_ES;
}

const CATEGORY_KEYS: Category[] = ["analysis", "planning", "support"];
function catLabel(cat: Category, lang: Lang): string {
  const map: Record<Category, string> = {
    analysis: tx(lang, "cat_analysis"),
    planning: tx(lang, "cat_planning"),
    support: tx(lang, "cat_support"),
  };
  return map[cat];
}

/* ─── icons ─── */
const PLAN_ICONS: Record<string, JSX.Element> = {
  free: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  lactate: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
    </svg>
  ),
  pro: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  ),
  pro_plus: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  elite: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
};

/* ─── Language switcher (inline, matches landing) ─── */
function LangSwitch() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="lp-nav__link"
        onClick={() => setOpen(!open)}
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        {LANG_LABELS[lang]}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            background: "#fff",
            border: "1px solid var(--c-border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            padding: "4px 0",
            zIndex: 100,
            minWidth: 120,
          }}
        >
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => { setLang(l); setOpen(false); }}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 14px",
                textAlign: "left",
                background: l === lang ? "#f5f5f7" : "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: l === lang ? 700 : 400,
              }}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── cell renderer ─── */
function renderCell(text: string, plan: Plan) {
  if (text === V) {
    return (
      <span className="cp-pill cp-pill--yes" style={{ background: `${plan.color}15`, color: plan.color }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (text === D) {
    return <span className="cp-pill cp-pill--no">{D}</span>;
  }
  if (text.startsWith(V)) {
    return (
      <span className="cp-pill cp-pill--extra" style={{ background: `${plan.color}10`, borderColor: `${plan.color}30` }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={plan.color} strokeWidth="3" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {text.slice(1)}
      </span>
    );
  }
  return <span className="cp-pill cp-pill--text">{text}</span>;
}

/* ─── CTA label ─── */
function ctaLabel(plan: Plan, lang: Lang): string {
  if (plan.monthlyPrice === 0) return tx(lang, "start_free");
  if (plan.id === "elite") return tx(lang, "book_call");
  return tx(lang, "try_14");
}

/* ─── inner component ─── */
function ComparePlansInner() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const [cycle, setCycle] = useState<Cycle>("monthly");

  const features = featuresForLang(lang);

  const grouped: { cat: Category; rows: FeatureRow[] }[] = CATEGORY_KEYS.map((cat) => ({
    cat,
    rows: features.filter((f) => f.category === cat),
  }));

  const DESC_KEYS: Record<string, string> = {
    free: "desc_free",
    lactate: "desc_lactate",
    pro: "desc_pro",
    pro_plus: "desc_pro_plus",
    elite: "desc_elite",
  };

  return (
    <div className="cp-page">
      {/* ── NAV (matches landing) ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span
            className="lp-nav__brand"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/")}
          >
            PeakAerobic
          </span>
          <div className="lp-nav__right">
            <button
              type="button"
              className="lp-nav__link lp-nav__link--hide-mobile"
              onClick={() => navigate("/")}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {tx(lang, "nav_how")}
            </button>
            <button
              type="button"
              className="lp-nav__link lp-nav__link--hide-mobile"
              onClick={() => navigate("/#pricing")}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {tx(lang, "nav_pricing")}
            </button>
            <span
              className="lp-nav__link lp-nav__link--hide-mobile"
              style={{ fontWeight: 700, color: "var(--c-accent)" }}
            >
              {tx(lang, "nav_compare")}
            </span>
            <button
              type="button"
              className="lp-nav__link lp-nav__link--hide-mobile"
              onClick={() => navigate("/resources")}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {tx(lang, "nav_blog")}
            </button>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">
              {tx(lang, "nav_enter")}
            </button>
          </div>
        </div>
      </nav>

      <div className="cp-container">
        <h1 className="cp-title">{tx(lang, "title")}</h1>
        <p className="cp-subtitle">{tx(lang, "subtitle")}</p>

        {/* ── Billing cycle toggle ── */}
        <div className="cp-cycle-row">
          {(["monthly", "quarterly", "annual"] as Cycle[]).map((c) => (
            <button
              key={c}
              className={`cp-cycle-btn ${cycle === c ? "cp-cycle-btn--on" : ""}`}
              onClick={() => setCycle(c)}
            >
              {tx(lang, c)}
              {c === "quarterly" && (
                <span className="cp-cycle-discount">{tx(lang, "discount_q")}</span>
              )}
              {c === "annual" && (
                <span className="cp-cycle-discount">{tx(lang, "discount_a")}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Plan header cards ── */}
        <div className="cp-plan-cards">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`cp-plan-card ${p.highlighted ? "cp-plan-card--pop" : ""}`}
              style={{ borderTopColor: p.color }}
            >
              {p.highlighted && (
                <span className="cp-plan-card__badge">{tx(lang, "popular")}</span>
              )}
              <div
                className="cp-plan-card__icon"
                style={{ background: `${p.color}12`, color: p.color }}
              >
                {PLAN_ICONS[p.id]}
              </div>
              <span className="cp-plan-card__name">{p.name}</span>
              <span
                className="cp-plan-card__price"
                style={{ color: p.highlighted ? p.color : undefined }}
              >
                {formatPrice(p.monthlyPrice, cycle, lang)}
              </span>
              {cycle !== "monthly" && p.monthlyPrice > 0 && (
                <span className="cp-plan-card__equiv">
                  {(() => {
                    const discount = cycle === "quarterly" ? 0.9 : 0.8;
                    const equiv = p.monthlyPrice * discount;
                    return `€${equiv.toFixed(2).replace(".", ",")}${tx(lang, "per_month")}`;
                  })()}
                </span>
              )}
              <p className="cp-plan-card__desc">{tx(lang, DESC_KEYS[p.id])}</p>
              <button
                className={`cp-plan-card__cta ${p.highlighted ? "cp-plan-card__cta--pop" : ""}`}
                style={{ background: p.highlighted ? p.color : undefined }}
                onClick={() =>
                  p.id === "elite"
                    ? window.open("mailto:hello@peakaerobic.com", "_blank")
                    : navigate(`/login?plan=${p.id}`)
                }
              >
                {ctaLabel(p, lang)}
              </button>
            </div>
          ))}
        </div>

        {/* ── Comparison table ── */}
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead>
              <tr>
                <th className="cp-th-feature" />
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    className={`cp-th-plan ${p.highlighted ? "cp-th-plan--pop" : ""}`}
                  >
                    <span className="cp-th-dot" style={{ background: p.color }} />
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <React.Fragment key={`cat-${g.cat}`}>
                  <tr className="cp-cat-row">
                    <td className="cp-cat-cell">{catLabel(g.cat, lang)}</td>
                    {PLANS.map((p) => (
                      <td
                        key={p.id}
                        className={`cp-cat-cell-plan ${p.highlighted ? "cp-cat-cell-plan--pop" : ""}`}
                      />
                    ))}
                  </tr>
                  {g.rows.map((f) => (
                    <tr key={f.key} className="cp-feature-row">
                      <td className="cp-feature-name">{tx(lang, f.key)}</td>
                      {PLANS.map((p) => (
                        <td
                          key={p.id}
                          className={`cp-val ${p.highlighted ? "cp-val--pop" : ""}`}
                        >
                          {renderCell(f.values[p.id] || D, p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer (matches landing) ── */}
      <footer className="lp-foot">
        <div className="lp-w lp-foot__inner">
          <span className="lp-foot__brand">PeakAerobic</span>
          <span className="lp-foot__line">{tx(lang, "foot_tagline")}</span>
          <div className="lp-foot__links">
            <a href="/privacy" className="lp-foot__link">{tx(lang, "foot_privacy")}</a>
            <a
              href="/compare-plans"
              className="lp-foot__link"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              {tx(lang, "foot_compare")}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── export with LangProvider ─── */
export function ComparePlansPage() {
  return (
    <LangProvider>
      <ComparePlansInner />
    </LangProvider>
  );
}
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
      <text x="444" y="75" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk" className={`lp-hcurve__tag ${on ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.7s" }}>Confidence: 0.87</text>
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

/* ══════════════════════════════════════════
   Inner landing (has access to useLang)
   ══════════════════════════════════════════ */
function LandingInner() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);


  async function handleBeta(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await api.betaSignup(email.trim());
      setSubmitted(true);
    } catch {
      // Fallback to localStorage if API is unavailable
      const list = JSON.parse(localStorage.getItem("pa-beta-signups") || "[]");
      list.push({ email: email.trim(), ts: new Date().toISOString() });
      localStorage.setItem("pa-beta-signups", JSON.stringify(list));
      setSubmitted(true);
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
            <a href="/athlete" className="lp-nav__link">{t("nav_athlete")}</a>
            <a href="/coach" className="lp-nav__link">{t("nav_coach")}</a>
            <a href="#pricing" className="lp-nav__link">{t("nav_pricing")}</a>
            <a href="/resources" className="lp-nav__link">{t("foot_resources")}</a>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══ HERO — Tesla/Apple style ══ */}
      <section className="lp-hero">
        <img src="/foto-inicio-v3.jpg" alt="" className="lp-hero__img" />
        <div className="lp-hero__overlay" />
        <div className="lp-hero__content">
          <h1 className="lp-hero__h1">
            {t("hero_h1_1")}<br />
            <em>{t("hero_h1_3")}</em>{t("hero_h1_4")}
          </h1>
          <p className="lp-hero__sub">{t("hero_sub")}</p>
          <div className="lp-hero__acts">
            <a href="#athlete-portal" className="lp-btn-solid lp-btn--hero">{t("hero_cta_athlete")}</a>
            <a href="#demo" className="lp-btn-ghost lp-btn--hero-ghost">{t("hero_cta")}</a>
          </div>
        </div>
      </section>

      {/* ══ UPGRADE — Pro+ / Elite marketing ══ */}
      <AnimSection>
        <section className="lp-section lp-section--dark lp-upgrade" id="upgrade">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{t("up_ey")}</p>
            <h2 className="lp-h2 lp-h2--light">{t("up_h2")}</h2>
            <p className="lp-sub lp-sub--light">{t("up_sub")}</p>

            {/* Pain points */}
            <div className="lp-upgrade__pains">
              {(["1","2","3"] as const).map(n => (
                <div key={n} className={`lp-upgrade__pain lp-upgrade__pain--${n}`}>
                  <div className="lp-upgrade__pain-icon">
                    {n === "1" && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M12 2v10l4 4"/><circle cx="12" cy="12" r="10"/></svg>}
                    {n === "2" && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>}
                    {n === "3" && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                  </div>
                  <h3 className="lp-upgrade__pain-title">{t(`up_pain_${n}_title`)}</h3>
                  <p className="lp-upgrade__pain-text">{t(`up_pain_${n}_text`)}</p>
                </div>
              ))}
            </div>

            {/* Hook callout */}
            <div className="lp-upgrade__hook">
              <span className="lp-upgrade__hook-text">{t("up_hook")}</span>
            </div>

            {/* Stats bar */}
            <div className="lp-upgrade__stats">
              {(["1","2","3"] as const).map(n => (
                <div key={n} className="lp-upgrade__stat">
                  <span className="lp-upgrade__stat-val">{t(`up_stat_${n}`)}</span>
                  <span className="lp-upgrade__stat-label">{t(`up_stat_${n}_label`)}</span>
                </div>
              ))}
            </div>
            <p className="lp-upgrade__stat-note">{t("up_stat_note")}</p>

            {/* Two plans side by side */}
            <div className="lp-upgrade__plans">
              {/* Pro+ */}
              <div className="lp-upgrade__plan lp-upgrade__plan--proplus">
                <span className="lp-upgrade__plan-badge">Pro+</span>
                <h3 className="lp-upgrade__plan-title">{t("up_proplus_title")}</h3>
                <p className="lp-upgrade__plan-desc">{t("up_proplus_desc")}</p>
                <ul className="lp-upgrade__plan-list">
                  {(["up_proplus_b1","up_proplus_b2","up_proplus_b3","up_proplus_b4"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--coach lp-upgrade__cta" onClick={() => navigate("/register")} type="button">{t("up_proplus_cta")}</button>
              </div>

              {/* Elite */}
              <div className="lp-upgrade__plan lp-upgrade__plan--elite">
                <span className="lp-upgrade__plan-badge lp-upgrade__plan-badge--elite">Elite</span>
                <h3 className="lp-upgrade__plan-title">{t("up_elite_title")}</h3>
                <p className="lp-upgrade__plan-desc">{t("up_elite_desc")}</p>
                <ul className="lp-upgrade__plan-list">
                  {(["up_elite_b1","up_elite_b2","up_elite_b3","up_elite_b4"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a44c" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--elite lp-upgrade__cta" onClick={() => navigate("/register")} type="button">{t("up_elite_cta")}</button>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ INTERACTIVE DEMO ══ */}
      <LactateDemo />

      {/* ══ RACE PREDICTIONS (warm bg) ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="prediccion">
          <div className="lp-w">
            <p className="lp-ey">{t("pred_ey")}</p>
            <h2 className="lp-h2">{t("pred_h2")}</h2>
            <p className="lp-sub" style={{ textAlign: "center" }}>{t("pred_sub")}</p>
            <div className="lp-predictions">
              {[
                { dist: "5K", time: "19:42", range: "19:12 -- 20:15" },
                { dist: "10K", time: "41:08", range: "40:05 -- 42:20" },
                { dist: t("pred_hm"), time: "1:31:24", range: "1:28:50 -- 1:34:10" },
                { dist: t("pred_marathon"), time: "3:12:40", range: "3:06:00 -- 3:20:00" },
              ].map((p) => (
                <div key={p.dist} className="lp-pred">
                  <span className="lp-pred__dist">{p.dist}</span>
                  <span className="lp-pred__time">{p.time}</span>
                  <span className="lp-pred__range">{p.range}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ FEATURE SHOWCASE — alternating photo sections ══ */}
      <AnimSection>
        <section className="lp-section" id="features">
          <div className="lp-w">
            <p className="lp-ey">{t("feat_ey")}</p>
            <h2 className="lp-h2">{t("feat_h2")}</h2>
          </div>
        </section>
      </AnimSection>

      {/* Feature 1 — Threshold detection */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">01</span>
              <h3 className="lp-showcase__title">{t("feat_1_title")}</h3>
              <p className="lp-showcase__desc">{t("feat_1_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("feat_1_b1")}</li>
                <li>{t("feat_1_b2")}</li>
                <li>{t("feat_1_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                {/* Lactate curve with LT1/LT2 markers — hi-fi mockup */}
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">Análisis de lactato — Running</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <svg viewBox="0 0 400 180" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <linearGradient id="sc1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d26a36" stopOpacity=".12" /><stop offset="100%" stopColor="#d26a36" stopOpacity="0" /></linearGradient>
                    </defs>
                    {[30,60,90,120,150].map(y => <line key={y} x1="40" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth=".5" />)}
                    <path d="M50 155 C80 153, 120 148, 170 140 C220 125, 260 100, 300 65 C330 40, 350 22, 370 15 L370 160 L50 160 Z" fill="url(#sc1)" />
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
                    {/* Confidence badge */}
                    <rect x="310" y="50" width="72" height="20" rx="6" fill="#0e1e24" opacity=".9" />
                    <text x="346" y="63" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Conf: 0.87</text>
                    {/* Axis labels */}
                    <text x="36" y="155" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">1</text>
                    <text x="36" y="120" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">2</text>
                    <text x="36" y="90" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">4</text>
                    <text x="36" y="60" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">6</text>
                    <text x="36" y="30" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">8</text>
                    <text x="210" y="176" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">mmol/L</text>
                  </svg>
                  <div className="lp-showcase__screen-footer">
                    <span className="lp-showcase__badge lp-showcase__badge--green">LT1: 5:12/km</span>
                    <span className="lp-showcase__badge lp-showcase__badge--orange">LT2: 4:24/km</span>
                    <span className="lp-showcase__badge lp-showcase__badge--dark">Confianza: 0.87</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* Feature 2 — Dynamic tracking (reversed) */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">02</span>
              <h3 className="lp-showcase__title">{t("feat_2_title")}</h3>
              <p className="lp-showcase__desc">{t("feat_2_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("feat_2_b1")}</li>
                <li>{t("feat_2_b2")}</li>
                <li>{t("feat_2_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">Evolución LT2 — 6 meses</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <svg viewBox="0 0 400 160" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                    {[40,70,100,130].map(y => <line key={y} x1="40" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth=".5" />)}
                    {/* LT2 trend */}
                    <path d="M60 130 L110 124 L160 116 L210 108 L260 98 L310 88 L360 76" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
                    {[60,110,160,210,260,310,360].map((x,i) => <circle key={i} cx={x} cy={130-i*9} r="5" fill="#fff" stroke="#f97316" strokeWidth="2" />)}
                    {/* LT1 trend */}
                    <path d="M60 140 L110 136 L160 132 L210 127 L260 122 L310 117 L360 110" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" opacity=".7" />
                    {[60,110,160,210,260,310,360].map((x,i) => <circle key={`lt1-${i}`} cx={x} cy={140-i*4.3} r="3.5" fill="#fff" stroke="#22c55e" strokeWidth="1.5" />)}
                    {/* Month labels */}
                    {["Oct","Nov","Dic","Ene","Feb","Mar","Abr"].map((m,i) => (
                      <text key={m} x={60+i*50} y="155" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">{m}</text>
                    ))}
                    {/* Legend */}
                    <circle cx="310" cy="30" r="4" fill="#f97316" /><text x="318" y="34" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">LT2</text>
                    <circle cx="345" cy="30" r="4" fill="#22c55e" /><text x="353" y="34" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">LT1</text>
                  </svg>
                  <div className="lp-showcase__screen-footer">
                    <span className="lp-showcase__badge lp-showcase__badge--orange">LT2: 4:24 → 4:08/km</span>
                    <span className="lp-showcase__badge lp-showcase__badge--green">-16s en 6 meses</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* Feature 3 — Planning engine */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">03</span>
              <h3 className="lp-showcase__title">{t("feat_3_title")}</h3>
              <p className="lp-showcase__desc">{t("feat_3_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("feat_3_b1")}</li>
                <li>{t("feat_3_b2")}</li>
                <li>{t("feat_3_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">Planificación — Semana 2/4</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <div className="lp-showcase__calendar">
                    <div className="lp-showcase__cal-header">
                      {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
                        <span key={d} className="lp-showcase__cal-day-label">{d}</span>
                      ))}
                    </div>
                    <div className="lp-showcase__cal-grid">
                      {[
                        { type: "rest", label: "Descanso" },
                        { type: "key", label: "4×6' intervalos", badge: "CALIDAD" },
                        { type: "easy", label: "40' rodaje suave" },
                        { type: "rest", label: "Descanso" },
                        { type: "key", label: "5×4' ritmo fuerte", badge: "CALIDAD" },
                        { type: "long", label: "1h30 tirada larga", badge: "LARGO" },
                        { type: "rest", label: "Descanso" },
                      ].map((d, i) => (
                        <div key={i} className={`lp-showcase__cal-cell lp-showcase__cal-cell--${d.type}`}>
                          {d.badge && <span className={`lp-showcase__cal-badge lp-showcase__cal-badge--${d.type}`}>{d.badge}</span>}
                          <span className="lp-showcase__cal-label">{d.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="lp-showcase__cal-meta">
                      <span className="lp-showcase__badge lp-showcase__badge--dark">Base aeróbica</span>
                      <span className="lp-showcase__badge lp-showcase__badge--orange">Semana de carga</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* Feature 4 — Race predictions & Garmin (reversed) */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">04</span>
              <h3 className="lp-showcase__title">{t("feat_4_title")}</h3>
              <p className="lp-showcase__desc">{t("feat_4_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("feat_4_b1")}</li>
                <li>{t("feat_4_b2")}</li>
                <li>{t("feat_4_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">Predicciones — Running</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <div className="lp-showcase__predictions">
                    {[
                      { dist: "5K", time: "19:42", pace: "3:56/km" },
                      { dist: "10K", time: "41:08", pace: "4:07/km" },
                      { dist: "Half", time: "1:31:24", pace: "4:20/km" },
                      { dist: "Marathon", time: "3:12:40", pace: "4:34/km" },
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

      {/* Feature 5 — Training Load CTL/ATL/TSB */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">05</span>
              <h3 className="lp-showcase__title">{t("feat_5_title")}</h3>
              <p className="lp-showcase__desc">{t("feat_5_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("feat_5_b1")}</li>
                <li>{t("feat_5_b2")}</li>
                <li>{t("feat_5_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">Training Load — 90 days</span>
                </div>
                <div className="lp-showcase__screen-body">
                  <div className="lp-showcase__kpi-row">
                    <div className="lp-showcase__kpi">
                      <span className="lp-showcase__kpi-label">CTL</span>
                      <span className="lp-showcase__kpi-val" style={{color:"#22c55e"}}>62</span>
                    </div>
                    <div className="lp-showcase__kpi">
                      <span className="lp-showcase__kpi-label">ATL</span>
                      <span className="lp-showcase__kpi-val" style={{color:"#ef4444"}}>78</span>
                    </div>
                    <div className="lp-showcase__kpi">
                      <span className="lp-showcase__kpi-label">TSB</span>
                      <span className="lp-showcase__kpi-val" style={{color:"#3b82f6"}}>-16</span>
                    </div>
                    <div className="lp-showcase__kpi">
                      <span className="lp-showcase__kpi-label">A:C</span>
                      <span className="lp-showcase__kpi-val" style={{color:"#f59e0b"}}>1.26</span>
                    </div>
                  </div>
                  <svg viewBox="0 0 400 140" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                    {[30,55,80,105,130].map(y => <line key={y} x1="40" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth=".5" />)}
                    {[42,56,35,68,0,82,45,60,48,72,0,55,65,40,78,50,0,90,48,62,38,85,0,70,55,48,75,60,0,88].map((v, i) => (
                      <rect key={i} x={44 + i * 11.2} y={130 - v * 0.9} width="7" height={v * 0.9} rx="1.5" fill="#d26a36" opacity={v === 0 ? 0 : 0.2} />
                    ))}
                    <path d="M50 115 C80 112, 110 108, 140 103 C170 98, 200 93, 230 88 C260 82, 290 78, 320 74 C340 71, 360 69, 375 67" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M50 110 C70 95, 90 108, 110 85 C130 100, 150 78, 170 90 C190 72, 210 88, 230 65 C250 80, 270 60, 290 70 C310 55, 330 62, 350 48 C360 52, 370 45, 375 42" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" opacity=".85" />
                    <path d="M50 105 C80 100, 110 106, 140 95 C170 102, 200 90, 230 96 C260 88, 290 92, 320 85 C340 88, 360 82, 375 80" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="5 3" opacity=".7" />
                    {["Ene","Feb","Mar"].map((m,i) => (
                      <text key={m} x={90 + i * 120} y="140" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">{m}</text>
                    ))}
                    <line x1="270" y1="18" x2="284" y2="18" stroke="#22c55e" strokeWidth="2" />
                    <text x="288" y="22" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk">CTL</text>
                    <line x1="310" y1="18" x2="324" y2="18" stroke="#ef4444" strokeWidth="2" />
                    <text x="328" y="22" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk">ATL</text>
                    <line x1="348" y1="18" x2="362" y2="18" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3 2" />
                    <text x="366" y="22" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk">TSB</text>
                  </svg>
                  <div className="lp-showcase__screen-footer">
                    <span className="lp-showcase__badge lp-showcase__badge--green">Fitness: +18 en 90d</span>
                    <span className="lp-showcase__badge lp-showcase__badge--orange">ACWR: 1.26 — Zona alta</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* Feature 6 — VO2max & Metabolic Profile (reversed) */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">06</span>
              <h3 className="lp-showcase__title">{t("feat_6_title")}</h3>
              <p className="lp-showcase__desc">{t("feat_6_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("feat_6_b1")}</li>
                <li>{t("feat_6_b2")}</li>
                <li>{t("feat_6_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <div className="lp-showcase__screen">
                <div className="lp-showcase__screen-bar">
                  <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
                  <span className="lp-showcase__screen-title">Capacity Profile — Running</span>
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
                    <text x="50" y="28" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk" fontWeight="600">Aerobic</text>
                    <rect x="120" y="18" width="240" height="16" rx="4" fill="#e5e7eb" opacity=".5" />
                    <rect x="120" y="18" width="192" height="16" rx="4" fill="#22c55e" opacity=".7" />
                    <text x="318" y="30" fill="#22c55e" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">HIGH</text>
                    <text x="50" y="56" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk" fontWeight="600">Glycolytic</text>
                    <rect x="120" y="46" width="240" height="16" rx="4" fill="#e5e7eb" opacity=".5" />
                    <rect x="120" y="46" width="120" height="16" rx="4" fill="#8b5cf6" opacity=".6" />
                    <text x="246" y="58" fill="#8b5cf6" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">MODERATE</text>
                    <text x="50" y="84" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk" fontWeight="600">LT1/LT2</text>
                    <rect x="120" y="74" width="240" height="16" rx="4" fill="#e5e7eb" opacity=".5" />
                    <rect x="120" y="74" width="204" height="16" rx="4" fill="#f59e0b" opacity=".6" />
                    <text x="330" y="86" fill="#f59e0b" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">0.85</text>
                    <rect x="130" y="98" width="140" height="20" rx="6" fill="#0e1e24" opacity=".9" />
                    <text x="200" y="112" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Diesel — Long distance</text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ PRESCRIPTION ══ */}
      <AnimSection>
        <section className="lp-section" id="prescripcion">
          <div className="lp-w lp-split lp-split--reverse">
            <div className="lp-split__text">
              <p className="lp-ey">{t("rx_ey")}</p>
              <h2 className="lp-h2">{t("rx_h2")}</h2>
              <p className="lp-sub">{t("rx_sub")}</p>
              <ul className="lp-checks">
                <li>{t("rx_b1")} — {t("rx_b1w")}</li>
                <li>{t("rx_b2")} — {t("rx_b2w")}</li>
                <li>{t("rx_b3")} — {t("rx_b3w")}</li>
              </ul>
            </div>
            <div className="lp-split__visual">
              <div className="lp-gap-demo">
                <p className="lp-gap-demo__title">{t("rx_gap_title")}</p>
                <div className="lp-gap-demo__row">
                  <span className="lp-gap-demo__label">{t("rx_gap_current")}</span>
                  <div className="lp-gap-demo__bar" style={{ width: "68%" }} />
                  <span className="lp-gap-demo__val">4:24/km</span>
                </div>
                <div className="lp-gap-demo__row">
                  <span className="lp-gap-demo__label">{t("rx_gap_target")}</span>
                  <div className="lp-gap-demo__bar lp-gap-demo__bar--target" style={{ width: "80%" }} />
                  <span className="lp-gap-demo__val">4:08/km</span>
                </div>
                <div className="lp-gap-demo__gap">{t("rx_gap_result")} <strong>{t("rx_gap_block")}</strong></div>
                <div className="lp-gap-demo__dose">{t("rx_gap_dose")}</div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ SOCIAL PROOF ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="proof">
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

      {/* ══ PRICING ══ */}
      <AnimSection>
        <section className="lp-section" id="pricing">
          <div className="lp-w">
            <p className="lp-ey">{t("price_ey")}</p>
            <h2 className="lp-h2">{t("price_h2")}</h2>
            <p className="lp-sub">{t("price_sub")}</p>

            <div className="lp-pricing__grid lp-pricing__grid--four">
              {/* Starter (Free) */}
              <div className="lp-pricing__card">
                <span className="lp-pricing__plan-name">{t("price_free_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_free_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
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
                <button className="lp-btn-solid lp-pricing__cta" onClick={() => navigate("/register")} type="button">{t("price_free_cta")}</button>
              </div>

              {/* Pro */}
              <div className="lp-pricing__card lp-pricing__card--pro">
                <span className="lp-pricing__plan-name">{t("price_pro_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_pro_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_pro_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_pro_f1","price_pro_f2","price_pro_f3","price_pro_f4","price_pro_f5","price_pro_f6"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--coach lp-pricing__cta" onClick={() => navigate("/register")} type="button">{t("price_pro_cta")}</button>
              </div>

              {/* Pro+ */}
              <div className="lp-pricing__card lp-pricing__card--proplus">
                <span className="lp-pricing__plan-name">{t("price_proplus_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_proplus_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_proplus_desc")}</p>
                <span className="lp-pricing__pack-note">{t("price_proplus_pack")}</span>
                <ul className="lp-pricing__features">
                  {(["price_proplus_f1","price_proplus_f2","price_proplus_f3","price_proplus_f4","price_proplus_f5","price_proplus_f6"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--proplus lp-pricing__cta" onClick={() => navigate("/register")} type="button">{t("price_proplus_cta")}</button>
              </div>

              {/* Elite */}
              <div className="lp-pricing__card lp-pricing__card--elite">
                <span className="lp-pricing__badge-elite">{t("price_elite_badge")}</span>
                <span className="lp-pricing__plan-name">{t("price_elite_name")}</span>
                <div className="lp-pricing__price">
                  <span className="lp-pricing__amount">{t("price_elite_amount")}</span>
                  <span className="lp-pricing__period">/{t("price_period")}</span>
                </div>
                <p className="lp-pricing__plan-desc">{t("price_elite_desc")}</p>
                <ul className="lp-pricing__features">
                  {(["price_elite_f1","price_elite_f2","price_elite_f3","price_elite_f4","price_elite_f5","price_elite_f6"] as const).map(k => (
                    <li key={k}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a44c" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <button className="lp-btn-solid lp-btn--elite lp-pricing__cta" onClick={() => navigate("/register")} type="button">{t("price_elite_cta")}</button>
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <a href="/compare-plans" className="lp-btn-ghost" style={{ fontSize: 15 }}>{t("price_compare")}</a>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ SPORT COVERAGE ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="sports">
          <div className="lp-w">
            <p className="lp-ey">{t("sport_ey")}</p>
            <h2 className="lp-h2">{t("sport_h2")}</h2>
            <div className="lp-sports__grid">
              {[
                { icon: <IconRun />, title: t("sport_run_title"), events: t("sport_run_events"), desc: t("sport_run_desc") },
                { icon: <IconBike />, title: t("sport_bike_title"), events: t("sport_bike_events"), desc: t("sport_bike_desc") },
                { icon: <IconSwim />, title: t("sport_swim_title"), events: t("sport_swim_events"), desc: t("sport_swim_desc") },
                { icon: <IconTri />, title: t("sport_tri_title"), events: t("sport_tri_events"), desc: t("sport_tri_desc") },
              ].map((s, i) => (
                <div key={i} className="lp-sports__card">
                  <div className="lp-sports__icon">{s.icon}</div>
                  <h3 className="lp-sports__title">{s.title}</h3>
                  <span className="lp-sports__events">{s.events}</span>
                  <p className="lp-sports__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ ATHLETE PORTAL ══ */}
      <AnimSection>
        <section className="lp-section lp-section--dark" id="athlete-portal">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{t("ap_ey")}</p>
            <h2 className="lp-h2 lp-h2--light">{t("ap_h2")}</h2>
            <p className="lp-sub lp-sub--light">{t("ap_sub")}</p>

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
                      <span className="lp-app-frame__card-title">{t("ap_today_title")}</span>
                      <span className="lp-app-frame__card-phase">Base — Sem 2/4</span>
                    </div>
                    <div className="lp-app-frame__session">
                      <span className="lp-app-frame__badge">CALIDAD</span>
                      <span className="lp-app-frame__workout-name">4x6{"'"} LT2 cruise intervals</span>
                    </div>
                    <div className="lp-app-frame__session-meta">
                      <span>Zona LT2</span><span>52 min</span><span>TSS 68</span>
                    </div>
                    <div className="lp-app-frame__steps">
                      {[
                        { label: "Calentamiento", dur: "15'", zone: "Z1-Z2", color: "#22c55e" },
                        { label: "4x6' LT2", dur: "24'", zone: "LT2", color: "#F59E0B" },
                        { label: "Rec 3'", dur: "12'", zone: "Z1", color: "#10B981" },
                        { label: "Vuelta calma", dur: "10'", zone: "Z1", color: "#22c55e" },
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
                          { val: "6.8h", lbl: "Sleep" },
                          { val: "48ms", lbl: "HRV" },
                          { val: "28", lbl: "Stress" },
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
                      <span className="lp-app-frame__card-title">{t("ap_zones_title")}</span>
                      <span className="lp-app-frame__card-phase">Running</span>
                    </div>
                    <div className="lp-app-frame__zones">
                      <div className="lp-app-frame__zones-header">
                        <span></span><span></span><span>FC</span><span>Ritmo</span>
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
                      <span className="lp-app-frame__card-title">{t("ap_progress_title")}</span>
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
                      <span style={{color:"rgba(255,255,255,0.4)"}}>-14s en 6 meses</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lp-app-frame__bottomnav">
                {[
                  { id: "today", label: "Hoy", active: true, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                  { id: "week", label: "Semana", active: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
                  { id: "progress", label: "Progreso", active: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
                  { id: "recovery", label: "Recuperaci\u00f3n", active: false, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> },
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

      {/* ══ PHONE MOCKUP ══ */}
      <AnimSection>
        <section className="lp-section">
          <div className="lp-w">
            <div className="lp-phone-section">
              <div className="lp-phone-section__text">
                <h2 className="lp-phone-section__title">{t("phone_h2")}</h2>
                <p className="lp-phone-section__desc">{t("phone_sub")}</p>
                <div className="lp-phone-section__badges">
                  <span className="lp-showcase__badge lp-showcase__badge--green">{t("phone_b1")}</span>
                  <span className="lp-showcase__badge lp-showcase__badge--orange">{t("phone_b2")}</span>
                  <span className="lp-showcase__badge lp-showcase__badge--dark">{t("phone_b3")}</span>
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
                    <span className="lp-phone__card-title">{t("phone_session_title")}</span>
                    <span className="lp-phone__badge">LT2</span>
                    <span className="lp-phone__workout-name">4x6{"'"} LT2 cruise intervals</span>
                    <div className="lp-phone__steps">
                      {[
                        { label: t("phone_warmup"), dur: "15'", color: "#22c55e" },
                        { label: "4x6' LT2", dur: "24'", color: "#F59E0B" },
                        { label: "Rec 3'", dur: "12'", color: "#10B981" },
                        { label: t("phone_cooldown"), dur: "10'", color: "#22c55e" },
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
                    <span className="lp-phone__card-title">{t("phone_readiness_title")}</span>
                    <div className="lp-phone__wellness">
                      <svg viewBox="0 0 56 56" width="48" height="48">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray="100 138" strokeLinecap="round" transform="rotate(-90 28 28)" />
                        <text x="28" y="32" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="Space Grotesk">72</text>
                      </svg>
                      <div className="lp-phone__wellness-grid">
                        <div className="lp-phone__wellness-item"><span className="lp-phone__wellness-val">48ms</span><span className="lp-phone__wellness-lbl">HRV</span></div>
                        <div className="lp-phone__wellness-item"><span className="lp-phone__wellness-val">6.8h</span><span className="lp-phone__wellness-lbl">{t("phone_sleep")}</span></div>
                        <div className="lp-phone__wellness-item"><span className="lp-phone__wellness-val">28</span><span className="lp-phone__wellness-lbl">{t("phone_stress")}</span></div>
                        <div className="lp-phone__wellness-item"><span className="lp-phone__wellness-val">74%</span><span className="lp-phone__wellness-lbl">Battery</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="lp-phone__nav">
                    <div className="lp-phone__nav-item lp-phone__nav-item--active">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {t("phone_nav_today")}
                    </div>
                    <div className="lp-phone__nav-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {t("phone_nav_week")}
                    </div>
                    <div className="lp-phone__nav-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                      {t("phone_nav_progress")}
                    </div>
                    <div className="lp-phone__nav-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                      {t("phone_nav_recovery")}
                    </div>
                  </div>
                </div>
                <div className="lp-phone__bar" />
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ FAQ ══ */}
      <AnimSection>
        <section className="lp-section" id="faq">
          <div className="lp-w">
            <p className="lp-ey">{t("faq_ey")}</p>
            <h2 className="lp-h2">{t("faq_h2")}</h2>
            <div className="lp-faq__list">
              {(["1","2","3","4","5","6"] as const).map(n => (
                <details key={n} className="lp-faq__item">
                  <summary className="lp-faq__q">{t(`faq_q${n}`)}</summary>
                  <p className="lp-faq__a">{t(`faq_a${n}`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ CTA ══ */}
      <section className="lp-cta-section" id="acceso">
        <div className="lp-w lp-cta-section__inner">
          <h2 className="lp-h2">{t("cta_h2")}</h2>
          <p className="lp-sub">{t("cta_sub")}</p>
          {submitted ? (
            <div className="lp-done">{t("cta_done")}</div>
          ) : (
            <form className="lp-form" onSubmit={handleBeta}>
              <input type="email" className="lp-form__input" placeholder={t("cta_placeholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
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
          <a href="/resources" className="lp-foot__link">{t("foot_resources")}</a>
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

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
  const [activeAthleteTab, setActiveAthleteTab] = useState(0);
  const [activeCoachTab, setActiveCoachTab] = useState(0);

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

  const athleteTabs = [
    { key: "today", icon: <IconPlan />, title: t("ap_today_title"), desc: t("ap_today_desc") },
    { key: "week", icon: <IconWorkout />, title: t("ap_week_title"), desc: t("ap_week_desc") },
    { key: "progress", icon: <IconDynamic />, title: t("ap_progress_title"), desc: t("ap_progress_desc") },
    { key: "recovery", icon: <IconRecovery />, title: t("ap_recovery_title"), desc: t("ap_recovery_desc") },
    { key: "garmin", icon: <IconGarmin />, title: t("ap_garmin_title"), desc: t("ap_garmin_desc") },
  ];

  const coachTabs = [
    { key: "dashboard", icon: <IconCoachDash />, title: t("cp_dash_title"), desc: t("cp_dash_desc") },
    { key: "analysis", icon: <IconCurve />, title: t("cp_analysis_title"), desc: t("cp_analysis_desc") },
    { key: "planning", icon: <IconPlan />, title: t("cp_planning_title"), desc: t("cp_planning_desc") },
    { key: "library", icon: <IconWorkout />, title: t("cp_library_title"), desc: t("cp_library_desc") },
    { key: "advisor", icon: <IconScience />, title: t("cp_advisor_title"), desc: t("cp_advisor_desc") },
  ];

  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand">PeakAerobic</span>
          <div className="lp-nav__right">
            <a href="#demo" className="lp-nav__link">{t("nav_demo")}</a>
            <a href="#athlete-portal" className="lp-nav__link">{t("nav_athlete")}</a>
            <a href="#coach-portal" className="lp-nav__link">{t("nav_coach")}</a>
            <a href="#motor" className="lp-nav__link">{t("nav_science")}</a>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section className="lp-hero">
        <div className="lp-hero__overlay" />
        <div className="lp-w lp-hero__grid">
          <div className="lp-hero__left">
            <p className="lp-hero__kicker">{t("hero_kicker")}</p>
            <span className="lp-hero__badge">{t("hero_badge")}</span>
            <h1 className="lp-hero__h1">
              {t("hero_h1_1")}<br />
              {t("hero_h1_2")}<br />
              <em>{t("hero_h1_3")}</em> {t("hero_h1_4")}
            </h1>
            <p className="lp-hero__sub">{t("hero_sub")}</p>
            <div className="lp-hero__acts">
              <a href="#demo" className="lp-btn-solid">{t("hero_cta")}</a>
              <a href="#motor" className="lp-btn-ghost">{t("hero_cta2")}</a>
            </div>
            <div className="lp-hero__proof">
              <div className="lp-hero__proof-item">
                <span className="lp-hero__proof-val">3</span>
                <span className="lp-hero__proof-label">{t("hero_proof_methods")}</span>
              </div>
              <div className="lp-hero__proof-sep" />
              <div className="lp-hero__proof-item">
                <span className="lp-hero__proof-val">3</span>
                <span className="lp-hero__proof-label">{t("hero_proof_blocks")}</span>
              </div>
              <div className="lp-hero__proof-sep" />
              <div className="lp-hero__proof-item">
                <span className="lp-hero__proof-val">0.25-0.95</span>
                <span className="lp-hero__proof-label">{t("hero_proof_confidence")}</span>
              </div>
            </div>
          </div>
          <div className="lp-hero__right">
            <HeroCurve />
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <AnimSection>
        <section className="lp-section lp-how" id="how">
          <div className="lp-w">
            <p className="lp-ey">{t("how_ey")}</p>
            <h2 className="lp-h2">{t("how_h2")}</h2>
            <div className="lp-how__steps">
              {[
                { num: "1", title: t("how_s1_title"), desc: t("how_s1_desc") },
                { num: "2", title: t("how_s2_title"), desc: t("how_s2_desc") },
                { num: "3", title: t("how_s3_title"), desc: t("how_s3_desc") },
              ].map((s) => (
                <div key={s.num} className="lp-how__step">
                  <span className="lp-how__num">{s.num}</span>
                  <h3 className="lp-how__step-title">{s.title}</h3>
                  <p className="lp-how__step-desc">{s.desc}</p>
                </div>
              ))}
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
            <p className="lp-sub">{t("pred_sub")}</p>
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
            <p className="lp-pred__inputs">{t("pred_inputs")}</p>
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

      {/* ══ ATHLETE PORTAL ══ */}
      <AnimSection>
        <section className="lp-section lp-section--dark" id="athlete-portal">
          <div className="lp-w">
            <p className="lp-ey lp-ey--light">{t("ap_ey")}</p>
            <h2 className="lp-h2 lp-h2--light">{t("ap_h2")}</h2>
            <p className="lp-sub lp-sub--light">{t("ap_sub")}</p>

            <div className="lp-portal">
              <div className="lp-portal__tabs">
                {athleteTabs.map((tab, i) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`lp-portal__tab ${i === activeAthleteTab ? "lp-portal__tab--on" : ""}`}
                    onClick={() => setActiveAthleteTab(i)}
                  >
                    {tab.icon}
                    <span className="lp-portal__tab-title">{tab.title}</span>
                  </button>
                ))}
              </div>
              <div className="lp-portal__content">
                <div className="lp-portal__card">
                  <div className="lp-portal__card-icon">{athleteTabs[activeAthleteTab].icon}</div>
                  <h3 className="lp-portal__card-title">{athleteTabs[activeAthleteTab].title}</h3>
                  <p className="lp-portal__card-desc">{athleteTabs[activeAthleteTab].desc}</p>
                </div>
                <div className="lp-portal__mockup lp-portal__mockup--athlete" data-tab={athleteTabs[activeAthleteTab].key}>
                  <AthleteTabMockup tab={athleteTabs[activeAthleteTab].key} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ COACH PORTAL ══ */}
      <AnimSection>
        <section className="lp-section" id="coach-portal">
          <div className="lp-w">
            <p className="lp-ey">{t("cp_ey")}</p>
            <h2 className="lp-h2">{t("cp_h2")}</h2>
            <p className="lp-sub">{t("cp_sub")}</p>

            <div className="lp-portal lp-portal--light">
              <div className="lp-portal__tabs lp-portal__tabs--light">
                {coachTabs.map((tab, i) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`lp-portal__tab lp-portal__tab--light ${i === activeCoachTab ? "lp-portal__tab--on lp-portal__tab--light-on" : ""}`}
                    onClick={() => setActiveCoachTab(i)}
                  >
                    {tab.icon}
                    <span className="lp-portal__tab-title">{tab.title}</span>
                  </button>
                ))}
              </div>
              <div className="lp-portal__content">
                <div className="lp-portal__card lp-portal__card--light">
                  <div className="lp-portal__card-icon">{coachTabs[activeCoachTab].icon}</div>
                  <h3 className="lp-portal__card-title lp-portal__card-title--light">{coachTabs[activeCoachTab].title}</h3>
                  <p className="lp-portal__card-desc lp-portal__card-desc--light">{coachTabs[activeCoachTab].desc}</p>
                </div>
                <div className="lp-portal__mockup" data-tab={coachTabs[activeCoachTab].key}>
                  <CoachTabMockup tab={coachTabs[activeCoachTab].key} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ COMPARISON ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="comparativa">
          <div className="lp-w">
            <p className="lp-ey">{t("cmp_ey")}</p>
            <h2 className="lp-h2">{t("cmp_h2")}</h2>
            <p className="lp-sub">{t("cmp_sub")}</p>

            <div className="lp-compare">
              <div className="lp-compare__head">
                <div className="lp-compare__feature" />
                <div className="lp-compare__col lp-compare__col--pa">PeakAerobic</div>
                <div className="lp-compare__col">{t("cmp_others")}</div>
              </div>
              {(["c1","c2","c3","c4","c5","c6","c7"] as const).map((k) => (
                <div key={k} className="lp-compare__row">
                  <div className="lp-compare__feature">{t(`cmp_${k}`)}</div>
                  <div className="lp-compare__col lp-compare__col--pa">
                    <span className="lp-compare__yes" />
                  </div>
                  <div className="lp-compare__col">
                    <span className={`lp-compare__${t(`cmp_${k}_others`) === "partial" ? "partial" : "no"}`} />
                  </div>
                </div>
              ))}
            </div>
            <p className="lp-compare__note">{t("cmp_note")}</p>
          </div>
        </section>
      </AnimSection>

      {/* ══ SCIENCE STRIP ══ */}
      <AnimSection>
        <section className="lp-strip">
          <div className="lp-w">
            <p className="lp-ey" style={{ textAlign: "center" }}>{t("sci_ey")}</p>
            <h2 className="lp-h2" style={{ textAlign: "center" }}>{t("sci_h2")}</h2>
            <p className="lp-sub" style={{ textAlign: "center", margin: "0 auto 40px" }}>{t("sci_sub")}</p>
            <div className="lp-strip__grid">
              {[
                { key: "sci_s1" },
                { key: "sci_s2" },
                { key: "sci_s3" },
              ].map((s) => (
                <div key={s.key} className="lp-strip__item">
                  <span className="lp-strip__detail">{t(s.key)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ BETA CTA ══ */}
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
          <a href="/privacy" className="lp-foot__link">{t("foot_privacy")}</a>
        </div>
      </footer>
    </div>
  );
}

/* ── Athlete Portal tab mockups (SVG/CSS, no external images) ── */
function AthleteTabMockup({ tab }: { tab: string }) {
  if (tab === "today") return (
    <div className="lp-mock">
      <div className="lp-mock__header">
        <div className="lp-mock__dot lp-mock__dot--green" />
        <span className="lp-mock__title">Hoy - Martes 12 Mar</span>
      </div>
      <div className="lp-mock__session">
        <span className="lp-mock__badge lp-mock__badge--key">KEY</span>
        <span className="lp-mock__label">4x6' LT1 + 4x2' LT2</span>
      </div>
      <div className="lp-mock__row">
        <div className="lp-mock__metric"><span className="lp-mock__metric-val">72</span><span className="lp-mock__metric-label">Readiness</span></div>
        <div className="lp-mock__metric"><span className="lp-mock__metric-val">6.8h</span><span className="lp-mock__metric-label">Sleep</span></div>
        <div className="lp-mock__metric"><span className="lp-mock__metric-val">48ms</span><span className="lp-mock__metric-label">HRV</span></div>
      </div>
      <div className="lp-mock__block-tag">Aerobic capacity - Week 2/4</div>
    </div>
  );
  if (tab === "week") return (
    <div className="lp-mock">
      <div className="lp-mock__week-grid">
        {["L","M","X","J","V","S","D"].map((d, i) => (
          <div key={d} className={`lp-mock__day ${i === 1 ? "lp-mock__day--today" : ""}`}>
            <span className="lp-mock__day-label">{d}</span>
            <div className={`lp-mock__day-bar lp-mock__day-bar--${i < 5 ? ["rest","key","easy","rest","long"][i] : "rest"}`} />
          </div>
        ))}
      </div>
      <div className="lp-mock__week-summary">
        <span>RUN 4h 20min</span>
        <span>BIKE 2h 30min</span>
      </div>
    </div>
  );
  if (tab === "progress") return (
    <div className="lp-mock">
      <div className="lp-mock__header">
        <span className="lp-mock__title">LT2 evolution</span>
      </div>
      <svg viewBox="0 0 200 60" className="lp-mock__chart">
        <path d="M10 50 L40 46 L70 42 L100 38 L130 33 L160 28 L190 24" fill="none" stroke="#d26a36" strokeWidth="2" />
        {[10,40,70,100,130,160,190].map((x,i) => <circle key={i} cx={x} cy={50-i*4.3} r="2.5" fill="#fff" stroke="#d26a36" strokeWidth="1.5" />)}
      </svg>
      <div className="lp-mock__row">
        <span className="lp-mock__trend-up">LT2: 4:24/km</span>
        <span className="lp-mock__trend-label">-14s in 8 weeks</span>
      </div>
    </div>
  );
  if (tab === "recovery") return (
    <div className="lp-mock">
      <div className="lp-mock__ring-row">
        <svg viewBox="0 0 60 60" width="60" height="60">
          <circle cx="30" cy="30" r="24" fill="none" stroke="#1a2f38" strokeWidth="4" opacity=".1" />
          <circle cx="30" cy="30" r="24" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray="110 151" strokeLinecap="round" transform="rotate(-90 30 30)" />
          <text x="30" y="34" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700" fontFamily="Space Grotesk">72</text>
        </svg>
        <div className="lp-mock__ring-metrics">
          <div className="lp-mock__mini-metric"><span className="lp-mock__mini-val">48ms</span> HRV</div>
          <div className="lp-mock__mini-metric"><span className="lp-mock__mini-val">6.8h</span> Sleep</div>
          <div className="lp-mock__mini-metric"><span className="lp-mock__mini-val">28</span> Stress</div>
        </div>
      </div>
    </div>
  );
  // garmin
  return (
    <div className="lp-mock">
      <div className="lp-mock__connect-row">
        <div className="lp-mock__connect-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <span className="lp-mock__connect-label">Garmin connected</span>
      </div>
      <div className="lp-mock__metrics-list">
        {["HRV","Resting HR","Sleep","Stress","Body Battery"].map(m => (
          <div key={m} className="lp-mock__metric-toggle">
            <span>{m}</span>
            <span className="lp-mock__toggle-on" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Coach Portal tab mockups ── */
function CoachTabMockup({ tab }: { tab: string }) {
  if (tab === "dashboard") return (
    <div className="lp-mock lp-mock--light">
      <div className="lp-mock__athletes-grid">
        {[
          { name: "Ana G.", lt2: "4:24/km", conf: 0.87, color: "green" },
          { name: "Carlos R.", lt2: "278W", conf: 0.72, color: "orange" },
          { name: "Marta P.", lt2: "4:48/km", conf: 0.91, color: "green" },
        ].map(a => (
          <div key={a.name} className="lp-mock__athlete-card">
            <div className="lp-mock__athlete-name">{a.name}</div>
            <div className="lp-mock__athlete-lt2">LT2: {a.lt2}</div>
            <div className={`lp-mock__athlete-conf lp-mock__athlete-conf--${a.color}`}>{a.conf}</div>
          </div>
        ))}
      </div>
      <div className="lp-mock__alert-bar">
        <span className="lp-mock__alert-dot" />
        Carlos R. - Stale data: 45 days without test
      </div>
    </div>
  );
  if (tab === "analysis") return (
    <div className="lp-mock lp-mock--light">
      <svg viewBox="0 0 200 70" className="lp-mock__chart">
        <defs><linearGradient id="mcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d26a36" stopOpacity=".12" /><stop offset="100%" stopColor="#d26a36" stopOpacity="0" /></linearGradient></defs>
        <path d="M10 60 C30 58, 50 55, 80 48 C110 38, 130 25, 160 12 L160 65 L10 65 Z" fill="url(#mcg)" />
        <path d="M10 60 C30 58, 50 55, 80 48 C110 38, 130 25, 160 12" fill="none" stroke="#d26a36" strokeWidth="2" />
        <line x1="60" y1="5" x2="60" y2="65" stroke="#22c55e" strokeWidth="1" strokeDasharray="3 2" opacity=".5" />
        <line x1="120" y1="5" x2="120" y2="65" stroke="#f97316" strokeWidth="1" strokeDasharray="3 2" opacity=".5" />
        <text x="60" y="10" textAnchor="middle" fill="#22c55e" fontSize="7" fontWeight="700">LT1</text>
        <text x="120" y="10" textAnchor="middle" fill="#f97316" fontSize="7" fontWeight="700">LT2</text>
      </svg>
      <div className="lp-mock__row">
        <span className="lp-mock__conf-badge">Conf: 0.87</span>
        <span className="lp-mock__method-count">3 methods agree</span>
      </div>
    </div>
  );
  if (tab === "planning") return (
    <div className="lp-mock lp-mock--light">
      <div className="lp-mock__calendar-mini">
        {[1,2,3,4].map(w => (
          <div key={w} className="lp-mock__cal-week">
            <span className="lp-mock__cal-week-label">W{w}</span>
            <div className="lp-mock__cal-days">
              {[0,1,2,3,4,5,6].map(d => (
                <div key={d} className={`lp-mock__cal-dot ${(w < 4 && (d === 1 || d === 3 || d === 5)) ? "lp-mock__cal-dot--filled" : ""} ${w === 4 ? "lp-mock__cal-dot--recovery" : ""}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="lp-mock__block-tag lp-mock__block-tag--light">TSS 480 · CTL 62 · ATL 78</div>
    </div>
  );
  if (tab === "library") return (
    <div className="lp-mock lp-mock--light">
      <div className="lp-mock__lib-list">
        {[
          { name: "4x6' LT1", zone: "Z2" },
          { name: "5x4' Cruise intervals", zone: "Z4" },
          { name: "3x20' Sub-threshold", zone: "Z3" },
        ].map(w => (
          <div key={w.name} className="lp-mock__lib-item">
            <span className="lp-mock__lib-name">{w.name}</span>
            <span className="lp-mock__lib-step">{w.zone}</span>
          </div>
        ))}
      </div>
    </div>
  );
  // advisor
  return (
    <div className="lp-mock lp-mock--light">
      <div className="lp-mock__chat">
        <div className="lp-mock__chat-q">Should I increase LT2 volume after 3 weeks of threshold work?</div>
        <div className="lp-mock__chat-a">
          Based on the athlete's current thresholds and training history, the data suggests maintaining the current load for one more week before progressing...
          <span className="lp-mock__chat-cite">[scientific evidence]</span>
        </div>
      </div>
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

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LangProvider, useLang, LANG_LABELS, type Lang } from "../landing/i18n";
import { LactateDemo } from "../landing/LactateDemo";

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

/* ══════════════════════════════════════════
   Inner landing (has access to useLang)
   ══════════════════════════════════════════ */
function LandingInner() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleBeta(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const list = JSON.parse(localStorage.getItem("pa-beta-signups") || "[]");
    list.push({ email: email.trim(), ts: new Date().toISOString() });
    localStorage.setItem("pa-beta-signups", JSON.stringify(list));
    setSubmitted(true);
  }

  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand">PeakAerobic</span>
          <div className="lp-nav__right">
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══ HERO with optional video bg ══ */}
      <section className="lp-hero">
        <video className="lp-hero__video" autoPlay muted loop playsInline poster="/hero-poster.jpg">
          <source src="/hero-video.mp4" type="video/mp4" />
        </video>
        <div className="lp-hero__overlay" />
        <div className="lp-w lp-hero__grid">
          <div className="lp-hero__left">
            <p className="lp-hero__kicker">{t("hero_kicker")}</p>
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
          </div>
          <div className="lp-hero__right">
            <HeroCurve />
          </div>
        </div>
      </section>

      {/* ══ INTERACTIVE DEMO ══ */}
      <LactateDemo />

      {/* ══ 3 METHODS (dark) ══ */}
      <section className="lp-section lp-section--dark" id="motor">
        <div className="lp-w">
          <p className="lp-ey lp-ey--light">{t("methods_ey")}</p>
          <h2 className="lp-h2 lp-h2--light">{t("methods_h2")}</h2>
          <p className="lp-sub lp-sub--light">{t("methods_sub")}</p>
          <div className="lp-methods">
            <div className="lp-method">
              <span className="lp-method__tag">{t("m1_tag")}</span>
              <p>{t("m1_text")}</p>
            </div>
            <div className="lp-method">
              <span className="lp-method__tag">{t("m2_tag")}</span>
              <p>{t("m2_text")}</p>
            </div>
            <div className="lp-method">
              <span className="lp-method__tag">{t("m3_tag")}</span>
              <p>{t("m3_text")}</p>
            </div>
          </div>
          <div className="lp-methods__footer">
            <div className="lp-methods__stat">
              <span className="lp-methods__stat-val">{t("methods_agg_lac")}</span>
              <span className="lp-methods__stat-desc">{t("methods_agg_lac_d")}</span>
            </div>
            <div className="lp-methods__stat">
              <span className="lp-methods__stat-val">{t("methods_agg_pace")}</span>
              <span className="lp-methods__stat-desc">{t("methods_agg_pace_d")}</span>
            </div>
            <div className="lp-methods__stat">
              <span className="lp-methods__stat-val">{t("methods_agg_conf")}</span>
              <span className="lp-methods__stat-desc">{t("methods_agg_conf_d")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══ DYNAMIC THRESHOLDS ══ */}
      <section className="lp-section" id="dinamicos">
        <div className="lp-w lp-split">
          <div className="lp-split__text">
            <p className="lp-ey">{t("dyn_ey")}</p>
            <h2 className="lp-h2">{t("dyn_h2")}</h2>
            <p className="lp-sub">{t("dyn_sub")}</p>
            <ul className="lp-checks">
              <li>{t("dyn_c1")}</li>
              <li>{t("dyn_c2")}</li>
              <li>{t("dyn_c3")}</li>
              <li>{t("dyn_c4")}</li>
            </ul>
          </div>
          <div className="lp-split__visual">
            <div className="lp-evo">
              {[
                { date: "12 Jan", w: "62%", val: "LT2: 4:38/km", current: false },
                { date: "8 Feb", w: "70%", val: "LT2: 4:31/km", current: false },
                { date: "5 Mar", w: "78%", val: "LT2: 4:24/km", current: true },
              ].map((r) => (
                <div key={r.date} className="lp-evo__row">
                  <span className="lp-evo__date">{r.date}</span>
                  <div className={`lp-evo__bar ${r.current ? "lp-evo__bar--current" : ""}`} style={{ width: r.w }}><span>{r.val}</span></div>
                </div>
              ))}
              <p className="lp-evo__caption">{t("dyn_caption")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ RACE PREDICTIONS (warm bg) ══ */}
      <section className="lp-section lp-section--warm" id="prediccion">
        <div className="lp-w">
          <p className="lp-ey">{t("pred_ey")}</p>
          <h2 className="lp-h2">{t("pred_h2")}</h2>
          <p className="lp-sub">{t("pred_sub")}</p>
          <div className="lp-predictions">
            {[
              { dist: "5K", time: "19:42", range: "19:12 — 20:15" },
              { dist: "10K", time: "41:08", range: "40:05 — 42:20" },
              { dist: t("pred_hm"), time: "1:31:24", range: "1:28:50 — 1:34:10" },
              { dist: t("pred_marathon"), time: "3:12:40", range: "3:06:00 — 3:20:00" },
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

      {/* ══ PRESCRIPTION ══ */}
      <section className="lp-section" id="prescripcion">
        <div className="lp-w lp-split lp-split--reverse">
          <div className="lp-split__text">
            <p className="lp-ey">{t("rx_ey")}</p>
            <h2 className="lp-h2">{t("rx_h2")}</h2>
            <p className="lp-sub">{t("rx_sub")}</p>
            <div className="lp-blocks-demo">
              {(["b1","b2","b3","b4","b5","b6"] as const).map((k, i) => (
                <div key={k} className={`lp-bk ${i === 0 ? "lp-bk--active" : ""}`}>
                  <span className="lp-bk__name">{t(`rx_${k}`)}</span>
                  <span className="lp-bk__when">{t(`rx_${k}w`)}</span>
                </div>
              ))}
            </div>
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

      {/* ══ COACH + ATHLETE (dark) ══ */}
      <section className="lp-section lp-section--dark">
        <div className="lp-w">
          <p className="lp-ey lp-ey--light">{t("for_ey")}</p>
          <h2 className="lp-h2 lp-h2--light">{t("for_h2")}</h2>
          <div className="lp-duo">
            <div className="lp-duo__col">
              <h3 className="lp-duo__h3">{t("for_coach")}</h3>
              <ul className="lp-duo__list">
                {["c1","c2","c3","c4","c5","c6"].map((k) => <li key={k}>{t(`for_${k}`)}</li>)}
              </ul>
            </div>
            <div className="lp-duo__col">
              <h3 className="lp-duo__h3">{t("for_athlete")}</h3>
              <ul className="lp-duo__list">
                {["a1","a2","a3","a4","a5","a6"].map((k) => <li key={k}>{t(`for_${k}`)}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══ SCIENCE STRIP ══ */}
      <section className="lp-strip">
        <div className="lp-w lp-strip__grid">
          {[
            { ref: "Faude 2009", key: "sci_faude" },
            { ref: "Bishop 1998", key: "sci_bishop" },
            { ref: "di Prampero", key: "sci_prampero" },
            { ref: "Daniels & Gilbert", key: "sci_daniels" },
            { ref: "Olbrecht", key: "sci_olbrecht" },
            { ref: "Zanini 2025", key: "sci_zanini" },
          ].map((s) => (
            <div key={s.ref} className="lp-strip__item">
              <span className="lp-strip__ref">{s.ref}</span>
              <span className="lp-strip__detail">{t(s.key)}</span>
            </div>
          ))}
        </div>
      </section>

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

import { LangProvider, useLang, type Lang, LANG_LABELS } from "../landing/i18n";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ── SEO-focused resource articles based on forum pain points ── */

type Article = {
  slug: string;
  category: "learning" | "guides" | "blog";
  titleKey: string;
  descKey: string;
  readMin: number;
  tags: string[];
};

const ARTICLES: Article[] = [
  // Learning Center — educational, science-backed
  {
    slug: "lactate-threshold-explained",
    category: "learning",
    titleKey: "res_a1_title",
    descKey: "res_a1_desc",
    readMin: 8,
    tags: ["lactate threshold", "LT1", "LT2", "training zones"],
  },
  {
    slug: "ftp-vs-lactate-testing",
    category: "learning",
    titleKey: "res_a2_title",
    descKey: "res_a2_desc",
    readMin: 6,
    tags: ["FTP", "lactate", "zone accuracy", "threshold"],
  },
  {
    slug: "why-training-zones-wrong",
    category: "learning",
    titleKey: "res_a3_title",
    descKey: "res_a3_desc",
    readMin: 7,
    tags: ["training zones", "heart rate zones", "zone calculation"],
  },
  {
    slug: "vo2max-vlamax-explained",
    category: "learning",
    titleKey: "res_a4_title",
    descKey: "res_a4_desc",
    readMin: 10,
    tags: ["VO2max", "VLamax", "metabolic profile", "aerobic capacity"],
  },
  // Training Guides — practical how-to
  {
    slug: "how-to-do-lactate-test",
    category: "guides",
    titleKey: "res_a5_title",
    descKey: "res_a5_desc",
    readMin: 5,
    tags: ["lactate test", "protocol", "step test", "how-to"],
  },
  {
    slug: "base-training-aerobic-capacity",
    category: "guides",
    titleKey: "res_a6_title",
    descKey: "res_a6_desc",
    readMin: 7,
    tags: ["base training", "aerobic", "zone 2", "endurance"],
  },
  {
    slug: "threshold-training-guide",
    category: "guides",
    titleKey: "res_a7_title",
    descKey: "res_a7_desc",
    readMin: 6,
    tags: ["threshold training", "LT2", "tempo", "intervals"],
  },
  {
    slug: "race-prediction-from-lactate",
    category: "guides",
    titleKey: "res_a8_title",
    descKey: "res_a8_desc",
    readMin: 5,
    tags: ["race prediction", "marathon", "10K", "half marathon"],
  },
  // Athlete Blog — stories, insights
  {
    slug: "how-often-lactate-test",
    category: "blog",
    titleKey: "res_a9_title",
    descKey: "res_a9_desc",
    readMin: 4,
    tags: ["testing frequency", "adaptation", "retesting"],
  },
  {
    slug: "portable-lactate-analyzer-comparison",
    category: "blog",
    titleKey: "res_a10_title",
    descKey: "res_a10_desc",
    readMin: 6,
    tags: ["Lactate Plus", "Lactate Pro", "EKF", "analyzer"],
  },
  {
    slug: "triathlon-zones-three-sports",
    category: "blog",
    titleKey: "res_a11_title",
    descKey: "res_a11_desc",
    readMin: 7,
    tags: ["triathlon", "multisport", "zones", "Ironman"],
  },
  {
    slug: "periodization-mesocycle-guide",
    category: "blog",
    titleKey: "res_a12_title",
    descKey: "res_a12_desc",
    readMin: 8,
    tags: ["periodization", "mesocycle", "training plan", "block training"],
  },
  // New articles — Part 3
  {
    slug: "how-to-read-lactate-curve",
    category: "learning",
    titleKey: "res_a13_title",
    descKey: "res_a13_desc",
    readMin: 8,
    tags: ["lactate curve", "interpretation", "coach", "shape analysis"],
  },
  {
    slug: "zone-2-training-lactate-science",
    category: "learning",
    titleKey: "res_a14_title",
    descKey: "res_a14_desc",
    readMin: 9,
    tags: ["zone 2", "lactate", "base training", "aerobic"],
  },
  {
    slug: "lactate-myths-debunked",
    category: "blog",
    titleKey: "res_a15_title",
    descKey: "res_a15_desc",
    readMin: 7,
    tags: ["myths", "lactate", "science", "debunked"],
  },
  {
    slug: "overtraining-detection-lactate",
    category: "guides",
    titleKey: "res_a16_title",
    descKey: "res_a16_desc",
    readMin: 6,
    tags: ["overtraining", "lactate", "recovery", "detection"],
  },
  // New articles — Part 4
  {
    slug: "lactate-testing-swimming",
    category: "guides",
    titleKey: "res_a17_title",
    descKey: "res_a17_desc",
    readMin: 7,
    tags: ["swimming", "lactate test", "pool protocol", "CSS"],
  },
  {
    slug: "energy-systems-balance",
    category: "learning",
    titleKey: "res_a18_title",
    descKey: "res_a18_desc",
    readMin: 10,
    tags: ["VO2max", "VLamax", "Olbrecht", "energy systems"],
  },
  {
    slug: "lactate-curve-shifts",
    category: "learning",
    titleKey: "res_a19_title",
    descKey: "res_a19_desc",
    readMin: 7,
    tags: ["curve shift", "progress", "right-shift", "adaptation"],
  },
  {
    slug: "vlamax-training-guide",
    category: "guides",
    titleKey: "res_a20_title",
    descKey: "res_a20_desc",
    readMin: 8,
    tags: ["VLamax", "glycolytic", "training", "manipulation"],
  },
];

const CATEGORIES = [
  { key: "all", labelKey: "res_cat_all" },
  { key: "learning", labelKey: "res_cat_learning" },
  { key: "guides", labelKey: "res_cat_guides" },
  { key: "blog", labelKey: "res_cat_blog" },
] as const;

/* ── Intersection Observer hook ── */
function useInView(threshold = 0.1) {
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

function AnimSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useInView(0.1);
  return <div ref={ref} className={`lp-anim ${visible ? "lp-anim--in" : ""} ${className}`}>{children}</div>;
}

/* ── Lang switch (reused) ── */
function LangSwitch() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="lp-lang">
      <button type="button" className="lp-lang__btn" onClick={() => setOpen(!open)}>{lang.toUpperCase()}</button>
      {open && (
        <div className="lp-lang__drop">
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <button key={l} type="button" className={`lp-lang__opt ${l === lang ? "lp-lang__opt--on" : ""}`} onClick={() => { setLang(l); setOpen(false); }}>{LANG_LABELS[l]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Category icon ── */
function CategoryIcon({ cat }: { cat: string }) {
  if (cat === "learning") return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
  );
  if (cat === "guides") return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
  );
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
  );
}

/* ── Inner page ── */
function ResourcesInner() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    document.title = "Recursos — PeakAerobic | Ciencia del lactato y entrenamiento";
    const desc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (desc) desc.content = "Articulos sobre umbrales de lactato, zonas de entrenamiento, periodizacion y fisiologia deportiva. Aprende a entrenar con ciencia.";
    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonical) canonical.href = "https://peakaerobic.com/resources";
  }, []);

  const filtered = filter === "all" ? ARTICLES : ARTICLES.filter(a => a.category === filter);

  return (
    <div className="lp res-page">
      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand" style={{ cursor: "pointer" }} onClick={() => navigate("/")} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navigate("/")}>PeakAerobic</span>
          <div className="lp-nav__right">
            <a href="/" className="lp-nav__link">{t("res_nav_home")}</a>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="res-hero">
        <div className="lp-w">
          <p className="lp-ey">{t("res_ey")}</p>
          <h1 className="res-hero__h1">{t("res_h1")}</h1>
          <p className="res-hero__sub">{t("res_sub")}</p>
        </div>
      </section>

      {/* Category filter */}
      <section className="res-filter">
        <div className="lp-w">
          <div className="res-filter__pills">
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                type="button"
                className={`res-filter__pill ${filter === c.key ? "res-filter__pill--on" : ""}`}
                onClick={() => setFilter(c.key)}
              >
                {t(c.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Articles grid */}
      <section className="res-articles">
        <div className="lp-w">
          <div className="res-articles__grid">
            {filtered.map((a, i) => (
              <AnimSection key={a.slug}>
                <article className="res-card" style={{ animationDelay: `${i * 0.05}s` }} onClick={() => navigate(`/resources/${a.slug}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navigate(`/resources/${a.slug}`)}>
                  <div className="res-card__top">
                    <span className={`res-card__cat res-card__cat--${a.category}`}>
                      <CategoryIcon cat={a.category} />
                      {t(`res_cat_${a.category}`)}
                    </span>
                    <span className="res-card__read">{a.readMin} min</span>
                  </div>
                  <h3 className="res-card__title">{t(a.titleKey)}</h3>
                  <p className="res-card__desc">{t(a.descKey)}</p>
                  <div className="res-card__tags">
                    {a.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="res-card__tag">{tag}</span>
                    ))}
                  </div>
                  <span className="res-card__link">{t("res_read_more")} →</span>
                </article>
              </AnimSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="res-cta">
        <div className="lp-w res-cta__inner">
          <h2 className="lp-h2">{t("res_cta_h2")}</h2>
          <p className="lp-sub">{t("res_cta_sub")}</p>
          <button className="lp-btn-solid" onClick={() => navigate("/")} type="button">{t("res_cta_btn")}</button>
        </div>
      </section>

      {/* Footer */}
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

export function ResourcesPage() {
  return (
    <LangProvider>
      <ResourcesInner />
    </LangProvider>
  );
}

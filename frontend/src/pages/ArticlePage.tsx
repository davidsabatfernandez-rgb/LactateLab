import { LangProvider, useLang, type Lang, LANG_LABELS } from "../landing/i18n";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ALL_ARTICLES } from "../resources";
import { ArticleGraphic } from "../resources/ArticleGraphics";

/* ── Dynamic SEO meta tags ── */
function usePageSEO(title: string, description: string, canonicalPath: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    const setMeta = (attr: string, key: string, val: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", val);
    };
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", `https://peakaerobic.com${canonicalPath}`);
    setMeta("property", "og:type", "article");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    let canonical = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (canonical) canonical.href = `https://peakaerobic.com${canonicalPath}`;
    return () => { document.title = prev; };
  }, [title, description, canonicalPath]);
}

/* ── Reused components ── */
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

function ArticleInner() {
  const location = useLocation();
  const slug = location.pathname.replace("/resources/", "");
  const { t } = useLang();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const article = slug ? ALL_ARTICLES[slug] : null;

  /* Dynamic SEO for each article */
  const articleTitle = article
    ? (t(`res_${slugToKey(slug)}_title`) !== `res_${slugToKey(slug)}_title`
      ? t(`res_${slugToKey(slug)}_title`)
      : article.sections[0]?.heading || slug)
    : "PeakAerobic";
  const articleDesc = article
    ? (t(`res_${slugToKey(slug)}_desc`) !== `res_${slugToKey(slug)}_desc`
      ? t(`res_${slugToKey(slug)}_desc`)
      : article.sections[0]?.heading || "")
    : "";
  usePageSEO(
    `${articleTitle} | PeakAerobic`,
    articleDesc,
    `/resources/${slug}`,
  );

  if (!article) {
    return (
      <div className="lp art-page">
        <nav className="lp-nav">
          <div className="lp-w lp-nav__row">
            <span className="lp-nav__brand" style={{ cursor: "pointer" }} onClick={() => navigate("/")} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navigate("/")}>PeakAerobic</span>
            <div className="lp-nav__right">
              <a href="/resources" className="lp-nav__link">{t("foot_resources")}</a>
              <LangSwitch />
              <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
            </div>
          </div>
        </nav>
        <div className="art-not-found">
          <h1>Artículo no encontrado</h1>
          <button className="lp-btn-solid" onClick={() => navigate("/resources")} type="button">Volver a recursos</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lp art-page">
      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand" style={{ cursor: "pointer" }} onClick={() => navigate("/")} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navigate("/")}>PeakAerobic</span>
          <div className="lp-nav__right">
            <a href="/resources" className="lp-nav__link">{t("foot_resources")}</a>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="art-breadcrumb">
        <div className="lp-w">
          <a href="/resources" className="art-breadcrumb__link">{t("foot_resources")}</a>
          <span className="art-breadcrumb__sep">/</span>
          <span className="art-breadcrumb__current">{t(`res_${slugToKey(slug)}_title`) !== `res_${slugToKey(slug)}_title` ? t(`res_${slugToKey(slug)}_title`) : article.sections[0]?.heading}</span>
        </div>
      </div>

      {/* JSON-LD Article structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": articleTitle,
        "description": articleDesc,
        "url": `https://peakaerobic.com/resources/${slug}`,
        "publisher": { "@type": "Organization", "name": "PeakAerobic", "url": "https://peakaerobic.com" },
        "mainEntityOfPage": { "@type": "WebPage", "@id": `https://peakaerobic.com/resources/${slug}` },
      }) }} />

      {/* Article */}
      <article className="art-content">
        <div className="lp-w art-content__wrapper">
          <header className="art-content__header">
            <h1 className="art-content__h1">{articleTitle}</h1>
          </header>

          <ArticleGraphic slug={slug} />

          <div className="art-content__body">
            {article.sections.map((section, i) => (
              <section key={i} className="art-section">
                <h2 className="art-section__heading">{section.heading}</h2>
                <div className="art-section__text" dangerouslySetInnerHTML={{ __html: section.body }} />
              </section>
            ))}
          </div>

          {article.references && article.references.length > 0 && (
            <aside className="art-references">
              <h3 className="art-references__title">Referencias</h3>
              <ol className="art-references__list">
                {article.references.map((ref, i) => (
                  <li key={i}>{ref}</li>
                ))}
              </ol>
            </aside>
          )}

          {/* CTA */}
          <div className="art-cta">
            <h3 className="art-cta__title">{t("res_cta_h2")}</h3>
            <p className="art-cta__sub">{t("res_cta_sub")}</p>
            <button className="lp-btn-solid" onClick={() => navigate("/")} type="button">{t("res_cta_btn")}</button>
          </div>

          {/* Back */}
          <div className="art-back">
            <button className="lp-btn-ghost" onClick={() => navigate("/resources")} type="button">← {t("foot_resources")}</button>
          </div>
        </div>
      </article>

      {/* Footer */}
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

/* Map slug to article key number */
function slugToKey(slug: string): string {
  const MAP: Record<string, string> = {
    "lactate-threshold-explained": "a1",
    "ftp-vs-lactate-testing": "a2",
    "why-training-zones-wrong": "a3",
    "vo2max-vlamax-explained": "a4",
    "how-to-do-lactate-test": "a5",
    "base-training-aerobic-capacity": "a6",
    "threshold-training-guide": "a7",
    "race-prediction-from-lactate": "a8",
    "how-often-lactate-test": "a9",
    "portable-lactate-analyzer-comparison": "a10",
    "triathlon-zones-three-sports": "a11",
    "periodization-mesocycle-guide": "a12",
    "how-to-read-lactate-curve": "a13",
    "zone-2-training-lactate-science": "a14",
    "lactate-myths-debunked": "a15",
    "overtraining-detection-lactate": "a16",
    "lactate-testing-swimming": "a17",
    "energy-systems-balance": "a18",
    "lactate-curve-shifts": "a19",
    "vlamax-training-guide": "a20",
  };
  return MAP[slug] || slug;
}

export function ArticlePage() {
  return (
    <LangProvider>
      <ArticleInner />
    </LangProvider>
  );
}

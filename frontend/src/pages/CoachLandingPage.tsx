import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LangProvider, useLang, LANG_LABELS, type Lang } from "../landing/i18n";

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

function AnimSection({ children }: { children: React.ReactNode }) {
  const { ref, visible } = useInView();
  return <div ref={ref} className={`lp-anim ${visible ? "lp-anim--in" : ""}`}>{children}</div>;
}

function LangSwitch() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="lp-lang" onClick={() => setOpen(!open)}>
      <span className="lp-lang__current">{lang.toUpperCase()}</span>
      {open && (
        <div className="lp-lang__dropdown">
          {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
            <button key={l} className={`lp-lang__option ${l === lang ? "lp-lang__option--active" : ""}`} onClick={() => { setLang(l); setOpen(false); }}>{LANG_LABELS[l]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Screen mockup wrapper (reuses lp-showcase__screen) ── */
function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="lp-showcase__screen">
      <div className="lp-showcase__screen-bar">
        <span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" /><span className="lp-showcase__screen-dot" />
        <span className="lp-showcase__screen-title">{title}</span>
      </div>
      <div className="lp-showcase__screen-body">
        {children}
      </div>
    </div>
  );
}

function CoachInner() {
  const { t } = useLang();
  const navigate = useNavigate();

  return (
    <div className="lp">
      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand" style={{cursor:"pointer"}} onClick={() => navigate("/")}>PeakAerobic</span>
          <div className="lp-nav__right">
            <a href="/#demo" className="lp-nav__link">{t("nav_demo")}</a>
            <a href="/#athlete-portal" className="lp-nav__link">{t("nav_athlete")}</a>
            <span className="lp-nav__link lp-nav__link--active">{t("nav_coach")}</span>
            <a href="/#pricing" className="lp-nav__link">{t("nav_pricing")}</a>
            <a href="/resources" className="lp-nav__link">{t("foot_resources")}</a>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section className="lp-hero">
        <div className="lp-hero__overlay" />
        <div className="lp-w" style={{maxWidth: 820, paddingTop: 120, paddingBottom: 80, textAlign: "center"}}>
          <p className="lp-hero__kicker">{t("coach_hero_kicker")}</p>
          <h1 className="lp-hero__h1">{t("coach_hero_h1")}</h1>
          <p className="lp-hero__sub" style={{maxWidth: 660, margin: "0 auto 32px"}}>{t("coach_hero_sub")}</p>
          <div className="lp-hero__proof" style={{justifyContent:"center"}}>
            <div className="lp-hero__proof-item"><span className="lp-hero__proof-val">3 {t("coach_eng_agg_title").toLowerCase()}</span></div>
            <div className="lp-hero__proof-sep" />
            <div className="lp-hero__proof-item"><span className="lp-hero__proof-val">Running · Ciclismo · Natación</span></div>
            <div className="lp-hero__proof-sep" />
            <div className="lp-hero__proof-item"><span className="lp-hero__proof-val">6 bloques Olbrecht</span></div>
          </div>
          <button className="lp-btn-solid lp-btn--coach" style={{marginTop: 28}} onClick={() => navigate("/register")} type="button">{t("coach_hero_cta")}</button>
        </div>
      </section>

      {/* ══ 01 — DASHBOARD MULTI-ATLETA ══ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">01</span>
              <h3 className="lp-showcase__title">{t("coach_dash_h2")}</h3>
              <p className="lp-showcase__desc">{t("coach_dash_1_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_dash_2_title")}: {t("coach_dash_2_desc")}</li>
                <li>{t("coach_dash_3_title")}: {t("coach_dash_3_desc")}</li>
                <li>{t("coach_dash_4_title")}: {t("coach_dash_4_desc")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Coach Dashboard">
                {/* Simulated multi-athlete roster */}
                <div style={{display:"flex",gap:6,marginBottom:10}}>
                  {["Todos","Running","Ciclismo","Alertas"].map(f => (
                    <span key={f} style={{fontSize:9,padding:"3px 8px",borderRadius:8,background:f==="Todos"?"#d26a36":"rgba(210,106,54,0.08)",color:f==="Todos"?"#fff":"#5e7078",fontWeight:600,fontFamily:"Space Grotesk"}}>{f}</span>
                  ))}
                </div>
                {[
                  { name: "Carlos M.", disc: "Running", lt2: "4:18/km", conf: 87, alert: false, block: "THR — Sem 2/4" },
                  { name: "Ana R.", disc: "Triatlón", lt2: "4:42/km", conf: 72, alert: true, block: "AEC — Sem 3/5" },
                  { name: "Pol C.", disc: "Running", lt2: "4:57/km", conf: 54, alert: true, block: "—" },
                ].map(a => (
                  <div key={a.name} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #e5e7eb",fontSize:10,fontFamily:"Space Grotesk"}}>
                    <span style={{width:26,height:26,borderRadius:"50%",background:"rgba(210,106,54,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:10,color:"#d26a36",flexShrink:0}}>{a.name[0]}</span>
                    <span style={{fontWeight:600,color:"#0e1e24",minWidth:60}}>{a.name}</span>
                    <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:"rgba(210,106,54,0.08)",color:"#d26a36",fontWeight:600}}>{a.disc}</span>
                    <span style={{color:"#5e7078",marginLeft:"auto"}}>LT2 {a.lt2}</span>
                    <span style={{fontSize:9,fontWeight:600,color:a.conf>=75?"#22c55e":a.conf>=60?"#f59e0b":"#ef4444"}}>{a.conf}%</span>
                    {a.alert && <span style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",flexShrink:0}} />}
                    <span style={{fontSize:8,color:"#9aabb4"}}>{a.block}</span>
                  </div>
                ))}
                <div className="lp-showcase__screen-footer" style={{marginTop:8}}>
                  <span className="lp-showcase__badge lp-showcase__badge--orange">2 alertas</span>
                  <span className="lp-showcase__badge lp-showcase__badge--dark">3 atletas</span>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 02 — ANÁLISIS DE LACTATO (reversed) ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">02</span>
              <h3 className="lp-showcase__title">{t("coach_eng_h2")}</h3>
              <p className="lp-showcase__desc">{t("coach_eng_sub")}</p>
              <ul className="lp-showcase__bullets">
                <li><strong>{t("coach_eng_m1_tag")}</strong> — {t("coach_eng_m1_text").slice(0,80)}...</li>
                <li><strong>{t("coach_eng_m2_tag")}</strong> — {t("coach_eng_m2_text").slice(0,80)}...</li>
                <li><strong>{t("coach_eng_m3_tag")}</strong> — {t("coach_eng_m3_text").slice(0,80)}...</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Análisis de lactato — Running">
                <svg viewBox="0 0 400 180" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <linearGradient id="clc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d26a36" stopOpacity=".12" /><stop offset="100%" stopColor="#d26a36" stopOpacity="0" /></linearGradient>
                  </defs>
                  {[30,60,90,120,150].map(y => <line key={y} x1="40" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth=".5" />)}
                  <path d="M50 155 C80 153, 120 148, 170 140 C220 125, 260 100, 300 65 C330 40, 350 22, 370 15 L370 160 L50 160 Z" fill="url(#clc)" />
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
                  <rect x="310" y="50" width="72" height="20" rx="6" fill="#0e1e24" opacity=".9" />
                  <text x="346" y="63" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Conf: 0.87</text>
                  <text x="210" y="176" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">mmol/L</text>
                </svg>
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <span className="lp-showcase__badge lp-showcase__badge--green">Baseline Rise</span>
                  <span className="lp-showcase__badge lp-showcase__badge--green">Sustained</span>
                  <span className="lp-showcase__badge lp-showcase__badge--orange">ModDmax</span>
                  <span className="lp-showcase__badge lp-showcase__badge--dark">Agregación: mediana</span>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 03 — UMBRALES DINÁMICOS ══ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">03</span>
              <h3 className="lp-showcase__title">{t("coach_dyn_h2")}</h3>
              <p className="lp-showcase__desc">{t("coach_dyn_sub")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_dyn_1").slice(0,90)}...</li>
                <li>{t("coach_dyn_2")}</li>
                <li>{t("coach_dyn_4").slice(0,90)}...</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Evolución LT2 — 6 meses">
                <svg viewBox="0 0 400 160" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                  {[40,70,100,130].map(y => <line key={y} x1="40" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth=".5" />)}
                  <path d="M60 130 L110 124 L160 116 L210 108 L260 98 L310 88 L360 76" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
                  {[60,110,160,210,260,310,360].map((x,i) => <circle key={i} cx={x} cy={130-i*9} r="5" fill="#fff" stroke="#f97316" strokeWidth="2" />)}
                  <path d="M60 140 L110 136 L160 132 L210 127 L260 122 L310 117 L360 110" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" opacity=".7" />
                  {[60,110,160,210,260,310,360].map((x,i) => <circle key={`lt1-${i}`} cx={x} cy={140-i*4.3} r="3.5" fill="#fff" stroke="#22c55e" strokeWidth="1.5" />)}
                  {/* Outlier marker */}
                  <circle cx="210" cy="108" r="9" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" opacity=".6" />
                  <text x="222" y="104" fill="#ef4444" fontSize="7" fontFamily="Space Grotesk">outlier ×0.25</text>
                  {["Oct","Nov","Dic","Ene","Feb","Mar","Abr"].map((m,i) => (
                    <text key={m} x={60+i*50} y="155" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">{m}</text>
                  ))}
                  <circle cx="310" cy="30" r="4" fill="#f97316" /><text x="318" y="34" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">LT2</text>
                  <circle cx="345" cy="30" r="4" fill="#22c55e" /><text x="353" y="34" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">LT1</text>
                </svg>
                <div className="lp-showcase__screen-footer">
                  <span className="lp-showcase__badge lp-showcase__badge--orange">LT2: 4:24 → 4:08/km</span>
                  <span className="lp-showcase__badge lp-showcase__badge--dark">Conf: 0.87 · 5 tests · LOO activo</span>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 04 — MOTOR FISIOLÓGICO (reversed) ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">04</span>
              <h3 className="lp-showcase__title">{t("coach_physio_h2")}</h3>
              <p className="lp-showcase__desc">{t("coach_physio_sub")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_physio_1_title")}: {t("coach_physio_1_desc")}</li>
                <li>{t("coach_physio_2_title")}: {t("coach_physio_2_desc").slice(0,80)}...</li>
                <li>{t("coach_physio_4_title")}: {t("coach_physio_4_desc").slice(0,80)}...</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Capacity Profile — Running">
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
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 05 — SELECCIÓN DE BLOQUE ══ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">05</span>
              <h3 className="lp-showcase__title">{t("coach_physio_5_title")}</h3>
              <p className="lp-showcase__desc">{t("coach_physio_5_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_physio_6_title")}: {t("coach_physio_6_desc").slice(0,90)}...</li>
                <li>{t("coach_physio_3_title")}: {t("coach_physio_3_desc").slice(0,90)}...</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Candidatos de bloque — Carlos M.">
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[
                    { block: "Threshold Dev.", score: 84, chosen: true },
                    { block: "Aerobic Capacity", score: 71, chosen: false },
                    { block: "Aerobic Power", score: 63, chosen: false },
                    { block: "Anaerobic Cap.", score: 42, chosen: false },
                    { block: "Competition Spec.", score: 38, chosen: false },
                    { block: "Anaerobic Power", score: 21, chosen: false },
                  ].map(c => (
                    <div key={c.block} style={{display:"flex",alignItems:"center",gap:8,fontSize:10,fontFamily:"Space Grotesk",opacity:c.chosen?1:0.6}}>
                      <span style={{fontWeight:600,color:"#0e1e24",minWidth:120}}>{c.block}</span>
                      <div style={{flex:1,height:6,borderRadius:3,background:"#e5e7eb",overflow:"hidden"}}>
                        <div style={{width:`${c.score}%`,height:"100%",borderRadius:3,background:c.chosen?"#d26a36":"#9aabb4"}} />
                      </div>
                      <span style={{fontWeight:700,color:c.chosen?"#d26a36":"#9aabb4",minWidth:28,textAlign:"right"}}>{c.score}</span>
                      {c.chosen && <span style={{fontSize:8,padding:"2px 6px",borderRadius:6,background:"#d26a36",color:"#fff",fontWeight:700}}>ELEGIDO</span>}
                    </div>
                  ))}
                </div>
                <div className="lp-showcase__screen-footer" style={{marginTop:10}}>
                  <span className="lp-showcase__badge lp-showcase__badge--orange">Gap: 16 sec/km al objetivo</span>
                  <span className="lp-showcase__badge lp-showcase__badge--dark">Fase: specific · 12 sem</span>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 06 — PLANIFICACIÓN + CALENDARIO (reversed) ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">06</span>
              <h3 className="lp-showcase__title">{t("coach_plan_h2")}</h3>
              <p className="lp-showcase__desc">{t("coach_plan_sub")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_plan_1_title")}: {t("coach_plan_1_desc").slice(0,90)}...</li>
                <li>{t("coach_plan_2_title")}: {t("coach_plan_2_desc").slice(0,90)}...</li>
                <li>{t("coach_plan_3_title")}: {t("coach_plan_3_desc").slice(0,80)}...</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Calendario — Semana 2/4 (Build)">
                <div className="lp-showcase__calendar">
                  <div className="lp-showcase__cal-header">
                    {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
                      <span key={d} className="lp-showcase__cal-day-label">{d}</span>
                    ))}
                  </div>
                  <div className="lp-showcase__cal-grid">
                    {[
                      { type: "rest", label: "Descanso" },
                      { type: "key", label: "4×6' LT2 cruise", badge: "CALIDAD" },
                      { type: "easy", label: "40' rodaje suave" },
                      { type: "rest", label: "Descanso" },
                      { type: "key", label: "uLT1 + VO2 combo", badge: "CALIDAD" },
                      { type: "long", label: "1h30 tirada LT1", badge: "LARGO" },
                      { type: "rest", label: "Descanso" },
                    ].map((d, i) => (
                      <div key={i} className={`lp-showcase__cal-cell lp-showcase__cal-cell--${d.type}`}>
                        {d.badge && <span className={`lp-showcase__cal-badge lp-showcase__cal-badge--${d.type}`}>{d.badge}</span>}
                        <span className="lp-showcase__cal-label">{d.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="lp-showcase__cal-meta">
                    <span className="lp-showcase__badge lp-showcase__badge--dark">THR block</span>
                    <span className="lp-showcase__badge lp-showcase__badge--orange">Sem carga · Dosis 3/6</span>
                  </div>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 07 — BIBLIOTECA DE WORKOUTS ══ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">07</span>
              <h3 className="lp-showcase__title">{t("coach_lib_title")}</h3>
              <p className="lp-showcase__desc">{t("coach_lib_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_lib_b1")}</li>
                <li>{t("coach_lib_b2")}</li>
                <li>{t("coach_lib_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Biblioteca de sesiones — Running">
                <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                  {["LT1","SUB-T","LT2","VO2","Fuerza","Recovery"].map(z => (
                    <span key={z} style={{fontSize:8,padding:"2px 7px",borderRadius:6,background:z==="LT2"?"#d26a36":"rgba(210,106,54,0.08)",color:z==="LT2"?"#fff":"#5e7078",fontWeight:600,fontFamily:"Space Grotesk"}}>{z}</span>
                  ))}
                </div>
                {[
                  { name: "LT2 Cruise Intervals", role: "P", fatigue: 4, dur: "52 min", doses: "6 peldaños" },
                  { name: "uLT1 + VO2 combo", role: "P", fatigue: 5, dur: "58 min", doses: "6 peldaños" },
                  { name: "Escalated LT1 reps", role: "S", fatigue: 3, dur: "48 min", doses: "8 peldaños" },
                  { name: "E2 progressive medium", role: "S", fatigue: 2, dur: "60 min", doses: "—" },
                ].map(w => (
                  <div key={w.name} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0",borderBottom:"1px solid #e5e7eb",fontSize:10,fontFamily:"Space Grotesk"}}>
                    <span style={{fontWeight:600,color:"#0e1e24",flex:1}}>{w.name}</span>
                    <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:w.role==="P"?"rgba(210,106,54,0.12)":"rgba(34,197,94,0.12)",color:w.role==="P"?"#d26a36":"#22c55e",fontWeight:700}}>{w.role}</span>
                    <span style={{color:"#9aabb4"}}>{"●".repeat(w.fatigue)}{"○".repeat(5-w.fatigue)}</span>
                    <span style={{color:"#5e7078",minWidth:40,textAlign:"right"}}>{w.dur}</span>
                    <span style={{fontSize:8,color:"#9aabb4"}}>{w.doses}</span>
                  </div>
                ))}
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 08 — TRAINING LOAD CTL/ATL/TSB (reversed) ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">08</span>
              <h3 className="lp-showcase__title">{t("coach_load_title")}</h3>
              <p className="lp-showcase__desc">{t("coach_load_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_load_b1")}</li>
                <li>{t("coach_load_b2")}</li>
                <li>{t("coach_load_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Training Load — 90 days">
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
                <svg viewBox="0 0 400 120" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                  {[25,50,75,100].map(y => <line key={y} x1="40" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth=".5" />)}
                  <path d="M50 100 C80 97, 110 93, 140 88 C170 83, 200 78, 230 73 C260 67, 290 63, 320 59 C340 56, 360 54, 375 52" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M50 95 C70 80, 90 93, 110 70 C130 85, 150 63, 170 75 C190 57, 210 73, 230 50 C250 65, 270 45, 290 55 C310 40, 330 47, 350 33 C360 37, 370 30, 375 27" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" opacity=".85" />
                  <path d="M50 90 C80 85, 110 91, 140 80 C170 87, 200 75, 230 81 C260 73, 290 77, 320 70 C340 73, 360 67, 375 65" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="5 3" opacity=".7" />
                  {["Ene","Feb","Mar"].map((m,i) => (
                    <text key={m} x={90+i*120} y="118" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">{m}</text>
                  ))}
                </svg>
                <div className="lp-showcase__screen-footer">
                  <span className="lp-showcase__badge lp-showcase__badge--green">Fitness: +18 en 90d</span>
                  <span className="lp-showcase__badge lp-showcase__badge--orange">ACWR: 1.26 — Zona alta</span>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 09 — PREDICCIONES + GARMIN ══ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">09</span>
              <h3 className="lp-showcase__title">{t("coach_pred_title")}</h3>
              <p className="lp-showcase__desc">{t("coach_pred_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_pred_b1")}</li>
                <li>{t("coach_pred_b2")}</li>
                <li>{t("coach_pred_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Predicciones + Garmin — Running">
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
                <div className="lp-showcase__garmin-push" style={{marginTop:8}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
                  <span style={{fontSize:10,fontFamily:"Space Grotesk",color:"#5e7078"}}>Push workouts to Garmin Connect</span>
                </div>
                <div className="lp-showcase__garmin-push" style={{marginTop:4}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
                  <span style={{fontSize:10,fontFamily:"Space Grotesk",color:"#5e7078"}}>Auto-sync activities + zones</span>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 10 — GRÁFICAS BETA: FAT/CHO + ANÁLISIS AVANZADO (reversed) ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm lp-showcase">
          <div className="lp-w lp-showcase__row lp-showcase__row--reverse">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">10</span>
              <h3 className="lp-showcase__title">{t("coach_beta_title")}</h3>
              <p className="lp-showcase__desc">{t("coach_beta_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_beta_b1")}</li>
                <li>{t("coach_beta_b2")}</li>
                <li>{t("coach_beta_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Oxidación de sustratos — Beta">
                <svg viewBox="0 0 400 160" className="lp-showcase__chart" preserveAspectRatio="xMidYMid meet">
                  {[30,60,90,120].map(y => <line key={y} x1="50" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth=".5" />)}
                  {/* Fat curve — descending */}
                  <path d="M60 45 C100 48, 140 55, 180 72 C220 90, 260 108, 300 118 C340 124, 360 126, 375 127" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                  {/* CHO curve — ascending */}
                  <path d="M60 120 C100 117, 140 108, 180 90 C220 70, 260 50, 300 38 C340 30, 360 27, 375 25" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
                  {/* Crossover point */}
                  <circle cx="195" cy="80" r="6" fill="none" stroke="#8b5cf6" strokeWidth="2" />
                  <text x="210" y="76" fill="#8b5cf6" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Crossover</text>
                  {/* Fatmax zone */}
                  <rect x="90" y="130" width="80" height="14" rx="4" fill="#22c55e" opacity=".15" />
                  <text x="130" y="140" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">FatMax zone</text>
                  {/* Legend */}
                  <line x1="300" y1="140" x2="315" y2="140" stroke="#22c55e" strokeWidth="2" />
                  <text x="320" y="143" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk">Fat</text>
                  <line x1="340" y1="140" x2="355" y2="140" stroke="#f97316" strokeWidth="2" />
                  <text x="360" y="143" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk">CHO</text>
                  {/* X axis */}
                  <text x="210" y="155" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">Intensidad → (% VO2max)</text>
                </svg>
                <div className="lp-showcase__screen-footer">
                  <span className="lp-showcase__badge lp-showcase__badge--green">FatMax: 65% VO2max</span>
                  <span className="lp-showcase__badge lp-showcase__badge--dark" style={{opacity:0.7}}>BETA</span>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 11 — SCIENCE ADVISOR ══ */}
      <AnimSection>
        <section className="lp-section lp-showcase">
          <div className="lp-w lp-showcase__row">
            <div className="lp-showcase__text">
              <span className="lp-showcase__num">11</span>
              <h3 className="lp-showcase__title">{t("coach_ai_title")}</h3>
              <p className="lp-showcase__desc">{t("coach_ai_desc")}</p>
              <ul className="lp-showcase__bullets">
                <li>{t("coach_ai_b1")}</li>
                <li>{t("coach_ai_b2")}</li>
                <li>{t("coach_ai_b3")}</li>
              </ul>
            </div>
            <div className="lp-showcase__visual">
              <Screen title="Science Advisor">
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{background:"rgba(210,106,54,0.06)",borderRadius:8,padding:10,fontSize:10,fontFamily:"Space Grotesk",color:"#0e1e24"}}>
                    <span style={{fontWeight:600}}>Coach:</span> Mi atleta tiene un ratio LT1/LT2 de 0.91 en running. ¿Qué implica?
                  </div>
                  <div style={{background:"#f8f9fa",borderRadius:8,padding:10,fontSize:10,fontFamily:"Space Grotesk",color:"#0e1e24",lineHeight:1.5}}>
                    <span style={{fontWeight:600,color:"#d26a36"}}>Advisor:</span> Un ratio de 0.91 indica una VLamax baja (perfil "diesel"). Los umbrales están muy juntos — poco margen entre Z2 y Z4.
                    <br/><br/>
                    <span style={{fontSize:9,color:"#5e7078"}}>Fuentes: Faude et al. 2009 (PMID: 19453206), Olbrecht 2000</span>
                  </div>
                </div>
              </Screen>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ PRICING — Pro+ destacado ══ */}
      <AnimSection>
        <section className="lp-section lp-section--warm" id="coach-pricing">
          <div className="lp-w" style={{maxWidth: 640, textAlign: "center"}}>
            <p className="lp-ey">{t("coach_pro_ey")}</p>
            <h2 className="lp-h2">{t("coach_pro_h2")}</h2>
            <div className="lp-pricing__card lp-pricing__card--proplus" style={{margin: "32px auto 0", textAlign: "left"}}>
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
          </div>
        </section>
      </AnimSection>

      {/* ══ CTA ══ */}
      <section className="lp-cta-section">
        <div className="lp-w lp-cta-section__inner">
          <h2 className="lp-h2">{t("coach_cta_h2")}</h2>
          <p className="lp-sub">{t("coach_cta_sub")}</p>
          <button className="lp-btn-solid" onClick={() => navigate("/register")} type="button">{t("coach_hero_cta")}</button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-foot">
        <div className="lp-w lp-foot__inner">
          <span className="lp-foot__brand" style={{cursor:"pointer"}} onClick={() => navigate("/")}>PeakAerobic</span>
          <span className="lp-foot__line">{t("foot_tagline")}</span>
          <a href="/resources" className="lp-foot__link">{t("foot_resources")}</a>
          <a href="/privacy" className="lp-foot__link">{t("foot_privacy")}</a>
        </div>
      </footer>
    </div>
  );
}

export function CoachLandingPage() {
  return (
    <LangProvider>
      <CoachInner />
    </LangProvider>
  );
}

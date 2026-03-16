import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/* ═══════════════════════════════════════════
   Animated lactate curve — draws on scroll
   ═══════════════════════════════════════════ */
function HeroCurve() {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <svg viewBox="0 0 520 220" className="lp-hcurve" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id="hcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d26a36" stopOpacity=".14" />
          <stop offset="100%" stopColor="#d26a36" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[40, 80, 120, 160].map((y) => (
        <line key={y} x1="50" y1={y} x2="500" y2={y} stroke="#1a2f38" strokeWidth=".3" opacity=".12" />
      ))}
      {/* Y axis labels */}
      <text x="38" y="164" textAnchor="end" fill="#a3b1b8" fontSize="9" fontFamily="Space Grotesk">1</text>
      <text x="38" y="124" textAnchor="end" fill="#a3b1b8" fontSize="9" fontFamily="Space Grotesk">2</text>
      <text x="38" y="84" textAnchor="end" fill="#a3b1b8" fontSize="9" fontFamily="Space Grotesk">4</text>
      <text x="38" y="44" textAnchor="end" fill="#a3b1b8" fontSize="9" fontFamily="Space Grotesk">8</text>
      <text x="20" y="100" textAnchor="middle" fill="#a3b1b8" fontSize="8" fontFamily="Space Grotesk" transform="rotate(-90 20 100)">mmol/L</text>

      {/* Fill under curve */}
      <path
        d="M60 175 C100 173, 160 168, 210 162 C260 150, 300 130, 340 100 C370 76, 400 42, 440 20 C460 12, 480 10, 500 14 L500 200 L60 200 Z"
        fill="url(#hcg)"
        className={`lp-hcurve__fill ${drawn ? "lp-hcurve__fill--on" : ""}`}
      />

      {/* Main curve */}
      <path
        d="M60 175 C100 173, 160 168, 210 162 C260 150, 300 130, 340 100 C370 76, 400 42, 440 20 C460 12, 480 10, 500 14"
        fill="none"
        stroke="#d26a36"
        strokeWidth="2.5"
        strokeLinecap="round"
        className={`lp-hcurve__line ${drawn ? "lp-hcurve__line--on" : ""}`}
      />

      {/* Data points */}
      {[
        [60, 175], [110, 172], [160, 168], [210, 162], [250, 155],
        [290, 138], [330, 108], [365, 80], [400, 50], [440, 22],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="4"
          fill="#fff"
          stroke="#d26a36"
          strokeWidth="2"
          className={`lp-hcurve__dot ${drawn ? "lp-hcurve__dot--on" : ""}`}
          style={{ animationDelay: `${0.6 + i * 0.08}s` }}
        />
      ))}

      {/* LT1 zone */}
      <line x1="195" y1="30" x2="195" y2="200" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="5 3" opacity=".6" />
      <rect x="172" y="24" width="46" height="18" rx="4" fill="#22c55e" opacity=".12" className={`lp-hcurve__tag ${drawn ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.2s" }} />
      <text x="195" y="36" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="700" fontFamily="Space Grotesk" className={`lp-hcurve__tag ${drawn ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.2s" }}>LT1</text>

      {/* LT2 zone */}
      <line x1="335" y1="30" x2="335" y2="200" stroke="#f97316" strokeWidth="1.2" strokeDasharray="5 3" opacity=".6" />
      <rect x="312" y="24" width="46" height="18" rx="4" fill="#f97316" opacity=".12" className={`lp-hcurve__tag ${drawn ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.4s" }} />
      <text x="335" y="36" textAnchor="middle" fill="#f97316" fontSize="9" fontWeight="700" fontFamily="Space Grotesk" className={`lp-hcurve__tag ${drawn ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.4s" }}>LT2</text>

      {/* Confidence badge */}
      <rect x="400" y="60" width="88" height="22" rx="6" fill="#0e1e24" opacity=".85" className={`lp-hcurve__tag ${drawn ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.7s" }} />
      <text x="444" y="75" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk" className={`lp-hcurve__tag ${drawn ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.7s" }}>Confianza: 0.87</text>
    </svg>
  );
}

/* ═══════════════════════════════════════════
   Animated counter
   ═══════════════════════════════════════════ */
function AnimNum({ value, suffix = "", prefix = "" }: { value: string; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.5 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <span ref={ref} className={`lp-num ${visible ? "lp-num--vis" : ""}`}>
      {prefix}{value}{suffix}
    </span>
  );
}

/* ═══════════════════════════════════════════
   Main landing page
   ═══════════════════════════════════════════ */
export function LandingPage() {
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
        <div className="lp-w">
          <span className="lp-nav__brand">PeakAerobic</span>
          <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">Entrar</button>
        </div>
      </nav>

      {/* ══════════════ HERO ══════════════ */}
      <section className="lp-hero">
        <div className="lp-w lp-hero__grid">
          <div className="lp-hero__left">
            <p className="lp-hero__kicker">Motor de análisis de lactato</p>
            <h1 className="lp-hero__h1">
              Sube un test.<br />
              Ve lo que la curva<br />
              <em>realmente</em> dice.
            </h1>
            <p className="lp-hero__sub">
              Tres métodos científicos cruzan resultados para cada muestra.
              Si un punto es ruido, lo detecta. Si el atleta mejora, lo cuantifica.
              Los umbrales no son un número fijo — son una estimación honesta con su nivel de confianza.
            </p>
            <div className="lp-hero__acts">
              <a href="#acceso" className="lp-btn-solid">Probar gratis</a>
              <a href="#motor" className="lp-btn-ghost">Ver cómo funciona</a>
            </div>
          </div>
          <div className="lp-hero__right">
            <HeroCurve />
          </div>
        </div>
      </section>

      {/* ══════════════ MOTOR: 3 methods ══════════════ */}
      <section className="lp-section lp-section--dark" id="motor">
        <div className="lp-w">
          <p className="lp-ey">Detección de umbrales</p>
          <h2 className="lp-h2 lp-h2--light">3 métodos. 1 resultado fiable.</h2>
          <p className="lp-sub lp-sub--light">
            No dependemos de un solo algoritmo. El motor cruza tres métodos independientes
            y te dice cuánto confía en cada estimación.
          </p>

          <div className="lp-methods">
            <div className="lp-method">
              <span className="lp-method__tag">Baseline Rise</span>
              <p>Detecta LT1 como el primer punto que supera baseline + 0.5 mmol (criterio Faude 2009).
              LT2 por primera subida sostenida con verificación del punto siguiente — elimina picos transitorios.</p>
            </div>
            <div className="lp-method">
              <span className="lp-method__tag">Sustained Increase</span>
              <p>LT1 por primer ascenso mantenido entre etapas consecutivas.
              LT2 por rotura de pendiente — el momento donde la curva se dispara y no vuelve.</p>
            </div>
            <div className="lp-method">
              <span className="lp-method__tag">ModDmax</span>
              <p>Bishop 1998. Traza la línea desde el primer incremento significativo hasta el final
              y encuentra la máxima distancia perpendicular. Resuelve el fallo catastrófico del Dmax clásico
              en atletas entrenados con curvas convexas.</p>
            </div>
          </div>

          <div className="lp-methods__footer">
            <div className="lp-methods__stat">
              <span className="lp-methods__stat-val">Lactato</span>
              <span className="lp-methods__stat-desc">media de métodos</span>
            </div>
            <div className="lp-methods__stat">
              <span className="lp-methods__stat-val">Ritmo / Potencia / FC</span>
              <span className="lp-methods__stat-desc">mediana — apunta siempre a una muestra real</span>
            </div>
            <div className="lp-methods__stat">
              <span className="lp-methods__stat-val">Confianza</span>
              <span className="lp-methods__stat-desc">0.25 — 0.95 según acuerdo entre métodos</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ DYNAMIC THRESHOLDS ══════════════ */}
      <section className="lp-section" id="dinamicos">
        <div className="lp-w lp-split">
          <div className="lp-split__text">
            <p className="lp-ey">Umbrales dinámicos</p>
            <h2 className="lp-h2">Cada test nuevo hace al sistema más preciso</h2>
            <p className="lp-sub">
              Los umbrales no se congelan en el último test. El motor acumula datos,
              pondera por frescura, detecta outliers por Leave-One-Out,
              e interpola entre tests con brackets de 4 candidatos por lado.
            </p>
            <ul className="lp-checks">
              <li>Detección de outliers LOO — si un punto no cuadra, se penaliza, no se elimina</li>
              <li>Ponderación temporal — un test de hace 10 días pesa más que uno de hace 40</li>
              <li>Anclaje fisiológico — el LT2 práctico se blendea con el LT2 de inflexión real</li>
              <li>Alerta de datos stale — si llevas 42+ días sin test, el sistema lo dice</li>
            </ul>
          </div>
          <div className="lp-split__visual">
            <div className="lp-evo">
              <div className="lp-evo__row">
                <span className="lp-evo__date">12 Ene</span>
                <div className="lp-evo__bar" style={{ width: "62%" }}><span>LT2: 4:38/km</span></div>
              </div>
              <div className="lp-evo__row">
                <span className="lp-evo__date">8 Feb</span>
                <div className="lp-evo__bar" style={{ width: "70%" }}><span>LT2: 4:31/km</span></div>
              </div>
              <div className="lp-evo__row">
                <span className="lp-evo__date">5 Mar</span>
                <div className="lp-evo__bar lp-evo__bar--current" style={{ width: "78%" }}><span>LT2: 4:24/km</span></div>
              </div>
              <p className="lp-evo__caption">Confianza: 0.87 &middot; 3 tests en ventana &middot; 0 outliers</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ RACE PREDICTION ══════════════ */}
      <section className="lp-section lp-section--warm" id="prediccion">
        <div className="lp-w">
          <p className="lp-ey">Predicción de carreras</p>
          <h2 className="lp-h2">Del lactato al tiempo de carrera</h2>
          <p className="lp-sub">
            El modelo di Prampero + Daniels calcula la fracción sostenible de VO2max
            para cada distancia. VLamax modula el resultado: un atleta glucolítico
            rinde diferente en 5K que en maratón. No es una tabla — es fisiología.
          </p>

          <div className="lp-predictions">
            <div className="lp-pred">
              <span className="lp-pred__dist">5K</span>
              <span className="lp-pred__time"><AnimNum value="19:42" /></span>
              <span className="lp-pred__range">19:12 — 20:15</span>
            </div>
            <div className="lp-pred">
              <span className="lp-pred__dist">10K</span>
              <span className="lp-pred__time"><AnimNum value="41:08" /></span>
              <span className="lp-pred__range">40:05 — 42:20</span>
            </div>
            <div className="lp-pred">
              <span className="lp-pred__dist">Media Maratón</span>
              <span className="lp-pred__time"><AnimNum value="1:31:24" /></span>
              <span className="lp-pred__range">1:28:50 — 1:34:10</span>
            </div>
            <div className="lp-pred">
              <span className="lp-pred__dist">Maratón</span>
              <span className="lp-pred__time"><AnimNum value="3:12:40" /></span>
              <span className="lp-pred__range">3:06:00 — 3:20:00</span>
            </div>
          </div>

          <div className="lp-pred__inputs">
            <span>Inputs: LT2 pace + VO2max estimado + VLamax proxy + durability model (Zanini 2025)</span>
          </div>
        </div>
      </section>

      {/* ══════════════ PRESCRIPTION ══════════════ */}
      <section className="lp-section" id="prescripcion">
        <div className="lp-w lp-split lp-split--reverse">
          <div className="lp-split__text">
            <p className="lp-ey">Prescripción basada en gaps</p>
            <h2 className="lp-h2">No entrenas lo que quieres. Entrenas lo que necesitas.</h2>
            <p className="lp-sub">
              El motor analiza el perfil fisiológico del atleta, identifica el gap principal
              respecto a su objetivo de carrera, y selecciona el bloque de entrenamiento
              que cierra ese gap — siguiendo el modelo de 6 bloques de Olbrecht.
            </p>
            <div className="lp-blocks-demo">
              <div className="lp-bk lp-bk--active">
                <span className="lp-bk__name">Capacidad aeróbica</span>
                <span className="lp-bk__when">VLamax alta, gap LT1</span>
              </div>
              <div className="lp-bk">
                <span className="lp-bk__name">Desarrollo de umbral</span>
                <span className="lp-bk__when">Gap LT2, base construida</span>
              </div>
              <div className="lp-bk">
                <span className="lp-bk__name">Potencia aeróbica</span>
                <span className="lp-bk__when">Gap mínimo, necesita intensidad</span>
              </div>
              <div className="lp-bk">
                <span className="lp-bk__name">Capacidad anaeróbica</span>
                <span className="lp-bk__when">VLamax baja, evento corto</span>
              </div>
              <div className="lp-bk">
                <span className="lp-bk__name">Potencia anaeróbica</span>
                <span className="lp-bk__when">Pre-competición, 5K–10K</span>
              </div>
              <div className="lp-bk">
                <span className="lp-bk__name">Específico de competición</span>
                <span className="lp-bk__when">Pre-comp, larga distancia</span>
              </div>
            </div>
          </div>
          <div className="lp-split__visual">
            <div className="lp-gap-demo">
              <p className="lp-gap-demo__title">Análisis de gap — Running</p>
              <div className="lp-gap-demo__row">
                <span className="lp-gap-demo__label">LT2 actual</span>
                <div className="lp-gap-demo__bar" style={{ width: "68%" }} />
                <span className="lp-gap-demo__val">4:24/km</span>
              </div>
              <div className="lp-gap-demo__row">
                <span className="lp-gap-demo__label">LT2 objetivo (HM)</span>
                <div className="lp-gap-demo__bar lp-gap-demo__bar--target" style={{ width: "80%" }} />
                <span className="lp-gap-demo__val">4:08/km</span>
              </div>
              <div className="lp-gap-demo__gap">
                Gap: 16 seg/km &middot; Bloque recomendado: <strong>Desarrollo de umbral</strong>
              </div>
              <div className="lp-gap-demo__dose">
                Dosis: peldaño 3/6 &middot; 4 semanas &middot; Estructura 3+1
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ FOR WHOM ══════════════ */}
      <section className="lp-section lp-section--dark">
        <div className="lp-w">
          <p className="lp-ey lp-ey--light">Para quién</p>
          <h2 className="lp-h2 lp-h2--light">Coaches y atletas que miden lactato</h2>
          <div className="lp-duo">
            <div className="lp-duo__col">
              <h3 className="lp-duo__h3">Para el coach</h3>
              <ul className="lp-duo__list">
                <li>Sube tests y obtén umbrales instantáneos con nivel de confianza</li>
                <li>Visualiza la evolución de LT1/LT2 a lo largo de meses</li>
                <li>Recibe la recomendación de mesociclo basada en el gap fisiológico real</li>
                <li>Planifica en calendario con sesiones dosificadas y zonas actualizadas</li>
                <li>Predice tiempos de carrera basados en datos, no en tablas genéricas</li>
                <li>Monitoriza carga (ATL/CTL/TSB) con TSS calculado por potencia, ritmo o FC</li>
              </ul>
            </div>
            <div className="lp-duo__col">
              <h3 className="lp-duo__h3">Para el atleta</h3>
              <ul className="lp-duo__list">
                <li>Portal propio con la planificación de la semana</li>
                <li>Visualización de la curva de lactato de cada test</li>
                <li>Zonas de entrenamiento derivadas de tus umbrales reales</li>
                <li>Predicciones de carrera para 5K, 10K, media y maratón</li>
                <li>Evolución de fitness: CTL histórico, tendencia de umbrales</li>
                <li>Running, ciclismo y natación — todo en un sitio</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ SCIENCE STRIP ══════════════ */}
      <section className="lp-strip">
        <div className="lp-w lp-strip__grid">
          <div className="lp-strip__item">
            <span className="lp-strip__ref">Faude 2009</span>
            <span className="lp-strip__detail">Criterio LT1 baseline +0.5 mmol</span>
          </div>
          <div className="lp-strip__item">
            <span className="lp-strip__ref">Bishop 1998</span>
            <span className="lp-strip__detail">Modified Dmax para LT2</span>
          </div>
          <div className="lp-strip__item">
            <span className="lp-strip__ref">di Prampero</span>
            <span className="lp-strip__detail">Modelo energético de carrera</span>
          </div>
          <div className="lp-strip__item">
            <span className="lp-strip__ref">Daniels & Gilbert</span>
            <span className="lp-strip__detail">Fracción sostenible VO2max</span>
          </div>
          <div className="lp-strip__item">
            <span className="lp-strip__ref">Olbrecht</span>
            <span className="lp-strip__detail">6 bloques de prescripción</span>
          </div>
          <div className="lp-strip__item">
            <span className="lp-strip__ref">Zanini 2025</span>
            <span className="lp-strip__detail">Modelo de durabilidad</span>
          </div>
        </div>
      </section>

      {/* ══════════════ CTA ══════════════ */}
      <section className="lp-cta-section" id="acceso">
        <div className="lp-w lp-cta-section__inner">
          <h2 className="lp-h2">Estamos en beta abierta</h2>
          <p className="lp-sub">
            Acceso gratuito. Buscamos coaches y atletas que midan lactato
            y quieran ver qué puede hacer un motor como este con sus datos.
          </p>
          {submitted ? (
            <div className="lp-done">Recibido. Te escribimos pronto.</div>
          ) : (
            <form className="lp-form" onSubmit={handleBeta}>
              <input
                type="email"
                className="lp-form__input"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="lp-btn-solid">Solicitar acceso</button>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-foot">
        <div className="lp-w lp-foot__inner">
          <span className="lp-foot__brand">PeakAerobic</span>
          <span className="lp-foot__line">Ciencia aplicada al rendimiento.</span>
        </div>
      </footer>
    </div>
  );
}

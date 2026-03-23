import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LangProvider, useLang, LANG_LABELS, type Lang } from "../landing/i18n";
import { LactateDemo } from "../landing/LactateDemo";
import "../styles/landing.css";

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

/* ── Scroll-animated section wrapper ── */
function AnimSection({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const { ref, visible } = useInView(0.1);
  return (
    <div ref={ref} className={`lp-anim ${visible ? "lp-anim--in" : ""} ${className}`} id={id}>
      {children}
    </div>
  );
}

/* ── Journey timeline — auto-playing athlete lifecycle ── */
const JOURNEY_STEPS = [
  { key: "s1", icon: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  )},
  { key: "s2", icon: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )},
  { key: "s3", icon: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 20V10M18 20V4M6 20v-4"/>
    </svg>
  )},
  { key: "s4", icon: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )},
  { key: "s5", icon: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )},
  { key: "s6", icon: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  )},
  { key: "s7", icon: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  )},
];

/* Mini mockup screens for each journey step */
function JourneyMockup({ step }: { step: number }) {
  const mockups: Record<number, JSX.Element> = {
    0: ( /* Registration form */
      <div className="lp-jm">
        <div className="lp-jm__bar"><span className="lp-jm__dot"/><span className="lp-jm__dot"/><span className="lp-jm__dot"/></div>
        <div className="lp-jm__body">
          <div className="lp-jm__field" style={{width:"70%"}}/>
          <div className="lp-jm__field" style={{width:"85%"}}/>
          <div className="lp-jm__select">
            <span className="lp-jm__tag lp-jm__tag--on">Running</span>
            <span className="lp-jm__tag">Ciclismo</span>
            <span className="lp-jm__tag">Natacion</span>
          </div>
          <div className="lp-jm__field" style={{width:"60%"}}/>
          <div className="lp-jm__btn-mock"/>
        </div>
      </div>
    ),
    1: ( /* Uploading test data — lactate chart appearing */
      <div className="lp-jm">
        <div className="lp-jm__bar"><span className="lp-jm__dot"/><span className="lp-jm__dot"/><span className="lp-jm__dot"/></div>
        <div className="lp-jm__body">
          <svg viewBox="0 0 200 90" className="lp-jm__chart">
            <polyline points="10,75 40,72 70,68 100,58 130,40 160,20 190,8" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="70" y1="0" x2="70" y2="90" stroke="#22c55e" strokeWidth="1" strokeDasharray="3 2" opacity=".6"/>
            <line x1="140" y1="0" x2="140" y2="90" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" opacity=".6"/>
            <text x="70" y="88" textAnchor="middle" fill="#22c55e" fontSize="7" fontWeight="600">LT1</text>
            <text x="140" y="88" textAnchor="middle" fill="#ef4444" fontSize="7" fontWeight="600">LT2</text>
            {[10,40,70,100,130,160,190].map((x,i) => <circle key={i} cx={x} cy={[75,72,68,58,40,20,8][i]} r="3" fill="#d26a36"/>)}
          </svg>
        </div>
      </div>
    ),
    2: ( /* Physiological engine reading */
      <div className="lp-jm">
        <div className="lp-jm__bar"><span className="lp-jm__dot"/><span className="lp-jm__dot"/><span className="lp-jm__dot"/></div>
        <div className="lp-jm__body">
          <div className="lp-jm__reading">
            <div className="lp-jm__meter"><div className="lp-jm__meter-fill" style={{width:"72%"}}/></div>
            <span className="lp-jm__meter-label">Capacidad aerobica</span>
          </div>
          <div className="lp-jm__reading">
            <div className="lp-jm__meter"><div className="lp-jm__meter-fill lp-jm__meter-fill--warn" style={{width:"38%"}}/></div>
            <span className="lp-jm__meter-label">Potencia aerobica</span>
          </div>
          <div className="lp-jm__block-badge">Bloque: Threshold Development</div>
        </div>
      </div>
    ),
    3: ( /* Calendar with sessions */
      <div className="lp-jm">
        <div className="lp-jm__bar"><span className="lp-jm__dot"/><span className="lp-jm__dot"/><span className="lp-jm__dot"/></div>
        <div className="lp-jm__body">
          <div className="lp-jm__week">
            {["L","M","X","J","V","S","D"].map((d,i) => (
              <div key={d} className={`lp-jm__day ${i===5?"lp-jm__day--long":""} ${[1,3,5].includes(i)?"lp-jm__day--has":""}`}>
                <span className="lp-jm__day-label">{d}</span>
                {[1,3,5].includes(i) && <div className="lp-jm__day-bar" style={{height: i===5?"70%":"45%", background: i===5?"#22c55e":"#d26a36"}}/>}
              </div>
            ))}
          </div>
          <div className="lp-jm__garmin-row">
            <span className="lp-jm__garmin-icon">⌚</span>
            <span className="lp-jm__garmin-text">→ Garmin</span>
          </div>
        </div>
      </div>
    ),
    4: ( /* Training — progress accumulating */
      <div className="lp-jm">
        <div className="lp-jm__bar"><span className="lp-jm__dot"/><span className="lp-jm__dot"/><span className="lp-jm__dot"/></div>
        <div className="lp-jm__body">
          <div className="lp-jm__sessions">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="lp-jm__session-row">
                <span className="lp-jm__session-check">✓</span>
                <div className="lp-jm__session-bar" style={{width:`${40+i*10}%`}}/>
              </div>
            ))}
          </div>
          <div className="lp-jm__progress-ring">
            <svg viewBox="0 0 60 60" width="48" height="48">
              <circle cx="30" cy="30" r="24" fill="none" stroke="#e5e7eb" strokeWidth="4"/>
              <circle cx="30" cy="30" r="24" fill="none" stroke="#d26a36" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${2*Math.PI*24*0.65} ${2*Math.PI*24}`} transform="rotate(-90 30 30)"/>
              <text x="30" y="34" textAnchor="middle" fill="#d26a36" fontSize="11" fontWeight="700">65%</text>
            </svg>
          </div>
        </div>
      </div>
    ),
    5: ( /* New test — threshold evolution chart */
      <div className="lp-jm">
        <div className="lp-jm__bar"><span className="lp-jm__dot"/><span className="lp-jm__dot"/><span className="lp-jm__dot"/></div>
        <div className="lp-jm__body">
          <svg viewBox="0 0 200 80" className="lp-jm__chart">
            <text x="10" y="12" fill="#9ca3af" fontSize="7">LT2 (min/km)</text>
            <polyline points="20,60 60,55 100,48 140,38 180,28" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round"/>
            {[20,60,100,140,180].map((x,i) => <circle key={i} cx={x} cy={[60,55,48,38,28][i]} r="3.5" fill="#d26a36"/>)}
            <text x="20" y="72" fill="#9ca3af" fontSize="6">Test 1</text>
            <text x="100" y="72" fill="#9ca3af" fontSize="6">Test 3</text>
            <text x="175" y="72" fill="#9ca3af" fontSize="6">Test 5</text>
            <line x1="140" y1="0" x2="140" y2="80" stroke="#22c55e" strokeWidth="1" strokeDasharray="2 2" opacity=".4"/>
            <text x="143" y="10" fill="#22c55e" fontSize="6">Nuevo bloque</text>
          </svg>
        </div>
      </div>
    ),
    6: ( /* Goal achieved — celebration */
      <div className="lp-jm">
        <div className="lp-jm__bar"><span className="lp-jm__dot"/><span className="lp-jm__dot"/><span className="lp-jm__dot"/></div>
        <div className="lp-jm__body lp-jm__body--center">
          <svg viewBox="0 0 60 60" width="56" height="56">
            <circle cx="30" cy="30" r="28" fill="rgba(34,197,94,0.1)" stroke="#22c55e" strokeWidth="2"/>
            <polyline points="18 30 26 38 42 22" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="lp-jm__goal-text">
            <span className="lp-jm__goal-time">3:28:15</span>
            <span className="lp-jm__goal-label">Maraton — Objetivo cumplido</span>
          </div>
        </div>
      </div>
    ),
  };
  return mockups[step] || null;
}

function JourneyTimeline({ t }: { t: (k: string) => string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = JOURNEY_STEPS.length;

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActive(prev => (prev + 1) % total);
    }, 4000);
    return () => clearInterval(timer);
  }, [paused, total]);

  return (
    <div className="lp-journey" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* Progress bar */}
      <div className="lp-journey__progress">
        {JOURNEY_STEPS.map((s, i) => (
          <button
            key={s.key}
            className={`lp-journey__step-dot ${i === active ? "lp-journey__step-dot--active" : ""} ${i < active ? "lp-journey__step-dot--done" : ""}`}
            onClick={() => { setActive(i); setPaused(true); }}
            type="button"
            aria-label={`Step ${i + 1}`}
          >
            <span className="lp-journey__step-num">{i + 1}</span>
          </button>
        ))}
        <div className="lp-journey__progress-track">
          <div className="lp-journey__progress-fill" style={{ width: `${(active / (total - 1)) * 100}%` }}/>
        </div>
      </div>

      {/* Content area */}
      <div className="lp-journey__content">
        <div className="lp-journey__info">
          <div className="lp-journey__icon-wrap">
            {JOURNEY_STEPS[active].icon}
          </div>
          <h3 className="lp-journey__title">{t(`journey_${JOURNEY_STEPS[active].key}_title`)}</h3>
          <p className="lp-journey__desc">{t(`journey_${JOURNEY_STEPS[active].key}_desc`)}</p>
          <div className="lp-journey__controls">
            <button
              className="lp-journey__ctrl-btn"
              onClick={() => { setActive(prev => (prev - 1 + total) % total); setPaused(true); }}
              type="button"
              aria-label="Previous"
            >
              ←
            </button>
            <button
              className="lp-journey__ctrl-btn"
              onClick={() => setPaused(!paused)}
              type="button"
              aria-label={paused ? "Play" : "Pause"}
            >
              {paused ? "▶" : "❚❚"}
            </button>
            <button
              className="lp-journey__ctrl-btn"
              onClick={() => { setActive(prev => (prev + 1) % total); setPaused(true); }}
              type="button"
              aria-label="Next"
            >
              →
            </button>
          </div>
        </div>
        <div className="lp-journey__mockup">
          <JourneyMockup step={active} />
        </div>
      </div>
    </div>
  );
}

/* ── Elite Journey Timeline — dark theme ── */
const ELITE_STEPS = [
  { key: "s1", icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  )},
  { key: "s2", icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
    </svg>
  )},
  { key: "s3", icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )},
  { key: "s4", icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  )},
  { key: "s5", icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )},
  { key: "s6", icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )},
  { key: "s7", icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  )},
];

function EliteMockup({ step }: { step: number }) {
  const mockups: Record<number, JSX.Element> = {
    0: ( /* Initial call */
      <div className="lp-em">
        <div className="lp-em__bar"><span className="lp-em__dot"/><span className="lp-em__dot"/><span className="lp-em__dot"/></div>
        <div className="lp-em__body">
          <div className="lp-em__call-ui">
            <div className="lp-em__avatar-lg"/>
            <div className="lp-em__call-info">
              <div className="lp-em__call-name"/>
              <div className="lp-em__call-status">En llamada — 32:15</div>
            </div>
            <div className="lp-em__call-wave">
              {[18,28,40,32,22,36,26,42,20,30].map((h,i) => (
                <div key={i} className="lp-em__wave-bar" style={{height:`${h}%`, animationDelay:`${i*0.1}s`}}/>
              ))}
            </div>
          </div>
          <div className="lp-em__notes">
            <div className="lp-em__note-line" style={{width:"90%"}}/>
            <div className="lp-em__note-line" style={{width:"70%"}}/>
            <div className="lp-em__note-line" style={{width:"80%"}}/>
          </div>
        </div>
      </div>
    ),
    1: ( /* Full evaluation */
      <div className="lp-em">
        <div className="lp-em__bar"><span className="lp-em__dot"/><span className="lp-em__dot"/><span className="lp-em__dot"/></div>
        <div className="lp-em__body">
          <div className="lp-em__profile">
            <div className="lp-em__profile-row">
              <span className="lp-em__profile-label">LT2</span>
              <div className="lp-em__profile-bar"><div className="lp-em__profile-fill" style={{width:"68%"}}/></div>
              <span className="lp-em__profile-val">4:18/km</span>
            </div>
            <div className="lp-em__profile-row">
              <span className="lp-em__profile-label">LT1</span>
              <div className="lp-em__profile-bar"><div className="lp-em__profile-fill" style={{width:"52%"}}/></div>
              <span className="lp-em__profile-val">5:02/km</span>
            </div>
            <div className="lp-em__profile-row">
              <span className="lp-em__profile-label">VO2</span>
              <div className="lp-em__profile-bar"><div className="lp-em__profile-fill" style={{width:"58%"}}/></div>
              <span className="lp-em__profile-val">54.2</span>
            </div>
          </div>
          <div className="lp-em__verdict">Gap: potencia aerobica</div>
        </div>
      </div>
    ),
    2: ( /* Custom plan — approved session */
      <div className="lp-em">
        <div className="lp-em__bar"><span className="lp-em__dot"/><span className="lp-em__dot"/><span className="lp-em__dot"/></div>
        <div className="lp-em__body">
          <div className="lp-em__session">
            <div className="lp-em__session-head">
              <span className="lp-em__session-day">Martes</span>
              <span className="lp-em__approved-badge">Aprobada</span>
            </div>
            <div className="lp-em__session-title">4×8' LT2 / 3' rec</div>
            <div className="lp-em__session-detail">Zona 4 — 4:20-4:30/km</div>
          </div>
          <div className="lp-em__session">
            <div className="lp-em__session-head">
              <span className="lp-em__session-day">Jueves</span>
              <span className="lp-em__approved-badge">Aprobada</span>
            </div>
            <div className="lp-em__session-title">12km E2 progresivo</div>
            <div className="lp-em__session-detail">Zona 2-3 — descenso 5:30→5:00</div>
          </div>
          <div className="lp-em__garmin-push">→ Garmin</div>
        </div>
      </div>
    ),
    3: ( /* Weekly follow-up call */
      <div className="lp-em">
        <div className="lp-em__bar"><span className="lp-em__dot"/><span className="lp-em__dot"/><span className="lp-em__dot"/></div>
        <div className="lp-em__body">
          <div className="lp-em__review">
            <div className="lp-em__review-item">
              <span className="lp-em__review-icon">✓</span>
              <span>Semana completada: 5/5 sesiones</span>
            </div>
            <div className="lp-em__review-item">
              <span className="lp-em__review-icon lp-em__review-icon--warn">!</span>
              <span>RPE alto en intervalo jueves</span>
            </div>
            <div className="lp-em__review-item">
              <span className="lp-em__review-icon">↓</span>
              <span>Reducir volumen Z4 proxima semana</span>
            </div>
          </div>
          <div className="lp-em__call-badge">Llamada completada — 22 min</div>
        </div>
      </div>
    ),
    4: ( /* Real-time WhatsApp */
      <div className="lp-em">
        <div className="lp-em__bar"><span className="lp-em__dot"/><span className="lp-em__dot"/><span className="lp-em__dot"/></div>
        <div className="lp-em__body">
          <div className="lp-em__chat">
            <div className="lp-em__chat-msg lp-em__chat-msg--out">He dormido fatal, hago la sesion igualmente?</div>
            <div className="lp-em__chat-msg lp-em__chat-msg--in">Cambiamos: haz 40' Z1 suave. Mañana la clave.</div>
            <div className="lp-em__chat-msg lp-em__chat-msg--out">Hecho 👍</div>
            <div className="lp-em__chat-msg lp-em__chat-msg--in">Actualizado en tu Garmin.</div>
          </div>
        </div>
      </div>
    ),
    5: ( /* Race preparation */
      <div className="lp-em">
        <div className="lp-em__bar"><span className="lp-em__dot"/><span className="lp-em__dot"/><span className="lp-em__dot"/></div>
        <div className="lp-em__body">
          <div className="lp-em__race-plan">
            <div className="lp-em__race-header">Estrategia maraton</div>
            <div className="lp-em__race-row">
              <span className="lp-em__race-km">0-15km</span>
              <span className="lp-em__race-pace">4:45/km</span>
              <span className="lp-em__race-note">Conservador</span>
            </div>
            <div className="lp-em__race-row">
              <span className="lp-em__race-km">15-30km</span>
              <span className="lp-em__race-pace">4:40/km</span>
              <span className="lp-em__race-note">Progresion</span>
            </div>
            <div className="lp-em__race-row">
              <span className="lp-em__race-km">30-42km</span>
              <span className="lp-em__race-pace">4:35/km</span>
              <span className="lp-em__race-note">Cierre fuerte</span>
            </div>
            <div className="lp-em__race-footer">Nutricion: gel km 8, 16, 24, 32</div>
          </div>
        </div>
      </div>
    ),
    6: ( /* Race day — result */
      <div className="lp-em">
        <div className="lp-em__bar"><span className="lp-em__dot"/><span className="lp-em__dot"/><span className="lp-em__dot"/></div>
        <div className="lp-em__body lp-em__body--center">
          <svg viewBox="0 0 60 60" width="52" height="52">
            <circle cx="30" cy="30" r="28" fill="rgba(212,175,55,0.12)" stroke="#d4af37" strokeWidth="2"/>
            <polyline points="18 30 26 38 42 22" fill="none" stroke="#d4af37" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="lp-em__goal-text">
            <span className="lp-em__goal-time">3:18:42</span>
            <span className="lp-em__goal-label">Personal best — Maraton</span>
            <span className="lp-em__goal-sub">Negative split: 1:40:20 + 1:38:22</span>
          </div>
        </div>
      </div>
    ),
  };
  return mockups[step] || null;
}

function EliteJourneyTimeline({ t }: { t: (k: string) => string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = ELITE_STEPS.length;

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActive(prev => (prev + 1) % total);
    }, 4500);
    return () => clearInterval(timer);
  }, [paused, total]);

  return (
    <div className="lp-ejourney" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* Progress dots */}
      <div className="lp-ejourney__progress">
        {ELITE_STEPS.map((s, i) => (
          <button
            key={s.key}
            className={`lp-ejourney__dot ${i === active ? "lp-ejourney__dot--active" : ""} ${i < active ? "lp-ejourney__dot--done" : ""}`}
            onClick={() => { setActive(i); setPaused(true); }}
            type="button"
          >
            <span className="lp-ejourney__dot-num">{i + 1}</span>
          </button>
        ))}
        <div className="lp-ejourney__track">
          <div className="lp-ejourney__track-fill" style={{ width: `${(active / (total - 1)) * 100}%` }}/>
        </div>
      </div>

      {/* Content */}
      <div className="lp-ejourney__content">
        <div className="lp-ejourney__info">
          <div className="lp-ejourney__icon-wrap">
            {ELITE_STEPS[active].icon}
          </div>
          <h3 className="lp-ejourney__title">{t(`ej_${ELITE_STEPS[active].key}_title`)}</h3>
          <p className="lp-ejourney__desc">{t(`ej_${ELITE_STEPS[active].key}_desc`)}</p>
          <div className="lp-ejourney__controls">
            <button className="lp-ejourney__ctrl" onClick={() => { setActive(prev => (prev - 1 + total) % total); setPaused(true); }} type="button">←</button>
            <button className="lp-ejourney__ctrl" onClick={() => setPaused(!paused)} type="button">{paused ? "▶" : "❚❚"}</button>
            <button className="lp-ejourney__ctrl" onClick={() => { setActive(prev => (prev + 1) % total); setPaused(true); }} type="button">→</button>
          </div>
        </div>
        <div className="lp-ejourney__mockup">
          <EliteMockup step={active} />
        </div>
      </div>
    </div>
  );
}

/* ── Animated hero curve with LT1/LT2 markers ── */
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
      <text x="444" y="75" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="Space Grotesk" className={`lp-hcurve__tag ${on ? "lp-hcurve__tag--on" : ""}`} style={{ animationDelay: "1.7s" }}>Fiabilidad: alta</text>
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

/* ══════════════════════════════════════════════════════
   Inline translations — LANDING_T
   ══════════════════════════════════════════════════════ */
const LANDING_T: Record<string, Record<string, string>> = {
  es: {
    /* Nav */
    nav_how: "Cómo funciona",
    nav_pricing: "Planes",
    nav_compare: "Comparar",
    nav_blog: "Blog",
    nav_enter: "Entrar",

    /* Hero */
    hero_h1: "Antes entrenabas por sensaciones. Ahora entrenas con tu fisiología.",
    hero_sub: "Analiza tu lactato o frecuencia cardíaca, descubre tus zonas reales y recibe un plan que se adapta a ti.",
    hero_cta_primary: "Analiza tu test",
    hero_cta_secondary: "Ver planes",

    /* Social proof */
    proof_tests: "+2.400 tests analizados",
    proof_precision: "94% precisión en detección",
    proof_disciplines: "12 disciplinas",
    proof_free: "Gratis para siempre",

    /* Problem */
    problem_ey: "¿Te suena?",
    problem_h2: "Entrenas duro, pero algo no encaja",
    problem_1: "Sales a rodar suave y acabas reventado",
    problem_2: "Meses entrenando y tus tiempos no bajan",
    problem_3: "No sabes si tus series son realmente en umbral",
    problem_4: "Tu reloj dice una zona, tu cuerpo dice otra",
    problem_bottom: "No es falta de esfuerzo. Es falta de precisión.",

    /* How it works */
    how_ey: "Cómo funciona",
    how_h2: "De tus datos a un plan en 3 pasos",
    how_s1_num: "1",
    how_s1_title: "Haz un test",
    how_s1_desc: "Con datos de lactato o frecuencia cardíaca. Introduce ritmo/potencia y lactato, o pega desde CSV.",
    how_s2_num: "2",
    how_s2_title: "Recibe el análisis",
    how_s2_desc: "Tres métodos independientes detectan LT1 y LT2. Cada estimación incluye un score de confianza.",
    how_s3_num: "3",
    how_s3_title: "Entrena con datos reales",
    how_s3_desc: "Zonas de entrenamiento, predicciones de carrera y plan fisiológico — todo desde tus umbrales reales.",

    /* App showcase */
    ap_ey: "Tu portal de atleta",
    ap_h2: "Todo en una app",
    ap_1_title: "Zonas reales, no fórmulas",
    ap_1_desc: "7 zonas desde lactato real. FC, ritmo y potencia.",
    ap_1_badge: "Lactate Lab",
    ap_2_title: "Evolución de umbrales",
    ap_2_desc: "Tu LT1/LT2 evoluciona test a test.",
    ap_2_badge: "Lactate Lab",
    ap_3_title: "Predicciones de carrera",
    ap_3_desc: "5K a maratón con bandas de confianza.",
    ap_3_badge: "Lactate Lab",
    ap_4_title: "Tu día, de un vistazo",
    ap_4_desc: "Readiness, sesión detallada y bienestar.",
    ap_4_badge: "Pro",
    ap_5_title: "Semana y calendario",
    ap_5_desc: "Vista semanal con zonas y volumen.",
    ap_5_badge: "Pro",
    ap_6_title: "Objetivo + fisiología = plan",
    ap_6_desc: "Tu objetivo y tus umbrales definen cada fase del plan.",
    ap_6_badge: "Pro+",

    /* Two paths — Pro & Pro+ */
    paths_ey: "Elige tu plan",
    paths_h2: "El motor que entrena por ti",
    paths_shared_sub: "Ambos planes incluyen motor fisiológico, planificación, Garmin y soporte supervisado.",
    paths_pro_badge: "Pro",
    paths_pro_title: "1 disciplina",
    paths_pro_desc: "Todo el motor fisiológico para tu deporte principal.",
    paths_pro_price: "19,99\u20AC/mes",
    paths_pro_cta: "Unirse al plan",
    paths_pro_plus_badge: "Pro+",
    paths_pro_plus_popular: "Popular",
    paths_pro_plus_title: "Hasta 3 disciplinas",
    paths_pro_plus_desc: "Running, ciclismo y natación. Un motor para cada una.",
    paths_pro_plus_price: "39,99\u20AC/mes",
    paths_pro_plus_cta: "Unirse al plan",
    paths_feat_1: "Motor fisiológico completo",
    paths_feat_2: "Selección automática de bloque",
    paths_feat_3: "Dose ladders y mesociclos",
    paths_feat_4: "Calendario semanal + Garmin",
    paths_feat_5: "Supervisado por especialistas",
    paths_feat_6: "Soporte por email",
    /* Elite premium */
    elite_ey: "Para quien quiere lo mejor",
    elite_h2: "Elite: tu especialista dedicado",
    elite_sub: "Todo lo de Pro+, más una persona dedicada exclusivamente a ti.",
    elite_feat_1: "Revisión semanal personalizada de tu plan",
    elite_feat_2: "Ajustes por contexto, fatiga y sensaciones",
    elite_feat_3: "Cada sesión aprobada antes de enviártela",
    elite_feat_4: "Llamada semanal 1:1 con tu especialista",
    elite_feat_5: "WhatsApp directo para dudas en el momento",
    elite_feat_6: "Estrategia de carrera a medida",
    elite_price: "199\u20AC/mes",
    elite_cta: "Reservar llamada",
    elite_note: "Plazas limitadas — solo aceptamos atletas con los que podemos trabajar bien.",
    /* Elite journey */
    ej_s1_title: "Llamada inicial",
    ej_s1_desc: "Conocemos tu historial, objetivos y disponibilidad. Diseñamos la hoja de ruta juntos.",
    ej_s2_title: "Evaluación completa",
    ej_s2_desc: "Tu especialista analiza tus tests, tu historial y define tu perfil fisiológico.",
    ej_s3_title: "Plan a medida",
    ej_s3_desc: "Cada sesión pensada para ti. Aprobada por tu especialista antes de llegar a tu Garmin.",
    ej_s4_title: "Seguimiento semanal",
    ej_s4_desc: "Llamada 1:1 cada semana. Revisamos sensaciones, datos y ajustamos lo necesario.",
    ej_s5_title: "Ajustes en tiempo real",
    ej_s5_desc: "WhatsApp directo. Mala noche, molestia muscular — tu plan se adapta al momento.",
    ej_s6_title: "Preparación para competición",
    ej_s6_desc: "Estrategia de carrera a medida. Ritmos, nutrición, calentamiento — todo cerrado.",
    ej_s7_title: "Día de carrera",
    ej_s7_desc: "Llegas preparado. Sin dudas. Con alguien detrás que conoce cada sesión que has hecho.",

    /* Journey */
    /* Mobile app */
    mobile_ey: "Disponible en móvil",
    mobile_h2: "Todo tu rendimiento en el bolsillo",
    mobile_sub: "No es solo tu plan de entreno. Es tu portal completo de rendimiento desde cualquier lugar.",
    mobile_feat_1: "Sesión del día, calendario y métricas de entreno",
    mobile_feat_2: "Sueño, HRV y bienestar diario",
    mobile_feat_3: "Registra tests de lactato y FC desde el móvil",
    mobile_feat_4: "Gráficas de evolución de umbrales y zonas",
    mobile_feat_5: "Sincronización automática con Garmin",
    mobile_feat_6: "Notificaciones de sesión, test y readiness",
    mobile_cta: "Disponible en iOS y Android",

    journey_ey: "Tu recorrido con PeakAerobic",
    journey_h2: "Del primer test a tu mejor marca",
    journey_s1_title: "Regístrate y define tu objetivo",
    journey_s1_desc: "Elige tu disciplina, evento y fecha. Tu perfil se adapta a ti.",
    journey_s2_title: "Sube tu primer test",
    journey_s2_desc: "Lactato o FC. El motor detecta LT1/LT2 con 7 métodos.",
    journey_s3_title: "El motor lee tu fisiología",
    journey_s3_desc: "Perfil metabólico, debilidad limitante y bloque recomendado.",
    journey_s4_title: "Tu mesociclo listo",
    journey_s4_desc: "Calendario semanal con sesiones, dosis y envío a Garmin.",
    journey_s5_title: "Entrena y acumula datos",
    journey_s5_desc: "Cada sesión alimenta tu perfil. Progresión sin saltos bruscos.",
    journey_s6_title: "Nuevo test, nuevos umbrales",
    journey_s6_desc: "Tu LT1/LT2 evoluciona. El motor ajusta el siguiente bloque.",
    journey_s7_title: "Objetivo alcanzado",
    journey_s7_desc: "Predicción cumplida. Tu fisiología respaldó cada decisión.",

    /* Pricing */
    price_ey: "Planes",
    price_h2: "Empieza gratis. Mejora cuando estés listo.",
    price_billing_note: "Facturación trimestral/anual disponible",
    p5_free_name: "Gratis",
    p5_free_price: "0\u20AC",
    p5_free_period: "",
    p5_free_desc: "Zonas desde FC, 2 tests de lactato y sugerencia diaria.",
    p5_free_cta: "Empieza gratis",
    p5_lab_name: "Lactate Lab",
    p5_lab_price: "7,99\u20AC",
    p5_lab_period: "/mes",
    p5_lab_desc: "Tests ilimitados, 7 zonas reales, umbrales dinámicos y predicciones.",
    p5_lab_cta: "Unirse al plan",
    p5_ai_name: "Pro",
    p5_ai_price: "19,99\u20AC",
    p5_ai_period: "/mes",
    p5_ai_desc: "Motor fisiológico, planificación, Garmin y soporte por email. 1 disciplina.",
    p5_ai_cta: "Unirse al plan",
    p5_pro_name: "Pro+",
    p5_pro_badge: "Popular",
    p5_pro_price: "39,99\u20AC",
    p5_pro_period: "/mes",
    p5_pro_desc: "Todo Pro para hasta 3 disciplinas. Running, ciclismo y natación.",
    p5_pro_cta: "Unirse al plan",
    p5_elite_name: "Elite",
    p5_elite_price: "199\u20AC",
    p5_elite_period: "/mes",
    p5_elite_desc: "Coaching 1:1 con fisiólogo. Llamada semanal y WhatsApp directo.",
    p5_elite_cta: "Reservar llamada",
    p5_compare_cta: "Comparar todos los planes \u2192",

    /* FAQ */
    faq_ey: "Preguntas frecuentes",
    faq_q0: "¿Qué son LT1 y LT2?",
    faq_a0: "LT1 (umbral aeróbico) es la intensidad a la que el lactato empieza a subir por encima de tu baseline. LT2 (umbral anaeróbico) es la intensidad a la que el lactato se acumula de forma exponencial. Entrenar entre ambos es la clave de la resistencia. PeakAerobic detecta ambos automáticamente desde un test de lactato.",
    faq_q1: "¿Necesito un test de lactato?",
    faq_a1: "No. Empieza gratis con FC. Pero si tienes datos, el análisis es mucho más preciso.",
    faq_q2: "No hago tests de lactato. ¿PeakAerobic es para mí?",
    faq_a2: "Sí. Empieza con tus datos de FC — recibirás zonas estimadas, sugerencias y predicciones. Cuando hagas tu primer test, PeakAerobic recalculará todo con datos reales.",
    faq_q3: "¿Qué tan precisas son las zonas de FC?",
    faq_a3: "Las zonas de FC tienen un margen de \u00B110-20 ppm. Somos transparentes: las zonas de HR son estimaciones. Las zonas de lactato son mediciones. Por eso mostramos tu nivel de confianza.",
    faq_q4: "¿En qué se diferencia de INSCYD o TrainingPeaks?",
    faq_a4: "INSCYD cobra 150-350\u20AC/test y necesita un coach certificado. TrainingPeaks es un calendario sin análisis de lactato. PeakAerobic combina ambos desde 7,99\u20AC/mes.",
    faq_q5: "¿Quién revisa mi plan cada semana?",
    faq_a5: "David, fisiólogo del ejercicio y fundador. No es un chatbot.",
    faq_q6: "¿Necesito un medidor de lactato caro?",
    faq_a6: "Los medidores portátiles cuestan 150-300\u20AC (Lactate Plus, Lactate Pro 2). Es la misma inversión que 1-2 tests de laboratorio, pero puedes testar ilimitado.",
    faq_q7: "¿Qué deportes cubre?",
    faq_a7: "Running, ciclismo, natación y triatlón. Con zonas específicas por deporte.",
    faq_q8: "¿Mis datos están seguros?",
    faq_a8: "Tus datos son tuyos. No compartimos nada con terceros.",

    /* Final CTA */
    cta_h2: "Deja de adivinar. Empieza a entrenar con datos reales.",
    cta_btn: "Empieza gratis",
    cta_sub: "Sin tarjeta de crédito. Sin compromiso.",

    /* Footer */
    foot_tagline: "Entrenamiento basado en tu fisiología",
    foot_privacy: "Privacidad",
    foot_compare: "Comparar planes",
  },
  en: {
    /* Nav */
    nav_how: "How it works",
    nav_pricing: "Plans",
    nav_compare: "Compare",
    nav_blog: "Blog",
    nav_enter: "Log in",

    /* Hero */
    hero_h1: "You used to train by feel. Now you train with your physiology.",
    hero_sub: "Analyze your lactate or heart rate data, discover your real zones and get a plan that adapts to you.",
    hero_cta_primary: "Analyze your test",
    hero_cta_secondary: "See plans",

    /* Social proof */
    proof_tests: "+2,400 tests analyzed",
    proof_precision: "94% detection accuracy",
    proof_disciplines: "12 disciplines",
    proof_free: "Free forever",

    /* Problem */
    problem_ey: "Sound familiar?",
    problem_h2: "You train hard, but something doesn't add up",
    problem_1: "Easy runs that leave you wrecked",
    problem_2: "Months of training, times won't drop",
    problem_3: "You don't know if your intervals are really at threshold",
    problem_4: "Your watch says one zone, your body says another",
    problem_bottom: "It's not lack of effort. It's lack of precision.",

    /* How it works */
    how_ey: "How it works",
    how_h2: "From your data to a plan in 3 steps",
    how_s1_num: "1",
    how_s1_title: "Do a test",
    how_s1_desc: "With lactate data or heart rate. Enter pace/power and lactate, or paste from CSV.",
    how_s2_num: "2",
    how_s2_title: "Get the analysis",
    how_s2_desc: "Three independent methods detect LT1 and LT2. Each estimate includes a confidence score.",
    how_s3_num: "3",
    how_s3_title: "Train with real data",
    how_s3_desc: "Training zones, race predictions and physiological plan \u2014 all from your real thresholds.",

    /* App showcase */
    ap_ey: "Your athlete portal",
    ap_h2: "Everything in one app",
    ap_1_title: "Real zones, not formulas",
    ap_1_desc: "7 zones from real lactate. HR, pace and power.",
    ap_1_badge: "Lactate Lab",
    ap_2_title: "Threshold evolution",
    ap_2_desc: "Your LT1/LT2 evolves test by test.",
    ap_2_badge: "Lactate Lab",
    ap_3_title: "Race predictions",
    ap_3_desc: "5K to marathon with confidence bands.",
    ap_3_badge: "Lactate Lab",
    ap_4_title: "Your day, at a glance",
    ap_4_desc: "Readiness, detailed session and wellness.",
    ap_4_badge: "Pro",
    ap_5_title: "Week and calendar",
    ap_5_desc: "Weekly view with zones and volume.",
    ap_5_badge: "Pro",
    ap_6_title: "Goal + physiology = plan",
    ap_6_desc: "Your goal and thresholds shape every phase of the plan.",
    ap_6_badge: "Pro+",

    /* Two paths — Pro & Pro+ */
    paths_ey: "Choose your plan",
    paths_h2: "The engine that trains for you",
    paths_shared_sub: "Both plans include physiological engine, planning, Garmin and supervised support.",
    paths_pro_badge: "Pro",
    paths_pro_title: "1 discipline",
    paths_pro_desc: "The full physiological engine for your main sport.",
    paths_pro_price: "\u20AC19.99/mo",
    paths_pro_cta: "Join plan",
    paths_pro_plus_badge: "Pro+",
    paths_pro_plus_popular: "Popular",
    paths_pro_plus_title: "Up to 3 disciplines",
    paths_pro_plus_desc: "Running, cycling and swimming. One engine for each.",
    paths_pro_plus_price: "\u20AC39.99/mo",
    paths_pro_plus_cta: "Join plan",
    paths_feat_1: "Full physiological engine",
    paths_feat_2: "Automatic block selection",
    paths_feat_3: "Dose ladders & mesocycles",
    paths_feat_4: "Weekly calendar + Garmin",
    paths_feat_5: "Supervised by specialists",
    paths_feat_6: "Email support",
    /* Elite premium */
    elite_ey: "For those who want the best",
    elite_h2: "Elite: your dedicated specialist",
    elite_sub: "Everything in Pro+, plus a person dedicated exclusively to you.",
    elite_feat_1: "Personalized weekly review of your plan",
    elite_feat_2: "Adjustments based on context, fatigue and feel",
    elite_feat_3: "Every session approved before it reaches you",
    elite_feat_4: "Weekly 1:1 call with your specialist",
    elite_feat_5: "Direct WhatsApp for real-time questions",
    elite_feat_6: "Custom race strategy",
    elite_price: "\u20AC199/mo",
    elite_cta: "Book a call",
    elite_note: "Limited spots \u2014 we only take athletes we can work with properly.",
    /* Elite journey */
    ej_s1_title: "Initial call",
    ej_s1_desc: "We learn your history, goals and availability. We design the roadmap together.",
    ej_s2_title: "Full evaluation",
    ej_s2_desc: "Your specialist analyzes your tests, history and defines your physiological profile.",
    ej_s3_title: "Custom plan",
    ej_s3_desc: "Every session designed for you. Approved by your specialist before it hits your Garmin.",
    ej_s4_title: "Weekly follow-up",
    ej_s4_desc: "1:1 call every week. We review feel, data and adjust what's needed.",
    ej_s5_title: "Real-time adjustments",
    ej_s5_desc: "Direct WhatsApp. Bad sleep, muscle issue — your plan adapts in the moment.",
    ej_s6_title: "Race preparation",
    ej_s6_desc: "Custom race strategy. Pacing, nutrition, warm-up — everything locked in.",
    ej_s7_title: "Race day",
    ej_s7_desc: "You arrive prepared. No doubts. With someone behind you who knows every session you've done.",

    /* Journey */
    /* Mobile app */
    mobile_ey: "Available on mobile",
    mobile_h2: "Your full performance in your pocket",
    mobile_sub: "It's not just your training plan. It's your complete performance portal from anywhere.",
    mobile_feat_1: "Today's session, calendar and training metrics",
    mobile_feat_2: "Sleep, HRV and daily wellness",
    mobile_feat_3: "Log lactate and HR tests from your phone",
    mobile_feat_4: "Threshold evolution charts and zones",
    mobile_feat_5: "Automatic Garmin sync",
    mobile_feat_6: "Session, test and readiness notifications",
    mobile_cta: "Available on iOS and Android",

    journey_ey: "Your journey with PeakAerobic",
    journey_h2: "From first test to your personal best",
    journey_s1_title: "Sign up and set your goal",
    journey_s1_desc: "Choose your discipline, event and date. Your profile adapts to you.",
    journey_s2_title: "Upload your first test",
    journey_s2_desc: "Lactate or HR. The engine detects LT1/LT2 with 7 methods.",
    journey_s3_title: "The engine reads your physiology",
    journey_s3_desc: "Metabolic profile, limiting weakness and recommended block.",
    journey_s4_title: "Your mesocycle is ready",
    journey_s4_desc: "Weekly calendar with sessions, doses and push to Garmin.",
    journey_s5_title: "Train and accumulate data",
    journey_s5_desc: "Every session feeds your profile. Progression without abrupt jumps.",
    journey_s6_title: "New test, new thresholds",
    journey_s6_desc: "Your LT1/LT2 evolves. The engine adjusts the next block.",
    journey_s7_title: "Goal achieved",
    journey_s7_desc: "Prediction fulfilled. Your physiology backed every decision.",

    /* Pricing */
    price_ey: "Plans",
    price_h2: "Start free. Upgrade when you're ready.",
    price_billing_note: "Quarterly/annual billing available",
    p5_free_name: "Free",
    p5_free_price: "\u20AC0",
    p5_free_period: "",
    p5_free_desc: "HR zones, 2 lactate tests and daily suggestion.",
    p5_free_cta: "Start free",
    p5_lab_name: "Lactate Lab",
    p5_lab_price: "\u20AC7.99",
    p5_lab_period: "/mo",
    p5_lab_desc: "Unlimited tests, 7 real zones, dynamic thresholds and predictions.",
    p5_lab_cta: "Join plan",
    p5_ai_name: "Pro",
    p5_ai_price: "\u20AC19.99",
    p5_ai_period: "/mo",
    p5_ai_desc: "Physiological engine, planning, Garmin and email support. 1 discipline.",
    p5_ai_cta: "Join plan",
    p5_pro_name: "Pro+",
    p5_pro_badge: "Popular",
    p5_pro_price: "\u20AC39.99",
    p5_pro_period: "/mo",
    p5_pro_desc: "Everything in Pro for up to 3 disciplines. Running, cycling and swimming.",
    p5_pro_cta: "Join plan",
    p5_elite_name: "Elite",
    p5_elite_price: "\u20AC199",
    p5_elite_period: "/mo",
    p5_elite_desc: "1:1 coaching with physiologist. Weekly call and direct WhatsApp.",
    p5_elite_cta: "Book a call",
    p5_compare_cta: "Compare all plans \u2192",

    /* FAQ */
    faq_ey: "FAQ",
    faq_q0: "What are LT1 and LT2?",
    faq_a0: "LT1 (aerobic threshold) is the intensity at which lactate begins to rise above your baseline. LT2 (anaerobic threshold) is the intensity at which lactate accumulates exponentially. Training between both is the key to endurance. PeakAerobic detects both automatically from a lactate test.",
    faq_q1: "Do I need a lactate test?",
    faq_a1: "No. Start free with HR. But if you have data, the analysis is much more precise.",
    faq_q2: "I don't do lactate tests. Is PeakAerobic for me?",
    faq_a2: "Yes. Start with your HR data \u2014 you'll get estimated zones, suggestions and predictions. When you do your first test, PeakAerobic will recalculate everything with real data.",
    faq_q3: "How accurate are HR zones?",
    faq_a3: "HR zones have a \u00B110-20 bpm margin. We're transparent: HR zones are estimates. Lactate zones are measurements. That's why we show your confidence level.",
    faq_q4: "How is it different from INSCYD or TrainingPeaks?",
    faq_a4: "INSCYD charges \u20AC150-350/test and needs a certified coach. TrainingPeaks is a calendar without lactate analysis. PeakAerobic combines both from \u20AC7.99/mo.",
    faq_q5: "Who reviews my plan each week?",
    faq_a5: "David, exercise physiologist and founder. Not a chatbot.",
    faq_q6: "Do I need an expensive lactate meter?",
    faq_a6: "Portable meters cost \u20AC150-300 (Lactate Plus, Lactate Pro 2). Same investment as 1-2 lab tests, but you can test unlimited.",
    faq_q7: "What sports does it cover?",
    faq_a7: "Running, cycling, swimming and triathlon. With sport-specific zones.",
    faq_q8: "Is my data secure?",
    faq_a8: "Your data is yours. We don't share anything with third parties.",

    /* Final CTA */
    cta_h2: "Stop guessing. Start training with real data.",
    cta_btn: "Start free",
    cta_sub: "No credit card. No commitment.",

    /* Footer */
    foot_tagline: "Training based on your physiology",
    foot_privacy: "Privacy",
    foot_compare: "Compare plans",
  },
  de: {
    /* Nav */
    nav_how: "So funktioniert's",
    nav_pricing: "Pläne",
    nav_compare: "Vergleichen",
    nav_blog: "Blog",
    nav_enter: "Anmelden",

    /* Hero */
    hero_h1: "Früher hast du nach Gefühl trainiert. Jetzt trainierst du mit deiner Physiologie.",
    hero_sub: "Analysiere dein Laktat oder deine Herzfrequenz, entdecke deine echten Zonen und erhalte einen Plan, der sich an dich anpasst.",
    hero_cta_primary: "Test analysieren",
    hero_cta_secondary: "Pläne ansehen",

    /* Social proof */
    proof_tests: "+2.400 Tests analysiert",
    proof_precision: "94% Erkennungsgenauigkeit",
    proof_disciplines: "12 Disziplinen",
    proof_free: "Für immer kostenlos",

    /* Problem */
    problem_ey: "Kommt dir das bekannt vor?",
    problem_h2: "Du trainierst hart, aber etwas passt nicht",
    problem_1: "Lockere Läufe, die dich völlig fertig machen",
    problem_2: "Monate Training und deine Zeiten sinken nicht",
    problem_3: "Du weißt nicht, ob deine Intervalle wirklich an der Schwelle sind",
    problem_4: "Deine Uhr sagt Zone X, dein Körper sagt etwas anderes",
    problem_bottom: "Es fehlt nicht an Einsatz. Es fehlt an Präzision.",

    /* How it works */
    how_ey: "So funktioniert's",
    how_h2: "Von deinen Daten zum Plan in 3 Schritten",
    how_s1_num: "1",
    how_s1_title: "Mach einen Test",
    how_s1_desc: "Mit Laktatdaten oder Herzfrequenz. Tempo/Leistung und Laktat eingeben oder aus CSV einfügen.",
    how_s2_num: "2",
    how_s2_title: "Analyse erhalten",
    how_s2_desc: "Drei unabhängige Methoden erkennen LT1 und LT2. Jede Schätzung enthält einen Konfidenzwert.",
    how_s3_num: "3",
    how_s3_title: "Mit echten Daten trainieren",
    how_s3_desc: "Trainingszonen, Wettkampfprognosen und physiologischer Plan — alles aus deinen realen Schwellenwerten.",

    /* App showcase */
    ap_ey: "Dein Athleten-Portal",
    ap_h2: "Alles in einer App",
    ap_1_title: "Echte Zonen, keine Formeln",
    ap_1_desc: "7 Zonen aus echtem Laktat. HF, Tempo und Leistung.",
    ap_1_badge: "Lactate Lab",
    ap_2_title: "Schwellenentwicklung",
    ap_2_desc: "Dein LT1/LT2 entwickelt sich Test für Test.",
    ap_2_badge: "Lactate Lab",
    ap_3_title: "Wettkampfprognosen",
    ap_3_desc: "5K bis Marathon mit Konfidenzbändern.",
    ap_3_badge: "Lactate Lab",
    ap_4_title: "Dein Tag auf einen Blick",
    ap_4_desc: "Readiness, detaillierte Einheit und Wohlbefinden.",
    ap_4_badge: "Pro",
    ap_5_title: "Woche und Kalender",
    ap_5_desc: "Wochenansicht mit Zonen und Umfang.",
    ap_5_badge: "Pro",
    ap_6_title: "Ziel + Physiologie = Plan",
    ap_6_desc: "Dein Ziel und deine Schwellenwerte bestimmen jede Phase des Plans.",
    ap_6_badge: "Pro+",

    /* Two paths — Pro & Pro+ */
    paths_ey: "Wähle deinen Plan",
    paths_h2: "Der Motor, der für dich trainiert",
    paths_shared_sub: "Beide Pläne beinhalten physiologische Engine, Planung, Garmin und betreuten Support.",
    paths_pro_badge: "Pro",
    paths_pro_title: "1 Disziplin",
    paths_pro_desc: "Die komplette physiologische Engine für deine Hauptsportart.",
    paths_pro_price: "19,99\u20AC/Monat",
    paths_pro_cta: "Plan beitreten",
    paths_pro_plus_badge: "Pro+",
    paths_pro_plus_popular: "Beliebt",
    paths_pro_plus_title: "Bis zu 3 Disziplinen",
    paths_pro_plus_desc: "Laufen, Radfahren und Schwimmen. Eine Engine für jede.",
    paths_pro_plus_price: "39,99\u20AC/Monat",
    paths_pro_plus_cta: "Plan beitreten",
    paths_feat_1: "Vollständige physiologische Engine",
    paths_feat_2: "Automatische Blockauswahl",
    paths_feat_3: "Dose Ladders und Mesozyklen",
    paths_feat_4: "Wochenkalender + Garmin",
    paths_feat_5: "Von Spezialisten betreut",
    paths_feat_6: "E-Mail-Support",
    /* Elite premium */
    elite_ey: "Für alle, die das Beste wollen",
    elite_h2: "Elite: dein persönlicher Spezialist",
    elite_sub: "Alles aus Pro+, plus eine Person, die sich ausschließlich um dich kümmert.",
    elite_feat_1: "Wöchentliche personalisierte Planüberprüfung",
    elite_feat_2: "Anpassungen nach Kontext, Ermüdung und Gefühl",
    elite_feat_3: "Jede Einheit wird genehmigt, bevor sie dich erreicht",
    elite_feat_4: "Wöchentliches 1:1-Gespräch mit deinem Spezialisten",
    elite_feat_5: "Direkter WhatsApp-Kontakt für Fragen in Echtzeit",
    elite_feat_6: "Maßgeschneiderte Wettkampfstrategie",
    elite_price: "199\u20AC/Monat",
    elite_cta: "Gespräch buchen",
    elite_note: "Begrenzte Plätze — wir nehmen nur Athleten an, mit denen wir gut arbeiten können.",
    /* Elite journey */
    ej_s1_title: "Erstgespräch",
    ej_s1_desc: "Wir lernen deine Geschichte, Ziele und Verfügbarkeit kennen. Gemeinsam entwerfen wir den Fahrplan.",
    ej_s2_title: "Vollständige Evaluation",
    ej_s2_desc: "Dein Spezialist analysiert deine Tests, deine Historie und definiert dein physiologisches Profil.",
    ej_s3_title: "Maßgeschneiderter Plan",
    ej_s3_desc: "Jede Einheit für dich gestaltet. Von deinem Spezialisten genehmigt, bevor sie auf deinem Garmin landet.",
    ej_s4_title: "Wöchentliches Follow-up",
    ej_s4_desc: "1:1-Gespräch jede Woche. Wir besprechen Gefühl, Daten und passen an, was nötig ist.",
    ej_s5_title: "Echtzeit-Anpassungen",
    ej_s5_desc: "Direkter WhatsApp-Kontakt. Schlechte Nacht, Muskelbeschwerden — dein Plan passt sich sofort an.",
    ej_s6_title: "Wettkampfvorbereitung",
    ej_s6_desc: "Maßgeschneiderte Wettkampfstrategie. Tempi, Ernährung, Aufwärmen — alles festgelegt.",
    ej_s7_title: "Wettkampftag",
    ej_s7_desc: "Du kommst vorbereitet. Ohne Zweifel. Mit jemandem hinter dir, der jede Einheit kennt, die du gemacht hast.",

    /* Mobile app */
    mobile_ey: "Auf dem Handy verfügbar",
    mobile_h2: "Deine gesamte Leistung in der Tasche",
    mobile_sub: "Nicht nur dein Trainingsplan. Dein komplettes Leistungsportal von überall aus.",
    mobile_feat_1: "Tageseinheit, Kalender und Trainingsmetriken",
    mobile_feat_2: "Schlaf, HRV und tägliches Wohlbefinden",
    mobile_feat_3: "Laktat- und HF-Tests vom Handy aufzeichnen",
    mobile_feat_4: "Diagramme zur Schwellenentwicklung und Zonen",
    mobile_feat_5: "Automatische Garmin-Synchronisierung",
    mobile_feat_6: "Benachrichtigungen für Einheiten, Tests und Readiness",
    mobile_cta: "Verfügbar für iOS und Android",

    /* Journey */
    journey_ey: "Deine Reise mit PeakAerobic",
    journey_h2: "Vom ersten Test zur persönlichen Bestleistung",
    journey_s1_title: "Registriere dich und setze dein Ziel",
    journey_s1_desc: "Wähle deine Disziplin, deinen Wettkampf und das Datum. Dein Profil passt sich an.",
    journey_s2_title: "Lade deinen ersten Test hoch",
    journey_s2_desc: "Laktat oder HF. Die Engine erkennt LT1/LT2 mit 7 Methoden.",
    journey_s3_title: "Die Engine liest deine Physiologie",
    journey_s3_desc: "Metabolisches Profil, limitierende Schwäche und empfohlener Block.",
    journey_s4_title: "Dein Mesozyklus ist bereit",
    journey_s4_desc: "Wochenkalender mit Einheiten, Dosen und Push an Garmin.",
    journey_s5_title: "Trainiere und sammle Daten",
    journey_s5_desc: "Jede Einheit speist dein Profil. Progression ohne abrupte Sprünge.",
    journey_s6_title: "Neuer Test, neue Schwellenwerte",
    journey_s6_desc: "Dein LT1/LT2 entwickelt sich. Die Engine passt den nächsten Block an.",
    journey_s7_title: "Ziel erreicht",
    journey_s7_desc: "Prognose erfüllt. Deine Physiologie hat jede Entscheidung gestützt.",

    /* Pricing */
    price_ey: "Pläne",
    price_h2: "Starte kostenlos. Upgrade, wenn du bereit bist.",
    price_billing_note: "Quartals-/Jahresabrechnung verfügbar",
    p5_free_name: "Kostenlos",
    p5_free_price: "0\u20AC",
    p5_free_period: "",
    p5_free_desc: "HF-Zonen, 2 Laktattests und täglicher Vorschlag.",
    p5_free_cta: "Kostenlos starten",
    p5_lab_name: "Lactate Lab",
    p5_lab_price: "7,99\u20AC",
    p5_lab_period: "/Monat",
    p5_lab_desc: "Unbegrenzte Tests, 7 echte Zonen, dynamische Schwellenwerte und Prognosen.",
    p5_lab_cta: "Plan beitreten",
    p5_ai_name: "Pro",
    p5_ai_price: "19,99\u20AC",
    p5_ai_period: "/Monat",
    p5_ai_desc: "Physiologische Engine, Planung, Garmin und E-Mail-Support. 1 Disziplin.",
    p5_ai_cta: "Plan beitreten",
    p5_pro_name: "Pro+",
    p5_pro_badge: "Beliebt",
    p5_pro_price: "39,99\u20AC",
    p5_pro_period: "/Monat",
    p5_pro_desc: "Alles aus Pro für bis zu 3 Disziplinen. Laufen, Radfahren und Schwimmen.",
    p5_pro_cta: "Plan beitreten",
    p5_elite_name: "Elite",
    p5_elite_price: "199\u20AC",
    p5_elite_period: "/Monat",
    p5_elite_desc: "1:1-Coaching mit Physiologe. Wöchentliches Gespräch und direkter WhatsApp-Kontakt.",
    p5_elite_cta: "Gespräch buchen",
    p5_compare_cta: "Alle Pläne vergleichen \u2192",

    /* FAQ */
    faq_ey: "Häufige Fragen",
    faq_q0: "Was sind LT1 und LT2?",
    faq_a0: "LT1 (aerobe Schwelle) ist die Intensität, bei der das Laktat über dein Basisniveau steigt. LT2 (anaerobe Schwelle) ist die Intensität, bei der das Laktat exponentiell ansteigt. Zwischen beiden zu trainieren ist der Schlüssel zur Ausdauer. PeakAerobic erkennt beide automatisch aus einem Laktattest.",
    faq_q1: "Brauche ich einen Laktattest?",
    faq_a1: "Nein. Starte kostenlos mit HF. Aber wenn du Daten hast, ist die Analyse deutlich präziser.",
    faq_q2: "Ich mache keine Laktattests. Ist PeakAerobic etwas für mich?",
    faq_a2: "Ja. Starte mit deinen HF-Daten — du erhältst geschätzte Zonen, Vorschläge und Prognosen. Wenn du deinen ersten Test machst, berechnet PeakAerobic alles mit echten Daten neu.",
    faq_q3: "Wie genau sind die HF-Zonen?",
    faq_a3: "HF-Zonen haben eine Toleranz von \u00B110-20 bpm. Wir sind transparent: HF-Zonen sind Schätzungen. Laktatzonen sind Messungen. Deshalb zeigen wir dein Konfidenzniveau.",
    faq_q4: "Worin unterscheidet es sich von INSCYD oder TrainingPeaks?",
    faq_a4: "INSCYD berechnet 150-350\u20AC/Test und erfordert einen zertifizierten Coach. TrainingPeaks ist ein Kalender ohne Laktatanalyse. PeakAerobic kombiniert beides ab 7,99\u20AC/Monat.",
    faq_q5: "Wer überprüft meinen Plan jede Woche?",
    faq_a5: "David, Sportphysiologe und Gründer. Kein Chatbot.",
    faq_q6: "Brauche ich ein teures Laktatmessgerät?",
    faq_a6: "Tragbare Messgeräte kosten 150-300\u20AC (Lactate Plus, Lactate Pro 2). Die gleiche Investition wie 1-2 Labortests, aber du kannst unbegrenzt testen.",
    faq_q7: "Welche Sportarten werden abgedeckt?",
    faq_a7: "Laufen, Radfahren, Schwimmen und Triathlon. Mit sportspezifischen Zonen.",
    faq_q8: "Sind meine Daten sicher?",
    faq_a8: "Deine Daten gehören dir. Wir teilen nichts mit Dritten.",

    /* Final CTA */
    cta_h2: "Hör auf zu raten. Trainiere mit echten Daten.",
    cta_btn: "Kostenlos starten",
    cta_sub: "Keine Kreditkarte. Keine Verpflichtung.",

    /* Footer */
    foot_tagline: "Training basierend auf deiner Physiologie",
    foot_privacy: "Datenschutz",
    foot_compare: "Pläne vergleichen",
  },
  no: {
    /* Nav */
    nav_how: "Slik fungerer det",
    nav_pricing: "Planer",
    nav_compare: "Sammenlign",
    nav_blog: "Blogg",
    nav_enter: "Logg inn",

    /* Hero */
    hero_h1: "Før trente du etter følelse. Nå trener du med din fysiologi.",
    hero_sub: "Analyser laktat eller hjertefrekvens, oppdag dine reelle soner og få en plan som tilpasser seg deg.",
    hero_cta_primary: "Analyser testen din",
    hero_cta_secondary: "Se planer",

    /* Social proof */
    proof_tests: "+2 400 tester analysert",
    proof_precision: "94% deteksjonsnøyaktighet",
    proof_disciplines: "12 disipliner",
    proof_free: "Gratis for alltid",

    /* Problem */
    problem_ey: "Kjennes det kjent?",
    problem_h2: "Du trener hardt, men noe stemmer ikke",
    problem_1: "Rolige løpeturer som knekker deg",
    problem_2: "Måneder med trening, tidene synker ikke",
    problem_3: "Du vet ikke om intervallene dine virkelig er på terskel",
    problem_4: "Klokka sier én sone, kroppen sier en annen",
    problem_bottom: "Det mangler ikke innsats. Det mangler presisjon.",

    /* How it works */
    how_ey: "Slik fungerer det",
    how_h2: "Fra dataene dine til en plan i 3 steg",
    how_s1_num: "1",
    how_s1_title: "Gjør en test",
    how_s1_desc: "Med laktatdata eller hjertefrekvens. Skriv inn tempo/effekt og laktat, eller lim inn fra CSV.",
    how_s2_num: "2",
    how_s2_title: "Få analysen",
    how_s2_desc: "Tre uavhengige metoder oppdager LT1 og LT2. Hvert estimat inkluderer en konfidensscore.",
    how_s3_num: "3",
    how_s3_title: "Tren med ekte data",
    how_s3_desc: "Treningssoner, konkurranseprognoser og fysiologisk plan — alt fra dine reelle terskelverdier.",

    /* App showcase */
    ap_ey: "Din utøverportal",
    ap_h2: "Alt i én app",
    ap_1_title: "Ekte soner, ikke formler",
    ap_1_desc: "7 soner fra ekte laktat. HF, tempo og effekt.",
    ap_1_badge: "Lactate Lab",
    ap_2_title: "Terskelutvikling",
    ap_2_desc: "Din LT1/LT2 utvikler seg test for test.",
    ap_2_badge: "Lactate Lab",
    ap_3_title: "Konkurranseprognoser",
    ap_3_desc: "5K til maraton med konfidensbånd.",
    ap_3_badge: "Lactate Lab",
    ap_4_title: "Dagen din med ett blikk",
    ap_4_desc: "Readiness, detaljert økt og velvære.",
    ap_4_badge: "Pro",
    ap_5_title: "Uke og kalender",
    ap_5_desc: "Ukesvisning med soner og volum.",
    ap_5_badge: "Pro",
    ap_6_title: "Mål + fysiologi = plan",
    ap_6_desc: "Målet ditt og tersklene dine former hver fase av planen.",
    ap_6_badge: "Pro+",

    /* Two paths — Pro & Pro+ */
    paths_ey: "Velg planen din",
    paths_h2: "Motoren som trener for deg",
    paths_shared_sub: "Begge planer inkluderer fysiologisk motor, planlegging, Garmin og veiledet støtte.",
    paths_pro_badge: "Pro",
    paths_pro_title: "1 disiplin",
    paths_pro_desc: "Den fullstendige fysiologiske motoren for hovedsporten din.",
    paths_pro_price: "19,99\u20AC/mnd",
    paths_pro_cta: "Bli med i planen",
    paths_pro_plus_badge: "Pro+",
    paths_pro_plus_popular: "Populær",
    paths_pro_plus_title: "Opptil 3 disipliner",
    paths_pro_plus_desc: "Løping, sykling og svømming. Én motor for hver.",
    paths_pro_plus_price: "39,99\u20AC/mnd",
    paths_pro_plus_cta: "Bli med i planen",
    paths_feat_1: "Fullstendig fysiologisk motor",
    paths_feat_2: "Automatisk blokkvalg",
    paths_feat_3: "Dose ladders og mesosykluser",
    paths_feat_4: "Ukentlig kalender + Garmin",
    paths_feat_5: "Veiledet av spesialister",
    paths_feat_6: "E-poststøtte",
    /* Elite premium */
    elite_ey: "For deg som vil ha det beste",
    elite_h2: "Elite: din dedikerte spesialist",
    elite_sub: "Alt i Pro+, pluss en person som er dedikert utelukkende til deg.",
    elite_feat_1: "Ukentlig personlig gjennomgang av planen din",
    elite_feat_2: "Justeringer basert på kontekst, tretthet og følelse",
    elite_feat_3: "Hver økt godkjent før den når deg",
    elite_feat_4: "Ukentlig 1:1-samtale med spesialisten din",
    elite_feat_5: "Direkte WhatsApp for spørsmål i sanntid",
    elite_feat_6: "Skreddersydd konkurransestrategi",
    elite_price: "199\u20AC/mnd",
    elite_cta: "Book en samtale",
    elite_note: "Begrensede plasser — vi tar bare imot utøvere vi kan jobbe godt med.",
    /* Elite journey */
    ej_s1_title: "Første samtale",
    ej_s1_desc: "Vi lærer om historikken din, målene og tilgjengeligheten din. Vi designer veikartet sammen.",
    ej_s2_title: "Fullstendig evaluering",
    ej_s2_desc: "Spesialisten din analyserer testene, historikken og definerer din fysiologiske profil.",
    ej_s3_title: "Skreddersydd plan",
    ej_s3_desc: "Hver økt designet for deg. Godkjent av spesialisten din før den havner på Garminen din.",
    ej_s4_title: "Ukentlig oppfølging",
    ej_s4_desc: "1:1-samtale hver uke. Vi gjennomgår følelse, data og justerer det som trengs.",
    ej_s5_title: "Sanntidsjusteringer",
    ej_s5_desc: "Direkte WhatsApp. Dårlig natt, muskelproblem — planen din tilpasser seg øyeblikkelig.",
    ej_s6_title: "Konkurranseforberedelse",
    ej_s6_desc: "Skreddersydd konkurransestrategi. Tempo, ernæring, oppvarming — alt låst.",
    ej_s7_title: "Konkurransedag",
    ej_s7_desc: "Du ankommer forberedt. Ingen tvil. Med noen bak deg som kjenner hver økt du har gjort.",

    /* Mobile app */
    mobile_ey: "Tilgjengelig på mobil",
    mobile_h2: "All ytelsen din i lomma",
    mobile_sub: "Ikke bare treningsplanen din. Det er din komplette ytelsesportal fra hvor som helst.",
    mobile_feat_1: "Dagens økt, kalender og treningsmetrikker",
    mobile_feat_2: "Søvn, HRV og daglig velvære",
    mobile_feat_3: "Registrer laktat- og HF-tester fra mobilen",
    mobile_feat_4: "Diagrammer for terskelutvikling og soner",
    mobile_feat_5: "Automatisk Garmin-synkronisering",
    mobile_feat_6: "Varsler for økt, test og readiness",
    mobile_cta: "Tilgjengelig for iOS og Android",

    /* Journey */
    journey_ey: "Din reise med PeakAerobic",
    journey_h2: "Fra første test til din personlige rekord",
    journey_s1_title: "Registrer deg og sett målet ditt",
    journey_s1_desc: "Velg disiplin, konkurranse og dato. Profilen din tilpasser seg deg.",
    journey_s2_title: "Last opp din første test",
    journey_s2_desc: "Laktat eller HF. Motoren oppdager LT1/LT2 med 7 metoder.",
    journey_s3_title: "Motoren leser fysiologien din",
    journey_s3_desc: "Metabolsk profil, begrensende svakhet og anbefalt blokk.",
    journey_s4_title: "Mesosyklusen din er klar",
    journey_s4_desc: "Ukentlig kalender med økter, doser og push til Garmin.",
    journey_s5_title: "Tren og samle data",
    journey_s5_desc: "Hver økt mater profilen din. Progresjon uten brå hopp.",
    journey_s6_title: "Ny test, nye terskelverdier",
    journey_s6_desc: "Din LT1/LT2 utvikler seg. Motoren justerer neste blokk.",
    journey_s7_title: "Mål oppnådd",
    journey_s7_desc: "Prognose oppfylt. Fysiologien din støttet hver beslutning.",

    /* Pricing */
    price_ey: "Planer",
    price_h2: "Start gratis. Oppgrader når du er klar.",
    price_billing_note: "Kvartals-/årsabonnement tilgjengelig",
    p5_free_name: "Gratis",
    p5_free_price: "0\u20AC",
    p5_free_period: "",
    p5_free_desc: "HF-soner, 2 laktattester og daglig forslag.",
    p5_free_cta: "Start gratis",
    p5_lab_name: "Lactate Lab",
    p5_lab_price: "7,99\u20AC",
    p5_lab_period: "/mnd",
    p5_lab_desc: "Ubegrensede tester, 7 ekte soner, dynamiske terskelverdier og prognoser.",
    p5_lab_cta: "Bli med i planen",
    p5_ai_name: "Pro",
    p5_ai_price: "19,99\u20AC",
    p5_ai_period: "/mnd",
    p5_ai_desc: "Fysiologisk motor, planlegging, Garmin og e-poststøtte. 1 disiplin.",
    p5_ai_cta: "Bli med i planen",
    p5_pro_name: "Pro+",
    p5_pro_badge: "Populær",
    p5_pro_price: "39,99\u20AC",
    p5_pro_period: "/mnd",
    p5_pro_desc: "Alt i Pro for opptil 3 disipliner. Løping, sykling og svømming.",
    p5_pro_cta: "Bli med i planen",
    p5_elite_name: "Elite",
    p5_elite_price: "199\u20AC",
    p5_elite_period: "/mnd",
    p5_elite_desc: "1:1-coaching med fysiolog. Ukentlig samtale og direkte WhatsApp.",
    p5_elite_cta: "Book en samtale",
    p5_compare_cta: "Sammenlign alle planer \u2192",

    /* FAQ */
    faq_ey: "Ofte stilte spørsmål",
    faq_q0: "Hva er LT1 og LT2?",
    faq_a0: "LT1 (aerob terskel) er intensiteten der laktat begynner å stige over basisnivået. LT2 (anaerob terskel) er intensiteten der laktat akkumuleres eksponentielt. Å trene mellom begge er nøkkelen til utholdenhet. PeakAerobic oppdager begge automatisk fra en laktattest.",
    faq_q1: "Trenger jeg en laktattest?",
    faq_a1: "Nei. Start gratis med HF. Men hvis du har data, er analysen mye mer presis.",
    faq_q2: "Jeg gjør ikke laktattester. Er PeakAerobic for meg?",
    faq_a2: "Ja. Start med HF-dataene dine — du får estimerte soner, forslag og prognoser. Når du gjør din første test, beregner PeakAerobic alt på nytt med ekte data.",
    faq_q3: "Hvor nøyaktige er HF-sonene?",
    faq_a3: "HF-soner har en margin på \u00B110-20 bpm. Vi er transparente: HF-soner er estimater. Laktatsoner er målinger. Derfor viser vi konfidensnivået ditt.",
    faq_q4: "Hva skiller det fra INSCYD eller TrainingPeaks?",
    faq_a4: "INSCYD koster 150-350\u20AC/test og krever en sertifisert coach. TrainingPeaks er en kalender uten laktatanalyse. PeakAerobic kombinerer begge fra 7,99\u20AC/mnd.",
    faq_q5: "Hvem gjennomgår planen min hver uke?",
    faq_a5: "David, treningsfysiolog og grunnlegger. Ingen chatbot.",
    faq_q6: "Trenger jeg et dyrt laktatmeter?",
    faq_a6: "Bærbare målere koster 150-300\u20AC (Lactate Plus, Lactate Pro 2). Samme investering som 1-2 labtester, men du kan teste ubegrenset.",
    faq_q7: "Hvilke idretter dekkes?",
    faq_a7: "Løping, sykling, svømming og triatlon. Med idrettsspesifikke soner.",
    faq_q8: "Er dataene mine trygge?",
    faq_a8: "Dataene dine er dine. Vi deler ingenting med tredjeparter.",

    /* Final CTA */
    cta_h2: "Slutt å gjette. Begynn å trene med ekte data.",
    cta_btn: "Start gratis",
    cta_sub: "Ingen kredittkort. Ingen forpliktelser.",

    /* Footer */
    foot_tagline: "Trening basert på din fysiologi",
    foot_privacy: "Personvern",
    foot_compare: "Sammenlign planer",
  },
  fr: {
    /* Nav */
    nav_how: "Comment ça marche",
    nav_pricing: "Plans",
    nav_compare: "Comparer",
    nav_blog: "Blog",
    nav_enter: "Connexion",

    /* Hero */
    hero_h1: "Avant, tu t'entraînais au ressenti. Maintenant, tu t'entraînes avec ta physiologie.",
    hero_sub: "Analyse ton lactate ou ta fréquence cardiaque, découvre tes vraies zones et reçois un plan qui s'adapte à toi.",
    hero_cta_primary: "Analyse ton test",
    hero_cta_secondary: "Voir les plans",

    /* Social proof */
    proof_tests: "+2 400 tests analysés",
    proof_precision: "94% de précision de détection",
    proof_disciplines: "12 disciplines",
    proof_free: "Gratuit pour toujours",

    /* Problem */
    problem_ey: "Ça te parle ?",
    problem_h2: "Tu t'entraînes dur, mais quelque chose cloche",
    problem_1: "Des footings faciles qui te laissent épuisé",
    problem_2: "Des mois d'entraînement, tes temps ne baissent pas",
    problem_3: "Tu ne sais pas si tes intervalles sont vraiment au seuil",
    problem_4: "Ta montre dit une zone, ton corps en dit une autre",
    problem_bottom: "Ce n'est pas un manque d'effort. C'est un manque de précision.",

    /* How it works */
    how_ey: "Comment ça marche",
    how_h2: "De tes données à un plan en 3 étapes",
    how_s1_num: "1",
    how_s1_title: "Fais un test",
    how_s1_desc: "Avec des données de lactate ou de fréquence cardiaque. Entre l'allure/puissance et le lactate, ou colle depuis un CSV.",
    how_s2_num: "2",
    how_s2_title: "Reçois l'analyse",
    how_s2_desc: "Trois méthodes indépendantes détectent SL1 et SL2. Chaque estimation inclut un score de confiance.",
    how_s3_num: "3",
    how_s3_title: "Entraîne-toi avec des données réelles",
    how_s3_desc: "Zones d'entraînement, prédictions de course et plan physiologique — tout à partir de tes vrais seuils.",

    /* App showcase */
    ap_ey: "Ton portail athlète",
    ap_h2: "Tout dans une seule app",
    ap_1_title: "Des vraies zones, pas des formules",
    ap_1_desc: "7 zones à partir du lactate réel. FC, allure et puissance.",
    ap_1_badge: "Lactate Lab",
    ap_2_title: "Évolution des seuils",
    ap_2_desc: "Ton SL1/SL2 évolue test après test.",
    ap_2_badge: "Lactate Lab",
    ap_3_title: "Prédictions de course",
    ap_3_desc: "5K au marathon avec bandes de confiance.",
    ap_3_badge: "Lactate Lab",
    ap_4_title: "Ta journée en un coup d'œil",
    ap_4_desc: "Readiness, séance détaillée et bien-être.",
    ap_4_badge: "Pro",
    ap_5_title: "Semaine et calendrier",
    ap_5_desc: "Vue hebdomadaire avec zones et volume.",
    ap_5_badge: "Pro",
    ap_6_title: "Objectif + physiologie = plan",
    ap_6_desc: "Ton objectif et tes seuils définissent chaque phase du plan.",
    ap_6_badge: "Pro+",

    /* Two paths — Pro & Pro+ */
    paths_ey: "Choisis ton plan",
    paths_h2: "Le moteur qui s'entraîne pour toi",
    paths_shared_sub: "Les deux plans incluent le moteur physiologique, la planification, Garmin et un support supervisé.",
    paths_pro_badge: "Pro",
    paths_pro_title: "1 discipline",
    paths_pro_desc: "Le moteur physiologique complet pour ton sport principal.",
    paths_pro_price: "19,99\u20AC/mois",
    paths_pro_cta: "Rejoindre le plan",
    paths_pro_plus_badge: "Pro+",
    paths_pro_plus_popular: "Populaire",
    paths_pro_plus_title: "Jusqu'à 3 disciplines",
    paths_pro_plus_desc: "Course, cyclisme et natation. Un moteur pour chaque.",
    paths_pro_plus_price: "39,99\u20AC/mois",
    paths_pro_plus_cta: "Rejoindre le plan",
    paths_feat_1: "Moteur physiologique complet",
    paths_feat_2: "Sélection automatique de bloc",
    paths_feat_3: "Dose ladders et mésocycles",
    paths_feat_4: "Calendrier hebdomadaire + Garmin",
    paths_feat_5: "Supervisé par des spécialistes",
    paths_feat_6: "Support par email",
    /* Elite premium */
    elite_ey: "Pour ceux qui veulent le meilleur",
    elite_h2: "Elite : ton spécialiste dédié",
    elite_sub: "Tout ce qu'offre Pro+, plus une personne dédiée exclusivement à toi.",
    elite_feat_1: "Revue hebdomadaire personnalisée de ton plan",
    elite_feat_2: "Ajustements selon le contexte, la fatigue et les sensations",
    elite_feat_3: "Chaque séance approuvée avant de t'être envoyée",
    elite_feat_4: "Appel hebdomadaire 1:1 avec ton spécialiste",
    elite_feat_5: "WhatsApp direct pour les questions en temps réel",
    elite_feat_6: "Stratégie de course sur mesure",
    elite_price: "199\u20AC/mois",
    elite_cta: "Réserver un appel",
    elite_note: "Places limitées — nous n'acceptons que les athlètes avec lesquels nous pouvons bien travailler.",
    /* Elite journey */
    ej_s1_title: "Appel initial",
    ej_s1_desc: "Nous découvrons ton historique, tes objectifs et ta disponibilité. Nous concevons la feuille de route ensemble.",
    ej_s2_title: "Évaluation complète",
    ej_s2_desc: "Ton spécialiste analyse tes tests, ton historique et définit ton profil physiologique.",
    ej_s3_title: "Plan sur mesure",
    ej_s3_desc: "Chaque séance pensée pour toi. Approuvée par ton spécialiste avant d'arriver sur ton Garmin.",
    ej_s4_title: "Suivi hebdomadaire",
    ej_s4_desc: "Appel 1:1 chaque semaine. Nous passons en revue les sensations, les données et ajustons ce qui est nécessaire.",
    ej_s5_title: "Ajustements en temps réel",
    ej_s5_desc: "WhatsApp direct. Mauvaise nuit, gêne musculaire — ton plan s'adapte instantanément.",
    ej_s6_title: "Préparation compétition",
    ej_s6_desc: "Stratégie de course sur mesure. Allures, nutrition, échauffement — tout est calé.",
    ej_s7_title: "Jour de course",
    ej_s7_desc: "Tu arrives préparé. Sans doute. Avec quelqu'un derrière toi qui connaît chaque séance que tu as faite.",

    /* Mobile app */
    mobile_ey: "Disponible sur mobile",
    mobile_h2: "Toute ta performance dans ta poche",
    mobile_sub: "Ce n'est pas juste ton plan d'entraînement. C'est ton portail complet de performance, où que tu sois.",
    mobile_feat_1: "Séance du jour, calendrier et métriques d'entraînement",
    mobile_feat_2: "Sommeil, HRV et bien-être quotidien",
    mobile_feat_3: "Enregistre tes tests de lactate et FC depuis ton téléphone",
    mobile_feat_4: "Graphiques d'évolution des seuils et zones",
    mobile_feat_5: "Synchronisation automatique avec Garmin",
    mobile_feat_6: "Notifications de séance, test et readiness",
    mobile_cta: "Disponible sur iOS et Android",

    /* Journey */
    journey_ey: "Ton parcours avec PeakAerobic",
    journey_h2: "Du premier test à ton record personnel",
    journey_s1_title: "Inscris-toi et définis ton objectif",
    journey_s1_desc: "Choisis ta discipline, ton événement et ta date. Ton profil s'adapte à toi.",
    journey_s2_title: "Importe ton premier test",
    journey_s2_desc: "Lactate ou FC. Le moteur détecte SL1/SL2 avec 7 méthodes.",
    journey_s3_title: "Le moteur lit ta physiologie",
    journey_s3_desc: "Profil métabolique, faiblesse limitante et bloc recommandé.",
    journey_s4_title: "Ton mésocycle est prêt",
    journey_s4_desc: "Calendrier hebdomadaire avec séances, doses et envoi vers Garmin.",
    journey_s5_title: "Entraîne-toi et accumule des données",
    journey_s5_desc: "Chaque séance nourrit ton profil. Progression sans sauts brusques.",
    journey_s6_title: "Nouveau test, nouveaux seuils",
    journey_s6_desc: "Ton SL1/SL2 évolue. Le moteur ajuste le prochain bloc.",
    journey_s7_title: "Objectif atteint",
    journey_s7_desc: "Prédiction réalisée. Ta physiologie a soutenu chaque décision.",

    /* Pricing */
    price_ey: "Plans",
    price_h2: "Commence gratuitement. Passe au supérieur quand tu es prêt.",
    price_billing_note: "Facturation trimestrielle/annuelle disponible",
    p5_free_name: "Gratuit",
    p5_free_price: "0\u20AC",
    p5_free_period: "",
    p5_free_desc: "Zones FC, 2 tests de lactate et suggestion quotidienne.",
    p5_free_cta: "Commencer gratuitement",
    p5_lab_name: "Lactate Lab",
    p5_lab_price: "7,99\u20AC",
    p5_lab_period: "/mois",
    p5_lab_desc: "Tests illimités, 7 vraies zones, seuils dynamiques et prédictions.",
    p5_lab_cta: "Rejoindre le plan",
    p5_ai_name: "Pro",
    p5_ai_price: "19,99\u20AC",
    p5_ai_period: "/mois",
    p5_ai_desc: "Moteur physiologique, planification, Garmin et support email. 1 discipline.",
    p5_ai_cta: "Rejoindre le plan",
    p5_pro_name: "Pro+",
    p5_pro_badge: "Populaire",
    p5_pro_price: "39,99\u20AC",
    p5_pro_period: "/mois",
    p5_pro_desc: "Tout ce qu'offre Pro pour jusqu'à 3 disciplines. Course, cyclisme et natation.",
    p5_pro_cta: "Rejoindre le plan",
    p5_elite_name: "Elite",
    p5_elite_price: "199\u20AC",
    p5_elite_period: "/mois",
    p5_elite_desc: "Coaching 1:1 avec physiologiste. Appel hebdomadaire et WhatsApp direct.",
    p5_elite_cta: "Réserver un appel",
    p5_compare_cta: "Comparer tous les plans \u2192",

    /* FAQ */
    faq_ey: "Questions fréquentes",
    faq_q0: "Que sont SL1 et SL2 ?",
    faq_a0: "SL1 (seuil aérobie) est l'intensité à laquelle le lactate commence à monter au-dessus de ta ligne de base. SL2 (seuil anaérobie) est l'intensité à laquelle le lactate s'accumule de façon exponentielle. S'entraîner entre les deux est la clé de l'endurance. PeakAerobic détecte les deux automatiquement à partir d'un test de lactate.",
    faq_q1: "Ai-je besoin d'un test de lactate ?",
    faq_a1: "Non. Commence gratuitement avec la FC. Mais si tu as des données, l'analyse est bien plus précise.",
    faq_q2: "Je ne fais pas de tests de lactate. PeakAerobic est-il fait pour moi ?",
    faq_a2: "Oui. Commence avec tes données de FC — tu recevras des zones estimées, des suggestions et des prédictions. Quand tu feras ton premier test, PeakAerobic recalculera tout avec des données réelles.",
    faq_q3: "Quelle est la précision des zones FC ?",
    faq_a3: "Les zones FC ont une marge de \u00B110-20 bpm. Nous sommes transparents : les zones FC sont des estimations. Les zones lactate sont des mesures. C'est pourquoi nous affichons ton niveau de confiance.",
    faq_q4: "En quoi ça diffère d'INSCYD ou TrainingPeaks ?",
    faq_a4: "INSCYD facture 150-350\u20AC/test et nécessite un coach certifié. TrainingPeaks est un calendrier sans analyse de lactate. PeakAerobic combine les deux à partir de 7,99\u20AC/mois.",
    faq_q5: "Qui révise mon plan chaque semaine ?",
    faq_a5: "David, physiologiste de l'exercice et fondateur. Pas un chatbot.",
    faq_q6: "Ai-je besoin d'un lactatomètre coûteux ?",
    faq_a6: "Les analyseurs portables coûtent 150-300\u20AC (Lactate Plus, Lactate Pro 2). Le même investissement que 1-2 tests en labo, mais tu peux tester sans limite.",
    faq_q7: "Quels sports sont couverts ?",
    faq_a7: "Course, cyclisme, natation et triathlon. Avec des zones spécifiques par sport.",
    faq_q8: "Mes données sont-elles en sécurité ?",
    faq_a8: "Tes données t'appartiennent. Nous ne partageons rien avec des tiers.",

    /* Final CTA */
    cta_h2: "Arrête de deviner. Entraîne-toi avec des données réelles.",
    cta_btn: "Commencer gratuitement",
    cta_sub: "Sans carte de crédit. Sans engagement.",

    /* Footer */
    foot_tagline: "Entraînement basé sur ta physiologie",
    foot_privacy: "Confidentialité",
    foot_compare: "Comparer les plans",
  },
};

/* Helper: get translated string, fallback to en */
function useLandingT() {
  const { lang } = useLang();
  return (key: string): string => {
    return LANDING_T[lang]?.[key] ?? LANDING_T["en"]?.[key] ?? key;
  };
}

/* ══════════════════════════════════════════
   Inner landing (has access to useLang)
   ══════════════════════════════════════════ */
function LandingInner() {
  const t = useLandingT();
  const { lang } = useLang();
  const navigate = useNavigate();

  /* Checkmark SVG helper */
  const check = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
  );

  return (
    <div className="lp">
      {/* ── 1. NAV ── */}
      <nav className="lp-nav">
        <div className="lp-w lp-nav__row">
          <span className="lp-nav__brand">PeakAerobic</span>
          <div className="lp-nav__right">
            <a href="#how" className="lp-nav__link lp-nav__link--hide-mobile">{t("nav_how")}</a>
            <a href="#pricing" className="lp-nav__link lp-nav__link--hide-mobile">{t("nav_pricing")}</a>
            <button type="button" className="lp-nav__link lp-nav__link--hide-mobile" onClick={() => navigate("/compare-plans")} style={{ background: "none", border: "none", cursor: "pointer" }}>{t("nav_compare")}</button>
            <button type="button" className="lp-nav__link lp-nav__link--hide-mobile" onClick={() => navigate("/resources")} style={{ background: "none", border: "none", cursor: "pointer" }}>{t("nav_blog")}</button>
            <LangSwitch />
            <button className="lp-nav__enter" onClick={() => navigate("/login")} type="button">{t("nav_enter")}</button>
          </div>
        </div>
      </nav>

      {/* ══ 2. HERO ══ */}
      <section className="lp-hero">
        <div className="lp-hero__center">
          <h1 className="lp-hero__h1">
            {lang === "en"
              ? <>You used to train by feel. Now you train with your <span style={{ color: "var(--c-accent)" }}>physiology</span>.</>
              : lang === "de"
              ? <>Früher hast du nach Gefühl trainiert. Jetzt trainierst du mit deiner <span style={{ color: "var(--c-accent)" }}>Physiologie</span>.</>
              : lang === "no"
              ? <>Før trente du etter følelse. Nå trener du med din <span style={{ color: "var(--c-accent)" }}>fysiologi</span>.</>
              : lang === "fr"
              ? <>Avant, tu t'entraînais au ressenti. Maintenant, tu t'entraînes avec ta <span style={{ color: "var(--c-accent)" }}>physiologie</span>.</>
              : <>Antes entrenabas por sensaciones. Ahora entrenas con tu <span style={{ color: "var(--c-accent)" }}>fisiología</span>.</>}
          </h1>
          <p className="lp-hero__sub">{t("hero_sub")}</p>
          <div className="lp-hero__ctas">
            <a href="#demo" className="lp-btn-solid lp-btn--hero">{t("hero_cta_primary")}</a>
            <button className="lp-btn-solid lp-btn--hero-ghost" onClick={() => navigate("/compare-plans")} type="button">
              {t("hero_cta_secondary")}
            </button>
          </div>
          <div className="lp-hero__curve-wrap">
            <HeroCurve />
          </div>
        </div>
      </section>

      {/* ══ 3. SOCIAL PROOF BAR ══ */}
      <div className="lp-proof-bar">
        <div className="lp-w lp-proof-bar__inner">
          {[
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>, text: t("proof_tests") },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>, text: t("proof_precision") },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>, text: t("proof_disciplines") },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, text: t("proof_free") },
          ].map((item, i) => (
            <div key={i} className="lp-proof-bar__item">
              {item.icon}
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 4. PROBLEM AGITATION — 4 pain-point cards ══ */}
      <AnimSection>
        <section className="lp-section lp-section--light" id="problem">
          <div className="lp-w">
            <p className="lp-ey"><span>{t("problem_ey")}</span></p>
            <h2 className="lp-h2">{t("problem_h2")}</h2>
            <div className="lp-pain__grid">
              {[
                { k: "1", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
                { k: "2", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"/></svg> },
                { k: "3", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> },
                { k: "4", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="5" width="22" height="14" rx="3"/><path d="M12 5v14"/><path d="M5 12h14"/></svg> },
              ].map(({ k, icon }) => (
                <div key={k} className="lp-pain__card">
                  <div className="lp-pain__icon">{icon}</div>
                  <p className="lp-pain__text">{t(`problem_${k}`)}</p>
                </div>
              ))}
            </div>
            <p className="lp-pain__bottom">{t("problem_bottom")}</p>

            {/* Visual connector */}
            <div className="lp-connector">
              <div className="lp-connector__line" />
              <div className="lp-connector__arrow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 5. INTERACTIVE DEMO ══ */}
      <LactateDemo />

      {/* ══ 6. HOW IT WORKS — 3 steps ══ */}
      <AnimSection>
        <section className="lp-section lp-section--light" id="how">
          <div className="lp-w">
            <p className="lp-ey"><span>{t("how_ey")}</span></p>
            <h2 className="lp-h2">{t("how_h2")}</h2>

            <div className="lp-journey">
              {/* Step 1 — Test */}
              <div className="lp-journey__step">
                <div className="lp-journey__icon lp-journey__icon--green">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <div className="lp-journey__connector" />
                <span className="lp-journey__num">{t("how_s1_num")}</span>
                <h3 className="lp-journey__title">{t("how_s1_title")}</h3>
                <p className="lp-journey__text">{t("how_s1_desc")}</p>
              </div>

              {/* Step 2 — Analysis */}
              <div className="lp-journey__step">
                <div className="lp-journey__icon lp-journey__icon--orange">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <div className="lp-journey__connector" />
                <span className="lp-journey__num">{t("how_s2_num")}</span>
                <h3 className="lp-journey__title">{t("how_s2_title")}</h3>
                <p className="lp-journey__text">{t("how_s2_desc")}</p>
              </div>

              {/* Step 3 — Train */}
              <div className="lp-journey__step">
                <div className="lp-journey__icon lp-journey__icon--blue">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                </div>
                <span className="lp-journey__num">{t("how_s3_num")}</span>
                <h3 className="lp-journey__title">{t("how_s3_title")}</h3>
                <p className="lp-journey__text">{t("how_s3_desc")}</p>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 7. APP SHOWCASE — 6 feature cards with plan badges ══ */}
      <AnimSection>
        <section className="lp-section lp-section--light" id="athlete-portal">
          <div className="lp-w">
            <p className="lp-ey"><span>{t("ap_ey")}</span></p>
            <h2 className="lp-h2">{t("ap_h2")}</h2>

            <div className="lp-showcase__grid">
              {/* Card 1: Zones */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-badge">{t("ap_1_badge")}</div>
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#0e1e24" />
                    {[
                      { y: 10, w: 40, color: "#86efac", label: "Z1" },
                      { y: 24, w: 65, color: "#22c55e", label: "Z2" },
                      { y: 38, w: 90, color: "#3b82f6", label: "Z3" },
                      { y: 52, w: 115, color: "#8b5cf6", label: "Z4" },
                      { y: 66, w: 140, color: "#f59e0b", label: "Z5" },
                      { y: 80, w: 165, color: "#ef4444", label: "Z6" },
                    ].map((z, i) => (
                      <g key={i}>
                        <rect x="12" y={z.y} width={z.w} height="10" rx="5" fill={z.color} opacity="0.7" />
                        <text x={z.w + 16} y={z.y + 8} fill="#6b8a97" fontSize="7" fontFamily="Space Grotesk">{z.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_1_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_1_desc")}</p>
              </div>

              {/* Card 2: Evolution */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-badge">{t("ap_2_badge")}</div>
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#0e1e24" />
                    <polyline points="20,75 50,68 80,58 110,48 140,38 170,30" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                    <polyline points="20,65 50,60 80,52 110,44 140,36 170,28" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                    {[[20,75],[50,68],[80,58],[110,48],[140,38],[170,30]].map(([cx,cy],i) => (
                      <circle key={`g${i}`} cx={cx} cy={cy} r="3" fill="#0e1e24" stroke="#22c55e" strokeWidth="1.5" />
                    ))}
                    {[[20,65],[50,60],[80,52],[110,44],[140,36],[170,28]].map(([cx,cy],i) => (
                      <circle key={`o${i}`} cx={cx} cy={cy} r="3" fill="#0e1e24" stroke="#f97316" strokeWidth="1.5" />
                    ))}
                    <circle cx="150" cy="12" r="3" fill="#22c55e" /><text x="158" y="15" fill="#6b8a97" fontSize="7" fontFamily="Space Grotesk">LT1</text>
                    <circle cx="175" cy="12" r="3" fill="#f97316" /><text x="183" y="15" fill="#6b8a97" fontSize="7" fontFamily="Space Grotesk">LT2</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_2_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_2_desc")}</p>
              </div>

              {/* Card 3: Predictions */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-badge">{t("ap_3_badge")}</div>
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#0e1e24" />
                    {[
                      { x: 14, dist: "5K", time: "19:42" },
                      { x: 60, dist: "10K", time: "41:08" },
                      { x: 106, dist: "Media", time: "1:31" },
                      { x: 152, dist: "Marat.", time: "3:12" },
                    ].map((p, i) => (
                      <g key={i}>
                        <rect x={p.x} y="12" width="40" height="76" rx="8" fill="rgba(210,106,54,0.08)" stroke="rgba(210,106,54,0.2)" strokeWidth="1" />
                        <text x={p.x + 20} y="28" textAnchor="middle" fill="#6b8a97" fontSize="7" fontWeight="600" fontFamily="Space Grotesk">{p.dist}</text>
                        <text x={p.x + 20} y="50" textAnchor="middle" fill="#e8edef" fontSize="12" fontWeight="800" fontFamily="Space Grotesk">{p.time}</text>
                        <rect x={p.x + 6} y="70" width="28" height="4" rx="2" fill="#1a2f38" />
                        <rect x={p.x + 6} y="70" width={20 - i * 3} height="4" rx="2" fill="#22c55e" opacity="0.7" />
                        <text x={p.x + 20} y="82" textAnchor="middle" fill="#6b8a97" fontSize="6" fontFamily="Space Grotesk">{["95%","88%","82%","74%"][i]}</text>
                      </g>
                    ))}
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_3_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_3_desc")}</p>
              </div>

              {/* Card 4: Today */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-badge lp-showcase__card-badge--blue">{t("ap_4_badge")}</div>
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#0e1e24" />
                    <circle cx="50" cy="50" r="28" fill="none" stroke="#1a2f38" strokeWidth="5" />
                    <circle cx="50" cy="50" r="28" fill="none" stroke="#22c55e" strokeWidth="5" strokeDasharray="132 176" strokeLinecap="round" transform="rotate(-90 50 50)" />
                    <text x="50" y="55" textAnchor="middle" fill="#e8edef" fontSize="16" fontWeight="800" fontFamily="Space Grotesk">78</text>
                    <rect x="95" y="20" width="90" height="12" rx="4" fill="#1a2f38" />
                    <rect x="95" y="38" width="70" height="8" rx="3" fill="#152830" />
                    <rect x="95" y="55" width="90" height="24" rx="6" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.25)" strokeWidth="1" />
                    <text x="140" y="71" textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">LISTO</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_4_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_4_desc")}</p>
              </div>

              {/* Card 5: Week */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-badge lp-showcase__card-badge--blue">{t("ap_5_badge")}</div>
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 100" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="100" rx="12" fill="#0e1e24" />
                    {[0,1,2,3,4,5,6].map(i => {
                      const x = 12 + i * 26;
                      const colors = ["transparent", "#f59e0b", "#22c55e", "transparent", "#f59e0b", "#3b82f6", "transparent"];
                      const heights = [0, 50, 30, 0, 45, 60, 0];
                      return (
                        <g key={i}>
                          {heights[i] > 0 && <rect x={x} y={88 - heights[i]} width="20" height={heights[i]} rx="4" fill={colors[i]} opacity="0.6" />}
                          <text x={x + 10} y="98" textAnchor="middle" fill="#6b8a97" fontSize="7" fontFamily="Space Grotesk">{["L","M","X","J","V","S","D"][i]}</text>
                        </g>
                      );
                    })}
                    <text x="12" y="16" fill="#e8edef" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">Semana 12</text>
                    <text x="188" y="16" textAnchor="end" fill="#6b8a97" fontSize="8" fontFamily="Space Grotesk">42 km</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_5_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_5_desc")}</p>
              </div>

              {/* Card 6: Goal + Physiology -> Plan */}
              <div className="lp-showcase__card">
                <div className="lp-showcase__card-badge lp-showcase__card-badge--pro">{t("ap_6_badge")}</div>
                <div className="lp-showcase__card-visual">
                  <svg viewBox="0 0 200 120" width="100%" preserveAspectRatio="xMidYMid meet">
                    <rect x="0" y="0" width="200" height="120" rx="12" fill="#0e1e24" />
                    {/* Left: Goal */}
                    <rect x="8" y="10" width="82" height="40" rx="8" fill="rgba(239,68,68,0.08)" stroke="rgba(239,68,68,0.2)" strokeWidth=".8" />
                    <circle cx="22" cy="24" r="6" fill="none" stroke="#ef4444" strokeWidth="1.2" />
                    <circle cx="22" cy="24" r="2" fill="#ef4444" />
                    <text x="32" y="22" fill="#e8edef" fontSize="7" fontWeight="700" fontFamily="Space Grotesk">Maraton</text>
                    <text x="32" y="32" fill="#6b8a97" fontSize="6" fontFamily="Space Grotesk">sub 3:15</text>
                    <text x="49" y="44" textAnchor="middle" fill="#ef4444" fontSize="5.5" fontWeight="700" fontFamily="Space Grotesk">26 sem.</text>
                    {/* Right: Physiology */}
                    <rect x="110" y="10" width="82" height="40" rx="8" fill="rgba(34,197,94,0.08)" stroke="rgba(34,197,94,0.2)" strokeWidth=".8" />
                    <text x="120" y="23" fill="#e8edef" fontSize="6.5" fontWeight="700" fontFamily="Space Grotesk">LT2</text>
                    <text x="143" y="23" fill="#22c55e" fontSize="6.5" fontWeight="600" fontFamily="Space Grotesk">4:28/km</text>
                    <text x="120" y="34" fill="#e8edef" fontSize="6.5" fontWeight="700" fontFamily="Space Grotesk">LT1</text>
                    <text x="143" y="34" fill="#22c55e" fontSize="6.5" fontWeight="600" fontFamily="Space Grotesk">5:05/km</text>
                    <text x="151" y="44" textAnchor="middle" fill="#22c55e" fontSize="5.5" fontWeight="700" fontFamily="Space Grotesk">VO2 52.1</text>
                    {/* Arrows converging */}
                    <line x1="49" y1="52" x2="80" y2="68" stroke="#d26a36" strokeWidth="1.2" strokeLinecap="round" opacity=".5" />
                    <line x1="151" y1="52" x2="120" y2="68" stroke="#d26a36" strokeWidth="1.2" strokeLinecap="round" opacity=".5" />
                    <circle cx="100" cy="70" r="4" fill="#d26a36" opacity=".15" />
                    <circle cx="100" cy="70" r="2" fill="#d26a36" />
                    <line x1="100" y1="74" x2="100" y2="82" stroke="#d26a36" strokeWidth="1.2" strokeLinecap="round" />
                    {/* Plan result */}
                    <rect x="30" y="84" width="140" height="28" rx="8" fill="rgba(210,106,54,0.1)" stroke="rgba(210,106,54,0.25)" strokeWidth=".8" />
                    <text x="100" y="96" textAnchor="middle" fill="#d26a36" fontSize="7" fontWeight="800" fontFamily="Space Grotesk">PLAN PERSONALIZADO</text>
                    <text x="100" y="106" textAnchor="middle" fill="#6b8a97" fontSize="5.5" fontFamily="Space Grotesk">Base \u2192 Especifico \u2192 Competicion</text>
                  </svg>
                </div>
                <h3 className="lp-showcase__card-title">{t("ap_6_title")}</h3>
                <p className="lp-showcase__card-desc">{t("ap_6_desc")}</p>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 7b. MOBILE APP ══ */}
      <AnimSection>
        <section className="lp-mobile" id="mobile-app">
          <div className="lp-w">
            <div className="lp-mobile__inner">
              <div className="lp-mobile__text">
                <p className="lp-ey"><span>{t("mobile_ey")}</span></p>
                <h2 className="lp-h2" style={{textAlign:"left"}}>{t("mobile_h2")}</h2>
                <p className="lp-mobile__sub">{t("mobile_sub")}</p>
                <ul className="lp-mobile__features">
                  <li>{check} {t("mobile_feat_1")}</li>
                  <li>{check} {t("mobile_feat_2")}</li>
                  <li>{check} {t("mobile_feat_3")}</li>
                  <li>{check} {t("mobile_feat_4")}</li>
                  <li>{check} {t("mobile_feat_5")}</li>
                  <li>{check} {t("mobile_feat_6")}</li>
                </ul>
                <div className="lp-mobile__badges">
                  <div className="lp-mobile__store-badge">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 12l4-8 4 8"/><path d="M8 12h8"/><path d="M12 12v8"/></svg>
                    <span>App Store</span>
                  </div>
                  <div className="lp-mobile__store-badge">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    <span>Google Play</span>
                  </div>
                </div>
              </div>
              <div className="lp-mobile__phone">
                <div className="lp-mobile__frame">
                  <div className="lp-mobile__notch"/>
                  <div className="lp-mobile__screen">
                    {/* Header */}
                    <div className="lp-mobile__header-bar">
                      <span>PeakAerobic</span>
                    </div>
                    {/* Session card */}
                    <div className="lp-mobile__card-m">
                      <span className="lp-mobile__card-label">Hoy — Martes</span>
                      <span className="lp-mobile__card-session">4×8' LT2 / 3' rec</span>
                      <span className="lp-mobile__card-zone">Zona 4 — 4:20/km</span>
                    </div>
                    {/* Wellness row */}
                    <div className="lp-mobile__wellness">
                      <div className="lp-mobile__wellness-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"><path d="M17 18a5 5 0 00-10 0"/><line x1="12" y1="2" x2="12" y2="9"/></svg>
                        <span className="lp-mobile__wellness-val">7h 42m</span>
                        <span className="lp-mobile__wellness-label">Sueno</span>
                      </div>
                      <div className="lp-mobile__wellness-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                        <span className="lp-mobile__wellness-val">62 ms</span>
                        <span className="lp-mobile__wellness-label">HRV</span>
                      </div>
                      <div className="lp-mobile__wellness-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        <span className="lp-mobile__wellness-val">82%</span>
                        <span className="lp-mobile__wellness-label">Ready</span>
                      </div>
                    </div>
                    {/* Mini chart */}
                    <div className="lp-mobile__minichart">
                      <span className="lp-mobile__card-label">LT2 evolucion</span>
                      <svg viewBox="0 0 160 40" width="100%" preserveAspectRatio="xMidYMid meet">
                        <polyline points="5,32 30,30 55,26 80,22 105,18 130,13 155,9" fill="none" stroke="#d26a36" strokeWidth="1.8" strokeLinecap="round"/>
                        {[5,30,55,80,105,130,155].map((x,i) => <circle key={i} cx={x} cy={[32,30,26,22,18,13,9][i]} r="2.5" fill="#d26a36"/>)}
                      </svg>
                    </div>
                    {/* Garmin sync */}
                    <div className="lp-mobile__garmin-m">
                      <span>⌚</span>
                      <span>Garmin sync</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 8. JOURNEY — athlete lifecycle ══ */}
      <AnimSection>
        <section className="lp-section lp-section--light" id="phys-engine">
          <div className="lp-w">
            <p className="lp-ey"><span>{t("journey_ey")}</span></p>
            <h2 className="lp-h2">{t("journey_h2")}</h2>
            <JourneyTimeline t={t} />
          </div>
        </section>
      </AnimSection>

      {/* ══ 8a. ELITE — premium standalone ══ */}
      <AnimSection>
        <section className="lp-elite" id="elite">
          <div className="lp-w">
            <div className="lp-elite__inner">
              <div className="lp-elite__text">
                <p className="lp-elite__ey"><span>{t("elite_ey")}</span></p>
                <h2 className="lp-elite__h2">{t("elite_h2")}</h2>
                <p className="lp-elite__sub">{t("elite_sub")}</p>
                <ul className="lp-elite__features">
                  <li>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {t("elite_feat_1")}
                  </li>
                  <li>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {t("elite_feat_2")}
                  </li>
                  <li>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {t("elite_feat_3")}
                  </li>
                  <li>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {t("elite_feat_4")}
                  </li>
                  <li>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {t("elite_feat_5")}
                  </li>
                  <li>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {t("elite_feat_6")}
                  </li>
                </ul>
              </div>
            </div>

            {/* Elite journey timeline */}
            <EliteJourneyTimeline t={t} />

            {/* CTA below timeline */}
            <div className="lp-elite__bottom-cta">
              <span className="lp-elite__price">{t("elite_price")}</span>
              <button className="lp-btn-solid lp-elite__cta" onClick={() => window.location.href = "mailto:david@peakaerobic.com?subject=Elite%20coaching"} type="button">
                {t("elite_cta")}
              </button>
              <p className="lp-elite__note">{t("elite_note")}</p>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 9. PRICING — 5 plans with individual CTAs ══ */}
      <AnimSection>
        <section className="lp-section lp-section--light" id="pricing">
          <div className="lp-w">
            <p className="lp-ey"><span>{t("price_ey")}</span></p>
            <h2 className="lp-h2">{t("price_h2")}</h2>

            <div className="lp-plans5">
              {/* 1. Free */}
              <div className="lp-plans5__card">
                <span className="lp-plans5__name">{t("p5_free_name")}</span>
                <span className="lp-plans5__price">{t("p5_free_price")}</span>
                <p className="lp-plans5__desc">{t("p5_free_desc")}</p>
                <button className="lp-btn-solid lp-btn--ghost lp-plans5__cta" onClick={() => navigate("/login?plan=free")} type="button">
                  {t("p5_free_cta")}
                </button>
              </div>

              {/* 2. Lactate Lab */}
              <div className="lp-plans5__card">
                <span className="lp-plans5__name">{t("p5_lab_name")}</span>
                <span className="lp-plans5__price">{t("p5_lab_price")}<small className="lp-plans5__period">{t("p5_lab_period")}</small></span>
                <p className="lp-plans5__desc">{t("p5_lab_desc")}</p>
                <button className="lp-btn-solid lp-btn--accent lp-plans5__cta" onClick={() => navigate("/login?plan=lactate_lab")} type="button">
                  {t("p5_lab_cta")}
                </button>
              </div>

              {/* 3. Plan Completo */}
              <div className="lp-plans5__card">
                <span className="lp-plans5__name">{t("p5_ai_name")}</span>
                <span className="lp-plans5__price">{t("p5_ai_price")}<small className="lp-plans5__period">{t("p5_ai_period")}</small></span>
                <p className="lp-plans5__desc">{t("p5_ai_desc")}</p>
                <button className="lp-btn-solid lp-btn--accent lp-plans5__cta" onClick={() => navigate("/login?plan=pro")} type="button">
                  {t("p5_ai_cta")}
                </button>
              </div>

              {/* 4. Pro+ — highlighted with ONLY Popular badge */}
              <div className="lp-plans5__card lp-plans5__card--pop">
                <span className="lp-plans5__badge">{t("p5_pro_badge")}</span>
                <span className="lp-plans5__name">{t("p5_pro_name")}</span>
                <span className="lp-plans5__price">{t("p5_pro_price")}<small className="lp-plans5__period">{t("p5_pro_period")}</small></span>
                <p className="lp-plans5__desc">{t("p5_pro_desc")}</p>
                <button className="lp-btn-solid lp-btn--hero lp-plans5__cta" onClick={() => navigate("/login?plan=pro_plus")} type="button">
                  {t("p5_pro_cta")}
                </button>
              </div>

              {/* 5. Elite */}
              <div className="lp-plans5__card lp-plans5__card--elite">
                <span className="lp-plans5__name">{t("p5_elite_name")}</span>
                <span className="lp-plans5__price">{t("p5_elite_price")}<small className="lp-plans5__period">{t("p5_elite_period")}</small></span>
                <p className="lp-plans5__desc">{t("p5_elite_desc")}</p>
                <button className="lp-btn-solid lp-btn--dark lp-plans5__cta" onClick={() => window.location.href = "mailto:david@peakaerobic.com?subject=Elite%20coaching"} type="button">
                  {t("p5_elite_cta")}
                </button>
              </div>
            </div>

            <p className="lp-plans5__billing-note">{t("price_billing_note")}</p>

            <div className="lp-plans5__cta-row">
              <button className="lp-btn-solid lp-btn--ghost" onClick={() => navigate("/compare-plans")} type="button">{t("p5_compare_cta")}</button>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 10. FAQ ══ */}
      <AnimSection>
        <section className="lp-section lp-section--light" id="faq">
          <div className="lp-w">
            <div className="lp-faq__wrap">
              <p className="lp-ey"><span>{t("faq_ey")}</span></p>
              <div className="lp-faq__list">
                {(["0","1","2","3","4","5","6","7","8"] as const).map(n => (
                  <details key={n} className="lp-faq__item" open={n === "0"}>
                    <summary className="lp-faq__q">{t(`faq_q${n}`)}</summary>
                    <p className="lp-faq__a">{t(`faq_a${n}`)}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
      </AnimSection>

      {/* ══ 11. FINAL CTA ══ */}
      <section className="lp-section lp-section--dark" id="cta">
        <div className="lp-w">
          <div className="lp-cta-section__inner">
            <h2 className="lp-h2 lp-h2--light">{t("cta_h2")}</h2>
            <div className="lp-cta__btn-row">
              <button className="lp-btn-solid lp-btn--hero" onClick={() => navigate("/login?plan=free")} type="button">
                {t("cta_btn")}
              </button>
            </div>
            <p className="lp-sub lp-sub--light">{t("cta_sub")}</p>
          </div>
        </div>
      </section>

      {/* ── 12. Footer ── */}
      <footer className="lp-foot">
        <div className="lp-w lp-foot__inner">
          <span className="lp-foot__brand">PeakAerobic</span>
          <span className="lp-foot__line">{t("foot_tagline")}</span>
          <div className="lp-foot__links">
            <a href="/privacy" className="lp-foot__link">{t("foot_privacy")}</a>
            <a href="/compare-plans" className="lp-foot__link" onClick={(e) => { e.preventDefault(); navigate("/compare-plans"); }}>{t("foot_compare")}</a>
          </div>
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

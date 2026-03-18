/* ── Inline SVG illustrations for each article ── */

export function ArticleGraphic({ slug }: { slug: string }) {
  const G = GRAPHICS[slug];
  if (!G) return null;
  return (
    <div className="art-graphic">
      <G />
    </div>
  );
}

/* ═══════════════════════════════════════
   1. Lactate Threshold Explained
   — Classic lactate curve with LT1/LT2
   ═══════════════════════════════════════ */
function LactateCurve() {
  const pts = [
    [30, 148], [80, 145], [130, 140], [180, 132],
    [230, 118], [280, 96], [330, 68], [380, 34], [420, 12],
  ];
  return (
    <svg viewBox="0 0 460 185" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      {/* Grid */}
      {[30, 60, 90, 120, 150].map(y => (
        <line key={y} x1="25" y1={y} x2="440" y2={y} stroke="#e5e7eb" strokeWidth=".4" />
      ))}
      {/* Y labels (mmol/L) */}
      {[0, 2, 4, 6, 8].map((v, i) => (
        <text key={v} x="18" y={153 - i * 30} textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">{v}</text>
      ))}
      {/* X label */}
      <text x="230" y="180" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">Intensidad →</text>
      {/* Curve area */}
      <path d={`M${pts.map(p => p.join(",")).join(" L")} L420,155 L30,155 Z`} fill="url(#lcGrad)" />
      {/* Curve line */}
      <path d={`M${pts.map(p => p.join(",")).join(" L")}`} fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round" />
      {/* Points */}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#fff" stroke="#d26a36" strokeWidth="1.8" />
      ))}
      {/* LT1 marker */}
      <line x1="155" y1="20" x2="155" y2="155" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5 3" />
      <rect x="125" y="8" width="60" height="18" rx="4" fill="#22c55e" />
      <text x="155" y="20" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">LT1</text>
      {/* LT2 marker */}
      <line x1="305" y1="20" x2="305" y2="155" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" />
      <rect x="275" y="8" width="60" height="18" rx="4" fill="#f59e0b" />
      <text x="305" y="20" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">LT2</text>
      {/* Zone labels */}
      <text x="85" y="170" textAnchor="middle" fill="#22c55e" fontSize="7.5" fontWeight="600" fontFamily="Space Grotesk">Aeróbico</text>
      <text x="230" y="170" textAnchor="middle" fill="#3b82f6" fontSize="7.5" fontWeight="600" fontFamily="Space Grotesk">Transición</text>
      <text x="370" y="170" textAnchor="middle" fill="#ef4444" fontSize="7.5" fontWeight="600" fontFamily="Space Grotesk">Anaeróbico</text>
      <defs>
        <linearGradient id="lcGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d26a36" stopOpacity=".15" />
          <stop offset="100%" stopColor="#d26a36" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ═══════════════════════════════════════
   2. FTP vs Lactate Testing
   — Comparison bar chart
   ═══════════════════════════════════════ */
function FtpComparison() {
  return (
    <svg viewBox="0 0 460 170" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      {/* Title */}
      <text x="230" y="18" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Umbral estimado vs umbral real</text>
      {/* FTP bar */}
      <rect x="60" y="40" width="300" height="32" rx="6" fill="#ef4444" opacity=".15" />
      <rect x="60" y="40" width="300" height="32" rx="6" fill="none" stroke="#ef4444" strokeWidth="1" opacity=".4" />
      <text x="50" y="60" textAnchor="end" fill="#ef4444" fontSize="10" fontWeight="700" fontFamily="Space Grotesk">FTP</text>
      <text x="210" y="60" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="700" fontFamily="Space Grotesk">280W</text>
      <text x="370" y="60" fill="#ef4444" fontSize="8" fontFamily="Space Grotesk">↑ Sobreestimado</text>
      {/* Lactate bar */}
      <rect x="60" y="85" width="255" height="32" rx="6" fill="#22c55e" opacity=".15" />
      <rect x="60" y="85" width="255" height="32" rx="6" fill="none" stroke="#22c55e" strokeWidth="1" opacity=".4" />
      <text x="50" y="105" textAnchor="end" fill="#22c55e" fontSize="10" fontWeight="700" fontFamily="Space Grotesk">LT2</text>
      <text x="187" y="105" textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="700" fontFamily="Space Grotesk">261W</text>
      <text x="325" y="105" fill="#22c55e" fontSize="8" fontFamily="Space Grotesk">✓ Real</text>
      {/* Gap arrow */}
      <line x1="315" y1="130" x2="360" y2="130" stroke="#d26a36" strokeWidth="1.5" markerEnd="url(#arrowR)" />
      <line x1="360" y1="130" x2="315" y2="130" stroke="#d26a36" strokeWidth="1.5" markerEnd="url(#arrowL)" />
      <text x="337" y="148" textAnchor="middle" fill="#d26a36" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">+19W gap</text>
      <text x="337" y="162" textAnchor="middle" fill="#9aabb4" fontSize="7.5" fontFamily="Space Grotesk">Entrenas demasiado fuerte si usas FTP</text>
      <defs>
        <marker id="arrowR" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto"><path d="M0,0 L6,2 L0,4" fill="#d26a36" /></marker>
        <marker id="arrowL" markerWidth="6" markerHeight="4" refX="1" refY="2" orient="auto"><path d="M6,0 L0,2 L6,4" fill="#d26a36" /></marker>
      </defs>
    </svg>
  );
}

/* ═══════════════════════════════════════
   3. Why Training Zones Wrong
   — Generic formula vs real zones
   ═══════════════════════════════════════ */
function ZonesComparison() {
  const formula = [
    { name: "Z1", w: 55, color: "#10b981" },
    { name: "Z2", w: 70, color: "#22c55e" },
    { name: "Z3", w: 50, color: "#3b82f6" },
    { name: "Z4", w: 40, color: "#f59e0b" },
    { name: "Z5", w: 30, color: "#ef4444" },
  ];
  const real = [
    { name: "Z1", w: 70, color: "#10b981" },
    { name: "Z2", w: 85, color: "#22c55e" },
    { name: "Z3", w: 35, color: "#3b82f6" },
    { name: "Z4", w: 30, color: "#f59e0b" },
    { name: "Z5", w: 25, color: "#ef4444" },
  ];
  let offF = 40;
  let offR = 40;
  return (
    <svg viewBox="0 0 460 140" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="16" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Fórmula genérica vs zonas con datos reales</text>
      {/* Formula row */}
      <text x="30" y="50" textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">220−edad</text>
      {formula.map((z, i) => {
        const x = offF;
        offF += z.w + 2;
        return (
          <g key={`f${i}`}>
            <rect x={x} y="34" width={z.w} height="22" rx="3" fill={z.color} opacity=".25" />
            <rect x={x} y="34" width={z.w} height="22" rx="3" fill="none" stroke={z.color} strokeWidth=".8" />
            <text x={x + z.w / 2} y="49" textAnchor="middle" fill={z.color} fontSize="8" fontWeight="600" fontFamily="Space Grotesk">{z.name}</text>
          </g>
        );
      })}
      {/* Real row */}
      <text x="30" y="95" textAnchor="end" fill="#d26a36" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">Lactato</text>
      {real.map((z, i) => {
        const x = offR;
        offR += z.w + 2;
        return (
          <g key={`r${i}`}>
            <rect x={x} y="79" width={z.w} height="22" rx="3" fill={z.color} opacity=".5" />
            <text x={x + z.w / 2} y="94" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">{z.name}</text>
          </g>
        );
      })}
      {/* Arrow showing difference */}
      <text x="230" y="125" textAnchor="middle" fill="#d26a36" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">↕ Hasta 15 bpm de diferencia en los límites</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   4. VO2max and VLamax Explained
   — Metabolic profile visualization
   ═══════════════════════════════════════ */
function MetabolicProfile() {
  return (
    <svg viewBox="0 0 460 165" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      {/* VO2max bar */}
      <text x="90" y="24" textAnchor="end" fill="#5e7078" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">VO2max</text>
      <rect x="100" y="12" width="320" height="20" rx="5" fill="#e5e7eb" opacity=".4" />
      <rect x="100" y="12" width="256" height="20" rx="5" fill="#22c55e" opacity=".6" />
      <text x="362" y="26" fill="#22c55e" fontSize="10" fontWeight="700" fontFamily="Space Grotesk">54.2 ml/kg/min</text>
      {/* VLamax bar */}
      <text x="90" y="60" textAnchor="end" fill="#5e7078" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">VLamax</text>
      <rect x="100" y="48" width="320" height="20" rx="5" fill="#e5e7eb" opacity=".4" />
      <rect x="100" y="48" width="134" height="20" rx="5" fill="#8b5cf6" opacity=".6" />
      <text x="240" y="62" fill="#8b5cf6" fontSize="10" fontWeight="700" fontFamily="Space Grotesk">0.42 mmol/L/s</text>
      {/* Profiles */}
      <g transform="translate(50, 85)">
        <rect x="0" y="0" width="170" height="65" rx="10" fill="#0e1e24" opacity=".06" />
        <text x="85" y="20" textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">Perfil "Diésel"</text>
        <text x="85" y="34" textAnchor="middle" fill="#5e7078" fontSize="7.5" fontFamily="Space Grotesk">VO2max alto + VLamax baja</text>
        <text x="85" y="48" textAnchor="middle" fill="#9aabb4" fontSize="7" fontFamily="Space Grotesk">Ironman · Maratón · Ultra</text>
        <text x="85" y="60" textAnchor="middle" fontSize="14">🏃</text>
      </g>
      <g transform="translate(240, 85)">
        <rect x="0" y="0" width="170" height="65" rx="10" fill="#0e1e24" opacity=".06" />
        <text x="85" y="20" textAnchor="middle" fill="#8b5cf6" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">Perfil "Turbo"</text>
        <text x="85" y="34" textAnchor="middle" fill="#5e7078" fontSize="7.5" fontFamily="Space Grotesk">VO2max medio + VLamax alta</text>
        <text x="85" y="48" textAnchor="middle" fill="#9aabb4" fontSize="7" fontFamily="Space Grotesk">5K · Sprint tri · Criterium</text>
        <text x="85" y="60" textAnchor="middle" fontSize="14">⚡</text>
      </g>
    </svg>
  );
}

/* ═══════════════════════════════════════
   5. How To Do a Lactate Test
   — Step test protocol diagram
   ═══════════════════════════════════════ */
function TestProtocol() {
  const steps = [
    { pace: "6:00", lac: "1.0", h: 15 },
    { pace: "5:30", lac: "1.2", h: 20 },
    { pace: "5:00", lac: "1.6", h: 28 },
    { pace: "4:40", lac: "2.3", h: 38 },
    { pace: "4:20", lac: "3.5", h: 55 },
    { pace: "4:00", lac: "5.2", h: 80 },
    { pace: "3:45", lac: "8.1", h: 110 },
  ];
  return (
    <svg viewBox="0 0 460 165" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="14" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Protocolo de test escalonado</text>
      {/* Steps */}
      {steps.map((s, i) => {
        const x = 40 + i * 58;
        const barY = 140 - s.h;
        const isLT1 = i === 2;
        const isLT2 = i === 4;
        return (
          <g key={i}>
            <rect x={x} y={barY} width="42" height={s.h} rx="4"
              fill={i <= 2 ? "#22c55e" : i <= 4 ? "#f59e0b" : "#ef4444"}
              opacity={isLT1 || isLT2 ? .7 : .35}
            />
            {(isLT1 || isLT2) && (
              <rect x={x} y={barY} width="42" height={s.h} rx="4"
                fill="none" stroke={isLT1 ? "#22c55e" : "#f59e0b"} strokeWidth="1.5"
              />
            )}
            <text x={x + 21} y="155" textAnchor="middle" fill="#5e7078" fontSize="7.5" fontFamily="Space Grotesk">{s.pace}</text>
            <text x={x + 21} y={barY - 4} textAnchor="middle" fill={i <= 2 ? "#22c55e" : i <= 4 ? "#f59e0b" : "#ef4444"} fontSize="8" fontWeight="600" fontFamily="Space Grotesk">{s.lac}</text>
            {isLT1 && (
              <>
                <line x1={x + 21} y1={barY - 12} x2={x + 21} y2={barY - 22} stroke="#22c55e" strokeWidth="1" />
                <text x={x + 21} y={barY - 25} textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">LT1</text>
              </>
            )}
            {isLT2 && (
              <>
                <line x1={x + 21} y1={barY - 12} x2={x + 21} y2={barY - 22} stroke="#f59e0b" strokeWidth="1" />
                <text x={x + 21} y={barY - 25} textAnchor="middle" fill="#f59e0b" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">LT2</text>
              </>
            )}
          </g>
        );
      })}
      {/* Labels */}
      <text x="230" y="165" textAnchor="middle" fill="#9aabb4" fontSize="7.5" fontFamily="Space Grotesk">min/km → cada etapa 3-4 minutos + muestra de sangre</text>
      {/* Blood drop icons */}
      {steps.map((_, i) => (
        <text key={i} x={61 + i * 58} y={140 - steps[i].h - 14 + (i === 2 || i === 4 ? -18 : 0)} textAnchor="middle" fontSize="8" opacity=".5">🩸</text>
      ))}
    </svg>
  );
}

/* ═══════════════════════════════════════
   6. Base Training / Aerobic Capacity
   — Polarized training distribution
   ═══════════════════════════════════════ */
function TrainingDistribution() {
  return (
    <svg viewBox="0 0 460 155" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="16" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Distribución ideal del entrenamiento semanal</text>
      {/* Big Zone 2 block */}
      <rect x="30" y="30" width="280" height="70" rx="10" fill="#22c55e" opacity=".2" />
      <rect x="30" y="30" width="280" height="70" rx="10" fill="none" stroke="#22c55e" strokeWidth="1.5" />
      <text x="170" y="58" textAnchor="middle" fill="#22c55e" fontSize="20" fontWeight="800" fontFamily="Space Grotesk">80%</text>
      <text x="170" y="76" textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Por debajo de LT1</text>
      <text x="170" y="90" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">Base aeróbica · Rodajes suaves · Tiradas largas</text>
      {/* Small intense block */}
      <rect x="320" y="30" width="110" height="70" rx="10" fill="#ef4444" opacity=".15" />
      <rect x="320" y="30" width="110" height="70" rx="10" fill="none" stroke="#ef4444" strokeWidth="1.5" />
      <text x="375" y="58" textAnchor="middle" fill="#ef4444" fontSize="20" fontWeight="800" fontFamily="Space Grotesk">20%</text>
      <text x="375" y="76" textAnchor="middle" fill="#ef4444" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">En o sobre LT2</text>
      <text x="375" y="90" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">Intervalos · Tempo</text>
      {/* Warning */}
      <rect x="100" y="115" width="260" height="28" rx="8" fill="#f59e0b" opacity=".1" />
      <text x="230" y="133" textAnchor="middle" fill="#f59e0b" fontSize="8.5" fontWeight="600" fontFamily="Space Grotesk">⚠ La mayoría de atletas hacen el 80% en "zona gris" — demasiado rápido para base, demasiado lento para umbral</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   7. Threshold Training Guide
   — Workout types visual
   ═══════════════════════════════════════ */
function ThresholdWorkouts() {
  return (
    <svg viewBox="0 0 460 155" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="14" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Tipos de sesión en umbral</text>
      {/* Tempo continuo */}
      <g transform="translate(15,28)">
        <text x="65" y="12" textAnchor="middle" fill="#f59e0b" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Tempo continuo</text>
        <rect x="10" y="18" width="110" height="26" rx="4" fill="#f59e0b" opacity=".3" />
        <text x="65" y="35" textAnchor="middle" fill="#f59e0b" fontSize="8" fontFamily="Space Grotesk">20–40 min @ LT2</text>
      </g>
      {/* Cruise intervals */}
      <g transform="translate(155,28)">
        <text x="75" y="12" textAnchor="middle" fill="#d26a36" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Cruise intervals</text>
        {[0,1,2,3].map(i => (
          <g key={i}>
            <rect x={i * 37 + 2} y="18" width="28" height="26" rx="3" fill="#d26a36" opacity=".35" />
            <rect x={i * 37 + 32} y="18" width="5" height="26" rx="2" fill="#22c55e" opacity=".2" />
          </g>
        ))}
        <text x="75" y="58" textAnchor="middle" fill="#9aabb4" fontSize="7" fontFamily="Space Grotesk">4–6 × 6–8 min / 2 min rec</text>
      </g>
      {/* Over-under */}
      <g transform="translate(310,28)">
        <text x="70" y="12" textAnchor="middle" fill="#8b5cf6" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Over / Under</text>
        {[0,1,2].map(i => (
          <g key={i}>
            <rect x={i * 46 + 2} y="28" width="20" height="16" rx="2" fill="#ef4444" opacity=".3" />
            <rect x={i * 46 + 24} y="22" width="20" height="22" rx="2" fill="#22c55e" opacity=".2" />
            <text x={i * 46 + 12} y="25" textAnchor="middle" fill="#ef4444" fontSize="6" fontFamily="Space Grotesk">+5%</text>
            <text x={i * 46 + 34} y="25" textAnchor="middle" fill="#22c55e" fontSize="6" fontFamily="Space Grotesk">−5%</text>
          </g>
        ))}
        <text x="70" y="58" textAnchor="middle" fill="#9aabb4" fontSize="7" fontFamily="Space Grotesk">3–4 × (2 min over + 3 min under)</text>
      </g>
      {/* HR zone line */}
      <line x1="30" y1="90" x2="430" y2="90" stroke="#e5e7eb" strokeWidth=".5" />
      <text x="230" y="105" textAnchor="middle" fill="#5e7078" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Progresión semanal recomendada</text>
      {/* Progression */}
      {["Semana 1: 3×8'", "Semana 2: 4×8'", "Semana 3: 4×10'", "Semana 4: Descanso"].map((w, i) => (
        <g key={i}>
          <rect x={30 + i * 105} y="112" width="95" height="24" rx="5" fill={i === 3 ? "#22c55e" : "#d26a36"} opacity={i === 3 ? ".12" : `.${15 + i * 10}`} />
          <text x={77 + i * 105} y="128" textAnchor="middle" fill={i === 3 ? "#22c55e" : "#d26a36"} fontSize="8" fontWeight="600" fontFamily="Space Grotesk">{w}</text>
        </g>
      ))}
    </svg>
  );
}

/* ═══════════════════════════════════════
   8. Race Prediction from Lactate
   — Pace prediction chart
   ═══════════════════════════════════════ */
function RacePrediction() {
  const races = [
    { name: "5K", pace: "4:05", bar: 65, color: "#ef4444" },
    { name: "10K", pace: "4:15", bar: 75, color: "#f59e0b" },
    { name: "Media", pace: "4:32", bar: 95, color: "#d26a36" },
    { name: "Maratón", pace: "4:48", bar: 120, color: "#3b82f6" },
  ];
  return (
    <svg viewBox="0 0 460 160" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="16" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Predicción de ritmo desde tus umbrales</text>
      {/* LT2 reference */}
      <line x1="30" y1="32" x2="430" y2="32" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" />
      <text x="430" y="30" textAnchor="end" fill="#f59e0b" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">Tu LT2: 4:24/km</text>
      {races.map((r, i) => {
        const y = 50 + i * 28;
        return (
          <g key={r.name}>
            <text x="55" y={y + 14} textAnchor="end" fill="#5e7078" fontSize="10" fontWeight="700" fontFamily="Space Grotesk">{r.name}</text>
            <rect x="65" y={y} width={r.bar * 2.5} height="20" rx="5" fill={r.color} opacity=".25" />
            <rect x="65" y={y} width={r.bar * 2.5} height="20" rx="5" fill="none" stroke={r.color} strokeWidth=".8" />
            <text x={75 + r.bar * 2.5} y={y + 14} fill={r.color} fontSize="10" fontWeight="700" fontFamily="Space Grotesk">{r.pace}/km</text>
          </g>
        );
      })}
      <text x="230" y="155" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">Basado en modelo energético desde LT2 a 4:24/km y VO2max estimado</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   9. How Often to Retest Lactate
   — Timeline diagram
   ═══════════════════════════════════════ */
function RetestTimeline() {
  const phases = [
    { name: "Base", weeks: 12, freq: "8–12 sem", color: "#22c55e" },
    { name: "Específico", weeks: 8, freq: "4–6 sem", color: "#f59e0b" },
    { name: "Pre-comp", weeks: 4, freq: "3–4 sem", color: "#ef4444" },
    { name: "Comp", weeks: 2, freq: "No testear", color: "#8b5cf6" },
  ];
  let x = 40;
  return (
    <svg viewBox="0 0 460 120" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="16" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Frecuencia de retest según fase</text>
      {/* Timeline bar */}
      <line x1="40" y1="55" x2="420" y2="55" stroke="#e5e7eb" strokeWidth="2" />
      {phases.map((p) => {
        const w = (p.weeks / 26) * 380;
        const startX = x;
        x += w;
        return (
          <g key={p.name}>
            <rect x={startX} y="40" width={w - 4} height="30" rx="6" fill={p.color} opacity=".2" />
            <rect x={startX} y="40" width={w - 4} height="30" rx="6" fill="none" stroke={p.color} strokeWidth="1" opacity=".5" />
            <text x={startX + (w - 4) / 2} y="54" textAnchor="middle" fill={p.color} fontSize="9" fontWeight="700" fontFamily="Space Grotesk">{p.name}</text>
            <text x={startX + (w - 4) / 2} y="66" textAnchor="middle" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk">{p.freq}</text>
          </g>
        );
      })}
      {/* Test markers */}
      {[40, 120, 210, 280, 340].map((tx, i) => (
        <g key={i}>
          <circle cx={tx} cy="88" r="4" fill="#d26a36" />
          <line x1={tx} y1="70" x2={tx} y2="84" stroke="#d26a36" strokeWidth="1" strokeDasharray="2 2" />
        </g>
      ))}
      <text x="230" y="108" textAnchor="middle" fill="#d26a36" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">● = Test de lactato recomendado</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   10. Portable Analyzer Comparison
   — Specs comparison table
   ═══════════════════════════════════════ */
function AnalyzerComparison() {
  const analyzers = [
    { name: "Lactate Plus", price: "~350€", strips: "~2€/u", vol: "0.7μL", time: "13s", color: "#3b82f6" },
    { name: "Lactate Pro 2", price: "~400€", strips: "~3€/u", vol: "0.3μL", time: "15s", color: "#22c55e" },
    { name: "EKF Biosen", price: "~2500€", strips: "~0.5€/u", vol: "20μL", time: "20s", color: "#8b5cf6" },
  ];
  return (
    <svg viewBox="0 0 460 145" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      {/* Header row */}
      <text x="80" y="18" textAnchor="middle" fill="#5e7078" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Analizador</text>
      <text x="180" y="18" textAnchor="middle" fill="#5e7078" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Precio</text>
      <text x="260" y="18" textAnchor="middle" fill="#5e7078" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Tira</text>
      <text x="340" y="18" textAnchor="middle" fill="#5e7078" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Muestra</text>
      <text x="420" y="18" textAnchor="middle" fill="#5e7078" fontSize="8" fontWeight="700" fontFamily="Space Grotesk">Tiempo</text>
      <line x1="20" y1="24" x2="440" y2="24" stroke="#e5e7eb" strokeWidth=".5" />
      {analyzers.map((a, i) => {
        const y = 40 + i * 38;
        return (
          <g key={a.name}>
            <rect x="20" y={y - 6} width="420" height="30" rx="6" fill={a.color} opacity=".06" />
            <circle cx="35" cy={y + 9} r="6" fill={a.color} opacity=".3" />
            <text x="80" y={y + 13} textAnchor="middle" fill={a.color} fontSize="9" fontWeight="700" fontFamily="Space Grotesk">{a.name}</text>
            <text x="180" y={y + 13} textAnchor="middle" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk">{a.price}</text>
            <text x="260" y={y + 13} textAnchor="middle" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk">{a.strips}</text>
            <text x="340" y={y + 13} textAnchor="middle" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk">{a.vol}</text>
            <text x="420" y={y + 13} textAnchor="middle" fill="#5e7078" fontSize="9" fontFamily="Space Grotesk">{a.time}</text>
          </g>
        );
      })}
      <text x="230" y="140" textAnchor="middle" fill="#9aabb4" fontSize="7.5" fontFamily="Space Grotesk">Lactate Plus / Lactate Pro 2 → atleta individual · EKF Biosen → laboratorio o coach con muchos atletas</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   11. Triathlon Zones Three Sports
   — Zones per sport visualization
   ═══════════════════════════════════════ */
function TriathlonZones() {
  const sports = [
    { name: "Natación", icon: "🏊", lt1: "1:50/100m", lt2: "1:38/100m", color: "#3b82f6" },
    { name: "Ciclismo", icon: "🚴", lt1: "185W", lt2: "245W", color: "#22c55e" },
    { name: "Carrera", icon: "🏃", lt1: "5:15/km", lt2: "4:24/km", color: "#f59e0b" },
  ];
  return (
    <svg viewBox="0 0 460 145" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="16" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Umbrales por disciplina — mismo atleta</text>
      {sports.map((s, i) => {
        const y = 30 + i * 38;
        return (
          <g key={s.name}>
            <rect x="20" y={y} width="420" height="30" rx="8" fill={s.color} opacity=".08" />
            <text x="40" y={y + 19} fill="#5e7078" fontSize="12">{s.icon}</text>
            <text x="80" y={y + 19} fill={s.color} fontSize="10" fontWeight="700" fontFamily="Space Grotesk">{s.name}</text>
            {/* LT1 */}
            <rect x="175" y={y + 4} width="90" height="22" rx="5" fill="#22c55e" opacity=".15" />
            <text x="220" y={y + 19} textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">LT1: {s.lt1}</text>
            {/* LT2 */}
            <rect x="280" y={y + 4} width="90" height="22" rx="5" fill={s.color} opacity=".2" />
            <text x="325" y={y + 19} textAnchor="middle" fill={s.color} fontSize="9" fontWeight="600" fontFamily="Space Grotesk">LT2: {s.lt2}</text>
            {/* FC */}
            <text x="400" y={y + 19} fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">FC ≠</text>
          </g>
        );
      })}
      <text x="230" y="140" textAnchor="middle" fill="#d26a36" fontSize="8.5" fontWeight="600" fontFamily="Space Grotesk">⚠ Las zonas de FC NO son transferibles entre deportes — necesitas un test por disciplina</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   12. Periodization / Mesocycle Guide
   — Block training timeline
   ═══════════════════════════════════════ */
function PeriodizationBlocks() {
  const blocks = [
    { name: "Base", weeks: 6, color: "#22c55e", detail: "Vol. alto · Int. baja" },
    { name: "Específico", weeks: 5, color: "#3b82f6", detail: "LT2 · Umbral" },
    { name: "Pre-comp", weeks: 3, color: "#f59e0b", detail: "Ritmo carrera" },
    { name: "Taper", weeks: 2, color: "#8b5cf6", detail: "−40% volumen" },
  ];
  let x = 30;
  return (
    <svg viewBox="0 0 460 145" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="16" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Ejemplo: 16 semanas hasta media maratón</text>
      {blocks.map((b) => {
        const w = (b.weeks / 16) * 400;
        const startX = x;
        x += w;
        return (
          <g key={b.name}>
            <rect x={startX} y="28" width={w - 6} height="55" rx="8" fill={b.color} opacity=".15" />
            <rect x={startX} y="28" width={w - 6} height="55" rx="8" fill="none" stroke={b.color} strokeWidth="1.2" />
            <text x={startX + (w - 6) / 2} y="48" textAnchor="middle" fill={b.color} fontSize="10" fontWeight="700" fontFamily="Space Grotesk">{b.name}</text>
            <text x={startX + (w - 6) / 2} y="62" textAnchor="middle" fill="#5e7078" fontSize="7.5" fontFamily="Space Grotesk">{b.weeks} sem</text>
            <text x={startX + (w - 6) / 2} y="76" textAnchor="middle" fill="#9aabb4" fontSize="7" fontFamily="Space Grotesk">{b.detail}</text>
          </g>
        );
      })}
      {/* Wave pattern inside */}
      <text x="230" y="105" textAnchor="middle" fill="#5e7078" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Patrón de carga dentro de cada bloque</text>
      {[0,1,2,3].map(b => {
        const bx = 50 + b * 100;
        return (
          <g key={b}>
            {["Carga","Carga","Carga","Rec."].slice(0, b === 3 ? 2 : 4).map((w, i) => (
              <rect key={i} x={bx + i * 22} y={w === "Rec." ? 120 : 115 - i * 3} width="18" height={w === "Rec." ? 10 : 14 + i * 3} rx="2"
                fill={blocks[b].color} opacity={w === "Rec." ? .15 : .2 + i * .1}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════
   13. How to Read Lactate Curve
   — Curve with annotated shape features
   ═══════════════════════════════════════ */
function CurveInterpretation() {
  const pts = [
    [30, 150], [80, 148], [130, 144], [180, 136],
    [230, 120], [280, 96], [330, 62], [380, 28],
  ];
  return (
    <svg viewBox="0 0 460 185" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      {[30, 60, 90, 120, 150].map(y => (
        <line key={y} x1="25" y1={y} x2="420" y2={y} stroke="#e5e7eb" strokeWidth=".4" />
      ))}
      <path d={`M${pts.map(p => p.join(",")).join(" L")} L380,155 L30,155 Z`} fill="url(#ciGrad)" />
      <path d={`M${pts.map(p => p.join(",")).join(" L")}`} fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#fff" stroke="#d26a36" strokeWidth="1.5" />
      ))}
      {/* Annotations */}
      <line x1="130" y1="144" x2="130" y2="165" stroke="#2ecc71" strokeWidth="1" strokeDasharray="3" />
      <text x="130" y="174" textAnchor="middle" fill="#2ecc71" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">LT1</text>
      <line x1="280" y1="96" x2="280" y2="165" stroke="#e67e22" strokeWidth="1" strokeDasharray="3" />
      <text x="280" y="174" textAnchor="middle" fill="#e67e22" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">LT2</text>
      {/* Slope annotation */}
      <path d="M 180,136 Q 230,108 280,96" fill="none" stroke="#5e7078" strokeWidth="1.2" strokeDasharray="4" />
      <text x="240" y="108" textAnchor="middle" fill="#5e7078" fontSize="7" fontFamily="Space Grotesk">pendiente = VLamax</text>
      <text x="80" y="158" fill="#9aabb4" fontSize="7" fontFamily="Space Grotesk">zona plana = AEC</text>
      <defs><linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d26a36" stopOpacity=".18" /><stop offset="100%" stopColor="#d26a36" stopOpacity="0" /></linearGradient></defs>
    </svg>
  );
}

/* ═══════════════════════════════════════
   14. Zone 2 Lactate Science
   — HR zone bars with lactate overlay
   ═══════════════════════════════════════ */
function Zone2LactateBars() {
  const zones = [
    { label: "Z1", w: 55, color: "#3498db", lac: "0.8" },
    { label: "Z2", w: 70, color: "#2ecc71", lac: "1.5" },
    { label: "Z3", w: 55, color: "#f1c40f", lac: "2.5" },
    { label: "Z4", w: 50, color: "#e67e22", lac: "4.0" },
    { label: "Z5", w: 40, color: "#e74c3c", lac: "7.0" },
  ];
  let x = 40;
  return (
    <svg viewBox="0 0 460 140" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="15" textAnchor="middle" fill="#5e7078" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Zonas reales vs zonas de fórmula</text>
      {zones.map((z, i) => {
        const cx = x;
        x += z.w + 8;
        return (
          <g key={i}>
            <rect x={cx} y="30" width={z.w} height="50" rx="6" fill={z.color} opacity=".25" />
            <rect x={cx} y="30" width={z.w} height="50" rx="6" fill="none" stroke={z.color} strokeWidth="1.5" />
            <text x={cx + z.w / 2} y="52" textAnchor="middle" fill={z.color} fontSize="14" fontWeight="700" fontFamily="Space Grotesk">{z.label}</text>
            <text x={cx + z.w / 2} y="70" textAnchor="middle" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">{z.lac} mmol</text>
            {i === 1 && (
              <g>
                <rect x={cx - 2} y="25" width={z.w + 4} height="60" rx="8" fill="none" stroke="#2ecc71" strokeWidth="2" strokeDasharray="4" />
                <text x={cx + z.w / 2} y="100" textAnchor="middle" fill="#2ecc71" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">← zona real de base</text>
              </g>
            )}
          </g>
        );
      })}
      <text x="230" y="125" textAnchor="middle" fill="#9aabb4" fontSize="7.5" fontFamily="Space Grotesk">Definida por lactato, no por % de FC máxima</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   15. Lactate Myths Debunked
   — Myth vs Reality cards
   ═══════════════════════════════════════ */
function MythsDebunked() {
  const myths = [
    { myth: "Desecho", truth: "Combustible" },
    { myth: "Causa agujetas", truth: "DOMS ≠ lactato" },
    { myth: "Siempre malo", truth: "Señal metabólica" },
  ];
  return (
    <svg viewBox="0 0 460 130" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="15" textAnchor="middle" fill="#5e7078" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Mitos vs Realidad</text>
      {myths.map((m, i) => {
        const x = 30 + i * 145;
        return (
          <g key={i}>
            <rect x={x} y="28" width="130" height="38" rx="6" fill="#e74c3c" opacity=".12" />
            <line x1={x + 10} y1="42" x2={x + 120} y2="52" stroke="#e74c3c" strokeWidth="1.5" />
            <text x={x + 65} y="52" textAnchor="middle" fill="#e74c3c" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">{m.myth}</text>
            <text x={x + 65} y="75" textAnchor="middle" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">↓</text>
            <rect x={x} y="82" width="130" height="38" rx="6" fill="#2ecc71" opacity=".12" />
            <text x={x + 65} y="106" textAnchor="middle" fill="#2ecc71" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">{m.truth}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════
   16. Overtraining Detection
   — Two curves: normal vs overtrained
   ═══════════════════════════════════════ */
function OvertrainingCurves() {
  const normal = [[30, 148], [100, 144], [170, 135], [240, 118], [310, 90], [380, 50]];
  const overtrained = [[30, 140], [100, 130], [170, 112], [240, 88], [310, 58], [380, 30]];
  return (
    <svg viewBox="0 0 460 185" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      {[40, 70, 100, 130, 155].map(y => (
        <line key={y} x1="25" y1={y} x2="420" y2={y} stroke="#e5e7eb" strokeWidth=".3" />
      ))}
      <path d={`M${normal.map(p => p.join(",")).join(" L")}`} fill="none" stroke="#2ecc71" strokeWidth="2.2" strokeLinecap="round" />
      <path d={`M${overtrained.map(p => p.join(",")).join(" L")}`} fill="none" stroke="#e74c3c" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="6" />
      {/* Labels */}
      <circle cx="50" cy="170" r="4" fill="#2ecc71" />
      <text x="60" y="173" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">Normal</text>
      <circle cx="130" cy="170" r="4" fill="#e74c3c" />
      <text x="140" y="173" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">Sobreentrenado</text>
      <text x="390" y="44" fill="#e74c3c" fontSize="7.5" fontWeight="600" fontFamily="Space Grotesk">↑ lactato</text>
      <text x="390" y="56" fill="#e74c3c" fontSize="7" fontFamily="Space Grotesk">a misma</text>
      <text x="390" y="66" fill="#e74c3c" fontSize="7" fontFamily="Space Grotesk">intensidad</text>
      <text x="230" y="180" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">Intensidad →</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   17. Lactate Testing Swimming
   — Pool lanes with test protocol
   ═══════════════════════════════════════ */
function SwimmingProtocol() {
  const steps = ["200m", "200m", "200m", "200m", "200m"];
  const paces = ["2:20", "2:10", "2:00", "1:50", "1:40"];
  return (
    <svg viewBox="0 0 460 130" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="15" textAnchor="middle" fill="#5e7078" fontSize="9" fontWeight="600" fontFamily="Space Grotesk">Protocolo de test en piscina</text>
      {/* Pool lanes */}
      {steps.map((s, i) => {
        const y = 28 + i * 20;
        const width = 250 + i * 25;
        return (
          <g key={i}>
            <rect x="60" y={y} width={width} height="14" rx="3" fill="#3498db" opacity={0.1 + i * 0.08} />
            <text x="45" y={y + 11} textAnchor="end" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">{i + 1}</text>
            <text x="70" y={y + 11} fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">{s} @ {paces[i]}/100m</text>
            <circle cx={60 + width + 15} cy={y + 7} r="5" fill="#e74c3c" opacity=".2" />
            <text x={60 + width + 15} y={y + 10} textAnchor="middle" fill="#e74c3c" fontSize="6" fontWeight="700" fontFamily="Space Grotesk">🩸</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════
   18. Energy Systems Balance
   — Two-dial VO2max/VLamax gauge
   ═══════════════════════════════════════ */
function EnergyBalance() {
  return (
    <svg viewBox="0 0 460 150" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="18" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Los dos motores del rendimiento</text>
      {/* VO2max gauge */}
      <g transform="translate(120, 85)">
        <path d="M -55 0 A 55 55 0 0 1 55 0" fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
        <path d="M -55 0 A 55 55 0 0 1 38 -38" fill="none" stroke="#2ecc71" strokeWidth="10" strokeLinecap="round" />
        <text x="0" y="-15" textAnchor="middle" fill="#2ecc71" fontSize="12" fontWeight="700" fontFamily="Space Grotesk">VO₂max</text>
        <text x="0" y="2" textAnchor="middle" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">Aeróbico</text>
        <text x="0" y="15" textAnchor="middle" fill="#9aabb4" fontSize="7" fontFamily="Space Grotesk">techo de O₂</text>
      </g>
      {/* VLamax gauge */}
      <g transform="translate(340, 85)">
        <path d="M -55 0 A 55 55 0 0 1 55 0" fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
        <path d="M -55 0 A 55 55 0 0 1 10 -54" fill="none" stroke="#e67e22" strokeWidth="10" strokeLinecap="round" />
        <text x="0" y="-15" textAnchor="middle" fill="#e67e22" fontSize="12" fontWeight="700" fontFamily="Space Grotesk">VLamax</text>
        <text x="0" y="2" textAnchor="middle" fill="#5e7078" fontSize="8" fontFamily="Space Grotesk">Glucolítico</text>
        <text x="0" y="15" textAnchor="middle" fill="#9aabb4" fontSize="7" fontFamily="Space Grotesk">potencia anaeróbica</text>
      </g>
      {/* Balance arrow */}
      <line x1="190" y1="85" x2="270" y2="85" stroke="#5e7078" strokeWidth="1.5" markerEnd="url(#arrowEB)" markerStart="url(#arrowEB2)" />
      <text x="230" y="100" textAnchor="middle" fill="#5e7078" fontSize="7.5" fontWeight="600" fontFamily="Space Grotesk">equilibrio</text>
      <defs>
        <marker id="arrowEB" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#5e7078" /></marker>
        <marker id="arrowEB2" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse"><path d="M6,0 L0,3 L6,6" fill="#5e7078" /></marker>
      </defs>
    </svg>
  );
}

/* ═══════════════════════════════════════
   19. Lactate Curve Shifts
   — Three curves showing right/down shift
   ═══════════════════════════════════════ */
function CurveShifts() {
  const before = [[30, 145], [90, 140], [150, 128], [210, 108], [270, 78], [330, 40]];
  const rightShift = [[60, 145], [120, 142], [180, 134], [240, 116], [300, 84], [360, 44]];
  const downShift = [[30, 148], [90, 146], [150, 140], [210, 128], [270, 106], [330, 72]];
  return (
    <svg viewBox="0 0 460 185" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      {[40, 70, 100, 130, 155].map(y => (
        <line key={y} x1="25" y1={y} x2="420" y2={y} stroke="#e5e7eb" strokeWidth=".3" />
      ))}
      <path d={`M${before.map(p => p.join(",")).join(" L")}`} fill="none" stroke="#9aabb4" strokeWidth="2" strokeLinecap="round" strokeDasharray="4" />
      <path d={`M${rightShift.map(p => p.join(",")).join(" L")}`} fill="none" stroke="#2ecc71" strokeWidth="2.2" strokeLinecap="round" />
      <path d={`M${downShift.map(p => p.join(",")).join(" L")}`} fill="none" stroke="#3498db" strokeWidth="2.2" strokeLinecap="round" />
      {/* Labels */}
      <circle cx="40" cy="170" r="3.5" fill="#9aabb4" />
      <text x="50" y="173" fill="#9aabb4" fontSize="7.5" fontFamily="Space Grotesk">Antes</text>
      <circle cx="110" cy="170" r="3.5" fill="#2ecc71" />
      <text x="120" y="173" fill="#2ecc71" fontSize="7.5" fontFamily="Space Grotesk">→ Derecha (AEC ↑)</text>
      <circle cx="250" cy="170" r="3.5" fill="#3498db" />
      <text x="260" y="173" fill="#3498db" fontSize="7.5" fontFamily="Space Grotesk">↓ Abajo (VLamax ↓)</text>
      <text x="230" y="182" textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">Intensidad →</text>
    </svg>
  );
}

/* ═══════════════════════════════════════
   20. VLamax Training Guide
   — High vs Low VLamax spectrum
   ═══════════════════════════════════════ */
function VlamaxSpectrum() {
  const sports = [
    { label: "Maratón", pos: 50, color: "#2ecc71" },
    { label: "Ironman", pos: 100, color: "#2ecc71" },
    { label: "10K", pos: 180, color: "#f1c40f" },
    { label: "5K", pos: 250, color: "#e67e22" },
    { label: "Sprint", pos: 340, color: "#e74c3c" },
    { label: "Track", pos: 390, color: "#e74c3c" },
  ];
  return (
    <svg viewBox="0 0 460 130" className="art-graphic__svg" preserveAspectRatio="xMidYMid meet">
      <text x="230" y="18" textAnchor="middle" fill="#5e7078" fontSize="10" fontWeight="600" fontFamily="Space Grotesk">Espectro VLamax por disciplina</text>
      {/* Gradient bar */}
      <defs>
        <linearGradient id="vlGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2ecc71" />
          <stop offset="50%" stopColor="#f1c40f" />
          <stop offset="100%" stopColor="#e74c3c" />
        </linearGradient>
      </defs>
      <rect x="30" y="40" width="400" height="16" rx="8" fill="url(#vlGrad)" opacity=".3" />
      <rect x="30" y="40" width="400" height="16" rx="8" fill="none" stroke="url(#vlGrad)" strokeWidth="1.2" />
      <text x="30" y="72" fill="#2ecc71" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">VLamax BAJA</text>
      <text x="430" y="72" textAnchor="end" fill="#e74c3c" fontSize="8" fontWeight="600" fontFamily="Space Grotesk">VLamax ALTA</text>
      {/* Sport markers */}
      {sports.map((s, i) => (
        <g key={i}>
          <line x1={s.pos} y1="56" x2={s.pos} y2="84" stroke={s.color} strokeWidth="1.2" />
          <circle cx={s.pos} cy="48" r="4" fill={s.color} />
          <text x={s.pos} y="96" textAnchor="middle" fill="#5e7078" fontSize="7.5" fontWeight="600" fontFamily="Space Grotesk">{s.label}</text>
        </g>
      ))}
      <text x="230" y="116" textAnchor="middle" fill="#9aabb4" fontSize="7.5" fontFamily="Space Grotesk">Endurance ← → Potencia anaeróbica</text>
    </svg>
  );
}

/* ═══════════════════════════════════════ */
const GRAPHICS: Record<string, () => JSX.Element> = {
  "lactate-threshold-explained": LactateCurve,
  "ftp-vs-lactate-testing": FtpComparison,
  "why-training-zones-wrong": ZonesComparison,
  "vo2max-vlamax-explained": MetabolicProfile,
  "how-to-do-lactate-test": TestProtocol,
  "base-training-aerobic-capacity": TrainingDistribution,
  "threshold-training-guide": ThresholdWorkouts,
  "race-prediction-from-lactate": RacePrediction,
  "how-often-lactate-test": RetestTimeline,
  "portable-lactate-analyzer-comparison": AnalyzerComparison,
  "triathlon-zones-three-sports": TriathlonZones,
  "periodization-mesocycle-guide": PeriodizationBlocks,
  "how-to-read-lactate-curve": CurveInterpretation,
  "zone-2-training-lactate-science": Zone2LactateBars,
  "lactate-myths-debunked": MythsDebunked,
  "overtraining-detection-lactate": OvertrainingCurves,
  "lactate-testing-swimming": SwimmingProtocol,
  "energy-systems-balance": EnergyBalance,
  "lactate-curve-shifts": CurveShifts,
  "vlamax-training-guide": VlamaxSpectrum,
};

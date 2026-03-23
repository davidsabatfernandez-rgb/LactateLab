import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "./i18n";

/* ── Types ── */
type InputMode = "pace" | "power";
interface Row { intensity: string; lactate: string }

interface DemoResult {
  points: { x: number; y: number; intensity: string; lac: number }[];
  lt1: { intensity: string; lac: number; idx: number } | null;
  lt2: { intensity: string; lac: number; idx: number } | null;
  confidence: number;
  prediction10k: string;
  prediction5k: string;
  predictionHM: string;
  predictionMarathon: string;
  vo2maxEst: number | null;
  zones: { name: string; from: string; to: string; color: string }[];
}

/* ── Helpers ── */
function paceToSeconds(p: string): number {
  const [m, s] = p.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}
function secondsToPace(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function formatTime(totalSecs: number): string {
  if (totalSecs >= 3600) {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.round(totalSecs % 60);
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  const m = Math.floor(totalSecs / 60);
  const s = Math.round(totalSecs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function paceToSpeed(p: string): number {
  const s = paceToSeconds(p);
  return s > 0 ? 3600 / s : 0;
}

/* ── Sample data ── */
const SAMPLE_PACE: Row[] = [
  { intensity: "6:00", lactate: "0.8" },
  { intensity: "5:40", lactate: "0.9" },
  { intensity: "5:20", lactate: "1.1" },
  { intensity: "5:00", lactate: "1.4" },
  { intensity: "4:40", lactate: "1.9" },
  { intensity: "4:20", lactate: "2.7" },
  { intensity: "4:00", lactate: "3.8" },
  { intensity: "3:40", lactate: "5.8" },
  { intensity: "3:20", lactate: "8.5" },
];

const SAMPLE_POWER: Row[] = [
  { intensity: "120", lactate: "0.9" },
  { intensity: "150", lactate: "1.0" },
  { intensity: "180", lactate: "1.2" },
  { intensity: "210", lactate: "1.5" },
  { intensity: "240", lactate: "2.1" },
  { intensity: "270", lactate: "3.0" },
  { intensity: "300", lactate: "4.2" },
  { intensity: "330", lactate: "6.1" },
  { intensity: "350", lactate: "8.8" },
];

/* ── Client-side analysis ── */
function analyze(rows: Row[], mode: InputMode, hrMax: number, hrRest: number, peakLactateSprint: number): DemoResult | null {
  const parsed = rows
    .map((r) => ({
      intensity: r.intensity.trim(),
      lac: parseFloat(r.lactate),
      speed: mode === "pace" ? paceToSpeed(r.intensity) : parseFloat(r.intensity),
    }))
    .filter((p) => p.speed > 0 && !isNaN(p.lac) && p.lac >= 0);

  if (parsed.length < 4) return null;
  parsed.sort((a, b) => a.speed - b.speed);

  const baseline = (parsed[0].lac + parsed[1].lac) / 2;

  // LT1: baseline + 0.5 mmol (Faude 2009)
  let lt1Idx = -1;
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].lac > baseline + 0.5) { lt1Idx = i; break; }
  }

  // LT2: max second derivative
  let lt2Idx = -1;
  let maxAccel = 0;
  for (let i = 1; i < parsed.length - 1; i++) {
    const d1 = (parsed[i].lac - parsed[i - 1].lac) / (parsed[i].speed - parsed[i - 1].speed || 0.01);
    const d2 = (parsed[i + 1].lac - parsed[i].lac) / (parsed[i + 1].speed - parsed[i].speed || 0.01);
    const accel = d2 - d1;
    if (accel > maxAccel) { maxAccel = accel; lt2Idx = i; }
  }

  if (lt2Idx <= lt1Idx) {
    let bestDist = Infinity;
    for (let i = Math.max(lt1Idx + 1, 1); i < parsed.length; i++) {
      const dist = Math.abs(parsed[i].lac - 4.0);
      if (dist < bestDist) { bestDist = dist; lt2Idx = i; }
    }
  }

  // Confidence
  let monotonic = 0;
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].lac >= parsed[i - 1].lac - 0.15) monotonic++;
  }
  const monoScore = monotonic / (parsed.length - 1);
  const pointScore = Math.min(parsed.length / 10, 1);
  const sepScore = lt1Idx >= 0 && lt2Idx > lt1Idx ? Math.min((lt2Idx - lt1Idx) / 3, 1) : 0.3;
  const confidence = Math.round((monoScore * 0.4 + pointScore * 0.3 + sepScore * 0.3) * 100) / 100;

  // VO2max estimation (Swain simplified: from LT2 speed + HR)
  let vo2maxEst: number | null = null;
  if (lt2Idx >= 0 && mode === "pace" && hrMax > 0) {
    const lt2SpeedKmh = parsed[lt2Idx].speed;
    // ACSM running VO2: VO2 (ml/kg/min) = 3.5 + speed_m_min * 0.2
    const speedMmin = (lt2SpeedKmh * 1000) / 60;
    const vo2AtLT2 = 3.5 + speedMmin * 0.2;
    // LT2 ≈ 80-85% VO2max in trained runners
    const fractionAtLT2 = 0.82;
    vo2maxEst = Math.round(vo2AtLT2 / fractionAtLT2 * 10) / 10;
  }

  // VLamax: accepts either direct VLamax (0.1-0.99) or peak lactate from 15-30" all-out (≥4 mmol/L)
  let vlaxProxy = 0.35; // neutral default
  if (peakLactateSprint > 0 && peakLactateSprint < 1.0) {
    // Direct VLamax input (mmol/L/s)
    vlaxProxy = Math.max(0.10, Math.min(0.80, peakLactateSprint));
  } else if (peakLactateSprint >= 4.0) {
    // Peak lactate from sprint test → map to VLamax proxy
    vlaxProxy = Math.max(0.20, Math.min(0.55, 0.10 + peakLactateSprint * 0.02));
  } else if (lt1Idx >= 0 && lt2Idx > lt1Idx) {
    // Fallback: ratio-based estimate when no sprint data
    const ratio = parsed[lt1Idx].speed / parsed[lt2Idx].speed;
    if (ratio > 0.87) vlaxProxy = 0.25;
    else if (ratio > 0.83) vlaxProxy = 0.30;
    else if (ratio > 0.79) vlaxProxy = 0.35;
    else if (ratio > 0.75) vlaxProxy = 0.42;
    else vlaxProxy = 0.50;
  }

  // Race predictions using Daniels sustainable fraction + VLamax modulation
  // F(T) = 0.8 + 0.1894*e^(-0.01278*T) + 0.2990*e^(-0.1933*T)  T in minutes
  function danielsFraction(mins: number): number {
    return 0.8 + 0.1894 * Math.exp(-0.01278 * mins) + 0.2990 * Math.exp(-0.1933 * mins);
  }

  function vlaxModulation(distKm: number): number {
    // Sensitivity: higher for longer distances
    const sensitivity: Record<number, number> = { 5: 0.05, 10: 0.10, 21.1: 0.16, 42.2: 0.22 };
    const s = sensitivity[distKm] ?? 0.10;
    return 1 - s * (vlaxProxy - 0.35);
  }

  let prediction5k = "—", prediction10k = "—", predictionHM = "—", predictionMarathon = "—";

  if (lt2Idx >= 0 && mode === "pace") {
    const lt2Speed = parsed[lt2Idx].speed; // km/h

    // For each distance: race_speed = lt2_speed * F(T_race) / F(T_lt2_test) * vlamax_mod
    // Approximate: LT2 intensity ≈ F(~60min) for a well-trained runner
    const lt2Fraction = danielsFraction(60);

    const distances = [
      { km: 5, label: "5k", approxMins: 22 },
      { km: 10, label: "10k", approxMins: 45 },
      { km: 21.1, label: "hm", approxMins: 100 },
      { km: 42.2, label: "marathon", approxMins: 210 },
    ];

    const results: Record<string, string> = {};
    for (const d of distances) {
      const fraction = danielsFraction(d.approxMins);
      const raceSpeed = lt2Speed * (fraction / lt2Fraction) * vlaxModulation(d.km);
      const timeSecs = (d.km / raceSpeed) * 3600;
      results[d.label] = formatTime(timeSecs);
    }

    prediction5k = results["5k"];
    prediction10k = results["10k"];
    predictionHM = results["hm"];
    predictionMarathon = results["marathon"];
  } else if (lt2Idx >= 0 && mode === "power") {
    prediction10k = `~${Math.round(parsed[lt2Idx].speed * 0.95)}W avg`;
  }

  // Zones
  const lt1P = lt1Idx >= 0 ? parsed[lt1Idx] : null;
  const lt2P = lt2Idx >= 0 ? parsed[lt2Idx] : null;
  const fmt = (p: typeof parsed[0]) => mode === "pace" ? p.intensity : `${Math.round(p.speed)}W`;
  const zones: DemoResult["zones"] = [];
  if (lt1P && lt2P) {
    const below = parsed[Math.max(0, lt1Idx - 1)];
    zones.push(
      { name: "Z1", from: fmt(parsed[0]), to: fmt(below || lt1P), color: "#94a3b8" },
      { name: "Z2", from: fmt(below || lt1P), to: fmt(lt1P), color: "#22c55e" },
      { name: "Z3", from: fmt(lt1P), to: fmt(lt2P), color: "#eab308" },
      { name: "Z4", from: fmt(lt2P), to: fmt(parsed[Math.min(lt2Idx + 1, parsed.length - 1)]), color: "#f97316" },
      { name: "Z5", from: fmt(parsed[Math.min(lt2Idx + 1, parsed.length - 1)]), to: fmt(parsed[parsed.length - 1]), color: "#ef4444" },
    );
  }

  // Normalize for SVG
  const minSpeed = parsed[0].speed;
  const maxSpeed = parsed[parsed.length - 1].speed;
  const maxLac = Math.max(...parsed.map((p) => p.lac));
  const points = parsed.map((p) => ({
    x: (p.speed - minSpeed) / (maxSpeed - minSpeed || 1),
    y: p.lac / (maxLac * 1.15),
    intensity: p.intensity,
    lac: p.lac,
  }));

  return {
    points,
    lt1: lt1Idx >= 0 ? { intensity: parsed[lt1Idx].intensity, lac: parsed[lt1Idx].lac, idx: lt1Idx } : null,
    lt2: lt2Idx >= 0 ? { intensity: parsed[lt2Idx].intensity, lac: parsed[lt2Idx].lac, idx: lt2Idx } : null,
    confidence,
    prediction5k,
    prediction10k,
    predictionHM,
    predictionMarathon,
    vo2maxEst,
    zones,
  };
}

/* ── SVG Curve ── */
function CurveSVG({ result, mode }: { result: DemoResult; mode: InputMode }) {
  const W = 480, H = 220, PAD = 45, TOP = 20;
  const { points, lt1, lt2 } = result;

  const px = (x: number) => PAD + x * (W - PAD - 20);
  const pyC = (y: number) => TOP + (1 - y) * (H - PAD - TOP);

  const pathPoints = points.map((p) => `${px(p.x)},${pyC(p.y)}`);
  let d = `M${pathPoints[0]}`;
  for (let i = 1; i < pathPoints.length; i++) {
    const [prevX, prevY] = pathPoints[i - 1].split(",").map(Number);
    const [curX, curY] = pathPoints[i].split(",").map(Number);
    const cpx = (prevX + curX) / 2;
    d += ` C${cpx},${prevY} ${cpx},${curY} ${curX},${curY}`;
  }

  const lastPt = pathPoints[pathPoints.length - 1].split(",").map(Number);
  const firstPt = pathPoints[0].split(",").map(Number);
  const fillD = `${d} L${lastPt[0]},${H - PAD} L${firstPt[0]},${H - PAD} Z`;
  const maxLac = Math.max(...points.map((p) => p.lac));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ld-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="demo-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d26a36" stopOpacity=".15" />
          <stop offset="100%" stopColor="#d26a36" stopOpacity=".02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={PAD} y1={pyC(f)} x2={W - 20} y2={pyC(f)} stroke="#1a2f38" strokeWidth=".4" opacity=".1" />
      ))}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={PAD - 6} y={pyC(f) + 3} textAnchor="end" fill="#9aabb4" fontSize="9" fontFamily="Space Grotesk">
          {(maxLac * 1.15 * f).toFixed(1)}
        </text>
      ))}
      <text x={12} y={H / 2} textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk" transform={`rotate(-90 12 ${H / 2})`}>mmol/L</text>
      {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
        <text key={i} x={px(points[i].x)} y={H - PAD + 16} textAnchor="middle" fill="#9aabb4" fontSize="9" fontFamily="Space Grotesk">
          {mode === "pace" ? points[i].intensity : `${Math.round(parseFloat(points[i].intensity))}W`}
        </text>
      ))}
      <text x={(PAD + W - 20) / 2} y={H - 4} textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk">
        {mode === "pace" ? "min/km" : "watts"}
      </text>
      <path d={fillD} fill="url(#demo-fill)" />
      <path d={d} fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round" className="ld-svg__line" />
      {lt1 && (
        <>
          <line x1={px(points[lt1.idx].x)} y1={TOP} x2={px(points[lt1.idx].x)} y2={H - PAD} stroke="#22c55e" strokeWidth="1.2" strokeDasharray="5 3" opacity=".6" />
          <rect x={px(points[lt1.idx].x) - 20} y={TOP - 2} width="40" height="16" rx="4" fill="#22c55e" opacity=".15" />
          <text x={px(points[lt1.idx].x)} y={TOP + 10} textAnchor="middle" fill="#22c55e" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">LT1</text>
        </>
      )}
      {lt2 && (
        <>
          <line x1={px(points[lt2.idx].x)} y1={TOP} x2={px(points[lt2.idx].x)} y2={H - PAD} stroke="#f97316" strokeWidth="1.2" strokeDasharray="5 3" opacity=".6" />
          <rect x={px(points[lt2.idx].x) - 20} y={TOP - 2} width="40" height="16" rx="4" fill="#f97316" opacity=".15" />
          <text x={px(points[lt2.idx].x)} y={TOP + 10} textAnchor="middle" fill="#f97316" fontSize="9" fontWeight="700" fontFamily="Space Grotesk">LT2</text>
        </>
      )}
      {points.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={pyC(p.y)} r="4.5" fill="#fff" stroke="#d26a36" strokeWidth="2" />
      ))}
    </svg>
  );
}

/* ── Live preview curve (no thresholds, just the raw curve) ── */
function LiveCurveSVG({ points, mode }: { points: { x: number; y: number; intensity: string; lac: number }[]; mode: InputMode }) {
  const W = 480, H = 220, PAD = 45, TOP = 20;

  const px = (x: number) => PAD + x * (W - PAD - 20);
  const pyC = (y: number) => TOP + (1 - y) * (H - PAD - TOP);

  const pathPoints = points.map((p) => `${px(p.x)},${pyC(p.y)}`);
  let d = `M${pathPoints[0]}`;
  for (let i = 1; i < pathPoints.length; i++) {
    const [prevX, prevY] = pathPoints[i - 1].split(",").map(Number);
    const [curX, curY] = pathPoints[i].split(",").map(Number);
    const cpx = (prevX + curX) / 2;
    d += ` C${cpx},${prevY} ${cpx},${curY} ${curX},${curY}`;
  }

  const lastPt = pathPoints[pathPoints.length - 1].split(",").map(Number);
  const firstPt = pathPoints[0].split(",").map(Number);
  const fillD = `${d} L${lastPt[0]},${H - PAD} L${firstPt[0]},${H - PAD} Z`;
  const maxLac = Math.max(...points.map((p) => p.lac));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ld-svg ld-svg--live" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="live-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d26a36" stopOpacity=".08" />
          <stop offset="100%" stopColor="#d26a36" stopOpacity=".01" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={PAD} y1={pyC(f)} x2={W - 20} y2={pyC(f)} stroke="#1a2f38" strokeWidth=".4" opacity=".08" />
      ))}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={PAD - 6} y={pyC(f) + 3} textAnchor="end" fill="#9aabb4" fontSize="9" fontFamily="Space Grotesk" opacity=".5">
          {(maxLac * 1.15 * f).toFixed(1)}
        </text>
      ))}
      <text x={12} y={H / 2} textAnchor="middle" fill="#9aabb4" fontSize="8" fontFamily="Space Grotesk" opacity=".5" transform={`rotate(-90 12 ${H / 2})`}>mmol/L</text>
      {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
        <text key={i} x={px(points[i].x)} y={H - PAD + 16} textAnchor="middle" fill="#9aabb4" fontSize="9" fontFamily="Space Grotesk" opacity=".5">
          {mode === "pace" ? points[i].intensity : `${Math.round(parseFloat(points[i].intensity))}W`}
        </text>
      ))}
      <path d={fillD} fill="url(#live-fill)" />
      <path d={d} fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round" opacity=".35" />
      {points.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={pyC(p.y)} r="3.5" fill="#fff" stroke="#d26a36" strokeWidth="1.5" opacity=".4" />
      ))}
    </svg>
  );
}

/* ══════════════════════════════════════════
   Main Demo Component
   ══════════════════════════════════════════ */
export function LactateDemo() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [mode, setMode] = useState<InputMode>("pace");
  const [rows, setRows] = useState<Row[]>(() => [...SAMPLE_PACE]);
  const [hrMax, setHrMax] = useState("190");
  const [hrRest, setHrRest] = useState("52");
  const [peakLac, setPeakLac] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const result = useMemo(
    () => (showResult ? analyze(rows, mode, parseInt(hrMax) || 0, parseInt(hrRest) || 0, parseFloat(peakLac) || 0) : null),
    [rows, mode, hrMax, hrRest, peakLac, showResult],
  );

  // VLamax / peak lactate field validation
  const peakLacWarning = useMemo(() => {
    const v = parseFloat(peakLac);
    if (!peakLac || isNaN(v)) return null;
    if (v >= 1.0 && v < 4.0) return t("demo_vlamax_warn_range");
    if (v > 0 && v < 0.10) return t("demo_vlamax_warn_low");
    if (v > 25) return t("demo_vlamax_warn_high");
    return null;
  }, [peakLac, t]);

  // Monotonicity validation: detect if faster intensity has lower lactate
  const dataWarning = useMemo(() => {
    const parsed = rows
      .map((r, i) => ({
        idx: i,
        intensity: r.intensity.trim(),
        lac: parseFloat(r.lactate),
        speed: mode === "pace" ? paceToSpeed(r.intensity) : parseFloat(r.intensity),
      }))
      .filter((p) => p.speed > 0 && !isNaN(p.lac) && p.lac >= 0);
    if (parsed.length < 2) return null;
    parsed.sort((a, b) => a.speed - b.speed);
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].lac < parsed[i - 1].lac - 0.05) {
        return true;
      }
    }
    return false;
  }, [rows, mode]);

  // Live preview: always compute curve from current rows (no thresholds/predictions)
  const livePreview = useMemo(() => {
    if (showResult) return null; // full result takes over
    const parsed = rows
      .map((r) => ({
        intensity: r.intensity.trim(),
        lac: parseFloat(r.lactate),
        speed: mode === "pace" ? paceToSpeed(r.intensity) : parseFloat(r.intensity),
      }))
      .filter((p) => p.speed > 0 && !isNaN(p.lac) && p.lac >= 0);
    if (parsed.length < 2) return null;
    parsed.sort((a, b) => a.speed - b.speed);
    const minSpeed = parsed[0].speed;
    const maxSpeed = parsed[parsed.length - 1].speed;
    const maxLac = Math.max(...parsed.map((p) => p.lac));
    return parsed.map((p) => ({
      x: (p.speed - minSpeed) / (maxSpeed - minSpeed || 1),
      y: p.lac / (maxLac * 1.15),
      intensity: p.intensity,
      lac: p.lac,
    }));
  }, [rows, mode, showResult]);

  function updateRow(i: number, field: "intensity" | "lactate", val: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: val } : r)));
    setShowResult(false);
  }

  function addRow() {
    setRows((prev) => [...prev, { intensity: "", lactate: "" }]);
    setShowResult(false);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, j) => j !== i));
    setShowResult(false);
  }

  function resetSample() {
    setRows(mode === "pace" ? [...SAMPLE_PACE] : [...SAMPLE_POWER]);
    setShowResult(false);
  }

  function switchMode(m: InputMode) {
    setMode(m);
    setRows(m === "pace" ? [...SAMPLE_PACE] : [...SAMPLE_POWER]);
    setShowResult(false);
  }

  return (
    <section className="lp-section ld" id="demo">
      <div className="lp-w">
        <p className="lp-ey">{t("demo_eyebrow")}</p>
        <h2 className="lp-h2">{t("demo_title")}</h2>
        <p className="lp-sub" dangerouslySetInnerHTML={{ __html: t("demo_sub") }} />

        <div className="ld-container">
          {/* ── Input panel ── */}
          <div className="ld-input">
            {!expanded ? (
              /* ── Collapsed: single CTA button ── */
              <div className="ld-collapsed">
                <div className="ld-collapsed__icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d26a36" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
                  </svg>
                </div>
                <p className="ld-collapsed__text">{t("demo_collapsed_text")}</p>
                <button type="button" className="lp-btn-solid lp-btn--accent ld-collapsed__btn" onClick={() => setExpanded(true)}>
                  + {t("demo_collapsed_cta")}
                </button>
              </div>
            ) : (
              /* ── Expanded: full form ── */
              <>
            {/* Mode toggle */}
            <div className="ld-mode">
              <span className="ld-mode__label">{t("demo_input_mode")}</span>
              <div className="ld-mode__btns">
                <button type="button" className={`ld-mode__btn ${mode === "pace" ? "ld-mode__btn--on" : ""}`} onClick={() => switchMode("pace")}>
                  {t("demo_pace")}
                </button>
                <button type="button" className={`ld-mode__btn ${mode === "power" ? "ld-mode__btn--on" : ""}`} onClick={() => switchMode("power")}>
                  {t("demo_power")}
                </button>
              </div>
            </div>

            {/* HR + VLamax fields */}
            <div className="ld-hr-row ld-hr-row--3">
              <div className="ld-hr-field">
                <label className="ld-hr-field__label">{t("demo_hrmax")}</label>
                <input
                  className="ld-input__field"
                  value={hrMax}
                  onChange={(e) => { setHrMax(e.target.value); setShowResult(false); }}
                  placeholder="190"
                  type="number"
                  min="100"
                  max="230"
                />
              </div>
              <div className="ld-hr-field">
                <label className="ld-hr-field__label">{t("demo_hrrest")}</label>
                <input
                  className="ld-input__field"
                  value={hrRest}
                  onChange={(e) => { setHrRest(e.target.value); setShowResult(false); }}
                  placeholder="52"
                  type="number"
                  min="30"
                  max="90"
                />
              </div>
              <div className="ld-hr-field">
                <label className="ld-hr-field__label">{t("demo_vlamax")}</label>
                <input
                  className={`ld-input__field${peakLacWarning ? " ld-input__field--warn" : ""}`}
                  value={peakLac}
                  onChange={(e) => { setPeakLac(e.target.value); setShowResult(false); }}
                  placeholder="0.35 / 15.0"
                  type="number"
                  min="0.1"
                  max="30"
                  step="0.01"
                />
                {peakLacWarning && <span className="ld-hr-field__warn">{peakLacWarning}</span>}
              </div>
            </div>
            <p className="ld-hr-helper">{t("demo_hr_helper")}</p>
            <p className="ld-hr-helper ld-hr-helper--sub">{t("demo_vlamax_explain")}</p>

            {/* Header */}
            <div className="ld-row ld-row--head">
              <span>{mode === "pace" ? t("demo_pace") : t("demo_power")}</span>
              <span>{t("demo_lactate")}</span>
              <span />
            </div>

            {/* Data rows */}
            <div className="ld-rows">
              {rows.map((r, i) => (
                <div key={i} className="ld-row">
                  <input
                    className="ld-input__field"
                    value={r.intensity}
                    onChange={(e) => updateRow(i, "intensity", e.target.value)}
                    placeholder={mode === "pace" ? t("demo_pace_hint") : t("demo_power_hint")}
                  />
                  <input
                    className="ld-input__field"
                    value={r.lactate}
                    onChange={(e) => updateRow(i, "lactate", e.target.value)}
                    placeholder={t("demo_lactate_hint")}
                  />
                  <button type="button" className="ld-row__rm" onClick={() => removeRow(i)} title={t("demo_remove")}>
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <div className="ld-actions">
              <button type="button" className="ld-actions__add" onClick={addRow}>+ {t("demo_add_row")}</button>
              <button type="button" className="ld-actions__reset" onClick={resetSample}>{t("demo_reset")}</button>
            </div>

            {dataWarning ? (
              <div className="ld-warning">
                <div className="ld-warning__icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d26a36" strokeWidth="2" strokeLinecap="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <p className="ld-warning__text">{t("demo_warning_monotonicity")}</p>
              </div>
            ) : (
              <button type="button" className="lp-btn-solid ld-analyze" onClick={() => setShowResult(true)}>
                {t("demo_analyze")}
              </button>
            )}
              </>
            )}
          </div>

          {/* ── Result panel ── */}
          <div className={`ld-result ${result ? "ld-result--show" : ""}`}>
            {result ? (
              <>
                <CurveSVG result={result} mode={mode} />

                {/* Free metrics: LT1, LT2, Confidence */}
                <div className="ld-metrics">
                  {result.lt1 && (
                    <div className="ld-metric ld-metric--lt1">
                      <span className="ld-metric__label">{t("demo_result_lt1")}</span>
                      <span className="ld-metric__val">{mode === "pace" ? result.lt1.intensity + "/km" : result.lt1.intensity + "W"}</span>
                      <span className="ld-metric__sub">{result.lt1.lac.toFixed(1)} mmol/L</span>
                    </div>
                  )}
                  {result.lt2 && (
                    <div className="ld-metric ld-metric--lt2">
                      <span className="ld-metric__label">{t("demo_result_lt2")}</span>
                      <span className="ld-metric__val">{mode === "pace" ? result.lt2.intensity + "/km" : result.lt2.intensity + "W"}</span>
                      <span className="ld-metric__sub">{result.lt2.lac.toFixed(1)} mmol/L</span>
                    </div>
                  )}
                  <div className="ld-metric">
                    <span className="ld-metric__label">{t("demo_result_confidence")}</span>
                    <span className="ld-metric__val">{result.confidence.toFixed(2)}</span>
                  </div>
                </div>

                {/* ── LOCKED: VO2max + Zones (blurred) ── */}
                <div className="ld-locked">
                  <div className="ld-locked__content">
                    {result.vo2maxEst && (
                      <div className="ld-vo2-locked">
                        <span className="ld-metric__label">VO2max est.</span>
                        <span className="ld-metric__val">{result.vo2maxEst}</span>
                        <span className="ld-metric__sub">ml/kg/min</span>
                      </div>
                    )}
                    <div className="ld-zones">
                      <span className="ld-zones__title">{t("demo_result_zones")}</span>
                      <div className="ld-zones__bar">
                        {result.zones.map((z) => (
                          <div key={z.name} className="ld-zones__seg" style={{ background: z.color }}>
                            <span>{z.name}</span>
                          </div>
                        ))}
                      </div>
                      <div className="ld-zones__labels">
                        {result.zones.map((z) => (
                          <span key={z.name} className="ld-zones__range">{z.from} — {z.to}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="ld-locked__overlay" onClick={() => navigate("/login")}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>{t("demo_unlock")}</span>
                  </div>
                </div>

                {/* ── LOCKED: Predictions — labels visible, times blurred ── */}
                <div className="ld-locked ld-locked--preds">
                  <span className="ld-zones__title">{t("demo_result_predictions")}</span>
                  <div className="ld-preds">
                    {[
                      { dist: "5K", time: result.prediction5k },
                      { dist: "10K", time: result.prediction10k },
                      { dist: t("pred_hm"), time: result.predictionHM },
                      { dist: t("pred_marathon"), time: result.predictionMarathon },
                    ].map((p) => (
                      <div key={p.dist} className="ld-preds__item">
                        <span className="ld-preds__dist">{p.dist}</span>
                        <span className="ld-preds__time ld-preds__time--blur">{p.time}</span>
                      </div>
                    ))}
                  </div>
                  <div className="ld-locked__overlay ld-locked__overlay--preds" onClick={() => navigate("/login")}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>{t("demo_unlock")}</span>
                  </div>
                </div>

                {/* Save CTA */}
                <div className="ld-save">
                  <p>{t("demo_result_save")}</p>
                  <button type="button" className="lp-btn-solid" onClick={() => navigate("/login")}>
                    {t("demo_result_save_cta")}
                  </button>
                </div>
              </>
            ) : (
              <div className="ld-preview">
                {livePreview ? (
                  <>
                    <LiveCurveSVG points={livePreview} mode={mode} />
                    <p className="ld-preview__hint">{t("demo_analyze")}</p>
                  </>
                ) : (
                  <div className="ld-placeholder">
                    <svg viewBox="0 0 120 80" width="120" opacity=".2">
                      <path d="M10 70 C30 68, 50 60, 70 40 C85 25, 95 12, 110 8" fill="none" stroke="#d26a36" strokeWidth="2.5" strokeLinecap="round" />
                      <circle cx="10" cy="70" r="3" fill="#d26a36" />
                      <circle cx="40" cy="64" r="3" fill="#d26a36" />
                      <circle cx="70" cy="40" r="3" fill="#d26a36" />
                      <circle cx="95" cy="16" r="3" fill="#d26a36" />
                      <circle cx="110" cy="8" r="3" fill="#d26a36" />
                    </svg>
                    <p>{t("demo_analyze")}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

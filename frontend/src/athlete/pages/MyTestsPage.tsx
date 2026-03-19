import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { api } from "../../lib/api";
import type { SessionSummary, SessionAnalysis, CurvePoint, Threshold, ConfidenceItem, DynamicThresholds, DynamicReference, DisciplineView } from "../../types";

/* ── Helpers ── */
function paceToSeconds(pace: string): number | null {
  const m = pace.match(/^(\d+):(\d{1,2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function secondsToPace(s: number): string {
  const min = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

/* ── Types ── */
type DurationUnit = "min" | "km";

type StepRow = {
  zone_tag: string;
  duration_min: string;
  rest_min: string;
  pace: string;
  power: string;
  hr: string;
  hr_max: string;
  lactate: string;
  note: string;
};

type Discipline = "running" | "ciclismo" | "natación";

const ZONE_TAGS = ["LT1", "LT2", "VO2", "ANC", "REC", "BASE", "TEMPO", ""];
const EMPTY_ROW: StepRow = { zone_tag: "", duration_min: "", rest_min: "", pace: "", power: "", hr: "", hr_max: "", lactate: "", note: "" };

/* ── Mini curve SVG ── */
function MiniCurve({ points }: { points: CurvePoint[] }) {
  if (points.length < 2) return <span className="ath-tests-nocurve">--</span>;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.lactate);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const toSvg = (x: number, y: number) => `${10 + ((x - minX) / rangeX) * 80},${55 - ((y - minY) / rangeY) * 45}`;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${toSvg(p.x, p.lactate)}`).join(" ");

  return (
    <svg viewBox="0 0 100 60" className="ath-tests-minicurve" preserveAspectRatio="xMidYMid meet">
      <path d={d} fill="none" stroke="var(--c-accent, #d26a36)" strokeWidth="2" strokeLinecap="round" />
      {points.map((p, i) => {
        const [cx, cy] = toSvg(p.x, p.lactate).split(",").map(Number);
        return <circle key={i} cx={cx} cy={cy} r="2.5" fill="#fff" stroke="var(--c-accent, #d26a36)" strokeWidth="1.5" />;
      })}
    </svg>
  );
}

type DynRef = { label: string; xVal: number; color: string };

/* ── Full curve with thresholds ── */
function FullCurve({ points, thresholds, dynRefs }: { points: CurvePoint[]; thresholds: Threshold[]; dynRefs?: DynRef[] }) {
  if (points.length < 2) return <p className="ath-tests-empty">No hay suficientes puntos para la curva.</p>;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.lactate);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys) * 1.1;
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const W = 400, H = 200, pad = { t: 20, r: 20, b: 40, l: 50 };
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;

  const sx = (x: number) => pad.l + ((x - minX) / rangeX) * plotW;
  const sy = (y: number) => pad.t + plotH - ((y - minY) / rangeY) * plotH;

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.lactate).toFixed(1)}`).join(" ");
  const areaD = d + ` L${sx(points[points.length - 1].x).toFixed(1)},${sy(0).toFixed(1)} L${sx(points[0].x).toFixed(1)},${sy(0).toFixed(1)} Z`;

  const lt1 = thresholds.find((t) => t.name === "LT1");
  const lt2 = thresholds.find((t) => t.name === "LT2");

  // Y axis labels
  const yTicks = [];
  const step = rangeY > 10 ? 2 : rangeY > 4 ? 1 : 0.5;
  for (let v = 0; v <= maxY; v += step) yTicks.push(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ath-tests-fullcurve" preserveAspectRatio="xMidYMid meet">
      {/* Grid */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pad.l} y1={sy(v)} x2={W - pad.r} y2={sy(v)} stroke="#e5e7eb" strokeWidth="0.5" />
          <text x={pad.l - 6} y={sy(v) + 3} textAnchor="end" fill="#9ca3af" fontSize="9" fontFamily="system-ui">{v.toFixed(step < 1 ? 1 : 0)}</text>
        </g>
      ))}
      <text x={pad.l - 6} y={pad.t - 6} textAnchor="end" fill="#9ca3af" fontSize="8" fontFamily="system-ui">mmol/L</text>

      {/* Area + line */}
      <path d={areaD} fill="var(--c-accent, #d26a36)" opacity="0.08" />
      <path d={d} fill="none" stroke="var(--c-accent, #d26a36)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Points */}
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.lactate)} r="4" fill="#fff" stroke="var(--c-accent, #d26a36)" strokeWidth="2" />
      ))}

      {/* LT1/LT2 threshold lines — use whichever metric matches the curve X axis */}
      {[
        { th: lt1, label: "LT1", color: "#22c55e" },
        { th: lt2, label: "LT2", color: "#f97316" },
      ].map(({ th, label, color }) => {
        const xVal = th?.pace_seconds_per_km ?? th?.power_watts ?? th?.heart_rate;
        if (!th || xVal == null) return null;
        return (
          <g key={label}>
            <line x1={sx(xVal)} y1={pad.t} x2={sx(xVal)} y2={H - pad.b} stroke={color} strokeWidth="1.5" strokeDasharray="5 3" />
            <text x={sx(xVal)} y={pad.t - 4} textAnchor="middle" fill={color} fontSize="10" fontWeight="700">{label}</text>
          </g>
        );
      })}

      {/* Dynamic threshold reference lines (athlete's running average) */}
      {dynRefs?.map(({ label, xVal, color }) => {
        if (xVal < minX || xVal > maxX) return null;
        return (
          <g key={label}>
            <line x1={sx(xVal)} y1={pad.t} x2={sx(xVal)} y2={H - pad.b} stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity="0.55" />
            <text x={sx(xVal)} y={H - pad.b + 12} textAnchor="middle" fill={color} fontSize="8" fontWeight="600" opacity="0.7">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Threshold card ── */
function ThresholdBadge({ th }: { th: Threshold }) {
  const color = th.name === "LT1" ? "#22c55e" : "#f97316";
  const pace = th.pace_seconds_per_km ? secondsToPace(th.pace_seconds_per_km) + "/km" : null;
  const power = th.power_watts ? `${Math.round(th.power_watts)}W` : null;
  const hr = th.heart_rate ? `${Math.round(th.heart_rate)} bpm` : null;
  const lac = th.lactate != null ? `${th.lactate.toFixed(2)} mmol` : null;

  return (
    <div className="ath-tests-th" style={{ borderColor: color }}>
      <span className="ath-tests-th__name" style={{ color }}>{th.name}</span>
      <span className="ath-tests-th__main">{pace || power || hr || "--"}</span>
      {hr && (pace || power) && <span className="ath-tests-th__detail">{hr}</span>}
      {lac && <span className="ath-tests-th__detail">{lac}</span>}
      {th.confidence != null && (
        <span className="ath-tests-th__conf">Confianza: {(th.confidence * 100).toFixed(0)}%</span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TEST DETAIL MODAL
   ══════════════════════════════════════════════════════════════ */
function TestDetail({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const { token, analysis: athleteAnalysis } = useAthleteData();
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.sessionAnalysis(token, sessionId)
      .then((r) => setAnalysis(r as SessionAnalysis))
      .catch((e) => setError(e instanceof Error ? e.message : "Error cargando análisis"))
      .finally(() => setLoading(false));
  }, [sessionId, token]);

  if (loading) return <div className="ath-tests-modal-overlay" onClick={onClose}><div className="ath-tests-modal" onClick={(e) => e.stopPropagation()}>Cargando...</div></div>;
  if (error || !analysis) return <div className="ath-tests-modal-overlay" onClick={onClose}><div className="ath-tests-modal" onClick={(e) => e.stopPropagation()}><p className="ath-tests-error">{error || "Sin datos"}</p><button onClick={onClose}>Cerrar</button></div></div>;

  const hasPace = !!analysis.curve_by_pace?.length;
  const hasPower = !hasPace && !!analysis.curve_by_power?.length;
  const curvePoints = hasPace ? analysis.curve_by_pace : hasPower ? analysis.curve_by_power : analysis.curve_by_hr ?? [];
  const curveLabel = hasPace ? "Ritmo (s/km)" : hasPower ? "Potencia (W)" : "FC (bpm)";

  // Build dynamic reference lines from athlete's cross-session thresholds
  const discipline = analysis.session?.discipline;
  const dv = discipline ? (athleteAnalysis?.discipline_views ?? {})[discipline] : undefined;
  const dt = dv?.dynamic_thresholds?.acute;
  const dynRefs: DynRef[] = [];
  if (dt) {
    const extractX = (ref: DynamicReference | null | undefined): number | null => {
      if (!ref) return null;
      if (hasPace && ref.estimated_pace_seconds_per_km) return ref.estimated_pace_seconds_per_km;
      if (hasPower && ref.estimated_power_watts) return ref.estimated_power_watts;
      if (ref.estimated_hr_at_target) return ref.estimated_hr_at_target;
      return null;
    };
    const lt1x = extractX(dt.practical_lt1);
    const lt2x = extractX(dt.practical_lt2);
    const ref2x = extractX(dt.reference_2mmol);
    const ref4x = extractX(dt.reference_4mmol);
    // Practical LT1/LT2 if available, otherwise fall back to 2mmol/4mmol references
    if (lt1x != null) dynRefs.push({ label: "LT1 media", xVal: lt1x, color: "#15803d" });
    else if (ref2x != null) dynRefs.push({ label: "Ref 2mmol", xVal: ref2x, color: "#15803d" });
    if (lt2x != null) dynRefs.push({ label: "LT2 media", xVal: lt2x, color: "#c2410c" });
    else if (ref4x != null) dynRefs.push({ label: "Ref 4mmol", xVal: ref4x, color: "#c2410c" });
  }

  // Compare session vs dynamic — build insight text
  const sessionLt1 = analysis.thresholds?.find((t) => t.name === "LT1");
  const sessionLt2 = analysis.thresholds?.find((t) => t.name === "LT2");
  const insights: string[] = [];
  if (dt?.practical_lt2 && sessionLt2) {
    const dynVal = hasPace ? dt.practical_lt2.estimated_pace_seconds_per_km
      : hasPower ? dt.practical_lt2.estimated_power_watts
      : dt.practical_lt2.estimated_hr_at_target;
    const sesVal = sessionLt2.pace_seconds_per_km ?? sessionLt2.power_watts ?? sessionLt2.heart_rate;
    if (dynVal != null && sesVal != null) {
      const diff = hasPace
        ? ((dynVal - sesVal) / dynVal) * 100  // pace: lower is better
        : ((sesVal - dynVal) / dynVal) * 100; // power/HR: higher is better
      if (Math.abs(diff) < 2) {
        insights.push("LT2 consistente con tu media dinámica.");
      } else if (diff > 0) {
        insights.push(`LT2 un ${Math.abs(diff).toFixed(0)}% mejor que tu media dinámica.`);
      } else {
        insights.push(`LT2 un ${Math.abs(diff).toFixed(0)}% por debajo de tu media dinámica.`);
      }
    }
  }

  return (
    <div className="ath-tests-modal-overlay" onClick={onClose}>
      <div className="ath-tests-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ath-tests-modal__head">
          <h3>{discipline} — {formatDate(analysis.session.performed_at)}</h3>
          <button className="ath-tests-modal__close" onClick={onClose}>&times;</button>
        </div>

        {/* Curve */}
        <div className="ath-tests-modal__curve">
          <span className="ath-tests-modal__curve-label">{curveLabel}</span>
          <FullCurve points={curvePoints} thresholds={analysis.thresholds ?? []} dynRefs={dynRefs} />
        </div>

        {/* Insight vs dynamic average */}
        {insights.length > 0 && (
          <div className="ath-tests-modal__insight">
            {insights.map((t, i) => <span key={i}>{t}</span>)}
          </div>
        )}

        {/* Thresholds */}
        {analysis.thresholds?.length > 0 && (
          <div className="ath-tests-modal__thresholds">
            {analysis.thresholds.map((th) => <ThresholdBadge key={th.name} th={th} />)}
          </div>
        )}

        {/* Confidence */}
        {analysis.confidence_summary?.length > 0 && (
          <div className="ath-tests-modal__section">
            <h4>Confianza del análisis</h4>
            {analysis.confidence_summary.map((c: ConfidenceItem, i: number) => (
              <div key={i} className="ath-tests-conf-row">
                <span>{c.label}</span>
                <span className={`ath-tests-conf-val ath-tests-conf-val--${c.score >= 0.7 ? "high" : c.score >= 0.5 ? "mid" : "low"}`}>
                  {(c.score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Contextual comments */}
        {analysis.contextual_comments?.length > 0 && (
          <div className="ath-tests-modal__section">
            <h4>Notas del análisis</h4>
            <ul className="ath-tests-comments">
              {analysis.contextual_comments.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MANUAL TEST FORM
   ══════════════════════════════════════════════════════════════ */
function ManualTestForm({ onCreated }: { onCreated: () => void }) {
  const { user, token } = useAthleteData();
  const [discipline, setDiscipline] = useState<Discipline>("running");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<StepRow[]>([
    { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW },
  ]);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("min");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const usePace = discipline !== "ciclismo";

  function updateRow(i: number, field: keyof StepRow, value: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(i: number) {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Check if any row has non-lactate data filled → auto-expand advanced
  const hasAdvancedData = rows.some((r) => r.pace || r.power || r.hr || r.hr_max || r.duration_min || r.rest_min);

  // Detect repeated-bout pattern → warn about accumulated fatigue
  // Triggers based on zone tags (filled before lactate) or lactate values.
  // Average rest between reps modulates: ≥3min rest = enough clearance, no warning.
  const { repeatedBoutWarning, avgRestMin } = useMemo(() => {
    const withZone = rows.filter((r) => r.zone_tag);
    const withLactate = rows.filter((r) => parseFloat(r.lactate) > 0);
    const relevant = withZone.length >= withLactate.length ? withZone : withLactate;
    if (relevant.length < 5) return { repeatedBoutWarning: null, avgRestMin: 0 };
    const zones = relevant.map((r) => r.zone_tag).filter(Boolean);
    if (zones.length < 4) return { repeatedBoutWarning: null, avgRestMin: 0 };
    const freq: Record<string, number> = {};
    for (const z of zones) freq[z] = (freq[z] || 0) + 1;
    const maxCount = Math.max(...Object.values(freq));
    const dominantZone = Object.keys(freq).find((k) => freq[k] === maxCount)!;
    const ratio = maxCount / zones.length;
    if (ratio < 0.6) return { repeatedBoutWarning: null, avgRestMin: 0 };

    // Calculate average rest between reps
    const rests = rows.map((r) => parseFloat(r.rest_min)).filter((v) => !isNaN(v) && v > 0);
    const avg = rests.length > 0 ? rests.reduce((a, b) => a + b, 0) / rests.length : 0;

    // Freund 1981: passive recovery half-life ~20min.
    // ≥3min rest = ~10% clearance per interval → accumulation is modest
    // ≥5min rest = ~16% clearance → mostly cleared, no warning needed
    if (avg >= 5) return { repeatedBoutWarning: null, avgRestMin: avg };
    if (avg >= 3) return {
      repeatedBoutWarning: `${relevant.length} series a ${dominantZone} con ~${avg.toFixed(0)}' descanso — acumulación moderada. Las primeras 3-4 series siguen siendo las más fiables.`,
      avgRestMin: avg,
    };
    return {
      repeatedBoutWarning: `${relevant.length} series a ${dominantZone}${avg > 0 ? ` con ~${avg.toFixed(0)}' descanso` : ""} — las muestras a partir de la serie 5 tendrán menor peso en tus umbrales por acumulación de lactato (Guimaraes 2024). Las primeras 3-4 son las más representativas.`,
      avgRestMin: avg,
    };
  }, [rows]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rowsWithLactate = rows.filter((r) => {
      const lac = parseFloat(r.lactate);
      return !isNaN(lac) && lac > 0;
    });

    if (rowsWithLactate.length < 3) {
      setError("Necesitas al menos 3 puntos con lactato para el análisis. Puedes dejar los demás campos vacíos y rellenarlos después.");
      return;
    }

    const intervals = rows
      .map((r, i) => {
        const lac = parseFloat(r.lactate);
        if (isNaN(lac) || lac <= 0) return null;
        const rawDur = parseFloat(r.duration_min);
        const hr = parseInt(r.hr) || undefined;
        const hrMax = parseInt(r.hr_max) || undefined;
        const paceVal = usePace ? paceToSeconds(r.pace) : undefined;
        const powerVal = !usePace ? (parseFloat(r.power) || undefined) : undefined;
        const purpose = r.zone_tag ? r.zone_tag.toLowerCase().replace("vo2", "VO2max").replace("anc", "anaerobic") : "threshold_work";

        // Convert duration based on unit
        let durSeconds: number;
        if (durationUnit === "km" && !isNaN(rawDur) && rawDur > 0) {
          // km → derive seconds from pace if available, else assume ~5:00/km
          const paceSec = paceVal ?? 300;
          durSeconds = Math.round(rawDur * paceSec);
        } else {
          durSeconds = Math.round((rawDur || 5) * 60);
        }

        const restMin = parseFloat(r.rest_min);
        const restSec = !isNaN(restMin) && restMin > 0 ? Math.round(restMin * 60) : 60;

        return {
          order_index: i + 1,
          duration_seconds: durSeconds,
          rest_seconds: restSec,
          rest_type: "passive",
          heart_rate_avg: hr,
          heart_rate_max: hrMax,
          pace_seconds_per_km: discipline === "running" ? paceVal : undefined,
          power_watts: discipline === "ciclismo" ? powerVal : undefined,
          purpose,
          notes: r.note || undefined,
          lactate_sample: {
            lactate_mmol: lac,
            sample_delay_seconds: 30,
            sample_timing_label: "30s post",
            sampling_notes: r.note || undefined,
          },
        };
      })
      .filter(Boolean);

    setSubmitting(true);
    try {
      await api.createSession(token, {
        athlete_id: user.athlete_id,
        performed_at: `${date}T10:00:00`,
        discipline,
        session_type: "lactate_test",
        goal: rows.some((r) => r.zone_tag) ? `Lactato: ${rows.filter((r) => r.zone_tag).map((r) => r.zone_tag).join(", ")}` : "Test de lactato",
        intervals,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando la sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="ath-tests-form" onSubmit={handleSubmit}>
      <h3>Registrar lactato</h3>
      <p className="ath-tests-form__hint">
        Apunta el lactato de cada intervalo. Todo lo demás es opcional — puedes completarlo después del entreno.
      </p>

      <div className="ath-tests-form__top">
        <label>
          <span>Disciplina</span>
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)}>
            <option value="running">Running</option>
            <option value="ciclismo">Ciclismo</option>
            <option value="natación">Natación</option>
          </select>
        </label>
        <label>
          <span>Fecha</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {repeatedBoutWarning && (
        <div className="ath-tests-form__fatigue-warn">
          {repeatedBoutWarning}
        </div>
      )}

      {/* Quick rows: zone tag + lactate + note */}
      <div className="ath-tests-form__quick">
        {rows.map((row, i) => {
          // Show fatigue indicator on rows 5+ when repeated bouts detected
          // If avg rest ≥5min → no fatigue markers at all
          const showFatigue = !!repeatedBoutWarning && avgRestMin < 5 && i >= 4 && (row.zone_tag || parseFloat(row.lactate) > 0);
          return (
          <React.Fragment key={i}>
            {/* Rest between intervals */}
            {i > 0 && (
              <div className="ath-tests-form__rest-row">
                <span className="ath-tests-form__rest-label">Descanso</span>
                <input
                  type="text"
                  placeholder="min"
                  value={row.rest_min}
                  onChange={(e) => updateRow(i, "rest_min", e.target.value)}
                  className="ath-tests-form__rest-input"
                />
              </div>
            )}
          <div className={`ath-tests-quick-row ${showFatigue ? "ath-tests-quick-row--fatigued" : ""}`}>
            <div className="ath-tests-quick-row__main">
              <span className="ath-tests-form__idx">{i + 1}{showFatigue ? "*" : ""}</span>
              <select
                value={row.zone_tag}
                onChange={(e) => updateRow(i, "zone_tag", e.target.value)}
                className="ath-tests-quick-row__zone"
              >
                <option value="">Zona</option>
                {ZONE_TAGS.filter(Boolean).map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
              <input
                type="text"
                placeholder="Lactato (mmol)"
                value={row.lactate}
                onChange={(e) => updateRow(i, "lactate", e.target.value)}
                className="ath-tests-quick-row__lac"
                autoFocus={i === 0}
              />
              <input
                type="text"
                placeholder="Nota rápida..."
                value={row.note}
                onChange={(e) => updateRow(i, "note", e.target.value)}
                className="ath-tests-quick-row__note"
              />
              <button type="button" className="ath-tests-form__remove" onClick={() => removeRow(i)} title="Quitar">
                &times;
              </button>
            </div>

            {/* Advanced fields (collapsible) */}
            {(showAdvanced || hasAdvancedData) && (
              <div className="ath-tests-quick-row__adv">
                <div className="ath-tests-form__dur-wrap">
                  <input type="text" placeholder={durationUnit === "min" ? "Min" : "Km"} value={row.duration_min} onChange={(e) => updateRow(i, "duration_min", e.target.value)} className="ath-tests-form__input ath-tests-form__input--sm" />
                  {i === 0 && (
                    <button type="button" className="ath-tests-form__dur-toggle" onClick={() => setDurationUnit((u) => u === "min" ? "km" : "min")} title="Cambiar unidad">
                      {durationUnit}
                    </button>
                  )}
                </div>
                {usePace ? (
                  <input type="text" placeholder="Ritmo" value={row.pace} onChange={(e) => updateRow(i, "pace", e.target.value)} className="ath-tests-form__input" />
                ) : (
                  <input type="text" placeholder="Watts" value={row.power} onChange={(e) => updateRow(i, "power", e.target.value)} className="ath-tests-form__input" />
                )}
                <input type="text" placeholder="FC med" value={row.hr} onChange={(e) => updateRow(i, "hr", e.target.value)} className="ath-tests-form__input ath-tests-form__input--sm" />
                <input type="text" placeholder="FC max" value={row.hr_max} onChange={(e) => updateRow(i, "hr_max", e.target.value)} className="ath-tests-form__input ath-tests-form__input--sm" />
              </div>
            )}
          </div>
          </React.Fragment>
          );
        })}
      </div>

      <div className="ath-tests-form__actions">
        <button type="button" className="ath-tests-form__add" onClick={addRow}>
          + Punto
        </button>
        {!showAdvanced && !hasAdvancedData && (
          <button type="button" className="ath-tests-form__add" onClick={() => setShowAdvanced(true)}>
            Duración / ritmo / FC
          </button>
        )}
      </div>

      {error && <p className="ath-tests-error">{error}</p>}

      <button type="submit" className="ath-tests-form__submit" disabled={submitting}>
        {submitting ? "Analizando..." : "Guardar y analizar"}
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════
   LACTATE OVERLAY — Add lactate to completed planned session
   ══════════════════════════════════════════════════════════════ */
type LapMatchStep = {
  order: number;
  planned_duration_s: number;
  intensity_label: string;
  garmin_matched: boolean;
  hr_avg: number | null;
  power_watts: number | null;
  pace_seconds_per_km: number | null;
  pace_seconds_per_100m?: number | null;
};

type LapMatchResult = {
  planned_session_id: number;
  discipline: string;
  scheduled_date: string;
  dose_prescription: string;
  matched: boolean;
  n_work_steps: number;
  steps: LapMatchStep[];
};

function LactateOverlay({ sessionId, onCreated, onClose }: { sessionId: number; onCreated: () => void; onClose: () => void }) {
  const { user, token } = useAthleteData();
  const [lapMatch, setLapMatch] = useState<LapMatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Editable rows: lactate + manual overrides for HR/pace if not garmin-matched
  const [rows, setRows] = useState<Array<{ lactate: string; hr: string; pace: string; power: string }>>([]);

  useEffect(() => {
    setLoading(true);
    api.plannedSessionLapMatch(token, sessionId)
      .then((r) => {
        setLapMatch(r);
        setRows(r.steps.map((s) => ({
          lactate: "",
          hr: s.hr_avg != null ? String(s.hr_avg) : "",
          pace: s.pace_seconds_per_km != null ? secondsToPace(s.pace_seconds_per_km) : "",
          power: s.power_watts != null ? String(s.power_watts) : "",
        })));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error cargando intervalos"))
      .finally(() => setLoading(false));
  }, [sessionId, token]);

  function updateRow(i: number, field: string, value: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lapMatch || !user.athlete_id) return;
    setError(null);

    const discipline = lapMatch.discipline;
    const usePace = discipline !== "ciclismo";

    const intervals = lapMatch.steps.map((step, i) => {
      const row = rows[i];
      const lac = parseFloat(row.lactate);
      const hr = parseInt(row.hr) || undefined;
      const paceVal = usePace ? paceToSeconds(row.pace) : undefined;
      const powerVal = !usePace ? (parseFloat(row.power) || undefined) : undefined;

      return {
        order_index: step.order,
        duration_seconds: step.planned_duration_s,
        rest_seconds: 60,
        rest_type: "passive",
        heart_rate_avg: hr,
        pace_seconds_per_km: discipline === "running" ? paceVal : undefined,
        power_watts: discipline === "ciclismo" ? powerVal : undefined,
        purpose: "threshold_work",
        lactate_sample: !isNaN(lac) && lac > 0 ? {
          lactate_mmol: lac,
          sample_delay_seconds: 30,
          sample_timing_label: "30s post",
        } : undefined,
      };
    }).filter((iv) => iv.lactate_sample);

    if (intervals.length < 3) {
      setError("Necesitas al menos 3 puntos con lactato para el análisis.");
      return;
    }

    setSubmitting(true);
    try {
      await api.createSession(token, {
        athlete_id: user.athlete_id,
        performed_at: `${lapMatch.scheduled_date}T10:00:00`,
        discipline: lapMatch.discipline,
        session_type: "lactate_test",
        goal: `Lactato sobre sesión: ${lapMatch.dose_prescription}`,
        intervals,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando la sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="ath-tests-overlay-panel">Cargando intervalos...</div>;
  if (error && !lapMatch) return <div className="ath-tests-overlay-panel"><p className="ath-tests-error">{error}</p><button onClick={onClose}>Cerrar</button></div>;
  if (!lapMatch || lapMatch.steps.length === 0) return <div className="ath-tests-overlay-panel"><p>Esta sesión no tiene intervalos de trabajo definidos.</p><button onClick={onClose}>Cerrar</button></div>;

  const discipline = lapMatch.discipline;
  const usePace = discipline !== "ciclismo";

  return (
    <form className="ath-tests-form ath-tests-overlay-panel" onSubmit={handleSubmit}>
      <div className="ath-tests-overlay-head">
        <div>
          <h3>Añadir lactato a sesión</h3>
          <p className="ath-tests-overlay-dose">{lapMatch.dose_prescription}</p>
        </div>
        <button type="button" className="ath-tests-modal__close" onClick={onClose}>&times;</button>
      </div>

      {lapMatch.matched ? (
        <p className="ath-tests-overlay-match ath-tests-overlay-match--ok">
          Garmin match: laps coinciden con intervalos (±10s). FC y ritmo pre-rellenados.
        </p>
      ) : (
        <p className="ath-tests-overlay-match ath-tests-overlay-match--no">
          Sin match de laps. Introduce FC y ritmo manualmente para cada intervalo.
        </p>
      )}

      <div className="ath-tests-form__table">
        <div className="ath-tests-form__header">
          <span>#</span>
          <span>Dur</span>
          <span>Zona</span>
          <span>{usePace ? "Ritmo" : "Watts"}</span>
          <span>FC</span>
          <span>Lac</span>
        </div>
        {lapMatch.steps.map((step, i) => {
          const row = rows[i];
          if (!row) return null;
          const durLabel = step.planned_duration_s >= 60
            ? `${Math.round(step.planned_duration_s / 60)}'`
            : `${step.planned_duration_s}"`;
          return (
            <div key={i} className="ath-tests-form__row">
              <span className="ath-tests-form__idx">{step.order}</span>
              <span className="ath-tests-form__dur">{durLabel}</span>
              <span className="ath-tests-form__zone">{step.intensity_label || "--"}</span>
              {usePace ? (
                <input
                  type="text"
                  placeholder="m:ss"
                  value={row.pace}
                  onChange={(e) => updateRow(i, "pace", e.target.value)}
                  className={`ath-tests-form__input ${step.garmin_matched ? "ath-tests-form__input--prefilled" : ""}`}
                />
              ) : (
                <input
                  type="text"
                  placeholder="W"
                  value={row.power}
                  onChange={(e) => updateRow(i, "power", e.target.value)}
                  className={`ath-tests-form__input ${step.garmin_matched ? "ath-tests-form__input--prefilled" : ""}`}
                />
              )}
              <input
                type="text"
                placeholder="bpm"
                value={row.hr}
                onChange={(e) => updateRow(i, "hr", e.target.value)}
                className={`ath-tests-form__input ath-tests-form__input--sm ${step.garmin_matched ? "ath-tests-form__input--prefilled" : ""}`}
              />
              <input
                type="text"
                placeholder="mmol"
                value={row.lactate}
                onChange={(e) => updateRow(i, "lactate", e.target.value)}
                className="ath-tests-form__input ath-tests-form__input--sm ath-tests-form__input--lac"
              />
            </div>
          );
        })}
      </div>

      {error && <p className="ath-tests-error">{error}</p>}

      <button type="submit" className="ath-tests-form__submit" disabled={submitting}>
        {submitting ? "Analizando..." : "Crear test de lactato"}
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════
   TEST CONSIDERATIONS — Practical guidelines from Lactate.com course
   ══════════════════════════════════════════════════════════════ */

type ConsiderationSection = {
  icon: string;
  title: string;
  items: string[];
};

const CONSIDERATION_SECTIONS: ConsiderationSection[] = [
  {
    icon: "🎯",
    title: "Objetivo del test",
    items: [
      "El test de lactato mide el desarrollo de tus sistemas energéticos: aeróbico (VO2max) y anaeróbico (VLamax). No es solo un número de umbral — es un perfil completo de tu condicionamiento.",
      "La curva de lactato revela tres cosas clave: la resistencia aeróbica (velocidad a 4 mmol), la capacidad anaeróbica (lactato máximo) y la pendiente de la curva (interacción entre ambos sistemas). Cuanto más plana sea la curva, mejor.",
      "Olbrecht llama a este proceso el \"Steering Principle\": medir → evaluar → planificar → entrenar → repetir. Cada test te acerca a tu peak performance.",
    ],
  },
  {
    icon: "📋",
    title: "Antes del test",
    items: [
      "Hazlo después de 1-2 días de descanso o actividad ligera — nunca después de un entreno intenso. Las semanas de descarga son ideales.",
      "No hagas entrenos de alta intensidad ni pesas el día anterior ni el mismo día del test.",
      "Asegúrate de haber comido carbohidratos suficientes ese día. No hagas el test en ayunas ni tras una dieta baja en carbs.",
      "Evita el café y bebidas con cafeína el día del test — la cafeína altera la respuesta de lactato.",
      "Apunta las condiciones: temperatura, hora del día, estado de fatiga, último entreno duro. Para comparar tests futuros, intenta replicar las mismas condiciones.",
    ],
  },
  {
    icon: "🏃",
    title: "Protocolo running",
    items: [
      "Usa escalones largos: mínimo 4-5 minutos por paso. El lactato tarda >5 min en estabilizarse en sangre. Los protocolos cortos (3 min) subestiman el valor real.",
      "Empieza suave (ritmo de calentamiento) y sube progresivamente. El primer paso debe generar lactato <2 mmol.",
      "Para la parte aeróbica: 2-4 pasos incrementales. Detente cuando superes 4 mmol. No hace falta llegar al agotamiento.",
      "Toma la muestra de lactato 30-60 segundos después de cada paso. La muestra a 1 minuto post-esfuerzo es estándar.",
      "Si el primer paso ya da >2 mmol, repítelo más lento. Necesitas al menos 1-2 puntos por debajo de LT1 para una curva fiable.",
      "Mantén los splits lo más regulares posible dentro de cada paso. Variación en ritmo = ruido en la curva.",
    ],
  },
  {
    icon: "🚴",
    title: "Protocolo ciclismo",
    items: [
      "Usa rodillo o un tramo plano sin semáforos. La potencia constante es clave — más fácil de controlar que el ritmo en running.",
      "Escalones de 4-5 minutos subiendo 20-30W por paso. Empieza al 50-60% de tu FTP estimado.",
      "Registra potencia media Y frecuencia cardíaca de cada paso. Ambos son necesarios para la interpretación completa.",
      "Para ciclismo indoor: mantén la cadencia constante (85-95 rpm) en todos los pasos.",
    ],
  },
  {
    icon: "🏊",
    title: "Protocolo natación",
    items: [
      "Standard Lactate Test Procedure (SLTP): 2×400m crol. El primero 30-35\" más lento que tu mejor marca, el segundo 15-20\" más lento. 15 min entre ambos.",
      "Cada serie: mantén parciales lo más uniformes posible. La irregularidad en el ritmo genera lactato extra por cambios de intensidad.",
      "Toma muestra a 1 min y 3 min post-serie. Si la lectura a 3 min es mayor que a 1 min, toma una tercera. Usa la más alta.",
      "El primer nado debe dar >2.5 mmol y el segundo >4.0 mmol. Si el primero da <2.0, repítelo más rápido.",
      "Para capacidad anaeróbica: 1×100m all-out en tu estilo principal. Toma lactato a 3 y 5 min, luego cada 2 min hasta que baje.",
      "Usa push-off en vez de salida con salto, a menos que siempre vayas a usar salto en todos los tests futuros. La consistencia es clave.",
      "Recuperación entre nados: 5-7 min nadando suave.",
    ],
  },
  {
    icon: "⚠️",
    title: "Errores comunes",
    items: [
      "Pasos demasiado cortos (<4 min): el lactato no se estabiliza y los valores son artificialmente bajos. Es el error más frecuente.",
      "Empezar demasiado rápido: si ya estás a 3-4 mmol en el primer paso, no tienes referencia de baseline y la curva pierde información.",
      "Hacer el test fatigado: después de un microciclo de carga o una competición. Los umbrales aparecerán peor de lo real.",
      "Comparar tests en condiciones diferentes: calor vs frío, mañana vs noche, rodillo vs carretera, descansado vs fatigado.",
      "No registrar FC: sin frecuencia cardíaca, pierdes la capacidad de cruzar datos y validar el test.",
      "Intentar llegar al agotamiento total: no es necesario para medir umbrales. Solo necesitas superar 4 mmol para la parte aeróbica.",
    ],
  },
  {
    icon: "🔄",
    title: "Consistencia entre tests",
    items: [
      "Para que los tests sean comparables, repite exactamente las mismas condiciones: misma hora, misma comida previa, mismo calentamiento, mismo lugar.",
      "Usa el mismo analizador de lactato. Distintos aparatos pueden dar lecturas ligeramente diferentes.",
      "Testea cada 4-6 semanas durante el ciclo de entrenamiento. Más frecuente no aporta información útil; menos frecuente pierde la evolución.",
      "No cambies el protocolo entre tests de la misma disciplina. Si usas pasos de 5 min, mantén 5 min en todos.",
      "Los cambios reales en umbrales tardan 3-4 semanas de entrenamiento consistente en manifestarse. No esperes cambios de una semana a otra.",
    ],
  },
  {
    icon: "🧠",
    title: "Interpretación",
    items: [
      "El lactato NO es un producto de desecho. Es incoloro, inodoro e inocuo. Es un combustible que tu sistema aeróbico utiliza.",
      "Una curva más plana = mejor equilibrio entre sistemas. Significa que tu sistema aeróbico absorbe bien el lactato producido por el anaeróbico.",
      "Si el LT2 sube (más rápido al mismo lactato) pero el lactato máximo baja → tu sistema anaeróbico se está reduciendo. Bien para distancia, mal para velocidad.",
      "Si ambos suben → mejora general. El escenario ideal para cualquier atleta de resistencia.",
      "Dos atletas con el mismo umbral pueden necesitar entrenamientos completamente diferentes. Lo que importa es qué combinación de VO2max y VLamax produce ese umbral.",
      "El \"Steering Process\" de Olbrecht: test → evaluar resultado → ajustar plan → entrenar → re-testar. Es un ciclo continuo hacia tu peak performance.",
    ],
  },
];

function TestConsiderations() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="ath-tests-considerations">
      <h3 className="ath-tests-considerations__title">Consideraciones para tests</h3>
      <p className="ath-tests-considerations__subtitle">
        Guía práctica basada en el curso de Lactate.com y los principios de Jan Olbrecht
      </p>
      <div className="ath-tests-considerations__list">
        {CONSIDERATION_SECTIONS.map((sec, i) => {
          const isOpen = openIdx === i;
          return (
            <div key={i} className={`ath-tests-consideration ${isOpen ? "ath-tests-consideration--open" : ""}`}>
              <button
                type="button"
                className="ath-tests-consideration__header"
                onClick={() => setOpenIdx(isOpen ? null : i)}
              >
                <span className="ath-tests-consideration__icon">{sec.icon}</span>
                <span className="ath-tests-consideration__title-text">{sec.title}</span>
                <svg
                  className="ath-tests-consideration__chevron"
                  width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isOpen && (
                <ul className="ath-tests-consideration__body">
                  {sec.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Format dynamic reference value ── */
function formatRef(ref: DynamicReference | null | undefined, discipline: string): string {
  if (!ref) return "--";
  if (discipline === "running" && ref.estimated_pace_seconds_per_km) return secondsToPace(ref.estimated_pace_seconds_per_km) + "/km";
  if (ref.estimated_power_watts) return Math.round(ref.estimated_power_watts) + "W";
  if (ref.estimated_hr_at_target) return Math.round(ref.estimated_hr_at_target) + " bpm";
  if (discipline === "running" && ref.estimated_speed_kph) return secondsToPace(3600 / ref.estimated_speed_kph) + "/km";
  return "--";
}

function confLabel(score: number): { text: string; cls: string } {
  if (score >= 0.75) return { text: "Alta", cls: "high" };
  if (score >= 0.55) return { text: "Media", cls: "medium" };
  return { text: "Baja", cls: "low" };
}

/* ── Current dynamic thresholds summary ── */
function CurrentThresholds({ disciplineViews }: { disciplineViews: Record<string, DisciplineView> }) {
  const entries = Object.values(disciplineViews)
    .filter((v) => v.dynamic_thresholds?.acute)
    .map((v) => ({ discipline: v.discipline, dt: v.dynamic_thresholds! }));

  if (entries.length === 0) return null;

  return (
    <div className="ath-tests-current">
      <h3 className="ath-tests-current__title">Tus umbrales actuales</h3>
      <div className="ath-tests-current__grid">
        {entries.map(({ discipline, dt }) => {
          const acute = dt.acute;
          const lt1 = acute.practical_lt1;
          const lt2 = acute.practical_lt2;
          const ref2 = acute.reference_2mmol;
          const ref4 = acute.reference_4mmol;
          // Use practical if available, fall back to 2/4mmol references
          const showLt1 = lt1 ?? ref2;
          const showLt2 = lt2 ?? ref4;
          const lt1Label = lt1 ? "LT1" : "Ref 2mmol";
          const lt2Label = lt2 ? "LT2" : "Ref 4mmol";
          const nPoints = acute.points_used?.length ?? 0;
          const nSessions = acute.sessions_considered ?? 0;
          const conf = acute.confidence_score;
          const cl = confLabel(conf);

          return (
            <div key={discipline + (dt.power_source ?? "")} className="ath-tests-current__card">
              <div className="ath-tests-current__disc">
                {discipline}
                {dt.power_source && <span className="ath-tests-current__ps">{dt.power_source}</span>}
              </div>
              <div className="ath-tests-current__vals">
                <span className="ath-tests-current__lt" style={{ color: "#22c55e" }}>
                  {lt1Label}: {formatRef(showLt1, discipline)}
                </span>
                <span className="ath-tests-current__lt" style={{ color: "#f97316" }}>
                  {lt2Label}: {formatRef(showLt2, discipline)}
                </span>
              </div>
              <div className="ath-tests-current__meta">
                <span className={`ath-tests-current__conf ath-tests-current__conf--${cl.cls}`}>
                  {cl.text} ({(conf * 100).toFixed(0)}%)
                </span>
                <span className="ath-tests-current__info">
                  {nPoints} puntos · {nSessions} sesiones · {acute.based_on_days}d
                </span>
              </div>
              {showLt1?.estimated_hr_at_target && (formatRef(showLt1, discipline) !== Math.round(showLt1.estimated_hr_at_target) + " bpm") && (
                <div className="ath-tests-current__hr-row">
                  <span style={{ color: "#22c55e" }}>{lt1Label}: {Math.round(showLt1.estimated_hr_at_target)} bpm</span>
                  {showLt2?.estimated_hr_at_target && <span style={{ color: "#f97316" }}>{lt2Label}: {Math.round(showLt2.estimated_hr_at_target)} bpm</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MY TESTS PAGE
   ══════════════════════════════════════════════════════════════ */
export function MyTestsPage() {
  const { user, token, analysis } = useAthleteData();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Mini analysis cache for curves
  const [miniAnalyses, setMiniAnalyses] = useState<Record<number, SessionAnalysis>>({});

  const loadSessions = useCallback(async () => {
    if (!user.athlete_id) return;
    setLoading(true);
    try {
      const result = (await api.athleteSessions(token, user.athlete_id)) as SessionSummary[];
      // Only show sessions that have lactate data
      const withLactate = result.filter((s) =>
        s.intervals?.some((iv) => iv.lactate_sample && iv.lactate_sample.lactate_mmol > 0),
      );
      setSessions(withLactate);
    } catch {
      // Fallback: use recent_sessions from analysis
      const allSessions: SessionSummary[] = [];
      for (const view of Object.values(analysis?.discipline_views ?? {})) {
        for (const s of (view as any).recent_sessions ?? []) {
          if (s.intervals?.some((iv: any) => iv.lactate_sample?.lactate_mmol > 0)) {
            allSessions.push(s);
          }
        }
      }
      setSessions(allSessions);
    } finally {
      setLoading(false);
    }
  }, [user.athlete_id, token, analysis]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load mini analyses for first few sessions (for curve preview)
  useEffect(() => {
    const toLoad = sessions.slice(0, 10).filter((s) => !miniAnalyses[s.id]);
    for (const s of toLoad) {
      api.sessionAnalysis(token, s.id)
        .then((r) => setMiniAnalyses((prev) => ({ ...prev, [s.id]: r as SessionAnalysis })))
        .catch(() => {});
    }
  }, [sessions, token]);

  function handleCreated() {
    setShowForm(false);
    loadSessions();
  }

  return (
    <div className="ath-tests">
      <div className="ath-tests__head">
        <h2>Mis Tests</h2>
        <button className="ath-tests__new-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "+ Nuevo test"}
        </button>
      </div>

      <CurrentThresholds disciplineViews={analysis?.discipline_views ?? {}} />

      <TestConsiderations />

      {showForm && <ManualTestForm onCreated={handleCreated} />}

      {loading && <p className="ath-tests-loading">Cargando tests...</p>}

      {!loading && sessions.length === 0 && !showForm && (
        <div className="ath-tests-empty-state">
          <p>No tienes tests de lactato registrados.</p>
          <p>Crea un test manual o pide a tu entrenador que suba uno.</p>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="ath-tests__list">
          {sessions.map((s) => {
            const mini = miniAnalyses[s.id];
            const curvePoints = mini?.curve_by_pace?.length ? mini.curve_by_pace : mini?.curve_by_power?.length ? mini.curve_by_power : mini?.curve_by_hr?.length ? mini.curve_by_hr : [];
            const lt1 = mini?.thresholds?.find((t) => t.name === "LT1");
            const lt2 = mini?.thresholds?.find((t) => t.name === "LT2");
            const conf = mini?.thresholds?.[0]?.confidence;
            const nPoints = s.intervals?.filter((iv) => iv.lactate_sample?.lactate_mmol).length ?? 0;

            return (
              <button
                key={s.id}
                type="button"
                className="ath-tests__card"
                onClick={() => setSelectedId(s.id)}
              >
                <div className="ath-tests__card-left">
                  <MiniCurve points={curvePoints} />
                </div>
                <div className="ath-tests__card-body">
                  <div className="ath-tests__card-top">
                    <span className="ath-tests__card-disc">{s.discipline}</span>
                    <span className="ath-tests__card-date">{formatDate(s.performed_at)}</span>
                  </div>
                  <div className="ath-tests__card-thresholds">
                    {lt1 && <span className="ath-tests__card-lt" style={{ color: "#22c55e" }}>LT1: {lt1.pace_seconds_per_km ? secondsToPace(lt1.pace_seconds_per_km) + "/km" : lt1.power_watts ? Math.round(lt1.power_watts) + "W" : lt1.heart_rate ? Math.round(lt1.heart_rate) + " bpm" : "--"}</span>}
                    {lt2 && <span className="ath-tests__card-lt" style={{ color: "#f97316" }}>LT2: {lt2.pace_seconds_per_km ? secondsToPace(lt2.pace_seconds_per_km) + "/km" : lt2.power_watts ? Math.round(lt2.power_watts) + "W" : lt2.heart_rate ? Math.round(lt2.heart_rate) + " bpm" : "--"}</span>}
                    {conf != null && <span className="ath-tests__card-conf">Conf: {(conf * 100).toFixed(0)}%</span>}
                  </div>
                  <span className="ath-tests__card-points">{nPoints} puntos</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedId != null && <TestDetail sessionId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

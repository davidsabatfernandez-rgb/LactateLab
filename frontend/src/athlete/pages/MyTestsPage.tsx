import { useCallback, useEffect, useMemo, useState } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { api } from "../../lib/api";
import type { SessionSummary, SessionAnalysis, CurvePoint, Threshold, ConfidenceItem } from "../../types";

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
type StepRow = {
  duration_min: string;
  pace: string;
  power: string;
  hr: string;
  lactate: string;
};

type Discipline = "running" | "ciclismo" | "natación";

const EMPTY_ROW: StepRow = { duration_min: "", pace: "", power: "", hr: "", lactate: "" };

/* ── Mini curve SVG ── */
function MiniCurve({ points }: { points: CurvePoint[] }) {
  if (points.length < 2) return <span className="ath-tests-nocurve">--</span>;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const toSvg = (x: number, y: number) => `${10 + ((x - minX) / rangeX) * 80},${55 - ((y - minY) / rangeY) * 45}`;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${toSvg(p.x, p.y)}`).join(" ");

  return (
    <svg viewBox="0 0 100 60" className="ath-tests-minicurve" preserveAspectRatio="xMidYMid meet">
      <path d={d} fill="none" stroke="var(--c-accent, #d26a36)" strokeWidth="2" strokeLinecap="round" />
      {points.map((p, i) => {
        const [cx, cy] = toSvg(p.x, p.y).split(",").map(Number);
        return <circle key={i} cx={cx} cy={cy} r="2.5" fill="#fff" stroke="var(--c-accent, #d26a36)" strokeWidth="1.5" />;
      })}
    </svg>
  );
}

/* ── Full curve with thresholds ── */
function FullCurve({ points, thresholds }: { points: CurvePoint[]; thresholds: Threshold[] }) {
  if (points.length < 2) return <p className="ath-tests-empty">No hay suficientes puntos para la curva.</p>;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys) * 1.1;
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const W = 400, H = 200, pad = { t: 20, r: 20, b: 40, l: 50 };
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;

  const sx = (x: number) => pad.l + ((x - minX) / rangeX) * plotW;
  const sy = (y: number) => pad.t + plotH - ((y - minY) / rangeY) * plotH;

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
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
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4" fill="#fff" stroke="var(--c-accent, #d26a36)" strokeWidth="2" />
      ))}

      {/* LT1 line */}
      {lt1?.pace_seconds_per_km && (
        <>
          <line x1={sx(lt1.pace_seconds_per_km)} y1={pad.t} x2={sx(lt1.pace_seconds_per_km)} y2={H - pad.b} stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5 3" />
          <text x={sx(lt1.pace_seconds_per_km)} y={pad.t - 4} textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="700">LT1</text>
        </>
      )}
      {lt1?.power_watts && !lt1?.pace_seconds_per_km && (
        <>
          <line x1={sx(lt1.power_watts)} y1={pad.t} x2={sx(lt1.power_watts)} y2={H - pad.b} stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5 3" />
          <text x={sx(lt1.power_watts)} y={pad.t - 4} textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="700">LT1</text>
        </>
      )}

      {/* LT2 line */}
      {lt2?.pace_seconds_per_km && (
        <>
          <line x1={sx(lt2.pace_seconds_per_km)} y1={pad.t} x2={sx(lt2.pace_seconds_per_km)} y2={H - pad.b} stroke="#f97316" strokeWidth="1.5" strokeDasharray="5 3" />
          <text x={sx(lt2.pace_seconds_per_km)} y={pad.t - 4} textAnchor="middle" fill="#f97316" fontSize="10" fontWeight="700">LT2</text>
        </>
      )}
      {lt2?.power_watts && !lt2?.pace_seconds_per_km && (
        <>
          <line x1={sx(lt2.power_watts)} y1={pad.t} x2={sx(lt2.power_watts)} y2={H - pad.b} stroke="#f97316" strokeWidth="1.5" strokeDasharray="5 3" />
          <text x={sx(lt2.power_watts)} y={pad.t - 4} textAnchor="middle" fill="#f97316" fontSize="10" fontWeight="700">LT2</text>
        </>
      )}
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
      <span className="ath-tests-th__main">{pace || power || "--"}</span>
      {hr && <span className="ath-tests-th__detail">{hr}</span>}
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
  const { token } = useAthleteData();
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

  const curvePoints = analysis.curve_by_pace?.length ? analysis.curve_by_pace : analysis.curve_by_power?.length ? analysis.curve_by_power : analysis.curve_by_hr ?? [];
  const curveLabel = analysis.curve_by_pace?.length ? "Ritmo (s/km)" : analysis.curve_by_power?.length ? "Potencia (W)" : "FC (bpm)";

  return (
    <div className="ath-tests-modal-overlay" onClick={onClose}>
      <div className="ath-tests-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ath-tests-modal__head">
          <h3>{analysis.session.discipline} — {formatDate(analysis.session.performed_at)}</h3>
          <button className="ath-tests-modal__close" onClick={onClose}>&times;</button>
        </div>

        {/* Curve */}
        <div className="ath-tests-modal__curve">
          <span className="ath-tests-modal__curve-label">{curveLabel}</span>
          <FullCurve points={curvePoints} thresholds={analysis.thresholds ?? []} />
        </div>

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
    { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usePace = discipline !== "ciclismo";
  const paceLabel = discipline === "natación" ? "Ritmo /100m" : "Ritmo /km";
  const paceHint = discipline === "natación" ? "m:ss" : "m:ss";

  function updateRow(i: number, field: keyof StepRow, value: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(i: number) {
    if (rows.length <= 2) return;
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Parse rows
    const intervals = rows
      .map((r, i) => {
        const lac = parseFloat(r.lactate);
        if (isNaN(lac) || lac <= 0) return null;
        const durMin = parseFloat(r.duration_min) || 5;
        const hr = parseInt(r.hr) || undefined;
        const paceVal = usePace ? paceToSeconds(r.pace) : undefined;
        const powerVal = !usePace ? parseFloat(r.power) || undefined : undefined;

        return {
          order_index: i + 1,
          duration_seconds: Math.round(durMin * 60),
          rest_seconds: 60,
          rest_type: "passive",
          heart_rate_avg: hr,
          pace_seconds_per_km: discipline === "running" ? paceVal : undefined,
          power_watts: discipline === "ciclismo" ? powerVal : undefined,
          cadence: undefined,
          rpe: undefined,
          purpose: "threshold_work",
          lactate_sample: {
            lactate_mmol: lac,
            sample_delay_seconds: 30,
            sample_timing_label: "30s post",
          },
        };
      })
      .filter(Boolean);

    if (intervals.length < 3) {
      setError("Necesitas al menos 3 puntos con lactato para el análisis.");
      return;
    }

    setSubmitting(true);
    try {
      await api.createSession(token, {
        athlete_id: user.athlete_id,
        performed_at: `${date}T10:00:00`,
        discipline,
        session_type: "lactate_test",
        goal: "Test de lactato manual",
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
      <h3>Nuevo test de lactato</h3>

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

      <div className="ath-tests-form__table">
        <div className="ath-tests-form__header">
          <span>#</span>
          <span>Min</span>
          <span>{usePace ? paceLabel : "Watts"}</span>
          <span>FC</span>
          <span>Lactato</span>
          <span></span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="ath-tests-form__row">
            <span className="ath-tests-form__idx">{i + 1}</span>
            <input
              type="text"
              placeholder="5"
              value={row.duration_min}
              onChange={(e) => updateRow(i, "duration_min", e.target.value)}
              className="ath-tests-form__input ath-tests-form__input--sm"
            />
            {usePace ? (
              <input
                type="text"
                placeholder={paceHint}
                value={row.pace}
                onChange={(e) => updateRow(i, "pace", e.target.value)}
                className="ath-tests-form__input"
              />
            ) : (
              <input
                type="text"
                placeholder="watts"
                value={row.power}
                onChange={(e) => updateRow(i, "power", e.target.value)}
                className="ath-tests-form__input"
              />
            )}
            <input
              type="text"
              placeholder="bpm"
              value={row.hr}
              onChange={(e) => updateRow(i, "hr", e.target.value)}
              className="ath-tests-form__input ath-tests-form__input--sm"
            />
            <input
              type="text"
              placeholder="mmol"
              value={row.lactate}
              onChange={(e) => updateRow(i, "lactate", e.target.value)}
              className="ath-tests-form__input ath-tests-form__input--sm"
            />
            <button type="button" className="ath-tests-form__remove" onClick={() => removeRow(i)} title="Quitar">
              &times;
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="ath-tests-form__add" onClick={addRow}>
        + Punto
      </button>

      {error && <p className="ath-tests-error">{error}</p>}

      <button type="submit" className="ath-tests-form__submit" disabled={submitting}>
        {submitting ? "Analizando..." : "Analizar test"}
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
            const curvePoints = mini?.curve_by_pace?.length ? mini.curve_by_pace : mini?.curve_by_power?.length ? mini.curve_by_power : [];
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
                    {lt1 && <span className="ath-tests__card-lt" style={{ color: "#22c55e" }}>LT1: {lt1.pace_seconds_per_km ? secondsToPace(lt1.pace_seconds_per_km) + "/km" : lt1.power_watts ? Math.round(lt1.power_watts) + "W" : "--"}</span>}
                    {lt2 && <span className="ath-tests__card-lt" style={{ color: "#f97316" }}>LT2: {lt2.pace_seconds_per_km ? secondsToPace(lt2.pace_seconds_per_km) + "/km" : lt2.power_watts ? Math.round(lt2.power_watts) + "W" : "--"}</span>}
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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { api } from "../../lib/api";
import type { SessionSummary, SessionAnalysis, CurvePoint, Threshold, ConfidenceItem, DynamicThresholds, DynamicReference, DisciplineView } from "../../types";
import { ThresholdAnchorBanner } from "../components/ThresholdAnchorBanner";

/* ── Weather helper ── */
type WeatherData = {
  temperature: number;
  humidity: number;
  wind_speed: number;
  wind_direction: number;
  apparent_temperature: number;
  precipitation: number;
  summary: string;
};

async function fetchWeather(lat: number, lon: number, date: string): Promise<WeatherData | string> {
  const today = new Date().toISOString().slice(0, 10);
  const diffDays = (new Date(today).getTime() - new Date(date).getTime()) / 86400000;

  // Open-Meteo archive goes back ~80 years, forecast up to 16 days
  const isHistorical = date < today;
  const isFuture = date > today;

  if (isFuture && diffDays < -16) return "Fecha demasiado lejana en el futuro para obtener meteorología.";

  try {
    let url: string;
    if (isHistorical) {
      url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,apparent_temperature,precipitation&timezone=auto`;
    } else {
      url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,apparent_temperature,precipitation&timezone=auto`;
    }

    const res = await fetch(url);
    if (!res.ok) return `Error obteniendo meteorología (${res.status}).`;
    const data = await res.json();
    const h = data.hourly;
    if (!h?.temperature_2m?.length) return "Sin datos meteorológicos para esta fecha.";

    // Use values around midday (index 10-14, ~10h-14h)
    const midIdx = Math.min(12, h.temperature_2m.length - 1);
    const slice = (arr: number[]) => {
      const start = Math.max(0, midIdx - 2);
      const end = Math.min(arr.length, midIdx + 3);
      const s = arr.slice(start, end).filter((v: number) => v != null);
      return s.length ? s.reduce((a: number, b: number) => a + b, 0) / s.length : arr[midIdx];
    };

    const temp = Math.round(slice(h.temperature_2m) * 10) / 10;
    const humidity = Math.round(slice(h.relative_humidity_2m));
    const wind = Math.round(slice(h.wind_speed_10m) * 10) / 10;
    const windDir = Math.round(slice(h.wind_direction_10m));
    const apparent = Math.round(slice(h.apparent_temperature) * 10) / 10;
    const precip = Math.round(h.precipitation.reduce((a: number, b: number) => a + (b ?? 0), 0) * 10) / 10;

    const windLabel = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(windDir / 45) % 8];
    const summary = `${temp}°C (ST ${apparent}°C), ${humidity}% hum, viento ${wind} km/h ${windLabel}${precip > 0 ? `, ${precip}mm lluvia` : ""}`;

    return { temperature: temp, humidity, wind_speed: wind, wind_direction: windDir, apparent_temperature: apparent, precipitation: precip, summary };
  } catch {
    return "Error de conexión al obtener meteorología.";
  }
}

function WeatherButton({ date, onWeatherFetched }: { date: string; onWeatherFetched: (text: string) => void }) {
  const [mode, setMode] = useState<null | "choosing" | "manual" | "loading">(null);
  const [manualLocation, setManualLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleFetch(lat: number, lon: number) {
    setMode("loading");
    setError(null);
    const w = await fetchWeather(lat, lon, date);
    if (typeof w === "string") {
      setError(w);
      setMode(null);
    } else {
      setResult(w.summary);
      onWeatherFetched(w.summary);
      setMode(null);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Geolocalización no disponible en este navegador.");
      return;
    }
    setMode("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => handleFetch(pos.coords.latitude, pos.coords.longitude),
      () => { setError("Permiso de ubicación denegado."); setMode(null); },
      { timeout: 10000 }
    );
  }

  async function useManualLocation() {
    if (!manualLocation.trim()) return;
    setMode("loading");
    setError(null);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(manualLocation)}&count=1&language=es`);
      const data = await res.json();
      if (!data.results?.length) {
        setError(`No se encontró "${manualLocation}".`);
        setMode("manual");
        return;
      }
      const { latitude, longitude } = data.results[0];
      await handleFetch(latitude, longitude);
    } catch {
      setError("Error buscando ubicación.");
      setMode("manual");
    }
  }

  if (result) {
    return <span className="ath-weather-result">🌤 {result}</span>;
  }

  if (mode === "loading") {
    return <span className="ath-weather-loading">Obteniendo meteo...</span>;
  }

  if (mode === "manual") {
    return (
      <div className="ath-weather-manual">
        <input
          type="text"
          placeholder="Ciudad o lugar..."
          value={manualLocation}
          onChange={(e) => setManualLocation(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), useManualLocation())}
          className="ath-weather-manual__input"
          autoFocus
        />
        <button type="button" className="ath-weather-manual__go" onClick={useManualLocation}>Buscar</button>
        <button type="button" className="ath-weather-manual__cancel" onClick={() => setMode(null)}>✕</button>
        {error && <span className="ath-weather-error">{error}</span>}
      </div>
    );
  }

  if (mode === "choosing") {
    return (
      <div className="ath-weather-choose">
        <button type="button" className="ath-weather-choose__btn" onClick={useCurrentLocation}>📍 Mi ubicación</button>
        <button type="button" className="ath-weather-choose__btn" onClick={() => setMode("manual")}>✏️ Otra ubicación</button>
        <button type="button" className="ath-weather-manual__cancel" onClick={() => setMode(null)}>✕</button>
        {error && <span className="ath-weather-error">{error}</span>}
      </div>
    );
  }

  return (
    <button type="button" className="ath-weather-btn" onClick={() => setMode("choosing")} title="Añadir meteorología">
      🌤
    </button>
  );
}

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

type FeelingScore = "" | "1" | "2" | "3" | "4" | "5";
const FEELING_OPTIONS: { value: FeelingScore; emoji: string; label: string }[] = [
  { value: "1", emoji: "😫", label: "Muy mal" },
  { value: "2", emoji: "😟", label: "Mal" },
  { value: "3", emoji: "😐", label: "Normal" },
  { value: "4", emoji: "😊", label: "Bien" },
  { value: "5", emoji: "😁", label: "Muy bien" },
];

type StepRow = {
  zone_tag: string;
  duration_min: string;
  rest_min: string;
  pace: string;
  power: string;
  hr: string;
  hr_max: string;
  cadence: string;
  lactate: string;
  feeling: FeelingScore;
  note: string;
};

type Discipline = "running" | "ciclismo" | "natación";

const ZONE_TAGS = ["LT1", "LT2", "VO2", "ANC", "REC", "BASE", "TEMPO", ""];
const EMPTY_ROW: StepRow = { zone_tag: "", duration_min: "", rest_min: "", pace: "", power: "", hr: "", hr_max: "", cadence: "", lactate: "", feeling: "", note: "" };

/* ── Mini curve SVG ── */
function MiniCurve({ points }: { points: CurvePoint[] }) {
  if (points.length < 2) return <span className="ath-tests-nocurve">--</span>;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.lactate);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  // Detect pace (sorted descending by backend): first point x > last point x
  const isPaceAxis = points[0].x > points[points.length - 1].x;
  const toSvg = (x: number, y: number) => {
    const nx = isPaceAxis ? 1 - (x - minX) / rangeX : (x - minX) / rangeX;
    return `${10 + nx * 80},${55 - ((y - minY) / rangeY) * 45}`;
  };
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
type HorizontalRef = { label: string; yVal: number; color: string };

/* ── Full curve with thresholds ── */
function FullCurve({ points, thresholds, dynRefs, hRefs }: { points: CurvePoint[]; thresholds: Threshold[]; dynRefs?: DynRef[]; hRefs?: HorizontalRef[] }) {
  if (points.length < 2) return <p className="ath-tests-empty">No hay suficientes puntos para la curva.</p>;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.lactate);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys) * 1.1;
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const W = 400, H = 200, pad = { t: 20, r: 20, b: 40, l: 50 };
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
  // Pace axis: invert so slow pace (high value) is on left, fast (low) on right
  const isPaceAxis = points.length >= 2 && points[0].x > points[points.length - 1].x;

  const sx = (x: number) => {
    const nx = isPaceAxis ? 1 - (x - minX) / rangeX : (x - minX) / rangeX;
    return pad.l + nx * plotW;
  };
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

      {/* Horizontal standard reference lines (e.g. 2.0 / 4.0 mmol) */}
      {hRefs?.map(({ label, yVal, color }) => {
        if (yVal < minY || yVal > maxY) return null;
        return (
          <g key={label}>
            <line x1={pad.l} y1={sy(yVal)} x2={W - pad.r} y2={sy(yVal)} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
            <text x={W - pad.r + 2} y={sy(yVal) + 3} textAnchor="start" fill={color} fontSize="7.5" fontWeight="600" opacity="0.65">{label}</text>
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
type EditableInterval = {
  id: number;
  order_index: number;
  lactate: string;
  pace: string;
  power: string;
  hr: string;
  cadence: string;
  duration: string;
  rest: string;
  note: string;
};

function TestDetail({ sessionId, onClose, onDeleted }: { sessionId: number; onClose: () => void; onDeleted?: () => void }) {
  const { token, analysis: athleteAnalysis } = useAthleteData();
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editRows, setEditRows] = useState<EditableInterval[]>([]);
  const [editGoal, setEditGoal] = useState("");
  const [editComments, setEditComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadAnalysis = useCallback(() => {
    setLoading(true);
    setError(null);
    api.sessionAnalysis(token, sessionId)
      .then((r) => setAnalysis(r as SessionAnalysis))
      .catch((e) => setError(e instanceof Error ? e.message : "Error cargando análisis"))
      .finally(() => setLoading(false));
  }, [sessionId, token]);

  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  const isDraft = analysis?.session?.is_draft ?? false;

  // Enter edit mode
  function startEdit() {
    if (!analysis?.session) return;
    const s = analysis.session;
    setEditGoal(s.goal ?? "");
    setEditComments(s.comments ?? "");
    const intervals = s.intervals ?? [];
    setEditRows(intervals.map((iv) => ({
      id: iv.id!,
      order_index: iv.order_index,
      lactate: iv.lactate_sample?.lactate_mmol?.toString() ?? "",
      pace: iv.pace_seconds_per_km ? secondsToPace(iv.pace_seconds_per_km) : "",
      power: iv.power_watts?.toString() ?? "",
      hr: iv.heart_rate_avg?.toString() ?? "",
      cadence: iv.cadence?.toString() ?? "",
      duration: iv.duration_seconds ? (iv.duration_seconds / 60).toFixed(0) : "",
      rest: iv.rest_seconds ? (iv.rest_seconds / 60).toFixed(0) : "",
      note: iv.notes ?? "",
    })));
    setEditing(true);
  }

  function updateEditRow(i: number, field: keyof EditableInterval, value: string) {
    setEditRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addEditRow() {
    const nextIndex = editRows.length > 0 ? Math.max(...editRows.map((r) => r.order_index)) + 1 : 1;
    setEditRows((prev) => [...prev, { id: 0, order_index: nextIndex, lactate: "", pace: "", power: "", hr: "", cadence: "", duration: "", rest: "", note: "" }]);
  }

  function removeEditRow(i: number) {
    if (editRows.length <= 1) return;
    setEditRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!analysis?.session) return;
    setSaving(true);
    setError(null);
    try {
      const usePace = analysis.session.discipline === "running" || analysis.session.discipline === "natación";

      for (const row of editRows) {
        const paceVal = usePace ? paceToSeconds(row.pace) : undefined;
        const powerVal = !usePace ? (parseFloat(row.power) || undefined) : undefined;
        const hrVal = parseInt(row.hr) || undefined;
        const durMin = parseFloat(row.duration);
        const durSec = !isNaN(durMin) && durMin > 0 ? Math.round(durMin * 60) : 300;
        const restMin = parseFloat(row.rest);
        const restSec = !isNaN(restMin) && restMin >= 0 ? Math.round(restMin * 60) : 60;
        const lacVal = parseFloat(row.lactate);

        if (row.id === 0) {
          // New interval — POST
          if (isNaN(lacVal) || lacVal <= 0) continue; // skip empty new rows
          const cadNewVal = parseInt(row.cadence) || undefined;
          await api.addInterval(token, sessionId, {
            order_index: row.order_index,
            duration_seconds: durSec,
            rest_seconds: restSec,
            rest_type: "passive",
            heart_rate_avg: hrVal,
            cadence: cadNewVal,
            pace_seconds_per_km: usePace ? paceVal : undefined,
            power_watts: !usePace ? powerVal : undefined,
            purpose: "threshold_work",
            notes: row.note || undefined,
            lactate_sample: {
              lactate_mmol: lacVal,
              sample_delay_seconds: 30,
              sample_timing_label: "30s post",
            },
          });
        } else {
          // Existing interval — PATCH
          const intervalPayload: Record<string, unknown> = {
            notes: row.note || undefined,
          };
          if (paceVal) intervalPayload.pace_seconds_per_km = paceVal;
          if (powerVal) intervalPayload.power_watts = powerVal;
          if (hrVal) intervalPayload.heart_rate_avg = hrVal;
          const cadVal = parseInt(row.cadence) || undefined;
          if (cadVal) intervalPayload.cadence = cadVal;
          if (durSec) intervalPayload.duration_seconds = durSec;
          if (restSec !== undefined) intervalPayload.rest_seconds = restSec;
          if (!isNaN(lacVal) && lacVal > 0) {
            intervalPayload.lactate_sample = {
              lactate_mmol: lacVal,
              sample_delay_seconds: 30,
              sample_timing_label: "30s post",
            };
          }
          await api.updateInterval(token, row.id, intervalPayload);
        }
      }

      // Check if still draft: if any row has pace/power/HR → publish
      const hasPerformanceData = editRows.some((r) => r.pace || r.power || r.hr);
      const newDraftStatus = !hasPerformanceData;

      await api.updateSession(token, sessionId, {
        goal: editGoal || undefined,
        comments: editComments || undefined,
        is_draft: newDraftStatus,
      });

      setEditing(false);
      loadAnalysis();
      if (onDeleted) onDeleted(); // refresh parent list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando cambios");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteSession(token, sessionId);
      onClose();
      if (onDeleted) onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando la sesión");
      setDeleting(false);
    }
  }

  if (loading) return <div className="ath-tests-modal-overlay" onClick={onClose}><div className="ath-tests-modal" onClick={(e) => e.stopPropagation()}>Cargando...</div></div>;
  if (error || !analysis) return <div className="ath-tests-modal-overlay" onClick={onClose}><div className="ath-tests-modal" onClick={(e) => e.stopPropagation()}><p className="ath-tests-error">{error || "Sin datos"}</p><button onClick={onClose}>Cerrar</button></div></div>;

  const hasPace = !!analysis.curve_by_pace?.length;
  const hasPower = !hasPace && !!analysis.curve_by_power?.length;
  const curvePoints = hasPace ? analysis.curve_by_pace : hasPower ? analysis.curve_by_power : analysis.curve_by_hr ?? [];
  const curveLabel = hasPace ? "Ritmo (s/km)" : hasPower ? "Potencia (W)" : "FC (bpm)";
  const usePace = analysis.session.discipline === "running" || analysis.session.discipline === "natación";

  // Build dynamic reference lines from athlete's cross-session thresholds
  const discipline = analysis.session?.discipline;
  const dv = discipline ? (athleteAnalysis?.discipline_views ?? {})[discipline] : undefined;
  const dt = dv?.dynamic_thresholds?.acute;
  const standardRefs: HorizontalRef[] = [
    { label: "LT1 Estándar", yVal: 2.0, color: "#15803d" },
    { label: "LT2 Estándar", yVal: 4.0, color: "#c2410c" },
  ];

  // Compare session vs dynamic
  const sessionLt2 = analysis.thresholds?.find((t) => t.name === "LT2");
  const insights: string[] = [];
  if (dt?.practical_lt2 && sessionLt2) {
    const dynVal = hasPace ? dt.practical_lt2.estimated_pace_seconds_per_km
      : hasPower ? dt.practical_lt2.estimated_power_watts
      : dt.practical_lt2.estimated_hr_at_target;
    const sesVal = sessionLt2.pace_seconds_per_km ?? sessionLt2.power_watts ?? sessionLt2.heart_rate;
    if (dynVal != null && sesVal != null) {
      const diff = hasPace
        ? ((dynVal - sesVal) / dynVal) * 100
        : ((sesVal - dynVal) / dynVal) * 100;
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
          <h3>
            {discipline} — {formatDate(analysis.session.performed_at)}
            {isDraft && <span className="ath-tests__card-draft" style={{ marginLeft: 8 }}>Borrador</span>}
          </h3>
          <button className="ath-tests-modal__close" onClick={onClose}>&times;</button>
        </div>

        {/* Edit mode */}
        {editing ? (
          <div className="ath-tests-modal__edit">
            <label className="ath-tests-single__context">
              <span>Descripción</span>
              <input type="text" value={editGoal} onChange={(e) => setEditGoal(e.target.value)} />
            </label>
            <label className="ath-tests-single__context">
              <span>Nota</span>
              <input type="text" value={editComments} onChange={(e) => setEditComments(e.target.value)} />
            </label>

            <div className="ath-tests-modal__edit-table">
              <div className="ath-tests-modal__edit-header">
                <span>#</span>
                <span>Lactato</span>
                <span>{usePace ? "Ritmo" : "Potencia"}</span>
                <span>FC</span>
                <span>Cad</span>
                <span>Dur (min)</span>
                <span>Desc (min)</span>
                <span></span>
              </div>
              {editRows.map((row, i) => (
                <div key={row.id || `new-${i}`} className="ath-tests-modal__edit-row">
                  <span className="ath-tests-form__idx">{row.order_index}</span>
                  <input type="text" value={row.lactate} onChange={(e) => updateEditRow(i, "lactate", e.target.value)} placeholder="mmol" />
                  {usePace ? (
                    <input type="text" value={row.pace} onChange={(e) => updateEditRow(i, "pace", e.target.value)} placeholder="5:00" />
                  ) : (
                    <input type="text" value={row.power} onChange={(e) => updateEditRow(i, "power", e.target.value)} placeholder="W" />
                  )}
                  <input type="text" value={row.hr} onChange={(e) => updateEditRow(i, "hr", e.target.value)} placeholder="bpm" />
                  <input type="text" value={row.cadence} onChange={(e) => updateEditRow(i, "cadence", e.target.value)} placeholder="cad" />
                  <input type="text" value={row.duration} onChange={(e) => updateEditRow(i, "duration", e.target.value)} placeholder="min" />
                  <input type="text" value={row.rest} onChange={(e) => updateEditRow(i, "rest", e.target.value)} placeholder="min" />
                  <button type="button" className="ath-tests-form__remove" onClick={() => removeEditRow(i)} title="Quitar">&times;</button>
                </div>
              ))}
            </div>

            <button type="button" className="ath-tests-form__add" onClick={addEditRow} style={{ alignSelf: "flex-start", marginTop: 4 }}>
              + Punto
            </button>

            {error && <p className="ath-tests-error">{error}</p>}

            <div className="ath-tests-modal__edit-actions">
              <button className="ath-tests-form__submit" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button className="ath-tests-modal__edit-cancel" onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <ThresholdAnchorBanner anchorStatus={dv?.threshold_anchor_status} />

            {/* Curve */}
            <div className="ath-tests-modal__curve">
              <span className="ath-tests-modal__curve-label">{curveLabel}</span>
              <FullCurve points={curvePoints} thresholds={analysis.thresholds ?? []} hRefs={standardRefs} />
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

            {/* Action buttons */}
            <div className="ath-tests-modal__footer">
              <button className="ath-tests-modal__edit-btn" onClick={startEdit}>
                {isDraft ? "Completar borrador" : "Editar"}
              </button>
              {!confirmDelete ? (
                <button className="ath-tests-modal__delete-btn" onClick={() => setConfirmDelete(true)}>
                  Eliminar
                </button>
              ) : (
                <div className="ath-tests-modal__delete-confirm">
                  <span>Seguro?</span>
                  <button className="ath-tests-modal__delete-btn ath-tests-modal__delete-btn--confirm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                  <button className="ath-tests-modal__edit-cancel" onClick={() => setConfirmDelete(false)}>No</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SINGLE MEASUREMENT FORM — quick lactate during any workout
   ══════════════════════════════════════════════════════════════ */
function SingleMeasurementForm({ onCreated }: { onCreated: () => void }) {
  const { user, token } = useAthleteData();
  const [discipline, setDiscipline] = useState<Discipline>("running");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [context, setContext] = useState("");
  const [lactate, setLactate] = useState("");
  const [basalLactate, setBasalLactate] = useState("");
  const [pace, setPace] = useState("");
  const [power, setPower] = useState("");
  const [hr, setHr] = useState("");
  const [cadence, setCadence] = useState("");
  const [duration, setDuration] = useState("");
  const [zone, setZone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usePace = discipline !== "ciclismo";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const lac = parseFloat(lactate);
    if (isNaN(lac) || lac <= 0) {
      setError("Introduce el valor de lactato (mmol/L).");
      return;
    }

    const paceVal = usePace ? paceToSeconds(pace) : undefined;
    const powerVal = !usePace ? (parseFloat(power) || undefined) : undefined;
    const hrVal = parseInt(hr) || undefined;
    const cadenceVal = parseInt(cadence) || undefined;
    const durMin = parseFloat(duration);
    const durSeconds = !isNaN(durMin) && durMin > 0 ? Math.round(durMin * 60) : 300;
    const purpose = zone || "training_sample";

    // Auto-detect draft: lactate is required, everything else optional
    const isDraft = !paceVal && !powerVal && !hrVal && (!durMin || isNaN(durMin));

    // Basal interval if provided
    const basalLac = parseFloat(basalLactate);
    const basalInterval = !isNaN(basalLac) && basalLac > 0 ? [{
      order_index: 0,
      duration_seconds: 0,
      rest_seconds: 0,
      rest_type: "none" as const,
      purpose: "basal",
      notes: "Lactato basal",
      lactate_sample: {
        lactate_mmol: basalLac,
        sample_delay_seconds: 0,
        sample_timing_label: "basal",
      },
    }] : [];

    setSubmitting(true);
    try {
      await api.createSession(token, {
        athlete_id: user.athlete_id,
        performed_at: `${date}T10:00:00`,
        discipline,
        session_type: "training_lactate",
        goal: context || "Medición de lactato en entrenamiento",
        is_draft: isDraft,
        intervals: [...basalInterval, {
          order_index: 1,
          duration_seconds: durSeconds,
          rest_seconds: 0,
          rest_type: "none",
          heart_rate_avg: hrVal,
          cadence: cadenceVal,
          pace_seconds_per_km: discipline === "running" ? paceVal : undefined,
          power_watts: discipline === "ciclismo" ? powerVal : undefined,
          purpose,
          notes: note || undefined,
          lactate_sample: {
            lactate_mmol: lac,
            sample_delay_seconds: 30,
            sample_timing_label: "30s post",
            sampling_notes: note || undefined,
          },
        }],
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando la medición.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="ath-tests-form ath-tests-form--single" onSubmit={handleSubmit}>
      <h3>Medición rápida de lactato</h3>
      <p className="ath-tests-form__hint">
        Una sola muestra durante cualquier entrenamiento. Se añade a tu historial y alimenta tus umbrales dinámicos.
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
          <div className="ath-tests-form__date-row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <WeatherButton date={date} onWeatherFetched={(w) => setNote((prev) => prev ? `${prev} | Meteo: ${w}` : `Meteo: ${w}`)} />
          </div>
        </label>
      </div>

      <div className="ath-tests-single__main">
        <label className="ath-tests-single__field ath-tests-single__field--lac">
          <span>Lactato (mmol/L)</span>
          <input type="text" inputMode="decimal" placeholder="3.2" value={lactate} onChange={(e) => setLactate(e.target.value)} autoFocus />
        </label>
        <label className="ath-tests-single__field">
          <span>Zona / contexto</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Seleccionar</option>
            <option value="BASE">Base / Z1-Z2</option>
            <option value="TEMPO">Tempo</option>
            <option value="LT1">Umbral LT1</option>
            <option value="LT2">Umbral LT2</option>
            <option value="VO2">VO2max</option>
            <option value="ANC">Anaeróbico</option>
            <option value="REC">Recuperación</option>
            <option value="warmup">Calentamiento</option>
            <option value="cooldown">Vuelta a la calma</option>
          </select>
        </label>
      </div>

      <div className="ath-tests-single__extra">
        {usePace ? (
          <label className="ath-tests-single__field">
            <span>Ritmo</span>
            <input type="text" placeholder="4:30" value={pace} onChange={(e) => setPace(e.target.value)} />
          </label>
        ) : (
          <label className="ath-tests-single__field">
            <span>Potencia (W)</span>
            <input type="text" placeholder="240" value={power} onChange={(e) => setPower(e.target.value)} />
          </label>
        )}
        <label className="ath-tests-single__field">
          <span>FC (bpm)</span>
          <input type="text" placeholder="155" value={hr} onChange={(e) => setHr(e.target.value)} />
        </label>
        <label className="ath-tests-single__field">
          <span>Duración (min)</span>
          <input type="text" placeholder="5" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
        <label className="ath-tests-single__field">
          <span>Cadencia</span>
          <input type="text" placeholder={discipline === "ciclismo" ? "90 rpm" : "180 ppm"} value={cadence} onChange={(e) => setCadence(e.target.value)} />
        </label>
      </div>

      <div className="ath-tests-form__basal">
        <label className="ath-tests-single__field">
          <span>Lactato basal (opcional)</span>
          <input type="text" inputMode="decimal" placeholder="0.9" value={basalLactate} onChange={(e) => setBasalLactate(e.target.value)} />
        </label>
      </div>

      <label className="ath-tests-single__context">
        <span>Descripción del entreno</span>
        <input type="text" placeholder="Ej: 4×4' LT2, muestra al final de la 3ª serie" value={context} onChange={(e) => setContext(e.target.value)} />
      </label>

      <label className="ath-tests-single__context">
        <span>Nota (opcional)</span>
        <input type="text" placeholder="Ej: viento, calor, fatiga del día anterior..." value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <p className="ath-tests-error">{error}</p>}

      <button type="submit" className="ath-tests-form__submit" disabled={submitting}>
        {submitting ? "Guardando..." : "Guardar medición"}
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════
   ALL-OUT SPRINT TEST FORM — for VLamax determination
   ══════════════════════════════════════════════════════════════ */
function AllOutForm({ onCreated }: { onCreated: () => void }) {
  const { user, token } = useAthleteData();
  const [discipline, setDiscipline] = useState<Discipline>("running");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState<"15" | "30">("30");
  const [load, setLoad] = useState(""); // pace, watts, or pace/100m
  const [hrMax, setHrMax] = useState("");
  const [hrAvg, setHrAvg] = useState("");
  const [cadence, setCadence] = useState("");
  const [lactate, setLactate] = useState("");
  const [basalLactate, setBasalLactate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLabel = discipline === "ciclismo" ? "Potencia (W)" : discipline === "natación" ? "Ritmo (/100m)" : "Ritmo (/km)";
  const loadPlaceholder = discipline === "ciclismo" ? "800" : discipline === "natación" ? "1:10" : "2:50";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const lac = parseFloat(lactate);
    if (isNaN(lac) || lac <= 0) {
      setError("Introduce el valor de lactato post-esfuerzo.");
      return;
    }

    const usePace = discipline !== "ciclismo";
    const paceVal = usePace ? paceToSeconds(load) : undefined;
    const powerVal = discipline === "ciclismo" ? (parseFloat(load) || undefined) : undefined;
    const hrMaxVal = parseInt(hrMax) || undefined;
    const hrAvgVal = parseInt(hrAvg) || undefined;
    const cadenceVal = parseInt(cadence) || undefined;
    const durSec = parseInt(duration);

    // Basal interval
    const basalLac = parseFloat(basalLactate);
    const basalInterval = !isNaN(basalLac) && basalLac > 0 ? [{
      order_index: 0,
      duration_seconds: 0,
      rest_seconds: 0,
      rest_type: "none" as const,
      purpose: "basal",
      notes: "Lactato basal",
      lactate_sample: {
        lactate_mmol: basalLac,
        sample_delay_seconds: 0,
        sample_timing_label: "basal",
      },
    }] : [];

    setSubmitting(true);
    try {
      await api.createSession(token, {
        athlete_id: user.athlete_id,
        performed_at: `${date}T10:00:00`,
        discipline,
        session_type: "allout_sprint",
        goal: `All-Out ${duration}" sprint — VLamax`,
        comments: note || undefined,
        is_draft: false,
        intervals: [...basalInterval, {
          order_index: 1,
          duration_seconds: durSec,
          rest_seconds: 0,
          rest_type: "none",
          heart_rate_avg: hrAvgVal,
          heart_rate_max: hrMaxVal,
          cadence: cadenceVal,
          pace_seconds_per_km: discipline === "running" ? paceVal : undefined,
          power_watts: discipline === "ciclismo" ? powerVal : undefined,
          purpose: "allout",
          notes: note || undefined,
          lactate_sample: {
            lactate_mmol: lac,
            sample_delay_seconds: 60,
            sample_timing_label: "1min post allout",
          },
        }],
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando el test.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="ath-tests-form ath-tests-form--single" onSubmit={handleSubmit}>
      <h3>Test All-Out Sprint</h3>
      <p className="ath-tests-form__hint">
        Esfuerzo máximo de {duration}" para determinar VLamax. Toma el lactato 1 minuto después del esfuerzo.
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
          <div className="ath-tests-form__date-row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <WeatherButton date={date} onWeatherFetched={(w) => setNote((prev) => prev ? `${prev} | Meteo: ${w}` : `Meteo: ${w}`)} />
          </div>
        </label>
      </div>

      {/* Duration selector */}
      <div className="ath-tests-form__duration-toggle">
        <span>Duración:</span>
        <button type="button" className={`ath-tests-form__dur-opt ${duration === "15" ? "active" : ""}`} onClick={() => setDuration("15")}>15"</button>
        <button type="button" className={`ath-tests-form__dur-opt ${duration === "30" ? "active" : ""}`} onClick={() => setDuration("30")}>30"</button>
      </div>

      <div className="ath-tests-single__main">
        <label className="ath-tests-single__field ath-tests-single__field--lac">
          <span>Lactato post (mmol/L)</span>
          <input type="text" inputMode="decimal" placeholder="12.5" value={lactate} onChange={(e) => setLactate(e.target.value)} autoFocus />
        </label>
        <label className="ath-tests-single__field">
          <span>{loadLabel}</span>
          <input type="text" placeholder={loadPlaceholder} value={load} onChange={(e) => setLoad(e.target.value)} />
        </label>
      </div>

      <div className="ath-tests-single__extra">
        <label className="ath-tests-single__field">
          <span>FC Máx (bpm)</span>
          <input type="text" placeholder="195" value={hrMax} onChange={(e) => setHrMax(e.target.value)} />
        </label>
        <label className="ath-tests-single__field">
          <span>FC Media (bpm)</span>
          <input type="text" placeholder="185" value={hrAvg} onChange={(e) => setHrAvg(e.target.value)} />
        </label>
        <label className="ath-tests-single__field">
          <span>Cadencia</span>
          <input type="text" placeholder={discipline === "ciclismo" ? "120 rpm" : "200 ppm"} value={cadence} onChange={(e) => setCadence(e.target.value)} />
        </label>
      </div>

      <div className="ath-tests-form__basal">
        <label className="ath-tests-single__field">
          <span>Lactato basal (opcional)</span>
          <input type="text" inputMode="decimal" placeholder="0.9" value={basalLactate} onChange={(e) => setBasalLactate(e.target.value)} />
        </label>
      </div>

      <label className="ath-tests-single__context">
        <span>Nota (opcional)</span>
        <input type="text" placeholder="Ej: sprint en pista, viento a favor..." value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <p className="ath-tests-error">{error}</p>}

      <button type="submit" className="ath-tests-form__submit" disabled={submitting}>
        {submitting ? "Guardando..." : "Guardar All-Out"}
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════
   MANUAL TEST FORM — incremental lactate test
   ══════════════════════════════════════════════════════════════ */
function ManualTestForm({ onCreated }: { onCreated: () => void }) {
  const { user, token } = useAthleteData();
  const [discipline, setDiscipline] = useState<Discipline>("running");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<StepRow[]>([
    { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW },
  ]);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("min");
  const [context, setContext] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(true); // Always show duration/pace/HR
  const [basalLactate, setBasalLactate] = useState("");

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

  async function handleSubmit(e: React.FormEvent, forceDraft = false) {
    e.preventDefault();
    setError(null);

    const rowsWithLactate = rows.filter((r) => {
      const lac = parseFloat(r.lactate);
      return !isNaN(lac) && lac > 0;
    });

    if (rowsWithLactate.length < 1) {
      setError("Necesitas al menos 1 punto con lactato.");
      return;
    }

    const intervals = rows
      .map((r, i) => {
        const lac = parseFloat(r.lactate);
        if (isNaN(lac) || lac <= 0) return null;
        const rawDur = parseFloat(r.duration_min);
        const hr = parseInt(r.hr) || undefined;
        const hrMax = parseInt(r.hr_max) || undefined;
        const cadenceVal = parseInt(r.cadence) || undefined;
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
          cadence: cadenceVal,
          pace_seconds_per_km: discipline === "running" ? paceVal : undefined,
          power_watts: discipline === "ciclismo" ? powerVal : undefined,
          purpose,
          notes: [r.note, r.feeling ? `RPE:${r.feeling}` : ""].filter(Boolean).join(" ") || undefined,
          lactate_sample: {
            lactate_mmol: lac,
            sample_delay_seconds: 30,
            sample_timing_label: "30s post",
            sampling_notes: r.note || undefined,
          },
        };
      })
      .filter(Boolean);

    // Auto-detect draft: <3 points or no pace/power/HR → draft
    const hasPerformanceData = rows.some((r) => r.pace || r.power || r.hr);
    const isDraft = forceDraft || !hasPerformanceData || rowsWithLactate.length < 3;

    // Build basal interval if basalLactate is set
    const basalLac = parseFloat(basalLactate);
    const basalInterval = !isNaN(basalLac) && basalLac > 0 ? [{
      order_index: 0,
      duration_seconds: 0,
      rest_seconds: 0,
      rest_type: "none" as const,
      purpose: "basal",
      notes: "Lactato basal",
      lactate_sample: {
        lactate_mmol: basalLac,
        sample_delay_seconds: 0,
        sample_timing_label: "basal",
        sampling_notes: "Lactato basal en reposo",
      },
    }] : [];

    setSubmitting(true);
    try {
      await api.createSession(token, {
        athlete_id: user.athlete_id,
        performed_at: `${date}T10:00:00`,
        discipline,
        session_type: "lactate_test",
        goal: context || (rows.some((r) => r.zone_tag) ? `Lactato: ${rows.filter((r) => r.zone_tag).map((r) => r.zone_tag).join(", ")}` : "Test de lactato"),
        comments: sessionNote || undefined,
        is_draft: isDraft,
        intervals: [...basalInterval, ...intervals],
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
          <div className="ath-tests-form__date-row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <WeatherButton date={date} onWeatherFetched={(w) => setSessionNote((prev) => prev ? `${prev} | Meteo: ${w}` : `Meteo: ${w}`)} />
          </div>
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
                <input type="text" placeholder="Cad." value={row.cadence} onChange={(e) => updateRow(i, "cadence", e.target.value)} className="ath-tests-form__input ath-tests-form__input--sm" />
                <div className="ath-tests-form__feeling">
                  {FEELING_OPTIONS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={`ath-tests-form__feeling-btn ${row.feeling === f.value ? "active" : ""}`}
                      onClick={() => updateRow(i, "feeling", row.feeling === f.value ? "" : f.value)}
                      title={f.label}
                    >
                      {f.emoji}
                    </button>
                  ))}
                </div>
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
      </div>

      {/* Lactato basal */}
      <div className="ath-tests-form__basal">
        <label className="ath-tests-single__field">
          <span>Lactato basal (opcional)</span>
          <input type="text" inputMode="decimal" placeholder="0.9" value={basalLactate} onChange={(e) => setBasalLactate(e.target.value)} />
        </label>
      </div>

      <label className="ath-tests-single__context">
        <span>Descripción del entreno</span>
        <input type="text" placeholder="Ej: Test incremental 5x4' con 1' rec" value={context} onChange={(e) => setContext(e.target.value)} />
      </label>
      <label className="ath-tests-single__context">
        <span>Nota (opcional)</span>
        <input type="text" placeholder="Ej: viento, calor, fatiga del día anterior..." value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} />
      </label>

      {error && <p className="ath-tests-error">{error}</p>}

      <div className="ath-tests-form__submit-group">
        <button type="submit" className="ath-tests-form__submit" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar y analizar"}
        </button>
        <button type="button" className="ath-tests-form__submit ath-tests-form__submit--draft" disabled={submitting} onClick={(e) => handleSubmit(e as any, true)}>
          Guardar borrador
        </button>
      </div>
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
  title: string;
  items: string[];
};

const CONSIDERATION_SECTIONS: ConsiderationSection[] = [
  {
    title: "Objetivo del test",
    items: [
      "El test de lactato mide el desarrollo de tus sistemas energéticos: aeróbico (VO2max) y anaeróbico (VLamax). No es solo un número de umbral — es un perfil completo de tu condicionamiento.",
      "La curva de lactato revela tres cosas clave: la resistencia aeróbica (velocidad a 4 mmol), la capacidad anaeróbica (lactato máximo) y la pendiente de la curva (interacción entre ambos sistemas). Cuanto más plana sea la curva, mejor.",
      "Es un ciclo continuo: medir, evaluar, planificar, entrenar y repetir. Cada test te acerca a tu mejor rendimiento.",
    ],
  },
  {
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
    title: "Protocolo ciclismo",
    items: [
      "Usa rodillo o un tramo plano sin semáforos. La potencia constante es clave — más fácil de controlar que el ritmo en running.",
      "Escalones de 4-5 minutos subiendo 20-30W por paso. Empieza al 50-60% de tu FTP estimado.",
      "Registra potencia media Y frecuencia cardíaca de cada paso. Ambos son necesarios para la interpretación completa.",
      "Para ciclismo indoor: mantén la cadencia constante (85-95 rpm) en todos los pasos.",
    ],
  },
  {
    title: "Protocolo natacion",
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
    title: "Interpretacion",
    items: [
      "El lactato NO es un producto de desecho. Es incoloro, inodoro e inocuo. Es un combustible que tu sistema aeróbico utiliza.",
      "Una curva más plana = mejor equilibrio entre sistemas. Significa que tu sistema aeróbico absorbe bien el lactato producido por el anaeróbico.",
      "Si el LT2 sube (más rápido al mismo lactato) pero el lactato máximo baja → tu sistema anaeróbico se está reduciendo. Bien para distancia, mal para velocidad.",
      "Si ambos suben → mejora general. El escenario ideal para cualquier atleta de resistencia.",
      "Dos atletas con el mismo umbral pueden necesitar entrenamientos completamente diferentes. Lo que importa es qué combinación de VO2max y VLamax produce ese umbral.",
      "Test, evaluar resultado, ajustar plan, entrenar, re-testar. Es un ciclo continuo hacia tu mejor rendimiento.",
    ],
  },
];

function TestConsiderations({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <>
      <button
        type="button"
        className="ath-tests__considerations-btn"
        onClick={onToggle}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        Consideraciones para tests
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: "auto", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="ath-tests-considerations">
          <p className="ath-tests-considerations__subtitle">
            Guia practica para obtener tests fiables y comparables
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
      )}
    </>
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

/* ── Threshold curve modal with interactive tooltips ── */
type CurvePointFull = {
  x: number;
  y: number;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  heart_rate?: number | null;
  raw_lactate?: number;
  order_index?: number;
  session_date?: string;
};

type DateFilterKey = "all" | "30d" | "90d" | "custom";
const DATE_FILTERS: { key: DateFilterKey; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "30d", label: "Último mes" },
  { key: "90d", label: "3 meses" },
  { key: "custom", label: "Personalizado" },
];

function ThresholdCurveModal({ rawCurvePoints, points: externalPoints, lt1X, lt2X, discipline, lt1Label, lt2Label, showLt1, showLt2, onClose }: {
  rawCurvePoints?: CurvePoint[];
  points?: CurvePointFull[];
  lt1X: number | null;
  lt2X: number | null;
  discipline: string;
  lt1Label: string;
  lt2Label: string;
  showLt1: DynamicReference | null;
  showLt2: DynamicReference | null;
  onClose: () => void;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const svgRef = React.useRef<SVGSVGElement>(null);

  const usePace = discipline === "running" || discipline === "natación";

  // If rawCurvePoints provided (accumulated curve), apply date filtering and convert
  const hasRaw = rawCurvePoints && rawCurvePoints.length > 0;
  const filteredRaw = useMemo(() => {
    if (!hasRaw) return [];
    let pts = rawCurvePoints!;
    const now = new Date();
    if (dateFilter === "30d") {
      const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      pts = pts.filter((p) => (p.session_date ?? "") >= cutoff);
    } else if (dateFilter === "90d") {
      const cutoff = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
      pts = pts.filter((p) => (p.session_date ?? "") >= cutoff);
    } else if (dateFilter === "custom") {
      if (customFrom) pts = pts.filter((p) => (p.session_date ?? "") >= customFrom);
      if (customTo) pts = pts.filter((p) => (p.session_date ?? "") <= customTo);
    }
    return pts;
  }, [hasRaw, rawCurvePoints, dateFilter, customFrom, customTo]);

  const points: CurvePointFull[] = useMemo(() => {
    if (hasRaw) {
      const sorted = [...filteredRaw].sort((a, b) => usePace ? b.x - a.x : a.x - b.x);
      return sorted.map((p, i) => ({
        x: p.x,
        y: p.contextual_lactate ?? p.lactate,
        raw_lactate: p.lactate,
        heart_rate: undefined,
        order_index: i + 1,
        session_date: p.session_date,
      }));
    }
    return externalPoints ?? [];
  }, [hasRaw, filteredRaw, externalPoints, usePace]);

  // Unique session dates for display
  const uniqueDates = useMemo(() => {
    if (!hasRaw) return [];
    const dates = new Set(rawCurvePoints!.map((p) => p.session_date).filter(Boolean));
    return [...dates].sort();
  }, [hasRaw, rawCurvePoints]);

  if (points.length < 2) return (
    <div className="ath-curve-modal__overlay" onClick={onClose}>
      <div className="ath-curve-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ath-curve-modal__header">
          <h3>{discipline}</h3>
          <button className="ath-curve-modal__close" onClick={onClose}>✕</button>
        </div>
        {hasRaw && (
          <div className="ath-curve-modal__date-filters">
            {DATE_FILTERS.map((f) => (
              <button key={f.key} type="button" className={`ath-curve-modal__date-pill ${dateFilter === f.key ? "active" : ""}`} onClick={() => setDateFilter(f.key)}>{f.label}</button>
            ))}
          </div>
        )}
        <p style={{ padding: "24px 16px", color: "var(--ath-text-muted, #888)", fontSize: "0.9rem" }}>
          No hay suficientes puntos en este rango de fechas.
        </p>
      </div>
    </div>
  );

  const W = 520, H = 280;
  const pad = { t: 28, r: 24, b: 44, l: 50 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = 0, maxY = Math.max(...ys) * 1.15;
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

  // Pace axis: invert so slow pace (high value) is on left, fast (low) on right
  const sx = (x: number) => {
    const nx = usePace ? 1 - (x - minX) / rangeX : (x - minX) / rangeX;
    return pad.l + nx * plotW;
  };
  const sy = (y: number) => pad.t + plotH - ((y - minY) / rangeY) * plotH;

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const areaD = d + ` L${sx(points[points.length - 1].x).toFixed(1)},${sy(0).toFixed(1)} L${sx(points[0].x).toFixed(1)},${sy(0).toFixed(1)} Z`;

  const yTicks: number[] = [];
  const step = maxY > 8 ? 2 : maxY > 4 ? 1 : 0.5;
  for (let v = 0; v <= maxY; v += step) yTicks.push(v);

  const formatX = (x: number) => usePace ? secondsToPace(x) + "/km" : Math.round(x) + "W";

  // Find nearest point based on mouse position in SVG coordinates
  function handleSvgMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = -1;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(sx(points[i].x) - mouseX);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    // Only highlight if mouse is within ~30px of plot area
    const mouseY = ((e.clientY - rect.top) / rect.height) * H;
    if (closest >= 0 && minDist < 30 && mouseY >= pad.t - 10 && mouseY <= H - pad.b + 20) {
      setHoveredIdx(closest);
    } else {
      setHoveredIdx(null);
    }
  }

  const hp = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="ath-curve-modal__overlay" onClick={onClose}>
      <div className="ath-curve-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ath-curve-modal__header">
          <h3>{discipline}</h3>
          <button className="ath-curve-modal__close" onClick={onClose}>✕</button>
        </div>

        {/* Date filter pills */}
        {hasRaw && (
          <div className="ath-curve-modal__date-filters">
            {DATE_FILTERS.map((f) => (
              <button key={f.key} type="button" className={`ath-curve-modal__date-pill ${dateFilter === f.key ? "active" : ""}`} onClick={() => setDateFilter(f.key)}>{f.label}</button>
            ))}
            {dateFilter === "custom" && (
              <div className="ath-curve-modal__date-custom">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} max={customTo || undefined} />
                <span>—</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} min={customFrom || undefined} />
              </div>
            )}
            <span className="ath-curve-modal__date-count">
              {points.length} puntos{uniqueDates.length > 0 ? ` · ${uniqueDates.length} sesiones` : ""}
            </span>
          </div>
        )}

        {/* Threshold summary */}
        <div className="ath-curve-modal__thresholds">
          <span style={{ color: "#22c55e", fontWeight: 600 }}>{lt1Label}: {formatRef(showLt1, discipline)}</span>
          {showLt1?.estimated_hr_at_target && <span style={{ color: "#22c55e" }}>{Math.round(showLt1.estimated_hr_at_target)} bpm</span>}
          <span style={{ color: "#f97316", fontWeight: 600, marginLeft: 16 }}>{lt2Label}: {formatRef(showLt2, discipline)}</span>
          {showLt2?.estimated_hr_at_target && <span style={{ color: "#f97316" }}>{Math.round(showLt2.estimated_hr_at_target)} bpm</span>}
        </div>

        {/* Chart */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="ath-curve-modal__svg"
          onMouseMove={handleSvgMove}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* Grid */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.l} y1={sy(v)} x2={W - pad.r} y2={sy(v)} stroke="#e5e7eb" strokeWidth="0.5" />
              <text x={pad.l - 6} y={sy(v) + 3} textAnchor="end" fill="#9ca3af" fontSize="10">{v.toFixed(v % 1 ? 1 : 0)}</text>
            </g>
          ))}
          <text x={pad.l - 6} y={pad.t - 8} textAnchor="end" fill="#9ca3af" fontSize="9">mmol/L</text>

          {/* Area + line */}
          <path d={areaD} fill="var(--ath-accent, #d26a36)" opacity="0.08" />
          <path d={d} fill="none" stroke="var(--ath-accent, #d26a36)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* LT1/LT2 lines */}
          {lt1X != null && lt1X >= minX && lt1X <= maxX && (
            <g>
              <line x1={sx(lt1X)} y1={pad.t} x2={sx(lt1X)} y2={H - pad.b} stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5 3" />
              <text x={sx(lt1X)} y={pad.t - 6} textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="700">LT1</text>
            </g>
          )}
          {lt2X != null && lt2X >= minX && lt2X <= maxX && (
            <g>
              <line x1={sx(lt2X)} y1={pad.t} x2={sx(lt2X)} y2={H - pad.b} stroke="#f97316" strokeWidth="1.5" strokeDasharray="5 3" />
              <text x={sx(lt2X)} y={pad.t - 6} textAnchor="middle" fill="#f97316" fontSize="11" fontWeight="700">LT2</text>
            </g>
          )}

          {/* Points */}
          {points.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={hoveredIdx === i ? 7 : 5} fill={hoveredIdx === i ? "var(--ath-accent, #d26a36)" : "#fff"} stroke="var(--ath-accent, #d26a36)" strokeWidth="2" style={{ pointerEvents: "none" }} />
          ))}

          {/* Hover vertical line + inline tooltip */}
          {hp && (
            <g style={{ pointerEvents: "none" }}>
              <line x1={sx(hp.x)} y1={pad.t} x2={sx(hp.x)} y2={H - pad.b} stroke="var(--ath-accent, #d26a36)" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
              {/* Tooltip box inside SVG */}
              {(() => {
                const tx = sx(hp.x);
                const ty = sy(hp.y);
                const hasDate = !!hp.session_date;
                const boxW = 140, boxH = (hp.heart_rate != null ? 52 : 40) + (hasDate ? 12 : 0);
                // Position: prefer right of point, flip if near edge
                const bx = tx + 12 + boxW > W - pad.r ? tx - 12 - boxW : tx + 12;
                const by = Math.max(pad.t, Math.min(ty - boxH / 2, H - pad.b - boxH));
                return (
                  <g>
                    <rect x={bx} y={by} width={boxW} height={boxH} rx="6" fill="white" stroke="#e5e7eb" strokeWidth="1" filter="url(#shadow)" />
                    <text x={bx + 8} y={by + 14} fill="#1a1a1a" fontSize="10" fontWeight="700">
                      {hp.y.toFixed(2)} mmol/L
                    </text>
                    <text x={bx + 8} y={by + 28} fill="#6b7280" fontSize="9">
                      {usePace ? "Ritmo" : "Potencia"}: {formatX(hp.x)}
                    </text>
                    {hp.heart_rate != null && (
                      <text x={bx + 8} y={by + 42} fill="#6b7280" fontSize="9">
                        FC: {Math.round(hp.heart_rate!)} bpm
                      </text>
                    )}
                    {hasDate && (
                      <text x={bx + 8} y={by + boxH - 4} fill="#9ca3af" fontSize="8">
                        {formatDate(hp.session_date!)}
                      </text>
                    )}
                  </g>
                );
              })()}
            </g>
          )}

          {/* X axis labels */}
          {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 7)) === 0 || i === points.length - 1).map((p, i) => (
            <text key={i} x={sx(p.x)} y={H - pad.b + 16} textAnchor="middle" fill="#9ca3af" fontSize="9">
              {formatX(p.x)}
            </text>
          ))}
          <text x={pad.l + plotW / 2} y={H - 4} textAnchor="middle" fill="#9ca3af" fontSize="9">
            {usePace ? "Ritmo" : "Potencia"}
          </text>

          {/* SVG filter for tooltip shadow */}
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12" />
            </filter>
          </defs>
        </svg>

        {/* Points table */}
        <div className="ath-curve-modal__table-wrap">
          <table className="ath-curve-modal__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Lactato</th>
                <th>{usePace ? "Ritmo" : "Potencia"}</th>
                {hasRaw && <th>Fecha</th>}
                {!hasRaw && <th>FC</th>}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i} className={hoveredIdx === i ? "ath-curve-modal__table-row--active" : ""} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                  <td>{p.order_index ?? i + 1}</td>
                  <td>{p.y.toFixed(2)}</td>
                  <td>{formatX(p.x)}</td>
                  {hasRaw && <td style={{ fontSize: "0.8em", color: "var(--ath-text-muted, #888)" }}>{p.session_date ? formatDate(p.session_date) : "—"}</td>}
                  {!hasRaw && <td>{p.heart_rate != null ? Math.round(p.heart_rate) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Threshold progression helper (90d) ── */
type ThresholdProgress = { lt1Pct: number | null; lt2Pct: number | null };

function computeThresholdProgress(
  evolution: Record<string, Array<{ date: string; value?: number | null; unit: string }>> | undefined,
  discipline: string,
): ThresholdProgress {
  if (!evolution) return { lt1Pct: null, lt2Pct: null };
  const cutoff90d = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  function pctChange(points: Array<{ date: string; value?: number | null; unit: string }>): number | null {
    // Filter to last 90 days, need at least 2 points
    const valid = points.filter((p) => p.date >= cutoff90d && p.value != null && p.value > 0);
    if (valid.length < 2) return null;
    const sorted = [...valid].sort((a, b) => a.date.localeCompare(b.date));
    const oldest = sorted[0].value!;
    const newest = sorted[sorted.length - 1].value!;
    if (oldest === newest) return 0;
    const isPace = sorted[0].unit === "s/km";
    // For pace: lower = better, so improvement = (oldest - newest) / oldest
    // For power: higher = better, so improvement = (newest - oldest) / oldest
    if (isPace) return Math.round(((oldest - newest) / oldest) * 1000) / 10;
    return Math.round(((newest - oldest) / oldest) * 1000) / 10;
  }

  return {
    lt1Pct: pctChange(evolution["LT1"] ?? []),
    lt2Pct: pctChange(evolution["LT2"] ?? []),
  };
}

/* ── Current thresholds from latest lactate curve (per-session physiological) ── */
function CurrentThresholds({ disciplineViews, sessions, onSelectSession }: {
  disciplineViews: Record<string, DisciplineView>;
  sessions: SessionSummary[];
  onSelectSession: (id: number) => void;
}) {
  const [modalDisc, setModalDisc] = useState<string | null>(null);

  const entries = Object.values(disciplineViews)
    .filter((v) => v.thresholds?.length > 0)
    .map((v) => ({
      discipline: v.discipline,
      thresholds: v.thresholds,
      anchorStatus: v.threshold_anchor_status,
      snapshotDate: v.latest_snapshot_date,
      curveHistory: v.curve_history,
      dynamicThresholds: v.dynamic_thresholds,
      historicalEvolution: v.historical_evolution,
    }));

  if (entries.length === 0) return null;

  // Build modal data for selected discipline
  const modalEntry = modalDisc ? entries.find((e) => e.discipline === modalDisc) : null;
  let modalRawPoints: CurvePoint[] = [];
  let modalLt1X: number | null = null;
  let modalLt2X: number | null = null;
  let modalLt1Label = "LT1";
  let modalLt2Label = "LT2";
  let modalShowLt1: DynamicReference | null = null;
  let modalShowLt2: DynamicReference | null = null;

  if (modalEntry) {
    const disc = modalEntry.discipline;
    const usePace = disc === "running" || disc === "natación";
    const curveKey = usePace ? "pace" : "power";
    modalRawPoints = modalEntry.curveHistory?.[curveKey] ?? [];

    // LT1/LT2 from thresholds (physiological)
    const lt1 = modalEntry.thresholds.find((t) => t.name === "LT1");
    const lt2 = modalEntry.thresholds.find((t) => t.name === "LT2");
    modalLt1X = usePace ? (lt1?.pace_seconds_per_km ?? null) : (lt1?.power_watts ?? null);
    modalLt2X = usePace ? (lt2?.pace_seconds_per_km ?? null) : (lt2?.power_watts ?? null);

    // Use dynamic thresholds for the summary line if available
    const acute = modalEntry.dynamicThresholds?.acute;
    const lt1Dyn = acute?.practical_lt1 ?? acute?.reference_2mmol ?? null;
    const lt2Dyn = acute?.practical_lt2 ?? acute?.reference_4mmol ?? null;
    modalShowLt1 = lt1Dyn ?? null;
    modalShowLt2 = lt2Dyn ?? null;
    modalLt1Label = acute?.practical_lt1 ? "LT1 práctico" : "LT1";
    modalLt2Label = acute?.practical_lt2 ? "LT2 práctico" : "LT2";
  }

  return (
    <div className="ath-tests-current">
      <h3 className="ath-tests-current__title">Tu curva de lactato</h3>
      <div className="ath-tests-current__grid">
        {entries.map(({ discipline, thresholds, anchorStatus, snapshotDate, curveHistory, historicalEvolution }) => {
          const lt1 = thresholds.find((t) => t.name === "LT1");
          const lt2 = thresholds.find((t) => t.name === "LT2");
          if (!lt1 && !lt2) return null;

          const usePace = discipline === "running" || discipline === "natación";
          const fmtPace = (s: number) => { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return `${m}:${String(sec).padStart(2, "0")}/km`; };
          const fmtVal = (th: Threshold) => {
            if (usePace && th.pace_seconds_per_km) return fmtPace(th.pace_seconds_per_km);
            if (th.power_watts) return `${Math.round(th.power_watts)} W`;
            if (th.heart_rate) return `${Math.round(th.heart_rate)} bpm`;
            return "—";
          };

          const avgConf = ((lt1?.confidence ?? 0) + (lt2?.confidence ?? 0)) / ((lt1 ? 1 : 0) + (lt2 ? 1 : 0));
          const confPct = Math.round(avgConf * 100);
          const confCls = confPct >= 70 ? "high" : confPct >= 50 ? "mid" : "low";

          const dateLabel = snapshotDate
            ? new Date(snapshotDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
            : null;

          // Check if we have enough curve data for modal
          const curveKey = usePace ? "pace" : "power";
          const hasCurve = (curveHistory?.[curveKey]?.length ?? 0) >= 2;

          // 90-day progression
          const progress = computeThresholdProgress(historicalEvolution, discipline);
          const hasProgress = progress.lt1Pct !== null || progress.lt2Pct !== null;

          return (
            <button
              key={discipline}
              type="button"
              className="ath-tests-current__card"
              onClick={() => hasCurve ? setModalDisc(discipline) : undefined}
              style={{ cursor: hasCurve ? "pointer" : "default" }}
            >
              <div className="ath-tests-current__info-col">
                <div className="ath-tests-current__disc">{discipline}</div>
                <div className="ath-tests-current__vals">
                  {lt1 && (
                    <span className="ath-tests-current__lt" style={{ color: "#22c55e" }}>
                      LT1: {fmtVal(lt1)}
                      {lt1.heart_rate ? ` · ${Math.round(lt1.heart_rate)} bpm` : ""}
                      {lt1.lactate ? ` · ${lt1.lactate.toFixed(1)} mmol` : ""}
                    </span>
                  )}
                  {lt2 && (
                    <span className="ath-tests-current__lt" style={{ color: "#f97316" }}>
                      LT2: {fmtVal(lt2)}
                      {lt2.heart_rate ? ` · ${Math.round(lt2.heart_rate)} bpm` : ""}
                      {lt2.lactate ? ` · ${lt2.lactate.toFixed(1)} mmol` : ""}
                    </span>
                  )}
                </div>
                {hasProgress && (
                  <div className="ath-tests-current__progress">
                    <span className="ath-tests-current__progress-label">3 meses:</span>
                    {progress.lt1Pct !== null && (
                      <span className={`ath-tests-current__progress-badge ${progress.lt1Pct > 0 ? "up" : progress.lt1Pct < 0 ? "down" : "flat"}`}>
                        LT1 {progress.lt1Pct > 0 ? "+" : ""}{progress.lt1Pct}%
                      </span>
                    )}
                    {progress.lt2Pct !== null && (
                      <span className={`ath-tests-current__progress-badge ${progress.lt2Pct > 0 ? "up" : progress.lt2Pct < 0 ? "down" : "flat"}`}>
                        LT2 {progress.lt2Pct > 0 ? "+" : ""}{progress.lt2Pct}%
                      </span>
                    )}
                  </div>
                )}
                <div className="ath-tests-current__meta">
                  <span className={`ath-tests-current__conf ath-tests-current__conf--${confCls}`}>
                    Confianza: {confPct}%
                  </span>
                  {dateLabel && <span className="ath-tests-current__info">{dateLabel}</span>}
                </div>
                {anchorStatus && (
                  <ThresholdAnchorBanner anchorStatus={anchorStatus} />
                )}
              </div>
              {hasCurve && (
                <svg className="ath-tests-current__expand-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {/* Accumulated curve modal */}
      {modalDisc && modalRawPoints.length >= 2 && (
        <ThresholdCurveModal
          rawCurvePoints={modalRawPoints}
          lt1X={modalLt1X}
          lt2X={modalLt2X}
          discipline={modalDisc}
          lt1Label={modalLt1Label}
          lt2Label={modalLt2Label}
          showLt1={modalShowLt1}
          showLt2={modalShowLt2}
          onClose={() => setModalDisc(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MY TESTS PAGE
   ══════════════════════════════════════════════════════════════ */
type TestFormMode = null | "incremental" | "single" | "allout";

export function MyTestsPage() {
  const { user, token, analysis } = useAthleteData();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<TestFormMode>(null);
  const [showConsiderations, setShowConsiderations] = useState(false);
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
    setShowForm(null);
    loadSessions();
  }

  return (
    <div className="ath-tests">
      <div className="ath-tests__head">
        <h2>Mis Tests</h2>
        <div className="ath-tests__new-group">
          {showForm ? (
            <button className="ath-tests__new-btn ath-tests__new-btn--cancel" onClick={() => setShowForm(null)}>
              Cancelar
            </button>
          ) : (
            <>
              <button className="ath-tests__new-btn" onClick={() => setShowForm("incremental")}>
                + Incrementos
              </button>
              <button className="ath-tests__new-btn ath-tests__new-btn--alt" onClick={() => setShowForm("single")}>
                + Medición rápida
              </button>
              <button className="ath-tests__new-btn ath-tests__new-btn--allout" onClick={() => setShowForm("allout")}>
                + All-Out
              </button>
            </>
          )}
        </div>
      </div>

      <CurrentThresholds disciplineViews={analysis?.discipline_views ?? {}} sessions={sessions} onSelectSession={setSelectedId} />

      {showForm === "incremental" && <ManualTestForm onCreated={handleCreated} />}
      {showForm === "single" && <SingleMeasurementForm onCreated={handleCreated} />}
      {showForm === "allout" && <AllOutForm onCreated={handleCreated} />}

      <TestConsiderations open={showConsiderations} onToggle={() => setShowConsiderations(!showConsiderations)} />

      {loading && <p className="ath-tests-loading">Cargando tests...</p>}

      {!loading && sessions.length === 0 && !showForm && (
        <div className="ath-tests-empty-state">
          <p>No tienes tests de lactato registrados.</p>
          <p>Crea un test incremental o añade una medición rápida de cualquier entrenamiento.</p>
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
                    {s.is_draft && <span className="ath-tests__card-draft">Borrador</span>}
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

      {selectedId != null && <TestDetail sessionId={selectedId} onClose={() => setSelectedId(null)} onDeleted={loadSessions} />}
    </div>
  );
}

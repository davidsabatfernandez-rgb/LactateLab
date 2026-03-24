import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAthleteData } from "../context/AthleteDataContext";
import { api } from "../../lib/api";
import type { TrainingLoadResponse, DailyTrainingLoad, AthleteHealthActivity, TrainingZoneSet, TrainingZoneItem } from "../../types";

/* ── Sport colors ── */
const SPORT_COLORS: Record<string, string> = {
  running: "#d26a36", trail_running: "#c2410c", ciclismo: "#3b82f6", cycling: "#3b82f6",
  natacion: "#06b6d4", swimming: "#06b6d4", lap_swimming: "#06b6d4",
  strength_training: "#8b5cf6", walking: "#22c55e", hiking: "#15803d",
  yoga: "#ec4899", other: "#6b7280",
};
function sportColor(type?: string | null, fallback?: string | null): string {
  if (fallback) return fallback;
  if (!type) return "#6b7280";
  return SPORT_COLORS[type.toLowerCase().replace(/\s+/g, "_")] || "#6b7280";
}

/* ── Helpers ── */
function fmtH(s: number) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; }
function fmtKm(m: number) { const k = m / 1000; return k >= 100 ? `${Math.round(k)}` : k.toFixed(1); }
function fmtDate(d: string) { return new Date(d + "T00:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric" }); }
function isToday(d: string) { return d === new Date().toISOString().slice(0, 10); }

/* ── Activity-count color scale (green / blue / dark) ── */
const ACT_COLORS = {
  0: "transparent",
  1: "#7cc576",   // green
  2: "#5ba4cf",   // blue
  3: "#4a4a4a",   // dark gray
};
function actCountColor(n: number): string {
  if (n <= 0) return ACT_COLORS[0];
  if (n === 1) return ACT_COLORS[1];
  if (n === 2) return ACT_COLORS[2];
  return ACT_COLORS[3];
}

/* ── Sparkline SVG ── */
function Sparkline({ data, color = "#d26a36", height = 32, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * width},${height - (v / max) * (height - 4) - 2}`).join(" ");
  const area = pts + ` ${width},${height} 0,${height}`;
  const gradId = `sg-${color.replace("#", "")}-${width}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="fit-spark">
      <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Explainer modal content ── */
type ExplainerInfo = { title: string; facts: string[]; why: string; improve: string };

const EXPLAINERS: Record<string, ExplainerInfo> = {
  duration: { title: "Tiempo total", facts: ["Suma de tiempo en movimiento de todas las actividades del mes.", "No incluye pausas ni tiempo detenido."], why: "Te indica tu volumen total de entrenamiento. Un aumento gradual (~5-10%/semana) es clave para adaptaciones sin lesion.", improve: "Anade 10-15 minutos extra a tus sesiones largas cada semana. Prioriza consistencia sobre volumen puntual." },
  distance: { title: "Distancia total", facts: ["Distancia acumulada en los ultimos 30 dias.", "Combina todas las disciplinas (running, ciclismo, natacion)."], why: "Es un indicador de carga mecanica. Un kilometro corriendo tiene mas impacto que uno en bici.", improve: "Si quieres aumentar km, hazlo con sesiones faciles en Z1-Z2. No sumes distancia a sesiones de alta intensidad." },
  activities: { title: "Actividades", facts: ["Numero total de sesiones registradas.", "Incluye todas las disciplinas y tipos."], why: "La frecuencia de entrenamiento es el predictor mas fuerte de progreso a largo plazo. 4-6 sesiones/semana es el rango optimo para la mayoria.", improve: "Si entrenas menos de 4 veces/semana, anade una sesion corta de baja intensidad. Si ya pasas de 6, prioriza calidad sobre cantidad." },
  active_days: { title: "Dias activos", facts: ["Dias del mes con al menos una actividad registrada.", "No cuenta el tipo ni la duracion."], why: "Es una medida de consistencia. Mejor 5 dias de 45 min que 2 dias de 2 horas.", improve: "Apunta a tener al menos 1 dia de descanso completo por semana. Los dias de recuperacion activa (yoga, caminata) cuentan." },
  tss_weekly: { title: "TSS semanal", facts: ["Training Stress Score: combina duracion e intensidad.", "Un TSS de 100 equivale a ~1 hora al umbral funcional.", "Se calcula a partir de potencia, ritmo o frecuencia cardiaca."], why: "Es la metrica mas completa para medir carga de entrenamiento. Te permite comparar sesiones de diferente tipo y duracion.", improve: "Aumenta el TSS semanal un maximo del 5-10% por semana. Si superas 800 TSS/semana sin estar adaptado, el riesgo de sobreentrenamiento aumenta." },
  tss_daily: { title: "TSS diario medio", facts: ["Media del TSS de los ultimos 30 dias.", "Incluye dias de descanso (TSS = 0)."], why: "Refleja tu carga cronica diaria. Un TSS diario medio de 50-80 es tipico de atletas recreativos bien entrenados.", improve: "Para aumentarlo de forma segura, anade una sesion extra de baja intensidad en lugar de aumentar la intensidad de las existentes." },
  trimp: { title: "Carga cardiaca (TRIMP)", facts: ["Training Impulse: mide la carga basada en la frecuencia cardiaca.", "Usa el modelo de Banister: duracion x intensidad relativa x factor exponencial.", "Mas sensible a sesiones de alta intensidad que el TSS."], why: "Es la mejor metrica cuando no tienes potenciometro. Refleja el estres cardiovascular real de cada sesion.", improve: "Si tu TRIMP es alto pero tu TSS es bajo, estas haciendo mucho trabajo cardiaco sin suficiente produccion mecanica. Mejora tu eficiencia aerobica con sesiones en Z2." },
  acwr: { title: "ACWR (Ratio Agudo:Cronico)", facts: ["Ratio entre la carga de los ultimos 7 dias (aguda) y los ultimos 42 dias (cronica).", "Optimo: 0.80 - 1.30", "Por encima de 1.50: alto riesgo de lesion."], why: "Es el indicador mas validado para predecir riesgo de lesion por sobrecarga. Desarrollado por Tim Gabbett (2016).", improve: "Si tu ACWR esta por encima de 1.3, reduce la carga esta semana. Si esta por debajo de 0.8, tu fitness se esta deteriorando - aumenta gradualmente." },
  tsb: { title: "TSB - Forma (Training Stress Balance)", facts: ["TSB = Fitness (CTL) - Fatiga (ATL).", "Positivo = forma buena, estas descansado.", "Negativo = estas acumulando fatiga (necesario para mejorar)."], why: "Te dice si estas en forma para competir o si necesitas recuperar. Para rendir en carrera, busca un TSB de +10 a +25.", improve: "Para mejorar el TSB antes de una carrera, reduce el volumen un 30-40% durante 7-14 dias (taper). Para entrenar, un TSB de -10 a -20 es funcional." },
  cardio_focus: { title: "Foco cardiovascular", facts: ["Distribucion del tiempo de entrenamiento por zonas de frecuencia cardiaca.", "Polarizado: ~80% baja intensidad + ~20% alta. Es el modelo mas eficiente.", "Umbral: mucho tiempo en zonas medias, genera mas fatiga con menos adaptacion."], why: "La distribucion de intensidad determina el tipo de adaptaciones que obtienes. Los mejores atletas de resistencia usan un modelo polarizado.", improve: "Haz el 80% de tus sesiones a una intensidad conversacional y el 20% a alta intensidad. Evita la zona gris excepto en sesiones especificas de umbral." },
};

function ExplainerModal({ metricKey, onClose }: { metricKey: string; onClose: () => void }) {
  const info = EXPLAINERS[metricKey];
  if (!info) return null;
  return (
    <div className="fit-modal-backdrop" onClick={onClose}>
      <div className="fit-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fit-modal-close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <h3 className="fit-modal-title">{info.title}</h3>
        <div className="fit-modal-section">
          <h4>Datos</h4>
          <ul>{info.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
        <div className="fit-modal-section">
          <h4>Por que importa</h4>
          <p>{info.why}</p>
        </div>
        <div className="fit-modal-section fit-modal-section--tip">
          <h4>Como mejorar</h4>
          <p>{info.improve}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Zone/ACWR/TSB labels ── */
function acwrZone(v: number | null | undefined) {
  if (!v || v <= 0) return { label: "Sin datos", tone: "muted" };
  if (v < 0.8) return { label: "Infracarga", tone: "blue" };
  if (v <= 1.3) return { label: "Optimo", tone: "green" };
  if (v <= 1.5) return { label: "Peligro", tone: "amber" };
  return { label: "Alto riesgo", tone: "red" };
}
function tsbZone(v: number | null | undefined) {
  if (v == null) return { label: "Sin datos", tone: "muted" };
  if (v > 25) return { label: "Fresco", tone: "blue" };
  if (v > 5) return { label: "Buena forma", tone: "green" };
  if (v > -10) return { label: "Funcional", tone: "amber" };
  return { label: "Fatiga acumulada", tone: "red" };
}

/* ── Default fallback zones (Seiler 7-zone by %HRmax) ── */
const DEFAULT_ZONES: { label: string; color: string; hrPctLow: number; hrPctHigh: number }[] = [
  { label: "E1", color: "#94a3b8", hrPctLow: 0, hrPctHigh: 0.60 },
  { label: "E2", color: "#22c55e", hrPctLow: 0.60, hrPctHigh: 0.72 },
  { label: "LT1", color: "#15803d", hrPctLow: 0.72, hrPctHigh: 0.82 },
  { label: "Tempo", color: "#3b82f6", hrPctLow: 0.82, hrPctHigh: 0.87 },
  { label: "LT2", color: "#f59e0b", hrPctLow: 0.87, hrPctHigh: 0.92 },
  { label: "VO2max", color: "#ef4444", hrPctLow: 0.92, hrPctHigh: 0.97 },
  { label: "ANC", color: "#991b1b", hrPctLow: 0.97, hrPctHigh: 1.0 },
];

/* ── Clickable stat card ── */
function StatCard({ value, label, spark, color, tone, badge, metricKey, onExplain }: {
  value: string; label: string; spark?: number[]; color?: string; tone?: string; badge?: string;
  metricKey?: string; onExplain?: (k: string) => void;
}) {
  return (
    <div
      className={`fit-card ${tone ? `fit-card--${tone}` : ""} ${metricKey ? "fit-card--clickable" : ""}`}
      onClick={() => metricKey && onExplain?.(metricKey)}
    >
      <div className="fit-card__top">
        <span className="fit-card__value">{value}</span>
        {badge && <span className={`fit-card__badge fit-card__badge--${tone || "muted"}`}>{badge}</span>}
      </div>
      <span className="fit-card__label">{label}</span>
      {spark && spark.length > 1 && (
        <div className="fit-card__spark"><Sparkline data={spark} color={color || "#d26a36"} /></div>
      )}
      {metricKey && <span className="fit-card__info-hint">i</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export function FitnessPage() {
  const data = useAthleteData();
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const [trainingLoad, setTrainingLoad] = useState<TrainingLoadResponse | null>(null);
  const [loadingTL, setLoadingTL] = useState(false);
  const [explainer, setExplainer] = useState<string | null>(null);
  const [zoneSets, setZoneSets] = useState<TrainingZoneSet[]>([]);

  const effectiveActivities = useMemo<AthleteHealthActivity[]>(
    () => data.health?.recent_activities ?? [],
    [data.health],
  );
  const effectiveTL = trainingLoad;
  const hrMax = data.analysis?.athlete?.training_hr_max || 190;
  const hrRest = data.currentRestingHr || 55;

  /* Fetch training load */
  const fetchTL = useCallback(async () => {
    const id = data.user?.athlete_id;
    if (!id || !data.token) return;
    setLoadingTL(true);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
      setTrainingLoad(await api.trainingLoad(data.token, id, start, end) as TrainingLoadResponse);
    } catch { /* */ } finally { setLoadingTL(false); }
  }, [data.token, data.user?.athlete_id]);
  useEffect(() => { fetchTL(); }, [fetchTL]);

  /* Fetch athlete zone sets (all active) */
  useEffect(() => {
    const id = data.user?.athlete_id;
    if (!id || !data.token) return;
    const disciplines = ["running", "ciclismo", "natacion"];
    Promise.all(
      disciplines.map((d) =>
        api.activeTrainingZoneSet(data.token!, id, d).catch(() => null)
      )
    ).then((results) => {
      setZoneSets(results.filter(Boolean) as TrainingZoneSet[]);
    });
  }, [data.token, data.user?.athlete_id]);

  /* ── Build zone HR boundaries from athlete zones ── */
  const resolvedZones = useMemo(() => {
    // Try to find any active zone set with HR boundaries
    for (const zs of zoneSets) {
      if (zs.zones.length > 0 && zs.zones.some((z) => z.hr_lower != null || z.hr_upper != null)) {
        return zs.zones
          .slice()
          .sort((a, b) => a.zone_number - b.zone_number)
          .map((z) => ({
            label: z.zone_label,
            color: z.zone_color || DEFAULT_ZONES[Math.min(z.zone_number - 1, 6)]?.color || "#6b7280",
            hrLow: z.hr_lower ?? 0,
            hrHigh: z.hr_upper ?? 999,
          }));
      }
    }
    // Fallback to default zones using HRmax
    return DEFAULT_ZONES.map((z) => ({
      label: z.label,
      color: z.color,
      hrLow: Math.round(z.hrPctLow * hrMax),
      hrHigh: Math.round(z.hrPctHigh * hrMax),
    }));
  }, [zoneSets, hrMax]);

  const hasCustomZones = zoneSets.some((zs) => zs.zones.length > 0 && zs.zones.some((z) => z.hr_lower != null));

  /* ── Calendar — build per-day activity map ── */
  const actByDate = useMemo(() => {
    const map: Record<string, { count: number; sports: string[] }> = {};
    for (const a of effectiveActivities) {
      const ds = a.started_at?.slice(0, 10);
      if (!ds) continue;
      if (!map[ds]) map[ds] = { count: 0, sports: [] };
      map[ds].count++;
      const sport = a.sport_label || a.sport_type || "";
      if (sport && !map[ds].sports.includes(sport)) map[ds].sports.push(sport);
    }
    return map;
  }, [effectiveActivities]);

  /* ── Build month grids (current + previous month) ── */
  const calendarMonths = useMemo(() => {
    const now = new Date();
    const months: { year: number; month: number; label: string; days: { day: number; date: string; count: number; sports: string[]; isToday: boolean }[] }[] = [];
    for (let offset = -1; offset <= 0; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const label = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "") + " " + year;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
      const days: typeof months[0]["days"] = [];
      // Pad empty days
      for (let p = 0; p < firstDow; p++) days.push({ day: 0, date: "", count: 0, sports: [], isToday: false });
      const todayStr = now.toISOString().slice(0, 10);
      for (let dd = 1; dd <= daysInMonth; dd++) {
        const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        const info = actByDate[ds];
        days.push({ day: dd, date: ds, count: info?.count ?? 0, sports: info?.sports ?? [], isToday: ds === todayStr });
      }
      months.push({ year, month, label, days });
    }
    return months;
  }, [actByDate]);

  /* ── Monthly summary (30d) ── */
  const monthly = useMemo(() => {
    const cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recent = effectiveActivities.filter((a) => (a.started_at?.slice(0, 10) ?? "") >= cut);
    const dur = recent.reduce((s, a) => s + (a.moving_time_seconds || 0), 0);
    const dist = recent.reduce((s, a) => s + (a.distance_m || 0), 0);
    const count = recent.length;
    const days = new Set(recent.map((a) => a.started_at?.slice(0, 10))).size;
    const dailyDur: number[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      dailyDur.push(recent.filter((a) => a.started_at?.slice(0, 10) === ds).reduce((s, a) => s + (a.moving_time_seconds || 0), 0));
    }
    const bySport: Record<string, { label: string; color: string; dur: number; dist: number; count: number }> = {};
    for (const a of recent) {
      const k = a.sport_type || "other";
      if (!bySport[k]) bySport[k] = { label: a.sport_label || k, color: sportColor(a.sport_type, a.sport_color), dur: 0, dist: 0, count: 0 };
      bySport[k].dur += a.moving_time_seconds || 0; bySport[k].dist += a.distance_m || 0; bySport[k].count++;
    }
    return { dur, dist, count, days, dailyDur, bySport };
  }, [effectiveActivities]);

  /* ── Training load metrics ── */
  const load = useMemo(() => {
    if (!effectiveTL) return null;
    const d30 = effectiveTL.days.slice(-30);
    const d7 = effectiveTL.days.slice(-7);
    return {
      atl: effectiveTL.current_atl, ctl: effectiveTL.current_ctl, tsb: effectiveTL.current_tsb, acwr: effectiveTL.current_acwr,
      weekTss: d7.reduce((s, d) => s + d.tss_total, 0),
      avgTss: d30.length ? d30.reduce((s, d) => s + d.tss_total, 0) / d30.length : 0,
      tssSpark: d30.map((d) => d.tss_total),
      atlSpark: d30.map((d) => d.atl),
      ctlSpark: d30.map((d) => d.ctl),
      tsbSpark: d30.map((d) => d.tsb),
    };
  }, [effectiveTL]);

  /* ── Cardiac load (TRIMP) ── */
  const cardiac = useMemo(() => {
    const cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const cut7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const recent = effectiveActivities.filter((a) => (a.started_at?.slice(0, 10) ?? "") >= cut && a.average_heartrate);
    if (!recent.length) return null;
    let total = 0, week = 0;
    const dailyTrimp: number[] = Array(30).fill(0);
    const now = new Date();
    for (const a of recent) {
      const dur = (a.moving_time_seconds || 0) / 60;
      const ratio = Math.max(0, Math.min(1, ((a.average_heartrate || 0) - hrRest) / (hrMax - hrRest)));
      const trimp = dur * ratio * 0.64 * Math.exp(1.92 * ratio);
      total += trimp;
      if ((a.started_at?.slice(0, 10) ?? "") >= cut7) week += trimp;
      const aDate = a.started_at?.slice(0, 10) ?? "";
      for (let i = 0; i < 30; i++) {
        const d = new Date(now); d.setDate(d.getDate() - (29 - i));
        if (d.toISOString().slice(0, 10) === aDate) { dailyTrimp[i] += trimp; break; }
      }
    }
    const avg = total / 30;
    const tone = avg < 30 ? "blue" : avg < 60 ? "green" : avg < 100 ? "amber" : "red";
    const label = avg < 30 ? "Baja" : avg < 60 ? "Moderada" : avg < 100 ? "Alta" : "Muy alta";
    return { total: Math.round(total), week: Math.round(week), avg: Math.round(avg), tone, label, spark: dailyTrimp.map(Math.round) };
  }, [effectiveActivities, hrMax, hrRest]);

  /* ── HR Zone distribution using athlete's real zones ── */
  const zoneData = useMemo(() => {
    const cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recent = effectiveActivities.filter((a) => (a.started_at?.slice(0, 10) ?? "") >= cut && a.average_heartrate);
    if (!recent.length || !resolvedZones.length) return null;

    const zMins = resolvedZones.map(() => 0);
    for (const a of recent) {
      const hr = a.average_heartrate || 0;
      const dur = (a.moving_time_seconds || 0) / 60;
      // Estimate distribution around average HR using gaussian spread
      // 60% in avg zone, 20% in zone below, 20% in zone above
      let mainIdx = resolvedZones.findIndex((z) => hr >= z.hrLow && hr < z.hrHigh);
      if (mainIdx < 0) mainIdx = hr >= (resolvedZones[resolvedZones.length - 1]?.hrHigh ?? 999) ? resolvedZones.length - 1 : 0;
      zMins[mainIdx] += dur * 0.60;
      if (mainIdx > 0) zMins[mainIdx - 1] += dur * 0.20;
      else zMins[mainIdx] += dur * 0.20;
      if (mainIdx < resolvedZones.length - 1) zMins[mainIdx + 1] += dur * 0.20;
      else zMins[mainIdx] += dur * 0.20;
    }

    const tot = zMins.reduce((s, v) => s + v, 0);
    if (tot === 0) return null;
    const pcts = zMins.map((v) => Math.round((v / tot) * 100));

    // Classify: low intensity = zones below LT1 (first 2-3), threshold = middle, high = above LT2
    // Use zone labels to identify
    const lt1Idx = resolvedZones.findIndex((z) => /lt1/i.test(z.label));
    const lt2Idx = resolvedZones.findIndex((z) => /lt2/i.test(z.label));
    const lowEnd = lt1Idx >= 0 ? lt1Idx : Math.min(2, resolvedZones.length - 1);
    const highStart = lt2Idx >= 0 ? lt2Idx + 1 : Math.max(resolvedZones.length - 2, lowEnd + 1);

    const low = pcts.slice(0, lowEnd + 1).reduce((s, v) => s + v, 0);
    const thr = pcts.slice(lowEnd + 1, highStart).reduce((s, v) => s + v, 0);
    const high = pcts.slice(highStart).reduce((s, v) => s + v, 0);

    const mainLabel = low >= 75 ? "Aerobico base" : low >= 60 && high >= 15 ? "Polarizado" : thr >= 40 ? "Umbral" : high >= 25 ? "Alta intensidad" : "Mixto";
    const tone = low >= 75 ? "green" : low >= 60 ? "blue" : thr >= 40 ? "amber" : high >= 25 ? "red" : "muted";
    return { pcts, low, thr, high, label: mainLabel, tone };
  }, [effectiveActivities, resolvedZones]);

  /* ── Sport legend ── */
  const sportLegend = useMemo(() => {
    const map: Record<string, { label: string; color: string }> = {};
    for (const a of effectiveActivities) if (!map[a.sport_type]) map[a.sport_type] = { label: a.sport_label, color: sportColor(a.sport_type, a.sport_color) };
    return Object.values(map);
  }, [effectiveActivities]);

  const noData = !effectiveActivities.length && !loadingTL && !effectiveTL;

  const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <div className="ath-page ath-fitness">
      <div className="fit-header">
        <h1 className="fit-header__title">Fitness</h1>
        <p className="fit-header__sub">Ultimos 60 dias de actividad y carga</p>
      </div>

      {noData && (
        <div className="fit-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          <p>Conecta Garmin o registra actividades para ver tu fitness.</p>
        </div>
      )}

      {!noData && (<>
        {/* ═══ 1. Activity calendar (2 months) + Summary cards ═══ */}
        <div className="fit-top-row">
          <div className="fit-heatmap">
            <div className="fit-heatmap__months-row">
              {calendarMonths.map((m) => (
                <div key={m.label} className="fit-heatmap__month-block">
                  <span className="fit-heatmap__month-label">{m.label}</span>
                  <div className="fit-heatmap__weekdays">
                    {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
                  </div>
                  <div className="fit-heatmap__grid">
                    {m.days.map((day, i) => (
                      <div
                        key={i}
                        className={[
                          "fit-heatmap__cell",
                          day.day === 0 && "fit-heatmap__cell--empty",
                          day.isToday && "fit-heatmap__cell--today",
                          day.count > 0 && "fit-heatmap__cell--active",
                        ].filter(Boolean).join(" ")}
                        title={day.day > 0 ? `${fmtDate(day.date)} — ${day.count} actividad${day.count !== 1 ? "es" : ""}${day.sports.length ? ": " + day.sports.join(", ") : ""}` : ""}
                        style={day.count > 0 ? { background: actCountColor(day.count) } : undefined}
                      >
                        {day.day > 0 ? day.day : ""}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="fit-heatmap__legend">
              <span className="fit-heatmap__legend-item"><span className="fit-heatmap__legend-dot" style={{ background: ACT_COLORS[1] }} />1 actividad</span>
              <span className="fit-heatmap__legend-item"><span className="fit-heatmap__legend-dot" style={{ background: ACT_COLORS[2] }} />2 actividades</span>
              <span className="fit-heatmap__legend-item"><span className="fit-heatmap__legend-dot" style={{ background: ACT_COLORS[3] }} />3+ actividades</span>
            </div>
          </div>

          <div className="fit-summary-cards">
            <StatCard value={fmtH(monthly.dur)} label="Tiempo total" spark={monthly.dailyDur} color="#d26a36" metricKey="duration" onExplain={setExplainer} />
            <StatCard value={`${fmtKm(monthly.dist)} km`} label="Distancia" color="#3b82f6" metricKey="distance" onExplain={setExplainer} />
            <StatCard value={String(monthly.count)} label="Actividades" color="#22c55e" metricKey="activities" onExplain={setExplainer} />
            <StatCard value={String(monthly.days)} label="Dias activos" color="#8b5cf6" metricKey="active_days" onExplain={setExplainer} />
          </div>
        </div>

        {/* ═══ 2. Sport breakdown ═══ */}
        {Object.keys(monthly.bySport).length > 0 && (
          <div className="fit-breakdown">
            {Object.entries(monthly.bySport).sort((a, b) => b[1].dur - a[1].dur).map(([k, s]) => {
              const pct = monthly.dur > 0 ? Math.round((s.dur / monthly.dur) * 100) : 0;
              return (
                <div key={k} className="fit-breakdown__row">
                  <span className="fit-breakdown__dot" style={{ background: s.color }} />
                  <span className="fit-breakdown__name">{s.label}</span>
                  <span className="fit-breakdown__track"><span className="fit-breakdown__fill" style={{ width: `${pct}%`, background: s.color }} /></span>
                  <span className="fit-breakdown__meta">{fmtH(s.dur)} · {fmtKm(s.dist)} km</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ 3. Performance effort + Cardiac load ═══ */}
        {(load || cardiac) && (
          <div className="fit-metrics-row">
            {load && <StatCard value={String(Math.round(load.weekTss))} label="TSS semanal" spark={load.tssSpark} color="#d26a36" metricKey="tss_weekly" onExplain={setExplainer} />}
            {load && <StatCard value={String(Math.round(load.avgTss))} label="TSS/dia medio" spark={load.tssSpark} color="#f59e0b" metricKey="tss_daily" onExplain={setExplainer} />}
            {cardiac && <StatCard value={String(cardiac.avg)} label="TRIMP/dia" spark={cardiac.spark} color="#ef4444" tone={cardiac.tone} badge={cardiac.label} metricKey="trimp" onExplain={setExplainer} />}
          </div>
        )}

        {/* ═══ 4. RFC — ATL/CTL/ACWR/TSB ═══ */}
        {load && (
          <div className="fit-section">
            <h2 className="fit-section__title">Ratio fitness / carga</h2>
            <div className="fit-rfc-row">
              <div className="fit-card fit-card--wide">
                <div className="fit-rfc__bars">
                  <div className="fit-rfc__bar-group">
                    <span className="fit-rfc__label">Fatiga (ATL) <strong>{Math.round(load.atl)}</strong></span>
                    <div className="fit-rfc__track"><div className="fit-rfc__fill" style={{ width: `${Math.min((load.atl / Math.max(load.atl, load.ctl, 1)) * 100, 100)}%`, background: "#ef4444" }} /></div>
                  </div>
                  <div className="fit-rfc__bar-group">
                    <span className="fit-rfc__label">Fitness (CTL) <strong>{Math.round(load.ctl)}</strong></span>
                    <div className="fit-rfc__track"><div className="fit-rfc__fill" style={{ width: `${Math.min((load.ctl / Math.max(load.atl, load.ctl, 1)) * 100, 100)}%`, background: "#3b82f6" }} /></div>
                  </div>
                </div>
                <div className="fit-card__spark" style={{ marginTop: 8 }}>
                  <Sparkline data={load.ctlSpark} color="#3b82f6" width={180} />
                </div>
              </div>
              <StatCard
                value={load.acwr != null ? load.acwr.toFixed(2) : "-"} label="ACWR"
                tone={acwrZone(load.acwr).tone} badge={acwrZone(load.acwr).label}
                metricKey="acwr" onExplain={setExplainer}
              />
              <StatCard
                value={`${load.tsb > 0 ? "+" : ""}${Math.round(load.tsb)}`} label="TSB (Forma)"
                spark={load.tsbSpark} color="#22c55e"
                tone={tsbZone(load.tsb).tone} badge={tsbZone(load.tsb).label}
                metricKey="tsb" onExplain={setExplainer}
              />
            </div>
          </div>
        )}

        {/* ═══ 5. Cardiovascular focus — athlete zones ═══ */}
        {zoneData && (
          <div className="fit-section">
            <h2 className="fit-section__title" onClick={() => setExplainer("cardio_focus")} style={{ cursor: "pointer" }}>
              Foco cardiovascular <span className="fit-card__info-hint" style={{ position: "relative", top: -1 }}>i</span>
            </h2>
            <div className="fit-cardio-card">
              <div className="fit-cardio__head">
                <span className={`fit-cardio__label fit-cardio__label--${zoneData.tone}`}>{zoneData.label}</span>
                {!hasCustomZones && <span className="fit-cardio__note">Zonas estimadas por %FC max</span>}
                {hasCustomZones && <span className="fit-cardio__note fit-cardio__note--ok">Zonas personalizadas del atleta</span>}
              </div>
              <div className="fit-cardio__bar">
                {zoneData.pcts.map((p, i) => p > 0 ? (
                  <div key={i} className="fit-cardio__seg" style={{ width: `${p}%`, background: resolvedZones[i]?.color || "#6b7280" }} title={`${resolvedZones[i]?.label}: ${p}%`}>
                    {p >= 8 && <span>{p}%</span>}
                  </div>
                ) : null)}
              </div>
              <div className="fit-cardio__labels">
                {resolvedZones.map((z, i) => (
                  <span key={i} className="fit-cardio__label-item">
                    <span style={{ background: z.color }} className="fit-cardio__dot" />
                    {z.label}: {zoneData.pcts[i] || 0}%
                  </span>
                ))}
              </div>
              <div className="fit-cardio__polar">
                <div><strong>{zoneData.low}%</strong><span>Baja int.</span></div>
                <div><strong>{zoneData.thr}%</strong><span>Umbral</span></div>
                <div><strong>{zoneData.high}%</strong><span>Alta int.</span></div>
              </div>
            </div>
          </div>
        )}
      </>)}

      {loadingTL && <p className="fit-loading">Cargando metricas de carga...</p>}
      {explainer && <ExplainerModal metricKey={explainer} onClose={() => setExplainer(null)} />}
    </div>
  );
}

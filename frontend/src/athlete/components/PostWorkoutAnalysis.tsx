import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  Tooltip, ReferenceLine, ReferenceArea, Bar, BarChart, Cell,
  ScatterChart, Scatter, CartesianGrid, Brush,
} from "recharts";
import { api } from "../../lib/api";
import type { ResolvedTrainingThreshold } from "../../lib/trainingThresholds";
import type { AthleteHealthActivity, GarminActivity, PlanningPlannedSession, WorkoutStep } from "../../types";

/* ═══════════════════════════════════════════════════════════════
   Post-Workout Analysis — Full-Page Modal with Tabs
   Evidence: TrainingPeaks, Intervals.icu, Strava, WKO5, Uphill Athlete
   ═══════════════════════════════════════════════════════════════ */

/* ── Zone system ──────────────────────────────────────────────── */

const ZONE_COLORS: Record<string, string> = {
  Z1: "#58a6ff", Z2: "#3fb950", Z3: "#d29922",
  Z4: "#db6d28", Z5: "#f85149", Z6: "#bc4c9c",
};
const ZONE_LABELS: Record<string, string> = {
  Z1: "Recuperación", Z2: "Aeróbico (LT1)", Z3: "Sub-Umbral",
  Z4: "Umbral (LT2)", Z5: "VO₂max", Z6: "Sprint",
};
const ZONE_ORDER = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"];

/* ── Types ────────────────────────────────────────────────────── */

type ZoneBucket = { zone: string; seconds: number; color: string; label: string; pct?: number };

type LapRow = {
  index: number; name?: string; distance_m: number; time_s: number;
  pace_s_km: number | null; power: number | null;
  hr_avg: number | null; hr_max: number | null; cadence: number | null;
};

type TimelinePoint = {
  t: number; hr?: number | null; pace?: number | null;
  power?: number | null; cadence?: number | null; altitude?: number | null;
  zone?: string;
};

type Tab = "resumen" | "timeline" | "zonas" | "splits" | "avanzado" | "feedback";

type Props = {
  activity: AthleteHealthActivity;
  plannedSession?: PlanningPlannedSession | null;
  lt1: ResolvedTrainingThreshold | null;
  lt2: ResolvedTrainingThreshold | null;
  token: string;
  athleteId: number;
  onClose: () => void;
  initialDetail?: GarminActivity | null;
};

/* ═══════════════════════════════════════════════════════════════
   HELPERS & METRICS
   ═══════════════════════════════════════════════════════════════ */

function fmtPace(secPerKm: number | null | undefined): string {
  if (!secPerKm || secPerKm <= 0 || secPerKm > 1200) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDur(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

function fmtMinSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDist(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function speedToPace(speedMs: number | null | undefined): number | null {
  if (!speedMs || speedMs <= 0) return null;
  return 1000 / speedMs;
}

/** Classify HR → zone (Friel zones based on LT1/LT2) */
function hrToZone(hr: number, lt1Hr: number | null, lt2Hr: number | null): string {
  if (!lt1Hr || !lt2Hr) return "Z3";
  if (hr < lt1Hr * 0.92) return "Z1";
  if (hr < lt1Hr * 1.03) return "Z2";
  if (hr < (lt1Hr + lt2Hr) / 2 * 1.03) return "Z3";
  if (hr < lt2Hr * 1.03) return "Z4";
  if (hr < lt2Hr * 1.10) return "Z5";
  return "Z6";
}

/* ── Aerobic Decoupling (Friel / Uphill Athlete) ──────────────
   Formula: EF = Speed/HR (running) or Power/HR (cycling)
   Decoupling = (EF_1st_half − EF_2nd_half) / EF_1st_half × 100
   Source: Joe Friel (Training Bible), formalized in TrainingPeaks.
   Uphill Athlete uses it as Heart Rate Drift Test for AeT.

   METHOD (per Friel & TrainingPeaks):
   1. Strip warmup (~first 15%) and cooldown (~last 10%) to isolate
      the steady-state working portion of the session.
   2. Split the remaining portion into two EQUAL halves by TIME
      (not by number of data points — sample rate can vary).
   3. Calculate Efficiency Factor for each half:
      EF = avg_speed / avg_HR (running) or avg_power / avg_HR (cycling)
   4. Decoupling = (EF₁ − EF₂) / EF₁ × 100

   Thresholds (Friel, Uphill Athlete):
   < 3.5% = below AeT, 3.5-5% = at AeT, 5-7.5% = mild drift,
   7.5-10% = significant, > 10% = major.
   ─────────────────────────────────────────────────────────────── */
function computeDecoupling(timeline: TimelinePoint[], metric: "pace" | "power"): {
  value: number; label: string; tone: string;
  ef1: number; ef2: number; interpretation: string;
  rangeStart: number; rangeMid: number; rangeEnd: number;
} | null {
  const valid = timeline.filter((p) => p.hr && p.hr > 0 && (metric === "pace" ? p.pace && p.pace > 0 : p.power && p.power > 0));
  if (valid.length < 30) return null;

  // Step 1: Find total time span and strip warmup (15%) + cooldown (10%)
  const totalStart = valid[0].t;
  const totalEnd = valid[valid.length - 1].t;
  const totalDuration = totalEnd - totalStart;
  if (totalDuration < 600) return null; // need at least 10 min

  const trimStart = totalStart + totalDuration * 0.15;  // skip first 15%
  const trimEnd = totalEnd - totalDuration * 0.10;      // skip last 10%

  // Step 2: Isolate steady-state portion
  const steady = valid.filter((p) => p.t >= trimStart && p.t <= trimEnd);
  if (steady.length < 20) return null;

  // Step 3: Split into two equal halves BY TIME (midpoint of time range)
  const steadyStart = steady[0].t;
  const steadyEnd = steady[steady.length - 1].t;
  const midTime = steadyStart + (steadyEnd - steadyStart) / 2;

  const firstHalf = steady.filter((p) => p.t <= midTime);
  const secondHalf = steady.filter((p) => p.t > midTime);
  if (firstHalf.length < 10 || secondHalf.length < 10) return null;

  // Step 4: Compute EF for each half
  function ef(pts: TimelinePoint[]): number {
    const avgHr = pts.reduce((s, p) => s + (p.hr ?? 0), 0) / pts.length;
    if (avgHr <= 0) return 0;
    if (metric === "pace") {
      const avgSpeed = pts.reduce((s, p) => s + (p.pace ? 1000 / p.pace : 0), 0) / pts.length;
      return avgSpeed / avgHr;
    }
    return pts.reduce((s, p) => s + (p.power ?? 0), 0) / pts.length / avgHr;
  }

  const ef1 = ef(firstHalf);
  const ef2 = ef(secondHalf);
  if (ef1 <= 0) return null;

  const pct = ((ef1 - ef2) / ef1) * 100;
  const abs = Math.abs(pct);
  let tone: string, label: string, interpretation: string;

  if (abs < 3.5) {
    tone = "green"; label = "Por debajo de AeT";
    interpretation = "Excelente acoplamiento aeróbico. La FC se ha mantenido estable respecto al ritmo. Según Uphill Athlete, el esfuerzo está por debajo del umbral aeróbico.";
  } else if (abs < 5) {
    tone = "green"; label = "En el umbral aeróbico";
    interpretation = "Buen acoplamiento. Según Friel, un desacoplamiento ≤5% indica que la resistencia aeróbica es sólida a esta intensidad.";
  } else if (abs < 7.5) {
    tone = "amber"; label = "Deriva aeróbica leve";
    interpretation = "Desacoplamiento moderado. La FC ha subido más de lo esperado para el ritmo sostenido. La base aeróbica necesita más trabajo a esta intensidad.";
  } else if (abs < 10) {
    tone = "amber"; label = "Deriva aeróbica significativa";
    interpretation = "La eficiencia ha caído sensiblemente en la segunda mitad. Posible deshidratación, calor, o intensidad por encima del AeT.";
  } else {
    tone = "red"; label = "Desacoplamiento severo";
    interpretation = "Desacoplamiento > 10%. Muy por encima del umbral aeróbico, o factores externos (calor, deshidratación, altitud).";
  }

  return {
    value: pct, label, tone, ef1, ef2, interpretation,
    rangeStart: Math.round(trimStart), rangeMid: Math.round(midTime), rangeEnd: Math.round(trimEnd),
  };
}

/* ── TRIMP (Banister Exponential) ─────────────────────────────
   Formula: Σ(duration_i × HRR_i × 0.64 × e^(1.92 × HRR_i))
   where HRR = (HR - HRrest) / (HRmax - HRrest)
   Source: Banister 1991, using male coefficient (1.92).
   Weights higher intensities exponentially (models lactate curve).
   ─────────────────────────────────────────────────────────────── */
function computeTRIMP(timeline: TimelinePoint[], hrMax: number, hrRest: number = 50): number {
  if (timeline.length < 10 || hrMax <= hrRest) return 0;
  let trimp = 0;
  for (let i = 1; i < timeline.length; i++) {
    const hr = timeline[i].hr;
    if (!hr || hr < hrRest) continue;
    const dt = (timeline[i].t - timeline[i - 1].t) / 60; // minutes
    if (dt <= 0 || dt > 10) continue; // skip gaps
    const hrr = Math.min(1, (hr - hrRest) / (hrMax - hrRest));
    trimp += dt * hrr * 0.64 * Math.exp(1.92 * hrr);
  }
  return Math.round(trimp);
}

/* ── Efficiency Factor (EF) ───────────────────────────────────
   EF = NP / Avg HR (cycling) or NGP / Avg HR (running)
   Simplified: Avg Speed / Avg HR
   Rising EF at same HR over weeks = improving fitness.
   Source: TrainingPeaks / Coggan
   ─────────────────────────────────────────────────────────────── */
function computeEF(timeline: TimelinePoint[], metric: "pace" | "power"): number | null {
  const valid = timeline.filter((p) => p.hr && p.hr > 0 && (metric === "pace" ? p.pace && p.pace > 0 : p.power && p.power > 0));
  if (valid.length < 10) return null;
  const avgHr = valid.reduce((s, p) => s + (p.hr ?? 0), 0) / valid.length;
  if (avgHr <= 0) return null;
  if (metric === "pace") {
    const avgSpeed = valid.reduce((s, p) => s + (p.pace ? 1000 / p.pace : 0), 0) / valid.length;
    return avgSpeed / avgHr;
  }
  const avgPow = valid.reduce((s, p) => s + (p.power ?? 0), 0) / valid.length;
  return avgPow / avgHr;
}

/* ── Variability Index (VI) ───────────────────────────────────
   VI = NP / Avg Power. Measures steadiness.
   1.0 = perfectly even. > 1.10 = variable (intervals).
   Source: Coggan / TrainingPeaks
   ─────────────────────────────────────────────────────────────── */
function computeVI(timeline: TimelinePoint[], metric: "pace" | "power"): number | null {
  const vals = timeline.map((p) => metric === "pace" ? (p.pace ? 1000 / p.pace : 0) : (p.power ?? 0)).filter((v) => v > 0);
  if (vals.length < 30) return null;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (avg <= 0) return null;
  // Simplified NP: 30s rolling avg → 4th power → 4th root
  const windowSize = Math.min(6, Math.floor(vals.length / 5)); // ~30s if 5s samples
  const rolling: number[] = [];
  for (let i = 0; i <= vals.length - windowSize; i++) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) sum += vals[i + j];
    rolling.push(sum / windowSize);
  }
  if (rolling.length === 0) return null;
  const np4 = rolling.reduce((s, v) => s + v ** 4, 0) / rolling.length;
  const np = np4 ** 0.25;
  return np / avg;
}

/** Fade % across intervals */
function computeFadePct(laps: LapRow[], metric: "pace" | "power"): number | null {
  const filtered = laps.filter((l) => metric === "pace" ? l.pace_s_km && l.pace_s_km > 0 : l.power && l.power > 0);
  if (filtered.length < 3) return null;
  const first = metric === "pace" ? filtered[0].pace_s_km! : filtered[0].power!;
  const last = metric === "pace" ? filtered[filtered.length - 1].pace_s_km! : filtered[filtered.length - 1].power!;
  if (first <= 0) return null;
  if (metric === "pace") return ((last - first) / first) * 100;
  return ((first - last) / first) * 100;
}

/* ── Zone distribution helpers ────────────────────────────────── */

function plannedZoneDistribution(steps: WorkoutStep[], _lt1: ResolvedTrainingThreshold | null, _lt2: ResolvedTrainingThreshold | null): ZoneBucket[] {
  const totals: Record<string, number> = {};
  function resolveStepZone(step: WorkoutStep): string {
    const t = step.step_type;
    if (t === "warmup" || t === "cooldown" || t === "recovery") return "Z1";
    const lbl = (step.target?.label ?? step.intensity_label ?? "").toLowerCase();
    if (lbl.includes("vo2")) return "Z5";
    if (lbl.includes("max") || lbl.includes("sprint")) return "Z6";
    if (lbl.includes("lt2") || lbl.includes("umbral") || lbl.includes("threshold")) return "Z4";
    if (lbl.includes("sub-t") || lbl.includes("zona media")) return "Z3";
    if (lbl.includes("lt1") || lbl.includes("aerob") || lbl.includes("aerób")) return "Z2";
    if (lbl.includes("suave") || lbl.includes("easy") || lbl.includes("recup")) return "Z1";
    return "Z3";
  }
  function estimateSec(step: WorkoutStep): number {
    if (step.length_value) {
      if (step.length_type === "time") return step.length_value;
      if (step.length_type === "distance") return step.length_value / 3.5;
    }
    return 300;
  }
  function process(step: WorkoutStep) {
    if (step.step_type === "repeat" && step.children?.length) {
      const count = step.repeat_count ?? 1;
      for (let i = 0; i < count; i++) for (const c of step.children) process(c);
      return;
    }
    const z = resolveStepZone(step);
    totals[z] = (totals[z] ?? 0) + estimateSec(step);
  }
  for (const s of steps) process(s);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return ZONE_ORDER.filter((z) => (totals[z] ?? 0) > 0)
    .map((z) => ({ zone: z, seconds: totals[z], pct: total > 0 ? Math.round((totals[z] / total) * 100) : 0, color: ZONE_COLORS[z], label: ZONE_LABELS[z] }));
}

function actualZoneDistribution(rawZones: unknown): ZoneBucket[] {
  if (!Array.isArray(rawZones) || rawZones.length === 0) return [];
  const items = rawZones[0]?.zones ?? rawZones;
  if (!Array.isArray(items)) return [];
  const buckets: ZoneBucket[] = [];
  let total = 0;
  items.forEach((item: any, i: number) => {
    const sec = item.secsInZone ?? item.timeInSeconds ?? item.time_seconds ?? 0;
    if (sec <= 0) return;
    total += sec;
    const zIdx = Math.min(i + 1, 6);
    const zKey = `Z${zIdx}`;
    buckets.push({ zone: zKey, seconds: sec, color: ZONE_COLORS[zKey] ?? "#8b949e", label: ZONE_LABELS[zKey] ?? `Z${zIdx}` });
  });
  return buckets.map((b) => ({ ...b, pct: total > 0 ? Math.round((b.seconds / total) * 100) : 0 }));
}

function actualZoneDistFromTimeline(timeline: TimelinePoint[]): ZoneBucket[] {
  if (timeline.length < 10) return [];
  const totals: Record<string, number> = {};
  for (let i = 1; i < timeline.length; i++) {
    const dt = timeline[i].t - timeline[i - 1].t;
    const z = timeline[i].zone ?? "Z3";
    totals[z] = (totals[z] ?? 0) + dt;
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return ZONE_ORDER.filter((z) => (totals[z] ?? 0) > 0)
    .map((z) => ({ zone: z, seconds: totals[z], pct: total > 0 ? Math.round((totals[z] / total) * 100) : 0, color: ZONE_COLORS[z], label: ZONE_LABELS[z] }));
}

/* ── Parse Garmin detail ──────────────────────────────────────── */

function parseTimeline(detail: GarminActivity): TimelinePoint[] {
  const extras = detail.raw_detail?.extras as Record<string, any> | undefined;
  const fit = extras?.fit_file as Record<string, any> | undefined;
  const streams = fit?.streams ?? detail.raw_detail?.streams;
  if (!streams) return [];

  const hrData = (streams.heart_rate?.data ?? []) as number[];
  const speedData = (streams.speed?.data ?? streams.enhanced_speed?.data ?? []) as number[];
  const powerData = (streams.power?.data ?? []) as number[];
  const cadenceData = (streams.cadence?.data ?? []) as number[];
  const altData = (streams.altitude?.data ?? streams.enhanced_altitude?.data ?? []) as number[];
  const timeData = (streams.timestamp?.data ?? []) as number[];

  const len = Math.max(hrData.length, speedData.length, powerData.length);
  if (len === 0) return [];

  const points: TimelinePoint[] = [];
  const startTs = timeData[0] ?? 0;
  for (let i = 0; i < len; i++) {
    const t = timeData[i] ? timeData[i] - startTs : (i / len) * detail.moving_time_seconds;
    points.push({
      t: Math.round(t),
      hr: hrData[i] ?? null,
      pace: speedToPace(speedData[i]),
      power: powerData[i] ?? null,
      cadence: cadenceData[i] ?? null,
      altitude: altData[i] ?? null,
    });
  }
  return points;
}

function parseLaps(detail: GarminActivity): LapRow[] {
  return (detail.laps ?? []).map((lap, i) => ({
    index: i + 1, name: lap.name,
    distance_m: lap.distance_m, time_s: lap.elapsed_time_seconds,
    pace_s_km: lap.average_speed_m_s ? speedToPace(lap.average_speed_m_s) : null,
    power: lap.average_watts ?? null,
    hr_avg: lap.average_heartrate ?? null, hr_max: lap.max_heartrate ?? null,
    cadence: null,
  }));
}

function compliancePercent(planned: PlanningPlannedSession | null | undefined, actualSeconds: number) {
  if (!planned) return null;
  const plannedMin = typeof planned.payload?.total_duration_min === "number" ? planned.payload.total_duration_min as number : null;
  if (!plannedMin || plannedMin <= 0) return null;
  const pct = Math.round((actualSeconds / 60 / plannedMin) * 100);
  const dev = Math.abs(pct - 100);
  const tone = dev <= 20 ? "green" : dev <= 50 ? "amber" : "red";
  const label = dev <= 20 ? "Cumplido" : dev <= 50 ? "Parcial" : "Desviado";
  return { pct, tone, label };
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

const TABS: { key: Tab; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "timeline", label: "Timeline" },
  { key: "zonas", label: "Zonas" },
  { key: "splits", label: "Splits" },
  { key: "avanzado", label: "Avanzado" },
  { key: "feedback", label: "Feedback" },
];

export function PostWorkoutAnalysis({ activity, plannedSession, lt1, lt2, token, athleteId, onClose, initialDetail }: Props) {
  const [detail, setDetail] = useState<GarminActivity | null>(initialDetail ?? null);
  const [loading, setLoading] = useState(!initialDetail);
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [rpe, setRpe] = useState<number | null>(null);
  const [athleteNote, setAthleteNote] = useState("");
  // Timeline: selected lap highlight and brush selection stats
  const [selectedLapIdx, setSelectedLapIdx] = useState<number | null>(null);
  const [brushRange, setBrushRange] = useState<{ startT: number; endT: number } | null>(null);

  useEffect(() => {
    if (initialDetail) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.garminActivityDetail(token, athleteId, activity.provider_activity_id) as GarminActivity;
        if (!cancelled) setDetail(result);
      } catch { /* silent */ } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, athleteId, activity.provider_activity_id, initialDetail]);

  const isRunning = activity.sport_type === "running" || activity.sport_type === "trail_running";
  const isCycling = activity.sport_type === "cycling" || activity.sport_type === "virtual_ride";
  const isSwimming = activity.sport_type === "swimming" || activity.sport_type === "open_water_swimming";
  const primaryMetric = isCycling ? "power" : "pace";

  const timeline = useMemo(() => detail ? parseTimeline(detail) : [], [detail]);
  const timelineWithZones = useMemo(() =>
    timeline.map((p) => ({ ...p, zone: p.hr ? hrToZone(p.hr, lt1?.heartRate ?? null, lt2?.heartRate ?? null) : "Z3" })),
    [timeline, lt1, lt2]
  );
  const laps = useMemo(() => detail ? parseLaps(detail) : [], [detail]);

  const plannedZones = useMemo(() => {
    if (!plannedSession?.structured_workout_payload?.steps?.length) return [];
    return plannedZoneDistribution(plannedSession.structured_workout_payload.steps, lt1, lt2);
  }, [plannedSession, lt1, lt2]);

  const actualZones = useMemo(() => {
    if (!detail) return [];
    const extras = detail.raw_detail?.extras as Record<string, any> | undefined;
    const hrZones = extras?.hr_time_in_zones;
    if (hrZones) return actualZoneDistribution(hrZones);
    return actualZoneDistFromTimeline(timelineWithZones);
  }, [detail, timelineWithZones]);

  const decoupling = useMemo(() => timelineWithZones.length >= 20 ? computeDecoupling(timelineWithZones, primaryMetric) : null, [timelineWithZones, primaryMetric]);
  const compliance = useMemo(() => compliancePercent(plannedSession, activity.moving_time_seconds), [plannedSession, activity]);
  const fadePct = useMemo(() => laps.length >= 3 ? computeFadePct(laps, primaryMetric) : null, [laps, primaryMetric]);
  const trimp = useMemo(() => {
    const hrMax = detail?.max_heartrate ?? 190;
    return computeTRIMP(timelineWithZones, hrMax);
  }, [timelineWithZones, detail]);
  const ef = useMemo(() => computeEF(timelineWithZones, primaryMetric), [timelineWithZones, primaryMetric]);
  const vi = useMemo(() => computeVI(timelineWithZones, primaryMetric), [timelineWithZones, primaryMetric]);

  const avgCadence = detail?.average_cadence ?? null;
  const avgHr = activity.average_heartrate ?? null;
  const avgPower = activity.average_watts ?? null;
  const avgPace = detail?.average_speed_m_s ? speedToPace(detail.average_speed_m_s)
    : (activity.distance_m > 0 && activity.moving_time_seconds > 0 ? speedToPace(activity.distance_m / activity.moving_time_seconds) : null);

  // HR vs Pace scatter data
  const scatterData = useMemo(() => {
    if (timelineWithZones.length < 20) return [];
    // Sample every ~10 points to avoid huge scatter
    const step = Math.max(1, Math.floor(timelineWithZones.length / 80));
    return timelineWithZones.filter((_, i) => i % step === 0)
      .filter((p) => p.hr && p.hr > 0 && (primaryMetric === "pace" ? p.pace && p.pace > 60 && p.pace < 900 : p.power && p.power > 0))
      .map((p) => ({
        hr: p.hr!,
        metric: primaryMetric === "pace" ? p.pace! : p.power!,
        zone: p.zone,
        half: p.t < timeline[Math.floor(timeline.length / 2)]?.t ? "1st" : "2nd",
      }));
  }, [timelineWithZones, primaryMetric, timeline]);

  // Lap time ranges (cumulative from lap durations)
  const lapTimeRanges = useMemo(() => {
    if (!laps.length) return [];
    let cumT = 0;
    return laps.map((lap) => {
      const start = cumT;
      cumT += lap.time_s;
      return { start, end: cumT, index: lap.index, name: lap.name ?? `#${lap.index}` };
    });
  }, [laps]);

  // Selected lap time range for ReferenceArea
  const selectedLapRange = useMemo(() => {
    if (selectedLapIdx === null || !lapTimeRanges.length) return null;
    return lapTimeRanges.find((r) => r.index === selectedLapIdx) ?? null;
  }, [selectedLapIdx, lapTimeRanges]);

  // Brush selection summary stats
  const brushStats = useMemo(() => {
    if (!brushRange || timelineWithZones.length < 5) return null;
    const pts = timelineWithZones.filter((p) => p.t >= brushRange.startT && p.t <= brushRange.endT);
    if (pts.length < 3) return null;
    const duration = brushRange.endT - brushRange.startT;
    const hrs = pts.filter((p) => p.hr && p.hr > 0).map((p) => p.hr!);
    const paces = pts.filter((p) => p.pace && p.pace > 0 && p.pace < 900).map((p) => p.pace!);
    const powers = pts.filter((p) => p.power && p.power > 0).map((p) => p.power!);
    const cadences = pts.filter((p) => p.cadence && p.cadence > 0).map((p) => p.cadence!);
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : null;
    const min = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : null;
    // Estimate distance from speed integration
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      const dt = pts[i].t - pts[i - 1].t;
      const speed = pts[i].pace && pts[i].pace! > 0 ? 1000 / pts[i].pace! : 0;
      dist += speed * dt;
    }
    return {
      duration,
      avgHr: avg(hrs), maxHr: max(hrs), minHr: min(hrs),
      avgPace: avg(paces), avgPower: avg(powers),
      avgCadence: avg(cadences),
      distance: dist,
    };
  }, [brushRange, timelineWithZones]);

  // Data filtered to brush range — used by altitude & cadence charts for synchronized zoom
  const brushedTimeline = useMemo(() => {
    if (!brushRange) return timelineWithZones;
    return timelineWithZones.filter((p) => p.t >= brushRange.startT && p.t <= brushRange.endT);
  }, [brushRange, timelineWithZones]);

  const handleSaveNote = useCallback(() => {
    console.log("Post-workout feedback:", { rpe, note: athleteNote, activityId: activity.provider_activity_id });
  }, [rpe, athleteNote, activity.provider_activity_id]);

  return (
    <div className="ath-modal-backdrop" onClick={onClose}>
      <div className="ath-pwd-fullpage" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <header className="ath-pwd-header">
          <div className="ath-pwd-header-left">
            <h2 className="ath-pwd-title">{activity.name}</h2>
            <div className="ath-pwd-header-meta">
              <span className="ath-pwd-sport-badge" style={{ background: activity.sport_color + "18", color: activity.sport_color, borderColor: activity.sport_color + "40" }}>
                {activity.sport_label}
              </span>
              <span className="ath-pwd-date">
                {new Date(activity.started_at).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              {detail?.device_name && <span className="ath-pwd-device">{detail.device_name}</span>}
              {compliance && (
                <span className={`ath-pwd-compliance-badge ${compliance.tone}`}>
                  {compliance.label} ({compliance.pct}%)
                </span>
              )}
            </div>
          </div>
          <button type="button" className="ath-pwd-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </header>

        {/* ── Tabs ── */}
        <nav className="ath-pwd-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`ath-pwd-tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ── Body ── */}
        <div className="ath-pwd-body">
          {loading && (
            <div className="ath-pwd-loading">
              <div className="ath-pwd-spinner" />
              <span>Cargando datos de actividad...</span>
            </div>
          )}

          {!loading && (
            <>
              {/* ═══ TAB: RESUMEN ═══ */}
              {activeTab === "resumen" && (
                <div className="ath-pwd-tab-content">
                  {/* Report Card */}
                  <div className="ath-pwd-report-card">
                    <MetricCard label="Duración" value={fmtDur(activity.moving_time_seconds)} />
                    <MetricCard label="Distancia" value={fmtDist(activity.distance_m)} />
                    <MetricCard
                      label={isRunning ? "Ritmo medio" : isCycling ? "Potencia media" : "Ritmo"}
                      value={isRunning && avgPace ? `${fmtPace(avgPace)}/km`
                        : isCycling && avgPower ? `${Math.round(avgPower)}W`
                        : isSwimming && avgPace ? `${fmtPace(avgPace * 10)}/100m` : "—"}
                    />
                    {avgHr && <MetricCard label="FC media" value={`${Math.round(avgHr)} bpm`} />}
                    {detail?.max_heartrate && <MetricCard label="FC máx" value={`${Math.round(detail.max_heartrate)} bpm`} />}
                    {avgCadence && <MetricCard label="Cadencia media" value={`${Math.round(avgCadence)} ${isRunning ? "spm" : "rpm"}`} />}
                    {detail?.total_elevation_gain_m && <MetricCard label="Desnivel +" value={`${Math.round(detail.total_elevation_gain_m)} m`} />}
                    {detail?.calories && <MetricCard label="Calorías" value={`${Math.round(detail.calories)} kcal`} />}
                  </div>

                  {/* Quick Decoupling */}
                  {decoupling && (
                    <div className={`ath-pwd-insight-card ${decoupling.tone}`}>
                      <div className="ath-pwd-insight-header">
                        <span className="ath-pwd-insight-label">Desacoplamiento aeróbico ({isCycling ? "Pw:HR" : "Pa:HR"})</span>
                        <span className={`ath-pwd-insight-value ${decoupling.tone}`}>
                          {decoupling.value > 0 ? "+" : ""}{decoupling.value.toFixed(1)}%
                        </span>
                      </div>
                      <p className="ath-pwd-insight-text">{decoupling.label}</p>
                      <span className="ath-pwd-insight-ref">
                        Parcial analizado: {fmtMinSec(decoupling.rangeStart)}–{fmtMinSec(decoupling.rangeMid)} vs {fmtMinSec(decoupling.rangeMid)}–{fmtMinSec(decoupling.rangeEnd)} (excl. calent. y vuelta a la calma)
                        {" · "}EF₁: {decoupling.ef1.toFixed(3)} → EF₂: {decoupling.ef2.toFixed(3)} · Ref: ≤5% = adaptado (Friel, TrainingPeaks)
                      </span>
                    </div>
                  )}

                  {/* Quick Zones */}
                  {(plannedZones.length > 0 || actualZones.length > 0) && (
                    <div className="ath-pwd-panel">
                      <h4 className="ath-pwd-panel-title">Distribución de zonas</h4>
                      {plannedZones.length > 0 && (
                        <div className="ath-pwd-zone-row"><span className="ath-pwd-zone-label">Plan</span><ZoneBar buckets={plannedZones} /></div>
                      )}
                      {actualZones.length > 0 && (
                        <div className="ath-pwd-zone-row"><span className="ath-pwd-zone-label">Real</span><ZoneBar buckets={actualZones} /></div>
                      )}
                      <ZoneLegend planned={plannedZones} actual={actualZones} />
                    </div>
                  )}

                  {/* Mini metrics row */}
                  <div className="ath-pwd-metrics-row">
                    {trimp > 0 && <MiniMetric label="TRIMP" value={String(trimp)} tooltip="Training Impulse (Banister 1991). Pondera la duración por la intensidad de FC de forma exponencial." />}
                    {ef !== null && <MiniMetric label="EF" value={ef.toFixed(3)} tooltip="Efficiency Factor (Coggan/TrainingPeaks). Velocidad ÷ FC media. Un EF creciente a la misma FC = mejor fitness." />}
                    {vi !== null && <MiniMetric label="VI" value={vi.toFixed(2)} tooltip="Variability Index (Coggan). NP ÷ media. 1.00 = esfuerzo constante. > 1.10 = variable (intervalos)." />}
                    {fadePct !== null && (
                      <MiniMetric
                        label="Fade %"
                        value={`${fadePct > 0 ? "+" : ""}${fadePct.toFixed(1)}%`}
                        tooltip="Diferencia entre primer y último intervalo. < 5% = buena ejecución."
                        tone={Math.abs(fadePct) < 5 ? "green" : Math.abs(fadePct) < 10 ? "amber" : "red"}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* ═══ TAB: TIMELINE ═══ */}
              {activeTab === "timeline" && (
                <div className="ath-pwd-tab-content">
                  {timelineWithZones.length > 10 ? (
                    <>
                      {/* ── Interval selector panel ── */}
                      {lapTimeRanges.length > 1 && (
                        <div className="ath-pwd-panel ath-pwd-interval-panel">
                          <h4 className="ath-pwd-panel-title">Intervalos
                            <span className="ath-pwd-panel-subtitle">Selecciona un intervalo para marcarlo en las gráficas</span>
                          </h4>
                          <div className="ath-pwd-interval-list">
                            {lapTimeRanges.map((r) => {
                              const lap = laps.find((l) => l.index === r.index);
                              const isActive = selectedLapIdx === r.index;
                              const z = lap?.hr_avg ? hrToZone(lap.hr_avg, lt1?.heartRate ?? null, lt2?.heartRate ?? null) : null;
                              return (
                                <button
                                  key={r.index}
                                  type="button"
                                  className={`ath-pwd-interval-btn ${isActive ? "active" : ""}`}
                                  style={isActive && z ? { borderColor: ZONE_COLORS[z], background: ZONE_COLORS[z] + "12" } : undefined}
                                  onClick={() => setSelectedLapIdx(isActive ? null : r.index)}
                                >
                                  <span className="ath-pwd-ib-idx" style={z ? { color: ZONE_COLORS[z] } : undefined}>{r.index}</span>
                                  <span className="ath-pwd-ib-name">{r.name}</span>
                                  <span className="ath-pwd-ib-time">{fmtMinSec(r.start)}–{fmtMinSec(r.end)}</span>
                                  {lap && isRunning && lap.pace_s_km && <span className="ath-pwd-ib-metric">{fmtPace(lap.pace_s_km)}</span>}
                                  {lap && isCycling && lap.power && <span className="ath-pwd-ib-metric">{lap.power}W</span>}
                                  {lap?.hr_avg && <span className="ath-pwd-ib-hr">{Math.round(lap.hr_avg)} bpm</span>}
                                </button>
                              );
                            })}
                          </div>
                          {selectedLapIdx !== null && (
                            <button type="button" className="ath-pwd-interval-clear" onClick={() => setSelectedLapIdx(null)}>
                              Limpiar selección
                            </button>
                          )}
                        </div>
                      )}

                      {/* ── Brush selection stats ── */}
                      {brushStats && (
                        <div className="ath-pwd-brush-stats">
                          <span className="ath-pwd-bs-title">Selección: {fmtMinSec(brushRange!.startT)}–{fmtMinSec(brushRange!.endT)}</span>
                          <div className="ath-pwd-bs-grid">
                            <span><strong>{fmtDur(brushStats.duration)}</strong> dur</span>
                            {brushStats.distance > 0 && <span><strong>{(brushStats.distance / 1000).toFixed(2)}km</strong> dist</span>}
                            {brushStats.avgHr && <span><strong>{Math.round(brushStats.avgHr)}</strong> bpm med</span>}
                            {brushStats.maxHr && <span><strong>{Math.round(brushStats.maxHr)}</strong> bpm máx</span>}
                            {isRunning && brushStats.avgPace && <span><strong>{fmtPace(brushStats.avgPace)}</strong>/km</span>}
                            {isCycling && brushStats.avgPower && <span><strong>{Math.round(brushStats.avgPower)}</strong>W med</span>}
                            {brushStats.avgCadence && <span><strong>{Math.round(brushStats.avgCadence)}</strong> {isRunning ? "spm" : "rpm"}</span>}
                          </div>
                          <button type="button" className="ath-pwd-bs-clear" onClick={() => setBrushRange(null)}>✕</button>
                        </div>
                      )}

                      {/* Main chart: Primary metric + HR */}
                      <div className="ath-pwd-panel">
                        <h4 className="ath-pwd-panel-title">{isRunning ? "Ritmo" : isCycling ? "Potencia" : "Ritmo"} y Frecuencia Cardíaca
                          <span className="ath-pwd-panel-subtitle">Arrastra el selector inferior para analizar un segmento</span>
                        </h4>
                        <div className="ath-pwd-chart-container ath-pwd-chart-lg">
                          <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={timelineWithZones} margin={{ top: 10, right: 10, bottom: 5, left: -10 }}>
                              <CartesianGrid stroke="var(--ath-border-subtle)" strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="t" tickFormatter={(v: number) => `${Math.floor(v / 60)}'`} tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }} axisLine={false} tickLine={false} />
                              <YAxis yAxisId="hr" orientation="right" tick={{ fontSize: 11, fill: "#f85149" }} axisLine={false} tickLine={false} domain={["dataMin - 10", "dataMax + 10"]} />
                              <YAxis yAxisId="primary" orientation="left" tick={{ fontSize: 11, fill: "var(--ath-accent)" }} axisLine={false} tickLine={false} reversed={isRunning || isSwimming} domain={isRunning ? ["dataMin - 20", "dataMax + 20"] : undefined} tickFormatter={isRunning ? (v: number) => fmtPace(v) : undefined} />
                              <Tooltip content={<TimelineTooltip isRunning={isRunning} isCycling={isCycling} />} />
                              {/* Selected lap highlight */}
                              {selectedLapRange && (
                                <ReferenceArea yAxisId="hr" x1={selectedLapRange.start} x2={selectedLapRange.end} fill="var(--ath-accent)" fillOpacity={0.1} stroke="var(--ath-accent)" strokeOpacity={0.3} strokeDasharray="4 2" />
                              )}
                              {lt1?.heartRate && <ReferenceLine yAxisId="hr" y={lt1.heartRate} stroke="#3fb950" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: "LT1", fontSize: 10, fill: "#3fb950", position: "insideTopRight" }} />}
                              {lt2?.heartRate && <ReferenceLine yAxisId="hr" y={lt2.heartRate} stroke="#db6d28" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: "LT2", fontSize: 10, fill: "#db6d28", position: "insideTopRight" }} />}
                              <Area yAxisId="hr" type="monotone" dataKey="hr" stroke="rgba(248,81,73,0.5)" fill="rgba(248,81,73,0.08)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="FC" />
                              {(isRunning || isSwimming) && <Line yAxisId="primary" type="monotone" dataKey="pace" stroke="var(--ath-accent)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls name="Ritmo" />}
                              {isCycling && <Line yAxisId="primary" type="monotone" dataKey="power" stroke="#d29922" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls name="Potencia" />}
                              <Brush
                                dataKey="t"
                                height={28}
                                stroke="var(--ath-accent)"
                                fill="var(--ath-bg-elevated)"
                                tickFormatter={(v: number) => `${Math.floor(v / 60)}'`}
                                onChange={(range: any) => {
                                  if (range && typeof range.startIndex === "number" && typeof range.endIndex === "number") {
                                    const s = timelineWithZones[range.startIndex]?.t;
                                    const e = timelineWithZones[range.endIndex]?.t;
                                    if (s != null && e != null && e > s) setBrushRange({ startT: s, endT: e });
                                    else setBrushRange(null);
                                  }
                                }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Altitude profile — synced to brush zoom */}
                      {timeline.some((p) => p.altitude != null) && (
                        <div className="ath-pwd-panel">
                          <h4 className="ath-pwd-panel-title">Perfil de altimetría</h4>
                          <div className="ath-pwd-chart-container">
                            <ResponsiveContainer width="100%" height={140}>
                              <ComposedChart data={brushedTimeline} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                                <XAxis dataKey="t" tickFormatter={(v: number) => `${Math.floor(v / 60)}'`} tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }} axisLine={false} tickLine={false} domain={["dataMin - 5", "dataMax + 15"]} />
                                <Tooltip content={({ payload }) => {
                                  const d = payload?.[0]?.payload as TimelinePoint | undefined;
                                  if (!d?.altitude) return null;
                                  return <div className="ath-pwd-tooltip"><span>{Math.floor(d.t / 60)}'</span><span>Altitud: {d.altitude.toFixed(0)} m</span></div>;
                                }} />
                                {selectedLapRange && <ReferenceArea x1={selectedLapRange.start} x2={selectedLapRange.end} fill="var(--ath-accent)" fillOpacity={0.1} stroke="var(--ath-accent)" strokeOpacity={0.3} strokeDasharray="4 2" />}
                                <Area type="monotone" dataKey="altitude" stroke="#6e7681" fill="rgba(110,118,129,0.15)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Cadence chart — synced to brush zoom */}
                      {timeline.some((p) => p.cadence && p.cadence > 0) && (
                        <div className="ath-pwd-panel">
                          <h4 className="ath-pwd-panel-title">
                            Cadencia
                            {avgCadence && <span className="ath-pwd-panel-subtitle">media: {Math.round(avgCadence)} {isRunning ? "spm" : isCycling ? "rpm" : "str/min"}</span>}
                          </h4>
                          <div className="ath-pwd-chart-container">
                            <ResponsiveContainer width="100%" height={140}>
                              <ComposedChart data={brushedTimeline} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                                <XAxis dataKey="t" tickFormatter={(v: number) => `${Math.floor(v / 60)}'`} tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }} axisLine={false} tickLine={false} domain={["dataMin - 5", "dataMax + 5"]} />
                                <Tooltip content={({ payload }) => {
                                  const d = payload?.[0]?.payload as TimelinePoint | undefined;
                                  if (!d?.cadence) return null;
                                  return <div className="ath-pwd-tooltip"><span>{Math.floor(d.t / 60)}'</span><span>Cadencia: {d.cadence}</span></div>;
                                }} />
                                {selectedLapRange && <ReferenceArea x1={selectedLapRange.start} x2={selectedLapRange.end} fill="var(--ath-accent)" fillOpacity={0.1} stroke="var(--ath-accent)" strokeOpacity={0.3} strokeDasharray="4 2" />}
                                {avgCadence && <ReferenceLine y={avgCadence} stroke="var(--ath-text-muted)" strokeDasharray="3 3" />}
                                <Area type="monotone" dataKey="cadence" stroke="#8b5cf6" fill="rgba(139,92,246,0.1)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="ath-pwd-empty">No hay datos de streams disponibles para esta actividad.</p>
                  )}
                </div>
              )}

              {/* ═══ TAB: ZONAS ═══ */}
              {activeTab === "zonas" && (
                <div className="ath-pwd-tab-content">
                  {/* Plan vs Real */}
                  {(plannedZones.length > 0 || actualZones.length > 0) && (
                    <div className="ath-pwd-panel">
                      <h4 className="ath-pwd-panel-title">Plan vs Real — Tiempo en zona</h4>
                      <div className="ath-pwd-zones-detail">
                        {plannedZones.length > 0 && (
                          <div className="ath-pwd-zone-row"><span className="ath-pwd-zone-label">Plan</span><ZoneBar buckets={plannedZones} variant="plan" /></div>
                        )}
                        {actualZones.length > 0 && (
                          <div className="ath-pwd-zone-row"><span className="ath-pwd-zone-label">Real</span><ZoneBar buckets={actualZones} variant="real" /></div>
                        )}
                        <ZoneLegend planned={plannedZones} actual={actualZones} />
                      </div>
                    </div>
                  )}

                  {/* Detailed zone breakdown */}
                  {actualZones.length > 0 && (
                    <div className="ath-pwd-panel">
                      <h4 className="ath-pwd-panel-title">Detalle por zona</h4>
                      <div className="ath-pwd-zone-breakdown">
                        {ZONE_ORDER.map((z) => {
                          const actual = actualZones.find((b) => b.zone === z);
                          const planned = plannedZones.find((b) => b.zone === z);
                          if (!actual && !planned) return null;
                          const actualMin = actual ? Math.round(actual.seconds / 60) : 0;
                          const plannedMin = planned ? Math.round(planned.seconds / 60) : 0;
                          const maxMin = Math.max(actualMin, plannedMin, 1);
                          return (
                            <div key={z} className="ath-pwd-zone-detail-row">
                              <div className="ath-pwd-zdl">
                                <span className="ath-pwd-zdl-dot" style={{ background: ZONE_COLORS[z] }} />
                                <span className="ath-pwd-zdl-name">{z}</span>
                                <span className="ath-pwd-zdl-desc">{ZONE_LABELS[z]}</span>
                              </div>
                              <div className="ath-pwd-zdr">
                                {planned && (
                                  <div className="ath-pwd-zdr-bar plan" style={{ width: `${(plannedMin / maxMin) * 100}%`, background: ZONE_COLORS[z] + "38", border: `2px dashed ${ZONE_COLORS[z]}80` }}>
                                    <span>{plannedMin}′</span>
                                  </div>
                                )}
                                <div className="ath-pwd-zdr-bar real" style={{ width: `${(actualMin / maxMin) * 100}%`, background: ZONE_COLORS[z] }}>
                                  <span>{actualMin}′</span>
                                </div>
                              </div>
                              <span className="ath-pwd-zdl-pct">{actual?.pct ?? 0}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* HR vs Pace/Power Scatter */}
                  {scatterData.length > 15 && (
                    <div className="ath-pwd-panel">
                      <h4 className="ath-pwd-panel-title">
                        FC vs {isRunning ? "Ritmo" : "Potencia"} — Acoplamiento
                        <span className="ath-pwd-panel-subtitle">Azul = 1ª mitad, Naranja = 2ª mitad. Cuanto más juntos, mejor acoplamiento.</span>
                      </h4>
                      <div className="ath-pwd-chart-container">
                        <ResponsiveContainer width="100%" height={220}>
                          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                            <CartesianGrid stroke="var(--ath-border-subtle)" strokeDasharray="3 3" />
                            <XAxis type="number" dataKey="hr" name="FC" unit=" bpm" tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }} />
                            <YAxis type="number" dataKey="metric" name={isRunning ? "Ritmo" : "Potencia"} reversed={isRunning} tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }} tickFormatter={isRunning ? (v: number) => fmtPace(v) : undefined} />
                            <Tooltip content={({ payload }) => {
                              if (!payload?.length) return null;
                              const d = payload[0]?.payload;
                              if (!d) return null;
                              return (
                                <div className="ath-pwd-tooltip">
                                  <span>FC: {d.hr} bpm</span>
                                  <span>{isRunning ? `Ritmo: ${fmtPace(d.metric)}` : `Potencia: ${d.metric}W`}</span>
                                  <span>Mitad: {d.half === "1st" ? "Primera" : "Segunda"}</span>
                                </div>
                              );
                            }} />
                            <Scatter data={scatterData.filter((d) => d.half === "1st")} fill="#58a6ff" fillOpacity={0.6} r={3} name="1ª mitad" />
                            <Scatter data={scatterData.filter((d) => d.half === "2nd")} fill="#db6d28" fillOpacity={0.6} r={3} name="2ª mitad" />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ TAB: SPLITS ═══ */}
              {activeTab === "splits" && (
                <div className="ath-pwd-tab-content">
                  {laps.length > 1 ? (
                    <>
                      {/* Visual split comparison */}
                      <div className="ath-pwd-panel">
                        <h4 className="ath-pwd-panel-title">
                          Intervalos / Splits
                          {fadePct !== null && (
                            <span className={`ath-pwd-fade-badge ${Math.abs(fadePct) < 5 ? "green" : Math.abs(fadePct) < 10 ? "amber" : "red"}`}>
                              Fade {fadePct > 0 ? "+" : ""}{fadePct.toFixed(1)}%
                            </span>
                          )}
                        </h4>

                        {/* Bar chart comparison */}
                        <div className="ath-pwd-chart-container">
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={laps.map((l) => ({
                              name: l.name ?? `#${l.index}`,
                              value: isRunning ? l.pace_s_km : l.power,
                              hr: l.hr_avg,
                              zone: l.hr_avg ? hrToZone(l.hr_avg, lt1?.heartRate ?? null, lt2?.heartRate ?? null) : "Z3",
                            }))} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                              <CartesianGrid stroke="var(--ath-border-subtle)" strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "var(--ath-text-muted)" }} interval={0} angle={-45} textAnchor="end" height={50} />
                              <YAxis reversed={isRunning} tick={{ fontSize: 10, fill: "var(--ath-text-muted)" }} axisLine={false} tickLine={false} tickFormatter={isRunning ? (v: number) => fmtPace(v) : undefined} />
                              <Tooltip content={({ payload }) => {
                                if (!payload?.length) return null;
                                const d = payload[0]?.payload;
                                return (
                                  <div className="ath-pwd-tooltip">
                                    <span>{d?.name}</span>
                                    {isRunning && d?.value && <span>Ritmo: {fmtPace(d.value)}/km</span>}
                                    {!isRunning && d?.value && <span>Potencia: {d.value}W</span>}
                                    {d?.hr && <span>FC: {Math.round(d.hr)} bpm</span>}
                                  </div>
                                );
                              }} />
                              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                {laps.map((l) => {
                                  const z = l.hr_avg ? hrToZone(l.hr_avg, lt1?.heartRate ?? null, lt2?.heartRate ?? null) : "Z3";
                                  return <Cell key={l.index} fill={ZONE_COLORS[z] ?? "#8b949e"} fillOpacity={0.85} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Detailed table */}
                      <div className="ath-pwd-panel">
                        <h4 className="ath-pwd-panel-title">Tabla de splits</h4>
                        <div className="ath-pwd-table-wrap">
                          <table className="ath-pwd-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Nombre</th>
                                <th>Dist</th>
                                <th>Tiempo</th>
                                {isRunning && <th>Ritmo</th>}
                                {isCycling && <th>W</th>}
                                <th>FC med</th>
                                <th>FC máx</th>
                                <th>Zona</th>
                              </tr>
                            </thead>
                            <tbody>
                              {laps.map((lap) => {
                                const z = lap.hr_avg ? hrToZone(lap.hr_avg, lt1?.heartRate ?? null, lt2?.heartRate ?? null) : null;
                                return (
                                  <tr key={lap.index}>
                                    <td>{lap.index}</td>
                                    <td className="ath-pwd-td-name">{lap.name ?? `Split ${lap.index}`}</td>
                                    <td>{lap.distance_m >= 1000 ? `${(lap.distance_m / 1000).toFixed(1)}k` : `${Math.round(lap.distance_m)}m`}</td>
                                    <td>{fmtDur(lap.time_s)}</td>
                                    {isRunning && <td className="ath-pwd-td-primary">{lap.pace_s_km ? fmtPace(lap.pace_s_km) : "—"}</td>}
                                    {isCycling && <td className="ath-pwd-td-primary">{lap.power ?? "—"}</td>}
                                    <td>{lap.hr_avg ? Math.round(lap.hr_avg) : "—"}</td>
                                    <td>{lap.hr_max ? Math.round(lap.hr_max) : "—"}</td>
                                    <td>{z ? <span className="ath-pwd-zone-chip" style={{ background: ZONE_COLORS[z] + "20", color: ZONE_COLORS[z] }}>{z}</span> : "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="ath-pwd-empty">Esta actividad no tiene splits/laps registrados.</p>
                  )}
                </div>
              )}

              {/* ═══ TAB: AVANZADO ═══ */}
              {activeTab === "avanzado" && (
                <div className="ath-pwd-tab-content">
                  {/* Metrics Grid */}
                  <div className="ath-pwd-panel">
                    <h4 className="ath-pwd-panel-title">Métricas de rendimiento</h4>
                    <div className="ath-pwd-metrics-grid">
                      {avgHr && <MetricTile label="FC media" value={`${Math.round(avgHr)} bpm`} />}
                      {detail?.max_heartrate && <MetricTile label="FC máxima" value={`${Math.round(detail.max_heartrate)} bpm`} />}
                      {avgPace && isRunning && <MetricTile label="Ritmo medio" value={`${fmtPace(avgPace)}/km`} />}
                      {avgPower && <MetricTile label="Potencia media" value={`${Math.round(avgPower)} W`} />}
                      {detail?.max_watts && <MetricTile label="Potencia máx" value={`${Math.round(detail.max_watts)} W`} />}
                      {avgCadence && <MetricTile label="Cadencia media" value={`${Math.round(avgCadence)} ${isRunning ? "spm" : "rpm"}`} />}
                      {detail?.total_elevation_gain_m && <MetricTile label="Desnivel +" value={`${Math.round(detail.total_elevation_gain_m)} m`} />}
                      {detail?.calories && <MetricTile label="Calorías" value={`${Math.round(detail.calories)} kcal`} />}
                    </div>
                  </div>

                  {/* Advanced Analysis */}
                  <div className="ath-pwd-panel">
                    <h4 className="ath-pwd-panel-title">Análisis avanzado</h4>
                    <div className="ath-pwd-adv-cards">
                      {/* TRIMP */}
                      {trimp > 0 && (
                        <div className="ath-pwd-adv-card">
                          <div className="ath-pwd-adv-top">
                            <span className="ath-pwd-adv-value">{trimp}</span>
                            <span className="ath-pwd-adv-label">TRIMP</span>
                          </div>
                          <p className="ath-pwd-adv-desc">
                            Training Impulse (Banister 1991). Pondera cada minuto de ejercicio por la intensidad de FC
                            usando una función exponencial que modela la curva de lactato.
                            Valores típicos: recuperación 30-50, moderado 80-120, duro 150-250, maratón 300+.
                          </p>
                          <span className="ath-pwd-adv-formula">TRIMP = Σ(Δt × HRR × 0.64 × e^(1.92 × HRR))</span>
                        </div>
                      )}

                      {/* EF */}
                      {ef !== null && (
                        <div className="ath-pwd-adv-card">
                          <div className="ath-pwd-adv-top">
                            <span className="ath-pwd-adv-value">{ef.toFixed(3)}</span>
                            <span className="ath-pwd-adv-label">Efficiency Factor</span>
                          </div>
                          <p className="ath-pwd-adv-desc">
                            Velocidad media ÷ FC media (Coggan / TrainingPeaks).
                            Un EF creciente a la misma FC a lo largo de semanas indica mejora en la eficiencia aeróbica.
                            Compara este valor con tus entrenamientos similares anteriores.
                          </p>
                          <span className="ath-pwd-adv-formula">EF = {isCycling ? "NP" : "NGP"} ÷ Avg HR</span>
                        </div>
                      )}

                      {/* Decoupling */}
                      {decoupling && (
                        <div className={`ath-pwd-adv-card border-${decoupling.tone}`}>
                          <div className="ath-pwd-adv-top">
                            <span className={`ath-pwd-adv-value tone-${decoupling.tone}`}>
                              {decoupling.value > 0 ? "+" : ""}{decoupling.value.toFixed(1)}%
                            </span>
                            <span className="ath-pwd-adv-label">Desacoplamiento ({isCycling ? "Pw:HR" : "Pa:HR"})</span>
                          </div>
                          <p className="ath-pwd-adv-desc">{decoupling.interpretation}</p>
                          <div className="ath-pwd-decoup-detail">
                            <div className="ath-pwd-decoup-half">
                              <span className="ath-pwd-decoup-half-label">1ª mitad ({fmtMinSec(decoupling.rangeStart)}–{fmtMinSec(decoupling.rangeMid)})</span>
                              <span className="ath-pwd-decoup-half-val">EF = {decoupling.ef1.toFixed(3)}</span>
                            </div>
                            <span className="ath-pwd-decoup-arrow">→</span>
                            <div className="ath-pwd-decoup-half">
                              <span className="ath-pwd-decoup-half-label">2ª mitad ({fmtMinSec(decoupling.rangeMid)}–{fmtMinSec(decoupling.rangeEnd)})</span>
                              <span className="ath-pwd-decoup-half-val">EF = {decoupling.ef2.toFixed(3)}</span>
                            </div>
                          </div>
                          <span className="ath-pwd-adv-formula">Se excluye el 15% inicial (calentamiento) y el 10% final (vuelta a la calma). Las dos mitades son iguales en tiempo. Decoupling = (EF₁ − EF₂) / EF₁ × 100 — Friel (Training Bible), Uphill Athlete</span>
                          <div className="ath-pwd-decoup-scale">
                            <span className="ath-pwd-ds-item green">&lt;3.5% bajo AeT</span>
                            <span className="ath-pwd-ds-item green">3.5-5% = AeT</span>
                            <span className="ath-pwd-ds-item amber">5-7.5% leve</span>
                            <span className="ath-pwd-ds-item amber">7.5-10% signif.</span>
                            <span className="ath-pwd-ds-item red">&gt;10% severo</span>
                          </div>
                        </div>
                      )}

                      {/* VI */}
                      {vi !== null && (
                        <div className="ath-pwd-adv-card">
                          <div className="ath-pwd-adv-top">
                            <span className="ath-pwd-adv-value">{vi.toFixed(2)}</span>
                            <span className="ath-pwd-adv-label">Variability Index</span>
                          </div>
                          <p className="ath-pwd-adv-desc">
                            NP ÷ potencia/ritmo medio (Coggan). Mide cuán variable fue el esfuerzo.
                            1.00 = perfectamente constante. Típico: ruta steady 1.02-1.05, intervalos 1.10-1.25, criterium 1.15-1.30.
                          </p>
                          <span className="ath-pwd-adv-formula">VI = NP ÷ Avg {isCycling ? "Power" : "Speed"}</span>
                        </div>
                      )}

                      {/* Fade */}
                      {fadePct !== null && (
                        <div className={`ath-pwd-adv-card border-${Math.abs(fadePct) < 5 ? "green" : Math.abs(fadePct) < 10 ? "amber" : "red"}`}>
                          <div className="ath-pwd-adv-top">
                            <span className={`ath-pwd-adv-value tone-${Math.abs(fadePct) < 5 ? "green" : "amber"}`}>
                              {fadePct > 0 ? "+" : ""}{fadePct.toFixed(1)}%
                            </span>
                            <span className="ath-pwd-adv-label">Interval Fade</span>
                          </div>
                          <p className="ath-pwd-adv-desc">
                            Diferencia de rendimiento entre el primer y último intervalo.
                            &lt;5% = excelente ejecución (intervalos bien dosificados).
                            &gt;10% = fatiga significativa o inicio demasiado rápido.
                          </p>
                          <span className="ath-pwd-adv-formula">Fade = ({isRunning ? "último_ritmo − primer_ritmo" : "primera_potencia − última_potencia"}) ÷ {isRunning ? "primer_ritmo" : "primera_potencia"} × 100</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ TAB: FEEDBACK ═══ */}
              {activeTab === "feedback" && (
                <div className="ath-pwd-tab-content">
                  <div className="ath-pwd-panel">
                    <h4 className="ath-pwd-panel-title">¿Cómo te has sentido?</h4>
                    <p className="ath-pwd-panel-subtitle" style={{ marginBottom: 16 }}>RPE (Rating of Perceived Exertion) — escala 1-10 de Borg modificada</p>
                    <div className="ath-pwd-rpe-row">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                        <button
                          key={v} type="button"
                          className={`ath-pwd-rpe-btn ${rpe === v ? "active" : ""} ${v <= 3 ? "easy" : v <= 6 ? "moderate" : v <= 8 ? "hard" : "max"}`}
                          onClick={() => setRpe(v)}
                        >{v}</button>
                      ))}
                    </div>
                    {rpe && (
                      <span className="ath-pwd-rpe-label">
                        {rpe <= 2 ? "Muy fácil" : rpe <= 4 ? "Fácil" : rpe <= 6 ? "Moderado" : rpe <= 8 ? "Duro" : "Máximo"}
                      </span>
                    )}
                    <textarea
                      className="ath-pwd-note-input"
                      placeholder="Nota para tu entrenador (sensaciones, fatiga, molestias...)"
                      value={athleteNote}
                      onChange={(e) => setAthleteNote(e.target.value)}
                      rows={3}
                    />
                    {(rpe || athleteNote) && (
                      <button type="button" className="ath-pwd-save-btn" onClick={handleSaveNote}>
                        Guardar feedback
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ath-pwd-mc">
      <span className="ath-pwd-mc-val">{value}</span>
      <span className="ath-pwd-mc-lbl">{label}</span>
    </div>
  );
}

function MiniMetric({ label, value, tooltip, tone }: { label: string; value: string; tooltip: string; tone?: string }) {
  return (
    <div className={`ath-pwd-mini-metric ${tone ? `tone-${tone}` : ""}`} title={tooltip}>
      <span className="ath-pwd-mm-value">{value}</span>
      <span className="ath-pwd-mm-label">{label}</span>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ath-pwd-metric-tile">
      <span className="ath-pwd-mt-value">{value}</span>
      <span className="ath-pwd-mt-label">{label}</span>
    </div>
  );
}

function ZoneBar({ buckets, variant = "real" }: { buckets: ZoneBucket[]; variant?: "plan" | "real" }) {
  const total = buckets.reduce((s, b) => s + b.seconds, 0);
  if (total <= 0) return null;
  return (
    <div className="ath-pwd-zone-bar">
      {buckets.map((b) => {
        // Plan = same color at 35% opacity with dashed border; Real = full color
        const bg = variant === "plan" ? b.color + "38" : b.color;
        const border = variant === "plan" ? `2px dashed ${b.color}80` : "none";
        return (
          <div key={b.zone} className={`ath-pwd-zone-bar-seg ${variant}`}
            style={{ flex: b.seconds / total, backgroundColor: bg, border }}
            title={`${b.label}: ${Math.round(b.seconds / 60)} min (${b.pct ?? Math.round((b.seconds / total) * 100)}%)`}
          >
            {(b.seconds / total) > 0.1 && (
              <span className="ath-pwd-zone-bar-txt">{Math.round(b.seconds / 60)}′</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ZoneLegend({ planned, actual }: { planned: ZoneBucket[]; actual: ZoneBucket[] }) {
  return (
    <div className="ath-pwd-zone-legend">
      {planned.length > 0 && (
        <span className="ath-pwd-zl-item ath-pwd-zl-key">
          <span className="ath-pwd-zl-swatch plan" />
          <span>Plan</span>
        </span>
      )}
      {actual.length > 0 && (
        <span className="ath-pwd-zl-item ath-pwd-zl-key">
          <span className="ath-pwd-zl-swatch real" />
          <span>Real</span>
        </span>
      )}
      {ZONE_ORDER.map((z) => {
        if (!actual.some((b) => b.zone === z) && !planned.some((b) => b.zone === z)) return null;
        return (
          <span key={z} className="ath-pwd-zl-item">
            <span className="ath-pwd-zl-dot" style={{ background: ZONE_COLORS[z] }} />
            <span>{z} {ZONE_LABELS[z]}</span>
          </span>
        );
      })}
    </div>
  );
}

function TimelineTooltip({ active, payload, isRunning, isCycling }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TimelinePoint | undefined;
  if (!d) return null;
  return (
    <div className="ath-pwd-tooltip">
      <span className="ath-pwd-tt-time">{Math.floor(d.t / 60)}'{String(Math.round(d.t % 60)).padStart(2, "0")}"</span>
      {d.hr && <span>FC: {d.hr} bpm</span>}
      {isRunning && d.pace && <span>Ritmo: {fmtPace(d.pace)}/km</span>}
      {isCycling && d.power && <span>Potencia: {d.power}W</span>}
      {d.cadence && <span>Cadencia: {d.cadence}</span>}
      {d.altitude != null && <span>Altitud: {d.altitude.toFixed(0)} m</span>}
      {d.zone && <span style={{ color: ZONE_COLORS[d.zone] }}>{d.zone} — {ZONE_LABELS[d.zone]}</span>}
    </div>
  );
}

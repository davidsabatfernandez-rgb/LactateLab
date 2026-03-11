import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../lib/api";
import { Athlete, GarminActivitiesPreviewResponse, GarminActivity } from "../types";

type GarminConnectPageProps = {
  token: string;
  athletes: Athlete[];
  onDataChanged: () => Promise<void>;
};

type InsightTone = "positive" | "warning" | "neutral";

type GarminMetricItem = {
  label: string;
  value: string;
  hint?: string;
};

type GarminActivityInsight = {
  score: { label: string; tone: InsightTone; value: number };
  headline: string;
  copy: string;
  note: string;
  noteTone: Exclude<InsightTone, "positive">;
  tags: string[];
  loadMetrics: GarminMetricItem[];
  dynamicsMetrics: GarminMetricItem[];
  overviewMetrics: GarminMetricItem[];
};

type GarminLapChartMode = "heartRate" | "power" | "speed";

type GarminStreamChartMode =
  | "heartRate"
  | "power"
  | "cadence"
  | "temperature"
  | "respiration"
  | "leftTorque"
  | "leftSmoothness";

type GarminLapChartPoint = {
  key: string;
  label: string;
  durationLabel: string;
  distanceLabel: string;
  heartRateValue?: number | null;
  wattsValue?: number | null;
  speedValue?: number | null;
  speedLabel: string;
};

type GarminChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: GarminLapChartPoint }>;
};

type GarminStreamChartPoint = {
  key: string;
  elapsedSeconds: number;
  label: string;
  timestampLabel?: string;
  heartRate?: number | null;
  power?: number | null;
  cadence?: number | null;
  temperature?: number | null;
  respiration?: number | null;
  leftTorque?: number | null;
  leftSmoothness?: number | null;
};

type GarminStreamChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: GarminStreamChartPoint }>;
};

type GarminZoneBucket = {
  key: string;
  zoneNumber: number;
  boundaryLabel: string;
  seconds: number;
  share: number;
};

type GarminZoneSummary = {
  key: "heartRate" | "power";
  label: string;
  totalSeconds: number;
  buckets: GarminZoneBucket[];
};

type GarminPowerCurvePoint = {
  key: string;
  label: string;
  seconds: number;
  watts: number;
};

type GarminStreamNumericKey =
  | "heartRate"
  | "power"
  | "cadence"
  | "temperature"
  | "respiration"
  | "leftTorque"
  | "leftSmoothness";

function compactMetrics(items: Array<GarminMetricItem | null>): GarminMetricItem[] {
  return items.filter((item): item is GarminMetricItem => item !== null);
}

function disciplineLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "running") return "Carrera";
  if (normalized === "cycling" || normalized === "ciclismo") return "Ciclismo";
  if (normalized === "swimming" || normalized === "natación") return "Natación";
  if (normalized === "triatlón" || normalized === "triatlon") return "Triatlón";
  return value;
}

function athleteGoalLabel(athlete: Athlete) {
  if (athlete.targets && athlete.targets.length > 0) {
    return athlete.targets[0]?.objective ?? "Sin objetivo definido";
  }
  return athlete.training_goal ?? "Sin objetivo definido";
}

function athleteFocusLabel(athlete: Athlete) {
  if (athlete.focus_blocks && athlete.focus_blocks.length > 0) {
    return athlete.focus_blocks[0]?.block_objective ?? "Sin bloque activo";
  }
  return "Sin bloque activo";
}

function garminPriority(athlete: Athlete) {
  const discipline = athlete.primary_discipline.toLowerCase();
  if (discipline.includes("cycl")) return "Alta";
  if (discipline.includes("run")) return "Alta";
  if (discipline.includes("tri")) return "Alta";
  if (discipline.includes("swim")) return "Media";
  return "Media";
}

function recommendedFirstSync(athlete: Athlete) {
  const discipline = athlete.primary_discipline.toLowerCase();
  if (discipline.includes("cycl")) return "Actividades + potencia + laps";
  if (discipline.includes("run")) return "Actividades + ritmo + FC";
  if (discipline.includes("tri")) return "Actividades + multideporte + transiciones";
  if (discipline.includes("swim")) return "Actividades + series + ritmo/100m";
  return "Actividades básicas y detalle de sesión";
}

function formatDistance(distanceM: number) {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 1 : 2)} km`;
}

function formatCompactDistance(distanceM: number) {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 1 : 2)} km`;
}

function formatDuration(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
}

function formatDurationShort(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMovementMetric(speed?: number | null, sportType?: string) {
  if (!speed || speed <= 0) return "n/d";
  const normalized = (sportType ?? "").toLowerCase();
  if (normalized.includes("swim")) {
    const secondsPer100m = 100 / speed;
    const minutes = Math.floor(secondsPer100m / 60);
    const seconds = Math.round(secondsPer100m % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}/100m`;
  }
  if (normalized.includes("ride") || normalized.includes("cycle") || normalized.includes("bike")) {
    return `${(speed * 3.6).toFixed(1)} km/h`;
  }
  const secondsPerKm = 1000 / speed;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}/km`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sportLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("run")) return "Carrera";
  if (normalized.includes("ride") || normalized.includes("cycle") || normalized.includes("bike")) return "Ciclismo";
  if (normalized.includes("swim")) return "Natación";
  if (normalized.includes("walk")) return "Caminata";
  if (normalized.includes("strength")) return "Fuerza";
  return value;
}

function sportToneClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("run")) return "run";
  if (normalized.includes("ride") || normalized.includes("cycle") || normalized.includes("bike")) return "ride";
  if (normalized.includes("swim")) return "swim";
  if (normalized.includes("strength")) return "strength";
  return "other";
}

function formatNumber(value?: number | null, suffix = "", digits = 0) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "n/d";
  return `${value.toFixed(digits)}${suffix}`;
}

function formatLatLng(value: number[]) {
  if (!Array.isArray(value) || !value.length) return "n/d";
  return value.map((item) => item.toFixed(5)).join(", ");
}

function formatRecoveryHours(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "n/d";
  const normalized = value > 240 ? value / 3600 : value;
  if (normalized >= 24) {
    const days = Math.floor(normalized / 24);
    const hours = Math.round(normalized % 24);
    return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  }
  return `${Math.round(normalized)} h`;
}

function normalizeGarminActivity(activity: GarminActivity): GarminActivity {
  return {
    ...activity,
    start_latlng: Array.isArray(activity.start_latlng) ? activity.start_latlng : [],
    end_latlng: Array.isArray(activity.end_latlng) ? activity.end_latlng : [],
    laps: Array.isArray(activity.laps) ? activity.laps : [],
    raw_detail: activity.raw_detail && typeof activity.raw_detail === "object" ? activity.raw_detail : {},
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readPath(source: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function coerceUnknownNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceUnknownString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function pickNumber(sources: Array<Record<string, unknown> | null>, paths: string[]) {
  for (const source of sources) {
    if (!source) continue;
    for (const path of paths) {
      const value = coerceUnknownNumber(readPath(source, path));
      if (value !== null) return value;
    }
  }
  return null;
}

function pickString(sources: Array<Record<string, unknown> | null>, paths: string[]) {
  for (const source of sources) {
    if (!source) continue;
    for (const path of paths) {
      const value = coerceUnknownString(readPath(source, path));
      if (value) return value;
    }
  }
  return null;
}

function formatPercentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatZoneBoundary(value: number | null, kind: "heartRate" | "power") {
  if (value === null || !Number.isFinite(value)) return "n/d";
  return kind === "heartRate" ? `${Math.round(value)} bpm` : `${Math.round(value)} W`;
}

function formatStreamMetricValue(mode: GarminStreamChartMode, value: number) {
  if (mode === "heartRate") return `${Math.round(value)} bpm`;
  if (mode === "power") return `${Math.round(value)} W`;
  if (mode === "cadence") return `${Math.round(value)} rpm`;
  if (mode === "temperature") return `${value.toFixed(1)} ºC`;
  if (mode === "respiration") return `${value.toFixed(1)} rpm`;
  return `${value.toFixed(1)} %`;
}

function garminStreamChartModeLabel(mode: GarminStreamChartMode) {
  if (mode === "heartRate") return "FC";
  if (mode === "power") return "Potencia";
  if (mode === "cadence") return "Cadencia";
  if (mode === "temperature") return "Temperatura";
  if (mode === "respiration") return "Respiración";
  if (mode === "leftTorque") return "Torque izq";
  return "Smoothness izq";
}

function garminStreamDataKey(mode: GarminStreamChartMode) {
  if (mode === "heartRate") return "heartRate";
  if (mode === "power") return "power";
  if (mode === "cadence") return "cadence";
  if (mode === "temperature") return "temperature";
  if (mode === "respiration") return "respiration";
  if (mode === "leftTorque") return "leftTorque";
  return "leftSmoothness";
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asOptionalNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => coerceUnknownNumber(item));
}

function buildGarminZones(activity: GarminActivity): GarminZoneSummary[] {
  const rawDetail = asRecord(activity.raw_detail);
  const extras = asRecord(rawDetail?.extras);
  const sources: Array<{ key: "heartRate" | "power"; label: string; payload: unknown }> = [
    { key: "heartRate", label: "Tiempo en zonas FC", payload: extras?.hr_time_in_zones ?? extras?.heartRateTimeInZones },
    { key: "power", label: "Tiempo en zonas potencia", payload: extras?.power_time_in_zones ?? extras?.powerTimeInZones },
  ];

  return sources.flatMap((source) => {
    const payload = Array.isArray(source.payload) ? source.payload : [];
    const buckets = payload
      .map((item, index) => {
        const zone = asRecord(item);
        const seconds = pickNumber([zone], ["secsInZone", "secondsInZone", "timeInZone"]);
        if (seconds === null || seconds <= 0) return null;
        const zoneNumber = pickNumber([zone], ["zoneNumber", "zone"]) ?? index + 1;
        const lowBoundary = pickNumber([zone], ["zoneLowBoundary", "lowBoundary", "from"]);
        return {
          zoneNumber,
          seconds,
          lowBoundary,
        };
      })
      .filter((item): item is { zoneNumber: number; seconds: number; lowBoundary: number | null } => item !== null);

    const totalSeconds = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
    if (!buckets.length || totalSeconds <= 0) return [];

    return [
      {
        key: source.key,
        label: source.label,
        totalSeconds,
        buckets: buckets.map((bucket) => ({
          key: `${source.key}-${bucket.zoneNumber}`,
          zoneNumber: bucket.zoneNumber,
          boundaryLabel: formatZoneBoundary(bucket.lowBoundary, source.key),
          seconds: bucket.seconds,
          share: bucket.seconds / totalSeconds,
        })),
      },
    ];
  });
}

function buildGarminPowerCurve(activity: GarminActivity): GarminPowerCurvePoint[] {
  const rawDetail = asRecord(activity.raw_detail);
  const summary = asRecord(rawDetail?.summary);
  const detail = asRecord(rawDetail?.detail);
  const summaryDto = asRecord(detail?.summaryDTO);
  const sources = [summaryDto, detail, summary];
  const curve = new Map<number, number>();

  for (const source of sources) {
    if (!source) continue;
    for (const [key, rawValue] of Object.entries(source)) {
      const value = coerceUnknownNumber(rawValue);
      if (value === null || value <= 0) continue;
      if (key === "maxPowerTwentyMinutes") {
        curve.set(20 * 60, value);
        continue;
      }
      const match = key.match(/^maxAvgPower_(\d+)$/);
      if (match) {
        curve.set(Number(match[1]), value);
      }
    }
  }

  return [...curve.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seconds, watts]) => ({
      key: `pc-${seconds}`,
      seconds,
      watts,
      label: seconds < 60 ? `${seconds}s` : seconds % 60 === 0 ? `${seconds / 60}m` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`,
    }));
}

function buildGarminStreamData(activity: GarminActivity): GarminStreamChartPoint[] {
  const rawDetail = asRecord(activity.raw_detail);
  const extras = asRecord(rawDetail?.extras);
  const fitFile = asRecord(extras?.fit_file);
  const fitStreams = asRecord(fitFile?.streams);
  const activityDetails = asRecord(extras?.activity_details);
  const streamMap = new Map<string, GarminStreamChartPoint & { timestampMs?: number }>();

  const ensurePoint = (key: string) => {
    const existing = streamMap.get(key);
    if (existing) return existing;
    const point: GarminStreamChartPoint & { timestampMs?: number } = {
      key,
      elapsedSeconds: 0,
      label: "0:00",
    };
    streamMap.set(key, point);
    return point;
  };

  const fitTimestamps = asStringArray(fitStreams?.timestamp);
  const fitStreamEntries: Array<[GarminStreamNumericKey, string]> = [
    ["heartRate", "heart_rate"],
    ["power", "power"],
    ["cadence", "cadence"],
    ["temperature", "temperature"],
  ];

  const firstFitTimestamp = normalizeTimestamp(fitTimestamps[0]);
  fitTimestamps.forEach((timestamp, index) => {
    const timestampMs = normalizeTimestamp(timestamp);
    const key = timestampMs !== null ? `t:${timestampMs}` : `fit:${index}`;
    const point = ensurePoint(key);
    point.timestampMs = timestampMs ?? undefined;
    point.timestampLabel = timestamp;
    point.elapsedSeconds =
      timestampMs !== null && firstFitTimestamp !== null ? Math.max(0, Math.round((timestampMs - firstFitTimestamp) / 1000)) : index;
    fitStreamEntries.forEach(([targetKey, sourceKey]) => {
      const values = asOptionalNumberArray(fitStreams?.[sourceKey]);
      const value = values[index];
      if (value !== undefined && value !== null) {
        point[targetKey] = value;
      }
    });
  });

  const descriptors = Array.isArray(activityDetails?.metricDescriptors) ? activityDetails.metricDescriptors : [];
  const descriptorMap = new Map<string, number>();
  descriptors.forEach((descriptor) => {
    const record = asRecord(descriptor);
    const key = coerceUnknownString(record?.key);
    const metricsIndex = pickNumber([record], ["metricsIndex"]);
    if (key && metricsIndex !== null) {
      descriptorMap.set(key, metricsIndex);
    }
  });

  const detailMetrics = Array.isArray(activityDetails?.activityDetailMetrics) ? activityDetails.activityDetailMetrics : [];
  const firstDetailTimestamp = (() => {
    const firstRow = asRecord(detailMetrics[0]);
    const metrics = Array.isArray(firstRow?.metrics) ? firstRow.metrics : [];
    const timestampIndex = descriptorMap.get("directTimestamp");
    if (timestampIndex === undefined) return null;
    return coerceUnknownNumber(metrics[timestampIndex]);
  })();

  detailMetrics.forEach((row, index) => {
    const rowRecord = asRecord(row);
    const metrics = Array.isArray(rowRecord?.metrics) ? rowRecord.metrics : [];
    const timestampMs = (() => {
      const descriptorIndex = descriptorMap.get("directTimestamp");
      return descriptorIndex !== undefined ? coerceUnknownNumber(metrics[descriptorIndex]) : null;
    })();
    const elapsedSeconds = (() => {
      const durationIndex = descriptorMap.get("sumDuration") ?? descriptorMap.get("sumElapsedDuration");
      const durationValue = durationIndex !== undefined ? coerceUnknownNumber(metrics[durationIndex]) : null;
      if (durationValue !== null) return durationValue;
      if (timestampMs !== null && firstDetailTimestamp !== null) {
        return Math.max(0, Math.round((timestampMs - firstDetailTimestamp) / 1000));
      }
      return index;
    })();
    const key = timestampMs !== null ? `t:${timestampMs}` : `detail:${index}`;
    const point = ensurePoint(key);
    point.timestampMs = timestampMs ?? point.timestampMs;
    point.elapsedSeconds = point.elapsedSeconds || elapsedSeconds;
    point.timestampLabel = point.timestampLabel ?? (timestampMs !== null ? new Date(timestampMs).toISOString() : undefined);

    const applyMetric = (descriptorKey: string, targetKey: GarminStreamNumericKey) => {
      const descriptorIndex = descriptorMap.get(descriptorKey);
      if (descriptorIndex === undefined) return;
      const value = coerceUnknownNumber(metrics[descriptorIndex]);
      if (value !== null) {
        point[targetKey] = value;
      }
    };

    applyMetric("directHeartRate", "heartRate");
    applyMetric("directPower", "power");
    applyMetric("directBikeCadence", "cadence");
    applyMetric("directAirTemperature", "temperature");
    applyMetric("directRespirationRate", "respiration");
    applyMetric("directLeftTorqueEffectiveness", "leftTorque");
    applyMetric("directLeftPedalSmoothness", "leftSmoothness");
  });

  return [...streamMap.values()]
    .sort((a, b) => {
      if (a.timestampMs != null && b.timestampMs != null) return a.timestampMs - b.timestampMs;
      return a.elapsedSeconds - b.elapsedSeconds;
    })
    .map((point, index) => ({
      ...point,
      key: point.key || `stream-${index}`,
      elapsedSeconds: point.elapsedSeconds ?? index,
      label: formatDurationShort(point.elapsedSeconds ?? index),
      timestampLabel: point.timestampLabel ? formatDateTime(point.timestampLabel) : undefined,
    }));
}

function availableGarminStreamModes(points: GarminStreamChartPoint[]): GarminStreamChartMode[] {
  const modes: GarminStreamChartMode[] = [];
  if (points.some((point) => point.heartRate != null)) modes.push("heartRate");
  if (points.some((point) => point.power != null)) modes.push("power");
  if (points.some((point) => point.cadence != null)) modes.push("cadence");
  if (points.some((point) => point.temperature != null)) modes.push("temperature");
  if (points.some((point) => point.respiration != null)) modes.push("respiration");
  if (points.some((point) => point.leftTorque != null)) modes.push("leftTorque");
  if (points.some((point) => point.leftSmoothness != null)) modes.push("leftSmoothness");
  return modes;
}

function renderGarminStreamChartTooltip(props: GarminStreamChartTooltipProps, mode: GarminStreamChartMode) {
  if (!props.active || !props.payload?.length) return null;
  const point = props.payload[0]?.payload;
  if (!point) return null;
  const selectedValue = point[garminStreamDataKey(mode) as keyof GarminStreamChartPoint];
  const numericValue = typeof selectedValue === "number" ? selectedValue : null;

  return (
    <div className="chart-tooltip">
      <strong>{point.label}</strong>
      {point.timestampLabel ? <span>{point.timestampLabel}</span> : null}
      <span>{numericValue !== null ? formatStreamMetricValue(mode, numericValue) : "n/d"}</span>
      {mode !== "heartRate" && point.heartRate != null ? <span>FC {Math.round(point.heartRate)} bpm</span> : null}
      {mode !== "power" && point.power != null ? <span>{Math.round(point.power)} W</span> : null}
      {mode !== "cadence" && point.cadence != null ? <span>{Math.round(point.cadence)} rpm</span> : null}
    </div>
  );
}

function buildGarminStreamStat(points: GarminStreamChartPoint[], mode: GarminStreamChartMode) {
  const key = garminStreamDataKey(mode) as keyof GarminStreamChartPoint;
  const values = points
    .map((point) => point[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    label: garminStreamChartModeLabel(mode),
    average: formatStreamMetricValue(mode, average),
    max: formatStreamMetricValue(mode, Math.max(...values)),
    min: formatStreamMetricValue(mode, Math.min(...values)),
  };
}

function buildGarminActivityInsight(activity: GarminActivity): GarminActivityInsight {
  const rawDetail = asRecord(activity.raw_detail);
  const summary = asRecord(rawDetail?.summary);
  const detail = asRecord(rawDetail?.detail);
  const summaryDto = asRecord(detail?.summaryDTO);
  const metadataDto = asRecord(detail?.metadataDTO);
  const weatherDto = asRecord(detail?.weatherDTO);
  const extras = asRecord(rawDetail?.extras);
  const fitFile = asRecord(extras?.fit_file);
  const fitStreams = asRecord(fitFile?.streams);
  const sources = [detail, summaryDto, summary, metadataDto, weatherDto];
  const rawSplits = Array.isArray(rawDetail?.splits) ? rawDetail.splits : [];
  const fitRecordCount = pickNumber([fitFile], ["record_count"]);
  const fitLapCount = pickNumber([fitFile], ["lap_count"]);
  const fitSessionCount = pickNumber([fitFile], ["session_count"]);
  const fitFieldCount = Array.isArray(fitFile?.record_fields) ? fitFile.record_fields.length : 0;
  const fitStreamCount = fitStreams ? Object.keys(fitStreams).length : 0;
  const fitAvailable = readPath(fitFile, "available") === true;

  const aerobicTrainingEffect = pickNumber(sources, ["aerobicTrainingEffect", "trainingEffect"]);
  const anaerobicTrainingEffect = pickNumber(sources, ["anaerobicTrainingEffect"]);
  const trainingEffectLabel = pickString(sources, ["trainingEffectLabel", "activityTrainingLoadUnit", "activityTrainingLoadUnitDTO.unitKey"]);
  const exerciseLoad = pickNumber(sources, ["activityTrainingLoad", "exerciseLoad", "exerciseTrainingLoad", "trainingLoad"]);
  const trainingStressScore = pickNumber(sources, ["trainingStressScore", "tss"]);
  const intensityFactor = pickNumber(sources, ["intensityFactor"]);
  const normalizedPower = pickNumber(sources, ["normalizedPower", "normPower"]);
  const vo2max = pickNumber(sources, ["vO2MaxValue", "vo2MaxValue"]);
  const recoveryHours = pickNumber(sources, ["recoveryHours", "recoveryTime", "recoveryTimeInHours"]);
  const performanceCondition = pickNumber(sources, ["performanceCondition", "avgPerformanceCondition"]);
  const respirationAvg = pickNumber(sources, ["averageRespirationRate", "avgRespirationRate"]);
  const respirationMax = pickNumber(sources, ["maxRespirationRate"]);
  const respirationMin = pickNumber(sources, ["minRespirationRate"]);
  const leftTorqueEffectiveness = pickNumber(sources, ["leftTorqueEffectiveness", "avgLeftTorqueEffectiveness"]);
  const rightTorqueEffectiveness = pickNumber(sources, ["rightTorqueEffectiveness", "avgRightTorqueEffectiveness"]);
  const leftPedalSmoothness = pickNumber(sources, ["leftPedalSmoothness", "avgLeftPedalSmoothness"]);
  const rightPedalSmoothness = pickNumber(sources, ["rightPedalSmoothness", "avgRightPedalSmoothness"]);
  const runningCadence = pickNumber(sources, ["averageRunningCadenceInStepsPerMinute", "averageRunCadence", "averageRunningCadence"]);
  const maxRunningCadence = pickNumber(sources, ["maxRunningCadenceInStepsPerMinute", "maxRunCadence", "maxRunningCadence"]);
  const bikeCadence = pickNumber(sources, ["averageBikeCadence"]);
  const strideLength = pickNumber(sources, ["avgStrideLength", "averageStrideLength"]);
  const groundContactTime = pickNumber(sources, ["avgGroundContactTime", "averageGroundContactTime"]);
  const verticalOscillation = pickNumber(sources, ["avgVerticalOscillation", "averageVerticalOscillation"]);
  const verticalRatio = pickNumber(sources, ["avgVerticalRatio", "averageVerticalRatio"]);
  const averageTemperature = pickNumber(sources, ["avgTemperature", "averageTemperature"]);
  const maxTemperature = pickNumber(sources, ["maxTemperature"]);
  const elevationLoss = pickNumber(sources, ["elevationLoss"]);
  const minElevation = pickNumber(sources, ["minElevation"]);
  const maxElevation = pickNumber(sources, ["maxElevation"]);
  const avgSwolf = pickNumber(sources, ["averageSWOLF", "avgSwolf", "swolf"]);
  const strokeDistance = pickNumber(sources, ["averageStrokeDistance", "avgStrokeDistance"]);
  const strokeRate = pickNumber(sources, ["averageStrokeCadence", "averageStrokeRate"]);
  const strokeCount = pickNumber(sources, ["totalStrokeCount", "totalNumberOfStrokes"]);

  const loadMetrics = compactMetrics([
    aerobicTrainingEffect !== null ? { label: "TE aeróbico", value: formatNumber(aerobicTrainingEffect, "", 1), hint: "Training effect principal" } : null,
    anaerobicTrainingEffect !== null ? { label: "TE anaeróbico", value: formatNumber(anaerobicTrainingEffect, "", 1), hint: "Componente alta intensidad" } : null,
    exerciseLoad !== null ? { label: "Exercise load", value: formatNumber(exerciseLoad, "", 0), hint: "Carga reportada por Garmin" } : null,
    trainingStressScore !== null ? { label: "TSS", value: formatNumber(trainingStressScore, "", 0), hint: "Training stress score" } : null,
    intensityFactor !== null ? { label: "IF", value: formatNumber(intensityFactor, "", 2), hint: "Intensity factor" } : null,
    normalizedPower !== null ? { label: "Potencia normalizada", value: formatNumber(normalizedPower, " W", 0), hint: "NP del archivo Garmin" } : null,
    recoveryHours !== null ? { label: "Recuperación", value: formatRecoveryHours(recoveryHours), hint: "Tiempo recomendado" } : null,
    vo2max !== null ? { label: "VO2max Garmin", value: formatNumber(vo2max, "", 1), hint: "Estimación del dispositivo" } : null,
    performanceCondition !== null ? { label: "Performance condition", value: formatNumber(performanceCondition, "", 0), hint: "Estado durante la sesión" } : null,
  ]);

  const dynamicsMetrics = compactMetrics([
    runningCadence !== null ? { label: "Cadencia carrera", value: formatNumber(runningCadence, " spm", 0), hint: maxRunningCadence !== null ? `Máx ${formatNumber(maxRunningCadence, " spm", 0)}` : "Steps per minute" } : null,
    bikeCadence !== null ? { label: "Cadencia ciclismo", value: formatNumber(bikeCadence, " rpm", 0) } : null,
    leftTorqueEffectiveness !== null ? { label: "Torque effectiveness izq", value: formatNumber(leftTorqueEffectiveness, " %", 1) } : null,
    rightTorqueEffectiveness !== null ? { label: "Torque effectiveness der", value: formatNumber(rightTorqueEffectiveness, " %", 1) } : null,
    leftPedalSmoothness !== null ? { label: "Pedal smoothness izq", value: formatNumber(leftPedalSmoothness, " %", 1) } : null,
    rightPedalSmoothness !== null ? { label: "Pedal smoothness der", value: formatNumber(rightPedalSmoothness, " %", 1) } : null,
    strideLength !== null ? { label: "Longitud zancada", value: formatNumber(strideLength, " m", 2) } : null,
    groundContactTime !== null ? { label: "Ground contact", value: formatNumber(groundContactTime, " ms", 0) } : null,
    verticalOscillation !== null ? { label: "Vertical oscillation", value: formatNumber(verticalOscillation, " cm", 1) } : null,
    verticalRatio !== null ? { label: "Vertical ratio", value: formatNumber(verticalRatio, " %", 1) } : null,
    respirationAvg !== null ? { label: "Respiración media", value: formatNumber(respirationAvg, " rpm", 1), hint: respirationMax !== null || respirationMin !== null ? `Min ${formatNumber(respirationMin, "", 1)} · Máx ${formatNumber(respirationMax, "", 1)}` : undefined } : null,
    averageTemperature !== null ? { label: "Temperatura media", value: formatNumber(averageTemperature, " ºC", 0), hint: maxTemperature !== null ? `Máx ${formatNumber(maxTemperature, " ºC", 0)}` : undefined } : null,
    avgSwolf !== null ? { label: "SWOLF", value: formatNumber(avgSwolf, "", 0) } : null,
    strokeDistance !== null ? { label: "Distancia por brazada", value: formatNumber(strokeDistance, " m", 2) } : null,
    strokeRate !== null ? { label: "Stroke rate", value: formatNumber(strokeRate, " spm", 0) } : null,
    strokeCount !== null ? { label: "Total strokes", value: formatNumber(strokeCount, "", 0) } : null,
  ]);

  const overviewMetrics: GarminMetricItem[] = [
    { label: "Dispositivo", value: activity.device_name ?? "n/d" },
    { label: "Zona horaria", value: activity.timezone ?? "n/d" },
    { label: "Inicio", value: formatLatLng(activity.start_latlng) },
    { label: "Final", value: formatLatLng(activity.end_latlng) },
    { label: "Laps visibles", value: String(activity.laps.length) },
    { label: "Splits crudos", value: String(rawSplits.length) },
    { label: "FIT parseado", value: fitAvailable ? "Sí" : "No" },
    { label: "FIT records", value: fitRecordCount !== null ? formatNumber(fitRecordCount, "", 0) : "n/d" },
    { label: "FIT streams", value: fitStreamCount ? String(fitStreamCount) : "n/d" },
    { label: "FIT fields", value: fitFieldCount ? String(fitFieldCount) : "n/d" },
    { label: "FIT laps/sessions", value: fitLapCount !== null || fitSessionCount !== null ? `${fitLapCount !== null ? formatNumber(fitLapCount, "", 0) : "n/d"} · ${fitSessionCount !== null ? formatNumber(fitSessionCount, "", 0) : "n/d"}` : "n/d" },
    { label: "Elevación+", value: formatNumber(activity.total_elevation_gain_m, " m", 0) },
    { label: "Elevación-", value: formatNumber(elevationLoss, " m", 0) },
    { label: "Rango altitud", value: minElevation !== null || maxElevation !== null ? `${formatNumber(minElevation, " m", 0)} · ${formatNumber(maxElevation, " m", 0)}` : "n/d" },
    { label: "Calorías", value: formatNumber(activity.calories, "", 0) },
    { label: "Payload detail", value: detail ? `${Object.keys(detail).length} claves` : "n/d" },
    { label: "SummaryDTO", value: summaryDto ? `${Object.keys(summaryDto).length} claves` : "n/d" },
  ];

  const availableSignals = [
    activity.laps.length > 0,
    activity.average_heartrate != null,
    activity.average_watts != null,
    activity.total_elevation_gain_m != null,
    Boolean(activity.device_name),
    Boolean(activity.description),
    rawSplits.length > 0,
    fitAvailable,
    loadMetrics.length > 0,
    dynamicsMetrics.length > 0,
    Boolean(detail),
  ].filter(Boolean).length;

  const score =
    availableSignals >= 8
      ? { label: "Señal alta", tone: "positive" as const, value: availableSignals }
      : availableSignals >= 5
        ? { label: "Señal media", tone: "warning" as const, value: availableSignals }
        : { label: "Señal base", tone: "neutral" as const, value: availableSignals };

  const detectedSignals = [
    loadMetrics.length ? "carga interna" : null,
    aerobicTrainingEffect !== null || anaerobicTrainingEffect !== null ? "training effect" : null,
    normalizedPower !== null || intensityFactor !== null ? "potencia derivada" : null,
    dynamicsMetrics.some((item) => ["Cadencia carrera", "Longitud zancada", "Ground contact", "Vertical oscillation", "Vertical ratio"].includes(item.label))
      ? "biomecánica"
      : null,
    dynamicsMetrics.some((item) => item.label.includes("Respiración")) ? "respiración" : null,
    avgSwolf !== null || strokeDistance !== null ? "eficiencia acuática" : null,
    fitAvailable ? "FIT parseado" : null,
    activity.start_latlng.length || activity.end_latlng.length ? "coordenadas" : null,
  ].filter((item): item is string => Boolean(item));

  const sport = sportLabel(activity.sport_type);
  const headline =
    loadMetrics.length >= 4 && dynamicsMetrics.length >= 3
      ? `${sport} con lectura avanzada de carga y dinámica`
      : loadMetrics.length >= 3
        ? `${sport} con señal Garmin útil para carga y recuperación`
        : dynamicsMetrics.length >= 3
          ? `${sport} con biometría visible más allá del resumen básico`
          : "Preview Garmin base listo para inspección";

  const copy = detectedSignals.length
    ? `Garmin ya está aportando ${detectedSignals.join(", ")}. Esta vista sirve para decidir qué conviene mapear a sesión interna y qué campos merece la pena persistir como señal avanzada.`
    : "El preview ya permite revisar la estructura base de la actividad y explorar qué trae el payload completo antes de diseñar el import definitivo.";

  const note = loadMetrics.length || dynamicsMetrics.length
    ? `Se detectan ${loadMetrics.length + dynamicsMetrics.length} métricas avanzadas además del resumen base. Este es el punto bueno para decidir qué campos pasan a contrato estable y cuáles se quedan como payload crudo de soporte.`
    : "La actividad todavía solo expone señal básica. Si el payload crudo trae más información, habrá que subirla a campos normalizados del backend.";

  const tags = [
    trainingEffectLabel ? trainingEffectLabel : null,
    exerciseLoad !== null ? `Carga ${formatNumber(exerciseLoad, "", 0)}` : null,
    aerobicTrainingEffect !== null ? `TE aer ${formatNumber(aerobicTrainingEffect, "", 1)}` : null,
    anaerobicTrainingEffect !== null ? `TE an ${formatNumber(anaerobicTrainingEffect, "", 1)}` : null,
    normalizedPower !== null ? `NP ${formatNumber(normalizedPower, " W", 0)}` : null,
    vo2max !== null ? `VO2max ${formatNumber(vo2max, "", 0)}` : null,
    groundContactTime !== null ? `GCT ${formatNumber(groundContactTime, " ms", 0)}` : null,
    avgSwolf !== null ? `SWOLF ${formatNumber(avgSwolf, "", 0)}` : null,
    fitRecordCount !== null ? `${formatNumber(fitRecordCount, "", 0)} records FIT` : null,
    activity.device_name ?? null,
  ].filter((item): item is string => Boolean(item)).slice(0, 5);

  return {
    score,
    headline,
    copy,
    note,
    noteTone: score.tone === "warning" ? "warning" : "neutral",
    tags,
    loadMetrics,
    dynamicsMetrics,
    overviewMetrics,
  };
}

function buildLapChartData(activity: GarminActivity): GarminLapChartPoint[] {
  return activity.laps.map((lap) => ({
    key: `${activity.provider_activity_id}-${lap.lap_index}`,
    label: `#${lap.lap_index}`,
    durationLabel: formatDuration(lap.moving_time_seconds),
    distanceLabel: formatCompactDistance(lap.distance_m),
    heartRateValue: lap.average_heartrate ?? null,
    wattsValue: lap.average_watts ?? null,
    speedValue: lap.average_speed_m_s ?? null,
    speedLabel: formatMovementMetric(lap.average_speed_m_s, activity.sport_type),
  }));
}

function availableGarminChartModes(points: GarminLapChartPoint[]): GarminLapChartMode[] {
  const modes: GarminLapChartMode[] = [];
  if (points.some((point) => point.heartRateValue != null)) modes.push("heartRate");
  if (points.some((point) => point.wattsValue != null)) modes.push("power");
  if (points.some((point) => point.speedValue != null)) modes.push("speed");
  return modes;
}

function garminChartModeLabel(mode: GarminLapChartMode, sportType: string) {
  if (mode === "heartRate") return "FC media por lap";
  if (mode === "power") return "Potencia media por lap";
  return `Ritmo / velocidad por lap (${sportLabel(sportType)})`;
}

function garminChartDataKey(mode: GarminLapChartMode) {
  if (mode === "heartRate") return "heartRateValue";
  if (mode === "power") return "wattsValue";
  return "speedValue";
}

function garminChartValueFormatter(mode: GarminLapChartMode, value: number, sportType: string) {
  if (mode === "heartRate") return `${Math.round(value)} bpm`;
  if (mode === "power") return `${Math.round(value)} W`;
  return formatMovementMetric(value, sportType);
}

function renderGarminChartTooltip(props: GarminChartTooltipProps, mode: GarminLapChartMode, sportType: string) {
  if (!props.active || !props.payload?.length) return null;
  const point = props.payload[0]?.payload;
  if (!point) return null;
  const value =
    mode === "heartRate"
      ? point.heartRateValue
      : mode === "power"
        ? point.wattsValue
        : point.speedValue;

  return (
    <div className="chart-tooltip">
      <strong>{point.label}</strong>
      <span>{point.distanceLabel} · {point.durationLabel}</span>
      <span>{value != null ? garminChartValueFormatter(mode, value, sportType) : "n/d"}</span>
      {mode !== "heartRate" && point.heartRateValue != null ? <span>FC {Math.round(point.heartRateValue)} bpm</span> : null}
      {mode !== "power" && point.wattsValue != null ? <span>{Math.round(point.wattsValue)} W</span> : null}
    </div>
  );
}

function isoDateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function GarminConnectPage({ token, athletes, onDataChanged }: GarminConnectPageProps) {
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(athletes[0]?.id ?? null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [startDate, setStartDate] = useState(isoDateOffset(-14));
  const [endDate, setEndDate] = useState(isoDateOffset(0));
  const [explorationMode, setExplorationMode] = useState(true);
  const [preview, setPreview] = useState<GarminActivitiesPreviewResponse | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [modalActivityId, setModalActivityId] = useState<number | null>(null);
  const [activityDetails, setActivityDetails] = useState<Record<number, GarminActivity>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isLoadingActivityDetail, setIsLoadingActivityDetail] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activityDetailError, setActivityDetailError] = useState<string | null>(null);
  const [lapChartMode, setLapChartMode] = useState<GarminLapChartMode>("heartRate");
  const [streamChartMode, setStreamChartMode] = useState<GarminStreamChartMode>("heartRate");

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? athletes[0] ?? null,
    [athletes, selectedAthleteId],
  );

  const selectedActivity = useMemo(
    () => {
      const activity =
        (selectedActivityId != null ? activityDetails[selectedActivityId] : null) ??
        preview?.activities.find((item) => item.provider_activity_id === selectedActivityId) ??
        preview?.activities[0] ??
        null;
      return activity ? normalizeGarminActivity(activity) : null;
    },
    [activityDetails, preview, selectedActivityId],
  );

  const selectedActivityInsight = useMemo(
    () => (selectedActivity ? buildGarminActivityInsight(selectedActivity) : null),
    [selectedActivity],
  );

  const selectedActivityStreamData = useMemo(
    () => (selectedActivity ? buildGarminStreamData(selectedActivity) : []),
    [selectedActivity],
  );

  const selectedActivityZones = useMemo(
    () => (selectedActivity ? buildGarminZones(selectedActivity) : []),
    [selectedActivity],
  );

  const selectedActivityPowerCurve = useMemo(
    () => (selectedActivity ? buildGarminPowerCurve(selectedActivity) : []),
    [selectedActivity],
  );

  const selectedActivityJson = useMemo(() => {
    if (!selectedActivity?.raw_detail || !Object.keys(selectedActivity.raw_detail).length) return null;
    return JSON.stringify(selectedActivity.raw_detail, null, 2);
  }, [selectedActivity]);

  const connectedToStravaCount = useMemo(
    () => athletes.filter((athlete) => athlete.strava_connected).length,
    [athletes],
  );

  const connectedToGarminCount = useMemo(
    () => athletes.filter((athlete) => athlete.garmin_connected).length,
    [athletes],
  );

  const coveredDisciplines = useMemo(() => {
    const values = new Set(athletes.map((athlete) => disciplineLabel(athlete.primary_discipline)));
    return values.size;
  }, [athletes]);

  useEffect(() => {
    setConnectMessage(null);
    setConnectError(null);
    setPreviewError(null);
    setPreview(null);
    setSelectedActivityId(null);
    setModalActivityId(null);
    setActivityDetails({});
    setActivityDetailError(null);
    setEmail("");
    setPassword("");
    setMfaCode("");
  }, [selectedAthleteId]);

  async function handleConnect() {
    if (!selectedAthlete) return;
    setIsConnecting(true);
    setConnectMessage(null);
    setConnectError(null);

    try {
      const result = await api.garminConnect(token, selectedAthlete.id, {
        email,
        password,
        ...(mfaCode.trim() ? { mfa_code: mfaCode.trim() } : {}),
      });
      setConnectMessage(`Cuenta Garmin conectada para ${selectedAthlete.name} (${result.garmin_email}).`);
      setPassword("");
      setMfaCode("");
      await onDataChanged();
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : "No se pudo conectar Garmin.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handlePreview() {
    if (!selectedAthlete) return;
    setIsLoadingPreview(true);
    setPreviewError(null);

    try {
      const result = (await api.garminPreview(token, selectedAthlete.id, startDate, endDate, {
        includeFullDetail: explorationMode,
        activityLimit: explorationMode ? 1 : undefined,
      })) as GarminActivitiesPreviewResponse;
      setPreview(result);
      setSelectedActivityId(result.activities[0]?.provider_activity_id ?? null);
      setModalActivityId(explorationMode ? (result.activities[0]?.provider_activity_id ?? null) : null);
      setActivityDetails({});
      setActivityDetailError(null);
    } catch (error) {
      setPreview(null);
      setSelectedActivityId(null);
      setModalActivityId(null);
      setActivityDetails({});
      setActivityDetailError(null);
      setPreviewError(error instanceof Error ? error.message : "No se pudo cargar el preview Garmin.");
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function openActivityDetail(activityId: number) {
    if (!selectedAthlete) return;
    setSelectedActivityId(activityId);
    setModalActivityId(activityId);
    setActivityDetailError(null);

    if (activityDetails[activityId]) return;

    const previewActivity = preview?.activities.find((activity) => activity.provider_activity_id === activityId) ?? null;
    const previewScope = coerceUnknownString(readPath(previewActivity?.raw_detail, "meta.detail_scope"));
    if (previewActivity && previewScope === "full") return;

    setIsLoadingActivityDetail(true);
    try {
      const result = (await api.garminActivityDetail(token, selectedAthlete.id, activityId)) as GarminActivity;
      setActivityDetails((current) => ({
        ...current,
        [activityId]: result,
      }));
    } catch (error) {
      setActivityDetailError(error instanceof Error ? error.message : "No se pudo cargar el detalle completo Garmin.");
    } finally {
      setIsLoadingActivityDetail(false);
    }
  }

  const selectedActivityChartData = useMemo(
    () => (selectedActivity ? buildLapChartData(selectedActivity) : []),
    [selectedActivity],
  );

  const selectedChartModes = useMemo(
    () => availableGarminChartModes(selectedActivityChartData),
    [selectedActivityChartData],
  );

  const selectedStreamChartModes = useMemo(
    () => availableGarminStreamModes(selectedActivityStreamData),
    [selectedActivityStreamData],
  );

  const selectedStreamStats = useMemo(
    () =>
      selectedStreamChartModes
        .map((mode) => buildGarminStreamStat(selectedActivityStreamData, mode))
        .filter((item): item is NonNullable<ReturnType<typeof buildGarminStreamStat>> => item !== null),
    [selectedActivityStreamData, selectedStreamChartModes],
  );

  useEffect(() => {
    if (!selectedChartModes.length) return;
    if (!selectedChartModes.includes(lapChartMode)) {
      setLapChartMode(selectedChartModes[0]);
    }
  }, [lapChartMode, selectedChartModes]);

  useEffect(() => {
    if (!selectedStreamChartModes.length) return;
    if (!selectedStreamChartModes.includes(streamChartMode)) {
      setStreamChartMode(selectedStreamChartModes[0]);
    }
  }, [selectedStreamChartModes, streamChartMode]);

  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Beta integration</span>
          <h1>Garmin Connect</h1>
          <p>
            Beta inicial para conectar Garmin, previsualizar actividades por atleta y validar si el
            dato encaja en el flujo analítico de Lactate Lab antes de importar.
          </p>
        </div>
        <div className="hero-focus-stack">
          <div className="hero-focus-card current">
            <small>Atletas</small>
            <strong>{athletes.length}</strong>
            <p>Base disponible para probar la beta</p>
          </div>
          <div className="hero-focus-card">
            <small>Disciplinas</small>
            <strong>{coveredDisciplines}</strong>
            <p>Running, cycling, triathlon y variantes</p>
          </div>
          <div className="hero-focus-card">
            <small>Strava conectado</small>
            <strong>{connectedToStravaCount}</strong>
            <p>Sirve para contrastar lo que devuelve Garmin</p>
          </div>
          <div className="hero-focus-card evaluation">
            <small>Garmin conectado</small>
            <strong>{connectedToGarminCount}</strong>
            <p>Atletas listos para preview beta</p>
          </div>
        </div>
      </section>

      <section className="card section-card planning-toolbar-card">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2 className="section-title">Selecciona atleta para trabajar Garmin</h2>
          </div>
        </div>
        <div className="planning-workspace-switch">
          {athletes.map((athlete) => {
            const isActive = athlete.id === selectedAthlete?.id;
            return (
              <button
                key={athlete.id}
                type="button"
                className="planning-workspace-button"
                onClick={() => setSelectedAthleteId(athlete.id)}
                aria-pressed={isActive}
              >
                <strong>{athlete.name}</strong>
                <small>
                  {disciplineLabel(athlete.primary_discipline)}
                  {athlete.garmin_connected ? " · Garmin ok" : ""}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      {selectedAthlete ? (
        <>
          <section className="strava-summary-strip">
            <article className="strava-summary-card">
              <span>Disciplina base</span>
              <strong>{disciplineLabel(selectedAthlete.primary_discipline)}</strong>
              <small>Prioridad Garmin: {garminPriority(selectedAthlete)}</small>
            </article>
            <article className="strava-summary-card">
              <span>Objetivo actual</span>
              <strong>{athleteGoalLabel(selectedAthlete)}</strong>
              <small>Lectura útil para decidir qué datos importar primero</small>
            </article>
            <article className="strava-summary-card">
              <span>Bloque activo</span>
              <strong>{athleteFocusLabel(selectedAthlete)}</strong>
              <small>Sirve para priorizar carga, laps y contexto</small>
            </article>
            <article className="strava-summary-card">
              <span>Primer sync recomendado</span>
              <strong>{recommendedFirstSync(selectedAthlete)}</strong>
              <small>{selectedAthlete.garmin_connected ? "Cuenta Garmin ya conectada" : "Pendiente de conectar"}</small>
            </article>
          </section>

          <section className="card section-card">
            <div className="strava-preview-header">
              <div>
                <span className="eyebrow">Conexión beta</span>
                <h3>Conectar Garmin para {selectedAthlete.name}</h3>
              </div>
              <strong>{selectedAthlete.garmin_connected ? "Conectado" : "Pendiente"}</strong>
            </div>
            <div className="strava-import-grid">
              <label className="library-search-shell">
                <span className="library-search-label">Email Garmin</span>
                <input
                  className="library-search"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="usuario@correo.com"
                />
              </label>
              <label className="library-search-shell">
                <span className="library-search-label">Password</span>
                <input
                  className="library-search"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password Garmin"
                />
              </label>
              <label className="library-search-shell">
                <span className="library-search-label">MFA code</span>
                <input
                  className="library-search"
                  type="text"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  placeholder="Opcional si Garmin lo pide"
                />
              </label>
              <div className="strava-import-action">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleConnect}
                  disabled={isConnecting || !email.trim() || !password}
                >
                  {isConnecting ? "Conectando..." : "Conectar Garmin"}
                </button>
              </div>
            </div>
            {connectMessage ? <p>{connectMessage}</p> : null}
            {connectError ? <p className="error">{connectError}</p> : null}
          </section>

          <section className="card section-card">
            <div className="strava-preview-header">
              <div>
                <span className="eyebrow">Preview</span>
                <h3>Actividades Garmin por rango de fechas</h3>
              </div>
              <strong>{preview ? `${preview.imported_count} actividades` : "Sin cargar"}</strong>
            </div>
            <div className="strava-import-grid">
              <label className="library-search-shell">
                <span className="library-search-label">Desde</span>
                <input className="library-search" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="library-search-shell">
                <span className="library-search-label">Hasta</span>
                <input className="library-search" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
              <label className="library-search-shell">
                <span className="library-search-label">Modo de carga</span>
                <button
                  type="button"
                  className={`planning-workspace-button${explorationMode ? " active" : ""}`}
                  onClick={() => setExplorationMode((current) => !current)}
                >
                  <strong>{explorationMode ? "Exploración total" : "Preview ligero"}</strong>
                  <small>{explorationMode ? "1 actividad con todo el payload posible" : "Rango normal de actividades"}</small>
                </button>
              </label>
              <div className="strava-import-action">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handlePreview}
                  disabled={isLoadingPreview || !selectedAthlete.garmin_connected || endDate < startDate}
                >
                  {isLoadingPreview ? "Cargando..." : explorationMode ? "Cargar 1 actividad completa" : "Cargar preview"}
                </button>
              </div>
            </div>
            <p>
              {explorationMode
                ? "Modo exploración: la llamada traerá solo una actividad, pero intentará incluir todo el detalle Garmin posible para inspección."
                : "Modo normal: la llamada trae el listado de actividades del rango con el payload base."}
            </p>
            {!selectedAthlete.garmin_connected ? <p>Conecta primero la cuenta Garmin de este atleta.</p> : null}
            {endDate < startDate ? <p>La fecha final debe ser igual o posterior a la inicial.</p> : null}
            {previewError ? <p className="error">{previewError}</p> : null}
          </section>

          {preview?.activities.length ? (
            <>
              <section className="card section-card">
                <div className="strava-preview-header">
                  <div>
                    <span className="eyebrow">Listado</span>
                    <h3>Actividades Garmin visibles</h3>
                  </div>
                  <strong>{preview.athlete_name}</strong>
                </div>
                <div className="strava-activity-grid">
                  {preview.activities.map((activity) => (
                    <button
                      key={activity.provider_activity_id}
                      type="button"
                      className={`strava-activity-card${selectedActivity?.provider_activity_id === activity.provider_activity_id ? " selected" : ""}`}
                      onClick={() => void openActivityDetail(activity.provider_activity_id)}
                    >
                      <div className="strava-activity-card-head">
                        <div className="strava-activity-card-topline">
                          <span className={`strava-sport-pill ${sportToneClass(activity.sport_type)}`}>{sportLabel(activity.sport_type)}</span>
                          <span className="strava-subtle-pill">{formatDateTime(activity.started_at)}</span>
                        </div>
                        <div className="strava-activity-title-block">
                          <strong>{activity.name}</strong>
                          <p>{activity.description ?? "Sin descripción"}</p>
                        </div>
                      </div>
                      <div className="strava-activity-kpi-grid">
                        <div>
                          <span>Duración</span>
                          <strong>{formatDuration(activity.moving_time_seconds)}</strong>
                        </div>
                        <div>
                          <span>Distancia</span>
                          <strong>{formatDistance(activity.distance_m)}</strong>
                        </div>
                        <div>
                          <span>Ritmo / velocidad</span>
                          <strong>{formatMovementMetric(activity.average_speed_m_s, activity.sport_type)}</strong>
                        </div>
                        <div>
                          <span>FC / potencia</span>
                          <strong>
                            {activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : "n/d"}
                            {activity.average_watts ? ` · ${Math.round(activity.average_watts)} W` : ""}
                          </strong>
                        </div>
                      </div>
                      <div className="strava-activity-card-flags">
                        <span>{activity.laps.length ? `${activity.laps.length} laps` : "Sin laps"}</span>
                        <span>{activity.device_name ?? "Dispositivo n/d"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {selectedActivity ? (
                <section className="card section-card">
                  <div className="strava-preview-empty">
                    <p>
                      {explorationMode
                        ? "La actividad completa se abre sola tras la llamada. Si cierras el overlay, puedes volver a abrirla haciendo click en la tarjeta."
                        : "Haz click en una actividad para abrir el overlay de detalle Garmin y revisar métricas, laps y gráficas por bloque."}
                    </p>
                  </div>
                </section>
              ) : null}
            </>
          ) : preview ? (
            <section className="card section-card">
              <div className="strava-preview-empty">
                <p>No se encontraron actividades Garmin en ese rango de fechas.</p>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="card section-card">
          <div className="strava-preview-empty">
            <p>No hay atletas disponibles todavía para preparar la beta Garmin.</p>
          </div>
        </section>
      )}

      {selectedActivity && modalActivityId === selectedActivity.provider_activity_id ? (
        <div className="target-modal-backdrop" onClick={() => setModalActivityId(null)}>
          <section className="card target-modal-card library-workout-modal strava-activity-modal" onClick={(event) => event.stopPropagation()}>
            <div className="library-workout-modal-head">
              <div className="library-workout-title-wrap">
                <span className="eyebrow">Detalle Garmin</span>
                <h2>{selectedActivity.name}</h2>
                <p>{formatDateTime(selectedActivity.started_at)} · {sportLabel(selectedActivity.sport_type)}</p>
              </div>
              <div className="library-workout-head-actions">
                <span className="library-preview-source example">Garmin activity</span>
                <button type="button" className="ghost-button library-workout-close" onClick={() => setModalActivityId(null)}>
                  Cerrar
                </button>
              </div>
            </div>

            <div className="strava-detail-hero-shell">
              <div className="strava-detail-hero-main">
                <div className="strava-detail-hero-topline">
                  <span className={`strava-sport-pill ${sportToneClass(selectedActivity.sport_type)}`}>{sportLabel(selectedActivity.sport_type)}</span>
                  {selectedActivityInsight ? <span className={`strava-data-pill ${selectedActivityInsight.score.tone}`}>{selectedActivityInsight.score.label}</span> : null}
                  <span className="strava-subtle-pill">{selectedActivity.device_name ?? "Dispositivo n/d"}</span>
                </div>
                <h3>{selectedActivityInsight?.headline ?? "Actividad Garmin lista para inspección"}</h3>
                <p className="strava-detail-hero-copy">
                  {selectedActivityInsight?.copy ??
                    "Esta actividad ya permite revisar estructura, laps y señal Garmin antes de decidir qué normalizar en el backend."}
                </p>
                <div className="strava-detail-tag-list">
                  <span>{formatDistance(selectedActivity.distance_m)}</span>
                  <span>{formatDuration(selectedActivity.elapsed_time_seconds)}</span>
                  <span>{selectedActivity.laps.length} laps</span>
                  {selectedActivityInsight?.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
              <div className="strava-detail-hero-side">
                <div>
                  <span>Ritmo / velocidad</span>
                  <strong>{formatMovementMetric(selectedActivity.average_speed_m_s, selectedActivity.sport_type)}</strong>
                </div>
                <div>
                  <span>FC media</span>
                  <strong>{selectedActivity.average_heartrate ? `${Math.round(selectedActivity.average_heartrate)} bpm` : "n/d"}</strong>
                </div>
                <div>
                  <span>Potencia media</span>
                  <strong>{selectedActivity.average_watts ? `${Math.round(selectedActivity.average_watts)} W` : "n/d"}</strong>
                </div>
                <div>
                  <span>Desnivel</span>
                  <strong>{selectedActivity.total_elevation_gain_m ? `${Math.round(selectedActivity.total_elevation_gain_m)} m` : "n/d"}</strong>
                </div>
              </div>
            </div>

            {selectedActivityInsight ? (
              <div className={`strava-detail-note ${selectedActivityInsight.noteTone}`}>
                <span className="eyebrow">Lectura Garmin</span>
                <p>{selectedActivityInsight.note}</p>
              </div>
            ) : null}

            {isLoadingActivityDetail ? (
              <div className="strava-detail-note neutral">
                <span className="eyebrow">Carga completa</span>
                <p>Solicitando detalle Garmin extendido, zonas y payload adicional para esta actividad.</p>
              </div>
            ) : null}

            {activityDetailError ? (
              <div className="strava-detail-note warning">
                <span className="eyebrow">Detalle parcial</span>
                <p>{activityDetailError}</p>
              </div>
            ) : null}

            <div className="strava-detail-panel">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Curva temporal</span>
                  <h3>Streams Garmin y FIT ya visibles en esta sesión</h3>
                </div>
                <strong>{selectedStreamChartModes.length ? garminStreamChartModeLabel(streamChartMode) : "Sin streams"}</strong>
              </div>
              {selectedStreamChartModes.length ? (
                <>
                  <div className="strava-chart-mode-switch">
                    {selectedStreamChartModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`strava-chart-mode-button${streamChartMode === mode ? " active" : ""}`}
                        onClick={() => setStreamChartMode(mode)}
                      >
                        {garminStreamChartModeLabel(mode)}
                      </button>
                    ))}
                  </div>
                  <div className="strava-chart-shell elevated">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={selectedActivityStreamData}>
                        <CartesianGrid stroke="rgba(22, 53, 61, 0.08)" vertical={false} />
                        <XAxis
                          type="number"
                          dataKey="elapsedSeconds"
                          domain={[0, "dataMax"]}
                          tickFormatter={(value) => formatDurationShort(Number(value))}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          type="number"
                          dataKey={garminStreamDataKey(streamChartMode)}
                          tickFormatter={(value) => formatStreamMetricValue(streamChartMode, Number(value))}
                          tickLine={false}
                          axisLine={false}
                          width={78}
                        />
                        <Tooltip content={(props) => renderGarminStreamChartTooltip(props as GarminStreamChartTooltipProps, streamChartMode)} />
                        <Line
                          type="monotone"
                          dataKey={garminStreamDataKey(streamChartMode)}
                          stroke="#16353d"
                          strokeWidth={2.2}
                          connectNulls
                          dot={false}
                          activeDot={{ r: 5, fill: "#d26a36", stroke: "#fff", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="strava-stream-list compact">
                    {selectedStreamStats.map((metric) => (
                      <article key={metric.label} className="strava-stream-card">
                        <strong>{metric.label}</strong>
                        <span>Media {metric.average}</span>
                        <small>Min {metric.min} · Máx {metric.max}</small>
                      </article>
                    ))}
                  </div>
                  <p className="strava-inline-note">
                    En este ejemplo indoor la señal fuerte está en potencia, FC, cadencia, respiración y dinámica izquierda. La distancia y la velocidad no son relevantes porque Garmin marca la sesión como `indoor_cycling`.
                  </p>
                </>
              ) : (
                <p className="strava-inline-note">Esta actividad no trae streams suficientes para construir curva temporal continua.</p>
              )}
            </div>

            <div className="strava-detail-columns">
              <div className="strava-detail-panel">
                <div className="strava-preview-header">
                  <div>
                    <span className="eyebrow">Zonas</span>
                    <h3>Distribución real del tiempo en zonas</h3>
                  </div>
                  <strong>{selectedActivityZones.length} fuentes</strong>
                </div>
                {selectedActivityZones.length ? (
                  <div className="strava-zone-grid">
                    {selectedActivityZones.map((zone) => (
                      <article key={zone.key} className="strava-zone-card">
                        <span>{zone.label}</span>
                        <strong>{formatDuration(zone.totalSeconds)}</strong>
                        <div className="strava-zone-buckets">
                          {zone.buckets.map((bucket) => (
                            <div key={bucket.key} className="strava-zone-bucket-row">
                              <div className="strava-zone-bucket-meta">
                                <span>Z{bucket.zoneNumber} · desde {bucket.boundaryLabel}</span>
                                <strong>{formatDuration(bucket.seconds)} · {formatPercentage(bucket.share)}</strong>
                              </div>
                              <div className="strava-lap-bar-track">
                                <div className="strava-lap-bar-fill zone" style={{ width: `${Math.max(bucket.share * 100, 4)}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="strava-inline-note">Garmin no expone tiempos en zonas para esta actividad.</p>
                )}
              </div>

              <div className="strava-detail-panel">
                <div className="strava-preview-header">
                  <div>
                    <span className="eyebrow">Power curve</span>
                    <h3>Mejores potencias sostenidas que Garmin expone</h3>
                  </div>
                  <strong>{selectedActivityPowerCurve.length} puntos</strong>
                </div>
                {selectedActivityPowerCurve.length ? (
                  <div className="strava-lap-list">
                    {selectedActivityPowerCurve.map((point) => {
                      const maxWatts = Math.max(...selectedActivityPowerCurve.map((item) => item.watts));
                      const share = maxWatts > 0 ? point.watts / maxWatts : 0;
                      return (
                        <article key={point.key} className="strava-lap-card">
                          <div className="strava-lap-header">
                            <strong>{point.label}</strong>
                            <span>{Math.round(point.watts)} W</span>
                          </div>
                          <div className="strava-lap-bar-shell">
                            <div className="strava-lap-bar-track">
                              <div className="strava-lap-bar-fill alt" style={{ width: `${Math.max(share * 100, 4)}%` }} />
                            </div>
                            <small>{point.seconds < 60 ? `${point.seconds} segundos` : formatDuration(point.seconds)} de mejor media</small>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="strava-inline-note">No hay curva de potencia explícita en el payload normalizado actual.</p>
                )}
              </div>
            </div>

            <div className="strava-detail-panel">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Bloques</span>
                  <h3>Vista por lap para leer la sesión por secciones</h3>
                </div>
                <strong>{selectedChartModes.length ? garminChartModeLabel(lapChartMode, selectedActivity.sport_type) : "Sin laps"}</strong>
              </div>
              {selectedChartModes.length ? (
                <>
                  <div className="strava-chart-mode-switch">
                    {selectedChartModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`strava-chart-mode-button${lapChartMode === mode ? " active" : ""}`}
                        onClick={() => setLapChartMode(mode)}
                      >
                        {garminChartModeLabel(mode, selectedActivity.sport_type)}
                      </button>
                    ))}
                  </div>
                  <div className="strava-chart-shell elevated">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={selectedActivityChartData}>
                        <CartesianGrid stroke="rgba(22, 53, 61, 0.08)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis
                          dataKey={garminChartDataKey(lapChartMode)}
                          tickFormatter={(value) => garminChartValueFormatter(lapChartMode, Number(value), selectedActivity.sport_type)}
                          tickLine={false}
                          axisLine={false}
                          width={78}
                        />
                        <Tooltip content={(props) => renderGarminChartTooltip(props as GarminChartTooltipProps, lapChartMode, selectedActivity.sport_type)} />
                        <Line
                          type="monotone"
                          dataKey={garminChartDataKey(lapChartMode)}
                          stroke="#16353d"
                          strokeWidth={2.6}
                          connectNulls
                          dot={{ r: 4, fill: "#d26a36", stroke: "#ffffff", strokeWidth: 2 }}
                          activeDot={{ r: 6, fill: "#d26a36", stroke: "#fff", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="strava-inline-note">Esta actividad no trae suficiente señal por lap para graficar bloques.</p>
              )}
            </div>

            {selectedActivityInsight ? (
              <div className="strava-detail-columns">
                <div className="strava-detail-panel">
                  <div className="strava-preview-header">
                    <div>
                      <span className="eyebrow">Carga Garmin</span>
                      <h3>Training effect, load y recuperación</h3>
                    </div>
                    <strong>{selectedActivityInsight.loadMetrics.length} señales</strong>
                  </div>
                  {selectedActivityInsight.loadMetrics.length ? (
                    <div className="strava-detail-metrics">
                      {selectedActivityInsight.loadMetrics.map((metric) => (
                        <div key={metric.label}>
                          <strong>{metric.label}</strong>
                          <span>{metric.value}</span>
                          {metric.hint ? <small>{metric.hint}</small> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Todavía no se detectan métricas avanzadas de carga en el payload normalizado.</p>
                  )}
                </div>
                <div className="strava-detail-panel">
                  <div className="strava-preview-header">
                    <div>
                      <span className="eyebrow">Dinámica</span>
                      <h3>Biomecánica, respiración y eficiencia</h3>
                    </div>
                    <strong>{selectedActivityInsight.dynamicsMetrics.length} señales</strong>
                  </div>
                  {selectedActivityInsight.dynamicsMetrics.length ? (
                    <div className="strava-detail-metrics">
                      {selectedActivityInsight.dynamicsMetrics.map((metric) => (
                        <div key={metric.label}>
                          <strong>{metric.label}</strong>
                          <span>{metric.value}</span>
                          {metric.hint ? <small>{metric.hint}</small> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>En esta actividad no aparecen dinámicas avanzadas visibles en el payload actual.</p>
                  )}
                </div>
              </div>
            ) : null}

            {selectedActivityInsight ? (
              <div className="strava-detail-panel">
                <div className="strava-preview-header">
                  <div>
                    <span className="eyebrow">Contexto</span>
                    <h3>Dispositivo, coordenadas y cobertura del payload</h3>
                  </div>
                  <strong>{selectedActivityInsight.overviewMetrics.length} campos</strong>
                </div>
                <div className="strava-detail-metrics">
                  {selectedActivityInsight.overviewMetrics.map((metric) => (
                    <div key={metric.label}>
                      <strong>{metric.label}</strong>
                      <span>{metric.value}</span>
                      {metric.hint ? <small>{metric.hint}</small> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="strava-detail-panel">
              <div className="strava-preview-header">
                <div>
                  <span className="eyebrow">Laps</span>
                  <h3>Bloques visibles de la sesión</h3>
                </div>
                <strong>{selectedActivity.laps.length} laps</strong>
              </div>
              <div className="strava-phase-lap-grid">
                {selectedActivity.laps.length ? (
                  selectedActivity.laps.map((lap) => (
                    <article key={`${selectedActivity.provider_activity_id}-${lap.lap_index}`} className="strava-phase-lap-card">
                      <div className="strava-phase-lap-topline">
                        <strong>#{lap.lap_index}</strong>
                        <span>{lap.name}</span>
                      </div>
                      <div className="strava-phase-lap-meta">
                        <span>{formatCompactDistance(lap.distance_m)}</span>
                        <span>{formatDuration(lap.moving_time_seconds)}</span>
                        <span>{formatMovementMetric(lap.average_speed_m_s, selectedActivity.sport_type)}</span>
                        <span>{lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : "n/d"}</span>
                        <span>{lap.average_watts ? `${Math.round(lap.average_watts)} W` : "n/d"}</span>
                        <span>{lap.start_date ? formatDateTime(lap.start_date) : "Sin hora inicio"}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="strava-inline-note">Esta actividad no trae laps visibles en el preview actual.</p>
                )}
              </div>
            </div>

            <div className="strava-detail-metrics">
              <div><strong>Duración total</strong><span>{formatDuration(selectedActivity.elapsed_time_seconds)}</span></div>
              <div><strong>Velocidad máx</strong><span>{selectedActivity.max_speed_m_s ? formatMovementMetric(selectedActivity.max_speed_m_s, selectedActivity.sport_type) : "n/d"}</span></div>
              <div><strong>FC máx</strong><span>{selectedActivity.max_heartrate ? `${Math.round(selectedActivity.max_heartrate)} bpm` : "n/d"}</span></div>
              <div><strong>Potencia máx</strong><span>{selectedActivity.max_watts ? `${Math.round(selectedActivity.max_watts)} W` : "n/d"}</span></div>
              <div><strong>Cadencia media</strong><span>{formatNumber(selectedActivity.average_cadence, "", 1)}</span></div>
              <div><strong>Calorías</strong><span>{formatNumber(selectedActivity.calories, "", 0)}</span></div>
              <div><strong>Inicio</strong><span>{formatLatLng(selectedActivity.start_latlng)}</span></div>
              <div><strong>Final</strong><span>{formatLatLng(selectedActivity.end_latlng)}</span></div>
            </div>

            {selectedActivityJson ? (
              <details className="strava-debug-disclosure">
                <summary>Debug JSON crudo Garmin</summary>
                <div className="strava-raw-json">
                  <pre>{selectedActivityJson}</pre>
                </div>
              </details>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

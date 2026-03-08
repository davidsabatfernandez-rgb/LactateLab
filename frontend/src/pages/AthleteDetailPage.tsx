import { FormEvent, useEffect, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CurveChart } from "../components/CurveChart";
import { api } from "../lib/api";
import { AthleteAnalysis, AthleteFocusBlock, AthleteFocusBlockEvaluation, AthleteTarget, DisciplineView, Estimate, HistoricalPoint, Threshold } from "../types";

const ENERGY_SYSTEM_OPTIONS = {
  "Aerobic Capacity": ["Base aeróbica", "LT1", "Recuperación", "Readaptación", "Estabilidad subumbral"],
  "Aerobic Power": ["LT2", "VO2max", "Potencia aeróbica específica", "Ritmo competición"],
  "Anaerobic Capacity": ["Tolerancia lactato", "Capacidad glucolítica", "Repeatability"],
  "Anaerobic Power": ["Sprint", "Peak power", "Neuromuscular"],
} as const;

const PHASE_OPTIONS = ["acumulación", "transformación", "específico", "taper", "recuperación"];

function formatPace(seconds?: number | null) {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}/km`;
}

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSwimPacePer100m(totalSecondsPer100m?: number | null) {
  if (!totalSecondsPer100m) return "-";
  const mins = Math.floor(totalSecondsPer100m / 60);
  const secs = Math.round(totalSecondsPer100m % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}/100m`;
}

function formatValue(value?: number | null, unit?: string) {
  if (value === null || value === undefined) return "-";
  if (unit === "s/km") return formatPace(value);
  return `${Math.round(value * 10) / 10} ${unit ?? ""}`.trim();
}

function formatSignedDelta(value?: number | null, unit?: string) {
  if (value === null || value === undefined) return null;
  const sign = value > 0 ? "+" : "";
  if (unit === "s/km") return `${sign}${Math.round(value)} ${unit}`;
  return `${sign}${(Math.round(value * 100) / 100).toFixed(unit === "W/kg" ? 2 : 1)} ${unit ?? ""}`.trim();
}

function formatWattsPerKg(power?: number | null, weight?: number | null) {
  if (power === null || power === undefined || weight === null || weight === undefined || weight <= 0) return "-";
  return `${(power / weight).toFixed(2)} W/kg`;
}

function formatPowerWithWeight(power?: number | null, weight?: number | null) {
  if (power === null || power === undefined) return "-";
  const relative = formatWattsPerKg(power, weight);
  return relative === "-" ? `${Math.round(power)} W` : `${Math.round(power)} W · ${relative}`;
}

function isPlausibleAthleteWeight(weight?: number | null) {
  return weight !== null && weight !== undefined && weight >= 25 && weight <= 150;
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatIntervalDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `${seconds}s`;
}

function raceDistanceKm(estimateType: string) {
  if (estimateType === "5K") return 5;
  if (estimateType === "10K") return 10;
  if (estimateType === "HM") return 21.0975;
  if (estimateType === "Maratón") return 42.195;
  return null;
}

function racePredictionSummary(estimate: Estimate) {
  const distanceKm = raceDistanceKm(estimate.estimate_type);
  if (estimate.unit !== "s/km" || !distanceKm) {
    return null;
  }
  return {
    pace: formatPace(estimate.value),
    totalTime: formatDuration(estimate.value * distanceKm),
    lowerTime: estimate.lower_bound ? formatDuration(estimate.lower_bound * distanceKm) : "-",
    upperTime: estimate.upper_bound ? formatDuration(estimate.upper_bound * distanceKm) : "-",
  };
}

function goalCategoryLabel(value?: string | null) {
  if (value === "larga_distancia") return "Larga distancia";
  if (value === "corta_distancia") return "Corta distancia";
  return "Media distancia";
}

function selectFocusedEstimateTypes(goalCategory?: string | null) {
  if (goalCategory === "larga_distancia") return ["HM", "Maratón"];
  if (goalCategory === "corta_distancia") return ["5K"];
  return ["10K", "HM"];
}

function disciplineLabel(value: string) {
  if (value === "ciclismo") return "Ciclismo";
  if (value === "natación") return "Natación";
  if (value === "triatlón") return "Triatlón";
  return "Carrera a pie";
}

function parseDistanceKm(label?: string | null) {
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (normalized.includes("hm") || normalized.includes("media")) return 21.0975;
  if (normalized.includes("marat")) return 42.195;
  const kilometerMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*k/);
  if (kilometerMatch) {
    return Number(kilometerMatch[1].replace(",", "."));
  }
  const kmTextMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*km/);
  if (kmTextMatch) {
    return Number(kmTextMatch[1].replace(",", "."));
  }
  return null;
}

function parseTriathlonDistanceLabel(label?: string | null) {
  if (!label) return null;
  const normalized = label.toLowerCase();
  if (normalized.includes("ironman") || normalized.includes("140.6")) {
    return { swimMeters: 3900, bikeKm: 180, runKm: 42.195, label: "IRONMAN" };
  }
  if (normalized.includes("medio ironman") || normalized.includes("half") || normalized.includes("70.3") || normalized.includes("media distancia")) {
    return { swimMeters: 1900, bikeKm: 90, runKm: 21.0975, label: "Media distancia" };
  }
  if (normalized.includes("olimp")) {
    return { swimMeters: 1500, bikeKm: 40, runKm: 10, label: "Olímpico" };
  }
  if (normalized.includes("sprint")) {
    return { swimMeters: 750, bikeKm: 20, runKm: 10, label: "Sprint" };
  }
  return null;
}

function parseRunningPaceLabel(label?: string | null) {
  if (!label) return null;
  const match = label.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseSwimPaceLabel(label?: string | null) {
  if (!label) return null;
  const match = label.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function estimateBikeSpeedFromWattsPerKg(wattsPerKg: number, elevationGain = 0, bikeKm = 40) {
  const speed = 33 + (wattsPerKg - 2.6) * 4;
  const elevationPenalty = bikeKm > 0 ? (elevationGain / bikeKm) * 0.18 : 0;
  return Math.max(22, Math.min(46, speed - elevationPenalty));
}

function estimateWattsPerKgFromBikeSpeed(speedKph: number, elevationGain = 0, bikeKm = 40) {
  const elevationPenalty = bikeKm > 0 ? (elevationGain / bikeKm) * 0.18 : 0;
  return Math.max(1.8, Math.min(6.5, 2.6 + (speedKph + elevationPenalty - 33) / 4));
}

function formatSpeedKph(speedKph?: number | null) {
  if (!speedKph) return "-";
  return `${speedKph.toFixed(1)} km/h`;
}

function formatDeltaClock(totalSeconds: number) {
  const absolute = formatClock(Math.abs(totalSeconds));
  return totalSeconds > 0 ? `+${absolute}` : totalSeconds < 0 ? `-${absolute}` : absolute;
}

function safeNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

const TRIATHLON_DISTANCE_PRESETS = {
  ironman: { label: "IRONMAN", swimMeters: 3900, bikeKm: 180, runKm: 42.195 },
  half: { label: "Media distancia", swimMeters: 1900, bikeKm: 90, runKm: 21.0975 },
  olympic: { label: "Olímpico", swimMeters: 1500, bikeKm: 40, runKm: 10 },
  sprint: { label: "Sprint", swimMeters: 750, bikeKm: 20, runKm: 10 },
} as const;

function triathlonPlanningModel(label?: string | null) {
  const race = parseTriathlonDistanceLabel(label);
  if (!race) return null;
  const normalized = label?.toLowerCase() ?? "";
  if (normalized.includes("ironman")) {
    return { transitionsSeconds: 8 * 60, split: { swim: 0.1, bike: 0.51, run: 0.39 } };
  }
  if (normalized.includes("media distancia") || normalized.includes("medio ironman") || normalized.includes("70.3")) {
    return { transitionsSeconds: 5 * 60, split: { swim: 0.11, bike: 0.5, run: 0.39 } };
  }
  if (normalized.includes("olímp") || normalized.includes("olimp")) {
    return { transitionsSeconds: 3 * 60, split: { swim: 0.16, bike: 0.5, run: 0.34 } };
  }
  if (normalized.includes("sprint")) {
    return { transitionsSeconds: 2 * 60, split: { swim: 0.17, bike: 0.49, run: 0.34 } };
  }
  return { transitionsSeconds: 4 * 60, split: { swim: 0.12, bike: 0.5, run: 0.38 } };
}

function triathlonPresetKeyFromLabel(label?: string | null) {
  if (!label) return "manual";
  const normalized = label.toLowerCase();
  if (normalized.includes("ironman")) return "ironman";
  if (normalized.includes("media distancia") || normalized.includes("medio ironman") || normalized.includes("70.3")) return "half";
  if (normalized.includes("olímp") || normalized.includes("olimp")) return "olympic";
  if (normalized.includes("sprint")) return "sprint";
  return "manual";
}

function parseSubTargetSeconds(objective: string, context?: { distanceKm?: number | null; discipline?: string }) {
  const normalized = objective.toLowerCase().replace(",", ".");
  const threePart = normalized.match(/sub\s*(\d{1,2})[:h](\d{2})[:m](\d{2})/i) || normalized.match(/sub\s*(\d{1,2}):(\d{2}):(\d{2})/i);
  if (threePart) {
    return Number(threePart[1]) * 3600 + Number(threePart[2]) * 60 + Number(threePart[3]);
  }

  const twoPart = normalized.match(/sub\s*(\d{1,3})[:h](\d{2})/i) || normalized.match(/sub\s*(\d{1,3}):(\d{2})/i);
  if (twoPart) {
    const first = Number(twoPart[1]);
    const second = Number(twoPart[2]);
    const shouldTreatAsHours =
      normalized.includes("h") ||
      (context?.discipline === "triatlón") ||
      ((context?.distanceKm ?? 0) >= 21 && first <= 5);
    if (shouldTreatAsHours) {
      return first * 3600 + second * 60;
    }
    return first * 60 + second;
  }

  const hourOnly = normalized.match(/sub\s*(\d+(?:\.\d+)?)\s*h/);
  if (hourOnly) {
    return Math.round(Number(hourOnly[1]) * 3600);
  }

  const minuteOnly = normalized.match(/sub\s*(\d{1,3})(?!\d)/);
  if (minuteOnly) {
    return Number(minuteOnly[1]) * 60;
  }

  return null;
}

function extractFtpWatts(objective: string) {
  const normalized = objective.toLowerCase();
  const ftpMatch = normalized.match(/ftp\s*(\d{2,4})\s*w?/i);
  if (ftpMatch) return Number(ftpMatch[1]);
  return null;
}

function buildObjectiveHints(form: {
  discipline: string;
  objective: string;
  distance_label: string;
}) {
  const hints: string[] = [];
  if (!form.objective.trim()) return hints;

  const distanceKm = parseDistanceKm(form.distance_label || form.objective);
  const targetSeconds = parseSubTargetSeconds(form.objective, { distanceKm, discipline: form.discipline });

  if ((form.discipline === "running" || form.discipline === "triatlón") && distanceKm && targetSeconds) {
    const paceSeconds = targetSeconds / distanceKm;
    hints.push(`Ritmo medio para cumplir: ${formatPace(paceSeconds)}`);
  }

  if (form.discipline === "ciclismo" || form.discipline === "triatlón") {
    const ftpWatts = extractFtpWatts(form.objective);
    if (ftpWatts) {
      hints.push(`Potencia de referencia para cumplir: ${Math.round(ftpWatts)} W`);
    }
  }

  if (form.discipline === "triatlón" && targetSeconds) {
    hints.push(`Tiempo total objetivo detectado: ${formatClock(targetSeconds)}`);
  }

  return hints;
}

function buildTriathlonDisciplineHints(form: {
  objective: string;
  distance_label: string;
  target_running_pace_label: string;
  target_swim_pace_label: string;
  target_cycling_power_watts: string;
  transition_1_seconds: string;
  transition_2_seconds: string;
  bike_elevation_gain_m: string;
}, athleteWeight?: number | null) {
  const race = parseTriathlonDistanceLabel(form.distance_label);
  const planningModel = triathlonPlanningModel(form.distance_label);
  const totalSeconds = parseSubTargetSeconds(form.objective, { discipline: "triatlón" });
  if (!race || !totalSeconds || !planningModel) {
    return { swim: [], bike: [], run: [] } as Record<"swim" | "bike" | "run", string[]>;
  }

  const runPace = parseRunningPaceLabel(form.target_running_pace_label);
  const swimPace = parseSwimPaceLabel(form.target_swim_pace_label);
  const bikeWattsPerKg = form.target_cycling_power_watts ? Number(form.target_cycling_power_watts) : null;
  const bikeElevationGain = safeNumber(form.bike_elevation_gain_m);
  const bikeSpeed = bikeWattsPerKg ? estimateBikeSpeedFromWattsPerKg(bikeWattsPerKg, bikeElevationGain, race.bikeKm) : null;

  const providedSegments = {
    swim: swimPace ? (swimPace * race.swimMeters) / 100 : null,
    bike: bikeSpeed ? (race.bikeKm / bikeSpeed) * 3600 : null,
    run: runPace ? runPace * race.runKm : null,
  };

  const providedCount = Object.values(providedSegments).filter(isDefined).length;
  const availableRaceSeconds = totalSeconds - planningModel.transitionsSeconds;
  const remainingSeconds = availableRaceSeconds - (providedSegments.swim ?? 0) - (providedSegments.bike ?? 0) - (providedSegments.run ?? 0);
  const ratio = planningModel.split;

  const hints: Record<"swim" | "bike" | "run", string[]> = { swim: [], bike: [], run: [] };

  if (providedSegments.swim) {
    hints.swim.push(`Tiempo estimado disciplina: ${formatClock(providedSegments.swim)}`);
  }
  if (providedSegments.run) {
    hints.run.push(`Tiempo estimado disciplina: ${formatClock(providedSegments.run)}`);
  }
  if (providedSegments.bike) {
    hints.bike.push(`Tiempo estimado disciplina: ${formatClock(providedSegments.bike)}`);
  }

  if (providedCount <= 1) {
    const suggestedSwimSeconds = availableRaceSeconds * ratio.swim;
    const suggestedBikeSeconds = availableRaceSeconds * ratio.bike;
    const suggestedRunSeconds = availableRaceSeconds * ratio.run;
    const suggestedBikeSpeed = race.bikeKm / (suggestedBikeSeconds / 3600);
    const suggestedBikeWkg = estimateWattsPerKgFromBikeSpeed(suggestedBikeSpeed, bikeElevationGain, race.bikeKm);
    hints.swim.push(`Referencia inicial: ${formatSwimPacePer100m((suggestedSwimSeconds / race.swimMeters) * 100)}`);
    hints.swim.push(`Tiempo objetivo disciplina: ${formatClock(suggestedSwimSeconds)}`);
    hints.run.push(`Referencia inicial: ${formatPace(suggestedRunSeconds / race.runKm)}`);
    hints.run.push(`Tiempo objetivo disciplina: ${formatClock(suggestedRunSeconds)}`);
    hints.bike.push(
      `Referencia inicial: ${suggestedBikeWkg.toFixed(2)} W/kg${athleteWeight ? ` · ${Math.round(suggestedBikeWkg * athleteWeight)} W` : ""} · ${formatSpeedKph(
        suggestedBikeSpeed,
      )}`,
    );
    hints.bike.push(`Tiempo objetivo disciplina: ${formatClock(suggestedBikeSeconds)}`);
  }

  if (providedCount === 2) {
    if (!providedSegments.swim) {
      const requiredSwimPer100 = (remainingSeconds / race.swimMeters) * 100;
      hints.swim.push(`Para cumplir el objetivo: ${formatSwimPacePer100m(requiredSwimPer100)}`);
      hints.swim.push(`Tiempo objetivo disciplina: ${formatClock(remainingSeconds)}`);
    }
    if (!providedSegments.run) {
      const requiredRunPace = remainingSeconds / race.runKm;
      hints.run.push(`Para cumplir el objetivo: ${formatPace(requiredRunPace)}`);
      hints.run.push(`Tiempo objetivo disciplina: ${formatClock(remainingSeconds)}`);
    }
    if (!providedSegments.bike) {
      const requiredBikeSpeed = race.bikeKm / (remainingSeconds / 3600);
      const requiredBikeWkg = estimateWattsPerKgFromBikeSpeed(requiredBikeSpeed, bikeElevationGain, race.bikeKm);
      hints.bike.push(
        `Para cumplir el objetivo: ${requiredBikeWkg.toFixed(2)} W/kg${athleteWeight ? ` · ${Math.round(requiredBikeWkg * athleteWeight)} W` : ""} · ${formatSpeedKph(
          requiredBikeSpeed,
        )}`,
      );
      hints.bike.push(`Tiempo objetivo disciplina: ${formatClock(remainingSeconds)}`);
    }
  }

  if (!hints.bike.length && bikeSpeed) {
    hints.bike.push(
      `Velocidad estimada con tu FTP objetivo: ${bikeWattsPerKg?.toFixed(2)} W/kg${athleteWeight && bikeWattsPerKg ? ` · ${Math.round(bikeWattsPerKg * athleteWeight)} W` : ""} · ${formatSpeedKph(
        bikeSpeed,
      )}`,
    );
    hints.bike.push(`Tiempo estimado disciplina: ${formatClock((race.bikeKm / bikeSpeed) * 3600)}`);
  }
  if (providedCount === 3) {
    const totalWithTransitions = (providedSegments.swim ?? 0) + (providedSegments.bike ?? 0) + (providedSegments.run ?? 0) + planningModel.transitionsSeconds;
    const deltaSeconds = Math.round(totalWithTransitions - totalSeconds);
    const targetBikeSeconds = availableRaceSeconds * ratio.bike;
    const targetBikeSpeed = race.bikeKm / (targetBikeSeconds / 3600);
    const targetBikeWkg = estimateWattsPerKgFromBikeSpeed(targetBikeSpeed, bikeElevationGain, race.bikeKm);
    hints.bike.push(`Con tu FTP actual, bici estimada: ${formatClock(providedSegments.bike ?? 0)}`);
    hints.bike.push(`Para cuadrar el objetivo total: ${targetBikeWkg.toFixed(2)} W/kg${athleteWeight ? ` · ${Math.round(targetBikeWkg * athleteWeight)} W` : ""} · ${formatSpeedKph(targetBikeSpeed)}`);
    hints.bike.push(
      deltaSeconds > 0
        ? `Con los tres parámetros actuales te irías a ${formatClock(totalWithTransitions)} (${formatClock(deltaSeconds)} por encima del objetivo).`
        : `Con los tres parámetros actuales saldría ${formatClock(totalWithTransitions)} (${formatClock(Math.abs(deltaSeconds))} por debajo del objetivo).`,
    );
  }
  hints.bike.push(`Desnivel bici considerado: ${Math.round(bikeElevationGain)} m+`);
  hints.bike.push("Estimación de velocidad basada en una bici aero media, posición normal y desnivel uniforme durante el recorrido.");

  return hints;
}

function buildTriathlonPlannerSummary(form: {
  objective: string;
  distance_label: string;
  target_running_pace_label: string;
  target_swim_pace_label: string;
  target_cycling_power_watts: string;
  transition_1_seconds: string;
  transition_2_seconds: string;
  bike_elevation_gain_m: string;
}) {
  const race = parseTriathlonDistanceLabel(form.distance_label);
  const totalGoalSeconds = parseSubTargetSeconds(form.objective, { discipline: "triatlón" });
  if (!race || !totalGoalSeconds) return null;

  const runPace = parseRunningPaceLabel(form.target_running_pace_label);
  const swimPace = parseSwimPaceLabel(form.target_swim_pace_label);
  const bikeWkg = form.target_cycling_power_watts ? Number(form.target_cycling_power_watts) : null;
  const transition1 = safeNumber(form.transition_1_seconds);
  const transition2 = safeNumber(form.transition_2_seconds);
  const elevation = safeNumber(form.bike_elevation_gain_m);
  const bikeSpeed = bikeWkg ? estimateBikeSpeedFromWattsPerKg(bikeWkg, elevation, race.bikeKm) : null;

  const swimSeconds = swimPace ? (swimPace * race.swimMeters) / 100 : null;
  const bikeSeconds = bikeSpeed ? (race.bikeKm / bikeSpeed) * 3600 : null;
  const runSeconds = runPace ? runPace * race.runKm : null;
  const allDefined = swimSeconds !== null && bikeSeconds !== null && runSeconds !== null;
  const totalCurrent = allDefined ? swimSeconds + bikeSeconds + runSeconds + transition1 + transition2 : null;

  return {
    totalGoalSeconds,
    swimSeconds,
    bikeSeconds,
    runSeconds,
    bikeSpeed,
    bikeWkg,
    transition1,
    transition2,
    totalCurrent,
    deltaSeconds: totalCurrent !== null ? Math.round(totalCurrent - totalGoalSeconds) : null,
  };
}

function estimatePowerAtLactate(
  entries: Array<{ lactate_mmol: number; power_watts?: number | null; power_source?: string | null }>,
  targetLactate: number,
) {
  const usable = entries
    .filter((entry) => entry.power_watts !== null && entry.power_watts !== undefined && entry.lactate_mmol !== null && entry.lactate_mmol !== undefined)
    .map((entry) => ({ lactate: entry.lactate_mmol, power: entry.power_watts as number, power_source: entry.power_source ?? null }))
    .sort((a, b) => a.lactate - b.lactate);

  if (!usable.length) return null;

  const exact = usable.find((entry) => Math.abs(entry.lactate - targetLactate) <= 0.05);
  if (exact) {
    return { power: exact.power, power_source: exact.power_source, interpolated: false };
  }

  const lower = [...usable].reverse().find((entry) => entry.lactate < targetLactate);
  const upper = usable.find((entry) => entry.lactate > targetLactate);
  if (lower && upper && upper.lactate !== lower.lactate) {
    const ratio = (targetLactate - lower.lactate) / (upper.lactate - lower.lactate);
    const power = lower.power + ratio * (upper.power - lower.power);
    return { power, power_source: lower.power_source === upper.power_source ? lower.power_source : null, interpolated: true };
  }

  const nearest = usable.reduce((best, current) =>
    Math.abs(current.lactate - targetLactate) < Math.abs(best.lactate - targetLactate) ? current : best,
  );
  return { power: nearest.power, power_source: nearest.power_source, interpolated: false };
}

function targetSummaryForDiscipline(
  target: {
    discipline: string;
    target_pace_label?: string | null;
    target_power_watts?: number | null;
    target_running_pace_label?: string | null;
    target_swim_pace_label?: string | null;
    target_cycling_power_watts?: number | null;
  },
  activeDiscipline: string,
) {
  if (target.discipline === "triatlón") {
    if (activeDiscipline === "ciclismo") {
      return target.target_cycling_power_watts ? `${Math.round(target.target_cycling_power_watts)} W` : "Sin potencia objetivo";
    }
    if (activeDiscipline === "natación") {
      return target.target_swim_pace_label || "Sin ritmo objetivo";
    }
    return target.target_running_pace_label || "Sin ritmo objetivo";
  }
  if (target.discipline === "ciclismo") {
    return target.target_power_watts ? `${Math.round(target.target_power_watts)} W` : "Sin potencia objetivo";
  }
  return target.target_pace_label || "Sin ritmo objetivo";
}

function blockMatchesDiscipline(block: AthleteFocusBlock, discipline: string, athletePrimaryDiscipline: string) {
  const blockDiscipline = block.priority_discipline || athletePrimaryDiscipline;
  return blockDiscipline === discipline;
}

function powerSourceLabel(value?: string | null) {
  if (value === "indoor") return "Potenciómetro de interior";
  if (value === "outdoor") return "Potenciómetro de a pie";
  return "Sin fuente";
}

function focusDirectionLabel(direction?: string) {
  if (direction === "improving") return "Respuesta positiva";
  if (direction === "degrading") return "Respuesta pobre";
  if (direction === "needs_baseline") return "Falta línea base";
  if (direction === "stable") return "Estable";
  return "Por revisar";
}

function selectFocusedEstimateTypesByDiscipline(goalCategory?: string | null, discipline?: string) {
  if (discipline === "ciclismo") return ["FTP"];
  if (discipline === "natación") return [];
  return selectFocusedEstimateTypes(goalCategory);
}

function latestEstimateByType(estimates: Estimate[]) {
  const grouped = new Map<string, Estimate>();
  for (const estimate of estimates) {
    const current = grouped.get(estimate.estimate_type);
    if (!current || new Date(estimate.valid_on).getTime() >= new Date(current.valid_on).getTime()) {
      grouped.set(estimate.estimate_type, estimate);
    }
  }
  return grouped;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function thresholdPrimaryValue(threshold: Threshold, discipline: string, athleteWeight?: number | null) {
  if (discipline === "ciclismo" && threshold.power_watts) {
    return formatPowerWithWeight(threshold.power_watts, athleteWeight);
  }
  return formatPace(threshold.pace_seconds_per_km);
}

function thresholdSecondaryValue(threshold: Threshold, discipline: string) {
  if (discipline === "ciclismo") {
    return `${threshold.lactate?.toFixed(1) ?? "-"} mmol/L · ${threshold.heart_rate ?? "-"} bpm`;
  }
  return `${threshold.lactate?.toFixed(1) ?? "-"} mmol/L · ${threshold.heart_rate ?? "-"} bpm`;
}

function thresholdDetailLine(threshold: Threshold, discipline: string, athleteWeight?: number | null) {
  if (discipline === "ciclismo") {
    return `Potencia ${formatPowerWithWeight(threshold.power_watts, athleteWeight)} · FC ${threshold.heart_rate ?? "-"} bpm · Lactato ${threshold.lactate?.toFixed(1) ?? "-"} mmol/L`;
  }
  return `Ritmo ${formatPace(threshold.pace_seconds_per_km)} · FC ${threshold.heart_rate ?? "-"} bpm · Lactato ${threshold.lactate?.toFixed(1) ?? "-"} mmol/L`;
}

function anaerobicSummary(threshold: Threshold | undefined, discipline: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo") {
    return `${threshold.power_watts ? `${Math.round(threshold.power_watts)} W` : "-"} · ${threshold.heart_rate ?? "-"} bpm`;
  }
  return `${formatPace(threshold.pace_seconds_per_km)} · ${threshold.heart_rate ?? "-"} bpm`;
}

function thresholdSummary(threshold: Threshold | undefined, discipline: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo") {
    return `${threshold.power_watts ? `${Math.round(threshold.power_watts)} W` : "-"} · ${threshold.heart_rate ?? "-"} bpm`;
  }
  return `${formatPace(threshold.pace_seconds_per_km)} · ${threshold.heart_rate ?? "-"} bpm`;
}

function cyclingThresholdRelation(power?: number | null, lt1Power?: number | null, lt2Power?: number | null) {
  if (power === null || power === undefined) return "Sin potencia";
  if (lt1Power && power < lt1Power) return "Por debajo de LT1";
  if (lt1Power && lt2Power && power >= lt1Power && power < lt2Power) return "Entre LT1 y LT2";
  if (lt2Power && power >= lt2Power) return "Por encima de LT2";
  return "Sin referencia suficiente";
}

function estimateLabelValue(estimate?: Estimate) {
  if (!estimate) return "n/d";
  if (estimate.unit === "ml/kg/min") {
    return `${Math.round(estimate.value * 10) / 10} ml/kg/min`;
  }
  if (estimate.unit === "mmol/L/s") {
    return `${Math.round(estimate.value * 100) / 100} mmol/L/s`;
  }
  return `${Math.round(estimate.value * 10) / 10} ${estimate.unit}`;
}

function latestHistorical(points: HistoricalPoint[] | undefined) {
  if (!points?.length) return null;
  return points[points.length - 1];
}

function shortenText(value: string, maxLength = 90) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

const CYCLING_CADENCE_BANDS = [
  { label: "60-65", min: 60, max: 65, color: "#6f6ad8" },
  { label: "65-70", min: 65, max: 70, color: "#5e86df" },
  { label: "70-75", min: 70, max: 75, color: "#4d9bc8" },
  { label: "75-80", min: 75, max: 80, color: "#319ea3" },
  { label: "80-85", min: 80, max: 85, color: "#2d9b78" },
  { label: "85-90", min: 85, max: 90, color: "#6d9f39" },
  { label: "90-95", min: 90, max: 95, color: "#b28728" },
  { label: "95+", min: 95, max: null, color: "#c45b2f" },
] as const;

const CYCLING_HISTORY_CADENCE_BANDS = [
  { label: "80-85", min: 80, max: 85, color: "#2f7de1" },
  { label: "85-90", min: 85, max: 90, color: "#2f9e5b" },
  { label: "90-95", min: 90, max: 95, color: "#d4a017" },
] as const;

function cadenceBandLabel(cadence?: number | null) {
  if (cadence === null || cadence === undefined) return null;
  const band = CYCLING_CADENCE_BANDS.find((item) =>
    item.max === null ? cadence >= item.min : cadence >= item.min && cadence < item.max,
  );
  return band?.label ?? null;
}

function cadenceHistoryBandLabel(cadence?: number | null) {
  if (cadence === null || cadence === undefined) return null;
  const band = CYCLING_HISTORY_CADENCE_BANDS.find((item) => cadence >= item.min && cadence < item.max);
  return band?.label ?? null;
}

function metricTone(direction?: string) {
  if (direction === "improving") return "positive";
  if (direction === "degrading") return "negative";
  return "neutral";
}

function evaluationTone(evaluation?: AthleteFocusBlockEvaluation | null) {
  if (!evaluation) return "neutral";
  const absoluteNegative = typeof evaluation.delta === "number" && evaluation.delta < 0;
  const relativeNegative = typeof evaluation.delta_relative === "number" && evaluation.delta_relative < 0;
  if (absoluteNegative || relativeNegative) return "negative";
  const absolutePositive = typeof evaluation.delta === "number" && evaluation.delta > 0;
  const relativePositive = typeof evaluation.delta_relative === "number" && evaluation.delta_relative > 0;
  if (absolutePositive || relativePositive) return "positive";
  return metricTone(evaluation.direction);
}

type IntervalForm = {
  duration_mode: "seconds" | "km";
  duration_value: string;
  rest_seconds: string;
  sampled: boolean;
  lactate_mmol: string;
  sample_delay_seconds: string;
  heart_rate_avg: string;
  pace_min_per_km: string;
  power_watts: string;
  cadence: string;
  heart_rate_max: string;
  rpe: string;
};

const emptyInterval = (sampled = false): IntervalForm => ({
  duration_mode: "seconds",
  duration_value: "240",
  rest_seconds: "60",
  sampled,
  lactate_mmol: "",
  sample_delay_seconds: "30",
  heart_rate_avg: "",
  pace_min_per_km: "",
  power_watts: "",
  cadence: "",
  heart_rate_max: "",
  rpe: "",
});

function parseMinPerKm(value: string) {
  const text = value.trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

type AthleteDetailPageProps = {
  analysis: AthleteAnalysis | null;
  token: string;
  onSaved: () => Promise<void>;
};

export function AthleteDetailPage({ analysis, token, onSaved }: AthleteDetailPageProps) {
  const [trainingGoal, setTrainingGoal] = useState("");
  const [goalCategory, setGoalCategory] = useState("media_distancia");
  const [activeDiscipline, setActiveDiscipline] = useState("running");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 16));
  const [discipline, setDiscipline] = useState("running");
  const [sessionPowerSource, setSessionPowerSource] = useState("outdoor");
  const [sessionType, setSessionType] = useState("test incremental");
  const [goal, setGoal] = useState("Registro manual de lactato");
  const [surface, setSurface] = useState("");
  const [temperature, setTemperature] = useState("");
  const [comments, setComments] = useState("");
  const [blocksCount, setBlocksCount] = useState("1");
  const [intervals, setIntervals] = useState<IntervalForm[]>([emptyInterval(true)]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [cyclingPowerSourceMode, setCyclingPowerSourceMode] = useState<"outdoor" | "indoor" | "compare">("outdoor");
  const [cyclingPowerTarget, setCyclingPowerTarget] = useState("");
  const [cyclingPowerTolerance, setCyclingPowerTolerance] = useState("15");
  const [weightValue, setWeightValue] = useState("");
  const [weightDate, setWeightDate] = useState(new Date().toISOString().slice(0, 10));
  const [focusSubmitting, setFocusSubmitting] = useState(false);
  const [targetsOverlayOpen, setTargetsOverlayOpen] = useState(false);
  const [targetSubmitting, setTargetSubmitting] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null);
  const [triathlonDistancePreset, setTriathlonDistancePreset] = useState("manual");
  const [focusForm, setFocusForm] = useState({
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    energy_system_focus: "Aerobic Capacity",
    block_objective: "LT1",
    block_intent: "",
    priority_discipline: "running",
    phase: "acumulación",
    target_event: "",
    target_date: "",
    status: "planned",
    coach_notes: "",
  });
  const [targetForm, setTargetForm] = useState({
    target_date: new Date().toISOString().slice(0, 10),
    discipline: "running",
    distance_label: "",
    priority_level: "media",
    objective: "",
    target_pace_label: "",
    target_power_watts: "",
    target_running_pace_label: "",
    target_swim_pace_label: "",
    target_cycling_power_watts: "",
    transition_1_seconds: "240",
    transition_2_seconds: "240",
    bike_elevation_gain_m: "0",
    notes: "",
  });

  useEffect(() => {
    if (analysis?.athlete.training_goal) {
      setTrainingGoal(analysis.athlete.training_goal);
    }
  }, [analysis?.athlete.training_goal]);

  useEffect(() => {
    if (analysis?.athlete.goal_category) {
      setGoalCategory(analysis.athlete.goal_category);
    }
  }, [analysis?.athlete.goal_category]);

  useEffect(() => {
    if (!analysis) return;
    setFocusForm((current) => ({
      ...current,
      priority_discipline:
        analysis.athlete.primary_discipline === "triatlón" ? activeDiscipline : analysis.athlete.primary_discipline,
    }));
    setTargetForm((current) => ({
      ...current,
      discipline:
        analysis.athlete.primary_discipline === "triatlón"
          ? current.discipline === "triatlón"
            ? "triatlón"
            : activeDiscipline
          : analysis.athlete.primary_discipline,
    }));
  }, [analysis, activeDiscipline]);

  useEffect(() => {
    if (targetForm.discipline !== "triatlón") return;
    if (triathlonDistancePreset === "manual") return;
    const preset = TRIATHLON_DISTANCE_PRESETS[triathlonDistancePreset as keyof typeof TRIATHLON_DISTANCE_PRESETS];
    if (!preset) return;
    setTargetForm((current) => ({ ...current, distance_label: preset.label }));
  }, [triathlonDistancePreset, targetForm.discipline]);

  useEffect(() => {
    if (discipline === "running") return;
    setIntervals((current) =>
      current.map((item) => ({
        ...item,
        duration_mode: "seconds",
      })),
    );
  }, [discipline]);

  useEffect(() => {
    if (!analysis) return;
    const available = Object.keys(analysis.discipline_views ?? {});
    if (!available.length) {
      setActiveDiscipline(analysis.athlete.primary_discipline);
      return;
    }
    if (analysis.athlete.primary_discipline === "triatlón") {
      if (available.includes(activeDiscipline)) return;
      setActiveDiscipline(available.includes("running") ? "running" : available[0]);
      return;
    }
    setActiveDiscipline(available.includes(analysis.athlete.primary_discipline) ? analysis.athlete.primary_discipline : available[0]);
  }, [analysis, activeDiscipline]);

  useEffect(() => {
    if (!analysis || activeDiscipline !== "ciclismo") return;
    const sources = Object.keys(analysis.discipline_views?.ciclismo?.power_source_views ?? {});
    if (!sources.length) return;
    if (cyclingPowerSourceMode === "compare") return;
    if (!sources.includes(cyclingPowerSourceMode)) {
      setCyclingPowerSourceMode((sources.includes("outdoor") ? "outdoor" : sources[0]) as "outdoor" | "indoor");
    }
  }, [analysis, activeDiscipline, cyclingPowerSourceMode]);

  useEffect(() => {
    if (!analysis || activeDiscipline !== "ciclismo" || cyclingPowerTarget) return;
    const fallbackDisciplineKey =
      analysis.athlete.primary_discipline === "ciclismo" ? "ciclismo" : Object.keys(analysis.discipline_views ?? {}).find((key) => key === "ciclismo");
    if (!fallbackDisciplineKey) return;
    const sourceViews = analysis.discipline_views?.[fallbackDisciplineKey]?.power_source_views ?? {};
    const idealSource =
      cyclingPowerSourceMode === "compare"
        ? (sourceViews.outdoor ? "outdoor" : Object.keys(sourceViews)[0])
        : cyclingPowerSourceMode;
    const view =
      (idealSource ? analysis.discipline_views?.[fallbackDisciplineKey]?.power_source_views?.[idealSource] : null) ??
      analysis.discipline_views?.[fallbackDisciplineKey];
    const lt1Threshold = view?.thresholds.find((threshold) => threshold.name === "LT1");
    if (lt1Threshold?.power_watts) {
      setCyclingPowerTarget(String(Math.round(lt1Threshold.power_watts / 5) * 5));
      return;
    }
    const ftpEstimate = latestEstimateByType(view?.estimates ?? []).get("FTP");
    if (ftpEstimate) {
      setCyclingPowerTarget(String(Math.round(ftpEstimate.value / 5) * 5));
      return;
    }
    const firstEntry = view?.measurement_log.find((entry) => entry.power_watts !== null && entry.power_watts !== undefined);
    if (firstEntry?.power_watts) {
      setCyclingPowerTarget(String(Math.round(firstEntry.power_watts / 5) * 5));
    }
  }, [analysis, activeDiscipline, cyclingPowerTarget, cyclingPowerSourceMode]);

  if (!analysis) {
    return <div className="loading">Cargando análisis...</div>;
  }

  const fallbackView: DisciplineView = {
    discipline: analysis.athlete.primary_discipline,
    power_source: null,
    latest_snapshot_date: analysis.latest_snapshot_date,
    thresholds: analysis.thresholds,
    zones: analysis.zones,
    estimates: analysis.estimates,
    recent_sessions: analysis.recent_sessions,
    curve_history: analysis.curve_history,
    historical_evolution: analysis.historical_evolution,
    power_bests: [],
    measurement_log: [],
    power_source_views: null,
  };
  const currentView = analysis.discipline_views?.[activeDiscipline] ?? fallbackView;
  const availableCyclingSourceViews = currentView.power_source_views ?? {};
  const preferredCyclingSource =
    cyclingPowerSourceMode === "compare"
      ? (availableCyclingSourceViews.outdoor ? "outdoor" : Object.keys(availableCyclingSourceViews)[0] || "outdoor")
      : cyclingPowerSourceMode;
  const selectedCyclingView =
    activeDiscipline === "ciclismo"
      ? availableCyclingSourceViews[preferredCyclingSource] ?? currentView
      : currentView;
  const sortedWeightEntries =
    (analysis.athlete.weights ?? [])
      .filter((entry) => isPlausibleAthleteWeight(entry.weight))
      .slice()
      .sort((a, b) => {
      const dateDiff = String(b.recorded_at).localeCompare(String(a.recorded_at));
      return dateDiff !== 0 ? dateDiff : b.id - a.id;
    });
  const latestWeightEntry = sortedWeightEntries[0];
  const athleteWeight = latestWeightEntry?.weight ?? (isPlausibleAthleteWeight(analysis.athlete.weight) ? analysis.athlete.weight : null);
  const weightTrendReference =
    latestWeightEntry
      ? sortedWeightEntries.find((entry) => {
          const latestDate = new Date(latestWeightEntry.recorded_at).getTime();
          const entryDate = new Date(entry.recorded_at).getTime();
          return latestDate - entryDate >= 21 * 24 * 60 * 60 * 1000;
        }) ?? sortedWeightEntries[sortedWeightEntries.length - 1]
      : undefined;
  const weightTrendValue =
    latestWeightEntry && weightTrendReference && latestWeightEntry.id !== weightTrendReference.id
      ? Number((latestWeightEntry.weight - weightTrendReference.weight).toFixed(1))
      : null;
  const targetHints = buildObjectiveHints(targetForm);
  const cyclingReferenceView =
    analysis.discipline_views?.ciclismo?.power_source_views?.outdoor ??
    analysis.discipline_views?.ciclismo?.power_source_views?.indoor ??
    analysis.discipline_views?.ciclismo ??
    null;
  const ironmanLactateReference =
    targetForm.discipline === "triatlón" && triathlonPresetKeyFromLabel(targetForm.distance_label) === "ironman"
      ? estimatePowerAtLactate(cyclingReferenceView?.measurement_log ?? [], 2.2)
      : null;
  const triathlonHints = buildTriathlonDisciplineHints(targetForm, athleteWeight);
  if (ironmanLactateReference && targetForm.discipline === "triatlón") {
    const relative = athleteWeight ? `${(ironmanLactateReference.power / athleteWeight).toFixed(2)} W/kg` : null;
    triathlonHints.bike.push(
      `Comentario fisiológico: en tu histórico ciclista, ~2.2 mmol se sitúan alrededor de ${Math.round(ironmanLactateReference.power)} W${relative ? ` · ${relative}` : ""}${
        ironmanLactateReference.power_source ? ` (${powerSourceLabel(ironmanLactateReference.power_source)})` : ""
      }. Úsalo como referencia orientativa para el tramo IM; no modifica el cálculo del objetivo.`,
    );
  }
  const triathlonPlannerSummary = buildTriathlonPlannerSummary(targetForm);
  const displayView = activeDiscipline === "ciclismo" ? selectedCyclingView : currentView;
  const estimatesByType = latestEstimateByType(displayView.estimates);
  const focusedEstimates = selectFocusedEstimateTypesByDiscipline(goalCategory, activeDiscipline)
    .map((type) => estimatesByType.get(type))
    .filter((estimate): estimate is Estimate => Boolean(estimate));
  const vo2maxEstimate = estimatesByType.get("VO2max");
  const vlamaxEstimate = estimatesByType.get("VLAMAX");
  const lt1 = displayView.thresholds.find((threshold) => threshold.name === "LT1");
  const lt2 = displayView.thresholds.find((threshold) => threshold.name === "LT2");
  const cyclingEntries = displayView.measurement_log.filter(
    (entry) => entry.power_watts !== null && entry.power_watts !== undefined && entry.cadence !== null && entry.cadence !== undefined,
  );
  const comparableCyclingTarget =
    cyclingPowerTarget ||
    (lt1?.power_watts ? String(Math.round(lt1.power_watts / 5) * 5) : estimatesByType.get("FTP") ? String(Math.round(estimatesByType.get("FTP")!.value / 5) * 5) : cyclingEntries[0]?.power_watts ? String(Math.round((cyclingEntries[0].power_watts as number) / 5) * 5) : "");
  const comparableTolerance = Math.max(5, Number(cyclingPowerTolerance) || 15);
  const filteredCyclingEntries =
    activeDiscipline === "ciclismo" && comparableCyclingTarget
      ? cyclingEntries.filter((entry) => Math.abs((entry.power_watts as number) - Number(comparableCyclingTarget)) <= comparableTolerance)
      : [];
  const cadenceBandTrendMap = new Map<
    string,
    {
      label: string;
      color: string;
      values: number[];
      powers: number[];
      first?: number;
      last?: number;
      count: number;
    }
  >();
  const trendDateMap = new Map<string, Record<string, number | string | null>>();

  filteredCyclingEntries.forEach((entry) => {
    const bandLabel = cadenceBandLabel(entry.cadence);
    if (!bandLabel) return;
    const bandMeta = CYCLING_CADENCE_BANDS.find((item) => item.label === bandLabel);
    const dateKey = entry.session_date;
    const trendRow = trendDateMap.get(dateKey) ?? { date: dateKey };
    const currentValue = trendRow[bandLabel];
    const currentPowerValue = trendRow[`${bandLabel}__power`];
    const nextValue = typeof currentValue === "number" ? (currentValue + entry.lactate_mmol) / 2 : entry.lactate_mmol;
    const nextPowerValue =
      typeof currentPowerValue === "number" ? (currentPowerValue + (entry.power_watts as number)) / 2 : (entry.power_watts as number);
    trendRow[bandLabel] = Math.round(nextValue * 100) / 100;
    trendRow[`${bandLabel}__power`] = Math.round(nextPowerValue);
    trendDateMap.set(dateKey, trendRow);

    const currentBand =
      cadenceBandTrendMap.get(bandLabel) ?? { label: bandLabel, color: bandMeta?.color ?? "#17343c", values: [], powers: [], count: 0 };
    currentBand.values.push(entry.lactate_mmol);
    currentBand.powers.push(entry.power_watts as number);
    currentBand.count += 1;
    cadenceBandTrendMap.set(bandLabel, currentBand);
  });

  const cyclingCadenceTrendData = Array.from(trendDateMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const cyclingCadenceBandSummaries = CYCLING_CADENCE_BANDS.map((band) => {
    const raw = cadenceBandTrendMap.get(band.label);
    const orderedBandValues = cyclingCadenceTrendData
      .map((row) => row[band.label])
      .filter((value): value is number => typeof value === "number");
    const first = orderedBandValues[0];
    const last = orderedBandValues[orderedBandValues.length - 1];
    return {
      label: band.label,
      color: band.color,
      count: raw?.count ?? 0,
      average: raw?.values.length ? raw.values.reduce((sum, value) => sum + value, 0) / raw.values.length : null,
      averagePower: raw?.powers.length ? raw.powers.reduce((sum, value) => sum + value, 0) / raw.powers.length : null,
      minPower: raw?.powers.length ? Math.min(...raw.powers) : null,
      maxPower: raw?.powers.length ? Math.max(...raw.powers) : null,
      first,
      last,
      delta: first !== undefined && last !== undefined ? last - first : null,
    };
  }).filter((item) => item.count > 0);
  const cyclingScatterData = filteredCyclingEntries.map((entry, index) => ({
    id: `${entry.session_id}-${entry.interval_label}-${index}`,
    cadence: entry.cadence as number,
    lactate: entry.lactate_mmol,
    power: entry.power_watts as number,
    date: entry.session_date,
    band: cadenceBandLabel(entry.cadence) ?? "n/d",
  }));
  const cyclingComparableRows = filteredCyclingEntries
    .slice()
    .sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)))
    .slice(0, 16);
  const cyclingThresholdPowerRows = cyclingEntries
    .slice()
    .sort((a, b) => ((b.power_watts as number) - (a.power_watts as number)))
    .slice(0, 20);
  const cyclingThresholdPlotData = cyclingThresholdPowerRows.map((entry, index) => ({
    id: `${entry.session_id}-${entry.interval_label}-plot-${index}`,
    sessionDate: entry.session_date,
    intervalLabel: entry.interval_label,
    power: entry.power_watts as number,
    wattsPerKg: entry.power_watts && athleteWeight ? Number(((entry.power_watts as number) / athleteWeight).toFixed(2)) : null,
    lactate: entry.lactate_mmol,
    cadence: entry.cadence,
    relation: cyclingThresholdRelation(entry.power_watts, lt1?.power_watts, lt2?.power_watts),
  }));
  const lt1FocusWindow = lt1?.power_watts ? 22 : null;
  const cyclingThresholdLt1FocusData =
    lt1?.power_watts && lt1FocusWindow
      ? cyclingThresholdPlotData.filter((point) => Math.abs(point.power - lt1.power_watts!) <= lt1FocusWindow)
      : [];
  const thresholdPowerValues = cyclingThresholdPlotData.map((point) => point.power);
  const thresholdLactateValues = cyclingThresholdPlotData.map((point) => point.lactate);
  const thresholdPowerMin = thresholdPowerValues.length ? Math.min(...thresholdPowerValues) : null;
  const thresholdPowerMax = thresholdPowerValues.length ? Math.max(...thresholdPowerValues) : null;
  const thresholdLactateMin = thresholdLactateValues.length ? Math.min(...thresholdLactateValues) : null;
  const thresholdLactateMax = thresholdLactateValues.length ? Math.max(...thresholdLactateValues) : null;
  const lt1FocusPowerValues = cyclingThresholdLt1FocusData.map((point) => point.power);
  const lt1FocusLactateValues = cyclingThresholdLt1FocusData.map((point) => point.lactate);
  const lt1FocusPowerMin = lt1FocusPowerValues.length ? Math.min(...lt1FocusPowerValues) : null;
  const lt1FocusPowerMax = lt1FocusPowerValues.length ? Math.max(...lt1FocusPowerValues) : null;
  const lt1FocusLactateMin = lt1FocusLactateValues.length ? Math.min(...lt1FocusLactateValues) : null;
  const lt1FocusLactateMax = lt1FocusLactateValues.length ? Math.max(...lt1FocusLactateValues) : null;
  const cyclingEfficiencyHistoryData = cyclingEntries
    .map((entry, index) => ({
      id: `${entry.session_id}-${entry.interval_label}-history-${index}`,
      sessionDate: entry.session_date,
      intervalLabel: entry.interval_label,
      wattsPerKg: entry.power_watts && athleteWeight ? Number(((entry.power_watts as number) / athleteWeight).toFixed(2)) : null,
      lactate: entry.lactate_mmol,
      heartRate: entry.heart_rate_avg ?? null,
      cadence: entry.cadence ?? null,
      cadenceBand: cadenceHistoryBandLabel(entry.cadence),
    }))
    .filter((entry) => entry.cadenceBand && entry.wattsPerKg !== null)
    .sort((a, b) => String(a.sessionDate).localeCompare(String(b.sessionDate)));

  const chartOverlays = [
    { label: "LT1", value: thresholdSummary(lt1, activeDiscipline), tone: "positive" as const },
    { label: "LT2", value: thresholdSummary(lt2, activeDiscipline), tone: "negative" as const },
    { label: "VO2max", value: vo2maxEstimate ? `${Math.round(vo2maxEstimate.value * 10) / 10} ml/kg/min` : "n/d", tone: "neutral" as const },
    { label: "VLAMAX", value: vlamaxEstimate ? `${Math.round(vlamaxEstimate.value * 100) / 100} mmol/L/s` : "n/d", tone: "warning" as const },
  ];
  const focusEvaluationsById = new Map((analysis.focus_block_evaluations ?? []).map((item) => [item.block_id, item]));
  const disciplineFocusBlocks = (analysis.athlete.focus_blocks ?? []).filter((block) =>
    blockMatchesDiscipline(block, activeDiscipline, analysis.athlete.primary_discipline),
  );
  const activeFocusBlock = disciplineFocusBlocks.find((block) => block.status === "active");
  const activeFocusBlockWithEvaluation = activeFocusBlock
    ? { ...activeFocusBlock, evaluation: focusEvaluationsById.get(activeFocusBlock.id) }
    : null;
  const disciplineTargets = (analysis.athlete.targets ?? []).filter(
    (target) =>
      target.discipline === activeDiscipline ||
      (analysis.athlete.primary_discipline === "triatlón" && target.discipline === "triatlón"),
  );

  function buildPlotView(disciplineKey: string) {
    const baseView = analysis.discipline_views?.[disciplineKey] ?? fallbackView;
    const availableSourceViews = baseView.power_source_views ?? {};
    const resolvedView =
      disciplineKey === "ciclismo"
        ? availableSourceViews[preferredCyclingSource] ?? baseView
        : baseView;
    const compareViews =
      disciplineKey === "ciclismo" && cyclingPowerSourceMode === "compare"
        ? Object.entries(availableSourceViews)
            .map(([sourceKey, sourceView]) => ({ sourceKey, sourceView }))
            .filter(({ sourceView }) => sourceView.thresholds.length || sourceView.measurement_log.length)
        : [];
    const disciplineEstimates = latestEstimateByType(resolvedView.estimates);
    const disciplineLt1 = resolvedView.thresholds.find((threshold) => threshold.name === "LT1");
    const disciplineLt2 = resolvedView.thresholds.find((threshold) => threshold.name === "LT2");
    const disciplinePlotData = resolvedView.thresholds
      .filter((threshold) => (disciplineKey === "ciclismo" ? threshold.power_watts : threshold.pace_seconds_per_km) && threshold.lactate)
      .map((threshold) => ({
        name: threshold.name,
        x: disciplineKey === "ciclismo" ? (threshold.power_watts as number) : (threshold.pace_seconds_per_km as number),
        lactate: threshold.lactate as number,
        power_source: resolvedView.power_source,
      }));
    const source = disciplineKey === "ciclismo" ? (resolvedView.curve_history.power ?? []) : (resolvedView.curve_history.pace ?? []);
    const pool = source
      .filter((point) => point.x && point.lactate)
      .map((point, index) => ({
        id: `${disciplineKey}-${point.interval_id}-${index}`,
        x: point.x,
        lactate: point.lactate,
        label: point.label,
        sessionDate: point.session_date,
        powerSource: point.power_source,
      }))
      .filter((point) => {
        if (historyFrom && point.sessionDate < historyFrom) return false;
        if (historyTo && point.sessionDate > historyTo) return false;
        return true;
      });
    const comparePools = compareViews.map(({ sourceKey, sourceView }) => ({
      sourceKey,
      color: sourceKey === "indoor" ? "#2f7de1" : "#c45b2f",
      label: powerSourceLabel(sourceKey),
      points: (sourceView.curve_history.power ?? [])
        .filter((point) => point.x && point.lactate)
        .map((point, index) => ({
          id: `${sourceKey}-${point.interval_id}-${index}`,
          x: point.x,
          lactate: point.lactate,
          label: point.label,
          sessionDate: point.session_date,
          powerSource: point.power_source,
        }))
        .filter((point) => {
          if (historyFrom && point.sessionDate < historyFrom) return false;
          if (historyTo && point.sessionDate > historyTo) return false;
          return true;
        }),
      thresholds: sourceView.thresholds,
      lt1: sourceView.thresholds.find((threshold) => threshold.name === "LT1"),
      lt2: sourceView.thresholds.find((threshold) => threshold.name === "LT2"),
    }));
    return {
      view: resolvedView,
      lt1: disciplineLt1,
      lt2: disciplineLt2,
      plotData: disciplinePlotData,
      pool,
      comparePools,
      plotLabel: disciplineKey === "ciclismo" ? "Potencia" : "Ritmo en min/km",
      vo2max: disciplineEstimates.get("VO2max"),
      vlamax: disciplineEstimates.get("VLAMAX"),
    };
  }

  function buildDurationSeconds(interval: IntervalForm) {
    if (interval.duration_mode === "seconds") {
      return Number(interval.duration_value);
    }
    if (discipline !== "running") {
      throw new Error("La duración en km solo está disponible para running.");
    }
    const km = Number(interval.duration_value);
    const pace = parseMinPerKm(interval.pace_min_per_km);
    if (!km || !pace) {
      throw new Error("Si la duración está en km, debes introducir también el ritmo medio en min/km.");
    }
    return Math.round(km * pace);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await api.createSession(token, {
        athlete_id: analysis.athlete.id,
        performed_at: performedAt,
        discipline,
        power_source: discipline === "ciclismo" ? sessionPowerSource : null,
        session_type: sessionType,
        goal,
        surface: surface || null,
        temperature_c: temperature ? Number(temperature) : null,
        comments: comments || null,
        intervals: intervals.map((interval, index) => ({
          order_index: index + 1,
          duration_seconds: buildDurationSeconds(interval),
          rest_seconds: interval.rest_seconds ? Number(interval.rest_seconds) : null,
          rest_type: "configured",
          heart_rate_avg: interval.heart_rate_avg ? Number(interval.heart_rate_avg) : null,
          heart_rate_max: interval.heart_rate_max ? Number(interval.heart_rate_max) : null,
          pace_seconds_per_km: discipline === "running" ? parseMinPerKm(interval.pace_min_per_km) : null,
          power_watts: discipline === "ciclismo" && interval.power_watts ? Number(interval.power_watts) : null,
          running_power_watts: null,
          cadence: interval.cadence ? Number(interval.cadence) : null,
          rpe: interval.rpe ? Number(interval.rpe) : null,
          purpose: "LT1",
          notes: null,
          lactate_sample: interval.sampled && interval.lactate_mmol
            ? {
                lactate_mmol: Number(interval.lactate_mmol),
                sample_delay_seconds: interval.sample_delay_seconds ? Number(interval.sample_delay_seconds) : 0,
                sample_timing_label: interval.sample_delay_seconds ? `tras ${interval.sample_delay_seconds}s` : "sin registrar",
                sampling_notes: null,
              }
            : null,
        })),
      });
      setSaveMessage("Sesión y datos de lactato guardados.");
      setIntervals([emptyInterval(true)]);
      setBlocksCount("1");
      setGoal("Registro manual de lactato");
      setComments("");
      setSurface("");
      setTemperature("");
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la sesión.");
    } finally {
      setSaving(false);
    }
  }

  function updateInterval(index: number, field: keyof IntervalForm, value: string) {
    const sharedTemplateFields: Array<keyof IntervalForm> = [
      "duration_mode",
      "duration_value",
      "rest_seconds",
      "heart_rate_avg",
      "pace_min_per_km",
      "power_watts",
      "cadence",
      "heart_rate_max",
      "rpe",
    ];
    setIntervals((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex === index) {
          return { ...item, [field]: value };
        }
        if (index === 0 && sharedTemplateFields.includes(field)) {
          return { ...item, [field]: value };
        }
        return item;
      }),
    );
  }

  function updateIntervalBoolean(index: number, value: boolean) {
    setIntervals((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              sampled: value,
              lactate_mmol: value ? item.lactate_mmol : "",
            }
          : item,
      ),
    );
  }

  function applyBlocksCount(nextValue: string) {
    setBlocksCount(nextValue);
    const count = Math.max(1, Number(nextValue) || 1);
    setIntervals((current) => {
      if (count === current.length) return current;
      if (count > current.length) {
        const expanded = [...current, ...Array.from({ length: count - current.length }, () => emptyInterval())];
        return expanded.map((item, itemIndex) => ({
          ...item,
          sampled: itemIndex === expanded.length - 1 ? true : item.sampled,
        }));
      }
      const sliced = current.slice(0, count);
      return sliced.map((item, itemIndex) => ({
        ...item,
        sampled: itemIndex === sliced.length - 1 ? true : item.sampled,
      }));
    });
  }

  async function saveGoal() {
    setSaveError(null);
    try {
      await api.updateAthlete(token, analysis.athlete.id, {
        training_goal: trainingGoal,
        goal_category: goalCategory,
      });
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el objetivo.");
    }
  }

  async function saveWeight() {
    setSaveError(null);
    setSaveMessage(null);
    try {
      await api.addAthleteWeight(token, analysis.athlete.id, {
        recorded_at: weightDate,
        weight: Number(weightValue),
        source: "manual",
      });
      setWeightValue("");
      setSaveMessage("Peso registrado.");
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el peso.");
    }
  }

  async function saveFocusBlock() {
    setSaveError(null);
    setSaveMessage(null);
    setFocusSubmitting(true);
    try {
      await api.addFocusBlock(token, analysis.athlete.id, {
        ...focusForm,
        end_date: focusForm.end_date || null,
        target_date: focusForm.target_date || null,
        target_event: focusForm.target_event || null,
        block_intent: focusForm.block_intent || null,
        coach_notes: focusForm.coach_notes || null,
      });
      setSaveMessage("Bloque de trabajo guardado.");
      setFocusForm((current) => ({
        ...current,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: "",
        block_intent: "",
        target_event: "",
        target_date: "",
        coach_notes: "",
        status: "planned",
      }));
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el bloque.");
    } finally {
      setFocusSubmitting(false);
    }
  }

  async function activatePlannedBlock(blockId: number) {
    setSaveError(null);
    try {
      await api.updateFocusBlock(token, analysis.athlete.id, blockId, { status: "active" });
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo activar el bloque.");
    }
  }

  async function saveAthleteTarget() {
    setSaveError(null);
    setSaveMessage(null);
    setTargetSubmitting(true);
    try {
      const payload = {
        target_date: targetForm.target_date,
        discipline: targetForm.discipline,
        objective: targetForm.objective,
        distance_label: targetForm.distance_label || null,
        priority_level: targetForm.priority_level || null,
        target_pace_label: targetForm.target_pace_label || null,
        target_power_watts: targetForm.target_power_watts ? Number(targetForm.target_power_watts) : null,
        target_running_pace_label: targetForm.target_running_pace_label || null,
        target_swim_pace_label: targetForm.target_swim_pace_label || null,
        target_cycling_power_watts:
          targetForm.target_cycling_power_watts && athleteWeight
            ? Number(targetForm.target_cycling_power_watts) * athleteWeight
            : targetForm.target_cycling_power_watts
              ? Number(targetForm.target_cycling_power_watts)
              : null,
        notes: targetForm.notes || null,
      };
      if (editingTargetId) {
        await api.updateAthleteTarget(token, analysis.athlete.id, editingTargetId, payload);
      } else {
        await api.addAthleteTarget(token, analysis.athlete.id, payload);
      }
      setSaveMessage(editingTargetId ? "Objetivo actualizado." : "Objetivo guardado.");
      setTargetsOverlayOpen(false);
      setEditingTargetId(null);
      setTargetForm((current) => ({
        ...current,
        distance_label: "",
        objective: "",
        target_pace_label: "",
        target_power_watts: "",
        target_running_pace_label: "",
        target_swim_pace_label: "",
        target_cycling_power_watts: "",
        transition_1_seconds: "240",
        transition_2_seconds: "240",
        bike_elevation_gain_m: "0",
        notes: "",
      }));
      setTriathlonDistancePreset("manual");
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el objetivo.");
    } finally {
      setTargetSubmitting(false);
    }
  }

  function loadTargetIntoForm(target: AthleteTarget) {
    setEditingTargetId(target.id);
    setTargetForm({
      target_date: target.target_date,
      discipline: target.discipline,
      distance_label: target.distance_label ?? "",
      priority_level: target.priority_level ?? "media",
      objective: target.objective,
      target_pace_label: target.target_pace_label ?? "",
      target_power_watts: target.target_power_watts ? String(target.target_power_watts) : "",
      target_running_pace_label: target.target_running_pace_label ?? "",
      target_swim_pace_label: target.target_swim_pace_label ?? "",
      target_cycling_power_watts:
        target.target_cycling_power_watts && athleteWeight ? (target.target_cycling_power_watts / athleteWeight).toFixed(2) : target.target_cycling_power_watts ? String(target.target_cycling_power_watts) : "",
      transition_1_seconds: "240",
      transition_2_seconds: "240",
      bike_elevation_gain_m: "0",
      notes: target.notes ?? "",
    });
    setTriathlonDistancePreset(target.discipline === "triatlón" ? triathlonPresetKeyFromLabel(target.distance_label) : "manual");
    setTargetsOverlayOpen(true);
  }

  async function deleteTarget(targetId: number) {
    setSaveError(null);
    if (!window.confirm("¿Quieres eliminar este objetivo/competición?")) return;
    try {
      await api.deleteAthleteTarget(token, analysis.athlete.id, targetId);
      if (editingTargetId === targetId) {
        setEditingTargetId(null);
      }
      setSaveMessage("Objetivo eliminado.");
      await onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo eliminar el objetivo.");
    }
  }

  return (
    <div className="page-grid">
      {targetsOverlayOpen ? (
        <div className="target-modal-backdrop" onClick={() => setTargetsOverlayOpen(false)}>
          <section className="card target-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <span className="eyebrow">Objetivos</span>
                <h2>Objetivos y competiciones</h2>
                <p>Configura distancia, prioridad y referencias operativas sin salir de la ficha del atleta.</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => setTargetsOverlayOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="list target-history-list modal-target-history">
              {(analysis.athlete.targets ?? []).map((target) => (
                <article key={target.id} className="list-item target-history-item">
                  <div className="status-head">
                    <strong>{target.objective}</strong>
                    <span className="status-badge neutral">{target.target_date}</span>
                  </div>
                  <p>
                    {disciplineLabel(target.discipline)}
                    {target.distance_label ? ` · ${target.distance_label}` : ""}
                    {target.priority_level ? ` · prioridad ${target.priority_level}` : ""}
                  </p>
                  <small>{targetSummaryForDiscipline(target, activeDiscipline)}</small>
                  {target.notes ? <small>{target.notes}</small> : null}
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={() => loadTargetIntoForm(target)}>
                      Editar
                    </button>
                    <button className="danger-button" type="button" onClick={() => deleteTarget(target.id)}>
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="athlete-form target-page-form">
              <label>
                Fecha
                <input type="date" value={targetForm.target_date} onChange={(event) => setTargetForm({ ...targetForm, target_date: event.target.value })} />
              </label>
              <label>
                Disciplina
                <select value={targetForm.discipline} onChange={(event) => setTargetForm({ ...targetForm, discipline: event.target.value })}>
                  {analysis.athlete.primary_discipline === "triatlón" ? (
                    <>
                      <option value="triatlón">Triatlón</option>
                      <option value="natación">Natación</option>
                      <option value="ciclismo">Ciclismo</option>
                      <option value="running">Carrera a pie</option>
                    </>
                  ) : (
                    <option value={analysis.athlete.primary_discipline}>{disciplineLabel(analysis.athlete.primary_discipline)}</option>
                  )}
                </select>
              </label>
              <label>
                Distancia
                {targetForm.discipline === "triatlón" ? (
                  <>
                    <select value={triathlonDistancePreset} onChange={(event) => setTriathlonDistancePreset(event.target.value)}>
                      <option value="ironman">IRONMAN</option>
                      <option value="half">Media distancia</option>
                      <option value="olympic">Olímpico</option>
                      <option value="sprint">Sprint</option>
                      <option value="manual">Manual</option>
                    </select>
                    {triathlonDistancePreset === "manual" ? (
                      <input
                        value={targetForm.distance_label}
                        onChange={(event) => setTargetForm({ ...targetForm, distance_label: event.target.value })}
                        placeholder="Introduce distancia personalizada"
                      />
                    ) : null}
                  </>
                ) : (
                  <input
                    value={targetForm.distance_label}
                    onChange={(event) => setTargetForm({ ...targetForm, distance_label: event.target.value })}
                    placeholder="5K, 10K, maratón, 1500m..."
                  />
                )}
              </label>
              <label>
                Prioridad
                <select value={targetForm.priority_level} onChange={(event) => setTargetForm({ ...targetForm, priority_level: event.target.value })}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </label>
              <label className="full-width">
                Objetivo
                <input value={targetForm.objective} onChange={(event) => setTargetForm({ ...targetForm, objective: event.target.value })} placeholder="Sub 1:15 HM, FTP 320, podio M35..." />
              </label>
              {targetHints.length ? (
                <div className="target-hints full-width target-hints-summary">
                  {targetHints.map((hint) => (
                    <small key={hint}>{hint}</small>
                  ))}
                </div>
              ) : null}
              {targetForm.discipline === "triatlón" && triathlonPlannerSummary ? (
                <div className="triathlon-counter full-width">
                  <article className="triathlon-counter-card primary">
                    <span>Objetivo total</span>
                    <strong>{formatClock(triathlonPlannerSummary.totalGoalSeconds)}</strong>
                    <small>
                      Actual: {triathlonPlannerSummary.totalCurrent ? formatClock(triathlonPlannerSummary.totalCurrent) : "Completa las tres disciplinas"}
                    </small>
                    {triathlonPlannerSummary.deltaSeconds !== null ? (
                      <small
                        className={`evaluation-delta ${
                          triathlonPlannerSummary.deltaSeconds < 0 ? "positive" : triathlonPlannerSummary.deltaSeconds > 0 ? "negative" : "neutral"
                        }`}
                      >
                        {formatDeltaClock(triathlonPlannerSummary.deltaSeconds)}
                      </small>
                    ) : null}
                  </article>
                  <article className="triathlon-counter-card">
                    <span>Natación</span>
                    <strong>{triathlonPlannerSummary.swimSeconds ? formatClock(triathlonPlannerSummary.swimSeconds) : "-"}</strong>
                    <small>Segmento actual</small>
                  </article>
                  <article className="triathlon-counter-card">
                    <span>Ciclismo</span>
                    <strong>{triathlonPlannerSummary.bikeSeconds ? formatClock(triathlonPlannerSummary.bikeSeconds) : "-"}</strong>
                    <small>
                      {triathlonPlannerSummary.bikeSpeed && triathlonPlannerSummary.bikeWkg
                        ? `${triathlonPlannerSummary.bikeWkg.toFixed(2)} W/kg · ${formatSpeedKph(triathlonPlannerSummary.bikeSpeed)}`
                        : "Introduce W/kg"}
                    </small>
                  </article>
                  <article className="triathlon-counter-card">
                    <span>Carrera a pie</span>
                    <strong>{triathlonPlannerSummary.runSeconds ? formatClock(triathlonPlannerSummary.runSeconds) : "-"}</strong>
                    <small>Segmento actual</small>
                  </article>
                  <article className="triathlon-counter-card">
                    <span>Transiciones</span>
                    <strong>{formatClock(triathlonPlannerSummary.transition1 + triathlonPlannerSummary.transition2)}</strong>
                    <small>
                      T1 {formatClock(triathlonPlannerSummary.transition1)} · T2 {formatClock(triathlonPlannerSummary.transition2)}
                    </small>
                  </article>
                </div>
              ) : null}
              {targetForm.discipline !== "triatlón" ? (
                <>
                  <label>
                    Ritmo objetivo
                    <input
                      value={targetForm.target_pace_label}
                      onChange={(event) => setTargetForm({ ...targetForm, target_pace_label: event.target.value })}
                      placeholder={targetForm.discipline === "natación" ? "01:22/100m" : "03:35/km"}
                      disabled={targetForm.discipline === "ciclismo"}
                    />
                  </label>
                  <label>
                    Potencia objetivo
                    <input
                      type="number"
                      step="1"
                      value={targetForm.target_power_watts}
                      onChange={(event) => setTargetForm({ ...targetForm, target_power_watts: event.target.value })}
                      placeholder="300"
                      disabled={targetForm.discipline !== "ciclismo"}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Transición 1 (s)
                    <input
                      type="number"
                      step="1"
                      value={targetForm.transition_1_seconds}
                      onChange={(event) => setTargetForm({ ...targetForm, transition_1_seconds: event.target.value })}
                      placeholder="240"
                    />
                  </label>
                  <label>
                    Transición 2 (s)
                    <input
                      type="number"
                      step="1"
                      value={targetForm.transition_2_seconds}
                      onChange={(event) => setTargetForm({ ...targetForm, transition_2_seconds: event.target.value })}
                      placeholder="240"
                    />
                  </label>
                  <label>
                    Desnivel bici (m+)
                    <input
                      type="number"
                      step="1"
                      value={targetForm.bike_elevation_gain_m}
                      onChange={(event) => setTargetForm({ ...targetForm, bike_elevation_gain_m: event.target.value })}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Ritmo carrera a pie
                    <input value={targetForm.target_running_pace_label} onChange={(event) => setTargetForm({ ...targetForm, target_running_pace_label: event.target.value })} placeholder="03:35/km" />
                    {triathlonHints.run.length ? <div className="field-hints">{triathlonHints.run.map((hint) => <small key={hint}>{hint}</small>)}</div> : null}
                  </label>
                  <label>
                    Ritmo natación
                    <input value={targetForm.target_swim_pace_label} onChange={(event) => setTargetForm({ ...targetForm, target_swim_pace_label: event.target.value })} placeholder="01:22/100m" />
                    {triathlonHints.swim.length ? <div className="field-hints">{triathlonHints.swim.map((hint) => <small key={hint}>{hint}</small>)}</div> : null}
                  </label>
                  <label>
                    FTP ciclismo (W/kg)
                    <input
                      type="number"
                      step="0.01"
                      value={targetForm.target_cycling_power_watts}
                      onChange={(event) => setTargetForm({ ...targetForm, target_cycling_power_watts: event.target.value })}
                      placeholder="4.20"
                    />
                    {triathlonHints.bike.length ? <div className="field-hints">{triathlonHints.bike.map((hint) => <small key={hint}>{hint}</small>)}</div> : null}
                  </label>
                </>
              )}
              <label className="full-width">
                Notas
                <textarea rows={3} value={targetForm.notes} onChange={(event) => setTargetForm({ ...targetForm, notes: event.target.value })} />
              </label>
              <div className="button-row full-width">
                {editingTargetId ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setEditingTargetId(null);
                      setTargetForm((current) => ({
                        ...current,
                        target_date: new Date().toISOString().slice(0, 10),
                        distance_label: "",
                        priority_level: "media",
                        objective: "",
                        target_pace_label: "",
                        target_power_watts: "",
                        target_running_pace_label: "",
                        target_swim_pace_label: "",
                        target_cycling_power_watts: "",
                        transition_1_seconds: "240",
                        transition_2_seconds: "240",
                        bike_elevation_gain_m: "0",
                        notes: "",
                      }));
                      setTriathlonDistancePreset("manual");
                    }}
                  >
                    Cancelar edición
                  </button>
                ) : null}
                <button className="primary-button" type="button" onClick={saveAthleteTarget} disabled={targetSubmitting || !targetForm.objective}>
                  {targetSubmitting ? "Guardando..." : editingTargetId ? "Guardar cambios" : "Aceptar y guardar"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      <section className="hero card">
        <div>
          <span className="eyebrow">{disciplineLabel(activeDiscipline)}</span>
          <div className="athlete-title-row">
            <h1>{analysis.athlete.name}</h1>
            <button className="ghost-button" type="button" onClick={() => setTargetsOverlayOpen(true)}>
              Objetivos y competiciones
            </button>
            <small className="athlete-vo2-inline">
              VO2max {vo2maxEstimate ? `${Math.round(vo2maxEstimate.value * 10) / 10} ml/kg/min` : "n/d"}
            </small>
          </div>
          <p>{analysis.athlete.notes}</p>
          <div className="hero-goal-row">
            <div className="goal-select">
              <span>Objetivo general</span>
              <div className="goal-chip-row">
                {[
                  { value: "larga_distancia", label: "Larga distancia" },
                  { value: "media_distancia", label: "Media distancia" },
                  { value: "corta_distancia", label: "Corta distancia" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`goal-chip ${goalCategory === option.value ? "active" : ""}`}
                    onClick={() => setGoalCategory(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {analysis.athlete.primary_discipline === "triatlón" ? (
              <div className="discipline-tab-row">
                {["natación", "ciclismo", "running"].filter((discipline) => Object.keys(analysis.discipline_views).includes(discipline)).map((discipline) => (
                  <button
                    key={discipline}
                    type="button"
                    className={`discipline-tab ${activeDiscipline === discipline ? "active" : ""}`}
                    onClick={() => setActiveDiscipline(discipline)}
                  >
                    {disciplineLabel(discipline)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <details className="inline-weight-entry">
            <summary>Registrar peso</summary>
            <div className="inline-weight-form">
              <label>
                Fecha
                <input type="date" value={weightDate} onChange={(event) => setWeightDate(event.target.value)} />
              </label>
              <label>
                Peso (kg)
                <input type="number" step="0.1" min="0" value={weightValue} onChange={(event) => setWeightValue(event.target.value)} />
              </label>
              <button className="ghost-button" type="button" onClick={saveWeight} disabled={!weightValue}>
                Guardar peso
              </button>
            </div>
          </details>
        </div>
        <div className="hero-stats">
          {focusedEstimates.map((estimate) => {
            const raceSummary = racePredictionSummary(estimate);
            return (
              <div key={`hero-${estimate.estimate_type}`}>
                <span>{estimate.estimate_type}</span>
                <strong>
                  {raceSummary
                    ? raceSummary.pace
                    : activeDiscipline === "ciclismo" && estimate.unit === "W"
                      ? formatPowerWithWeight(estimate.value, athleteWeight)
                      : formatValue(estimate.value, estimate.unit)}
                </strong>
                <small>{raceSummary ? raceSummary.totalTime : activeDiscipline === "ciclismo" && estimate.unit === "W" ? estimate.unit : estimate.unit}</small>
              </div>
            );
          })}
          <div>
            <span>Último snapshot</span>
            <strong>{displayView.latest_snapshot_date ?? "Sin datos"}</strong>
          </div>
          <div>
            <span>Peso</span>
            <strong>{athleteWeight ? `${athleteWeight.toFixed(1)} kg` : "Sin dato"}</strong>
            <small>{latestWeightEntry ? `Último registro ${latestWeightEntry.recorded_at}` : "Sin histórico"}</small>
            {weightTrendValue !== null ? (
              <small className={`evaluation-delta ${weightTrendValue < 0 ? "positive" : weightTrendValue > 0 ? "negative" : "neutral"}`}>
                {weightTrendValue > 0 ? "+" : ""}
                {weightTrendValue.toFixed(1)} kg
              </small>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <span className="eyebrow">Mesociclo</span>
            <h2>Foco actual y planificación</h2>
          </div>
        </div>
        <div className="threshold-overview">
          <article className="threshold-legend-card lt1">
            <span className="threshold-dot lt1" />
            <div>
              <strong>Bloque activo</strong>
              {activeFocusBlockWithEvaluation ? (
                <>
                  <p>
                    {activeFocusBlockWithEvaluation.energy_system_focus} · {activeFocusBlockWithEvaluation.block_objective}
                    {activeFocusBlockWithEvaluation.priority_discipline ? ` · ${disciplineLabel(activeFocusBlockWithEvaluation.priority_discipline)}` : ""}
                  </p>
                  <small>
                    {activeFocusBlockWithEvaluation.start_date}
                    {activeFocusBlockWithEvaluation.end_date ? ` → ${activeFocusBlockWithEvaluation.end_date}` : " → abierto"} · {activeFocusBlockWithEvaluation.phase ?? "sin fase"}
                  </small>
                  <small>{activeFocusBlockWithEvaluation.block_intent || "Sin intención operativa definida todavía."}</small>
                </>
              ) : (
                <p>No hay bloque activo definido para este atleta.</p>
              )}
            </div>
          </article>
          <article className="threshold-legend-card lt2">
            <span className="threshold-dot lt2" />
            <div>
              <strong>Evaluación del bloque</strong>
              {activeFocusBlockWithEvaluation?.evaluation ? (
                <>
                  <p>{activeFocusBlockWithEvaluation.evaluation.summary}</p>
                  <small>
                    {focusDirectionLabel(activeFocusBlockWithEvaluation.evaluation.direction)} · {Math.round(activeFocusBlockWithEvaluation.evaluation.confidence * 100)}% confianza
                  </small>
                  <small>
                    {activeFocusBlockWithEvaluation.evaluation.key_metric}: {formatValue(activeFocusBlockWithEvaluation.evaluation.baseline_value, activeFocusBlockWithEvaluation.evaluation.unit)} →{" "}
                    {formatValue(activeFocusBlockWithEvaluation.evaluation.latest_value, activeFocusBlockWithEvaluation.evaluation.unit)}
                  </small>
                  {activeFocusBlockWithEvaluation.evaluation.delta !== null && activeFocusBlockWithEvaluation.evaluation.delta !== undefined ? (
                    <div className="evaluation-delta-row">
                      <small
                        className={`evaluation-delta ${
                          activeFocusBlockWithEvaluation.evaluation.delta > 0 ? "positive" : activeFocusBlockWithEvaluation.evaluation.delta < 0 ? "negative" : "neutral"
                        }`}
                      >
                        {formatSignedDelta(activeFocusBlockWithEvaluation.evaluation.delta, activeFocusBlockWithEvaluation.evaluation.unit)}
                      </small>
                      {activeFocusBlockWithEvaluation.evaluation.delta_relative !== null &&
                      activeFocusBlockWithEvaluation.evaluation.delta_relative !== undefined &&
                      activeFocusBlockWithEvaluation.evaluation.relative_unit ? (
                        <small
                          className={`evaluation-delta ${
                            activeFocusBlockWithEvaluation.evaluation.delta_relative > 0
                              ? "positive"
                              : activeFocusBlockWithEvaluation.evaluation.delta_relative < 0
                                ? "negative"
                                : "neutral"
                          }`}
                        >
                          {formatSignedDelta(activeFocusBlockWithEvaluation.evaluation.delta_relative, activeFocusBlockWithEvaluation.evaluation.relative_unit)}
                        </small>
                      ) : null}
                    </div>
                  ) : null}
                  {activeFocusBlockWithEvaluation.evaluation.baseline_relative_value !== null &&
                  activeFocusBlockWithEvaluation.evaluation.baseline_relative_value !== undefined &&
                  activeFocusBlockWithEvaluation.evaluation.latest_relative_value !== null &&
                  activeFocusBlockWithEvaluation.evaluation.latest_relative_value !== undefined &&
                  activeFocusBlockWithEvaluation.evaluation.relative_unit ? (
                    <small>
                      Relativo: {activeFocusBlockWithEvaluation.evaluation.baseline_relative_value.toFixed(2)} {activeFocusBlockWithEvaluation.evaluation.relative_unit} →{" "}
                      {activeFocusBlockWithEvaluation.evaluation.latest_relative_value.toFixed(2)} {activeFocusBlockWithEvaluation.evaluation.relative_unit}
                    </small>
                  ) : null}
                  {activeFocusBlockWithEvaluation.evaluation.baseline_weight !== null &&
                  activeFocusBlockWithEvaluation.evaluation.baseline_weight !== undefined &&
                  activeFocusBlockWithEvaluation.evaluation.latest_weight !== null &&
                  activeFocusBlockWithEvaluation.evaluation.latest_weight !== undefined ? (
                    <small>
                      Peso: {activeFocusBlockWithEvaluation.evaluation.baseline_weight.toFixed(1)} kg → {activeFocusBlockWithEvaluation.evaluation.latest_weight.toFixed(1)} kg
                    </small>
                  ) : null}
                </>
              ) : (
                <p>Aún no hay suficiente histórico comparable para valorar el bloque activo.</p>
              )}
            </div>
          </article>
          <article className="threshold-legend-card pool">
            <span className="threshold-dot pool" />
            <div>
              <strong>Siguiente paso recomendado</strong>
              <p>{activeFocusBlockWithEvaluation?.evaluation?.recommendation ?? "Define un bloque o acumula más datos para que la app sugiera el siguiente mesociclo."}</p>
              <small>{disciplineFocusBlocks.length} bloques en {disciplineLabel(activeDiscipline).toLowerCase()}</small>
            </div>
          </article>
        </div>

        <div className="focus-block-folders">
          <details className="card collapsible-card">
            <summary className="collapsible-summary">
              <div>
                <span className="eyebrow">Histórico</span>
                <h3>Histórico de bloques</h3>
                <p className="muted">Consulta los bloques anteriores y activa uno planificado si hace falta.</p>
              </div>
            </summary>
            {disciplineTargets.length ? (
              <div className="list">
                {disciplineTargets.map((target) => (
                  <article key={target.id} className="list-item">
                    <div className="status-head">
                      <strong>{target.objective}</strong>
                      <span className="status-badge neutral">{target.target_date}</span>
                    </div>
                    <p>
                      {disciplineLabel(target.discipline)}
                      {target.distance_label ? ` · ${target.distance_label}` : ""}
                      {target.priority_level ? ` · prioridad ${target.priority_level}` : ""}
                    </p>
                    <small>{targetSummaryForDiscipline(target, activeDiscipline)}</small>
                    {target.notes ? <small>{target.notes}</small> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">Todavía no hay objetivos o competiciones guardados para esta disciplina.</p>
            )}
            {disciplineFocusBlocks.length ? (
              <div className="list">
                {disciplineFocusBlocks.map((block) => {
                  const evaluation = focusEvaluationsById.get(block.id);
                  return (
                    <article key={block.id} className="list-item">
                      <div className="status-head">
                        <strong>{block.energy_system_focus} · {block.block_objective}</strong>
                        <span className={`status-badge ${evaluation?.worked ? "high" : evaluation?.worked === false ? "low" : "medium"}`}>
                          {block.status}
                        </span>
                      </div>
                      <p>
                        {block.start_date}
                        {block.end_date ? ` → ${block.end_date}` : " → abierto"}
                        {block.priority_discipline ? ` · ${disciplineLabel(block.priority_discipline)}` : ""}
                        {block.phase ? ` · ${block.phase}` : ""}
                      </p>
                      <small>{block.block_intent || "Sin intención descrita."}</small>
                      {evaluation ? <small>{evaluation.summary}</small> : null}
                      {block.status === "planned" ? (
                        <div className="button-row">
                          <button className="ghost-button" type="button" onClick={() => activatePlannedBlock(block.id)}>
                            Activar bloque
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="muted">Todavía no hay bloques guardados para este atleta.</p>
            )}
          </details>

          <details className="card collapsible-card">
            <summary className="collapsible-summary">
              <div>
                <span className="eyebrow">Planificación</span>
                <h3>Programar siguiente mesociclo</h3>
                <p className="muted">Ábrelo solo cuando quieras preparar el siguiente bloque.</p>
              </div>
            </summary>
            <div className="athlete-form">
              <label>
                Inicio
                <input
                  type="date"
                  value={focusForm.start_date}
                  onChange={(event) => setFocusForm({ ...focusForm, start_date: event.target.value })}
                />
              </label>
              <label>
                Fin
                <input
                  type="date"
                  value={focusForm.end_date}
                  onChange={(event) => setFocusForm({ ...focusForm, end_date: event.target.value })}
                />
              </label>
              <label>
                Sistema
                <select
                  value={focusForm.energy_system_focus}
                  onChange={(event) =>
                    setFocusForm({
                      ...focusForm,
                      energy_system_focus: event.target.value,
                      block_objective: ENERGY_SYSTEM_OPTIONS[event.target.value as keyof typeof ENERGY_SYSTEM_OPTIONS][0],
                    })
                  }
                >
                  {Object.keys(ENERGY_SYSTEM_OPTIONS).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Objetivo
                <select
                  value={focusForm.block_objective}
                  onChange={(event) => setFocusForm({ ...focusForm, block_objective: event.target.value })}
                >
                  {ENERGY_SYSTEM_OPTIONS[focusForm.energy_system_focus as keyof typeof ENERGY_SYSTEM_OPTIONS].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Disciplina prioritaria
                <select
                  value={focusForm.priority_discipline}
                  onChange={(event) => setFocusForm({ ...focusForm, priority_discipline: event.target.value })}
                >
                  {analysis.athlete.primary_discipline === "triatlón" ? (
                    <>
                      <option value="running">Running</option>
                      <option value="ciclismo">Ciclismo</option>
                      <option value="natación">Natación</option>
                    </>
                  ) : (
                    <option value={analysis.athlete.primary_discipline}>{disciplineLabel(analysis.athlete.primary_discipline)}</option>
                  )}
                </select>
              </label>
              <label>
                Fase
                <select value={focusForm.phase} onChange={(event) => setFocusForm({ ...focusForm, phase: event.target.value })}>
                  {PHASE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Estado
                <select value={focusForm.status} onChange={(event) => setFocusForm({ ...focusForm, status: event.target.value })}>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className="full-width">
                Intención del bloque
                <textarea
                  rows={2}
                  value={focusForm.block_intent}
                  onChange={(event) => setFocusForm({ ...focusForm, block_intent: event.target.value })}
                />
              </label>
              <label>
                Evento objetivo
                <input value={focusForm.target_event} onChange={(event) => setFocusForm({ ...focusForm, target_event: event.target.value })} />
              </label>
              <label>
                Fecha objetivo
                <input type="date" value={focusForm.target_date} onChange={(event) => setFocusForm({ ...focusForm, target_date: event.target.value })} />
              </label>
              <label className="full-width">
                Notas del entrenador
                <textarea
                  rows={2}
                  value={focusForm.coach_notes}
                  onChange={(event) => setFocusForm({ ...focusForm, coach_notes: event.target.value })}
                />
              </label>
              <div className="button-row full-width">
                <button className="primary-button" type="button" onClick={saveFocusBlock} disabled={focusSubmitting}>
                  {focusSubmitting ? "Guardando..." : "Guardar bloque"}
                </button>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="metrics-grid">
        {[lt1, lt2].filter(isDefined).map((threshold) => (
          <article key={threshold.name} className="card status-card">
            <div className="status-head">
              <span className="eyebrow">{threshold.name}</span>
              <span className={`status-badge ${threshold.evidence_level}`}>{threshold.evidence_level}</span>
            </div>
            <strong>{thresholdPrimaryValue(threshold, activeDiscipline, athleteWeight)}</strong>
            <p>
              {thresholdSecondaryValue(threshold, activeDiscipline)}
            </p>
            <small>{thresholdDetailLine(threshold, activeDiscipline, athleteWeight)}</small>
          </article>
        ))}
        {focusedEstimates.map((estimate, index) => {
          const raceSummary = racePredictionSummary(estimate);
          return (
          <article
            key={`${estimate.estimate_type}-${estimate.discipline}-${estimate.valid_on ?? "na"}-${index}`}
            className="card status-card"
          >
            <div className="status-head">
              <span className="eyebrow">{estimate.estimate_type}</span>
              <span className={`status-badge ${estimate.reliability_label}`}>{estimate.reliability_label}</span>
            </div>
            <strong>
              {raceSummary
                ? raceSummary.pace
                : activeDiscipline === "ciclismo" && estimate.unit === "W"
                  ? formatPowerWithWeight(estimate.value, athleteWeight)
                  : `${estimate.value} ${estimate.unit}`}
            </strong>
            <p>{raceSummary ? raceSummary.totalTime : `${formatValue(estimate.lower_bound, estimate.unit)} - ${formatValue(estimate.upper_bound, estimate.unit)}`}</p>
            {raceSummary ? <small>IC tiempo {raceSummary.lowerTime} - {raceSummary.upperTime}</small> : null}
            <small>{estimate.low_evidence ? "Evidencia limitada" : "Evidencia suficiente"}</small>
          </article>
          );
        })}
      </section>

      {activeDiscipline === "ciclismo" && displayView.power_bests.length ? (
        <section className="card">
          <div className="card-header">
            <div>
              <span className="eyebrow">Potencia</span>
              <h2>Mejores registros ciclistas</h2>
            </div>
          </div>
          <div className="metrics-grid">
            {displayView.power_bests.map((best) => (
              <article key={best.label} className="card status-card">
                <div className="status-head">
                  <span className="eyebrow">{best.label}</span>
                  <span className="status-badge medium">peak</span>
                </div>
                <strong>{formatPowerWithWeight(best.value_watts, athleteWeight)}</strong>
                <p>Mejor potencia media registrada para {best.label}</p>
                <small>{formatWattsPerKg(best.value_watts, athleteWeight)}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card threshold-plot-card">
        <div className="card-header">
          <div>
            <span className="eyebrow">Mapa de umbrales</span>
            <h2>LT1 y LT2 por disciplina</h2>
          </div>
          <div className="threshold-filter-row">
            <label>
              Desde
              <input type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} />
            </label>
            <label>
              Hasta
              <input type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="discipline-plot-stack">
          {(() => {
            const disciplineKey = activeDiscipline;
            const plotView = buildPlotView(disciplineKey);
            return (
              <div className="discipline-plot-panel">
                <div className="discipline-plot-header">
                  <span className="eyebrow">{disciplineLabel(disciplineKey)}</span>
                  <div className="discipline-plot-title-row">
                    <strong>{disciplineKey === "ciclismo" ? "Base ciclista independiente" : `Base ${disciplineLabel(disciplineKey).toLowerCase()} independiente`}</strong>
                    <small className="discipline-vo2-inline">
                      VO2max {plotView.vo2max ? `${Math.round(plotView.vo2max.value * 10) / 10} ml/kg/min` : "n/d"}
                    </small>
                  </div>
                  {disciplineKey === "ciclismo" ? (
                    <div className="source-toggle-row">
                      {(["outdoor", "indoor", "compare"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`discipline-tab ${cyclingPowerSourceMode === mode ? "active" : ""}`}
                          onClick={() => setCyclingPowerSourceMode(mode)}
                        >
                          {mode === "compare" ? "Comparar" : powerSourceLabel(mode)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="threshold-overview">
                  {disciplineKey === "ciclismo" && cyclingPowerSourceMode === "compare" ? (
                    plotView.comparePools.map((pool) => (
                      <article key={`compare-card-${pool.sourceKey}`} className="threshold-legend-card pool">
                        <span className="threshold-dot pool" style={{ background: pool.color }} />
                        <div>
                          <strong>{pool.label}</strong>
                          <p>Comparativa directa de umbrales por potenciómetro, sin mezclar interior y exterior.</p>
                          <small>
                            LT1: {pool.lt1 ? `${formatPowerWithWeight(pool.lt1.power_watts, athleteWeight)} · ${pool.lt1.heart_rate ?? "-"} bpm · ${pool.lt1.lactate?.toFixed(1) ?? "-"} mmol/L` : "n/d"}
                          </small>
                          <small>
                            LT2: {pool.lt2 ? `${formatPowerWithWeight(pool.lt2.power_watts, athleteWeight)} · ${pool.lt2.heart_rate ?? "-"} bpm · ${pool.lt2.lactate?.toFixed(1) ?? "-"} mmol/L` : "n/d"}
                          </small>
                        </div>
                      </article>
                    ))
                  ) : (
                    <>
                      <article className="threshold-legend-card lt1">
                        <span className="threshold-dot lt1" />
                        <div>
                          <strong>LT1</strong>
                          <p>{disciplineKey === "ciclismo" ? "Primer umbral ciclista. Referencia de trabajo aeróbico sostenible en potencia." : "Primer umbral. Marca la transición hacia un trabajo aeróbico más exigente pero todavía muy sostenible."}</p>
                          <small>
                            {plotView.lt1
                              ? thresholdDetailLine(plotView.lt1, disciplineKey, athleteWeight)
                              : "Sin cálculo disponible"}
                          </small>
                        </div>
                      </article>
                      <article className="threshold-legend-card lt2">
                        <span className="threshold-dot lt2" />
                        <div>
                          <strong>LT2</strong>
                          <p>{disciplineKey === "ciclismo" ? "Segundo umbral ciclista. Punto de alta exigencia sostenible antes de acumular lactato con claridad." : "Segundo umbral. Señala el punto de alta exigencia sostenible antes de una acumulación marcada de lactato."}</p>
                          <small>
                            {plotView.lt2
                              ? thresholdDetailLine(plotView.lt2, disciplineKey, athleteWeight)
                              : "Sin cálculo disponible"}
                          </small>
                        </div>
                      </article>
                      <article className="threshold-legend-card pool">
                        <span className="threshold-dot pool" />
                        <div>
                          <strong>Piscina de datos</strong>
                          <p>
                            Todas las muestras históricas de {disciplineLabel(disciplineKey).toLowerCase()}
                            {disciplineKey === "ciclismo" && cyclingPowerSourceMode !== "compare" ? ` · ${powerSourceLabel(preferredCyclingSource)}` : ""}
                            {" "}quedan visibles en segundo plano.
                          </p>
                          <small>{plotView.pool.length} muestras visibles</small>
                        </div>
                      </article>
                    </>
                  )}
                </div>
                {disciplineKey === "ciclismo" && cyclingPowerSourceMode === "compare" ? (
                  plotView.comparePools.length ? (
                    <ResponsiveContainer width="100%" height={360}>
                      <ScatterChart margin={{ top: 16, right: 20, bottom: 16, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                        <XAxis type="number" dataKey="x" tickFormatter={(value) => `${Math.round(value)}W`} name="Potencia" domain={["auto", "auto"]} />
                        <YAxis type="number" dataKey="lactate" name="Lactato" unit=" mmol/L" domain={[0, "auto"]} />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === "Potencia") {
                              return `${Math.round(value)} W · ${formatWattsPerKg(value, athleteWeight)}`;
                            }
                            return `${Math.round(value * 10) / 10} mmol/L`;
                          }}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? "Umbral"}
                        />
                        <Legend />
                        {plotView.comparePools.map((pool) => {
                          const thresholdPoints = [
                            pool.lt1
                              ? {
                                  name: `${pool.label} LT1`,
                                  x: pool.lt1.power_watts,
                                  lactate: pool.lt1.lactate,
                                }
                              : null,
                            pool.lt2
                              ? {
                                  name: `${pool.label} LT2`,
                                  x: pool.lt2.power_watts,
                                  lactate: pool.lt2.lactate,
                                }
                              : null,
                          ].filter(Boolean);
                          return (
                            <Scatter
                              key={pool.sourceKey}
                              name={pool.label}
                              data={thresholdPoints}
                              fill={pool.color}
                              line={false}
                            />
                          );
                        })}
                        {plotView.comparePools.map((pool) =>
                          pool.lt1?.power_watts ? (
                            <ReferenceLine
                              key={`${pool.sourceKey}-lt1`}
                              x={pool.lt1.power_watts}
                              stroke={pool.color}
                              strokeDasharray="5 5"
                              label={{ value: `${pool.label} LT1`, position: "insideTopLeft", fill: pool.color }}
                            />
                          ) : null,
                        )}
                        {plotView.comparePools.map((pool) =>
                          pool.lt2?.power_watts ? (
                            <ReferenceLine
                              key={`${pool.sourceKey}-lt2`}
                              x={pool.lt2.power_watts}
                              stroke={pool.color}
                              strokeDasharray="2 6"
                              label={{ value: `${pool.label} LT2`, position: "insideTopRight", fill: pool.color }}
                            />
                          ) : null,
                        )}
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="muted">Aún no hay suficientes datos ciclistas para comparar potenciómetro exterior e interior.</p>
                  )
                ) : plotView.plotData.length ? (
                  <ResponsiveContainer width="100%" height={360}>
                    <ScatterChart margin={{ top: 16, right: 20, bottom: 16, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        tickFormatter={(value) => (disciplineKey === "ciclismo" ? `${Math.round(value)}W` : formatPace(value))}
                        name={plotView.plotLabel}
                        domain={["auto", "auto"]}
                        reversed={disciplineKey !== "ciclismo"}
                      />
                      <YAxis type="number" dataKey="lactate" name="Lactato" unit=" mmol/L" domain={[0, "auto"]} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === "x" || name === plotView.plotLabel) {
                            if (disciplineKey === "ciclismo") {
                              return `${Math.round(value)} W · ${formatWattsPerKg(value, athleteWeight)}`;
                            }
                            return formatPace(value);
                          }
                          return `${Math.round(value * 10) / 10} mmol/L`;
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? payload?.[0]?.payload?.name ?? "Muestra"}
                      />
                      {plotView.lt1 && plotView.lt2 ? (
                        <ReferenceArea
                          x1={disciplineKey === "ciclismo" ? plotView.lt1.power_watts : plotView.lt1.pace_seconds_per_km}
                          x2={disciplineKey === "ciclismo" ? plotView.lt2.power_watts : plotView.lt2.pace_seconds_per_km}
                          y1={Math.min(plotView.lt1.lactate ?? 0, plotView.lt2.lactate ?? 0)}
                          y2={Math.max(plotView.lt1.lactate ?? 0, plotView.lt2.lactate ?? 0)}
                          fill="rgba(210, 106, 54, 0.10)"
                          strokeOpacity={0}
                        />
                      ) : null}
                      {(disciplineKey === "ciclismo" ? plotView.lt1?.power_watts : plotView.lt1?.pace_seconds_per_km) ? (
                        <ReferenceLine
                          x={disciplineKey === "ciclismo" ? plotView.lt1?.power_watts : plotView.lt1?.pace_seconds_per_km}
                          stroke="#257a4d"
                          strokeDasharray="6 6"
                          label={{
                            value: `LT1 · ${plotView.lt1?.heart_rate ?? "-"} bpm`,
                            position: "insideTopLeft",
                            fill: "#257a4d",
                          }}
                        />
                      ) : null}
                      {(disciplineKey === "ciclismo" ? plotView.lt2?.power_watts : plotView.lt2?.pace_seconds_per_km) ? (
                        <ReferenceLine
                          x={disciplineKey === "ciclismo" ? plotView.lt2?.power_watts : plotView.lt2?.pace_seconds_per_km}
                          stroke="#8d2e0f"
                          strokeDasharray="6 6"
                          label={{
                            value: `LT2 · ${plotView.lt2?.heart_rate ?? "-"} bpm`,
                            position: "insideTopRight",
                            fill: "#8d2e0f",
                          }}
                        />
                      ) : null}
                      {plotView.lt1 && plotView.lt2 && plotView.vlamax ? (
                        <ReferenceDot
                          x={
                            disciplineKey === "ciclismo"
                              ? ((plotView.lt1.power_watts ?? 0) + (plotView.lt2.power_watts ?? 0)) / 2
                              : ((plotView.lt1.pace_seconds_per_km ?? 0) + (plotView.lt2.pace_seconds_per_km ?? 0)) / 2
                          }
                          y={((plotView.lt1.lactate ?? 0) + (plotView.lt2.lactate ?? 0)) / 2}
                          r={5}
                          fill="#d26a36"
                          stroke="white"
                          label={{
                            value: `VLAMAX ${estimateLabelValue(plotView.vlamax)}`,
                            position: "top",
                            fill: "#a2502a",
                          }}
                        />
                      ) : null}
                      {plotView.lt2 && plotView.vo2max ? (
                        <ReferenceDot
                          x={disciplineKey === "ciclismo" ? plotView.lt2.power_watts : plotView.lt2.pace_seconds_per_km}
                          y={plotView.lt2.lactate}
                          r={6}
                          fill="#1d5c63"
                          stroke="white"
                          label={{
                            value: `VO2max ${estimateLabelValue(plotView.vo2max)}`,
                            position: "bottom",
                            fill: "#1d5c63",
                          }}
                        />
                      ) : null}
                      <Scatter data={plotView.pool} fill="rgba(22, 53, 61, 0.18)" />
                      {plotView.lt1 ? <Scatter data={plotView.plotData.filter((point) => point.name === "LT1")} fill="#257a4d" /> : null}
                      {plotView.lt2 ? <Scatter data={plotView.plotData.filter((point) => point.name === "LT2")} fill="#8d2e0f" /> : null}
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="muted">Aún no hay LT1 y LT2 suficientes para {disciplineLabel(disciplineKey).toLowerCase()}.</p>
                )}
              </div>
            );
          })()}
        </div>
      </section>

      {activeDiscipline === "ciclismo" ? (
        <section className="card cycling-cadence-card collapsible-card">
          <details>
            <summary className="collapsible-summary">
              <div>
                <span className="eyebrow">Cadencia y coste</span>
                <h2>Evolución del lactato por franjas de cadencia</h2>
                <p className="muted">
                  Ábrelo para ver si las cadencias altas te cuestan menos lactato con el tiempo a potencia comparable.
                </p>
              </div>
            </summary>
            <div className="cycling-cadence-body">
              <div className="card-header">
                <div>
                  <p className="muted">
                    Compara cómo cambia el lactato en cada franja de cadencia cuando ruedas a una potencia parecida.
                  </p>
                </div>
                <div className="cycling-controls">
                  <label>
                    Potencia comparable
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={comparableCyclingTarget}
                      onChange={(event) => setCyclingPowerTarget(event.target.value)}
                    />
                  </label>
                  <label>
                    Tolerancia
                    <input
                      type="number"
                      min="5"
                      step="5"
                      value={cyclingPowerTolerance}
                      onChange={(event) => setCyclingPowerTolerance(event.target.value)}
                    />
                  </label>
                </div>
              </div>
              <div className="cycling-cadence-summary">
                {cyclingCadenceBandSummaries.length ? (
                  cyclingCadenceBandSummaries.map((band) => (
                    <article key={band.label} className="cycling-band-card" style={{ borderColor: `${band.color}55` }}>
                      <span className="cycling-band-chip" style={{ backgroundColor: `${band.color}22`, color: band.color }}>
                        {band.label} rpm
                      </span>
                      <strong>{band.average !== null ? `${band.average.toFixed(1)} mmol/L` : "-"}</strong>
                      <p>{band.count} muestras comparables</p>
                      <small>
                        {band.averagePower !== null
                          ? `Potencia media ${Math.round(band.averagePower)} W (${formatWattsPerKg(band.averagePower, athleteWeight)}) · rango ${Math.round(band.minPower ?? band.averagePower)}-${Math.round(band.maxPower ?? band.averagePower)} W`
                          : "Sin potencia comparable suficiente"}
                      </small>
                      <small>
                        {band.delta === null
                          ? "Aún sin evolución suficiente"
                          : band.delta < 0
                            ? `${Math.abs(band.delta).toFixed(1)} mmol/L menos que al inicio`
                            : `${band.delta.toFixed(1)} mmol/L más que al inicio`}
                      </small>
                    </article>
                  ))
                ) : (
                  <p className="muted">Aún no hay suficientes muestras ciclistas con potencia y cadencia comparables.</p>
                )}
              </div>
              {cyclingCadenceTrendData.length ? (
                <div className="cycling-chart-stack">
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={cyclingCadenceTrendData} margin={{ top: 10, right: 20, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                      <XAxis dataKey="date" />
                      <YAxis unit=" mmol/L" domain={[0, "auto"]} />
                      <Tooltip
                        formatter={(value: number, name: string, item) => {
                          const payload = item?.payload as Record<string, number | string | null> | undefined;
                          const power = payload?.[`${name}__power`];
                          if (typeof value !== "number") return value;
                          if (typeof power === "number") {
                            return [`${Math.round(value * 10) / 10} mmol/L · ${Math.round(power)} W`, name];
                          }
                          return [`${Math.round(value * 10) / 10} mmol/L`, name];
                        }}
                      />
                      <Legend />
                      {CYCLING_CADENCE_BANDS.map((band) => (
                        <Line
                          key={band.label}
                          type="monotone"
                          dataKey={band.label}
                          name={`${band.label} rpm`}
                          stroke={band.color}
                          strokeWidth={2.4}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 10, right: 20, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                      <XAxis type="number" dataKey="cadence" name="Cadencia" unit=" rpm" domain={[60, "auto"]} />
                      <YAxis type="number" dataKey="lactate" name="Lactato" unit=" mmol/L" domain={[0, "auto"]} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === "Cadencia") return `${Math.round(value)} rpm`;
                          if (name === "Lactato") return `${Math.round(value * 10) / 10} mmol/L`;
                          return `${value}`;
                        }}
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload;
                          return point ? `${point.date} · ${Math.round(point.power)} W · ${point.band} rpm` : "Muestra";
                        }}
                      />
                      {CYCLING_CADENCE_BANDS.map((band) => (
                        <Scatter
                          key={band.label}
                          name={band.label}
                          data={cyclingScatterData.filter((point) => point.band === band.label)}
                          fill={band.color}
                          fillOpacity={0.65}
                        >
                          <LabelList
                            dataKey="power"
                            position="top"
                            formatter={(value: number) => `${Math.round(value)}W`}
                            style={{ fontSize: "0.7rem", fill: band.color, fontWeight: 700 }}
                          />
                        </Scatter>
                      ))}
                    </ScatterChart>
                  </ResponsiveContainer>
                  <div className="cycling-comparable-table">
                  <div className="compact-row compact-head">
                    <span>Fecha</span>
                    <span>Banda</span>
                    <span>W</span>
                    <span>W/kg</span>
                    <span>mmol</span>
                    <span>Cadencia</span>
                  </div>
                    {cyclingComparableRows.map((entry, index) => (
                      <div key={`${entry.session_id}-${entry.interval_label}-${index}`} className="compact-row">
                        <span>{entry.session_date}</span>
                        <span>{cadenceBandLabel(entry.cadence) ?? "-"}</span>
                        <span>{entry.power_watts ? `${Math.round(entry.power_watts)} W` : "-"}</span>
                        <span>{entry.power_watts ? formatWattsPerKg(entry.power_watts, athleteWeight) : "-"}</span>
                        <span>{entry.lactate_mmol.toFixed(1)}</span>
                        <span>{entry.cadence ? `${Math.round(entry.cadence)} rpm` : "-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </section>
      ) : null}

      {activeDiscipline === "ciclismo" ? (
        <section className="card collapsible-card">
          <details>
            <summary className="collapsible-summary">
              <div>
                <span className="eyebrow">W/kg, lactato y FC</span>
                <h2>Histórico por franjas 80-95 rpm</h2>
                <p className="muted">
                  Ábrelo para ver la evolución temporal del coste fisiológico en las franjas de cadencia más relevantes.
                </p>
              </div>
            </summary>
            <div className="cycling-cadence-body">
              {cyclingEfficiencyHistoryData.length ? (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={cyclingEfficiencyHistoryData} margin={{ top: 12, right: 24, left: 4, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                    <XAxis dataKey="sessionDate" />
                    <YAxis yAxisId="lactate" unit=" mmol/L" domain={[0, "auto"]} />
                    <YAxis yAxisId="fc" orientation="right" unit=" bpm" domain={["auto", "auto"]} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === "Lactato") return `${Math.round(value * 10) / 10} mmol/L`;
                        if (name === "FC") return `${Math.round(value)} bpm`;
                        return `${value}`;
                      }}
                      labelFormatter={(_, payload) => {
                        const point = payload?.[0]?.payload as typeof cyclingEfficiencyHistoryData[number] | undefined;
                        return point
                          ? `${point.sessionDate} · ${point.intervalLabel} · ${point.cadence ? `${Math.round(point.cadence)} rpm` : "cadencia n/d"} · ${point.wattsPerKg} W/kg`
                          : "Muestra";
                      }}
                    />
                    <Legend />
                    <Line yAxisId="lactate" type="monotone" dataKey="lactate" name="Lactato" stroke="#c07a18" strokeWidth={2.4} dot={false} connectNulls />
                    <Line yAxisId="fc" type="monotone" dataKey="heartRate" name="FC" stroke="#1d5c63" strokeWidth={2.2} dot={false} connectNulls />
                    {CYCLING_HISTORY_CADENCE_BANDS.map((band) => (
                      <Scatter
                        key={band.label}
                        yAxisId="lactate"
                        name={`${band.label} rpm`}
                        data={cyclingEfficiencyHistoryData.filter((point) => point.cadenceBand === band.label)}
                        fill={band.color}
                        fillOpacity={0.75}
                      >
                        <LabelList
                          dataKey="wattsPerKg"
                          position="top"
                          formatter={(value: number | null) => (value ? `${value}` : "")}
                          style={{ fontSize: "0.68rem", fill: band.color, fontWeight: 700 }}
                        />
                      </Scatter>
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="muted">Aún no hay suficientes muestras entre 80 y 95 rpm con lactato y potencia para esta vista.</p>
              )}
            </div>
          </details>
        </section>
      ) : null}

      {activeDiscipline === "ciclismo" ? (
        <section className="card collapsible-card">
          <details>
            <summary className="collapsible-summary">
              <div>
                <span className="eyebrow">Potencia y umbrales</span>
                <h2>Relación entre picos de potencia y lactato</h2>
                <p className="muted">
                  Ábrelo para ver cada potencia medida con su lactato y dónde cae respecto a LT1 y LT2.
                </p>
              </div>
            </summary>
            <div className="cycling-cadence-body">
              <div className="threshold-overview">
                <article className="threshold-legend-card lt1">
                  <span className="threshold-dot lt1" />
                  <div>
                    <strong>Referencia LT1</strong>
                    <small>{lt1 ? thresholdDetailLine(lt1, "ciclismo", athleteWeight) : "Sin LT1 ciclista"}</small>
                  </div>
                </article>
                <article className="threshold-legend-card lt2">
                  <span className="threshold-dot lt2" />
                  <div>
                    <strong>Referencia LT2</strong>
                    <small>{lt2 ? thresholdDetailLine(lt2, "ciclismo", athleteWeight) : "Sin LT2 ciclista"}</small>
                  </div>
                </article>
              </div>
              {cyclingThresholdPlotData.length ? (
                <div className="cycling-threshold-visual">
                  {cyclingThresholdLt1FocusData.length ? (
                    <div className="cycling-threshold-focus">
                      <div className="card-header">
                        <div>
                          <span className="eyebrow">Zoom LT1</span>
                          <h3>Zona cercana a LT1</h3>
                          <p className="muted">
                            Vista ampliada de las muestras dentro de {lt1FocusWindow} W alrededor de LT1 para distinguir mejor esa zona.
                          </p>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <ScatterChart margin={{ top: 12, right: 24, left: 4, bottom: 12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                          <XAxis
                            type="number"
                            dataKey="power"
                            name="Potencia"
                            unit=" W"
                            domain={
                              lt1FocusPowerMin !== null && lt1FocusPowerMax !== null
                                ? [Math.max(0, lt1FocusPowerMin - 5), lt1FocusPowerMax + 5]
                                : ["auto", "auto"]
                            }
                          />
                          <YAxis
                            type="number"
                            dataKey="lactate"
                            name="Lactato"
                            unit=" mmol/L"
                            domain={
                              lt1FocusLactateMin !== null && lt1FocusLactateMax !== null
                                ? [Math.max(0, lt1FocusLactateMin - 0.25), lt1FocusLactateMax + 0.25]
                                : [0, "auto"]
                            }
                          />
                          {lt1?.power_watts ? (
                            <ReferenceLine
                              x={lt1.power_watts}
                              stroke="#257a4d"
                              strokeDasharray="6 6"
                              label={{ value: `LT1 ${Math.round(lt1.power_watts)} W`, position: "insideTopLeft", fill: "#257a4d" }}
                            />
                          ) : null}
                          <Tooltip
                            formatter={(value: number, name: string, payload) => {
                              const point = payload?.payload as typeof cyclingThresholdPlotData[number] | undefined;
                              if (name === "Potencia") {
                                return point ? `${Math.round(value)} W · ${point.wattsPerKg ?? "-"} W/kg` : `${Math.round(value)} W`;
                              }
                              return `${Math.round(value * 10) / 10} mmol/L`;
                            }}
                            labelFormatter={(_, payload) => {
                              const point = payload?.[0]?.payload as typeof cyclingThresholdPlotData[number] | undefined;
                              return point
                                ? `${point.sessionDate} · ${point.intervalLabel} · ${Math.round(point.power)} W · ${point.wattsPerKg ?? "-"} W/kg · ${point.lactate.toFixed(1)} mmol/L · ${point.cadence ? `${Math.round(point.cadence)} rpm` : "cadencia n/d"}`
                                : "Muestra";
                            }}
                          />
                          <Scatter data={cyclingThresholdLt1FocusData} fill="#257a4d" fillOpacity={0.85} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 12, right: 24, left: 4, bottom: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.12)" />
                      <XAxis
                        type="number"
                        dataKey="power"
                        name="Potencia"
                        unit=" W"
                        domain={
                          thresholdPowerMin !== null && thresholdPowerMax !== null
                            ? [Math.max(0, thresholdPowerMin - 10), thresholdPowerMax + 10]
                            : ["auto", "auto"]
                        }
                      />
                      <YAxis
                        type="number"
                        dataKey="lactate"
                        name="Lactato"
                        unit=" mmol/L"
                        domain={
                          thresholdLactateMin !== null && thresholdLactateMax !== null
                            ? [Math.max(0, thresholdLactateMin - 0.4), thresholdLactateMax + 0.4]
                            : [0, "auto"]
                        }
                      />
                      {lt1?.power_watts ? (
                        <ReferenceLine
                          x={lt1.power_watts}
                          stroke="#257a4d"
                          strokeDasharray="6 6"
                          label={{ value: `LT1 ${Math.round(lt1.power_watts)} W`, position: "insideTopLeft", fill: "#257a4d" }}
                        />
                      ) : null}
                      {lt2?.power_watts ? (
                        <ReferenceLine
                          x={lt2.power_watts}
                          stroke="#8d2e0f"
                          strokeDasharray="6 6"
                          label={{ value: `LT2 ${Math.round(lt2.power_watts)} W`, position: "insideTopRight", fill: "#8d2e0f" }}
                        />
                      ) : null}
                      <Tooltip
                        formatter={(value: number, name: string, payload) => {
                          const point = payload?.payload as typeof cyclingThresholdPlotData[number] | undefined;
                          if (name === "Potencia") {
                            return point ? `${Math.round(value)} W · ${point.wattsPerKg ?? "-"} W/kg` : `${Math.round(value)} W`;
                          }
                          return `${Math.round(value * 10) / 10} mmol/L`;
                        }}
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload as typeof cyclingThresholdPlotData[number] | undefined;
                          return point
                            ? `${point.sessionDate} · ${point.intervalLabel} · ${Math.round(point.power)} W · ${point.wattsPerKg ?? "-"} W/kg · ${point.lactate.toFixed(1)} mmol/L · ${point.cadence ? `${Math.round(point.cadence)} rpm` : "cadencia n/d"} · ${point.relation}`
                            : "Muestra";
                        }}
                      />
                      <Scatter data={cyclingThresholdPlotData} fill="#c07a18" fillOpacity={0.82} />
                    </ScatterChart>
                  </ResponsiveContainer>
                  <div className="cycling-threshold-cards">
                    {cyclingThresholdPlotData.slice(0, 8).map((point) => (
                      <article key={point.id} className="cycling-threshold-card">
                        <strong>{Math.round(point.power)} W</strong>
                        <p>{point.wattsPerKg ?? "-"} W/kg · {point.lactate.toFixed(1)} mmol/L</p>
                        <small>{point.sessionDate} · {point.intervalLabel} · {point.cadence ? `${Math.round(point.cadence)} rpm` : "cadencia n/d"}</small>
                        <small>{point.relation}</small>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted">Aún no hay muestras ciclistas suficientes con potencia y lactato.</p>
              )}
            </div>
          </details>
        </section>
      ) : null}

      <section className="card athlete-form-card collapsible-card">
        <details>
          <summary className="collapsible-summary">
            <div>
              <span className="eyebrow">Registro manual</span>
              <h2>Añadir datos de lactato</h2>
              <p className="muted">Ábrelo solo cuando necesites registrar una sesión rápida en pista o entrenamiento.</p>
            </div>
          </summary>
          <form className="session-form" onSubmit={handleSubmit}>
          <label>
            Fecha y hora
            <input type="datetime-local" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} required />
          </label>
          <label>
            Disciplina
            <select value={discipline} onChange={(event) => setDiscipline(event.target.value)}>
              <option value="running">Running</option>
              <option value="ciclismo">Ciclismo</option>
              <option value="natación">Natación</option>
              <option value="triatlón">Triatlón</option>
            </select>
          </label>
          <label>
            Tipo de sesión
            <select value={sessionType} onChange={(event) => setSessionType(event.target.value)}>
              <option value="test incremental">Test incremental</option>
              <option value="sesión LT1">Sesión LT1</option>
              <option value="sesión LT2">Sesión LT2</option>
              <option value="VO2max">VO2max</option>
              <option value="continuo">Continuo</option>
              <option value="progresivo">Progresivo</option>
              <option value="intervalos">Intervalos</option>
              <option value="competición">Competición</option>
              <option value="recuperación">Recuperación</option>
            </select>
          </label>
          {discipline === "ciclismo" ? (
            <label>
              Potenciómetro
              <select value={sessionPowerSource} onChange={(event) => setSessionPowerSource(event.target.value)}>
                <option value="outdoor">Potenciómetro de a pie</option>
                <option value="indoor">Potenciómetro de interior</option>
              </select>
            </label>
          ) : null}
          <label className="full-width">
            Objetivo
            <input value={goal} onChange={(event) => setGoal(event.target.value)} required />
          </label>
          <label>
            Superficie
            <input value={surface} onChange={(event) => setSurface(event.target.value)} />
          </label>
          <label>
            Temperatura
            <input type="number" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
          </label>
          <label>
            Número de bloques
            <input type="number" min="1" value={blocksCount} onChange={(event) => applyBlocksCount(event.target.value)} />
          </label>
          <label className="full-width">
            Comentarios
            <textarea rows={3} value={comments} onChange={(event) => setComments(event.target.value)} />
          </label>

          <div className="full-width interval-stack">
            {intervals.map((interval, index) => (
              <div key={index} className="card interval-card">
                <div className="card-header">
                  <h3>Bloque {index + 1}</h3>
                  <span className="muted">Configurado desde el número de bloques</span>
                </div>
                <div className="session-form">
                  <label>
                    Unidad duración
                    <select
                      value={interval.duration_mode}
                      onChange={(event) => updateInterval(index, "duration_mode", event.target.value as "seconds" | "km")}
                      disabled={discipline !== "running"}
                    >
                      <option value="seconds">Segundos</option>
                      {discipline === "running" ? <option value="km">Kilómetros</option> : null}
                    </select>
                  </label>
                  <label>
                    Duración
                    <input type="number" step="0.1" value={interval.duration_value} onChange={(event) => updateInterval(index, "duration_value", event.target.value)} required />
                  </label>
                  <label>
                    Descanso
                    <input type="number" value={interval.rest_seconds} onChange={(event) => updateInterval(index, "rest_seconds", event.target.value)} />
                  </label>
                  <label>
                    Lactato
                    <div className="sample-row">
                      <label className="checkbox-row">
                        <input type="checkbox" checked={interval.sampled} onChange={(event) => updateIntervalBoolean(index, event.target.checked)} />
                        <span>Tomar muestra</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={interval.lactate_mmol}
                        onChange={(event) => updateInterval(index, "lactate_mmol", event.target.value)}
                        disabled={!interval.sampled}
                      />
                    </div>
                  </label>
                  <label>
                    Retraso muestra (s)
                    <input
                      type="number"
                      value={interval.sample_delay_seconds}
                      onChange={(event) => updateInterval(index, "sample_delay_seconds", event.target.value)}
                      disabled={!interval.sampled}
                      placeholder="Opcional"
                    />
                  </label>
                  <label>
                    FC media
                    <input type="number" value={interval.heart_rate_avg} onChange={(event) => updateInterval(index, "heart_rate_avg", event.target.value)} placeholder="Opcional" />
                  </label>
                  <label>
                    {discipline === "ciclismo" ? "Potencia media (W)" : "Ritmo medio (min/km)"}
                    {discipline === "ciclismo" ? (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={interval.power_watts}
                        onChange={(event) => updateInterval(index, "power_watts", event.target.value)}
                        placeholder="250"
                      />
                    ) : (
                      <input
                        value={interval.pace_min_per_km}
                        onChange={(event) => updateInterval(index, "pace_min_per_km", event.target.value)}
                        placeholder="03:30"
                        pattern="\d{1,2}:\d{2}"
                      />
                    )}
                  </label>
                  <label>
                    Cadencia media
                    <input type="number" value={interval.cadence} onChange={(event) => updateInterval(index, "cadence", event.target.value)} placeholder="Opcional" />
                  </label>
                  <label>
                    FC máxima
                    <input type="number" value={interval.heart_rate_max} onChange={(event) => updateInterval(index, "heart_rate_max", event.target.value)} placeholder="Opcional" />
                  </label>
                  <label>
                    RPE
                    <input type="number" min="0" max="10" step="0.5" value={interval.rpe} onChange={(event) => updateInterval(index, "rpe", event.target.value)} placeholder="Opcional" />
                  </label>
                </div>
              </div>
            ))}
          </div>
          {saveError ? <p className="error full-width">{saveError}</p> : null}
          {saveMessage ? <p className="full-width">{saveMessage}</p> : null}
          <div className="button-row full-width">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar sesión de lactato"}
            </button>
          </div>
          </form>
        </details>
      </section>

      <section className="card">
        <div>
          <h2>Umbrales</h2>
          <div className="compact-table">
            <div className="compact-row compact-head">
              <span>Zona</span>
                <span>{activeDiscipline === "ciclismo" ? "Potencia" : "Ritmo"}</span>
                <span>Lactato</span>
                <span>FC</span>
                <span>Conf.</span>
              </div>
            {displayView.thresholds.map((threshold) => (
              <div key={threshold.name} className="compact-row">
                <strong>{threshold.name}</strong>
                <span>{thresholdPrimaryValue(threshold, activeDiscipline, athleteWeight)}</span>
                <span>{threshold.lactate?.toFixed(1) ?? "-"}</span>
                <span>{threshold.heart_rate ?? "-"}</span>
                <span>{Math.round(threshold.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card split-card">
        <div>
          <h2>Estimaciones</h2>
          <div className="list estimate-grid">
            {displayView.estimates.map((estimate, index) => {
              const raceSummary = racePredictionSummary(estimate);
              return (
                <div
                  key={`${estimate.estimate_type}-${estimate.discipline}-${estimate.valid_on ?? "na"}-${index}`}
                  className="list-item estimate-card"
                >
                  <strong>{estimate.estimate_type}</strong>
                  {raceSummary ? (
                    <>
                      <p className="estimate-main">{raceSummary.pace}</p>
                      <p>Tiempo estimado: {raceSummary.totalTime}</p>
                      <p>IC tiempo: {raceSummary.lowerTime} - {raceSummary.upperTime}</p>
                    </>
                  ) : (
                    <>
                      <p className="estimate-main">
                        {estimate.value} {estimate.unit}
                      </p>
                      <p>
                        IC: {formatValue(estimate.lower_bound, estimate.unit)} - {formatValue(estimate.upper_bound, estimate.unit)}
                      </p>
                    </>
                  )}
                  <span className={`status-badge ${estimate.reliability_label}`}>{estimate.reliability_label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h2>Confianza</h2>
          <div className="list">
            {analysis.confidence_summary.length ? (
              analysis.confidence_summary.map((item) => (
                <div key={item.label} className={`list-item confidence-card ${item.level}`}>
                  <strong>{item.label}</strong>
                  <p>{Math.round(item.score * 100)}%</p>
                </div>
              ))
            ) : (
              <p className="muted">No hay elementos de confianza calculados.</p>
            )}
          </div>
        </div>
      </section>

      <section className="card split-card">
        <div>
          <h2>Evolución histórica</h2>
          <div className="list timeline-list">
            {["LT1", "LT2", "lactate_anchor"].map((key) => {
              const point = latestHistorical(displayView.historical_evolution[key]);
              if (!point) return null;
              return (
                <div key={key} className="list-item timeline-item">
                  <strong>{point.label}</strong>
                  <p>{point.date}</p>
                  <p>{formatValue(point.value, point.unit)}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h2>Tendencias</h2>
          <div className="list trend-grid">
            {analysis.trends.length ? (
              analysis.trends.map((trend) => (
                <div key={trend.metric} className={`list-item trend-card ${metricTone(trend.direction)}`}>
                  <strong>{trend.metric}</strong>
                  <p>
                    {trend.direction} {Math.round(trend.value * 1000) / 10}%
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">Aún no hay suficientes snapshots para tendencias robustas.</p>
            )}
          </div>
        </div>
      </section>

      <section className="charts-grid">
        {activeDiscipline === "ciclismo" ? (
          <CurveChart title="Curva lactato vs potencia" data={displayView.curve_history.power ?? []} xLabel="Potencia (W)" overlays={chartOverlays} />
        ) : (
          <CurveChart title="Curva lactato vs ritmo" data={displayView.curve_history.pace ?? []} xLabel="Ritmo (introducido en min/km)" overlays={chartOverlays} />
        )}
        <CurveChart title="Curva lactato vs FC" data={displayView.curve_history.heart_rate ?? []} xLabel="FC (bpm)" overlays={chartOverlays} />
        {activeDiscipline !== "natación" ? (
          <CurveChart title="Curva lactato vs potencia" data={displayView.curve_history.power ?? []} xLabel="Potencia (W)" overlays={chartOverlays} />
        ) : null}
      </section>

      <section className="table-card card">
        <div className="card-header">
          <div>
            <span className="eyebrow">Mediciones</span>
            <h2>Histórico de muestras de lactato</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Día</th>
              <th>Intervalo</th>
              <th>Duración</th>
              <th>Descanso</th>
              <th>mmol</th>
              <th>Ritmo / Potencia</th>
              <th>FC</th>
              <th>Cadencia</th>
              <th>Sesión</th>
            </tr>
          </thead>
          <tbody>
            {displayView.measurement_log.length ? (
              displayView.measurement_log.map((entry, index) => (
                <tr key={`${entry.session_id}-${entry.interval_label}-${index}`}>
                  <td>{entry.session_date}</td>
                  <td>{entry.interval_label}</td>
                  <td>{formatIntervalDuration(entry.duration_seconds)}</td>
                  <td>{formatIntervalDuration(entry.rest_seconds)}</td>
                  <td>{entry.lactate_mmol.toFixed(1)}</td>
                  <td>
                    {activeDiscipline === "ciclismo"
                      ? (entry.power_watts ? `${Math.round(entry.power_watts)} W` : "-")
                      : formatPace(entry.pace_seconds_per_km)}
                    {activeDiscipline === "ciclismo" && entry.power_watts ? ` · ${formatWattsPerKg(entry.power_watts, athleteWeight)}` : ""}
                  </td>
                  <td>{entry.heart_rate_avg ?? "-"}</td>
                  <td>{entry.cadence ?? "-"}</td>
                  <td>{entry.session_type}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="muted">No hay mediciones registradas para esta disciplina.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

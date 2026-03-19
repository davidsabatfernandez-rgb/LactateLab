/**
 * WorkoutKit bridge — syncs structured workouts to Apple Watch.
 *
 * Converts our WorkoutDefinition format to the JSON structure
 * that WorkoutKitPlugin.swift expects, then calls the native plugin.
 *
 * On web/Android this module is a no-op.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

// ---------- Plugin interface ----------

interface WorkoutKitPluginInterface {
  isSupported(): Promise<{ supported: boolean }>;
  previewWorkout(options: { workout: WatchWorkout }): Promise<{ success: boolean }>;
  syncWorkout(options: { workout: WatchWorkout }): Promise<{ success: boolean; method?: string }>;
}

const WorkoutKitNative = registerPlugin<WorkoutKitPluginInterface>("WorkoutKit");

// ---------- Types ----------

/** JSON shape expected by the Swift plugin. */
export type WatchWorkout = {
  title: string;
  sport: "running" | "ciclismo" | "natación";
  indoor?: boolean;
  targetMode: "pace" | "hr" | "power";
  warmup?: WatchStep;
  cooldown?: WatchStep;
  blocks: WatchBlock[];
};

export type WatchStep = {
  goalType: "time" | "distance" | "open";
  goalValue?: number; // seconds or meters
  target?: WatchTarget;
};

export type WatchTarget = {
  type: "pace" | "hr" | "power";
  low: number;  // pace: s/km, hr: bpm, power: watts
  high: number;
};

export type WatchBlock = {
  iterations: number;
  steps: WatchIntervalStep[];
};

export type WatchIntervalStep = WatchStep & {
  purpose: "work" | "recovery";
};

// ---------- Public API ----------

const isNativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

export async function isWorkoutKitSupported(): Promise<boolean> {
  if (!isNativeIos) return false;
  try {
    const result = await WorkoutKitNative.isSupported();
    return result.supported;
  } catch {
    return false;
  }
}

/**
 * Show system preview of the workout (user confirms → syncs to Watch).
 */
export async function previewWorkout(workout: WatchWorkout): Promise<boolean> {
  if (!isNativeIos) return false;
  try {
    const result = await WorkoutKitNative.previewWorkout({ workout });
    return result.success;
  } catch (err) {
    console.error("[WorkoutKit] Preview failed:", err);
    return false;
  }
}

/**
 * Silently sync workout to Apple Watch via WorkoutStore.
 * Falls back to previewWorkout if silent sync is unavailable.
 */
export async function syncWorkout(workout: WatchWorkout): Promise<boolean> {
  if (!isNativeIos) return false;
  try {
    const result = await WorkoutKitNative.syncWorkout({ workout });
    return result.success;
  } catch (err) {
    console.error("[WorkoutKit] Sync failed:", err);
    return false;
  }
}

// ---------- Converter: PlannedSession → WatchWorkout ----------

type PlannedSession = {
  public_label: string;
  discipline: string;
  dose_prescription: string;
  session_family?: string;
  target_mode?: string | null;
  structured_workout_payload?: any;
  payload?: any;
};

type AthleteThresholds = {
  lt1_pace_s_per_km?: number;
  lt2_pace_s_per_km?: number;
  lt1_hr?: number;
  lt2_hr?: number;
  lt1_power?: number;
  lt2_power?: number;
};

/**
 * Convert a PlannedSession from the API into a WatchWorkout
 * that the Apple Watch can execute with structured blocks.
 */
export function sessionToWatchWorkout(
  session: PlannedSession,
  thresholds: AthleteThresholds
): WatchWorkout | null {
  const sport = normalizeSport(session.discipline);
  const targetMode = (session.target_mode || "pace") as "pace" | "hr" | "power";
  const dose = session.dose_prescription;

  // Try to use structured_workout_payload first
  if (session.structured_workout_payload?.steps?.length) {
    return convertStructuredPayload(session, thresholds, sport, targetMode);
  }

  // Parse dose_prescription (e.g., "3×10' LT1", "4×8' LT2", "55' cont")
  return parseDoseToWorkout(session, thresholds, sport, targetMode, dose);
}

// ---------- Internal: convert structured payload ----------

function convertStructuredPayload(
  session: PlannedSession,
  thresholds: AthleteThresholds,
  sport: "running" | "ciclismo" | "natación",
  targetMode: "pace" | "hr" | "power"
): WatchWorkout {
  const payload = session.structured_workout_payload;
  const steps = payload.steps || [];

  let warmup: WatchStep | undefined;
  let cooldown: WatchStep | undefined;
  const blocks: WatchBlock[] = [];

  for (const step of steps) {
    if (step.step_type === "warmup") {
      warmup = convertPayloadStep(step);
    } else if (step.step_type === "cooldown") {
      cooldown = convertPayloadStep(step);
    } else if (step.step_type === "repeat") {
      const children = (step.children || []).map((child: any) => ({
        ...convertPayloadStep(child),
        purpose: child.step_type === "recovery" ? "recovery" as const : "work" as const,
      }));
      blocks.push({ iterations: step.repeat_count || 1, steps: children });
    } else if (step.step_type === "interval" || step.step_type === "steady") {
      // Single work step → block with 1 iteration
      const zn = detectZone(step.intensity_label || "", "");
      const target = zoneToTarget(zn, thresholds, targetMode);
      blocks.push({
        iterations: 1,
        steps: [{
          purpose: "work",
          goalType: step.length_type === "distance" ? "distance" : "time",
          goalValue: step.length_value || 0,
          target: target || undefined,
        }],
      });
    }
  }

  return { title: session.public_label, sport, targetMode, warmup, cooldown, blocks };
}

function convertPayloadStep(step: any): WatchStep {
  return {
    goalType: step.length_type === "distance" ? "distance" : step.length_type === "time" ? "time" : "open",
    goalValue: step.length_value || undefined,
  };
}

// ---------- Internal: parse dose_prescription ----------

function parseDoseToWorkout(
  session: PlannedSession,
  thresholds: AthleteThresholds,
  sport: "running" | "ciclismo" | "natación",
  targetMode: "pace" | "hr" | "power",
  dose: string
): WatchWorkout | null {
  // Match patterns like "3×10'", "4×8'", "55' cont", "2×25'"
  const intervalMatch = dose.match(/(\d+)\s*[×x]\s*(\d+)['′]/i);
  const continuousMatch = dose.match(/^(\d+)['′]\s*(cont|continuo)?/i);

  const zone = detectZone(dose, session.session_family || "");
  const target = zoneToTarget(zone, thresholds, targetMode);

  // Default warmup/cooldown from payload or 15min/10min
  const warmupMin = session.payload?.calentamiento_min || 15;
  const cooldownMin = session.payload?.enfriamiento_min || 10;

  const warmup: WatchStep = { goalType: "time", goalValue: warmupMin * 60 };
  const cooldown: WatchStep = { goalType: "time", goalValue: cooldownMin * 60 };

  if (intervalMatch) {
    const reps = parseInt(intervalMatch[1]);
    const durationMin = parseInt(intervalMatch[2]);

    // Estimate rest from dose or default 90s
    const restMatch = dose.match(/(\d+(?:\.\d+)?)'?\s*(?:rec|rest|descanso)/i);
    const restSec = restMatch ? parseFloat(restMatch[1]) * 60 : 90;

    const block: WatchBlock = {
      iterations: reps,
      steps: [
        { purpose: "work", goalType: "time", goalValue: durationMin * 60, target: target || undefined },
        { purpose: "recovery", goalType: "time", goalValue: restSec },
      ],
    };

    return { title: session.public_label, sport, targetMode, warmup, cooldown, blocks: [block] };
  }

  if (continuousMatch) {
    const durationMin = parseInt(continuousMatch[1]);
    const block: WatchBlock = {
      iterations: 1,
      steps: [
        { purpose: "work", goalType: "time", goalValue: durationMin * 60, target: target || undefined },
      ],
    };

    return { title: session.public_label, sport, targetMode, warmup, cooldown, blocks: [block] };
  }

  // Can't parse — return null (workout won't be synced)
  return null;
}

// ---------- Zone detection ----------

function detectZone(dose: string, family: string): string {
  const d = dose.toUpperCase();
  if (d.includes("VO2") || d.includes("V02")) return "VO2";
  if (d.includes("LT2") || d.includes("THRESHOLD") || d.includes("UMBRAL")) return "LT2";
  if (d.includes("LT1") || d.includes("BASE") || d.includes("SUB")) return "LT1";
  if (d.includes("RECOVERY") || d.includes("REC")) return "RECOVERY";

  // Infer from family
  if (family.includes("lt2") || family.includes("threshold")) return "LT2";
  if (family.includes("lt1") || family.includes("aerobic")) return "LT1";
  if (family.includes("vo2")) return "VO2";

  return "LT1"; // default
}

function zoneToTarget(
  zone: string,
  thresholds: AthleteThresholds,
  mode: "pace" | "hr" | "power"
): WatchTarget | null {
  if (mode === "pace") {
    const lt1 = thresholds.lt1_pace_s_per_km;
    const lt2 = thresholds.lt2_pace_s_per_km;
    if (!lt1 || !lt2) return null;

    switch (zone) {
      case "LT1":     return { type: "pace", low: lt1 - 10, high: lt1 + 15 };    // slightly above to below LT1
      case "LT2":     return { type: "pace", low: lt2 - 5,  high: lt2 + 10 };     // around LT2
      case "VO2":     return { type: "pace", low: lt2 - 20, high: lt2 - 5 };      // faster than LT2
      case "RECOVERY": return { type: "pace", low: lt1 + 20, high: lt1 + 60 };    // well below LT1
      default: return null;
    }
  }

  if (mode === "hr") {
    const lt1 = thresholds.lt1_hr;
    const lt2 = thresholds.lt2_hr;
    if (!lt1 || !lt2) return null;

    switch (zone) {
      case "LT1":     return { type: "hr", low: lt1 - 5,  high: lt1 + 3 };
      case "LT2":     return { type: "hr", low: lt2 - 5,  high: lt2 + 3 };
      case "VO2":     return { type: "hr", low: lt2 + 2,  high: lt2 + 15 };
      case "RECOVERY": return { type: "hr", low: lt1 - 25, high: lt1 - 5 };
      default: return null;
    }
  }

  if (mode === "power") {
    const lt1 = thresholds.lt1_power;
    const lt2 = thresholds.lt2_power;
    if (!lt1 || !lt2) return null;

    switch (zone) {
      case "LT1":     return { type: "power", low: lt1 - 10, high: lt1 + 10 };
      case "LT2":     return { type: "power", low: lt2 - 10, high: lt2 + 10 };
      case "VO2":     return { type: "power", low: lt2 + 10, high: lt2 + 40 };
      case "RECOVERY": return { type: "power", low: lt1 - 40, high: lt1 - 10 };
      default: return null;
    }
  }

  return null;
}

function normalizeSport(discipline: string): "running" | "ciclismo" | "natación" {
  const d = discipline.toLowerCase();
  if (d.includes("run") || d.includes("carrera")) return "running";
  if (d.includes("cicl") || d.includes("bik") || d.includes("bici")) return "ciclismo";
  if (d.includes("nat") || d.includes("swim")) return "natación";
  return "running";
}

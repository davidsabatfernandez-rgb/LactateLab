/**
 * Apple HealthKit integration via Capacitor.
 *
 * Uses @niclas-niclasen/capacitor-healthkit (install separately).
 * On web/Android this module is a no-op — all methods return gracefully.
 */

import { Capacitor } from "@capacitor/core";

// ---------- Types ----------

export type HealthSample = {
  sample_date: string; // YYYY-MM-DD
  sleep_seconds?: number | null;
  deep_sleep_seconds?: number | null;
  rem_sleep_seconds?: number | null;
  core_sleep_seconds?: number | null;
  awake_seconds?: number | null;
  resting_hr?: number | null;
  hrv_sdnn?: number | null;
  respiration_rate?: number | null;
  spo2?: number | null;
  steps?: number | null;
  exercise_minutes?: number | null;
  active_energy_kcal?: number | null;
  vo2max?: number | null;
};

// ---------- Platform check ----------

const isNativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

// ---------- Lazy-load the plugin (only on iOS) ----------

let _plugin: any = null;

async function getPlugin() {
  if (!isNativeIos) return null;
  if (_plugin) return _plugin;
  try {
    const mod = await import("@perfood/capacitor-healthkit");
    _plugin = mod.CapacitorHealthkit || mod.default;
    return _plugin;
  } catch {
    console.warn("[HealthKit] Plugin not installed");
    return null;
  }
}

// ---------- Public API ----------

export async function isAvailable(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    await plugin.isAvailable(); // throws if HealthKit not available
    return true;
  } catch {
    return false;
  }
}

const READ_PERMISSIONS = [
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKQuantityTypeIdentifierOxygenSaturation",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierVO2Max",
  "HKCategoryTypeIdentifierSleepAnalysis",
];

export async function requestAuthorization(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    await plugin.requestAuthorization({
      all: [],
      read: READ_PERMISSIONS,
      write: [],
    });
    return true;
  } catch (err) {
    console.error("[HealthKit] Authorization failed", err);
    return false;
  }
}

/**
 * Read health data for the last `days` days and return as HealthSample[].
 */
export async function readHealthData(days = 7): Promise<HealthSample[]> {
  const plugin = await getPlugin();
  if (!plugin) return [];

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const startISO = start.toISOString();
  const endISO = end.toISOString();

  // Collect all data in parallel
  const [hrv, rhr, sleep, steps, exercise, respRate, spo2, vo2max] = await Promise.all([
    _queryQuantity(plugin, "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", startISO, endISO),
    _queryQuantity(plugin, "HKQuantityTypeIdentifierRestingHeartRate", startISO, endISO),
    _querySleep(plugin, startISO, endISO),
    _queryQuantity(plugin, "HKQuantityTypeIdentifierStepCount", startISO, endISO),
    _queryQuantity(plugin, "HKQuantityTypeIdentifierAppleExerciseTime", startISO, endISO),
    _queryQuantity(plugin, "HKQuantityTypeIdentifierRespiratoryRate", startISO, endISO),
    _queryQuantity(plugin, "HKQuantityTypeIdentifierOxygenSaturation", startISO, endISO),
    _queryQuantity(plugin, "HKQuantityTypeIdentifierVO2Max", startISO, endISO),
  ]);

  // Aggregate by date
  const byDate = new Map<string, HealthSample>();

  const ensureDay = (dateStr: string): HealthSample => {
    if (!byDate.has(dateStr)) byDate.set(dateStr, { sample_date: dateStr });
    return byDate.get(dateStr)!;
  };

  // HRV — average per day
  for (const [dateStr, values] of _groupByDate(hrv)) {
    ensureDay(dateStr).hrv_sdnn = _avg(values);
  }

  // Resting HR — min per day (most representative)
  for (const [dateStr, values] of _groupByDate(rhr)) {
    ensureDay(dateStr).resting_hr = Math.round(Math.min(...values));
  }

  // Sleep — summed by category
  for (const [dateStr, sleepData] of sleep.entries()) {
    const day = ensureDay(dateStr);
    day.sleep_seconds = sleepData.total;
    day.deep_sleep_seconds = sleepData.deep;
    day.rem_sleep_seconds = sleepData.rem;
    day.core_sleep_seconds = sleepData.core;
    day.awake_seconds = sleepData.awake;
  }

  // Steps — sum per day
  for (const [dateStr, values] of _groupByDate(steps)) {
    ensureDay(dateStr).steps = Math.round(values.reduce((a, b) => a + b, 0));
  }

  // Exercise — sum per day
  for (const [dateStr, values] of _groupByDate(exercise)) {
    ensureDay(dateStr).exercise_minutes = Math.round(values.reduce((a, b) => a + b, 0));
  }

  // Respiration rate — average per day
  for (const [dateStr, values] of _groupByDate(respRate)) {
    ensureDay(dateStr).respiration_rate = _avg(values);
  }

  // SpO2 — average per day (value comes as 0-1 ratio)
  for (const [dateStr, values] of _groupByDate(spo2)) {
    const avg = _avg(values);
    ensureDay(dateStr).spo2 = avg <= 1 ? Math.round(avg * 100) : Math.round(avg);
  }

  // VO2max — latest per day
  for (const [dateStr, values] of _groupByDate(vo2max)) {
    ensureDay(dateStr).vo2max = values[values.length - 1];
  }

  return Array.from(byDate.values()).sort((a, b) => a.sample_date.localeCompare(b.sample_date));
}

// ---------- Internal helpers ----------

type RawSample = { startDate: string; value: number };

async function _queryQuantity(plugin: any, type: string, start: string, end: string): Promise<RawSample[]> {
  try {
    const result = await plugin.queryHKitSampleType({
      sampleName: type,
      startDate: start,
      endDate: end,
      limit: 0,
    });
    return (result?.resultData || []).map((r: any) => ({
      startDate: r.startDate || r.startDateStr,
      value: typeof r.value === "number" ? r.value : parseFloat(r.value),
    }));
  } catch {
    return [];
  }
}

type SleepDay = { total: number; deep: number; rem: number; core: number; awake: number };

async function _querySleep(plugin: any, start: string, end: string): Promise<Map<string, SleepDay>> {
  const result = new Map<string, SleepDay>();
  try {
    const raw = await plugin.queryHKitSampleType({
      sampleName: "HKCategoryTypeIdentifierSleepAnalysis",
      startDate: start,
      endDate: end,
      limit: 0,
    });
    for (const sample of raw?.resultData || []) {
      const startD = new Date(sample.startDate || sample.startDateStr);
      const endD = new Date(sample.endDate || sample.endDateStr);
      const dateStr = startD.toISOString().slice(0, 10);
      const durationSec = Math.round((endD.getTime() - startD.getTime()) / 1000);

      if (!result.has(dateStr)) result.set(dateStr, { total: 0, deep: 0, rem: 0, core: 0, awake: 0 });
      const day = result.get(dateStr)!;

      const val = typeof sample.value === "number" ? sample.value : parseInt(sample.value, 10);
      // Apple sleep values: 0=InBed, 1=Asleep(unspecified), 2=Awake, 3=Core, 4=Deep, 5=REM
      if (val === 4) { day.deep += durationSec; day.total += durationSec; }
      else if (val === 5) { day.rem += durationSec; day.total += durationSec; }
      else if (val === 3 || val === 1) { day.core += durationSec; day.total += durationSec; }
      else if (val === 2) { day.awake += durationSec; }
      // val === 0 (InBed) is not sleep time
    }
  } catch { /* ignore */ }
  return result;
}

function _groupByDate(samples: RawSample[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const s of samples) {
    const dateStr = new Date(s.startDate).toISOString().slice(0, 10);
    if (!groups.has(dateStr)) groups.set(dateStr, []);
    groups.get(dateStr)!.push(s.value);
  }
  return groups;
}

function _avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

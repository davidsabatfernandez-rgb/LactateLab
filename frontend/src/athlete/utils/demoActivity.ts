/**
 * Generate realistic mock data for PostWorkoutAnalysis demo.
 * Simulates a running LT1 interval session (~55 min, 6×6' @ LT1 pace).
 */
import type { AthleteHealthActivity, GarminActivity, PlanningPlannedSession, WorkoutStep } from "../../types";

// ── Helpers ──────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function jitter(base: number, range: number): number {
  return base + (Math.random() - 0.5) * 2 * range;
}

// ── Stream generator ─────────────────────────────────────────

function generateStreams(durationSec: number) {
  const dt = 5; // one point every 5 seconds
  const n = Math.floor(durationSec / dt);

  const hr: number[] = [];
  const speed: number[] = []; // m/s
  const cadence: number[] = [];
  const altitude: number[] = [];
  const timestamp: number[] = [];

  // Workout structure: warmup (8') → 6×(6' work + 2' rest) → cooldown (5')
  const warmupEnd = 8 * 60;
  const repWork = 6 * 60;
  const repRest = 2 * 60;
  const repCycle = repWork + repRest;
  const reps = 6;
  const intervalsEnd = warmupEnd + reps * repCycle;
  // cooldown goes to end

  let baseAlt = 120; // meters
  const startTs = Date.now() / 1000;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    timestamp.push(startTs + t);

    // Determine phase
    let phase: "warmup" | "work" | "rest" | "cooldown";
    let repIdx = -1;
    if (t < warmupEnd) {
      phase = "warmup";
    } else if (t < intervalsEnd) {
      const intoIntervals = t - warmupEnd;
      const cyclePos = intoIntervals % repCycle;
      repIdx = Math.floor(intoIntervals / repCycle);
      phase = cyclePos < repWork ? "work" : "rest";
    } else {
      phase = "cooldown";
    }

    // HR simulation
    let targetHr: number;
    switch (phase) {
      case "warmup": {
        const progress = t / warmupEnd;
        targetHr = lerp(115, 140, progress);
        break;
      }
      case "work": {
        // Progressive cardiac drift: later reps = slightly higher HR
        const drift = repIdx * 2;
        targetHr = 152 + drift;
        break;
      }
      case "rest":
        targetHr = 128;
        break;
      case "cooldown": {
        const progress = (t - intervalsEnd) / (durationSec - intervalsEnd);
        targetHr = lerp(135, 110, progress);
        break;
      }
    }
    hr.push(Math.round(jitter(targetHr, 3)));

    // Speed (m/s) — running
    let targetSpeed: number;
    switch (phase) {
      case "warmup":
        targetSpeed = 2.6; // ~6:25/km
        break;
      case "work":
        targetSpeed = 3.33; // ~5:00/km (LT1)
        break;
      case "rest":
        targetSpeed = 2.5; // ~6:40/km recovery jog
        break;
      case "cooldown":
        targetSpeed = 2.4; // ~6:56/km
        break;
    }
    speed.push(jitter(targetSpeed, 0.12));

    // Cadence (spm)
    const baseCad = phase === "work" ? 178 : phase === "warmup" ? 168 : phase === "rest" ? 164 : 162;
    cadence.push(Math.round(jitter(baseCad, 3)));

    // Altitude — gentle rolling hills
    baseAlt += jitter(0, 0.3);
    baseAlt = Math.max(80, Math.min(180, baseAlt));
    altitude.push(Math.round(baseAlt * 10) / 10);
  }

  return {
    streams: {
      heart_rate: { data: hr },
      speed: { data: speed },
      cadence: { data: cadence },
      altitude: { data: altitude },
      timestamp: { data: timestamp },
    },
    n,
  };
}

// ── Lap generator ────────────────────────────────────────────

function generateLaps(): GarminActivity["laps"] {
  const laps: GarminActivity["laps"] = [];

  // Warmup
  laps.push({
    lap_index: 0, name: "Calentamiento",
    distance_m: 1350, elapsed_time_seconds: 480, moving_time_seconds: 480,
    average_speed_m_s: 2.6, average_heartrate: 130, max_heartrate: 142,
  });

  // 6 work intervals
  for (let i = 0; i < 6; i++) {
    const drift = i * 0.02; // slight pace drift
    const hrDrift = i * 2;
    laps.push({
      lap_index: laps.length, name: `Intervalo ${i + 1}`,
      distance_m: jitter(2000, 30), elapsed_time_seconds: 360, moving_time_seconds: 360,
      average_speed_m_s: 3.33 - drift, average_heartrate: 152 + hrDrift, max_heartrate: 160 + hrDrift,
    });
    // Recovery
    laps.push({
      lap_index: laps.length, name: `Recuperación ${i + 1}`,
      distance_m: jitter(320, 20), elapsed_time_seconds: 120, moving_time_seconds: 120,
      average_speed_m_s: 2.5, average_heartrate: 128, max_heartrate: 138,
    });
  }

  // Cooldown
  laps.push({
    lap_index: laps.length, name: "Vuelta a la calma",
    distance_m: 850, elapsed_time_seconds: 300, moving_time_seconds: 300,
    average_speed_m_s: 2.4, average_heartrate: 120, max_heartrate: 135,
  });

  return laps;
}

// ── Zone distribution mock ───────────────────────────────────

function generateZoneDistribution() {
  return [
    { zones: [
      { secsInZone: 480 },  // Z1 — warmup/cooldown
      { secsInZone: 1320 }, // Z2 — LT1 work
      { secsInZone: 600 },  // Z3 — transition
      { secsInZone: 420 },  // Z4 — top-end intervals
      { secsInZone: 60 },   // Z5 — brief spikes
      { secsInZone: 0 },    // Z6
    ] },
  ];
}

// ── Planned session mock ─────────────────────────────────────

function generatePlannedSteps(): WorkoutStep[] {
  return [
    {
      order: 0, step_type: "warmup", length_type: "time", length_value: 480,
      intensity_label: "Suave", target: { target_type: "hr", label: "Z1" }, children: [],
    },
    {
      order: 1, step_type: "repeat", length_type: "time", repeat_count: 6,
      children: [
        {
          order: 0, step_type: "active", length_type: "time", length_value: 360,
          intensity_label: "LT1", target: { target_type: "hr", label: "LT1" }, children: [],
        },
        {
          order: 1, step_type: "recovery", length_type: "time", length_value: 120,
          intensity_label: "Suave", target: { target_type: "hr", label: "Recuperación" }, children: [],
        },
      ],
    },
    {
      order: 2, step_type: "cooldown", length_type: "time", length_value: 300,
      intensity_label: "Suave", target: { target_type: "hr", label: "Z1" }, children: [],
    },
  ];
}

// ── Public API ────────────────────────────────────────────────

export function buildDemoActivity(): {
  activity: AthleteHealthActivity;
  detail: GarminActivity;
  plannedSession: PlanningPlannedSession;
} {
  const durationSec = 55 * 60; // 55 min
  const distanceM = 11200;
  const now = new Date().toISOString();

  const { streams } = generateStreams(durationSec);
  const laps = generateLaps();

  const activity: AthleteHealthActivity = {
    provider_activity_id: 99990001,
    name: "Intervalos LT1 6×6'",
    started_at: now,
    sport_type: "running",
    sport_label: "Running",
    sport_color: "#3fb950",
    distance_m: distanceM,
    moving_time_seconds: durationSec,
    average_heartrate: 145,
    source: "demo",
  };

  const detail: GarminActivity = {
    provider_activity_id: 99990001,
    name: "Intervalos LT1 6×6'",
    sport_type: "running",
    started_at: now,
    distance_m: distanceM,
    moving_time_seconds: durationSec,
    elapsed_time_seconds: durationSec + 120,
    average_speed_m_s: distanceM / durationSec,
    max_speed_m_s: 3.8,
    average_heartrate: 145,
    max_heartrate: 168,
    average_cadence: 174,
    calories: 620,
    total_elevation_gain_m: 85,
    device_name: "Garmin FR 265 (Demo)",
    start_latlng: [41.39, 2.17],
    end_latlng: [41.39, 2.17],
    laps,
    raw_detail: {
      extras: {
        hr_time_in_zones: generateZoneDistribution(),
        fit_file: { streams },
      },
    },
  };

  const plannedSession: PlanningPlannedSession = {
    id: 99990001,
    focus_block_id: 1,
    discipline: "running",
    scheduled_date: new Date().toISOString().slice(0, 10),
    week_index: 0,
    day_offset: 2,
    session_role: "KEY",
    session_family: "lt1_extensive",
    public_label: "Intervalos LT1 en parque",
    objective: "Desarrollar capacidad aeróbica a ritmo de umbral aeróbico",
    dose_prescription: "6 × 6' LT1 con 2' recuperación",
    dose_guidance: "Mantener ritmo constante ~5:00/km, FC 148-158 bpm",
    coach_note: "Si la FC sube > 160 en los últimos intervalos, aflojar 5 seg/km",
    expected_signal: "FC estable < 155 bpm en los 6 intervalos indica buena adaptación aeróbica",
    confidence: 0.85,
    status: "published",
    bla_check: false,
    payload: { total_duration_min: 55 },
    structured_workout_payload: { sport: "running", title: "LT1 6×6'", steps: generatePlannedSteps(), notes: [], source_payload: {} },
  };

  return { activity, detail, plannedSession };
}

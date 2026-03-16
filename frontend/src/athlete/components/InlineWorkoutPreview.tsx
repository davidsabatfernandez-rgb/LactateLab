import { useMemo } from "react";
import type { PlanningPlannedSession, WorkoutStep, WorkoutTarget } from "../../types";
import type { ResolvedTrainingThreshold } from "../../lib/trainingThresholds";
import { formatDurationMin, disciplineLabel } from "../utils/formatters";

/* ── Zone system ─────────────────────────────────────────────── */

type ZoneInfo = {
  id: string;
  label: string;
  color: string;
  bg: string;
};

const ZONES: ZoneInfo[] = [
  { id: "easy",  label: "Suave",  color: "#58a6ff", bg: "rgba(88,166,255,0.10)" },
  { id: "LT1",   label: "LT1",    color: "#3fb950", bg: "rgba(63,185,80,0.10)" },
  { id: "SUB-T", label: "Sub-T",  color: "#d29922", bg: "rgba(210,153,34,0.10)" },
  { id: "LT2",   label: "LT2",    color: "#db6d28", bg: "rgba(219,109,40,0.10)" },
  { id: "VO2",   label: "VO2max", color: "#f85149", bg: "rgba(248,81,73,0.10)" },
  { id: "MAX",   label: "Sprint", color: "#bc4c9c", bg: "rgba(188,76,156,0.10)" },
  { id: "free",  label: "Libre",  color: "#8b949e", bg: "rgba(139,148,158,0.06)" },
];

function zoneInfo(id: string): ZoneInfo {
  return ZONES.find((z) => z.id === id) ?? ZONES[ZONES.length - 1];
}

function resolveZone(target?: WorkoutTarget | null, intensityLabel?: string | null, stepType?: string): string {
  if (stepType === "warmup" || stepType === "cooldown" || stepType === "recovery") return "easy";
  if (target?.target_type === "easy") return "easy";
  const label = (target?.label ?? "").toLowerCase();
  if (label.includes("vo2")) return "VO2";
  if (label.includes("max") || label.includes("sprint")) return "MAX";
  if (label.includes("lt2") || label.includes("umbral") || label.includes("threshold")) return "LT2";
  if (label.includes("sub-t") || label.includes("zona media")) return "SUB-T";
  if (label.includes("lt1") || label.includes("aerob") || label.includes("aerób")) return "LT1";
  if (label.includes("suave") || label.includes("easy") || label.includes("recup")) return "easy";
  const il = (intensityLabel ?? "").toLowerCase();
  if (il === "warmup" || il === "cooldown" || il === "recovery") return "easy";
  if (il.includes("vo2")) return "VO2";
  if (il.includes("max")) return "MAX";
  if (il.includes("lt2") || il.includes("threshold")) return "LT2";
  if (il.includes("sub-t")) return "SUB-T";
  if (il.includes("lt1")) return "LT1";
  return "free";
}

/* ── Duration helpers ────────────────────────────────────────── */

function fmtDuration(lengthType: string, val?: number | null): string {
  if (!val) return "";
  if (lengthType === "time") {
    const s = Math.round(val);
    if (s < 60) return `${s}"`;
    const m = Math.floor(s / 60);
    const rest = s % 60;
    return rest > 0 ? `${m}'${String(rest).padStart(2, "0")}"` : `${m}'`;
  }
  if (lengthType === "distance") {
    if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)} km`;
    return `${Math.round(val)} m`;
  }
  return "";
}

function stepLabel(t: string): string {
  switch (t) {
    case "warmup": return "Calentamiento";
    case "cooldown": return "Enfriamiento";
    case "recovery": return "Rec";
    case "interval": return "Intervalo";
    case "steady": return "Continuo";
    case "repeat": return "Serie";
    default: return t;
  }
}

/* ── Pace / Power / HR formatting ────────────────────────────── */

function fmtPace(s: number | null | undefined): string {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtPower(w: number | null | undefined): string {
  if (!w || w <= 0) return "";
  return `${Math.round(w)}W`;
}

function fmtHr(hr: number | null | undefined): string {
  if (!hr || hr <= 0) return "";
  return `${Math.round(hr)}`;
}

type ZoneTargets = { pace?: string; paceUnit?: string; power?: string; hr?: string };

function zoneTargets(
  zoneId: string,
  lt1: ResolvedTrainingThreshold | null,
  lt2: ResolvedTrainingThreshold | null,
  disc: string,
): ZoneTargets {
  const r: ZoneTargets = {};
  const isRun = disc === "running" || disc === "carrera";
  const isBike = disc === "ciclismo" || disc === "cycling";

  if (zoneId === "easy") {
    if (isRun && lt1?.paceSecondsPerKm) { r.pace = fmtPace(lt1.paceSecondsPerKm * 1.12) + "+"; r.paceUnit = "/km"; }
    if (isBike && lt1?.powerWatts) r.power = "<" + fmtPower(lt1.powerWatts * 0.85);
    if (lt1?.heartRate) r.hr = "<" + fmtHr(lt1.heartRate * 0.92);
  } else if (zoneId === "LT1") {
    if (isRun && lt1?.paceSecondsPerKm) { r.pace = fmtPace(lt1.paceSecondsPerKm * 1.03) + "-" + fmtPace(lt1.paceSecondsPerKm * 0.97); r.paceUnit = "/km"; }
    if (isBike && lt1?.powerWatts) r.power = fmtPower(lt1.powerWatts * 0.95) + "-" + fmtPower(lt1.powerWatts * 1.05);
    if (lt1?.heartRate) r.hr = fmtHr(lt1.heartRate * 0.97) + "-" + fmtHr(lt1.heartRate * 1.03);
  } else if (zoneId === "SUB-T") {
    if (isRun && lt1?.paceSecondsPerKm && lt2?.paceSecondsPerKm) {
      const mid = (lt1.paceSecondsPerKm + lt2.paceSecondsPerKm) / 2;
      r.pace = fmtPace(mid * 1.02) + "-" + fmtPace(mid * 0.98); r.paceUnit = "/km";
    }
    if (isBike && lt1?.powerWatts && lt2?.powerWatts) { const mid = (lt1.powerWatts + lt2.powerWatts) / 2; r.power = fmtPower(mid * 0.97) + "-" + fmtPower(mid * 1.03); }
    if (lt1?.heartRate && lt2?.heartRate) r.hr = fmtHr((lt1.heartRate + lt2.heartRate) / 2 * 0.97) + "-" + fmtHr((lt1.heartRate + lt2.heartRate) / 2 * 1.03);
  } else if (zoneId === "LT2") {
    if (isRun && lt2?.paceSecondsPerKm) { r.pace = fmtPace(lt2.paceSecondsPerKm * 1.02) + "-" + fmtPace(lt2.paceSecondsPerKm * 0.98); r.paceUnit = "/km"; }
    if (isBike && lt2?.powerWatts) r.power = fmtPower(lt2.powerWatts * 0.95) + "-" + fmtPower(lt2.powerWatts * 1.05);
    if (lt2?.heartRate) r.hr = fmtHr(lt2.heartRate * 0.97) + "-" + fmtHr(lt2.heartRate * 1.03);
  } else if (zoneId === "VO2") {
    if (isRun && lt2?.paceSecondsPerKm) { r.pace = fmtPace(lt2.paceSecondsPerKm * 0.95) + "-" + fmtPace(lt2.paceSecondsPerKm * 0.88); r.paceUnit = "/km"; }
    if (isBike && lt2?.powerWatts) r.power = fmtPower(lt2.powerWatts * 1.06) + "-" + fmtPower(lt2.powerWatts * 1.20);
    if (lt2?.heartRate) r.hr = fmtHr(lt2.heartRate * 1.02) + "-" + fmtHr(lt2.heartRate * 1.08);
  } else if (zoneId === "MAX") {
    if (isRun && lt2?.paceSecondsPerKm) { r.pace = "<" + fmtPace(lt2.paceSecondsPerKm * 0.85); r.paceUnit = "/km"; }
    if (isBike && lt2?.powerWatts) r.power = ">" + fmtPower(lt2.powerWatts * 1.25);
  }
  return r;
}

/* ── Visual block for the bar chart ──────────────────────────── */

type VisualBlock = {
  zone: string;
  zi: ZoneInfo;
  label: string;
  dur: string;
  stepType: string;
  seconds: number;
};

function estimateSeconds(step: WorkoutStep): number {
  if (step.length_value) {
    if (step.length_type === "time") return step.length_value;
    if (step.length_type === "distance") return step.length_value / 3.5;
  }
  return 300;
}

function flattenToVisual(steps: WorkoutStep[]): VisualBlock[] {
  const blocks: VisualBlock[] = [];
  function process(step: WorkoutStep) {
    if (step.step_type === "repeat" && step.children?.length) {
      const count = step.repeat_count ?? 1;
      for (let r = 0; r < count; r++) {
        for (const c of step.children) process(c);
      }
      return;
    }
    const zone = resolveZone(step.target, step.intensity_label, step.step_type);
    const secs = estimateSeconds(step);
    blocks.push({
      zone,
      zi: zoneInfo(zone),
      label: step.step_type === "recovery" ? "Rec" : step.target?.label ?? stepLabel(step.step_type),
      dur: fmtDuration(step.length_type, step.length_value),
      stepType: step.step_type,
      seconds: secs,
    });
  }
  for (const s of steps) process(s);
  return blocks;
}

/* ── Structured step row for the list ────────────────────────── */

type StepGroup = {
  type: "single" | "repeat";
  repeatCount?: number;
  repeatLabel?: string;
  children: {
    step: WorkoutStep;
    zone: string;
    zi: ZoneInfo;
    dur: string;
    targets: ZoneTargets;
  }[];
};

function buildStepGroups(
  steps: WorkoutStep[],
  lt1: ResolvedTrainingThreshold | null,
  lt2: ResolvedTrainingThreshold | null,
  disc: string,
): StepGroup[] {
  const groups: StepGroup[] = [];
  for (const step of steps) {
    if (step.step_type === "repeat" && step.children?.length) {
      groups.push({
        type: "repeat",
        repeatCount: step.repeat_count ?? 1,
        repeatLabel: step.intensity_label ?? undefined,
        children: step.children.map((c) => {
          const z = resolveZone(c.target, c.intensity_label, c.step_type);
          return { step: c, zone: z, zi: zoneInfo(z), dur: fmtDuration(c.length_type, c.length_value), targets: zoneTargets(z, lt1, lt2, disc) };
        }),
      });
    } else {
      const z = resolveZone(step.target, step.intensity_label, step.step_type);
      groups.push({
        type: "single",
        children: [{ step, zone: z, zi: zoneInfo(z), dur: fmtDuration(step.length_type, step.length_value), targets: zoneTargets(z, lt1, lt2, disc) }],
      });
    }
  }
  return groups;
}

/* ── Component ───────────────────────────────────────────────── */

type Props = {
  session: PlanningPlannedSession;
  lt1: ResolvedTrainingThreshold | null;
  lt2: ResolvedTrainingThreshold | null;
  onOpenDetail: () => void;
};

export function InlineWorkoutPreview({ session, lt1, lt2, onOpenDetail }: Props) {
  const workout = session.structured_workout_payload;
  const steps = workout?.steps;
  const durationMin = typeof session.payload?.total_duration_min === "number" ? session.payload.total_duration_min as number : null;

  const visual = useMemo(() => {
    if (!steps?.length) return [];
    return flattenToVisual(steps);
  }, [steps]);

  const totalSeconds = useMemo(() => visual.reduce((s, b) => s + b.seconds, 0), [visual]);

  const stepGroups = useMemo(() => {
    if (!steps?.length) return [];
    return buildStepGroups(steps, lt1, lt2, session.discipline);
  }, [steps, lt1, lt2, session.discipline]);

  // Unique zones for the zone reference strip
  const usedZones = useMemo(() => {
    const seen = new Set<string>();
    const result: { zi: ZoneInfo; targets: ZoneTargets }[] = [];
    for (const g of stepGroups) {
      for (const c of g.children) {
        if (!seen.has(c.zone) && c.zone !== "free") {
          seen.add(c.zone);
          result.push({ zi: c.zi, targets: c.targets });
        }
      }
    }
    return result;
  }, [stepGroups]);

  const roleClass = session.session_role === "KEY" ? "key" : session.session_role === "LONG" ? "long" : "support";
  const hasStructure = visual.length > 0;

  return (
    <div className="ath-iwp" onClick={onOpenDetail}>
      {/* ── Header ── */}
      <div className="ath-iwp-header">
        <div className="ath-iwp-left">
          <span className={`ath-session-role ${roleClass}`}>{session.session_role}</span>
          <span className="ath-iwp-disc">{disciplineLabel(session.discipline)}</span>
          {durationMin && <span className="ath-iwp-dur">{formatDurationMin(durationMin)}</span>}
          {session.bla_check && <span className="ath-iwp-bla">BLa</span>}
        </div>
        <svg className="ath-iwp-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>

      <h3 className="ath-iwp-title">{session.public_label}</h3>

      {session.dose_prescription && (
        <p className="ath-iwp-prescription">{session.dose_prescription}</p>
      )}

      {/* ── Visual bar chart ── */}
      {hasStructure && (
        <div className="ath-iwp-bars">
          {visual.map((b, i) => (
            <div
              key={i}
              className="ath-iwp-bar"
              style={{
                flex: `${b.seconds / totalSeconds}`,
                backgroundColor: b.zi.color,
                opacity: b.stepType === "recovery" ? 0.45 : 1,
              }}
              title={`${b.label} ${b.dur}`}
            />
          ))}
        </div>
      )}

      {/* ── Step-by-step blocks ── */}
      {stepGroups.length > 0 && (
        <div className="ath-iwp-steps">
          {stepGroups.map((group, gi) => {
            if (group.type === "repeat") {
              return (
                <div key={gi} className="ath-iwp-repeat">
                  <div className="ath-iwp-repeat-head">
                    <span className="ath-iwp-repeat-badge">{group.repeatCount}×</span>
                    {group.repeatLabel && <span className="ath-iwp-repeat-label">{group.repeatLabel}</span>}
                  </div>
                  {group.children.map((c, ci) => (
                    <StepLine key={ci} {...c} />
                  ))}
                </div>
              );
            }
            return group.children.map((c, ci) => <StepLine key={`${gi}-${ci}`} {...c} />);
          })}
        </div>
      )}

      {/* ── Zone reference strip ── */}
      {usedZones.length > 0 && (lt1 || lt2) && (
        <div className="ath-iwp-zones">
          <span className="ath-iwp-zones-title">Zonas</span>
          <div className="ath-iwp-zones-list">
            {usedZones.map(({ zi, targets }) => {
              const hasT = targets.pace || targets.power || targets.hr;
              if (!hasT) return null;
              return (
                <div key={zi.id} className="ath-iwp-zone-chip" style={{ borderColor: zi.color }}>
                  <span className="ath-iwp-zc-label" style={{ color: zi.color }}>{zi.label}</span>
                  <span className="ath-iwp-zc-targets">
                    {targets.pace && <span className="ath-iwp-zc-pace">{targets.pace}{targets.paceUnit}</span>}
                    {targets.power && <span className="ath-iwp-zc-power">{targets.power}</span>}
                    {targets.hr && <span className="ath-iwp-zc-hr">{targets.hr} bpm</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Objective ── */}
      {session.objective && (
        <p className="ath-iwp-objective">{session.objective}</p>
      )}

      {session.coach_note && (
        <div className="ath-iwp-coach-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>{session.coach_note}</span>
        </div>
      )}
    </div>
  );
}

/* ── Step line sub-component ─────────────────────────────────── */

function StepLine({ step, zi, dur, targets }: {
  step: WorkoutStep;
  zone: string;
  zi: ZoneInfo;
  dur: string;
  targets: ZoneTargets;
}) {
  const hasTargets = targets.pace || targets.power || targets.hr;
  return (
    <div className="ath-iwp-step">
      <div className="ath-iwp-step-bar" style={{ backgroundColor: zi.color }} />
      <div className="ath-iwp-step-body">
        <div className="ath-iwp-step-top">
          <span className="ath-iwp-step-name">{stepLabel(step.step_type)}</span>
          {dur && <span className="ath-iwp-step-dur">{dur}</span>}
          <span className="ath-iwp-step-zone" style={{ background: zi.bg, color: zi.color }}>{zi.label}</span>
        </div>
        {hasTargets && (
          <div className="ath-iwp-step-targets">
            {targets.pace && <span className="t-pace">{targets.pace}{targets.paceUnit}</span>}
            {targets.power && <span className="t-power">{targets.power}</span>}
            {targets.hr && <span className="t-hr">{targets.hr} bpm</span>}
          </div>
        )}
      </div>
    </div>
  );
}

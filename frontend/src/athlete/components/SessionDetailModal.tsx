import { useMemo, useState } from "react";
import type { PlanningPlannedSession, WorkoutStep, WorkoutTarget } from "../../types";
import type { ResolvedTrainingThreshold } from "../../lib/trainingThresholds";
import { formatDurationMin, disciplineLabel } from "../utils/formatters";
import { LactateStepInput, type LactateSubmission } from "./LactateStepInput";

/* ── Zone system ─────────────────────────────────────────────── */

type ZoneInfo = {
  id: string;
  label: string;
  color: string;
  bg: string;
  order: number;
};

const ZONES: ZoneInfo[] = [
  { id: "easy",  label: "Suave",   color: "#58a6ff", bg: "rgba(88,166,255,0.12)",  order: 0 },
  { id: "LT1",   label: "LT1",     color: "#3fb950", bg: "rgba(63,185,80,0.12)",   order: 1 },
  { id: "SUB-T", label: "Sub-T",   color: "#d29922", bg: "rgba(210,153,34,0.12)",  order: 2 },
  { id: "LT2",   label: "LT2",     color: "#db6d28", bg: "rgba(219,109,40,0.12)",  order: 3 },
  { id: "VO2",   label: "VO2max",  color: "#f85149", bg: "rgba(248,81,73,0.12)",   order: 4 },
  { id: "MAX",   label: "Sprint",  color: "#bc4c9c", bg: "rgba(188,76,156,0.12)",  order: 5 },
  { id: "free",  label: "Libre",   color: "#8b949e", bg: "rgba(139,148,158,0.08)", order: 6 },
];

function zoneInfo(id: string): ZoneInfo {
  return ZONES.find((z) => z.id === id) ?? ZONES[ZONES.length - 1];
}

function resolveZone(target?: WorkoutTarget | null, intensityLabel?: string | null, stepType?: string): string {
  if (stepType === "warmup" || stepType === "cooldown" || stepType === "recovery") return "easy";
  if (target?.target_type === "easy") return "easy";
  if (target?.label) {
    const l = target.label.toLowerCase();
    if (l.includes("vo2")) return "VO2";
    if (l.includes("max") || l.includes("sprint")) return "MAX";
    if (l.includes("lt2") || l.includes("umbral") || l.includes("threshold")) return "LT2";
    if (l.includes("sub-t") || l.includes("zona media")) return "SUB-T";
    if (l.includes("lt1") || l.includes("aerob") || l.includes("aerób")) return "LT1";
    if (l.includes("suave") || l.includes("easy") || l.includes("recup")) return "easy";
  }
  if (intensityLabel) {
    const l = intensityLabel.toLowerCase();
    if (l === "warmup" || l === "cooldown" || l === "recovery") return "easy";
    if (l.includes("vo2")) return "VO2";
    if (l.includes("max")) return "MAX";
    if (l.includes("lt2") || l.includes("threshold")) return "LT2";
    if (l.includes("sub-t")) return "SUB-T";
    if (l.includes("lt1")) return "LT1";
  }
  return "free";
}

/* ── Duration / distance formatting ──────────────────────────── */

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

function stepTypeLabel(t: string): string {
  switch (t) {
    case "warmup": return "Calentamiento";
    case "cooldown": return "Enfriamiento";
    case "recovery": return "Recuperación";
    case "interval": return "Intervalo";
    case "steady": return "Continuo";
    case "repeat": return "Serie";
    default: return t;
  }
}

/* ── Pace formatting ─────────────────────────────────────────── */

function fmtPace(secPerKm: number | null | undefined): string {
  if (!secPerKm || secPerKm <= 0) return "";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function fmtPower(watts: number | null | undefined): string {
  if (!watts || watts <= 0) return "";
  return `${Math.round(watts)}W`;
}

function fmtHr(hr: number | null | undefined): string {
  if (!hr || hr <= 0) return "";
  return `${Math.round(hr)} bpm`;
}

/* ── Compute zone targets from thresholds ────────────────────── */

type ZoneTarget = { pace?: string; power?: string; hr?: string };

function computeZoneTargets(
  zoneId: string,
  lt1: ResolvedTrainingThreshold | null,
  lt2: ResolvedTrainingThreshold | null,
  discipline: string,
): ZoneTarget {
  const result: ZoneTarget = {};
  const isRunning = discipline === "running" || discipline === "carrera";
  const isCycling = discipline === "ciclismo" || discipline === "cycling";

  // Multipliers relative to LT2 pace/power/HR for each zone
  // Running: faster = lower sec/km. Cycling: harder = higher watts.
  if (zoneId === "easy") {
    if (isRunning && lt1?.paceSecondsPerKm) result.pace = fmtPace(lt1.paceSecondsPerKm * 1.12) + " +";
    if (isCycling && lt1?.powerWatts) result.power = "< " + fmtPower(lt1.powerWatts * 0.85);
    if (lt1?.heartRate) result.hr = "< " + fmtHr(lt1.heartRate * 0.92);
  } else if (zoneId === "LT1") {
    if (isRunning && lt1?.paceSecondsPerKm) result.pace = fmtPace(lt1.paceSecondsPerKm * 1.03) + " - " + fmtPace(lt1.paceSecondsPerKm * 0.97);
    if (isCycling && lt1?.powerWatts) result.power = fmtPower(lt1.powerWatts * 0.95) + " - " + fmtPower(lt1.powerWatts * 1.05);
    if (lt1?.heartRate) result.hr = fmtHr(lt1.heartRate * 0.97) + " - " + fmtHr(lt1.heartRate * 1.03);
  } else if (zoneId === "SUB-T") {
    if (isRunning && lt1?.paceSecondsPerKm && lt2?.paceSecondsPerKm) {
      const mid = (lt1.paceSecondsPerKm + lt2.paceSecondsPerKm) / 2;
      result.pace = fmtPace(mid * 1.02) + " - " + fmtPace(mid * 0.98);
    }
    if (isCycling && lt1?.powerWatts && lt2?.powerWatts) {
      const mid = (lt1.powerWatts + lt2.powerWatts) / 2;
      result.power = fmtPower(mid * 0.97) + " - " + fmtPower(mid * 1.03);
    }
    if (lt1?.heartRate && lt2?.heartRate) {
      result.hr = fmtHr((lt1.heartRate + lt2.heartRate) / 2 * 0.97) + " - " + fmtHr((lt1.heartRate + lt2.heartRate) / 2 * 1.03);
    }
  } else if (zoneId === "LT2") {
    if (isRunning && lt2?.paceSecondsPerKm) result.pace = fmtPace(lt2.paceSecondsPerKm * 1.02) + " - " + fmtPace(lt2.paceSecondsPerKm * 0.98);
    if (isCycling && lt2?.powerWatts) result.power = fmtPower(lt2.powerWatts * 0.95) + " - " + fmtPower(lt2.powerWatts * 1.05);
    if (lt2?.heartRate) result.hr = fmtHr(lt2.heartRate * 0.97) + " - " + fmtHr(lt2.heartRate * 1.03);
  } else if (zoneId === "VO2") {
    if (isRunning && lt2?.paceSecondsPerKm) result.pace = fmtPace(lt2.paceSecondsPerKm * 0.95) + " - " + fmtPace(lt2.paceSecondsPerKm * 0.88);
    if (isCycling && lt2?.powerWatts) result.power = fmtPower(lt2.powerWatts * 1.06) + " - " + fmtPower(lt2.powerWatts * 1.20);
    if (lt2?.heartRate) result.hr = fmtHr(lt2.heartRate * 1.02) + " - " + fmtHr(lt2.heartRate * 1.08);
  } else if (zoneId === "MAX") {
    if (isRunning && lt2?.paceSecondsPerKm) result.pace = "< " + fmtPace(lt2.paceSecondsPerKm * 0.85);
    if (isCycling && lt2?.powerWatts) result.power = "> " + fmtPower(lt2.powerWatts * 1.25);
  }
  return result;
}

/* ── Flatten steps for visual rendering ──────────────────────── */

type FlatStep = {
  zone: string;
  zoneInfo: ZoneInfo;
  label: string;
  duration: string;
  target: ZoneTarget;
  stepType: string;
  repeatCount?: number;
  isChild?: boolean;
  barWidth: number; // relative width 0-100
};

function flattenSteps(
  steps: WorkoutStep[],
  lt1: ResolvedTrainingThreshold | null,
  lt2: ResolvedTrainingThreshold | null,
  discipline: string,
): FlatStep[] {
  const flat: FlatStep[] = [];

  function estimateDuration(step: WorkoutStep): number {
    if (step.length_value) {
      if (step.length_type === "time") return step.length_value;
      if (step.length_type === "distance") return step.length_value / 4; // rough ~4m/s
    }
    return 300; // default 5min
  }

  function process(step: WorkoutStep, parentRepeat?: number) {
    if (step.step_type === "repeat" && step.children?.length) {
      const count = step.repeat_count ?? 1;
      for (let r = 0; r < count; r++) {
        for (const child of step.children) {
          process(child, count);
        }
      }
      return;
    }
    const zone = resolveZone(step.target, step.intensity_label, step.step_type);
    const zi = zoneInfo(zone);
    const dur = estimateDuration(step);
    flat.push({
      zone,
      zoneInfo: zi,
      label: step.step_type === "recovery" ? "Rec" : step.target?.label ?? stepTypeLabel(step.step_type),
      duration: fmtDuration(step.length_type, step.length_value),
      target: computeZoneTargets(zone, lt1, lt2, discipline),
      stepType: step.step_type,
      repeatCount: parentRepeat,
      isChild: parentRepeat !== undefined,
      barWidth: Math.max(3, Math.min(100, dur / 10)),
    });
  }

  for (const step of steps) process(step);

  // Normalize bar widths
  if (flat.length > 0) {
    const total = flat.reduce((s, f) => s + f.barWidth, 0);
    for (const f of flat) f.barWidth = Math.max(2, (f.barWidth / total) * 100);
  }

  return flat;
}

/* ── Props ───────────────────────────────────────────────────── */

type SessionDetailModalProps = {
  session: PlanningPlannedSession;
  lt1: ResolvedTrainingThreshold | null;
  lt2: ResolvedTrainingThreshold | null;
  onClose: () => void;
  onDelete: (id: number) => void;
};

export function SessionDetailModal({ session, lt1, lt2, onClose, onDelete }: SessionDetailModalProps) {
  const workout = session.structured_workout_payload;
  const durationMin = typeof session.payload?.total_duration_min === "number" ? session.payload.total_duration_min as number : null;
  const [showLactate, setShowLactate] = useState(false);
  const [lactateSaved, setLactateSaved] = useState(false);

  const flatSteps = useMemo(() => {
    if (!workout?.steps?.length) return [];
    return flattenSteps(workout.steps, lt1, lt2, session.discipline);
  }, [workout, lt1, lt2, session.discipline]);

  // Collect unique zones used in this workout
  const usedZones = useMemo(() => {
    const seen = new Set<string>();
    const result: ZoneInfo[] = [];
    for (const s of flatSteps) {
      if (!seen.has(s.zone)) {
        seen.add(s.zone);
        result.push(s.zoneInfo);
      }
    }
    return result.sort((a, b) => a.order - b.order);
  }, [flatSteps]);

  const roleClass = session.session_role === "KEY" ? "key" : session.session_role === "LONG" ? "long" : "support";

  return (
    <div className="ath-modal-backdrop" onClick={onClose}>
      <div className="ath-modal-content ath-modal-large ath-session-detail-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="ath-modal-header">
          <div className="ath-sd-header-info">
            <h3>{session.public_label}</h3>
            <div className="ath-sd-header-meta">
              <span className={`ath-session-role ${roleClass}`}>{session.session_role}</span>
              <span className="ath-sd-disc">{disciplineLabel(session.discipline)}</span>
              <span className="ath-sd-date">{new Date(session.scheduled_date + "T00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}</span>
              {durationMin && <span className="ath-sd-dur">{formatDurationMin(durationMin)}</span>}
            </div>
          </div>
          <button type="button" className="ath-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="ath-modal-body">

          {/* ── Visual workout blocks (TrainingPeaks style) ── */}
          {flatSteps.length > 0 && (
            <div className="ath-sd-workout-visual">
              <div className="ath-sd-bar-chart">
                {flatSteps.map((step, i) => (
                  <div
                    key={i}
                    className="ath-sd-bar"
                    style={{
                      width: `${step.barWidth}%`,
                      backgroundColor: step.zoneInfo.color,
                      opacity: step.stepType === "recovery" ? 0.5 : 1,
                    }}
                    title={`${step.label} ${step.duration}`}
                  >
                    {step.barWidth > 6 && (
                      <span className="ath-sd-bar-label">{step.duration || step.label}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step-by-step breakdown ── */}
          {flatSteps.length > 0 && (
            <div className="ath-sd-steps-list">
              <h4 className="ath-sd-section-title">Bloques del entreno</h4>
              {renderStepGroups(workout!.steps, lt1, lt2, session.discipline)}
            </div>
          )}

          {/* ── Zone reference card ── */}
          {usedZones.length > 0 && (lt1 || lt2) && (
            <div className="ath-sd-zones-card">
              <h4 className="ath-sd-section-title">Tus zonas hoy</h4>
              <div className="ath-sd-zones-grid">
                {usedZones.filter((z) => z.id !== "free").map((z) => {
                  const targets = computeZoneTargets(z.id, lt1, lt2, session.discipline);
                  const hasTargets = targets.pace || targets.power || targets.hr;
                  if (!hasTargets) return null;
                  return (
                    <div key={z.id} className="ath-sd-zone-row" style={{ borderLeftColor: z.color }}>
                      <div className="ath-sd-zone-badge" style={{ background: z.bg, color: z.color }}>{z.label}</div>
                      <div className="ath-sd-zone-targets">
                        {targets.pace && <span className="ath-sd-zt-pace">{targets.pace}</span>}
                        {targets.power && <span className="ath-sd-zt-power">{targets.power}</span>}
                        {targets.hr && <span className="ath-sd-zt-hr">{targets.hr}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Objective & context ── */}
          {session.objective && (
            <div className="ath-sd-info-section">
              <h4 className="ath-sd-section-title">Objetivo</h4>
              <p>{session.objective}</p>
            </div>
          )}

          {session.dose_guidance && (
            <div className="ath-sd-info-section">
              <h4 className="ath-sd-section-title">Guía de ejecución</h4>
              <p>{session.dose_guidance}</p>
            </div>
          )}

          {session.coach_note && (
            <div className="ath-sd-info-section coach">
              <h4 className="ath-sd-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Nota del coach
              </h4>
              <p>{session.coach_note}</p>
            </div>
          )}

          {session.expected_signal && (
            <div className="ath-sd-info-section">
              <h4 className="ath-sd-section-title">Sensación esperada</h4>
              <p>{session.expected_signal}</p>
            </div>
          )}

          {session.dose_prescription && flatSteps.length === 0 && (
            <div className="ath-sd-info-section">
              <h4 className="ath-sd-section-title">Prescripción</h4>
              <p className="ath-sd-prescription-text">{session.dose_prescription}</p>
            </div>
          )}

          {session.bla_check && (
            <div className="ath-sd-bla-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 3-2 5-3 7h-8c-1-2-3-4-3-7a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="1" fill="currentColor"/></svg>
              Test de lactato programado — prepara el medidor
            </div>
          )}

          {/* ── Lactate input (collapsible) ── */}
          <div className="ath-sd-lactate-section">
            {!showLactate && !lactateSaved && (
              <button
                type="button"
                className="ath-sd-lactate-toggle"
                onClick={() => setShowLactate(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
                </svg>
                Registrar lactato de esta sesión
              </button>
            )}
            {showLactate && !lactateSaved && (
              <LactateStepInput
                sessions={[session]}
                onSubmit={(submission: LactateSubmission) => {
                  console.log("Lactate from modal:", submission);
                  setShowLactate(false);
                  setLactateSaved(true);
                }}
              />
            )}
            {lactateSaved && (
              <div className="ath-sd-lactate-done">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Lactato registrado
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="ath-sd-actions">
            <button type="button" className="ath-sd-delete-btn" onClick={() => onDelete(session.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Render structured step groups (preserves repeat hierarchy) ── */

function renderStepGroups(
  steps: WorkoutStep[],
  lt1: ResolvedTrainingThreshold | null,
  lt2: ResolvedTrainingThreshold | null,
  discipline: string,
) {
  return steps.map((step, i) => {
    if (step.step_type === "repeat" && step.children?.length) {
      return (
        <div key={i} className="ath-sd-repeat-group">
          <div className="ath-sd-repeat-header">
            <span className="ath-sd-repeat-badge">{step.repeat_count ?? 1}×</span>
            <span className="ath-sd-repeat-label">{step.intensity_label ?? "Serie"}</span>
          </div>
          <div className="ath-sd-repeat-children">
            {step.children.map((child, ci) => (
              <StepRow key={ci} step={child} lt1={lt1} lt2={lt2} discipline={discipline} />
            ))}
          </div>
        </div>
      );
    }
    return <StepRow key={i} step={step} lt1={lt1} lt2={lt2} discipline={discipline} />;
  });
}

function StepRow({
  step,
  lt1,
  lt2,
  discipline,
}: {
  step: WorkoutStep;
  lt1: ResolvedTrainingThreshold | null;
  lt2: ResolvedTrainingThreshold | null;
  discipline: string;
}) {
  const zone = resolveZone(step.target, step.intensity_label, step.step_type);
  const zi = zoneInfo(zone);
  const dur = fmtDuration(step.length_type, step.length_value);
  const targets = computeZoneTargets(zone, lt1, lt2, discipline);

  return (
    <div className="ath-sd-step-row">
      <div className="ath-sd-step-color" style={{ backgroundColor: zi.color }} />
      <div className="ath-sd-step-main">
        <div className="ath-sd-step-top">
          <span className="ath-sd-step-type">{stepTypeLabel(step.step_type)}</span>
          {dur && <span className="ath-sd-step-dur">{dur}</span>}
          <span className="ath-sd-step-zone-tag" style={{ background: zi.bg, color: zi.color }}>
            {zi.label}
          </span>
        </div>
        {(targets.pace || targets.power || targets.hr) && (
          <div className="ath-sd-step-targets">
            {targets.pace && <span className="ath-sd-st-item pace">{targets.pace}</span>}
            {targets.power && <span className="ath-sd-st-item power">{targets.power}</span>}
            {targets.hr && <span className="ath-sd-st-item hr">{targets.hr}</span>}
          </div>
        )}
        {step.instructions && <p className="ath-sd-step-instructions">{step.instructions}</p>}
      </div>
    </div>
  );
}

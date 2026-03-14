import { useState, useMemo } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { SessionCard } from "../components/SessionCard";
import { ReadinessRing } from "../components/ReadinessRing";
import { VitalChip } from "../components/VitalChip";
import { LactateStepInput } from "../components/LactateStepInput";
import { MicroContent } from "../components/MicroContent";
import { stressLabel } from "../utils/wellness";
import { formatSleepDuration, disciplineLabel } from "../utils/formatters";
import { WELLNESS_CHECK_ITEMS, wellnessCheckAverage, wellnessCheckTone, type WellnessCheckEntry } from "../utils/readiness";

function weatherLabel(code: number): { icon: string; desc: string } {
  if (code === 0) return { icon: "☀", desc: "Despejado" };
  if (code <= 3) return { icon: "⛅", desc: "Parcialmente nublado" };
  if (code <= 48) return { icon: "☁", desc: "Nublado" };
  if (code <= 67) return { icon: "🌧", desc: "Lluvia" };
  if (code <= 86) return { icon: "❄", desc: "Nieve" };
  if (code <= 99) return { icon: "⛈", desc: "Tormenta" };
  return { icon: "☁", desc: "" };
}

export function TodayPage() {
  const data = useAthleteData();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showLactateInput, setShowLactateInput] = useState(false);
  const [wellnessValues, setWellnessValues] = useState<WellnessCheckEntry>({});
  const [wellnessSaved, setWellnessSaved] = useState(false);

  const todayLabel = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  // ── Target countdown ────────────────────────────────────────────
  const primaryTarget = data.analysis?.athlete?.targets?.[0] ?? null;
  const activeBlock = data.analysis?.active_focus_block;

  const targetCountdown = useMemo(() => {
    if (!primaryTarget?.target_date) return null;
    const diff = Math.ceil((new Date(primaryTarget.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return null;
    return diff;
  }, [primaryTarget?.target_date]);

  // ── Phase timeline ──────────────────────────────────────────────
  const phaseTimeline = useMemo(() => {
    if (!activeBlock?.start_date) return null;
    const phases = ["base", "específico", "pre-competición", "taper"];
    const phaseLabels: Record<string, string> = {
      base_early: "base", base_late: "base", base: "base",
      specific: "específico", pre_comp: "pre-competición",
      taper: "taper", competition: "taper",
    };
    const currentPhase = phaseLabels[activeBlock.phase ?? "base"] ?? "base";
    const currentIdx = phases.indexOf(currentPhase);
    const blockStart = new Date(activeBlock.start_date).getTime();
    const blockEnd = activeBlock.end_date ? new Date(activeBlock.end_date).getTime() : (blockStart + 28 * 86400000);
    const totalDays = Math.max(1, (blockEnd - blockStart) / 86400000);
    const elapsedDays = Math.max(0, (Date.now() - blockStart) / 86400000);
    const blockProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
    const weeksLeft = Math.max(0, Math.ceil((blockEnd - Date.now()) / (7 * 86400000)));
    return { phases, currentIdx, currentPhase, blockProgress, weeksLeft };
  }, [activeBlock]);

  // Build lactate steps from today's first session
  const todayFirstSession = data.todaySessions[0];
  const sessionSteps = todayFirstSession?.payload?.steps
    ? (todayFirstSession.payload.steps as Array<{ label?: string; duration_min?: number }>).map((s) => ({
        label: s.label ?? "Paso",
        durationMin: s.duration_min,
      }))
    : todayFirstSession
      ? [{ label: "Calentamiento" }, { label: "Bloque 1" }, { label: "Bloque 2" }, { label: "Enfriamiento" }]
      : [];

  return (
    <div className="ath-page ath-today">
      {/* Date + weather header */}
      <div className="ath-today-header">
        <h1 className="ath-today-date">{todayLabel}</h1>
        {data.weather && (() => {
          const w = weatherLabel(data.weather.code);
          return <span className="ath-today-weather">{w.icon} {data.weather.temp}°C</span>;
        })()}
      </div>

      {/* Hero: 3 symmetrical rings — Estado (left) · Predisposición (center, large) · VO2max (right) */}
      <div className="ath-hero">
        <ReadinessRing
          score={data.trainingStatus.score}
          label={data.trainingStatus.label}
          tone={data.trainingStatus.tone}
          title="Estado"
          size="small"
        />
        <ReadinessRing
          score={data.readiness.score}
          label={data.readiness.label}
          tone={data.readiness.tone}
          title="Predisposición"
          size="large"
        />
        {data.vo2maxValue !== null && Number.isFinite(data.vo2maxValue) ? (
          <ReadinessRing
            score={Math.min(100, Math.max(0, Math.round(((data.vo2maxValue - 25) / 45) * 100)))}
            label={`${data.vo2maxValue.toFixed(1)}`}
            tone="vo2"
            title="VO₂max"
            size="small"
            subtitle={data.vo2maxLabel}
          />
        ) : (
          <ReadinessRing
            score={0}
            label="—"
            tone="neutral"
            title="VO₂max"
            size="small"
          />
        )}
      </div>

      {/* ── Target countdown + Phase timeline ──────────── */}
      {(primaryTarget || phaseTimeline) && (
        <div className="ath-today-plan-bar">
          {primaryTarget && targetCountdown !== null && (
            <div className="ath-target-card">
              <div className="ath-target-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div className="ath-target-info">
                <span className="ath-target-name">{primaryTarget.objective}</span>
                <span className="ath-target-countdown">
                  {targetCountdown} día{targetCountdown !== 1 ? "s" : ""}
                  {primaryTarget.discipline && ` · ${disciplineLabel(primaryTarget.discipline)}`}
                </span>
              </div>
            </div>
          )}

          {phaseTimeline && (
            <div className="ath-phase-timeline">
              <div className="ath-phase-bar">
                {phaseTimeline.phases.map((phase, i) => (
                  <div
                    key={phase}
                    className={`ath-phase-segment ${i === phaseTimeline.currentIdx ? "current" : i < phaseTimeline.currentIdx ? "done" : ""}`}
                  >
                    <span className="ath-phase-label">{phase}</span>
                  </div>
                ))}
              </div>
              <div className="ath-phase-progress">
                <div className="ath-phase-progress-fill" style={{ width: `${phaseTimeline.blockProgress}%` }} />
              </div>
              <span className="ath-phase-detail">
                {activeBlock?.block_objective ?? "Bloque activo"}
                {phaseTimeline.weeksLeft > 0 && ` · ${phaseTimeline.weeksLeft} sem. restantes`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Morning Wellness Check-in (McLean 2010, Saw 2016) ── */}
      {!wellnessSaved && (
        <section className="ath-wellness-checkin">
          <h2 className="ath-section-title">Check-in matinal</h2>
          <p className="ath-checkin-subtitle">30 segundos — tu coach lo verá</p>
          <div className="ath-checkin-items">
            {WELLNESS_CHECK_ITEMS.map((item) => (
              <div key={item.key} className="ath-checkin-item">
                <div className="ath-checkin-item-header">
                  <span className="ath-checkin-item-label">{item.label}</span>
                  <span className="ath-checkin-item-value">
                    {wellnessValues[item.key] ? `${wellnessValues[item.key]}/5` : "—"}
                  </span>
                </div>
                <div className="ath-checkin-anchors">
                  <span>{item.anchors[0]}</span>
                  <span>{item.anchors[1]}</span>
                </div>
                <div className="ath-checkin-dots">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`ath-checkin-dot ${wellnessValues[item.key] === v ? "active" : ""} ${wellnessValues[item.key] === v ? `tone-${v <= 2 ? "low" : v <= 3 ? "mid" : "high"}` : ""}`}
                      onClick={() => setWellnessValues((prev) => ({ ...prev, [item.key]: v }))}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {Object.keys(wellnessValues).length === WELLNESS_CHECK_ITEMS.length && (
            <div className="ath-checkin-summary">
              <span className={`ath-checkin-avg tone-${wellnessCheckTone(wellnessCheckAverage(wellnessValues))}`}>
                Media: {wellnessCheckAverage(wellnessValues).toFixed(1)} / 5
              </span>
              <button type="button" className="ath-checkin-save" onClick={() => {
                console.log("Wellness check-in saved:", wellnessValues);
                setWellnessSaved(true);
              }}>
                Enviar
              </button>
            </div>
          )}
        </section>
      )}
      {wellnessSaved && (
        <div className="ath-checkin-done">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ath-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Check-in registrado — media {wellnessCheckAverage(wellnessValues).toFixed(1)}/5
        </div>
      )}

      {/* Today's sessions */}
      <section className="ath-today-sessions">
        <h2 className="ath-section-title">Hoy te toca</h2>
        {data.todaySessions.length > 0 ? (
          <div className="ath-session-list">
            {data.todaySessions.map((session) => (
              <div key={session.id}>
                {/* Session context line — "why this session" (Halperin 2016, Wulf 2013) */}
                {session.objective && (
                  <div className="ath-session-context">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <span>{session.objective}</span>
                  </div>
                )}
                <SessionCard
                  session={session}
                  expanded={expandedId === session.id}
                  onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="ath-rest-day">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <p>Día de descanso — recupérate bien</p>
          </div>
        )}
      </section>

      {/* Lactate step input (optional, collapsible) */}
      {data.todaySessions.length > 0 && sessionSteps.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          {!showLactateInput ? (
            <button
              type="button"
              className="ath-lactate-toggle-btn"
              onClick={() => setShowLactateInput(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10"/>
                <path d="M18 20V4"/>
                <path d="M6 20v-4"/>
              </svg>
              Registrar lactato de esta sesión
            </button>
          ) : (
            <>
              <LactateStepInput
                steps={sessionSteps}
                onSubmit={(values) => {
                  console.log("Lactate values submitted:", values);
                  setShowLactateInput(false);
                }}
              />
              <MicroContent title="¿Por qué registrar lactato?">
                <p>Registrar lactato por escalones permite a tu entrenador ver cómo responde tu cuerpo a distintas intensidades.</p>
                <p>Con el tiempo, si el lactato baja para un mismo esfuerzo, es señal de que tu capacidad aeróbica está mejorando.</p>
                <p>No te preocupes si los valores varían entre días — es normal. Lo que importa es la tendencia a largo plazo.</p>
              </MicroContent>
            </>
          )}
        </section>
      )}

      {/* Vital chips */}
      <div className="ath-vitals-row">
        <VitalChip
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          label="Sueño"
          value={data.currentSleepHours !== null ? formatSleepDuration(data.currentSleepHours * 3600) : "n/d"}
          delta={data.sleepHoursAverage !== null && data.currentSleepHours !== null
            ? `${(data.currentSleepHours - data.sleepHoursAverage) > 0 ? "+" : ""}${Math.round((data.currentSleepHours - data.sleepHoursAverage) * 60)} min vs 7d`
            : undefined}
          sparkData={data.wellnessSeries.slice(-14)}
          sparkKey="sleepHours"
          sparkColor="#8B5CF6"
        />
        <VitalChip
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 12 6 12 8 6 11 18 14 8 16 12 22 12"/></svg>}
          label="HRV"
          value={typeof data.currentHrv === "number" ? `${data.currentHrv.toFixed(0)} ms` : "n/d"}
          status={data.currentHrvStatus}
          statusTone={data.currentHrvTone}
          delta={data.hrvAverage !== null ? `Media ${data.hrvAverage.toFixed(0)} ms` : undefined}
          sparkData={data.wellnessSeries.slice(-14)}
          sparkKey="hrv"
          sparkColor="#10B981"
          sparkRefBand={data.hrvAverage !== null ? { y1: data.hrvAverage * 0.92, y2: data.hrvAverage * 1.08 } : null}
        />
        <VitalChip
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>}
          label="FC Reposo"
          value={typeof data.currentRestingHr === "number" ? `${data.currentRestingHr.toFixed(0)} bpm` : "n/d"}
          sparkData={data.wellnessSeries.slice(-14)}
          sparkKey="restingHr"
          sparkColor="#3B82F6"
          sparkRefBand={data.restingHrAverage !== null ? { y1: data.restingHrAverage - 3, y2: data.restingHrAverage + 3 } : null}
          delta={data.restingHrAverage !== null ? `Media ${data.restingHrAverage.toFixed(0)} bpm` : undefined}
        />
        <VitalChip
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
          label="Estrés"
          value={typeof data.currentStress === "number" ? `${Math.round(data.currentStress)}` : "n/d"}
          status={stressLabel(data.currentStress)}
          statusTone={typeof data.currentStress === "number" && data.currentStress >= 60 ? "warning" : "good"}
          sparkData={data.wellnessSeries.slice(-14)}
          sparkKey="stress"
          sparkColor="#F59E0B"
        />
      </div>
    </div>
  );
}

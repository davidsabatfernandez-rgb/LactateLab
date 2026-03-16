import type { PlanningPlannedSession, ActualPerformance } from "../../types";
import { formatDurationMin, disciplineLabel } from "../utils/formatters";

type SessionCardProps = {
  session: PlanningPlannedSession;
  expanded?: boolean;
  onToggle?: () => void;
};

function formatPace(sPerkm: number): string {
  const m = Math.floor(sPerkm / 60);
  const s = Math.round(sPerkm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function ActualPerformanceSummary({ perf, discipline }: { perf: ActualPerformance; discipline: string }) {
  const parts: string[] = [];
  if (perf.distance_m) parts.push(formatDistance(perf.distance_m));
  if (perf.avg_pace_s_per_km && discipline === "running") parts.push(`@ ${formatPace(perf.avg_pace_s_per_km)}`);
  if (perf.duration_s) {
    const min = Math.round(perf.duration_s / 60);
    parts.push(`${min} min`);
  }
  if (perf.avg_hr) parts.push(`${Math.round(perf.avg_hr)} bpm`);
  if (perf.avg_power) parts.push(`${Math.round(perf.avg_power)}W`);
  if (!parts.length) return null;
  return <span className="ath-session-actual-summary">{parts.join(" \u00B7 ")}</span>;
}

function ExecutionBadge({ status }: { status: string }) {
  if (status === "completed") return <span className="ath-execution-badge completed" title="Completada">{"\u2705"}</span>;
  if (status === "partial") return <span className="ath-execution-badge partial" title="Parcialmente completada">{"\u26A0\uFE0F"}</span>;
  if (status === "skipped") return <span className="ath-execution-badge skipped" title="No realizada">{"\u274C"}</span>;
  return null;
}

const RATING_LABELS: Record<string, string> = {
  excellent: "Excelente",
  good: "Bien",
  acceptable: "Aceptable",
  poor: "Mejorable",
};

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function CoachFeedbackCard({ feedback, rating, feedbackAt }: { feedback: string; rating?: string | null; feedbackAt?: string | null }) {
  return (
    <div className="ath-coach-feedback-card">
      <div className="ath-coach-feedback-header">
        {rating && (
          <span className={`ath-coach-feedback-badge ${rating}`}>
            {RATING_LABELS[rating] ?? rating}
          </span>
        )}
        <span className="ath-coach-feedback-timestamp">
          Coach {feedbackAt ? `\u00B7 ${timeAgo(feedbackAt)}` : ""}
        </span>
      </div>
      <p className="ath-coach-feedback-text">{feedback}</p>
    </div>
  );
}

export function SessionCard({ session, expanded, onToggle }: SessionCardProps) {
  const roleClass = session.session_role === "KEY" ? "key" : session.session_role === "SUPPORT" ? "support" : "long";
  const durationMin = typeof session.payload?.total_duration_min === "number" ? session.payload.total_duration_min as number : null;
  const execStatus = session.execution_status || "planned";
  const isCompleted = execStatus === "completed";
  const isPastAndMissed = !isCompleted && execStatus === "planned" && session.scheduled_date < new Date().toISOString().slice(0, 10);

  return (
    <div className={`ath-session-card ${roleClass} ${expanded ? "expanded" : ""} ${isCompleted ? "completed" : ""} ${isPastAndMissed ? "missed" : ""}`} onClick={onToggle}>
      <div className="ath-session-card-header">
        <span className={`ath-session-role ${roleClass}`}>{session.session_role}</span>
        <span className="ath-session-discipline">{disciplineLabel(session.discipline)}</span>
        {durationMin ? <span className="ath-session-duration">{formatDurationMin(durationMin)}</span> : null}
        {session.bla_check && <span className="ath-session-bla" title="Test de lactato">BLa</span>}
        <ExecutionBadge status={execStatus} />
        {isPastAndMissed && <span className="ath-session-missed-label">No realizada</span>}
      </div>

      <strong className="ath-session-label">{session.public_label}</strong>

      {isCompleted && session.actual_performance && (
        <div className="ath-session-actual">
          <ActualPerformanceSummary perf={session.actual_performance} discipline={session.discipline} />
        </div>
      )}

      {session.dose_prescription && (
        <p className="ath-session-dose">{session.dose_prescription}</p>
      )}

      {expanded && (
        <div className="ath-session-detail">
          {/* "Por que toca" block */}
          {session.objective && (
            <div className="ath-session-why">
              <div className="ath-session-why-title">Por que toca</div>
              <p>{session.objective}</p>
            </div>
          )}

          {session.dose_guidance && <p className="ath-session-guidance">{session.dose_guidance}</p>}

          {session.coach_note && (
            <div className="ath-session-coach-note">
              <small>Nota del coach</small>
              <p>{session.coach_note}</p>
            </div>
          )}
          {session.expected_signal && (
            <div className="ath-session-signal">
              <small>Senal esperada</small>
              <p>{session.expected_signal}</p>
            </div>
          )}

          {/* Planned vs Actual comparison when completed */}
          {isCompleted && session.actual_performance && durationMin && (
            <div className="ath-session-comparison">
              <small>Planificado vs Real</small>
              <div className="ath-session-comparison-row">
                <span>Duracion: {durationMin} min planificados / {Math.round((session.actual_performance.duration_s || 0) / 60)} min reales</span>
              </div>
              {Boolean(session.actual_performance.distance_m && session.payload?.total_distance_m) && (
                <div className="ath-session-comparison-row">
                  <span>Distancia: {formatDistance(session.payload!.total_distance_m as number)} plan / {formatDistance(session.actual_performance.distance_m as number)} real</span>
                </div>
              )}
            </div>
          )}

          {/* Coach feedback (post-workout review) */}
          {isCompleted && session.coach_feedback && (
            <CoachFeedbackCard
              feedback={session.coach_feedback}
              rating={session.execution_rating}
              feedbackAt={session.coach_feedback_at}
            />
          )}
        </div>
      )}
    </div>
  );
}

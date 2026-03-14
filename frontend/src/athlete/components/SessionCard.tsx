import type { PlanningPlannedSession } from "../../types";
import { formatDurationMin, disciplineLabel } from "../utils/formatters";

type SessionCardProps = {
  session: PlanningPlannedSession;
  expanded?: boolean;
  onToggle?: () => void;
};

export function SessionCard({ session, expanded, onToggle }: SessionCardProps) {
  const roleClass = session.session_role === "KEY" ? "key" : session.session_role === "SUPPORT" ? "support" : "long";
  const durationMin = typeof session.payload?.total_duration_min === "number" ? session.payload.total_duration_min as number : null;

  return (
    <div className={`ath-session-card ${roleClass} ${expanded ? "expanded" : ""}`} onClick={onToggle}>
      <div className="ath-session-card-header">
        <span className={`ath-session-role ${roleClass}`}>{session.session_role}</span>
        <span className="ath-session-discipline">{disciplineLabel(session.discipline)}</span>
        {durationMin ? <span className="ath-session-duration">{formatDurationMin(durationMin)}</span> : null}
        {session.bla_check && <span className="ath-session-bla" title="Test de lactato">BLa</span>}
      </div>

      <strong className="ath-session-label">{session.public_label}</strong>

      {session.dose_prescription && (
        <p className="ath-session-dose">{session.dose_prescription}</p>
      )}

      {expanded && (
        <div className="ath-session-detail">
          {/* "Por qué toca" block */}
          {session.objective && (
            <div className="ath-session-why">
              <div className="ath-session-why-title">Por qué toca</div>
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
              <small>Señal esperada</small>
              <p>{session.expected_signal}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

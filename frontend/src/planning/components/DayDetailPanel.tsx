import type { CalendarEntry, PlanningCalendarSource } from "../types";
import {
  dayNameShort,
  disciplineLabel,
  formatDate,
  formatMinutesCompact,
  monthDayLabel,
  planningPublishStatusMeta,
} from "../utils";
import {
  compactSessionInfo,
  garminStatusBadge,
  garminStatusInfo,
  sessionToneBorderColor,
  sessionToneBackgroundTint,
  sessionToneFromEntry,
} from "../utils-workout";

type DayDetailPanelProps = {
  date: string;
  sessions: CalendarEntry[];
  selectedCalendarSource: PlanningCalendarSource;
  onClose: () => void;
  onSessionClick: (session: CalendarEntry) => void;
  onQuickAdd: (date: string) => void;
  onDeleteSession?: (session: CalendarEntry) => void;
  onDuplicateSession?: (session: CalendarEntry) => void;
  onToggleBla?: (session: CalendarEntry) => void;
  onPushGarmin?: (session: CalendarEntry) => void;
};

function mesocyclePositionLabel(
  date: string,
  source: PlanningCalendarSource,
): string | null {
  const startMs = new Date(source.startDate).getTime();
  const dateMs = new Date(date).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(dateMs)) return null;
  const daysDiff = Math.floor((dateMs - startMs) / 86400000);
  if (daysDiff < 0) return null;
  const weekNum = Math.floor(daysDiff / 7) + 1;
  const phase = source.phase || source.energySystemFocus || source.objective || "";
  return `Semana ${weekNum}${phase ? ` - ${phase}` : ""}`;
}

export function DayDetailPanel({
  date,
  sessions,
  selectedCalendarSource,
  onClose,
  onSessionClick,
  onQuickAdd,
  onDeleteSession,
  onDuplicateSession,
  onToggleBla,
  onPushGarmin,
}: DayDetailPanelProps) {
  const primarySessions = sessions.filter((s) => !s.isOverlay);
  const positionLabel = mesocyclePositionLabel(date, selectedCalendarSource);

  return (
    <aside className="day-detail-panel">
      <div className="day-detail-panel-header">
        <div className="day-detail-panel-date">
          <span className="day-detail-panel-weekday">{dayNameShort(date)}</span>
          <strong>{formatDate(date)}</strong>
          {positionLabel ? <small>{positionLabel}</small> : null}
        </div>
        <button
          type="button"
          className="day-detail-panel-close"
          onClick={onClose}
          aria-label="Cerrar panel de día"
        >
          &times;
        </button>
      </div>

      <div className="day-detail-panel-body">
        {primarySessions.length === 0 ? (
          <div className="day-detail-panel-empty">
            <p>Sin sesiones planificadas</p>
            <button
              type="button"
              className="day-detail-panel-add-btn"
              onClick={() => onQuickAdd(date)}
            >
              + Añadir sesión
            </button>
          </div>
        ) : (
          <div className="day-detail-panel-sessions">
            {primarySessions.map((session) => {
              const tone = sessionToneFromEntry(session);
              const garmin = garminStatusBadge(session);
              const compact = compactSessionInfo(session);
              const doseStep = extractDoseStepLabel(session);
              return (
                <article
                  key={session.id}
                  className="day-detail-session-card"
                  style={{
                    borderLeft: `3px solid ${sessionToneBorderColor(tone)}`,
                    background: sessionToneBackgroundTint(session),
                  }}
                >
                  <div className="day-detail-session-head">
                    <span className="day-detail-session-discipline">
                      {disciplineIcon(session.layerDiscipline)}
                      {disciplineLabel(session.layerDiscipline)}
                    </span>
                    <span className={`day-detail-session-tone tone-${tone}`}>
                      {toneLabel(tone)}
                    </span>
                  </div>

                  <strong className="day-detail-session-title">{session.title}</strong>

                  {doseStep ? (
                    <div className="day-detail-session-dose-step">
                      <span>{doseStep.label}</span>
                      <div className="day-detail-dose-progress">
                        <div
                          className="day-detail-dose-progress-fill"
                          style={{ width: `${doseStep.pct}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <p className="day-detail-session-info">{compact}</p>

                  {session.estimatedMinutes ? (
                    <p className="day-detail-session-duration">
                      Duración: {formatMinutesCompact(session.estimatedMinutes)}
                    </p>
                  ) : null}

                  {session.description ? (
                    <p className="day-detail-session-notes">{session.description}</p>
                  ) : null}

                  {(() => {
                    const gInfo = garminStatusInfo(session.publishStatus);
                    if (gInfo) {
                      return (
                        <div className="day-detail-garmin-status">
                          <span className={`planning-session-garmin-badge garmin-${gInfo.tone}`}>
                            {gInfo.label}
                          </span>
                          {gInfo.tone === "failed" && session.publishError ? (
                            <span className="day-detail-garmin-error" title={session.publishError}>
                              {session.publishError}
                            </span>
                          ) : null}
                        </div>
                      );
                    }
                    if (garmin) {
                      return (
                        <span className={`planning-session-publish-badge ${garmin.tone}`}>
                          {garmin.label}
                        </span>
                      );
                    }
                    return null;
                  })()}

                  <div className="day-detail-session-actions">
                    <button
                      type="button"
                      className="day-detail-action"
                      onClick={() => onSessionClick(session)}
                    >
                      Editar
                    </button>
                    {onDuplicateSession ? (
                      <button
                        type="button"
                        className="day-detail-action"
                        onClick={() => onDuplicateSession(session)}
                      >
                        Duplicar
                      </button>
                    ) : null}
                    {onPushGarmin && session.rawId != null ? (
                      <button
                        type="button"
                        className="day-detail-action"
                        onClick={() => onPushGarmin(session)}
                      >
                        Push Garmin
                      </button>
                    ) : null}
                    {onToggleBla && session.rawId != null ? (
                      <button
                        type="button"
                        className={`day-detail-action ${session.blaCheck ? "active" : ""}`}
                        onClick={() => onToggleBla(session)}
                      >
                        BLa
                      </button>
                    ) : null}
                    {onDeleteSession ? (
                      <button
                        type="button"
                        className="day-detail-action danger"
                        onClick={() => onDeleteSession(session)}
                      >
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}

            <button
              type="button"
              className="day-detail-panel-add-btn"
              onClick={() => onQuickAdd(date)}
            >
              + Añadir sesión
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Helpers ──

function disciplineIcon(discipline: string): string {
  if (discipline === "running") return "\u{1F3C3} ";
  if (discipline === "ciclismo") return "\u{1F6B4} ";
  if (discipline === "natación") return "\u{1F3CA} ";
  return "";
}

function toneLabel(tone: string): string {
  if (tone === "green") return "Base / LT1";
  if (tone === "amber") return "LT2 / Umbral";
  if (tone === "red") return "VO2";
  if (tone === "blue") return "Técnica";
  return "Recuperación";
}

function extractDoseStepLabel(
  _session: CalendarEntry,
): { label: string; pct: number } | null {
  // In the future we can extract dose_step_index from the session payload
  // For now return null — the UI structure is ready
  return null;
}

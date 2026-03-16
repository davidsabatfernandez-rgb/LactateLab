import { useCallback, useState } from "react";
import { api } from "../../lib/api";
import type { PlanningPlannedSession, ActualPerformance } from "../../types";

/* ═══════════════════════════════════════════════════════════════
   Coach Session Review Modal
   Shows actual performance data + feedback form for completed sessions
   ═══════════════════════════════════════════════════════════════ */

type ExecutionRating = "excellent" | "good" | "acceptable" | "poor";

const RATING_OPTIONS: { value: ExecutionRating; label: string; color: string; bg: string }[] = [
  { value: "excellent", label: "Excelente", color: "#3a9a5b", bg: "rgba(58,154,91,0.12)" },
  { value: "good", label: "Bien", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  { value: "acceptable", label: "Aceptable", color: "#d29922", bg: "rgba(210,153,34,0.12)" },
  { value: "poor", label: "Mejorable", color: "#c44040", bg: "rgba(196,64,64,0.12)" },
];

export function ratingMeta(rating: string | null | undefined) {
  return RATING_OPTIONS.find((r) => r.value === rating) ?? null;
}

type Props = {
  session: PlanningPlannedSession;
  token: string;
  onClose: () => void;
  onFeedbackSaved: (updated: PlanningPlannedSession) => void;
};

/* ── Formatting helpers ─────────────────────────────────────── */

function formatPace(sPerkm: number): string {
  const m = Math.floor(sPerkm / 60);
  const s = Math.round(sPerkm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? String(m).padStart(2, "0") + "min" : ""}`;
  return `${m} min`;
}

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

/* ── Performance comparison ─────────────────────────────────── */

function PerformanceComparison({
  session,
  actual,
}: {
  session: PlanningPlannedSession;
  actual: ActualPerformance;
}) {
  const plannedDurMin = typeof session.payload?.total_duration_min === "number"
    ? (session.payload.total_duration_min as number)
    : null;
  const plannedDistM = typeof session.payload?.total_distance_m === "number"
    ? (session.payload.total_distance_m as number)
    : null;

  return (
    <div className="coach-review-performance">
      <h4 className="coach-review-section-title">Planificado vs Real</h4>
      <div className="coach-review-metrics-grid">
        {/* Duration */}
        {(plannedDurMin || actual.duration_s) && (
          <div className="coach-review-metric">
            <span className="coach-review-metric-label">Duracion</span>
            <div className="coach-review-metric-comparison">
              {plannedDurMin ? <span className="coach-review-planned">{plannedDurMin} min plan</span> : null}
              {actual.duration_s ? <span className="coach-review-actual">{formatDuration(actual.duration_s)} real</span> : null}
            </div>
          </div>
        )}

        {/* Distance */}
        {(plannedDistM || actual.distance_m) && (
          <div className="coach-review-metric">
            <span className="coach-review-metric-label">Distancia</span>
            <div className="coach-review-metric-comparison">
              {plannedDistM ? <span className="coach-review-planned">{formatDistance(plannedDistM)} plan</span> : null}
              {actual.distance_m ? <span className="coach-review-actual">{formatDistance(actual.distance_m)} real</span> : null}
            </div>
          </div>
        )}

        {/* Pace */}
        {actual.avg_pace_s_per_km && session.discipline === "running" && (
          <div className="coach-review-metric">
            <span className="coach-review-metric-label">Ritmo medio</span>
            <span className="coach-review-actual">{formatPace(actual.avg_pace_s_per_km)}</span>
          </div>
        )}

        {/* HR */}
        {actual.avg_hr && (
          <div className="coach-review-metric">
            <span className="coach-review-metric-label">FC media</span>
            <span className="coach-review-actual">{Math.round(actual.avg_hr)} bpm</span>
          </div>
        )}

        {/* Power */}
        {actual.avg_power && (
          <div className="coach-review-metric">
            <span className="coach-review-metric-label">Potencia media</span>
            <span className="coach-review-actual">{Math.round(actual.avg_power)} W</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Modal ─────────────────────────────────────────────── */

export function CoachSessionReviewModal({ session, token, onClose, onFeedbackSaved }: Props) {
  const [rating, setRating] = useState<ExecutionRating | null>(
    (session.execution_rating as ExecutionRating) ?? null,
  );
  const [feedback, setFeedback] = useState(session.coach_feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isCompleted = session.execution_status === "completed";
  const hasExistingFeedback = !!session.coach_feedback || !!session.execution_rating;

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await api.submitCoachFeedback(
        token,
        session.id,
        feedback.trim() || null,
        rating,
      ) as PlanningPlannedSession;
      onFeedbackSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Error saving feedback:", e);
    } finally {
      setSaving(false);
    }
  }, [token, session.id, feedback, rating, onFeedbackSaved]);

  const disciplineLabel = (d: string) => {
    if (d === "running") return "Running";
    if (d === "ciclismo") return "Ciclismo";
    if (d === "natacion" || d === "natación") return "Natacion";
    return d;
  };

  return (
    <div className="coach-review-backdrop" onClick={onClose}>
      <div className="coach-review-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="coach-review-header">
          <div>
            <h3 className="coach-review-title">{session.public_label}</h3>
            <div className="coach-review-meta">
              <span className={`coach-review-role ${session.session_role.toLowerCase()}`}>{session.session_role}</span>
              <span>{disciplineLabel(session.discipline)}</span>
              <span>{new Date(session.scheduled_date + "T00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}</span>
              {isCompleted && <span className="coach-review-completed-badge">Completada</span>}
            </div>
          </div>
          <button type="button" className="coach-review-close" onClick={onClose}>&times;</button>
        </div>

        <div className="coach-review-body">
          {/* Session context */}
          {session.objective && (
            <div className="coach-review-info">
              <strong>Objetivo:</strong> {session.objective}
            </div>
          )}
          {session.dose_prescription && (
            <div className="coach-review-info">
              <strong>Prescripcion:</strong> {session.dose_prescription}
            </div>
          )}

          {/* Performance data */}
          {isCompleted && session.actual_performance && (
            <PerformanceComparison session={session} actual={session.actual_performance} />
          )}

          {/* No performance data warning */}
          {isCompleted && !session.actual_performance && (
            <div className="coach-review-no-data">
              Sesion completada sin datos de actividad vinculados.
            </div>
          )}

          {/* Feedback section */}
          <div className="coach-review-feedback-section">
            <h4 className="coach-review-section-title">
              {hasExistingFeedback ? "Editar feedback" : "Feedback del entrenador"}
            </h4>

            {/* Rating selector */}
            <div className="coach-review-rating-row">
              {RATING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`coach-review-rating-btn ${rating === opt.value ? "active" : ""}`}
                  style={{
                    borderColor: rating === opt.value ? opt.color : "transparent",
                    background: rating === opt.value ? opt.bg : "rgba(22,53,61,0.04)",
                    color: rating === opt.value ? opt.color : "var(--primary)",
                  }}
                  onClick={() => setRating(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Text feedback */}
            <textarea
              className="coach-review-textarea"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Escribe feedback para el atleta..."
              rows={4}
            />

            {/* Submit */}
            <div className="coach-review-actions">
              {hasExistingFeedback && session.coach_feedback_at && (
                <span className="coach-review-timestamp">
                  Ultimo feedback: {timeAgo(session.coach_feedback_at)}
                </span>
              )}
              <button
                type="button"
                className="coach-review-submit"
                disabled={saving || (!rating && !feedback.trim())}
                onClick={handleSubmit}
              >
                {saving ? "Guardando..." : saved ? "Guardado" : hasExistingFeedback ? "Actualizar feedback" : "Enviar feedback"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

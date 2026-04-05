import { useEffect, useState } from "react";
import { BEHAVIOR_CATALOG, formatBehaviorValue } from "../utils/behaviorJournal";

type CustomBehavior = { id: number; name: string; emoji: string };
type CustomBehaviorLog = { custom_behavior_id: number; log_date: string; value: boolean };

type Props = {
  date: string;
  entry: Record<string, unknown> | undefined;
  customBehaviors?: CustomBehavior[];
  customLogs?: CustomBehaviorLog[];
  onEdit: () => void;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
};

function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export function BehaviorDayDetail({ date, entry, customBehaviors, customLogs, onEdit, onDelete, onClose, readOnly }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const active: { emoji: string; label: string; detail: string }[] = [];

  if (entry) {
    for (const item of BEHAVIOR_CATALOG) {
      const raw = entry[item.key];
      if (raw !== null && raw !== undefined && raw !== false && raw !== 0) {
        active.push({
          emoji: item.emoji,
          label: item.label,
          detail: formatBehaviorValue(item, raw as string | number | boolean),
        });
      }
    }
  }

  // Custom behaviors active on this date
  const activeCustom: { emoji: string; label: string }[] = [];
  if (customBehaviors && customLogs) {
    for (const cb of customBehaviors) {
      const log = customLogs.find((l) => l.custom_behavior_id === cb.id && l.log_date === date);
      if (log && log.value) {
        activeCustom.push({ emoji: cb.emoji, label: cb.name });
      }
    }
  }

  const entryNotes = entry?.notes as string | undefined;

  // ESC key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="ath-modal-overlay" onClick={onClose}>
      <div className="ath-day-detail" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ath-day-detail-header">
          <h3 className="ath-day-detail-date">{formatDate(date)}</h3>
          <button type="button" className="ath-day-detail-close" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {active.length === 0 && activeCustom.length === 0 ? (
          <p className="ath-day-detail-empty">Sin registros este día</p>
        ) : (
          <div className="ath-day-detail-list">
            {active.map((a, i) => (
              <div key={i} className="ath-day-detail-row">
                <span className="ath-day-detail-emoji">{a.emoji}</span>
                <span className="ath-day-detail-label">{a.label}</span>
                {a.detail && <span className="ath-day-detail-value">{a.detail}</span>}
              </div>
            ))}
            {activeCustom.map((a, i) => (
              <div key={`custom-${i}`} className="ath-day-detail-row">
                <span className="ath-day-detail-emoji">{a.emoji}</span>
                <span className="ath-day-detail-label">{a.label}</span>
              </div>
            ))}
          </div>
        )}

        {entryNotes && (
          <div className="ath-day-detail-notes">
            <span className="ath-day-detail-notes-label">Notas:</span> {entryNotes}
          </div>
        )}

        {!readOnly && (
          <div className="ath-day-detail-actions">
            <button type="button" className="ath-day-detail-edit" onClick={onEdit}>
              Editar
            </button>
            {onDelete && entry && (
              confirmDelete ? (
                <button type="button" className="ath-day-detail-delete-confirm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Borrando..." : "Confirmar borrado"}
                </button>
              ) : (
                <button type="button" className="ath-day-detail-delete" onClick={() => setConfirmDelete(true)}>
                  Borrar
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { BEHAVIOR_CATALOG, BEHAVIOR_CATEGORIES } from "../utils/behaviorJournal";
import { api } from "../../lib/api";

type CustomBehavior = { id: number; name: string; emoji: string; category: string; is_active: boolean };

type Props = {
  preferences: Record<string, boolean>;
  onSave: (prefs: Record<string, boolean>) => void;
  onClose: () => void;
  token?: string;
  athleteId?: number;
  customBehaviors?: CustomBehavior[];
  onCustomBehaviorDeleted?: (id: number) => void;
};

export function BehaviorPreferencesModal({ preferences, onSave, onClose, token, athleteId, customBehaviors, onCustomBehaviorDeleted }: Props) {
  const [local, setLocal] = useState<Record<string, boolean>>({ ...preferences });
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const toggle = (key: string) => setLocal((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleDeleteCustom = async (cb: CustomBehavior) => {
    if (!token || !athleteId || !onCustomBehaviorDeleted) return;
    if (!window.confirm(`¿Eliminar "${cb.name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(cb.id);
    try {
      await api.deleteCustomBehavior(token, athleteId, cb.id);
      onCustomBehaviorDeleted(cb.id);
    } catch (e) {
      console.error("Failed to delete custom behavior:", e);
    } finally {
      setDeletingId(null);
    }
  };

  // ESC key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="ath-modal-overlay" onClick={onClose}>
      <div className="ath-modal-content ath-behavior-prefs-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>Personalizar hábitos</h3>
        <p className="ath-behavior-prefs-subtitle">Activa los que quieras registrar</p>

        {BEHAVIOR_CATEGORIES.map((cat) => {
          const items = BEHAVIOR_CATALOG.filter((b) => b.category === cat.key);
          return (
            <div key={cat.key} className="ath-behavior-prefs-group">
              <h4>{cat.label}</h4>
              <div className="ath-behavior-prefs-items">
                {items.map((item) => (
                  <label key={item.key} className="ath-behavior-pref-row">
                    <span>{item.emoji} {item.label}</span>
                    <input
                      type="checkbox"
                      checked={local[item.key] ?? true}
                      onChange={() => toggle(item.key)}
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        {customBehaviors && customBehaviors.length > 0 && (
          <div className="ath-behavior-prefs-group">
            <h4>Personalizados</h4>
            <div className="ath-behavior-prefs-items">
              {customBehaviors.map((cb) => (
                <div key={cb.id} className="ath-behavior-pref-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>{cb.emoji} {cb.name}</span>
                  {token && athleteId && onCustomBehaviorDeleted && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCustom(cb)}
                      disabled={deletingId === cb.id}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: deletingId === cb.id ? "not-allowed" : "pointer",
                        color: "var(--ath-red, #ef4444)",
                        fontSize: 14,
                        padding: "2px 6px",
                        opacity: deletingId === cb.id ? 0.5 : 1,
                      }}
                      aria-label={`Eliminar ${cb.name}`}
                      title="Eliminar hábito"
                    >
                      {deletingId === cb.id ? "..." : "\u2715"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ath-behavior-prefs-actions">
          <button type="button" className="ath-btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="ath-btn-primary" onClick={() => onSave(local)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

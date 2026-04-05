import { useState } from "react";
import { BEHAVIOR_CATALOG, BEHAVIOR_CATEGORIES } from "../utils/behaviorJournal";

type Props = {
  preferences: Record<string, boolean>;
  onComplete: (prefs: Record<string, boolean>) => void;
};

export function BehaviorOnboarding({ preferences, onComplete }: Props) {
  const [local, setLocal] = useState<Record<string, boolean>>({ ...preferences });

  const toggle = (key: string) => setLocal((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="ath-behavior-onboarding">
      <h2 className="ath-behavior-onboarding-title">Configura tu diario de hábitos</h2>
      <p className="ath-behavior-onboarding-subtitle">
        Elige qué quieres registrar cada día. Podrás cambiarlo después.
      </p>

      {BEHAVIOR_CATEGORIES.map((cat) => {
        const items = BEHAVIOR_CATALOG.filter((b) => b.category === cat.key);
        if (items.length === 0) return null;
        return (
          <div key={cat.key} className="ath-behavior-onboarding-group">
            <span className="ath-behavior-category-label">{cat.label}</span>
            <div className="ath-behavior-grid">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`ath-behavior-pill ${local[item.key] !== false ? "active" : ""}`}
                  onClick={() => toggle(item.key)}
                >
                  <span className="ath-behavior-pill-emoji">{item.emoji}</span>
                  <span className="ath-behavior-pill-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        className="ath-checkin-save"
        onClick={() => onComplete(local)}
      >
        Empezar
      </button>
    </div>
  );
}

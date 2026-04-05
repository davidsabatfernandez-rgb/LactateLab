import { type BehaviorInputType, type BehaviorValue, SCALE_LABELS, DURATION_PRESETS } from "../utils/behaviorJournal";

type Props = {
  behaviorKey: string;
  emoji: string;
  label: string;
  inputType: BehaviorInputType;
  value: BehaviorValue | undefined;
  onChange: (value: BehaviorValue | undefined) => void;
};

export function BehaviorToggle({ behaviorKey, emoji, label, inputType, value, onChange }: Props) {
  const isActive = value !== undefined && value !== false;

  if (inputType === "toggle") {
    return (
      <button
        type="button"
        className={`ath-behavior-pill ${isActive ? "active" : ""}`}
        onClick={() => onChange(isActive ? undefined : true)}
      >
        <span className="ath-behavior-pill-emoji">{emoji}</span>
        <span className="ath-behavior-pill-label">{label}</span>
      </button>
    );
  }

  if (inputType === "time") {
    return (
      <div className={`ath-behavior-rich ${isActive ? "active" : ""}`}>
        <button
          type="button"
          className={`ath-behavior-pill ${isActive ? "active" : ""}`}
          onClick={() => onChange(isActive ? undefined : "22:00")}
        >
          <span className="ath-behavior-pill-emoji">{emoji}</span>
          <span className="ath-behavior-pill-label">{label}</span>
        </button>
        {isActive && (
          <input
            type="time"
            className="ath-behavior-time-input"
            value={String(value)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                onChange(undefined);
              } else if (/^\d{2}:\d{2}$/.test(v)) {
                onChange(v);
              }
            }}
          />
        )}
      </div>
    );
  }

  if (inputType === "quantity") {
    const max = 6;
    const current = typeof value === "number" ? value : 0;
    return (
      <div className={`ath-behavior-rich ${isActive ? "active" : ""}`}>
        <button
          type="button"
          className={`ath-behavior-pill ${isActive ? "active" : ""}`}
          onClick={() => onChange(isActive ? undefined : 1)}
        >
          <span className="ath-behavior-pill-emoji">{emoji}</span>
          <span className="ath-behavior-pill-label">{label}</span>
        </button>
        {isActive && (
          <div className="ath-behavior-quantity">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`ath-behavior-qty-btn ${current === n ? "selected" : ""}`}
                onClick={() => onChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (inputType === "duration") {
    const current = typeof value === "number" ? value : 0;
    return (
      <div className={`ath-behavior-rich ${isActive ? "active" : ""}`}>
        <button
          type="button"
          className={`ath-behavior-pill ${isActive ? "active" : ""}`}
          onClick={() => onChange(isActive ? undefined : 20)}
        >
          <span className="ath-behavior-pill-emoji">{emoji}</span>
          <span className="ath-behavior-pill-label">{label}</span>
        </button>
        {isActive && (
          <div className="ath-behavior-quantity">
            {DURATION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className={`ath-behavior-qty-btn ${current === m ? "selected" : ""}`}
                onClick={() => onChange(m)}
              >
                {m}'
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (inputType === "scale") {
    const labels = SCALE_LABELS[behaviorKey] ?? ["1", "2", "3"];
    const current = typeof value === "number" ? value : 0;
    return (
      <div className={`ath-behavior-rich ${isActive ? "active" : ""}`}>
        <button
          type="button"
          className={`ath-behavior-pill ${isActive ? "active" : ""}`}
          onClick={() => onChange(isActive ? undefined : 1)}
        >
          <span className="ath-behavior-pill-emoji">{emoji}</span>
          <span className="ath-behavior-pill-label">{label}</span>
        </button>
        {isActive && (
          <div className="ath-behavior-quantity">
            {labels.map((lbl, i) => (
              <button
                key={i}
                type="button"
                className={`ath-behavior-qty-btn ${current === i + 1 ? "selected" : ""}`}
                onClick={() => onChange(i + 1)}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

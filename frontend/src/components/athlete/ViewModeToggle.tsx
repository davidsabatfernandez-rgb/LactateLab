export type ViewMode = "athlete" | "coach";

type ViewModeToggleProps = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="ap-view-toggle">
      <button
        type="button"
        className={`ap-view-btn ${mode === "athlete" ? "active" : ""}`}
        onClick={() => onChange("athlete")}
      >
        Atleta
      </button>
      <button
        type="button"
        className={`ap-view-btn ${mode === "coach" ? "active" : ""}`}
        onClick={() => onChange("coach")}
      >
        Coach
      </button>
    </div>
  );
}

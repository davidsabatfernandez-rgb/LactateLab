export type TimeRange = "7d" | "30d" | "90d";

type TimeRangeSelectorProps = {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
};

const OPTIONS: TimeRange[] = ["7d", "30d", "90d"];

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="ap-range-pills">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={`ap-range-pill ${value === option ? "active" : ""}`}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

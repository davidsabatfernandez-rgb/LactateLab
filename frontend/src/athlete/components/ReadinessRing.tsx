type ReadinessRingProps = {
  score: number;
  label: string;
  tone: string;
  title: string;
  size?: "small" | "large";
  subtitle?: string;
};

export function ReadinessRing({ score, label, tone, title, size = "large", subtitle }: ReadinessRingProps) {
  const isLarge = size === "large";
  const r = isLarge ? 54 : 36;
  const strokeWidth = isLarge ? 5 : 4.5;
  const viewBox = isLarge ? 124 : 84;
  const cx = viewBox / 2;
  const cy = viewBox / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const svgSize = isLarge ? 124 : 76;

  return (
    <div className={`ath-ring-block ${isLarge ? "main" : ""}`}>
      <span className="ath-ring-title">{title}</span>
      <div className={`ath-ring-wrap ${isLarge ? "" : "small"}`}>
        <svg viewBox={`0 0 ${viewBox} ${viewBox}`} width={svgSize} height={svgSize}>
          <circle className="ath-ring-track" cx={cx} cy={cy} r={r} strokeWidth={strokeWidth} />
          <circle
            className={`ath-ring-fill ${tone}`}
            cx={cx} cy={cy} r={r}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${offset}`}
          />
        </svg>
        <span className={`ath-ring-value ${isLarge ? "" : "small"}`}>{score}</span>
      </div>
      <span className={`ath-ring-label ${tone}`}>{label}</span>
      {subtitle && <span className="ath-ring-subtitle">{subtitle}</span>}
    </div>
  );
}

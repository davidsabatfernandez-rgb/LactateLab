import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
} from "recharts";

type DataPoint = {
  hr: number;
  lactate: number;
  contextual_lactate?: number | null;
  is_peak?: boolean;
};

type OverlayChip = {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber" | "neutral";
};

type RefLine = {
  label: string;
  x: number;
  color: string;
  dashed?: boolean;
};

type SimpleLactateCurveProps = {
  lt1Hr: number | null;
  lt2Hr: number | null;
  maxHr: number | null;
  dataPoints?: DataPoint[];
  overlays?: OverlayChip[];
  references?: RefLine[];
  peakLactate?: number | null;
  xLabel?: string;
};

/** Generate a realistic exponential lactate curve from HR landmarks. */
function generateMockCurve(
  lt1Hr: number,
  lt2Hr: number,
  maxHr: number
): DataPoint[] {
  const minHr = Math.round(lt1Hr - 30);
  const points: DataPoint[] = [];
  const steps = 12;
  const hrStep = (maxHr - minHr) / (steps - 1);

  for (let i = 0; i < steps; i++) {
    const hr = Math.round(minHr + i * hrStep);
    let lactate: number;
    if (hr <= lt1Hr) {
      lactate = 0.8 + 0.4 * ((hr - minHr) / (lt1Hr - minHr));
    } else if (hr <= lt2Hr) {
      const t = (hr - lt1Hr) / (lt2Hr - lt1Hr);
      lactate = 1.2 + t * 2.0 + t * t * 0.8;
    } else {
      const t = (hr - lt2Hr) / (maxHr - lt2Hr);
      lactate = 4.0 + t * 4.0 + t * t * 2.5;
    }
    lactate = Math.round((lactate + (Math.random() - 0.5) * 0.15) * 100) / 100;
    points.push({ hr, lactate: Math.max(0.5, lactate) });
  }
  return points;
}

function CurveTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DataPoint;
  return (
    <div className="ath-curve-tooltip">
      <span className="ath-curve-tooltip-hr">{d.hr} bpm</span>
      <span className="ath-curve-tooltip-lac">{d.lactate.toFixed(2)} mmol/L</span>
      {d.contextual_lactate != null && (
        <span className="ath-curve-tooltip-ctx">{d.contextual_lactate.toFixed(2)} mmol/L ctx</span>
      )}
    </div>
  );
}

function PeakDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload?.is_peak) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill="#b84a14" stroke="white" strokeWidth={2} opacity={0.9} />
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={10} fill="#b84a14" fontWeight={600}>
        {payload.lactate.toFixed(1)}
      </text>
    </g>
  );
}

export function SimpleLactateCurve({
  lt1Hr,
  lt2Hr,
  maxHr,
  dataPoints,
  overlays = [],
  references = [],
  peakLactate,
  xLabel = "FC (bpm)",
}: SimpleLactateCurveProps) {
  const effectiveLt1 = lt1Hr ?? 140;
  const effectiveLt2 = lt2Hr ?? 165;
  const effectiveMax = maxHr ?? 190;

  const data = useMemo(() => {
    if (dataPoints && dataPoints.length >= 3) return dataPoints;
    return generateMockCurve(effectiveLt1, effectiveLt2, effectiveMax);
  }, [dataPoints, effectiveLt1, effectiveLt2, effectiveMax]);

  const hasContextual = data.some((d) => d.contextual_lactate != null);
  const hrMin = Math.min(...data.map((d) => d.hr));
  const hrMax = Math.max(...data.map((d) => d.hr));
  const lacMax = Math.max(...data.map((d) => d.lactate));

  return (
    <div className="ath-curve-wrap">
      {/* Overlay chips */}
      {overlays.length > 0 && (
        <div className="ath-curve-overlays">
          {overlays.map((o) => (
            <span key={o.label} className={`ath-curve-chip ath-curve-chip--${o.tone ?? "neutral"}`}>
              <span className="ath-curve-chip__label">{o.label}</span>
              <span className="ath-curve-chip__value">{o.value}</span>
            </span>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={data}
          margin={{ top: 12, right: 16, bottom: 4, left: -8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--ath-border)"
            vertical={false}
          />

          {/* Zone coloring */}
          <ReferenceArea x1={hrMin} x2={effectiveLt1} fill="var(--ath-green)" fillOpacity={0.06} />
          <ReferenceArea x1={effectiveLt1} x2={effectiveLt2} fill="var(--ath-amber)" fillOpacity={0.06} />
          <ReferenceArea x1={effectiveLt2} x2={hrMax} fill="var(--ath-red)" fillOpacity={0.06} />

          {/* LT1 line */}
          <ReferenceLine
            x={effectiveLt1}
            stroke="var(--ath-green)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: "LT1", position: "top", fill: "var(--ath-green)", fontSize: 11, fontWeight: 600 }}
          />

          {/* LT2 line */}
          <ReferenceLine
            x={effectiveLt2}
            stroke="var(--ath-red)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: "LT2", position: "top", fill: "var(--ath-red)", fontSize: 11, fontWeight: 600 }}
          />

          {/* Extra reference lines (dynamic thresholds, real thresholds) */}
          {references.map((ref) => (
            <ReferenceLine
              key={ref.label}
              x={ref.x}
              stroke={ref.color}
              strokeWidth={1.5}
              strokeDasharray={ref.dashed !== false ? "4 3" : undefined}
              label={{ value: ref.label, position: "top", fill: ref.color, fontSize: 10, fontWeight: 500 }}
            />
          ))}

          {/* Peak lactate horizontal line */}
          {peakLactate != null && (
            <ReferenceLine
              y={peakLactate}
              stroke="#b84a14"
              strokeWidth={1}
              strokeDasharray="3 3"
              label={{ value: `Pico ${peakLactate.toFixed(1)}`, position: "insideTopRight", fontSize: 10, fill: "#b84a14" }}
            />
          )}

          <XAxis
            dataKey="hr"
            type="number"
            domain={[hrMin, hrMax]}
            tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--ath-border)" }}
            label={{ value: xLabel, position: "insideBottomRight", offset: -2, fontSize: 10, fill: "var(--ath-text-muted)" }}
          />

          <YAxis
            domain={[0, Math.ceil(lacMax + 1)]}
            tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={36}
            label={{ value: "Lactato (mmol/L)", angle: -90, position: "insideLeft", offset: 14, fontSize: 10, fill: "var(--ath-text-muted)" }}
          />

          <Tooltip content={<CurveTooltip />} />

          {/* Measured lactate */}
          <Line
            type="monotone"
            dataKey="lactate"
            stroke="var(--ath-text)"
            strokeWidth={2.5}
            name="Lactato medido"
            dot={<PeakDot />}
            activeDot={{ r: 5, fill: "var(--ath-accent)", stroke: "var(--ath-bg-card)", strokeWidth: 2 }}
          />

          {/* Contextual lactate */}
          {hasContextual && (
            <Line
              type="monotone"
              dataKey="contextual_lactate"
              stroke="#d26a36"
              strokeWidth={2}
              strokeDasharray="4 2"
              name="Lactato contextual"
              dot={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="ath-curve-legend">
        <span className="ath-curve-legend__item">
          <span className="ath-curve-legend__dot" style={{ background: "var(--ath-text)" }} />
          Lactato medido
        </span>
        {hasContextual && (
          <span className="ath-curve-legend__item">
            <span className="ath-curve-legend__dot" style={{ background: "#d26a36" }} />
            Lactato contextual
          </span>
        )}
        {peakLactate != null && (
          <span className="ath-curve-legend__item">
            <span className="ath-curve-legend__dot" style={{ background: "#b84a14", borderRadius: "50%" }} />
            Pico lactato
          </span>
        )}
      </div>

      {!dataPoints && (
        <p className="ath-curve-mock-label">
          Curva estimada — se actualizará con tus datos reales
        </p>
      )}
    </div>
  );
}

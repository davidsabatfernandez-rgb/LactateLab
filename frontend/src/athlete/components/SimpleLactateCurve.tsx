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
};

type SimpleLactateCurveProps = {
  lt1Hr: number | null;
  lt2Hr: number | null;
  maxHr: number | null;
  dataPoints?: DataPoint[];
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
    // Piecewise model: flat baseline until LT1, gentle rise to LT2, steep after
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
    // Add tiny jitter for realism
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
      <span className="ath-curve-tooltip-lac">{d.lactate.toFixed(1)} mmol/L</span>
    </div>
  );
}

export function SimpleLactateCurve({
  lt1Hr,
  lt2Hr,
  maxHr,
  dataPoints,
}: SimpleLactateCurveProps) {
  const effectiveLt1 = lt1Hr ?? 140;
  const effectiveLt2 = lt2Hr ?? 165;
  const effectiveMax = maxHr ?? 190;

  const data = useMemo(() => {
    if (dataPoints && dataPoints.length >= 3) return dataPoints;
    return generateMockCurve(effectiveLt1, effectiveLt2, effectiveMax);
  }, [dataPoints, effectiveLt1, effectiveLt2, effectiveMax]);

  const hrMin = Math.min(...data.map((d) => d.hr));
  const hrMax = Math.max(...data.map((d) => d.hr));
  const lacMax = Math.max(...data.map((d) => d.lactate));

  return (
    <div className="ath-curve-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={data}
          margin={{ top: 12, right: 16, bottom: 4, left: -8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--ath-border)"
            vertical={false}
          />

          {/* Zone 1: below LT1 — green subtle */}
          <ReferenceArea
            x1={hrMin}
            x2={effectiveLt1}
            fill="var(--ath-green)"
            fillOpacity={0.06}
          />

          {/* Zone 2: LT1 to LT2 — amber subtle */}
          <ReferenceArea
            x1={effectiveLt1}
            x2={effectiveLt2}
            fill="var(--ath-amber)"
            fillOpacity={0.06}
          />

          {/* Zone 3: above LT2 — red subtle */}
          <ReferenceArea
            x1={effectiveLt2}
            x2={hrMax}
            fill="var(--ath-red)"
            fillOpacity={0.06}
          />

          {/* LT1 line */}
          <ReferenceLine
            x={effectiveLt1}
            stroke="var(--ath-green)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: "LT1",
              position: "top",
              fill: "var(--ath-green)",
              fontSize: 11,
              fontWeight: 600,
            }}
          />

          {/* LT2 line */}
          <ReferenceLine
            x={effectiveLt2}
            stroke="var(--ath-red)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: "LT2",
              position: "top",
              fill: "var(--ath-red)",
              fontSize: 11,
              fontWeight: 600,
            }}
          />

          <XAxis
            dataKey="hr"
            type="number"
            domain={[hrMin, hrMax]}
            tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--ath-border)" }}
            label={{
              value: "FC (bpm)",
              position: "insideBottomRight",
              offset: -2,
              fontSize: 10,
              fill: "var(--ath-text-muted)",
            }}
          />

          <YAxis
            domain={[0, Math.ceil(lacMax + 1)]}
            tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={36}
            label={{
              value: "Lactato",
              angle: -90,
              position: "insideLeft",
              offset: 14,
              fontSize: 10,
              fill: "var(--ath-text-muted)",
            }}
          />

          <Tooltip content={<CurveTooltip />} />

          <Line
            type="monotone"
            dataKey="lactate"
            stroke="var(--ath-text)"
            strokeWidth={2.5}
            dot={{
              r: 3.5,
              fill: "var(--ath-bg-card)",
              stroke: "var(--ath-text)",
              strokeWidth: 2,
            }}
            activeDot={{
              r: 5,
              fill: "var(--ath-accent)",
              stroke: "var(--ath-bg-card)",
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>

      {!dataPoints && (
        <p className="ath-curve-mock-label">
          Curva estimada — se actualizará con tus datos reales
        </p>
      )}
    </div>
  );
}

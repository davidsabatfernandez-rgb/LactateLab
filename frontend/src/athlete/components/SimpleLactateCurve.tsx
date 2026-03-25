import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
} from "recharts";

type DataPoint = {
  xVal: number;       // generic X value (pace s/km, power W, or HR bpm)
  hr?: number | null;
  lactate: number;
  contextual_lactate?: number | null;
  is_peak?: boolean;
};

export type ScatterPoint = {
  xVal: number;
  hr?: number | null;
  lactate: number;
  session_date: string;
  session_id: number;
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
  lt1X: number | null;
  lt2X: number | null;
  maxX?: number | null;
  dataPoints?: DataPoint[];
  overlays?: OverlayChip[];
  references?: RefLine[];
  peakLactate?: number | null;
  xLabel?: string;
  xAxisKey?: string;
  reversed?: boolean;           // true for pace (high value = slow = left)
  xTickFormatter?: (v: number) => string;
  scatterPoints?: ScatterPoint[];
  realLt1X?: number | null;
  realLt2X?: number | null;
  // Legacy HR-based props (mapped internally)
  lt1Hr?: number | null;
  lt2Hr?: number | null;
  maxHr?: number | null;
  realLt1Hr?: number | null;
  realLt2Hr?: number | null;
};

/** Generate a realistic exponential lactate curve from landmarks. */
function generateMockCurve(
  lt1: number,
  lt2: number,
  max: number,
  reversed: boolean,
): DataPoint[] {
  const minVal = reversed ? max : Math.round(lt1 - 30);
  const maxVal = reversed ? Math.round(lt1 + 30) : max;
  const points: DataPoint[] = [];
  const steps = 12;
  const step = (maxVal - minVal) / (steps - 1);

  for (let i = 0; i < steps; i++) {
    const x = Math.round(minVal + i * step);
    // For reversed (pace), lower x = faster = higher lactate
    const effectiveX = reversed ? maxVal - (x - minVal) : x;
    const eLt1 = reversed ? maxVal - (lt1 - minVal) : lt1;
    const eLt2 = reversed ? maxVal - (lt2 - minVal) : lt2;
    const eMax = reversed ? 0 : max;
    let lactate: number;
    if (effectiveX <= eLt1) {
      lactate = 0.8 + 0.4 * ((effectiveX - (reversed ? 0 : minVal)) / Math.abs(eLt1 - (reversed ? 0 : minVal)) || 1);
    } else if (effectiveX <= eLt2) {
      const t = (effectiveX - eLt1) / (eLt2 - eLt1 || 1);
      lactate = 1.2 + t * 2.0 + t * t * 0.8;
    } else {
      const t = (effectiveX - eLt2) / ((reversed ? maxVal : eMax) - eLt2 || 1);
      lactate = 4.0 + t * 4.0 + t * t * 2.5;
    }
    lactate = Math.round((lactate + (Math.random() - 0.5) * 0.15) * 100) / 100;
    points.push({ xVal: x, lactate: Math.max(0.5, lactate) });
  }
  return points;
}

function CurveTooltip({ active, payload, xFormatter }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const lac = d.lactate ?? d.scatterLactate;
  if (typeof lac !== "number") return null;
  const xDisp = xFormatter ? xFormatter(d.xVal) : `${d.xVal}`;
  const hrDisp = typeof d.hr === "number" ? `${Math.round(d.hr)} bpm` : null;
  if (d._isScatter) {
    return (
      <div className="ath-curve-tooltip">
        <span className="ath-curve-tooltip-hr">{xDisp}</span>
        {hrDisp && <span className="ath-curve-tooltip-ctx">{hrDisp}</span>}
        <span className="ath-curve-tooltip-lac">{lac.toFixed(2)} mmol/L</span>
        <span className="ath-curve-tooltip-ctx" style={{ opacity: 0.7, fontSize: 10 }}>{d.session_date}</span>
      </div>
    );
  }
  return (
    <div className="ath-curve-tooltip">
      <span className="ath-curve-tooltip-hr">{xDisp}</span>
      {hrDisp && <span className="ath-curve-tooltip-ctx">{hrDisp}</span>}
      <span className="ath-curve-tooltip-lac">{lac.toFixed(2)} mmol/L</span>
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

function ScatterDot(props: any) {
  const { cx, cy } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  return (
    <circle cx={cx} cy={cy} r={4} fill="var(--ath-accent, #6366f1)" fillOpacity={0.25} stroke="var(--ath-accent, #6366f1)" strokeWidth={0.7} strokeOpacity={0.4} />
  );
}

export function SimpleLactateCurve({
  lt1X: lt1XProp,
  lt2X: lt2XProp,
  maxX: maxXProp,
  dataPoints,
  overlays = [],
  references = [],
  peakLactate,
  xLabel = "FC (bpm)",
  xAxisKey = "xVal",
  reversed = false,
  xTickFormatter,
  scatterPoints = [],
  realLt1X: realLt1XProp,
  realLt2X: realLt2XProp,
  // Legacy HR props
  lt1Hr,
  lt2Hr,
  maxHr,
  realLt1Hr,
  realLt2Hr,
}: SimpleLactateCurveProps) {
  // Resolve: prefer new generic props, fall back to legacy HR props
  const lt1Val = lt1XProp ?? lt1Hr ?? 140;
  const lt2Val = lt2XProp ?? lt2Hr ?? 165;
  const maxVal = maxXProp ?? maxHr ?? 190;
  const realLt1Val = realLt1XProp ?? realLt1Hr ?? null;
  const realLt2Val = realLt2XProp ?? realLt2Hr ?? null;

  const data = useMemo(() => {
    if (dataPoints && dataPoints.length >= 3) {
      // Group points by xVal and average lactate to remove staircase artifacts
      const grouped = new Map<number, { lactates: number[]; ctxs: number[]; peak: boolean }>();
      for (const p of dataPoints) {
        const key = p.xVal;
        const g = grouped.get(key) ?? { lactates: [], ctxs: [], peak: false };
        g.lactates.push(p.lactate);
        if (typeof p.contextual_lactate === "number") g.ctxs.push(p.contextual_lactate);
        if (p.is_peak) g.peak = true;
        grouped.set(key, g);
      }
      const smoothed: DataPoint[] = [];
      for (const [xv, g] of grouped) {
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        smoothed.push({
          xVal: xv,
          lactate: Math.round(avg(g.lactates) * 100) / 100,
          contextual_lactate: g.ctxs.length ? Math.round(avg(g.ctxs) * 100) / 100 : undefined,
          is_peak: g.peak,
        });
      }
      return smoothed.sort((a, b) => reversed ? b.xVal - a.xVal : a.xVal - b.xVal);
    }
    return generateMockCurve(lt1Val, lt2Val, maxVal, reversed);
  }, [dataPoints, lt1Val, lt2Val, maxVal, reversed]);

  const mergedData = useMemo(() => {
    const main = data.map((d) => ({ ...d, _isScatter: false }));
    const scatter = scatterPoints.map((s) => ({
      xVal: s.xVal,
      hr: s.hr ?? null,
      lactate: undefined as number | undefined,
      scatterLactate: s.lactate,
      session_date: s.session_date,
      session_id: s.session_id,
      _isScatter: true,
    }));
    // Build faded background curve from scatter points sorted by load
    const scatterCurve = [...scatterPoints]
      .sort((a, b) => reversed ? b.xVal - a.xVal : a.xVal - b.xVal)
      .map((s) => ({ xVal: s.xVal, bgLactate: s.lactate }));
    return { main, scatter, scatterCurve };
  }, [data, scatterPoints, reversed]);

  const hasContextual = data.some((d) => d.contextual_lactate != null);

  const allXs = [...data.map((d) => d.xVal), ...scatterPoints.map((s) => s.xVal)];
  const allLactates = [...data.map((d) => d.lactate), ...scatterPoints.map((s) => s.lactate)];
  const xMin = allXs.length ? Math.min(...allXs) : 100;
  const xMax = allXs.length ? Math.max(...allXs) : 200;
  const lacMax = allLactates.length ? Math.max(...allLactates) : 8;

  const hasScatter = scatterPoints.length > 0;
  const hasRealLt1 = typeof realLt1Val === "number";
  const hasRealLt2 = typeof realLt2Val === "number";

  // For reversed (pace), domain goes high→low so curve rises left→right
  const domain: [number, number] = reversed ? [xMax, xMin] : [xMin, xMax];

  // Zone boundaries: for reversed axis, lt1 > lt2 in value (slower pace)
  const zoneStart = reversed ? xMax : xMin;
  const zoneEnd = reversed ? xMin : xMax;

  return (
    <div className="ath-curve-wrap">
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

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart margin={{ top: 12, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--ath-border)"
            vertical={false}
          />

          {/* Zone coloring */}
          <ReferenceArea x1={zoneStart} x2={lt1Val} fill="var(--ath-green)" fillOpacity={0.06} />
          <ReferenceArea x1={lt1Val} x2={lt2Val} fill="var(--ath-amber)" fillOpacity={0.06} />
          <ReferenceArea x1={lt2Val} x2={zoneEnd} fill="var(--ath-red)" fillOpacity={0.06} />

          {/* LT1 line */}
          <ReferenceLine
            x={lt1Val}
            stroke="var(--ath-green)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: "LT1", position: "top", fill: "var(--ath-green)", fontSize: 11, fontWeight: 600 }}
          />

          {/* LT2 line */}
          <ReferenceLine
            x={lt2Val}
            stroke="var(--ath-red)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: "LT2", position: "top", fill: "var(--ath-red)", fontSize: 11, fontWeight: 600 }}
          />

          {hasRealLt1 && (
            <ReferenceLine
              x={realLt1Val!}
              stroke="#166534"
              strokeDasharray="3 2"
              strokeWidth={1.2}
              label={{ value: "LT1r", position: "insideTopLeft", fill: "#166534", fontSize: 9, fontWeight: 500 }}
            />
          )}

          {hasRealLt2 && (
            <ReferenceLine
              x={realLt2Val!}
              stroke="#9a3412"
              strokeDasharray="3 2"
              strokeWidth={1.2}
              label={{ value: "LT2r", position: "insideTopRight", fill: "#9a3412", fontSize: 9, fontWeight: 500 }}
            />
          )}

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
            dataKey={xAxisKey}
            type="number"
            domain={domain}
            reversed={reversed}
            tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--ath-border)" }}
            label={{ value: xLabel, position: "insideBottomRight", offset: -2, fontSize: 10, fill: "var(--ath-text-muted)" }}
            allowDuplicatedCategory={false}
            tickFormatter={xTickFormatter}
          />

          <YAxis
            yAxisId={0}
            domain={[0, Math.ceil(lacMax + 1)]}
            tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={36}
            label={{ value: "Lactato (mmol/L)", angle: -90, position: "insideLeft", offset: 14, fontSize: 10, fill: "var(--ath-text-muted)" }}
          />

          <Tooltip content={<CurveTooltip xFormatter={xTickFormatter} />} />

          {/* Background curve from all scatter measurements */}
          {hasScatter && mergedData.scatterCurve.length >= 2 && (
            <Line
              data={mergedData.scatterCurve}
              type="natural"
              dataKey="bgLactate"
              yAxisId={0}
              stroke="var(--ath-accent, #6366f1)"
              strokeWidth={2}
              strokeOpacity={0.15}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              name="_bg"
              legendType="none"
            />
          )}

          {hasScatter && (
            <Scatter
              data={mergedData.scatter}
              dataKey="scatterLactate"
              yAxisId={0}
              shape={<ScatterDot />}
              isAnimationActive={false}
            />
          )}

          <Line
            data={mergedData.main}
            type="natural"
            dataKey="lactate"
            yAxisId={0}
            stroke="var(--ath-text)"
            strokeWidth={2.5}
            name="Lactato medido"
            dot={<PeakDot />}
            activeDot={{ r: 5, fill: "var(--ath-accent)", stroke: "var(--ath-bg-card)", strokeWidth: 2 }}
          />

          {hasContextual && (
            <Line
              data={mergedData.main}
              type="natural"
              dataKey="contextual_lactate"
              yAxisId={0}
              stroke="#d26a36"
              strokeWidth={2}
              strokeDasharray="4 2"
              name="Lactato contextual"
              dot={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

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
        {hasScatter && (
          <span className="ath-curve-legend__item">
            <span className="ath-curve-legend__dot" style={{ background: "var(--ath-accent, #6366f1)", opacity: 0.35, borderRadius: "50%" }} />
            Muestras acumuladas
          </span>
        )}
        {hasRealLt1 && (
          <span className="ath-curve-legend__item">
            <span className="ath-curve-legend__dot" style={{ background: "#166534" }} />
            LT1 real
          </span>
        )}
        {hasRealLt2 && (
          <span className="ath-curve-legend__item">
            <span className="ath-curve-legend__dot" style={{ background: "#9a3412" }} />
            LT2 real
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

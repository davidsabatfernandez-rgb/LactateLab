import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CurvePoint } from "../types";

type ChartOverlay = {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
};

type ChartReference = {
  label: string;
  value: number;
  color: string;
  strokeDasharray?: string;
};

type CurveChartProps = {
  title: string;
  data: CurvePoint[];
  xLabel: string;
  overlays?: ChartOverlay[];
  references?: ChartReference[];
  peakLactate?: number;
};

function PeakDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload?.is_peak) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="#b84a14" stroke="white" strokeWidth={2} opacity={0.9} />
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize={10} fill="#b84a14" fontWeight={600}>
        {payload.lactate} mmol
      </text>
    </g>
  );
}

export function CurveChart({ title, data, xLabel, overlays = [], references = [], peakLactate }: CurveChartProps) {
  return (
    <article className="card chart-card">
      <div className="card-header">
        <div>
          <h3>{title}</h3>
          <p>{xLabel}</p>
        </div>
        {overlays.length ? (
          <div className="chart-overlay-list">
            {overlays.map((overlay) => (
              <span key={`${overlay.label}-${overlay.value}`} className={`chart-overlay-chip ${overlay.tone ?? "neutral"}`}>
                {overlay.label}: {overlay.value}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(11, 29, 38, 0.1)" />
          <XAxis type="number" dataKey="x" domain={["dataMin", "dataMax"]} reversed={xLabel.toLowerCase().includes("ritmo")} />
          <YAxis />
          <Tooltip />
          {references.map((reference) => (
            <ReferenceLine
              key={`${reference.label}-${reference.value}`}
              x={reference.value}
              stroke={reference.color}
              strokeWidth={2}
              strokeDasharray={reference.strokeDasharray ?? "6 4"}
            />
          ))}
          {peakLactate != null && (
            <ReferenceLine
              y={peakLactate}
              stroke="#b84a14"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={{ value: `Pico ${peakLactate} mmol`, position: "insideTopRight", fontSize: 11, fill: "#b84a14" }}
            />
          )}
          <Line
            type="monotone"
            dataKey="lactate"
            stroke="#1d5c63"
            strokeWidth={2}
            name="Lactato medido"
            dot={<PeakDot />}
            activeDot={{ r: 5 }}
          />
          <Line type="monotone" dataKey="contextual_lactate" stroke="#d26a36" strokeWidth={2} name="Lactato contextual" dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="chart-meta-legend">
        <span className="chart-meta-item">
          <span className="chart-meta-dot measured" />
          Lactato medido
        </span>
        <span className="chart-meta-item">
          <span className="chart-meta-dot contextual" />
          Lactato contextual
        </span>
        {peakLactate != null && (
          <span className="chart-meta-item">
            <span className="chart-meta-dot" style={{ background: "#b84a14", borderRadius: "50%" }} />
            Pico lactato (VLaMax proxy)
          </span>
        )}
        {references.map((reference) => (
          <span key={`legend-${reference.label}-${reference.value}`} className="chart-meta-item">
            <span
              className="chart-meta-line"
              style={{
                color: reference.color,
                borderTopStyle: reference.strokeDasharray ? "dashed" : "solid",
              }}
            />
            {reference.label}
          </span>
        ))}
      </div>
    </article>
  );
}

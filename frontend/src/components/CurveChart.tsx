import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CurvePoint } from "../types";

type ChartOverlay = {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
};

type CurveChartProps = {
  title: string;
  data: CurvePoint[];
  xLabel: string;
  overlays?: ChartOverlay[];
};

export function CurveChart({ title, data, xLabel, overlays = [] }: CurveChartProps) {
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
          <XAxis dataKey="x" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="lactate" stroke="#1d5c63" strokeWidth={2} name="Lactato medido" />
          <Line type="monotone" dataKey="contextual_lactate" stroke="#d26a36" strokeWidth={2} name="Lactato contextual" />
        </LineChart>
      </ResponsiveContainer>
    </article>
  );
}

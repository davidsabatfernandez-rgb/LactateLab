import { CurveChart } from "../components/CurveChart";
import { SessionAnalysis } from "../types";

function formatPace(seconds?: number | null) {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}/km`;
}

type SessionDetailPageProps = {
  analysis: SessionAnalysis | null;
};

export function SessionDetailPage({ analysis }: SessionDetailPageProps) {
  if (!analysis) {
    return <div className="loading">Cargando sesión...</div>;
  }

  const lt2 = analysis.thresholds.find((threshold) => threshold.name === "LT2");
  const lt1 = analysis.thresholds.find((threshold) => threshold.name === "LT1");
  const thresholdValue = (threshold: typeof lt1) =>
    analysis.session.discipline === "ciclismo"
      ? `${threshold?.power_watts ? `${Math.round(threshold.power_watts)} W` : "-"} · ${threshold?.heart_rate ?? "-"} bpm`
      : `${formatPace(threshold?.pace_seconds_per_km)} · ${threshold?.heart_rate ?? "-"} bpm`;
  const anaerobicValue =
    analysis.session.discipline === "ciclismo"
      ? `${lt2?.power_watts ? `${Math.round(lt2.power_watts)} W` : "-"} · ${lt2?.heart_rate ?? "-"} bpm`
      : `${formatPace(lt2?.pace_seconds_per_km)} · ${lt2?.heart_rate ?? "-"} bpm`;
  const chartOverlays = [
    { label: "LT1", value: thresholdValue(lt1), tone: "positive" as const },
    { label: "LT2", value: thresholdValue(lt2), tone: "negative" as const },
    { label: "VO2max", value: "n/d", tone: "neutral" as const },
    { label: "VLAMAX", value: "n/d", tone: "warning" as const },
  ];

  return (
    <div className="page-grid">
      <section className="hero card">
        <div>
          <span className="eyebrow">{analysis.session.discipline}</span>
          <h1>{analysis.session.session_type}</h1>
          <p>{analysis.session.goal}</p>
        </div>
      </section>
      <section className="charts-grid">
        <CurveChart title="Lactato vs ritmo" data={analysis.curve_by_pace} xLabel="Ritmo" overlays={chartOverlays} peakLactate={analysis.peak_lactate?.lactate_mmol} />
        <CurveChart title="Lactato vs potencia" data={analysis.curve_by_power} xLabel="Potencia" overlays={chartOverlays} peakLactate={analysis.peak_lactate?.lactate_mmol} />
        <CurveChart title="Lactato vs FC" data={analysis.curve_by_hr} xLabel="FC" overlays={chartOverlays} peakLactate={analysis.peak_lactate?.lactate_mmol} />
      </section>
      <section className="card split-card">
        <div>
          <h2>Interpretación</h2>
          <div className="list">
            {analysis.interpretation.map((comment) => (
              <div key={comment} className="list-item">
                <p>{comment}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2>Confianza</h2>
          <div className="list">
            {analysis.confidence_summary.map((item) => (
              <div key={item.label} className="list-item">
                <strong>{item.label}</strong>
                <p>{Math.round(item.score * 100)}% · {item.level}</p>
                <p>{item.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card split-card">
        <div>
          <h2>Umbrales detectados</h2>
          <div className="list">
            {analysis.thresholds.map((threshold) => (
              <div key={threshold.name} className="list-item">
                <strong>{threshold.name}</strong>
                <p>Método principal: {threshold.method}</p>
                <p>Acuerdo: {Math.round(threshold.agreement_score * 100)}%</p>
                <p>{threshold.rationale}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2>Evolución histórica</h2>
          <div className="list">
            <div className="list-item">
              <p>La sesión queda preparada para superponerse con snapshots históricos del atleta y comparar el mismo lactato a distinta carga.</p>
            </div>
            {analysis.contextual_details.slice(0, 3).map((detail) => (
              <div key={detail.interval_id} className="list-item">
                <strong>Bloque {detail.order_index}</strong>
                <p>{detail.measured_lactate.toFixed(1)} → {detail.contextual_lactate.toFixed(1)} mmol/L</p>
                <p>{detail.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

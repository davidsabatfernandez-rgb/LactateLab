import { CurveChart } from "../components/CurveChart";
import { resolveTrainingThreshold } from "../lib/trainingThresholds";
import { SessionAnalysis } from "../types";

function formatPace(seconds?: number | null) {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}/km`;
}

function disciplineBadgeClass(value: string) {
  if (value === "natación") return "rd-disc-swim";
  if (value === "ciclismo") return "rd-disc-bike";
  if (value === "triatlón") return "rd-disc-tri";
  return "rd-disc-run";
}

type SessionDetailPageProps = {
  analysis: SessionAnalysis | null;
};

export function SessionDetailPage({ analysis }: SessionDetailPageProps) {
  if (!analysis) {
    return (
      <div className="rd-page">
        <div className="rd-page-header">
          <div className="rd-page-header-left">
            <h1 className="rd-page-title">Cargando sesion...</h1>
          </div>
        </div>
      </div>
    );
  }

  const lt2 = resolveTrainingThreshold(analysis, "LT2");
  const lt1 = resolveTrainingThreshold(analysis, "LT1");
  const thresholdValue = (threshold: typeof lt1) =>
    analysis.session.discipline === "ciclismo"
      ? `${threshold?.powerWatts ? `${Math.round(threshold.powerWatts)} W` : "-"} · ${threshold?.heartRate ?? "-"} bpm`
      : `${formatPace(threshold?.paceSecondsPerKm)} · ${threshold?.heartRate ?? "-"} bpm`;
  const chartOverlays = [
    { label: "LT1", value: `${thresholdValue(lt1)} · ${lt1?.sourceLabel ?? "Sin ancla"}`, tone: "positive" as const },
    { label: "LT2", value: `${thresholdValue(lt2)} · ${lt2?.sourceLabel ?? "Sin ancla"}`, tone: "negative" as const },
    { label: "VO2max", value: "n/d", tone: "neutral" as const },
    { label: "VLAMAX", value: analysis.measured_vlamax ? `${analysis.measured_vlamax.vlamax_mmol_min} mmol/L/s${analysis.measured_vlamax.sprint_protocol ? ` (${analysis.measured_vlamax.sprint_protocol})` : ""}` : "n/d", tone: "warning" as const },
  ];

  return (
    <div className="rd-page">
      {/* Hero */}
      <div className="sd-hero">
        <span className={`rd-disc-badge ${disciplineBadgeClass(analysis.session.discipline)}`}>
          {analysis.session.discipline}
        </span>
        <div className="sd-hero-info">
          <h1>{analysis.session.session_type}</h1>
          <p>{analysis.session.goal}</p>
        </div>
        <div className="sd-threshold-overlays">
          {chartOverlays.map((overlay) => (
            <span key={overlay.label} className={`sd-overlay-chip ${overlay.tone}`}>
              {overlay.label}: {overlay.value}
            </span>
          ))}
        </div>
      </div>

      {/* Charts grid */}
      <div className="sd-charts-grid">
        <div className="sd-chart-card">
          <h3>Lactato vs ritmo</h3>
          <CurveChart title="" data={analysis.curve_by_pace} xLabel="Ritmo" overlays={chartOverlays} peakLactate={analysis.peak_lactate?.lactate_mmol} />
        </div>
        <div className="sd-chart-card">
          <h3>Lactato vs potencia</h3>
          <CurveChart title="" data={analysis.curve_by_power} xLabel="Potencia" overlays={chartOverlays} peakLactate={analysis.peak_lactate?.lactate_mmol} />
        </div>
        <div className="sd-chart-card">
          <h3>Lactato vs FC</h3>
          <CurveChart title="" data={analysis.curve_by_hr} xLabel="FC" overlays={chartOverlays} peakLactate={analysis.peak_lactate?.lactate_mmol} />
        </div>
      </div>

      {/* Split sections */}
      <div className="sd-split-section">
        <div className="sd-split-card">
          <h2>Interpretacion</h2>
          {(analysis.interpretation ?? []).map((comment) => (
            <div key={comment} className="sd-list-item">
              <p>{comment}</p>
            </div>
          ))}
        </div>
        <div className="sd-split-card">
          <h2>Confianza</h2>
          {(analysis.confidence_summary ?? []).map((item) => (
            <div key={item.label} className="sd-list-item">
              <strong>{item.label}</strong>
              <p>{Math.round(item.score * 100)}% · {item.level}</p>
              <p>{item.explanation}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="sd-split-section">
        <div className="sd-split-card">
          <h2>Umbrales detectados</h2>
          {(analysis.thresholds ?? []).map((threshold) => (
            <div key={threshold.name} className="sd-list-item">
              <strong>{threshold.name}</strong>
              <p>Metodo principal: {threshold.method}</p>
              <p>Acuerdo: {Math.round(threshold.agreement_score * 100)}%</p>
              <p>{threshold.rationale}</p>
            </div>
          ))}
        </div>
        <div className="sd-split-card">
          <h2>Evolucion historica</h2>
          <div className="sd-list-item">
            <p>La sesion queda preparada para superponerse con snapshots historicos del atleta.</p>
          </div>
          {(analysis.contextual_details ?? []).slice(0, 3).map((detail) => (
            <div key={detail.interval_id} className="sd-list-item">
              <strong>Bloque {detail.order_index}</strong>
              <p>{detail.measured_lactate.toFixed(1)} &#8594; {detail.contextual_lactate.toFixed(1)} mmol/L</p>
              <p>{detail.comment}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

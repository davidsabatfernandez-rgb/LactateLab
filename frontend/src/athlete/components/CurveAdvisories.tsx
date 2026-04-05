import { useState, useMemo } from "react";
import type { CurveInsights } from "../../types";
import "./CurveAdvisories.css";

type AiAdvisory = {
  bullets: string[];
  generated_at: string;
} | null;

type CurveAdvisoriesProps = {
  curveInsights: CurveInsights | null;
  latestSnapshotDate: string | null;
  measurementCount: number;
  aiAdvisory?: AiAdvisory;
};

type AdvisoryItem = {
  id: string;
  icon: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
};

function buildAdvisoryItems(
  insights: CurveInsights | null,
  snapshotDate: string | null,
  measurementCount: number,
): AdvisoryItem[] {
  const items: AdvisoryItem[] = [];

  // 1. Curve alerts from engine (8 types)
  if (insights?.curve_alerts) {
    for (const alert of insights.curve_alerts) {
      items.push({
        id: `alert-${alert.code}`,
        icon: alert.severity === "critical" ? "\uD83D\uDD34" : alert.severity === "warning" ? "\u26A0\uFE0F" : "\uD83D\uDCA1",
        severity: (alert.severity as "critical" | "warning" | "info") || "info",
        title: alert.title,
        message: alert.message,
      });
    }
  }

  // 2. Days since last test
  if (snapshotDate) {
    const days = Math.floor((Date.now() - new Date(snapshotDate).getTime()) / 86400000);
    if (days > 90) {
      items.push({
        id: "stale-test-critical",
        icon: "\uD83D\uDD34",
        severity: "critical",
        title: "Test muy antiguo",
        message: `Tu ultima evaluacion fue hace ${days} dias. Los umbrales pueden haber cambiado significativamente. Considera re-testear.`,
      });
    } else if (days > 45) {
      items.push({
        id: "stale-test-warning",
        icon: "\u26A0\uFE0F",
        severity: "warning",
        title: "Considera re-testear",
        message: `Tu ultima evaluacion fue hace ${days} dias. Un nuevo test ayudaria a refinar tus zonas.`,
      });
    }
  }

  // 3. Low measurement count
  if (measurementCount > 0 && measurementCount < 5) {
    items.push({
      id: "low-measurements",
      icon: "\uD83D\uDCA1",
      severity: "info",
      title: "Pocas mediciones",
      message: `Basado en ${measurementCount} medicion${measurementCount === 1 ? "" : "es"}. Con mas datos, las estimaciones seran mas fiables.`,
    });
  }

  // 4. Trainability index
  if (insights?.trainability) {
    const t = insights.trainability;
    const dir = t.direction === "positive" || t.direction === "strong_positive" ? "mejorando"
      : t.direction === "negative" || t.direction === "strong_negative" ? "empeorando" : "estable";
    const icon = dir === "mejorando" ? "\u2705" : dir === "empeorando" ? "\uD83D\uDD3B" : "\u27A1\uFE0F";
    const severity: "info" | "warning" = dir === "empeorando" ? "warning" : "info";
    items.push({
      id: "trainability",
      icon,
      severity,
      title: `Evolucion: ${dir}`,
      message: t.interpretation || `Indice de entrenabilidad: ${dir}`,
    });
  }

  return items;
}

export function CurveAdvisories({ curveInsights, latestSnapshotDate, measurementCount, aiAdvisory }: CurveAdvisoriesProps) {
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(
    () => buildAdvisoryItems(curveInsights, latestSnapshotDate, measurementCount),
    [curveInsights, latestSnapshotDate, measurementCount],
  );

  if (items.length === 0 && !aiAdvisory?.bullets?.length) return null;

  const criticalCount = items.filter((i) => i.severity === "critical").length;
  const warningCount = items.filter((i) => i.severity === "warning").length;
  const infoCount = items.filter((i) => i.severity === "info").length;

  const summaryParts: string[] = [];
  if (criticalCount) summaryParts.push(`${criticalCount} critico${criticalCount > 1 ? "s" : ""}`);
  if (warningCount) summaryParts.push(`${warningCount} aviso${warningCount > 1 ? "s" : ""}`);
  if (infoCount) summaryParts.push(`${infoCount} info`);

  return (
    <div className={`curve-advisories ${expanded ? "expanded" : "collapsed"}`}>
      <button
        type="button"
        className="curve-advisories-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="curve-advisories-badge">
          <span className={`curve-advisories-count ${criticalCount ? "critical" : warningCount ? "warning" : "info"}`}>
            {items.length}
          </span>
          <span className="curve-advisories-summary">
            {summaryParts.join(" \u00B7 ")}
          </span>
        </span>
        <span className="curve-advisories-action">
          {expanded ? "Ocultar" : "Ver analisis"}
        </span>
      </button>

      {expanded && (
        <div className="curve-advisories-list">
          {/* AI narrative block */}
          {aiAdvisory?.bullets && aiAdvisory.bullets.length > 0 && (
            <div className="curve-advisories-ai">
              <span className="curve-advisories-ai-label">Interpretacion IA</span>
              <ul className="curve-advisories-ai-bullets">
                {aiAdvisory.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Rule-based alerts */}
          {items.map((item) => (
            <article key={item.id} className={`curve-advisories-item severity-${item.severity}`}>
              <span className="curve-advisories-item-icon">{item.icon}</span>
              <div className="curve-advisories-item-content">
                <strong className="curve-advisories-item-title">{item.title}</strong>
                <p className="curve-advisories-item-text">{item.message}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

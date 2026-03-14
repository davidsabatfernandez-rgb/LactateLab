import { useState, useMemo } from "react";
import type { PlanningOverview } from "../../types";

type IntelligenceItem = {
  id: string;
  icon: string;
  kind: "warning" | "risk" | "reliability" | "spacing" | "suggestion";
  severity: "info" | "warning" | "critical";
  text: string;
  actionable?: string;
};

type IntelligenceBannerProps = {
  overview: PlanningOverview | null;
};

function collectIntelligenceItems(overview: PlanningOverview | null): IntelligenceItem[] {
  if (!overview) return [];
  const items: IntelligenceItem[] = [];

  // 1. General warnings from overview.warnings
  for (const warning of overview.warnings ?? []) {
    items.push({
      id: `warn-${items.length}`,
      icon: "\u26A0",
      kind: "warning",
      severity: "warning",
      text: warning,
    });
  }

  // 2. Risk flags from next_recommendation
  const rec = overview.next_recommendation;
  if (rec) {
    for (const flag of rec.risk_flags ?? []) {
      items.push({
        id: `risk-${items.length}`,
        icon: "\uD83D\uDD34",
        kind: "risk",
        severity: "critical",
        text: flag,
      });
    }
  }

  // 3. Reliability warnings from physiological_analysis
  const physio = rec?.physiological_analysis;
  if (physio?.reliability_warnings) {
    for (const rw of physio.reliability_warnings) {
      items.push({
        id: `rel-${items.length}`,
        icon: rw.severity === "critical" ? "\uD83D\uDD34" : rw.severity === "warning" ? "\u26A0" : "\uD83D\uDCA1",
        kind: "reliability",
        severity: rw.severity,
        text: rw.message,
        actionable: rw.actionable,
      });
    }
  }

  // 4. Spacing warnings from mesocycle_draft weeks
  if (overview.mesocycle_draft?.weeks) {
    for (const week of overview.mesocycle_draft.weeks) {
      for (const sw of week.spacing_warnings ?? []) {
        items.push({
          id: `spacing-${items.length}`,
          icon: "\u26A0",
          kind: "spacing",
          severity: "warning",
          text: sw,
        });
      }
    }
  }

  return items;
}

export function IntelligenceBanner({ overview }: IntelligenceBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => collectIntelligenceItems(overview), [overview]);

  if (items.length === 0) return null;

  const criticalCount = items.filter((i) => i.severity === "critical").length;
  const warningCount = items.filter((i) => i.severity === "warning").length;
  const infoCount = items.filter((i) => i.severity === "info").length;

  const summaryParts: string[] = [];
  if (criticalCount) summaryParts.push(`${criticalCount} cr\u00EDtico${criticalCount > 1 ? "s" : ""}`);
  if (warningCount) summaryParts.push(`${warningCount} aviso${warningCount > 1 ? "s" : ""}`);
  if (infoCount) summaryParts.push(`${infoCount} info`);

  return (
    <div className={`intelligence-banner ${expanded ? "expanded" : "collapsed"}`}>
      <button
        type="button"
        className="intelligence-banner-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="intelligence-banner-badge">
          <span className={`intelligence-banner-count ${criticalCount ? "critical" : warningCount ? "warning" : "info"}`}>
            {items.length}
          </span>
          <span className="intelligence-banner-summary">
            {summaryParts.join(" \u00B7 ")}
          </span>
        </span>
        <span className="intelligence-banner-action">
          {expanded ? "Ocultar alertas" : "Ver alertas"}
        </span>
      </button>

      {expanded && (
        <div className="intelligence-banner-list">
          {items.map((item) => (
            <article
              key={item.id}
              className={`intelligence-banner-item severity-${item.severity}`}
            >
              <span className="intelligence-banner-item-icon">{item.icon}</span>
              <div className="intelligence-banner-item-content">
                <p className="intelligence-banner-item-text">{item.text}</p>
                {item.actionable ? (
                  <p className="intelligence-banner-item-actionable">{item.actionable}</p>
                ) : null}
              </div>
              <span className={`intelligence-banner-item-tag kind-${item.kind}`}>
                {item.kind === "warning" ? "Aviso" : item.kind === "risk" ? "Riesgo" : item.kind === "reliability" ? "Fiabilidad" : item.kind === "spacing" ? "Spacing" : "Info"}
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

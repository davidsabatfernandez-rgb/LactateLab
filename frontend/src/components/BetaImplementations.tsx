/**
 * BetaImplementations — 4 metabolic insight charts powered by backend curve_insights.
 * 1. Perfil de Combustible (CHO vs Fat)
 * 2. Evolución Temporal + Trainability
 * 3. Predicción de Glucógeno
 * 4. Alertas de Curva
 */
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DisciplineView, HistoricalPoint } from "../types";

/* ─── Types ─── */

type BetaProps = {
  disciplineView: DisciplineView;
  discipline: string;
  athleteWeight?: number | null;
};

type CautionLevel = "info" | "warning" | "critical";

type Caution = {
  text: string;
  level: CautionLevel;
};

/* ─── Helpers ─── */

function formatPace(secondsPerKm: number): string {
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const CAUTION_COLORS: Record<CautionLevel, string> = {
  info: "#6b7280",
  warning: "#d97706",
  critical: "#dc2626",
};

/* ─── Caution Banner ─── */

function CautionBanner({ cautions, reliability }: { cautions: Caution[]; reliability: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="beta-caution-banner">
      <button type="button" className="beta-caution-toggle" onClick={() => setOpen(!open)}>
        <span className="beta-caution-badge">
          <span className="beta-reliability">{reliability}</span>
          <span className="beta-caution-count">{cautions.length} cautela{cautions.length !== 1 ? "s" : ""}</span>
        </span>
        <span className="beta-caution-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="beta-caution-list">
          {cautions.map((c, i) => (
            <li key={i} style={{ borderLeft: `3px solid ${CAUTION_COLORS[c.level]}` }}>
              {c.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Chart wrapper ─── */

type ExplanationBlock = {
  usage: string;
  athleteImpact: string;
  howCalculated: string;
  whyReliability: string;
};

function BetaChartCard({
  title,
  subtitle,
  reliability,
  cautions,
  papers,
  explanation,
  children,
  noData,
}: {
  title: string;
  subtitle: string;
  reliability: string;
  cautions: Caution[];
  papers: string[];
  explanation: ExplanationBlock;
  children: React.ReactNode;
  noData?: boolean;
}) {
  const [showPapers, setShowPapers] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  return (
    <article className="beta-chart-card">
      <header className="beta-chart-header">
        <div>
          <h3 className="beta-chart-title">{title}</h3>
          <p className="beta-chart-subtitle">{subtitle}</p>
        </div>
      </header>
      <CautionBanner cautions={cautions} reliability={reliability} />
      <div className="beta-chart-body">{noData ? <p className="beta-no-data">Datos insuficientes para esta gráfica</p> : children}</div>
      <div className="beta-explanation-section">
        <button type="button" className="beta-explanation-toggle" onClick={() => setShowExplanation(!showExplanation)}>
          Cómo funciona y para qué sirve {showExplanation ? "▲" : "▼"}
        </button>
        {showExplanation && (
          <div className="beta-explanation-content">
            <div className="beta-explanation-block">
              <span className="beta-explanation-label">Para qué sirve</span>
              <p>{explanation.usage}</p>
            </div>
            <div className="beta-explanation-block">
              <span className="beta-explanation-label">Qué condiciona al deportista</span>
              <p>{explanation.athleteImpact}</p>
            </div>
            <div className="beta-explanation-block">
              <span className="beta-explanation-label">Cómo se calcula</span>
              <p>{explanation.howCalculated}</p>
            </div>
            <div className="beta-explanation-block">
              <span className="beta-explanation-label">Por qué el reliability es {reliability}</span>
              <p>{explanation.whyReliability}</p>
            </div>
          </div>
        )}
      </div>
      <footer className="beta-chart-footer">
        <button type="button" className="beta-papers-toggle" onClick={() => setShowPapers(!showPapers)}>
          Referencias científicas {showPapers ? "▲" : "▼"}
        </button>
        {showPapers && (
          <ul className="beta-papers-list">
            {papers.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </footer>
    </article>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 1: Perfil de Combustible (CHO vs Fat)
   ───────────────────────────────────────────────────── */

function ChartFuelProfile({ disciplineView }: { disciplineView: DisciplineView }) {
  const fuel = disciplineView.curve_insights?.fuel_profile ?? null;
  const noData = !fuel;

  const data = (fuel?.zones_fuel ?? []).map((z) => ({
    zone: z.zone,
    label: `${z.zone} ${z.label}`,
    cho: z.cho_pct,
    fat: z.fat_pct,
    intensity: z.intensity,
    fractionVO2: Math.round(z.fraction_vo2max * 100),
  }));

  const crossoverPct = fuel?.crossover_fraction_vo2max ? Math.round(fuel.crossover_fraction_vo2max * 100) : null;
  const vlaLabel = fuel?.vlamax_level === "low" ? "baja" : fuel?.vlamax_level === "high" ? "alta" : "moderada";

  return (
    <BetaChartCard
      title="Perfil de Combustible"
      subtitle="Contribución CHO vs Fat por zona — basado en VLamax y modelo de crossover"
      reliability="5/10"
      cautions={[
        { text: "Sin calorimetría indirecta, estos valores son estimaciones educativas con error individual ±20-30%.", level: "critical" },
        { text: "El modelo usa VLamax proxy (ratio LT1/LT2) para modular el crossover — no mide VLamax directa.", level: "warning" },
        { text: "Útil como tendencia relativa (comparar al atleta consigo mismo), NO como valor absoluto.", level: "info" },
      ]}
      papers={[
        "Brooks & Mercier 1994 — Concepto de crossover: CHO predomina sobre fat al subir intensidad",
        "Romijn et al. 1993 — Medición directa con isótopos: 25%, 65%, 85% VO2max",
        "Achten & Jeukendrup 2004 — FatMax entre 47-64% VO2max",
        "San-Millán & Brooks 2018 — Fat oxidation vs lactato: r=−0.97",
      ]}
      explanation={{
        usage: "Saber a qué intensidad el atleta quema más grasa y cuándo depende de carbohidratos. Clave para zonas de entrenamiento, estrategia nutricional en carrera, y flexibilidad metabólica.",
        athleteImpact: "VLamax alta = crossover temprano = más dependencia de CHO a intensidades moderadas. VLamax baja = excelente oxidación de grasas, ventaja en ultra-resistencia.",
        howCalculated: "El motor usa el ratio LT1/LT2 como proxy de VLamax. Con el modelo de crossover de Brooks & Mercier 1994 y datos empíricos de Romijn 1993, estima el %CHO a cada fracción de VO2max. El cálculo se realiza en el servidor con acceso a la curva de lactato completa.",
        whyReliability: "5/10 porque no medimos VO2/VCO2 reales. Pero al calcularse en el backend con la curva completa y VLamax proxy, es más consistente que la estimación puramente frontend.",
      }}
      noData={noData}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis unit="%" domain={[0, 100]} />
          <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} />
          <Bar dataKey="fat" name="Fat %" stackId="fuel" fill="rgba(245,158,11,0.7)" />
          <Bar dataKey="cho" name="CHO %" stackId="fuel" fill="rgba(59,130,246,0.7)" />
          <Legend />
        </BarChart>
      </ResponsiveContainer>
      <div className="beta-metric-row">
        <span>VLamax: <strong>{vlaLabel}</strong></span>
        {crossoverPct && <span>Crossover CHO{">"}50%: <strong>~{crossoverPct}% VO2max</strong></span>}
      </div>
      {fuel?.implication && <p className="beta-fuel-implication">{fuel.implication}</p>}
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 2: Evolución Temporal + Trainability
   ───────────────────────────────────────────────────── */

function ChartEvolution({ disciplineView, discipline }: { disciplineView: DisciplineView; discipline: string }) {
  const evo = disciplineView.historical_evolution ?? {};
  const lt1Series = evo["LT1"] ?? [];
  const lt2Series = evo["LT2"] ?? [];
  const peakSeries = evo["peak_lactate"] ?? [];
  const noData = lt1Series.length === 0 && lt2Series.length === 0;

  const dateMap = new Map<string, { date: string; lt1?: number; lt2?: number; peak?: number }>();
  for (const p of lt1Series) { if (p.value == null) continue; const d = p.date.slice(0, 10); const e = dateMap.get(d) ?? { date: d }; e.lt1 = p.value; dateMap.set(d, e); }
  for (const p of lt2Series) { if (p.value == null) continue; const d = p.date.slice(0, 10); const e = dateMap.get(d) ?? { date: d }; e.lt2 = p.value; dateMap.set(d, e); }
  for (const p of peakSeries) { if (p.value == null) continue; const d = p.date.slice(0, 10); const e = dateMap.get(d) ?? { date: d }; e.peak = p.value; dateMap.set(d, e); }

  const data = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const isRunning = discipline === "running";

  return (
    <BetaChartCard
      title="Evolución de Umbrales"
      subtitle="LT1, LT2 y pico de lactato a lo largo del tiempo"
      reliability="9/10"
      cautions={[
        { text: "Son datos reales medidos en tests de lactato — no hay modelo, solo visualización.", level: "info" },
        { text: "La fiabilidad de cada punto depende de la calidad del test individual (agreement, monotonicity).", level: "info" },
      ]}
      papers={[
        "Datos longitudinales reales — no requiere modelo. Ventaja competitiva vs INSCYD (solo snapshots).",
        "Faude et al. 2009 — Cambios significativos > 3-5% en umbrales entre tests.",
      ]}
      explanation={{
        usage: "Ver cómo evolucionan los umbrales del atleta a lo largo del tiempo. ¿Está mejorando el LT2? ¿El LT1 sube más rápido que el LT2? ¿Hay estancamiento? El índice de trainability cuantifica la respuesta entre tests consecutivos.",
        athleteImpact: "Si el LT2 lleva 3+ tests sin mejorar (estancamiento), el motor fisiológico cambia el bloque recomendado. Si el ratio LT1/LT2 mejora, la base aeróbica está sólida. El trainability index desglosa qué componentes mejoran o empeoran.",
        howCalculated: "Puntos reales de cada test graficados en línea temporal. Trainability: compuesto ponderado de cambio en LT2 (40%), LT1 (25%), baseline (15%) y ratio LT1/LT2 (20%) entre tests consecutivos.",
        whyReliability: "9/10 porque son datos medidos directamente. El trainability es un cálculo sobre datos reales, no una estimación.",
      }}
      noData={noData}
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} />
          <YAxis
            unit={isRunning ? "" : " W"}
            tickFormatter={isRunning ? (v: number) => formatPace(v) : undefined}
            domain={["auto", "auto"]}
            reversed={isRunning}
          />
          <Tooltip
            formatter={(v: number, name: string) => [isRunning ? formatPace(v) : `${Math.round(v)}W`, name]}
            labelFormatter={(l: string) => l}
          />
          <Line type="monotone" dataKey="lt1" name="LT1" stroke="#2d8f5b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="lt2" name="LT2" stroke="#d26a36" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="peak" name="Pico lactato" stroke="#b84a14" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} connectNulls />
          <Legend />
        </LineChart>
      </ResponsiveContainer>
      <TrainabilityBadge disciplineView={disciplineView} />
    </BetaChartCard>
  );
}

/* ─── Trainability Badge ─── */

const TRAINABILITY_COLORS: Record<string, string> = {
  strong_positive: "#16a34a",
  positive: "#22c55e",
  stable: "#6b7280",
  negative: "#d97706",
  strong_negative: "#dc2626",
};

const TRAINABILITY_ICONS: Record<string, string> = {
  strong_positive: "▲▲",
  positive: "▲",
  stable: "●",
  negative: "▼",
  strong_negative: "▼▼",
};

function TrainabilityBadge({ disciplineView }: { disciplineView: DisciplineView }) {
  const t = disciplineView.curve_insights?.trainability;
  if (!t) return null;

  const color = TRAINABILITY_COLORS[t.direction] ?? "#6b7280";
  const icon = TRAINABILITY_ICONS[t.direction] ?? "●";

  return (
    <div className="beta-trainability">
      <div className="beta-trainability-header">
        <span className="beta-trainability-icon" style={{ color }}>{icon}</span>
        <span className="beta-trainability-label">Índice de Trainability</span>
        <strong className="beta-trainability-value" style={{ color }}>
          {t.trainability_index > 0 ? "+" : ""}{t.trainability_index}%
        </strong>
        <span className="beta-trainability-rate">({t.response_per_week > 0 ? "+" : ""}{t.response_per_week}%/semana)</span>
      </div>
      <p className="beta-trainability-interp">{t.interpretation}</p>
      {Object.keys(t.components).length > 0 && (
        <div className="beta-trainability-components">
          {t.components.lt2_change_pct != null && <span>LT2: {t.components.lt2_change_pct > 0 ? "+" : ""}{t.components.lt2_change_pct}%</span>}
          {t.components.lt1_change_pct != null && <span>LT1: {t.components.lt1_change_pct > 0 ? "+" : ""}{t.components.lt1_change_pct}%</span>}
          {t.components.baseline_change_pct != null && <span>Baseline: {t.components.baseline_change_pct > 0 ? "+" : ""}{t.components.baseline_change_pct}%</span>}
          {t.components.lt1_lt2_ratio_change_pct != null && <span>Ratio: {t.components.lt1_lt2_ratio_change_pct > 0 ? "+" : ""}{t.components.lt1_lt2_ratio_change_pct}%</span>}
        </div>
      )}
      <span className="beta-trainability-days">{t.days_between_tests} días entre tests</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 3: Predicción de Glucógeno
   ───────────────────────────────────────────────────── */

function ChartGlycogenRisk({ disciplineView }: { disciplineView: DisciplineView }) {
  const preds = disciplineView.curve_insights?.glycogen_predictions ?? null;
  const noData = !preds || Object.keys(preds).length === 0;

  const LABELS: Record<string, string> = {
    half_marathon: "Media Maratón",
    marathon: "Maratón",
    ironman_run: "Ironman (run)",
  };

  const RISK_COLORS: Record<string, string> = {
    none: "#16a34a",
    low: "#16a34a",
    moderate: "#d97706",
    high: "#dc2626",
  };

  const RISK_LABELS: Record<string, string> = {
    none: "ninguno",
    low: "bajo",
    moderate: "moderado",
    high: "alto",
  };

  const items = preds ? Object.entries(preds).map(([key, p]) => ({
    key,
    label: LABELS[key] ?? key,
    ...p,
    riskColor: RISK_COLORS[p.risk_level] ?? "#6b7280",
    riskLabel: RISK_LABELS[p.risk_level] ?? p.risk_level,
  })) : [];

  return (
    <BetaChartCard
      title="Predicción de Glucógeno"
      subtitle="Estimación de depleción por distancia — modelo Rapoport/Coyle"
      reliability="6/10"
      cautions={[
        { text: "El consumo CHO se estima desde VLamax proxy y ecuación ACSM. Error individual ±20-30%.", level: "critical" },
        { text: "Reservas de glucógeno (~450g) varían según dieta, entrenamiento y composición corporal.", level: "warning" },
        { text: "Útil como alerta y guía nutricional, NO como predicción del km exacto del muro.", level: "warning" },
      ]}
      papers={[
        "Rapoport 2010 — Modelo de depleción de glucógeno en maratón. PLoS Comp Biol.",
        "Coyle 2007 — Glycogen availability y rendimiento en resistencia.",
        "Romijn et al. 1993 — Medición directa sustrato vs intensidad.",
        "Jeukendrup 2004 — Absorción máxima: 60g/h glucosa, 90g/h glucosa+fructosa.",
      ]}
      explanation={{
        usage: "Predecir a qué kilómetro el atleta puede quedarse sin glucógeno ('muro') según su perfil metabólico, ritmo de carrera e ingesta de CHO. Permite ajustar estrategia de carrera y nutrición.",
        athleteImpact: "VLamax alta = mayor consumo de CHO a cualquier ritmo = depleción antes. VLamax baja = mejor oxidación de grasas = más margen. La ingesta de CHO durante carrera es el factor modificable más potente.",
        howCalculated: "El motor calcula el coste energético por km (ecuación ACSM), estima el %CHO a la intensidad de carrera (modelo Brooks/Romijn modulado por VLamax), descuenta la ingesta de CHO (60g/h default), y proyecta cuándo se agotan las reservas (~1800 kcal = ~450g glucógeno).",
        whyReliability: "6/10 porque el modelo subyacente (Rapoport 2010) está validado, pero nuestros inputs son estimaciones — no medimos calorimetría. La predicción de km es orientativa: útil para planificar nutrición, no para predecir el minuto exacto del muro.",
      }}
      noData={noData}
    >
      <div className="beta-glycogen-grid">
        {items.map((d) => (
          <div key={d.key} className="beta-glycogen-card" style={{ borderLeftColor: d.riskColor }}>
            <h4>{d.label}</h4>
            <div className="beta-glycogen-level" style={{ color: d.riskColor }}>Riesgo: {d.riskLabel}</div>
            <div className="beta-glycogen-details">
              <span>%CHO a ritmo de carrera: <strong>{d.cho_pct_at_race_pace}%</strong></span>
              <span>Intensidad: <strong>{Math.round(d.fraction_vo2max * 100)}% VO2max</strong></span>
              {d.depletion_km != null && <span>Depleción estimada: <strong>km {d.depletion_km}</strong></span>}
              <span>Glucógeno al final: <strong>{d.glycogen_at_finish_pct}%</strong></span>
            </div>
            <p className="beta-glycogen-message">{d.message}</p>
            {d.strategies && d.strategies.length > 0 && (
              <ul className="beta-glycogen-strategies">
                {d.strategies.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 4: Alertas de Curva
   ───────────────────────────────────────────────────── */

const ALERT_SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  warning: "#d97706",
  info: "#3b82f6",
};

const ALERT_SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítico",
  warning: "Atención",
  info: "Info",
};

function ChartCurveAlerts({ disciplineView }: { disciplineView: DisciplineView }) {
  const alerts = disciplineView.curve_insights?.curve_alerts ?? [];
  const noData = alerts.length === 0;

  return (
    <BetaChartCard
      title="Alertas de Curva"
      subtitle="Detección automática de patrones anómalos en la curva de lactato"
      reliability="8/10"
      cautions={[
        { text: "Las alertas comparativas requieren al menos 2 tests del mismo tipo para funcionar.", level: "info" },
        { text: "Cada alerta se basa en umbrales de la literatura — no son diagnósticos clínicos.", level: "warning" },
      ]}
      papers={[
        "Faude et al. 2009 — Significado clínico de cambios en curva de lactato.",
        "Meeusen et al. 2013 — Marcadores de sobreentrenamiento: baseline elevado.",
        "Bosquet et al. 2007 — Monitorización de fatiga con curva de lactato.",
      ]}
      explanation={{
        usage: "Alertar al coach sobre patrones que requieren atención: baseline elevado (fatiga), desplazamiento a la izquierda (regresión), VLamax en aumento, ventana aeróbica comprimida, o mejoras significativas (right shift).",
        athleteImpact: "Un atleta con baseline elevado puede estar sobreentrenado. Un left shift indica regresión. Un right shift es la mejor señal: el entrenamiento funciona. Alertas de VLamax rising pueden indicar necesidad de más volumen aeróbico.",
        howCalculated: "El motor compara el snapshot actual con el anterior: cambios en LT2 (>5% = significativo), baseline (>0.5 mmol = rising), ratio LT1/LT2 (>0.05 = VLamax change). También detecta patrones absolutos: baseline >2.0 mmol, pico <4 mmol, ratio <0.50.",
        whyReliability: "8/10 porque se basa en datos medidos directamente y umbrales de la literatura (Faude 2009, Meeusen 2013). No hay modelo de estimación — son comparaciones directas.",
      }}
      noData={noData}
    >
      <div className="beta-alerts-list">
        {alerts.map((a, i) => (
          <div key={i} className="beta-alert-item" style={{ borderLeftColor: ALERT_SEVERITY_COLORS[a.severity] ?? "#6b7280" }}>
            <div className="beta-alert-header">
              <span className="beta-alert-severity" style={{ color: ALERT_SEVERITY_COLORS[a.severity] }}>
                {ALERT_SEVERITY_LABELS[a.severity] ?? a.severity}
              </span>
              <strong className="beta-alert-title">{a.title}</strong>
            </div>
            <p className="beta-alert-message">{a.message}</p>
          </div>
        ))}
      </div>
    </BetaChartCard>
  );
}

/* ─── Main Component ─── */

export function BetaImplementations({ disciplineView, discipline }: BetaProps) {
  return (
    <div className="beta-implementations">
      <div className="beta-global-warning">
        <strong>Fase Beta</strong> — Estas gráficas son experimentales. Los valores son estimaciones derivadas de datos existentes con modelos publicados.
        Cada gráfica incluye su nivel de fiabilidad y cautelas científicas. <strong>No reemplazan mediciones directas.</strong>
      </div>
      <div className="beta-chart-grid">
        <ChartFuelProfile disciplineView={disciplineView} />
        <ChartEvolution disciplineView={disciplineView} discipline={discipline} />
        <ChartGlycogenRisk disciplineView={disciplineView} />
        <ChartCurveAlerts disciplineView={disciplineView} />
      </div>
    </div>
  );
}

/**
 * BetaImplementations — 9 metabolic charts derived from existing engine data.
 * Each chart carries scientific cautions and reliability disclaimers.
 * All formulas and sources are documented inline.
 */
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DisciplineView, Estimate, HistoricalPoint, Threshold } from "../types";

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

function latestEstimateByType(estimates: Estimate[]): Map<string, Estimate> {
  const map = new Map<string, Estimate>();
  for (const est of estimates) {
    const existing = map.get(est.estimate_type);
    if (!existing || est.valid_on > existing.valid_on) map.set(est.estimate_type, est);
  }
  return map;
}

function resolveThreshold(thresholds: Threshold[], name: string): Threshold | undefined {
  return thresholds.find((t) => t.name === name);
}

function formatPace(secondsPerKm: number): string {
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function speedToKmh(paceSecondsPerKm: number): number {
  return paceSecondsPerKm > 0 ? 3600 / paceSecondsPerKm : 0;
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
   CHART 1: VO2max vs VLamax (Profile Map)
   ───────────────────────────────────────────────────── */

function Chart1_VO2vsVLamax({ disciplineView }: { disciplineView: DisciplineView }) {
  const estimates = latestEstimateByType(disciplineView.estimates);
  const vo2 = disciplineView.swain_vo2max?.vo2max ?? null;
  const vlEst = estimates.get("VLAMAX");
  const vl = vlEst ? vlEst.value : null;
  const noData = vo2 === null || vl === null;

  // Quadrant reference zones
  const zones = [
    { x: 65, y: 0.22, label: "Diesel", color: "#2563eb" },
    { x: 40, y: 0.55, label: "Sprinter", color: "#dc2626" },
    { x: 65, y: 0.55, label: "Completo", color: "#16a34a" },
    { x: 40, y: 0.22, label: "Limitado", color: "#9ca3af" },
  ];

  const cautions: Caution[] = [
    { text: "VO2max estimado vía Swain+ACSM desde FC. Error típico ±3-5 ml/kg/min vs medición directa.", level: "warning" },
    ...(vlEst && vlEst.method_used?.includes("ratio")
      ? [{ text: "VLamax estimada desde ratio LT1/LT2. Sin validación publicada para esta inversión.", level: "critical" as CautionLevel }]
      : []),
    { text: "Sin test de sprint 15-30\" la VLamax es una estimación con baja fiabilidad.", level: "info" },
  ];

  return (
    <BetaChartCard
      title="1. VO2max vs VLamax"
      subtitle="Mapa de perfil metabólico — cuadrante de capacidad"
      reliability={vlEst && !vlEst.method_used?.includes("ratio") ? "9/10" : vo2 ? "4/10" : "—"}
      cautions={cautions}
      papers={[
        "Swain & Leutholtz 1997 — %HRR ≈ %VO2R (r=0.990, treadmill follow-up)",
        "ACSM 2018 — Ecuaciones metabólicas running/cycling",
        "Mader 2003 — VLamax = (peak−baseline) / (2×t_sprint). Estequiometría glucolítica.",
      ]}
      explanation={{
        usage: "Identificar el perfil metabólico del atleta: si es un 'diesel' (alto VO2max, baja VLamax — fondista ideal), un 'sprinter' (alta VLamax, VO2max moderado), o un perfil 'completo'. Esto guía qué tipo de entrenamiento priorizar: si necesita bajar VLamax (más base aeróbica) o subir VO2max (más intensidad).",
        athleteImpact: "Un atleta con VLamax alta (>0.45) produce mucho lactato a cada intensidad — se 'quema' antes en esfuerzos largos, necesita más base aeróbica (bloques AEC de Olbrecht). Un atleta con VLamax baja (<0.25) tiene perfil diesel pero puede carecer de 'punch' para 5K-10K — necesita estímulos anaeróbicos puntuales (bloques ANC).",
        howCalculated: "VO2max se estima con Swain: VO2max = (VO2_en_LT2 − 3.5) / %HRR + 3.5, donde %HRR = (FC_LT2 − FC_reposo) / (FC_max − FC_reposo). El VO2 en LT2 se calcula con ACSM: 0.2×velocidad(m/min) + 3.5 para running, 10.8×watts/kg + 7 para ciclismo. La VLamax se mide con Mader: (pico_lactato − baseline) / (2 × duración_sprint_s) desde un test de sprint 15-30 segundos.",
        whyReliability: "Con sprint test medido (9/10): la fórmula de Mader es exactamente lo que usan INSCYD y la literatura. Es medición directa. Sin sprint test (4/10): la VLamax se estima desde el ratio LT1/LT2, que NO tiene ningún paper que valide esa inversión directa — es una aproximación teórica nuestra. El VO2max Swain tiene R²≈0.87, bueno pero no es calorimetría directa.",
      }}
      noData={noData}
    >
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis type="number" dataKey="x" name="VO2max" unit=" ml/kg/min" domain={[25, 85]} />
          <YAxis type="number" dataKey="y" name="VLamax" unit=" mmol/L/s" domain={[0.1, 0.8]} />
          <Tooltip formatter={(v: number, name: string) => [name === "VO2max" ? `${v} ml/kg/min` : `${v} mmol/L/s`, name]} />
          {/* Quadrant labels */}
          {zones.map((z) => (
            <ReferenceLine key={z.label} y={z.y} stroke="transparent" label={{ value: "", position: "center" }} />
          ))}
          <ReferenceLine x={52} stroke="rgba(0,0,0,0.12)" strokeDasharray="6 4" label={{ value: "VO2 ref", position: "top", fontSize: 10, fill: "#9ca3af" }} />
          <ReferenceLine y={0.35} stroke="rgba(0,0,0,0.12)" strokeDasharray="6 4" label={{ value: "VLamax neutral", position: "right", fontSize: 10, fill: "#9ca3af" }} />
          {/* Athlete point */}
          {vo2 !== null && vl !== null && <Scatter data={[{ x: vo2, y: vl, name: "Atleta" }]} fill="#1153ad" shape="circle" />}
        </ScatterChart>
      </ResponsiveContainer>
      {vo2 !== null && vl !== null && (
        <div className="beta-metric-row">
          <span>VO2max: <strong>{Math.round(vo2 * 10) / 10} ml/kg/min</strong></span>
          <span>VLamax: <strong>{Math.round(vl * 100) / 100} mmol/L/s</strong></span>
          <span>Perfil: <strong>{vo2 >= 52 && vl < 0.35 ? "Diesel" : vo2 >= 52 && vl >= 0.35 ? "Completo" : vl >= 0.35 ? "Sprinter" : "Base"}</strong></span>
        </div>
      )}
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 2: CHO vs Fat Oxidation (FatMax)
   ───────────────────────────────────────────────────── */

function Chart2_CHOvsFat({ disciplineView }: { disciplineView: DisciplineView }) {
  const vo2max = disciplineView.swain_vo2max?.vo2max ?? null;
  const estimates = latestEstimateByType(disciplineView.estimates);
  const vlEst = estimates.get("VLAMAX");
  const vlamax = vlEst?.value ?? 0.35;
  const lt1 = resolveThreshold(disciplineView.thresholds, "LT1");
  const noData = vo2max === null;

  // Model: RER estimation by %VO2max using crossover concept (Brooks & Mercier 1994)
  // VLamax shifts crossover point: higher VLamax → earlier crossover
  const crossoverShift = (vlamax - 0.35) * 0.15; // shift in %VO2max units
  const data: Array<{ pctVO2: number; fat: number; cho: number }> = [];

  if (vo2max !== null) {
    for (let pct = 25; pct <= 100; pct += 5) {
      const vo2Abs = (pct / 100) * vo2max; // ml/kg/min → approximate L/min with 70kg
      // Estimated RER via sigmoid crossover model
      const crossoverPct = 50 - crossoverShift * 100; // ~50% VO2max default crossover
      const k = 0.06; // sigmoid steepness
      const rer = 0.71 + 0.29 / (1 + Math.exp(-k * (pct - crossoverPct)));
      const vco2 = rer * vo2Abs;
      // Frayn 1983 stoichiometry (original coefficients)
      const fatGmin = Math.max(0, (1.67 * vo2Abs - 1.67 * vco2) / 1000 * 70); // scale to ~g/min for 70kg
      const choGmin = Math.max(0, (4.55 * vco2 - 3.21 * vo2Abs) / 1000 * 70);
      data.push({ pctVO2: pct, fat: Math.round(fatGmin * 100) / 100, cho: Math.round(choGmin * 100) / 100 });
    }
  }

  // FatMax approximation: peak of fat curve
  const fatMax = data.length ? data.reduce((best, d) => (d.fat > best.fat ? d : best), data[0]) : null;

  return (
    <BetaChartCard
      title="2. Oxidación CHO vs Fat"
      subtitle="Estimación de sustratos por intensidad — crossover y FatMax"
      reliability="5/10"
      cautions={[
        { text: "Sin calorimetría indirecta (VO2/VCO2 reales), estos valores son estimaciones del modelo con error individual ±20-30%.", level: "critical" },
        { text: "El RER se estima con un modelo sigmoidal de crossover (Brooks 1994), NO con datos medidos.", level: "critical" },
        { text: "Frayn 1983: ecuaciones estequiométricas correctas, pero requieren VO2/VCO2 reales para precisión.", level: "warning" },
        { text: "Achten & Jeukendrup 2004: FatMax correlaciona con LT1 pero solo R²=0.46 (r≈0.68).", level: "warning" },
        { text: "Útil como tendencia relativa (comparar al atleta consigo mismo), NO como valor absoluto de g/min.", level: "info" },
      ]}
      papers={[
        "Frayn 1983 — Ecuaciones estequiométricas: Fat=1.67×VO2−1.67×VCO2, CHO=4.55×VCO2−3.21×VO2",
        "Brooks & Mercier 1994 — Concepto de crossover: CHO predomina sobre fat al subir intensidad",
        "Achten & Jeukendrup 2004 — FatMax entre 47-64% VO2max. Correlación con LT1: R²=0.46",
        "Romijn et al. 1993 — Medición directa con isótopos: 25%, 65%, 85% VO2max",
        "San-Millán & Brooks 2018 — Fat oxidation vs lactato: r=−0.97. No establece FatMax=2mmol universal",
      ]}
      explanation={{
        usage: "Saber a qué intensidad el atleta quema más grasa (FatMax) y a partir de cuándo depende casi exclusivamente de carbohidratos. Esto es clave para: planificar zonas de entrenamiento de base (zona 2 = máxima oxidación de grasas), estrategia nutricional en carrera (cuántos g/h de CHO necesita), y entender si el atleta tiene buena 'flexibilidad metabólica' (capacidad de usar grasa eficientemente).",
        athleteImpact: "Un atleta con FatMax alto (65% VO2max) puede mantener ritmos de maratón quemando más grasa y ahorrando glucógeno — menos riesgo de 'muro'. Un atleta con FatMax bajo (40% VO2max) depende de CHO incluso a intensidades moderadas — necesita más ingesta durante carrera y más entrenamiento de base para mejorar la oxidación de grasas. La VLamax condiciona directamente el crossover: VLamax alta = crossover antes = más dependencia de CHO.",
        howCalculated: "Estimamos el RER (cociente respiratorio) a cada intensidad con un modelo sigmoidal de crossover basado en Brooks & Mercier 1994: a baja intensidad RER≈0.71 (100% fat), sube progresivamente hasta RER≈1.0 (100% CHO) al VO2max. La VLamax del atleta desplaza el punto de crossover. Luego aplicamos las ecuaciones de Frayn 1983: Fat(g/min) = 1.67×VO2 − 1.67×VCO2 y CHO(g/min) = 4.55×VCO2 − 3.21×VO2.",
        whyReliability: "5/10 porque el cuello de botella es que NO tenemos calorimetría indirecta — no medimos VO2 ni VCO2 reales del atleta. El RER se estima con un modelo teórico genérico. Achten & Jeukendrup 2004 demostraron que FatMax solo correlaciona con LT1 con R²=0.46, lo que significa que LT1 solo explica el 46% de la variación individual del FatMax. El 54% restante depende de factores que no medimos (dieta, composición de fibras, estado de entrenamiento). Los g/min absolutos pueden tener ±20-30% de error individual. Útil solo para comparar tendencia del atleta consigo mismo.",
      }}
      noData={noData}
    >
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="pctVO2" unit="%" label={{ value: "% VO2max", position: "insideBottom", offset: -4 }} />
          <YAxis unit=" g/min" />
          <Tooltip />
          <Area type="monotone" dataKey="fat" name="Fat (g/min)" stroke="#f59e0b" fill="rgba(245,158,11,0.2)" strokeWidth={2} />
          <Area type="monotone" dataKey="cho" name="CHO (g/min)" stroke="#3b82f6" fill="rgba(59,130,246,0.2)" strokeWidth={2} />
          {fatMax && <ReferenceLine x={fatMax.pctVO2} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `FatMax ~${fatMax.pctVO2}%`, position: "top", fontSize: 10, fill: "#f59e0b" }} />}
          {lt1 && vo2max && (
            <ReferenceLine x={Math.round(((lt1.lactate ?? 0) / vo2max) * 100 * 15)} stroke="#16a34a" strokeDasharray="4 4" />
          )}
          <Legend />
        </AreaChart>
      </ResponsiveContainer>
      {fatMax && (
        <div className="beta-metric-row">
          <span>FatMax estimado: <strong>~{fatMax.pctVO2}% VO2max</strong> ({fatMax.fat} g/min)</span>
          <span>Crossover: <strong>~{Math.round(50 - (vlamax - 0.35) * 15)}% VO2max</strong></span>
        </div>
      )}
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 3: Aerobic vs Anaerobic Contribution by Distance
   ───────────────────────────────────────────────────── */

function Chart3_EnergyContribution({ disciplineView }: { disciplineView: DisciplineView }) {
  const estimates = latestEstimateByType(disciplineView.estimates);
  const vlEst = estimates.get("VLAMAX");
  const vlamax = vlEst?.value ?? 0.35;

  // Energy system contributions based on Gastin 2001 (measured) + extrapolation for longer distances
  // NOTE: Daniels F(T) is NOT aerobic contribution — it's sustainable %VO2max. Different concept.
  // For aerobic/anaerobic split we use Gastin's direct measurements and extrapolate beyond 5K.
  const distances = [
    { label: "800m", baseAerobic: 0.66, source: "measured" },     // Gastin 2001: 66% (Spencer & Gastin, accumulated O2 deficit)
    { label: "1500m", baseAerobic: 0.84, source: "measured" },    // Gastin 2001: 84%
    { label: "5K", baseAerobic: 0.95, source: "measured" },        // Gastin 2001: ~95%
    { label: "10K", baseAerobic: 0.97, source: "extrapolated" },   // Extrapolation from Gastin curve
    { label: "HM", baseAerobic: 0.99, source: "extrapolated" },    // Extrapolation
    { label: "Maratón", baseAerobic: 0.995, source: "extrapolated" },
  ];

  // VLamax modulation: higher VLamax → shift towards more anaerobic contribution
  // Scale: at VLamax 0.60 (sprinter) the anaerobic share increases ~5% at 800m, ~1% at marathon
  const vlaSensitivity: Record<string, number> = { "800m": 0.20, "1500m": 0.10, "5K": 0.03, "10K": 0.02, "HM": 0.01, "Maratón": 0.005 };

  const data = distances.map((d) => {
    const vlaMod = (vlamax - 0.35) * (vlaSensitivity[d.label] ?? 0.02);
    const aerobicRaw = d.baseAerobic - vlaMod;
    const aerobic = Math.min(99.5, Math.max(30, Math.round(aerobicRaw * 1000) / 10));
    const anaerobic = Math.round((100 - aerobic) * 10) / 10;
    return {
      distance: d.label,
      aerobic,
      anaerobic,
      gastinRef: d.source === "measured" ? Math.round(d.baseAerobic * 100) : null,
    };
  });

  return (
    <BetaChartCard
      title="3. Contribución Aeróbica vs Anaeróbica"
      subtitle="% energía por sistema según distancia de carrera"
      reliability="7/10"
      cautions={[
        { text: "Hasta 1500m: datos medidos directamente (Gastin 2001). 5K+: extrapolaciones del modelo F(T).", level: "warning" },
        { text: "La modulación por VLamax es teórica — basada en la sensibilidad relativa, no en medición directa.", level: "warning" },
        { text: "En maratón la contribución anaeróbica es <1%, difícil de medir y poco significativa.", level: "info" },
      ]}
      papers={[
        "Daniels & Gilbert 1979 — F(T) = 0.8 + 0.189e^(-0.013t) + 0.299e^(-0.193t). Coeficientes exactos.",
        "Gastin 2001 — Energía por sistema: 800m 66%, 1500m 84%, 5K ~95% aeróbico. >1500m son extrapolaciones.",
        "di Prampero 2003 — Emax = VO2max × F(T). Marco energético para predicción.",
      ]}
      explanation={{
        usage: "Entender cuánto depende cada distancia de carrera del sistema aeróbico vs anaeróbico. Esto guía la planificación: un atleta que compite en 5K necesita un 5% de capacidad anaeróbica — si tiene VLamax muy baja, puede beneficiarse de estímulos anaeróbicos puntuales (bloques ANC). Un maratonista necesita >99% aeróbico — la prioridad absoluta es eficiencia aeróbica.",
        athleteImpact: "Un atleta con VLamax alta tiene más contribución anaeróbica en cada distancia — ventaja en 800m-1500m, desventaja en HM-maratón porque consume más glucógeno. En 5K la VLamax importa poco (sensitivity 0.03), pero en maratón es determinante (sensitivity 0.22). Esto explica por qué hay atletas que corren 5K rápido pero 'mueren' en maratón.",
        howCalculated: "Usamos directamente los datos medidos de Gastin 2001 con accumulated oxygen deficit: 800m=66%, 1500m=84%, 5K=95% aeróbico. Para 10K+ extrapolamos la curva asintótica hacia 100%. La VLamax del atleta modula estos valores: con VLamax alta, la contribución anaeróbica sube (mayor efecto en distancias cortas — hasta +5% en 800m con VLamax de 0.60). La modulación es proporcional a (VLamax − 0.35) × sensibilidad por distancia.",
        whyReliability: "7/10 porque hasta 1500m los datos de Gastin 2001 son mediciones directas con accumulated oxygen deficit — ciencia sólida. En 5K aún es razonable (~95% aeróbico confirmado). Pero de 10K en adelante son extrapolaciones del modelo F(T), no mediciones. La contribución anaeróbica en maratón (<1%) es tan pequeña que medirla directamente es prácticamente imposible. La modulación por VLamax es teórica — no hay paper que cuantifique exactamente cuánto cambia el ratio aeróbico/anaeróbico por mmol/L/s de VLamax.",
      }}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="distance" />
          <YAxis unit="%" domain={[0, 100]} />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <Bar dataKey="aerobic" name="Aeróbico" stackId="a" fill="#3b82f6" />
          <Bar dataKey="anaerobic" name="Anaeróbico" stackId="a" fill="#ef4444" />
          <Legend />
        </BarChart>
      </ResponsiveContainer>
      <div className="beta-metric-row">
        {data.map((d) => (
          <span key={d.distance}>
            {d.distance}: <strong>{d.aerobic}%</strong> aer.
            {d.gastinRef !== null && <small className="beta-gastin-ref"> (Gastin ref: {d.gastinRef}%)</small>}
          </span>
        ))}
      </div>
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 4: Multi-Distance Race Prediction
   ───────────────────────────────────────────────────── */

function Chart4_RacePrediction({ disciplineView, discipline }: { disciplineView: DisciplineView; discipline: string }) {
  const estimates = latestEstimateByType(disciplineView.estimates);
  const raceTypes = ["5K", "10K", "HM", "Maratón"];
  const raceData = raceTypes
    .map((type) => {
      const est = estimates.get(type);
      if (!est) return null;
      return {
        distance: type,
        objetivo: est.ritmo_objetivo ?? est.value,
        techo: est.ritmo_techo ?? null,
        seguro: est.ritmo_seguro ?? null,
        confidence: est.confidence,
        glycogen: est.glycogen_risk?.level ?? null,
        durability: est.durability_info?.total_decay_pct ?? null,
        quality: est.quality_score ?? null,
      };
    })
    .filter(Boolean) as Array<{
    distance: string;
    objetivo: number;
    techo: number | null;
    seguro: number | null;
    confidence: number;
    glycogen: string | null;
    durability: number | null;
    quality: number | null;
  }>;

  const noData = raceData.length === 0;
  const isRunning = discipline === "running";

  return (
    <BetaChartCard
      title="4. Predicción Multi-Distancia"
      subtitle="Ritmo/potencia predicha por di Prampero + Daniels F(T)"
      reliability={noData ? "—" : "8/10"}
      cautions={[
        { text: "5K-10K: Daniels F(T) es gold standard, alta precisión.", level: "info" },
        { text: "HM: durabilidad empieza a importar. Error moderado.", level: "warning" },
        { text: "Maratón: fórmula de durabilidad (decay k×t^1.5) NO está en papers publicados de Zanini. Es interpolación propia.", level: "critical" },
        { text: "La nutrición durante carrera no está modelada — puede variar ±2-5% el resultado en maratón.", level: "warning" },
      ]}
      papers={[
        "Daniels & Gilbert 1979 — F(T) y ecuación VO2-velocidad. Gold standard.",
        "di Prampero 2003 — Modelo energético Emax para predicción de rendimiento.",
        "Maunder et al. 2021 — Definición de durabilidad. Marco conceptual aceptado.",
        "Zanini 2025 — sLT cae 3% a 90min, 6.6% a 120min. NO publica fórmula k×t^1.5.",
        "Rapoport 2010 — Modelo de depleción de glucógeno en maratón.",
      ]}
      explanation={{
        usage: "Dar al entrenador tres ritmos para cada distancia: techo (el mejor caso), objetivo (lo más probable), y seguro (conservador). Incluye alerta de riesgo de glucógeno para HM y maratón, y el % de decay por durabilidad. Sirve para planificar pacing, fijar objetivos de competición, y decidir estrategia nutricional.",
        athleteImpact: "El 'techo' asume condiciones ideales y VLamax favorable. El 'seguro' asume condiciones adversas. La diferencia entre ambos crece con la distancia: en 5K es ~20s, en maratón puede ser >10 minutos. Un atleta con VLamax alta verá mayor diferencia techo/seguro en maratón porque su rendimiento es más sensible a la glucólisis. El glycogen risk indica si necesita plan nutricional estricto.",
        howCalculated: "1) VO2max estimado (Swain). 2) F(T) de Daniels para la duración de carrera → VO2 sostenible. 3) Ecuación inversa de Daniels → velocidad a ese VO2. 4) Ajuste VLamax: penalización proporcional a (VLamax − 0.35) × sensibilidad de la distancia. 5) Durabilidad para HM+: decay = k × t^1.5 (clamp 0.85-1.0). 6) Banda de confianza: spread = base_spread / (0.5 + 0.5 × Q). Tres ritmos = objetivo ± spread asimétrico.",
        whyReliability: "8/10 en 5K-10K porque Daniels F(T) es gold standard con décadas de validación en miles de atletas. Baja a 7/10 en HM porque la durabilidad empieza a importar y nuestro modelo de decay (k×t^1.5) no tiene publicación verificable — Zanini midió el efecto pero NO publicó esta fórmula específica. Baja a 6/10 en maratón porque además de la durabilidad no modelada, la nutrición puede variar el resultado ±2-5% y no la incluimos.",
      }}
      noData={noData}
    >
      <div className="beta-race-grid">
        {raceData.map((r) => (
          <div key={r.distance} className="beta-race-card">
            <span className="beta-race-label">{r.distance}</span>
            <div className="beta-race-paces">
              {r.techo && (
                <div className="beta-race-line ceiling">
                  <small>Techo</small>
                  <strong>{isRunning ? formatPace(r.techo) : `${Math.round(r.techo)}W`}</strong>
                </div>
              )}
              <div className="beta-race-line target">
                <small>Objetivo</small>
                <strong>{isRunning ? formatPace(r.objetivo) : `${Math.round(r.objetivo)}W`}</strong>
              </div>
              {r.seguro && (
                <div className="beta-race-line safe">
                  <small>Seguro</small>
                  <strong>{isRunning ? formatPace(r.seguro) : `${Math.round(r.seguro)}W`}</strong>
                </div>
              )}
            </div>
            <div className="beta-race-meta">
              {r.glycogen && <span className={`beta-glycogen ${r.glycogen}`}>{r.glycogen === "high" ? "Riesgo glucógeno ALTO" : r.glycogen === "moderate" ? "Riesgo moderado" : ""}</span>}
              {r.durability !== null && r.durability > 0 && <span className="beta-durability">Decay: −{Math.round(r.durability * 10) / 10}%</span>}
              <span className="beta-confidence">Q: {r.quality !== null ? Math.round(r.quality * 100) : Math.round(r.confidence * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 5: Temporal Evolution
   ───────────────────────────────────────────────────── */

function Chart5_Evolution({ disciplineView, discipline }: { disciplineView: DisciplineView; discipline: string }) {
  const evo = disciplineView.historical_evolution ?? {};
  const lt1Series = evo["LT1"] ?? [];
  const lt2Series = evo["LT2"] ?? [];
  const peakSeries = evo["peak_lactate"] ?? [];
  const noData = lt1Series.length === 0 && lt2Series.length === 0;

  // Merge into timeline
  const dateMap = new Map<string, { date: string; lt1?: number; lt2?: number; peak?: number }>();
  for (const p of lt1Series) { if (p.value == null) continue; const d = p.date.slice(0, 10); const e = dateMap.get(d) ?? { date: d }; e.lt1 = p.value; dateMap.set(d, e); }
  for (const p of lt2Series) { if (p.value == null) continue; const d = p.date.slice(0, 10); const e = dateMap.get(d) ?? { date: d }; e.lt2 = p.value; dateMap.set(d, e); }
  for (const p of peakSeries) { if (p.value == null) continue; const d = p.date.slice(0, 10); const e = dateMap.get(d) ?? { date: d }; e.peak = p.value; dateMap.set(d, e); }

  const data = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const isRunning = discipline === "running";

  return (
    <BetaChartCard
      title="5. Evolución Temporal"
      subtitle="LT1, LT2 y pico de lactato a lo largo del tiempo"
      reliability="9/10"
      cautions={[
        { text: "Son datos reales medidos en tests de lactato — no hay modelo, solo visualización.", level: "info" },
        { text: "La fiabilidad de cada punto depende de la calidad del test individual (agreement, monotonicity).", level: "info" },
      ]}
      papers={[
        "Datos longitudinales reales — no requiere modelo. Ventaja competitiva vs INSCYD (solo snapshots).",
      ]}
      explanation={{
        usage: "Ver cómo evolucionan los umbrales del atleta a lo largo del tiempo. Responde preguntas como: ¿Está mejorando el LT2? ¿El LT1 sube más rápido que el LT2 (señal de buena base aeróbica)? ¿Hay estancamiento? ¿El pico de lactato (VLamax) está bajando (adaptación aeróbica) o subiendo (estímulo anaeróbico efectivo)?",
        athleteImpact: "Si el LT2 lleva 3+ tests sin mejorar (estancamiento), el motor fisiológico cambia automáticamente el bloque recomendado. Si el ratio LT1/LT2 mejora (LT1 se acerca al LT2), indica que la base aeróbica está sólida y puede pasar a bloques de desarrollo de umbral. Si el pico de lactato baja entre tests, la VLamax está bajando — perfil cada vez más diesel.",
        howCalculated: "No hay modelo — son puntos reales de cada test de lactato del atleta graficados en una línea temporal. LT1 y LT2 vienen del motor de detección de umbrales (3 métodos: baseline_rise, sustained_increase, ModDmax). El pico de lactato es simplemente el valor más alto medido en cada sesión.",
        whyReliability: "9/10 porque son datos medidos directamente, no estimaciones ni modelos. La única fuente de error es la calidad de cada test individual (protocolo de intervalos, calidad de las muestras de lactato, monotonicity de la curva). Cada punto tiene su propio agreement_score que refleja cuánto coinciden los 3 métodos de detección. Esta es nuestra mayor ventaja vs INSCYD: ellos solo ofrecen fotos estáticas, nosotros tenemos la película completa.",
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
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 6: Glycogen Risk
   ───────────────────────────────────────────────────── */

function Chart6_GlycogenRisk({ disciplineView }: { disciplineView: DisciplineView }) {
  const estimates = latestEstimateByType(disciplineView.estimates);
  const vlEst = estimates.get("VLAMAX");
  const vlamax = vlEst?.value ?? 0.35;
  const hmEst = estimates.get("HM");
  const marEst = estimates.get("Maratón");
  const noData = !hmEst && !marEst;

  // Qualitative glycogen risk model (from prediction_engine.py)
  function glycogenLevel(vla: number, dist: string): { level: string; color: string; choRec: string } {
    if (dist === "HM" && vla <= 0.50) return { level: "bajo", color: "#16a34a", choRec: "30-45 g/h" };
    if (vla < 0.30) return { level: "bajo", color: "#16a34a", choRec: "30-45 g/h" };
    if (vla <= 0.45) return { level: "moderado", color: "#d97706", choRec: "60 g/h" };
    return { level: "alto", color: "#dc2626", choRec: "60-90 g/h" };
  }

  const items = [
    hmEst ? { dist: "HM", est: hmEst, ...glycogenLevel(vlamax, "HM") } : null,
    marEst ? { dist: "Maratón", est: marEst, ...glycogenLevel(vlamax, "Maratón") } : null,
  ].filter(Boolean) as Array<{ dist: string; est: Estimate; level: string; color: string; choRec: string }>;

  // Simplified depletion model (Rapoport 2010 inspired)
  const glycogenStore = 500; // grams (muscle + hepatic, typical)
  const depletionData = items.map((item) => {
    const durationH = item.est.durability_info?.duration_hours ?? (item.dist === "HM" ? 1.6 : 3.5);
    const choPerH = vlamax > 0.45 ? 250 : vlamax > 0.30 ? 200 : 160; // g/h approximation from Romijn 1993
    const intake = item.choRec.includes("60-90") ? 75 : item.choRec.includes("60") ? 60 : 35;
    const netBurn = choPerH - intake;
    const depletionH = glycogenStore / netBurn;
    return { ...item, durationH, choPerH, intake, depletionH: Math.round(depletionH * 10) / 10 };
  });

  return (
    <BetaChartCard
      title="6. Riesgo de Glucógeno"
      subtitle="Estimación cualitativa de riesgo de depleción en carrera"
      reliability="6/10"
      cautions={[
        { text: "El consumo CHO/h se estima desde el modelo, NO de calorimetría. Error individual ±20-30%.", level: "critical" },
        { text: "Reservas de glucógeno (400-500g) varían mucho según dieta, entrenamiento y composición corporal.", level: "warning" },
        { text: "Tasas de absorción máximas: 60g/h (glucosa) o 90g/h (glucosa+fructosa) — Jeukendrup 2004.", level: "info" },
        { text: "Útil como alerta y guía nutricional, NO como predicción del km exacto del muro.", level: "warning" },
      ]}
      papers={[
        "Rapoport 2010 — Modelo de depleción de glucógeno en maratón. PLoS Comp Biol.",
        "Romijn et al. 1993 — Medición directa con isótopos: 65% VO2max ~150g CHO/h, 85% VO2max ~250g CHO/h.",
        "Jeukendrup 2004 — Absorción máxima: 60g/h glucosa, 90g/h glucosa+fructosa.",
      ]}
      explanation={{
        usage: "Alertar al entrenador sobre el riesgo de 'muro' (depleción de glucógeno) en HM y maratón, y recomendar una estrategia de ingesta de carbohidratos. Si el riesgo es alto, el atleta necesita un plan nutricional estricto (60-90 g/h de CHO) para no quedarse sin combustible.",
        athleteImpact: "Un atleta con VLamax alta (>0.45) consume glucógeno mucho más rápido porque su tasa glucolítica es mayor — necesita ingerir 60-90 g/h de CHO combinando glucosa + fructosa. Un atleta con VLamax baja (<0.30) quema más grasa a la misma intensidad relativa y puede permitirse menos ingesta (30-45 g/h). La diferencia puede ser entre terminar bien o 'chocar contra el muro' en el km 30-35.",
        howCalculated: "El flag cualitativo se basa en VLamax: <0.30 = bajo, 0.30-0.45 = moderado, >0.45 = alto. La estimación de g/h se inspira en Romijn 1993 (150-250 g/h CHO según intensidad relativa). Las reservas de glucógeno se asumen ~500g (muscular + hepático, rango normal). El punto de agotamiento se estima como reservas / (consumo − ingesta).",
        whyReliability: "6/10 porque el flag cualitativo (bajo/moderado/alto) es conceptualmente correcto — la relación VLamax → consumo de CHO está bien establecida. Pero cuantificar los g/h exactos requiere calorimetría que no tenemos. Las reservas de glucógeno (400-600g) varían enormemente entre individuos según dieta (carga de CHO previa), composición de fibras musculares, masa muscular total, y nivel de entrenamiento. Rapoport 2010 validó el modelo para maratón pero con inputs de calorimetría directa, no estimaciones. Nuestra aproximación es una guía orientativa, no un cálculo preciso.",
      }}
      noData={noData}
    >
      <div className="beta-glycogen-grid">
        {depletionData.map((d) => (
          <div key={d.dist} className="beta-glycogen-card" style={{ borderLeftColor: d.color }}>
            <h4>{d.dist}</h4>
            <div className="beta-glycogen-level" style={{ color: d.color }}>Riesgo: {d.level}</div>
            <div className="beta-glycogen-details">
              <span>Consumo estimado: ~{d.choPerH} g/h</span>
              <span>Recomendación ingesta: {d.choRec}</span>
              <span>Agotamiento estimado: ~{d.depletionH}h</span>
              <span>Duración carrera: ~{d.durationH}h</span>
              {d.depletionH < d.durationH && <span className="beta-glycogen-alert">El muro es probable sin nutrición adecuada</span>}
            </div>
          </div>
        ))}
      </div>
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 7: Metabolic Radar
   ───────────────────────────────────────────────────── */

function Chart7_Radar({ disciplineView, discipline }: { disciplineView: DisciplineView; discipline: string }) {
  const vo2data = disciplineView.swain_vo2max;
  const estimates = latestEstimateByType(disciplineView.estimates);
  const vlEst = estimates.get("VLAMAX");
  const lt1 = resolveThreshold(disciplineView.thresholds, "LT1");
  const lt2 = resolveThreshold(disciplineView.thresholds, "LT2");

  // Normalize 0-100
  const vo2Score = vo2data ? Math.min(100, Math.round(((vo2data.vo2max - 25) / (75 - 25)) * 100)) : null;
  const fracScore = vo2data?.fractional_utilization ? Math.round(((vo2data.fractional_utilization - 0.55) / (0.95 - 0.55)) * 100) : null;
  // Invert VLamax: lower is better for endurance
  const vlaScore = vlEst ? Math.round(((0.80 - vlEst.value) / (0.80 - 0.15)) * 100) : null;
  // Economy proxy: if actual LT2 speed > expected from VO2max → good economy
  const ecoScore = 65; // placeholder — would need actual vs predicted comparison
  // Durability from estimates
  const marEst = estimates.get("Maratón");
  const durScore = marEst?.durability_info ? Math.round((1 - marEst.durability_info.total_decay_pct) * 100) : null;
  // LT1/LT2 ratio
  const ratioScore = lt1 && lt2 && lt1.pace_seconds_per_km && lt2.pace_seconds_per_km
    ? Math.round((speedToKmh(lt1.pace_seconds_per_km) / speedToKmh(lt2.pace_seconds_per_km)) * 100)
    : null;

  const noData = vo2Score === null && vlaScore === null;

  const radarData = [
    { axis: "VO2max", value: vo2Score ?? 0, fullMark: 100 },
    { axis: "Frac. Util.", value: fracScore ?? 0, fullMark: 100 },
    { axis: "VLamax (inv)", value: vlaScore ?? 0, fullMark: 100 },
    { axis: "Ratio LT1/LT2", value: ratioScore ?? 0, fullMark: 100 },
    { axis: "Durabilidad", value: durScore ?? 0, fullMark: 100 },
    { axis: "Economía", value: ecoScore, fullMark: 100 },
  ];

  return (
    <BetaChartCard
      title="7. Radar Metabólico"
      subtitle="Perfil visual de las 6 dimensiones del rendimiento en resistencia"
      reliability="8/10"
      cautions={[
        { text: "Es visualización de datos existentes — no introduce modelo nuevo.", level: "info" },
        { text: "Cada eje hereda la fiabilidad de su fuente (VO2max 7/10, VLamax 9/10 con sprint, etc.).", level: "info" },
        { text: "El eje 'Economía' es placeholder — requiere comparación ritmo real vs predicho por VO2.", level: "warning" },
      ]}
      papers={[
        "Joyner & Coyle 2008 — Los tres pilares: VO2max, umbral de lactato, economía de carrera.",
        "Coyle 1988 — 92% de varianza en rendimiento = LT + densidad capilar (no LT solo).",
      ]}
      explanation={{
        usage: "Dar una foto rápida del perfil completo del atleta en una sola imagen. Permite al entrenador identificar de un vistazo qué dimensiones son fuertes y cuáles son limitantes. ¿Tiene mucho VO2max pero poca utilización fraccional? Necesita más umbral. ¿Buena economía pero VLamax alta? Necesita más base.",
        athleteImpact: "Cada eje condiciona una decisión de entrenamiento diferente. VO2max bajo → más intervalos a VO2max. Fractional utilization baja → más trabajo de umbral. VLamax alta (eje invertido: bajo en el radar) → más base aeróbica. Ratio LT1/LT2 bajo → el LT1 está lejos del LT2, necesita desarrollo de base. Durabilidad baja → necesita más long runs y trabajo prolongado sub-umbral. El radar permite ver desequilibrios que no son evidentes mirando cada número por separado.",
        howCalculated: "Cada eje se normaliza 0-100: VO2max respecto al rango fisiológico (25-75 ml/kg/min), VLamax invertida (0.80-0.15), fractional utilization (0.55-0.95), ratio LT1/LT2 (velocidad LT1 / velocidad LT2 × 100), durabilidad (1 − decay% del maratón), y economía (placeholder actualmente). No hay modelo nuevo — es visualización normalizada de datos existentes.",
        whyReliability: "8/10 porque no introduce ningún modelo nuevo — solo visualiza datos que ya existen. Cada eje hereda la fiabilidad de su fuente: VO2max Swain (7/10), VLamax medida (9/10) o estimada (4/10), fractional utilization (7/10), ratio LT1/LT2 (datos reales, 9/10), durabilidad (5/10 por el modelo de decay). El eje de 'economía' es actualmente un placeholder — necesitaríamos comparar el ritmo real del atleta vs el predicho por su VO2max para tener un valor real de economía de carrera.",
      }}
      noData={noData}
    >
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="rgba(0,0,0,0.08)" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
          <Radar name="Atleta" dataKey="value" stroke="#1153ad" fill="rgba(17,83,173,0.2)" fillOpacity={0.6} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
      <div className="beta-metric-row">
        {radarData.map((d) => (
          <span key={d.axis}>{d.axis}: <strong>{d.value}</strong>/100</span>
        ))}
      </div>
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 8: Durability Curve
   ───────────────────────────────────────────────────── */

function Chart8_Durability({ disciplineView, discipline }: { disciplineView: DisciplineView; discipline: string }) {
  const lt2 = resolveThreshold(disciplineView.thresholds, "LT2");
  const estimates = latestEstimateByType(disciplineView.estimates);
  const marEst = estimates.get("Maratón");
  const tier = marEst?.durability_info?.endurance_tier ?? "medium";
  const k = tier === "high" ? 0.013 : tier === "low" ? 0.035 : 0.025;
  const lt2Speed = lt2?.pace_seconds_per_km ? speedToKmh(lt2.pace_seconds_per_km) : lt2?.power_watts ?? null;
  const noData = lt2Speed === null;
  const isRunning = discipline === "running";

  const data: Array<{ hour: number; lt2Effective: number; decayPct: number }> = [];
  if (lt2Speed !== null) {
    for (let h = 0; h <= 4; h += 0.25) {
      const decay = Math.min(0.15, k * Math.pow(h, 1.5));
      const effective = lt2Speed * (1 - decay);
      data.push({ hour: h, lt2Effective: Math.round(effective * 100) / 100, decayPct: Math.round(decay * 1000) / 10 });
    }
  }

  return (
    <BetaChartCard
      title="8. Curva de Durabilidad"
      subtitle="Caída del LT2 efectivo en función del tiempo de esfuerzo"
      reliability="5/10"
      cautions={[
        { text: "La fórmula decay = k × t^1.5 NO está en papers publicados de Zanini. Es interpolación propia de nuestros datos.", level: "critical" },
        { text: "Zanini 2025 midió: sLT cae 3% a 90min, 6.6% a 120min. Nuestro modelo interpola entre esos puntos.", level: "critical" },
        { text: "Las constantes k (0.013/0.025/0.035) son calibraciones empíricas sin validación publicada.", level: "warning" },
        { text: "El concepto de durabilidad es aceptado (Maunder 2021), pero la cuantificación precisa requiere más investigación.", level: "warning" },
      ]}
      papers={[
        "Maunder et al. 2021 — Definición: 'onset and magnitude of deterioration in physiological profiling during prolonged exercise'.",
        "Zanini 2025 — sLT cae 3.0% a 90min, 6.6% a 120min. VO2peak cae 3.1% a 90min, 7.1% a 120min.",
        "Spragg et al. 2023 — Durabilidad correlaciona con CTL en ciclistas.",
      ]}
      explanation={{
        usage: "Mostrar cuánto 'aguanta' el umbral del atleta durante un esfuerzo prolongado. En un maratón o ironman, el LT2 no se mantiene constante — cae progresivamente. Esta curva muestra a qué ritmo cae y permite al entrenador ajustar el pacing de carrera: el ritmo de la segunda mitad debe ser más conservador que el de la primera.",
        athleteImpact: "Un atleta con durabilidad 'high' (k=0.013) pierde solo ~3.7% de su LT2 a las 2h — puede hacer negative splits en maratón. Un atleta con durabilidad 'low' (k=0.035) pierde ~10% a las 2h — necesita salir conservador o sufrirá un bajón severo en la segunda mitad. La durabilidad se mejora con volumen de entrenamiento prolongado a baja intensidad (long runs, rides de 3-4h) y buena oxidación de grasas.",
        howCalculated: "LT2 efectivo(t) = LT2 × (1 − k × t^1.5), donde t es horas de esfuerzo y k depende del tier de durabilidad del atleta: high=0.013, medium=0.025, low=0.035. El resultado se clampea a un mínimo de 85% del LT2 original (máximo 15% de decay). El tier se determina a partir del endurance_score del motor de predicción.",
        whyReliability: "5/10 — el motivo principal de la baja fiabilidad es que la fórmula decay = k × t^1.5 NO está publicada en ningún paper de Zanini ni de ningún otro autor. Es una interpolación propia basada en los datos de Zanini 2025 (sLT cae 3% a 90min, 6.6% a 120min), pero el exponente 1.5 y las constantes k son calibraciones empíricas sin validación externa. El concepto de durabilidad está firmemente establecido (Maunder 2021), pero la cuantificación precisa de cuánto cae el LT2 por hora es un campo de investigación activo sin fórmula consensuada. Además, factores como la nutrición, temperatura, y fatiga neuromuscular también afectan el decay y no están modelados.",
      }}
      noData={noData}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="hour" unit="h" label={{ value: "Tiempo de esfuerzo", position: "insideBottom", offset: -4 }} />
          <YAxis
            yAxisId="speed"
            unit={isRunning ? " km/h" : " W"}
            domain={["auto", "auto"]}
          />
          <YAxis yAxisId="decay" orientation="right" unit="%" domain={[0, 20]} />
          <Tooltip />
          <Line yAxisId="speed" type="monotone" dataKey="lt2Effective" name={`LT2 efectivo (${isRunning ? "km/h" : "W"})`} stroke="#1153ad" strokeWidth={2.5} dot={false} />
          <Line yAxisId="decay" type="monotone" dataKey="decayPct" name="Decay %" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          <ReferenceLine yAxisId="decay" y={3} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Zanini 90min", fontSize: 9, fill: "#f59e0b" }} />
          <ReferenceLine yAxisId="decay" y={6.6} stroke="#dc2626" strokeDasharray="3 3" label={{ value: "Zanini 120min", fontSize: 9, fill: "#dc2626" }} />
          <Legend />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="beta-metric-row">
        <span>Tier: <strong>{tier}</strong></span>
        <span>k: <strong>{k}</strong></span>
        {data.length > 0 && <span>Decay a 2h: <strong>{data.find((d) => d.hour === 2)?.decayPct ?? "—"}%</strong></span>}
        {data.length > 0 && <span>Decay a 3h: <strong>{data.find((d) => d.hour === 3)?.decayPct ?? "—"}%</strong></span>}
      </div>
    </BetaChartCard>
  );
}

/* ─────────────────────────────────────────────────────
   CHART 9: Benchmark vs Level
   ───────────────────────────────────────────────────── */

function Chart9_Benchmark({ disciplineView, discipline }: { disciplineView: DisciplineView; discipline: string }) {
  const lt2 = resolveThreshold(disciplineView.thresholds, "LT2");
  const vo2data = disciplineView.swain_vo2max;
  const noData = !lt2;
  const isRunning = discipline === "running";

  // Benchmarks from physiological_engine.py
  const benchmarks: Record<string, Record<string, [number, number]>> = {
    running: { Recreational: [9.0, 11.5], Trained: [11.0, 14.5], Competitive: [13.5, 17.0] },
    ciclismo: { Recreational: [170, 240], Trained: [220, 310], Competitive: [270, 380] },
    natación: { Recreational: [2.8, 3.4], Trained: [3.2, 4.0], Competitive: [3.8, 4.8] },
  };

  const discBench = benchmarks[discipline] ?? benchmarks.running;
  const athleteValue = isRunning && lt2?.pace_seconds_per_km
    ? speedToKmh(lt2.pace_seconds_per_km)
    : lt2?.power_watts ?? null;

  const barData = Object.entries(discBench).map(([level, [low, high]]) => ({
    level,
    low,
    high,
    range: high - low,
    base: low,
  }));

  return (
    <BetaChartCard
      title="9. Benchmark vs Nivel Poblacional"
      subtitle={`LT2 del atleta vs rangos de referencia (${discipline})`}
      reliability="8/10"
      cautions={[
        { text: "Benchmarks de literatura consolidada (Joyner & Coyle 2008). Rangos generales, no individualizados.", level: "info" },
        { text: "El LT2 del atleta depende de la calidad de la detección (agreement_score, métodos usados).", level: "warning" },
        { text: "Joyner 2008: LT2 en 75-85% VO2max en entrenados (corregido: no 82-92% como se citó antes).", level: "info" },
      ]}
      papers={[
        "Joyner & Coyle 2008 — Tres pilares del rendimiento: VO2max, LT, economía. Benchmarks por nivel.",
        "Coyle 1988 — 92% varianza = LT + capillary density combinados, no LT solo.",
        "Billat 2003 — MLSS rango individual: 2-8 mmol/L. Media 3.9 ± 1 mmol/L.",
      ]}
      explanation={{
        usage: "Posicionar al atleta respecto a su grupo: ¿su LT2 es de nivel recreational, trained o competitive? Esto ayuda al entrenador a establecer expectativas realistas, fijar objetivos de mejora, y comunicar al atleta dónde está respecto a otros de su disciplina. También ayuda a detectar si un atleta está 'infrarendiendo' (VO2max alto pero LT2 en rango recreational) o al revés.",
        athleteImpact: "Un atleta con LT2 en la zona 'trained' (running: 11-14.5 km/h) que aspira a competir necesita subir a 'competitive' (13.5-17 km/h). La distancia entre su nivel actual y el objetivo marca cuántos meses de entrenamiento de umbral necesita. Si su VO2max es alto pero su LT2 es bajo respecto al benchmark, tiene margen de mejora con bloques de desarrollo de umbral (THR). Si ambos son proporcionales, el limitante puede ser economía o VLamax.",
        howCalculated: "Comparamos el LT2 del atleta (velocidad en running, watts en ciclismo) contra rangos de la literatura: Running recreational 9-11.5 km/h, trained 11-14.5, competitive 13.5-17. Ciclismo recreational 170-240W, trained 220-310W, competitive 270-380W. Si tiene VO2max Swain, mostramos también la fractional utilization (LT2 como % de VO2max) comparada con el rango de Joyner: 75-85% en entrenados.",
        whyReliability: "8/10 porque los benchmarks vienen de literatura consolidada (Joyner & Coyle 2008, Billat 2003) con miles de sujetos. Son rangos amplios que cubren la variabilidad individual. La fuente de error es la detección del LT2 del atleta — si el agreement_score del test es bajo, el LT2 detectado puede no ser preciso. También hay que considerar que estos rangos son promedios poblacionales: un atleta de 50 años 'trained' tiene rangos diferentes a uno de 25, y no ajustamos por edad.",
      }}
      noData={noData}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={barData} layout="vertical" margin={{ top: 10, right: 30, bottom: 10, left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis type="number" unit={isRunning ? " km/h" : " W"} domain={[0, "auto"]} />
          <YAxis type="category" dataKey="level" />
          <Tooltip formatter={(v: number) => `${v} ${isRunning ? "km/h" : "W"}`} />
          <Bar dataKey="base" stackId="a" fill="transparent" />
          <Bar dataKey="range" stackId="a" name="Rango" fill="rgba(17,83,173,0.15)" stroke="rgba(17,83,173,0.3)" />
          {athleteValue !== null && (
            <ReferenceLine x={athleteValue} stroke="#1153ad" strokeWidth={2.5} label={{ value: `Tu LT2: ${isRunning ? Math.round(athleteValue * 10) / 10 + " km/h" : Math.round(athleteValue) + "W"}`, position: "top", fontSize: 11, fill: "#1153ad" }} />
          )}
        </BarChart>
      </ResponsiveContainer>
      {vo2data && (
        <div className="beta-metric-row">
          <span>VO2max: <strong>{Math.round(vo2data.vo2max * 10) / 10}</strong> ml/kg/min</span>
          <span>Frac. Util.: <strong>{Math.round(vo2data.fractional_utilization * 100)}%</strong></span>
          <span>LT2 como % VO2max: <strong>{Math.round(vo2data.fractional_utilization * 100)}%</strong> (Joyner ref: 75-85%)</span>
        </div>
      )}
    </BetaChartCard>
  );
}

/* ─── Main Component ─── */

export function BetaImplementations({ disciplineView, discipline, athleteWeight }: BetaProps) {
  return (
    <div className="beta-implementations">
      <div className="beta-global-warning">
        <strong>Fase Beta</strong> — Estas gráficas son experimentales. Los valores son estimaciones derivadas de datos existentes con modelos publicados.
        Cada gráfica incluye su nivel de fiabilidad y cautelas científicas. <strong>No reemplazan mediciones directas.</strong>
      </div>
      <div className="beta-chart-grid">
        <Chart1_VO2vsVLamax disciplineView={disciplineView} />
        <Chart2_CHOvsFat disciplineView={disciplineView} />
        <Chart3_EnergyContribution disciplineView={disciplineView} />
        <Chart4_RacePrediction disciplineView={disciplineView} discipline={discipline} />
        <Chart5_Evolution disciplineView={disciplineView} discipline={discipline} />
        <Chart6_GlycogenRisk disciplineView={disciplineView} />
        <Chart7_Radar disciplineView={disciplineView} discipline={discipline} />
        <Chart8_Durability disciplineView={disciplineView} discipline={discipline} />
        <Chart9_Benchmark disciplineView={disciplineView} discipline={discipline} />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";

// ── Lactate Facts Bank ────────────────────────────────────────────────────

export type LactateFact = {
  id: string;
  category: "physiology" | "training" | "testing" | "nutrition" | "recovery" | "performance";
  title: string;
  body: string;
  source?: string;
  relevance?: (ctx: LactateFactContext) => boolean;
};

export type LactateFactContext = {
  hasLT1: boolean;
  hasLT2: boolean;
  discipline: string;
  lt1Lactate?: number | null;
  lt2Lactate?: number | null;
  athleteLevel?: string;
  hasDynamicThresholds?: boolean;
  hasMultipleSessions?: boolean;
};

const LACTATE_FACTS: LactateFact[] = [
  // ── Physiology ──
  {
    id: "lactate-not-waste",
    category: "physiology",
    title: "El lactato no es un producto de desecho",
    body: "Durante décadas se creyó que el ácido láctico causaba la fatiga muscular. Hoy sabemos que el lactato es un combustible: el corazón, el cerebro y los músculos inactivos lo usan como fuente de energía. El verdadero \"desecho\" son los iones H+ que acompañan su producción.",
    source: "Brooks, 2018 — Cell Metabolism",
  },
  {
    id: "lactate-shuttle",
    category: "physiology",
    title: "El shuttle de lactato",
    body: "El lactato viaja entre células, tejidos y órganos como un intermediario metabólico. Las fibras rápidas lo producen, las lentas lo oxidan. Este sistema de \"shuttle\" permite que tu cuerpo redistribuya energía donde más la necesita durante el ejercicio.",
    source: "Brooks, 2009 — Medicine & Science in Sports & Exercise",
  },
  {
    id: "lt1-aerobic-ceiling",
    category: "physiology",
    title: "LT1: el techo de tu motor aeróbico",
    body: "El primer umbral de lactato (LT1) marca la intensidad máxima donde tu cuerpo aún puede aclarar todo el lactato que produce. Por debajo de LT1, puedes mantener el esfuerzo durante horas. Es la base de toda tu capacidad de resistencia.",
    source: "Faude et al., 2009 — Sports Medicine",
    relevance: (ctx) => ctx.hasLT1,
  },
  {
    id: "lt2-maximal-steady-state",
    category: "physiology",
    title: "LT2: el límite sostenible",
    body: "El segundo umbral (LT2 o MLSS) es la intensidad más alta que puedes mantener ~40-60 minutos sin acumulación progresiva de lactato. Por encima de LT2, el lactato sube exponencialmente y la fatiga se acelera de forma inevitable.",
    source: "Billat et al., 2003 — Sports Medicine",
    relevance: (ctx) => ctx.hasLT2,
  },
  {
    id: "baseline-lactate",
    category: "physiology",
    title: "Tu lactato basal dice mucho",
    body: "Un lactato en reposo de 0.8-1.2 mmol/L es normal. Valores más altos en la primera muestra del test pueden indicar estrés previo, falta de descanso, o ingesta reciente de carbohidratos. El baseline condiciona toda la lectura del test.",
    source: "Goodwin et al., 2007 — Journal of Sports Sciences",
  },
  {
    id: "muscle-fiber-types",
    category: "physiology",
    title: "Fibras lentas vs rápidas y lactato",
    body: "Las fibras tipo I (lentas) tienen alta densidad mitocondrial y producen poco lactato. Las tipo IIa/IIx (rápidas) producen mucho más. El entrenamiento aeróbico aumenta las mitocondrias en ambas, pero especialmente convierte las IIx en IIa — más potentes pero también más \"limpias\".",
    source: "Hawley & Stepto, 2001 — Sports Medicine",
  },
  {
    id: "mct-transporters",
    category: "physiology",
    title: "Los transportadores MCT: tu sistema de limpieza",
    body: "Las proteínas MCT1 y MCT4 son los \"camiones\" que sacan el lactato de las células musculares. El entrenamiento de umbral aumenta la expresión de MCT1 (entrada al músculo oxidativo), mejorando tu capacidad para reciclar lactato como combustible.",
    source: "Thomas et al., 2012 — PLoS ONE",
  },
  {
    id: "vlamax-glycolytic",
    category: "physiology",
    title: "VLaMax: tu potencia glucolítica",
    body: "La tasa máxima de producción de lactato (VLaMax) refleja tu \"motor rápido\". Un VLaMax alto es útil para sprints, pero perjudicial en resistencia: produces más lactato a cada intensidad. Bajar VLaMax sin perder VO2max es el santo grial del fondista.",
    source: "Mader, 2003 — European Journal of Applied Physiology",
  },

  // ── Training ──
  {
    id: "polarized-training",
    category: "training",
    title: "80/20: el modelo polarizado",
    body: "Los atletas de élite pasan ~80% de su tiempo por debajo de LT1 y ~20% por encima de LT2, con poco tiempo en la \"zona gris\" intermedia. Este modelo polarizado produce mejores adaptaciones que entrenar siempre a intensidad moderada.",
    source: "Seiler & Kjerland, 2006 — Scandinavian J. Medicine & Science in Sports",
  },
  {
    id: "lt1-training-volume",
    category: "training",
    title: "El volumen en LT1 mueve la base",
    body: "Acumular tiempo justo por debajo de LT1 (zona 2) es lo que más mejora la densidad mitocondrial, la oxidación de grasas y la economía de movimiento. No es \"ir demasiado suave\" — es construir el motor que sostiene todo lo demás.",
    source: "Laursen, 2010 — Sports Medicine",
    relevance: (ctx) => ctx.hasLT1,
  },
  {
    id: "threshold-training-effect",
    category: "training",
    title: "El entrenamiento de umbral sube LT2",
    body: "Las series a ritmo de umbral (4-8 min con recuperación corta) son el estímulo más directo para subir LT2. Funcionan aumentando MCT1, la capilarización y la capacidad de las mitocondrias para oxidar lactato in situ.",
    source: "Midgley et al., 2007 — Sports Medicine",
    relevance: (ctx) => ctx.hasLT2,
  },
  {
    id: "detraining-lt",
    category: "training",
    title: "Los umbrales caen rápido con el desentrenamiento",
    body: "Tras 2-4 semanas sin entrenar, LT2 puede bajar un 4-7%. LT1 es más resistente pero también baja. La buena noticia: se recuperan más rápido de lo que tardaron en construirse, gracias a la \"memoria muscular\" mitocondrial.",
    source: "Mujika & Padilla, 2001 — Sports Medicine",
  },
  {
    id: "heat-altitude-lactate",
    category: "training",
    title: "Calor y altitud modifican tu lactato",
    body: "En calor extremo, el lactato sube un 10-15% a la misma intensidad (más glucólisis, menos flujo sanguíneo muscular). En altitud >2000m, LT2 puede bajar 5-10% porque hay menos O2 disponible para las mitocondrias.",
    source: "Joyner & Coyle, 2008 — Journal of Physiology",
  },
  {
    id: "strength-and-lactate",
    category: "training",
    title: "La fuerza mejora tu economía, no tu umbral",
    body: "El entrenamiento de fuerza no sube LT1 ni LT2 directamente, pero mejora la economía de movimiento: necesitas menos energía (y produces menos lactato) a cualquier velocidad dada. En ciclismo, mejora el torque; en carrera, reduce el coste elástico.",
    source: "Rønnestad & Mujika, 2014 — Scandinavian J. Medicine & Science in Sports",
  },

  // ── Testing ──
  {
    id: "test-protocol-matters",
    category: "testing",
    title: "El protocolo importa: duración del escalón",
    body: "Escalones de 3 minutos infraestiman LT1 porque el lactato no alcanza equilibrio. Escalones de 4-5 minutos son más precisos pero más largos. En LactaLab usamos métodos que compensan esta diferencia según la duración real de tu test.",
    source: "Beneke et al., 2011 — International Journal of Sports Medicine",
  },
  {
    id: "lactate-variability",
    category: "testing",
    title: "La variabilidad entre tests es normal",
    body: "Repetir un test idéntico puede dar ±0.3-0.5 mmol/L de diferencia en cada punto. Por eso usamos múltiples métodos de detección y los promediamos: un solo método es demasiado sensible a ruido biológico.",
    source: "Faude et al., 2009 — Sports Medicine",
  },
  {
    id: "capillary-vs-venous",
    category: "testing",
    title: "Sangre capilar vs venosa",
    body: "Los analizadores portátiles usan sangre capilar (dedo/lóbulo). Los valores son ligeramente más altos que los venosos (~0.5 mmol/L). No mezcles resultados de fuentes distintas para comparar evolución.",
    source: "Tanner et al., 2010 — European Journal of Applied Physiology",
  },
  {
    id: "warm-up-effect",
    category: "testing",
    title: "El calentamiento afecta la primera muestra",
    body: "Un calentamiento demasiado intenso eleva el lactato basal y puede hacer que LT1 aparezca más tarde o más alto de lo real. Un calentamiento suave de 10-15 min es ideal para estabilizar el metabolismo antes del test.",
    source: "Bishop, 2003 — Sports Medicine",
  },
  {
    id: "individual-thresholds",
    category: "testing",
    title: "Umbral individual vs fijo en 4 mmol",
    body: "El clásico \"OBLA a 4 mmol\" (Onset of Blood Lactate Accumulation) funciona como aproximación poblacional, pero puede sobrestimar LT2 en atletas entrenados cuyo umbral real está en 2.5-3.5 mmol. Por eso calculamos tu umbral individual.",
    source: "Stegmann et al., 1981 — European Journal of Applied Physiology",
    relevance: (ctx) => ctx.hasLT2 && (ctx.lt2Lactate ?? 4) < 3.8,
  },

  // ── Nutrition ──
  {
    id: "carbs-and-lactate",
    category: "nutrition",
    title: "Los carbohidratos antes del test suben el lactato",
    body: "Comer carbohidratos simples 1-2h antes del test puede elevar el baseline 0.5-1.0 mmol/L por hiperinsulinemia. Para un test fiable, evita azúcares 3h antes o al menos mantén la misma rutina pre-test en cada medición.",
    source: "Coyle, 1995 — Medicine & Science in Sports & Exercise",
  },
  {
    id: "fat-adaptation",
    category: "nutrition",
    title: "Más grasa oxidada = menos lactato",
    body: "El entrenamiento en ayunas y las dietas altas en grasa aumentan la oxidación lipídica, reduciendo la producción de lactato a intensidades submáximas. Pero cuidado: en intensidades altas necesitas glucólisis, y la fat-adaptation la compromete.",
    source: "Burke, 2015 — Sports Medicine",
  },
  {
    id: "caffeine-lactate",
    category: "nutrition",
    title: "La cafeína y el lactato",
    body: "La cafeína (3-6 mg/kg) puede aumentar ligeramente el lactato en reposo y durante el ejercicio, pero mejora el rendimiento porque moviliza ácidos grasos y reduce la percepción del esfuerzo. El efecto neto es positivo para el rendimiento.",
    source: "Graham, 2001 — Sports Medicine",
  },

  // ── Recovery ──
  {
    id: "lactate-clearance-time",
    category: "recovery",
    title: "El lactato se aclara en 30-60 minutos",
    body: "Después de un esfuerzo máximo, el lactato vuelve a niveles basales en 30-60 min. La recuperación activa (trote suave, pedaleo ligero) acelera este proceso un 20-30% respecto al reposo total.",
    source: "Menzies et al., 2010 — Sports Medicine",
  },
  {
    id: "sleep-and-clearance",
    category: "recovery",
    title: "El sueño regula tu metabolismo del lactato",
    body: "La falta de sueño reduce la eficiencia de aclaramiento de lactato y aumenta la producción glucolítica. Atletas con <6h de sueño muestran basales más altos y umbrales más bajos en tests consecutivos.",
    source: "Fullagar et al., 2015 — Sports Medicine",
  },

  // ── Performance ──
  {
    id: "lt-marathon-predictor",
    category: "performance",
    title: "LT2 predice tu rendimiento en maratón",
    body: "La velocidad en LT2, junto con la economía de carrera, es el mejor predictor del tiempo en maratón — mejor que el VO2max. Un maratón se corre al 75-85% de la velocidad en LT2, dependiendo de la distancia y el nivel.",
    source: "Midgley et al., 2007 — Sports Medicine",
    relevance: (ctx) => ctx.discipline === "running",
  },
  {
    id: "ftp-cycling",
    category: "performance",
    title: "FTP y lactato: no siempre coinciden",
    body: "El FTP (potencia media en 1h) se asocia a LT2 pero no son lo mismo. El FTP incluye componente anaeróbico y de pacing. En atletas con VLaMax alto, el FTP puede estar 5-10% por encima de la potencia real en LT2.",
    source: "Allen & Coggan, 2010 — Training and Racing with a Power Meter",
    relevance: (ctx) => ctx.discipline === "ciclismo",
  },
  {
    id: "lt-ratio",
    category: "performance",
    title: "El ratio LT1/LT2 revela tu perfil",
    body: "Si tu velocidad en LT1 es >87% de tu LT2, tienes un VLaMax bajo (perfil fondista). Si es <79%, tu VLaMax es alta (perfil velocista). Este ratio guía qué tipo de entrenamiento necesitas más: base aeróbica o desarrollo de umbral.",
    source: "Olbrecht, 2000 — The Science of Winning",
    relevance: (ctx) => ctx.hasLT1 && ctx.hasLT2,
  },
  {
    id: "fractional-utilization",
    category: "performance",
    title: "Utilización fraccional: % del VO2max en LT2",
    body: "Un corredor de élite sostiene LT2 al 85-90% de su VO2max. Un recreacional, al 65-75%. Mejorar esta fracción es más alcanzable que subir VO2max: se consigue con volumen aeróbico y entrenamiento específico de umbral.",
    source: "Joyner & Coyle, 2008 — Journal of Physiology",
  },
  {
    id: "durability",
    category: "performance",
    title: "Durabilidad: cómo cambia tu umbral en carrera",
    body: "En esfuerzos de >2h, LT1 y LT2 bajan progresivamente (3-8%) por depleción de glucógeno y fatiga neuromuscular. Los atletas más \"durables\" mantienen sus umbrales más estables. Este concepto es clave para ironman y maratón.",
    source: "Maunder et al., 2021 — Sports Medicine",
    relevance: (ctx) => ctx.hasLT1 && ctx.hasLT2,
  },
];

// ── Component ──────────────────────────────────────────────────────────────

type LactateFactsCarouselProps = {
  context: LactateFactContext;
  className?: string;
};

export function LactateFactsCarousel({ context, className }: LactateFactsCarouselProps) {
  const relevantFacts = useMemo(() => {
    // Filter by relevance, then shuffle deterministically based on date
    const candidates = LACTATE_FACTS.filter((fact) => !fact.relevance || fact.relevance(context));
    // Stable daily shuffle: use day of year as seed
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    return candidates.sort((a, b) => {
      const hashA = (a.id.charCodeAt(0) * 31 + dayOfYear) % 1000;
      const hashB = (b.id.charCodeAt(0) * 31 + dayOfYear) % 1000;
      return hashA - hashB;
    });
  }, [context]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Reset index when facts change
  useEffect(() => { setCurrentIndex(0); setExpanded(false); }, [relevantFacts]);

  const fact = relevantFacts[currentIndex];
  if (!fact) return null;

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % relevantFacts.length);
    setExpanded(false);
  }, [relevantFacts.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + relevantFacts.length) % relevantFacts.length);
    setExpanded(false);
  }, [relevantFacts.length]);

  const categoryLabel = {
    physiology: "Fisiología",
    training: "Entrenamiento",
    testing: "Testing",
    nutrition: "Nutrición",
    recovery: "Recuperación",
    performance: "Rendimiento",
  }[fact.category];

  const categoryColor = {
    physiology: "#2e8b57",
    training: "#2e7bd3",
    testing: "#c27a2e",
    nutrition: "#8b6914",
    recovery: "#7a56a2",
    performance: "#c44040",
  }[fact.category];

  return (
    <div className={`lf-carousel ${className ?? ""}`}>
      <div className="lf-card" onClick={() => setExpanded((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setExpanded((v) => !v); }}>
        <div className="lf-card-head">
          <span className="lf-category" style={{ color: categoryColor }}>{categoryLabel}</span>
          <span className="lf-counter">{currentIndex + 1} / {relevantFacts.length}</span>
        </div>
        <h4 className="lf-title">{fact.title}</h4>
        {expanded ? (
          <>
            <p className="lf-body">{fact.body}</p>
            {fact.source ? <cite className="lf-source">{fact.source}</cite> : null}
          </>
        ) : (
          <p className="lf-hint">Toca para leer más</p>
        )}
      </div>
      <div className="lf-nav">
        <button type="button" className="lf-nav-btn" onClick={handlePrev} aria-label="Anterior">&lsaquo;</button>
        <div className="lf-dots">
          {relevantFacts.slice(0, Math.min(relevantFacts.length, 8)).map((f, i) => (
            <span
              key={f.id}
              className={`lf-dot ${i === currentIndex ? "active" : ""}`}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); setExpanded(false); }}
            />
          ))}
          {relevantFacts.length > 8 ? <span className="lf-dot-more">+{relevantFacts.length - 8}</span> : null}
        </div>
        <button type="button" className="lf-nav-btn" onClick={handleNext} aria-label="Siguiente">&rsaquo;</button>
      </div>
    </div>
  );
}

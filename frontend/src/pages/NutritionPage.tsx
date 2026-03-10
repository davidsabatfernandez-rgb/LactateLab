const NUTRITION_PILLARS = [
  {
    title: "Clientes nutrición",
    detail: "Base propia de clientes, independiente del módulo de rendimiento y con enlace opcional a atleta.",
  },
  {
    title: "Planes versionados",
    detail: "Cada propuesta se guarda por fechas y estado para evitar sobrescribir PDFs o indicaciones previas.",
  },
  {
    title: "Equivalencias",
    detail: "Sistema estructurado de sustituciones para reducir errores manuales y mejorar la adherencia.",
  },
  {
    title: "Check-ins",
    detail: "Seguimiento de peso, adherencia, digestión, hambre, energía y sensaciones del cliente.",
  },
] as const;

const NUTRITION_STREAMS = [
  {
    label: "Clientes",
    value: "Entidad propia",
    note: "No depende de `Athlete`",
  },
  {
    label: "Planes",
    value: "Semanal + plantilla",
    note: "Editable y versionable",
  },
  {
    label: "Seguimiento",
    value: "Check-in guiado",
    note: "Estado y adherencia",
  },
  {
    label: "Entrega",
    value: "App primero",
    note: "PDF después",
  },
] as const;

const NEXT_STEPS = [
  "Alta de cliente nutricional con datos base, objetivo, restricciones, preferencias y contexto deportivo.",
  "Creación de plan por tipo de día con comidas, bloques y objetivo nutricional por franja.",
  "Motor de equivalencias para sustituir alimentos sin romper el objetivo del plan.",
  "Check-in periódico con trazabilidad de cambios y ajustes del coach.",
] as const;

export function NutritionPage() {
  return (
    <div className="page-grid">
      <section className="hero nutrition-hero">
        <div className="hero-main">
          <span className="eyebrow">Nutrición</span>
          <h1>Módulo independiente para clientes nutricionales.</h1>
          <p className="nutrition-hero-copy">
            Esta área nace separada del stack de fisiología y planificación. Un cliente de nutrición puede existir sin ser atleta del
            laboratorio, y el vínculo con rendimiento será opcional cuando tenga sentido.
          </p>
        </div>

        <div className="nutrition-hero-metrics">
          {NUTRITION_STREAMS.map((item) => (
            <article key={item.label} className="hero-focus-card nutrition-focus-card">
              <small>{item.label}</small>
              <strong>{item.value}</strong>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card section-card">
        <div className="section-heading">
          <span className="eyebrow">Base del módulo</span>
          <h2 className="section-title">Qué queda preparado desde ya</h2>
          <p className="muted nutrition-section-copy">
            La estructura queda orientada a que Iván gestione cartera, planes y seguimiento sin depender de PDFs manuales ni de la entidad
            deportiva actual.
          </p>
        </div>

        <div className="nutrition-pillars-grid">
          {NUTRITION_PILLARS.map((pillar) => (
            <article key={pillar.title} className="nutrition-pillar-card">
              <h3>{pillar.title}</h3>
              <p>{pillar.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="nutrition-columns">
        <article className="card section-card nutrition-panel">
          <div className="section-heading compact">
            <span className="eyebrow">Decisión de modelo</span>
            <h3 className="section-title">Separación correcta</h3>
          </div>
          <ul className="nutrition-list">
            <li>Los clientes de nutrición no se fuerzan dentro de `Athlete`.</li>
            <li>El enlace con rendimiento se plantea como relación opcional, no como requisito.</li>
            <li>El plan nutricional se diseña como dato estructurado, editable y auditable.</li>
            <li>La exportación PDF queda como capa de salida, no como fuente de verdad.</li>
          </ul>
        </article>

        <article className="card section-card nutrition-panel">
          <div className="section-heading compact">
            <span className="eyebrow">Primer MVP</span>
            <h3 className="section-title">Siguiente desarrollo lógico</h3>
          </div>
          <ol className="nutrition-list nutrition-list-ordered">
            {NEXT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      </section>
    </div>
  );
}

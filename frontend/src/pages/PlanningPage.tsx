export function PlanningPage() {
  return (
    <div className="page-grid">
      <section className="hero card">
        <div>
          <span className="eyebrow">Planificación</span>
          <h1>Prescripción rápida bajo tu criterio</h1>
          <p>
            Esta área está pensada para convertir el análisis fisiológico en semanas de trabajo, sesiones objetivo y decisiones operativas sin repetir trabajo manual.
          </p>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="card status-card">
          <span className="eyebrow">Módulo</span>
          <strong>Semana</strong>
          <p>Organizar la carga por disciplinas, días clave y objetivos reales.</p>
        </article>
        <article className="card status-card">
          <span className="eyebrow">Módulo</span>
          <strong>Sesión</strong>
          <p>Construir bloques precisos desde LT1, LT2, VO2 o trabajo técnico.</p>
        </article>
        <article className="card status-card">
          <span className="eyebrow">Módulo</span>
          <strong>Control</strong>
          <p>Confirmar si lo prescrito sigue teniendo sentido según el dato nuevo.</p>
        </article>
      </section>

      <section className="card split-card">
        <div>
          <h2>Flujo de trabajo recomendado</h2>
          <div className="analysis-ladder">
            <article className="analysis-step">
              <span>01</span>
              <div>
                <strong>Leer el estado del atleta</strong>
                <p>Venir desde Lab con LT1, LT2, W/kg, tendencias y alertas ya entendidas.</p>
              </div>
            </article>
            <article className="analysis-step">
              <span>02</span>
              <div>
                <strong>Elegir objetivo de bloque</strong>
                <p>Base aeróbica, umbral, eficiencia ciclista, economía de carrera o afinamiento competitivo.</p>
              </div>
            </article>
            <article className="analysis-step">
              <span>03</span>
              <div>
                <strong>Construir sin perder tiempo</strong>
                <p>Plantillas reutilizables, parámetros editables y una lógica común por disciplina.</p>
              </div>
            </article>
            <article className="analysis-step">
              <span>04</span>
              <div>
                <strong>Revisar y ajustar</strong>
                <p>La sesión prescrita debe poder retocarse rápido cuando cambie el estado fisiológico.</p>
              </div>
            </article>
          </div>
        </div>
        <div>
          <h2>Lo que debería tener esta raíz</h2>
          <div className="planning-board">
            <article className="planning-card">
              <strong>Semana actual</strong>
              <p>Vista por días, disciplina y objetivo dominante.</p>
            </article>
            <article className="planning-card">
              <strong>Constructor de sesión</strong>
              <p>Bloques tipo LT1, LT2, VO2, técnica, fuerza o recuperación.</p>
            </article>
            <article className="planning-card">
              <strong>Plantillas</strong>
              <p>8x4', 2x20', tempo, tirada, cadencia alta, transición triatlón.</p>
            </article>
            <article className="planning-card">
              <strong>Reglas tuyas</strong>
              <p>Normas personales para progresar, frenar o repetir carga.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="card split-card">
        <div>
          <h2>Prescripción por disciplina</h2>
          <div className="list">
            <div className="list-item">
              <strong>Running</strong>
              <p>Ritmos, duración de bloques, densidad, sesión objetivo y progresión semanal.</p>
            </div>
            <div className="list-item">
              <strong>Ciclismo</strong>
              <p>Potencia absoluta, W/kg, cadencia objetivo y tipo de estímulo según coste metabólico.</p>
            </div>
            <div className="list-item">
              <strong>Natación</strong>
              <p>Bloques técnicos y aeróbicos ajustados al estado general del triatleta.</p>
            </div>
          </div>
        </div>
        <div>
          <h2>Objetivo de producto</h2>
          <div className="list">
            <div className="list-item">
              <strong>No sustituirte</strong>
              <p>La app no prescribe sola; te deja decidir más rápido y con menos fricción.</p>
            </div>
            <div className="list-item">
              <strong>Reducir pasos</strong>
              <p>Ir de dato fisiológico a sesión útil sin tener que rehacer cálculos o revisar notas dispersas.</p>
            </div>
            <div className="list-item warning">
              <strong>Evitar errores de interpretación</strong>
              <p>Todo entreno nace de una lectura coherente del histórico, no de una intuición aislada.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";

type Zone = "LT1" | "LT2" | "VO2max";
type Discipline = "running" | "cycling" | "swimming";

type WorkoutTemplate = {
  title: string;
  plannedDurationMin: number;
  rpeExpected: number;
};

type GeneratedWorkout = {
  id: string;
  title: string;
  discipline: Discipline;
  workoutType: string;
  zone: Zone;
  metabolicFocus: string;
  physiologicalCue: string;
  plannedDurationMin: number;
  rpeExpected: number;
  notes: string;
};

const PAGE_SIZE = 8;
const DEFAULT_WORKOUTS = 5000;
const ZONE_OPTIONS: Array<Zone | "all"> = ["all", "LT1", "LT2", "VO2max"];
const DISCIPLINE_OPTIONS: Array<Discipline | "all"> = ["all", "running", "cycling", "swimming"];

const LIBRARY_TEMPLATES: Record<Discipline, Record<Zone, WorkoutTemplate[]>> = {
  running: {
    LT1: [
      { title: "50' continuo LT1", plannedDurationMin: 50, rpeExpected: 3 },
      { title: "70' base aeróbica LT1", plannedDurationMin: 70, rpeExpected: 3 },
      { title: "3x12' LT1 r3' trote", plannedDurationMin: 60, rpeExpected: 4 },
      { title: "90' tirada aeróbica LT1", plannedDurationMin: 90, rpeExpected: 4 },
    ],
    LT2: [
      { title: "3x10' LT2 r3' trote", plannedDurationMin: 56, rpeExpected: 6 },
      { title: "2x20' LT2 r4' trote", plannedDurationMin: 64, rpeExpected: 6 },
      { title: "4x8' LT2 r2' trote", plannedDurationMin: 56, rpeExpected: 6 },
      { title: "25' tempo LT2", plannedDurationMin: 52, rpeExpected: 6 },
    ],
    VO2max: [
      { title: "6x3' VO2max r3' trote", plannedDurationMin: 58, rpeExpected: 8 },
      { title: "10x1' VO2max r1' trote", plannedDurationMin: 40, rpeExpected: 8 },
      { title: "5x4' VO2max r3' trote", plannedDurationMin: 56, rpeExpected: 9 },
      { title: "3 bloques de 6x30''/30'' VO2max", plannedDurationMin: 48, rpeExpected: 8 },
    ],
  },
  cycling: {
    LT1: [
      { title: "90' fondo LT1", plannedDurationMin: 90, rpeExpected: 3 },
      { title: "2h fondo LT1", plannedDurationMin: 120, rpeExpected: 4 },
      { title: "3x20' LT1 r5' suave", plannedDurationMin: 95, rpeExpected: 4 },
      { title: "75' cadencia estable LT1", plannedDurationMin: 75, rpeExpected: 3 },
    ],
    LT2: [
      { title: "3x12' LT2 r6' suave", plannedDurationMin: 78, rpeExpected: 6 },
      { title: "2x20' LT2 r8' suave", plannedDurationMin: 86, rpeExpected: 6 },
      { title: "4x8' LT2 r4' suave", plannedDurationMin: 72, rpeExpected: 7 },
      { title: "1x35' tempo LT2", plannedDurationMin: 70, rpeExpected: 6 },
    ],
    VO2max: [
      { title: "5x4' VO2max r4' suave", plannedDurationMin: 68, rpeExpected: 8 },
      { title: "6x3' VO2max r3' suave", plannedDurationMin: 66, rpeExpected: 8 },
      { title: "2 bloques de 8x30''/30'' VO2max", plannedDurationMin: 60, rpeExpected: 8 },
      { title: "4x5' VO2max r5' suave", plannedDurationMin: 70, rpeExpected: 9 },
    ],
  },
  swimming: {
    LT1: [
      { title: "2400m continuo LT1", plannedDurationMin: 50, rpeExpected: 3 },
      { title: "3x600m LT1 c/45''", plannedDurationMin: 58, rpeExpected: 4 },
      { title: "4x400m LT1 c/30''", plannedDurationMin: 56, rpeExpected: 4 },
      { title: "2x800m LT1 c/1'", plannedDurationMin: 54, rpeExpected: 4 },
    ],
    LT2: [
      { title: "12x200m LT2 c/20''", plannedDurationMin: 64, rpeExpected: 6 },
      { title: "6x300m LT2 c/30''", plannedDurationMin: 60, rpeExpected: 6 },
      { title: "3x800m LT2 c/45''", plannedDurationMin: 68, rpeExpected: 7 },
      { title: "2x(4x100m LT2 c/15'') r2'", plannedDurationMin: 52, rpeExpected: 6 },
    ],
    VO2max: [
      { title: "20x100m VO2max c/20''", plannedDurationMin: 60, rpeExpected: 8 },
      { title: "16x50m VO2max c/30''", plannedDurationMin: 46, rpeExpected: 8 },
      { title: "8x200m VO2max c/40''", plannedDurationMin: 58, rpeExpected: 9 },
      { title: "3 bloques de 6x50m VO2max c/20''", plannedDurationMin: 48, rpeExpected: 8 },
    ],
  },
};

function randomChoice<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedZone(): Zone {
  const value = Math.random();
  if (value < 0.5) return "LT1";
  if (value < 0.85) return "LT2";
  return "VO2max";
}

function weightedDiscipline(): Discipline {
  const value = Math.random();
  if (value < 0.36) return "running";
  if (value < 0.71) return "cycling";
  return "swimming";
}

function disciplineLabel(discipline: Discipline | "all") {
  if (discipline === "running") return "Carrera a pie";
  if (discipline === "cycling") return "Ciclismo";
  if (discipline === "swimming") return "Natación";
  return "Todas";
}

function disciplineCode(discipline: Discipline) {
  if (discipline === "running") return "RUN";
  if (discipline === "cycling") return "BIKE";
  return "SWIM";
}

function focusLabel(zone: Zone) {
  if (zone === "LT1") return "Base aeróbica / LT1";
  if (zone === "LT2") return "LT2 / tolerancia al umbral";
  return "VO2max / potencia aeróbica";
}

function physiologicalCue(discipline: Discipline, zone: Zone) {
  if (discipline === "running" && zone === "LT1") return "Mejorar eficiencia aeróbica y sostener lactato estable sin deriva excesiva.";
  if (discipline === "running" && zone === "LT2") return "Acumular minutos cerca del máximo estado estable con zancada todavía controlada.";
  if (discipline === "running" && zone === "VO2max") return "Elevar consumo de oxígeno y tolerar alta ventilación sin perder calidad mecánica.";
  if (discipline === "cycling" && zone === "LT1") return "Construir fondo útil con baja fatiga residual y estabilidad de cadencia.";
  if (discipline === "cycling" && zone === "LT2") return "Sostener potencia de umbral y tolerar carga continua con fatiga progresiva manejable.";
  if (discipline === "cycling" && zone === "VO2max") return "Aumentar potencia aeróbica y repetir esfuerzos altos con recuperación incompleta.";
  if (discipline === "swimming" && zone === "LT1") return "Consolidar base aeróbica y economía acuática con técnica sostenible.";
  if (discipline === "swimming" && zone === "LT2") return "Acumular trabajo de umbral con control del ritmo y degradación técnica mínima.";
  return "Generar tiempo útil a alta intensidad manteniendo frecuencia y calidad de brazada.";
}

function contextualNote(discipline: Discipline, zone: Zone) {
  if (discipline === "running" && zone === "LT1") return "Sesión extensiva para semanas de acumulación, recuperación activa o consolidación de base.";
  if (discipline === "running" && zone === "LT2") return "Sesión de desarrollo del umbral para bloques específicos de 10k, media maratón o triatlón.";
  if (discipline === "running" && zone === "VO2max") return "Sesión de alta densidad para elevar techo aeróbico cuando el atleta ya tolera carga previa.";
  if (discipline === "cycling" && zone === "LT1") return "Sesión de fondo orientada a mejorar oxidación periférica y resistencia a la fatiga de larga duración.";
  if (discipline === "cycling" && zone === "LT2") return "Sesión útil para cronos, triatlón o fases de construcción con foco en potencia sostenible.";
  if (discipline === "cycling" && zone === "VO2max") return "Sesión agresiva para bloques de desarrollo, mejor cuando el atleta llega con base consolidada.";
  if (discipline === "swimming" && zone === "LT1") return "Sesión aeróbica para sumar metros de calidad sin deterioro técnico significativo.";
  if (discipline === "swimming" && zone === "LT2") return "Sesión de ritmo controlado para fijar paso de competición y tolerancia al lactato moderado.";
  return "Sesión intensa para nadadores con buen soporte técnico que necesitan elevar velocidad aeróbica.";
}

function buildWorkout(index: number): GeneratedWorkout {
  const discipline = weightedDiscipline();
  const zone = weightedZone();
  const template = randomChoice(LIBRARY_TEMPLATES[discipline][zone]);

  return {
    id: `${disciplineCode(discipline)}-${String(index + 1).padStart(5, "0")}`,
    title: template.title,
    discipline,
    workoutType: disciplineLabel(discipline),
    zone,
    metabolicFocus: focusLabel(zone),
    physiologicalCue: physiologicalCue(discipline, zone),
    plannedDurationMin: template.plannedDurationMin,
    rpeExpected: template.rpeExpected,
    notes: contextualNote(discipline, zone),
  };
}

function createLibrary(total: number) {
  return Array.from({ length: total }, (_, index) => buildWorkout(index));
}

function zoneTone(zone: Zone) {
  if (zone === "LT1") return "positive";
  if (zone === "LT2") return "medium";
  return "low";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function downloadCsv(rows: GeneratedWorkout[]) {
  const headers = [
    "ID",
    "Discipline",
    "Title",
    "Zone",
    "Target_Fisiologico",
    "PlannedDuration_min",
    "RPE_Expected",
    "Contexto_Fisiologico",
    "Notes",
  ];
  const escapeCell = (value: string | number) => `"${String(value).replace(/"/g, "\"\"")}"`;
  const body = rows.map((row) =>
    [
      row.id,
      row.workoutType,
      row.title,
      row.zone,
      row.metabolicFocus,
      row.plannedDurationMin,
      row.rpeExpected,
      row.physiologicalCue,
      row.notes,
    ].map(escapeCell).join(","),
  );
  const content = `\uFEFF${headers.join(",")}\n${body.join("\n")}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Biblioteca_Entrenos_Atletas.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function LibraryGeneratorPage() {
  const [requestedCount, setRequestedCount] = useState(String(DEFAULT_WORKOUTS));
  const [workouts, setWorkouts] = useState<GeneratedWorkout[]>([]);
  const [zoneFilter, setZoneFilter] = useState<Zone | "all">("all");
  const [disciplineFilter, setDisciplineFilter] = useState<Discipline | "all">("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setWorkouts(createLibrary(DEFAULT_WORKOUTS));
  }, []);

  const filteredWorkouts = useMemo(() => workouts.filter((workout) => {
    const zoneMatches = zoneFilter === "all" || workout.zone === zoneFilter;
    const disciplineMatches = disciplineFilter === "all" || workout.discipline === disciplineFilter;
    return zoneMatches && disciplineMatches;
  }), [disciplineFilter, workouts, zoneFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredWorkouts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedWorkouts = filteredWorkouts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [disciplineFilter, zoneFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const zoneCounts = useMemo(() => ({
    LT1: workouts.filter((workout) => workout.zone === "LT1").length,
    LT2: workouts.filter((workout) => workout.zone === "LT2").length,
    VO2max: workouts.filter((workout) => workout.zone === "VO2max").length,
  }), [workouts]);

  const disciplineCounts = useMemo(() => ({
    running: workouts.filter((workout) => workout.discipline === "running").length,
    cycling: workouts.filter((workout) => workout.discipline === "cycling").length,
    swimming: workouts.filter((workout) => workout.discipline === "swimming").length,
  }), [workouts]);

  const averageDuration = Math.round(average(filteredWorkouts.map((workout) => workout.plannedDurationMin)));
  const averageRpe = Number(average(filteredWorkouts.map((workout) => workout.rpeExpected)).toFixed(1));

  function handleGenerate() {
    const total = Number(requestedCount);
    const safeTotal = Number.isFinite(total) ? Math.min(Math.max(Math.round(total), 1), 20000) : DEFAULT_WORKOUTS;
    setRequestedCount(String(safeTotal));
    setWorkouts(createLibrary(safeTotal));
    setPage(1);
  }

  return (
    <div className="page-grid">
      <section className="hero library-compact-hero">
        <div className="hero-main">
          <span className="eyebrow">Librería Generator</span>
          <h1>Biblioteca sintética con lógica fisiológica</h1>
          <p>
            Generador visual de sesiones para carrera a pie, ciclismo y natación. Cada tarjeta nace con una estructura cerrada, una duración coherente y un objetivo fisiológico explícito.
          </p>
        </div>
        <div className="library-compact-metrics">
          <div className="hero-focus-card current">
            <small>Sesiones</small>
            <strong>{workouts.length}</strong>
            <p>Biblioteca generada en navegador</p>
          </div>
          <div className="hero-focus-card">
            <small>Filtro activo</small>
            <strong>{disciplineLabel(disciplineFilter)}</strong>
            <p>{zoneFilter === "all" ? "Todas las zonas" : zoneFilter}</p>
          </div>
          <div className="hero-focus-card">
            <small>Duración media</small>
            <strong>{averageDuration || 0} min</strong>
            <p>Promedio del subconjunto visible</p>
          </div>
          <div className="hero-focus-card evaluation">
            <small>RPE medio</small>
            <strong>{averageRpe || 0}/10</strong>
            <p>Exigencia prevista del subconjunto filtrado</p>
          </div>
        </div>
      </section>

      <section className="card section-card library-compact-toolbar">
        <div className="generator-controls">
          <label className="generator-control">
            <span>Total de entrenos</span>
            <input
              type="number"
              min="1"
              max="20000"
              value={requestedCount}
              onChange={(event) => setRequestedCount(event.target.value)}
            />
          </label>

          <div className="generator-actions">
            <button type="button" className="primary-button" onClick={handleGenerate}>
              Generar librería
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => downloadCsv(filteredWorkouts)}
              disabled={!filteredWorkouts.length}
            >
              Descargar CSV
            </button>
          </div>
        </div>

        <div className="library-discipline-row">
          {DISCIPLINE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`discipline-tab ${disciplineFilter === option ? "active" : ""}`}
              onClick={() => setDisciplineFilter(option)}
            >
              {option === "all" ? "Todas" : disciplineLabel(option)}
            </button>
          ))}
        </div>

        <div className="library-block-row">
          {ZONE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`planning-chip ${zoneFilter === option ? "active" : ""}`}
              onClick={() => setZoneFilter(option)}
            >
              {option === "all" ? "Todas" : option}
            </button>
          ))}
        </div>

        <div className="library-block-row">
          <span className="planning-chip active">Carrera {disciplineCounts.running}</span>
          <span className="planning-chip active">Ciclismo {disciplineCounts.cycling}</span>
          <span className="planning-chip active">Natación {disciplineCounts.swimming}</span>
          <span className="planning-chip active">LT1 {zoneCounts.LT1}</span>
          <span className="planning-chip active">LT2 {zoneCounts.LT2}</span>
          <span className="planning-chip active">VO2max {zoneCounts.VO2max}</span>
        </div>
      </section>

      <section className="library-compact-grid">
        {paginatedWorkouts.map((workout) => (
          <article key={workout.id} className="library-compact-card">
            <div className="library-compact-card-head">
              <div className="library-template-meta">
                <span className={`status-badge ${zoneTone(workout.zone)}`}>{workout.zone}</span>
                <span className="threshold-meta-pill neutral">{workout.id}</span>
              </div>
              <h3>{workout.title}</h3>
            </div>

            <p className="library-compact-summary">{workout.notes}</p>

            <div className="library-compact-kpis">
              <div className="library-compact-kpi">
                <small>Disciplina</small>
                <strong>{workout.workoutType}</strong>
              </div>
              <div className="library-compact-kpi">
                <small>Duración prevista</small>
                <strong>{workout.plannedDurationMin} min</strong>
              </div>
            </div>

            <div className="library-compact-columns">
              <div>
                <small>Control fisiológico</small>
                <div className="library-variable-stack">
                  <span className="library-variable-pill">
                    <strong>Target fisiológico</strong>
                    <span>{workout.metabolicFocus}</span>
                  </span>
                  <span className="library-variable-pill">
                    <strong>Contexto fisiológico</strong>
                    <span>{workout.physiologicalCue}</span>
                  </span>
                  <span className="library-variable-pill">
                    <strong>Percepción esperada</strong>
                    <span>RPE {workout.rpeExpected}/10</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="library-compact-footer">
              <span className="planning-chip">{workout.zone}</span>
              <span className="planning-chip">{workout.workoutType}</span>
              <span className="planning-chip">{workout.plannedDurationMin} min</span>
            </div>
          </article>
        ))}
      </section>

      {filteredWorkouts.length > PAGE_SIZE ? (
        <section className="card section-card library-pagination">
          <button
            type="button"
            className="ghost-button"
            disabled={safePage <= 1}
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
          >
            Anterior
          </button>
          <p className="muted">
            Mostrando {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredWorkouts.length)} de {filteredWorkouts.length}
          </p>
          <button
            type="button"
            className="ghost-button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
          >
            Siguiente
          </button>
        </section>
      ) : null}
    </div>
  );
}

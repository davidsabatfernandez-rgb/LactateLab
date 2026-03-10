import { PhysiologyReport, PhysiologyReportStage, PhysiologyReportThreshold } from "../types";

function formatDate(value?: string | null) {
  if (!value) return "n/d";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function disciplineLabel(discipline: string) {
  if (discipline === "running") return "Carrera a pie";
  if (discipline === "ciclismo") return "Ciclismo";
  if (discipline === "natación") return "Natación";
  if (discipline === "triatlón") return "Triatlón";
  return discipline;
}

function objectiveShiftCopy(report: PhysiologyReport) {
  if (report.profile_tag === "Perfil con sesgo glucolítico") {
    return {
      headline: "Objetivo del bloque: desplazar LT1 y ensanchar la base aeróbica",
      note: "Queremos que el atleta tolere más trabajo útil antes de empezar a acumular lactato demasiado pronto.",
      currentLt1: 34,
      currentLt2: 66,
      targetLt1: 46,
      targetLt2: 74,
    };
  }
  return {
    headline: "Objetivo del bloque: sostener LT1 y desplazar LT2 hacia la derecha",
    note: "Queremos que el atleta mantenga la base actual y sea capaz de sostener más ritmo o potencia específica con menor coste interno.",
    currentLt1: 38,
    currentLt2: 68,
    targetLt1: 40,
    targetLt2: 80,
  };
}

function LactateCurveFigure({ report }: { report: PhysiologyReport }) {
  const width = 760;
  const height = 260;
  const padX = 56;
  const padY = 28;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padY * 2 - 18;
  const stages = report.stages;
  const loads = stages.map((stage) => stage.load_value);
  const lactates = stages.map((stage) => stage.lactate_mmol);
  const minLoad = Math.min(...loads);
  const maxLoad = Math.max(...loads);
  const maxLactate = Math.max(...lactates, 4.6);

  const mapX = (value: number) => {
    if (maxLoad === minLoad) return padX + plotWidth / 2;
    if (report.discipline === "ciclismo") {
      return padX + ((value - minLoad) / (maxLoad - minLoad)) * plotWidth;
    }
    return padX + ((maxLoad - value) / (maxLoad - minLoad)) * plotWidth;
  };

  const mapY = (value: number) => padY + plotHeight - (value / maxLactate) * plotHeight;

  const polyline = stages.map((stage) => `${mapX(stage.load_value)},${mapY(stage.lactate_mmol)}`).join(" ");

  return (
    <figure className="physiology-report-figure">
      <figcaption>
        <span>Curva de lactato</span>
        <strong>Lectura actual del test incremental</strong>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Curva de lactato del test incremental">
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
        {[1, 2, 3, 4].map((step) => {
          const value = (maxLactate / 4) * step;
          const y = mapY(value);
          return (
            <g key={step}>
              <line x1={padX} y1={y} x2={padX + plotWidth} y2={y} stroke="#d7dade" strokeDasharray="4 4" strokeWidth="1" />
              <text x="8" y={y + 4} fontSize="11" fill="#60656b">{value.toFixed(1)}</text>
            </g>
          );
        })}
        <line x1={padX} y1={padY} x2={padX} y2={padY + plotHeight} stroke="#171717" strokeWidth="1.2" />
        <line x1={padX} y1={padY + plotHeight} x2={padX + plotWidth} y2={padY + plotHeight} stroke="#171717" strokeWidth="1.2" />
        <polyline fill="none" stroke="#111111" strokeWidth="2.2" points={polyline} />
        {report.thresholds.map((threshold) => {
          if (threshold.metric_value == null) return null;
          const x = mapX(threshold.metric_value);
          const y = threshold.name.includes("LT1") ? padY + 10 : padY + 28;
          return (
            <g key={threshold.name}>
              <line x1={x} y1={padY} x2={x} y2={padY + plotHeight} stroke="#9a3d00" strokeDasharray="6 4" strokeWidth="1.2" />
              <text x={x + 6} y={y} fontSize="11" fill="#9a3d00">{threshold.name}</text>
            </g>
          );
        })}
        {stages.map((stage) => {
          const x = mapX(stage.load_value);
          const y = mapY(stage.lactate_mmol);
          return (
            <g key={stage.stage_number}>
              <circle cx={x} cy={y} r="3.3" fill="#111111" />
              <text x={x - 4} y={y - 8} fontSize="10" fill="#60656b">{stage.stage_number}</text>
            </g>
          );
        })}
        <text x={width / 2 - 36} y={height - 8} fontSize="11" fill="#60656b">Carga externa</text>
        <text x="8" y="16" fontSize="11" fill="#60656b">Lactato (mmol/L)</text>
      </svg>
    </figure>
  );
}

function ThresholdTrajectoryFigure({ report }: { report: PhysiologyReport }) {
  const shift = objectiveShiftCopy(report);
  return (
    <figure className="physiology-report-figure physiology-report-trajectory">
      <figcaption>
        <span>Dirección objetivo</span>
        <strong>{shift.headline}</strong>
      </figcaption>
      <div className="trajectory-lanes">
        <div className="trajectory-lane">
          <span>Hoy</span>
          <div className="trajectory-track">
            <div className="trajectory-marker current" style={{ left: `${shift.currentLt1}%` }}>
              <small>LT1</small>
              <strong>{report.thresholds[0]?.metric_label ?? "n/d"}</strong>
            </div>
            <div className="trajectory-marker current" style={{ left: `${shift.currentLt2}%` }}>
              <small>LT2</small>
              <strong>{report.thresholds[1]?.metric_label ?? "n/d"}</strong>
            </div>
          </div>
        </div>
        <div className="trajectory-lane">
          <span>Objetivo</span>
          <div className="trajectory-track objective">
            <div className="trajectory-marker target" style={{ left: `${shift.targetLt1}%` }}>
              <small>LT1</small>
              <strong>más a la derecha</strong>
            </div>
            <div className="trajectory-marker target" style={{ left: `${shift.targetLt2}%` }}>
              <small>LT2</small>
              <strong>más sostenible</strong>
            </div>
          </div>
        </div>
      </div>
      <p>{shift.note}</p>
    </figure>
  );
}

function ZoneAccent(index: number) {
  const accents = ["#dcdcdc", "#c6d2c8", "#d9d1bc", "#ddc2b8", "#d6b0a3", "#c8b5b5"];
  return accents[index % accents.length];
}

function reportSectionMap(report: PhysiologyReport) {
  const byKey = new Map(report.sections.map((section) => [section.key, section]));
  return {
    lactate: byKey.get("lactate_sampling"),
    zones: byKey.get("training_zones"),
    conclusions: byKey.get("conclusions"),
    future: byKey.get("future_plan"),
  };
}

function ReferenceBlock({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="physiology-report-reference">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ThresholdMiniTable({ thresholds }: { thresholds: PhysiologyReportThreshold[] }) {
  return (
    <div className="physiology-report-threshold-table">
      {thresholds.map((threshold) => (
        <article key={threshold.name} className="physiology-report-threshold-row">
          <div>
            <span>{threshold.name}</span>
            <strong>{threshold.metric_label}</strong>
          </div>
          <p>{threshold.anchor_mmol.toFixed(1)} mmol/L{threshold.heart_rate_bpm ? ` · ${threshold.heart_rate_bpm} bpm` : ""}</p>
        </article>
      ))}
    </div>
  );
}

function StageTable({ stages }: { stages: PhysiologyReportStage[] }) {
  return (
    <div className="physiology-report-stage-table editorial">
      <div className="physiology-report-stage-head">
        <span>Etapa</span>
        <span>Carga</span>
        <span>FC</span>
        <span>Lactato</span>
        <span>Duración</span>
      </div>
      {stages.map((stage) => (
        <div key={stage.stage_number} className="physiology-report-stage-row">
          <span>{stage.stage_number}</span>
          <span>{stage.load_label}</span>
          <span>{stage.heart_rate_bpm ? `${stage.heart_rate_bpm} bpm` : "n/d"}</span>
          <span>{stage.lactate_mmol.toFixed(1)} mmol/L</span>
          <span>{formatClock(stage.duration_seconds)}</span>
        </div>
      ))}
    </div>
  );
}

export function PhysiologyReportPreview({ report }: { report: PhysiologyReport }) {
  const sections = reportSectionMap(report);

  return (
    <div className="physiology-report-preview editorial">
      <header className="physiology-report-heading">
        <div>
          <p className="physiology-report-kicker">Informe fisiológico aplicado</p>
          <h2>{report.profile.full_name}</h2>
          <p className="physiology-report-subtitle">
            {disciplineLabel(report.discipline)} · Test incremental del {formatDate(report.test_summary.performed_at)}
          </p>
        </div>
        <dl className="physiology-report-meta">
          <div>
            <dt>Perfil</dt>
            <dd>{report.profile_tag}</dd>
          </div>
          <div>
            <dt>Objetivo</dt>
            <dd>{report.profile.performance_goal ?? "Sin objetivo cargado"}</dd>
          </div>
          <div>
            <dt>Referencia</dt>
            <dd>{report.profile.target_competition ?? "Sin referencia competitiva"}</dd>
          </div>
        </dl>
      </header>

      <section className="physiology-report-summary-strip">
        <ReferenceBlock
          title="Atleta"
          value={report.profile.full_name}
          detail={`${report.profile.age ? `${report.profile.age} años` : "Edad n/d"} · ${report.profile.sex ?? "Sexo n/d"} · ${report.profile.weight_kg ?? "n/d"} kg`}
        />
        <ReferenceBlock
          title="Test"
          value={`${report.test_summary.stage_count} etapas válidas`}
          detail={`${report.test_summary.load_start_label} a ${report.test_summary.load_end_label}`}
        />
        <ReferenceBlock
          title="LT1 / LT2"
          value={`${report.thresholds[0]?.metric_label ?? "n/d"} · ${report.thresholds[1]?.metric_label ?? "n/d"}`}
          detail="Anclajes fisiológicos operativos del informe"
        />
        <ReferenceBlock
          title="Pico de lactato"
          value={`${report.test_summary.peak_lactate_mmol.toFixed(1)} mmol/L`}
          detail={`Duración media de etapa: ${formatClock(report.test_summary.average_stage_duration_seconds)}`}
        />
      </section>

      <section className="physiology-report-editorial-section">
        <div className="physiology-report-section-head">
          <span>I</span>
          <div>
            <h3>Tomas de lactato</h3>
            <p>{sections.lactate?.body[0] ?? "Lectura técnica del test incremental."}</p>
          </div>
        </div>
        <div className="physiology-report-two-column">
          <LactateCurveFigure report={report} />
          <div className="physiology-report-stack">
            <ThresholdMiniTable thresholds={report.thresholds} />
            {sections.lactate?.body.slice(1).map((paragraph) => (
              <p key={paragraph} className="physiology-report-body-copy">{paragraph}</p>
            ))}
          </div>
        </div>
        <StageTable stages={report.stages} />
      </section>

      <section className="physiology-report-editorial-section">
        <div className="physiology-report-section-head">
          <span>II</span>
          <div>
            <h3>Zonas de entreno</h3>
            <p>{sections.zones?.body[0] ?? "Traducción práctica de los umbrales a entrenamiento diario."}</p>
          </div>
        </div>
        <div className="physiology-report-zones-editorial">
          {report.zones.map((zone, index) => (
            <article key={zone.zone} className="physiology-report-zone-editorial" style={{ borderLeftColor: ZoneAccent(index) }}>
              <div>
                <span>{zone.zone}</span>
                <strong>{zone.primary_label}</strong>
              </div>
              <p>{zone.objective}</p>
              <small>{zone.heart_rate_label ?? "FC no disponible"}</small>
            </article>
          ))}
        </div>
        {sections.zones?.body.slice(1).map((paragraph) => (
          <p key={paragraph} className="physiology-report-body-copy">{paragraph}</p>
        ))}
      </section>

      <section className="physiology-report-editorial-section">
        <div className="physiology-report-section-head">
          <span>III</span>
          <div>
            <h3>Conclusiones</h3>
            <p>Lectura práctica para entrenador y atleta.</p>
          </div>
        </div>
        <div className="physiology-report-prose">
          {(sections.conclusions?.body ?? report.final_coach_summary).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="physiology-report-editorial-section">
        <div className="physiology-report-section-head">
          <span>IV</span>
          <div>
            <h3>Plan a futuro</h3>
            <p>Dirección de cambio del siguiente bloque y referencia para comparar el próximo retest.</p>
          </div>
        </div>
        <div className="physiology-report-two-column plan">
          <ThresholdTrajectoryFigure report={report} />
          <div className="physiology-report-prose compact">
            {(sections.future?.body ?? []).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {report.individual_thresholds.length ? (
              <p>
                El informe ya dispone de referencia individual longitudinal, así que en los próximos meses se podrá comparar no solo el test actual,
                sino también si el atleta se acerca a su propio histórico útil.
              </p>
            ) : (
              <p>{report.individual_threshold_note ?? "Todavía no hay suficiente base longitudinal para comparar con LT individual."}</p>
            )}
          </div>
        </div>
      </section>

      {report.limitations.length ? (
        <section className="physiology-report-note-block">
          <span>Limitaciones de lectura</span>
          {report.limitations.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </section>
      ) : null}

      <section className="physiology-report-note-block subtle">
        <span>Consideración científica</span>
        <p>{report.disclaimer}</p>
      </section>
    </div>
  );
}

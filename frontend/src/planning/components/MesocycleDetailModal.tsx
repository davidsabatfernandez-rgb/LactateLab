import type { BlockCandidate, PlanningMesocycleTemplate, PlanningOverview } from "../../types";

type MesocycleDetailModalProps = {
  template: PlanningMesocycleTemplate;
  overview: PlanningOverview;
  allTemplates: PlanningMesocycleTemplate[];
  onClose: () => void;
};

const BLOCK_LACTATE_EFFECTS: Record<string, { lt1Effect: string; lt2Effect: string; curveShift: string; mechanism: string }> = {
  aerobic_capacity_block: {
    lt1Effect: "LT1 sube 3-8% (desplazamiento a la derecha de la curva basal)",
    lt2Effect: "LT2 se mantiene o sube ligeramente (1-3%)",
    curveShift: "La curva de lactato se aplana en la zona baja: menor acumulación a intensidades submáximas. El punto de inflexión inferior se desplaza a la derecha.",
    mechanism: "Mayor densidad mitocondrial + MCT1 (transportadores de lactato tipo 1) + capilarización. El músculo aclara más lactato a la misma velocidad.",
  },
  threshold_development_block: {
    lt1Effect: "LT1 se mantiene o sube ligeramente (1-2%)",
    lt2Effect: "LT2 sube 3-6% (desplazamiento a la derecha de la zona de umbral)",
    curveShift: "La pendiente de la curva entre LT1 y LT2 se suaviza: el atleta tolera más velocidad antes de que el lactato se dispare exponencialmente.",
    mechanism: "Mejora de la capacidad oxidativa en fibras tipo IIa + mayor actividad de LDH hacia piruvato + adaptación del buffer de H+.",
  },
  aerobic_power_block: {
    lt1Effect: "LT1 puede bajar temporalmente 1-2% (estrés acumulado)",
    lt2Effect: "LT2 sube 2-5% tras supercompensación",
    curveShift: "La curva se desplaza a la derecha en la zona alta (>LT2). Mayor velocidad al mismo lactato máximo. Pico de lactato puede aumentar (mayor capacidad glucolítica controlada).",
    mechanism: "Aumento de VO2max vía mayor gasto cardíaco + extracción periférica O2. Las fibras rápidas mejoran su capacidad oxidativa.",
  },
  anaerobic_capacity_block: {
    lt1Effect: "LT1 puede bajar 2-4% transitoriamente",
    lt2Effect: "LT2 se mantiene o baja 1-2% durante el bloque",
    curveShift: "La curva sube transitoriamente (más lactato a misma velocidad). Tras el bloque + recuperación, se produce supercompensación aeróbica con rebote positivo en LT1.",
    mechanism: "Patrón Olbrecht Tipo I: estimular VLamax brevemente para provocar adaptación aeróbica reactiva. El estrés glucolítico dispara señalización mitocondrial compensatoria.",
  },
  anaerobic_power_block: {
    lt1Effect: "LT1 se mantiene (sesiones de soporte lo protegen)",
    lt2Effect: "LT2 puede subir 1-3% por transferencia neuromuscular",
    curveShift: "La parte alta de la curva (>4 mmol) se expande: el atleta genera más potencia al mismo lactato pico. La zona submáxima no cambia significativamente.",
    mechanism: "Reclutamiento de unidades motoras de alto umbral + mejora de la economía de movimiento + potencia anaeróbica.",
  },
  competition_specific_block: {
    lt1Effect: "LT1 se mantiene (mantenimiento aeróbico)",
    lt2Effect: "LT2 se mantiene o sube 1-2% (afinamiento)",
    curveShift: "La curva se optimiza para la intensidad de competición: el punto de trabajo objetivo queda justo por debajo del LT2, con margen de seguridad máximo.",
    mechanism: "Supercompensación por reducción de carga + especificidad metabólica. Se mantiene la maquinaria, se elimina la fatiga residual.",
  },
};

function getBlockLactateEffect(blockType: string) {
  const normalized = blockType.toLowerCase().replace(/\s+/g, "_");
  for (const [key, value] of Object.entries(BLOCK_LACTATE_EFFECTS)) {
    if (normalized.includes(key) || key.includes(normalized)) return value;
  }
  if (normalized.includes("aerobic") && normalized.includes("capacity")) return BLOCK_LACTATE_EFFECTS.aerobic_capacity_block;
  if (normalized.includes("threshold")) return BLOCK_LACTATE_EFFECTS.threshold_development_block;
  if (normalized.includes("aerobic") && normalized.includes("power")) return BLOCK_LACTATE_EFFECTS.aerobic_power_block;
  if (normalized.includes("anaerobic") && normalized.includes("capacity")) return BLOCK_LACTATE_EFFECTS.anaerobic_capacity_block;
  if (normalized.includes("anaerobic") && normalized.includes("power")) return BLOCK_LACTATE_EFFECTS.anaerobic_power_block;
  if (normalized.includes("competition") || normalized.includes("specific")) return BLOCK_LACTATE_EFFECTS.competition_specific_block;
  return null;
}

function scoreLabel(score: number) {
  if (score >= 80) return "Muy alta";
  if (score >= 60) return "Alta";
  if (score >= 40) return "Moderada";
  if (score >= 20) return "Baja";
  return "Muy baja";
}

function scoreTone(score: number) {
  if (score >= 60) return "positive";
  if (score >= 35) return "neutral";
  return "negative";
}

export function MesocycleDetailModal({ template, overview, allTemplates, onClose }: MesocycleDetailModalProps) {
  const rec = overview.next_recommendation;
  const physio = rec.physiological_analysis;
  const candidates = rec.candidates_scored ?? [];
  const isRecommended = template.template_id === rec.template_id;
  const thisCandidate = candidates.find((c) => c.block_type === template.block_type);
  const recommendedCandidate = candidates.find((c) => c.block_type === rec.recommended_block_type);
  const otherCandidates = candidates
    .filter((c) => c.block_type !== template.block_type)
    .sort((a, b) => b.score - a.score);
  const lactateEffect = getBlockLactateEffect(template.block_type);
  const blockExplanation = physio?.block_explanation;
  const blockRationale = physio?.block_rationale;

  return (
    <div className="meso-detail-backdrop" onClick={onClose}>
      <div className="meso-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="meso-detail-header">
          <div>
            <span className="planning-kicker">{template.block_type.replace(/_/g, " ").toUpperCase()}</span>
            <h2>{template.public_label}</h2>
            <p className="meso-detail-summary">{template.summary}</p>
          </div>
          <div className="meso-detail-header-right">
            {isRecommended && <span className="status-badge positive">Recomendado</span>}
            {thisCandidate && (
              <span className={`status-badge ${scoreTone(thisCandidate.score)}`}>
                Puntuación: {thisCandidate.score}
              </span>
            )}
            <button type="button" className="ghost-button" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div className="meso-detail-body">
          {/* Column 1: Why this block */}
          <div className="meso-detail-col">
            <Section title={isRecommended ? "Por qué encaja ahora" : "Análisis de este bloque"}>
              {isRecommended && rec.reasoning.length > 0 && (
                <ul className="meso-detail-reasons">
                  {rec.reasoning.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              {!isRecommended && thisCandidate && thisCandidate.reasons.length > 0 && (
                <ul className="meso-detail-reasons">
                  {thisCandidate.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              {thisCandidate && thisCandidate.contraindications.length > 0 && (
                <>
                  <h4 className="meso-detail-warn-title">Contraindicaciones</h4>
                  <ul className="meso-detail-contra">
                    {thisCandidate.contraindications.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </>
              )}
              {!isRecommended && !thisCandidate?.reasons.length && (
                <p className="meso-detail-muted">No hay análisis específico del motor para este bloque en el contexto actual.</p>
              )}
            </Section>

            {/* Physiological context */}
            {physio && (
              <Section title="Contexto fisiológico del atleta">
                <div className="meso-detail-physio-grid">
                  {physio.season_phase && <PhysioItem label="Fase de temporada" value={physio.season_phase.replace(/_/g, " ")} />}
                  {physio.primary_limiter && <PhysioItem label="Limitante primario" value={physio.primary_limiter} />}
                  {physio.secondary_limiter && <PhysioItem label="Limitante secundario" value={physio.secondary_limiter} />}
                  {physio.data_quality && <PhysioItem label="Calidad de datos" value={physio.data_quality} />}
                  {physio.distance_category && <PhysioItem label="Categoría de prueba" value={physio.distance_category} />}
                  {physio.physiological_block && <PhysioItem label="Bloque fisiológico ideal" value={physio.physiological_block.replace(/_/g, " ")} />}
                  {physio.overall_decision_confidence != null && (
                    <PhysioItem label="Confianza de la decisión" value={`${Math.round(physio.overall_decision_confidence * 100)}%`} />
                  )}
                  {rec.scoring_context?.days_to_target != null && (
                    <PhysioItem label="Días al objetivo" value={String(rec.scoring_context.days_to_target)} />
                  )}
                </div>
                {physio.contradictory_signals && physio.contradictory_signals.length > 0 && (
                  <>
                    <h4 className="meso-detail-warn-title">Señales contradictorias</h4>
                    <ul className="meso-detail-contra">
                      {physio.contradictory_signals.map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </>
                )}
                {physio.reliability_warnings && physio.reliability_warnings.length > 0 && (
                  <>
                    <h4 className="meso-detail-warn-title">Avisos de fiabilidad</h4>
                    <ul className="meso-detail-contra">
                      {physio.reliability_warnings.map((w) => <li key={w.code}>{w.message}</li>)}
                    </ul>
                  </>
                )}
              </Section>
            )}

            {/* Block rationale from Olbrecht */}
            {isRecommended && blockRationale && (
              <Section title={`Fundamento científico: ${blockRationale.display_name}`}>
                <p><strong>Clase Olbrecht:</strong> {blockRationale.olbrecht_class}</p>
                <p>{blockRationale.summary_coach}</p>
                <p><strong>Objetivo fisiológico:</strong> {blockRationale.physiological_goal}</p>
                <p><strong>Entrenamiento:</strong> {blockRationale.training_description}</p>
                <p><strong>Contexto ideal:</strong> {blockRationale.ideal_context}</p>
                <p><strong>Riesgo si se aplica mal:</strong> {blockRationale.risk_if_wrong}</p>
                <p><strong>Duración:</strong> {blockRationale.min_weeks}-{blockRationale.max_weeks} semanas</p>
                {blockRationale.science_refs.length > 0 && (
                  <div className="meso-detail-refs">
                    <small>Referencias: {blockRationale.science_refs.join("; ")}</small>
                  </div>
                )}
              </Section>
            )}
          </div>

          {/* Column 2: Lactate curve + Others */}
          <div className="meso-detail-col">
            {/* Lactate curve estimation */}
            {lactateEffect && (
              <Section title="Estimación del efecto en la curva de lactato">
                <div className="meso-detail-lactate-card">
                  <div className="meso-detail-lactate-row">
                    <span className="meso-detail-lactate-label">LT1</span>
                    <span>{lactateEffect.lt1Effect}</span>
                  </div>
                  <div className="meso-detail-lactate-row">
                    <span className="meso-detail-lactate-label">LT2</span>
                    <span>{lactateEffect.lt2Effect}</span>
                  </div>
                  <div className="meso-detail-lactate-curve">
                    <h4>Desplazamiento esperado de la curva</h4>
                    <p>{lactateEffect.curveShift}</p>
                  </div>
                  <div className="meso-detail-lactate-mechanism">
                    <h4>Mecanismo fisiológico</h4>
                    <p>{lactateEffect.mechanism}</p>
                  </div>
                </div>
                {physio && (physio.lt1_gap_kmh != null || physio.lt2_gap_kmh != null) && (
                  <div className="meso-detail-current-gaps">
                    <h4>Gaps actuales del atleta</h4>
                    <div className="meso-detail-physio-grid">
                      {physio.lt1_gap_kmh != null && (
                        <PhysioItem label="Gap LT1" value={`${physio.lt1_gap_kmh > 0 ? "+" : ""}${physio.lt1_gap_kmh.toFixed(2)} km/h`} />
                      )}
                      {physio.lt2_gap_kmh != null && (
                        <PhysioItem label="Gap LT2" value={`${physio.lt2_gap_kmh > 0 ? "+" : ""}${physio.lt2_gap_kmh.toFixed(2)} km/h`} />
                      )}
                      {physio.required_lt2_kmh != null && (
                        <PhysioItem label="LT2 requerido" value={`${physio.required_lt2_kmh.toFixed(1)} km/h`} />
                      )}
                      {physio.required_lt1_kmh != null && (
                        <PhysioItem label="LT1 requerido" value={`${physio.required_lt1_kmh.toFixed(1)} km/h`} />
                      )}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Block explanation (recommended) */}
            {isRecommended && blockExplanation && (
              <Section title="Explicación contextual">
                <p><strong>{blockExplanation.headline}</strong></p>
                <p>{blockExplanation.why_now}</p>
                <p><strong>Qué esperar:</strong> {blockExplanation.what_to_expect}</p>
                <p><strong>Qué vigilar:</strong> {blockExplanation.what_to_watch}</p>
                <p><strong>Cuándo salir:</strong> {blockExplanation.when_to_exit}</p>
                <p><strong>Alternativa si falla:</strong> {blockExplanation.alternative_if_wrong}</p>
              </Section>
            )}

            {/* Why NOT the others */}
            <Section title="Comparación con otros bloques">
              {otherCandidates.length > 0 ? (
                <div className="meso-detail-others">
                  {otherCandidates.map((c) => {
                    const tpl = allTemplates.find((t) => t.block_type === c.block_type);
                    const isRec = c.block_type === rec.recommended_block_type;
                    const otherLactate = getBlockLactateEffect(c.block_type);
                    return (
                      <div key={c.block_type} className="meso-detail-other-card">
                        <div className="meso-detail-other-head">
                          <strong>{tpl?.public_label ?? c.block_type.replace(/_/g, " ")}</strong>
                          <span className={`status-badge ${scoreTone(c.score)}`}>
                            {c.score} pts{isRec ? " (recomendado)" : ""}
                          </span>
                        </div>
                        {c.reasons.length > 0 && (
                          <ul className="meso-detail-reasons compact">
                            {c.reasons.slice(0, 2).map((r) => <li key={r}>{r}</li>)}
                          </ul>
                        )}
                        {c.contraindications.length > 0 && (
                          <ul className="meso-detail-contra compact">
                            {c.contraindications.map((ci) => <li key={ci}>{ci}</li>)}
                          </ul>
                        )}
                        {otherLactate && (
                          <p className="meso-detail-muted compact">
                            Curva: {otherLactate.lt1Effect.split("(")[0].trim()} / {otherLactate.lt2Effect.split("(")[0].trim()}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="meso-detail-muted">No hay candidatos alternativos evaluados por el motor.</p>
              )}
            </Section>

            {/* Template details */}
            <Section title="Detalles del mesociclo">
              <div className="meso-detail-physio-grid">
                <PhysioItem label="Foco primario" value={template.primary_focus} />
                {template.secondary_focus && <PhysioItem label="Foco secundario" value={template.secondary_focus} />}
                <PhysioItem label="Estructura" value={template.typical_structure} />
                <PhysioItem label="Duración" value={`${template.typical_duration_weeks_min}-${template.typical_duration_weeks_max} semanas`} />
                <PhysioItem label="Sesiones clave" value={template.key_session_families.join(", ") || "n/d"} />
              </div>
              {template.entry_checks.length > 0 && (
                <>
                  <h4 className="meso-detail-section-sub">Condiciones de entrada</h4>
                  <ul className="meso-detail-reasons compact">{template.entry_checks.map((c) => <li key={c}>{c}</li>)}</ul>
                </>
              )}
              {template.exit_checks.length > 0 && (
                <>
                  <h4 className="meso-detail-section-sub">Condiciones de salida</h4>
                  <ul className="meso-detail-reasons compact">{template.exit_checks.map((c) => <li key={c}>{c}</li>)}</ul>
                </>
              )}
              {template.progression_rules.length > 0 && (
                <>
                  <h4 className="meso-detail-section-sub">Reglas de progresión</h4>
                  <ul className="meso-detail-reasons compact">{template.progression_rules.map((r) => <li key={r}>{r}</li>)}</ul>
                </>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="meso-detail-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function PhysioItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="meso-detail-physio-item">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

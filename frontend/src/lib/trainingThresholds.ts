import { AthleteAnalysis, DisciplineView, DynamicReference, IndividualThresholdItem, SessionAnalysis, Threshold, ThresholdProfileForZones, ThresholdItemForZones } from "../types";

export type TrainingThresholdLabel = "LT1" | "LT2";
export type TrainingThresholdSource = "individual" | "physiological" | "analysis";

export type ResolvedTrainingThreshold = {
  label: TrainingThresholdLabel;
  source: TrainingThresholdSource;
  sourceLabel: string;
  lactate: number;
  paceSecondsPerKm?: number | null;
  powerWatts?: number | null;
  heartRate?: number | null;
  confidence?: number | null;
  rationale?: string | null;
  method?: string | null;
  evidenceLevel?: string | null;
};

type ThresholdCarrier = Partial<Pick<DisciplineView, "thresholds" | "dynamic_thresholds" | "individual_thresholds">>
  | Partial<Pick<AthleteAnalysis, "thresholds" | "dynamic_thresholds" | "individual_thresholds">>
  | Partial<Pick<SessionAnalysis, "thresholds" | "individual_thresholds">>;

export function findThreshold(thresholds: Threshold[] | undefined, label: TrainingThresholdLabel) {
  if (!thresholds?.length) return null;
  const normalizedLabel = label.toLowerCase();
  return (
    thresholds.find((threshold) => threshold.name.trim().toLowerCase() === normalizedLabel) ??
    thresholds.find((threshold) => threshold.name.trim().toLowerCase().startsWith(normalizedLabel)) ??
    null
  );
}

export function resolveAnalysisDisciplineView(
  analysis: AthleteAnalysis | null | undefined,
  discipline: string,
): DisciplineView | null {
  if (!analysis) return null;
  return analysis.discipline_views?.[discipline] ?? null;
}

export function individualThresholdReason(source: ThresholdCarrier | null | undefined) {
  return source?.individual_thresholds?.data_quality?.reason ?? null;
}

export function individualThresholdReady(source: ThresholdCarrier | null | undefined) {
  return source?.individual_thresholds?.data_quality?.sufficient !== false;
}

function sourceLabel(label: TrainingThresholdLabel, source: TrainingThresholdSource) {
  if (source === "individual") return label === "LT1" ? "LT1 individual" : "LT2 individual";
  if (source === "physiological") return label === "LT1" ? "Fisiológico 2.0 mmol" : "Fisiológico 4.0 mmol";
  return "Ancla del análisis";
}

function individualToResolved(
  threshold: IndividualThresholdItem,
  label: TrainingThresholdLabel,
): ResolvedTrainingThreshold {
  return {
    label,
    source: "individual",
    sourceLabel: sourceLabel(label, "individual"),
    lactate: threshold.lactate ?? (label === "LT1" ? 2 : 4),
    paceSecondsPerKm: threshold.pace_seconds_per_km ?? null,
    powerWatts: threshold.power_watts ?? null,
    heartRate: threshold.heart_rate ?? null,
    confidence: threshold.confidence ?? null,
    rationale: threshold.rationale ?? null,
    method: threshold.method ?? null,
    evidenceLevel: "evidence_level" in threshold ? threshold.evidence_level ?? null : null,
  };
}

function dynamicToResolved(
  reference: DynamicReference,
  label: TrainingThresholdLabel,
): ResolvedTrainingThreshold {
  return {
    label,
    source: "physiological",
    sourceLabel: sourceLabel(label, "physiological"),
    lactate: reference.target_lactate ?? (label === "LT1" ? 2 : 4),
    paceSecondsPerKm: reference.estimated_pace_seconds_per_km ?? null,
    powerWatts: reference.estimated_power_watts ?? null,
    heartRate: reference.estimated_hr_at_target ?? null,
    confidence: reference.confidence_score ?? null,
    rationale: reference.explanation?.[0] ?? "Referencia fisiológica derivada del histórico comparable.",
    method: reference.interpolation_method_used ?? null,
    evidenceLevel: null,
  };
}

function analysisThresholdToResolved(
  threshold: Threshold,
  label: TrainingThresholdLabel,
): ResolvedTrainingThreshold {
  return {
    label,
    source: "analysis",
    sourceLabel: sourceLabel(label, "analysis"),
    lactate: threshold.lactate ?? (label === "LT1" ? 2 : 4),
    paceSecondsPerKm: threshold.pace_seconds_per_km ?? null,
    powerWatts: threshold.power_watts ?? null,
    heartRate: threshold.heart_rate ?? null,
    confidence: threshold.confidence ?? null,
    rationale: threshold.rationale ?? null,
    method: threshold.method ?? null,
    evidenceLevel: threshold.evidence_level ?? null,
  };
}

export function resolveTrainingThreshold(
  source: ThresholdCarrier | null | undefined,
  label: TrainingThresholdLabel,
): ResolvedTrainingThreshold | null {
  const individual = label === "LT1"
    ? source?.individual_thresholds?.lt1_individual ?? null
    : source?.individual_thresholds?.lt2_individual ?? null;
  if (individual && individualThresholdReady(source)) {
    return individualToResolved(individual, label);
  }

  const dynamicThresholds =
    (source as Partial<Pick<DisciplineView, "dynamic_thresholds">> | Partial<Pick<AthleteAnalysis, "dynamic_thresholds">> | null | undefined)
      ?.dynamic_thresholds;
  const physiological = label === "LT1"
    ? dynamicThresholds?.chronic.reference_2mmol ?? null
    : dynamicThresholds?.chronic.reference_4mmol ?? null;
  if (physiological) {
    return dynamicToResolved(physiological, label);
  }

  const threshold = findThreshold(source?.thresholds, label);
  if (threshold) {
    return analysisThresholdToResolved(threshold, label);
  }

  return null;
}

function paceLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

function resolvedToItem(resolved: ResolvedTrainingThreshold): ThresholdItemForZones {
  return {
    lactate: resolved.lactate,
    pace_seconds_per_km: resolved.paceSecondsPerKm ?? null,
    heart_rate: resolved.heartRate ?? null,
    power_watts: resolved.powerWatts ?? null,
    pace_label: paceLabel(resolved.paceSecondsPerKm) ?? null,
  };
}

function dynamicRefToItem(ref: DynamicReference): ThresholdItemForZones {
  return {
    lactate: ref.target_lactate,
    pace_seconds_per_km: ref.estimated_pace_seconds_per_km ?? null,
    heart_rate: ref.estimated_hr_at_target ?? null,
    power_watts: ref.estimated_power_watts ?? null,
    pace_label: paceLabel(ref.estimated_pace_seconds_per_km) ?? null,
  };
}

/**
 * Build a ThresholdProfileForZones from analysis data already loaded on the page,
 * bypassing the backend threshold-profile endpoint entirely.
 */
export function buildProfileFromAnalysis(
  analysis: AthleteAnalysis | null | undefined,
  discipline: string,
): ThresholdProfileForZones | null {
  if (!analysis) return null;

  const view = analysis.discipline_views?.[discipline];
  const source: ThresholdCarrier | null = view ?? analysis;
  if (!source) return null;

  const lt1 = resolveTrainingThreshold(source, "LT1");
  const lt2 = resolveTrainingThreshold(source, "LT2");

  if (!lt1 && !lt2) return null;

  // Practical thresholds from dynamic_thresholds
  const dynThresholds = (source as Partial<Pick<DisciplineView, "dynamic_thresholds">>)?.dynamic_thresholds;
  const chronic = dynThresholds?.chronic;
  const practLt1 = chronic?.practical_lt1 ?? null;
  const practLt2 = chronic?.practical_lt2 ?? null;

  const bestSource = lt1?.source === "individual" || lt2?.source === "individual"
    ? "individual"
    : lt1?.source === "physiological" || lt2?.source === "physiological"
      ? "physiological"
      : "analysis";

  const bestSourceLabel = bestSource === "individual"
    ? "Individual (multi-sesión)"
    : bestSource === "physiological"
      ? "Fisiológico dinámico"
      : "Análisis de sesión";

  return {
    lt1: lt1 ? resolvedToItem(lt1) : null,
    lt2: lt2 ? resolvedToItem(lt2) : null,
    practical_lt1: practLt1 ? dynamicRefToItem(practLt1) : null,
    practical_lt2: practLt2 ? dynamicRefToItem(practLt2) : null,
    source: bestSource,
    source_label: bestSourceLabel,
    confidence: lt2?.confidence ?? lt1?.confidence ?? null,
    snapshot_date: new Date().toISOString().slice(0, 10),
  };
}

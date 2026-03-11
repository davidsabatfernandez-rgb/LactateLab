export type TargetCategoryOption = {
  value: string;
  label: string;
};

const TARGET_CATEGORY_OPTIONS: Record<string, TargetCategoryOption[]> = {
  running: [
    { value: "5k", label: "5K" },
    { value: "10k", label: "10K" },
    { value: "hm", label: "Media maratón" },
    { value: "marathon", label: "Maratón" },
  ],
  ciclismo: [
    { value: "road_tt_short", label: "Contrarreloj corta" },
    { value: "road_tt_medium", label: "Contrarreloj media" },
    { value: "road_tt_long", label: "Contrarreloj larga" },
    { value: "granfondo", label: "Granfondo" },
    { value: "hill_climb", label: "Subida cronometrada" },
    { value: "road_race", label: "Carrera en ruta" },
    { value: "half_bike", label: "Bike 70.3" },
    { value: "ironman_bike", label: "Bike Ironman" },
  ],
  natación: [
    { value: "pool_400", label: "Piscina 400m" },
    { value: "pool_800_1500", label: "Piscina 800-1500m" },
    { value: "open_water_short", label: "Aguas abiertas corta" },
    { value: "open_water_long", label: "Aguas abiertas larga" },
  ],
  triatlón: [
    { value: "sprint_tri", label: "Triatlón sprint" },
    { value: "olympic_tri", label: "Triatlón olímpico" },
    { value: "half_tri", label: "Half distance" },
    { value: "ironman", label: "Ironman" },
  ],
};

export function targetCategoryOptions(discipline: string) {
  return TARGET_CATEGORY_OPTIONS[discipline] ?? [];
}

export function targetCategoryLabel(category?: string | null, fallback?: string | null) {
  if (!category) return fallback ?? null;
  for (const options of Object.values(TARGET_CATEGORY_OPTIONS)) {
    const match = options.find((option) => option.value === category);
    if (match) return match.label;
  }
  return fallback ?? category;
}

export function buildTargetObjective(params: {
  category?: string | null;
  distanceLabel?: string | null;
  fallback?: string | null;
}) {
  return targetCategoryLabel(params.category, params.distanceLabel ?? params.fallback ?? null) ?? "Objetivo";
}

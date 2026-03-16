import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrainingZoneItem } from "../../types";

// ── Types ──

export type WBlock = {
  id: string;
  type: "warmup" | "steady" | "intervals" | "cooldown";
  zone: string;
  duration_min: number;
  reps?: number;
  work_min?: number;
  rest_min?: number;
  rest_zone?: string;
  notes?: string;
};

export type WorkoutBlocks = {
  blocks: WBlock[];
  discipline: string;
  name: string;
  family: string;
};

export type IntensityBasis = "pace" | "hr" | "power";

// ── Internal zone type used by builder ──

type BuilderZone = {
  value: string;     // zone_label or fallback key
  label: string;     // short label for chip
  long: string;      // full name for tooltip
  if_factor: number;
  color: string;
  bg: string;
  height: number;    // 0-100 for chart bar
  paceRange?: string | null;  // e.g. "4:30 - 5:00"
  hrRange?: string | null;    // e.g. "140 - 155"
  powerRange?: string | null; // e.g. "200 - 250"
};

// ── Defaults (fallback when no coach zones) ──

const DEFAULT_ZONES: BuilderZone[] = [
  { value: "Z1", label: "Z1", long: "Recuperacion", if_factor: 0.55, color: "#a3e635", bg: "#f7fee7", height: 20 },
  { value: "Z2", label: "Z2", long: "Aerobico", if_factor: 0.65, color: "#22c55e", bg: "#f0fdf4", height: 35 },
  { value: "LT1", label: "LT1", long: "Umbral aerobico", if_factor: 0.78, color: "#14b8a6", bg: "#f0fdfa", height: 50 },
  { value: "sub-LT2", label: "sLT2", long: "Subumbral", if_factor: 0.85, color: "#f59e0b", bg: "#fffbeb", height: 62 },
  { value: "LT2", label: "LT2", long: "Umbral", if_factor: 0.92, color: "#ef4444", bg: "#fef2f2", height: 75 },
  { value: "VO2max", label: "VO2", long: "VO2max", if_factor: 1.05, color: "#a855f7", bg: "#faf5ff", height: 88 },
  { value: "Sprint", label: "SPR", long: "Sprint", if_factor: 1.15, color: "#ec4899", bg: "#fdf2f8", height: 100 },
];

const DEFAULT_ZONE_COLORS = ["#3a9a5b", "#2e8b57", "#14b8a6", "#b58a2e", "#d4a017", "#c44040", "#7c3aed"];
const IF_BY_ZONE_NUMBER: Record<number, number> = { 1: 0.55, 2: 0.65, 3: 0.78, 4: 0.85, 5: 0.92, 6: 1.05, 7: 1.15 };

function coachZonesToBuilder(zones: TrainingZoneItem[]): BuilderZone[] {
  const sorted = [...zones].sort((a, b) => a.zone_number - b.zone_number);
  const count = sorted.length;
  return sorted.map((z, i) => {
    const parts = z.zone_label.split(" - ");
    const shortLabel = parts[0]?.trim() || `Z${z.zone_number}`;
    const longLabel = parts.length > 1 ? parts.slice(1).join(" - ").trim() : z.zone_label;
    const color = z.zone_color || DEFAULT_ZONE_COLORS[i % DEFAULT_ZONE_COLORS.length];
    const ifFactor = IF_BY_ZONE_NUMBER[z.zone_number] ?? (0.5 + (z.zone_number / (count + 1)) * 0.7);
    const height = count > 1 ? 15 + (i / (count - 1)) * 85 : 50;

    const paceRange = formatPaceRange(z.pace_lower_seconds, z.pace_upper_seconds);
    const hrRange = z.hr_lower != null && z.hr_upper != null ? `${z.hr_lower}-${z.hr_upper} bpm` :
                    z.hr_lower != null ? `>${z.hr_lower} bpm` :
                    z.hr_upper != null ? `<${z.hr_upper} bpm` : null;
    const powerRange = z.power_lower != null && z.power_upper != null ? `${Math.round(z.power_lower)}-${Math.round(z.power_upper)} W` :
                       z.power_lower != null ? `>${Math.round(z.power_lower)} W` :
                       z.power_upper != null ? `<${Math.round(z.power_upper)} W` : null;

    // Light background from color
    const bg = color + "18";

    return { value: z.zone_label, label: shortLabel, long: longLabel, if_factor: ifFactor, color, bg, height, paceRange, hrRange, powerRange };
  });
}

function formatPaceRange(lower: number | null | undefined, upper: number | null | undefined): string | null {
  if (lower == null && upper == null) return null;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  if (lower != null && upper != null) return `${fmt(lower)} - ${fmt(upper)}/km`;
  if (upper != null) return `< ${fmt(upper)}/km`;
  if (lower != null) return `> ${fmt(lower)}/km`;
  return null;
}

// ── Constants ──

const BLOCK_TYPES = [
  { value: "warmup", label: "Calentamiento", abbr: "CAL", color: "#f59e0b" },
  { value: "steady", label: "Continuo", abbr: "CON", color: "#3b82f6" },
  { value: "intervals", label: "Intervalos", abbr: "INT", color: "#a855f7" },
  { value: "cooldown", label: "Vuelta calma", abbr: "V.C", color: "#06b6d4" },
];

const FAMILY_OPTIONS = [
  { value: "recovery_regeneration", label: "Recuperacion" },
  { value: "long_aerobic_durability", label: "Base / Aerobico" },
  { value: "lt1_extensive", label: "LT1" },
  { value: "subthreshold_reps", label: "Subumbral" },
  { value: "lt2_cruise_intervals", label: "LT2 / Umbral" },
  { value: "vo2_hills", label: "VO2max" },
  { value: "economy_strides", label: "Tecnica" },
  { value: "strength", label: "Fuerza" },
  { value: "specific", label: "Especifico / Competicion" },
  { value: "other", label: "Otro" },
];

const DISCIPLINES = [
  { value: "running", label: "Running", color: "#22c55e" },
  { value: "ciclismo", label: "Ciclismo", color: "#f59e0b" },
  { value: "natacion", label: "Natacion", color: "#0ea5e9" },
];

// ── Quick-add block templates (TrainingPeaks-style) ──

type TemplateBar = { h: number; w?: number; color?: string };

type WorkoutTemplate = {
  id: string;
  label: string;
  bars: TemplateBar[];
  blocks: Omit<WBlock, "id">[];
};

const TPL_COLOR = "#3b82f6";

// Templates use zone indices (0-based) into the active zones array.
// We'll resolve them at apply time.

const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: "steady",
    label: "Continuo",
    bars: [{ h: 50, w: 100, color: TPL_COLOR }],
    blocks: [{ type: "steady", zone: "~1", duration_min: 45 }],
  },
  {
    id: "warm_work_cool",
    label: "Cal + Trabajo + VC",
    bars: [{ h: 30, w: 25 }, { h: 70, w: 50, color: TPL_COLOR }, { h: 30, w: 25 }],
    blocks: [
      { type: "warmup", zone: "~0", duration_min: 15 },
      { type: "steady", zone: "~2", duration_min: 30 },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
  {
    id: "intervals_3",
    label: "3 intervalos",
    bars: [{ h: 30, w: 15 }, { h: 80, w: 12 }, { h: 25, w: 8 }, { h: 80, w: 12 }, { h: 25, w: 8 }, { h: 80, w: 12 }, { h: 30, w: 15 }],
    blocks: [
      { type: "warmup", zone: "~0", duration_min: 15 },
      { type: "intervals", zone: "~4", duration_min: 0, reps: 3, work_min: 5, rest_min: 3, rest_zone: "~0" },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
  {
    id: "intervals_5",
    label: "5 intervalos",
    bars: [{ h: 30, w: 10 }, { h: 80, w: 9 }, { h: 25, w: 5 }, { h: 80, w: 9 }, { h: 25, w: 5 }, { h: 80, w: 9 }, { h: 25, w: 5 }, { h: 80, w: 9 }, { h: 25, w: 5 }, { h: 80, w: 9 }, { h: 30, w: 10 }],
    blocks: [
      { type: "warmup", zone: "~0", duration_min: 10 },
      { type: "intervals", zone: "~4", duration_min: 0, reps: 5, work_min: 4, rest_min: 2, rest_zone: "~0" },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
  {
    id: "ramp_up",
    label: "Progresivo",
    bars: [{ h: 25, w: 20 }, { h: 40, w: 20 }, { h: 55, w: 20 }, { h: 70, w: 20 }, { h: 85, w: 20 }],
    blocks: [
      { type: "warmup", zone: "~0", duration_min: 10 },
      { type: "steady", zone: "~1", duration_min: 15 },
      { type: "steady", zone: "~2", duration_min: 15 },
      { type: "steady", zone: "~3", duration_min: 10 },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
  {
    id: "ramp_down",
    label: "Regresivo",
    bars: [{ h: 85, w: 20 }, { h: 70, w: 20 }, { h: 55, w: 20 }, { h: 40, w: 20 }, { h: 25, w: 20 }],
    blocks: [
      { type: "steady", zone: "~3", duration_min: 10 },
      { type: "steady", zone: "~2", duration_min: 15 },
      { type: "steady", zone: "~1", duration_min: 15 },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
  {
    id: "pyramid",
    label: "Piramide",
    bars: [{ h: 30, w: 14 }, { h: 50, w: 14 }, { h: 75, w: 14 }, { h: 90, w: 14 }, { h: 75, w: 14 }, { h: 50, w: 14 }, { h: 30, w: 14 }],
    blocks: [
      { type: "warmup", zone: "~0", duration_min: 10 },
      { type: "steady", zone: "~2", duration_min: 10 },
      { type: "steady", zone: "~3", duration_min: 8 },
      { type: "steady", zone: "~4", duration_min: 5 },
      { type: "steady", zone: "~3", duration_min: 8 },
      { type: "steady", zone: "~2", duration_min: 10 },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
  {
    id: "over_under",
    label: "Over / Under",
    bars: [{ h: 30, w: 10 }, { h: 80, w: 10 }, { h: 60, w: 10 }, { h: 80, w: 10 }, { h: 60, w: 10 }, { h: 80, w: 10 }, { h: 60, w: 10 }, { h: 80, w: 10 }, { h: 30, w: 10 }],
    blocks: [
      { type: "warmup", zone: "~0", duration_min: 15 },
      { type: "intervals", zone: "~4", duration_min: 0, reps: 4, work_min: 4, rest_min: 3, rest_zone: "~3" },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
  {
    id: "vo2_short",
    label: "Micro VO2",
    bars: [{ h: 30, w: 12 }, { h: 95, w: 5 }, { h: 25, w: 3 }, { h: 95, w: 5 }, { h: 25, w: 3 }, { h: 95, w: 5 }, { h: 25, w: 3 }, { h: 95, w: 5 }, { h: 25, w: 3 }, { h: 95, w: 5 }, { h: 25, w: 3 }, { h: 95, w: 5 }, { h: 30, w: 12 }],
    blocks: [
      { type: "warmup", zone: "~0", duration_min: 15 },
      { type: "intervals", zone: "~5", duration_min: 0, reps: 6, work_min: 2, rest_min: 1, rest_zone: "~0" },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
  {
    id: "long_base",
    label: "Base larga",
    bars: [{ h: 30, w: 10 }, { h: 40, w: 80, color: TPL_COLOR }, { h: 30, w: 10 }],
    blocks: [
      { type: "warmup", zone: "~0", duration_min: 15 },
      { type: "steady", zone: "~1", duration_min: 75 },
      { type: "cooldown", zone: "~0", duration_min: 10 },
    ],
  },
];

function resolveTemplateZone(ref: string, zones: BuilderZone[]): string {
  if (!ref.startsWith("~")) return ref;
  const idx = parseInt(ref.slice(1), 10);
  const clamped = Math.min(idx, zones.length - 1);
  return zones[Math.max(0, clamped)]?.value ?? zones[0]?.value ?? "Z1";
}

// ── Template mini-preview SVG ──

function TemplateMiniPreview({ bars }: { bars: TemplateBar[] }) {
  const totalW = bars.reduce((s, b) => s + (b.w ?? 20), 0);
  let x = 0;
  return (
    <svg viewBox={`0 0 ${totalW} 40`} className="wbb-tpl__svg" preserveAspectRatio="none">
      {bars.map((bar, i) => {
        const w = bar.w ?? 20;
        const h = (bar.h / 100) * 36;
        const rx = (
          <rect key={i} x={x + 0.5} y={40 - h} width={Math.max(w - 1, 1)} height={h} rx={1} fill={bar.color ?? "#94a3b8"} />
        );
        x += w;
        return rx;
      })}
    </svg>
  );
}

// ── Helpers ──

function zoneInfoFromList(zone: string, zones: BuilderZone[]): BuilderZone {
  return zones.find((z) => z.value === zone) ?? zones[0] ?? DEFAULT_ZONES[0];
}

function blockDuration(b: WBlock): number {
  if (b.type === "intervals" && b.reps && b.work_min) {
    return b.reps * b.work_min + (b.reps - 1) * (b.rest_min ?? 0);
  }
  return b.duration_min || 0;
}

function blockTSSWithZones(b: WBlock, zones: BuilderZone[]): number {
  const dur = blockDuration(b);
  if (dur <= 0) return 0;
  if (b.type === "intervals" && b.reps && b.work_min) {
    const workHours = (b.reps * b.work_min) / 60;
    const restHours = ((b.reps - 1) * (b.rest_min ?? 0)) / 60;
    const workIF = zoneInfoFromList(b.zone, zones).if_factor;
    const restIF = zoneInfoFromList(b.rest_zone ?? zones[0]?.value ?? "Z1", zones).if_factor;
    return workIF * workIF * workHours * 100 + restIF * restIF * restHours * 100;
  }
  const ifFactor = zoneInfoFromList(b.zone, zones).if_factor;
  return ifFactor * ifFactor * (dur / 60) * 100;
}

// Keep backward-compatible versions that use DEFAULT_ZONES
function zoneInfo(zone: string) {
  return zoneInfoFromList(zone, DEFAULT_ZONES);
}

function blockTSS(b: WBlock): number {
  return blockTSSWithZones(b, DEFAULT_ZONES);
}

const PACE_BY_ZONE: Record<string, number> = {
  Z1: 6.5, Z2: 5.75, LT1: 5.25, "sub-LT2": 4.83, LT2: 4.5, VO2max: 4.0, Sprint: 3.5,
};
const SPEED_BY_ZONE: Record<string, number> = {
  Z1: 22, Z2: 26, LT1: 29, "sub-LT2": 31, LT2: 33, VO2max: 37, Sprint: 42,
};
const SWIM_PACE_BY_ZONE: Record<string, number> = {
  Z1: 2.5, Z2: 2.17, LT1: 1.92, "sub-LT2": 1.83, LT2: 1.75, VO2max: 1.58, Sprint: 1.42,
};

function blockDistance(b: WBlock, discipline: string): number {
  const dur = blockDuration(b);
  if (dur <= 0) return 0;
  if (discipline === "running") {
    if (b.type === "intervals" && b.reps && b.work_min) {
      return (b.reps * b.work_min) / (PACE_BY_ZONE[b.zone] ?? 5) +
        ((b.reps - 1) * (b.rest_min ?? 0)) / (PACE_BY_ZONE[b.rest_zone ?? "Z1"] ?? 6.5);
    }
    return dur / (PACE_BY_ZONE[b.zone] ?? 5);
  }
  if (discipline === "ciclismo") {
    if (b.type === "intervals" && b.reps && b.work_min) {
      return (b.reps * b.work_min / 60) * (SPEED_BY_ZONE[b.zone] ?? 30) +
        ((b.reps - 1) * (b.rest_min ?? 0) / 60) * (SPEED_BY_ZONE[b.rest_zone ?? "Z1"] ?? 22);
    }
    return (dur / 60) * (SPEED_BY_ZONE[b.zone] ?? 30);
  }
  if (discipline === "natacion" || discipline === "natación") {
    if (b.type === "intervals" && b.reps && b.work_min) {
      return ((b.reps * b.work_min) / (SWIM_PACE_BY_ZONE[b.zone] ?? 2) * 100 +
        ((b.reps - 1) * (b.rest_min ?? 0)) / (SWIM_PACE_BY_ZONE[b.rest_zone ?? "Z1"] ?? 2.5) * 100) / 1000;
    }
    return (dur / (SWIM_PACE_BY_ZONE[b.zone] ?? 2) * 100) / 1000;
  }
  return 0;
}

export function computeWorkoutStats(blocks: WBlock[], discipline: string) {
  const totalMin = blocks.reduce((s, b) => s + blockDuration(b), 0);
  const totalTSS = blocks.reduce((s, b) => s + blockTSS(b), 0);
  const totalKm = blocks.reduce((s, b) => s + blockDistance(b, discipline), 0);
  return { totalMin, totalTSS: Math.round(totalTSS), totalKm: Math.round(totalKm * 10) / 10 };
}

export function blocksToDescription(blocks: WBlock[], discipline: string): string {
  const stats = computeWorkoutStats(blocks, discipline);
  const lines: string[] = [];
  for (const b of blocks) {
    const bt = BLOCK_TYPES.find((t) => t.value === b.type);
    const prefix = bt?.abbr ?? "CON";
    if (b.type === "intervals") lines.push(`[${prefix}] ${b.reps}x${b.work_min}' ${b.zone} (rec ${b.rest_min}' ${b.rest_zone ?? "Z1"})`);
    else lines.push(`[${prefix}] ${b.duration_min}' ${b.zone}`);
    if (b.notes) lines.push(`  ${b.notes}`);
  }
  lines.push(`-- ${stats.totalMin}' | ~${stats.totalTSS} TSS | ~${stats.totalKm} km`);
  return lines.join("\n");
}

export function parseBlocksFromDescription(description: string | null): WBlock[] | null {
  if (!description) return null;
  try {
    if (description.startsWith("{\"blocks\":")) {
      return (JSON.parse(description) as { blocks: WBlock[] }).blocks;
    }
    const firstLine = description.split("\n")[0];
    if (firstLine.startsWith("{\"blocks\":")) {
      return (JSON.parse(firstLine) as { blocks: WBlock[] }).blocks;
    }
  } catch { /* not structured */ }
  return null;
}

export function serializeBlocks(blocks: WBlock[], discipline: string): string {
  const json = JSON.stringify({ blocks });
  const readable = blocksToDescription(blocks, discipline);
  return `${json}\n---\n${readable}`;
}

function uid() {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Intensity hint display ──

function intensityHint(zone: BuilderZone, basis: IntensityBasis): string | null {
  if (basis === "pace") return zone.paceRange ?? null;
  if (basis === "hr") return zone.hrRange ?? null;
  if (basis === "power") return zone.powerRange ?? null;
  return null;
}

// ── Visual Preview (TrainingPeaks-style intensity bars) ──

function WorkoutPreviewChart({ blocks, discipline, zones }: { blocks: WBlock[]; discipline: string; zones: BuilderZone[] }) {
  if (blocks.length === 0) return null;

  type Seg = { dur: number; zone: string };
  const segments: Seg[] = [];
  for (const b of blocks) {
    if (b.type === "intervals" && b.reps && b.work_min) {
      for (let i = 0; i < b.reps; i++) {
        segments.push({ dur: b.work_min, zone: b.zone });
        if (i < b.reps - 1 && (b.rest_min ?? 0) > 0) {
          segments.push({ dur: b.rest_min!, zone: b.rest_zone ?? zones[0]?.value ?? "Z1" });
        }
      }
    } else {
      segments.push({ dur: b.duration_min, zone: b.zone });
    }
  }

  const totalDur = segments.reduce((s, seg) => s + seg.dur, 0);
  if (totalDur <= 0) return null;

  const stats = computeWorkoutStats(blocks, discipline);
  const chartHeight = 80;

  return (
    <div className="wbb-preview">
      <div className="wbb-preview__chart" style={{ height: chartHeight }}>
        {segments.map((seg, i) => {
          const zi = zoneInfoFromList(seg.zone, zones);
          const widthPct = (seg.dur / totalDur) * 100;
          const barHeight = (zi.height / 100) * chartHeight;
          return (
            <div
              key={i}
              className="wbb-preview__bar"
              style={{ width: `${widthPct}%`, height: barHeight, background: zi.color }}
              title={`${seg.dur}' ${seg.zone}`}
            />
          );
        })}
      </div>
      <div className="wbb-preview__labels">
        <span>0'</span>
        <span>{Math.round(totalDur / 2)}'</span>
        <span>{totalDur}'</span>
      </div>
      <div className="wbb-preview__stats">
        <div className="wbb-preview__stat">
          <span className="wbb-preview__stat-val">{stats.totalMin}</span>
          <span className="wbb-preview__stat-unit">min</span>
        </div>
        <span className="wbb-preview__stat-sep">·</span>
        <div className="wbb-preview__stat">
          <span className="wbb-preview__stat-val">~{stats.totalTSS}</span>
          <span className="wbb-preview__stat-unit">TSS</span>
        </div>
        <span className="wbb-preview__stat-sep">·</span>
        <div className="wbb-preview__stat">
          <span className="wbb-preview__stat-val">~{stats.totalKm}</span>
          <span className="wbb-preview__stat-unit">km</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──

type WorkoutBlockBuilderProps = {
  blocks: WBlock[];
  discipline: string;
  name: string;
  family: string;
  onChange: (update: { blocks?: WBlock[]; discipline?: string; name?: string; family?: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  saveLabel?: string;
  compact?: boolean;
  coachZones?: TrainingZoneItem[] | null;
};

export function WorkoutBlockBuilder({
  blocks,
  discipline,
  name,
  family,
  onChange,
  onSave,
  onCancel,
  saving,
  saveLabel = "Guardar",
  compact,
  coachZones,
}: WorkoutBlockBuilderProps) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [intensityBasis, setIntensityBasis] = useState<IntensityBasis>("pace");

  // Build zones from coach config or fallback
  const zones = useMemo<BuilderZone[]>(() => {
    if (coachZones && coachZones.length > 0) return coachZonesToBuilder(coachZones);
    return DEFAULT_ZONES;
  }, [coachZones]);

  // Auto-detect best intensity basis from available zone data
  useEffect(() => {
    if (!coachZones || coachZones.length === 0) return;
    const hasPace = coachZones.some((z) => z.pace_lower_seconds != null || z.pace_upper_seconds != null);
    const hasHr = coachZones.some((z) => z.hr_lower != null || z.hr_upper != null);
    const hasPower = coachZones.some((z) => z.power_lower != null || z.power_upper != null);
    if (discipline === "ciclismo" && hasPower) setIntensityBasis("power");
    else if (hasPace) setIntensityBasis("pace");
    else if (hasHr) setIntensityBasis("hr");
  }, [coachZones, discipline]);

  const stats = useMemo(() => computeWorkoutStats(blocks, discipline), [blocks, discipline]);

  const applyTemplate = useCallback((tpl: WorkoutTemplate) => {
    const newBlocks: WBlock[] = tpl.blocks.map((b) => ({
      ...b,
      id: uid(),
      zone: resolveTemplateZone(b.zone, zones),
      rest_zone: b.rest_zone ? resolveTemplateZone(b.rest_zone, zones) : undefined,
    }));
    onChange({ blocks: [...blocks, ...newBlocks] });
    setExpandedBlockId(null);
  }, [blocks, onChange, zones]);

  const firstZone = zones[0]?.value ?? "Z1";

  const addBlock = useCallback((type: WBlock["type"]) => {
    const lowZone = firstZone;
    const midZone = zones[Math.min(2, zones.length - 1)]?.value ?? firstZone;
    const newBlock: WBlock = {
      id: uid(),
      type,
      zone: type === "warmup" || type === "cooldown" ? lowZone : midZone,
      duration_min: type === "warmup" ? 15 : type === "cooldown" ? 10 : 20,
      ...(type === "intervals" ? { reps: 4, work_min: 4, rest_min: 2, rest_zone: lowZone } : {}),
    };
    onChange({ blocks: [...blocks, newBlock] });
    setExpandedBlockId(newBlock.id);
    setAddMenuOpen(false);
  }, [blocks, onChange, firstZone, zones]);

  const updateBlock = useCallback((id: string, patch: Partial<WBlock>) => {
    onChange({ blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  }, [blocks, onChange]);

  const removeBlock = useCallback((id: string) => {
    onChange({ blocks: blocks.filter((b) => b.id !== id) });
    if (expandedBlockId === id) setExpandedBlockId(null);
  }, [blocks, onChange, expandedBlockId]);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ blocks: next });
  }, [blocks, onChange]);

  const duplicateBlock = useCallback((id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const dup: WBlock = { ...blocks[idx], id: uid() };
    const next = [...blocks];
    next.splice(idx + 1, 0, dup);
    onChange({ blocks: next });
    setExpandedBlockId(dup.id);
  }, [blocks, onChange]);

  const clearBlocks = useCallback(() => {
    onChange({ blocks: [] });
    setExpandedBlockId(null);
  }, [onChange]);

  const blockTypeInfo = (type: string) => BLOCK_TYPES.find((bt) => bt.value === type)!;

  // Determine which intensity basis options are available
  const basisOptions = useMemo(() => {
    const opts: { value: IntensityBasis; label: string }[] = [];
    if (zones.some((z) => z.paceRange)) opts.push({ value: "pace", label: "Ritmo" });
    if (zones.some((z) => z.hrRange)) opts.push({ value: "hr", label: "FC" });
    if (zones.some((z) => z.powerRange)) opts.push({ value: "power", label: "Potencia" });
    if (opts.length === 0) opts.push({ value: "pace", label: "Ritmo" });
    return opts;
  }, [zones]);

  return (
    <div className={`wbb ${compact ? "wbb--compact" : ""}`}>
      {/* Title */}
      <input
        type="text"
        className="wbb__title"
        placeholder="Nombre del entreno (ej: 4x4' LT2 + base)"
        value={name}
        onChange={(e) => onChange({ name: e.target.value })}
        autoFocus
      />

      {/* Discipline pills + intensity basis toggle */}
      <div className="wbb__top-row">
        <div className="wbb__disciplines">
          {DISCIPLINES.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`wbb__disc-pill ${discipline === d.value ? "active" : ""}`}
              style={discipline === d.value ? { background: d.color, borderColor: d.color } : {}}
              onClick={() => onChange({ discipline: d.value })}
            >
              {d.label}
            </button>
          ))}
        </div>

        {basisOptions.length > 1 && (
          <div className="wbb__basis-toggle">
            {basisOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`wbb__basis-btn ${intensityBasis === o.value ? "active" : ""}`}
                onClick={() => setIntensityBasis(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Family select */}
      <div className="wbb__family-row">
        <span className="wbb__field-label">TIPO</span>
        <select className="wbb__family-select" value={family} onChange={(e) => onChange({ family: e.target.value })}>
          {FAMILY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Quick-add block templates grid */}
      <div className="wbb-tpl">
        <div className="wbb-tpl__head">
          <span className="wbb-tpl__label">Plantillas</span>
          {blocks.length > 0 && (
            <button type="button" className="wbb-tpl__clear" onClick={clearBlocks}>Borrar bloques</button>
          )}
        </div>
        <div className="wbb-tpl__grid">
          {WORKOUT_TEMPLATES.map((tpl) => (
            <button key={tpl.id} type="button" className="wbb-tpl__item" onClick={() => applyTemplate(tpl)} title={tpl.label}>
              <TemplateMiniPreview bars={tpl.bars} />
              <span className="wbb-tpl__item-label">{tpl.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Visual preview chart */}
      <WorkoutPreviewChart blocks={blocks} discipline={discipline} zones={zones} />

      {/* Blocks */}
      <div className="wbb__blocks">
        {blocks.length === 0 && (
          <div className="wbb__empty">Haz clic en una plantilla o usa + para construir</div>
        )}

        {blocks.map((block, blockIdx) => {
          const bt = blockTypeInfo(block.type);
          const dur = blockDuration(block);
          const isExpanded = expandedBlockId === block.id;
          const zi = zoneInfoFromList(block.zone, zones);
          return (
            <div
              key={block.id}
              className={`wbb__block ${isExpanded ? "wbb__block--open" : ""}`}
              style={{ borderLeftColor: bt.color }}
            >
              {/* Block header */}
              <div className="wbb__block-head" onClick={() => setExpandedBlockId(isExpanded ? null : block.id)}>
                <span className="wbb__block-type-badge" style={{ background: bt.color }}>{bt.abbr}</span>
                <span className="wbb__block-desc">
                  {block.type === "intervals"
                    ? <>{block.reps}x{block.work_min}' <strong style={{ color: zi.color }}>{zi.label}</strong> <span className="wbb__block-desc-dim">rec {block.rest_min}' {zoneInfoFromList(block.rest_zone ?? firstZone, zones).label}</span></>
                    : <>{block.duration_min}' <strong style={{ color: zi.color }}>{zi.label}</strong></>
                  }
                  {(() => { const hint = intensityHint(zi, intensityBasis); return hint ? <span className="wbb__block-hint">{hint}</span> : null; })()}
                </span>
                <span className="wbb__block-dur">{dur}'</span>
                <div className="wbb__block-actions">
                  {blockIdx > 0 && (
                    <button type="button" className="wbb__block-move" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, -1); }} title="Mover arriba">&#9650;</button>
                  )}
                  {blockIdx < blocks.length - 1 && (
                    <button type="button" className="wbb__block-move" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 1); }} title="Mover abajo">&#9660;</button>
                  )}
                  <button type="button" className="wbb__block-move" onClick={(e) => { e.stopPropagation(); duplicateBlock(block.id); }} title="Duplicar">&#9112;</button>
                  <button type="button" className="wbb__block-remove" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }} title="Eliminar">&#10005;</button>
                </div>
              </div>

              {/* Expanded fields */}
              {isExpanded && (
                <div className="wbb__block-fields">
                  {/* Block type selector */}
                  <div className="wbb__type-row">
                    <span className="wbb__field-label">TIPO</span>
                    <div className="wbb__type-pills">
                      {BLOCK_TYPES.map((bt2) => (
                        <button
                          key={bt2.value}
                          type="button"
                          className={`wbb__type-pill ${block.type === bt2.value ? "active" : ""}`}
                          style={block.type === bt2.value ? { background: bt2.color, color: "#fff", borderColor: bt2.color } : {}}
                          onClick={() => {
                            const patch: Partial<WBlock> = { type: bt2.value as WBlock["type"] };
                            if (bt2.value === "intervals" && !block.reps) {
                              patch.reps = 4;
                              patch.work_min = 4;
                              patch.rest_min = 2;
                              patch.rest_zone = firstZone;
                            }
                            updateBlock(block.id, patch);
                          }}
                        >
                          <span>{bt2.abbr}</span>
                          <span>{bt2.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="wbb__zone-row">
                    <span className="wbb__field-label">ZONA</span>
                    <div className="wbb__zone-chips">
                      {zones.map((z) => {
                        const hint = intensityHint(z, intensityBasis);
                        return (
                          <button
                            key={z.value}
                            type="button"
                            className={`wbb__zone-chip ${block.zone === z.value ? "active" : ""}`}
                            style={block.zone === z.value ? { background: z.color, color: "#fff", borderColor: z.color } : { background: z.bg, color: z.color, borderColor: "transparent" }}
                            onClick={() => updateBlock(block.id, { zone: z.value })}
                            title={`${z.long}${hint ? ` (${hint})` : ""}`}
                          >
                            <span>{z.label}</span>
                            {hint && <span className="wbb__zone-hint">{hint}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {block.type === "intervals" ? (
                    <>
                      <div className="wbb__interval-row">
                        <div className="wbb__field">
                          <span className="wbb__field-label">REPS</span>
                          <input type="number" className="wbb__num" value={block.reps ?? 4} min={1} onChange={(e) => updateBlock(block.id, { reps: Number(e.target.value) })} />
                        </div>
                        <span className="wbb__interval-x">x</span>
                        <div className="wbb__field">
                          <span className="wbb__field-label">TRABAJO</span>
                          <input type="number" className="wbb__num" value={block.work_min ?? 4} min={0.5} step={0.5} onChange={(e) => updateBlock(block.id, { work_min: Number(e.target.value) })} />
                        </div>
                        <span className="wbb__interval-x">min</span>
                      </div>
                      <div className="wbb__interval-row">
                        <div className="wbb__field">
                          <span className="wbb__field-label">RECUP.</span>
                          <input type="number" className="wbb__num" value={block.rest_min ?? 2} min={0} step={0.5} onChange={(e) => updateBlock(block.id, { rest_min: Number(e.target.value) })} />
                        </div>
                        <span className="wbb__interval-x">min en</span>
                        <div className="wbb__field wbb__field--grow">
                          <span className="wbb__field-label">ZONA REC</span>
                          <select className="wbb__select" value={block.rest_zone ?? firstZone} onChange={(e) => updateBlock(block.id, { rest_zone: e.target.value })}>
                            {zones.map((z) => <option key={z.value} value={z.value}>{z.label} - {z.long}</option>)}
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="wbb__dur-row">
                      <div className="wbb__field">
                        <span className="wbb__field-label">DURACION</span>
                        <input type="number" className="wbb__num wbb__num--wide" value={block.duration_min} min={1} onChange={(e) => updateBlock(block.id, { duration_min: Number(e.target.value) })} />
                      </div>
                      <span className="wbb__interval-x">min</span>
                    </div>
                  )}

                  <input
                    type="text"
                    className="wbb__notes"
                    placeholder="Notas opcionales..."
                    value={block.notes ?? ""}
                    onChange={(e) => updateBlock(block.id, { notes: e.target.value })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add block */}
      <div className="wbb__add-wrap">
        <button type="button" className="wbb__add-btn" onClick={() => setAddMenuOpen(!addMenuOpen)}>+</button>
        {addMenuOpen && (
          <div className="wbb__add-menu">
            {BLOCK_TYPES.map((bt) => (
              <button key={bt.value} type="button" className="wbb__add-option" onClick={() => addBlock(bt.value as WBlock["type"])}>
                <span className="wbb__add-option-icon" style={{ background: bt.color }}>{bt.abbr}</span>
                <span>{bt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats (only when no chart) */}
      {blocks.length > 0 && !compact && (
        <div className="wbb__stats">
          <div className="wbb__stat">
            <span className="wbb__stat-value">{stats.totalMin}</span>
            <span className="wbb__stat-unit">min</span>
          </div>
          <span className="wbb__stat-sep">·</span>
          <div className="wbb__stat">
            <span className="wbb__stat-value">~{stats.totalTSS}</span>
            <span className="wbb__stat-unit">TSS</span>
          </div>
          <span className="wbb__stat-sep">·</span>
          <div className="wbb__stat">
            <span className="wbb__stat-value">~{stats.totalKm}</span>
            <span className="wbb__stat-unit">km</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="wbb__footer">
        <button
          type="button"
          className="wbb__save"
          disabled={!name.trim() || blocks.length === 0 || saving}
          onClick={onSave}
        >
          {saving ? "Guardando..." : saveLabel}
        </button>
        <button type="button" className="wbb__cancel" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Modal wrapper ──

type WorkoutBuilderModalProps = {
  blocks: WBlock[];
  discipline: string;
  name: string;
  family: string;
  onChange: (update: { blocks?: WBlock[]; discipline?: string; name?: string; family?: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  saveLabel?: string;
  title?: string;
  coachZones?: TrainingZoneItem[] | null;
};

export function WorkoutBuilderModal({
  blocks, discipline, name, family, onChange, onSave, onCancel, saving, saveLabel, title, coachZones,
}: WorkoutBuilderModalProps) {
  return (
    <div className="wbb-modal-backdrop" onClick={onCancel}>
      <div className="wbb-modal" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="wbb-modal__header">
            <h2>{title}</h2>
            <button type="button" className="wbb-modal__close" onClick={onCancel}>&#10005;</button>
          </div>
        )}
        <div className="wbb-modal__body">
          <WorkoutBlockBuilder
            blocks={blocks}
            discipline={discipline}
            name={name}
            family={family}
            onChange={onChange}
            onSave={onSave}
            onCancel={onCancel}
            saving={saving}
            saveLabel={saveLabel}
            coachZones={coachZones}
          />
        </div>
      </div>
    </div>
  );
}

// ── Summary display (for cards) ──

export function WorkoutBlocksSummary({ description, discipline }: { description: string | null; discipline: string }) {
  const blocks = parseBlocksFromDescription(description);
  if (!blocks || blocks.length === 0) return null;
  const stats = computeWorkoutStats(blocks, discipline);
  return (
    <div className="wbb-summary">
      {blocks.map((b) => {
        const bt = BLOCK_TYPES.find((t) => t.value === b.type);
        return (
          <div key={b.id} className="wbb-summary__row">
            <span className="wbb-summary__badge" style={{ background: bt?.color ?? "#888" }}>{bt?.abbr ?? "CON"}</span>
            <span>
              {b.type === "intervals"
                ? `${b.reps}x${b.work_min}' ${b.zone}`
                : `${b.duration_min}' ${b.zone}`
              }
            </span>
          </div>
        );
      })}
      <div className="wbb-summary__total">
        {stats.totalMin}' · ~{stats.totalTSS} TSS · ~{stats.totalKm} km
      </div>
    </div>
  );
}

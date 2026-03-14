import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PlanningOverview, PlanningWorkoutTemplate } from "../../types";
import type { WorkoutLibraryLayer } from "../types";
import { addDays, disciplineLabel, formatDate, startOfWeek } from "../utils";
import {
  SESSION_ROLE_LABEL,
  workoutLayerCue,
  workoutLayerForTemplate,
  workoutLayerGlyph,
  workoutLayerLabel,
  workoutLayerTone,
} from "../utils-workout";
import { QuickAddIcon } from "./QuickAddIcon";

// ── Types ──

type WorkoutLibraryBrowserProps = {
  workoutLibrary: PlanningWorkoutTemplate[];
  overview: PlanningOverview | null;
  selectedDiscipline: string;
  /** Called when the user wants to preview a workout template. */
  onPreview: (template: PlanningWorkoutTemplate) => void;
  /** Called when the user wants to add a workout to a specific date. If null, the "Anadir a dia" flow is hidden. */
  onAddToDay?: ((template: PlanningWorkoutTemplate, date: string) => void) | null;
  /** Current anchor date for the week picker (defaults to today). */
  anchorDate?: string;
  /** Compact mode omits the toolbar and some padding (for embedding inside QuickAdd). */
  compact?: boolean;
};

const ALL_LAYERS: WorkoutLibraryLayer[] = [
  "recovery",
  "base",
  "lt1",
  "subthreshold",
  "lt2",
  "vo2",
  "technique",
  "strength",
  "specific",
  "other",
];

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

// ── Component ──

export function WorkoutLibraryBrowser({
  workoutLibrary,
  overview,
  selectedDiscipline,
  onPreview,
  onAddToDay,
  anchorDate,
  compact,
}: WorkoutLibraryBrowserProps) {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeDiscipline, setActiveDiscipline] = useState<"running" | "ciclismo" | "natación">(
    (selectedDiscipline === "ciclismo" || selectedDiscipline === "natación") ? selectedDiscipline : "running",
  );
  const [activeLayer, setActiveLayer] = useState<WorkoutLibraryLayer | null>(null);
  const [addingTemplate, setAddingTemplate] = useState<PlanningWorkoutTemplate | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 200);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Classify all templates by layer
  const classifiedLibrary = useMemo(() => {
    const byDiscipline = workoutLibrary.filter(
      (t) => t.discipline === activeDiscipline || t.discipline === "all",
    );
    return byDiscipline.map((t) => ({ template: t, layer: workoutLayerForTemplate(t) }));
  }, [workoutLibrary, activeDiscipline]);

  // Layer counts
  const layerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of classifiedLibrary) {
      counts[item.layer] = (counts[item.layer] ?? 0) + 1;
    }
    return counts;
  }, [classifiedLibrary]);

  // Available layers (those with at least one template)
  const availableLayers = useMemo(
    () => ALL_LAYERS.filter((layer) => (layerCounts[layer] ?? 0) > 0),
    [layerCounts],
  );

  // Filtered results
  const filteredTemplates = useMemo(() => {
    let results = classifiedLibrary;

    // Layer filter
    if (activeLayer) {
      results = results.filter((item) => item.layer === activeLayer);
    }

    // Search filter
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      results = results.filter((item) => {
        const combined = `${item.template.public_label} ${item.template.objective} ${item.template.session_family} ${item.template.summary}`.toLowerCase();
        return combined.includes(lower);
      });
    }

    return results;
  }, [classifiedLibrary, activeLayer, debouncedSearch]);

  // Recommended template ids
  const recommendedIds = useMemo(
    () => new Set((overview?.recommended_workouts ?? []).map((w) => w.template_id)),
    [overview?.recommended_workouts],
  );

  // Week picker dates
  const weekDates = useMemo(() => {
    const anchor = anchorDate ?? new Date().toISOString().slice(0, 10);
    const monday = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [anchorDate]);

  const handleAddToDay = useCallback(
    (date: string) => {
      if (!addingTemplate || !onAddToDay) return;
      onAddToDay(addingTemplate, date);
      setAddingTemplate(null);
    },
    [addingTemplate, onAddToDay],
  );

  // Close week picker on escape
  useEffect(() => {
    if (!addingTemplate) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAddingTemplate(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addingTemplate]);

  const fatigueDots = (cost: number) => {
    const dots: string[] = [];
    for (let i = 1; i <= 5; i++) {
      dots.push(i <= cost ? "filled" : "empty");
    }
    return dots;
  };

  return (
    <div className={`wlb-root ${compact ? "wlb-compact" : ""}`}>
      {/* Toolbar */}
      {!compact && (
        <div className="wlb-toolbar">
          <div className="wlb-toolbar-heading">
            <strong>Biblioteca de sesiones</strong>
            <p>Busca, filtra y anade sesiones desde la biblioteca completa de plantillas.</p>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="wlb-search-row">
        <input
          ref={searchRef}
          type="text"
          className="wlb-search-input"
          placeholder="Buscar por nombre, objetivo o familia..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        {searchText && (
          <button type="button" className="wlb-search-clear" onClick={() => { setSearchText(""); searchRef.current?.focus(); }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Discipline tabs */}
      <div className="wlb-discipline-tabs">
        {(["running", "ciclismo", "natación"] as const).map((disc) => (
          <button
            key={disc}
            type="button"
            className={`wlb-discipline-tab ${activeDiscipline === disc ? "active" : ""}`}
            onClick={() => { setActiveDiscipline(disc); setActiveLayer(null); }}
          >
            <QuickAddIcon kind={disc} />
            <span>{disciplineLabel(disc)}</span>
          </button>
        ))}
      </div>

      {/* Layer filter tabs */}
      <div className="wlb-layer-tabs">
        <button
          type="button"
          className={`wlb-layer-tab ${activeLayer === null ? "active" : ""}`}
          onClick={() => setActiveLayer(null)}
        >
          Todas ({classifiedLibrary.length})
        </button>
        {availableLayers.map((layer) => {
          const tone = workoutLayerTone(layer);
          return (
            <button
              key={layer}
              type="button"
              className={`wlb-layer-tab tone-${tone} ${activeLayer === layer ? "active" : ""}`}
              onClick={() => setActiveLayer(activeLayer === layer ? null : layer)}
            >
              <span className={`wlb-layer-glyph tone-${tone}`}>{workoutLayerGlyph(layer)}</span>
              {workoutLayerLabel(layer)} ({layerCounts[layer] ?? 0})
            </button>
          );
        })}
      </div>

      {/* Active layer cue */}
      {activeLayer && (
        <div className="wlb-layer-cue">
          <p>{workoutLayerCue(activeLayer)}</p>
        </div>
      )}

      {/* Results count */}
      <div className="wlb-results-info">
        <span>{filteredTemplates.length} sesiones</span>
        {debouncedSearch && <span> para &laquo;{debouncedSearch}&raquo;</span>}
      </div>

      {/* Grid of workout cards */}
      <div className="wlb-grid">
        {filteredTemplates.map(({ template, layer }) => {
          const isRecommended = recommendedIds.has(template.template_id);
          const tone = workoutLayerTone(layer);
          const ladderLen = template.dose_ladder.length;
          const isAdding = addingTemplate?.template_id === template.template_id;

          return (
            <div
              key={template.template_id}
              className={`wlb-card tone-border-${tone} ${isRecommended ? "wlb-card-recommended" : ""}`}
            >
              {/* Card top */}
              <div className="wlb-card-head">
                <span className={`wlb-card-layer-badge tone-${tone}`}>{workoutLayerGlyph(layer)}</span>
                {isRecommended && <span className="wlb-card-badge-rec">Sugerida</span>}
              </div>

              {/* Title and info */}
              <strong className="wlb-card-title">{template.public_label}</strong>
              <p className="wlb-card-objective">{template.objective}</p>

              {/* Meta row */}
              <div className="wlb-card-meta">
                <div className="wlb-card-meta-item">
                  <small>Fatiga</small>
                  <span className="wlb-fatigue-dots">
                    {fatigueDots(template.fatigue_cost).map((state, i) => (
                      <span key={i} className={`wlb-fatigue-dot ${state}`} />
                    ))}
                  </span>
                </div>
                {ladderLen > 0 && (
                  <div className="wlb-card-meta-item">
                    <small>Peldanos</small>
                    <strong>{ladderLen}</strong>
                  </div>
                )}
                <div className="wlb-card-meta-item">
                  <small>Rol</small>
                  <strong>{SESSION_ROLE_LABEL[template.session_role] ?? template.session_role}</strong>
                </div>
                <div className="wlb-card-meta-item">
                  <small>Familia</small>
                  <strong>{template.session_family.replace(/_/g, " ")}</strong>
                </div>
              </div>

              {/* Compatible blocks */}
              {template.compatible_block_types.length > 0 && (
                <div className="wlb-card-blocks">
                  {template.compatible_block_types.slice(0, 3).map((bt) => (
                    <span key={bt} className="wlb-block-chip">{bt.replace(/_block$/, "").replace(/_/g, " ")}</span>
                  ))}
                  {template.compatible_block_types.length > 3 && (
                    <span className="wlb-block-chip">+{template.compatible_block_types.length - 3}</span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="wlb-card-actions">
                <button type="button" className="wlb-card-action preview" onClick={() => onPreview(template)}>
                  Vista previa
                </button>
                {onAddToDay && (
                  <button
                    type="button"
                    className={`wlb-card-action add ${isAdding ? "active" : ""}`}
                    onClick={() => setAddingTemplate(isAdding ? null : template)}
                  >
                    {isAdding ? "Cancelar" : "Anadir a dia"}
                  </button>
                )}
              </div>

              {/* Inline week picker */}
              {isAdding && onAddToDay && (
                <div className="wlb-week-picker">
                  <span className="wlb-week-picker-label">Selecciona dia:</span>
                  <div className="wlb-week-picker-days">
                    {weekDates.map((date, i) => {
                      const dayNum = date.slice(8, 10).replace(/^0/, "");
                      return (
                        <button
                          key={date}
                          type="button"
                          className="wlb-week-picker-day"
                          onClick={() => handleAddToDay(date)}
                          title={formatDate(date)}
                        >
                          <span className="wlb-week-picker-day-label">{DAY_LABELS[i]}</span>
                          <span className="wlb-week-picker-day-num">{dayNum}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredTemplates.length === 0 && (
          <article className="wlb-empty">
            <strong>Sin sesiones encontradas.</strong>
            <p>Cambia de capa, disciplina o busqueda para seguir navegando.</p>
          </article>
        )}
      </div>
    </div>
  );
}

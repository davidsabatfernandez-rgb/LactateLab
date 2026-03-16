import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import type { CoachLibrary, CoachWorkoutTemplate, PlanningOverview, PlanningWorkoutTemplate, TrainingZoneItem } from "../../types";
import type { WorkoutLibraryLayer } from "../types";
import type { PlanningAction } from "../context/PlanningContext";
import { disciplineLabel } from "../utils";
import {
  workoutLayerForTemplate,
  workoutLayerGlyph,
  workoutLayerLabel,
  workoutLayerTone,
} from "../utils-workout";
import {
  type WBlock,
  WorkoutBlockBuilder,
  WorkoutBlocksSummary,
  computeWorkoutStats,
  serializeBlocks,
} from "./WorkoutBlockBuilder";

// ── Types ──

type WorkoutLibraryPanelProps = {
  workoutLibrary: PlanningWorkoutTemplate[];
  coachLibraries: CoachLibrary[];
  overview: PlanningOverview | null;
  selectedDiscipline: string;
  token: string;
  dispatch: (action: PlanningAction) => void;
  onPreview: (template: PlanningWorkoutTemplate) => void;
  onAddSessionToDay?: (date: string, discipline: string, template: PlanningWorkoutTemplate | null, manualLabel?: string, opts?: { bla_check?: boolean }) => Promise<void>;
  onOpenWeekEditor?: (lib?: CoachLibrary) => void;
  athleteId?: string | null;
};

const ALL_LAYERS: WorkoutLibraryLayer[] = [
  "recovery", "base", "lt1", "subthreshold", "lt2", "vo2", "technique", "strength", "specific", "other",
];

const COACH_FAMILY_OPTIONS = [
  { value: "recovery_regeneration", label: "Recuperación" },
  { value: "long_aerobic_durability", label: "Base / Aeróbico" },
  { value: "lt1_extensive", label: "LT1" },
  { value: "subthreshold_reps", label: "Subumbral" },
  { value: "lt2_cruise_intervals", label: "LT2 / Umbral" },
  { value: "vo2_hills", label: "VO2max" },
  { value: "economy_strides", label: "Técnica" },
  { value: "strength", label: "Fuerza" },
  { value: "specific", label: "Específico / Competición" },
  { value: "other", label: "Otro" },
];

// ── Folder types ──

type SystemFolder = {
  kind: "system";
  id: string;
  label: string;
  discipline: string;
  layer: WorkoutLibraryLayer;
  templates: PlanningWorkoutTemplate[];
};

type CoachFolder = {
  kind: "coach";
  id: string;
  label: string;
  library: CoachLibrary;
  workouts: CoachWorkoutTemplate[];
};

type LibraryFolder = SystemFolder | CoachFolder;

// ── Component ──

export function WorkoutLibraryPanel({
  workoutLibrary,
  coachLibraries,
  overview,
  selectedDiscipline,
  token,
  dispatch,
  onPreview,
  onAddSessionToDay,
  onOpenWeekEditor,
  athleteId,
}: WorkoutLibraryPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "count">("count");
  const [filterDiscipline, setFilterDiscipline] = useState<"all" | "running" | "ciclismo" | "natación">("all");

  // Load athlete zones
  const [coachZones, setCoachZones] = useState<TrainingZoneItem[] | null>(null);
  useEffect(() => {
    if (!athleteId) return;
    const disc = selectedDiscipline || "running";
    api.activeTrainingZoneSet(token, Number(athleteId), disc)
      .then((zs: unknown) => {
        const set = zs as { zones?: TrainingZoneItem[] };
        if (set?.zones) setCoachZones(set.zones);
      })
      .catch(() => setCoachZones(null));
  }, [athleteId, selectedDiscipline, token]);

  // Block builder state for adding workouts
  const [addingToLibraryId, setAddingToLibraryId] = useState<number | null>(null);
  const [builderBlocks, setBuilderBlocks] = useState<WBlock[]>([]);
  const [builderName, setBuilderName] = useState("");
  const [builderDiscipline, setBuilderDiscipline] = useState(selectedDiscipline || "running");
  const [builderFamily, setBuilderFamily] = useState("lt1_extensive");
  const [savingWorkout, setSavingWorkout] = useState(false);

  // New library form
  const [creatingLibrary, setCreatingLibrary] = useState(false);
  const [newLibName, setNewLibName] = useState("");
  const [newLibCreating, setNewLibCreating] = useState(false);
  const [newLibError, setNewLibError] = useState<string | null>(null);

  const search = searchText.toLowerCase().trim();

  const resetBuilder = useCallback(() => {
    setBuilderBlocks([]);
    setBuilderName("");
    setBuilderFamily("lt1_extensive");
    setAddingToLibraryId(null);
  }, []);

  // Build system folders: group by discipline + layer
  const systemFolders = useMemo<SystemFolder[]>(() => {
    const disciplines: Array<"running" | "ciclismo" | "natación"> = ["running", "ciclismo", "natación"];
    const folders: SystemFolder[] = [];

    for (const disc of disciplines) {
      const discTemplates = workoutLibrary.filter((t) => t.discipline === disc || t.discipline === "all");
      const byLayer = new Map<WorkoutLibraryLayer, PlanningWorkoutTemplate[]>();

      for (const t of discTemplates) {
        const layer = workoutLayerForTemplate(t);
        if (!byLayer.has(layer)) byLayer.set(layer, []);
        byLayer.get(layer)!.push(t);
      }

      for (const layer of ALL_LAYERS) {
        const templates = byLayer.get(layer);
        if (!templates?.length) continue;
        folders.push({
          kind: "system",
          id: `system-${disc}-${layer}`,
          label: `${disciplineLabel(disc)} · ${workoutLayerLabel(layer)}`,
          discipline: disc,
          layer,
          templates,
        });
      }
    }

    return folders;
  }, [workoutLibrary]);

  // Build coach folders
  const coachFolders = useMemo<CoachFolder[]>(() => {
    return coachLibraries.map((lib) => ({
      kind: "coach" as const,
      id: `coach-${lib.id}`,
      label: lib.name,
      library: lib,
      workouts: lib.workouts,
    }));
  }, [coachLibraries]);

  // All folders combined, filtered and sorted
  const allFolders = useMemo<LibraryFolder[]>(() => {
    let folders: LibraryFolder[] = [...coachFolders, ...systemFolders];

    if (filterDiscipline !== "all") {
      folders = folders.filter((f) => {
        if (f.kind === "system") return f.discipline === filterDiscipline;
        return !f.library.discipline || f.library.discipline === filterDiscipline;
      });
    }

    if (search) {
      folders = folders.filter((f) => {
        if (f.label.toLowerCase().includes(search)) return true;
        if (f.kind === "system") {
          return f.templates.some((t) =>
            `${t.public_label} ${t.objective} ${t.session_family}`.toLowerCase().includes(search),
          );
        }
        return f.workouts.some((w) =>
          `${w.public_label} ${w.session_family} ${w.description ?? ""}`.toLowerCase().includes(search),
        );
      });
    }

    if (sortBy === "name") {
      folders.sort((a, b) => a.label.localeCompare(b.label));
    } else {
      folders.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "coach" ? -1 : 1;
        const countA = a.kind === "system" ? a.templates.length : a.workouts.length;
        const countB = b.kind === "system" ? b.templates.length : b.workouts.length;
        return countB - countA;
      });
    }

    return folders;
  }, [coachFolders, systemFolders, filterDiscipline, search, sortBy]);

  const folderCount = (f: LibraryFolder) => f.kind === "system" ? f.templates.length : f.workouts.length;

  const totalSystem = systemFolders.reduce((s, f) => s + f.templates.length, 0);
  const totalCoach = coachFolders.reduce((s, f) => s + f.workouts.length, 0);

  const reloadLibraries = useCallback(async () => {
    const updated = (await api.listCoachLibraries(token)) as CoachLibrary[];
    dispatch({ type: "SET_COACH_LIBRARIES", payload: updated });
  }, [token, dispatch]);

  const handleAddWorkout = useCallback(async (libraryId: number) => {
    if (!builderName.trim() || builderBlocks.length === 0) return;
    setSavingWorkout(true);
    try {
      const stats = computeWorkoutStats(builderBlocks, builderDiscipline);
      const description = serializeBlocks(builderBlocks, builderDiscipline);
      const mainBlock = builderBlocks.find((b) => b.type === "steady" || b.type === "intervals") ?? builderBlocks[0];
      await api.addWorkoutToLibrary(token, libraryId, {
        discipline: builderDiscipline,
        session_family: builderFamily,
        public_label: builderName.trim(),
        intensity_zone: mainBlock?.zone ?? null,
        duration_min: stats.totalMin || null,
        description,
      });
      await reloadLibraries();
      resetBuilder();
    } finally {
      setSavingWorkout(false);
    }
  }, [token, builderName, builderBlocks, builderDiscipline, builderFamily, reloadLibraries, resetBuilder]);

  const handleDeleteWorkout = useCallback(async (libraryId: number, workoutId: number) => {
    await api.deleteWorkoutFromLibrary(token, libraryId, workoutId);
    await reloadLibraries();
  }, [token, reloadLibraries]);

  const handleCreateLibrary = useCallback(async () => {
    if (!newLibName.trim()) return;
    setNewLibCreating(true);
    setNewLibError(null);
    try {
      const created = (await api.createCoachLibrary(token, { name: newLibName.trim() })) as CoachLibrary;
      await reloadLibraries();
      setNewLibName("");
      setCreatingLibrary(false);
      // Auto-expand the new folder
      setExpandedFolderId(`coach-${created.id}`);
    } catch (err) {
      setNewLibError(err instanceof Error ? err.message : "Error al crear carpeta");
    } finally {
      setNewLibCreating(false);
    }
  }, [token, newLibName, reloadLibraries]);

  const handleDeleteLibrary = useCallback(async (id: number) => {
    await api.deleteCoachLibrary(token, id);
    await reloadLibraries();
  }, [token, reloadLibraries]);

  const discColor = (disc: string) => disc === "running" ? "#22c55e" : disc === "ciclismo" ? "#f59e0b" : "#0ea5e9";

  return (
    <div className="wlp-root">
      {/* Header */}
      <div className="wlp-header">
        <h3>Biblioteca de entrenamientos</h3>
        <div className="wlp-header-actions">
          <button
            type="button"
            className="planning-manual-save-btn"
            onClick={() => { setCreatingLibrary(!creatingLibrary); setNewLibError(null); }}
          >
            + Nueva carpeta
          </button>
          {onOpenWeekEditor && (
            <button
              type="button"
              className="planning-manual-save-btn"
              onClick={() => onOpenWeekEditor()}
            >
              + Semana tipo
            </button>
          )}
        </div>
      </div>

      {/* Search + filters */}
      <div className="wlp-toolbar">
        <input
          type="text"
          className="wlp-search"
          placeholder="Buscar entreno..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className="wlp-filters">
          <div className="wlp-filter-group">
            <label>Ordenar</label>
            <select className="wlp-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "count")}>
              <option value="count">Por cantidad</option>
              <option value="name">Alfabético</option>
            </select>
          </div>
          <div className="wlp-filter-group">
            <label>Filtrar</label>
            <select
              className="wlp-select"
              value={filterDiscipline}
              onChange={(e) => setFilterDiscipline(e.target.value as "all" | "running" | "ciclismo" | "natación")}
            >
              <option value="all">Todas ({totalSystem + totalCoach})</option>
              <option value="running">Running</option>
              <option value="ciclismo">Ciclismo</option>
              <option value="natación">Natación</option>
            </select>
          </div>
        </div>
      </div>

      {/* Create library form */}
      {creatingLibrary && (
        <div className="wlp-create-library-form">
          <input
            type="text"
            className="planning-manual-input"
            placeholder="Nombre de la carpeta (ej: Mi biblioteca)"
            value={newLibName}
            onChange={(e) => setNewLibName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateLibrary(); }}
            autoFocus
          />
          <div className="wlp-create-library-actions">
            <button
              type="button"
              className="planning-manual-save-btn"
              disabled={!newLibName.trim() || newLibCreating}
              onClick={handleCreateLibrary}
            >
              {newLibCreating ? "Creando..." : "Crear"}
            </button>
            <button type="button" className="ghost-button" onClick={() => { setCreatingLibrary(false); setNewLibError(null); }}>
              Cancelar
            </button>
          </div>
          {newLibError && <p style={{ color: "#c33", fontSize: "0.75rem", margin: "4px 0 0" }}>{newLibError}</p>}
        </div>
      )}

      {/* Folder list */}
      <div className="wlp-folder-list">
        {allFolders.map((folder) => {
          const isExpanded = expandedFolderId === folder.id;
          const count = folderCount(folder);
          const isCoach = folder.kind === "coach";

          return (
            <div key={folder.id} className={`wlp-folder ${isExpanded ? "expanded" : ""} ${isCoach ? "wlp-folder-coach" : ""}`}>
              {/* Folder header */}
              <button
                type="button"
                className="wlp-folder-header"
                onClick={() => setExpandedFolderId(isExpanded ? null : folder.id)}
              >
                <span className={`wlp-folder-chevron ${isExpanded ? "open" : ""}`}>&#9654;</span>
                {folder.kind === "system" && (
                  <span
                    className={`wlb-card-layer-badge tone-${workoutLayerTone(folder.layer)}`}
                    style={{ fontSize: "0.7rem", marginRight: 6 }}
                  >
                    {workoutLayerGlyph(folder.layer)}
                  </span>
                )}
                {isCoach && <span className="wlp-folder-icon">&#128203;</span>}
                <span className="wlp-folder-name">{folder.label}</span>
                <span className="wlp-folder-count">({count})</span>
              </button>

              {/* Coach folder actions */}
              {isCoach && (
                <div className="wlp-folder-actions">
                  {onOpenWeekEditor && (
                    <button
                      type="button"
                      className="wlp-folder-action"
                      title="Editar semana"
                      onClick={(e) => { e.stopPropagation(); onOpenWeekEditor(folder.library); }}
                    >
                      Ed
                    </button>
                  )}
                  <button
                    type="button"
                    className="wlp-folder-action danger"
                    title="Eliminar carpeta"
                    onClick={(e) => { e.stopPropagation(); handleDeleteLibrary(folder.library.id); }}
                  >
                    x
                  </button>
                </div>
              )}

              {/* Expanded content */}
              {isExpanded && (
                <div className="wlp-folder-body">
                  {folder.kind === "system" ? (
                    // System templates
                    folder.templates
                      .filter((t) => !search || `${t.public_label} ${t.objective} ${t.session_family}`.toLowerCase().includes(search))
                      .map((template) => {
                        const isRec = overview?.recommended_workouts?.some((w) => w.template_id === template.template_id);
                        return (
                          <div key={template.template_id} className={`wlp-workout-item ${isRec ? "recommended" : ""}`}>
                            <div className="wlp-workout-info" onClick={() => onPreview(template)}>
                              <strong>{template.public_label}</strong>
                              <small>{template.objective}</small>
                              <div className="wlp-workout-meta">
                                <span>{template.session_family.replace(/_/g, " ")}</span>
                                {template.dose_ladder.length > 0 && <span>{template.dose_ladder.length} peldaños</span>}
                                {isRec && <span className="wlp-badge-rec">Sugerida</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    // Coach workouts
                    <>
                      {folder.workouts
                        .filter((w) => !search || `${w.public_label} ${w.session_family} ${w.description ?? ""}`.toLowerCase().includes(search))
                        .map((w) => (
                          <div key={w.id} className="wlp-workout-item coach">
                            <div className="wlp-workout-info">
                              <strong>{w.public_label}</strong>
                              <WorkoutBlocksSummary description={w.description} discipline={w.discipline} />
                              <small>
                                <span className="wlp-workout-disc-dot" style={{ background: discColor(w.discipline) }} />
                                {COACH_FAMILY_OPTIONS.find((o) => o.value === w.session_family)?.label ?? w.session_family}
                                {w.intensity_zone ? ` · ${w.intensity_zone}` : ""}
                                {w.duration_min ? ` · ${w.duration_min}'` : ""}
                              </small>
                            </div>
                            <button
                              type="button"
                              className="wlp-folder-action danger"
                              title="Eliminar"
                              onClick={() => handleDeleteWorkout(folder.library.id, w.id)}
                            >
                              x
                            </button>
                          </div>
                        ))}

                      {/* Add workout: block builder */}
                      {addingToLibraryId === folder.library.id ? (
                        <div className="wlp-add-form">
                          <WorkoutBlockBuilder
                            blocks={builderBlocks}
                            discipline={builderDiscipline}
                            name={builderName}
                            family={builderFamily}
                            onChange={(u) => {
                              if (u.blocks !== undefined) setBuilderBlocks(u.blocks);
                              if (u.discipline !== undefined) setBuilderDiscipline(u.discipline);
                              if (u.name !== undefined) setBuilderName(u.name);
                              if (u.family !== undefined) setBuilderFamily(u.family);
                            }}
                            onSave={() => handleAddWorkout(folder.library.id)}
                            onCancel={resetBuilder}
                            saving={savingWorkout}
                            saveLabel="Añadir entreno"
                            compact
                            coachZones={coachZones}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="wlp-add-workout-btn"
                          onClick={() => { resetBuilder(); setAddingToLibraryId(folder.library.id); }}
                        >
                          + Nuevo entreno
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {allFolders.length === 0 && (
          <div className="wlp-empty">
            <strong>Sin resultados</strong>
            <p>Cambia el filtro o la búsqueda.</p>
          </div>
        )}
      </div>
    </div>
  );
}

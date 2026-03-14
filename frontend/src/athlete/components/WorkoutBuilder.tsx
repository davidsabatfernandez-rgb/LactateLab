import React, { useState, useCallback, useMemo } from "react";

/* ── Types ──────────────────────────────────────────────────── */
export interface WorkoutBlock {
  type: "warmup" | "main" | "intervals" | "recovery" | "cooldown";
  durationMin: number;
  zone?: number;
  reps?: number;
  restMin?: number;
  notes?: string;
}

export interface ManualWorkout {
  discipline: string;
  title: string;
  blocks: WorkoutBlock[];
  totalDurationMin: number;
}

interface WorkoutBuilderProps {
  open: boolean;
  onClose: () => void;
  onSave: (workout: ManualWorkout) => void;
  defaultDiscipline?: string;
}

/* ── Constants ──────────────────────────────────────────────── */
const DISCIPLINES = [
  { id: "natación", label: "Natación", icon: "🏊" },
  { id: "ciclismo", label: "Ciclismo", icon: "🚴" },
  { id: "carrera", label: "Carrera", icon: "🏃" },
] as const;

const BLOCK_TYPES = [
  { id: "warmup", label: "Calentamiento", color: "var(--ath-green)" },
  { id: "main", label: "Bloque principal", color: "var(--ath-amber)" },
  { id: "intervals", label: "Intervalos", color: "var(--ath-red)" },
  { id: "recovery", label: "Recuperación", color: "var(--ath-blue)" },
  { id: "cooldown", label: "Enfriamiento", color: "var(--ath-purple)" },
] as const;

const ZONES = [
  { n: 1, label: "Z1", bg: "var(--ath-bg-subtle)", color: "var(--ath-text-muted)" },
  { n: 2, label: "Z2", bg: "var(--ath-green-bg)", color: "var(--ath-green)" },
  { n: 3, label: "Z3", bg: "var(--ath-amber-bg)", color: "var(--ath-amber)" },
  { n: 4, label: "Z4", bg: "var(--ath-red-bg)", color: "var(--ath-red)" },
  { n: 5, label: "Z5", bg: "var(--ath-purple-bg)", color: "var(--ath-purple)" },
];

const DEFAULT_BLOCK: WorkoutBlock = { type: "main", durationMin: 10 };

/* ── Helpers ────────────────────────────────────────────────── */
function blockEffectiveDuration(b: WorkoutBlock): number {
  if (b.type === "intervals" && b.reps) {
    return b.reps * b.durationMin + (b.reps - 1) * (b.restMin ?? 0);
  }
  return b.durationMin;
}

function blockTypeLabel(type: string): string {
  return BLOCK_TYPES.find((bt) => bt.id === type)?.label ?? type;
}

function blockTypeColor(type: string): string {
  return BLOCK_TYPES.find((bt) => bt.id === type)?.color ?? "var(--ath-text-muted)";
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/* ── Component ──────────────────────────────────────────────── */
const WorkoutBuilder: React.FC<WorkoutBuilderProps> = ({
  open,
  onClose,
  onSave,
  defaultDiscipline,
}) => {
  const [discipline, setDiscipline] = useState(defaultDiscipline ?? "carrera");
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const totalMin = useMemo(
    () => blocks.reduce((s, b) => s + blockEffectiveDuration(b), 0),
    [blocks]
  );

  /* block mutations */
  const addBlock = useCallback((type: WorkoutBlock["type"]) => {
    const newBlock: WorkoutBlock = {
      ...DEFAULT_BLOCK,
      type,
      ...(type === "intervals" ? { reps: 4, durationMin: 3, restMin: 1 } : {}),
      ...(type === "warmup" || type === "cooldown" ? { durationMin: 10, zone: 1 } : {}),
      ...(type === "recovery" ? { durationMin: 5, zone: 1 } : {}),
    };
    setBlocks((prev) => [...prev, newBlock]);
    setAddMenuOpen(false);
  }, []);

  const removeBlock = useCallback((idx: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateBlock = useCallback(
    (idx: number, patch: Partial<WorkoutBlock>) => {
      setBlocks((prev) =>
        prev.map((b, i) => (i === idx ? { ...b, ...patch } : b))
      );
    },
    []
  );

  const handleSave = () => {
    const workout: ManualWorkout = {
      discipline,
      title: title.trim() || `Sesión ${discipline}`,
      blocks,
      totalDurationMin: totalMin,
    };
    onSave(workout);
    // reset
    setTitle("");
    setBlocks([]);
  };

  if (!open) return null;

  return (
    <div className="ath-builder-backdrop" onClick={onClose}>
      <div
        className="ath-builder-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ath-builder-header">
          <h2>Crear sesión</h2>
          <button className="ath-builder-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="ath-builder-body">
          {/* Duration badge */}
          <div className="ath-builder-duration-badge">
            {formatDuration(totalMin)}
          </div>

          {/* Title */}
          <input
            className="ath-builder-title-input"
            placeholder="Nombre de la sesión..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Discipline pills */}
          <div className="ath-builder-disciplines">
            {DISCIPLINES.map((d) => (
              <button
                key={d.id}
                className={`ath-builder-disc-pill${
                  discipline === d.id ? " active" : ""
                }`}
                onClick={() => setDiscipline(d.id)}
              >
                <span className="ath-builder-disc-icon">{d.icon}</span>
                {d.label}
              </button>
            ))}
          </div>

          {/* Blocks */}
          <div className="ath-builder-blocks">
            {blocks.length === 0 && (
              <div className="ath-builder-empty">
                Pulsa <strong>+</strong> para agregar bloques
              </div>
            )}

            {blocks.map((block, idx) => (
              <div
                key={idx}
                className="ath-builder-block"
                style={{
                  borderLeftColor: blockTypeColor(block.type),
                }}
              >
                <div className="ath-builder-block-head">
                  <span
                    className="ath-builder-block-type-badge"
                    style={{
                      background: blockTypeColor(block.type),
                    }}
                  >
                    {blockTypeLabel(block.type)}
                  </span>
                  <span className="ath-builder-block-duration-label">
                    {formatDuration(blockEffectiveDuration(block))}
                  </span>
                  <button
                    className="ath-builder-block-remove"
                    onClick={() => removeBlock(idx)}
                    title="Eliminar bloque"
                  >
                    ✕
                  </button>
                </div>

                <div className="ath-builder-block-fields">
                  {/* Intervals-specific fields */}
                  {block.type === "intervals" ? (
                    <div className="ath-builder-interval-row">
                      <label className="ath-builder-field">
                        <span>Reps</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={block.reps ?? 4}
                          onChange={(e) =>
                            updateBlock(idx, {
                              reps: Math.max(1, parseInt(e.target.value) || 1),
                            })
                          }
                        />
                      </label>
                      <span className="ath-builder-interval-x">x</span>
                      <label className="ath-builder-field">
                        <span>Durac. (min)</span>
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={block.durationMin}
                          onChange={(e) =>
                            updateBlock(idx, {
                              durationMin: Math.max(
                                0.5,
                                parseFloat(e.target.value) || 0.5
                              ),
                            })
                          }
                        />
                      </label>
                      <span className="ath-builder-interval-plus">+</span>
                      <label className="ath-builder-field">
                        <span>Desc. (min)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={block.restMin ?? 1}
                          onChange={(e) =>
                            updateBlock(idx, {
                              restMin: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="ath-builder-field">
                      <span>Duración (min)</span>
                      <input
                        type="number"
                        min={1}
                        value={block.durationMin}
                        onChange={(e) =>
                          updateBlock(idx, {
                            durationMin: Math.max(
                              1,
                              parseInt(e.target.value) || 1
                            ),
                          })
                        }
                      />
                    </label>
                  )}

                  {/* Zone chips */}
                  <div className="ath-builder-zones">
                    <span className="ath-builder-zones-label">Zona</span>
                    <div className="ath-builder-zone-chips">
                      {ZONES.map((z) => (
                        <button
                          key={z.n}
                          className={`ath-builder-zone-chip${
                            block.zone === z.n ? " active" : ""
                          }`}
                          style={
                            block.zone === z.n
                              ? { background: z.color, color: "#fff" }
                              : { background: z.bg, color: z.color }
                          }
                          onClick={() =>
                            updateBlock(idx, {
                              zone: block.zone === z.n ? undefined : z.n,
                            })
                          }
                        >
                          {z.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <input
                    className="ath-builder-notes"
                    placeholder="Notas (opcional)..."
                    value={block.notes ?? ""}
                    onChange={(e) =>
                      updateBlock(idx, { notes: e.target.value || undefined })
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Add block button */}
          <div className="ath-builder-add-wrap">
            <button
              className="ath-builder-add-btn"
              onClick={() => setAddMenuOpen(!addMenuOpen)}
            >
              +
            </button>
            {addMenuOpen && (
              <div className="ath-builder-add-menu">
                {BLOCK_TYPES.map((bt) => (
                  <button
                    key={bt.id}
                    className="ath-builder-add-option"
                    onClick={() => addBlock(bt.id as WorkoutBlock["type"])}
                  >
                    <span
                      className="ath-builder-add-dot"
                      style={{ background: bt.color }}
                    />
                    {bt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="ath-builder-footer">
          <button className="ath-builder-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="ath-builder-save"
            disabled={blocks.length === 0}
            onClick={handleSave}
          >
            Guardar sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkoutBuilder;

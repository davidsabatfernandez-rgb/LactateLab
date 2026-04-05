import { useState, useEffect, useCallback, useRef } from "react";
import {
  BEHAVIOR_CATALOG, BEHAVIOR_CATEGORIES,
  type BehaviorEntry, type BehaviorValue,
  isBehaviorActive,
} from "../utils/behaviorJournal";
import { BehaviorToggle } from "./BehaviorToggle";
import { BehaviorPreferencesModal } from "./BehaviorPreferencesModal";
import { BehaviorOnboarding } from "./BehaviorOnboarding";
import { BehaviorInsightsTeaser } from "./BehaviorInsightsTeaser";
import { BehaviorDayDetail } from "./BehaviorDayDetail";
import { BehaviorTemplatesPicker } from "./BehaviorTemplates";
import { api } from "../../lib/api";

type Props = {
  token: string;
  athleteId: number;
  readOnly?: boolean;
  onSavedChange?: (saved: boolean) => void;
};

type CustomBehavior = { id: number; name: string; emoji: string; category: string; is_active: boolean };
type CustomBehaviorLog = { id: number; custom_behavior_id: number; log_date: string; value: boolean };

const CUSTOM_EMOJI_PRESETS = [
  "⭐", "🎯", "💪", "🧠", "❤️", "🔬", "🏃", "🍎",
  "🧘", "🏊", "🚴", "⚽", "🎾", "🥗", "🍵", "💧",
  "🌙", "📚", "🎵", "🐕", "🧹", "💼", "🏠", "✨",
];
const STREAK_MILESTONES = [7, 14, 30, 60, 100];

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toIso(d);
}

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function dayOfWeekLabel(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

function exportBehaviorCsv(
  allEntries: Array<Record<string, unknown>>,
  customBehaviors: CustomBehavior[] = [],
  customLogs: CustomBehaviorLog[] = [],
) {
  const headers = [
    "date",
    ...BEHAVIOR_CATALOG.map((item) => item.label),
    ...customBehaviors.map((cb) => cb.name),
  ];
  const rows = allEntries
    .slice()
    .sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)))
    .map((entry) => {
      const cells: string[] = [String(entry.entry_date ?? "")];
      for (const item of BEHAVIOR_CATALOG) {
        const v = entry[item.key];
        if (v === null || v === undefined) cells.push("");
        else if (typeof v === "boolean") cells.push(v ? "Sí" : "No");
        else if (typeof v === "number") cells.push(String(v));
        else cells.push(String(v));
      }
      for (const cb of customBehaviors) {
        const log = customLogs.find(
          (l) => l.custom_behavior_id === cb.id && l.log_date === String(entry.entry_date),
        );
        cells.push(log && log.value ? "Sí" : "No");
      }
      return cells;
    });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `habitos_${toIso(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BehaviorJournalSection({ token, athleteId, readOnly, onSavedChange }: Props) {
  const todayIso = toIso(new Date());
  const yesterdayIso = addDays(todayIso, -1);

  const [targetDate, setTargetDate] = useState(todayIso);
  const [values, setValues] = useState<BehaviorEntry>({});
  const [preferences, setPreferences] = useState<Record<string, boolean> | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedEmojis, setSavedEmojis] = useState<string[]>([]);
  const [showPrefs, setShowPrefs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [streak, setStreak] = useState<{ current_streak: number; longest_streak: number; total_entries: number } | null>(null);
  const [allEntries, setAllEntries] = useState<Array<Record<string, unknown>>>([]);
  const [heatmapDays, setHeatmapDays] = useState<Record<string, number>>({});

  // Custom behaviors state
  const [customBehaviors, setCustomBehaviors] = useState<CustomBehavior[]>([]);
  const [customValues, setCustomValues] = useState<Record<number, boolean>>({});
  const [customLogs, setCustomLogs] = useState<CustomBehaviorLog[]>([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomEmoji, setNewCustomEmoji] = useState("⭐");
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Day detail modal
  const [detailDate, setDetailDate] = useState<string | null>(null);

  // Templates
  const [showTemplates, setShowTemplates] = useState(false);

  // Streak celebration
  const [streakCelebration, setStreakCelebration] = useState<number | null>(null);

  // Notes
  const [notes, setNotes] = useState("");

  // Timeout refs for cleanup (Fix 3)
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const safeTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutRefs.current.push(id);
    return id;
  };
  useEffect(() => {
    return () => {
      for (const id of timeoutRefs.current) clearTimeout(id);
    };
  }, []);

  // Load everything on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prefs, entries, streakData, customs, cLogs] = await Promise.all([
          api.behaviorPreferences(token, athleteId),
          api.behaviorJournal(token, athleteId, 28),
          api.behaviorStreak(token, athleteId),
          api.customBehaviors(token, athleteId).catch(() => [] as CustomBehavior[]),
          api.customBehaviorLogs(token, athleteId, 28).catch(() => [] as CustomBehaviorLog[]),
        ]);
        if (cancelled) return;
        setPreferences(prefs);
        setAllEntries(entries as Array<Record<string, unknown>>);
        setStreak(streakData);
        setCustomBehaviors((customs as CustomBehavior[]).filter((c) => c.is_active));
        setCustomLogs(cLogs as CustomBehaviorLog[]);

        if (streakData.total_entries === 0) {
          setShowOnboarding(true);
        }

        // Build heatmap
        const hm: Record<string, number> = {};
        for (const entry of entries as Array<Record<string, unknown>>) {
          const d = entry.entry_date as string;
          let count = 0;
          for (const item of BEHAVIOR_CATALOG) {
            const v = entry[item.key];
            if (v !== null && v !== undefined && v !== false && v !== 0) count++;
          }
          hm[d] = count;
        }
        setHeatmapDays(hm);

        loadEntryForDate(entries as Array<Record<string, unknown>>, cLogs as CustomBehaviorLog[], todayIso);
      } catch (e) {
        console.error("Failed to load behavior data:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, athleteId]);

  const loadEntryForDate = (entries: Array<Record<string, unknown>>, cLogs: CustomBehaviorLog[], date: string) => {
    const entry = entries.find((e) => e.entry_date === date);
    if (entry) {
      const restored: BehaviorEntry = {};
      const emojis: string[] = [];
      for (const item of BEHAVIOR_CATALOG) {
        const raw = entry[item.key];
        if (raw !== null && raw !== undefined && raw !== false && raw !== 0) {
          restored[item.key] = raw as BehaviorValue;
          emojis.push(item.emoji);
        }
      }
      setValues(restored);
      setSavedEmojis(emojis);
      setSaved(true);
      setNotes((entry.notes as string) ?? "");
      if (date === todayIso && onSavedChange) onSavedChange(true);

      const cv: Record<number, boolean> = {};
      for (const log of cLogs) {
        if (log.log_date === date) cv[log.custom_behavior_id] = log.value;
      }
      setCustomValues(cv);
    } else {
      setValues({});
      setCustomValues({});
      setSaved(false);
      setNotes("");
      if (date === todayIso && onSavedChange) onSavedChange(false);
    }
  };

  useEffect(() => {
    if (allEntries.length > 0 || !loading) {
      loadEntryForDate(allEntries, customLogs, targetDate);
    }
  }, [targetDate, allEntries, customLogs]);

  const handleChange = useCallback((key: string, value: BehaviorValue | undefined) => {
    setSaveError(null);
    setValues((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const handleCustomToggle = useCallback((id: number) => {
    setSaveError(null);
    setCustomValues((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleCopyYesterday = () => {
    const prevDate = addDays(targetDate, -1);
    const prevEntry = allEntries.find((e) => e.entry_date === prevDate);
    if (!prevEntry) return;
    const restored: BehaviorEntry = {};
    for (const item of BEHAVIOR_CATALOG) {
      const raw = prevEntry[item.key];
      if (raw !== null && raw !== undefined && raw !== false && raw !== 0) {
        restored[item.key] = raw as BehaviorValue;
      }
    }
    setValues(restored);

    const cv: Record<number, boolean> = {};
    for (const log of customLogs) {
      if (log.log_date === prevDate) cv[log.custom_behavior_id] = log.value;
    }
    setCustomValues(cv);

    setCopied(true);
    safeTimeout(() => setCopied(false), 1500);
  };

  const handleApplyTemplate = (templateValues: BehaviorEntry) => {
    setValues((prev) => ({ ...prev, ...templateValues }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const prevStreak = streak?.current_streak ?? 0;
    try {
      const payload: Record<string, unknown> = { entry_date: targetDate, notes: notes.trim() || null };
      if (preferences) {
        for (const item of BEHAVIOR_CATALOG) {
          if (!preferences[item.key]) continue;
          const val = values[item.key];
          if (isBehaviorActive(val)) {
            payload[item.key] = val;
          } else {
            payload[item.key] = item.inputType === "toggle" ? false : null;
          }
        }
      }
      await api.submitBehaviorJournal(token, athleteId, payload);

      const customLogPromises = customBehaviors.map((cb) =>
        api.submitCustomBehaviorLog(token, athleteId, {
          log_date: targetDate,
          custom_behavior_id: cb.id,
          value: !!customValues[cb.id],
        })
      );
      await Promise.allSettled(customLogPromises);

      const emojis: string[] = [];
      let count = 0;
      for (const item of BEHAVIOR_CATALOG) {
        const val = values[item.key];
        if (isBehaviorActive(val)) {
          count++;
          emojis.push(item.emoji);
        }
      }
      for (const cb of customBehaviors) {
        if (customValues[cb.id]) {
          count++;
          emojis.push(cb.emoji);
        }
      }
      setSavedEmojis(emojis);
      setSaved(true);
      setHeatmapDays((prev) => ({ ...prev, [targetDate]: count }));
      if (targetDate === todayIso && onSavedChange) onSavedChange(true);

      // Refresh streak & check milestones
      try {
        const s = await api.behaviorStreak(token, athleteId);
        setStreak(s);
        // Check if we hit a milestone
        if (s.current_streak > prevStreak) {
          const milestone = STREAK_MILESTONES.find((m) => s.current_streak === m);
          if (milestone) {
            setStreakCelebration(milestone);
            safeTimeout(() => setStreakCelebration(null), 3000);
          }
        }
      } catch { /* ignore */ }
    } catch (e) {
      console.error("Behavior journal save failed:", e);
      setSaveError("Error al guardar. Inténtalo de nuevo.");
      safeTimeout(() => setSaveError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handlePreferencesSave = async (prefs: Record<string, boolean>) => {
    try {
      const updated = await api.updateBehaviorPreferences(token, athleteId, prefs);
      setPreferences(updated);
    } catch (e) {
      console.error("Behavior preferences save failed:", e);
    }
    setShowPrefs(false);
  };

  const handleOnboardingComplete = async (prefs: Record<string, boolean>) => {
    try {
      const updated = await api.updateBehaviorPreferences(token, athleteId, prefs);
      setPreferences(updated);
    } catch (e) {
      console.error("Behavior onboarding save failed:", e);
    }
    setShowOnboarding(false);
  };

  const handleCreateCustom = async () => {
    const name = newCustomName.trim();
    if (!name || creatingCustom) return;

    const duplicate = customBehaviors.some((cb) => cb.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setCustomError("Ya existe un hábito con ese nombre.");
      safeTimeout(() => setCustomError(null), 3000);
      return;
    }

    setCreatingCustom(true);
    setCustomError(null);
    try {
      const created = await api.createCustomBehavior(token, athleteId, {
        name,
        emoji: newCustomEmoji,
        category: "custom",
      });
      setCustomBehaviors((prev) => [...prev, created as CustomBehavior]);
      setNewCustomName("");
      setNewCustomEmoji("⭐");
      setShowAddCustom(false);
    } catch (e) {
      console.error("Failed to create custom behavior:", e);
      setCustomError("Error al crear el hábito.");
      safeTimeout(() => setCustomError(null), 3000);
    } finally {
      setCreatingCustom(false);
    }
  };

  // Heatmap click — if saved entry exists, show detail modal; otherwise navigate to edit
  const handleHeatmapClick = (date: string) => {
    const entry = allEntries.find((e) => e.entry_date === date);
    if (entry && date !== targetDate) {
      setDetailDate(date);
    } else if (!readOnly) {
      setTargetDate(date);
    }
  };

  const handleDetailEdit = () => {
    if (detailDate) {
      setTargetDate(detailDate);
      setDetailDate(null);
    }
  };

  const handleDeleteEntry = async () => {
    if (!detailDate) return;
    try {
      await api.deleteBehaviorJournal(token, athleteId, detailDate);
      // Only update local state after successful API call
      setAllEntries((prev) => prev.filter((e) => e.entry_date !== detailDate));
      setHeatmapDays((prev) => {
        const next = { ...prev };
        delete next[detailDate];
        return next;
      });
      // If we deleted the current target date, reset
      if (detailDate === targetDate) {
        setValues({});
        setCustomValues({});
        setSaved(false);
        setSavedEmojis([]);
        setNotes("");
        if (detailDate === todayIso && onSavedChange) onSavedChange(false);
      }
      // Refresh streak
      try {
        const s = await api.behaviorStreak(token, athleteId);
        setStreak(s);
      } catch { /* ignore */ }
    } catch {
      setSaveError("Error al borrar. Inténtalo de nuevo.");
    }
  };

  // Warn before unload if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.keys(values).length > 0 && !saved) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [values, saved]);

  if (loading) return (
    <div className="ath-bj-card">
      <div className="ath-bj-header">
        <h3 className="ath-bj-title">Diario de hábitos</h3>
      </div>
      <p style={{ fontSize: 12, color: "var(--ath-text-muted)", textAlign: "center", padding: "20px 0" }}>Cargando...</p>
    </div>
  );

  if (showOnboarding && preferences && !readOnly) {
    return (
      <section className="ath-behavior-journal">
        <BehaviorOnboarding preferences={preferences} onComplete={handleOnboardingComplete} />
      </section>
    );
  }

  const visibleItems = preferences
    ? BEHAVIOR_CATALOG.filter((item) => preferences[item.key])
    : BEHAVIOR_CATALOG;

  const prevDate = addDays(targetDate, -1);
  const hasPrevEntry = allEntries.some((e) => e.entry_date === prevDate);

  // Build heatmap grid (14 days)
  const heatmapGrid: { date: string; count: number; isTarget: boolean; label: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(todayIso, -i);
    heatmapGrid.push({ date: d, count: heatmapDays[d] ?? 0, isTarget: d === targetDate, label: dayOfWeekLabel(d) });
  }

  return (
    <section className="ath-behavior-journal">
      {/* Streak celebration overlay */}
      {streakCelebration && (
        <div className="ath-bj-celebration">
          <span className="ath-bj-celebration-emoji">🔥</span>
          <span className="ath-bj-celebration-text">{streakCelebration} días seguidos</span>
        </div>
      )}

      {/* Header */}
      <div className="ath-bj-header">
        <div className="ath-bj-title-row">
          <h2 className="ath-section-title">Hábitos</h2>
          {streak && streak.current_streak > 0 && (
            <span className="ath-bj-streak">🔥{streak.current_streak}</span>
          )}
        </div>
        {readOnly ? (
          <button type="button" className="ath-bj-settings" onClick={() => exportBehaviorCsv(allEntries, customBehaviors, customLogs)} aria-label="Exportar CSV" title="Exportar CSV">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        ) : (
          <button type="button" className="ath-bj-settings" onClick={() => setShowPrefs(true)} aria-label="Personalizar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        )}
      </div>

      {/* Date pills */}
      <div className="ath-bj-datebar">
        <button
          type="button"
          className={`ath-bj-date-pill ${targetDate === todayIso ? "active" : ""}`}
          onClick={() => setTargetDate(todayIso)}
        >Hoy</button>
        <button
          type="button"
          className={`ath-bj-date-pill ${targetDate === yesterdayIso ? "active" : ""}`}
          onClick={() => setTargetDate(yesterdayIso)}
        >Ayer</button>
      </div>

      {/* 14-day heatmap */}
      <div className="ath-bj-heatmap">
        {heatmapGrid.map((day) => (
          <button
            key={day.date}
            type="button"
            className={`ath-bj-hm-cell ${day.isTarget ? "target" : ""} tone-${day.count === 0 ? "empty" : day.count <= 3 ? "low" : day.count <= 6 ? "mid" : "high"}`}
            onClick={() => handleHeatmapClick(day.date)}
            title={`${day.date}: ${day.count} hábitos`}
          >
            <span className="ath-bj-hm-dot" />
            <span className="ath-bj-hm-label">{day.label}</span>
          </button>
        ))}
      </div>

      {/* Saved / read-only summary state */}
      {(saved || readOnly) ? (
        <div className="ath-bj-saved">
          <div className="ath-bj-saved-emojis">
            {savedEmojis.length > 0 ? savedEmojis.map((e, i) => (
              <span key={`${targetDate}-${i}`} className="ath-bj-saved-emoji">{e}</span>
            )) : (
              <span className="ath-bj-saved-empty">Sin registros</span>
            )}
          </div>
          {notes && (
            <p className="ath-bj-saved-notes">{notes}</p>
          )}
          {!readOnly && (
            <button type="button" className="ath-bj-edit-btn" onClick={() => setSaved(false)}>Editar</button>
          )}
          <BehaviorInsightsTeaser allEntries={allEntries} />
        </div>
      ) : (
        <div className="ath-bj-edit">
          {/* Quick actions row: copy + templates */}
          {Object.keys(values).length === 0 && (
            <div className="ath-bj-quick-actions">
              {hasPrevEntry && (
                <button type="button" className="ath-bj-quick-btn" onClick={handleCopyYesterday} disabled={copied}>
                  {copied ? "✓ Copiado" : "📋 Copiar ayer"}
                </button>
              )}
              <button type="button" className="ath-bj-quick-btn" onClick={() => setShowTemplates(!showTemplates)}>
                📋 Plantillas
              </button>
            </div>
          )}

          {/* Templates picker */}
          {showTemplates && (
            <BehaviorTemplatesPicker
              onApply={handleApplyTemplate}
              onClose={() => setShowTemplates(false)}
            />
          )}

          {/* Behavior grid */}
          {BEHAVIOR_CATEGORIES.map((cat) => {
            const items = visibleItems.filter((b) => b.category === cat.key);
            if (items.length === 0) return null;
            return (
              <div key={cat.key} className="ath-bj-group">
                <span className="ath-bj-group-label">{cat.label}</span>
                <div className="ath-bj-pills">
                  {items.map((item) => (
                    <BehaviorToggle
                      key={item.key}
                      behaviorKey={item.key}
                      emoji={item.emoji}
                      label={item.label}
                      inputType={item.inputType}
                      value={values[item.key]}
                      onChange={(v) => handleChange(item.key, v)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Custom behaviors */}
          {customBehaviors.length > 0 && (
            <div className="ath-bj-group">
              <span className="ath-bj-group-label">Personalizados</span>
              <div className="ath-bj-pills">
                {customBehaviors.map((cb) => (
                  <BehaviorToggle
                    key={`custom-${cb.id}`}
                    behaviorKey={`custom_${cb.id}`}
                    emoji={cb.emoji}
                    label={cb.name}
                    inputType="toggle"
                    value={customValues[cb.id] || undefined}
                    onChange={() => handleCustomToggle(cb.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add custom */}
          <div className="ath-bj-add-custom">
            {showAddCustom ? (
              <div className="ath-bj-add-form">
                <div className="ath-bj-emoji-row">
                  {CUSTOM_EMOJI_PRESETS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`ath-bj-emoji-opt ${newCustomEmoji === emoji ? "active" : ""}`}
                      onClick={() => setNewCustomEmoji(emoji)}
                    >{emoji}</button>
                  ))}
                </div>
                <input
                  type="text"
                  className="ath-bj-add-input"
                  placeholder="Nombre del hábito"
                  value={newCustomName}
                  onChange={(e) => setNewCustomName(e.target.value)}
                  maxLength={40}
                />
                <div className="ath-bj-add-actions">
                  <button type="button" className="ath-btn-secondary" onClick={() => setShowAddCustom(false)}>Cancelar</button>
                  <button type="button" className="ath-btn-primary" onClick={handleCreateCustom} disabled={!newCustomName.trim() || creatingCustom}>
                    {creatingCustom ? "Creando..." : "Crear"}
                  </button>
                </div>
                {customError && <div className="ath-bj-error">{customError}</div>}
              </div>
            ) : (
              <button type="button" className="ath-bj-add-btn" onClick={() => setShowAddCustom(true)}>
                + Añadir hábito
              </button>
            )}
          </div>

          {/* Notes */}
          <textarea
            className="ath-bj-notes"
            placeholder="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
          />

          {/* Save */}
          {(() => {
            let activeCount = 0;
            for (const item of visibleItems) {
              if (isBehaviorActive(values[item.key])) activeCount++;
            }
            for (const cb of customBehaviors) {
              if (customValues[cb.id]) activeCount++;
            }
            return (
              <>
                <button type="button" className="ath-bj-save" onClick={handleSave} disabled={saving || activeCount === 0}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                {activeCount === 0 && <p className="ath-bj-hint">Selecciona al menos un hábito</p>}
              </>
            );
          })()}
          {saveError && <div className="ath-bj-error ath-bj-error-center">{saveError}</div>}
        </div>
      )}

      {/* Day detail modal */}
      {detailDate && (
        <BehaviorDayDetail
          date={detailDate}
          entry={allEntries.find((e) => e.entry_date === detailDate)}
          customBehaviors={customBehaviors}
          customLogs={customLogs}
          onEdit={handleDetailEdit}
          onDelete={handleDeleteEntry}
          onClose={() => setDetailDate(null)}
          readOnly={readOnly}
        />
      )}

      {/* Preferences modal */}
      {showPrefs && preferences && !readOnly && (
        <BehaviorPreferencesModal
          preferences={preferences}
          onSave={handlePreferencesSave}
          onClose={() => setShowPrefs(false)}
          token={token}
          athleteId={athleteId}
          customBehaviors={customBehaviors}
          onCustomBehaviorDeleted={(id) => setCustomBehaviors((prev) => prev.filter((cb) => cb.id !== id))}
        />
      )}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ThresholdProfileForZones, TrainingZoneItem, TrainingZoneSet } from "../types";

// ── Default zone presets ──────────────────────────────────────────────────

type ZoneDraft = Omit<TrainingZoneItem, "id"> & { key: string };

const DEFAULT_COLORS = ["#3a9a5b", "#2e8b57", "#b58a2e", "#c27a2e", "#c44040", "#7c3aed", "#cd564f"];

function defaultZonesDraft(count = 5): ZoneDraft[] {
  const labels = ["Z1 - Recuperación", "Z2 - Fondo", "Z3 - Tempo", "Z4 - Umbral", "Z5 - VO2max", "Z6 - Anaeróbico", "Z7 - Sprint"];
  return Array.from({ length: count }, (_, i) => ({
    key: `z-${i}-${Date.now()}`,
    zone_number: i + 1,
    zone_label: labels[i] ?? `Z${i + 1}`,
    zone_color: DEFAULT_COLORS[i] ?? "#6b7280",
    pace_lower_seconds: null,
    pace_upper_seconds: null,
    hr_lower: null,
    hr_upper: null,
    power_lower: null,
    power_upper: null,
    description: null,
  }));
}

function zoneSetToZoneDrafts(zs: TrainingZoneSet): ZoneDraft[] {
  return zs.zones.map((z, i) => ({ ...z, key: `existing-${z.id}-${i}` }));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function paceSecondsToLabel(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function paceLabelToSeconds(label: string): number | null {
  const trimmed = label.trim().replace(/\/km$/i, "");
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function sourceColor(source: string) {
  if (source === "individual") return "#2e8b57";
  if (source === "physiological") return "#2e7bd3";
  if (source === "analysis") return "#c27a2e";
  return "#6b7280";
}

// ── Suggested zones from thresholds ────────────────────────────────────────

function suggestZonesFromProfile(profile: ThresholdProfileForZones, discipline: string): ZoneDraft[] {
  const lt1Pace = profile.lt1?.pace_seconds_per_km ?? null;
  const lt2Pace = profile.lt2?.pace_seconds_per_km ?? null;
  const lt1Hr = profile.lt1?.heart_rate ?? null;
  const lt2Hr = profile.lt2?.heart_rate ?? null;
  const lt1Power = profile.lt1?.power_watts ?? null;
  const lt2Power = profile.lt2?.power_watts ?? null;

  // 5-zone model based on LT1/LT2 anchors
  const zones: ZoneDraft[] = [
    {
      key: `sug-0-${Date.now()}`, zone_number: 1, zone_label: "Z1 - Recuperación",
      zone_color: "#3a9a5b",
      pace_lower_seconds: null,
      pace_upper_seconds: lt1Pace ? Math.round(lt1Pace * 1.15) : null,
      hr_lower: null,
      hr_upper: lt1Hr ? Math.round(lt1Hr * 0.88) : null,
      power_lower: null,
      power_upper: lt1Power ? Math.round(lt1Power * 0.65) : null,
      description: "Recuperación activa, conversación fácil.",
    },
    {
      key: `sug-1-${Date.now()}`, zone_number: 2, zone_label: "Z2 - Fondo aeróbico",
      zone_color: "#2e8b57",
      pace_lower_seconds: lt1Pace ? Math.round(lt1Pace * 1.15) : null,
      pace_upper_seconds: lt1Pace ? Math.round(lt1Pace * 1.02) : null,
      hr_lower: lt1Hr ? Math.round(lt1Hr * 0.88) : null,
      hr_upper: lt1Hr ? Math.round(lt1Hr * 0.97) : null,
      power_lower: lt1Power ? Math.round(lt1Power * 0.65) : null,
      power_upper: lt1Power ? Math.round(lt1Power * 0.92) : null,
      description: "Base aeróbica, intensidad moderada.",
    },
    {
      key: `sug-2-${Date.now()}`, zone_number: 3, zone_label: "Z3 - Tempo / LT1",
      zone_color: "#b58a2e",
      pace_lower_seconds: lt1Pace ? Math.round(lt1Pace * 1.02) : null,
      pace_upper_seconds: lt2Pace && lt1Pace ? Math.round((lt1Pace + lt2Pace) / 2) : lt1Pace,
      hr_lower: lt1Hr ? Math.round(lt1Hr * 0.97) : null,
      hr_upper: lt2Hr && lt1Hr ? Math.round((lt1Hr + lt2Hr) / 2) : lt1Hr ? Math.round(lt1Hr * 1.04) : null,
      power_lower: lt1Power ? Math.round(lt1Power * 0.92) : null,
      power_upper: lt2Power && lt1Power ? Math.round((lt1Power + lt2Power) / 2) : lt1Power ? Math.round(lt1Power * 1.08) : null,
      description: "Zona media entre LT1 y LT2.",
    },
    {
      key: `sug-3-${Date.now()}`, zone_number: 4, zone_label: "Z4 - Umbral / LT2",
      zone_color: "#c27a2e",
      pace_lower_seconds: lt2Pace && lt1Pace ? Math.round((lt1Pace + lt2Pace) / 2) : null,
      pace_upper_seconds: lt2Pace ? Math.round(lt2Pace * 0.96) : null,
      hr_lower: lt2Hr && lt1Hr ? Math.round((lt1Hr + lt2Hr) / 2) : null,
      hr_upper: lt2Hr ? Math.round(lt2Hr * 1.02) : null,
      power_lower: lt2Power && lt1Power ? Math.round((lt1Power + lt2Power) / 2) : null,
      power_upper: lt2Power ? Math.round(lt2Power * 1.05) : null,
      description: "Umbral funcional, intensidad sostenible ~40-60 min.",
    },
    {
      key: `sug-4-${Date.now()}`, zone_number: 5, zone_label: "Z5 - VO2max",
      zone_color: "#c44040",
      pace_lower_seconds: lt2Pace ? Math.round(lt2Pace * 0.96) : null,
      pace_upper_seconds: lt2Pace ? Math.round(lt2Pace * 0.88) : null,
      hr_lower: lt2Hr ? Math.round(lt2Hr * 1.02) : null,
      hr_upper: null,
      power_lower: lt2Power ? Math.round(lt2Power * 1.05) : null,
      power_upper: lt2Power ? Math.round(lt2Power * 1.30) : null,
      description: discipline === "ciclismo"
        ? "Potencia aeróbica máxima, intervalos 3-8 min."
        : "Velocidad aeróbica máxima, intervalos 3-6 min.",
    },
  ];

  return zones;
}

// ── Component ──────────────────────────────────────────────────────────────

type TrainingZonesEditorProps = {
  athleteId: number;
  discipline: string;
  token: string;
  existingSet?: TrainingZoneSet | null;
  onSave: (saved: TrainingZoneSet) => void;
  onCancel: () => void;
};

export function TrainingZonesEditor({
  athleteId, discipline, token, existingSet, onSave, onCancel,
}: TrainingZonesEditorProps) {
  const [profile, setProfile] = useState<ThresholdProfileForZones | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [setName, setSetName] = useState(existingSet?.name ?? "");
  const [zones, setZones] = useState<ZoneDraft[]>(
    existingSet ? zoneSetToZoneDrafts(existingSet) : defaultZonesDraft(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showPower = discipline === "ciclismo";
  const showPace = discipline !== "ciclismo";

  useEffect(() => {
    setLoadingProfile(true);
    api.thresholdProfileForZones(token, athleteId, discipline)
      .then((data) => setProfile(data as ThresholdProfileForZones))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [token, athleteId, discipline]);

  const handleSuggestFromThresholds = useCallback(() => {
    if (!profile) return;
    const suggested = suggestZonesFromProfile(profile, discipline);
    setZones(suggested);
    if (!setName) setSetName(`Zonas ${discipline} — ${new Date().toLocaleDateString("es-ES", { month: "short", year: "numeric" })}`);
  }, [profile, discipline, setName]);

  const updateZone = useCallback((key: string, field: string, value: unknown) => {
    setZones((prev) => prev.map((z) => (z.key === key ? { ...z, [field]: value } : z)));
  }, []);

  const addZone = useCallback(() => {
    setZones((prev) => {
      const num = prev.length + 1;
      return [...prev, {
        key: `new-${num}-${Date.now()}`,
        zone_number: num,
        zone_label: `Z${num}`,
        zone_color: DEFAULT_COLORS[num - 1] ?? "#6b7280",
        pace_lower_seconds: null, pace_upper_seconds: null,
        hr_lower: null, hr_upper: null,
        power_lower: null, power_upper: null,
        description: null,
      }];
    });
  }, []);

  const removeZone = useCallback((key: string) => {
    setZones((prev) => prev.filter((z) => z.key !== key).map((z, i) => ({ ...z, zone_number: i + 1 })));
  }, []);

  const handleSave = useCallback(async () => {
    if (!setName.trim()) {
      setError("Introduce un nombre para el conjunto de zonas.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        discipline,
        name: setName.trim(),
        threshold_source: profile?.source ?? "manual",
        threshold_context: profile ? {
          lt1_lactate: profile.lt1?.lactate,
          lt1_pace: profile.lt1?.pace_label,
          lt1_hr: profile.lt1?.heart_rate,
          lt2_lactate: profile.lt2?.lactate,
          lt2_pace: profile.lt2?.pace_label,
          lt2_hr: profile.lt2?.heart_rate,
          source: profile.source,
        } : null,
        zones: zones.map(({ key: _key, ...rest }) => rest),
      };

      let saved: TrainingZoneSet;
      if (existingSet) {
        saved = await api.updateTrainingZoneSet(token, athleteId, existingSet.id, {
          name: payload.name,
          zones: payload.zones,
        }) as TrainingZoneSet;
      } else {
        saved = await api.createTrainingZoneSet(token, athleteId, payload) as TrainingZoneSet;
      }
      onSave(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar zonas.");
    } finally {
      setSaving(false);
    }
  }, [setName, discipline, profile, zones, existingSet, token, athleteId, onSave]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    for (let i = 0; i < zones.length - 1; i++) {
      const current = zones[i];
      const next = zones[i + 1];
      if (current.hr_upper && next.hr_lower && current.hr_upper !== next.hr_lower) {
        w.push(`FC: gap entre Z${current.zone_number} (${current.hr_upper}) y Z${next.zone_number} (${next.hr_lower})`);
      }
    }
    return w;
  }, [zones]);

  return (
    <div className="tz-editor">
      {/* Threshold profile context */}
      <div className="tz-profile-card">
        <div className="tz-profile-head">
          <span className="eyebrow">Perfil de umbral — referencia</span>
          {loadingProfile ? <span className="tz-loading">Cargando...</span> : null}
        </div>
        {profile && !loadingProfile ? (
          <div className="tz-profile-body">
            <span className="tz-profile-source" style={{ borderColor: sourceColor(profile.source) }}>
              {profile.source_label}
            </span>
            <div className="tz-profile-values">
              {profile.lt1 ? (
                <div className="tz-profile-threshold lt1">
                  <strong>LT1</strong>
                  <span>{profile.lt1.lactate.toFixed(1)} mmol</span>
                  {profile.lt1.pace_label ? <span>{profile.lt1.pace_label}</span> : null}
                  {profile.lt1.heart_rate ? <span>{profile.lt1.heart_rate} bpm</span> : null}
                  {profile.lt1.power_watts ? <span>{Math.round(profile.lt1.power_watts)}W</span> : null}
                </div>
              ) : <div className="tz-profile-threshold lt1 empty"><strong>LT1</strong><span>Sin datos</span></div>}
              {profile.lt2 ? (
                <div className="tz-profile-threshold lt2">
                  <strong>LT2</strong>
                  <span>{profile.lt2.lactate.toFixed(1)} mmol</span>
                  {profile.lt2.pace_label ? <span>{profile.lt2.pace_label}</span> : null}
                  {profile.lt2.heart_rate ? <span>{profile.lt2.heart_rate} bpm</span> : null}
                  {profile.lt2.power_watts ? <span>{Math.round(profile.lt2.power_watts)}W</span> : null}
                </div>
              ) : <div className="tz-profile-threshold lt2 empty"><strong>LT2</strong><span>Sin datos</span></div>}
            </div>
            {profile.confidence != null ? (
              <span className="tz-profile-confidence">Confianza: {Math.round(profile.confidence * 100)}%</span>
            ) : null}
            {profile.snapshot_date ? (
              <span className="tz-profile-date">Datos del {profile.snapshot_date}</span>
            ) : null}
          </div>
        ) : !loadingProfile ? (
          <p className="tz-profile-empty">Sin datos de umbral disponibles para {discipline}.</p>
        ) : null}
        {profile && profile.source !== "none" && !loadingProfile ? (
          <button type="button" className="tz-suggest-btn" onClick={handleSuggestFromThresholds}>
            Pre-rellenar desde umbrales
          </button>
        ) : null}
      </div>

      {/* Set name */}
      <div className="tz-name-row">
        <label htmlFor="tz-set-name">Nombre del conjunto</label>
        <input
          id="tz-set-name"
          className="tz-name-input"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
          placeholder="Ej: Zonas post-test marzo 2026"
        />
      </div>

      {/* Zone rows */}
      <div className="tz-zones-table">
        <div className="tz-zones-header">
          <span className="tz-col-color" />
          <span className="tz-col-label">Zona</span>
          {showPace ? <span className="tz-col-pace">Ritmo (min/km)</span> : null}
          <span className="tz-col-hr">FC (bpm)</span>
          {showPower ? <span className="tz-col-power">Potencia (W)</span> : null}
          <span className="tz-col-actions" />
        </div>

        {zones.map((zone) => (
          <div key={zone.key} className="tz-zone-row" style={{ borderLeftColor: zone.zone_color ?? "#6b7280" }}>
            <input
              type="color"
              className="tz-color-picker"
              value={zone.zone_color ?? "#6b7280"}
              onChange={(e) => updateZone(zone.key, "zone_color", e.target.value)}
              title="Color de zona"
            />
            <input
              className="tz-label-input"
              value={zone.zone_label}
              onChange={(e) => updateZone(zone.key, "zone_label", e.target.value)}
              placeholder={`Z${zone.zone_number}`}
            />
            {showPace ? (
              <div className="tz-range-inputs">
                <input
                  className="tz-range-input"
                  value={paceSecondsToLabel(zone.pace_lower_seconds)}
                  onChange={(e) => updateZone(zone.key, "pace_lower_seconds", paceLabelToSeconds(e.target.value))}
                  placeholder="lento"
                  title="Ritmo más lento (ej: 6:00)"
                />
                <span className="tz-range-sep">–</span>
                <input
                  className="tz-range-input"
                  value={paceSecondsToLabel(zone.pace_upper_seconds)}
                  onChange={(e) => updateZone(zone.key, "pace_upper_seconds", paceLabelToSeconds(e.target.value))}
                  placeholder="rápido"
                  title="Ritmo más rápido (ej: 5:00)"
                />
              </div>
            ) : null}
            <div className="tz-range-inputs">
              <input
                type="number"
                className="tz-range-input"
                value={zone.hr_lower ?? ""}
                onChange={(e) => updateZone(zone.key, "hr_lower", e.target.value ? Number(e.target.value) : null)}
                placeholder="min"
              />
              <span className="tz-range-sep">–</span>
              <input
                type="number"
                className="tz-range-input"
                value={zone.hr_upper ?? ""}
                onChange={(e) => updateZone(zone.key, "hr_upper", e.target.value ? Number(e.target.value) : null)}
                placeholder="max"
              />
            </div>
            {showPower ? (
              <div className="tz-range-inputs">
                <input
                  type="number"
                  className="tz-range-input"
                  value={zone.power_lower ?? ""}
                  onChange={(e) => updateZone(zone.key, "power_lower", e.target.value ? Number(e.target.value) : null)}
                  placeholder="min"
                />
                <span className="tz-range-sep">–</span>
                <input
                  type="number"
                  className="tz-range-input"
                  value={zone.power_upper ?? ""}
                  onChange={(e) => updateZone(zone.key, "power_upper", e.target.value ? Number(e.target.value) : null)}
                  placeholder="max"
                />
              </div>
            ) : null}
            <button type="button" className="tz-remove-btn" onClick={() => removeZone(zone.key)} title="Eliminar zona">&times;</button>
          </div>
        ))}
      </div>

      <button type="button" className="tz-add-btn" onClick={addZone}>+ Añadir zona</button>

      {warnings.length > 0 ? (
        <div className="tz-warnings">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      ) : null}

      {error ? <p className="tz-error">{error}</p> : null}

      <div className="tz-actions">
        <button type="button" className="tz-cancel-btn" onClick={onCancel}>Cancelar</button>
        <button type="button" className="tz-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : existingSet ? "Actualizar zonas" : "Guardar zonas"}
        </button>
      </div>
    </div>
  );
}

// ── Compact display component ──────────────────────────────────────────────

type TrainingZonesDisplayProps = {
  zoneSet: TrainingZoneSet;
  discipline: string;
  onEdit?: () => void;
  compact?: boolean;
};

export function TrainingZonesDisplay({ zoneSet, discipline, onEdit, compact }: TrainingZonesDisplayProps) {
  const showPace = discipline !== "ciclismo";
  const showPower = discipline === "ciclismo";

  return (
    <div className={`tz-display ${compact ? "tz-compact" : ""}`}>
      <div className="tz-display-head">
        <div>
          <strong>{zoneSet.name}</strong>
          {zoneSet.threshold_source ? (
            <span className="tz-display-source" style={{ borderColor: sourceColor(zoneSet.threshold_source) }}>
              {zoneSet.threshold_source === "individual" ? "Individual" : zoneSet.threshold_source === "physiological" ? "Fisiológico" : zoneSet.threshold_source === "analysis" ? "Análisis" : "Manual"}
            </span>
          ) : null}
        </div>
        {onEdit ? (
          <button type="button" className="tz-edit-btn" onClick={onEdit}>Editar</button>
        ) : null}
      </div>
      <div className="tz-display-bars">
        {zoneSet.zones.map((zone) => (
          <div key={zone.id} className="tz-display-bar" style={{ borderLeftColor: zone.zone_color ?? "#6b7280" }}>
            <span className="tz-display-bar-label">{zone.zone_label}</span>
            <div className="tz-display-bar-values">
              {showPace && (zone.pace_lower_seconds || zone.pace_upper_seconds) ? (
                <span>
                  {paceSecondsToLabel(zone.pace_lower_seconds) || "—"}
                  {" – "}
                  {paceSecondsToLabel(zone.pace_upper_seconds) || "—"}
                  /km
                </span>
              ) : null}
              {(zone.hr_lower || zone.hr_upper) ? (
                <span>{zone.hr_lower ?? "—"} – {zone.hr_upper ?? "—"} bpm</span>
              ) : null}
              {showPower && (zone.power_lower || zone.power_upper) ? (
                <span>{zone.power_lower ?? "—"} – {zone.power_upper ?? "—"} W</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ThresholdProfileForZones, TrainingZoneItem, TrainingZoneSet } from "../types";

// ── Default zone presets ──────────────────────────────────────────────────

type ZoneDraft = Omit<TrainingZoneItem, "id"> & { key: string };

const DEFAULT_COLORS = [
  "#3a9a5b", "#2e8b57", "#6dae48", "#b58a2e", "#d4a017",
  "#c27a2e", "#e06030", "#c44040", "#7c3aed", "#cd564f",
];

const ZONE_PRESETS: Record<string, { label: string; color: string; description: string }[]> = {
  running: [
    { label: "E1 - Recuperación", color: "#3a9a5b", description: "Trote suave, recuperación activa." },
    { label: "E2 - Fondo aeróbico", color: "#2e8b57", description: "Base aeróbica, conversación cómoda. Incluye sub-LT1." },
    { label: "LT1 - Umbral aeróbico", color: "#b58a2e", description: "Zona de LT1 práctico. Intensidad de referencia para sesiones LT1." },
    { label: "Tempo", color: "#d4a017", description: "Entre LT1 y LT2 prácticos. Maratón pace, medio fondo." },
    { label: "LT2 - Umbral anaeróbico", color: "#c27a2e", description: "Zona de LT2 práctico. Referencia para intervalos de umbral." },
    { label: "VO2max", color: "#c44040", description: "Potencia aeróbica máxima, intervalos 2-6 min." },
    { label: "ANC - Anaeróbico", color: "#7c3aed", description: "Capacidad anaeróbica, esfuerzos <2 min." },
  ],
  ciclismo: [
    { label: "Z1 - Recuperación", color: "#3a9a5b", description: "Pedaleo suave, recuperación activa." },
    { label: "Z2 - Resistencia", color: "#2e8b57", description: "Base aeróbica, larga duración." },
    { label: "Z3 - Tempo", color: "#b58a2e", description: "Esfuerzo sostenido, entre LT1 y LT2." },
    { label: "Z4 - Umbral (FTP)", color: "#c27a2e", description: "Potencia de umbral funcional, ~40-60 min." },
    { label: "Z5 - VO2max", color: "#c44040", description: "Potencia aeróbica máxima, intervalos 3-8 min." },
    { label: "Z6 - Capacidad anaeróbica", color: "#7c3aed", description: "Esfuerzos 30s-2 min, alta potencia." },
    { label: "Z7 - Neuromuscular", color: "#cd564f", description: "Sprints <30s, potencia máxima." },
  ],
  natacion: [
    { label: "Z1 - Recuperación", color: "#3a9a5b", description: "Nado suave, técnica y recuperación." },
    { label: "Z2 - Aeróbico base", color: "#2e8b57", description: "Resistencia aeróbica, larga distancia." },
    { label: "Z3 - Aeróbico medio", color: "#6dae48", description: "Nado constante sub-CSS." },
    { label: "Z4 - Sub-umbral", color: "#b58a2e", description: "Justo debajo de CSS, series 400-1000m." },
    { label: "Z5 - CSS/Umbral", color: "#c27a2e", description: "Critical Swim Speed, series 100-400m." },
    { label: "Z6 - VO2max", color: "#c44040", description: "Intervalos 50-200m a máxima intensidad aeróbica." },
    { label: "Z7 - Anaeróbico", color: "#7c3aed", description: "Sprints 25-100m, velocidad máxima." },
  ],
};

function defaultZonesDraft(discipline?: string): ZoneDraft[] {
  const preset = ZONE_PRESETS[discipline ?? ""] ?? ZONE_PRESETS.running;
  return preset.map((p, i) => ({
    key: `z-${i}-${Date.now()}`,
    zone_number: i + 1,
    zone_label: p.label,
    zone_color: p.color,
    pace_lower_seconds: null,
    pace_upper_seconds: null,
    hr_lower: null,
    hr_upper: null,
    power_lower: null,
    power_upper: null,
    description: p.description,
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

export function suggestZonesFromProfile(profile: ThresholdProfileForZones, discipline: string): ZoneDraft[] {
  // Fisiológicos (2.0/4.0 mmol) — para E1/E2 y VO2max/ANC
  const lt1Pace = profile.lt1?.pace_seconds_per_km ?? null;
  const lt2Pace = profile.lt2?.pace_seconds_per_km ?? null;
  const lt1Hr = profile.lt1?.heart_rate != null ? Math.round(profile.lt1.heart_rate) : null;
  const lt2Hr = profile.lt2?.heart_rate != null ? Math.round(profile.lt2.heart_rate) : null;
  const lt2Power = profile.lt2?.power_watts != null ? Math.round(profile.lt2.power_watts) : null;

  // Prácticos (~1.6/~3.1 mmol) — para zonas LT1 y LT2 de entrenamiento
  const pLt1Pace = profile.practical_lt1?.pace_seconds_per_km ?? lt1Pace;
  const pLt1Hr = profile.practical_lt1?.heart_rate != null ? Math.round(profile.practical_lt1.heart_rate) : lt1Hr;
  const pLt2Pace = profile.practical_lt2?.pace_seconds_per_km ?? lt2Pace;
  const pLt2Hr = profile.practical_lt2?.heart_rate != null ? Math.round(profile.practical_lt2.heart_rate) : lt2Hr;
  const pLt2Power = profile.practical_lt2?.power_watts != null ? Math.round(profile.practical_lt2.power_watts) : lt2Power;

  const ts = Date.now();
  const mk = (i: number, preset: typeof ZONE_PRESETS["running"][0], overrides: Partial<ZoneDraft>): ZoneDraft => ({
    key: `sug-${i}-${ts}`,
    zone_number: i + 1,
    zone_label: preset.label,
    zone_color: preset.color,
    pace_lower_seconds: null,
    pace_upper_seconds: null,
    hr_lower: null,
    hr_upper: null,
    power_lower: null,
    power_upper: null,
    description: preset.description,
    ...overrides,
  });

  // Helper: interpolación entre prácticos LT1 y LT2
  const pPaceAt = (fraction: number) =>
    pLt1Pace && pLt2Pace ? Math.round(pLt1Pace + (pLt2Pace - pLt1Pace) * fraction) : null;
  const pHrAt = (fraction: number) =>
    pLt1Hr && pLt2Hr ? Math.round(pLt1Hr + (pLt2Hr - pLt1Hr) * fraction) : null;

  if (discipline === "ciclismo") {
    // Coggan 7-zone — FTP = LT2 práctico (no fisiológico)
    const ftp = pLt2Power;
    const lt1P = profile.practical_lt1?.power_watts ?? (ftp ? Math.round(ftp * 0.75) : null);
    const preset = ZONE_PRESETS.ciclismo;
    return [
      mk(0, preset[0], {
        hr_upper: pLt1Hr ? Math.round(pLt1Hr * 0.82) : null,
        power_upper: ftp ? Math.round(ftp * 0.55) : null,
      }),
      mk(1, preset[1], {
        hr_lower: pLt1Hr ? Math.round(pLt1Hr * 0.82) : null,
        hr_upper: pLt1Hr,
        power_lower: ftp ? Math.round(ftp * 0.55) : null,
        power_upper: lt1P,
      }),
      mk(2, preset[2], {
        hr_lower: pLt1Hr,
        hr_upper: pLt2Hr ? Math.round(pLt2Hr * 0.92) : null,
        power_lower: lt1P,
        power_upper: ftp ? Math.round(ftp * 0.90) : null,
      }),
      mk(3, preset[3], {  // Z4 = FTP = LT2 práctico
        hr_lower: pLt2Hr ? Math.round(pLt2Hr * 0.92) : null,
        hr_upper: pLt2Hr ? Math.round(pLt2Hr * 1.02) : null,
        power_lower: ftp ? Math.round(ftp * 0.90) : null,
        power_upper: ftp ? Math.round(ftp * 1.05) : null,
      }),
      mk(4, preset[4], {
        hr_lower: pLt2Hr ? Math.round(pLt2Hr * 1.02) : null,
        hr_upper: null,
        power_lower: ftp ? Math.round(ftp * 1.05) : null,
        power_upper: ftp ? Math.round(ftp * 1.20) : null,
      }),
      mk(5, preset[5], {
        power_lower: ftp ? Math.round(ftp * 1.20) : null,
        power_upper: ftp ? Math.round(ftp * 1.50) : null,
      }),
      mk(6, preset[6], {
        power_lower: ftp ? Math.round(ftp * 1.50) : null,
      }),
    ];
  }

  if (discipline === "natacion") {
    // 7-zone swim — CSS = LT2 práctico pace
    const css = pLt2Pace;
    const preset = ZONE_PRESETS.natacion;
    return [
      mk(0, preset[0], {
        pace_upper_seconds: css ? Math.round(css * 1.25) : null,
        hr_upper: pLt1Hr ? Math.round(pLt1Hr * 0.82) : null,
      }),
      mk(1, preset[1], {
        pace_lower_seconds: css ? Math.round(css * 1.25) : null,
        pace_upper_seconds: css ? Math.round(css * 1.12) : null,
        hr_lower: pLt1Hr ? Math.round(pLt1Hr * 0.82) : null,
        hr_upper: pLt1Hr ? Math.round(pLt1Hr * 0.92) : null,
      }),
      mk(2, preset[2], {
        pace_lower_seconds: css ? Math.round(css * 1.12) : null,
        pace_upper_seconds: css ? Math.round(css * 1.05) : null,
        hr_lower: pLt1Hr ? Math.round(pLt1Hr * 0.92) : null,
        hr_upper: pLt1Hr,
      }),
      mk(3, preset[3], {
        pace_lower_seconds: css ? Math.round(css * 1.05) : null,
        pace_upper_seconds: css ? Math.round(css * 1.01) : null,
        hr_lower: pLt1Hr,
        hr_upper: pHrAt(0.85),
      }),
      mk(4, preset[4], {  // CSS = LT2 práctico
        pace_lower_seconds: css ? Math.round(css * 1.01) : null,
        pace_upper_seconds: css ? Math.round(css * 0.97) : null,
        hr_lower: pHrAt(0.85),
        hr_upper: pLt2Hr,
      }),
      mk(5, preset[5], {
        pace_lower_seconds: css ? Math.round(css * 0.97) : null,
        pace_upper_seconds: css ? Math.round(css * 0.90) : null,
        hr_lower: pLt2Hr,
        hr_upper: null,
      }),
      mk(6, preset[6], {
        pace_lower_seconds: css ? Math.round(css * 0.90) : null,
        pace_upper_seconds: null,
      }),
    ];
  }

  // ── Running: 7 zonas (Seiler 2010, Faude 2009, Billat 2001) ──
  // E1/E2 anclados en LT1 fisiológico; LT1/LT2 en prácticos; VO2max/ANC en LT2 fisiológico
  const preset = ZONE_PRESETS.running;
  return [
    mk(0, preset[0], {  // E1: <85% FC LT1 práctico
      pace_upper_seconds: pLt1Pace ? Math.round(pLt1Pace * 1.15) : null,
      hr_upper: pLt1Hr ? Math.round(pLt1Hr * 0.85) : null,
    }),
    mk(1, preset[1], {  // E2: 85% LT1 práctico → LT1 práctico (incluye sub-LT1)
      pace_lower_seconds: pLt1Pace ? Math.round(pLt1Pace * 1.15) : null,
      pace_upper_seconds: pLt1Pace,
      hr_lower: pLt1Hr ? Math.round(pLt1Hr * 0.85) : null,
      hr_upper: pLt1Hr,
    }),
    mk(2, preset[2], {  // LT1: zona del LT1 práctico → ~35% del gap hacia LT2 práctico
      pace_lower_seconds: pLt1Pace,
      pace_upper_seconds: pPaceAt(0.35),
      hr_lower: pLt1Hr,
      hr_upper: pHrAt(0.35),
    }),
    mk(3, preset[3], {  // Tempo: 35-70% del gap entre prácticos
      pace_lower_seconds: pPaceAt(0.35),
      pace_upper_seconds: pPaceAt(0.70),
      hr_lower: pHrAt(0.35),
      hr_upper: pHrAt(0.70),
    }),
    mk(4, preset[4], {  // LT2: 70% gap → LT2 práctico + 3% (margen de tolerancia)
      pace_lower_seconds: pPaceAt(0.70),
      pace_upper_seconds: pLt2Pace ? Math.round(pLt2Pace * 0.97) : null,
      hr_lower: pHrAt(0.70),
      hr_upper: pLt2Hr ? Math.round(pLt2Hr * 1.02) : null,
    }),
    mk(5, preset[5], {  // VO2max: por encima de LT2 fisiológico
      pace_lower_seconds: lt2Pace ? Math.round(lt2Pace * 0.97) : (pLt2Pace ? Math.round(pLt2Pace * 0.94) : null),
      pace_upper_seconds: lt2Pace ? Math.round(lt2Pace * 0.88) : (pLt2Pace ? Math.round(pLt2Pace * 0.85) : null),
      hr_lower: lt2Hr ? Math.round(lt2Hr * 1.02) : (pLt2Hr ? Math.round(pLt2Hr * 1.05) : null),
      hr_upper: null,
    }),
    mk(6, preset[6], {  // ANC: >112% LT2
      pace_lower_seconds: lt2Pace ? Math.round(lt2Pace * 0.88) : (pLt2Pace ? Math.round(pLt2Pace * 0.85) : null),
      pace_upper_seconds: null,
    }),
  ];
}

// ── Component ──────────────────────────────────────────────────────────────

type TrainingZonesEditorProps = {
  athleteId: number;
  discipline: string;
  token: string;
  existingSet?: TrainingZoneSet | null;
  prebuiltProfile?: ThresholdProfileForZones | null;
  onSave: (saved: TrainingZoneSet) => void;
  onCancel: () => void;
};

export function TrainingZonesEditor({
  athleteId, discipline, token, existingSet, prebuiltProfile, onSave, onCancel,
}: TrainingZonesEditorProps) {
  const [profile, setProfile] = useState<ThresholdProfileForZones | null>(prebuiltProfile ?? null);
  const [loadingProfile, setLoadingProfile] = useState(!prebuiltProfile);
  const [setName, setSetName] = useState(existingSet?.name ?? "");
  const [zones, setZones] = useState<ZoneDraft[]>(
    existingSet ? zoneSetToZoneDrafts(existingSet) : defaultZonesDraft(discipline),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSuggested, setAutoSuggested] = useState(false);

  const showPower = discipline === "ciclismo";
  const showPace = discipline !== "ciclismo";

  useEffect(() => {
    if (prebuiltProfile) {
      setProfile(prebuiltProfile);
      setLoadingProfile(false);
      return;
    }
    setLoadingProfile(true);
    api.thresholdProfileForZones(token, athleteId, discipline)
      .then((data) => setProfile(data as ThresholdProfileForZones))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [token, athleteId, discipline, prebuiltProfile]);

  const handleSuggestFromThresholds = useCallback(() => {
    if (!profile) return;
    const suggested = suggestZonesFromProfile(profile, discipline);
    setZones(suggested);
    setAutoSuggested(true);
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
                  <strong>LT1 fisiol.</strong>
                  <span>{profile.lt1.lactate.toFixed(1)} mmol</span>
                  {profile.lt1.pace_label ? <span>{profile.lt1.pace_label}</span> : null}
                  {profile.lt1.heart_rate ? <span>{profile.lt1.heart_rate} bpm</span> : null}
                  {profile.lt1.power_watts ? <span>{Math.round(profile.lt1.power_watts)}W</span> : null}
                </div>
              ) : <div className="tz-profile-threshold lt1 empty"><strong>LT1</strong><span>Sin datos</span></div>}
              {profile.practical_lt1 ? (
                <div className="tz-profile-threshold lt1">
                  <strong>LT1 pract.</strong>
                  <span>{profile.practical_lt1.lactate.toFixed(1)} mmol</span>
                  {profile.practical_lt1.pace_label ? <span>{profile.practical_lt1.pace_label}</span> : null}
                  {profile.practical_lt1.heart_rate ? <span>{profile.practical_lt1.heart_rate} bpm</span> : null}
                  {profile.practical_lt1.power_watts ? <span>{Math.round(profile.practical_lt1.power_watts)}W</span> : null}
                </div>
              ) : null}
              {profile.lt2 ? (
                <div className="tz-profile-threshold lt2">
                  <strong>LT2 fisiol.</strong>
                  <span>{profile.lt2.lactate.toFixed(1)} mmol</span>
                  {profile.lt2.pace_label ? <span>{profile.lt2.pace_label}</span> : null}
                  {profile.lt2.heart_rate ? <span>{profile.lt2.heart_rate} bpm</span> : null}
                  {profile.lt2.power_watts ? <span>{Math.round(profile.lt2.power_watts)}W</span> : null}
                </div>
              ) : <div className="tz-profile-threshold lt2 empty"><strong>LT2</strong><span>Sin datos</span></div>}
              {profile.practical_lt2 ? (
                <div className="tz-profile-threshold lt2">
                  <strong>LT2 pract.</strong>
                  <span>{profile.practical_lt2.lactate.toFixed(1)} mmol</span>
                  {profile.practical_lt2.pace_label ? <span>{profile.practical_lt2.pace_label}</span> : null}
                  {profile.practical_lt2.heart_rate ? <span>{profile.practical_lt2.heart_rate} bpm</span> : null}
                  {profile.practical_lt2.power_watts ? <span>{Math.round(profile.practical_lt2.power_watts)}W</span> : null}
                </div>
              ) : null}
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

      {/* Auto-calculation warning */}
      {autoSuggested ? (
        <div className="tz-auto-warning">
          <strong>Zonas auto-calculadas</strong> — Revisa y ajusta los valores.
          {profile?.practical_lt1 || profile?.practical_lt2
            ? " Las zonas LT1 y LT2 usan umbrales prácticos (intensidad de entrenamiento), no fisiológicos."
            : " Sin umbrales prácticos disponibles; se usaron los fisiológicos como referencia."}
          {profile?.confidence != null && profile.confidence < 0.6
            ? " La confianza de los datos es baja — valida con un test reciente."
            : null}
        </div>
      ) : null}

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

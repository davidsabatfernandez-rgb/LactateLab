import { useCallback, useEffect, useMemo, useState } from "react";
import { useAthleteData } from "../context/AthleteDataContext";
import { disciplineLabel } from "../utils/formatters";
import { api } from "../../lib/api";
import type { TrainingZoneSet } from "../../types";
import { ThresholdAnchorBanner } from "../components/ThresholdAnchorBanner";

const ZONE_COLORS_FALLBACK = [
  "#10B981", // 1 REC - green
  "#22c55e", // 2 BASE - emerald
  "#3B82F6", // 3 LT1 - blue
  "#8B5CF6", // 4 SUB - purple
  "#F59E0B", // 5 LT2 - amber
  "#EF4444", // 6 VO2MAX - red
  "#DC2626", // 7 ANC - deep red
];

function formatPaceValue(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "–";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type StalenessInfo = {
  is_stale: boolean;
  reason: string | null;
  lt2_pace_delta_seconds: number | null;
  lt2_hr_delta: number | null;
  lt2_power_delta: number | null;
};

export function ZonesPage() {
  const data = useAthleteData();
  const snapshots = data.disciplineSnapshots;
  const [zoneSet, setZoneSet] = useState<TrainingZoneSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleness, setStaleness] = useState<StalenessInfo | null>(null);

  const athleteId = data.user?.athlete_id;

  // Fetch active zone set + staleness check
  const fetchZones = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    setError(null);
    setStaleness(null);
    try {
      const result = await api.activeTrainingZoneSet(data.token, athleteId, data.selectedDiscipline);
      setZoneSet(result as TrainingZoneSet);

      // Check if zones are stale (thresholds improved since zones were created)
      try {
        const stale = await api.zoneStalenessCheck(data.token, athleteId, data.selectedDiscipline);
        setStaleness(stale);
      } catch { /* staleness is optional */ }
    } catch {
      setZoneSet(null);
      setError("Tu entrenador aún no ha configurado zonas para esta disciplina.");
    } finally {
      setLoading(false);
    }
  }, [data.token, athleteId, data.selectedDiscipline]);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const zones = zoneSet?.zones ?? [];
  const hasHr = zones.some((z) => z.hr_lower || z.hr_upper);
  const hasPace = zones.some((z) => z.pace_lower_seconds || z.pace_upper_seconds);
  const hasPower = zones.some((z) => z.power_lower || z.power_upper);

  // Anchor status from discipline view
  const anchorStatus = useMemo(() => {
    const views = data.analysis?.discipline_views ?? {};
    const view = views[data.selectedDiscipline];
    return view?.threshold_anchor_status ?? null;
  }, [data.analysis, data.selectedDiscipline]);

  // Updated date
  const updatedLabel = useMemo(() => {
    if (!zoneSet) return null;
    const d = new Date((zoneSet as any).updated_at ?? (zoneSet as any).created_at);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }, [zoneSet]);

  // Build staleness detail text
  const stalenessDetail = useMemo(() => {
    if (!staleness?.is_stale) return null;
    const parts: string[] = [];
    if (staleness.lt2_pace_delta_seconds && Math.abs(staleness.lt2_pace_delta_seconds) >= 3) {
      const sign = staleness.lt2_pace_delta_seconds < 0 ? "+" : "-";
      parts.push(`${sign}${Math.abs(Math.round(staleness.lt2_pace_delta_seconds))}s/km en ritmo`);
    }
    if (staleness.lt2_hr_delta && Math.abs(staleness.lt2_hr_delta) >= 2) {
      const sign = staleness.lt2_hr_delta > 0 ? "+" : "";
      parts.push(`${sign}${Math.round(staleness.lt2_hr_delta)} bpm en FC`);
    }
    if (staleness.lt2_power_delta && Math.abs(staleness.lt2_power_delta) >= 3) {
      const sign = staleness.lt2_power_delta > 0 ? "+" : "";
      parts.push(`${sign}${Math.round(staleness.lt2_power_delta)}W en potencia`);
    }
    return parts.length > 0 ? parts.join(", ") : null;
  }, [staleness]);

  return (
    <div className="ath-page ath-zones">
      {/* Discipline selector */}
      <div className="ath-discipline-pills">
        {snapshots.map((snap) => (
          <button
            key={snap.discipline}
            type="button"
            className={`ath-pill ${data.selectedDiscipline === snap.discipline ? "active" : ""}`}
            onClick={() => data.setSelectedDiscipline(snap.discipline)}
          >
            {disciplineLabel(snap.discipline)}
          </button>
        ))}
      </div>

      <ThresholdAnchorBanner anchorStatus={anchorStatus} />

      {/* Staleness banner — zones pending validation */}
      {staleness?.is_stale && zones.length > 0 && (
        <div className="ath-zones-stale-banner">
          <div className="ath-zones-stale-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="ath-zones-stale-text">
            <strong>Zonas pendientes de validación debido a mejora</strong>
            <p>
              Tus umbrales han cambiado desde que se configuraron estas zonas.
              {stalenessDetail && <> Cambio detectado: {stalenessDetail}.</>}
              {" "}Tu entrenador las actualizará pronto.
            </p>
          </div>
        </div>
      )}

      {loading && <p className="ath-zones-status">Cargando zonas...</p>}

      {/* Empty state — no coach zones */}
      {!loading && error && (
        <div className="ath-zones-empty">
          <div className="ath-zones-empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <p className="ath-zones-empty-title">Sin zonas configuradas</p>
          <p className="ath-zones-empty-sub">
            Tu entrenador aún no ha configurado zonas de entrenamiento para {disciplineLabel(data.selectedDiscipline).toLowerCase()}.
            Una vez las defina, aparecerán aquí con los rangos de ritmo, frecuencia cardíaca y potencia.
          </p>
        </div>
      )}

      {!loading && zones.length > 0 && (
        <>
          {/* Header */}
          <div className="ath-zones-header">
            <h2 className="ath-section-title" style={{ margin: 0 }}>
              {zoneSet?.name || "Mis zonas de entrenamiento"}
            </h2>
            {updatedLabel && <span className="ath-zones-updated">Actualizado {updatedLabel}</span>}
          </div>

          {/* Visual zone bars */}
          <div className="ath-zones-bars">
            {zones.map((z, i) => {
              const color = z.zone_color || ZONE_COLORS_FALLBACK[i] || "#6B7280";
              const widthPct = 40 + (i / Math.max(zones.length - 1, 1)) * 60;
              return (
                <div key={z.id} className="ath-zone-bar-row">
                  <div className="ath-zone-bar-label">
                    <span className="ath-zone-bar-dot" style={{ background: color }} />
                    <span className="ath-zone-bar-name">{z.zone_label}</span>
                  </div>
                  <div className="ath-zone-bar-track">
                    <div className="ath-zone-bar-fill" style={{ width: `${widthPct}%`, background: color, opacity: 0.2 + (i / zones.length) * 0.6 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Data table */}
          <div className="ath-zones-table-wrap">
            <table className="ath-zones-table">
              <thead>
                <tr>
                  <th>Zona</th>
                  {hasHr && <th>FC (bpm)</th>}
                  {hasPace && <th>Ritmo (/km)</th>}
                  {hasPower && <th>Potencia (W)</th>}
                </tr>
              </thead>
              <tbody>
                {zones.map((z, i) => {
                  const color = z.zone_color || ZONE_COLORS_FALLBACK[i] || "#6B7280";
                  return (
                    <tr key={z.id}>
                      <td>
                        <span className="ath-zone-table-dot" style={{ background: color }} />
                        <strong>{z.zone_label}</strong>
                        {z.description && <span className="ath-zone-desc">{z.description}</span>}
                      </td>
                      {hasHr && (
                        <td className="mono">
                          {z.hr_lower || z.hr_upper
                            ? `${z.hr_lower ?? "–"} – ${z.hr_upper ?? "–"}`
                            : "–"}
                        </td>
                      )}
                      {hasPace && (
                        <td className="mono">
                          {z.pace_lower_seconds || z.pace_upper_seconds
                            ? `${formatPaceValue(z.pace_upper_seconds)} – ${formatPaceValue(z.pace_lower_seconds)}`
                            : "–"}
                        </td>
                      )}
                      {hasPower && (
                        <td className="mono">
                          {z.power_lower || z.power_upper
                            ? `${z.power_lower ?? "–"} – ${z.power_upper ?? "–"}`
                            : "–"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Zone notes from coach */}
          {zoneSet?.notes && (
            <div className="ath-zones-coach-notes">
              <strong>Nota del entrenador</strong>
              <p>{zoneSet.notes}</p>
            </div>
          )}

          {/* Zone descriptions */}
          {zones.some((z) => z.description) && (
            <div className="ath-zones-descriptions">
              {zones.map((z, i) => {
                if (!z.description) return null;
                const color = z.zone_color || ZONE_COLORS_FALLBACK[i] || "#6B7280";
                return (
                  <div key={z.id} className="ath-zone-desc-card">
                    <span className="ath-zone-desc-dot" style={{ background: color }} />
                    <div>
                      <strong>{z.zone_label}</strong>
                      <p>{z.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

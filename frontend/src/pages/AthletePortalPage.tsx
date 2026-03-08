import { useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { AthleteAnalysis, AuthUser, DisciplineView, Estimate, Threshold } from "../types";

type AthletePortalPageProps = {
  user: AuthUser | null;
  token: string;
};

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function formatSecondsToClock(totalSeconds?: number | null) {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return "n/d";
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/km`;
}

function formatSwimPace(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}/100m`;
}

function formatTarget(estimate: Estimate) {
  if (estimate.estimate_type === "FTP") {
    return `${Math.round(estimate.value)} W`;
  }
  if (estimate.unit === "s/km") {
    return formatPace(estimate.value);
  }
  return `${estimate.value.toFixed(1)} ${estimate.unit}`;
}

function getPrimaryThreshold(view?: DisciplineView | null, name?: string) {
  return view?.thresholds?.find((threshold) => threshold.name === name);
}

function getPrimaryEstimate(view?: DisciplineView | null, type?: string) {
  return view?.estimates?.find((estimate) => estimate.estimate_type === type);
}

function disciplineLabel(discipline: string) {
  if (discipline === "running") return "Carrera a pie";
  if (discipline === "ciclismo") return "Ciclismo";
  if (discipline === "natación") return "Natación";
  if (discipline === "triatlón") return "Triatlón";
  return discipline;
}

function renderThresholdValue(threshold?: Threshold, discipline?: string) {
  if (!threshold) return "n/d";
  if (discipline === "ciclismo" && typeof threshold.power_watts === "number") {
    return `${Math.round(threshold.power_watts)} W`;
  }
  if (discipline === "natación" && typeof threshold.pace_seconds_per_km === "number") {
    return formatSwimPace(threshold.pace_seconds_per_km / 10);
  }
  if (typeof threshold.pace_seconds_per_km === "number") {
    return formatPace(threshold.pace_seconds_per_km);
  }
  if (typeof threshold.power_watts === "number") {
    return `${Math.round(threshold.power_watts)} W`;
  }
  return "n/d";
}

export function AthletePortalPage({ user, token }: AthletePortalPageProps) {
  const [analysis, setAnalysis] = useState<AthleteAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAthletePortal() {
      if (!user?.athlete_id) {
        setError("Tu acceso atleta todavía no está vinculado a un deportista.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = (await api.athleteAnalysis(token, user.athlete_id)) as AthleteAnalysis;
        if (!cancelled) {
          setAnalysis(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar tu portal de atleta.");
          setAnalysis(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAthletePortal();
    return () => {
      cancelled = true;
    };
  }, [token, user?.athlete_id]);

  const activeBlock = analysis?.active_focus_block;
  const upcomingTargets = useMemo(
    () =>
      [...(analysis?.athlete.targets ?? [])]
        .filter((target) => new Date(target.target_date).getTime() >= Date.now() - 86400000)
        .sort((left, right) => new Date(left.target_date).getTime() - new Date(right.target_date).getTime())
        .slice(0, 3),
    [analysis],
  );

  const focusDiscipline = activeBlock?.priority_discipline || analysis?.athlete.primary_discipline || "running";
  const focusView = analysis?.discipline_views?.[focusDiscipline];
  const lt1 = getPrimaryThreshold(focusView, "LT1");
  const lt2 = getPrimaryThreshold(focusView, "LT2");
  const focusEstimate =
    getPrimaryEstimate(focusView, focusDiscipline === "ciclismo" ? "FTP" : focusDiscipline === "running" ? "HM" : "VO2max") ??
    focusView?.estimates?.[0];

  if (loading) {
    return <div className="loading">Preparando tu panel...</div>;
  }

  if (error || !analysis) {
    return (
      <div className="page-grid">
        <section className="card athlete-portal-note">
          <span className="eyebrow">Portal atleta</span>
          <h1>No hemos podido cargar tu panel</h1>
          <p>{error ?? "Falta vincular este acceso a un atleta real."}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-grid athlete-portal-grid">
      <section className="card athlete-portal-hero athlete-portal-main">
        <div>
          <span className="eyebrow">Tu espacio</span>
          <h1>{analysis.athlete.name}</h1>
          <p>
            Aquí verás solo lo importante para ti: hacia dónde vas, qué objetivo estás preparando y qué referencias conviene tener
            presentes en tu día a día.
          </p>
          <div className="athlete-portal-tags">
            <span className="athlete-goal-chip">{disciplineLabel(analysis.athlete.primary_discipline)}</span>
            {analysis.athlete.goal_category ? <span className="athlete-goal-chip subtle">{analysis.athlete.goal_category}</span> : null}
            {activeBlock ? <span className="athlete-goal-chip subtle">{activeBlock.block_objective}</span> : null}
          </div>
        </div>
      </section>

      <section className="metrics-grid athlete-portal-metrics">
        <article className="card metric-card">
          <span>Foco actual</span>
          <strong>{activeBlock ? `${activeBlock.energy_system_focus} · ${activeBlock.block_objective}` : "Sin bloque activo"}</strong>
          <p>{activeBlock?.block_intent || "Tu entrenador aún no ha definido un bloque activo visible para ti."}</p>
        </article>
        <article className="card metric-card">
          <span>LT1</span>
          <strong>{renderThresholdValue(lt1, focusDiscipline)}</strong>
          <p>{lt1?.heart_rate ? `${lt1.heart_rate} bpm · ${lt1.lactate?.toFixed(1) ?? "n/d"} mmol/L` : "Referencia aeróbica actual"}</p>
        </article>
        <article className="card metric-card">
          <span>LT2</span>
          <strong>{renderThresholdValue(lt2, focusDiscipline)}</strong>
          <p>{lt2?.heart_rate ? `${lt2.heart_rate} bpm · ${lt2.lactate?.toFixed(1) ?? "n/d"} mmol/L` : "Referencia alta actual"}</p>
        </article>
        <article className="card metric-card">
          <span>Referencia clave</span>
          <strong>{focusEstimate ? formatTarget(focusEstimate) : "n/d"}</strong>
          <p>{focusEstimate ? `${focusEstimate.estimate_type} · ${disciplineLabel(focusEstimate.discipline)}` : "Sin estimaciones visibles aún"}</p>
        </article>
      </section>

      <section className="card athlete-portal-section">
        <div className="athlete-portal-section-header">
          <div>
            <span className="eyebrow">Próximos retos</span>
            <h2>Objetivos y competiciones</h2>
          </div>
        </div>
        <div className="athlete-target-grid">
          {upcomingTargets.length ? (
            upcomingTargets.map((target) => (
              <article key={target.id} className="athlete-target-card">
                <span className="athlete-target-date">{formatDate(target.target_date)}</span>
                <strong>{target.objective}</strong>
                <p>{disciplineLabel(target.discipline)}</p>
                {target.distance_label ? <p>{target.distance_label}</p> : null}
                {target.target_pace_label ? <p>Ritmo objetivo: {target.target_pace_label}</p> : null}
                {target.target_running_pace_label ? <p>Carrera: {target.target_running_pace_label}</p> : null}
                {target.target_swim_pace_label ? <p>Natación: {target.target_swim_pace_label}</p> : null}
                {typeof target.target_cycling_power_watts === "number" ? <p>Ciclismo: {Math.round(target.target_cycling_power_watts)} W</p> : null}
              </article>
            ))
          ) : (
            <p className="muted">Todavía no hay objetivos visibles para ti.</p>
          )}
        </div>
      </section>

      <section className="card athlete-portal-section">
        <div className="athlete-portal-section-header">
          <div>
            <span className="eyebrow">Tu hoja de ruta</span>
            <h2>Qué toca ahora</h2>
          </div>
        </div>
        <div className="athlete-portal-focus-grid">
          <article className="athlete-portal-focus-card">
            <span>Disciplina prioritaria</span>
            <strong>{disciplineLabel(focusDiscipline)}</strong>
            <p>{activeBlock?.phase ? `Fase: ${activeBlock.phase}` : "Sin fase visible"}</p>
          </article>
          <article className="athlete-portal-focus-card">
            <span>Ventana del bloque</span>
            <strong>
              {activeBlock ? `${formatDate(activeBlock.start_date)} → ${formatDate(activeBlock.end_date ?? null)}` : "Sin fechas"}
            </strong>
            <p>{activeBlock?.status === "active" ? "Bloque activo" : "Planificación en espera"}</p>
          </article>
          <article className="athlete-portal-focus-card">
            <span>Mensaje del bloque</span>
            <strong>{activeBlock?.evaluation?.summary ?? "Todavía no hay evaluación visible"}</strong>
            <p>{activeBlock?.evaluation?.recommendation ?? "Tu entrenador podrá usar este espacio para orientarte sin enseñarte toda la parte técnica."}</p>
          </article>
        </div>
      </section>

      <section className="card athlete-portal-section">
        <div className="athlete-portal-section-header">
          <div>
            <span className="eyebrow">Tus referencias</span>
            <h2>Resumen por disciplina</h2>
          </div>
        </div>
        <div className="athlete-discipline-grid">
          {Object.entries(analysis.discipline_views).map(([discipline, view]) => {
            const disciplineLt1 = getPrimaryThreshold(view, "LT1");
            const disciplineLt2 = getPrimaryThreshold(view, "LT2");
            const disciplineEstimate = getPrimaryEstimate(view, discipline === "ciclismo" ? "FTP" : discipline === "running" ? "10K" : "VO2max") ?? view.estimates[0];
            return (
              <article key={discipline} className="athlete-discipline-card">
                <div className="athlete-discipline-head">
                  <strong>{disciplineLabel(discipline)}</strong>
                  <span>{formatDate(view.latest_snapshot_date)}</span>
                </div>
                <p>LT1: {renderThresholdValue(disciplineLt1, discipline)}</p>
                <p>LT2: {renderThresholdValue(disciplineLt2, discipline)}</p>
                <p>Referencia: {disciplineEstimate ? formatTarget(disciplineEstimate) : "n/d"}</p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

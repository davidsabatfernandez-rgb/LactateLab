import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

import type { AthleteAnalysis, DailyTrainingLoad } from "../../types";
import type { CalendarEntry, CalendarMonthSection } from "../types";
import {
  addDays,
  buildCalendarWeekSnapshot,
  compactPlanningSourceTitle,
  dateValue,
  dayNameShort,
  disciplineLabel,
  firstName,
  formatDistanceCompact,
  formatMinutesCompact,
  isoDateFromToday,
  monthDayLabel,
  monthHeading,
  planningDisciplineAccent,
  startOfWeek,
  weekHeading,
} from "../utils";
import { api } from "../../lib/api";
import type { PlanningWorkoutTemplate } from "../../types";
import {
  compactSessionInfo,
  computeCalendarViolations,
  dayHasFreshnessConflict,
  formatDistanceKm,
  formatDurationHMS,
  garminStatusBadge,
  garminStatusInfo,
  sessionHasSpacingViolation,
  sessionToneBorderColor,
  sessionToneBackgroundTint,
  sessionToneFromEntry,
  type CalendarViolation,
} from "../utils-workout";
import type { PlanningCalendarSource } from "../types";
import type { CalendarNavigationRefs } from "../context/useCalendarNavigation";
import { DayDetailPanel } from "./DayDetailPanel";

// ── Sport Icon (inline SVG, reuses QuickAddIcon paths) ──

function isStrengthSession(session: { title: string; objective: string; dose: string }) {
  const combined = `${session.title} ${session.objective} ${session.dose}`.toLowerCase();
  return combined.includes("fuerza") || combined.includes("strength") || combined.includes("torque")
    || combined.includes("sentadilla") || combined.includes("circuito") || combined.includes("hip thrust")
    || combined.includes("adaptación anatómica");
}

function SportIcon({ discipline, session, size = 20 }: { discipline: string; session?: { title: string; objective: string; dose: string }; size?: number }) {
  const strength = session && isStrengthSession(session);
  return (
    <svg className="session-card-sport-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {strength ? (
        <>
          <path d="M6.5 6.5v11" strokeWidth="2.5" />
          <path d="M17.5 6.5v11" strokeWidth="2.5" />
          <path d="M6.5 12h11" strokeWidth="2" />
          <path d="M4 8v8" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M20 8v8" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : discipline === "running" ? (
        <>
          <circle cx="16.5" cy="5" r="2.2" />
          <path d="M10.5 21l2.2-5.6 2.7-2.6 1.8 2.2 3.3.4" />
          <path d="M8.4 13.4l4-3.5 1.9-3.2 3.5 1" />
          <path d="M7 10.8l2.5 1.1" />
        </>
      ) : discipline === "ciclismo" ? (
        <>
          <circle cx="6.5" cy="17" r="3.5" />
          <circle cx="17.5" cy="17" r="3.5" />
          <path d="M9 17l3.1-6h3.2" />
          <path d="M11.2 11l3.3 6h3" />
          <path d="M9.8 11H7.5" />
          <path d="M14.5 7.5h1.8" />
        </>
      ) : discipline === "natación" ? (
        <>
          <path d="M3 16c1.6 0 1.6-1 3.2-1s1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1 1.6-1 3.2-1 1.6 1 3.2 1" />
          <path d="M4 11.6c1.2-.6 2.8-1.1 4.3-.6 1 .3 1.7 1 2.7 1.2 1.8.4 3.1-.8 4.5-1.7" />
          <path d="M15.6 7.3l1.9 1.1" />
          <path d="M14.5 9.1c.8-.6 1.9-.8 2.8-.5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

// ── Compliance icon (meaningful SVG per status) ──

const COMPLIANCE_META: Record<string, { color: string; label: string }> = {
  completed: { color: "#3a9a5b", label: "Completada" },
  partial: { color: "#c27a2e", label: "Parcial — revisa warnings" },
  missed: { color: "#c44040", label: "No realizada" },
  unplanned: { color: "#3a7dc4", label: "Actividad extra" },
};

function ComplianceIcon({ status }: { status: string }) {
  const meta = COMPLIANCE_META[status];
  if (!meta) return null;
  const s = 14;
  return (
    <svg
      className={`session-card-compliance-icon ${status}`}
      width={s}
      height={s}
      viewBox="0 0 20 20"
      fill="none"
    >
      <title>{meta.label}</title>
      {status === "completed" ? (
        // Checkmark in circle
        <>
          <circle cx="10" cy="10" r="9" fill={meta.color} opacity="0.15" />
          <path d="M6 10.5l2.8 2.8L14 7" stroke={meta.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : status === "partial" ? (
        // Exclamation triangle
        <>
          <path d="M10 2L1 18h18L10 2z" fill={meta.color} opacity="0.14" />
          <path d="M10 2L1 18h18L10 2z" stroke={meta.color} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
          <line x1="10" y1="8" x2="10" y2="12.5" stroke={meta.color} strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="15" r="1.1" fill={meta.color} />
        </>
      ) : status === "missed" ? (
        // X mark in circle
        <>
          <circle cx="10" cy="10" r="9" fill={meta.color} opacity="0.15" />
          <path d="M7 7l6 6M13 7l-6 6" stroke={meta.color} strokeWidth="2.2" strokeLinecap="round" />
        </>
      ) : (
        // Plus in circle (unplanned)
        <>
          <circle cx="10" cy="10" r="9" fill={meta.color} opacity="0.15" stroke={meta.color} strokeWidth="1.4" />
          <path d="M10 6v8M6 10h8" stroke={meta.color} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

// ── Shared session card renderer (TrainingPeaks-inspired) ──

function SessionCardContent({
  session,
  compact = false,
  violations,
}: {
  session: CalendarEntry;
  compact?: boolean;
  violations?: CalendarViolation[];
}) {
  const gInfo = garminStatusInfo(session.publishStatus);
  const garmin = garminStatusBadge(session);
  const hasSpacing = violations ? sessionHasSpacingViolation(session.id, violations) : false;
  const isUnplanned = session.sessionType === "extra";
  const ga = session.garminActivity;

  const roleBadge = isUnplanned
    ? { label: "EXTRA", className: "role-extra" }
    : session.sessionType === "clave"
      ? { label: "CLAVE", className: "role-key" }
      : session.sessionType === "fondo"
        ? { label: "FONDO", className: "role-endurance" }
        : session.sessionType === "soporte"
          ? { label: "SOPORTE", className: "role-support" }
          : session.sessionType === "test"
            ? { label: "TEST", className: "role-test" }
            : { label: (session.sessionType ?? "").toUpperCase(), className: "role-default" };

  // Estimated TSS for planned session
  const estTSS = session.estimatedMinutes
    ? Math.round(estimateSessionTSS(session))
    : null;

  return (
    <div className={`session-card-inner ${isUnplanned ? "unplanned" : ""}`}>
      <div className="session-card-body">
        {/* Header: sport icon + role badge + status badges */}
        <div className="session-card-header">
          <SportIcon discipline={session.layerDiscipline || session.discipline} session={session} size={compact ? 16 : 20} />
          <span className={`session-card-role-badge ${roleBadge.className}`}>{roleBadge.label}</span>
          <span className="session-card-header-badges">
            {session.compliance ? <ComplianceIcon status={session.compliance.status} /> : null}
            {hasSpacing ? <span className="calendar-violation-badge spacing" title="Spacing demasiado corto">{"\u26A0"}</span> : null}
            {gInfo ? (
              <span className={`planning-session-garmin-badge garmin-${gInfo.tone}`} title={gInfo.description}>
                {gInfo.label}
              </span>
            ) : garmin ? (
              <span className={`planning-session-publish-badge ${garmin.tone}`}>{garmin.label}</span>
            ) : null}
            {session.targetsStale ? (
              <span className="planning-session-stale-badge" title="Los umbrales han cambiado. Targets desactualizados.">STALE</span>
            ) : null}
            {/* Coach review indicator */}
            {session.compliance?.status === "completed" && session.executionRating ? (
              <span
                className={`session-card-review-dot rated-${session.executionRating}`}
                title={`Valoracion: ${session.executionRating}`}
              />
            ) : session.compliance?.status === "completed" && !session.executionRating ? (
              <span
                className="session-card-review-dot needs-review"
                title="Pendiente de revision"
              />
            ) : null}
          </span>
        </div>

        {/* Title */}
        <strong className="session-card-title">{session.title}</strong>

        {/* Metrics row: actual (Garmin) or planned */}
        {!compact && ga ? (
          <div className="session-card-metrics">
            <div className="session-card-metric">
              <strong>{formatDurationHMS(ga.moving_time_seconds)}</strong>
              {session.compliance?.status === "completed" ? <ComplianceIcon status="completed" /> : null}
            </div>
            {ga.distance_m > 0 ? (
              <div className="session-card-metric">
                <strong>{formatDistanceKm(ga.distance_m)}</strong>
              </div>
            ) : null}
            {ga.average_heartrate ? (
              <div className="session-card-metric muted">
                <span>FC {ga.average_heartrate}</span>
                {ga.max_heartrate ? <span className="session-card-metric-sub">max {ga.max_heartrate}</span> : null}
              </div>
            ) : null}
            {ga.average_watts ? (
              <div className="session-card-metric">
                <strong>{ga.average_watts}W</strong>
              </div>
            ) : null}
          </div>
        ) : !compact && session.estimatedMinutes ? (
          <div className="session-card-metrics planned">
            <div className="session-card-metric">
              <span>P: {session.estimatedMinutes} min</span>
            </div>
            {estTSS ? (
              <div className="session-card-metric">
                <span>~{estTSS} TSS</span>
              </div>
            ) : null}
          </div>
        ) : compact ? (
          <span className="session-card-compact-info">{compactSessionInfo(session)}</span>
        ) : null}

        {/* Dose */}
        {!compact && session.dose ? (
          <p className="session-card-dose">{session.dose}</p>
        ) : null}

        {/* Objective */}
        {!compact && session.objective ? (
          <p className="session-card-objective">{session.objective}</p>
        ) : null}

        {/* Planned vs Actual comparison (when we have both) */}
        {!compact && ga && session.estimatedMinutes ? (
          <div className="session-card-planned-vs-actual">
            <span>P: {session.estimatedMinutes} min</span>
            {estTSS ? <span>P: ~{estTSS} TSS</span> : null}
          </div>
        ) : null}

        {/* Compliance warning */}
        {!compact && session.compliance?.status === "partial" && session.compliance.reasons.length > 0 ? (
          <p className="session-card-warning">
            {"\u26A0"} {session.compliance.reasons[0]}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Week load summary ──
// Computed from BOTH training load API data AND calendar sessions (planned).
// Calendar sessions provide TSS estimates even without Garmin.

type WeekLoadValues = {
  atl: number;
  ctl: number;
  tsb: number;
  acwr: number | null;
  atlByDisc: Record<string, number>;
  ctlByDisc: Record<string, number>;
  tsbByDisc: Record<string, number>;
  source: "api" | "estimated";
};

/**
 * IF (Intensity Factor) by intensity zone — mirrors backend _IF_BY_ZONE
 * (triathlon_motor.py). Source: Coggan 2012, Allen & Coggan 2019.
 */
const IF_BY_ZONE: Record<string, number> = {
  "sub-lt1": 0.65, "recovery": 0.65, "e1": 0.65, "regenerativo": 0.65,
  "lt1": 0.78, "e2": 0.78, "aerobic": 0.78, "z2": 0.78,
  "sub-lt2": 0.88, "subthreshold": 0.88, "d2": 0.88, "tempo": 0.88, "z3": 0.88,
  "lt2": 0.95, "threshold": 0.95, "ftp": 0.95, "z4": 0.95,
  "vo2": 1.05, "vo2max": 1.05, "z5": 1.05,
  "sprint": 1.15, "anc": 1.15, "anaerobic": 1.15, "z6": 1.15,
};

/** Extract the dominant intensity zone from session text fields */
function extractIntensityZone(session: CalendarEntry): string {
  // Combine searchable text: objective > dose > title (priority order)
  const text = `${session.objective} ${session.dose} ${session.title}`.toLowerCase();

  // Check from highest to lowest specificity
  if (/\bvo2\b|vo2max|micro[- ]?interval/i.test(text)) return "vo2";
  if (/\banc\b|\bsprint\b|\bfuerza\b|\bmax\b.*rep/i.test(text)) return "sprint";
  if (/\blt2\b|\bthreshold\b|\bumbral\b|\bftp\b|\bcruise\b|\bcss\b|\bhalf[- ]?pace/i.test(text)) return "lt2";
  if (/\bsub[- ]?lt2\b|\bsub[- ]?threshold\b|\bsub[- ]?t\b|\btempo\b|\bd2\b/i.test(text)) return "sub-lt2";
  if (/\blt1\b|\baerob\b|\be2\b|\bbase\b|\bextensiv/i.test(text)) return "lt1";
  if (/\brecov\b|\bregener\b|\be1\b|\bdescanso/i.test(text)) return "recovery";

  // Fallback: use sessionType as before (but with better IF values)
  if (session.sessionType === "clave") return "sub-lt2";  // conservative default for KEY
  if (session.sessionType === "soporte" || session.sessionType === "support") return "lt1";
  return "recovery";
}

/** Estimate TSS from a calendar session using zone-based IF (Coggan 2012) */
function estimateSessionTSS(session: CalendarEntry): number {
  const minutes = session.estimatedMinutes ?? estimateMinutesFromDose(session.dose);
  if (minutes <= 0) return 0;
  const hours = minutes / 60;
  const zone = extractIntensityZone(session);
  const ifFactor = IF_BY_ZONE[zone] ?? 0.75;
  // Swimming uses IF³ (water resistance), others IF² (Coggan)
  const isSw = session.discipline?.toLowerCase().includes("natación") || session.discipline?.toLowerCase().includes("swim");
  return isSw
    ? ifFactor * ifFactor * ifFactor * hours * 100
    : ifFactor * ifFactor * hours * 100;
}

/** Estimate minutes from dose string (fallback) */
function estimateMinutesFromDose(dose: string): number {
  if (!dose) return 0;
  // Try to extract minutes from patterns like "90 min", "1h30", "8 min · LT1"
  const minMatch = dose.match(/(\d+)\s*min/i);
  if (minMatch) return Number(minMatch[1]);
  const hourMatch = dose.match(/(\d+)\s*h\s*(\d+)?/i);
  if (hourMatch) return Number(hourMatch[1]) * 60 + Number(hourMatch[2] || 0);
  return 40; // sensible default for a session
}

/**
 * Build EWMA-based ATL/CTL/TSB from calendar sessions.
 * Returns a map of weekEnd → WeekLoadValues.
 * Uses 7-day ATL and 42-day CTL exponential decay.
 */
function buildCalendarLoadMap(
  sessionsByDate: Map<string, CalendarEntry[]>,
  trainingLoadDays: DailyTrainingLoad[] | undefined,
): Map<string, WeekLoadValues> {
  const result = new Map<string, WeekLoadValues>();

  // If we have API training load data, build from that (more accurate)
  if (trainingLoadDays?.length) {
    for (const day of trainingLoadDays) {
      result.set(day.date, {
        atl: day.atl,
        ctl: day.ctl,
        tsb: day.tsb,
        acwr: day.acwr ?? null,
        atlByDisc: day.atl_by_discipline ?? {},
        ctlByDisc: day.ctl_by_discipline ?? {},
        tsbByDisc: day.tsb_by_discipline ?? {},
        source: "api",
      });
    }
    return result;
  }

  // Fallback: estimate from calendar sessions
  // Collect all dates with sessions, sorted
  const allDates = new Set<string>();
  sessionsByDate.forEach((_, date) => allDates.add(date));
  const sortedDates = Array.from(allDates).sort();
  if (sortedDates.length === 0) return result;

  // Build a date range from 42 days before first session to last session
  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];

  const DISCIPLINES = ["running", "ciclismo", "natación"];
  const atlDecay = 2 / (7 + 1);   // 0.25 — TrainingPeaks/Coggan convention, matches backend
  const ctlDecay = 2 / (42 + 1);  // 0.0465 — same as backend training_load_calculator.py

  let atl = 0;
  let ctl = 0;
  const atlDisc: Record<string, number> = {};
  const ctlDisc: Record<string, number> = {};
  for (const d of DISCIPLINES) { atlDisc[d] = 0; ctlDisc[d] = 0; }

  // Iterate day by day from 42 days before first to last
  const start = new Date(firstDate);
  start.setDate(start.getDate() - 42);
  const end = new Date(lastDate);
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    const sessions = sessionsByDate.get(dateStr) ?? [];

    // Compute daily TSS
    let dailyTSS = 0;
    const discTSS: Record<string, number> = {};
    for (const s of sessions) {
      const tss = estimateSessionTSS(s);
      dailyTSS += tss;
      const disc = s.layerDiscipline || s.discipline;
      const normDisc = disc === "cycling" ? "ciclismo" : disc === "swimming" ? "natación" : disc;
      discTSS[normDisc] = (discTSS[normDisc] ?? 0) + tss;
    }

    atl = atl + (dailyTSS - atl) * atlDecay;
    ctl = ctl + (dailyTSS - ctl) * ctlDecay;

    for (const d of DISCIPLINES) {
      const dt = discTSS[d] ?? 0;
      atlDisc[d] = atlDisc[d] + (dt - atlDisc[d]) * atlDecay;
      ctlDisc[d] = ctlDisc[d] + (dt - ctlDisc[d]) * ctlDecay;
    }

    const tsb = ctl - atl;
    result.set(dateStr, {
      atl: Math.round(atl * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      acwr: ctl >= 10 ? Math.round((atl / ctl) * 100) / 100 : null,
      atlByDisc: { ...atlDisc },
      ctlByDisc: { ...ctlDisc },
      tsbByDisc: Object.fromEntries(DISCIPLINES.map(d => [d, Math.round((ctlDisc[d] - atlDisc[d]) * 10) / 10])),
      source: "estimated",
    });

    current.setDate(current.getDate() + 1);
  }

  return result;
}

function getWeekEndLoad(
  loadMap: Map<string, WeekLoadValues>,
  weekEnd: string,
): WeekLoadValues | null {
  // Find the last day in the load map that is <= weekEnd
  let best: WeekLoadValues | null = null;
  for (const [date, val] of loadMap) {
    if (date <= weekEnd) best = val;
  }
  return best;
}

function tsbColor(tsb: number): string {
  if (tsb > 15) return "#1b8a3a";
  if (tsb > 0) return "#3d7c4a";
  if (tsb > -15) return "#c97a2e";
  return "#c43d3d";
}

function tsbZoneLabel(tsb: number): string {
  if (tsb > 25) return "Transición / Desentrenamiento";
  if (tsb > 15) return "Fresco";
  if (tsb > 5) return "Forma gris — listo para competir";
  if (tsb > -10) return "Óptimo — carga productiva";
  if (tsb > -20) return "Acumulando fatiga";
  if (tsb > -30) return "Sobrecarga funcional";
  return "Riesgo de sobreentrenamiento";
}

function acwrZoneLabel(acwr: number): string {
  if (acwr < 0.8) return "Infra-carga — riesgo de desentrenamiento";
  if (acwr <= 1.3) return "Zona segura (sweet spot)";
  if (acwr <= 1.5) return "Zona de peligro — riesgo de lesión elevado";
  return "Zona roja — riesgo muy alto";
}

const LOAD_TOOLTIPS = {
  ctl: {
    title: "Estado Físico (CTL)",
    subtitle: "Chronic Training Load",
    description: "Media exponencial ponderada (EWMA) de tu TSS diario en los últimos 42 días. Representa tu nivel de fitness acumulado — cuánta carga tu cuerpo está adaptado a tolerar.",
    calculation: "CTL = CTL_ayer + (TSS_hoy − CTL_ayer) × (1 − e^(−1/42))",
    ranges: [
      { range: "0–35", label: "Principiante / Desentrenado" },
      { range: "35–55", label: "Recreativo" },
      { range: "55–80", label: "Amateur competitivo" },
      { range: "80–110", label: "Avanzado / Sub-élite" },
      { range: "110–150+", label: "Élite" },
    ],
    warning: "Un CTL alto no garantiza rendimiento — solo indica que el cuerpo tolera carga. La calidad del entrenamiento importa más que el volumen.",
  },
  atl: {
    title: "Fatiga (ATL)",
    subtitle: "Acute Training Load",
    description: "Media exponencial ponderada de tu TSS en los últimos 7 días. Mide la fatiga aguda acumulada reciente — cuánto estrés has aplicado esta semana.",
    calculation: "ATL = ATL_ayer + (TSS_hoy − ATL_ayer) × (1 − e^(−1/7))",
    ranges: [
      { range: "< CTL", label: "Descargando — ATL cayendo" },
      { range: "≈ CTL", label: "Mantenimiento" },
      { range: "> CTL", label: "Sobrecarga — construyendo fitness" },
    ],
    warning: "ATL sube y baja rápido. Un ATL momentáneamente alto no es peligroso, pero mantenerlo alto semanas seguidas sin descanso sí lo es.",
  },
  tsb: {
    title: "Forma (TSB)",
    subtitle: "Training Stress Balance",
    description: "Diferencia entre tu fitness y tu fatiga (CTL − ATL). Indica tu estado de preparación actual: positivo = descansado, negativo = fatigado.",
    calculation: "TSB = CTL − ATL",
    ranges: [
      { range: "+25 o más", label: "Desentrenamiento" },
      { range: "+5 a +25", label: "Fresco — listo para competir" },
      { range: "−10 a +5", label: "Óptimo — carga productiva" },
      { range: "−10 a −30", label: "Acumulando fatiga" },
      { range: "−30 o menos", label: "Riesgo sobreentrenamiento" },
    ],
    warning: "Para competir, busca TSB entre +5 y +20. Para entrenar, TSB negativo (−5 a −20) es normal y necesario.",
  },
  acwr: {
    title: "Ratio Agudo:Crónico (ACWR)",
    subtitle: "Acute:Chronic Workload Ratio",
    description: "Relación entre la carga aguda (ATL) y la carga crónica (CTL). Mide si la carga reciente es proporcionada al fitness del atleta.",
    calculation: "ACWR = ATL / CTL",
    ranges: [
      { range: "< 0.80", label: "Infra-carga — posible desentrenamiento" },
      { range: "0.80–1.30", label: "Zona segura (sweet spot)" },
      { range: "1.30–1.50", label: "Zona de peligro — riesgo lesión" },
      { range: "> 1.50", label: "Zona roja — riesgo muy alto" },
    ],
    warning: "El modelo ACWR tiene limitaciones: no distingue tipo de carga, no personaliza por atleta, y puede dar falsos positivos con CTL muy bajo.",
  },
};

function LoadTooltip({ metric, value, tsb, acwr }: {
  metric: "ctl" | "atl" | "tsb" | "acwr";
  value: number;
  tsb?: number;
  acwr?: number | null;
}) {
  const info = LOAD_TOOLTIPS[metric];
  return (
    <div className="load-tooltip-content">
      <div className="load-tooltip-header">
        <strong>{info.title}</strong>
        <span>{info.subtitle}</span>
      </div>
      <p className="load-tooltip-desc">{info.description}</p>
      <div className="load-tooltip-calc">
        <span>Cálculo</span>
        <code>{info.calculation}</code>
      </div>
      <div className="load-tooltip-ranges">
        <span>Rangos de referencia</span>
        <div className="load-tooltip-range-list">
          {info.ranges.map((r) => (
            <div key={r.range} className="load-tooltip-range-row">
              <code>{r.range}</code>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      </div>
      {metric === "tsb" && tsb != null && (
        <div className="load-tooltip-current-zone">
          <span>Estado actual:</span>
          <strong style={{ color: tsbColor(tsb) }}>{tsbZoneLabel(tsb)}</strong>
        </div>
      )}
      {metric === "acwr" && acwr != null && (
        <div className="load-tooltip-current-zone">
          <span>Estado actual:</span>
          <strong style={{ color: acwr > 1.3 ? "#c43d3d" : acwr < 0.8 ? "#c97a2e" : "#3d7c4a" }}>{acwrZoneLabel(acwr)}</strong>
        </div>
      )}
      <p className="load-tooltip-warning">{info.warning}</p>
    </div>
  );
}

function LoadKpiCard({ metric, label, value, color, wl, compact }: {
  metric: "ctl" | "atl" | "tsb" | "acwr";
  label: string;
  value: string;
  color: string;
  wl: WeekLoadValues;
  compact?: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div
      className={`load-kpi-card ${compact ? "compact" : ""}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="load-kpi-label">{label}</span>
      <div className="load-kpi-value-row">
        <strong className="load-kpi-value" style={{ color }}>{value}</strong>
        <span className="load-kpi-acronym">{metric.toUpperCase()}</span>
      </div>
      {showTooltip && (
        <div className="load-tooltip-wrapper">
          <LoadTooltip
            metric={metric}
            value={typeof wl[metric] === "number" ? wl[metric] as number : 0}
            tsb={wl.tsb}
            acwr={wl.acwr}
          />
        </div>
      )}
    </div>
  );
}

function WeekLoadDisplay({ wl, compact }: { wl: WeekLoadValues; compact?: boolean }) {
  return (
    <div className={`week-load-display ${compact ? "compact" : ""}`}>
      <div className="week-load-kpis">
        <LoadKpiCard
          metric="ctl"
          label="Estado Físico"
          value={String(Math.round(wl.ctl))}
          color="#4a7fc4"
          wl={wl}
          compact={compact}
        />
        <LoadKpiCard
          metric="atl"
          label="Fatiga"
          value={String(Math.round(wl.atl))}
          color="#d4792a"
          wl={wl}
          compact={compact}
        />
        <LoadKpiCard
          metric="tsb"
          label="Forma"
          value={`${wl.tsb > 0 ? "+" : ""}${Math.round(wl.tsb)}`}
          color={tsbColor(wl.tsb)}
          wl={wl}
          compact={compact}
        />
        {wl.acwr != null && (
          <LoadKpiCard
            metric="acwr"
            label="Ratio A:C"
            value={wl.acwr.toFixed(2)}
            color={wl.acwr > 1.3 ? "#c43d3d" : wl.acwr < 0.8 ? "#c97a2e" : "#3d7c4a"}
            wl={wl}
            compact={compact}
          />
        )}
      </div>
      {wl.source === "estimated" && (
        <span className="week-load-estimated-badge">Estimado desde sesiones planificadas</span>
      )}
      {Object.keys(wl.ctlByDisc).filter(d => wl.ctlByDisc[d] > 0.5).length > 1 && (
        <div className="week-load-disc-breakdown">
          {Object.entries(wl.ctlByDisc)
            .filter(([, v]) => v > 0.5)
            .map(([disc, ctlVal]) => (
              <div key={disc} className="week-load-disc-row">
                <span className="week-load-disc-dot" style={{ backgroundColor: planningDisciplineAccent(disc) }} />
                <span className="week-load-disc-name">{disciplineLabel(disc)}</span>
                <span className="week-load-disc-ctl">{Math.round(ctlVal)}</span>
                <span className="week-load-disc-tsb" style={{ color: tsbColor(wl.tsbByDisc[disc] ?? 0) }}>
                  {(wl.tsbByDisc[disc] ?? 0) > 0 ? "+" : ""}{Math.round(wl.tsbByDisc[disc] ?? 0)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

type CalendarViewProps = {
  calendarVisualMode: "month" | "week";
  calendarMonth: string;
  selectedCalendarDate: string | null;
  selectedCalendarSource: PlanningCalendarSource;
  selectedWeekStart: string;
  selectedWeekEnd: string;
  continuousMonthSections: CalendarMonthSection[];
  continuousWeekStarts: string[];
  sessionsByDate: Map<string, CalendarEntry[]>;
  athleteAnalysis: AthleteAnalysis | null;
  selectedDiscipline: string;
  overview: { athlete_name: string } | null;
  calendarToolbarHeading: string;
  calendarToolbarSubheading: string;
  showAllDisciplines?: boolean;
  onToggleAllDisciplines?: () => void;
  hasMultipleDisciplines?: boolean;
  dayPanelOpen: boolean;
  workoutLibrary?: PlanningWorkoutTemplate[];
  athleteId?: string | null;
  token?: string;
  onBatchGarminComplete?: () => void;
  trainingLoadDays?: DailyTrainingLoad[];
  // Navigation
  jumpCalendarToToday: () => void;
  shiftCalendarBackward: () => void;
  shiftCalendarForward: () => void;
  handleContinuousWeekScroll: () => void;
  handleContinuousMonthScroll: () => void;
  // Actions
  onSetCalendarVisualMode: (mode: "month" | "week") => void;
  onSetSelectedCalendarDate: (date: string | null) => void;
  onSetDayPanelOpen: (open: boolean) => void;
  openCalendarSessionDetail: (session: CalendarEntry) => void;
  openCalendarQuickAdd: (date: string) => void;
  onCopyWeek?: () => void;
  onMoveSession?: (session: CalendarEntry, newDate: string) => void;
  onDeleteSession?: (session: CalendarEntry) => void;
  onReviewSession?: (session: CalendarEntry) => void;
  // Refs
  calendarWeekScrollerRef: CalendarNavigationRefs["calendarWeekScrollerRef"];
  calendarWeekSectionRefs: CalendarNavigationRefs["calendarWeekSectionRefs"];
  calendarMonthScrollerRef: CalendarNavigationRefs["calendarMonthScrollerRef"];
  calendarMonthSectionRefs: CalendarNavigationRefs["calendarMonthSectionRefs"];
};

export function CalendarView({
  calendarVisualMode,
  calendarMonth,
  selectedCalendarDate,
  selectedCalendarSource,
  selectedWeekStart,
  selectedWeekEnd,
  continuousMonthSections,
  continuousWeekStarts,
  sessionsByDate,
  athleteAnalysis,
  selectedDiscipline,
  overview,
  calendarToolbarHeading,
  calendarToolbarSubheading,
  dayPanelOpen,
  workoutLibrary,
  athleteId,
  token,
  onBatchGarminComplete,
  trainingLoadDays,
  jumpCalendarToToday,
  shiftCalendarBackward,
  shiftCalendarForward,
  handleContinuousWeekScroll,
  handleContinuousMonthScroll,
  onSetCalendarVisualMode,
  onSetSelectedCalendarDate,
  onSetDayPanelOpen,
  openCalendarSessionDetail,
  openCalendarQuickAdd,
  onCopyWeek,
  onMoveSession,
  onDeleteSession,
  onReviewSession,
  calendarWeekScrollerRef,
  calendarWeekSectionRefs,
  calendarMonthScrollerRef,
  calendarMonthSectionRefs,
  showAllDisciplines,
  onToggleAllDisciplines,
  hasMultipleDisciplines,
}: CalendarViewProps) {
  const handleDayClick = (date: string | null) => {
    onSetSelectedCalendarDate(date);
    if (date) onSetDayPanelOpen(true);
  };

  const violations = useMemo(
    () => workoutLibrary ? computeCalendarViolations(sessionsByDate, workoutLibrary) : [],
    [sessionsByDate, workoutLibrary],
  );

  const calendarLoadMap = useMemo(
    () => {
      const m = buildCalendarLoadMap(sessionsByDate, trainingLoadDays);
      console.log("[CalendarLoad] map size:", m.size, "sessionsByDate size:", sessionsByDate.size, "trainingLoadDays:", trainingLoadDays?.length ?? 0);
      if (m.size > 0) {
        const last = Array.from(m.entries()).pop();
        if (last) console.log("[CalendarLoad] last entry:", last[0], last[1]);
      }
      return m;
    },
    [sessionsByDate, trainingLoadDays],
  );

  const daySessions = selectedCalendarDate ? sessionsByDate.get(selectedCalendarDate) ?? [] : [];

  return (
    <>
      <div className="planning-calendar-app-toolbar">
        <div className="planning-calendar-toolbar-left">
          <div className="planning-calendar-toolbar-heading">
            <strong>{calendarToolbarHeading}</strong>
            <p>{calendarToolbarSubheading}</p>
          </div>
          <div className="planning-calendar-toolbar-nav">
            <button type="button" className="planning-inline-action" onClick={jumpCalendarToToday}>
              Hoy
            </button>
            <button type="button" className="planning-inline-action" onClick={shiftCalendarBackward}>
              &lt;
            </button>
            <button type="button" className="planning-inline-action" onClick={shiftCalendarForward}>
              &gt;
            </button>
          </div>
        </div>

        <div className="planning-calendar-toolbar-center">
          <button type="button" className="planning-calendar-athlete-chip">
            {overview ? firstName(overview.athlete_name) : "Atleta"}
          </button>
        </div>

        <div className="planning-calendar-toolbar-right">
          {calendarVisualMode === "week" && athleteId && token ? (
            <GarminBatchPush
              sessionsByDate={sessionsByDate}
              selectedWeekStart={selectedWeekStart}
              selectedWeekEnd={selectedWeekEnd}
              athleteId={athleteId}
              token={token}
              onComplete={onBatchGarminComplete}
            />
          ) : null}
          {onCopyWeek && calendarVisualMode === "week" ? (
            <button
              type="button"
              className="planning-inline-action"
              onClick={onCopyWeek}
              title="Copiar todas las sesiones de esta semana a la siguiente"
            >
              Copiar semana
            </button>
          ) : null}
          {hasMultipleDisciplines && onToggleAllDisciplines ? (
            <button
              type="button"
              className={`planning-inline-action ${showAllDisciplines ? "active" : ""}`}
              onClick={onToggleAllDisciplines}
              title="Mostrar todas las disciplinas en el calendario"
            >
              Tri
            </button>
          ) : null}
          <div className="training-calendar-view-switch">
            <button
              type="button"
              className={`planning-inline-action ${calendarVisualMode === "month" ? "active" : ""}`}
              onClick={() => onSetCalendarVisualMode("month")}
            >
              Mes
            </button>
            <button
              type="button"
              className={`planning-inline-action ${calendarVisualMode === "week" ? "active" : ""}`}
              onClick={() => onSetCalendarVisualMode("week")}
            >
              Semana
            </button>
          </div>
        </div>
      </div>

      <div className={`planning-calendar-app-content calendar-full ${dayPanelOpen && selectedCalendarDate ? "with-day-panel" : ""}`}>
        <section className={`planning-calendar-app-main ${calendarVisualMode === "month" ? "month-mode" : ""}`}>
          {calendarVisualMode === "month" ? (
            <MonthGrid
              calendarMonth={calendarMonth}
              selectedCalendarDate={selectedCalendarDate}
              selectedCalendarSource={selectedCalendarSource}
              selectedWeekStart={selectedWeekStart}
              continuousMonthSections={continuousMonthSections}
              sessionsByDate={sessionsByDate}
              violations={violations}
              onSetSelectedCalendarDate={handleDayClick}
              openCalendarSessionDetail={openCalendarSessionDetail}
              openCalendarQuickAdd={openCalendarQuickAdd}
              onMoveSession={onMoveSession}
              onDeleteSession={onDeleteSession}
              calendarMonthSectionRefs={calendarMonthSectionRefs}
              calendarLoadMap={calendarLoadMap}
              showAllDisciplines={showAllDisciplines}
            />
          ) : (
            <WeekGrid
              selectedCalendarDate={selectedCalendarDate}
              selectedWeekStart={selectedWeekStart}
              selectedWeekEnd={selectedWeekEnd}
              continuousWeekStarts={continuousWeekStarts}
              sessionsByDate={sessionsByDate}
              athleteAnalysis={athleteAnalysis}
              selectedDiscipline={selectedDiscipline}
              violations={violations}
              onSetSelectedCalendarDate={handleDayClick}
              openCalendarSessionDetail={openCalendarSessionDetail}
              openCalendarQuickAdd={openCalendarQuickAdd}
              onMoveSession={onMoveSession}
              onDeleteSession={onDeleteSession}
              calendarWeekSectionRefs={calendarWeekSectionRefs}
              calendarLoadMap={calendarLoadMap}
              showAllDisciplines={showAllDisciplines}
            />
          )}
        </section>

        {dayPanelOpen && selectedCalendarDate ? (
          <DayDetailPanel
            date={selectedCalendarDate}
            sessions={daySessions}
            selectedCalendarSource={selectedCalendarSource}
            onClose={() => onSetDayPanelOpen(false)}
            onSessionClick={openCalendarSessionDetail}
            onQuickAdd={openCalendarQuickAdd}
            onReviewSession={onReviewSession}
          />
        ) : null}
      </div>
    </>
  );
}

// ── Month Grid Sub-component ──

function MonthGrid({
  calendarMonth,
  selectedCalendarDate,
  selectedCalendarSource,
  selectedWeekStart,
  continuousMonthSections,
  sessionsByDate,
  violations,
  onSetSelectedCalendarDate,
  openCalendarSessionDetail,
  openCalendarQuickAdd,
  onMoveSession,
  onDeleteSession,
  calendarMonthSectionRefs,
  calendarLoadMap,
  showAllDisciplines,
}: {
  calendarMonth: string;
  selectedCalendarDate: string | null;
  selectedCalendarSource: PlanningCalendarSource;
  selectedWeekStart: string;
  continuousMonthSections: CalendarMonthSection[];
  sessionsByDate: Map<string, CalendarEntry[]>;
  violations: CalendarViolation[];
  onSetSelectedCalendarDate: (date: string | null) => void;
  openCalendarSessionDetail: (session: CalendarEntry) => void;
  openCalendarQuickAdd: (date: string) => void;
  onMoveSession?: (session: CalendarEntry, newDate: string) => void;
  onDeleteSession?: (session: CalendarEntry) => void;
  calendarMonthSectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  calendarLoadMap: Map<string, WeekLoadValues>;
  showAllDisciplines?: boolean;
}) {
  const [activeDragSession, setActiveDragSession] = useState<CalendarEntry | null>(null);
  const [overDayId, setOverDayId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const session = event.active.data.current?.session as CalendarEntry | undefined;
    console.log("[DnD MonthGrid] dragStart:", { sessionId: session?.id, rawId: session?.rawId, date: session?.date });
    if (session) setActiveDragSession(session);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    console.log("[DnD MonthGrid] dragEnd:", { activeId: active.id, overId: over?.id, hasOnMoveSession: !!onMoveSession });
    setActiveDragSession(null);
    setOverDayId(null);
    if (!over) return;
    const session = active.data.current?.session as CalendarEntry | undefined;
    if (!session) return;
    if (String(over.id) === "trash-drop-zone") {
      if (onDeleteSession) onDeleteSession(session);
      return;
    }
    if (!onMoveSession) return;
    const targetDate = String(over.id);
    console.log("[DnD MonthGrid] moving:", { rawId: session.rawId, from: session.date, to: targetDate });
    if (targetDate === session.date) return;
    onMoveSession(session, targetDate);
  }, [onMoveSession, onDeleteSession]);

  const handleDragOver = useCallback((event: { over: { id: string | number } | null }) => {
    setOverDayId(event.over ? String(event.over.id) : null);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragSession(null);
    setOverDayId(null);
  }, []);

  const overlayContent = useMemo(() => {
    if (!activeDragSession) return null;
    const tone = sessionToneFromEntry(activeDragSession);
    return (
      <div
        className={`planning-calendar-app-session dnd-drag-overlay ${activeDragSession.layerDiscipline === "running" ? "running" : activeDragSession.layerDiscipline === "ciclismo" ? "cycling" : activeDragSession.layerDiscipline === "natación" ? "swimming" : ""} ${activeDragSession.sessionType === "clave" ? "key" : ""}`}
        style={{
          borderLeft: `3px solid ${sessionToneBorderColor(tone)}`,
          background: sessionToneBackgroundTint(activeDragSession),
        }}
      >
        <SessionCardContent session={activeDragSession} compact />
      </div>
    );
  }, [activeDragSession]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
    >
      <div className="planning-calendar-month-stream planning-calendar-month-fixed">
        {continuousMonthSections.filter((s) => s.monthStart === calendarMonth).map((monthSection) => (
          <section
            key={monthSection.monthStart}
            className="planning-calendar-month-section active"
          >
            <div className="planning-calendar-month-section-head">
              <strong>{monthHeading(monthSection.monthStart)}</strong>
              <small>
                {monthSection.totalSessions
                  ? `${formatMinutesCompact(monthSection.totalMinutes)} · ${monthSection.totalSessions} sesiones visibles`
                  : "Sin sesiones visibles todavía"}
              </small>
            </div>

            <div className="planning-calendar-month-board">
              <div className="planning-calendar-month-header">
                {["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"].map((day) => (
                  <span key={`${monthSection.monthStart}-${day}`} className="planning-calendar-app-weekday">{day}</span>
                ))}
                <span className="planning-calendar-month-summary-heading">Carga semanal</span>
              </div>

              <div className="planning-calendar-month-rows">
                {monthSection.rows.map((week) => {
                  const isSelectedWeek = week.weekStart === selectedWeekStart;
                  const disciplineRows = ["running", "ciclismo", "natación"].map((discipline) => ({
                    discipline,
                    minutes: week.snapshot.disciplineMetrics.find((metric) => metric.discipline === discipline)?.minutes ?? 0,
                  }));

                  return (
                    <section
                      key={`month-row-${monthSection.monthStart}-${week.weekStart}`}
                      className={`planning-calendar-month-row ${isSelectedWeek ? "selected" : ""}`}
                    >
                      <div className="planning-calendar-month-row-grid">
                        {week.cells.map((cell) => {
                          if (!cell.date) {
                            return <span key={cell.id} className="planning-calendar-app-spacer" aria-hidden="true" />;
                          }
                          const day = cell.date;
                          const daySessions = sessionsByDate.get(day) ?? [];
                          const visibleSessions = showAllDisciplines ? daySessions : daySessions.filter((session) => !session.isOverlay);
                          const overlayDaySessions = showAllDisciplines ? [] : daySessions.filter((session) => session.isOverlay);
                          const isSelected = selectedCalendarDate === day;
                          const isInBlock = dateValue(day) >= dateValue(selectedCalendarSource.startDate) && dateValue(day) <= dateValue(selectedCalendarSource.endDate);
                          const isToday = day === isoDateFromToday();
                          const isDayOver = overDayId === day;
                          return (
                            <article
                              key={cell.id}
                              className={`planning-calendar-app-day ${isSelected ? "selected" : ""} ${isInBlock ? "in-block" : ""}`}
                            >
                              <button type="button" className={`planning-calendar-app-day-label ${isToday ? "today" : ""}`} onClick={() => onSetSelectedCalendarDate(day)}>
                                {isToday ? `Hoy ${monthDayLabel(day)}` : monthDayLabel(day)}
                                {dayHasFreshnessConflict(day, violations) ? <span className="calendar-day-conflict-dot" title="Conflicto de frescura" /> : null}
                              </button>
                              <DroppableDayColumn dayId={day} isOver={isDayOver}>
                                <div className="planning-calendar-app-day-stack">
                                  {visibleSessions.map((session) => {
                                    const tone = sessionToneFromEntry(session);
                                    const isDragging = activeDragSession?.id === session.id;
                                    const isUnplanned = session.sessionType === "extra";
                                    return (
                                      <DraggableSessionCard key={session.id} session={session} isDragging={isDragging}>
                                        <button
                                          key={session.id}
                                          type="button"
                                          className={`planning-calendar-app-session ${session.layerDiscipline === "running" ? "running" : session.layerDiscipline === "ciclismo" ? "cycling" : session.layerDiscipline === "natación" ? "swimming" : ""} ${session.sessionType === "clave" ? "key" : ""} ${isUnplanned ? "unplanned" : ""}`}
                                          style={{
                                            borderLeft: `3px solid ${sessionToneBorderColor(tone)}`,
                                            background: sessionToneBackgroundTint(session),
                                          }}
                                          onClick={() => openCalendarSessionDetail(session)}
                                        >
                                          <SessionCardContent session={session} compact violations={violations} />
                                        </button>
                                      </DraggableSessionCard>
                                    );
                                  })}
                                  <button type="button" className="planning-calendar-app-empty calendar-ghost-add" onClick={() => openCalendarQuickAdd(day)}>
                                    +
                                  </button>
                                  {overlayDaySessions.map((session) => (
                                    <span key={session.id} className="planning-calendar-app-overlay">
                                      {disciplineLabel(session.layerDiscipline)}
                                    </span>
                                  ))}
                                </div>
                              </DroppableDayColumn>
                            </article>
                          );
                        })}
                      </div>

                      <aside className={`planning-calendar-month-row-summary ${week.snapshot.loadProfile.tone} ${isSelectedWeek ? "selected" : ""}`}>
                        <button
                          type="button"
                          className="planning-calendar-month-row-summary-head"
                          onClick={() => onSetSelectedCalendarDate(week.weekStart)}
                        >
                          <span>{weekHeading(week.weekStart, week.weekEnd)}</span>
                          <strong>{formatMinutesCompact(week.snapshot.totalMinutes)}</strong>
                          <small>
                            {week.snapshot.totalSessions
                              ? `${week.snapshot.totalSessions} sesiones · ${week.snapshot.loadProfile.label.toLowerCase()}`
                              : `Sin sesiones en ${week.inMonthDays} días`}
                          </small>
                        </button>

                        <div className="planning-calendar-month-row-metrics">
                          <div className="planning-calendar-month-row-metric">
                            <div className="planning-calendar-month-row-metric-head">
                              <span>Total</span>
                              <strong>{formatMinutesCompact(week.snapshot.totalMinutes)}</strong>
                            </div>
                            <div className="planning-calendar-month-row-metric-track">
                              <span
                                className={`planning-calendar-month-row-metric-fill ${week.snapshot.loadProfile.tone}`}
                                style={{
                                  width: week.snapshot.totalMinutes
                                    ? `${Math.max(8, (week.snapshot.totalMinutes / monthSection.scale.totalMinutes) * 100)}%`
                                    : "0%",
                                }}
                              />
                            </div>
                          </div>

                          {disciplineRows.map((row) => (
                            <div key={`${week.weekStart}-${row.discipline}`} className="planning-calendar-month-row-metric">
                              <div className="planning-calendar-month-row-metric-head">
                                <span>{disciplineLabel(row.discipline)}</span>
                                <strong>{formatMinutesCompact(row.minutes)}</strong>
                              </div>
                              <div className="planning-calendar-month-row-metric-track">
                                <span
                                  className="planning-calendar-month-row-metric-fill discipline"
                                  style={{
                                    width: row.minutes
                                      ? `${Math.max(8, (row.minutes / monthSection.scale.disciplineMinutes[row.discipline]) * 100)}%`
                                      : "0%",
                                    backgroundColor: planningDisciplineAccent(row.discipline),
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* ── Week-end training load (TrainingPeaks style) ── */}
                        {(() => {
                          const wl = getWeekEndLoad(calendarLoadMap, week.weekEnd);
                          if (!wl) return null;
                          return <WeekLoadDisplay wl={wl} compact />;
                        })()}
                      </aside>
                    </section>
                  );
                })}
              </div>
            </div>
          </section>
        ))}
      </div>

      {activeDragSession && <TrashDropZone isOver={overDayId === "trash-drop-zone"} />}

      <DragOverlay dropAnimation={null}>
        {overlayContent}
      </DragOverlay>
    </DndContext>
  );
}

// ── Trash Drop Zone ──
function TrashDropZone({ isOver }: { isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: "trash-drop-zone" });
  return (
    <div
      ref={setNodeRef}
      className={`planning-calendar-trash-zone ${isOver ? "active" : ""}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      </svg>
      <span>{isOver ? "Soltar para eliminar" : "Eliminar"}</span>
    </div>
  );
}

// ── Drag-and-Drop Primitives ──

function DraggableSessionCard({
  session,
  isDragging,
  children,
}: {
  session: CalendarEntry;
  isDragging: boolean;
  children: React.ReactNode;
}) {
  const canDrag = true;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: session.id,
    data: { session },
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    opacity: isDragging ? 0.35 : 1,
    cursor: canDrag ? "grab" : "default",
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

function DroppableDayColumn({
  dayId,
  isOver,
  children,
}: {
  dayId: string;
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: dayId });

  return (
    <div
      ref={setNodeRef}
      className={`training-calendar-week-drop-zone ${isOver ? "dnd-drop-active" : ""}`}
    >
      {children}
    </div>
  );
}

// ── Week Grid Sub-component ──

function WeekGrid({
  selectedCalendarDate,
  selectedWeekStart,
  selectedWeekEnd,
  continuousWeekStarts,
  sessionsByDate,
  athleteAnalysis,
  selectedDiscipline,
  violations,
  onSetSelectedCalendarDate,
  openCalendarSessionDetail,
  openCalendarQuickAdd,
  onMoveSession,
  onDeleteSession,
  calendarWeekSectionRefs,
  calendarLoadMap,
  showAllDisciplines,
}: {
  selectedCalendarDate: string | null;
  selectedWeekStart: string;
  selectedWeekEnd: string;
  continuousWeekStarts: string[];
  sessionsByDate: Map<string, CalendarEntry[]>;
  athleteAnalysis: AthleteAnalysis | null;
  selectedDiscipline: string;
  violations: CalendarViolation[];
  onSetSelectedCalendarDate: (date: string | null) => void;
  openCalendarSessionDetail: (session: CalendarEntry) => void;
  openCalendarQuickAdd: (date: string) => void;
  onMoveSession?: (session: CalendarEntry, newDate: string) => void;
  onDeleteSession?: (session: CalendarEntry) => void;
  calendarWeekSectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  calendarLoadMap: Map<string, WeekLoadValues>;
  showAllDisciplines?: boolean;
}) {
  const [activeDragSession, setActiveDragSession] = useState<CalendarEntry | null>(null);
  const [overDayId, setOverDayId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const session = event.active.data.current?.session as CalendarEntry | undefined;
    console.log("[DnD WeekGrid] dragStart:", { sessionId: session?.id, rawId: session?.rawId, date: session?.date });
    if (session) setActiveDragSession(session);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    console.log("[DnD WeekGrid] dragEnd:", { activeId: active.id, overId: over?.id, hasOnMoveSession: !!onMoveSession });
    setActiveDragSession(null);
    setOverDayId(null);
    if (!over) return;
    const session = active.data.current?.session as CalendarEntry | undefined;
    if (!session) return;
    if (String(over.id) === "trash-drop-zone") {
      if (onDeleteSession) onDeleteSession(session);
      return;
    }
    if (!onMoveSession) return;
    const targetDate = String(over.id);
    console.log("[DnD WeekGrid] moving:", { rawId: session.rawId, from: session.date, to: targetDate });
    if (targetDate === session.date) return;
    onMoveSession(session, targetDate);
  }, [onMoveSession, onDeleteSession]);

  const handleDragOver = useCallback((event: { over: { id: string | number } | null }) => {
    setOverDayId(event.over ? String(event.over.id) : null);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragSession(null);
    setOverDayId(null);
  }, []);

  // Build the overlay card content
  const overlayContent = useMemo(() => {
    if (!activeDragSession) return null;
    const tone = sessionToneFromEntry(activeDragSession);
    return (
      <div
        className={`training-calendar-session-card dnd-drag-overlay ${activeDragSession.layerDiscipline === "running" ? "running" : activeDragSession.layerDiscipline === "ciclismo" ? "cycling" : activeDragSession.layerDiscipline === "natación" ? "swimming" : ""} ${activeDragSession.sessionType === "clave" ? "key" : ""}`}
        style={{
          borderLeft: `3px solid ${sessionToneBorderColor(tone)}`,
          background: sessionToneBackgroundTint(activeDragSession),
        }}
      >
        <SessionCardContent session={activeDragSession} compact />
      </div>
    );
  }, [activeDragSession]);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
      >
        <div className="training-calendar-week-stream training-calendar-week-fixed">
          {continuousWeekStarts.filter((ws) => ws === selectedWeekStart).map((weekStart) => {
            const weekEnd = addDays(weekStart, 6);
            const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
            const isFocusedWeek = weekStart === selectedWeekStart;
            const weekEntries = weekDates.flatMap((day) => sessionsByDate.get(day) ?? []);
            const weekSnapshot = buildCalendarWeekSnapshot(weekEntries, athleteAnalysis, selectedDiscipline);
            const weekBarMaxMinutes = Math.max(1, ...weekSnapshot.disciplineMetrics.map((item) => item.minutes));

            return (
              <section
                key={weekStart}
                ref={(node) => {
                  calendarWeekSectionRefs.current[weekStart] = node;
                }}
                className={`training-calendar-week-section ${isFocusedWeek ? "selected" : ""}`}
              >
                <div className="training-calendar-week-section-head">
                  <span>{isFocusedWeek ? "Semana activa" : "Semana visible"}</span>
                  <strong>{weekHeading(weekStart, weekEnd)}</strong>
                </div>

                <div className="training-calendar-week-layout">
                  <div className="training-calendar-week-grid">
                    {weekDates.map((day) => {
                      const daySessions = sessionsByDate.get(day) ?? [];
                      const visibleSessions = showAllDisciplines ? daySessions : daySessions.filter((session) => !session.isOverlay);
                      const overlayDaySessions = showAllDisciplines ? [] : daySessions.filter((session) => session.isOverlay);
                      const isSelected = selectedCalendarDate === day;
                      const isToday = day === isoDateFromToday();
                      const isDayOver = overDayId === day;
                      return (
                        <article
                          key={day}
                          className={`training-calendar-week-column ${isSelected ? "selected" : ""}`}
                        >
                          <button type="button" className={`training-calendar-week-head ${isToday ? "today" : ""}`} onClick={() => onSetSelectedCalendarDate(day)}>
                            <span>{dayNameShort(day)}</span>
                            <strong>{monthDayLabel(day)}</strong>
                            {dayHasFreshnessConflict(day, violations) ? <span className="calendar-day-conflict-dot" title="Conflicto de frescura" /> : null}
                            <GarminDaySyncIndicator sessions={visibleSessions} />
                          </button>
                          <DroppableDayColumn dayId={day} isOver={isDayOver}>
                            <div className="training-calendar-week-stack">
                              {visibleSessions.map((session) => {
                                const tone = sessionToneFromEntry(session);
                                const isDragging = activeDragSession?.id === session.id;
                                const isUnplanned = session.sessionType === "extra";
                                return (
                                  <DraggableSessionCard key={session.id} session={session} isDragging={isDragging}>
                                    <button
                                      type="button"
                                      className={`training-calendar-session-card ${session.layerDiscipline === "running" ? "running" : session.layerDiscipline === "ciclismo" ? "cycling" : session.layerDiscipline === "natación" ? "swimming" : ""} ${session.sessionType === "clave" ? "key" : ""} ${isUnplanned ? "unplanned" : ""}`}
                                      style={{
                                        borderLeft: `3px solid ${sessionToneBorderColor(tone)}`,
                                        background: sessionToneBackgroundTint(session),
                                      }}
                                      onClick={() => openCalendarSessionDetail(session)}
                                    >
                                      <SessionCardContent session={session} violations={violations} />
                                    </button>
                                  </DraggableSessionCard>
                                );
                              })}
                              <button type="button" className="training-calendar-empty-slot calendar-ghost-add" onClick={() => openCalendarQuickAdd(day)}>+</button>
                              {overlayDaySessions.map((session) => (
                                <div key={session.id} className="training-calendar-session-card overlay">
                                  <span>{disciplineLabel(session.layerDiscipline)}</span>
                                  <strong>{session.title}</strong>
                                </div>
                              ))}
                            </div>
                          </DroppableDayColumn>
                        </article>
                      );
                    })}
                  </div>

                  <aside className={`training-calendar-week-summary training-calendar-week-summary-${weekSnapshot.loadProfile.tone}`}>
                    <div className="training-calendar-week-summary-top">
                      <article className="training-calendar-week-summary-kpi load">
                        <span>Carga</span>
                        <strong>{weekSnapshot.loadProfile.label}</strong>
                        <small>{weekSnapshot.loadProfile.hint}</small>
                      </article>
                      <article className="training-calendar-week-summary-kpi">
                        <span>Sesiones</span>
                        <strong>{weekSnapshot.totalSessions}</strong>
                        <small>{weekSnapshot.keySessions} clave · {weekSnapshot.supportSessions} soporte</small>
                      </article>
                      <article className="training-calendar-week-summary-kpi">
                        <span>Dia pico</span>
                        <strong>{weekSnapshot.peakDay ? formatMinutesCompact(weekSnapshot.peakDay.minutes) : "-"}</strong>
                        <small>{weekSnapshot.peakDay ? `${dayNameShort(weekSnapshot.peakDay.date)} ${monthDayLabel(weekSnapshot.peakDay.date)}` : "Sin carga visible"}</small>
                      </article>
                    </div>

                    <div className="training-calendar-week-summary-bars">
                      <div className="training-calendar-week-metric-row">
                        <div className="training-calendar-week-metric-head">
                          <span>Total duraci&oacute;n</span>
                          <strong>{formatMinutesCompact(weekSnapshot.totalMinutes)}</strong>
                        </div>
                        <div className="training-calendar-week-metric-track">
                          <span
                            className={`training-calendar-week-metric-fill ${weekSnapshot.loadProfile.tone}`}
                            style={{ width: `${Math.max(10, weekSnapshot.loadProfile.intensityPct)}%` }}
                          />
                        </div>
                      </div>

                      <div className="training-calendar-week-metric-row">
                        <div className="training-calendar-week-metric-head">
                          <span>Densidad clave</span>
                          <strong>{weekSnapshot.totalSessions ? `${weekSnapshot.keySessions}/${weekSnapshot.totalSessions}` : "0/0"}</strong>
                        </div>
                        <div className="training-calendar-week-metric-track">
                          <span
                            className="training-calendar-week-metric-fill positive"
                            style={{ width: `${weekSnapshot.totalSessions ? Math.max(10, (weekSnapshot.keySessions / weekSnapshot.totalSessions) * 100) : 10}%` }}
                          />
                        </div>
                      </div>

                      {/* Completion summary */}
                      {(() => {
                        const planned = weekEntries.filter((e) => !e.isOverlay && e.sessionType !== "extra");
                        const completed = planned.filter((e) => e.compliance?.status === "completed");
                        if (!planned.length) return null;
                        const pct = Math.round((completed.length / planned.length) * 100);
                        const tone = pct >= 80 ? "positive" : pct >= 50 ? "warning" : pct > 0 ? "neutral" : "neutral";
                        return (
                          <div className="training-calendar-week-metric-row">
                            <div className="training-calendar-week-metric-head">
                              <span>Completadas</span>
                              <strong>{completed.length}/{planned.length}</strong>
                            </div>
                            <div className="training-calendar-week-metric-track">
                              <span
                                className={`training-calendar-week-metric-fill ${tone}`}
                                style={{ width: `${Math.max(10, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {weekSnapshot.disciplineMetrics.length ? weekSnapshot.disciplineMetrics.map((metric) => (
                        <div key={`${weekStart}-${metric.discipline}`} className="training-calendar-week-metric-row">
                          <div className="training-calendar-week-metric-head">
                            <span>{disciplineLabel(metric.discipline)}</span>
                            <strong>{formatMinutesCompact(metric.minutes)}</strong>
                          </div>
                          <div className="training-calendar-week-metric-track">
                            <span
                              className="training-calendar-week-metric-fill discipline"
                              style={{
                                width: `${Math.max(14, (metric.minutes / weekBarMaxMinutes) * 100)}%`,
                                backgroundColor: planningDisciplineAccent(metric.discipline),
                              }}
                            />
                          </div>
                          <small>
                            {metric.distanceMeters
                              ? `${metric.distanceEstimated ? "~" : ""}${formatDistanceCompact(metric.distanceMeters)} · ${metric.sessions} sesiones`
                              : `${metric.sessions} sesiones`}
                          </small>
                        </div>
                      )) : (
                        <p className="training-calendar-week-summary-empty">Todav&iacute;a no hay sesiones visibles para esta semana.</p>
                      )}
                    </div>

                    {/* ── Week-end training load (TrainingPeaks style) ── */}
                    {(() => {
                      const wl = getWeekEndLoad(calendarLoadMap, weekEnd);
                      if (!wl) return null;
                      return <WeekLoadDisplay wl={wl} />;
                    })()}

                    <div className="training-calendar-week-summary-foot">
                      <div>
                        <span>Disciplina dominante</span>
                        <strong>{weekSnapshot.primaryDiscipline ? disciplineLabel(weekSnapshot.primaryDiscipline) : "Sin foco"}</strong>
                      </div>
                      <div>
                        <span>Distancia estimada</span>
                        <strong>{weekSnapshot.totalDistanceMeters ? formatDistanceCompact(weekSnapshot.totalDistanceMeters) : "n/d"}</strong>
                      </div>
                    </div>
                  </aside>
                </div>
              </section>
            );
          })}
        </div>

        {activeDragSession && <TrashDropZone isOver={overDayId === "trash-drop-zone"} />}

        <DragOverlay dropAnimation={null}>
          {overlayContent}
        </DragOverlay>
      </DndContext>
    </>
  );
}

// ── Garmin Day Sync Indicator ──

function GarminDaySyncIndicator({ sessions }: { sessions: CalendarEntry[] }) {
  const withStatus = sessions.filter((s) => s.rawId != null && s.publishStatus);
  if (withStatus.length === 0) return null;

  const sent = withStatus.filter((s) => s.publishStatus === "sent").length;
  const total = withStatus.length;

  if (sent === total) {
    return <span className="garmin-day-sync-indicator sent" title={`${sent}/${total} enviadas`}>{"\u2713"}</span>;
  }
  return (
    <span className="garmin-day-sync-indicator pending" title={`${sent}/${total} enviadas`}>
      {sent}/{total}
    </span>
  );
}

// ── Garmin Batch Push ──

function GarminBatchPush({
  sessionsByDate,
  selectedWeekStart,
  selectedWeekEnd,
  athleteId,
  token,
  onComplete,
}: {
  sessionsByDate: Map<string, CalendarEntry[]>;
  selectedWeekStart: string;
  selectedWeekEnd: string;
  athleteId: string;
  token: string;
  onComplete?: () => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{ sent: number; errors: number } | null>(null);

  const pendingSessions = useMemo(() => {
    const pending: CalendarEntry[] = [];
    const startVal = dateValue(selectedWeekStart);
    const endVal = dateValue(selectedWeekEnd);
    for (const [date, sessions] of sessionsByDate.entries()) {
      const dv = dateValue(date);
      if (dv < startVal || dv > endVal) continue;
      for (const s of sessions) {
        if (s.isOverlay) continue;
        if (s.rawId != null && s.publishStatus !== "sent") {
          pending.push(s);
        }
      }
    }
    return pending;
  }, [sessionsByDate, selectedWeekStart, selectedWeekEnd]);

  const handleBatchPush = useCallback(async () => {
    if (pendingSessions.length === 0 || pushing) return;
    setPushing(true);
    setResult(null);
    const total = pendingSessions.length;
    setProgress({ current: 0, total });
    let sent = 0;
    let errors = 0;

    for (let i = 0; i < pendingSessions.length; i++) {
      const session = pendingSessions[i];
      setProgress({ current: i + 1, total });
      try {
        await api.pushWorkoutToGarmin(token, Number(athleteId), session.rawId!);
        sent++;
      } catch {
        errors++;
      }
    }

    setResult({ sent, errors });
    setPushing(false);
    if (onComplete) onComplete();
  }, [pendingSessions, pushing, token, athleteId, onComplete]);

  if (pendingSessions.length === 0 && !result) return null;

  return (
    <div className="garmin-batch-push">
      {pushing ? (
        <span className="garmin-batch-push-progress">
          Enviando {progress.current}/{progress.total}...
        </span>
      ) : result ? (
        <span className={`garmin-batch-push-result ${result.errors > 0 ? "has-errors" : ""}`}>
          {result.sent} enviada{result.sent !== 1 ? "s" : ""}{result.errors > 0 ? `, ${result.errors} error${result.errors !== 1 ? "es" : ""}` : ""}
        </span>
      ) : null}
      <button
        type="button"
        className="planning-inline-action garmin-batch-btn"
        onClick={handleBatchPush}
        disabled={pushing || pendingSessions.length === 0}
        title={`Enviar ${pendingSessions.length} sesión${pendingSessions.length !== 1 ? "es" : ""} pendiente${pendingSessions.length !== 1 ? "s" : ""} a Garmin`}
      >
        {pushing ? "Enviando..." : `Enviar semana a Garmin (${pendingSessions.length})`}
      </button>
    </div>
  );
}

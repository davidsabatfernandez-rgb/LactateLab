import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
} from "recharts";
import { api } from "../../lib/api";
import { useAthleteDataSafe } from "../context/AthleteDataContext";

// ── Types ──────────────────────────────────────────────────────

type AvailableReport = {
  type: string;
  start: string;
  end: string;
  label: string;
  year_month?: string;
};

type RecoveryDaily = { date: string; score: number | null; zone: string | null };
type SportBreakdown = { sport: string; count: number; duration_min: number; distance_km: number };
type BehaviorAdherent = { behavior: string; emoji: string; days: number };
type BehaviorCorrelationBrief = { behavior: string; emoji: string; effect: string } | null;

type ReportData = {
  period: { start: string; end: string; type: string };
  summary: {
    avg_recovery: number | null;
    total_strain: number;
    avg_sleep_hours: number | null;
    total_activities: number;
    total_duration_min: number;
    total_distance_km: number;
  };
  recovery: {
    avg_score: number | null;
    trend: string;
    best_day: string | null;
    worst_day: string | null;
    daily: RecoveryDaily[];
  };
  training: {
    total_sessions: number;
    by_sport: SportBreakdown[];
    intensity_distribution: { easy_pct: number; moderate_pct: number; hard_pct: number };
    load_status: string;
    total_duration_min: number;
    total_distance_km: number;
    total_strain: number;
  };
  sleep: {
    avg_hours: number | null;
    avg_deep_pct: number | null;
    avg_rem_pct: number | null;
    consistency_score: number | null;
    debt_hours: number | null;
    trend: string;
  };
  vitals: {
    avg_rhr: number | null;
    rhr_trend: string;
    avg_hrv: number | null;
    hrv_trend: string;
    avg_spo2: number | null;
  };
  behaviors: {
    total_logged_days: number;
    top_adherent: BehaviorAdherent[];
    top_positive_correlation: BehaviorCorrelationBrief;
    top_negative_correlation: BehaviorCorrelationBrief;
  };
  nutrition: {
    avg_calories: number | null;
    avg_carbs: number | null;
    avg_protein: number | null;
    avg_hydration: number | null;
    days_logged: number;
  };
  highlights: string[];
  // Monthly extras
  weekly_breakdown?: { week_start: string; week_end: string; sessions: number; duration_min: number; strain: number }[];
  month_comparison?: {
    recovery_change_pct: number | null;
    sessions_change: number | null;
    sleep_change_pct: number | null;
    hrv_change_pct: number | null;
    rhr_change_pct: number | null;
  };
};

// ── Helpers ────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  green: "var(--ath-green)",
  yellow: "var(--ath-amber)",
  red: "var(--ath-red)",
};

const SPORT_COLORS = [
  "#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#14b8a6", "#a855f7", "#6b7280",
];

function trendLabel(trend: string): string {
  if (trend === "improving") return "Mejorando";
  if (trend === "declining") return "Descendiendo";
  return "Estable";
}

function trendIcon(trend: string): string {
  if (trend === "improving") return "\u2191";
  if (trend === "declining") return "\u2193";
  return "\u2192";
}

function trendColor(trend: string): string {
  if (trend === "improving") return "var(--ath-green)";
  if (trend === "declining") return "var(--ath-red)";
  return "var(--ath-text-muted)";
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function loadStatusLabel(status: string): string {
  const map: Record<string, string> = {
    sobrecarga: "Sobrecarga",
    optima: "Optima",
    mantenimiento: "Mantenimiento",
    baja: "Baja",
    sin_datos: "Sin datos",
    sin_tss: "Sin TSS",
  };
  return map[status] || status;
}

// ── Component ─────────────────────────────────────────────────

export function ReportsPage() {
  const data = useAthleteDataSafe();
  const token = data?.token ?? "";
  const athleteId = data?.user.athlete_id!;

  const [available, setAvailable] = useState<AvailableReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AvailableReport | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");

  // Load available reports
  const loadAvailable = useCallback(async () => {
    if (!token || !athleteId) { setLoading(false); return; }
    try {
      const result = await api.availableReports(token, athleteId);
      setAvailable(result.reports);
      if (result.reports.length > 0) {
        setSelectedReport(result.reports[0]);
      }
    } catch {
      setError("Error al cargar informes disponibles");
    } finally {
      setLoading(false);
    }
  }, [token, athleteId]);

  useEffect(() => { loadAvailable(); }, [loadAvailable]);

  // Load selected report
  useEffect(() => {
    if (!selectedReport || !token || !athleteId) return;
    setLoadingReport(true);
    setError("");

    const fetchReport = async () => {
      try {
        let result: Record<string, unknown>;
        if (selectedReport.type === "weekly") {
          result = await api.weeklyReport(token, athleteId, selectedReport.start);
        } else {
          result = await api.monthlyReport(token, athleteId, selectedReport.year_month);
        }
        setReport(result as unknown as ReportData);
      } catch {
        setError("Error al cargar el informe");
      } finally {
        setLoadingReport(false);
      }
    };
    fetchReport();
  }, [selectedReport, token, athleteId]);

  if (loading) {
    return (
      <div className="ath-report-page">
        <div className="ath-report-header-card">
          <h2 className="ath-report-page-title">Informes de rendimiento</h2>
          <p className="ath-report-loading">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="ath-report-page">
        <div className="ath-report-header-card">
          <h2 className="ath-report-page-title">Informes de rendimiento</h2>
          <p className="ath-report-error">{error}</p>
        </div>
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <div className="ath-report-page">
        <div className="ath-report-header-card">
          <h2 className="ath-report-page-title">Informes de rendimiento</h2>
          <p className="ath-report-empty">
            Aun no hay datos suficientes para generar informes.
            Conecta tu dispositivo y registra tus actividades para ver tu primer informe.
          </p>
        </div>
      </div>
    );
  }

  const printTitle = selectedReport
    ? selectedReport.type === "weekly"
      ? `PeakAerobic — Informe Semanal`
      : `PeakAerobic — Informe Mensual`
    : "PeakAerobic — Informe";

  const printSubtitle = selectedReport?.label ?? "";

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="ath-report-page">
      {/* Print-only header (hidden on screen) */}
      <div className="ath-report-print-header">
        <h1 className="ath-report-print-title">{printTitle}</h1>
        <p className="ath-report-print-subtitle">{printSubtitle}</p>
      </div>

      {/* Period Selector */}
      <div className="ath-report-header-card">
        <div className="ath-report-header-top">
          <h2 className="ath-report-page-title">Informes de rendimiento</h2>
          <button
            type="button"
            className="ath-report-export-btn"
            onClick={handleExportPDF}
            disabled={!report || loadingReport}
            title="Exportar como PDF"
          >
            Exportar PDF
          </button>
        </div>
        <select
          className="ath-report-selector"
          value={selectedReport ? `${selectedReport.type}:${selectedReport.start}` : ""}
          onChange={(e) => {
            const [type, start] = e.target.value.split(":");
            const found = available.find((r) => r.type === type && r.start === start);
            if (found) setSelectedReport(found);
          }}
        >
          <optgroup label="Semanal">
            {available.filter((r) => r.type === "weekly").map((r) => (
              <option key={`w-${r.start}`} value={`${r.type}:${r.start}`}>{r.label}</option>
            ))}
          </optgroup>
          <optgroup label="Mensual">
            {available.filter((r) => r.type === "monthly").map((r) => (
              <option key={`m-${r.start}`} value={`${r.type}:${r.start}`}>{r.label}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {loadingReport && (
        <div className="ath-report-header-card">
          <p className="ath-report-loading">Generando informe...</p>
        </div>
      )}

      {report && !loadingReport && (
        <>
          {/* Highlights */}
          {report.highlights.length > 0 && (
            <div className="ath-report-card ath-report-highlights">
              <h3 className="ath-report-card-title">Destacados</h3>
              <ul className="ath-report-highlights-list">
                {report.highlights.map((h, i) => (
                  <li key={i} className="ath-report-highlight-item">{h}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary Cards */}
          <div className="ath-report-summary-grid">
            <SummaryCard
              label="Recuperacion"
              value={report.summary.avg_recovery != null ? `${Math.round(report.summary.avg_recovery)}` : "--"}
              unit="/100"
              trend={report.recovery.trend}
            />
            <SummaryCard
              label="Actividades"
              value={`${report.summary.total_activities}`}
              unit="sesiones"
            />
            <SummaryCard
              label="Sueno"
              value={report.summary.avg_sleep_hours != null ? `${report.summary.avg_sleep_hours}` : "--"}
              unit="h/noche"
              trend={report.sleep.trend}
            />
            <SummaryCard
              label="Carga"
              value={report.summary.total_strain > 0 ? `${Math.round(report.summary.total_strain)}` : "--"}
              unit="TSS"
            />
          </div>

          {/* Recovery Chart */}
          {report.recovery.daily.length > 0 && (
            <div className="ath-report-card">
              <h3 className="ath-report-card-title">Recuperacion diaria</h3>
              <div className="ath-report-chart-container">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={report.recovery.daily} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ath-border-subtle)" />
                    <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }} />
                    <Tooltip
                      contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number) => [`${Math.round(value)}`, "Score"]}
                      labelFormatter={formatDateShort}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {report.recovery.daily.map((entry, i) => (
                        <Cell key={i} fill={ZONE_COLORS[entry.zone || "yellow"] || "var(--ath-text-muted)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="ath-report-meta-row">
                {report.recovery.best_day && (
                  <span className="ath-report-meta">Mejor dia: {formatDateShort(report.recovery.best_day)}</span>
                )}
                {report.recovery.worst_day && (
                  <span className="ath-report-meta">Peor dia: {formatDateShort(report.recovery.worst_day)}</span>
                )}
              </div>
            </div>
          )}

          {/* Training Section */}
          {report.training.total_sessions > 0 && (
            <div className="ath-report-card">
              <h3 className="ath-report-card-title">Entrenamiento</h3>
              <div className="ath-report-training-grid">
                {/* Sport distribution */}
                {report.training.by_sport.length > 0 && (
                  <div className="ath-report-chart-half">
                    <h4 className="ath-report-subtitle">Por deporte</h4>
                    <div className="ath-report-chart-container" style={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={report.training.by_sport}
                            dataKey="count"
                            nameKey="sport"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={35}
                            paddingAngle={2}
                          >
                            {report.training.by_sport.map((_, i) => (
                              <Cell key={i} fill={SPORT_COLORS[i % SPORT_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 12 }}
                            formatter={(value: number, name: string) => [`${value} sesiones`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="ath-report-sport-legend">
                      {report.training.by_sport.map((s, i) => (
                        <span key={i} className="ath-report-legend-item">
                          <span className="ath-report-legend-dot" style={{ background: SPORT_COLORS[i % SPORT_COLORS.length] }} />
                          {s.sport} ({s.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Intensity distribution */}
                <div className="ath-report-chart-half">
                  <h4 className="ath-report-subtitle">Intensidad</h4>
                  <div className="ath-report-intensity-bars">
                    <IntensityBar label="Suave" pct={report.training.intensity_distribution.easy_pct} color="var(--ath-green)" />
                    <IntensityBar label="Moderada" pct={report.training.intensity_distribution.moderate_pct} color="var(--ath-amber)" />
                    <IntensityBar label="Intensa" pct={report.training.intensity_distribution.hard_pct} color="var(--ath-red)" />
                  </div>
                  <div className="ath-report-meta-row" style={{ marginTop: 12 }}>
                    <span className="ath-report-meta">Estado de carga: {loadStatusLabel(report.training.load_status)}</span>
                  </div>
                  <div className="ath-report-meta-row">
                    <span className="ath-report-meta">{Math.round(report.training.total_duration_min)} min totales</span>
                    <span className="ath-report-meta">{report.training.total_distance_km} km</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sleep Section */}
          {report.sleep.avg_hours != null && (
            <div className="ath-report-card">
              <h3 className="ath-report-card-title">Sueno</h3>
              <div className="ath-report-sleep-stats">
                <StatPill label="Media" value={`${report.sleep.avg_hours}h`} />
                {report.sleep.avg_deep_pct != null && <StatPill label="Profundo" value={`${report.sleep.avg_deep_pct}%`} />}
                {report.sleep.avg_rem_pct != null && <StatPill label="REM" value={`${report.sleep.avg_rem_pct}%`} />}
                {report.sleep.consistency_score != null && <StatPill label="Consistencia" value={`${report.sleep.consistency_score}`} />}
                {report.sleep.debt_hours != null && <StatPill label="Deuda" value={`${report.sleep.debt_hours}h`} />}
              </div>
              <div className="ath-report-meta-row" style={{ marginTop: 8 }}>
                <span className="ath-report-meta" style={{ color: trendColor(report.sleep.trend) }}>
                  {trendIcon(report.sleep.trend)} {trendLabel(report.sleep.trend)}
                </span>
              </div>
            </div>
          )}

          {/* Vitals Section */}
          {(report.vitals.avg_rhr != null || report.vitals.avg_hrv != null) && (
            <div className="ath-report-card">
              <h3 className="ath-report-card-title">Signos vitales</h3>
              <div className="ath-report-vitals-grid">
                {report.vitals.avg_rhr != null && (
                  <div className="ath-report-vital-item">
                    <span className="ath-report-vital-label">FC reposo</span>
                    <span className="ath-report-vital-value">{Math.round(report.vitals.avg_rhr)} <small>bpm</small></span>
                    <span className="ath-report-vital-trend" style={{ color: trendColor(report.vitals.rhr_trend) }}>
                      {trendIcon(report.vitals.rhr_trend)} {trendLabel(report.vitals.rhr_trend)}
                    </span>
                  </div>
                )}
                {report.vitals.avg_hrv != null && (
                  <div className="ath-report-vital-item">
                    <span className="ath-report-vital-label">HRV</span>
                    <span className="ath-report-vital-value">{Math.round(report.vitals.avg_hrv)} <small>ms</small></span>
                    <span className="ath-report-vital-trend" style={{ color: trendColor(report.vitals.hrv_trend) }}>
                      {trendIcon(report.vitals.hrv_trend)} {trendLabel(report.vitals.hrv_trend)}
                    </span>
                  </div>
                )}
                {report.vitals.avg_spo2 != null && (
                  <div className="ath-report-vital-item">
                    <span className="ath-report-vital-label">SpO2</span>
                    <span className="ath-report-vital-value">{report.vitals.avg_spo2}<small>%</small></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Behaviors Section */}
          {report.behaviors.total_logged_days > 0 && (
            <div className="ath-report-card">
              <h3 className="ath-report-card-title">Habitos</h3>
              <p className="ath-report-meta">{report.behaviors.total_logged_days} dias registrados</p>
              {report.behaviors.top_adherent.length > 0 && (
                <div className="ath-report-behavior-list">
                  {report.behaviors.top_adherent.map((b, i) => (
                    <div key={i} className="ath-report-behavior-item">
                      <span className="ath-report-behavior-emoji">{b.emoji}</span>
                      <span className="ath-report-behavior-name">{b.behavior}</span>
                      <span className="ath-report-behavior-days">{b.days}d</span>
                    </div>
                  ))}
                </div>
              )}
              {report.behaviors.top_positive_correlation && (
                <div className="ath-report-correlation ath-report-correlation--positive">
                  <span>{report.behaviors.top_positive_correlation.emoji}</span>
                  <span>{report.behaviors.top_positive_correlation.behavior}: {report.behaviors.top_positive_correlation.effect}</span>
                </div>
              )}
              {report.behaviors.top_negative_correlation && (
                <div className="ath-report-correlation ath-report-correlation--negative">
                  <span>{report.behaviors.top_negative_correlation.emoji}</span>
                  <span>{report.behaviors.top_negative_correlation.behavior}: {report.behaviors.top_negative_correlation.effect}</span>
                </div>
              )}
            </div>
          )}

          {/* Nutrition Section */}
          {report.nutrition.days_logged > 0 && (
            <div className="ath-report-card">
              <h3 className="ath-report-card-title">Nutricion</h3>
              <p className="ath-report-meta">{report.nutrition.days_logged} dias registrados</p>
              <div className="ath-report-nutrition-stats">
                {report.nutrition.avg_calories != null && <StatPill label="Calorias" value={`${Math.round(report.nutrition.avg_calories)} kcal`} />}
                {report.nutrition.avg_carbs != null && <StatPill label="CH" value={`${Math.round(report.nutrition.avg_carbs)}g`} />}
                {report.nutrition.avg_protein != null && <StatPill label="Prot" value={`${Math.round(report.nutrition.avg_protein)}g`} />}
                {report.nutrition.avg_hydration != null && <StatPill label="Hidratacion" value={`${report.nutrition.avg_hydration}L`} />}
              </div>
            </div>
          )}

          {/* Monthly extras: week-over-week */}
          {report.weekly_breakdown && report.weekly_breakdown.length > 0 && (
            <div className="ath-report-card">
              <h3 className="ath-report-card-title">Desglose semanal</h3>
              <div className="ath-report-chart-container">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={report.weekly_breakdown} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ath-border-subtle)" />
                    <XAxis dataKey="week_start" tickFormatter={formatDateShort} tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--ath-text-muted)" }} />
                    <Tooltip
                      contentStyle={{ background: "var(--ath-bg-card)", border: "1px solid var(--ath-border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number, name: string) => {
                        if (name === "sessions") return [`${value}`, "Sesiones"];
                        if (name === "duration_min") return [`${Math.round(value)} min`, "Duracion"];
                        return [`${Math.round(value)}`, name];
                      }}
                      labelFormatter={formatDateShort}
                    />
                    <Bar dataKey="sessions" fill="var(--ath-accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Monthly comparison */}
          {report.month_comparison && (
            <div className="ath-report-card">
              <h3 className="ath-report-card-title">vs. mes anterior</h3>
              <div className="ath-report-comparison-grid">
                <ComparisonItem label="Recuperacion" value={report.month_comparison.recovery_change_pct} suffix="%" />
                <ComparisonItem label="Sesiones" value={report.month_comparison.sessions_change} />
                <ComparisonItem label="Sueno" value={report.month_comparison.sleep_change_pct} suffix="%" />
                <ComparisonItem label="HRV" value={report.month_comparison.hrv_change_pct} suffix="%" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function SummaryCard({ label, value, unit, trend }: { label: string; value: string; unit?: string; trend?: string }) {
  return (
    <div className="ath-report-summary-card">
      <span className="ath-report-summary-label">{label}</span>
      <span className="ath-report-summary-value">
        {value}
        {unit && <small className="ath-report-summary-unit">{unit}</small>}
      </span>
      {trend && (
        <span className="ath-report-summary-trend" style={{ color: trendColor(trend) }}>
          {trendIcon(trend)} {trendLabel(trend)}
        </span>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="ath-report-stat-pill">
      <span className="ath-report-stat-pill-label">{label}</span>
      <span className="ath-report-stat-pill-value">{value}</span>
    </div>
  );
}

function IntensityBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="ath-report-intensity-row">
      <span className="ath-report-intensity-label">{label}</span>
      <div className="ath-report-intensity-track">
        <div className="ath-report-intensity-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="ath-report-intensity-pct">{pct}%</span>
    </div>
  );
}

function ComparisonItem({ label, value, suffix = "" }: { label: string; value: number | null; suffix?: string }) {
  if (value == null) return null;
  const isPositive = value > 0;
  const color = isPositive ? "var(--ath-green)" : value < 0 ? "var(--ath-red)" : "var(--ath-text-muted)";
  return (
    <div className="ath-report-comparison-item">
      <span className="ath-report-comparison-label">{label}</span>
      <span className="ath-report-comparison-value" style={{ color }}>
        {isPositive ? "+" : ""}{Math.round(value)}{suffix}
      </span>
    </div>
  );
}

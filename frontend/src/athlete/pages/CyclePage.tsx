import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAthleteData } from "../context/AthleteDataContext";
import type { CycleDashboard, CycleDailyLog, CyclePhase } from "../../types";

/* ── Phase colors ──────────────────────────────────────────── */
const PHASE_COLORS: Record<string, string> = {
  menstruation: "#ef4444",
  follicular: "#22c55e",
  ovulation: "#a855f7",
  early_luteal: "#f59e0b",
  late_luteal: "#f97316",
};

const PHASE_ICONS: Record<string, string> = {
  menstruation: "🩸",
  follicular: "🌱",
  ovulation: "✨",
  early_luteal: "🌙",
  late_luteal: "🍂",
};

/* ── Onboarding ────────────────────────────────────────────── */

type OnboardingData = {
  tracking_goal: string;
  average_cycle_length_days: number;
  average_period_length_days: number;
  cycles_are_regular: boolean | null;
  uses_hormonal_contraception: boolean;
  contraception_type: string;
  last_period_start_date: string;
};

const INITIAL_ONBOARDING: OnboardingData = {
  tracking_goal: "all",
  average_cycle_length_days: 28,
  average_period_length_days: 5,
  cycles_are_regular: null,
  uses_hormonal_contraception: false,
  contraception_type: "none",
  last_period_start_date: "",
};

/* Helper: calculate avg cycle length from period dates */
function calcCycleLengthFromDates(dates: string[]): number | null {
  const sorted = dates.filter(Boolean).map((d) => new Date(d + "T00:00:00").getTime()).sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    diffs.push(Math.round((sorted[i] - sorted[i - 1]) / 86400000));
  }
  return Math.round(diffs.reduce((s, v) => s + v, 0) / diffs.length);
}

function OnboardingWizard({ onComplete }: { onComplete: (data: OnboardingData) => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingData>(INITIAL_ONBOARDING);
  /* Dates of last periods for auto-calculation */
  const [periodDates, setPeriodDates] = useState<string[]>(["", "", ""]);

  const set = (key: keyof OnboardingData, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  const setPeriodDate = (idx: number, val: string) => {
    setPeriodDates((prev) => { const n = [...prev]; n[idx] = val; return n; });
  };

  /* Auto-calc cycle length when dates change */
  const autoLength = calcCycleLengthFromDates(periodDates);

  /* When entering step 4, sync autoLength into form + set last_period_start_date */
  const goToStep4 = () => {
    const filled = periodDates.filter(Boolean).sort();
    if (autoLength && autoLength >= 18 && autoLength <= 50) {
      set("average_cycle_length_days", autoLength);
    }
    if (filled.length > 0) {
      set("last_period_start_date", filled[filled.length - 1]);
    }
    setStep(4);
  };

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="ath-cycle-onboard-step">
      <div className="ath-cycle-onboard-icon">🌸</div>
      <h2>Seguimiento del ciclo menstrual</h2>
      <p>Registra tu ciclo para recibir recomendaciones de entrenamiento personalizadas basadas en tu fase hormonal.</p>
      <p className="ath-cycle-onboard-note">Toda la informacion es privada y opcional. Puedes desactivarlo en cualquier momento.</p>
      <button className="ath-cycle-btn-primary" onClick={() => setStep(1)}>Empezar</button>
    </div>,

    // Step 1: Goal
    <div key="goal" className="ath-cycle-onboard-step">
      <h3>¿Que quieres conseguir?</h3>
      <div className="ath-cycle-options">
        {[
          { val: "period_tracking", label: "Seguir mi periodo", desc: "Saber cuando llega y cuanto dura" },
          { val: "performance_sync", label: "Sincronizar con entrenamiento", desc: "Adaptar mi entreno a cada fase" },
          { val: "symptom_awareness", label: "Entender mis sintomas", desc: "Registrar como me siento dia a dia" },
          { val: "all", label: "Todo lo anterior", desc: "Experiencia completa" },
        ].map((o) => (
          <button
            key={o.val}
            className={`ath-cycle-option ${form.tracking_goal === o.val ? "selected" : ""}`}
            onClick={() => set("tracking_goal", o.val)}
          >
            <strong>{o.label}</strong>
            <span>{o.desc}</span>
          </button>
        ))}
      </div>
      <div className="ath-cycle-nav-btns">
        <button className="ath-cycle-btn-secondary" onClick={() => setStep(0)}>Atras</button>
        <button className="ath-cycle-btn-primary" onClick={() => setStep(2)}>Siguiente</button>
      </div>
    </div>,

    // Step 2: Period dates (auto-calculate cycle length)
    <div key="cycle" className="ath-cycle-onboard-step">
      <h3>Fechas de tus ultimas reglas</h3>
      <p className="ath-cycle-onboard-note">Introduce las fechas de inicio de tus ultimas 2-3 reglas. Calcularemos la duracion de tu ciclo automaticamente.</p>
      <label className="ath-cycle-field">
        <span>Ultima regla (la mas reciente)</span>
        <input type="date" value={periodDates[0]} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPeriodDate(0, e.target.value)} />
      </label>
      <label className="ath-cycle-field">
        <span>Penultima regla</span>
        <input type="date" value={periodDates[1]} max={periodDates[0] || new Date().toISOString().slice(0, 10)} onChange={(e) => setPeriodDate(1, e.target.value)} />
      </label>
      <label className="ath-cycle-field">
        <span>Anterior (opcional)</span>
        <input type="date" value={periodDates[2]} max={periodDates[1] || periodDates[0] || new Date().toISOString().slice(0, 10)} onChange={(e) => setPeriodDate(2, e.target.value)} />
      </label>
      {autoLength && (
        <div className="ath-cycle-auto-result">
          Tu ciclo dura aproximadamente <strong>{autoLength} dias</strong>
        </div>
      )}
      {!autoLength && periodDates[0] && !periodDates[1] && (
        <p className="ath-cycle-onboard-note">Anade al menos una fecha mas para calcular tu ciclo, o pasa al siguiente paso y usaremos 28 dias por defecto.</p>
      )}
      <label className="ath-cycle-field">
        <span>Duracion media del periodo (dias de sangrado)</span>
        <input type="number" min={1} max={12} value={form.average_period_length_days} onChange={(e) => set("average_period_length_days", Number(e.target.value))} />
      </label>
      <label className="ath-cycle-field">
        <span>¿Tus ciclos son regulares?</span>
        <div className="ath-cycle-toggle-row">
          {[
            { val: true, label: "Si" },
            { val: false, label: "No" },
            { val: null, label: "No se" },
          ].map((o) => (
            <button
              key={String(o.val)}
              className={`ath-cycle-toggle ${form.cycles_are_regular === o.val ? "selected" : ""}`}
              onClick={() => set("cycles_are_regular", o.val)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </label>
      <div className="ath-cycle-nav-btns">
        <button className="ath-cycle-btn-secondary" onClick={() => setStep(1)}>Atras</button>
        <button className="ath-cycle-btn-primary" disabled={!periodDates[0]} onClick={() => setStep(3)}>Siguiente</button>
      </div>
    </div>,

    // Step 3: Contraception
    <div key="contra" className="ath-cycle-onboard-step">
      <h3>Anticoncepcion hormonal</h3>
      <label className="ath-cycle-field">
        <span>¿Usas anticoncepcion hormonal?</span>
        <div className="ath-cycle-toggle-row">
          <button className={`ath-cycle-toggle ${form.uses_hormonal_contraception ? "selected" : ""}`} onClick={() => set("uses_hormonal_contraception", true)}>Si</button>
          <button className={`ath-cycle-toggle ${!form.uses_hormonal_contraception ? "selected" : ""}`} onClick={() => set("uses_hormonal_contraception", false)}>No</button>
        </div>
      </label>
      {form.uses_hormonal_contraception && (
        <label className="ath-cycle-field">
          <span>Tipo</span>
          <select value={form.contraception_type} onChange={(e) => set("contraception_type", e.target.value)}>
            <option value="none">Selecciona...</option>
            <option value="pill">Pildora</option>
            <option value="iud_hormonal">DIU hormonal</option>
            <option value="iud_copper">DIU de cobre</option>
            <option value="implant">Implante</option>
            <option value="patch">Parche</option>
            <option value="ring">Anillo</option>
            <option value="injection">Inyeccion</option>
          </select>
        </label>
      )}
      <div className="ath-cycle-nav-btns">
        <button className="ath-cycle-btn-secondary" onClick={() => setStep(2)}>Atras</button>
        <button className="ath-cycle-btn-primary" onClick={goToStep4}>Siguiente</button>
      </div>
    </div>,

    // Step 4: Confirmation
    <div key="confirm" className="ath-cycle-onboard-step">
      <h3>Todo listo</h3>
      <div className="ath-cycle-summary">
        <div className="ath-cycle-summary-row">
          <span>Ultima regla</span>
          <strong>{form.last_period_start_date ? new Date(form.last_period_start_date + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—"}</strong>
        </div>
        <div className="ath-cycle-summary-row">
          <span>Duracion del ciclo</span>
          <strong>{form.average_cycle_length_days} dias {autoLength ? "(calculado)" : "(por defecto)"}</strong>
        </div>
        <div className="ath-cycle-summary-row">
          <span>Periodo</span>
          <strong>{form.average_period_length_days} dias</strong>
        </div>
      </div>
      <p className="ath-cycle-onboard-note">Se ira ajustando automaticamente conforme registres mas ciclos.</p>
      <div className="ath-cycle-nav-btns">
        <button className="ath-cycle-btn-secondary" onClick={() => setStep(3)}>Atras</button>
        <button className="ath-cycle-btn-primary" disabled={!form.last_period_start_date} onClick={() => onComplete(form)}>Finalizar</button>
      </div>
    </div>,
  ];

  return <div className="ath-cycle-onboarding">{steps[step]}</div>;
}

/* ── Cycle Calendar ──────────────────────────────────────────── */

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type CalendarDayInfo = {
  date: Date;
  day: number;
  isToday: boolean;
  phase: "period" | "follicular" | "ovulation" | "luteal" | "predicted" | null;
};

function buildCalendarMonth(year: number, month: number, cycles: Array<{ cycle_start_date: string; period_length_days?: number | null; cycle_length_days?: number | null }>, avgCycle: number, avgPeriod: number): CalendarDayInfo[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-based: 0=Mon, 6=Sun
  const startPad = (firstDay.getDay() + 6) % 7;

  // Build a set of period dates and predicted dates from cycles
  const periodDates = new Set<string>();
  const predictedDates = new Set<string>();
  const ovulationDates = new Set<string>();
  const follicularDates = new Set<string>();
  const lutealDates = new Set<string>();

  for (const c of cycles) {
    const start = new Date(c.cycle_start_date + "T00:00:00");
    const pLen = c.period_length_days ?? avgPeriod;
    const cLen = c.cycle_length_days ?? avgCycle;
    // Period days
    for (let d = 0; d < pLen; d++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + d);
      periodDates.add(dt.toISOString().slice(0, 10));
    }
    // Follicular phase: after period to ovulation
    const ovDay = Math.round(cLen * 0.48); // ~day 14 of 28
    for (let d = pLen; d < ovDay - 1; d++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + d);
      follicularDates.add(dt.toISOString().slice(0, 10));
    }
    // Ovulation: ~2 days
    for (let d = ovDay - 1; d <= ovDay + 1; d++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + d);
      ovulationDates.add(dt.toISOString().slice(0, 10));
    }
    // Luteal: after ovulation to end of cycle
    for (let d = ovDay + 2; d < cLen; d++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + d);
      lutealDates.add(dt.toISOString().slice(0, 10));
    }
  }

  // Predict next period from most recent cycle
  if (cycles.length > 0) {
    const sorted = [...cycles].sort((a, b) => a.cycle_start_date > b.cycle_start_date ? -1 : 1);
    const last = sorted[0];
    const lastStart = new Date(last.cycle_start_date + "T00:00:00");
    const cLen = last.cycle_length_days ?? avgCycle;
    const nextStart = new Date(lastStart);
    nextStart.setDate(nextStart.getDate() + cLen);
    // Only if next start is in future or current month
    for (let d = 0; d < avgPeriod; d++) {
      const dt = new Date(nextStart);
      dt.setDate(dt.getDate() + d);
      const key = dt.toISOString().slice(0, 10);
      if (!periodDates.has(key)) predictedDates.add(key);
    }
  }

  const days: CalendarDayInfo[] = [];
  // Pad
  for (let i = 0; i < startPad; i++) {
    days.push({ date: new Date(year, month, 0), day: 0, isToday: false, phase: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const key = dt.toISOString().slice(0, 10);
    let phase: CalendarDayInfo["phase"] = null;
    if (periodDates.has(key)) phase = "period";
    else if (ovulationDates.has(key)) phase = "ovulation";
    else if (follicularDates.has(key)) phase = "follicular";
    else if (lutealDates.has(key)) phase = "luteal";
    else if (predictedDates.has(key)) phase = "predicted";
    days.push({ date: dt, day: d, isToday: dt.getTime() === today.getTime(), phase });
  }
  return days;
}

function CycleCalendar({ cycles, avgCycle, avgPeriod }: { cycles: Array<{ cycle_start_date: string; period_length_days?: number | null; cycle_length_days?: number | null }>; avgCycle: number; avgPeriod: number }) {
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const days = useMemo(
    () => buildCalendarMonth(viewYear, viewMonth, cycles, avgCycle, avgPeriod),
    [viewYear, viewMonth, cycles, avgCycle, avgPeriod],
  );

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <div className="ath-cycle-calendar-card">
      <h3>Calendario</h3>
      <div className="ath-cycle-cal-nav">
        <button type="button" onClick={prevMonth}>←</button>
        <span>{MONTH_LABELS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth}>→</button>
      </div>
      <div className="ath-cycle-cal-weekdays">
        {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="ath-cycle-cal-grid">
        {days.map((d, i) => (
          <div
            key={i}
            className={[
              "ath-cycle-cal-day",
              d.day === 0 && "ath-cycle-cal-day--empty",
              d.isToday && "ath-cycle-cal-day--today",
              d.phase === "period" && "ath-cycle-cal-day--period",
              d.phase === "ovulation" && "ath-cycle-cal-day--ovulation",
              d.phase === "follicular" && "ath-cycle-cal-day--follicular",
              d.phase === "luteal" && "ath-cycle-cal-day--luteal",
              d.phase === "predicted" && "ath-cycle-cal-day--predicted",
            ].filter(Boolean).join(" ")}
          >
            {d.day > 0 ? d.day : ""}
          </div>
        ))}
      </div>
      <div className="ath-cycle-cal-legend">
        <div className="ath-cycle-cal-legend-item"><div className="ath-cycle-cal-legend-dot" style={{ background: "#fecaca" }} />Periodo</div>
        <div className="ath-cycle-cal-legend-item"><div className="ath-cycle-cal-legend-dot" style={{ background: "#d1fae5" }} />Folicular</div>
        <div className="ath-cycle-cal-legend-item"><div className="ath-cycle-cal-legend-dot" style={{ background: "#e9d5ff" }} />Ovulacion</div>
        <div className="ath-cycle-cal-legend-item"><div className="ath-cycle-cal-legend-dot" style={{ background: "#fef3c7" }} />Lutea</div>
        <div className="ath-cycle-cal-legend-item"><div className="ath-cycle-cal-legend-dot" style={{ border: "1.5px dashed #fca5a5", background: "transparent" }} />Previsto</div>
      </div>
    </div>
  );
}

/* ── Phase ring ────────────────────────────────────────────── */

function PhaseRing({ phase }: { phase: CyclePhase }) {
  const pct = phase.day_of_cycle / phase.cycle_day_total;
  const color = PHASE_COLORS[phase.phase] ?? "#888";
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div className="ath-cycle-ring-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--ath-border)" strokeWidth="8" />
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="ath-cycle-ring-inner">
        <span className="ath-cycle-ring-icon">{PHASE_ICONS[phase.phase] ?? "🔵"}</span>
        <span className="ath-cycle-ring-day">Día {phase.day_of_cycle}</span>
        <span className="ath-cycle-ring-total">de {phase.cycle_day_total}</span>
      </div>
    </div>
  );
}

/* ── Log period modal ──────────────────────────────────────── */

function LogPeriodForm({ onSubmit, onClose }: { onSubmit: (start: string) => void; onClose: () => void }) {
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <div className="ath-cycle-modal-backdrop" onClick={onClose}>
      <div className="ath-cycle-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Registrar periodo</h3>
        <label className="ath-cycle-field">
          <span>Fecha de inicio</span>
          <input type="date" value={startDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <div className="ath-cycle-nav-btns">
          <button className="ath-cycle-btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="ath-cycle-btn-primary" onClick={() => onSubmit(startDate)}>Registrar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Daily symptom logger ──────────────────────────────────── */

type SymptomForm = {
  flow_intensity: string;
  cramps_level: number;
  energy_level: number;
  mood: string;
  bloating: boolean;
  headache: boolean;
  breast_tenderness: boolean;
  back_pain: boolean;
  acne: boolean;
  sleep_quality: number;
  exercise_tolerance: string;
  notes: string;
};

const INITIAL_SYMPTOMS: SymptomForm = {
  flow_intensity: "none",
  cramps_level: 0,
  energy_level: 3,
  mood: "neutral",
  bloating: false,
  headache: false,
  breast_tenderness: false,
  back_pain: false,
  acne: false,
  sleep_quality: 3,
  exercise_tolerance: "normal",
  notes: "",
};

function DailyLogger({ onSubmit, onClose, existing }: { onSubmit: (data: Record<string, unknown>) => void; onClose: () => void; existing?: CycleDailyLog | null }) {
  const [form, setForm] = useState<SymptomForm>(() => {
    if (existing) {
      return {
        flow_intensity: existing.flow_intensity ?? "none",
        cramps_level: existing.cramps_level ?? 0,
        energy_level: existing.energy_level ?? 3,
        mood: existing.mood ?? "neutral",
        bloating: existing.bloating,
        headache: existing.headache,
        breast_tenderness: existing.breast_tenderness,
        back_pain: existing.back_pain,
        acne: existing.acne,
        sleep_quality: existing.sleep_quality ?? 3,
        exercise_tolerance: existing.exercise_tolerance ?? "normal",
        notes: existing.notes ?? "",
      };
    }
    return INITIAL_SYMPTOMS;
  });

  const set = (key: keyof SymptomForm, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="ath-cycle-modal-backdrop" onClick={onClose}>
      <div className="ath-cycle-modal ath-cycle-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>Registro del día</h3>

        {/* Flow */}
        <div className="ath-cycle-section">
          <span className="ath-cycle-section-label">Flujo</span>
          <div className="ath-cycle-toggle-row">
            {[
              { val: "none", label: "Nada" },
              { val: "spotting", label: "Manchado" },
              { val: "light", label: "Ligero" },
              { val: "medium", label: "Medio" },
              { val: "heavy", label: "Fuerte" },
            ].map((o) => (
              <button key={o.val} className={`ath-cycle-toggle ${form.flow_intensity === o.val ? "selected" : ""}`} onClick={() => set("flow_intensity", o.val)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cramps */}
        <div className="ath-cycle-section">
          <span className="ath-cycle-section-label">Calambres</span>
          <div className="ath-cycle-toggle-row">
            {[{ val: 0, label: "Nada" }, { val: 1, label: "Leve" }, { val: 2, label: "Moderado" }, { val: 3, label: "Fuerte" }].map((o) => (
              <button key={o.val} className={`ath-cycle-toggle ${form.cramps_level === o.val ? "selected" : ""}`} onClick={() => set("cramps_level", o.val)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Energy */}
        <div className="ath-cycle-section">
          <span className="ath-cycle-section-label">Energía</span>
          <div className="ath-cycle-toggle-row">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} className={`ath-cycle-toggle ${form.energy_level === v ? "selected" : ""}`} onClick={() => set("energy_level", v)}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Mood */}
        <div className="ath-cycle-section">
          <span className="ath-cycle-section-label">Estado de ánimo</span>
          <div className="ath-cycle-toggle-row ath-cycle-toggle-row--wrap">
            {[
              { val: "great", label: "Genial" },
              { val: "good", label: "Bien" },
              { val: "neutral", label: "Normal" },
              { val: "low", label: "Bajo" },
              { val: "irritable", label: "Irritable" },
              { val: "anxious", label: "Ansiosa" },
              { val: "emotional", label: "Emocional" },
            ].map((o) => (
              <button key={o.val} className={`ath-cycle-toggle ${form.mood === o.val ? "selected" : ""}`} onClick={() => set("mood", o.val)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Symptoms toggles */}
        <div className="ath-cycle-section">
          <span className="ath-cycle-section-label">Síntomas</span>
          <div className="ath-cycle-toggle-row ath-cycle-toggle-row--wrap">
            {(
              [
                { key: "bloating", label: "Hinchazón" },
                { key: "headache", label: "Dolor de cabeza" },
                { key: "breast_tenderness", label: "Sensibilidad mamaria" },
                { key: "back_pain", label: "Dolor lumbar" },
                { key: "acne", label: "Acné" },
              ] as const
            ).map((s) => (
              <button key={s.key} className={`ath-cycle-toggle ${form[s.key] ? "selected" : ""}`} onClick={() => set(s.key, !form[s.key])}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sleep quality */}
        <div className="ath-cycle-section">
          <span className="ath-cycle-section-label">Calidad de sueño</span>
          <div className="ath-cycle-toggle-row">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} className={`ath-cycle-toggle ${form.sleep_quality === v ? "selected" : ""}`} onClick={() => set("sleep_quality", v)}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise tolerance */}
        <div className="ath-cycle-section">
          <span className="ath-cycle-section-label">Tolerancia al ejercicio</span>
          <div className="ath-cycle-toggle-row">
            {[
              { val: "great", label: "Genial" },
              { val: "normal", label: "Normal" },
              { val: "reduced", label: "Reducida" },
              { val: "very_low", label: "Muy baja" },
            ].map((o) => (
              <button key={o.val} className={`ath-cycle-toggle ${form.exercise_tolerance === o.val ? "selected" : ""}`} onClick={() => set("exercise_tolerance", o.val)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <label className="ath-cycle-field">
          <span>Notas</span>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Algo que quieras anotar..." />
        </label>

        <div className="ath-cycle-nav-btns">
          <button className="ath-cycle-btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="ath-cycle-btn-primary"
            onClick={() =>
              onSubmit({
                log_date: new Date().toISOString().slice(0, 10),
                ...form,
              })
            }
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */

export function CyclePage() {
  const { token, analysis } = useAthleteData();
  const athleteId = analysis?.athlete?.id;
  const [dashboard, setDashboard] = useState<CycleDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [showDailyLog, setShowDailyLog] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!athleteId || !token) return;
    try {
      const d = await api.cycleDashboard(token, athleteId);
      setDashboard(d);
    } catch {
      // 404 = no preferences yet (needs onboarding)
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [athleteId, token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleOnboardingComplete = async (data: OnboardingData) => {
    if (!athleteId || !token) return;
    setSaving(true);
    try {
      await api.cycleCreatePreferences(token, athleteId, data as unknown as Record<string, unknown>);
      await loadDashboard();
    } finally {
      setSaving(false);
    }
  };

  const handleLogPeriod = async (startDate: string) => {
    if (!athleteId || !token) return;
    setSaving(true);
    try {
      await api.cycleLogPeriod(token, athleteId, { cycle_start_date: startDate });
      setShowPeriodForm(false);
      await loadDashboard();
    } finally {
      setSaving(false);
    }
  };

  const handleDailyLog = async (data: Record<string, unknown>) => {
    if (!athleteId || !token) return;
    setSaving(true);
    try {
      await api.cycleDailyLog(token, athleteId, data);
      setShowDailyLog(false);
      await loadDashboard();
    } finally {
      setSaving(false);
    }
  };

  const todayLog = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return dashboard?.recent_daily_logs?.find((l) => l.log_date === today) ?? null;
  }, [dashboard]);

  if (loading) {
    return <div className="ath-cycle-page"><div className="ath-cycle-loading">Cargando...</div></div>;
  }

  // No preferences → show onboarding
  if (!dashboard?.preferences) {
    return (
      <div className="ath-cycle-page">
        <OnboardingWizard onComplete={handleOnboardingComplete} />
        {saving && <div className="ath-cycle-saving">Guardando...</div>}
      </div>
    );
  }

  const phase = dashboard.current_phase;

  /* Period arrival confirmation: show when today is within ±2 days of next_period_date */
  const periodConfirmWindow = useMemo(() => {
    if (!phase?.next_period_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const predicted = new Date(phase.next_period_date + "T00:00:00");
    const diffDays = Math.round((today.getTime() - predicted.getTime()) / 86400000);
    // Show from 1 day before to 3 days after predicted date
    if (diffDays >= -1 && diffDays <= 3) return { diffDays, predicted };
    return null;
  }, [phase]);

  const [periodConfirmDismissed, setPeriodConfirmDismissed] = useState(false);

  const handleConfirmPeriodArrival = async () => {
    if (!athleteId || !token) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.cycleLogPeriod(token, athleteId, { cycle_start_date: today });
      setPeriodConfirmDismissed(true);
      await loadDashboard();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ath-cycle-page">
      <header className="ath-cycle-header">
        <h1>Ciclo menstrual</h1>
        <div className="ath-cycle-header-actions">
          <button className="ath-cycle-btn-primary" onClick={() => setShowPeriodForm(true)}>
            Registrar periodo
          </button>
          <button className="ath-cycle-btn-secondary" onClick={() => setShowDailyLog(true)}>
            {todayLog ? "Editar hoy" : "Registro diario"}
          </button>
        </div>
      </header>

      {/* Period arrival confirmation banner */}
      {periodConfirmWindow && !periodConfirmDismissed && (
        <div className="ath-cycle-confirm-banner">
          <div className="ath-cycle-confirm-icon">🩸</div>
          <div className="ath-cycle-confirm-text">
            <strong>
              {periodConfirmWindow.diffDays < 0
                ? "Tu periodo deberia llegar manana"
                : periodConfirmWindow.diffDays === 0
                  ? "Hoy es el dia previsto de tu periodo"
                  : `Tu periodo estaba previsto hace ${periodConfirmWindow.diffDays} dia${periodConfirmWindow.diffDays > 1 ? "s" : ""}`}
            </strong>
            <span>¿Te ha bajado?</span>
          </div>
          <div className="ath-cycle-confirm-actions">
            <button className="ath-cycle-btn-primary" onClick={handleConfirmPeriodArrival}>Si, hoy</button>
            <button className="ath-cycle-btn-secondary" onClick={() => setPeriodConfirmDismissed(true)}>Todavia no</button>
          </div>
        </div>
      )}

      {/* Phase ring + info */}
      {phase && (
        <div className="ath-cycle-phase-card">
          <PhaseRing phase={phase} />
          <div className="ath-cycle-phase-info">
            <h2 style={{ color: PHASE_COLORS[phase.phase] }}>{phase.phase_label}</h2>
            {phase.next_period_date && (
              <p className="ath-cycle-next">
                Próximo periodo: <strong>{new Date(phase.next_period_date).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</strong>
              </p>
            )}
            <div className="ath-cycle-confidence">
              Confianza: {Math.round(phase.confidence * 100)}%
              <div className="ath-cycle-confidence-bar">
                <div className="ath-cycle-confidence-fill" style={{ width: `${phase.confidence * 100}%`, background: PHASE_COLORS[phase.phase] }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Training tips */}
      {phase && phase.training_tips.length > 0 && (
        <div className="ath-cycle-tips-card">
          <h3>Recomendaciones de entrenamiento</h3>
          <ul>
            {phase.training_tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Calendar */}
      <CycleCalendar
        cycles={dashboard.recent_cycles}
        avgCycle={dashboard.preferences.average_cycle_length_days ?? 28}
        avgPeriod={dashboard.preferences.average_period_length_days ?? 5}
      />

      {/* Recent cycles */}
      {dashboard.recent_cycles.length > 0 && (
        <div className="ath-cycle-history-card">
          <h3>Historial de ciclos</h3>
          <div className="ath-cycle-history-list">
            {dashboard.recent_cycles.map((c) => (
              <div key={c.id} className="ath-cycle-history-row">
                <span className="ath-cycle-history-date">
                  {new Date(c.cycle_start_date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span className="ath-cycle-history-length">
                  {c.cycle_length_days ? `${c.cycle_length_days}d ciclo` : "En curso"}
                </span>
                <span className="ath-cycle-history-period">
                  {c.period_length_days ? `${c.period_length_days}d periodo` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showPeriodForm && <LogPeriodForm onSubmit={handleLogPeriod} onClose={() => setShowPeriodForm(false)} />}
      {showDailyLog && <DailyLogger onSubmit={handleDailyLog} onClose={() => setShowDailyLog(false)} existing={todayLog} />}
      {saving && <div className="ath-cycle-saving">Guardando...</div>}
    </div>
  );
}

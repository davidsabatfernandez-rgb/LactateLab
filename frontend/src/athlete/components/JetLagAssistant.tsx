import React, { useState, useMemo } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FormData = {
  originTz: number;
  destTz: number;
  travelDate: string;
  sleepTime: string;
  wakeTime: string;
};

type DayPlan = {
  day: number;
  label: string;
  lightExposure: string;
  lightAvoidance: string;
  mealShift: string;
  sleepShift: string;
  training: string;
  melatonin: string | null;
};

const TZ_OPTIONS: { value: number; label: string }[] = [];
for (let i = -12; i <= 12; i++) {
  const sign = i >= 0 ? "+" : "";
  TZ_OPTIONS.push({ value: i, label: `UTC${sign}${i}` });
}

function shiftTime(time: string, shiftMinutes: number): string {
  const [h, m] = time.split(":").map(Number);
  let totalMin = h * 60 + m + shiftMinutes;
  if (totalMin < 0) totalMin += 1440;
  if (totalMin >= 1440) totalMin -= 1440;
  const hh = Math.floor(totalMin / 60)
    .toString()
    .padStart(2, "0");
  const mm = (totalMin % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function generatePlan(form: FormData): DayPlan[] {
  const hoursDiff = form.destTz - form.originTz;
  const absDiff = Math.abs(hoursDiff);
  const totalDays = Math.ceil(absDiff * 0.7);
  const isEastbound = hoursDiff > 0;
  const shiftPerDay = 30; // minutes

  if (totalDays === 0) return [];

  const plans: DayPlan[] = [];

  // Pre-travel days
  const preTravelDays = Math.min(Math.ceil(totalDays / 2), 3);
  for (let d = preTravelDays; d >= 1; d--) {
    const dayIndex = preTravelDays - d;
    const cumulativeShift = (dayIndex + 1) * shiftPerDay * (isEastbound ? -1 : 1);

    plans.push({
      day: -d,
      label: d === 1 ? "1 dia antes" : `${d} dias antes`,
      lightExposure: isEastbound
        ? `Exponerse a luz brillante por la manana (${shiftTime(form.wakeTime, cumulativeShift)} - ${shiftTime(form.wakeTime, cumulativeShift + 60)})`
        : `Exponerse a luz brillante por la tarde (${shiftTime("18:00", cumulativeShift)} - ${shiftTime("19:00", cumulativeShift)})`,
      lightAvoidance: isEastbound
        ? "Evitar pantallas 2h antes de dormir"
        : "Evitar luz intensa por la manana temprano",
      mealShift: `Desayuno ${Math.abs(cumulativeShift)}min ${isEastbound ? "antes" : "despues"} de lo habitual`,
      sleepShift: `Dormir a las ${shiftTime(form.sleepTime, cumulativeShift)}`,
      training: d === 1
        ? "Reducir intensidad al 60-70%. Sesion corta de activacion."
        : "Entrenamiento normal, evitar sesiones muy intensas por la noche",
      melatonin: isEastbound
        ? `Tomar 0.5mg melatonina a las ${shiftTime(form.sleepTime, cumulativeShift - 30)}`
        : null,
    });
  }

  // Travel day
  plans.push({
    day: 0,
    label: "Dia de viaje",
    lightExposure: "Mantenerse despierto durante horas de luz del destino",
    lightAvoidance: "Usar gafas de sol si llega de noche al destino",
    mealShift: "Comer segun horario del destino desde el embarque",
    sleepShift: `Intentar dormir a las ${shiftTime(form.sleepTime, 0)} hora destino`,
    training: "Caminar 20-30min al llegar. No entrenar intenso.",
    melatonin: isEastbound
      ? `Tomar 0.5mg melatonina a las ${shiftTime(form.sleepTime, -30)} hora destino`
      : null,
  });

  // Post-travel days
  const postDays = totalDays - preTravelDays;
  for (let d = 1; d <= postDays; d++) {
    const remainingShift = Math.max(0, absDiff * 60 - (preTravelDays + d) * shiftPerDay);
    const remainingHours = Math.round(remainingShift / 60 * 10) / 10;

    plans.push({
      day: d,
      label: d === 1 ? "1 dia despues" : `${d} dias despues`,
      lightExposure: isEastbound
        ? `Luz brillante por la manana (${shiftTime(form.wakeTime, 0)} - ${shiftTime(form.wakeTime, 60)} hora local)`
        : `Luz brillante por la tarde (17:00 - 19:00 hora local)`,
      lightAvoidance: isEastbound
        ? "Evitar luz intensa por la tarde-noche"
        : "Evitar luz intensa temprano por la manana",
      mealShift: remainingHours > 0
        ? `Ajuste restante: ~${remainingHours}h. Comer en horarios locales.`
        : "Horarios completamente adaptados al destino",
      sleepShift: `Dormir a las ${form.sleepTime} hora local`,
      training: d === 1
        ? "Sesion suave: 30-40min Z1-Z2. Priorizar movilidad."
        : d <= 2
        ? "Intensidad moderada. Evitar sesiones clave."
        : "Vuelta progresiva a entrenamiento normal.",
      melatonin: isEastbound && d <= 3
        ? `Tomar 0.5mg melatonina a las ${shiftTime(form.sleepTime, -30)} hora local`
        : null,
    });
  }

  return plans;
}

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const ForkKnifeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3" />
    <line x1="21" y1="15" x2="21" y2="22" />
  </svg>
);

const RunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="5.5" r="1.5" />
    <path d="M6 20l3-7 2 2 4-4 2 7" />
    <path d="M9 13l-3-3 4-2" />
  </svg>
);

const PillIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.5 1.5L3.5 8.5a5.66 5.66 0 008 8l7-7a5.66 5.66 0 00-8-8z" />
    <line x1="7" y1="11" x2="13" y2="5" />
  </svg>
);

export default function JetLagAssistant({ open, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormData>({
    originTz: 1,
    destTz: -5,
    travelDate: new Date().toISOString().slice(0, 10),
    sleepTime: "23:00",
    wakeTime: "07:00",
  });

  const hoursDiff = form.destTz - form.originTz;
  const absDiff = Math.abs(hoursDiff);
  const totalAdaptationDays = Math.ceil(absDiff * 0.7);
  const isEastbound = hoursDiff > 0;
  const direction = isEastbound ? "Este" : "Oeste";

  const plan = useMemo(() => (step === 2 ? generatePlan(form) : []), [step, form]);

  if (!open) return null;

  const handleGenerate = () => {
    if (form.originTz === form.destTz) return;
    setStep(2);
  };

  const handleBack = () => setStep(1);

  return (
    <div className="ath-jetlag-overlay" onClick={onClose}>
      <div className="ath-jetlag-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ath-jetlag-header">
          <div className="ath-jetlag-header-left">
            {step === 2 && (
              <button className="ath-jetlag-back" onClick={handleBack}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <h2>Jet Lag Assistant</h2>
          </div>
          <button className="ath-jetlag-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ath-jetlag-body">
          {step === 1 && (
            <div className="ath-jetlag-form">
              <p className="ath-jetlag-subtitle">
                Configura tu viaje para generar un plan de adaptacion personalizado.
              </p>

              <div className="ath-jetlag-field">
                <label>Zona horaria de origen</label>
                <select
                  value={form.originTz}
                  onChange={(e) => setForm({ ...form, originTz: Number(e.target.value) })}
                >
                  {TZ_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ath-jetlag-field">
                <label>Zona horaria de destino</label>
                <select
                  value={form.destTz}
                  onChange={(e) => setForm({ ...form, destTz: Number(e.target.value) })}
                >
                  {TZ_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ath-jetlag-field">
                <label>Fecha de viaje</label>
                <input
                  type="date"
                  value={form.travelDate}
                  onChange={(e) => setForm({ ...form, travelDate: e.target.value })}
                />
              </div>

              <div className="ath-jetlag-row">
                <div className="ath-jetlag-field">
                  <label>Hora habitual de dormir</label>
                  <input
                    type="time"
                    value={form.sleepTime}
                    onChange={(e) => setForm({ ...form, sleepTime: e.target.value })}
                  />
                </div>
                <div className="ath-jetlag-field">
                  <label>Hora habitual de despertar</label>
                  <input
                    type="time"
                    value={form.wakeTime}
                    onChange={(e) => setForm({ ...form, wakeTime: e.target.value })}
                  />
                </div>
              </div>

              {form.originTz !== form.destTz && (
                <div className="ath-jetlag-preview">
                  <div className="ath-jetlag-preview-stat">
                    <span className="ath-jetlag-preview-label">Diferencia</span>
                    <span className="ath-jetlag-preview-value">{absDiff}h</span>
                  </div>
                  <div className="ath-jetlag-preview-stat">
                    <span className="ath-jetlag-preview-label">Direccion</span>
                    <span className="ath-jetlag-preview-value">{direction}</span>
                  </div>
                  <div className="ath-jetlag-preview-stat">
                    <span className="ath-jetlag-preview-label">Dias adaptacion</span>
                    <span className="ath-jetlag-preview-value">{totalAdaptationDays}</span>
                  </div>
                </div>
              )}

              <button
                className="ath-jetlag-generate"
                onClick={handleGenerate}
                disabled={form.originTz === form.destTz}
              >
                Generar plan de adaptacion
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="ath-jetlag-results">
              {/* Summary banner */}
              <div className="ath-jetlag-summary">
                <div className="ath-jetlag-summary-row">
                  <div className="ath-jetlag-summary-item">
                    <span className="ath-jetlag-summary-label">Diferencia horaria</span>
                    <span className="ath-jetlag-summary-value">{absDiff}h hacia el {direction}</span>
                  </div>
                  <div className="ath-jetlag-summary-item">
                    <span className="ath-jetlag-summary-label">Adaptacion total</span>
                    <span className="ath-jetlag-summary-value">{totalAdaptationDays} dias</span>
                  </div>
                  <div className="ath-jetlag-summary-item">
                    <span className="ath-jetlag-summary-label">Ajuste diario</span>
                    <span className="ath-jetlag-summary-value">~30 min/dia</span>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="ath-jetlag-timeline">
                {plan.map((dayPlan, idx) => (
                  <div
                    key={idx}
                    className={`ath-jetlag-day ${dayPlan.day === 0 ? "travel" : dayPlan.day < 0 ? "pre" : "post"}`}
                  >
                    <div className="ath-jetlag-day-marker">
                      <div className="ath-jetlag-day-dot" />
                      {idx < plan.length - 1 && <div className="ath-jetlag-day-line" />}
                    </div>
                    <div className="ath-jetlag-day-content">
                      <div className="ath-jetlag-day-header">
                        <span className="ath-jetlag-day-label">{dayPlan.label}</span>
                        {dayPlan.day === 0 && (
                          <span className="ath-jetlag-day-badge">Viaje</span>
                        )}
                      </div>

                      <div className="ath-jetlag-day-cards">
                        <div className="ath-jetlag-card">
                          <div className="ath-jetlag-card-icon sun">
                            <SunIcon />
                          </div>
                          <div>
                            <span className="ath-jetlag-card-title">Exposicion a luz</span>
                            <p>{dayPlan.lightExposure}</p>
                          </div>
                        </div>

                        <div className="ath-jetlag-card">
                          <div className="ath-jetlag-card-icon moon">
                            <MoonIcon />
                          </div>
                          <div>
                            <span className="ath-jetlag-card-title">Evitar luz</span>
                            <p>{dayPlan.lightAvoidance}</p>
                          </div>
                        </div>

                        <div className="ath-jetlag-card">
                          <div className="ath-jetlag-card-icon food">
                            <ForkKnifeIcon />
                          </div>
                          <div>
                            <span className="ath-jetlag-card-title">Comidas</span>
                            <p>{dayPlan.mealShift}</p>
                          </div>
                        </div>

                        <div className="ath-jetlag-card">
                          <div className="ath-jetlag-card-icon sleep">
                            <MoonIcon />
                          </div>
                          <div>
                            <span className="ath-jetlag-card-title">Sueno</span>
                            <p>{dayPlan.sleepShift}</p>
                          </div>
                        </div>

                        <div className="ath-jetlag-card">
                          <div className="ath-jetlag-card-icon run">
                            <RunIcon />
                          </div>
                          <div>
                            <span className="ath-jetlag-card-title">Entrenamiento</span>
                            <p>{dayPlan.training}</p>
                          </div>
                        </div>

                        {dayPlan.melatonin && (
                          <div className="ath-jetlag-card">
                            <div className="ath-jetlag-card-icon pill">
                              <PillIcon />
                            </div>
                            <div>
                              <span className="ath-jetlag-card-title">Melatonina</span>
                              <p>{dayPlan.melatonin}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalAdaptationDays === 0 && (
                <div className="ath-jetlag-no-diff">
                  <p>Las zonas horarias son iguales. No se requiere adaptacion.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

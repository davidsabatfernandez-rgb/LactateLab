import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { MicroContent } from "./MicroContent";

type Step = {
  label: string;
  durationMin?: number;
};

type StepValue = {
  step: string;
  lactate: number | null;
};

type LactateStepInputProps = {
  steps: Step[];
  onSubmit: (values: StepValue[]) => void;
};

function interpretFeedback(values: StepValue[]): string | null {
  const filled = values.filter((v) => v.lactate !== null) as Array<{
    step: string;
    lactate: number;
  }>;

  if (filled.length < 2) return null;

  const last = filled[filled.length - 1].lactate;
  const first = filled[0].lactate;
  const maxLac = Math.max(...filled.map((v) => v.lactate));

  if (maxLac < 2.0) {
    return "Todos los valores están en zona aeróbica baja. Intensidad muy cómoda.";
  }
  if (last > 4.0 && first < 2.0) {
    return "Buena progresión: se ve la transición de zona aeróbica a zona de alta intensidad.";
  }
  if (last - first < 0.5) {
    return "Valores muy estables — la intensidad se mantuvo constante durante la sesión.";
  }
  if (last > first) {
    return "Tendencia ascendente: la fatiga metabólica fue acumulándose con cada paso.";
  }
  return "Valores registrados correctamente.";
}

export function LactateStepInput({ steps, onSubmit }: LactateStepInputProps) {
  const [values, setValues] = useState<(string)[]>(
    () => steps.map(() => "")
  );
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = useCallback(
    (index: number, raw: string) => {
      // Allow empty, digits, and one decimal point
      if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
      setValues((prev) => {
        const next = [...prev];
        next[index] = raw;
        return next;
      });
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === "Enter" || e.key === "Tab") {
        if (index < steps.length - 1 && !e.shiftKey) {
          e.preventDefault();
          inputRefs.current[index + 1]?.focus();
        }
      }
    },
    [steps.length]
  );

  const handleSubmit = useCallback(() => {
    const result: StepValue[] = steps.map((s, i) => ({
      step: s.label,
      lactate: values[i] !== "" ? parseFloat(values[i]) : null,
    }));
    const msg = interpretFeedback(result);
    setFeedback(msg);
    setSubmitted(true);
    onSubmit(result);
  }, [steps, values, onSubmit]);

  const handleReset = useCallback(() => {
    setValues(steps.map(() => ""));
    setSubmitted(false);
    setFeedback(null);
  }, [steps]);

  const hasAnyValue = values.some((v) => v !== "");

  return (
    <div className="ath-lactate-input-wrap">
      <div className="ath-lactate-input-header">
        <span className="ath-lactate-input-title">Registro de lactato</span>
        <span className="ath-lactate-input-unit">mmol/L</span>
      </div>

      <div className="ath-lactate-input-grid">
        {steps.map((step, i) => (
          <div key={i} className="ath-lactate-input-row">
            <div className="ath-lactate-input-label">
              <span className="ath-lactate-input-step">{step.label}</span>
              {step.durationMin != null && (
                <span className="ath-lactate-input-dur">
                  {step.durationMin}′
                </span>
              )}
            </div>
            <input
              ref={(el) => { inputRefs.current[i] = el; }}
              className="ath-lactate-input-field"
              type="text"
              inputMode="decimal"
              placeholder="—"
              value={values[i]}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              disabled={submitted}
              autoComplete="off"
            />
          </div>
        ))}
      </div>

      {!submitted && (
        <button
          className="ath-lactate-input-submit"
          onClick={handleSubmit}
          disabled={!hasAnyValue}
          type="button"
        >
          Guardar valores
        </button>
      )}

      {submitted && feedback && (
        <div className="ath-lactate-input-feedback">
          <p>{feedback}</p>
          <button
            className="ath-lactate-input-reset"
            onClick={handleReset}
            type="button"
          >
            Editar valores
          </button>
        </div>
      )}

      <MicroContent title="¿Qué significan estos valores?">
        <p>
          El lactato en sangre indica cómo responde tu cuerpo a la intensidad
          del ejercicio. Valores bajos ({"<"}2 mmol/L) indican zona aeróbica
          cómoda. Entre 2-4 mmol/L estás en zona de transición. Por encima de
          4 mmol/L, la intensidad es alta y la fatiga se acumula rápidamente.
        </p>
        <p>
          Tu entrenador usa estos datos para ajustar las zonas de
          entrenamiento y asegurarse de que cada sesión tiene el efecto
          deseado.
        </p>
      </MicroContent>
    </div>
  );
}

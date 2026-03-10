import { FormEvent, useMemo, useState } from "react";

type LoginMode = "coach" | "athlete";

type LoginFormProps = {
  onLogin: (email: string, password: string, mode: LoginMode) => Promise<void>;
};

const MODE_COPY: Record<
  LoginMode,
  {
    title: string;
    description: string;
    defaultEmail: string;
    defaultPassword: string;
    submitLabel: string;
  }
> = {
  coach: {
    title: "Acceso entrenador",
    description: "Control completo del laboratorio, planificación y revisión fisiológica.",
    defaultEmail: "coach@lactatelab.dev",
    defaultPassword: "demo1234",
    submitLabel: "Entrar como entrenador",
  },
  athlete: {
    title: "Acceso atleta",
    description: "Portal personal con información filtrada, objetivos y referencias clave.",
    defaultEmail: "athlete@lactatelab.dev",
    defaultPassword: "demo1234",
    submitLabel: "Entrar como atleta",
  },
};

export function LoginForm({ onLogin }: LoginFormProps) {
  const [mode, setMode] = useState<LoginMode | null>(null);
  const copy = useMemo(() => (mode ? MODE_COPY[mode] : null), [mode]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    const nextCopy = MODE_COPY[nextMode];
    setEmail(nextCopy.defaultEmail);
    setPassword(nextCopy.defaultPassword);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!mode) {
      setError('Elige "Entrenador" o "Atleta" para continuar.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onLogin(email, password, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-panel login-choice-panel login-choice-panel-single">
        <section className="hero-copy">
          <span className="eyebrow">Professional endurance analytics</span>
          <h1>Contexto primero, lactato después.</h1>
          <p>Elige cómo quieres entrenar. Puedes iniciar sesión como entrenador o atleta.</p>
          <div className="mode-selector">
            <button
              type="button"
              className={`mode-button ${mode === "coach" ? "active" : ""}`}
              onClick={() => switchMode("coach")}
            >
              Entrenador
            </button>
            <button
              type="button"
              className={`mode-button ${mode === "athlete" ? "active" : ""}`}
              onClick={() => switchMode("athlete")}
            >
              Atleta
            </button>
          </div>
        </section>
      </div>

      {copy ? (
        <div className="login-modal-backdrop" onClick={() => setMode(null)}>
          <form
            className="card login-card compact-login-card login-modal"
            onSubmit={handleSubmit}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="access-card-head">
              <h2>{copy.title}</h2>
              <p>{copy.description}</p>
            </div>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Contraseña
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <div className="login-modal-actions">
              <button type="button" className="ghost-button" onClick={() => setMode(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? "Accediendo..." : copy.submitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

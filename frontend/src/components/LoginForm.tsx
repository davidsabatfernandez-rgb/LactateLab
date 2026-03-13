import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
    description: "Control completo del laboratorio, planificacion y revision fisiologica.",
    defaultEmail: "coach@lactatelab.dev",
    defaultPassword: "demo1234",
    submitLabel: "Entrar como entrenador",
  },
  athlete: {
    title: "Acceso atleta",
    description: "Portal personal con informacion filtrada, objetivos y referencias clave.",
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
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen lf-screen">
      <div className="lf-panel">
        <div className="lf-eyebrow">Professional endurance analytics</div>
        <h1 className="lf-title">Contexto primero, lactato despues.</h1>
        <p className="lf-subtitle">Elige como quieres entrenar. Puedes iniciar sesion como entrenador o atleta.</p>
        <div className="lf-mode-selector">
          <button
            type="button"
            className={`lf-mode-btn ${mode === "coach" ? "active" : ""}`}
            onClick={() => switchMode("coach")}
          >
            Entrenador
          </button>
          <button
            type="button"
            className={`lf-mode-btn ${mode === "athlete" ? "active" : ""}`}
            onClick={() => switchMode("athlete")}
          >
            Atleta
          </button>
        </div>
        <div className="lf-secondary-link">
          <Link to="/virtual-ride" className="lf-secondary-btn">
            Virtual Ride
          </Link>
        </div>
      </div>

      {copy ? (
        <div className="login-modal-backdrop rd-modal-backdrop" onClick={() => setMode(null)}>
          <form
            className="card login-card lf-modal-card"
            onSubmit={handleSubmit}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Contrasena
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error ? <p className="rd-error">{error}</p> : null}
            <div className="lf-modal-actions">
              <button type="button" className="rd-btn rd-btn-ghost" onClick={() => setMode(null)}>
                Cancelar
              </button>
              <button type="submit" className="rd-btn rd-btn-primary" disabled={loading}>
                {loading ? "Accediendo..." : copy.submitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="login-credit lf-credit">created and developed by David Sabat</div>
    </div>
  );
}

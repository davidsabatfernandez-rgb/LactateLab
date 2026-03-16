import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type LoginMode = "coach" | "athlete";
type AuthView = "select" | "login" | "register" | "forgot";

type LoginFormProps = {
  onLogin: (email: string, password: string, mode: LoginMode) => Promise<void>;
};

const MODE_COPY: Record<LoginMode, { title: string; hint: string; defaultEmail: string; defaultPassword: string }> = {
  coach: {
    title: "Acceso entrenador",
    hint: "Laboratorio, planificación y revisión fisiológica.",
    defaultEmail: "coach@lactatelab.dev",
    defaultPassword: "demo1234",
  },
  athlete: {
    title: "Acceso atleta",
    hint: "Portal personal con sesiones, objetivos y progreso.",
    defaultEmail: "athlete@lactatelab.dev",
    defaultPassword: "demo1234",
  },
};

export function LoginForm({ onLogin }: LoginFormProps) {
  const [mode, setMode] = useState<LoginMode | null>(null);
  const [authView, setAuthView] = useState<AuthView>("select");
  const copy = useMemo(() => (mode ? MODE_COPY[mode] : null), [mode]);

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Register
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  // Forgot
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  function selectMode(m: LoginMode) {
    setMode(m);
    setAuthView("login");
    setEmail(MODE_COPY[m].defaultEmail);
    setPassword(MODE_COPY[m].defaultPassword);
    setError(null);
  }

  function goBack() {
    setAuthView("select");
    setMode(null);
    setError(null);
    setRegError(null);
    setForgotError(null);
    setForgotSuccess(false);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!mode) return;
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

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setRegError(null);
    if (!regFullName.trim()) { setRegError("El nombre es obligatorio."); return; }
    if (!regEmail.trim()) { setRegError("El email es obligatorio."); return; }
    if (regPassword.length < 8) { setRegError("Mínimo 8 caracteres."); return; }
    if (regPassword !== regConfirmPassword) { setRegError("Las contraseñas no coinciden."); return; }
    setRegLoading(true);
    try {
      const result = await api.register({ email: regEmail, password: regPassword, full_name: regFullName });
      localStorage.setItem("lactate-token", result.access_token);
      window.location.href = "/planning";
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setRegLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setForgotError(null);
    if (!forgotEmail.trim()) { setForgotError("El email es obligatorio."); return; }
    if (forgotNewPassword.length < 8) { setForgotError("Mínimo 8 caracteres."); return; }
    setForgotLoading(true);
    try {
      await api.resetPassword({ email: forgotEmail, new_password: forgotNewPassword });
      setForgotSuccess(true);
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : "Error al restablecer.");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="login-screen lf-screen">
      <div className="lf-glass-panel" key={authView}>
        {/* ── Brand (always visible) ── */}
        <div className="lf-brand">
          <span className="lf-eyebrow">PeakAerobic</span>
          {authView === "select" && (
            <h1 className="lf-title">Contexto primero,<br />lactato después.</h1>
          )}
        </div>

        {/* ── View: Select mode ── */}
        {authView === "select" && (
          <div className="lf-view lf-view-select">
            <p className="lf-subtitle">Inicia sesión como entrenador o accede al portal de atleta.</p>
            <div className="lf-mode-selector">
              <button type="button" className="lf-mode-btn" onClick={() => selectMode("coach")}>
                <strong>Entrenador</strong>
                <small>Laboratorio y planificación</small>
              </button>
              <button type="button" className="lf-mode-btn" onClick={() => selectMode("athlete")}>
                <strong>Atleta</strong>
                <small>Portal personal</small>
              </button>
            </div>
            <div className="lf-bottom-links">
              <button type="button" className="lf-link-btn" onClick={() => setAuthView("register")}>
                Crear cuenta nueva
              </button>
              <Link to="/virtual-ride" className="lf-link-btn">Virtual Ride</Link>
            </div>
          </div>
        )}

        {/* ── View: Login form ── */}
        {authView === "login" && copy && (
          <form className="lf-view lf-view-form" onSubmit={handleLogin}>
            <div className="lf-form-header">
              <button type="button" className="lf-back-btn" onClick={goBack}>&larr;</button>
              <div>
                <h2>{copy.title}</h2>
                <small>{copy.hint}</small>
              </div>
            </div>
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label>
              <span>Contraseña</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="lf-error">{error}</p>}
            <button type="submit" className="lf-submit-btn" disabled={loading}>
              {loading ? "Accediendo..." : "Entrar"}
            </button>
            <div className="lf-bottom-links">
              <button type="button" className="lf-link-btn" onClick={() => { setAuthView("forgot"); setForgotError(null); setForgotSuccess(false); }}>
                ¿Olvidaste tu contraseña?
              </button>
              <button type="button" className="lf-link-btn" onClick={() => { setAuthView("register"); setRegError(null); }}>
                Crear cuenta nueva
              </button>
            </div>
          </form>
        )}

        {/* ── View: Register ── */}
        {authView === "register" && (
          <form className="lf-view lf-view-form" onSubmit={handleRegister}>
            <div className="lf-form-header">
              <button type="button" className="lf-back-btn" onClick={goBack}>&larr;</button>
              <div>
                <h2>Crear cuenta</h2>
                <small>Regístrate como entrenador para gestionar tus atletas.</small>
              </div>
            </div>
            <label>
              <span>Nombre completo</span>
              <input value={regFullName} onChange={(e) => setRegFullName(e.target.value)} placeholder="Tu nombre" autoFocus />
            </label>
            <label>
              <span>Email</span>
              <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="tu@email.com" />
            </label>
            <label>
              <span>Contraseña</span>
              <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Mín. 8 caracteres" />
            </label>
            <label>
              <span>Confirmar contraseña</span>
              <input type="password" value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)} />
            </label>
            {regError && <p className="lf-error">{regError}</p>}
            <button type="submit" className="lf-submit-btn" disabled={regLoading}>
              {regLoading ? "Creando..." : "Crear cuenta"}
            </button>
            <div className="lf-bottom-links">
              <button type="button" className="lf-link-btn" onClick={() => { setAuthView("login"); selectMode("coach"); }}>
                Ya tengo cuenta
              </button>
            </div>
          </form>
        )}

        {/* ── View: Forgot password ── */}
        {authView === "forgot" && (
          <form className="lf-view lf-view-form" onSubmit={handleForgot}>
            <div className="lf-form-header">
              <button type="button" className="lf-back-btn" onClick={goBack}>&larr;</button>
              <div>
                <h2>Restablecer contraseña</h2>
                <small>Introduce tu email y nueva contraseña.</small>
              </div>
            </div>
            {forgotSuccess ? (
              <div className="lf-success-block">
                <p>Contraseña actualizada correctamente.</p>
                <button type="button" className="lf-submit-btn" onClick={() => { setAuthView("login"); selectMode("coach"); }}>
                  Iniciar sesión
                </button>
              </div>
            ) : (
              <>
                <label>
                  <span>Email</span>
                  <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="tu@email.com" autoFocus />
                </label>
                <label>
                  <span>Nueva contraseña</span>
                  <input type="password" value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)} placeholder="Mín. 8 caracteres" />
                </label>
                {forgotError && <p className="lf-error">{forgotError}</p>}
                <button type="submit" className="lf-submit-btn" disabled={forgotLoading}>
                  {forgotLoading ? "Restableciendo..." : "Restablecer"}
                </button>
              </>
            )}
          </form>
        )}
      </div>

      <div className="lf-credit">created and developed by David Sabat</div>
    </div>
  );
}

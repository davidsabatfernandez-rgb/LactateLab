import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type LoginMode = "coach" | "athlete";
type AuthView = "select" | "login" | "register" | "forgot" | "athlete-step1" | "athlete-step2" | "athlete-step3";

type LoginFormProps = {
  onLogin: (email: string, password: string, mode: LoginMode) => Promise<void>;
  /** When set, skip mode selection and go straight to this mode's login screen */
  defaultMode?: LoginMode;
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
    defaultEmail: "",
    defaultPassword: "",
  },
};

const DISCIPLINE_OPTIONS = [
  { value: "running", label: "Running" },
  { value: "cycling", label: "Ciclismo" },
  { value: "swimming", label: "Natación" },
  { value: "triathlon", label: "Triatlón" },
];

const LEVEL_OPTIONS = [
  { value: "recreational", label: "Recreativo" },
  { value: "trained", label: "Entrenado" },
  { value: "competitive", label: "Competitivo" },
];

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  backgroundColor: "#fafafa",
  color: "#1a1a1a",
  fontSize: "0.95rem",
  outline: "none",
};

const stepIndicatorStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "#9ca3af",
  letterSpacing: "0.03em",
  marginBottom: "0.15rem",
};

export function LoginForm({ onLogin, defaultMode }: LoginFormProps) {
  const [mode, setMode] = useState<LoginMode | null>(defaultMode ?? null);
  const [authView, setAuthView] = useState<AuthView>(defaultMode ? "login" : "select");
  const copy = useMemo(() => (mode ? MODE_COPY[mode] : null), [mode]);

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Register (coach)
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

  // Athlete registration — step 1
  const [athFullName, setAthFullName] = useState("");
  const [athEmail, setAthEmail] = useState("");
  const [athPassword, setAthPassword] = useState("");
  const [athConfirmPassword, setAthConfirmPassword] = useState("");
  const [athSex, setAthSex] = useState("");
  const [athWeight, setAthWeight] = useState("");
  const [athDob, setAthDob] = useState("");

  // Athlete registration — step 2
  const [athDiscipline, setAthDiscipline] = useState("running");
  const [athLevel, setAthLevel] = useState("trained");

  // Athlete registration — step 3
  const [athGarminEmail, setAthGarminEmail] = useState("");
  const [athGarminPassword, setAthGarminPassword] = useState("");

  // Shared athlete reg state
  const [athError, setAthError] = useState<string | null>(null);
  const [athLoading, setAthLoading] = useState(false);

  function selectMode(m: LoginMode) {
    setMode(m);
    setAuthView("login");
    setEmail(MODE_COPY[m].defaultEmail);
    setPassword(MODE_COPY[m].defaultPassword);
    setError(null);
  }

  function goBack() {
    if (authView === "athlete-step2") { setAuthView("athlete-step1"); setAthError(null); return; }
    if (authView === "athlete-step3") { setAuthView("athlete-step2"); setAthError(null); return; }
    if (authView === "athlete-step1") { setAuthView("login"); selectMode("athlete"); setAthError(null); return; }
    setAuthView("select");
    setMode(null);
    setError(null);
    setRegError(null);
    setForgotError(null);
    setForgotSuccess(false);
  }

  // --- Athlete step navigation ---

  function validateStep1(): boolean {
    if (!athFullName.trim()) { setAthError("El nombre es obligatorio."); return false; }
    if (!athEmail.trim()) { setAthError("El email es obligatorio."); return false; }
    if (athPassword.length < 8) { setAthError("La contraseña debe tener mínimo 8 caracteres."); return false; }
    if (athPassword !== athConfirmPassword) { setAthError("Las contraseñas no coinciden."); return false; }
    if (!athSex) { setAthError("Selecciona tu sexo."); return false; }
    if (!athWeight || Number(athWeight) <= 0) { setAthError("Introduce tu peso."); return false; }
    return true;
  }

  function validateStep2(): boolean {
    if (!athDiscipline) { setAthError("Selecciona una disciplina."); return false; }
    return true;
  }

  function goToStep2() {
    setAthError(null);
    if (validateStep1()) setAuthView("athlete-step2");
  }

  function goToStep3() {
    setAthError(null);
    if (validateStep2()) setAuthView("athlete-step3");
  }


  async function submitAthleteRegistration(skipGarmin: boolean) {
    setAthError(null);
    setAthLoading(true);
    try {
      const payload: Parameters<typeof api.registerAthlete>[0] = {
        email: athEmail,
        password: athPassword,
        full_name: athFullName,
        sex: athSex,
        weight_kg: Number(athWeight),
        primary_discipline: athDiscipline,
        athlete_level: athLevel || undefined,
        goals: [],
      };
      if (athDob) payload.date_of_birth = athDob;
      if (!skipGarmin && athGarminEmail.trim()) {
        payload.garmin_email = athGarminEmail;
        payload.garmin_password = athGarminPassword;
      }
      const result = await api.registerAthlete(payload);
      localStorage.setItem("lactate-token", result.access_token);
      window.location.href = "/athlete";
    } catch (err) {
      setAthError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setAthLoading(false);
    }
  }

  // --- Existing handlers ---

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
        {/* -- Brand (always visible) -- */}
        <div className="lf-brand">
          <span className="lf-eyebrow">PeakAerobic</span>
          {authView === "select" && (
            <h1 className="lf-title">Contexto primero,<br />lactato después.</h1>
          )}
        </div>

        {/* -- View: Select mode -- */}
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
              <button type="button" className="lf-link-btn" onClick={() => { setAuthView("athlete-step1"); setAthError(null); }}>
                Crear cuenta de atleta
              </button>
              <button type="button" className="lf-link-btn" onClick={() => setAuthView("register")}>
                Crear cuenta de entrenador
              </button>
              <Link to="/virtual-ride" className="lf-link-btn">Virtual Ride</Link>
            </div>
          </div>
        )}

        {/* -- View: Login form -- */}
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
              {mode === "coach" && (
                <button type="button" className="lf-link-btn" onClick={() => { setAuthView("register"); setRegError(null); }}>
                  Crear cuenta de entrenador
                </button>
              )}
              {mode === "athlete" && (
                <button type="button" className="lf-link-btn" onClick={() => { setAuthView("athlete-step1"); setAthError(null); }}>
                  Crear cuenta de atleta
                </button>
              )}
            </div>
          </form>
        )}

        {/* -- View: Register (coach) -- */}
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

        {/* -- View: Forgot password -- */}
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

        {/* -- View: Athlete Step 1 — Personal info -- */}
        {authView === "athlete-step1" && (
          <div className="lf-view lf-view-form">
            <div className="lf-form-header">
              <button type="button" className="lf-back-btn" onClick={goBack}>&larr;</button>
              <div>
                <p style={stepIndicatorStyle}>Paso 1 de 3</p>
                <h2>Datos personales</h2>
                <small>Información básica para personalizar tu entrenamiento.</small>
              </div>
            </div>
            <label>
              <span>Nombre completo</span>
              <input
                value={athFullName}
                onChange={(e) => setAthFullName(e.target.value)}
                placeholder="Tu nombre completo"
                autoFocus
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={athEmail}
                onChange={(e) => setAthEmail(e.target.value)}
                placeholder="tu@email.com"
              />
            </label>
            <label>
              <span>Contraseña</span>
              <input
                type="password"
                value={athPassword}
                onChange={(e) => setAthPassword(e.target.value)}
                placeholder="Mín. 8 caracteres"
              />
            </label>
            <label>
              <span>Confirmar contraseña</span>
              <input
                type="password"
                value={athConfirmPassword}
                onChange={(e) => setAthConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
              />
            </label>
            <label>
              <span>Sexo</span>
              <select value={athSex} onChange={(e) => setAthSex(e.target.value)} style={selectStyle}>
                <option value="">Selecciona...</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
              </select>
            </label>
            <label>
              <span>Peso (kg)</span>
              <input
                type="number"
                value={athWeight}
                onChange={(e) => setAthWeight(e.target.value)}
                placeholder="70"
                min="30"
                max="200"
                step="0.1"
              />
            </label>
            <label>
              <span>Fecha de nacimiento <span style={{ color: "#9ca3af", fontWeight: 400 }}>(opcional)</span></span>
              <input
                type="date"
                value={athDob}
                onChange={(e) => setAthDob(e.target.value)}
              />
            </label>
            {athError && <p className="lf-error">{athError}</p>}
            <button type="button" className="lf-submit-btn" onClick={goToStep2}>
              Siguiente
            </button>
          </div>
        )}

        {/* -- View: Athlete Step 2 — Sport -- */}
        {authView === "athlete-step2" && (
          <div className="lf-view lf-view-form">
            <div className="lf-form-header">
              <button type="button" className="lf-back-btn" onClick={goBack}>&larr;</button>
              <div>
                <p style={stepIndicatorStyle}>Paso 2 de 3</p>
                <h2>Tu deporte</h2>
                <small>Selecciona tu disciplina y nivel actual.</small>
              </div>
            </div>
            <label>
              <span>Disciplina principal</span>
              <select value={athDiscipline} onChange={(e) => setAthDiscipline(e.target.value)} style={selectStyle}>
                {DISCIPLINE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Nivel</span>
              <select value={athLevel} onChange={(e) => setAthLevel(e.target.value)} style={selectStyle}>
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            {athError && <p className="lf-error">{athError}</p>}
            <button type="button" className="lf-submit-btn" onClick={goToStep3}>
              Siguiente
            </button>
          </div>
        )}

        {/* -- View: Athlete Step 3 — Garmin (optional) -- */}
        {authView === "athlete-step3" && (
          <div className="lf-view lf-view-form">
            <div className="lf-form-header">
              <button type="button" className="lf-back-btn" onClick={goBack}>&larr;</button>
              <div>
                <p style={stepIndicatorStyle}>Paso 3 de 3</p>
                <h2>Conecta tu Garmin</h2>
                <small>Sincroniza tus actividades automáticamente. Este paso es opcional.</small>
              </div>
            </div>
            <label>
              <span>Email Garmin</span>
              <input
                type="email"
                value={athGarminEmail}
                onChange={(e) => setAthGarminEmail(e.target.value)}
                placeholder="tu@garmin.com"
                autoFocus
              />
            </label>
            <label>
              <span>Contraseña Garmin</span>
              <input
                type="password"
                value={athGarminPassword}
                onChange={(e) => setAthGarminPassword(e.target.value)}
                placeholder="Contraseña de Garmin Connect"
              />
            </label>
            {athError && <p className="lf-error">{athError}</p>}
            <button
              type="button"
              className="lf-submit-btn"
              disabled={athLoading}
              onClick={() => submitAthleteRegistration(false)}
            >
              {athLoading ? "Creando cuenta..." : "Crear cuenta"}
            </button>
            <div className="lf-bottom-links">
              <button
                type="button"
                className="lf-link-btn"
                disabled={athLoading}
                onClick={() => submitAthleteRegistration(true)}
              >
                Saltar este paso
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="lf-credit">created and developed by David Sabat</div>
    </div>
  );
}

/**
 * NativeLogin — minimal, light login for the native app (Capacitor).
 * Athlete-first: shows login by default, with a link to register.
 */
import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { setStoredToken } from "../lib/native";
import "./native-login.css";

type NativeLoginProps = {
  onLogin: (email: string, password: string, mode: "athlete") => Promise<void>;
};

type View = "login" | "register-1" | "register-2" | "register-3" | "forgot";

const DISCIPLINES = [
  { value: "running", label: "Running" },
  { value: "cycling", label: "Ciclismo" },
  { value: "swimming", label: "Natacion" },
  { value: "triathlon", label: "Triatlon" },
];

export function NativeLogin({ onLogin }: NativeLoginProps) {
  const [view, setView] = useState<View>("login");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Register step 1
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regPass2, setRegPass2] = useState("");
  const [regSex, setRegSex] = useState("");
  const [regWeight, setRegWeight] = useState("");
  const [regDob, setRegDob] = useState("");

  // Register step 2
  const [regDiscipline, setRegDiscipline] = useState("running");
  const [regLevel, setRegLevel] = useState("trained");

  // Register step 3 (Garmin)
  const [garminEmail, setGarminEmail] = useState("");
  const [garminPass, setGarminPass] = useState("");

  // Forgot
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotPass, setForgotPass] = useState("");
  const [forgotDone, setForgotDone] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(email, password, "athlete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
    } finally {
      setLoading(false);
    }
  }

  function goRegister2() {
    setError(null);
    if (!regName.trim()) { setError("Nombre obligatorio."); return; }
    if (!regEmail.trim()) { setError("Email obligatorio."); return; }
    if (regPass.length < 8) { setError("Minimo 8 caracteres."); return; }
    if (regPass !== regPass2) { setError("Las contrasenas no coinciden."); return; }
    if (!regSex) { setError("Selecciona tu sexo."); return; }
    if (!regWeight || Number(regWeight) <= 0) { setError("Introduce tu peso."); return; }
    setView("register-2");
  }

  function goRegister3() {
    setError(null);
    if (!regDiscipline) { setError("Selecciona disciplina."); return; }
    setView("register-3");
  }

  async function submitRegister(skipGarmin: boolean) {
    setError(null);
    setLoading(true);
    try {
      const payload: Parameters<typeof api.registerAthlete>[0] = {
        email: regEmail,
        password: regPass,
        full_name: regName,
        sex: regSex,
        weight_kg: Number(regWeight),
        primary_discipline: regDiscipline,
        athlete_level: regLevel || undefined,
        goals: [],
      };
      if (regDob) payload.date_of_birth = regDob;
      if (!skipGarmin && garminEmail.trim()) {
        payload.garmin_email = garminEmail;
        payload.garmin_password = garminPass;
      }
      const result = await api.registerAthlete(payload);
      await setStoredToken(result.access_token);
      window.location.href = "/athlete";
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!forgotEmail.trim()) { setError("Email obligatorio."); return; }
    if (forgotPass.length < 8) { setError("Minimo 8 caracteres."); return; }
    setLoading(true);
    try {
      await api.resetPassword({ email: forgotEmail, new_password: forgotPass });
      setForgotDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al restablecer.");
    } finally {
      setLoading(false);
    }
  }

  const stepLabel = view === "register-1" ? "1 / 3" : view === "register-2" ? "2 / 3" : view === "register-3" ? "3 / 3" : null;

  return (
    <div className="nl-screen">
      <div className="nl-container">

        {/* Brand */}
        <div className="nl-brand">
          <div className="nl-logo-ring">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <span className="nl-app-name">PeakAerobic</span>
        </div>

        {/* ── Login ── */}
        {view === "login" && (
          <form className="nl-form" onSubmit={handleLogin}>
            <h1 className="nl-title">Bienvenido</h1>
            <p className="nl-hint">Accede a tu portal de atleta</p>

            <div className="nl-field">
              <input
                type="email"
                className="nl-input"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoCapitalize="off"
                autoComplete="email"
              />
            </div>
            <div className="nl-field">
              <input
                type="password"
                className="nl-input"
                placeholder="Contrasena"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && <p className="nl-error">{error}</p>}

            <button type="submit" className="nl-btn-primary" disabled={loading}>
              {loading ? "Accediendo..." : "Entrar"}
            </button>

            <div className="nl-links">
              <button type="button" className="nl-link" onClick={() => { setView("forgot"); setError(null); setForgotDone(false); }}>
                Olvidaste tu contrasena?
              </button>
              <button type="button" className="nl-link" onClick={() => { setView("register-1"); setError(null); }}>
                Crear cuenta
              </button>
            </div>
          </form>
        )}

        {/* ── Register Step 1 ── */}
        {view === "register-1" && (
          <div className="nl-form">
            <div className="nl-form-head">
              <button type="button" className="nl-back" onClick={() => { setView("login"); setError(null); }}>&larr;</button>
              <div>
                <span className="nl-step">{stepLabel}</span>
                <h2 className="nl-title-sm">Datos personales</h2>
              </div>
            </div>

            <div className="nl-field"><input className="nl-input" placeholder="Nombre completo" value={regName} onChange={(e) => setRegName(e.target.value)} autoFocus /></div>
            <div className="nl-field"><input className="nl-input" type="email" placeholder="Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} autoCapitalize="off" /></div>
            <div className="nl-field"><input className="nl-input" type="password" placeholder="Contrasena (min. 8)" value={regPass} onChange={(e) => setRegPass(e.target.value)} /></div>
            <div className="nl-field"><input className="nl-input" type="password" placeholder="Confirmar contrasena" value={regPass2} onChange={(e) => setRegPass2(e.target.value)} /></div>
            <div className="nl-field-row">
              <select className="nl-select" value={regSex} onChange={(e) => setRegSex(e.target.value)}>
                <option value="">Sexo</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
              </select>
              <input className="nl-input" type="number" placeholder="Peso (kg)" value={regWeight} onChange={(e) => setRegWeight(e.target.value)} min="30" max="200" step="0.1" />
            </div>
            <div className="nl-field"><input className="nl-input" type="date" placeholder="Fecha nacimiento" value={regDob} onChange={(e) => setRegDob(e.target.value)} /></div>

            {error && <p className="nl-error">{error}</p>}
            <button type="button" className="nl-btn-primary" onClick={goRegister2}>Siguiente</button>
          </div>
        )}

        {/* ── Register Step 2 ── */}
        {view === "register-2" && (
          <div className="nl-form">
            <div className="nl-form-head">
              <button type="button" className="nl-back" onClick={() => { setView("register-1"); setError(null); }}>&larr;</button>
              <div>
                <span className="nl-step">{stepLabel}</span>
                <h2 className="nl-title-sm">Tu deporte</h2>
              </div>
            </div>

            <div className="nl-discipline-grid">
              {DISCIPLINES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`nl-disc-btn ${regDiscipline === d.value ? "active" : ""}`}
                  onClick={() => setRegDiscipline(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="nl-field">
              <label className="nl-label">Nivel</label>
              <div className="nl-level-row">
                {["recreational", "trained", "competitive"].map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    className={`nl-level-btn ${regLevel === lv ? "active" : ""}`}
                    onClick={() => setRegLevel(lv)}
                  >
                    {lv === "recreational" ? "Recreativo" : lv === "trained" ? "Entrenado" : "Competitivo"}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="nl-error">{error}</p>}
            <button type="button" className="nl-btn-primary" onClick={goRegister3}>Siguiente</button>
          </div>
        )}

        {/* ── Register Step 3 (Garmin) ── */}
        {view === "register-3" && (
          <div className="nl-form">
            <div className="nl-form-head">
              <button type="button" className="nl-back" onClick={() => { setView("register-2"); setError(null); }}>&larr;</button>
              <div>
                <span className="nl-step">{stepLabel}</span>
                <h2 className="nl-title-sm">Conecta Garmin</h2>
                <p className="nl-hint" style={{ marginTop: 4 }}>Opcional — sincroniza actividades</p>
              </div>
            </div>

            <div className="nl-field"><input className="nl-input" type="email" placeholder="Email Garmin" value={garminEmail} onChange={(e) => setGarminEmail(e.target.value)} autoFocus /></div>
            <div className="nl-field"><input className="nl-input" type="password" placeholder="Contrasena Garmin" value={garminPass} onChange={(e) => setGarminPass(e.target.value)} /></div>

            {error && <p className="nl-error">{error}</p>}

            <button type="button" className="nl-btn-primary" disabled={loading} onClick={() => submitRegister(false)}>
              {loading ? "Creando..." : "Crear cuenta"}
            </button>
            <button type="button" className="nl-link" style={{ marginTop: 12 }} disabled={loading} onClick={() => submitRegister(true)}>
              Saltar este paso
            </button>
          </div>
        )}

        {/* ── Forgot password ── */}
        {view === "forgot" && (
          <form className="nl-form" onSubmit={handleForgot}>
            <div className="nl-form-head">
              <button type="button" className="nl-back" onClick={() => { setView("login"); setError(null); }}>&larr;</button>
              <h2 className="nl-title-sm">Restablecer contrasena</h2>
            </div>

            {forgotDone ? (
              <>
                <p className="nl-success">Contrasena actualizada.</p>
                <button type="button" className="nl-btn-primary" onClick={() => { setView("login"); setError(null); }}>
                  Iniciar sesion
                </button>
              </>
            ) : (
              <>
                <div className="nl-field"><input className="nl-input" type="email" placeholder="Tu email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoFocus /></div>
                <div className="nl-field"><input className="nl-input" type="password" placeholder="Nueva contrasena (min. 8)" value={forgotPass} onChange={(e) => setForgotPass(e.target.value)} /></div>
                {error && <p className="nl-error">{error}</p>}
                <button type="submit" className="nl-btn-primary" disabled={loading}>
                  {loading ? "Restableciendo..." : "Restablecer"}
                </button>
              </>
            )}
          </form>
        )}

      </div>
    </div>
  );
}

import { Link } from "react-router-dom";

const AUUKI_APP_URL = "https://auuki.com";
const AUUKI_REPO_URL = "https://github.com/dvmarinoff/Auuki";

export function VirtualRidePage() {
  return (
    <div className="login-screen virtual-ride-screen">
      <div className="login-panel login-choice-panel-single">
        <section className="hero-copy virtual-ride-hero">
          <span className="eyebrow">Virtual Ride</span>
          <h1>Rodillo virtual listo para probar.</h1>
          <p>
            Auuki funciona como experiencia independiente de ciclismo indoor. Desde aqui puedes abrir la app y
            conectar tu rodillo o sensores compatibles desde el navegador.
          </p>
          <div className="virtual-ride-actions">
            <a className="primary-button virtual-ride-launch" href={AUUKI_APP_URL} target="_blank" rel="noreferrer">
              Abrir Virtual Ride
            </a>
            <Link className="ghost-button virtual-ride-back" to="/">
              Volver al acceso
            </Link>
          </div>
        </section>

        <section className="card virtual-ride-card">
          <div className="access-card-head">
            <h2>Antes de empezar</h2>
            <p>La conexion Bluetooth suele ir mejor en escritorio con Chrome, Edge o navegadores basados en Chromium.</p>
          </div>
          <div className="virtual-ride-checklist">
            <div>
              <strong>1. Enciende el rodillo</strong>
              <p>Activa el rodillo y deja libres otras apps que puedan estar usando Bluetooth.</p>
            </div>
            <div>
              <strong>2. Usa un navegador compatible</strong>
              <p>Si no detecta sensores, prueba desde Chrome o Edge en macOS o Windows.</p>
            </div>
            <div>
              <strong>3. Lanza Auuki</strong>
              <p>La app se abre en una pestaña aparte para no mezclar esta interfaz con la sesion del laboratorio.</p>
            </div>
          </div>
          <div className="virtual-ride-links">
            <a href={AUUKI_REPO_URL} target="_blank" rel="noreferrer">
              Ver repositorio
            </a>
            <a href={AUUKI_APP_URL} target="_blank" rel="noreferrer">
              Abrir web app
            </a>
          </div>
        </section>
      </div>

      <div className="login-credit">created and developed by David Sabat</div>
    </div>
  );
}

import { Link } from "react-router-dom";

import { ImportSessionsPanel } from "../components/ImportSessionsPanel";
import { SessionSummary } from "../types";

type SessionsPageProps = {
  sessions: SessionSummary[];
  token: string;
  onRefresh: () => Promise<void>;
};

function disciplineBadgeClass(value: string) {
  if (value === "natación") return "rd-disc-swim";
  if (value === "ciclismo") return "rd-disc-bike";
  if (value === "triatlón") return "rd-disc-tri";
  return "rd-disc-run";
}

export function SessionsPage({ sessions, token, onRefresh }: SessionsPageProps) {
  return (
    <div className="rd-page">
      <div className="rd-page-header">
        <div className="rd-page-header-left">
          <h1 className="rd-page-title">Historico de sesiones</h1>
          <span className="rd-eyebrow">{sessions.length} sesiones</span>
        </div>
      </div>

      <div className="sp-import-section">
        <ImportSessionsPanel token={token} onImported={onRefresh} />
      </div>

      <div className="rd-table-wrap">
        <table className="rd-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Disciplina</th>
              <th>Objetivo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td style={{ fontWeight: 700, letterSpacing: "-0.02em" }}>
                  {new Date(session.performed_at).toLocaleDateString("es-ES")}
                </td>
                <td>{session.session_type}</td>
                <td>
                  <span className={`rd-disc-badge ${disciplineBadgeClass(session.discipline)}`}>
                    {session.discipline}
                  </span>
                </td>
                <td style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{session.goal}</td>
                <td>
                  <Link className="rd-btn rd-btn-sm" to={`/sessions/${session.id}`}>
                    Ver sesion
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

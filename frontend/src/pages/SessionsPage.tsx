import { Link } from "react-router-dom";

import { ImportSessionsPanel } from "../components/ImportSessionsPanel";
import { SessionSummary } from "../types";

type SessionsPageProps = {
  sessions: SessionSummary[];
  token: string;
  onRefresh: () => Promise<void>;
};

export function SessionsPage({ sessions, token, onRefresh }: SessionsPageProps) {
  return (
    <div className="page-grid">
      <section className="page-header">
        <span className="eyebrow">Sessions</span>
        <h1>Histórico de sesiones</h1>
      </section>
      <ImportSessionsPanel token={token} onImported={onRefresh} />
      <section className="table-card card">
        <table>
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
                <td>{new Date(session.performed_at).toLocaleDateString("es-ES")}</td>
                <td>{session.session_type}</td>
                <td>{session.discipline}</td>
                <td>{session.goal}</td>
                <td>
                  <Link className="inline-link" to={`/sessions/${session.id}`}>
                    Ver sesión
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

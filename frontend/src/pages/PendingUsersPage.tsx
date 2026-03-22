import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type PendingUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
};

export function PendingUsersPage({ token }: { token: string }) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.pendingUsers(token);
      setUsers(result);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function approve(userId: number) {
    setActionLoading(userId);
    try {
      await api.activateUser(token, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      /* ignore */
    } finally {
      setActionLoading(null);
    }
  }

  async function reject(userId: number) {
    if (!window.confirm("Rechazar y eliminar este usuario?")) return;
    setActionLoading(userId);
    try {
      await api.rejectUser(token, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      /* ignore */
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Usuarios pendientes
      </h1>
      <p style={{ color: "var(--text-secondary, #6b7280)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        Aprueba o rechaza las cuentas que se han registrado.
      </p>

      {loading && <p style={{ color: "var(--text-secondary, #9ca3af)" }}>Cargando...</p>}

      {!loading && users.length === 0 && (
        <div style={{
          background: "var(--panel, #f9fafb)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 12,
          padding: "2rem",
          textAlign: "center",
          color: "var(--text-secondary, #9ca3af)",
        }}>
          No hay usuarios pendientes de aprobacion.
        </div>
      )}

      {users.map((u) => (
        <div
          key={u.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            background: "var(--panel, #fff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 12,
            padding: "1rem 1.25rem",
            marginBottom: "0.75rem",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{u.full_name}</div>
            <div style={{ color: "var(--text-secondary, #6b7280)", fontSize: "0.85rem" }}>
              {u.email}
            </div>
            <div style={{ color: "var(--text-secondary, #9ca3af)", fontSize: "0.78rem", marginTop: 2 }}>
              {u.role === "coach" ? "Entrenador" : "Atleta"} · {formatDate(u.created_at)}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            <button
              type="button"
              className="primary-button"
              style={{ fontSize: "0.85rem", padding: "0.4rem 1rem" }}
              disabled={actionLoading === u.id}
              onClick={() => approve(u.id)}
            >
              Aprobar
            </button>
            <button
              type="button"
              className="ghost-button"
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.75rem", color: "#ef4444" }}
              disabled={actionLoading === u.id}
              onClick={() => reject(u.id)}
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

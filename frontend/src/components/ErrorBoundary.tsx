import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          padding: 40,
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          background: "#f8f6f2",
          color: "#16353d",
        }}>
          <div style={{ textAlign: "center", maxWidth: 500 }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: 12 }}>Algo salió mal</h1>
            <p style={{ color: "#5e6d72", marginBottom: 24, lineHeight: 1.6 }}>
              Ha ocurrido un error inesperado. Recarga la página para continuar.
            </p>
            <pre style={{
              background: "rgba(16,34,42,0.05)",
              padding: 16,
              borderRadius: 12,
              fontSize: "0.78rem",
              textAlign: "left",
              overflow: "auto",
              maxHeight: 200,
              marginBottom: 24,
            }}>
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 28px",
                borderRadius: 12,
                border: "none",
                background: "#d26a36",
                color: "white",
                fontWeight: 700,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

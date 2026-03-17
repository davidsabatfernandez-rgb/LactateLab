import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[PageErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", textAlign: "center", maxWidth: 500, margin: "4rem auto" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: 8 }}>Esta pagina ha tenido un error</h2>
          <p style={{ color: "#5e6d72", marginBottom: 16, lineHeight: 1.6 }}>
            Prueba a recargar. Si el error persiste, contacta con soporte.
          </p>
          {this.state.error?.message && (
            <pre style={{
              background: "rgba(16,34,42,0.05)",
              padding: 12,
              borderRadius: 8,
              fontSize: "0.75rem",
              textAlign: "left",
              overflow: "auto",
              maxHeight: 120,
              marginBottom: 16,
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 24px",
              borderRadius: 10,
              border: "none",
              background: "#d26a36",
              color: "white",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Recargar pagina
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

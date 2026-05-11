import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#fbf8f4",
            padding: 24,
            fontFamily: "system-ui, -apple-system, sans-serif"
          }}
        >
          <div
            style={{
              maxWidth: 520,
              background: "#fff",
              borderRadius: 14,
              padding: 32,
              boxShadow: "0 4px 40px -8px rgba(10,5,6,0.12)",
              border: "1px solid rgba(122,30,38,0.10)"
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#b88a56",
                marginBottom: 8
              }}
            >
              Erro de aplicação
            </p>
            <h1
              style={{
                fontSize: 22,
                color: "#7a1e26",
                marginBottom: 12,
                fontStyle: "italic",
                fontFamily: "Georgia, serif",
                fontWeight: 400
              }}
            >
              Algo deu errado
            </h1>
            <pre
              style={{
                fontSize: 12,
                color: "#444",
                background: "#f5ede0",
                padding: 12,
                borderRadius: 8,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              }}
            >
              {this.state.error.message}
            </pre>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.assign("/login");
              }}
              style={{
                marginTop: 16,
                padding: "10px 18px",
                background: "#7a1e26",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                cursor: "pointer"
              }}
            >
              Voltar para o login
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

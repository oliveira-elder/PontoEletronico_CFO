import React from "react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";

/** Evita tela branca quando uma rota autenticada lança erro de render. */
export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Erro inesperado ao carregar a página.";

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
          {message}
        </pre>
        <button
          onClick={() => {
            navigate("/ponto", { replace: true });
            window.location.reload();
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
          Recarregar
        </button>
      </div>
    </div>
  );
}

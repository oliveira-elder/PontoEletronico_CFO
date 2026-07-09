import { useState } from "react";
import { MapPinIcon, RefreshCwIcon } from "./icons";
import {
  isSafariIOS,
  primarGeolocalizacaoSafari,
  mensagemErroGpsSafari
} from "../utils/geolocation";

export interface SafariGeoAtivacaoProps {
  ativo: boolean;
  onPronto?: () => void;
}

export function SafariGeoAtivacao({ ativo, onPronto }: SafariGeoAtivacaoProps) {
  const [estado, setEstado] = useState<"idle" | "ativando" | "pronto" | "erro">("idle");
  const [instrucoes, setInstrucoes] = useState<string | null>(null);

  if (!isSafariIOS() || !ativo) return null;

  async function ativar() {
    setEstado("ativando");
    setInstrucoes(null);

    const resultado = await primarGeolocalizacaoSafari();

    if (resultado.position) {
      setEstado("pronto");
      onPronto?.();
      return;
    }

    setEstado("erro");
    setInstrucoes(mensagemErroGpsSafari(resultado.errorCode));
  }

  const bg =
    estado === "pronto"
      ? "rgba(47,125,79,0.10)"
      : estado === "erro"
        ? "rgba(200,57,63,0.08)"
        : "rgba(30,74,122,0.08)";

  const border =
    estado === "pronto"
      ? "rgba(47,125,79,0.25)"
      : estado === "erro"
        ? "rgba(200,57,63,0.25)"
        : "rgba(30,74,122,0.20)";

  return (
    <div
      style={{
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: bg,
        border: `1px solid ${border}`
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <MapPinIcon
          size={16}
          style={{
            flexShrink: 0,
            marginTop: 2,
            color: estado === "pronto" ? "var(--green)" : "var(--blue-ink)"
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-800)", marginBottom: 4 }}>
            {estado === "pronto"
              ? "Localização ativa no Safari"
              : "Safari — ative a localização antes de bater o ponto"}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-600)", lineHeight: 1.45 }}>
            {estado === "pronto"
              ? "GPS pronto. Você já pode registrar o ponto."
              : "O Safari exige permissão explícita. Toque no botão abaixo para solicitar o GPS."}
          </div>

          {estado !== "pronto" && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={ativar}
              disabled={estado === "ativando"}
              style={{
                marginTop: 8,
                fontSize: 12,
                minHeight: 36,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#fff",
                border: "1px solid rgba(30,74,122,0.25)"
              }}
            >
              {estado === "ativando" ? (
                <RefreshCwIcon size={14} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <MapPinIcon size={14} />
              )}
              {estado === "ativando" ? "Obtendo localização…" : "Ativar localização"}
            </button>
          )}

          {instrucoes && (
            <pre
              style={{
                marginTop: 10,
                marginBottom: 0,
                fontSize: 10.5,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                color: "var(--red)",
                background: "rgba(255,255,255,0.7)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(200,57,63,0.15)"
              }}
            >
              {instrucoes}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

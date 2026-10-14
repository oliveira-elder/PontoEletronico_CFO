import React, { useEffect, useState } from "react";
import { api } from "../../hooks/useApi";

export interface CotaAbono {
  cotaDias: number;
  janela: { inicio: string; fim: string };
  usados: number;
  saldo: number;
  diasEmUso: string[];
  historico: Array<{
    id: string;
    status: string;
    descricao: string;
    createdAt: string;
    dias: string[];
  }>;
}

const fmtBr = (iso: string) => iso.split("-").reverse().join("/");
const STATUS: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "Aguardando chefe", cls: "badge-amber" },
  AGUARDANDO_RH: { label: "Aguardando RH", cls: "badge-blue" },
  APROVADA: { label: "Aprovada", cls: "badge-green" },
  REJEITADA_GESTOR: { label: "Rejeitada pelo chefe", cls: "badge-red" },
  REJEITADA_RH: { label: "Rejeitada pelo RH", cls: "badge-red" },
  REJEITADA: { label: "Rejeitada", cls: "badge-red" },
  CANCELADA: { label: "Cancelada", cls: "badge-gray" }
};

/** Janela aberta (sem marcos de banco de horas configurados). */
const textoJanela = (j: { inicio: string; fim: string }) =>
  j.inicio.startsWith("0000") || j.fim.startsWith("9999")
    ? "período atual"
    : `${fmtBr(j.inicio)} a ${fmtBr(j.fim)}`;

/**
 * Saldo e histórico da cota de abono diário (acordo coletivo): N dias a cada dois ciclos
 * do banco de horas. Usado pelo funcionário (Solicitações → Abono) e pelo RH (Auditoria).
 * Não aparece se a cota está em 0 e nunca houve uso.
 */
export function CotaAbonoCard({
  url,
  token,
  recarregar = 0,
  onCarregou
}: {
  url: string;
  token?: string | null;
  /** Mude para recarregar (ex.: depois de enviar um pedido). */
  recarregar?: number;
  onCarregou?: (c: CotaAbono) => void;
}) {
  const [cota, setCota] = useState<CotaAbono | null>(null);

  useEffect(() => {
    let ativo = true;
    api
      .get<CotaAbono>(url, token ?? undefined)
      .then((c) => {
        if (!ativo) return;
        setCota(c);
        onCarregou?.(c);
      })
      .catch(() => ativo && setCota(null));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line
  }, [url, token, recarregar]);

  if (!cota || (cota.cotaDias <= 0 && cota.historico.length === 0)) return null;

  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(37,99,235,0.05)",
        border: "1px solid rgba(37,99,235,0.18)",
        borderRadius: "var(--radius-md)",
        fontSize: 12.5,
        color: "var(--ink-700)",
        lineHeight: 1.55
      }}
    >
      <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e40af" }}>
        📅 Abono diário do acordo coletivo
      </p>
      {cota.cotaDias > 0 ? (
        <p style={{ margin: "0 0 6px" }}>
          Cota: <strong>{cota.cotaDias} dia(s)</strong> a cada dois ciclos do banco de horas. No
          período de {textoJanela(cota.janela)}: usados <strong>{cota.usados}</strong>, saldo{" "}
          <strong>{cota.saldo}</strong> dia(s). Só dias inteiros, um dia por período.
        </p>
      ) : (
        <p style={{ margin: "0 0 6px" }}>A cota está desativada no momento (histórico abaixo).</p>
      )}
      {cota.historico.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {cota.historico.map((h) => {
            const st = STATUS[h.status] ?? { label: h.status, cls: "badge-gray" };
            return (
              <div
                key={h.id}
                style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}
              >
                <span className={`badge ${st.cls}`}>{st.label}</span>
                <span>{h.dias.map(fmtBr).join(", ")}</span>
                <span style={{ color: "var(--ink-500)", fontSize: 11.5 }}>
                  pedido em{" "}
                  {new Date(h.createdAt).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo"
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

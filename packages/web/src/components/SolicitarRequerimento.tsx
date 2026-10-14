import React from "react";

export type StatusRequerimento = {
  status: string; // PENDENTE | RESPONDIDO
  criadoEm: string;
  respondidoEm?: string | null;
} | null;

/**
 * Botão do RH para pedir ao funcionário que preencha um dado (endereço, dependentes, …).
 * Mostra "Aguardando resposta" enquanto pendente e "Reenviar solicitação" após respondido.
 */
export function BotaoSolicitarRequerimento({
  status,
  enviando,
  onSolicitar,
  rotulo,
  titulo,
  icone
}: {
  status: StatusRequerimento;
  enviando: boolean;
  onSolicitar: () => void;
  rotulo: string;
  titulo: string;
  icone?: React.ReactNode;
}) {
  const pendente = status?.status === "PENDENTE";
  return (
    <button
      type="button"
      onClick={onSolicitar}
      disabled={enviando}
      title={titulo}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 11px",
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(122,30,38,0.22)",
        background: pendente ? "rgba(247,196,55,0.12)" : "transparent",
        cursor: enviando ? "wait" : "pointer",
        fontSize: 11.5,
        fontWeight: 600,
        fontFamily: "var(--font-body)",
        color: pendente ? "#8a6a00" : "var(--ink-600)",
        opacity: enviando ? 0.6 : 1,
        whiteSpace: "nowrap"
      }}
    >
      {icone}
      {enviando
        ? "Enviando…"
        : pendente
          ? "Aguardando resposta"
          : status?.status === "RESPONDIDO"
            ? "Reenviar solicitação"
            : rotulo}
    </button>
  );
}

/** Faixa de status do requerimento (enviado/aguardando ou respondido). */
export function FaixaStatusRequerimento({
  status,
  oQue
}: {
  status: StatusRequerimento;
  /** Complemento de "aguardando o funcionário …", ex.: "preencher o endereço". */
  oQue: string;
}) {
  if (!status) return null;
  const pendente = status.status === "PENDENTE";
  const data = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "8px 12px",
        borderRadius: "var(--radius-md)",
        fontSize: 12,
        background: pendente ? "rgba(247,196,55,0.10)" : "rgba(47,125,79,0.07)",
        border: `1px solid ${pendente ? "rgba(247,196,55,0.30)" : "rgba(47,125,79,0.18)"}`,
        color: pendente ? "#8a6a00" : "var(--green)"
      }}
    >
      {pendente
        ? `⏳ Solicitação enviada em ${data(status.criadoEm)} — aguardando o funcionário ${oQue}.`
        : `✓ Funcionário respondeu a solicitação${status.respondidoEm ? ` em ${data(status.respondidoEm)}` : ""}.`}
    </div>
  );
}

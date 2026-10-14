import React from "react";
import { Link } from "react-router-dom";

/** O que impede a assinatura da folha (backend: avaliarSaldoFolha → pendencias). */
export interface PendenciasFolha {
  dias: Array<{ iso: string; status: "INCONSISTENTE"; motivo: string }>;
  solicitacoes: Array<{
    id: string;
    tipo: string;
    tipoLabel: string;
    status: string;
    etapa: string;
    inicio: string;
    fim: string;
  }>;
  erroConferencia: boolean;
}

const fmtDia = (iso: string) => iso.split("-").reverse().join("/");

/** Texto curto (tooltip) com tudo o que está pendente. */
export function resumoPendencias(p?: PendenciasFolha | null): string {
  if (!p) return "Há pendências para regularizar.";
  const itens: string[] = [];
  p.dias.forEach((d) => itens.push(`${fmtDia(d.iso)} — Inconsistente: ${d.motivo}`));
  p.solicitacoes.forEach((s) =>
    itens.push(
      `${s.tipoLabel} ${s.inicio === s.fim ? fmtDia(s.inicio) : `${fmtDia(s.inicio)} a ${fmtDia(s.fim)}`} — ${s.etapa}`
    )
  );
  if (p.erroConferencia) itens.push("Não foi possível conferir os dias do mês.");
  return itens.length ? itens.join("\n") : "Há pendências para regularizar.";
}

const marcador: React.CSSProperties = {
  display: "inline-block",
  width: 3,
  height: 12,
  borderRadius: 2,
  marginRight: 8,
  verticalAlign: "-1px"
};

/**
 * Lista objetiva do que falta regularizar para assinar a folha: os dias (com o motivo) e as
 * solicitações do mês ainda em andamento. Discreto: texto pequeno, marcador fino na cor.
 */
export function PendenciasAssinatura({ pendencias }: { pendencias?: PendenciasFolha | null }) {
  if (!pendencias) return null;
  const { dias, solicitacoes, erroConferencia } = pendencias;
  if (!dias.length && !solicitacoes.length && !erroConferencia) return null;

  return (
    <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.6 }}>
      {erroConferencia && (
        <p style={{ margin: "0 0 6px" }}>
          Não foi possível conferir os dias do mês agora. Atualize a página; se persistir, fale com
          o RH.
        </p>
      )}
      {dias.length > 0 && (
        <div style={{ marginBottom: solicitacoes.length ? 8 : 0 }}>
          <p style={{ margin: "0 0 3px", fontWeight: 600 }}>
            {dias.length === 1 ? "Dia para regularizar" : `${dias.length} dias para regularizar`}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {dias.map((d) => (
              <li key={d.iso}>
                <span style={{ ...marcador, background: "rgba(217,119,6,0.7)" }} />
                <strong style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {fmtDia(d.iso)}
                </strong>{" "}
                · Inconsistente — {d.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {solicitacoes.length > 0 && (
        <div>
          <p style={{ margin: "0 0 3px", fontWeight: 600 }}>
            {solicitacoes.length === 1
              ? "Solicitação do mês em andamento"
              : `${solicitacoes.length} solicitações do mês em andamento`}
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {solicitacoes.map((s) => (
              <li key={s.id}>
                <span style={{ ...marcador, background: "rgba(30,74,122,0.55)" }} />
                {s.tipoLabel}{" "}
                <strong style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {s.inicio === s.fim ? fmtDia(s.inicio) : `${fmtDia(s.inicio)} a ${fmtDia(s.fim)}`}
                </strong>{" "}
                · {s.etapa}
              </li>
            ))}
          </ul>
          <p style={{ margin: "4px 0 0", color: "var(--ink-500)" }}>
            Acompanhe em <Link to="/ponto/solicitacoes">Solicitações</Link>. A assinatura é liberada
            quando forem concluídas.
          </p>
        </div>
      )}
    </div>
  );
}

/** Estilo discreto para a linha do histórico que precisa de correção (cor suave + barra fina). */
export function estiloLinhaPendente(tipo: "dia" | "solicitacao"): React.CSSProperties {
  return tipo === "dia"
    ? { background: "rgba(217,119,6,0.05)", boxShadow: "inset 3px 0 0 rgba(217,119,6,0.7)" }
    : { background: "rgba(30,74,122,0.04)", boxShadow: "inset 3px 0 0 rgba(30,74,122,0.45)" };
}

import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../hooks/useApi";
import {
  ModalEnviarFolhaFerias,
  type DocumentoFeriasEnvio,
  type SolicitacaoResumo
} from "./solicitacaoUi";

interface RodadaPendente {
  solicitacaoId: string;
  funcionarioId: string;
  funcionarioNome: string;
  matricula: string | null;
  ordem: number;
  inicio: string;
  fim: string;
  diasParaInicio: number;
  noPrazo: boolean;
  situacao: "PENDENTE_RH" | "AGUARDANDO_ASSINATURA" | "REJEITADA";
}

const fmt = (iso: string) => iso.split("-").reverse().join("/");

const SITUACAO: Record<RodadaPendente["situacao"], { texto: string; cor: string }> = {
  PENDENTE_RH: { texto: "Aguardando envio do RH", cor: "#8a6a00" },
  AGUARDANDO_ASSINATURA: { texto: "Aguardando assinatura do funcionário", cor: "#1e40af" },
  REJEITADA: { texto: "Rejeitado pelo funcionário — corrija e reenvie", cor: "var(--red)" }
};

/**
 * Férias divididas: o 2º e o 3º período (datas futuras) têm Aviso e Recibo próprios, com
 * novas assinaturas. Lista o que falta e abre o mesmo envio de documentos das férias.
 */
export function PainelRodadasFeriasRh({ onMensagem }: { onMensagem: (msg: string) => void }) {
  const [linhas, setLinhas] = useState<RodadaPendente[]>([]);
  const [modal, setModal] = useState<RodadaPendente | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setLinhas((await api.get<RodadaPendente[]>("/auditoria/rh/ferias/rodadas")) ?? []);
    } catch {
      setLinhas([]);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!linhas.length) return null;

  async function enviar(documentos: DocumentoFeriasEnvio[], observacao: string) {
    if (!modal) return;
    setEnviando(true);
    setErro("");
    try {
      await api.patch(
        `/auditoria/rh/solicitacoes/${modal.solicitacaoId}/ferias/rodadas/${modal.ordem}/documentos`,
        { documentos, observacao }
      );
      onMensagem(
        `Documentos do ${modal.ordem}º período enviados a ${modal.funcionarioNome} para assinatura.`
      );
      setModal(null);
      await carregar();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível enviar os documentos.");
    } finally {
      setEnviando(false);
    }
  }

  const resumo: SolicitacaoResumo | null = modal
    ? {
        id: modal.solicitacaoId,
        tipo: "FERIAS",
        dataReferencia: modal.inicio,
        descricao: "",
        createdAt: modal.inicio,
        metadados: {
          periodos: [
            {
              dataInicio: `${modal.inicio}T00:00:00.000Z`,
              dataFim: `${modal.fim}T23:59:59.000Z`,
              dias:
                Math.round(
                  (Date.parse(`${modal.fim}T00:00:00Z`) - Date.parse(`${modal.inicio}T00:00:00Z`)) /
                    86400000
                ) + 1
            }
          ]
        },
        funcionario: {
          matricula: modal.matricula,
          user: { name: modal.funcionarioNome }
        }
      }
    : null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(47,125,79,0.25)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        marginBottom: 20
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#2f7d4f" }}>
        🌴 Rodadas de férias — Aviso e Recibo do 2º/3º período ({linhas.length})
      </p>
      <p style={{ margin: "2px 0 10px", fontSize: 12, color: "var(--ink-500)" }}>
        Férias divididas: cada período futuro precisa de novo Aviso e Recibo e de nova assinatura do
        funcionário.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {linhas.map((l) => (
          <div
            key={`${l.solicitacaoId}-${l.ordem}`}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: "var(--radius-md)",
              background:
                l.noPrazo && l.situacao === "PENDENTE_RH" ? "rgba(247,196,55,0.10)" : "#fff"
            }}
          >
            <div style={{ flex: "1 1 240px" }}>
              <strong style={{ fontSize: 13 }}>{l.funcionarioNome}</strong>
              <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                {" "}
                · {l.ordem}º período: {fmt(l.inicio)} a {fmt(l.fim)} · começa em {l.diasParaInicio}{" "}
                dia(s)
              </span>
              <div style={{ fontSize: 11.5, color: SITUACAO[l.situacao].cor, fontWeight: 600 }}>
                {SITUACAO[l.situacao].texto}
                {l.noPrazo && l.situacao === "PENDENTE_RH" ? " · dentro do prazo de envio" : ""}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setErro("");
                setModal(l);
              }}
            >
              {l.situacao === "PENDENTE_RH" ? "Enviar Aviso e Recibo" : "Reenviar documentos"}
            </button>
          </div>
        ))}
      </div>
      {modal && resumo && (
        <ModalEnviarFolhaFerias
          solicitacao={resumo}
          titulo={`Documentos do ${modal.ordem}º período de férias`}
          onConfirm={enviar}
          onClose={() => setModal(null)}
          loading={enviando}
          erro={erro}
        />
      )}
    </div>
  );
}

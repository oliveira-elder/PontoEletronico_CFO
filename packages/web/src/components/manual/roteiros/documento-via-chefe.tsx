import React from "react";
import { CheckCircleIcon, XCircleIcon } from "../../icons";
import { Campo, Janela, rotuloEstilo } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";
import { Cartao, Pagina } from "./solicitacoes";
import { solicitacao } from "./solicitacoes-extra";

/* ───────── 1. Funcionário envia (passa pelo chefe) ───────── */

export const enviarDocumentoViaChefe = solicitacao({
  id: "documento-via-chefe",
  titulo: "Enviar um documento ao RH pelo chefe",
  tipo: "DOCUMENTO_VIA_CHEFE",
  tituloModal: "🗂️ Envio de Documento - Home Office",
  altura: 900,
  enviarId: "btn-enviar-dc",
  sucesso: {
    titulo: "Solicitação enviada!",
    texto: "Documento enviado. Seu chefe confere e depois encaminha ao RH."
  },
  legendaFinal:
    "O pedido fica como “Aguardando Chefe”. Seu chefe confere o documento e o encaminha ao RH.",
  cartao: (
    <Cartao
      emoji="🗂️"
      tipo="Envio de Documento - Home Office"
      sub="Enviado em 20/10/2026 · 📎 doc. anexado"
      status="Aguardando Chefe"
      cls="badge-amber"
      texto="Comprovante de residência atualizado."
      cor="var(--amber)"
    />
  ),
  form: (e) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.5 }}>
        Envie documentos ao setor de RH com uma breve descrição.{" "}
        <strong>Seu chefe imediato verá este documento antes do RH</strong> e poderá encaminhar,
        recusar ou devolver para correção. Sem chefe imediato, vai direto ao RH.
      </p>
      <Campo
        id="dc-desc"
        e={e}
        rotulo="Descrição do documento"
        obrigatorio
        area
        placeholder="Descreva o documento que está enviando…"
      />
      <div>
        <label style={rotuloEstilo}>
          Arquivo (imagem ou PDF) <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <div
          data-alvo="dc-arquivo"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: "1.5px dashed rgba(122,30,38,0.22)",
            background: "rgba(122,30,38,0.03)",
            fontSize: 13
          }}
        >
          <span style={{ fontSize: 18 }}>📎</span>
          <span style={{ flex: 1 }}>{e.anexado ? "comprovante.pdf" : "Selecionar arquivo…"}</span>
        </div>
      </div>
      <span
        className="btn btn-primary"
        data-alvo="btn-enviar-dc"
        style={{ justifyContent: "center" }}
      >
        Enviar ao chefe e ao RH
      </span>
    </div>
  ),
  passosForm: [
    {
      acao: "digitar",
      alvo: "dc-desc",
      valor: "Comprovante de residência atualizado.",
      legenda: "Descreva o documento (mínimo de 3 caracteres)."
    },
    {
      acao: "clicar",
      alvo: "dc-arquivo",
      set: { anexado: true },
      legenda: "Selecione o arquivo: PDF, JPG, PNG ou WebP, até 10 MB."
    }
  ]
});

/* ───────── 2. Funcionário cancela (antes de o chefe decidir) ───────── */

const botaoCartao: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 12px",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
  fontWeight: 600
};

export const cancelarSolicitacao: Roteiro = {
  id: "cancelar-solicitacao",
  titulo: "Cancelar uma solicitação",
  altura: 760,
  estadoInicial: {},
  render: (e: Estado) => (
    <Shell ativo="solicitacoes" e={e}>
      <Pagina
        e={e}
        filtro={e.cancelada ? 0 : 2}
        lista={
          <>
            {!e.cancelada && (
              <div>
                <Cartao
                  emoji="🗂️"
                  tipo="Envio de Documento - Home Office"
                  sub="Enviado em 20/10/2026 · 📎 doc. anexado"
                  status="Aguardando Chefe"
                  cls="badge-amber"
                  texto="Comprovante de residência atualizado."
                  cor="var(--amber)"
                />
                <div
                  style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0 0 4px" }}
                >
                  {!e.confirmando ? (
                    <span
                      data-alvo="btn-cancelar"
                      style={{ ...botaoCartao, color: "var(--red)", border: "1px solid #fca5a5" }}
                    >
                      ✖ Cancelar solicitação
                    </span>
                  ) : (
                    <>
                      <span style={{ fontSize: 12.5, color: "var(--ink-700)" }}>
                        Cancelar esta solicitação? Seu chefe não a verá mais.
                      </span>
                      <span
                        data-alvo="btn-sim-cancelar"
                        style={{ ...botaoCartao, background: "var(--red)", color: "#fff" }}
                      >
                        Sim, cancelar
                      </span>
                      <span style={{ ...botaoCartao, color: "var(--ink-600)" }}>Voltar</span>
                    </>
                  )}
                </div>
              </div>
            )}
            {e.cancelada && (
              <Cartao
                emoji="🗂️"
                tipo="Envio de Documento - Home Office"
                sub="Enviado em 20/10/2026 · 📎 doc. anexado"
                status="Cancelada por você"
                cls="badge-gray"
                texto="Comprovante de residência atualizado."
                cor="var(--ink-300)"
              />
            )}
          </>
        }
      />
    </Shell>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "btn-cancelar",
      legenda:
        "Enquanto o pedido está “Aguardando Chefe”, aparece o botão “Cancelar solicitação”. Depois que o chefe encaminha, só o RH pode cancelar."
    },
    {
      acao: "clicar",
      alvo: "btn-cancelar",
      set: { confirmando: true },
      legenda: "Clique em “Cancelar solicitação”."
    },
    {
      acao: "clicar",
      alvo: "btn-sim-cancelar",
      set: { cancelada: true, confirmando: false },
      legenda:
        "Confirme em “Sim, cancelar”. O pedido sai da fila do chefe e fica como “Cancelada por você”."
    }
  ]
};

/* ───────── 3. Chefe confere e devolve ───────── */

function PedidoDocumento({ e }: { e: Estado }) {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--burgundy-600)",
            margin: "0 0 4px"
          }}
        >
          Gestão
        </p>
        <h1 style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Aprovações
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
          Etapa do chefe de área — aprovação inicial da equipe.
        </p>
      </div>
      {e.devolvido ? (
        <p style={{ textAlign: "center", color: "var(--ink-500)", padding: 24 }}>
          Solicitação devolvida ao funcionário para correção.
        </p>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "16px 20px",
            display: "flex",
            gap: 14,
            alignItems: "flex-start"
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>Maria Souza</strong>
              <span className="badge badge-amber">Aguardando Chefe</span>
              <span className="badge badge-gray">Envio de Documento - Home Office</span>
            </div>
            <p style={{ margin: "0 0 6px", fontSize: 13.5, fontWeight: 500 }}>
              Maria Souza enviou um documento ao RH (comprovante.pdf).
            </p>
            <span
              data-alvo="link-arquivo"
              style={{ fontSize: 12.5, color: "var(--burgundy-600)", fontWeight: 600 }}
            >
              📎 Abrir documento anexado
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ ...botaoCartao, background: "#16a34a", color: "#fff" }}>
              <CheckCircleIcon size={14} /> Encaminhar ao RH
            </span>
            <span
              data-alvo="btn-devolver"
              style={{ ...botaoCartao, background: "#b45309", color: "#fff" }}
            >
              ↩ Devolver
            </span>
            <span style={{ ...botaoCartao, background: "var(--red)", color: "#fff" }}>
              <XCircleIcon size={14} /> Rejeitar
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export const devolverDocumento: Roteiro = {
  id: "devolver-documento",
  titulo: "Conferir e devolver um documento (chefe)",
  altura: 760,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="aprovacoes" e={e} perfil="chefe" usuario="Carlos Lima">
        <PedidoDocumento e={e} />
      </Shell>
      {!!e.modal && (
        <Janela
          largura={480}
          cabecalho={
            <div
              style={{
                background: "rgba(217,119,6,0.10)",
                borderBottom: "1px solid rgba(217,119,6,0.35)",
                padding: "16px 24px",
                display: "flex",
                alignItems: "center",
                gap: 10
              }}
            >
              <span style={{ fontSize: 22 }}>↩️</span>
              <strong style={{ color: "#b45309", fontSize: 16 }}>Devolver para correção</strong>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Campo
              id="motivo"
              e={e}
              area
              rotulo="Motivo da devolução (obrigatório, mínimo de 10 caracteres)"
              placeholder="Explique o que o funcionário precisa corrigir…"
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <span
                data-alvo="btn-confirmar-devolucao"
                style={{
                  padding: "10px 24px",
                  borderRadius: "var(--radius-md)",
                  background: "#b45309",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                ↩ Devolver
              </span>
            </div>
          </div>
        </Janela>
      )}
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "link-arquivo",
      legenda:
        "Em Aprovações, o documento enviado aparece para você. Abra o arquivo e confira antes de decidir."
    },
    {
      acao: "clicar",
      alvo: "btn-devolver",
      set: { modal: "devolver" },
      legenda:
        "Se algo precisa ser corrigido (documento ilegível, falta o verso…), clique em “Devolver”. Em vez disso, você pode “Encaminhar ao RH” ou “Rejeitar”."
    },
    {
      acao: "digitar",
      alvo: "motivo",
      valor: "Documento ilegível, envie uma foto mais nítida.",
      legenda: "Escreva o motivo (mínimo de 10 caracteres). O funcionário vê esse texto."
    },
    {
      acao: "clicar",
      alvo: "btn-confirmar-devolucao",
      set: { modal: "", devolvido: true },
      legenda:
        "Confirme. O funcionário é avisado, corrige e reenvia; o pedido volta para você conferir de novo."
    }
  ]
};

/* ───────── 4. Funcionário corrige e reenvia ───────── */

export const corrigirDocumento: Roteiro = {
  id: "corrigir-documento",
  titulo: "Corrigir e reenviar um documento devolvido",
  altura: 860,
  estadoInicial: {},
  render: (e) => (
    <Shell ativo="solicitacoes" e={e}>
      <Pagina
        e={e}
        filtro={e.reenviado ? 0 : 4}
        lista={
          e.reenviado ? (
            <Cartao
              emoji="🗂️"
              tipo="Envio de Documento - Home Office"
              sub="Enviado em 20/10/2026 · 📎 doc. anexado"
              status="Aguardando Chefe"
              cls="badge-amber"
              texto="Comprovante de residência atualizado."
              cor="var(--amber)"
            />
          ) : (
            <div className="card-flat" style={{ borderLeft: "3px solid var(--amber)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 8
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 20 }}>🗂️</span>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>Envio de Documento - Home Office</p>
                </div>
                <span className="badge badge-amber">Devolvida para correção</span>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(217,119,6,0.35)",
                  background: "rgba(217,119,6,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}
              >
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: "#92400e" }}>
                  ↩ Devolvida para correção por Carlos Lima
                </p>
                <p style={{ margin: 0, fontSize: 12.5 }} data-alvo="motivo-devolucao">
                  Motivo: Documento ilegível, envie uma foto mais nítida.
                </p>
                <span
                  data-alvo="trocar-arquivo"
                  style={{ fontSize: 12.5, color: "var(--ink-700)" }}
                >
                  📎 {e.anexado ? "comprovante-nitido.pdf" : "Trocar o arquivo (opcional)"}
                </span>
                <span
                  className="btn btn-primary btn-sm"
                  data-alvo="btn-reenviar"
                  style={{ alignSelf: "flex-start" }}
                >
                  Corrigir e reenviar
                </span>
              </div>
            </div>
          )
        }
      />
    </Shell>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "motivo-devolucao",
      legenda:
        "Você recebe um aviso e, em Solicitações, o pedido aparece como “Devolvida para correção”, com o motivo do chefe."
    },
    {
      acao: "clicar",
      alvo: "trocar-arquivo",
      set: { anexado: true },
      legenda: "Se precisar, troque o arquivo (e, se quiser, ajuste a descrição)."
    },
    {
      acao: "clicar",
      alvo: "btn-reenviar",
      set: { reenviado: true },
      legenda:
        "Clique em “Corrigir e reenviar”. O pedido volta para o chefe como “Aguardando Chefe”. Você também pode cancelá-lo."
    }
  ]
};

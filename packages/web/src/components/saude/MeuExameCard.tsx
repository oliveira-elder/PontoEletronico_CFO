import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../hooks/useApi";
import { Modal } from "../Modal";
import { FormEnviarExame } from "./FormEnviarExame";
import {
  RESULTADO_LABEL,
  SITUACAO_LABEL,
  fmtDataBr,
  type ExameOcupacional,
  type SituacaoExame
} from "./tipos";

export interface MeusExames {
  config: { periodicidadeMeses: number; avisoDias: number };
  situacao: SituacaoExame;
  diasParaVencer: number | null;
  proximoVencimento: string | null;
  ultimoExame: string | null;
  aguardandoConferencia: boolean;
  exames: ExameOcupacional[];
}

/** Funcionário: situação do exame periódico, envio por conta própria e histórico. */
export function MeuExameCard({
  recarregar = 0,
  onMudou
}: {
  recarregar?: number;
  onMudou?: (m: MeusExames) => void;
}) {
  const [dados, setDados] = useState<MeusExames | null>(null);
  const [modal, setModal] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mostrarHist, setMostrarHist] = useState(false);

  const carregar = useCallback(() => {
    api
      .get<MeusExames>("/ponto/meus-exames")
      .then((d) => {
        setDados(d);
        onMudou?.(d);
      })
      .catch(() => setDados(null));
    // eslint-disable-next-line
  }, []);
  useEffect(carregar, [carregar, recarregar]);

  if (!dados) return null;
  const s = SITUACAO_LABEL[dados.situacao];
  const devolvido = dados.exames.find((e) => e.situacao === "DEVOLVIDO");
  const ultimaDevolucao =
    devolvido && (!dados.ultimoExame || devolvido.createdAt > dados.ultimoExame) ? devolvido : null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(122,30,38,0.12)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        marginBottom: 16
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap"
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--burgundy-600)" }}>
            🩺 Meu exame médico periódico
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>
            <span
              style={{
                padding: "2px 9px",
                borderRadius: 999,
                background: s.bg,
                color: s.cor,
                fontWeight: 700,
                fontSize: 11.5
              }}
            >
              {s.label}
            </span>{" "}
            {dados.ultimoExame && (
              <>
                Último exame: <strong>{fmtDataBr(dados.ultimoExame)}</strong> · próximo vencimento:{" "}
                <strong>{fmtDataBr(dados.proximoVencimento)}</strong>
                {dados.diasParaVencer !== null && dados.diasParaVencer >= 0
                  ? ` (em ${dados.diasParaVencer} dia(s))`
                  : dados.diasParaVencer !== null
                    ? ` (vencido há ${Math.abs(dados.diasParaVencer)} dia(s))`
                    : ""}
              </>
            )}
            {!dados.ultimoExame && "Nenhum exame confirmado pelo RH ainda."}
          </p>
          {dados.aguardandoConferencia && (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#1a4f7a" }}>
              ⏳ Exame enviado, aguardando a conferência do RH.
            </p>
          )}
          {ultimaDevolucao && !dados.aguardandoConferencia && (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#b91c1c" }}>
              ↩ Devolvido pelo RH: {ultimaDevolucao.motivoDevolucao}. Reenvie o exame.
            </p>
          )}
          {msg && (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--green)" }}>✓ {msg}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={dados.aguardandoConferencia}
            title={dados.aguardandoConferencia ? "Aguarde a conferência do RH" : undefined}
            onClick={() => {
              setMsg(null);
              setModal(true);
            }}
          >
            Enviar meu exame
          </button>
          {dados.exames.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setMostrarHist((v) => !v)}>
              {mostrarHist ? "Ocultar histórico" : "Ver histórico"}
            </button>
          )}
        </div>
      </div>

      {mostrarHist && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {dados.exames.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                fontSize: 12.5,
                padding: "6px 10px",
                border: "1px solid rgba(122,30,38,0.08)",
                borderRadius: "var(--radius-md)"
              }}
            >
              <strong>{fmtDataBr(e.dataRealizacao)}</strong>
              <span>
                {e.situacao === "CONFIRMADO"
                  ? `Confirmado${e.resultado ? ` · ${RESULTADO_LABEL[e.resultado]}` : ""}`
                  : e.situacao === "AGUARDANDO_CONFERENCIA"
                    ? "Aguardando conferência"
                    : `Devolvido: ${e.motivoDevolucao ?? ""}`}
              </span>
              {e.proximoVencimento && (
                <span style={{ color: "var(--ink-500)" }}>
                  vence em {fmtDataBr(e.proximoVencimento)}
                </span>
              )}
              {e.temArquivo && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    api
                      .download(
                        `/ponto/saude-ocupacional/exames/${e.id}/arquivo`,
                        e.nomeArquivo ?? "ASO.pdf"
                      )
                      .catch((er: Error) => alert(er.message))
                  }
                >
                  ⬇ ASO
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          eyebrow="Saúde Ocupacional"
          title="Enviar meu exame médico periódico"
          onClose={() => setModal(false)}
          maxWidth={760}
          maxHeight="92vh"
        >
          <FormEnviarExame
            onEnviado={() => {
              setModal(false);
              setMsg("Exame enviado. O RH vai conferir o ASO.");
              carregar();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

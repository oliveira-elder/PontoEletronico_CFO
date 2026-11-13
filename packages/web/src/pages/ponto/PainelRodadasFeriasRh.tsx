import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../hooks/useApi";
import { ProrrogarPrazoFeriasModal } from "../../components/ferias/ProrrogarPrazoFeriasModal";
import { prazoDocumento, textoPrazo } from "../../utils/feriasDocumentos";
import { hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { EnviarDocumentoFeriasModal } from "../../components/ferias/EnviarDocumentoFeriasModal";

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
  documentos: Array<{
    tipo: string;
    rotulo?: string;
    url: string;
    urlAssinado?: string;
    rejeicao?: { nome: string; em: string; justificativa: string };
    prazoProrrogadoAte?: string;
  }>;
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
  const [prorrogar, setProrrogar] = useState<{
    linha: RodadaPendente;
    tipo: "AVISO" | "RECIBO";
    prazoAtual: string;
  } | null>(null);
  const [envio, setEnvio] = useState<{ linha: RodadaPendente; tipo: "AVISO" | "RECIBO" } | null>(
    null
  );

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

  const docDe = (l: RodadaPendente, tipo: string) => l.documentos.find((d) => d.tipo === tipo);

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
        Férias divididas: cada período futuro tem Aviso (assinar até o 1º dia do período) e Recibo
        (até o fim do mês do término), enviados separadamente.
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
              {(["AVISO", "RECIBO"] as const).map((t) => {
                const d = docDe(l, t);
                const prazo = prazoDocumento(t, l, d?.prazoProrrogadoAte);
                const pz = prazo ? textoPrazo(prazo, hojeBrasiliaISO()) : null;
                return (
                  <div key={t} style={{ fontSize: 11.5, color: "var(--ink-600)" }}>
                    {t === "AVISO" ? "Aviso" : "Recibo"}:{" "}
                    {!d
                      ? "ainda não enviado"
                      : d.urlAssinado
                        ? "assinado"
                        : d.rejeicao
                          ? `rejeitado — “${d.rejeicao.justificativa}”`
                          : "aguardando assinatura"}
                    {pz && !d?.urlAssinado && (
                      <span style={{ color: pz.vencido ? "var(--red)" : undefined }}>
                        {" "}
                        · {pz.texto}
                      </span>
                    )}
                    {d && prazo && !d.urlAssinado && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginLeft: 8 }}
                        onClick={() => setProrrogar({ linha: l, tipo: t, prazoAtual: prazo })}
                      >
                        ⏱ Prorrogar prazo
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["AVISO", "RECIBO"] as const).map((t) => {
                const d = docDe(l, t);
                const assinado = !!d?.urlAssinado;
                return (
                  <button
                    key={t}
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={assinado}
                    title={assinado ? "Já assinado" : undefined}
                    onClick={() => setEnvio({ linha: l, tipo: t })}
                  >
                    {d ? "Reenviar" : "Enviar"} {t === "AVISO" ? "Aviso" : "Recibo"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {prorrogar && (
        <ProrrogarPrazoFeriasModal
          rotulo={`${prorrogar.tipo === "AVISO" ? "Aviso" : "Recibo"} do ${prorrogar.linha.ordem}º período`}
          url={`/auditoria/rh/solicitacoes/${prorrogar.linha.solicitacaoId}/ferias/documentos/${prorrogar.tipo}/prazo`}
          ordem={prorrogar.linha.ordem}
          prazoAtual={prorrogar.prazoAtual}
          onClose={() => setProrrogar(null)}
          onSalvo={() => {
            onMensagem(
              `Prazo do ${prorrogar.tipo === "AVISO" ? "Aviso" : "Recibo"} do ${prorrogar.linha.ordem}º período prorrogado.`
            );
            setProrrogar(null);
            void carregar();
          }}
        />
      )}
      {envio && (
        <EnviarDocumentoFeriasModal
          tipo={envio.tipo}
          url={`/auditoria/rh/solicitacoes/${envio.linha.solicitacaoId}/ferias/rodadas/${envio.linha.ordem}/documentos/${envio.tipo}`}
          onClose={() => setEnvio(null)}
          onEnviado={() => {
            onMensagem(
              `${envio.tipo === "AVISO" ? "Aviso" : "Recibo"} do ${envio.linha.ordem}º período enviado a ${envio.linha.funcionarioNome} para assinatura.`
            );
            setEnvio(null);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

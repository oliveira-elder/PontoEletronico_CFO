import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../hooks/useApi";
import { hojeBrasiliaISO, somarDiasCivil } from "../../utils/horario-brasilia";
import { Modal } from "../Modal";

interface Liberacao {
  id: string;
  minutos: number;
  minutosEfetivos: number;
  usadoMinutos: number;
  disponivelMinutos: number;
  validaAte: string;
  vencida: boolean;
  revogada: boolean;
  minutosRevogados: number;
  devolvidoAoBancoMin: number;
  justificativa: string;
  liberadoPorNome: string;
  createdAt: string;
  revogadaEm: string | null;
  revogadaPorNome: string | null;
  revogacaoJustificativa: string | null;
}

interface ResumoLiberacoes {
  saldoAtualMinutos: number;
  liberavelMinutos: number;
  minutoMinimo: number;
  disponivelMinutos: number;
  usadoMinutos: number;
  validadePadraoDias: number;
  liberacoes: Liberacao[];
}

const fmtBr = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const fmtHM = (min: number) => {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
};
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

function Metrica({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          color: "var(--ink-400)",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.10em"
        }}
      >
        {rotulo}
      </p>
      <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: cor ?? "var(--ink-900)" }}>
        {valor}
      </p>
    </div>
  );
}

/**
 * RH → Auditoria → Funcionário → Banco de Horas: libera um tempo do banco positivo para o
 * funcionário usar como abono (Solicitações → Abono). Debita o saldo na hora; o tempo tem
 * validade e sobrevive à zeragem do ciclo.
 */
export function LiberarBancoHorasRh({
  funcionarioId,
  token,
  onAtualizado
}: {
  funcionarioId: string;
  token: string;
  /** Recarrega o extrato do banco depois de liberar/revogar. */
  onAtualizado: () => void;
}) {
  const [resumo, setResumo] = useState<ResumoLiberacoes | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [horas, setHoras] = useState("");
  const [minutos, setMinutos] = useState("");
  const [validade, setValidade] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [revogando, setRevogando] = useState<Liberacao | null>(null);
  const [justRevogar, setJustRevogar] = useState("");

  const carregar = useCallback(async () => {
    try {
      setResumo(
        await api.get<ResumoLiberacoes>(
          `/auditoria/rh/funcionarios/${funcionarioId}/banco-horas/liberacoes`,
          token
        )
      );
    } catch {
      setResumo(null);
    }
  }, [funcionarioId, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!resumo) return null;

  const totalMin = (Number(horas) || 0) * 60 + (Number(minutos) || 0);
  const podeLiberar = resumo.liberavelMinutos >= resumo.minutoMinimo;

  function abrir() {
    if (!resumo) return;
    setMsg(null);
    setErro(null);
    setHoras("");
    setMinutos("");
    setJustificativa("");
    setValidade(somarDiasCivil(hojeBrasiliaISO(), resumo.validadePadraoDias));
    setAberto(true);
  }

  function liberarTudo() {
    if (!resumo) return;
    setHoras(String(Math.floor(resumo.liberavelMinutos / 60)));
    setMinutos(String(resumo.liberavelMinutos % 60));
  }

  async function confirmar() {
    if (!resumo) return;
    setErro(null);
    if (totalMin < resumo.minutoMinimo) {
      setErro(`Informe ao menos ${resumo.minutoMinimo} minutos.`);
      return;
    }
    if (totalMin > resumo.liberavelMinutos) {
      setErro(`O saldo positivo do banco é de ${fmtHM(resumo.liberavelMinutos)}.`);
      return;
    }
    if (!validade || validade < hojeBrasiliaISO()) {
      setErro("Informe uma validade a partir de hoje.");
      return;
    }
    if (justificativa.trim().length < 10) {
      setErro("Informe a justificativa (mínimo de 10 caracteres).");
      return;
    }
    setEnviando(true);
    try {
      await api.post(
        `/auditoria/rh/funcionarios/${funcionarioId}/banco-horas/liberacoes`,
        { minutos: totalMin, validaAte: validade, justificativa: justificativa.trim() },
        token
      );
      setAberto(false);
      setMsg({
        ok: true,
        texto: `${fmtHM(totalMin)} liberados para abono (válidos até ${fmtBr(validade)}). O funcionário e o chefe foram avisados.`
      });
      await carregar();
      onAtualizado();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível liberar.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarRevogacao() {
    if (!revogando) return;
    setEnviando(true);
    try {
      await api.post(
        `/auditoria/rh/funcionarios/${funcionarioId}/banco-horas/liberacoes/${revogando.id}/revogar`,
        { justificativa: justRevogar.trim() },
        token
      );
      setMsg({ ok: true, texto: "Tempo revogado. O funcionário e o chefe foram avisados." });
      setRevogando(null);
      setJustRevogar("");
      await carregar();
      onAtualizado();
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message || "Não foi possível revogar." });
    } finally {
      setEnviando(false);
    }
  }

  const situacao = (l: Liberacao) =>
    l.vencida && l.disponivelMinutos === 0 && l.minutosEfetivos - l.usadoMinutos > 0
      ? { texto: "Vencida", cls: "badge-gray" }
      : l.revogada && l.minutosEfetivos - l.usadoMinutos === 0 && l.usadoMinutos === 0
        ? { texto: "Revogada", cls: "badge-gray" }
        : l.disponivelMinutos > 0
          ? { texto: "Disponível", cls: "badge-green" }
          : { texto: "Usada", cls: "badge-blue" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        border: "1px dashed rgba(122,30,38,0.30)",
        borderRadius: "var(--radius-lg)",
        background: "rgba(122,30,38,0.02)"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap"
        }}
      >
        <div style={{ minWidth: 240, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--burgundy-600)" }}>
            🏢 Tempo do banco liberado pelo RH
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-500)" }}>
            Libere um tempo do saldo positivo para o funcionário usar como abono (Solicitações →
            Abono). O tempo é descontado do banco na hora e vale até a data que você definir, mesmo
            depois da zeragem do ciclo. Não é um agendamento de abono.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={abrir}
          disabled={!podeLiberar}
          title={
            podeLiberar ? undefined : "O funcionário não tem saldo positivo no banco de horas."
          }
        >
          ＋ Liberar tempo para abono
        </button>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Metrica
          rotulo="Saldo do banco"
          valor={fmtHM(resumo.saldoAtualMinutos)}
          cor={resumo.saldoAtualMinutos >= 0 ? "#2f7d4f" : "#c8393f"}
        />
        <Metrica rotulo="Ainda liberável" valor={fmtHM(resumo.liberavelMinutos)} />
        <Metrica rotulo="Disponível ao funcionário" valor={fmtHM(resumo.disponivelMinutos)} />
        <Metrica rotulo="Já usado em abono" valor={fmtHM(resumo.usadoMinutos)} />
      </div>

      {msg && (
        <p style={{ margin: 0, fontSize: 12.5, color: msg.ok ? "var(--green)" : "var(--red)" }}>
          {msg.ok ? "✓ " : ""}
          {msg.texto}
        </p>
      )}

      {resumo.liberacoes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {resumo.liberacoes.map((l) => {
            const sit = situacao(l);
            return (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "8px 10px",
                  border: "1px solid rgba(122,30,38,0.10)",
                  borderRadius: "var(--radius-md)",
                  background: "#fff",
                  fontSize: 12.5
                }}
              >
                <div style={{ minWidth: 220, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <strong>{fmtHM(l.minutos)}</strong>
                    <span className={`badge ${sit.cls}`}>{sit.texto}</span>
                    <span className="badge badge-amber">Liberado pelo RH</span>
                    <span style={{ color: "var(--ink-500)" }}>válido até {fmtBr(l.validaAte)}</span>
                  </div>
                  <p style={{ margin: "3px 0 0", color: "var(--ink-500)", fontSize: 11.5 }}>
                    {l.liberadoPorNome} · {fmtDataHora(l.createdAt)} · usado {fmtHM(l.usadoMinutos)}
                    {l.minutosRevogados > 0 &&
                      ` · revogado ${fmtHM(l.minutosRevogados)}` +
                        (l.devolvidoAoBancoMin > 0
                          ? ` (devolvido ao banco)`
                          : ` (ciclo já zerado: não volta ao banco)`)}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12 }}>{l.justificativa}</p>
                  {l.revogacaoJustificativa && (
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-500)" }}>
                      Revogação ({l.revogadaPorNome}): {l.revogacaoJustificativa}
                    </p>
                  )}
                </div>
                {l.disponivelMinutos > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ alignSelf: "center" }}
                    onClick={() => {
                      setMsg(null);
                      setRevogando(l);
                      setJustRevogar("");
                    }}
                  >
                    Revogar {fmtHM(l.disponivelMinutos)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {revogando && (
        <div
          style={{
            padding: "10px 12px",
            border: "1px solid rgba(200,57,63,0.25)",
            background: "rgba(200,57,63,0.04)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}
        >
          <strong style={{ fontSize: 12.5, color: "var(--red)" }}>
            Revogar {fmtHM(revogando.disponivelMinutos)} ainda não usados?
          </strong>
          <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
            Se o ciclo do banco ainda é o mesmo da liberação, o tempo volta ao saldo; se o ciclo já
            zerou, ele é perdido (o saldo foi zerado).
          </span>
          <textarea
            rows={2}
            value={justRevogar}
            onChange={(e) => setJustRevogar(e.target.value)}
            placeholder="Justificativa do RH (obrigatória, mín. 10 caracteres)"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.20)",
              fontFamily: "inherit",
              fontSize: 13
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={enviando || justRevogar.trim().length < 10}
              onClick={() => void confirmarRevogacao()}
            >
              {enviando ? "Revogando…" : "Confirmar revogação"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={enviando}
              onClick={() => setRevogando(null)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {aberto && (
        <Modal
          eyebrow="Banco de horas"
          title="Liberar tempo para abono"
          subtitle={`Liberável agora: ${fmtHM(resumo.liberavelMinutos)}`}
          onClose={() => !enviando && setAberto(false)}
          maxWidth={1100}
          maxHeight="92vh"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16
              }}
            >
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Tempo a liberar</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="number"
                    min={0}
                    value={horas}
                    onChange={(e) => setHoras(e.target.value)}
                    placeholder="0"
                    style={{ width: 80 }}
                    aria-label="Horas"
                  />
                  <span>h</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minutos}
                    onChange={(e) => setMinutos(e.target.value)}
                    placeholder="0"
                    style={{ width: 80 }}
                    aria-label="Minutos"
                  />
                  <span>min</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={liberarTudo}>
                    Liberar tudo ({fmtHM(resumo.liberavelMinutos)})
                  </button>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Válido até</label>
                <input
                  type="date"
                  value={validade}
                  min={hojeBrasiliaISO()}
                  onChange={(e) => setValidade(e.target.value)}
                  style={{ display: "block" }}
                />
                <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                  O abono precisa ser tirado até esta data. Pode passar da zeragem do ciclo.
                  Sugestão: {resumo.validadePadraoDias} dias.
                </span>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Justificativa do RH</label>
                <textarea
                  rows={3}
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Obrigatória, mín. 10 caracteres"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 10px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.20)",
                    fontFamily: "inherit",
                    fontSize: 13
                  }}
                />
              </div>
            </div>
            {totalMin > 0 && (
              <p style={{ margin: 0, fontSize: 12.5 }}>
                Resumo: o banco passa de <strong>{fmtHM(resumo.saldoAtualMinutos)}</strong> para{" "}
                <strong>{fmtHM(resumo.saldoAtualMinutos - totalMin)}</strong> e o funcionário ganha{" "}
                <strong>{fmtHM(totalMin)}</strong> para abono
                {validade ? ` até ${fmtBr(validade)}` : ""}.
              </p>
            )}
            {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{erro}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={enviando}
                onClick={() => setAberto(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={enviando}
                onClick={() => void confirmar()}
              >
                {enviando ? "Liberando…" : "Confirmar liberação"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

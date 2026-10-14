import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../hooks/useApi";
import { hojeBrasiliaISO, dataCivilPeriodo } from "../../utils/horario-brasilia";
import {
  diasCorridos,
  motivoVedacaoInicio,
  somarDiasIso,
  validarPeriodosEstagiario,
  validarPeriodosFerias,
  type CalendarioFerias
} from "../../utils/feriasRegras";

/** Ciclo de férias como vem de /auditoria/rh/funcionarios/:id/ferias/saldo. */
export interface CicloFeriasRh {
  numero: number;
  inicio: string;
  fim: string;
  diasPorCiclo?: number;
  /** Ciclo em formação: gozo só a partir desta data (YYYY-MM-DD). */
  liberaEm?: string | null;
  emFormacao?: boolean;
  diasDisponiveis?: number;
  status?: "DISPONIVEL" | "EM_ANALISE" | "CONFIGURADO";
}

/** Solicitação de férias a alterar (metadados.periodos no formato da solicitação). */
export interface FeriasParaAlterar {
  id: string;
  metadados: Record<string, unknown> | null;
}

interface ConfigFerias {
  feriasAntecedenciaMinDias: number;
  feriasMinimoGrandePeriodo: number;
  feriasMinimoOutrosPeriodos: number;
  feriasMaxPeriodos: number;
  feriasMaxDiasVenda: number;
  feriasVedacaoPreFeriadoDias: number;
}

const CFG_PADRAO: ConfigFerias = {
  feriasAntecedenciaMinDias: 30,
  feriasMinimoGrandePeriodo: 14,
  feriasMinimoOutrosPeriodos: 5,
  feriasMaxPeriodos: 3,
  feriasMaxDiasVenda: 10,
  feriasVedacaoPreFeriadoDias: 1
};

interface LinhaPeriodo {
  inicio: string;
  fim: string;
}

const fmtBr = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Mensagem de sucesso conforme a etapa em que a solicitação entrou. */
function mensagemConcluido(o_que: string, status?: string) {
  return status === "PENDENTE"
    ? `${o_que} e enviada à aprovação do chefe imediato. Depois dela, em Aprovações (etapa RH), anexe o Aviso e o Recibo de Férias. O funcionário e o chefe foram avisados.`
    : `${o_que} e enviada à etapa do RH (não há chefe para aprovar). Próximo passo: em Aprovações, anexar o Aviso e o Recibo de Férias. O funcionário foi avisado.`;
}

/**
 * Formulário do RH para agendar ou alterar férias de um funcionário
 * (Auditoria → Funcionário → Férias). Mesmas regras do funcionário, sem antecedência;
 * a vedação pode ser ignorada; justificativa obrigatória; confirmação antes de gravar.
 */
export function FormFeriasRh({
  funcionarioId,
  token,
  ciclos,
  isEstagiario = false,
  alterar,
  onConcluido,
  onCancelar
}: {
  funcionarioId: string;
  token: string;
  ciclos: CicloFeriasRh[];
  isEstagiario?: boolean;
  /** Presente = alterar estas férias; ausente = agendar novo ciclo. */
  alterar?: FeriasParaAlterar | null;
  onConcluido: (mensagem: string) => void;
  onCancelar: () => void;
}) {
  const metaOrig = alterar?.metadados ?? null;
  const periodosOrig = useMemo<LinhaPeriodo[]>(
    () =>
      Array.isArray(metaOrig?.periodos)
        ? (metaOrig!.periodos as Array<{ dataInicio: string; dataFim: string }>).map((p) => ({
            inicio: dataCivilPeriodo(p.dataInicio),
            fim: dataCivilPeriodo(p.dataFim)
          }))
        : [],
    [metaOrig]
  );
  const totalOriginal =
    Number(metaOrig?.totalDiasGozo ?? 0) + Number(metaOrig?.diasVendidos ?? 0) ||
    Number(metaOrig?.totalDias ?? 0);

  const ciclosAgendaveis = ciclos.filter((c) => c.status !== "CONFIGURADO");
  const [cicloNumero, setCicloNumero] = useState<number | null>(
    alterar ? null : (ciclosAgendaveis[0]?.numero ?? null)
  );
  const [linhas, setLinhas] = useState<LinhaPeriodo[]>(
    periodosOrig.length ? periodosOrig : [{ inicio: "", fim: "" }]
  );
  const [diasVendidos, setDiasVendidos] = useState<number>(Number(metaOrig?.diasVendidos ?? 0));
  const [justificativa, setJustificativa] = useState("");
  const [ignorarVedacao, setIgnorarVedacao] = useState(false);
  const [cfg, setCfg] = useState<ConfigFerias>(CFG_PADRAO);
  const [calendario, setCalendario] = useState<CalendarioFerias | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  useEffect(() => {
    api
      .get<ConfigFerias>("/ponto/config/solicitacoes", token)
      .then((c) => c && setCfg({ ...CFG_PADRAO, ...c }))
      .catch(() => {});
  }, [token]);

  /* Calendário de vedação cobrindo os inícios informados. */
  const chaveInicios = [...new Set(linhas.map((l) => l.inicio).filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!chaveInicios) return;
    const datas = chaveInicios.split(",");
    let ativo = true;
    api
      .get<CalendarioFerias>(
        `/auditoria/rh/funcionarios/${funcionarioId}/ferias/calendario?de=${datas[0]}&ate=${somarDiasIso(datas[datas.length - 1], 10)}`,
        token
      )
      .then((r) => ativo && setCalendario(r ?? null))
      .catch(() => ativo && setCalendario(null));
    return () => {
      ativo = false;
    };
  }, [chaveInicios, funcionarioId, token]);

  const ciclo = ciclos.find((c) => c.numero === cicloNumero) ?? null;
  /* Agendar: o ciclo inteiro (pedido em análise é substituído). Alterar: o total original. */
  const totalAlvo = alterar ? totalOriginal : (ciclo?.diasPorCiclo ?? 30);
  const preenchidas = linhas.filter((l) => l.inicio && l.fim);
  const totalGozo = preenchidas.reduce((s, l) => s + Math.max(0, diasCorridos(l.inicio, l.fim)), 0);
  const venda = isEstagiario ? 0 : Math.max(0, Math.floor(diasVendidos || 0));
  const total = totalGozo + venda;

  const periodos = linhas.map((l) => ({ inicio: l.inicio, fim: l.fim }));
  const erros: string[] = [];
  if (!alterar && !ciclo) erros.push("Escolha o ciclo de férias.");
  if (linhas.some((l) => !l.inicio || !l.fim)) erros.push("Informe início e fim de cada período.");
  else if (isEstagiario) {
    if (total > totalAlvo) erros.push(`Total (${total}) excede os ${totalAlvo} dias.`);
    erros.push(
      ...validarPeriodosEstagiario({
        periodos,
        maxPeriodoDias: (ciclo?.diasPorCiclo ?? 30) <= 15 ? 10 : 30,
        regras: {
          antecedenciaMinDias: cfg.feriasAntecedenciaMinDias,
          vedacaoPreFeriadoDias: cfg.feriasVedacaoPreFeriadoDias
        },
        hoje: hojeBrasiliaISO(),
        calendario: calendario ?? { diasUteis: [], feriados: [] },
        liberaEm: ciclo?.liberaEm ?? null,
        ignorarAntecedencia: true,
        ignorarVedacao: ignorarVedacao || !calendario
      })
    );
  } else {
    erros.push(
      ...validarPeriodosFerias({
        periodos,
        diasVenda: venda,
        regras: {
          antecedenciaMinDias: cfg.feriasAntecedenciaMinDias,
          minimoGrandePeriodo: cfg.feriasMinimoGrandePeriodo,
          minimoOutrosPeriodos: cfg.feriasMinimoOutrosPeriodos,
          maxPeriodos: cfg.feriasMaxPeriodos,
          maxDiasVenda: cfg.feriasMaxDiasVenda,
          vedacaoPreFeriadoDias: cfg.feriasVedacaoPreFeriadoDias
        },
        hoje: hojeBrasiliaISO(),
        calendario: calendario ?? { diasUteis: [], feriados: [] },
        liberaEm: ciclo?.liberaEm ?? null,
        ignorarAntecedencia: true,
        ignorarVedacao: ignorarVedacao || !calendario
      })
    );
    if (total !== totalAlvo) {
      erros.push(`Gozo + venda deve somar ${totalAlvo} dias (agora: ${total}).`);
    }
  }
  const temVedacao =
    !!calendario &&
    linhas.some(
      (l) => l.inicio && motivoVedacaoInicio(l.inicio, cfg.feriasVedacaoPreFeriadoDias, calendario)
    );
  const justificativaOk = justificativa.trim().length >= 10;
  const podeRevisar = erros.length === 0 && justificativaOk;

  async function gravar() {
    setEnviando(true);
    setErroEnvio("");
    const body = {
      cicloNumero: cicloNumero ?? undefined,
      periodos,
      diasVendidos: venda,
      justificativa: justificativa.trim(),
      ignorarVedacao: ignorarVedacao && temVedacao
    };
    try {
      if (alterar) {
        const r = await api.put<{ status?: string }>(
          `/auditoria/rh/funcionarios/${funcionarioId}/ferias/${alterar.id}`,
          body,
          token
        );
        onConcluido(mensagemConcluido("Reprogramação registrada", r?.status));
      } else {
        const r = await api.post<{ status?: string }>(
          `/auditoria/rh/funcionarios/${funcionarioId}/ferias`,
          body,
          token
        );
        onConcluido(mensagemConcluido("Férias programadas", r?.status));
      }
    } catch (e) {
      setErroEnvio((e as Error).message || "Não foi possível gravar.");
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  const label: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "8px 8px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 12.5,
    boxSizing: "border-box",
    background: "#fff"
  };
  const btnMini: React.CSSProperties = {
    padding: "3px 10px",
    borderRadius: 999,
    border: "1px solid rgba(122,30,38,0.18)",
    background: "#fff",
    color: "var(--ink-600)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer"
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(122,30,38,0.14)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 14, color: "var(--burgundy-600)" }}>
          🏢 {alterar ? "Alterar férias pelo RH" : "Agendar férias pelo RH"}
        </strong>
        <button type="button" style={btnMini} onClick={onCancelar} disabled={enviando}>
          Fechar
        </button>
      </div>

      <div
        style={{
          padding: "10px 12px",
          background: "rgba(37,99,235,0.05)",
          border: "1px solid rgba(37,99,235,0.15)",
          borderRadius: "var(--radius-md)",
          fontSize: 12,
          color: "var(--ink-700)",
          lineHeight: 1.55
        }}
      >
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            Segue o <strong>mesmo fluxo do pedido do funcionário</strong>: primeiro o{" "}
            <strong>chefe imediato aprova</strong>; depois, em{" "}
            <strong>Aprovações (etapa RH)</strong>, o RH anexa o Aviso e o Recibo de Férias; o
            funcionário assina pelo sistema e então o RH aprova.
          </li>
          <li>
            Valem as regras do ACT (fracionamento, venda e saldo do ciclo),{" "}
            <strong>sem antecedência</strong>: pode ser qualquer data, inclusive passada.
          </li>
          <li>
            {alterar
              ? "Férias já aprovadas continuam valendo até a nova programação ser aprovada; aí são canceladas e os afastamentos trocados."
              : "Se houver pedido do funcionário em análise neste ciclo, ele será substituído."}
          </li>
          <li>
            A <strong>justificativa é obrigatória</strong> e o{" "}
            <strong>funcionário e o chefe</strong> são avisados na hora (o chefe recebe o pedido de
            aprovação).
          </li>
        </ul>
      </div>

      {!alterar && (
        <div>
          <label style={label}>Ciclo *</label>
          {ciclosAgendaveis.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: 0 }}>
              Todos os ciclos já têm férias aprovadas. Use “Alterar” no histórico abaixo.
            </p>
          ) : (
            <select
              style={{ ...input, maxWidth: 420 }}
              value={cicloNumero ?? ""}
              onChange={(e) => setCicloNumero(Number(e.target.value))}
            >
              {ciclosAgendaveis.map((c) => (
                <option key={c.numero} value={c.numero}>
                  Ciclo {c.numero} — {new Date(c.inicio).toLocaleDateString("pt-BR")} a{" "}
                  {new Date(c.fim).toLocaleDateString("pt-BR")}
                  {c.status === "EM_ANALISE" ? " (pedido em análise será substituído)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {linhas.map((l, i) => {
          const dias = l.inicio && l.fim ? diasCorridos(l.inicio, l.fim) : 0;
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0,1fr) minmax(0,1fr) auto auto",
                gap: 8,
                alignItems: "end"
              }}
            >
              <span
                style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-600)", paddingBottom: 9 }}
              >
                {i + 1}º
              </span>
              <div>
                <label style={label}>Início</label>
                <input
                  type="date"
                  style={input}
                  value={l.inicio}
                  onChange={(e) =>
                    setLinhas((prev) =>
                      prev.map((x, k) => (k === i ? { ...x, inicio: e.target.value } : x))
                    )
                  }
                />
              </div>
              <div>
                <label style={label}>Fim</label>
                <input
                  type="date"
                  style={input}
                  value={l.fim}
                  min={l.inicio || undefined}
                  onChange={(e) =>
                    setLinhas((prev) =>
                      prev.map((x, k) => (k === i ? { ...x, fim: e.target.value } : x))
                    )
                  }
                />
              </div>
              <span
                style={{ fontSize: 12, color: "var(--ink-500)", paddingBottom: 9, minWidth: 48 }}
              >
                {dias > 0 ? `${dias} dias` : ""}
              </span>
              <button
                type="button"
                title="Remover período"
                style={{ ...btnMini, color: "var(--red)", marginBottom: 4 }}
                disabled={linhas.length === 1}
                onClick={() => setLinhas((prev) => prev.filter((_, k) => k !== i))}
              >
                −
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setLinhas((prev) => [...prev, { inicio: "", fim: "" }])}
        >
          + Adicionar período
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
        {!isEstagiario && (
          <div>
            <label style={label}>Dias vendidos (abono pecuniário)</label>
            <input
              type="number"
              min={0}
              max={cfg.feriasMaxDiasVenda}
              style={{ ...input, width: 120 }}
              value={diasVendidos}
              onChange={(e) => setDiasVendidos(Number(e.target.value))}
            />
          </div>
        )}
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: total === totalAlvo ? "#2f7d4f" : "var(--ink-600)"
          }}
        >
          Total: <strong>{total}</strong> de {totalAlvo} dias ({totalGozo} gozo
          {venda ? ` + ${venda} venda` : ""})
        </p>
      </div>

      {(temVedacao || ignorarVedacao) && (
        <label
          style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#8a6a00", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={ignorarVedacao}
            onChange={(e) => setIgnorarVedacao(e.target.checked)}
          />
          Ignorar a vedação (início antes de feriado/fim de semana) — explique na justificativa.
        </label>
      )}

      <div>
        <label style={label}>
          Justificativa do RH * <span style={{ fontWeight: 400 }}>(mín. 10 caracteres)</span>
        </label>
        <textarea
          rows={2}
          style={{ ...input, resize: "vertical" }}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Ex.: Programação definida com a gerência; regularização de férias gozadas…"
        />
      </div>

      {erros.length > 0 && linhas.some((l) => l.inicio) && (
        <div
          style={{
            fontSize: 12,
            color: "var(--red)",
            display: "flex",
            flexDirection: "column",
            gap: 2
          }}
        >
          {erros.map((e) => (
            <span key={e}>⚠ {e}</span>
          ))}
        </div>
      )}
      {erroEnvio && <p style={{ fontSize: 12.5, color: "var(--red)", margin: 0 }}>{erroEnvio}</p>}

      {!confirmando ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ alignSelf: "flex-start" }}
          disabled={!podeRevisar}
          onClick={() => setConfirmando(true)}
        >
          Revisar e confirmar
        </button>
      ) : (
        <div
          style={{
            padding: "10px 12px",
            border: "1px solid rgba(47,125,79,0.25)",
            background: "rgba(47,125,79,0.05)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}
        >
          <strong>Confirme {alterar ? "a alteração" : "o agendamento"}:</strong>
          {[...linhas]
            .sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
            .map((l, i) => (
              <span key={i}>
                {i + 1}º período: {fmtBr(l.inicio)} a {fmtBr(l.fim)} (
                {diasCorridos(l.inicio, l.fim)} dias)
              </span>
            ))}
          {venda > 0 && <span>+ {venda} dias vendidos</span>}
          <span>
            Justificativa: <em>{justificativa.trim()}</em>
          </span>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={enviando}
              onClick={() => void gravar()}
            >
              {enviando ? "Gravando…" : "Confirmar"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={enviando}
              onClick={() => setConfirmando(false)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

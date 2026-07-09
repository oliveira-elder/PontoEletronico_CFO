import React, { useEffect, useState } from "react";
import {
  CalendarIcon,
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon
} from "../../components/icons";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";

/* ─── Helpers ─── */
const pad = (n: number) => String(n).padStart(2, "0");
const toHM = (m: number) => {
  const sign = m < 0 ? "-" : "";
  const abs = Math.abs(m);
  return `${sign}${Math.floor(abs / 60)}h${pad(abs % 60)}`;
};
const fmtData = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
const fmtMes = (yyyyMM: string) => {
  const [year, month] = yyyyMM.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
};

/* ─── Types ─── */
interface DiaBanco {
  data: string;
  horasTrabalhadasMinutos: number;
  jornadaEsperadaMinutos: number;
  saldoDiaMinutos: number;
  saldoAcumuladoMinutos: number;
  observacao?: string;
}

interface ApiBancoHoras {
  saldoAtualMinutos: number;
  cicloInicio: string | null;
  inicioAtividades?: string;
  proximaZeragem: string | null;
  limiteMinutos: number;
  tipoFlexibilidade: string;
  dias: DiaBanco[];
}

/* ─── Page ─── */
export function BancoHorasPage() {
  const isMobile = useIsMobile(768);
  const { token } = useAuth();
  const [dados, setDados] = useState<ApiBancoHoras | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mesAtivo, setMesAtivo] = useState<string>("");

  useEffect(() => {
    const tk = token();
    if (!tk) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<ApiBancoHoras>("/ponto/banco-horas", tk)
      .then((d) => {
        setDados(d);
        if (d?.dias.length) {
          setMesAtivo(d.dias[d.dias.length - 1].data.slice(0, 7));
        }
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  const saldo = dados?.saldoAtualMinutos ?? 0;
  const excedeLimite = dados ? Math.abs(saldo) > dados.limiteMinutos : false;

  /* Meses disponíveis (ordenados) */
  const mesesDisponiveis = [...new Set(dados?.dias.map((d) => d.data.slice(0, 7)) ?? [])].sort();
  const idxAtivo = mesesDisponiveis.indexOf(mesAtivo);
  const podeAnterior = idxAtivo > 0;
  const podePosterior = idxAtivo < mesesDisponiveis.length - 1;

  function navMes(dir: -1 | 1) {
    const next = mesesDisponiveis[idxAtivo + dir];
    if (next) setMesAtivo(next);
  }

  /* Dias do mês ativo */
  const diasMes = dados?.dias.filter((d) => d.data.slice(0, 7) === mesAtivo) ?? [];

  /* Saldo acumulado ao início do mês (último dia do mês anterior no ciclo) */
  const saldoAnterior =
    idxAtivo > 0
      ? (dados?.dias.filter((d) => d.data.slice(0, 7) === mesesDisponiveis[idxAtivo - 1]).at(-1)
          ?.saldoAcumuladoMinutos ?? 0)
      : 0;

  /* Totais do mês */
  const totalTrabalhado = diasMes.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
  const totalEsperado = diasMes.reduce((s, d) => s + d.jornadaEsperadaMinutos, 0);
  const saldoMes = diasMes.reduce((s, d) => s + d.saldoDiaMinutos, 0);
  const saldoFinalMes = diasMes.at(-1)?.saldoAcumuladoMinutos ?? 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        {!isMobile && (
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Ponto Eletrônico
          </p>
        )}
        <h1
          style={{
            fontSize: isMobile ? 20 : "clamp(22px,3vw,28px)",
            fontFamily: "var(--font-display)",
            lineHeight: 1.1
          }}
        >
          Banco de <em>Horas</em>
        </h1>
      </div>

      {loading ? (
        <div
          style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-500)", fontSize: 14 }}
        >
          Carregando banco de horas…
        </div>
      ) : erro ? (
        <div
          className="card-flat"
          style={{ textAlign: "center", padding: "32px 16px", color: "var(--red)", fontSize: 14 }}
        >
          {erro}
        </div>
      ) : dados ? (
        <>
          {/* Saldo atual do ciclo */}
          <div className="card-flat" style={{ marginBottom: 16 }}>
            <p className="eyebrow" style={{ marginBottom: 10 }}>
              Saldo Atual do Ciclo
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 40,
                  lineHeight: 1,
                  color: saldo >= 0 ? "var(--green)" : "var(--red)"
                }}
              >
                {toHM(saldo)}
              </p>
              <span className={saldo >= 0 ? "badge badge-green" : "badge badge-red"}>
                {saldo >= 0 ? "Positivo" : "Negativo"}
              </span>
              {excedeLimite && (
                <span className="badge badge-amber" style={{ display: "inline-flex", gap: 4 }}>
                  <AlertCircleIcon size={12} />
                  Excede o limite de {toHM(dados.limiteMinutos)}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-700)" }}>
              <CalendarIcon size={14} style={{ color: "var(--burgundy-600)" }} />
              <p style={{ fontSize: 13 }}>
                {dados.cicloInicio
                  ? `Ciclo desde ${fmtData(dados.cicloInicio)}`
                  : dados.inicioAtividades
                    ? `Ciclo desde o primeiro acesso (${fmtData(dados.inicioAtividades)})`
                    : "Ciclo desde o primeiro acesso"}
                {dados.proximaZeragem
                  ? ` · próxima zeragem em ${fmtData(dados.proximaZeragem)}`
                  : " · sem data de zeragem configurada"}
              </p>
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 8 }}>
              Limite tolerado: ±{toHM(dados.limiteMinutos)}
            </p>
          </div>

          {/* Detalhamento mensal */}
          <div className="card-flat">
            {/* Navegação mês */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
                flexWrap: "wrap"
              }}
            >
              <button
                className="btn-icon"
                onClick={() => navMes(-1)}
                disabled={!podeAnterior}
                style={{
                  background: "white",
                  border: "1px solid rgba(122,30,38,0.12)",
                  flexShrink: 0,
                  opacity: podeAnterior ? 1 : 0.35
                }}
              >
                <ArrowLeftIcon size={16} />
              </button>

              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontSize: isMobile ? 17 : 20,
                  color: "var(--burgundy-600)",
                  textTransform: "capitalize",
                  flex: 1,
                  textAlign: "center",
                  minWidth: 0
                }}
              >
                {mesAtivo ? fmtMes(mesAtivo) : "—"}
              </p>

              <button
                className="btn-icon"
                onClick={() => navMes(1)}
                disabled={!podePosterior}
                style={{
                  background: "white",
                  border: "1px solid rgba(122,30,38,0.12)",
                  flexShrink: 0,
                  opacity: podePosterior ? 1 : 0.35
                }}
              >
                <ArrowRightIcon size={16} />
              </button>

              {!isMobile && mesAtivo && (
                <div
                  style={{
                    marginLeft: 8,
                    display: "flex",
                    gap: 8,
                    flexShrink: 0,
                    flexWrap: "wrap"
                  }}
                >
                  <span className="badge badge-gray">Trabalhado: {toHM(totalTrabalhado)}</span>
                  <span className="badge badge-gray">
                    Saldo do mês:{" "}
                    <strong style={{ color: saldoMes >= 0 ? "var(--green)" : "var(--red)" }}>
                      {toHM(saldoMes)}
                    </strong>
                  </span>
                  <span className={saldoFinalMes >= 0 ? "badge badge-green" : "badge badge-red"}>
                    Acumulado: {toHM(saldoFinalMes)}
                  </span>
                </div>
              )}
            </div>

            {/* Resumo mobile */}
            {isMobile && mesAtivo && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <span className="badge badge-gray">Trab.: {toHM(totalTrabalhado)}</span>
                <span className="badge badge-gray">Esp.: {toHM(totalEsperado)}</span>
                <span className={saldoMes >= 0 ? "badge badge-green" : "badge badge-red"}>
                  Mês: {toHM(saldoMes)}
                </span>
                <span className={saldoFinalMes >= 0 ? "badge badge-green" : "badge badge-red"}>
                  Acum.: {toHM(saldoFinalMes)}
                </span>
              </div>
            )}

            {/* Saldo transportado do mês anterior */}
            {idxAtivo > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "rgba(122,30,38,0.03)",
                  borderRadius: "var(--radius-md)",
                  marginBottom: 10,
                  border: "1px dashed rgba(122,30,38,0.12)"
                }}
              >
                <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                  Saldo transportado ({fmtMes(mesesDisponiveis[idxAtivo - 1])})
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: saldoAnterior >= 0 ? "var(--green)" : "var(--red)"
                  }}
                >
                  {toHM(saldoAnterior)}
                </span>
              </div>
            )}

            {diasMes.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-500)",
                  textAlign: "center",
                  padding: 24
                }}
              >
                {mesesDisponiveis.length === 0
                  ? "Nenhum registro no ciclo atual."
                  : "Nenhum dia útil neste mês."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table-cfo" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Trabalhado</th>
                      <th>Esperado</th>
                      <th>Saldo do Dia</th>
                      <th>Saldo Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diasMes.map((d) => {
                      const neutro = !!d.observacao;
                      return (
                        <tr
                          key={d.data}
                          style={neutro ? { background: "rgba(247,196,55,0.06)" } : undefined}
                        >
                          <td style={{ textTransform: "capitalize" }}>
                            {fmtData(d.data)}
                            {d.observacao && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: "#8a6a00",
                                  background: "rgba(247,196,55,0.18)",
                                  padding: "2px 6px",
                                  borderRadius: 4
                                }}
                              >
                                {d.observacao}
                              </span>
                            )}
                          </td>
                          <td>{toHM(d.horasTrabalhadasMinutos)}</td>
                          <td>{neutro ? "—" : toHM(d.jornadaEsperadaMinutos)}</td>
                          <td
                            style={{
                              color: neutro
                                ? "var(--ink-500)"
                                : d.saldoDiaMinutos >= 0
                                  ? "var(--green)"
                                  : "var(--red)"
                            }}
                          >
                            {neutro ? "—" : toHM(d.saldoDiaMinutos)}
                          </td>
                          <td
                            style={{
                              color: d.saldoAcumuladoMinutos >= 0 ? "var(--green)" : "var(--red)",
                              fontWeight: 600
                            }}
                          >
                            {toHM(d.saldoAcumuladoMinutos)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid rgba(122,30,38,0.10)" }}>
                      <td
                        style={{
                          padding: "10px 14px",
                          fontWeight: 600,
                          fontSize: 12,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          color: "var(--ink-500)"
                        }}
                      >
                        Total do mês
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                        {toHM(totalTrabalhado)}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                        {toHM(totalEsperado)}
                      </td>
                      <td
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          color: saldoMes >= 0 ? "var(--green)" : "var(--red)"
                        }}
                      >
                        {toHM(saldoMes)}
                      </td>
                      <td
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          color: saldoFinalMes >= 0 ? "var(--green)" : "var(--red)"
                        }}
                      >
                        {toHM(saldoFinalMes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { nomeArquivoRelatorioCiclo, nomeArquivoRelatorioMes } from "../../utils/nomeArquivo";
import { Navigate } from "react-router-dom";
import { CalendarIcon, ChevronDownIcon, Edit2Icon, DownloadIcon } from "../../components/icons";
import {
  PendenciasAssinatura,
  resumoPendencias,
  type PendenciasFolha
} from "../../components/PendenciasAssinatura";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { categoriaSemVisibilidadeBancoHoras } from "../../utils/categoriaPonto";
import { hojeBrasiliaISO } from "../../utils/horario-brasilia";

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
const fmtDataCurta = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
const fmtPeriodo = (inicio: string, fim: string) =>
  `${fmtDataCurta(inicio)} – ${fmtDataCurta(fim)}`;
const fmtMes = (yyyyMM: string) => {
  const [year, month] = yyyyMM.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
};
function mesesIsoNoIntervalo(inicioIso: string, fimIso: string): string[] {
  const out: string[] = [];
  let [y, m] = inicioIso.slice(0, 7).split("-").map(Number);
  const [yFim, mFim] = fimIso.slice(0, 7).split("-").map(Number);
  while (y < yFim || (y === yFim && m <= mFim)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** YYYY-MM já fechado (anterior ao mês civil atual em Brasília). */
function mesJaFechado(yyyyMM: string, hojeIso = hojeBrasiliaISO()): boolean {
  return yyyyMM < hojeIso.slice(0, 7);
}

const mesesDeDias = (dias: DiaBanco[]) => [...new Set(dias.map((d) => d.data.slice(0, 7)))].sort();
const chaveMes = (cicloInicio: string, yyyyMM: string) => `${cicloInicio}|${yyyyMM}`;

const badgeResumoStyle: React.CSSProperties = {
  fontSize: 13.2,
  padding: "2.4px 9.6px",
  gap: 4.8
};

/** Mesmo padrão do Histórico — chama atenção para a assinatura. */
const btnAssinarQuadroStyle: React.CSSProperties = {
  background: "#D97706",
  color: "white",
  border: "none",
  gap: 6,
  flexShrink: 0,
  fontWeight: 600
};

const btnAssinarQuadroDesabilitadoStyle: React.CSSProperties = {
  background: "#E5E7EB",
  color: "#6B7280",
  border: "none",
  gap: 6,
  flexShrink: 0,
  fontWeight: 600,
  cursor: "not-allowed",
  opacity: 0.95
};

/* ─── Types ─── */
interface DiaBanco {
  data: string;
  horasTrabalhadasMinutos: number;
  jornadaEsperadaMinutos: number;
  saldoDiaMinutos: number;
  saldoAcumuladoMinutos: number;
  observacao?: string;
  /** Linha afetada por liberação/revogação de tempo do banco pelo RH. */
  liberacaoRh?: boolean;
}

interface CreditoBancoRh {
  disponivelMinutos: number;
  temLiberacao: boolean;
  liberacoes: Array<{ validaAte: string; disponivelMinutos: number }>;
}

interface CicloBancoHoras {
  inicio: string;
  fim: string;
  atual: boolean;
  saldoMinutos?: number | null;
}

interface ApiBancoHoras {
  saldoAtualMinutos: number;
  cicloInicio: string | null;
  cicloFim?: string | null;
  cicloAtual?: boolean;
  inicioAtividades?: string;
  proximaZeragem: string | null;
  tipoFlexibilidade: string;
  ciclos?: CicloBancoHoras[];
  dias: DiaBanco[];
}

type StatusAssinatura = "PENDENTE_FUNCIONARIO" | "PENDENTE_GESTOR" | "CONCLUIDA" | "DISPENSADA";

interface AssinaturaCicloMes {
  id: string;
  status: StatusAssinatura;
  saldoRegularizado?: boolean;
  /** O que impede a assinatura (dias e solicitações do mês em andamento). */
  pendencias?: PendenciasFolha | null;
  bancoHorasSaldoTotalMinutos: number;
  assinadoFuncionarioEm: string | null;
  periodo: {
    mes: number;
    ano: number;
    horasTrabalhadasMinutos: number;
    diasTrabalhados: number;
  };
  /** Alinhado ao PDF da folha (mês civil). */
  folhaResumo?: {
    diasOk: number;
    diasTrabalhados: number;
    horasTrabalhadasMinutos: number;
    saldoMinutos: number;
  };
}

function fmtBH(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}min`;
}

function fmtHorasNeutro(min: number): string {
  const abs = Math.abs(min);
  return `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

function ModalAssinarFolhaCiclo({
  assinatura,
  onClose,
  onConfirm,
  loading
}: {
  assinatura: AssinaturaCicloMes;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const { token } = useAuth();
  const nomeMes = new Date(assinatura.periodo.ano, assinatura.periodo.mes - 1).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" }
  );
  const [resumo, setResumo] = useState(assinatura.folhaResumo ?? null);
  const [carregandoResumo, setCarregandoResumo] = useState(!assinatura.folhaResumo);

  useEffect(() => {
    if (assinatura.folhaResumo) {
      setResumo(assinatura.folhaResumo);
      setCarregandoResumo(false);
      return;
    }
    const tk = token();
    if (!tk) {
      setCarregandoResumo(false);
      return;
    }
    let cancel = false;
    setCarregandoResumo(true);
    api
      .get<{
        diasTrabalhados: number;
        diasOk?: number;
        horasTrabalhadasMinutos: number;
        saldoMinutos: number;
      }>(`/ponto/relatorio?mes=${assinatura.periodo.mes}&ano=${assinatura.periodo.ano}`, tk)
      .then((r) => {
        if (cancel || !r) return;
        setResumo({
          diasOk: r.diasOk ?? r.diasTrabalhados,
          diasTrabalhados: r.diasTrabalhados,
          horasTrabalhadasMinutos: r.horasTrabalhadasMinutos,
          saldoMinutos: r.saldoMinutos
        });
      })
      .catch(() => {
        if (!cancel) {
          setResumo({
            diasOk: assinatura.periodo.diasTrabalhados,
            diasTrabalhados: assinatura.periodo.diasTrabalhados,
            horasTrabalhadasMinutos: assinatura.periodo.horasTrabalhadasMinutos,
            saldoMinutos: 0
          });
        }
      })
      .finally(() => {
        if (!cancel) setCarregandoResumo(false);
      });
    return () => {
      cancel = true;
    };
  }, [assinatura, token]);

  const diasTrabalhados = resumo?.diasTrabalhados ?? assinatura.periodo.diasTrabalhados;
  const horasTrab = resumo?.horasTrabalhadasMinutos ?? assinatura.periodo.horasTrabalhadasMinutos;
  const saldoMes = resumo?.saldoMinutos ?? 0;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: "28px 28px 24px",
          maxWidth: 460,
          width: "100%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            marginBottom: 4,
            color: "var(--burgundy-700)"
          }}
        >
          Assinar folha de ponto
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-500)",
            marginBottom: 20,
            textTransform: "capitalize"
          }}
        >
          {nomeMes}
        </p>
        <div
          style={{
            background: "var(--ink-50, #f9fafb)",
            borderRadius: 8,
            padding: "14px 16px",
            marginBottom: 20,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px 20px",
            opacity: carregandoResumo ? 0.55 : 1
          }}
        >
          <div>
            <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>
              Dias trabalhados
            </p>
            <p style={{ fontSize: 15, fontWeight: 700 }}>
              {carregandoResumo ? "…" : diasTrabalhados}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>
              Horas trabalhadas
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {carregandoResumo ? "…" : fmtHorasNeutro(horasTrab)}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>Saldo do mês</p>
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: saldoMes >= 0 ? "#15803D" : "#B91C1C"
              }}
            >
              {carregandoResumo ? "…" : fmtBH(saldoMes)}
            </p>
          </div>
          {resumo != null && !carregandoResumo && (
            <div>
              <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>Dias OK</p>
              <p style={{ fontSize: 15, fontWeight: 700 }}>{resumo.diasOk}</p>
            </div>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-600)", marginBottom: 12, lineHeight: 1.6 }}>
          Ao assinar, confirmo que li e estou de acordo com os registros de ponto deste mês (mesmos
          valores do relatório da folha). Em seguida, a folha segue para o{" "}
          <strong>chefe da área</strong> assinar.
        </p>
        <div
          style={{
            marginBottom: 24,
            padding: "10px 12px",
            background: "#FEF3C7",
            border: "1px solid #D97706",
            borderLeft: "4px solid #B45309",
            borderRadius: 8,
            color: "#92400E",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.45
          }}
        >
          Atenção: depois de assinar, não será mais possível solicitar correção deste período.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn btn-sm"
            onClick={onConfirm}
            disabled={loading || carregandoResumo}
            style={btnAssinarQuadroStyle}
          >
            <Edit2Icon size={13} />
            {loading ? "Assinando…" : "Assinar Quadro"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ResumoMesCicloModal {
  yyyyMM: string;
  label: string;
  trabalhadoMin: number;
  saldoMesMin: number;
  acumuladoMin: number;
  situacao: string;
}

function ModalAssinarCiclo({
  inicio,
  fim,
  meses,
  saldoCiclo,
  onClose,
  onConfirm,
  loading
}: {
  inicio: string;
  fim: string;
  meses: ResumoMesCicloModal[];
  saldoCiclo: number;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: "28px 28px 24px",
          maxWidth: 520,
          width: "100%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          maxHeight: "90vh",
          overflow: "auto"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            marginBottom: 4,
            color: "var(--burgundy-700)"
          }}
        >
          Assinar relatório do ciclo
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16 }}>
          {fmtPeriodo(inicio, fim)}
        </p>
        <div
          style={{
            background: "var(--ink-50, #f9fafb)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 14
          }}
        >
          <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 4 }}>
            Resumo do ciclo (confirmação)
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {meses.map((m) => (
              <div
                key={m.yyyyMM}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  paddingBottom: 8
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    color: "var(--burgundy-600)",
                    textTransform: "capitalize",
                    fontSize: 14
                  }}
                >
                  {m.label}
                </span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                  <span className="badge badge-gray" style={badgeResumoStyle}>
                    Trab.: {toHM(m.trabalhadoMin)}
                  </span>
                  <span
                    className={m.saldoMesMin >= 0 ? "badge badge-green" : "badge badge-red"}
                    style={badgeResumoStyle}
                  >
                    Mês: {toHM(m.saldoMesMin)}
                  </span>
                  <span
                    className={m.acumuladoMin >= 0 ? "badge badge-green" : "badge badge-red"}
                    style={badgeResumoStyle}
                  >
                    Acum.: {toHM(m.acumuladoMin)}
                  </span>
                  <span className="badge badge-green" style={badgeResumoStyle}>
                    {m.situacao}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p
            style={{
              marginTop: 10,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: saldoCiclo >= 0 ? "#15803D" : "#B91C1C"
            }}
          >
            Saldo do ciclo: {fmtBH(saldoCiclo)}
          </p>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-600)", marginBottom: 12, lineHeight: 1.6 }}>
          Ao confirmar, você assina o <strong>relatório do ciclo</strong> (somente funcionário). O
          documento assinado fica disponível ao RH. Esta ação só é possível com todos os meses do
          ciclo fechados e com folhas concluídas (você + chefe da área).
        </p>
        <div
          style={{
            marginBottom: 24,
            padding: "10px 12px",
            background: "#FEF3C7",
            border: "1px solid #D97706",
            borderLeft: "4px solid #B45309",
            borderRadius: 8,
            color: "#92400E",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.45
          }}
        >
          Confirmação em duas etapas: revise o resumo acima antes de assinar.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn btn-sm"
            onClick={onConfirm}
            disabled={loading}
            style={btnAssinarQuadroStyle}
          >
            <Edit2Icon size={13} />
            {loading ? "Assinando…" : "Confirmar assinatura do ciclo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabelaDiasBanco({
  diasMes,
  saldoAnteriorMes,
  mesAnteriorLabel
}: {
  diasMes: DiaBanco[];
  saldoAnteriorMes: number | null;
  mesAnteriorLabel?: string;
}) {
  const totalTrabalhado = diasMes.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
  const totalEsperado = diasMes.reduce((s, d) => s + d.jornadaEsperadaMinutos, 0);
  const saldoMes = diasMes.reduce((s, d) => s + d.saldoDiaMinutos, 0);
  const saldoFinalMes = diasMes.at(-1)?.saldoAcumuladoMinutos ?? 0;

  return (
    <div>
      {saldoAnteriorMes != null && mesAnteriorLabel && (
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
          <span style={{ fontSize: 14.4, color: "var(--ink-500)" }}>
            Acumulado de {mesAnteriorLabel}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15.6,
              fontWeight: 600,
              color: saldoAnteriorMes >= 0 ? "var(--green)" : "var(--red)"
            }}
          >
            {toHM(saldoAnteriorMes)}
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
          Nenhum dia útil neste mês.
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
                const neutro = !!d.observacao && !d.liberacaoRh;
                return (
                  <tr
                    key={d.data}
                    style={
                      neutro || d.liberacaoRh ? { background: "rgba(247,196,55,0.06)" } : undefined
                    }
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
  );
}

function CardMesBanco({
  yyyyMM,
  diasCiclo,
  aberto,
  onToggle,
  isMobile,
  assinatura,
  onAssinar,
  onBaixarPdf,
  baixandoPdf,
  aguardaFechamentoMes
}: {
  yyyyMM: string;
  diasCiclo: DiaBanco[];
  aberto: boolean;
  onToggle: () => void;
  isMobile: boolean;
  assinatura?: AssinaturaCicloMes | null;
  onAssinar?: () => void;
  onBaixarPdf?: () => void;
  baixandoPdf?: boolean;
  /** Mês civil ainda em curso — folha só após o fechamento. */
  aguardaFechamentoMes?: boolean;
}) {
  const meses = mesesDeDias(diasCiclo);
  const idx = meses.indexOf(yyyyMM);
  const diasMes = diasCiclo.filter((d) => d.data.slice(0, 7) === yyyyMM);
  const totalTrabalhado = diasMes.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
  const saldoMes = diasMes.reduce((s, d) => s + d.saldoDiaMinutos, 0);
  const saldoFinalMes = diasMes.at(-1)?.saldoAcumuladoMinutos ?? 0;
  const saldoAnteriorMes =
    idx > 0
      ? (diasCiclo.filter((d) => d.data.slice(0, 7) === meses[idx - 1]).at(-1)
          ?.saldoAcumuladoMinutos ?? 0)
      : null;

  const podeAssinar =
    !!assinatura &&
    assinatura.status === "PENDENTE_FUNCIONARIO" &&
    assinatura.saldoRegularizado !== false;
  const aguardandoGestor = assinatura?.status === "PENDENTE_GESTOR";
  const assinado = assinatura?.status === "CONCLUIDA";
  const bloqueadoAssinar =
    !!assinatura &&
    assinatura.status === "PENDENTE_FUNCIONARIO" &&
    assinatura.saldoRegularizado === false;

  return (
    <div
      style={{
        border: "1px solid rgba(122,30,38,0.10)",
        borderRadius: "var(--radius-md)",
        background: aberto ? "rgba(122,30,38,0.02)" : undefined
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          flexWrap: "wrap"
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={aberto}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "none",
            border: "none",
            cursor: "pointer",
            font: "inherit",
            color: "inherit",
            textAlign: "left",
            padding: 0
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: isMobile ? 16 : 18,
              color: "var(--burgundy-600)",
              textTransform: "capitalize",
              flex: 1,
              minWidth: 0
            }}
          >
            {fmtMes(yyyyMM)}
          </span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className="badge badge-gray" style={badgeResumoStyle}>
              {isMobile ? "Trab." : "Trabalhado"}: {toHM(totalTrabalhado)}
            </span>
            <span
              className={saldoMes >= 0 ? "badge badge-green" : "badge badge-red"}
              style={badgeResumoStyle}
            >
              {isMobile ? "Mês" : "Saldo do mês"}: {toHM(saldoMes)}
            </span>
            {!isMobile && (
              <span
                className={saldoFinalMes >= 0 ? "badge badge-green" : "badge badge-red"}
                style={badgeResumoStyle}
              >
                Acumulado: {toHM(saldoFinalMes)}
              </span>
            )}
          </span>
          <ChevronDownIcon
            size={16}
            style={{
              color: "var(--burgundy-600)",
              flexShrink: 0,
              transform: aberto ? "rotate(180deg)" : "none",
              transition: "transform 160ms ease"
            }}
          />
        </button>

        {(assinatura || aguardaFechamentoMes) && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {aguardaFechamentoMes && (
              <span
                className="badge badge-gray"
                style={badgeResumoStyle}
                title="A folha mensal só pode ser assinada após o fechamento do mês"
              >
                Aguarda fechamento do mês
              </span>
            )}
            {!aguardaFechamentoMes && assinado && (
              <span className="badge badge-green" style={badgeResumoStyle}>
                Assinado
              </span>
            )}
            {!aguardaFechamentoMes && aguardandoGestor && (
              <span
                className="badge badge-blue"
                style={badgeResumoStyle}
                title="Aguardando assinatura do chefe da área"
              >
                Aguardando chefe
              </span>
            )}
            {!aguardaFechamentoMes && bloqueadoAssinar && (
              <span
                className="badge badge-red"
                style={badgeResumoStyle}
                title={resumoPendencias(assinatura?.pendencias)}
              >
                Pendências
              </span>
            )}
            {!aguardaFechamentoMes && podeAssinar && onAssinar && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAssinar();
                }}
                style={{ ...btnAssinarQuadroStyle, padding: "6px 12px" }}
              >
                <Edit2Icon size={13} />
                Assinar Quadro
              </button>
            )}
            {!aguardaFechamentoMes &&
              (assinado || podeAssinar || bloqueadoAssinar || aguardandoGestor) &&
              onBaixarPdf && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBaixarPdf();
                  }}
                  disabled={baixandoPdf}
                  title={assinado ? "Baixar folha assinada" : "Baixar rascunho da folha"}
                  style={{ gap: 4, padding: "4px 8px" }}
                >
                  <DownloadIcon size={12} />
                  PDF
                </button>
              )}
          </span>
        )}
      </div>
      {aberto && (
        <div style={{ padding: "0 14px 14px" }}>
          {bloqueadoAssinar && (
            <div style={{ margin: "0 0 10px" }}>
              <strong style={{ fontSize: 12.5, color: "var(--ink-900)" }}>
                Para assinar esta folha, regularize:
              </strong>
              <PendenciasAssinatura pendencias={assinatura?.pendencias} />
            </div>
          )}
          <TabelaDiasBanco
            diasMes={diasMes}
            saldoAnteriorMes={saldoAnteriorMes}
            mesAnteriorLabel={idx > 0 ? fmtMes(meses[idx - 1]) : undefined}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Page ─── */
export function BancoHorasPage() {
  const isMobile = useIsMobile(768);
  const { token } = useAuth();
  const [dados, setDados] = useState<ApiBancoHoras | null>(null);
  const [ciclos, setCiclos] = useState<CicloBancoHoras[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [cicloAberto, setCicloAberto] = useState<string | null>(null);
  const [mesAberto, setMesAberto] = useState<string | null>(null);
  const [detalhesCiclo, setDetalhesCiclo] = useState<Record<string, ApiBancoHoras>>({});
  const [carregandoCiclo, setCarregandoCiclo] = useState<string | null>(null);
  const [assinaturasCiclo, setAssinaturasCiclo] = useState<Record<string, AssinaturaCicloMes[]>>(
    {}
  );
  const [modalAssinar, setModalAssinar] = useState<AssinaturaCicloMes | null>(null);
  const [loadingAssinar, setLoadingAssinar] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState<string | null>(null);
  const [assinaturasCicloDoc, setAssinaturasCicloDoc] = useState<
    Record<string, { id: string; assinadoEm: string; saldoCicloMinutos: number } | null>
  >({});
  const [modalAssinarCiclo, setModalAssinarCiclo] = useState<{
    inicio: string;
    fim: string;
    meses: ResumoMesCicloModal[];
    saldoCiclo: number;
  } | null>(null);
  const [loadingAssinarCiclo, setLoadingAssinarCiclo] = useState(false);
  const [baixandoRelatorioCiclo, setBaixandoRelatorioCiclo] = useState<string | null>(null);
  const [credito, setCredito] = useState<CreditoBancoRh | null>(null);

  useEffect(() => {
    const tk = token();
    if (!tk) return;
    api
      .get<CreditoBancoRh>("/ponto/banco-horas/credito", tk)
      .then(setCredito)
      .catch(() => setCredito(null));
  }, []);

  const abrirUltimoMes = (cicloInicio: string, dias: DiaBanco[]) => {
    const meses = mesesDeDias(dias);
    setMesAberto(meses.length ? chaveMes(cicloInicio, meses[meses.length - 1]) : null);
  };

  useEffect(() => {
    const tk = token();
    if (!tk) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<{ categoria?: string }>("/ponto/status", tk)
      .then((status) => {
        if (categoriaSemVisibilidadeBancoHoras(status?.categoria)) {
          setBloqueado(true);
          return null;
        }
        return api.get<ApiBancoHoras>("/ponto/banco-horas", tk);
      })
      .then((d) => {
        if (!d) return;
        setDados(d);
        setCiclos(d.ciclos ?? []);
        const inicio = d.cicloInicio ?? d.inicioAtividades ?? "atual";
        abrirUltimoMes(inicio, d.dias);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  const carregarAssinaturasCiclo = useCallback(
    (inicio: string, fim: string) => {
      const tk = token();
      if (!tk) return;
      api
        .get<AssinaturaCicloMes[]>(
          `/ponto/assinaturas/ciclo-banco-horas?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
          tk
        )
        .then((lista) => {
          setAssinaturasCiclo((prev) => ({ ...prev, [inicio]: lista }));
        })
        .catch(() => {
          setAssinaturasCiclo((prev) => ({ ...prev, [inicio]: [] }));
        });
      api
        .get<{ id: string; assinadoEm: string; saldoCicloMinutos: number } | null>(
          `/ponto/assinaturas/ciclo-banco-horas/assinatura?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
          tk
        )
        .then((doc) => {
          setAssinaturasCicloDoc((prev) => ({ ...prev, [inicio]: doc ?? null }));
        })
        .catch(() => {
          setAssinaturasCicloDoc((prev) => ({ ...prev, [inicio]: null }));
        });
    },
    [token]
  );

  const carregarCicloAnterior = useCallback(
    (inicio: string, fim: string) => {
      if (detalhesCiclo[inicio]) {
        abrirUltimoMes(inicio, detalhesCiclo[inicio].dias);
        if (!assinaturasCiclo[inicio]) carregarAssinaturasCiclo(inicio, fim);
        return;
      }
      const tk = token();
      if (!tk) return;
      setCarregandoCiclo(inicio);
      api
        .get<ApiBancoHoras>(`/ponto/banco-horas?cicloInicio=${encodeURIComponent(inicio)}`, tk)
        .then((d) => {
          setDetalhesCiclo((prev) => ({ ...prev, [inicio]: d }));
          abrirUltimoMes(inicio, d.dias);
          carregarAssinaturasCiclo(inicio, fim);
        })
        .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar o ciclo"))
        .finally(() => setCarregandoCiclo(null));
    },
    [detalhesCiclo, assinaturasCiclo, token, carregarAssinaturasCiclo]
  );

  function toggleCiclo(inicio: string, fim: string) {
    if (cicloAberto === inicio) {
      setCicloAberto(null);
      if (dados) {
        const idAtual = dados.cicloInicio ?? dados.inicioAtividades ?? "atual";
        abrirUltimoMes(idAtual, dados.dias);
      }
      return;
    }
    setCicloAberto(inicio);
    setErro(null);
    carregarCicloAnterior(inicio, fim);
  }

  function toggleMes(chave: string) {
    setMesAberto((atual) => (atual === chave ? null : chave));
  }

  function assinaturaDoMes(cicloInicio: string, yyyyMM: string): AssinaturaCicloMes | null {
    const [ano, mes] = yyyyMM.split("-").map(Number);
    return (
      assinaturasCiclo[cicloInicio]?.find((a) => a.periodo.mes === mes && a.periodo.ano === ano) ??
      null
    );
  }

  function resumoAssinaturas(cicloInicio: string, cicloFim: string) {
    const meses = mesesIsoNoIntervalo(cicloInicio, cicloFim);
    const lista = assinaturasCiclo[cicloInicio] ?? [];
    let assinadas = 0;
    let aguardaFechamento = 0;
    let pendentesFolha = 0;
    for (const yyyyMM of meses) {
      if (!mesJaFechado(yyyyMM)) {
        aguardaFechamento += 1;
        continue;
      }
      const [ano, mes] = yyyyMM.split("-").map(Number);
      const a = lista.find((x) => x.periodo.mes === mes && x.periodo.ano === ano);
      if (a?.status === "CONCLUIDA") assinadas += 1;
      else pendentesFolha += 1;
    }
    return {
      total: meses.length,
      assinadas,
      aguardaFechamento,
      pendentesFolha,
      pendentes: aguardaFechamento + pendentesFolha
    };
  }

  async function confirmarAssinatura() {
    if (!modalAssinar || !cicloAberto) return;
    setLoadingAssinar(true);
    try {
      const updated = await api.post<AssinaturaCicloMes>(
        `/ponto/assinaturas/${modalAssinar.id}/assinar`,
        {}
      );
      setAssinaturasCiclo((prev) => ({
        ...prev,
        [cicloAberto]: (prev[cicloAberto] ?? []).map((a) =>
          a.id === updated.id ? { ...a, ...updated } : a
        )
      }));
      setModalAssinar(null);
    } catch (err: unknown) {
      alert((err as { message?: string })?.message ?? "Erro ao assinar. Tente novamente.");
    } finally {
      setLoadingAssinar(false);
    }
  }

  async function confirmarAssinaturaCiclo() {
    if (!modalAssinarCiclo) return;
    setLoadingAssinarCiclo(true);
    try {
      const doc = await api.post<{ id: string; assinadoEm: string; saldoCicloMinutos: number }>(
        `/ponto/assinaturas/ciclo-banco-horas/assinar`,
        { inicio: modalAssinarCiclo.inicio, fim: modalAssinarCiclo.fim }
      );
      setAssinaturasCicloDoc((prev) => ({
        ...prev,
        [modalAssinarCiclo.inicio]: doc
      }));
      setModalAssinarCiclo(null);
    } catch (err: unknown) {
      alert((err as { message?: string })?.message ?? "Erro ao assinar o ciclo. Tente novamente.");
    } finally {
      setLoadingAssinarCiclo(false);
    }
  }

  function abrirModalAssinarCiclo(ciclo: CicloBancoHoras, detalhe: ApiBancoHoras | undefined) {
    const mesesIso = mesesIsoNoIntervalo(ciclo.inicio, ciclo.fim);
    const dias = detalhe?.dias ?? [];
    let acum = 0;
    const meses: ResumoMesCicloModal[] = mesesIso.map((yyyyMM) => {
      const diasMes = dias.filter((d) => d.data.slice(0, 7) === yyyyMM);
      const trabalhadoMin = diasMes.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
      const saldoMesMin = diasMes.reduce((s, d) => s + d.saldoDiaMinutos, 0);
      acum = diasMes.at(-1)?.saldoAcumuladoMinutos ?? acum + saldoMesMin;
      const ass = assinaturaDoMes(ciclo.inicio, yyyyMM);
      return {
        yyyyMM,
        label: fmtMes(yyyyMM),
        trabalhadoMin,
        saldoMesMin,
        acumuladoMin: acum,
        situacao: ass?.status === "CONCLUIDA" ? "Assinado" : "Pendente"
      };
    });
    setModalAssinarCiclo({
      inicio: ciclo.inicio,
      fim: ciclo.fim,
      meses,
      saldoCiclo: ciclo.saldoMinutos ?? 0
    });
  }

  async function baixarPdfMes(assinatura: AssinaturaCicloMes) {
    const { mes, ano } = assinatura.periodo;
    setBaixandoPdf(assinatura.id);
    try {
      if (assinatura.status === "CONCLUIDA") {
        await api.download(
          `/ponto/assinaturas/${assinatura.id}/pdf`,
          nomeArquivoRelatorioMes(mes, ano)
        );
      } else {
        await api.download(
          `/ponto/assinaturas/rascunho-pdf?mes=${mes}&ano=${ano}`,
          nomeArquivoRelatorioMes(mes, ano, { rascunho: true })
        );
      }
    } catch (e: unknown) {
      alert("Erro ao gerar PDF: " + ((e as Error)?.message ?? "desconhecido"));
    } finally {
      setBaixandoPdf(null);
    }
  }

  async function baixarRelatorioCiclo(inicio: string, fim: string) {
    setBaixandoRelatorioCiclo(inicio);
    try {
      const assinado = !!assinaturasCicloDoc[inicio];
      await api.download(
        `/ponto/assinaturas/ciclo-banco-horas/pdf?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
        nomeArquivoRelatorioCiclo(inicio, fim, assinado)
      );
    } catch (e: unknown) {
      alert("Erro ao gerar relatório do ciclo: " + ((e as Error)?.message ?? "desconhecido"));
    } finally {
      setBaixandoRelatorioCiclo(null);
    }
  }

  if (!loading && bloqueado) {
    return <Navigate to="/ponto/historico" replace />;
  }

  const saldo = dados?.saldoAtualMinutos ?? 0;
  const listaCiclos = ciclos.length > 0 ? ciclos : (dados?.ciclos ?? []);
  const ciclosAnteriores = listaCiclos
    .filter((c) => !c.atual)
    .slice()
    .reverse();
  const saldoCicloAtualLista = listaCiclos.find((c) => c.atual)?.saldoMinutos;
  const saldoCicloAtualExibido = saldoCicloAtualLista ?? saldo;
  const cicloInicioExibido = dados?.cicloInicio ?? dados?.inicioAtividades ?? null;
  const idCicloAtual = dados?.cicloInicio ?? dados?.inicioAtividades ?? "atual";
  const mesesAtual = dados ? mesesDeDias(dados.dias) : [];

  return (
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
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
          Evolução do Banco de <em>Horas</em>
        </h1>
      </div>

      {loading ? (
        <div
          style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-500)", fontSize: 14 }}
        >
          Carregando banco de horas…
        </div>
      ) : erro && !dados ? (
        <div
          className="card-flat"
          style={{ textAlign: "center", padding: "32px 16px", color: "var(--red)", fontSize: 14 }}
        >
          {erro}
        </div>
      ) : dados ? (
        <>
          {erro && (
            <div
              className="card-flat"
              style={{
                marginBottom: 16,
                padding: "12px 16px",
                color: "var(--red)",
                fontSize: 13
              }}
            >
              {erro}
            </div>
          )}

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
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-700)" }}>
              <CalendarIcon size={14} style={{ color: "var(--burgundy-600)" }} />
              <p style={{ fontSize: 13 }}>
                {cicloInicioExibido
                  ? `Ciclo desde ${fmtData(cicloInicioExibido)}`
                  : "Ciclo desde o primeiro acesso"}
                {dados.proximaZeragem
                  ? ` · próxima zeragem em ${fmtData(dados.proximaZeragem)}`
                  : " · sem data de zeragem configurada"}
              </p>
            </div>
          </div>

          {credito?.temLiberacao && (
            <div className="card-flat" style={{ marginBottom: 16 }}>
              <p className="eyebrow" style={{ marginBottom: 8 }}>
                Tempo liberado pelo RH
              </p>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  lineHeight: 1,
                  margin: "0 0 8px",
                  color: credito.disponivelMinutos > 0 ? "var(--green)" : "var(--ink-500)"
                }}
              >
                {toHM(credito.disponivelMinutos)}
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-700)", margin: 0 }}>
                {credito.disponivelMinutos > 0
                  ? `Disponível para abono (${credito.liberacoes
                      .map((l) => `${toHM(l.disponivelMinutos)} até ${fmtData(l.validaAte)}`)
                      .join(
                        " · "
                      )}). Para usar, abra Solicitações → Abono e marque “Usar o tempo liberado pelo RH”.`
                  : "Todo o tempo liberado pelo RH já foi usado ou venceu."}{" "}
                O tempo liberado já foi descontado do saldo acima.
              </p>
            </div>
          )}

          <div className="card-flat">
            <p className="eyebrow" style={{ marginBottom: 12 }}>
              Detalhamento mensal
            </p>
            {mesesAtual.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-500)",
                  textAlign: "center",
                  padding: 24
                }}
              >
                Nenhum registro no ciclo atual.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {mesesAtual.map((yyyyMM) => (
                  <CardMesBanco
                    key={yyyyMM}
                    yyyyMM={yyyyMM}
                    diasCiclo={dados.dias}
                    aberto={mesAberto === chaveMes(idCicloAtual, yyyyMM)}
                    onToggle={() => toggleMes(chaveMes(idCicloAtual, yyyyMM))}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="card-flat" style={{ marginTop: 16 }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Ciclos anteriores
            </p>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14 }}>
              Histórico dos ciclos encerrados. Assine as folhas mensais já fechadas (você e o chefe
              da área). O Assinar Quadro do ciclo fica cinza enquanto houver mês aguardando
              fechamento ou folha pendente; só libera quando todas estiverem concluídas. Use
              Relatório para baixar o PDF do período do ciclo.
            </p>
            {ciclosAnteriores.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-500)",
                  textAlign: "center",
                  padding: "8px 0 4px"
                }}
              >
                Ainda não há ciclos anteriores. O histórico aparece após a primeira data marco.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ciclosAnteriores.map((ciclo) => {
                  const aberto = cicloAberto === ciclo.inicio;
                  const detalhe = detalhesCiclo[ciclo.inicio];
                  const carregando = carregandoCiclo === ciclo.inicio;
                  const meses = (() => {
                    const doPeriodo = mesesIsoNoIntervalo(ciclo.inicio, ciclo.fim);
                    const dosDias = detalhe ? mesesDeDias(detalhe.dias) : [];
                    return [...new Set([...doPeriodo, ...dosDias])].sort();
                  })();
                  const saldoAnterior = ciclo.saldoMinutos;
                  const resumoAss = resumoAssinaturas(ciclo.inicio, ciclo.fim);
                  const cicloTotalmenteAssinado =
                    resumoAss.total > 0 &&
                    resumoAss.pendentes === 0 &&
                    resumoAss.aguardaFechamento === 0;
                  const cicloConfirmado = !!assinaturasCicloDoc[ciclo.inicio];
                  const podeAssinarCiclo = cicloTotalmenteAssinado && !cicloConfirmado;
                  return (
                    <div
                      key={ciclo.inicio}
                      className="card-flat"
                      style={{
                        padding: 0,
                        borderColor: aberto ? "rgba(122,30,38,0.28)" : "rgba(122,30,38,0.10)",
                        background: aberto ? "rgba(122,30,38,0.04)" : undefined
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                          padding: "12px 14px",
                          flexWrap: "wrap"
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleCiclo(ciclo.inicio, ciclo.fim)}
                          aria-expanded={aberto}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            minWidth: 0,
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            font: "inherit",
                            color: "inherit",
                            textAlign: "left",
                            padding: 0
                          }}
                        >
                          <CalendarIcon
                            size={16}
                            style={{ color: "var(--burgundy-600)", flexShrink: 0 }}
                          />
                          <span>
                            <span
                              style={{
                                display: "block",
                                fontSize: 14,
                                fontWeight: 600,
                                color: "var(--ink-900)"
                              }}
                            >
                              {fmtPeriodo(ciclo.inicio, ciclo.fim)}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                              Ciclo encerrado
                              {resumoAss.total > 0
                                ? ` · ${resumoAss.assinadas}/${resumoAss.total} folhas assinadas`
                                : ""}
                              {resumoAss.aguardaFechamento > 0
                                ? ` · ${resumoAss.aguardaFechamento} mês(es) aguardando fechamento`
                                : ""}
                            </span>
                          </span>
                        </button>

                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            marginLeft: "auto",
                            flexWrap: "wrap"
                          }}
                        >
                          {cicloConfirmado ? (
                            <span
                              className="badge badge-green"
                              style={{
                                ...badgeResumoStyle,
                                fontSize: 12,
                                padding: "8px 12px",
                                fontWeight: 700
                              }}
                            >
                              Ciclo assinado
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={!podeAssinarCiclo}
                              title={
                                podeAssinarCiclo
                                  ? "Todas as folhas mensais do ciclo estão concluídas. Confirme a assinatura do ciclo."
                                  : resumoAss.aguardaFechamento > 0
                                    ? `Aguarde o fechamento de ${resumoAss.aguardaFechamento} mês(es) antes de assinar o ciclo.`
                                    : resumoAss.pendentesFolha > 0
                                      ? `Pendente: conclua ${resumoAss.pendentesFolha} folha(s) (você + chefe da área) antes de assinar o ciclo.`
                                      : "Assine todos os meses do ciclo para liberar este botão."
                              }
                              onClick={() => {
                                if (!podeAssinarCiclo) return;
                                abrirModalAssinarCiclo(ciclo, detalhe);
                              }}
                              style={{
                                ...(podeAssinarCiclo
                                  ? btnAssinarQuadroStyle
                                  : btnAssinarQuadroDesabilitadoStyle),
                                padding: "8px 14px"
                              }}
                            >
                              <Edit2Icon size={13} />
                              Assinar Quadro
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Baixar relatório do ciclo"
                            disabled={baixandoRelatorioCiclo === ciclo.inicio}
                            onClick={() => void baixarRelatorioCiclo(ciclo.inicio, ciclo.fim)}
                            style={{ gap: 4, padding: "8px 12px", flexShrink: 0 }}
                          >
                            <DownloadIcon size={13} />
                            {baixandoRelatorioCiclo === ciclo.inicio ? "Gerando…" : "Relatório"}
                          </button>

                          <span style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
                            <span>
                              <span
                                style={{
                                  display: "block",
                                  fontFamily: "var(--font-display)",
                                  fontSize: 20,
                                  lineHeight: 1,
                                  color:
                                    saldoCicloAtualExibido == null
                                      ? "var(--ink-500)"
                                      : saldoCicloAtualExibido >= 0
                                        ? "var(--green)"
                                        : "var(--red)"
                                }}
                              >
                                {saldoCicloAtualExibido == null
                                  ? "—"
                                  : toHM(saldoCicloAtualExibido)}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>atual</span>
                            </span>
                            <span
                              style={{
                                width: 1,
                                background: "rgba(122,30,38,0.10)",
                                flexShrink: 0
                              }}
                            />
                            <span>
                              <span
                                style={{
                                  display: "block",
                                  fontFamily: "var(--font-display)",
                                  fontSize: 20,
                                  lineHeight: 1,
                                  color:
                                    saldoAnterior == null
                                      ? "var(--ink-500)"
                                      : saldoAnterior >= 0
                                        ? "var(--green)"
                                        : "var(--red)"
                                }}
                              >
                                {saldoAnterior == null ? "—" : toHM(saldoAnterior)}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                                anterior
                              </span>
                            </span>
                          </span>

                          <button
                            type="button"
                            onClick={() => toggleCiclo(ciclo.inicio, ciclo.fim)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              color: "var(--burgundy-600)",
                              fontSize: 12,
                              fontWeight: 600,
                              flexShrink: 0,
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              font: "inherit"
                            }}
                          >
                            {aberto ? "Recolher" : "Ver detalhes"}
                            <ChevronDownIcon
                              size={14}
                              style={{
                                transform: aberto ? "rotate(180deg)" : "none",
                                transition: "transform 160ms ease"
                              }}
                            />
                          </button>
                        </span>
                      </div>

                      {aberto && (
                        <div style={{ padding: "0 14px 14px" }}>
                          {carregando && !detalhe ? (
                            <p
                              style={{
                                fontSize: 13,
                                color: "var(--ink-500)",
                                textAlign: "center",
                                padding: 16
                              }}
                            >
                              Carregando ciclo…
                            </p>
                          ) : !detalhe ? (
                            <p
                              style={{
                                fontSize: 13,
                                color: "var(--ink-500)",
                                textAlign: "center",
                                padding: 16
                              }}
                            >
                              Nenhum registro neste ciclo.
                            </p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <p style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 4 }}>
                                Assine só os meses já fechados. Se o ciclo cortou o mês em curso
                                (ex.: virada no dia 19), esse mês aguarda o fechamento civil antes
                                da assinatura da folha.
                              </p>
                              {meses.map((yyyyMM) => {
                                const aguardaFechamento = !mesJaFechado(yyyyMM);
                                const ass = aguardaFechamento
                                  ? null
                                  : assinaturaDoMes(ciclo.inicio, yyyyMM);
                                return (
                                  <CardMesBanco
                                    key={yyyyMM}
                                    yyyyMM={yyyyMM}
                                    diasCiclo={detalhe.dias}
                                    aberto={mesAberto === chaveMes(ciclo.inicio, yyyyMM)}
                                    onToggle={() => toggleMes(chaveMes(ciclo.inicio, yyyyMM))}
                                    isMobile={isMobile}
                                    assinatura={ass}
                                    aguardaFechamentoMes={aguardaFechamento}
                                    onAssinar={
                                      ass
                                        ? () => {
                                            setModalAssinar(ass);
                                          }
                                        : undefined
                                    }
                                    onBaixarPdf={ass ? () => baixarPdfMes(ass) : undefined}
                                    baixandoPdf={baixandoPdf === ass?.id}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {modalAssinar && (
        <ModalAssinarFolhaCiclo
          assinatura={modalAssinar}
          onClose={() => setModalAssinar(null)}
          onConfirm={() => void confirmarAssinatura()}
          loading={loadingAssinar}
        />
      )}
      {modalAssinarCiclo && (
        <ModalAssinarCiclo
          inicio={modalAssinarCiclo.inicio}
          fim={modalAssinarCiclo.fim}
          meses={modalAssinarCiclo.meses}
          saldoCiclo={modalAssinarCiclo.saldoCiclo}
          onClose={() => setModalAssinarCiclo(null)}
          onConfirm={() => void confirmarAssinaturaCiclo()}
          loading={loadingAssinarCiclo}
        />
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import {
  FilterIcon,
  DownloadIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  InfoIcon,
  Edit2Icon
} from "../../components/icons";
import { useIsMobile } from "../../hooks/useIsMobile";
import { api } from "../../hooks/useApi";

/* ─── Types ─── */
type StatusDia = "OK" | "FALTA" | "PENDENTE" | "AFASTAMENTO" | "FERIADO" | "FUTURO";

interface ObservacaoRegistro {
  data: string;
  texto: string;
  tipo?: string;
  tipoRegistro?: string;
  horarioAnterior?: string | null;
  horarioNovo?: string;
}

interface DiaRegistro {
  data: string;
  diaSemana: string;
  entrada: string | null;
  inicioIntervalo: string | null;
  fimIntervalo: string | null;
  saida: string | null;
  horasMin: number;
  jornadaMin: number;
  status: StatusDia;
  obs?: string;
  observacoes?: ObservacaoRegistro[];
  entradaEditada?: boolean;
  inicioIntervaloEditado?: boolean;
  fimIntervaloEditado?: boolean;
  saidaEditada?: boolean;
}

interface ApiRegistro {
  tipo: string;
  dataHora: string;
  ajustado?: boolean;
  observacoes?: ObservacaoRegistro[];
}

/* ─── Transformação da resposta da API ─── */
function toMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

function dataBrasiliaKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

function transformarHistorico(registros: ApiRegistro[], mes: number, ano: number): DiaRegistro[] {
  const hoje = new Date();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const NOMES_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const result: DiaRegistro[] = [];

  /* Agrupa registros por dia civil em Brasília */
  const byDay: Record<string, ApiRegistro[]> = {};
  for (const r of registros) {
    const key = dataBrasiliaKey(r.dataHora);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(r);
  }

  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, mes - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue; // pula fins de semana

    const isFuture = dt > hoje;
    const isoKey = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dataStr = `${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
    const diaSemana = NOMES_DIA[dow];
    const dayRegs = byDay[isoKey] ?? [];

    if (isFuture) {
      result.push({
        data: dataStr,
        diaSemana,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: 480,
        status: "FUTURO"
      });
      continue;
    }

    if (dayRegs.length === 0) {
      result.push({
        data: dataStr,
        diaSemana,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: 480,
        status: "FALTA",
        obs: "Ausência não registrada"
      });
      continue;
    }

    const get = (tipo: string) => dayRegs.find((r) => r.tipo === tipo);
    const entradaR = get("ENTRADA");
    const iniAlmR = get("INICIO_INTERVALO");
    const fimAlmR = get("FIM_INTERVALO");
    const saidaR = get("SAIDA");

    const entrada = entradaR ? fmtHora(entradaR.dataHora) : null;
    const inicioIntervalo = iniAlmR ? fmtHora(iniAlmR.dataHora) : null;
    const fimIntervalo = fimAlmR ? fmtHora(fimAlmR.dataHora) : null;
    const saida = saidaR ? fmtHora(saidaR.dataHora) : null;

    let horasMin = 0;
    if (entrada && saida) {
      const intervalo =
        inicioIntervalo && fimIntervalo ? toMin(fimIntervalo) - toMin(inicioIntervalo) : 0;
      horasMin = toMin(saida) - toMin(entrada) - intervalo;
    } else if (entrada) {
      const now = hoje.getHours() * 60 + hoje.getMinutes();
      const intervalo =
        inicioIntervalo && fimIntervalo ? toMin(fimIntervalo) - toMin(inicioIntervalo) : 0;
      horasMin = now - toMin(entrada) - intervalo;
    }

    const isHoje = dt.toDateString() === hoje.toDateString();
    const status: StatusDia = saida ? "OK" : isHoje || dayRegs.length > 0 ? "PENDENTE" : "FALTA";

    const observacoesDia = dayRegs.flatMap((r) => r.observacoes ?? []);

    result.push({
      data: dataStr,
      diaSemana,
      entrada,
      inicioIntervalo,
      fimIntervalo,
      saida,
      horasMin: Math.max(0, horasMin),
      jornadaMin: 480,
      status,
      observacoes: observacoesDia.length ? observacoesDia : undefined,
      entradaEditada: !!entradaR?.ajustado,
      inicioIntervaloEditado: !!iniAlmR?.ajustado,
      fimIntervaloEditado: !!fimAlmR?.ajustado,
      saidaEditada: !!saidaR?.ajustado
    });
  }

  return result;
}

/* ─── Sub-componentes ─── */
function StatusPill({ status }: { status: StatusDia }) {
  const map: Record<StatusDia, { label: string; cls: string }> = {
    OK: { label: "OK", cls: "badge-green" },
    FALTA: { label: "Falta", cls: "badge-red" },
    PENDENTE: { label: "Pendente", cls: "badge-amber" },
    AFASTAMENTO: { label: "Afastamento", cls: "badge-blue" },
    FERIADO: { label: "Feriado", cls: "badge-gray" },
    FUTURO: { label: "—", cls: "badge-gray" }
  };
  const { label, cls } = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function SaldoCell({
  trabMin,
  jornadaMin,
  status
}: {
  trabMin: number;
  jornadaMin: number;
  status: StatusDia;
}) {
  if (status === "FUTURO") return <span style={{ color: "var(--ink-500)" }}>—</span>;
  if (status === "FALTA") return <span className="text-red">−8h00</span>;
  const saldo = trabMin - jornadaMin;
  const h = Math.floor(Math.abs(saldo) / 60);
  const m = Math.abs(saldo) % 60;
  return (
    <span
      style={{
        color: saldo >= 0 ? "var(--green)" : "var(--red)",
        fontFamily: "var(--font-mono)",
        fontWeight: 500
      }}
    >
      {saldo >= 0 ? "+" : "−"}
      {h}h{String(m).padStart(2, "0")}
    </span>
  );
}

function HoraCell({ hora, editado }: { hora: string | null; editado?: boolean }) {
  if (!hora) return <span style={{ color: "var(--ink-500)" }}>—</span>;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        display: "inline-flex",
        alignItems: "center",
        gap: 3
      }}
    >
      {hora}
      {editado && (
        <span
          title="Horário ajustado conforme solicitação"
          style={{ display: "inline-flex", lineHeight: 0 }}
        >
          <Edit2Icon size={11} style={{ color: "#1e40af", flexShrink: 0, opacity: 0.85 }} />
        </span>
      )}
    </span>
  );
}

function fmtObsData(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

/** Remove referência técnica (#cuid) de textos gravados antes da melhoria. */
function textoObservacaoLegivel(texto: string): string {
  return texto.replace(/\s*\(#[a-z0-9]+\)/gi, "").replace(/\s*#[a-z0-9]+\.?/gi, ".");
}

function ModalObservacoes({
  dia,
  observacoes,
  onClose
}: {
  dia: string;
  observacoes: ObservacaoRegistro[];
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(122,30,38,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
              Observações do dia
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>{dia}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "var(--ink-500)",
              lineHeight: 1
            }}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {observacoes.map((o, i) => (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                background: "rgba(37,99,235,0.05)",
                border: "1px solid rgba(37,99,235,0.12)",
                borderRadius: "var(--radius-md)"
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-800)", lineHeight: 1.5 }}>
                {textoObservacaoLegivel(o.texto)}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-400)" }}>
                Registrado em {fmtObsData(o.data)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BotaoObservacoes({
  observacoes,
  onClick
}: {
  observacoes: ObservacaoRegistro[];
  onClick: () => void;
}) {
  if (!observacoes.length) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver observações de ajuste de ponto"
      aria-label="Ver observações de ajuste de ponto"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        padding: 0,
        margin: 0,
        border: "none",
        borderRadius: "50%",
        background: "transparent",
        color: "var(--ink-400)",
        cursor: "pointer",
        flexShrink: 0,
        verticalAlign: "middle"
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "#1e40af";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-400)";
      }}
    >
      <InfoIcon size={13} />
    </button>
  );
}

function HorasCell({ min, status }: { min: number; status: StatusDia }) {
  if (status === "FUTURO" || status === "FALTA")
    return <span style={{ color: "var(--ink-500)" }}>—</span>;
  return (
    <span style={{ fontFamily: "var(--font-mono)" }}>
      {Math.floor(min / 60)}h{String(min % 60).padStart(2, "0")}
    </span>
  );
}

/* ─── Page ─── */
export function HistoricoPage() {
  const hoje = new Date();
  const isMobile = useIsMobile(768);
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [registros, setRegistros] = useState<DiaRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalObs, setModalObs] = useState<{
    dia: string;
    observacoes: ObservacaoRegistro[];
  } | null>(null);
  const isMesAtual = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();

  const fetchHistorico = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);

      api
        .get<{ mes: number; ano: number; registros: ApiRegistro[] }>(
          `/ponto/historico?mes=${mes}&ano=${ano}`
        )
        .then((data) => setRegistros(transformarHistorico(data?.registros ?? [], mes, ano)))
        .catch(() => {
          if (!silent) setRegistros(transformarHistorico([], mes, ano));
        })
        .finally(() => setLoading(false));
    },
    [mes, ano]
  );

  /* Carrega ao montar e ao mudar mês/ano */
  useEffect(() => {
    fetchHistorico(false);
  }, [fetchHistorico]);

  /* Polling de 30s apenas no mês atual */
  useEffect(() => {
    if (!isMesAtual) return;
    const id = setInterval(() => fetchHistorico(true), 30_000);
    return () => clearInterval(id);
  }, [isMesAtual, fetchHistorico]);

  /* Refresh imediato ao retornar à aba (visibilitychange) */
  useEffect(() => {
    if (!isMesAtual) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchHistorico(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isMesAtual, fetchHistorico]);

  function navMes(dir: -1 | 1) {
    let nm = mes + dir,
      na = ano;
    if (nm < 1) {
      nm = 12;
      na--;
    }
    if (nm > 12) {
      nm = 1;
      na++;
    }
    setMes(nm);
    setAno(na);
  }

  const nomeMes = new Date(ano, mes - 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  const totalTrabMin = registros
    .filter((r) => r.status === "OK" || r.status === "PENDENTE")
    .reduce((s, r) => s + r.horasMin, 0);
  const totalFaltas = registros.filter((r) => r.status === "FALTA").length;
  const totalOK = registros.filter((r) => r.status === "OK").length;
  const totalDiasUteis = registros.filter((r) => r.status !== "FUTURO").length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {modalObs && (
        <ModalObservacoes
          dia={modalObs.dia}
          observacoes={modalObs.observacoes}
          onClose={() => setModalObs(null)}
        />
      )}

      {/* Cabeçalho */}
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        {!isMobile && (
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Ponto Eletrônico
          </p>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10
          }}
        >
          <h1
            style={{
              fontSize: isMobile ? 20 : "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            Histórico de <em>Frequência</em>
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            {!isMobile && (
              <button className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
                <FilterIcon size={14} />
                Filtros
              </button>
            )}
            <button className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
              <DownloadIcon size={14} />
              {isMobile ? "PDF" : "Exportar PDF"}
            </button>
          </div>
        </div>
      </div>

      {/* Navegação mês */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isMobile ? 10 : 0 }}
        >
          <button
            className="btn-icon"
            onClick={() => navMes(-1)}
            style={{ background: "white", border: "1px solid rgba(122,30,38,0.12)", flexShrink: 0 }}
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
            {nomeMes}
          </p>
          <button
            className="btn-icon"
            onClick={() => navMes(1)}
            disabled={mes === hoje.getMonth() + 1 && ano === hoje.getFullYear()}
            style={{
              background: "white",
              border: "1px solid rgba(122,30,38,0.12)",
              flexShrink: 0,
              opacity: mes === hoje.getMonth() + 1 && ano === hoje.getFullYear() ? 0.4 : 1
            }}
          >
            <ArrowRightIcon size={16} />
          </button>
          {!isMobile && (
            <div style={{ marginLeft: 8, display: "flex", gap: 8, flexShrink: 0 }}>
              <span className="badge badge-green">{totalOK} dias OK</span>
              {totalFaltas > 0 && (
                <span className="badge badge-red">
                  {totalFaltas} falta{totalFaltas !== 1 ? "s" : ""}
                </span>
              )}
              <span className="badge badge-gray">
                {Math.floor(totalTrabMin / 60)}h{String(totalTrabMin % 60).padStart(2, "0")}{" "}
                trabalhadas
              </span>
            </div>
          )}
        </div>
        {isMobile && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="badge badge-green">{totalOK} dias OK</span>
            {totalFaltas > 0 && (
              <span className="badge badge-red">
                {totalFaltas} falta{totalFaltas !== 1 ? "s" : ""}
              </span>
            )}
            <span className="badge badge-gray">
              {Math.floor(totalTrabMin / 60)}h{String(totalTrabMin % 60).padStart(2, "0")}{" "}
              trabalhadas
            </span>
          </div>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div
          style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-500)", fontSize: 14 }}
        >
          Carregando histórico…
        </div>
      ) : (
        <div className="card-flat" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table-cfo" style={{ minWidth: 700, tableLayout: "auto" }}>
              <thead>
                <tr>
                  {[
                    "Data",
                    "Dia",
                    "Entrada",
                    "Início Interv.",
                    "Fim Interv.",
                    "Saída",
                    "Horas",
                    "Saldo",
                    "Status"
                  ].map((h) => (
                    <th
                      key={h}
                      style={
                        h === "Status"
                          ? { width: "1%", whiteSpace: "nowrap", paddingLeft: 10, paddingRight: 10 }
                          : undefined
                      }
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map((r, i) => {
                  const isHoje =
                    r.data ===
                    `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
                  return (
                    <tr
                      key={i}
                      style={{
                        background: isHoje ? "rgba(122,30,38,0.03)" : undefined,
                        opacity: r.status === "FUTURO" ? 0.5 : 1
                      }}
                    >
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                        {r.data}
                        {isHoje && (
                          <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9 }}>
                            hoje
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--ink-500)", fontSize: 13 }}>{r.diaSemana}</td>
                      <td>
                        <HoraCell hora={r.entrada} editado={r.entradaEditada} />
                      </td>
                      <td>
                        <HoraCell hora={r.inicioIntervalo} editado={r.inicioIntervaloEditado} />
                      </td>
                      <td>
                        <HoraCell hora={r.fimIntervalo} editado={r.fimIntervaloEditado} />
                      </td>
                      <td>
                        <HoraCell hora={r.saida} editado={r.saidaEditada} />
                      </td>
                      <td>
                        <HorasCell min={r.horasMin} status={r.status} />
                      </td>
                      <td>
                        <SaldoCell
                          trabMin={r.horasMin}
                          jornadaMin={r.jornadaMin}
                          status={r.status}
                        />
                      </td>
                      <td
                        style={{
                          width: "1%",
                          whiteSpace: "nowrap",
                          paddingLeft: 10,
                          paddingRight: 10
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <StatusPill status={r.status} />
                          <BotaoObservacoes
                            observacoes={r.observacoes ?? []}
                            onClick={() =>
                              setModalObs({
                                dia: `${r.diaSemana}, ${r.data}`,
                                observacoes: r.observacoes ?? []
                              })
                            }
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {registros.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ textAlign: "center", padding: "40px", color: "var(--ink-500)" }}
                    >
                      Nenhum registro encontrado para este período.
                    </td>
                  </tr>
                )}
              </tbody>
              {totalDiasUteis > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(122,30,38,0.10)" }}>
                    <td
                      colSpan={6}
                      style={{
                        padding: "12px 14px",
                        fontWeight: 600,
                        fontSize: 12,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)"
                      }}
                    >
                      Total do período
                    </td>
                    <td
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                        color: "var(--ink-900)"
                      }}
                    >
                      {Math.floor(totalTrabMin / 60)}h{String(totalTrabMin % 60).padStart(2, "0")}
                    </td>
                    <td>
                      <SaldoCell
                        trabMin={totalTrabMin}
                        jornadaMin={totalDiasUteis * 480}
                        status="OK"
                      />
                    </td>
                    <td style={{ width: "1%", paddingLeft: 10, paddingRight: 10 }} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Legenda */}
      <div
        style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}
      >
        <InfoIcon size={13} style={{ color: "var(--ink-500)" }} />
        {[
          { cls: "badge-green", label: "Jornada completa" },
          { cls: "badge-amber", label: "Pendente (saída não registrada)" },
          { cls: "badge-red", label: "Falta" },
          { cls: "badge-blue", label: "Afastamento justificado" },
          { cls: "badge-gray", label: "Feriado ou dia futuro" }
        ].map((item) => (
          <span
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              color: "var(--ink-500)"
            }}
          >
            <span className={`badge ${item.cls}`} style={{ padding: "1px 6px", fontSize: 9 }}>
              &nbsp;
            </span>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

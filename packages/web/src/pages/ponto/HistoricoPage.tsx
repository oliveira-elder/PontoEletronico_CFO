import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  FilterIcon,
  DownloadIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  InfoIcon,
  Edit2Icon,
  TrendingUpIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon
} from "../../components/icons";
import { useIsMobile } from "../../hooks/useIsMobile";
import { api } from "../../hooks/useApi";
import {
  type StatusDia,
  type ObservacaoRegistro,
  type Pausa,
  type DiaRegistro,
  type HistoricoApiResponse,
  JORNADA_PADRAO,
  transformarHistorico
} from "../../utils/historicoTransform";

/* ─── Tipos de Assinatura ─── */
type StatusAssinatura = "PENDENTE_FUNCIONARIO" | "PENDENTE_GESTOR" | "CONCLUIDA" | "DISPENSADA";

interface AssinaturaQuadro {
  id: string;
  status: StatusAssinatura;
  bancoHorasSaldoTotalMinutos: number;
  assinadoFuncionarioEm: string | null;
  assinadoGestorEm: string | null;
  assinadoGestorNome: string | null;
  periodo: {
    mes: number;
    ano: number;
    horasTrabalhadasMinutos: number;
    horasExtrasMinutos: number;
    horasFaltaMinutos: number;
    diasTrabalhados: number;
  };
}

function fmtBH(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}min`;
}

/* ─── Modal de Confirmação de Assinatura ─── */
function ModalAssinarQuadro({
  assinatura,
  totalTrabMin,
  totalJornadaMin,
  onClose,
  onConfirm,
  loading
}: {
  assinatura: AssinaturaQuadro;
  totalTrabMin: number;
  totalJornadaMin: number;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const nomeMes = new Date(assinatura.periodo.ano, assinatura.periodo.mes - 1).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" }
  );
  const saldoMin = totalTrabMin - totalJornadaMin;
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
          Assinar Quadro
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
            gap: "10px 20px"
          }}
        >
          <div>
            <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>
              Dias trabalhados
            </p>
            <p style={{ fontSize: 15, fontWeight: 700 }}>{assinatura.periodo.diasTrabalhados}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>Total de horas</p>
            <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {Math.floor(totalTrabMin / 60)}h{String(totalTrabMin % 60).padStart(2, "0")}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>Saldo do mês</p>
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: saldoMin >= 0 ? "#15803D" : "#B91C1C",
                fontFamily: "var(--font-mono)"
              }}
            >
              {fmtBH(saldoMin)}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>
              Banco de horas (total)
            </p>
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: assinatura.bancoHorasSaldoTotalMinutos >= 0 ? "#15803D" : "#B91C1C",
                fontFamily: "var(--font-mono)"
              }}
            >
              {fmtBH(assinatura.bancoHorasSaldoTotalMinutos)}
            </p>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: "var(--ink-600)", marginBottom: 24, lineHeight: 1.6 }}>
          Ao assinar, confirmo que li e estou de acordo com os registros de ponto acima referentes
          ao período indicado.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={onConfirm}
            disabled={loading}
            style={{
              gap: 6,
              background: "var(--burgundy-700)",
              borderColor: "var(--burgundy-700)"
            }}
          >
            <Edit2Icon size={13} />
            {loading ? "Assinando…" : "Assinar Quadro"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Banner de Assinatura ─── */
function BannerAssinatura({
  assinatura,
  onAssinar
}: {
  assinatura: AssinaturaQuadro;
  onAssinar: () => void;
}) {
  const fmtDt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

  if (assinatura.status === "PENDENTE_FUNCIONARIO") {
    return (
      <div
        style={{
          background: "#FEF3C7",
          border: "1px solid #F59E0B",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <AlertCircleIcon size={18} style={{ color: "#D97706", flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: "#92400E", flex: 1 }}>
          <strong>Quadro pendente de assinatura.</strong> Revise os registros acima e assine para
          confirmar.
        </span>
        <button
          className="btn btn-sm"
          onClick={onAssinar}
          style={{ background: "#D97706", color: "white", border: "none", gap: 6, flexShrink: 0 }}
        >
          <Edit2Icon size={13} />
          Assinar Quadro
        </button>
      </div>
    );
  }

  if (assinatura.status === "PENDENTE_GESTOR") {
    return (
      <div
        style={{
          background: "#EFF6FF",
          border: "1px solid #3B82F6",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}
      >
        <CheckCircleIcon size={18} style={{ color: "#2563EB", flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: "#1E40AF" }}>
          <strong>Você assinou em {fmtDt(assinatura.assinadoFuncionarioEm)}.</strong> Aguardando
          assinatura do gestor.
        </span>
      </div>
    );
  }

  if (assinatura.status === "CONCLUIDA") {
    return (
      <div
        style={{
          background: "#F0FDF4",
          border: "1px solid #22C55E",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap"
        }}
      >
        <CheckIcon size={18} style={{ color: "#16A34A", flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: "#14532D", flex: 1 }}>
          <strong>Quadro assinado.</strong> Funcionário em {fmtDt(assinatura.assinadoFuncionarioEm)}{" "}
          · Gestor {assinatura.assinadoGestorNome ? `(${assinatura.assinadoGestorNome})` : ""} em{" "}
          {fmtDt(assinatura.assinadoGestorEm)}.
        </span>
        <button
          className="btn btn-sm"
          style={{
            gap: 5,
            background: "#16A34A",
            color: "white",
            border: "none",
            fontSize: 12,
            flexShrink: 0
          }}
          onClick={() => {
            api
              .download(
                `/ponto/assinaturas/${assinatura.id}/pdf`,
                `quadro-${assinatura.periodo.mes}-${assinatura.periodo.ano}.pdf`
              )
              .catch((e: unknown) =>
                alert("Erro ao baixar PDF: " + ((e as Error)?.message ?? "desconhecido"))
              );
          }}
        >
          <DownloadIcon size={12} />
          Baixar PDF
        </button>
      </div>
    );
  }

  return null;
}

/* ─── Sub-componentes ─── */
function StatusPill({ status, obs }: { status: StatusDia; obs?: string }) {
  const map: Record<StatusDia, { label: string; cls: string }> = {
    OK: { label: "OK", cls: "badge-green" },
    FALTA: { label: "Falta", cls: "badge-red" },
    PENDENTE: { label: "Pendente", cls: "badge-amber" },
    AFASTAMENTO: { label: "Afastamento", cls: "badge-blue" },
    FERIADO: { label: "Feriado", cls: "badge-gray" },
    FUTURO: { label: "—", cls: "badge-gray" },
    FOLGA: { label: "Folga", cls: "badge-gray" }
  };
  const { label, cls } = map[status];
  const titulo = (status === "AFASTAMENTO" || status === "FERIADO") && obs ? obs : undefined;
  return (
    <span className={`badge ${cls}`} title={titulo}>
      {status === "AFASTAMENTO" && obs
        ? obs
        : status === "FERIADO" && obs
          ? `Feriado: ${obs}`
          : label}
    </span>
  );
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
  if (status === "FUTURO" || status === "AFASTAMENTO")
    return <span style={{ color: "var(--ink-500)" }}>—</span>;
  if (status === "FALTA") {
    const h = Math.floor(jornadaMin / 60);
    const m = jornadaMin % 60;
    return (
      <span className="text-red">
        −{h}h{String(m).padStart(2, "0")}
      </span>
    );
  }
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

function PausaCell({ pausas }: { pausas?: Pausa[] }) {
  if (!pausas || pausas.length === 0) return <span style={{ color: "var(--ink-500)" }}>—</span>;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 2
      }}
    >
      {pausas.map((p, i) => (
        <span key={i} title="Interromper → Reiniciar Expediente">
          {p.inicio}–{p.fim ?? "…"}
        </span>
      ))}
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
  if (status === "FUTURO" || status === "FALTA" || status === "AFASTAMENTO")
    return <span style={{ color: "var(--ink-500)" }}>—</span>;
  return (
    <span style={{ fontFamily: "var(--font-mono)" }}>
      {Math.floor(min / 60)}h{String(min % 60).padStart(2, "0")}
    </span>
  );
}

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

/* ─── Popup seletor mês/ano ─── */
function PopupMesAno({
  mes,
  ano,
  onSelect,
  onClose
}: {
  mes: number;
  ano: number;
  onSelect: (m: number, a: number) => void;
  onClose: () => void;
}) {
  const hoje = new Date();
  const maxAno = hoje.getFullYear();
  const maxMes = hoje.getMonth() + 1;
  const [anoLocal, setAnoLocal] = useState(ano);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function navAno(d: -1 | 1) {
    const next = anoLocal + d;
    if (next > maxAno) return;
    setAnoLocal(next);
  }

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 500,
        background: "white",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        border: "1px solid rgba(122,30,38,0.12)",
        padding: "14px 16px",
        minWidth: 240
      }}
    >
      {/* Seletor de ano */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12
        }}
      >
        <button
          onClick={() => navAno(-1)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            color: "#6B0F1A",
            fontSize: 16,
            lineHeight: 1
          }}
        >
          ‹
        </button>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: 16,
            color: "var(--burgundy-700)"
          }}
        >
          {anoLocal}
        </span>
        <button
          onClick={() => navAno(1)}
          disabled={anoLocal >= maxAno}
          style={{
            background: "none",
            border: "none",
            cursor: anoLocal >= maxAno ? "default" : "pointer",
            padding: "4px 8px",
            color: anoLocal >= maxAno ? "#ccc" : "#6B0F1A",
            fontSize: 16,
            lineHeight: 1
          }}
        >
          ›
        </button>
      </div>
      {/* Grade de meses */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
        {MESES_PT.map((nome, i) => {
          const m = i + 1;
          const isFuture = anoLocal === maxAno && m > maxMes;
          const isSelected = m === mes && anoLocal === ano;
          return (
            <button
              key={m}
              disabled={isFuture}
              onClick={() => {
                onSelect(m, anoLocal);
                onClose();
              }}
              style={{
                padding: "6px 4px",
                borderRadius: 6,
                border: "none",
                cursor: isFuture ? "default" : "pointer",
                fontSize: 11.5,
                fontWeight: isSelected ? 700 : 400,
                background: isSelected ? "var(--burgundy-700, #6B0F1A)" : "transparent",
                color: isSelected ? "white" : isFuture ? "#ccc" : "#334155",
                transition: "background 0.1s"
              }}
              onMouseEnter={(e) => {
                if (!isFuture && !isSelected)
                  (e.currentTarget as HTMLButtonElement).style.background = "#f1f5f9";
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              {nome.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </div>
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
  const [popupMes, setPopupMes] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const mesNavRef = useRef<HTMLDivElement>(null);

  /* ── Assinatura ── */
  const [assinatura, setAssinatura] = useState<AssinaturaQuadro | null>(null);
  const [modalAssinar, setModalAssinar] = useState(false);
  const [loadingAssinar, setLoadingAssinar] = useState(false);

  const fetchHistorico = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);

      api
        .get<HistoricoApiResponse>(`/ponto/historico?mes=${mes}&ano=${ano}`)
        .then((data) =>
          setRegistros(
            transformarHistorico(
              data?.registros ?? [],
              data?.afastamentos ?? [],
              mes,
              ano,
              data?.feriados ?? [],
              data?.multiplicadores ?? { sabadoPct: 100, domingoPct: 200, feriadoPct: 200 },
              data?.jornada ?? JORNADA_PADRAO
            )
          )
        )
        .catch(() => {
          if (!silent) setRegistros(transformarHistorico([], [], mes, ano));
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

  /* Busca assinatura do mês visualizado */
  useEffect(() => {
    setAssinatura(null);
    api
      .get<AssinaturaQuadro[]>(`/ponto/assinaturas?mes=${mes}&ano=${ano}`)
      .then((data) => setAssinatura(data?.[0] ?? null))
      .catch(() => setAssinatura(null));
  }, [mes, ano]);

  async function confirmarAssinatura() {
    if (!assinatura) return;
    setLoadingAssinar(true);
    try {
      const updated = await api.post<AssinaturaQuadro>(
        `/ponto/assinaturas/${assinatura.id}/assinar`,
        {}
      );
      setAssinatura(updated);
      setModalAssinar(false);
    } catch (err: unknown) {
      alert((err as { message?: string })?.message ?? "Erro ao assinar. Tente novamente.");
    } finally {
      setLoadingAssinar(false);
    }
  }

  async function exportarPdf() {
    setExportandoPdf(true);
    try {
      const nomeMesPad = String(mes).padStart(2, "0");
      await api.download(
        `/ponto/assinaturas/rascunho-pdf?mes=${mes}&ano=${ano}`,
        `rascunho-frequencia-${nomeMesPad}-${ano}.pdf`
      );
    } catch (e: unknown) {
      alert("Erro ao gerar PDF: " + ((e as Error)?.message ?? "desconhecido"));
    } finally {
      setExportandoPdf(false);
    }
  }

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
  const totalAfastamentos = registros.filter((r) => r.status === "AFASTAMENTO").length;
  const totalDiasUteis = registros.filter(
    (r) => r.status !== "FUTURO" && r.status !== "AFASTAMENTO"
  ).length;
  const totalJornadaMin = registros
    .filter((r) => r.status !== "FUTURO" && r.status !== "AFASTAMENTO")
    .reduce((s, r) => s + r.jornadaMin, 0);

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
            <Link to="/ponto/banco-horas" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
              <TrendingUpIcon size={14} />
              {isMobile ? "Banco" : "Banco de Horas"}
            </Link>
            <button
              className="btn btn-ghost btn-sm"
              style={{ gap: 6 }}
              onClick={exportarPdf}
              disabled={exportandoPdf || loading}
            >
              <DownloadIcon size={14} />
              {exportandoPdf ? "Gerando…" : isMobile ? "PDF" : "Exportar PDF"}
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

          {/* Mês clicável — abre popup de seleção */}
          <div
            ref={mesNavRef}
            style={{ position: "relative", flex: 1, textAlign: "center", minWidth: 0 }}
          >
            <button
              onClick={() => setPopupMes((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 8px",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: isMobile ? 17 : 20,
                color: "var(--burgundy-600)",
                textTransform: "capitalize",
                borderRadius: 6,
                transition: "background 0.1s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(122,30,38,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              title="Clique para escolher mês e ano"
            >
              {nomeMes}
              <ChevronDownIcon size={14} style={{ opacity: 0.5, marginTop: 2 }} />
            </button>
            {popupMes && (
              <PopupMesAno
                mes={mes}
                ano={ano}
                onSelect={(m, a) => {
                  setMes(m);
                  setAno(a);
                }}
                onClose={() => setPopupMes(false)}
              />
            )}
          </div>

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
              {totalAfastamentos > 0 && (
                <span className="badge badge-blue">
                  {totalAfastamentos} afastamento{totalAfastamentos !== 1 ? "s" : ""}
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
            {totalAfastamentos > 0 && (
              <span className="badge badge-blue">
                {totalAfastamentos} afastamento{totalAfastamentos !== 1 ? "s" : ""}
              </span>
            )}
            <span className="badge badge-gray">
              {Math.floor(totalTrabMin / 60)}h{String(totalTrabMin % 60).padStart(2, "0")}{" "}
              trabalhadas
            </span>
          </div>
        )}
      </div>

      {/* Modal de assinatura */}
      {modalAssinar && assinatura && (
        <ModalAssinarQuadro
          assinatura={assinatura}
          totalTrabMin={totalTrabMin}
          totalJornadaMin={totalJornadaMin}
          onClose={() => setModalAssinar(false)}
          onConfirm={confirmarAssinatura}
          loading={loadingAssinar}
        />
      )}

      {/* Banner de assinatura */}
      {assinatura && !loading && (
        <BannerAssinatura assinatura={assinatura} onAssinar={() => setModalAssinar(true)} />
      )}

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
            <table className="table-cfo" style={{ minWidth: 780, tableLayout: "auto" }}>
              <thead>
                <tr>
                  {[
                    "Data",
                    "Dia",
                    "Entrada",
                    "Início Interv.",
                    "Fim Interv.",
                    "Saída",
                    "Pausa",
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
                        <PausaCell pausas={r.pausas} />
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
                          <StatusPill status={r.status} obs={r.obs} />
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
                      colSpan={10}
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
                      colSpan={7}
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
                      <SaldoCell trabMin={totalTrabMin} jornadaMin={totalJornadaMin} status="OK" />
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

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
  ChevronDownIcon,
  CoffeeIcon
} from "../../components/icons";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import {
  type StatusDia,
  type ObservacaoRegistro,
  type Pausa,
  type DiaRegistro,
  type HistoricoApiResponse,
  JORNADA_PADRAO,
  transformarHistorico,
  badgeLabelParcial
} from "../../utils/historicoTransform";
import {
  MSG_SOLICITACAO_APENAS_INFORMATIVA,
  categoriaSemVisibilidadeBancoHoras
} from "../../utils/categoriaPonto";

/* Badges de resumo/status ~15% maiores que o .badge padrão (11px / 2×8) */
const BADGE_HISTORICO_STYLE: React.CSSProperties = {
  fontSize: 12.65,
  padding: "2.3px 9.2px",
  gap: 4.6
};

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
  saldoMesBanco,
  ocultarBancoHoras,
  onClose,
  onConfirm,
  loading
}: {
  assinatura: AssinaturaQuadro;
  totalTrabMin: number;
  saldoMesBanco: number;
  ocultarBancoHoras?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const nomeMes = new Date(assinatura.periodo.ano, assinatura.periodo.mes - 1).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" }
  );
  const saldoMin = saldoMesBanco;
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
          {!ocultarBancoHoras && (
            <>
              <div>
                <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 2 }}>
                  Saldo do mês
                </p>
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
            </>
          )}
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
          <strong>Quadro pendente de assinatura.</strong> Revise os registros abaixo e assine para
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
function StatusPill({
  status,
  obs,
  atestadoParcial,
  atestadoParcialHorario
}: {
  status: StatusDia;
  obs?: string;
  atestadoParcial?: boolean;
  atestadoParcialHorario?: string;
}) {
  if (atestadoParcial) {
    const label = badgeLabelParcial(obs);
    const titulo = obs ?? `${label}${atestadoParcialHorario ? ` ${atestadoParcialHorario}` : ""}`;
    return (
      <span className="badge badge-blue" style={BADGE_HISTORICO_STYLE} title={titulo}>
        {label}
      </span>
    );
  }
  /* Dias futuros: sem badge — o dia ainda não ocorreu. */
  if (status === "FUTURO") return null;

  const map: Record<StatusDia, { label: string; cls: string }> = {
    OK: { label: "OK", cls: "badge-green" },
    FALTA: { label: "Falta", cls: "badge-red" },
    PENDENTE: { label: "Pendente", cls: "badge-amber" },
    AFASTAMENTO: { label: "Afastamento", cls: "badge-blue" },
    FERIADO: { label: "Feriado", cls: "badge-gray" },
    FUTURO: { label: "", cls: "badge-gray" },
    FOLGA: { label: "Sem Expediente", cls: "badge-gray" },
    ISENTO: { label: "Isento — Assessor/Gerente", cls: "badge-blue" }
  };
  const { label, cls } = map[status];
  const titulo =
    (status === "AFASTAMENTO" ||
      status === "FERIADO" ||
      status === "FOLGA" ||
      status === "ISENTO") &&
    obs
      ? obs
      : undefined;
  return (
    <span className={`badge ${cls}`} style={BADGE_HISTORICO_STYLE} title={titulo}>
      {status === "ISENTO"
        ? "Isento — Assessor/Gerente"
        : status === "AFASTAMENTO" && obs
          ? obs
          : status === "FERIADO" && obs
            ? `Feriado: ${obs}`
            : status === "FOLGA" && obs && obs !== "Sem Expediente" && obs !== "Folga"
              ? obs
              : label}
    </span>
  );
}

function SaldoCell({
  trabMin,
  jornadaMin,
  status,
  saldoBancoMin,
  saldoBancoNeutro
}: {
  trabMin: number;
  jornadaMin: number;
  status: StatusDia;
  saldoBancoMin?: number | null;
  saldoBancoNeutro?: boolean;
}) {
  if (status === "FUTURO" || status === "AFASTAMENTO" || status === "FOLGA" || status === "ISENTO")
    return <span style={{ color: "var(--ink-500)" }}>—</span>;
  if (saldoBancoNeutro) return <span style={{ color: "var(--ink-500)" }}>—</span>;
  const saldo =
    saldoBancoMin !== undefined && saldoBancoMin !== null ? saldoBancoMin : trabMin - jornadaMin;
  if (status === "FALTA" && saldoBancoMin === undefined) {
    const h = Math.floor(jornadaMin / 60);
    const m = jornadaMin % 60;
    return (
      <span className="text-red">
        −{h}h{String(m).padStart(2, "0")}
      </span>
    );
  }
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

function dataPtParaIso(data: string): string {
  const [d, m, y] = data.split("/");
  return `${y}-${m}-${d}`;
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
        gap: 2,
        alignItems: "flex-start"
      }}
    >
      {pausas.map((p, i) => (
        <span key={i} title="Interromper → Reiniciar Expediente" style={{ whiteSpace: "nowrap" }}>
          {p.inicio}–{p.fim ?? "…"}
        </span>
      ))}
    </span>
  );
}

function HoraCell({
  hora,
  editado,
  turnoSemIntervalo,
  almocoCurto,
  onAlmocoInfo
}: {
  hora: string | null;
  editado?: boolean;
  turnoSemIntervalo?: { turno?: string };
  almocoCurto?: DiaRegistro["almocoCurto"];
  onAlmocoInfo?: () => void;
}) {
  if (!hora) return <span style={{ color: "var(--ink-500)" }}>—</span>;
  const tituloTurno =
    turnoSemIntervalo?.turno === "NOTURNO"
      ? "Turno noturno — jornada sem intervalo"
      : turnoSemIntervalo?.turno === "VESPERTINO"
        ? "Turno vespertino — jornada sem intervalo"
        : turnoSemIntervalo
          ? "Jornada sem intervalo de almoço"
          : undefined;
  const tituloAlmoco = almocoCurto
    ? `Almoço com referência de ${almocoCurto.minimoMin} min (configuração). Registrado ${almocoCurto.inicio}–${almocoCurto.fimRegistrado}; cálculo retoma às ${almocoCurto.fimReferencia}.`
    : undefined;
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
      {turnoSemIntervalo && (
        <span title={tituloTurno} style={{ display: "inline-flex", lineHeight: 0 }}>
          <CheckCircleIcon size={11} style={{ color: "var(--green)", flexShrink: 0 }} />
        </span>
      )}
      {almocoCurto && (
        <button
          type="button"
          title={tituloAlmoco}
          aria-label="Informativo do intervalo de almoço"
          onClick={(e) => {
            e.stopPropagation();
            onAlmocoInfo?.();
          }}
          style={{
            display: "inline-flex",
            lineHeight: 0,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            color: "#B45309"
          }}
        >
          <CoffeeIcon size={12} style={{ flexShrink: 0 }} />
        </button>
      )}
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

function IntervaloNaoAplicavelCell({
  turno,
  motivo,
  janelaAlmoco,
  onClick
}: {
  turno?: string;
  motivo?: string;
  janelaAlmoco?: string;
  onClick?: () => void;
}) {
  const janela = janelaAlmoco ?? "janela de almoço";
  let title: string;
  if (motivo === "ATESTADO_PARCIAL" || turno === "ATESTADO_PARCIAL") {
    title =
      "Intervalo de almoço não aplicável — atestado médico parcial (matutino ou vespertino). " +
      "A dedução de 1h não é aplicada quando o almoço não foi registrado.";
  } else if (motivo === "ATESTADO_PARCIAL_SAIDA") {
    title =
      "Saída não aplicável — atestado médico parcial no período da tarde. " +
      "O expediente encerra com o atestado; correção de ponto não é exigida.";
  } else {
    const nomeTurno =
      turno === "NOTURNO" ? "noturno" : turno === "VESPERTINO" ? "vespertino" : "atípico";
    title =
      motivo === "DURANTE_JANELA"
        ? `Intervalo de almoço não aplicável — entrada no turno ${nomeTurno} durante a janela vigente (${janela}).`
        : `Intervalo de almoço não aplicável — entrada no turno ${nomeTurno} após a janela de almoço (${janela}).`;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        borderRadius: "var(--radius-full)",
        border: "1px solid rgba(47,125,79,0.35)",
        background: "rgba(47,125,79,0.10)",
        color: "var(--green)",
        fontSize: 10,
        fontWeight: 600,
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
        lineHeight: 1.3,
        whiteSpace: "nowrap"
      }}
    >
      <CheckCircleIcon size={11} style={{ flexShrink: 0 }} />
      Não aplicável
    </button>
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

function ModalAlmocoReferencia({
  dia,
  info,
  onClose
}: {
  dia: string;
  info: NonNullable<DiaRegistro["almocoCurto"]>;
  onClose: () => void;
}) {
  const hMin = Math.floor(info.minimoMin / 60);
  const mMin = info.minimoMin % 60;
  const duracaoLabel =
    mMin === 0 ? `${hMin}h` : hMin > 0 ? `${hMin}h${String(mMin).padStart(2, "0")}` : `${mMin} min`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
          overflow: "hidden",
          isolation: "isolate"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid rgba(122,30,38,0.10)",
            background: "#fff"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <CoffeeIcon size={16} style={{ color: "#B45309", flexShrink: 0 }} />
            <strong style={{ fontSize: 14, color: "var(--ink-900)" }}>
              Referência de almoço — {dia}
            </strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "var(--ink-500)",
              lineHeight: 1,
              flexShrink: 0
            }}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div
          style={{
            padding: "16px 20px",
            fontSize: 13.5,
            color: "var(--ink-800)",
            lineHeight: 1.55,
            background: "#fff"
          }}
        >
          <p style={{ margin: "0 0 10px" }}>
            O horário de retorno foi registrado, mas o cálculo de horas usa a{" "}
            <strong>duração mínima de almoço configurada</strong> ({duracaoLabel}), contada a partir
            do início do intervalo.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              Registrado: <strong>{info.inicio}</strong> → <strong>{info.fimRegistrado}</strong>
            </li>
            <li>
              Referência de cálculo: <strong>{info.inicio}</strong> →{" "}
              <strong>{info.fimReferencia}</strong> ({duracaoLabel})
            </li>
          </ul>
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>
            O expediente retoma no cálculo às {info.fimReferencia}, conforme as configurações do
            período/jornada do funcionário.
          </p>
        </div>
        <div
          style={{
            padding: "12px 20px 16px",
            display: "flex",
            justifyContent: "flex-end",
            borderTop: "1px solid rgba(122,30,38,0.08)",
            background: "#fff"
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid rgba(122,30,38,0.18)",
              background: "#fff",
              color: "var(--ink-800)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            Fechar
          </button>
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
  if (
    status === "FUTURO" ||
    status === "FOLGA" ||
    status === "FALTA" ||
    status === "AFASTAMENTO" ||
    status === "ISENTO"
  )
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
  minMes,
  minAno,
  onSelect,
  onClose
}: {
  mes: number;
  ano: number;
  minMes: number;
  minAno: number;
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
    if (next > maxAno || next < minAno) return;
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
          disabled={anoLocal <= minAno}
          style={{
            background: "none",
            border: "none",
            cursor: anoLocal <= minAno ? "default" : "pointer",
            padding: "4px 8px",
            color: anoLocal <= minAno ? "#ccc" : "#6B0F1A",
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
          const isBeforeInicio = anoLocal < minAno || (anoLocal === minAno && m < minMes);
          const isSelected = m === mes && anoLocal === ano;
          return (
            <button
              key={m}
              disabled={isFuture || isBeforeInicio}
              onClick={() => {
                onSelect(m, anoLocal);
                onClose();
              }}
              style={{
                padding: "6px 4px",
                borderRadius: 6,
                border: "none",
                cursor: isFuture || isBeforeInicio ? "default" : "pointer",
                fontSize: 11.5,
                fontWeight: isSelected ? 700 : 400,
                background: isSelected ? "var(--burgundy-700, #6B0F1A)" : "transparent",
                color: isSelected ? "white" : isFuture || isBeforeInicio ? "#ccc" : "#334155",
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
  const { user } = useAuth();
  const isSuperAdmin = !!user?.isSuperAdmin;
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [inicioAtividades, setInicioAtividades] = useState<string | null>(null);
  const [dataInicioProducao, setDataInicioProducao] = useState<string | null>(null);
  const [periodoTeste, setPeriodoTeste] = useState(false);
  const [bancoPorDia, setBancoPorDia] = useState<HistoricoApiResponse["bancoPorDia"]>({});
  const [saldoMesBanco, setSaldoMesBanco] = useState(0);
  const [saldoAcumuladoMesAnterior, setSaldoAcumuladoMesAnterior] = useState(0);
  const [ocultarBancoHoras, setOcultarBancoHoras] = useState(false);
  const [registros, setRegistros] = useState<DiaRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalObs, setModalObs] = useState<{
    dia: string;
    observacoes: ObservacaoRegistro[];
  } | null>(null);
  const [modalAlmoco, setModalAlmoco] = useState<{
    dia: string;
    info: NonNullable<DiaRegistro["almocoCurto"]>;
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
        .then((data) => {
          const inicio = data?.inicioAtividades ?? null;
          setInicioAtividades(inicio);
          setDataInicioProducao(data?.dataInicioProducao ?? null);
          setPeriodoTeste(!!data?.periodoTeste);
          setBancoPorDia(data?.bancoPorDia ?? {});
          setSaldoMesBanco(data?.saldoMesBanco ?? 0);
          setSaldoAcumuladoMesAnterior(data?.saldoAcumuladoMesAnterior ?? 0);
          setOcultarBancoHoras(
            !!data?.ocultarBancoHoras || categoriaSemVisibilidadeBancoHoras(data?.categoria)
          );
          setRegistros(
            transformarHistorico(
              data?.registros ?? [],
              data?.afastamentos ?? [],
              mes,
              ano,
              data?.feriados ?? [],
              data?.multiplicadores ?? { sabadoPct: 100, domingoPct: 200, feriadoPct: 200 },
              data?.jornada ?? JORNADA_PADRAO,
              inicio,
              {
                pontoObrigatorioDesde: data?.pontoObrigatorioDesde ?? null,
                semRegistroPonto: !!data?.semRegistroPonto,
                periodosSemObrigacao: data?.periodosSemObrigacao ?? [],
                exigirIntervalo:
                  data?.categoria !== "ESTAGIARIO" && data?.categoria !== "MENOR_APRENDIZ"
              }
            )
          );
        })
        .catch(() => {
          if (!silent) {
            setBancoPorDia({});
            setSaldoMesBanco(0);
            setSaldoAcumuladoMesAnterior(0);
            setRegistros(transformarHistorico([], [], mes, ano));
          }
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
    if (inicioAtividades) {
      const [iy, im] = inicioAtividades.split("-").map(Number);
      const minMes = im;
      const minAno = iy;
      if (na < minAno || (na === minAno && nm < minMes)) return;
    }
    /* Não-SA: piso do go-live (mês de produção). SA pode navegar fase de teste. */
    if (!isSuperAdmin && dataInicioProducao) {
      const [py, pm] = dataInicioProducao.split("-").map(Number);
      if (na < py || (na === py && nm < pm)) return;
    }
    setMes(nm);
    setAno(na);
  }

  const pisoNav = (() => {
    let minMes = 1;
    let minAno = 2000;
    if (inicioAtividades) {
      minAno = Number(inicioAtividades.split("-")[0]);
      minMes = Number(inicioAtividades.split("-")[1]);
    }
    if (!isSuperAdmin && dataInicioProducao) {
      const py = Number(dataInicioProducao.split("-")[0]);
      const pm = Number(dataInicioProducao.split("-")[1]);
      if (py > minAno || (py === minAno && pm > minMes)) {
        minAno = py;
        minMes = pm;
      }
    }
    return { minMes, minAno };
  })();
  const minMesAno = pisoNav;
  const noMesMinimo = mes === minMesAno.minMes && ano === minMesAno.minAno;

  const nomeMes = new Date(ano, mes - 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  const bancoDiasList = Object.values(bancoPorDia ?? {});
  const usarBanco = bancoDiasList.length > 0;
  /** Em atestado parcial, preferir o cálculo do transform (novas regras) ao banco legado. */
  const minutosDiaExibidos = (r: (typeof registros)[number], isoKey: string) => {
    const bancoDia = bancoPorDia?.[isoKey];
    if (r.atestadoParcial) {
      return { trab: r.horasMin, jornada: r.jornadaMin, saldo: r.horasMin - r.jornadaMin };
    }
    return {
      trab: bancoDia?.horasTrabalhadasMinutos ?? r.horasMin,
      jornada: bancoDia?.jornadaEsperadaMinutos ?? r.jornadaMin,
      saldo:
        bancoDia?.saldoDiaMinutos !== undefined && bancoDia?.saldoDiaMinutos !== null
          ? bancoDia.saldoDiaMinutos
          : r.horasMin - r.jornadaMin
    };
  };
  const totalTrabMin = registros
    .filter((r) => !r.apenasInformativo && (r.status === "OK" || r.status === "PENDENTE"))
    .reduce((s, r) => {
      const [d, m, a] = r.data.split("/");
      return s + minutosDiaExibidos(r, `${a}-${m}-${d}`).trab;
    }, 0);
  const totalFaltas = registros.filter((r) => !r.apenasInformativo && r.status === "FALTA").length;
  const totalOK = registros.filter((r) => !r.apenasInformativo && r.status === "OK").length;
  const totalAfastamentos = registros.filter(
    (r) => !r.apenasInformativo && r.status === "AFASTAMENTO"
  ).length;
  const totalDiasUteis = registros.filter(
    (r) =>
      !r.apenasInformativo &&
      r.status !== "FUTURO" &&
      r.status !== "AFASTAMENTO" &&
      r.status !== "FOLGA" &&
      r.status !== "ISENTO"
  ).length;
  const totalJornadaMin = registros
    .filter(
      (r) =>
        !r.apenasInformativo &&
        r.status !== "FUTURO" &&
        r.status !== "AFASTAMENTO" &&
        r.status !== "FOLGA" &&
        r.status !== "ISENTO"
    )
    .reduce((s, r) => {
      const [d, m, a] = r.data.split("/");
      return s + minutosDiaExibidos(r, `${a}-${m}-${d}`).jornada;
    }, 0);

  /* Ajusta saldo do mês: troca saldos de atestado parcial do banco pelo cálculo atual */
  let saldoMesAjustado = saldoMesBanco;
  if (usarBanco) {
    for (const r of registros) {
      if (!r.atestadoParcial || r.apenasInformativo) continue;
      const [d, m, a] = r.data.split("/");
      const isoKey = `${a}-${m}-${d}`;
      const bancoDia = bancoPorDia?.[isoKey];
      if (!bancoDia) continue;
      saldoMesAjustado = saldoMesAjustado - bancoDia.saldoDiaMinutos + (r.horasMin - r.jornadaMin);
    }
  }

  /* Acumulado ao fim do mês anterior = saldo no início do 1º dia do mês no ciclo. */
  const diasBancoOrdenados = Object.keys(bancoPorDia ?? {}).sort();
  const saldoAcumuladoAnteriorExibido =
    diasBancoOrdenados.length > 0
      ? (() => {
          const primeiro = bancoPorDia![diasBancoOrdenados[0]];
          return primeiro.saldoAcumuladoMinutos - primeiro.saldoDiaMinutos;
        })()
      : saldoAcumuladoMesAnterior;

  const fmtSaldoBanco = (min: number) => {
    const h = Math.floor(Math.abs(min) / 60);
    const m = Math.abs(min) % 60;
    return `${min >= 0 ? "+" : "−"}${h}h${String(m).padStart(2, "0")}`;
  };

  /* Badges de resumo (~15% maiores — BADGE_HISTORICO_STYLE) */
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anoMesAnterior = mes === 1 ? ano - 1 : ano;
  const labelMesAnterior = new Date(anoMesAnterior, mesAnterior - 1, 1).toLocaleDateString(
    "pt-BR",
    {
      month: "short",
      year: "numeric"
    }
  );

  const badgesResumo = (
    <>
      <span className="badge badge-green" style={BADGE_HISTORICO_STYLE}>
        {totalOK} dias OK
      </span>
      {totalFaltas > 0 && (
        <span className="badge badge-red" style={BADGE_HISTORICO_STYLE}>
          {totalFaltas} falta{totalFaltas !== 1 ? "s" : ""}
        </span>
      )}
      {totalAfastamentos > 0 && (
        <span className="badge badge-blue" style={BADGE_HISTORICO_STYLE}>
          {totalAfastamentos} afastamento{totalAfastamentos !== 1 ? "s" : ""}
        </span>
      )}
      <span className="badge badge-gray" style={BADGE_HISTORICO_STYLE}>
        {Math.floor(totalTrabMin / 60)}h{String(totalTrabMin % 60).padStart(2, "0")} trabalhadas
      </span>
      {!ocultarBancoHoras && (
        <>
          <span
            className={saldoAcumuladoAnteriorExibido >= 0 ? "badge badge-green" : "badge badge-red"}
            style={BADGE_HISTORICO_STYLE}
            title={`Banco de horas acumulado ao fim de ${labelMesAnterior}`}
          >
            Acum. {labelMesAnterior}: {fmtSaldoBanco(saldoAcumuladoAnteriorExibido)}
          </span>
          <span
            className={saldoMesAjustado >= 0 ? "badge badge-green" : "badge badge-red"}
            style={BADGE_HISTORICO_STYLE}
            title="Saldo do mês (banco de horas)"
          >
            Saldo: {fmtSaldoBanco(saldoMesAjustado)}
          </span>
          <span
            className={
              saldoAcumuladoAnteriorExibido + saldoMesAjustado >= 0
                ? "badge badge-green"
                : "badge badge-red"
            }
            style={BADGE_HISTORICO_STYLE}
            title={`Soma: acumulado de ${labelMesAnterior} + saldo do mês`}
          >
            Total: {fmtSaldoBanco(saldoAcumuladoAnteriorExibido + saldoMesAjustado)}
          </span>
        </>
      )}
    </>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {modalObs && (
        <ModalObservacoes
          dia={modalObs.dia}
          observacoes={modalObs.observacoes}
          onClose={() => setModalObs(null)}
        />
      )}
      {modalAlmoco && (
        <ModalAlmocoReferencia
          dia={modalAlmoco.dia}
          info={modalAlmoco.info}
          onClose={() => setModalAlmoco(null)}
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
            {!ocultarBancoHoras && (
              <Link to="/ponto/banco-horas" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
                <TrendingUpIcon size={14} />
                {isMobile ? "Banco" : "Banco de Horas"}
              </Link>
            )}
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
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            maxWidth: 360,
            marginLeft: "auto",
            marginRight: "auto"
          }}
        >
          <button
            className="btn-icon"
            onClick={() => navMes(-1)}
            disabled={noMesMinimo}
            style={{
              background: "white",
              border: "1px solid rgba(122,30,38,0.12)",
              flexShrink: 0,
              opacity: noMesMinimo ? 0.4 : 1
            }}
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
            {periodoTeste && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#92400e",
                  background: "#fef3c7",
                  padding: "2px 8px",
                  borderRadius: 999
                }}
              >
                fase de teste
              </span>
            )}
            {popupMes && (
              <PopupMesAno
                mes={mes}
                ano={ano}
                minMes={minMesAno.minMes}
                minAno={minMesAno.minAno}
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
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          {badgesResumo}
        </div>
      </div>

      {/* Modal de assinatura */}
      {modalAssinar && assinatura && (
        <ModalAssinarQuadro
          assinatura={assinatura}
          totalTrabMin={totalTrabMin}
          saldoMesBanco={saldoMesAjustado}
          ocultarBancoHoras={ocultarBancoHoras}
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
                    ...(ocultarBancoHoras ? [] : ["Saldo"]),
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
                  const isoKey = dataPtParaIso(r.data);
                  const bancoDia = bancoPorDia?.[isoKey];
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
                        <HoraCell
                          hora={r.entrada}
                          editado={r.entradaEditada}
                          turnoSemIntervalo={r.semIntervalo ? { turno: r.turno } : undefined}
                        />
                      </td>
                      <td>
                        {r.inicioIntervalo ? (
                          <HoraCell hora={r.inicioIntervalo} editado={r.inicioIntervaloEditado} />
                        ) : r.semIntervalo ? (
                          <IntervaloNaoAplicavelCell
                            turno={r.turno}
                            motivo={r.motivoSemIntervalo}
                            janelaAlmoco={r.janelaAlmoco}
                            onClick={
                              r.observacoes?.length
                                ? () =>
                                    setModalObs({
                                      dia: `${r.diaSemana}, ${r.data}`,
                                      observacoes: r.observacoes ?? []
                                    })
                                : undefined
                            }
                          />
                        ) : (
                          <HoraCell hora={r.inicioIntervalo} editado={r.inicioIntervaloEditado} />
                        )}
                      </td>
                      <td>
                        {r.fimIntervalo ? (
                          <HoraCell
                            hora={r.fimIntervalo}
                            editado={r.fimIntervaloEditado}
                            almocoCurto={r.almocoCurto}
                            onAlmocoInfo={
                              r.almocoCurto
                                ? () =>
                                    setModalAlmoco({
                                      dia: `${r.diaSemana}, ${r.data}`,
                                      info: r.almocoCurto!
                                    })
                                : undefined
                            }
                          />
                        ) : r.semIntervalo || r.atestadoParcial ? (
                          <IntervaloNaoAplicavelCell
                            turno={r.turno}
                            motivo={r.motivoSemIntervalo}
                            janelaAlmoco={r.janelaAlmoco}
                            onClick={
                              r.observacoes?.length
                                ? () =>
                                    setModalObs({
                                      dia: `${r.diaSemana}, ${r.data}`,
                                      observacoes: r.observacoes ?? []
                                    })
                                : undefined
                            }
                          />
                        ) : (
                          <HoraCell hora={r.fimIntervalo} editado={r.fimIntervaloEditado} />
                        )}
                      </td>
                      <td>
                        {r.saida ? (
                          <HoraCell hora={r.saida} editado={r.saidaEditada} />
                        ) : r.saidaNaoAplicavel ? (
                          <IntervaloNaoAplicavelCell
                            turno="ATESTADO_PARCIAL"
                            motivo="ATESTADO_PARCIAL_SAIDA"
                            onClick={
                              r.observacoes?.length
                                ? () =>
                                    setModalObs({
                                      dia: `${r.diaSemana}, ${r.data}`,
                                      observacoes: r.observacoes ?? []
                                    })
                                : undefined
                            }
                          />
                        ) : (
                          <HoraCell hora={r.saida} editado={r.saidaEditada} />
                        )}
                      </td>
                      <td>
                        <PausaCell pausas={r.pausas} />
                      </td>
                      <td>
                        <HorasCell
                          min={
                            r.atestadoParcial
                              ? r.horasMin
                              : (bancoDia?.horasTrabalhadasMinutos ?? r.horasMin)
                          }
                          status={r.status}
                        />
                      </td>
                      {!ocultarBancoHoras && (
                        <td>
                          <SaldoCell
                            trabMin={
                              r.atestadoParcial
                                ? r.horasMin
                                : (bancoDia?.horasTrabalhadasMinutos ?? r.horasMin)
                            }
                            jornadaMin={
                              r.atestadoParcial
                                ? r.jornadaMin
                                : (bancoDia?.jornadaEsperadaMinutos ?? r.jornadaMin)
                            }
                            status={r.status}
                            saldoBancoMin={
                              r.atestadoParcial ? undefined : bancoDia?.saldoDiaMinutos
                            }
                            saldoBancoNeutro={r.atestadoParcial ? false : bancoDia?.neutro}
                          />
                        </td>
                      )}
                      <td
                        style={{
                          width: "1%",
                          whiteSpace: "nowrap",
                          paddingLeft: 10,
                          paddingRight: 10
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <StatusPill
                            status={r.status}
                            obs={r.obs}
                            atestadoParcial={r.atestadoParcial}
                            atestadoParcialHorario={r.atestadoParcialHorario}
                          />
                          {r.apenasInformativo && (
                            <span
                              title={MSG_SOLICITACAO_APENAS_INFORMATIVA}
                              aria-label={MSG_SOLICITACAO_APENAS_INFORMATIVA}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 18,
                                height: 18,
                                borderRadius: "50%",
                                background: "rgba(37,99,235,0.10)",
                                color: "#1e40af",
                                flexShrink: 0,
                                cursor: "help"
                              }}
                            >
                              <InfoIcon size={12} />
                            </span>
                          )}
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
                      colSpan={ocultarBancoHoras ? 9 : 10}
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
                    {!ocultarBancoHoras && (
                      <td>
                        <SaldoCell
                          trabMin={totalTrabMin}
                          jornadaMin={totalJornadaMin}
                          status="OK"
                          saldoBancoMin={saldoMesAjustado}
                        />
                      </td>
                    )}
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
          { cls: "badge-blue", label: "Afastamento / Atestado médico parcial" },
          { cls: "badge-gray", label: "Feriado ou sem expediente" }
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
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11.5,
            color: "var(--ink-500)"
          }}
          title="Clique no ícone ao lado do fim de intervalo para detalhes"
        >
          <CoffeeIcon size={13} style={{ color: "#B45309" }} />
          Almoço &lt; mínimo configurado (cálculo usa referência de 1h)
        </span>
      </div>
    </div>
  );
}

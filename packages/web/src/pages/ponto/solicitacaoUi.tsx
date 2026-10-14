import React, { useState } from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  InfoIcon,
  FileTextIcon,
  TextoComSetaHorario
} from "../../components/icons";
import { MSG_SOLICITACAO_APENAS_INFORMATIVA } from "../../utils/categoriaPonto";
import { dataCivilPeriodo } from "../../utils/horario-brasilia";
import { api } from "../../hooks/useApi";

/* ─── Tipos compartilhados ─── */

export interface SolicitacaoResumo {
  id: string;
  tipo: string;
  status?: string;
  dataReferencia: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  descricao: string;
  metadados?: Record<string, unknown> | null;
  createdAt: string;
  apenasInformativo?: boolean;
  gestorObservacao?: string | null;
  gestorResolvidoEm?: string | null;
  gestorUser?: { name: string } | null;
  rhObservacao?: string | null;
  rhResolvidoEm?: string | null;
  guiaMedicoUrl?: string | null;
  guiaMedicoEnviadaEm?: string | null;
  guiaMedicoObservacao?: string | null;
  documentoRetornoUrl?: string | null;
  documentoRetornoEm?: string | null;
  funcionario: {
    matricula?: string | null;
    fotoPerfilUrl?: string | null;
    user: { name: string; email?: string; emailReal?: string | null };
    gerencia?: { sigla: string; nome?: string } | null;
  };
}

/** Badge-link para abrir documento anexado — estilo canônico do sistema. */
export function labelDocumentoAnexado(
  nomeArquivo?: string | null,
  fallback = "Ver documento anexado"
): string {
  const nome = typeof nomeArquivo === "string" ? nomeArquivo.trim() : "";
  return nome ? `Ver documento — ${nome}` : fallback;
}

/** Variantes de cor por tipo de processo/documento. */
export type LinkDocumentoVariant =
  | "funcionario" // atestado / anexo do funcionário
  | "guia" // guia médica (RH → funcionário)
  | "folha" // folha de pagamento de férias (RH)
  | "retorno" // documento de retorno / folha assinada
  | "rh"; // documento do RH (requisições / docs gerais)

const DOC_VARIANT_THEME: Record<
  LinkDocumentoVariant,
  {
    rgb: string;
    solid: string;
    badgeLabel: string;
  }
> = {
  funcionario: { rgb: "122,30,38", solid: "#7a1e26", badgeLabel: "Anexo" },
  guia: { rgb: "124,58,237", solid: "#7c3aed", badgeLabel: "Guia" },
  folha: { rgb: "47,125,79", solid: "#2f7d4f", badgeLabel: "Folha" },
  retorno: { rgb: "30,74,122", solid: "#1e4a7a", badgeLabel: "Retorno" },
  rh: { rgb: "14,116,144", solid: "#0e7490", badgeLabel: "RH" }
};

function estilosDocVariant(rgb: string) {
  return {
    border: `1px solid rgba(${rgb},0.22)`,
    background: `linear-gradient(180deg, rgba(${rgb},0.08) 0%, rgba(${rgb},0.04) 100%)`,
    color: `rgb(${rgb})`,
    boxShadow: `0 1px 2px rgba(${rgb},0.06)`,
    hoverBg: `linear-gradient(180deg, rgba(${rgb},0.14) 0%, rgba(${rgb},0.08) 100%)`,
    hoverBorder: `rgba(${rgb},0.38)`,
    hoverShadow: `0 2px 6px rgba(${rgb},0.12)`,
    iconBg: `rgba(${rgb},0.12)`
  };
}

export function LinkDocumentoAnexado({
  href,
  label,
  nomeArquivo,
  badge,
  variant = "funcionario",
  style
}: {
  href: string;
  /** Texto completo do link. Se omitido, usa `nomeArquivo` ou fallback genérico. */
  label?: string;
  nomeArquivo?: string | null;
  badge?: string;
  variant?: LinkDocumentoVariant;
  style?: React.CSSProperties;
}) {
  const texto = label ?? labelDocumentoAnexado(nomeArquivo);
  const theme = DOC_VARIANT_THEME[variant] ?? DOC_VARIANT_THEME.funcionario;
  const estilos = estilosDocVariant(theme.rgb);
  const badgeTexto = badge ?? theme.badgeLabel;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        padding: "8px 14px",
        borderRadius: "var(--radius-md)",
        border: estilos.border,
        background: estilos.background,
        color: estilos.color,
        fontSize: 13.5,
        fontWeight: 700,
        lineHeight: 1.3,
        textDecoration: "none",
        boxShadow: estilos.boxShadow,
        transition: "background 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
        maxWidth: "100%",
        ...style
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = estilos.hoverBg;
        el.style.borderColor = estilos.hoverBorder;
        el.style.boxShadow = estilos.hoverShadow;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = estilos.background;
        el.style.borderColor = `rgba(${theme.rgb},0.22)`;
        el.style.boxShadow = estilos.boxShadow;
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: estilos.iconBg,
          flexShrink: 0
        }}
      >
        <FileTextIcon size={14} />
      </span>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{texto}</span>
      <span
        className="badge"
        style={{
          marginLeft: "auto",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.02em",
          background: theme.solid,
          color: "#fff",
          padding: "2px 7px",
          borderRadius: "var(--radius-full)",
          flexShrink: 0
        }}
      >
        {badgeTexto}
      </span>
    </a>
  );
}

const TIPO_LABEL: Record<string, string> = {
  CORRECAO_PONTO: "Correção de Ponto",
  ATESTADO: "Atestado Médico",
  FERIAS: "Férias",
  LICENCA: "Licença e Outros",
  ABONO: "Abono de Falta",
  DAY_OFF: "Day Off de Aniversário",
  HORA_EXTRA: "Hora Extra",
  ENVIO_DOCUMENTO_RH: "Envio de Documento ao RH"
};

const TIPO_PONTO: Record<string, string> = {
  ENTRADA: "Entrada",
  INICIO_INTERVALO: "Início de Intervalo",
  FIM_INTERVALO: "Fim de Intervalo",
  SAIDA: "Saída",
  INTERROMPER_EXPEDIENTE: "Interromper Expediente",
  REINICIAR_EXPEDIENTE: "Reiniciar Expediente"
};

export function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

/** Data de um período de férias em pt-BR, no dia civil de Brasília (ver dataCivilPeriodo). */
export function fmtDataPeriodoFerias(iso: string) {
  const [y, m, d] = dataCivilPeriodo(iso).split("-");
  return d ? `${d}/${m}/${y}` : fmtDate(iso);
}

export function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

/** Dias corridos entre duas datas, contados no calendário de Brasília (inclusive). */
function diffDias(inicio: string, fim: string): number {
  const ini = dataCivilPeriodo(inicio);
  const fi = dataCivilPeriodo(fim);
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const dias = Math.round((utc(fi) - utc(ini)) / 86_400_000) + 1;
  return Number.isFinite(dias) ? Math.max(1, dias) : 1;
}

type CorrecaoDiaItem = {
  acao: string;
  tipoRegistro: string;
  horario: string;
  horarioOriginal?: string;
};

function labelTipoPonto(tipo: string): string {
  return TIPO_PONTO[tipo] ?? tipo;
}

function partesCorrecoesDia(itens: CorrecaoDiaItem[]): string[] {
  return itens.map((c) => {
    const label = labelTipoPonto(c.tipoRegistro);
    if (c.acao === "INCLUIR") return `incluir ${label} às ${c.horario}`;
    if (c.acao === "EXCLUIR") return `excluir ${label}`;
    if (c.horarioOriginal) return `${label}: ${c.horarioOriginal} → ${c.horario}`;
    return `${label} → ${c.horario}`;
  });
}

/** Texto em 2ª pessoa para o funcionário na página de solicitações. */
export function textoCorrecaoPontoFuncionario(s: {
  dataReferencia: string;
  metadados?: Record<string, unknown> | null;
}): string {
  const meta = s.metadados;
  if (!meta) return "Solicitação de correção de ponto em análise.";

  const data = fmtDate(s.dataReferencia);

  if (Array.isArray(meta.correcoesDia) && (meta.correcoesDia as unknown[]).length > 0) {
    const itens = meta.correcoesDia as CorrecaoDiaItem[];

    if (itens.length === 1) {
      const c = itens[0];
      const label = labelTipoPonto(c.tipoRegistro);
      if (c.acao === "INCLUIR") {
        return `Você solicitou a inclusão do registro de ${label} às ${c.horario}, referente ao dia ${data}.`;
      }
      if (c.acao === "EXCLUIR") {
        return `Você solicitou a exclusão do registro de ${label}, referente ao dia ${data}.`;
      }
      if (c.horarioOriginal) {
        return `Você solicitou a alteração do registro de ${label} do dia ${data}: de ${c.horarioOriginal} para ${c.horario}.`;
      }
      return `Você solicitou a alteração do registro de ${label} do dia ${data} para ${c.horario}.`;
    }

    return `Você solicitou correção de ponto em ${data}: ${partesCorrecoesDia(itens).join("; ")}.`;
  }

  const tipoPonto = labelTipoPonto((meta.tipoRegistro as string) ?? "") || "ponto";
  const horarioNovo = (meta.horarioSolicitado as string) ?? (meta.horario as string) ?? "";

  if ((meta.acao as string) === "INCLUIR") {
    return horarioNovo
      ? `Você solicitou a inclusão do registro de ${tipoPonto} às ${horarioNovo}, referente ao dia ${data}.`
      : `Você solicitou a inclusão de registro de ${tipoPonto}, referente ao dia ${data}.`;
  }

  const horarioAntigo = meta.horarioOriginal as string | undefined;
  if (horarioAntigo && horarioNovo) {
    return `Você solicitou a alteração do registro de ${tipoPonto} do dia ${data}: de ${horarioAntigo} para ${horarioNovo}.`;
  }
  if (horarioNovo) {
    return `Você solicitou a alteração do registro de ${tipoPonto} do dia ${data} para ${horarioNovo}.`;
  }
  return `Você solicitou correção de ponto referente ao dia ${data}.`;
}

export function textoResumo(s: SolicitacaoResumo): string {
  const nome = s.funcionario.user.name;
  const meta = s.metadados;

  switch (s.tipo) {
    case "CORRECAO_PONTO": {
      if (!meta) return `${nome} solicita correção de ponto.`;

      if (Array.isArray(meta.correcoesDia) && (meta.correcoesDia as unknown[]).length > 0) {
        const itens = meta.correcoesDia as CorrecaoDiaItem[];
        return `${nome} solicita correção de ponto em ${fmtDate(s.dataReferencia)}: ${partesCorrecoesDia(itens).join("; ")}.`;
      }

      const acao = (meta.acao as string) === "INCLUIR" ? "inclusão" : "alteração";
      const tipoPonto = labelTipoPonto((meta.tipoRegistro as string) ?? "") || "ponto";
      const horarioSolicitado =
        (meta.horarioSolicitado as string) ?? (meta.horario as string) ?? "";
      if (meta.acao === "INCLUIR") {
        return `${nome} solicita a ${acao} de registro de ponto: ${tipoPonto}${horarioSolicitado ? ` às ${horarioSolicitado}` : ""} em ${fmtDate(s.dataReferencia)}.`;
      }
      const de = meta.horarioOriginal ? `de ${meta.horarioOriginal as string} ` : "";
      return `${nome} solicita a ${acao} do registro de ${tipoPonto} ${de}${horarioSolicitado ? `para ${horarioSolicitado} ` : ""}em ${fmtDate(s.dataReferencia)}.`;
    }
    case "ATESTADO": {
      const inicio = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      const fim = s.dataFim ? fmtDate(s.dataFim) : inicio;
      const dias = s.dataInicio && s.dataFim ? diffDias(s.dataInicio, s.dataFim) : 1;
      const periodo =
        meta?.horarioInicio && meta?.horarioFim
          ? ` (${meta.horarioInicio as string}–${meta.horarioFim as string})`
          : "";
      if (inicio === fim) {
        return `${nome} solicita o registro de atestado médico em ${inicio}${periodo}.`;
      }
      return `${nome} solicita o registro de atestado médico de ${inicio} a ${fim}${periodo} — ${dias} dia${dias !== 1 ? "s" : ""}.`;
    }
    case "FERIAS": {
      const periodos = Array.isArray(meta?.periodos)
        ? (meta.periodos as Array<{ dataInicio: string; dataFim: string; dias: number }>)
        : null;
      const diasVenda = Number(meta?.diasVendidos ?? meta?.diasVenda ?? 0);
      const diasGozo = Number(meta?.totalDiasGozo ?? 0);
      if (periodos && periodos.length > 0) {
        const periodosStr = periodos
          .map(
            (p, i) =>
              `${i + 1}º período: ${fmtDataPeriodoFerias(p.dataInicio)} a ${fmtDataPeriodoFerias(p.dataFim)} (${p.dias} dias)`
          )
          .join(" | ");
        const vendaStr = diasVenda > 0 ? ` + ${diasVenda} dia(s) vendidos` : "";
        return `${nome} solicita férias — ${periodosStr}${vendaStr}. Total: ${diasGozo + diasVenda} dias.`;
      }
      const inicio = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      const fim = s.dataFim ? fmtDate(s.dataFim) : inicio;
      const dias = s.dataInicio && s.dataFim ? diffDias(s.dataInicio, s.dataFim) : 0;
      const venda = diasVenda > 0 ? `, vendendo ${diasVenda} dia${diasVenda !== 1 ? "s" : ""}` : "";
      return `${nome} solicita férias de ${inicio} a ${fim} — ${dias} dia${dias !== 1 ? "s" : ""} corridos${venda}.`;
    }
    case "LICENCA": {
      const inicio = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      const fim = s.dataFim ? fmtDate(s.dataFim) : inicio;
      if (inicio === fim) return `${nome} solicita licença em ${inicio}.`;
      const dias = s.dataInicio && s.dataFim ? diffDias(s.dataInicio, s.dataFim) : 0;
      return `${nome} solicita licença de ${inicio} a ${fim} — ${dias} dia${dias !== 1 ? "s" : ""}.`;
    }
    case "ABONO": {
      const periodosAbono = periodosAbonoMeta(meta);
      if (periodosAbono) {
        const tipoAb =
          (meta?.tipoAbono as string) === "FUTURO" ? "abono de dia futuro" : "abono de falta";
        return `${nome} solicita ${tipoAb} — ${periodosAbono
          .map((p, i) => `${i + 1}º: ${textoPeriodoAbono(p)}`)
          .join(" | ")}.`;
      }
      const inicio = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      const fim = s.dataFim ? fmtDate(s.dataFim) : inicio;
      const tipoAbono =
        (meta?.tipoAbono as string) === "FUTURO" ? "abono de dia futuro" : "abono de falta";
      const periodo =
        meta?.horarioInicio && meta?.horarioFim
          ? ` (${meta.horarioInicio as string}–${meta.horarioFim as string})`
          : "";
      if (inicio === fim) return `${nome} solicita ${tipoAbono} em ${inicio}${periodo}.`;
      const dias = s.dataInicio && s.dataFim ? diffDias(s.dataInicio, s.dataFim) : 0;
      return `${nome} solicita ${tipoAbono} de ${inicio} a ${fim}${periodo} — ${dias} dia${dias !== 1 ? "s" : ""}.`;
    }
    case "DAY_OFF": {
      const dia = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      return `${nome} solicita Day Off de Aniversário em ${dia}.`;
    }
    case "ENVIO_DOCUMENTO_RH": {
      const arquivo =
        typeof meta?.nomeArquivo === "string" && meta.nomeArquivo ? ` (${meta.nomeArquivo})` : "";
      return `${nome} enviou um documento ao RH${arquivo}.`;
    }
    default:
      return `${nome} abriu uma solicitação de ${TIPO_LABEL[s.tipo] ?? s.tipo}.`;
  }
}

export function Avatar({ name, fotoUrl }: { name: string; fotoUrl?: string | null }) {
  const baseStyle: React.CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: "50%",
    flexShrink: 0,
    overflow: "hidden",
    border: "2px solid rgba(122,30,38,0.15)"
  };

  if (fotoUrl) {
    return (
      <div style={baseStyle}>
        <img
          src={fotoUrl}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...baseStyle,
        background: "var(--cream-100)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <UserIcon size={22} style={{ color: "var(--ink-400)" }} />
    </div>
  );
}

export function TipoBadge({ tipo }: { tipo: string }) {
  const label = TIPO_LABEL[tipo] ?? tipo.replace(/_/g, " ");
  const colorMap: Record<string, string> = {
    CORRECAO_PONTO: "#1e40af",
    ATESTADO: "#7c3aed",
    FERIAS: "#065f46",
    LICENCA: "#92400e",
    ABONO: "#374151"
  };
  const bg = colorMap[tipo] ?? "#374151";
  return (
    <span
      style={{
        background: `${bg}18`,
        color: bg,
        border: `1px solid ${bg}40`,
        borderRadius: 5,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600
      }}
    >
      {label}
    </span>
  );
}

/** Nome do RH que abriu o pedido em nome do funcionário (ou null). */
function nomeRhCriador(meta: unknown): string | null {
  const c = (meta as { criadaPorRh?: { nome?: string } } | null | undefined)?.criadaPorRh;
  return c?.nome ?? null;
}

export function LogTimelineGestorHistorico({
  s
}: {
  s: SolicitacaoResumo & {
    status?: string;
    rhObservacao?: string | null;
    rhResolvidoEm?: string | null;
    observacaoGestor?: string | null;
  };
}) {
  const chefeNome = s.gestorUser?.name ?? "Chefe";
  const gestorRejeitou = s.status === "REJEITADA_GESTOR";
  const gestorObs = s.gestorObservacao ?? s.observacaoGestor;
  const gestorData = s.gestorResolvidoEm;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginTop: 10,
        padding: "10px 12px",
        background: "rgba(122,30,38,0.04)",
        border: "1px solid rgba(122,30,38,0.12)",
        borderRadius: "var(--radius-md)"
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ink-400)"
        }}
      >
        Etapa do chefe
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
          📤{" "}
          <strong>
            {nomeRhCriador(s.metadados)
              ? `Aberta pelo RH (${nomeRhCriador(s.metadados)})`
              : "Enviada"}
          </strong>{" "}
          em {fmtDateTime(s.createdAt)}
        </p>
        {gestorData ? (
          <p
            style={{
              margin: 0,
              fontSize: 11.5,
              color: gestorRejeitou ? "#dc2626" : s.tipo === "ATESTADO" ? "#6B0F1A" : "#16a34a",
              lineHeight: 1.45
            }}
          >
            {gestorRejeitou ? "❌" : s.tipo === "ATESTADO" ? "✍️" : "✅"}{" "}
            <strong>Chefe {chefeNome}</strong>{" "}
            {gestorRejeitou
              ? "rejeitou"
              : s.tipo === "ATESTADO"
                ? "deu ciência (assinatura digital)"
                : "aprovou"}{" "}
            em {fmtDateTime(gestorData)}
            {gestorObs ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{gestorObs}"
              </span>
            ) : null}
          </p>
        ) : gestorObs ? (
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-600)", lineHeight: 1.45 }}>
            💬 <strong>Chefe {chefeNome}</strong>: "{gestorObs}"
          </p>
        ) : null}
        {!gestorRejeitou && s.status === "AGUARDANDO_RH" && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#7c3aed" }}>
            ⏳ <strong>Encaminhada ao RH</strong> — aguardando análise final
          </p>
        )}
        {!gestorRejeitou && s.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO" && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#d97706" }}>
            ⏳ <strong>Aguardando documento do funcionário</strong>
          </p>
        )}
        {!gestorRejeitou && s.status === "APROVADA" && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#16a34a", lineHeight: 1.45 }}>
            ✅ <strong>RH aprovou</strong>
            {s.rhResolvidoEm ? ` em ${fmtDateTime(s.rhResolvidoEm)}` : ""}
            {s.rhObservacao ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{s.rhObservacao}"
              </span>
            ) : null}
          </p>
        )}
        {!gestorRejeitou && s.status === "REJEITADA_RH" && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#dc2626", lineHeight: 1.45 }}>
            ❌ <strong>RH rejeitou</strong>
            {s.rhResolvidoEm ? ` em ${fmtDateTime(s.rhResolvidoEm)}` : ""}
            {s.rhObservacao ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{s.rhObservacao}"
              </span>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

export function LogTimelineGestor({ s }: { s: SolicitacaoResumo }) {
  const chefeNome = s.gestorUser?.name ?? "Chefe";
  const statusFinal =
    s.status === "APROVADA" || s.status === "REJEITADA_RH" || s.status === "REJEITADA_GESTOR";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginTop: 8,
        padding: "10px 12px",
        background: "rgba(37,99,235,0.04)",
        border: "1px solid rgba(37,99,235,0.12)",
        borderRadius: "var(--radius-md)"
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ink-400)"
        }}
      >
        Histórico
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
          📤{" "}
          <strong>
            {nomeRhCriador(s.metadados)
              ? `Aberta pelo RH (${nomeRhCriador(s.metadados)})`
              : "Enviada"}
          </strong>{" "}
          em {fmtDateTime(s.createdAt)}
        </p>
        {s.gestorResolvidoEm && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#2563eb", lineHeight: 1.45 }}>
            {s.tipo === "ATESTADO" ? "✍️" : "✅"} <strong>Chefe {chefeNome}</strong>{" "}
            {s.tipo === "ATESTADO" ? "deu ciência (assinatura digital)" : "aprovou"} em{" "}
            {fmtDateTime(s.gestorResolvidoEm)}
            {s.gestorObservacao ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{s.gestorObservacao}"
              </span>
            ) : null}
          </p>
        )}
        {s.status === "APROVADA" ? (
          <p style={{ margin: 0, fontSize: 11.5, color: "#16a34a", lineHeight: 1.45 }}>
            ✅ <strong>RH aprovou</strong>
            {s.rhResolvidoEm ? ` em ${fmtDateTime(s.rhResolvidoEm)}` : ""}
            {s.rhObservacao ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{s.rhObservacao}"
              </span>
            ) : null}
          </p>
        ) : s.status === "REJEITADA_RH" ? (
          <p style={{ margin: 0, fontSize: 11.5, color: "#dc2626", lineHeight: 1.45 }}>
            ❌ <strong>RH rejeitou</strong>
            {s.rhResolvidoEm ? ` em ${fmtDateTime(s.rhResolvidoEm)}` : ""}
            {s.rhObservacao ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{s.rhObservacao}"
              </span>
            ) : null}
          </p>
        ) : s.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO" ? (
          <p style={{ margin: 0, fontSize: 11.5, color: "#d97706" }}>
            ⏳ <strong>Aguardando documento do funcionário</strong>
          </p>
        ) : !statusFinal ? (
          <p style={{ margin: 0, fontSize: 11.5, color: "#7c3aed" }}>
            ⏳ <strong>Aguardando análise do RH</strong>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SolicitacaoCardRH({
  s,
  mostrarAcoes = true,
  onDecidir,
  onEnviarGuia,
  onEnviarFolhaFerias
}: {
  s: SolicitacaoResumo;
  mostrarAcoes?: boolean;
  onDecidir: (s: SolicitacaoResumo, decisao: "APROVAR" | "REJEITAR") => void;
  onEnviarGuia?: (s: SolicitacaoResumo) => void;
  onEnviarFolhaFerias?: (s: SolicitacaoResumo) => void;
}) {
  const email = s.funcionario.user.emailReal || s.funcionario.user.email;
  const resumo = textoResumo(s);
  const aguardandoDocFuncionario = s.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO";
  const requerHomologacao = s.metadados?.requerHomologacao === true;
  const podeEnviarGuia =
    mostrarAcoes && s.tipo === "ATESTADO" && (s.status === "AGUARDANDO_RH" || !s.status);
  const podeEnviarFolhaFerias =
    mostrarAcoes && s.tipo === "FERIAS" && (s.status === "AGUARDANDO_RH" || !s.status);
  const aguardandoRetornoConsulta =
    s.tipo === "ATESTADO" && requerHomologacao && !s.documentoRetornoUrl;
  /* Férias: Aviso + Recibo enviados e assinados pelo funcionário (envios antigos: folha +
     documento de retorno). */
  const docsFeriasRh = Array.isArray(s.metadados?.documentosFerias)
    ? (s.metadados!.documentosFerias as Array<{ tipo?: string }>)
    : null;
  const feriasDocsEnviados = docsFeriasRh
    ? docsFeriasRh.some((d) => d.tipo === "AVISO") && docsFeriasRh.some((d) => d.tipo === "RECIBO")
    : !!s.guiaMedicoUrl;
  const feriasAssinadas = docsFeriasRh ? !!s.metadados?.assinaturaFerias : !!s.documentoRetornoUrl;
  const aguardandoFolhaAssinada = s.tipo === "FERIAS" && (!feriasDocsEnviados || !feriasAssinadas);
  const bloqueadoAprovar = aguardandoRetornoConsulta || aguardandoFolhaAssinada;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(37,99,235,0.15)",
        padding: "16px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start"
      }}
    >
      <Avatar name={s.funcionario.user.name} fotoUrl={s.funcionario.fotoPerfilUrl} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 6
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>
            {s.funcionario.user.name}
          </span>
          {s.funcionario.matricula && (
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
              mat. {s.funcionario.matricula}
            </span>
          )}
          {s.funcionario.gerencia && (
            <span
              style={{
                background: "rgba(122,30,38,0.07)",
                color: "var(--burgundy-600)",
                borderRadius: 4,
                padding: "1px 7px",
                fontSize: 11,
                fontWeight: 600
              }}
            >
              {s.funcionario.gerencia.nome}
            </span>
          )}
          <span
            className={`badge ${
              s.status === "APROVADA"
                ? "badge-green"
                : s.status === "REJEITADA_RH"
                  ? "badge-red"
                  : aguardandoDocFuncionario
                    ? "badge-amber"
                    : "badge-blue"
            }`}
          >
            {s.status === "APROVADA"
              ? "Aprovada pelo RH"
              : s.status === "REJEITADA_RH"
                ? "Rejeitada pelo RH"
                : aguardandoDocFuncionario
                  ? "Aguardando documento do funcionário"
                  : "Aguardando RH"}
          </span>
          {s.apenasInformativo && (
            <span
              title={MSG_SOLICITACAO_APENAS_INFORMATIVA}
              aria-label={MSG_SOLICITACAO_APENAS_INFORMATIVA}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(37,99,235,0.08)",
                color: "#1e40af",
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "help"
              }}
            >
              <InfoIcon size={12} />
              Informativo
            </span>
          )}
        </div>

        <p
          style={{
            margin: "0 0 6px",
            fontSize: 13.5,
            color: "var(--ink-800)",
            lineHeight: 1.5,
            fontWeight: 500
          }}
        >
          <TextoComSetaHorario texto={resumo} />
        </p>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 8
          }}
        >
          <TipoBadge tipo={s.tipo} />
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
            Ref.: {fmtDate(s.dataReferencia)}
          </span>
          {email && (
            <>
              <span style={{ fontSize: 11, color: "var(--ink-400)" }}>•</span>
              <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{email}</span>
            </>
          )}
        </div>

        <LogTimelineGestor s={s} />

        {s.tipo === "FERIAS" && <FeriasDetalheBlock meta={s.metadados} />}
        {["ABONO", "LICENCA", "ATESTADO", "DAY_OFF", "HORA_EXTRA", "ENVIO_DOCUMENTO_RH"].includes(
          s.tipo
        ) && <AbonoDetalheBlock meta={s.metadados} />}
        {s.tipo === "CORRECAO_PONTO" && <AvisoInterjornadaBlock meta={s.metadados} />}

        {s.tipo === "FERIAS" && (s.guiaMedicoUrl || s.documentoRetornoUrl) && (
          <div
            style={{
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}
          >
            {s.guiaMedicoUrl && (
              <>
                <LinksDocumentosFerias meta={s.metadados} guiaMedicoUrl={s.guiaMedicoUrl} />
                {s.guiaMedicoEnviadaEm && (
                  <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
                    Enviada em {fmtDateTime(s.guiaMedicoEnviadaEm)}
                  </p>
                )}
              </>
            )}
            {s.documentoRetornoUrl && !Array.isArray(s.metadados?.documentosFerias) && (
              <>
                <LinkDocumentoAnexado
                  href={s.documentoRetornoUrl}
                  label="Ver documento — Folha assinada pelo funcionário"
                  variant="retorno"
                />
                {s.documentoRetornoEm && (
                  <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
                    Enviada em {fmtDateTime(s.documentoRetornoEm)}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {s.tipo === "ATESTADO" && typeof s.metadados?.documentoUrl === "string" && (
          <LinkDocumentoAnexado
            href={s.metadados.documentoUrl as string}
            nomeArquivo={
              typeof s.metadados?.nomeArquivo === "string" ? s.metadados.nomeArquivo : "Atestado"
            }
            variant="funcionario"
          />
        )}

        {(s.tipo === "ENVIO_DOCUMENTO_RH" || s.tipo === "ABONO" || s.tipo === "LICENCA") &&
          typeof s.metadados?.documentoUrl === "string" && (
            <LinkDocumentoAnexado
              href={s.metadados.documentoUrl as string}
              nomeArquivo={
                typeof s.metadados?.nomeArquivo === "string" ? s.metadados.nomeArquivo : null
              }
              variant="funcionario"
            />
          )}

        {s.tipo === "ATESTADO" && s.guiaMedicoUrl && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginTop: 8
            }}
          >
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-600)", lineHeight: 1.45 }}>
              <strong>Guia médica enviada</strong>
              {s.guiaMedicoEnviadaEm ? ` em ${fmtDateTime(s.guiaMedicoEnviadaEm)}` : ""}
            </p>
            {s.guiaMedicoObservacao && (
              <p
                style={{ margin: 0, fontSize: 11.5, color: "var(--ink-600)", fontStyle: "italic" }}
              >
                "{s.guiaMedicoObservacao}"
              </p>
            )}
            <LinkDocumentoAnexado
              href={s.guiaMedicoUrl}
              label="Ver documento — Guia médica"
              variant="guia"
            />
          </div>
        )}

        {s.tipo === "ATESTADO" && s.documentoRetornoUrl && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <LinkDocumentoAnexado
              href={s.documentoRetornoUrl}
              label="Ver documento — Documento de retorno (consulta)"
              variant="retorno"
            />
            {s.documentoRetornoEm && (
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
                Enviado em {fmtDateTime(s.documentoRetornoEm)}
              </p>
            )}
          </div>
        )}

        {s.descricao && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12.5,
              color: "var(--ink-600)",
              lineHeight: 1.5,
              borderLeft: "3px solid rgba(122,30,38,0.12)",
              paddingLeft: 10,
              fontStyle: "italic"
            }}
          >
            "{s.descricao}"
          </p>
        )}
      </div>

      {mostrarAcoes && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          {!aguardandoDocFuncionario && (
            <>
              <button
                onClick={() => !bloqueadoAprovar && onDecidir(s, "APROVAR")}
                disabled={bloqueadoAprovar}
                title={
                  aguardandoFolhaAssinada
                    ? !feriasDocsEnviados
                      ? "Envie o Aviso e o Recibo de Férias ao funcionário antes de aprovar"
                      : s.metadados?.rejeicaoDocumentoFerias
                        ? "O funcionário rejeitou um documento — corrija e reenvie os documentos de férias"
                        : "Aguardando o funcionário assinar pelo sistema cada documento de férias"
                    : aguardandoRetornoConsulta
                      ? "Aguardando o funcionário enviar o documento de retorno da consulta médica"
                      : undefined
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 14px",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  background: bloqueadoAprovar ? "#9ca3af" : "#16a34a",
                  color: "#fff",
                  cursor: bloqueadoAprovar ? "not-allowed" : "pointer",
                  opacity: bloqueadoAprovar ? 0.7 : 1,
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                <CheckCircleIcon size={14} />{" "}
                {s.tipo === "ENVIO_DOCUMENTO_RH" ? "Confirmar recebimento" : "Aprovar (RH)"}
              </button>
              <button
                onClick={() => onDecidir(s, "REJEITAR")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 14px",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  background: "var(--red)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                <XCircleIcon size={14} /> Rejeitar (RH)
              </button>
            </>
          )}
          {podeEnviarGuia && onEnviarGuia && (
            <button
              onClick={() => onEnviarGuia(s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 14px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: requerHomologacao ? "#7c3aed" : "#0ea5e9",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600
              }}
            >
              📄 Enviar Guia Médico
            </button>
          )}
          {podeEnviarFolhaFerias && onEnviarFolhaFerias && (
            <button
              onClick={() => onEnviarFolhaFerias(s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 14px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: "#2f7d4f",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600
              }}
            >
              🌴 Enviar documentos de férias
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ModalDecisaoRH({
  solicitacao,
  decisao,
  resumo,
  onConfirm,
  onClose,
  loading,
  erro
}: {
  solicitacao: SolicitacaoResumo;
  decisao: "APROVAR" | "REJEITAR";
  resumo: string;
  onConfirm: (observacao: string) => void;
  onClose: () => void;
  loading: boolean;
  erro?: string;
}) {
  const [obs, setObs] = useState("");

  const isAprovar = decisao === "APROVAR";
  const corAcao = isAprovar ? "#16a34a" : "#dc2626";
  const corAcaoClaro = isAprovar ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.06)";
  const corBorda = isAprovar ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)";
  const emoji = isAprovar ? "✅" : "❌";
  const titulo = isAprovar
    ? solicitacao.tipo === "ENVIO_DOCUMENTO_RH"
      ? "Confirmar recebimento do documento"
      : "Confirmar Aprovação Final (RH)"
    : "Confirmar Rejeição (RH)";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            background: corAcaoClaro,
            borderBottom: `1px solid ${corBorda}`,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 14
          }}
        >
          <span style={{ fontSize: 32, lineHeight: 1 }}>{emoji}</span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: corAcao,
                fontFamily: "var(--font-display)"
              }}
            >
              {titulo}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>
              {TIPO_LABEL[solicitacao.tipo] ?? solicitacao.tipo} ·{" "}
              <strong>{solicitacao.funcionario.user.name}</strong>
            </p>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              background: "var(--cream-50)",
              border: "1px solid rgba(122,30,38,0.10)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px"
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-400)"
              }}
            >
              Solicitação
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-800)", lineHeight: 1.5 }}>
              <TextoComSetaHorario texto={resumo} />
            </p>
            {solicitacao.descricao && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12,
                  color: "var(--ink-500)",
                  fontStyle: "italic",
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                  paddingTop: 8
                }}
              >
                Justificativa: "{solicitacao.descricao}"
              </p>
            )}
          </div>

          {solicitacao.tipo === "FERIAS" && <FeriasDetalheBlock meta={solicitacao.metadados} />}
          {["ABONO", "LICENCA", "ATESTADO", "DAY_OFF", "HORA_EXTRA", "ENVIO_DOCUMENTO_RH"].includes(
            solicitacao.tipo
          ) && <AbonoDetalheBlock meta={solicitacao.metadados} />}
          {solicitacao.tipo === "CORRECAO_PONTO" && (
            <AvisoInterjornadaBlock meta={solicitacao.metadados} />
          )}

          <LogTimelineGestor s={solicitacao} />

          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink-900)",
              textAlign: "center"
            }}
          >
            {isAprovar
              ? solicitacao.tipo === "ENVIO_DOCUMENTO_RH"
                ? "Confirma o recebimento deste documento?"
                : "Você confirma a aprovação final desta solicitação?"
              : "Você confirma a rejeição desta solicitação?"}
          </p>
          {isAprovar && solicitacao.tipo !== "ENVIO_DOCUMENTO_RH" && (
            <p
              style={{
                margin: "-8px 0 0",
                fontSize: 12,
                color: "var(--ink-500)",
                textAlign: "center"
              }}
            >
              A aprovação será definitiva e a alteração será aplicada ao ponto do funcionário.
            </p>
          )}
          {isAprovar &&
            (solicitacao.tipo === "ENVIO_DOCUMENTO_RH" ||
              solicitacao.tipo === "ABONO" ||
              solicitacao.tipo === "LICENCA") &&
            typeof solicitacao.metadados?.documentoUrl === "string" && (
              <LinkDocumentoAnexado
                href={solicitacao.metadados.documentoUrl as string}
                nomeArquivo={
                  typeof solicitacao.metadados?.nomeArquivo === "string"
                    ? solicitacao.metadados.nomeArquivo
                    : null
                }
                variant="funcionario"
              />
            )}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)"
              }}
            >
              {isAprovar ? "Observação (opcional)" : "Motivo da rejeição (obrigatório)"}
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder={
                isAprovar
                  ? "Deixe uma observação registrada na solicitação, se necessário..."
                  : "Informe o motivo da rejeição ao funcionário..."
              }
              rows={3}
              autoFocus
              style={{
                width: "100%",
                border: `1px solid ${obs.trim() || isAprovar ? "rgba(0,0,0,0.15)" : "rgba(220,38,38,0.40)"}`,
                borderRadius: "var(--radius-md)",
                padding: "9px 11px",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
                outline: "none"
              }}
            />
            {!isAprovar && !obs.trim() && (
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#dc2626" }}>
                O motivo da rejeição é obrigatório.
              </p>
            )}
          </div>

          {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>⚠️ {erro}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "10px 20px",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink-600)"
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(obs)}
              disabled={loading || (!isAprovar && !obs.trim())}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: loading || (!isAprovar && !obs.trim()) ? "#9ca3af" : corAcao,
                color: "#fff",
                cursor: loading || (!isAprovar && !obs.trim()) ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 7
              }}
            >
              {loading ? (
                <>⏳ Processando...</>
              ) : isAprovar ? (
                <>
                  {solicitacao.tipo === "ENVIO_DOCUMENTO_RH"
                    ? "✅ Confirmar recebimento"
                    : "✅ Sim, aprovar"}
                </>
              ) : (
                <>❌ Sim, rejeitar</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModalEnviarGuia({
  solicitacao,
  resumo,
  onConfirm,
  onClose,
  loading,
  erro
}: {
  solicitacao: SolicitacaoResumo;
  resumo: string;
  onConfirm: (guiaMedicoBase64: string, observacao: string) => void;
  onClose: () => void;
  loading: boolean;
  erro?: string;
}) {
  const [obs, setObs] = useState("");
  const [base64, setBase64] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setBase64(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            background: "rgba(124,58,237,0.06)",
            borderBottom: "1px solid rgba(124,58,237,0.20)",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 14
          }}
        >
          <span style={{ fontSize: 32, lineHeight: 1 }}>📄</span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: "#7c3aed",
                fontFamily: "var(--font-display)"
              }}
            >
              Enviar Guia Médico
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>
              {TIPO_LABEL[solicitacao.tipo] ?? solicitacao.tipo} ·{" "}
              <strong>{solicitacao.funcionario.user.name}</strong>
            </p>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              background: "var(--cream-50)",
              border: "1px solid rgba(122,30,38,0.10)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px"
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-400)"
              }}
            >
              Solicitação
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-800)", lineHeight: 1.5 }}>
              <TextoComSetaHorario texto={resumo} />
            </p>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-600)", lineHeight: 1.5 }}>
            Anexe a guia médica individual (PDF) que deve ser entregue ao funcionário para a
            consulta com o médico do trabalho. Após o envio, a solicitação ficará aguardando o
            funcionário enviar o documento de retorno (resultado da consulta).
          </p>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)"
              }}
            >
              Guia médica (PDF)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="file"
                id="guia-medica-upload"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={handleArquivo}
              />
              <label
                htmlFor="guia-medica-upload"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  border: "1px solid rgba(124,58,237,0.35)",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(124,58,237,0.06)",
                  color: "#7c3aed",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600
                }}
              >
                📎 {nomeArquivo ?? "Selecionar PDF"}
              </label>
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)"
              }}
            >
              Observação (opcional)
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Instruções adicionais para o funcionário, se necessário..."
              rows={3}
              style={{
                width: "100%",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "var(--radius-md)",
                padding: "9px 11px",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
                outline: "none"
              }}
            />
          </div>

          {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>⚠️ {erro}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "10px 20px",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink-600)"
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => base64 && onConfirm(base64, obs)}
              disabled={loading || !base64}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: loading || !base64 ? "#9ca3af" : "#7c3aed",
                color: "#fff",
                cursor: loading || !base64 ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 7
              }}
            >
              {loading ? <>⏳ Enviando...</> : <>📄 Enviar guia</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Períodos de uma solicitação de abono (metadados.periodos); null no formato antigo. */
function periodosAbonoMeta(
  meta: Record<string, unknown> | null | undefined
): Array<{ inicio: string; fim: string; horario: string | null }> | null {
  if (!meta || !Array.isArray(meta.periodos) || !meta.periodos.length) return null;
  return (meta.periodos as Array<Record<string, unknown>>).map((p) => {
    const hi = typeof p.horarioInicio === "string" ? p.horarioInicio : null;
    const hf = typeof p.horarioFim === "string" ? p.horarioFim : null;
    return {
      inicio: fmtDataPeriodoFerias(String(p.dataInicio ?? "")),
      fim: fmtDataPeriodoFerias(String(p.dataFim ?? p.dataInicio ?? "")),
      horario: hi && hf ? `${hi}–${hf}` : null
    };
  });
}

function textoPeriodoAbono(p: { inicio: string; fim: string; horario: string | null }) {
  if (p.inicio !== p.fim) return `${p.inicio} a ${p.fim} (dias inteiros)`;
  return p.horario ? `${p.inicio} ${p.horario}` : `${p.inicio} (dia inteiro)`;
}

/**
 * Aviso para quem analisa uma correção de ponto cuja Entrada fica abaixo do descanso de
 * interjornada (metadados.avisoInterjornada, gravado na criação do pedido). Não bloqueia.
 */
export function AvisoInterjornadaBlock({
  meta
}: {
  meta: Record<string, unknown> | null | undefined;
}) {
  const a = meta?.avisoInterjornada as
    | { descansoMin?: number; minimoMin?: number; saidaAnterior?: string }
    | undefined;
  if (!a || typeof a.descansoMin !== "number" || typeof a.minimoMin !== "number") return null;
  const h = (min: number) =>
    min % 60 === 0
      ? `${min / 60}h`
      : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  return (
    <div
      role="note"
      style={{
        marginTop: 8,
        padding: "9px 12px",
        background: "rgba(247,196,55,0.12)",
        border: "1px solid rgba(247,196,55,0.45)",
        borderRadius: "var(--radius-md)",
        fontSize: 12.5,
        color: "#6b5200",
        lineHeight: 1.5
      }}
    >
      ⚠ <strong>Esta entrada desrespeita o descanso de interjornada de {h(a.minimoMin)}</strong>{" "}
      (descanso de {h(a.descansoMin)}
      {a.saidaAnterior ? `, última saída em ${fmtDateTime(a.saidaAnterior)}` : ""}). A aprovação é
      do chefe e do RH e ficará registrada no histórico do ponto.
    </div>
  );
}

export function AbonoDetalheBlock({ meta }: { meta: Record<string, unknown> | null | undefined }) {
  const periodos = periodosAbonoMeta(meta);
  const cid = meta?.cidGrupo as { codigo?: string; descricao?: string } | undefined;
  const tipoLicenca = meta?.tipoLicenca as
    | { nome?: string; resumo?: string; comProrrogacao?: boolean }
    | undefined;
  /* Atestado: grupo do CID (o servidor só envia ao RH e ao próprio funcionário). */
  const blocoCid = cid?.codigo ? (
    <p
      title="Informação de saúde (LGPD): visível apenas ao RH e ao próprio funcionário"
      style={{
        margin: "8px 0 0",
        fontSize: 12.5,
        color: "var(--ink-800)",
        padding: "6px 10px",
        background: "rgba(122,30,38,0.04)",
        border: "1px solid rgba(122,30,38,0.12)",
        borderRadius: "var(--radius-md)"
      }}
    >
      🩺 <strong>CID:</strong> {cid.codigo} — {cid.descricao}
    </p>
  ) : null;
  const criada = meta?.criadaPorRh as
    | { nome?: string; em?: string; dispensas?: string[]; justificativa?: string }
    | undefined;
  const doRh = meta?.origem === "RH" || !!criada || !!meta?.criadoPeloRH;
  /* Origem do pedido: sempre marcada (feito pelo RH × pedido do funcionário). */
  const blocoOrigem = (
    <p
      style={{ margin: "8px 0 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
    >
      <TagOrigemFerias meta={meta} />
      {doRh && criada?.nome && (
        <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>por {criada.nome}</span>
      )}
      {doRh && criada?.dispensas?.length ? (
        <span
          title={`Justificativa: ${criada.justificativa ?? ""}`}
          style={{ fontSize: 11.5, color: "#92400e" }}
        >
          · dispensou: {criada.dispensas.join("; ")}
        </span>
      ) : null}
    </p>
  );
  if (!periodos || (!tipoLicenca?.nome && !meta?.periodos && !meta?.creditoBanco)) {
    return (
      <>
        {blocoOrigem}
        {blocoCid}
      </>
    );
  }
  const diasCota = (meta?.cotaAbono as { dias?: string[] } | undefined)?.dias?.length ?? 0;
  const credito = Number(
    (meta?.creditoBanco as { minutosTotal?: number } | undefined)?.minutosTotal ?? 0
  );
  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 12px",
        background: "rgba(37,99,235,0.04)",
        border: "1px solid rgba(37,99,235,0.14)",
        borderRadius: "var(--radius-md)"
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "#1e40af",
          textTransform: "uppercase",
          letterSpacing: "0.06em"
        }}
      >
        {tipoLicenca?.nome ? "📆 Períodos da licença" : "📆 Períodos do abono"}
      </p>
      {tipoLicenca?.nome && (
        <p style={{ margin: "0 0 6px", fontSize: 12.5, color: "var(--ink-800)" }}>
          <strong>{tipoLicenca.nome}</strong>
          {tipoLicenca.resumo ? ` (${tipoLicenca.resumo})` : ""}
          {tipoLicenca.comProrrogacao ? " — com prorrogação" : ""}
        </p>
      )}
      {periodos.map((p, i) => (
        <p key={i} style={{ margin: "0 0 3px", fontSize: 12.5, color: "var(--ink-800)" }}>
          <span style={{ fontWeight: 600 }}>{i + 1}º período:</span> {textoPeriodoAbono(p)}
        </p>
      ))}
      {diasCota > 0 && (
        <p
          title="Abono diário da cota do acordo coletivo"
          style={{
            margin: "6px 0 0",
            display: "inline-block",
            fontSize: 11.5,
            fontWeight: 700,
            padding: "2px 9px",
            borderRadius: 999,
            background: "rgba(37,99,235,0.08)",
            color: "#1e40af",
            border: "1px solid rgba(37,99,235,0.25)"
          }}
        >
          📅 Cota do acordo coletivo · {diasCota} dia(s)
        </p>
      )}
      {credito && credito > 0 && (
        <p
          title="Este abono usa tempo do banco de horas liberado pelo RH (já descontado do banco)"
          style={{
            margin: "6px 0 0",
            display: "inline-block",
            fontSize: 11.5,
            fontWeight: 700,
            padding: "2px 9px",
            borderRadius: 999,
            background: "rgba(22,128,61,0.08)",
            color: "#166534",
            border: "1px solid rgba(22,128,61,0.25)"
          }}
        >
          ⏱ Tempo liberado pelo RH · {Math.floor(credito / 60)}h
          {String(credito % 60).padStart(2, "0")}
        </p>
      )}
      {blocoOrigem}
      {blocoCid}
    </div>
  );
}

/** Tag "Pedido do funcionário" × "Feito pelo RH" (férias). */
export function TagOrigemFerias({ meta }: { meta: Record<string, unknown> | null | undefined }) {
  const doRh = meta?.origem === "RH";
  return (
    <span
      title={doRh ? "Aberto/alterado pelo RH" : "Pedido feito pelo funcionário"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10.5,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        letterSpacing: "0.02em",
        background: doRh ? "rgba(122,30,38,0.08)" : "rgba(37,99,235,0.08)",
        color: doRh ? "var(--burgundy-600)" : "#1e40af",
        border: `1px solid ${doRh ? "rgba(122,30,38,0.20)" : "rgba(37,99,235,0.20)"}`
      }}
    >
      {doRh ? "🏢 Feito pelo RH" : "👤 Pedido do funcionário"}
    </span>
  );
}

/** Quem do RH fez, justificativa e — se for o caso — cancelamento/substituição pelo RH. */
export function DetalheAcaoRhFerias({
  meta,
  rhResolvidoEm
}: {
  meta: Record<string, unknown> | null | undefined;
  rhResolvidoEm?: string | null;
}) {
  const acao = meta?.acaoRh as string | undefined;
  const canc = meta?.canceladaPorRh as
    | { motivo?: string; nome?: string; em?: string; justificativa?: string }
    | undefined;
  if (meta?.origem !== "RH" && !canc) return null;
  const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "");
  const motivoCanc =
    canc?.motivo === "SUBSTITUIDA"
      ? "Substituído pelo agendamento do RH"
      : canc?.motivo === "ALTERADA"
        ? "Alterado pelo RH"
        : "Cancelado pelo RH";
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        borderLeft: "3px solid var(--burgundy-600)",
        background: "rgba(122,30,38,0.04)",
        borderRadius: "0 var(--radius-md) var(--radius-md) 0",
        fontSize: 12,
        color: "var(--ink-700)",
        display: "flex",
        flexDirection: "column",
        gap: 3
      }}
    >
      {meta?.origem === "RH" && (
        <span>
          <strong>
            {acao === "ALTERADA" ? "Alterado" : "Agendado"} pelo RH
            {meta?.rhNome ? ` — ${String(meta.rhNome)}` : ""}
          </strong>
          {rhResolvidoEm ? ` em ${quando(rhResolvidoEm)}` : ""}
          {meta?.ignorouVedacao ? " · vedação ignorada" : ""}
          <br />
          Justificativa: <em>{String(meta?.justificativaRh ?? "")}</em>
        </span>
      )}
      {canc && (
        <span style={{ color: "var(--red)" }}>
          <strong>
            {motivoCanc}
            {canc.nome ? ` — ${canc.nome}` : ""}
          </strong>
          {canc.em ? ` em ${quando(canc.em)}` : ""}
          {canc.justificativa ? (
            <>
              <br />
              Justificativa: <em>{canc.justificativa}</em>
            </>
          ) : null}
        </span>
      )}
    </div>
  );
}

export function FeriasDetalheBlock({ meta }: { meta: Record<string, unknown> | null | undefined }) {
  if (!meta) return null;
  const periodos = Array.isArray(meta.periodos)
    ? (meta.periodos as Array<{ dataInicio: string; dataFim: string; dias: number }>)
    : [];
  const diasVendidos = Number(meta.diasVendidos ?? meta.diasVenda ?? 0);
  const totalGozo = Number(meta.totalDiasGozo ?? periodos.reduce((s, p) => s + p.dias, 0));
  const isAlteracao = typeof meta.alteracaoDeId === "string" && meta.origem !== "RH";
  const cicloNumero = meta.cicloNumero != null ? Number(meta.cicloNumero) : null;

  if (periodos.length === 0 && diasVendidos === 0) return null;

  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 12px",
        background: "rgba(47,125,79,0.05)",
        border: "1px solid rgba(47,125,79,0.15)",
        borderRadius: "var(--radius-md)"
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "#2f7d4f",
          textTransform: "uppercase",
          letterSpacing: "0.06em"
        }}
      >
        🌴 Períodos de férias
        {cicloNumero != null ? ` — ciclo ${cicloNumero}` : ""}
        {isAlteracao ? " — solicitação de mudança" : ""}{" "}
        <span style={{ textTransform: "none", letterSpacing: 0, marginLeft: 4 }}>
          <TagOrigemFerias meta={meta} />
        </span>
      </p>
      {periodos.map((p, i) => (
        <p key={i} style={{ margin: "0 0 3px", fontSize: 12.5, color: "var(--ink-800)" }}>
          <span style={{ fontWeight: 600 }}>{i + 1}º período:</span>{" "}
          {fmtDataPeriodoFerias(p.dataInicio)} a {fmtDataPeriodoFerias(p.dataFim)}{" "}
          <span style={{ color: "var(--ink-500)" }}>({p.dias} dias)</span>
        </p>
      ))}
      {diasVendidos > 0 ? (
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--ink-600)" }}>
          + {diasVendidos} dia{diasVendidos !== 1 ? "s" : ""} vendidos (abono pecuniário)
        </p>
      ) : (
        !isAlteracao && (
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--ink-500)" }}>
            Sem venda de dias nesta solicitação
          </p>
        )
      )}
      {(periodos.length > 0 || diasVendidos > 0) && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12,
            fontWeight: 700,
            color: "#2f7d4f",
            borderTop: "1px solid rgba(47,125,79,0.12)",
            paddingTop: 5
          }}
        >
          Total: {totalGozo + diasVendidos} dias ({totalGozo} gozo
          {diasVendidos > 0 ? ` + ${diasVendidos} venda` : ""})
        </p>
      )}
      <DetalheAcaoRhFerias meta={meta} />
    </div>
  );
}

/** Documento de férias enviado pelo RH (corpo do PATCH enviar-folha-ferias). */
export interface DocumentoFeriasEnvio {
  tipo: "AVISO" | "RECIBO" | "OUTROS";
  rotulo?: string;
  nomeArquivo?: string;
  mimeType?: string;
  arquivoBase64: string;
}

interface LinhaDocFerias {
  tipo: "AVISO" | "RECIBO" | "OUTROS";
  rotulo: string;
  nomeArquivo?: string;
  mimeType?: string;
  tamanho?: number;
  arquivoBase64?: string;
}

const ROTULO_DOC_FERIAS: Record<string, string> = {
  AVISO: "Aviso de Férias",
  RECIBO: "Recibo de Férias",
  OUTROS: "Outros"
};

/** Documento de férias do RH, com assinatura ou rejeição do funcionário (metadados). */
interface DocFeriasMeta {
  tipo?: string;
  rotulo?: string;
  nome?: string | null;
  url: string;
  urlAssinado?: string;
  assinatura?: { nome?: string; em?: string; codigo?: string };
  rejeicao?: { nome?: string; em?: string; justificativa?: string };
}

const fmtBrasilia = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

function docsFeriasDe(meta: Record<string, unknown> | null | undefined): DocFeriasMeta[] {
  return Array.isArray(meta?.documentosFerias) ? (meta!.documentosFerias as DocFeriasMeta[]) : [];
}

/**
 * Documentos de férias enviados pelo RH, cada um com a sua situação: assinado (link da
 * versão assinada + quem/quando/código), rejeitado (justificativa) ou aguardando.
 * Envios antigos têm só a folha em `guiaMedicoUrl`.
 */
export function LinksDocumentosFerias({
  meta,
  guiaMedicoUrl,
  style
}: {
  meta: Record<string, unknown> | null | undefined;
  guiaMedicoUrl?: string | null;
  style?: React.CSSProperties;
}) {
  const docs = docsFeriasDe(meta);
  if (!docs.length) {
    return guiaMedicoUrl ? (
      <LinkDocumentoAnexado
        href={guiaMedicoUrl}
        label="Ver documento — Folha de pagamento de férias"
        variant="folha"
        style={style}
      />
    ) : null;
  }
  return (
    <>
      {docs.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <LinkDocumentoAnexado
            href={d.urlAssinado ?? d.url}
            label={`Ver documento — ${d.rotulo ?? "Documento de férias"}${d.urlAssinado ? " (assinado)" : ""}`}
            variant={d.urlAssinado ? "retorno" : "folha"}
            style={style}
          />
          {d.assinatura?.em && (
            <span style={{ fontSize: 11, color: "#065f46" }}>
              ✍️ Assinado por {d.assinatura.nome} em {fmtBrasilia(d.assinatura.em)}
              {d.assinatura.codigo ? ` · código ${d.assinatura.codigo}` : ""}
            </span>
          )}
          {d.rejeicao && (
            <span style={{ fontSize: 11, color: "var(--red)" }}>
              ✕ Rejeitado por {d.rejeicao.nome} em {fmtBrasilia(d.rejeicao.em)}: “
              {d.rejeicao.justificativa}”
            </span>
          )}
          {!d.assinatura && !d.rejeicao && (
            <span style={{ fontSize: 11, color: "#8a6a00" }}>⏳ Aguardando assinatura</span>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * Funcionário trata cada documento de férias separadamente: abre, e só então assina
 * (selo digital no rodapé) ou rejeita com justificativa (volta ao RH). Usado em
 * Solicitações → Férias e em Minhas Requisições do RH — é a mesma solicitação, então o que
 * for feito em uma tela vale na outra.
 */
export function AssinarDocumentosFerias({
  solicitacao,
  onAssinado,
  rodada
}: {
  /** Rodada do 2º/3º período: usa os documentos e a situação dela, não os da solicitação. */
  rodada?: {
    ordem: number;
    inicio: string;
    fim: string;
    situacao?: string;
    documentos?: DocFeriasMeta[];
    enviadaEm?: string;
    observacao?: string;
  };
  solicitacao: {
    id: string;
    status: string;
    metadados?: Record<string, unknown> | null;
    guiaMedicoUrl?: string | null;
    guiaMedicoEnviadaEm?: string | null;
    guiaMedicoObservacao?: string | null;
  };
  onAssinado: () => void;
}) {
  const docs = rodada ? (rodada.documentos ?? []) : docsFeriasDe(solicitacao.metadados);
  const pendente = rodada
    ? rodada.situacao === "AGUARDANDO_ASSINATURA"
    : solicitacao.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO";
  const enviadaEm = rodada ? rodada.enviadaEm : solicitacao.guiaMedicoEnviadaEm;
  const observacao = rodada ? rodada.observacao : solicitacao.guiaMedicoObservacao;
  const tituloRodada = rodada
    ? `${rodada.ordem}º período (${rodada.inicio.split("-").reverse().join("/")} a ${rodada.fim.split("-").reverse().join("/")})`
    : "";
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [aceites, setAceites] = useState<Set<number>>(new Set());
  const [rejeitando, setRejeitando] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  const marcar = (set: Set<number>, i: number, on: boolean) => {
    const n = new Set(set);
    if (on) n.add(i);
    else n.delete(i);
    return n;
  };

  async function acao(i: number, tipo: "assinar" | "rejeitar") {
    setEnviando(i);
    setErro("");
    try {
      await api.post(
        rodada
          ? `/ponto/solicitacoes/${solicitacao.id}/ferias/rodadas/${rodada.ordem}/documentos/${i}/${tipo}`
          : `/ponto/solicitacoes/${solicitacao.id}/ferias/documentos/${i}/${tipo}`,
        tipo === "assinar" ? { aceite: true } : { justificativa: justificativa.trim() }
      );
      setRejeitando(null);
      setJustificativa("");
      onAssinado();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível concluir. Tente novamente.");
    } finally {
      setEnviando(null);
    }
  }

  const rejeitado = docs.find((d) => d.rejeicao);
  const assinados = docs.filter((d) => d.assinatura).length;
  const cor = pendente ? "#8a6a00" : rejeitado ? "var(--red)" : "#065f46";
  const btn = (bg: string, desabilitado: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: desabilitado ? "#9ca3af" : bg,
    color: "#fff",
    cursor: desabilitado ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 700
  });

  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        background: pendente ? "rgba(247,196,55,0.08)" : "rgba(47,125,79,0.05)",
        border: `1px solid ${pendente ? "rgba(247,196,55,0.35)" : "rgba(47,125,79,0.20)"}`,
        borderRadius: "var(--radius-md)",
        display: "flex",
        flexDirection: "column",
        gap: 8
      }}
    >
      <p style={{ margin: 0, fontSize: 12.5, color: cor, lineHeight: 1.5 }}>
        📄{" "}
        <strong>
          {pendente
            ? `Documentos ${rodada ? `do ${tituloRodada}` : "das suas férias"} para assinar (${assinados} de ${docs.length} assinado${docs.length === 1 ? "" : "s"})`
            : rejeitado
              ? "Você rejeitou um documento — aguardando o RH corrigir e reenviar"
              : rodada
                ? `Documentos do ${tituloRodada} assinados`
                : "Documentos de férias assinados"}
        </strong>
        {enviadaEm ? ` — enviados pelo RH em ${fmtBrasilia(enviadaEm)}` : ""}
      </p>
      {pendente && observacao && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-600)", fontStyle: "italic" }}>
          "{observacao}"
        </p>
      )}
      {pendente && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-600)", lineHeight: 1.5 }}>
          Abra e leia cada documento. Depois, <strong>assine</strong> (selo digital no rodapé com
          seu nome, data e hora de Brasília, IP e navegador) ou <strong>rejeite</strong> com a
          justificativa — a rejeição devolve ao RH.
          {rodada ? "" : " A aprovação das férias depende da assinatura de todos os documentos."}
        </p>
      )}

      {docs.map((d, i) => {
        const tratado = !!d.assinatura || !!d.rejeicao;
        const aberto = abertos.has(i);
        return (
          <div
            key={i}
            style={{
              padding: "8px 10px",
              background: "#fff",
              border: `1px solid ${d.rejeicao ? "rgba(200,57,63,0.30)" : d.assinatura ? "rgba(47,125,79,0.30)" : "rgba(0,0,0,0.08)"}`,
              borderRadius: "var(--radius-md)",
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 12.5, color: "var(--ink-900)" }}>
                {i + 1}. {d.rotulo ?? "Documento de férias"}
              </strong>
              <a
                href={d.urlAssinado ?? d.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAbertos((s) => marcar(s, i, true))}
                style={{ fontSize: 12, fontWeight: 600, color: "var(--burgundy-600)" }}
              >
                📄 Abrir documento{d.urlAssinado ? " assinado" : ""}
              </a>
              {d.assinatura && (
                <span style={{ fontSize: 11.5, color: "#065f46", fontWeight: 600 }}>
                  ✍️ Assinado em {fmtBrasilia(d.assinatura.em)}
                  {d.assinatura.codigo ? ` · código ${d.assinatura.codigo}` : ""}
                </span>
              )}
              {d.rejeicao && (
                <span style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 600 }}>
                  ✕ Rejeitado em {fmtBrasilia(d.rejeicao.em)}
                </span>
              )}
            </div>
            {d.rejeicao && (
              <span style={{ fontSize: 12, color: "var(--red)" }}>
                Justificativa: “{d.rejeicao.justificativa}”
              </span>
            )}

            {pendente && !tratado && (
              <>
                {!aberto && (
                  <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                    Abra o documento para liberar a assinatura ou a rejeição.
                  </span>
                )}
                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    fontSize: 12.5,
                    color: aberto ? "var(--ink-800)" : "var(--ink-400)",
                    cursor: aberto ? "pointer" : "not-allowed"
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={!aberto}
                    checked={aceites.has(i)}
                    onChange={(e) => setAceites((s) => marcar(s, i, e.target.checked))}
                    style={{ marginTop: 2 }}
                  />
                  Li e concordo com {d.rotulo ?? "este documento"} e assino digitalmente.
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={!aberto || !aceites.has(i) || enviando !== null}
                    onClick={() => void acao(i, "assinar")}
                    style={btn("#2f7d4f", !aberto || !aceites.has(i) || enviando !== null)}
                  >
                    {enviando === i ? "Assinando…" : "✍️ Assinar"}
                  </button>
                  <button
                    type="button"
                    disabled={!aberto || enviando !== null}
                    onClick={() => {
                      setRejeitando(rejeitando === i ? null : i);
                      setJustificativa("");
                    }}
                    style={btn("var(--red)", !aberto || enviando !== null)}
                  >
                    ✕ Rejeitar
                  </button>
                </div>
                {rejeitando === i && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <textarea
                      rows={2}
                      value={justificativa}
                      onChange={(e) => setJustificativa(e.target.value)}
                      placeholder="Explique o que está errado no documento (mín. 10 caracteres)"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(200,57,63,0.30)",
                        fontSize: 12.5
                      }}
                    />
                    <button
                      type="button"
                      disabled={justificativa.trim().length < 10 || enviando !== null}
                      onClick={() => void acao(i, "rejeitar")}
                      style={{
                        ...btn("var(--red)", justificativa.trim().length < 10 || enviando !== null),
                        alignSelf: "flex-start"
                      }}
                    >
                      {enviando === i ? "Enviando…" : "Confirmar rejeição (volta ao RH)"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      {erro && <p style={{ margin: 0, fontSize: 12, color: "var(--red)" }}>⚠️ {erro}</p>}
    </div>
  );
}

/**
 * Rodadas de Aviso/Recibo dos períodos futuros (2º e 3º) de férias divididas, já aprovadas:
 * o funcionário assina cada rodada que o RH enviou. Mesma solicitação em Solicitações →
 * Férias e em Minhas Requisições do RH.
 */
export function AssinarRodadasFerias({
  solicitacao,
  onAssinado
}: {
  solicitacao: {
    id: string;
    status: string;
    metadados?: Record<string, unknown> | null;
  };
  onAssinado: () => void;
}) {
  if (solicitacao.status !== "APROVADA") return null;
  const raw = solicitacao.metadados?.rodadasFerias;
  if (!raw || typeof raw !== "object") return null;
  const rodadas = Object.values(
    raw as Record<string, NonNullable<Parameters<typeof AssinarDocumentosFerias>[0]["rodada"]>>
  )
    .filter((r) => r.documentos?.length)
    .sort((a, b) => a.ordem - b.ordem);
  if (!rodadas.length) return null;
  return (
    <>
      {rodadas.map((r) => (
        <AssinarDocumentosFerias
          key={r.ordem}
          solicitacao={solicitacao}
          rodada={r}
          onAssinado={onAssinado}
        />
      ))}
    </>
  );
}

export function ModalEnviarFolhaFerias({
  solicitacao,
  onConfirm,
  onClose,
  loading,
  erro,
  titulo = "Enviar Documentos de Férias"
}: {
  titulo?: string;
  solicitacao: SolicitacaoResumo;
  onConfirm: (documentos: DocumentoFeriasEnvio[], observacao: string) => void;
  onClose: () => void;
  loading: boolean;
  erro?: string;
}) {
  const [obs, setObs] = useState(
    "Seguem em anexo os documentos de férias para sua assinatura. Após assinar, envie o documento de volta pelo sistema."
  );
  /* Por padrão: Aviso de Férias, Recibo de Férias e Outros; "+" adiciona outros. */
  const [docs, setDocs] = useState<LinhaDocFerias[]>([
    { tipo: "AVISO", rotulo: "" },
    { tipo: "RECIBO", rotulo: "" },
    { tipo: "OUTROS", rotulo: "" }
  ]);

  const anexar = (idx: number, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) =>
      setDocs((prev) =>
        prev.map((d, k) =>
          k === idx
            ? {
                ...d,
                nomeArquivo: file.name,
                mimeType: file.type,
                tamanho: file.size,
                arquivoBase64: ev.target?.result as string
              }
            : d
        )
      );
    reader.readAsDataURL(file);
  };

  const anexados = docs.filter((d) => d.arquivoBase64);
  const tamanhoTotal = anexados.reduce((s, d) => s + (d.tamanho ?? 0), 0);
  const LIMITE_BYTES = 10 * 1024 * 1024;
  const outrosSemDescricao = anexados.some((d) => d.tipo === "OUTROS" && !d.rotulo.trim());
  /* Aviso e Recibo de Férias são obrigatórios; "Outros" é opcional. */
  const faltaObrigatorio = (["AVISO", "RECIBO"] as const).filter(
    (t) => !anexados.some((d) => d.tipo === t)
  );
  const podeEnviar =
    !loading &&
    faltaObrigatorio.length === 0 &&
    tamanhoTotal <= LIMITE_BYTES &&
    !outrosSemDescricao;

  const periodos = Array.isArray(solicitacao.metadados?.periodos)
    ? (solicitacao.metadados!.periodos as Array<{
        dataInicio: string;
        dataFim: string;
        dias: number;
      }>)
    : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            background: "rgba(47,125,79,0.07)",
            borderBottom: "1px solid rgba(47,125,79,0.20)",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 14
          }}
        >
          <span style={{ fontSize: 32, lineHeight: 1 }}>🌴</span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: "#2f7d4f",
                fontFamily: "var(--font-display)"
              }}
            >
              {titulo}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>
              Férias · <strong>{solicitacao.funcionario.user.name}</strong>
            </p>
          </div>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {periodos && (
            <div
              style={{
                background: "var(--cream-50)",
                border: "1px solid rgba(122,30,38,0.10)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px"
              }}
            >
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--ink-400)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em"
                }}
              >
                Períodos aprovados
              </p>
              {periodos.map((p, i) => (
                <p key={i} style={{ margin: "0 0 2px", fontSize: 13, color: "var(--ink-800)" }}>
                  {i + 1}º: {fmtDataPeriodoFerias(p.dataInicio)} a {fmtDataPeriodoFerias(p.dataFim)}{" "}
                  — <strong>{p.dias} dias</strong>
                </p>
              ))}
              {Number(solicitacao.metadados?.diasVendidos ?? 0) > 0 && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-500)" }}>
                  + {solicitacao.metadados!.diasVendidos as number} dias vendidos
                </p>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-700)" }}>
              Documentos de férias <span style={{ color: "var(--red)" }}>*</span>
              <span style={{ fontWeight: 400, color: "var(--ink-500)" }}>
                {" "}
                — Aviso e Recibo obrigatórios; Outros opcional (PDF ou imagem; até 10 MB no total)
              </span>
            </p>
            {docs.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: "8px 10px",
                  border: "1px solid rgba(47,125,79,0.18)",
                  borderRadius: "var(--radius-md)",
                  background: d.arquivoBase64 ? "rgba(47,125,79,0.05)" : "#fff"
                }}
              >
                <strong style={{ fontSize: 12.5, color: "#2f7d4f", minWidth: 120 }}>
                  {ROTULO_DOC_FERIAS[d.tipo] ?? "Outros"}
                  {d.tipo === "OUTROS" ? (
                    <span style={{ fontWeight: 400, color: "var(--ink-500)" }}> (opcional)</span>
                  ) : (
                    <span style={{ color: "var(--red)" }}> *</span>
                  )}
                </strong>
                {d.tipo === "OUTROS" && (
                  <input
                    type="text"
                    value={d.rotulo}
                    placeholder="Descrição (ex.: Termo de opção)"
                    onChange={(e) =>
                      setDocs((prev) =>
                        prev.map((x, k) => (k === i ? { ...x, rotulo: e.target.value } : x))
                      )
                    }
                    style={{
                      flex: "1 1 160px",
                      padding: "6px 8px",
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12
                    }}
                  />
                )}
                <input
                  id={`doc-ferias-${i}`}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    anexar(i, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor={`doc-ferias-${i}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    border: "1px solid rgba(47,125,79,0.35)",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(47,125,79,0.06)",
                    color: "#2f7d4f",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                  title={d.nomeArquivo}
                >
                  📎 {d.nomeArquivo ?? "Selecionar arquivo"}
                </label>
                {(d.arquivoBase64 || i >= 3) && (
                  <button
                    type="button"
                    title={i >= 3 ? "Remover linha" : "Remover arquivo"}
                    onClick={() =>
                      setDocs((prev) =>
                        i >= 3
                          ? prev.filter((_, k) => k !== i)
                          : prev.map((x, k) => (k === i ? { tipo: x.tipo, rotulo: x.rotulo } : x))
                      )
                    }
                    style={{
                      border: "none",
                      background: "none",
                      color: "var(--red)",
                      cursor: "pointer",
                      fontSize: 14
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDocs((prev) => [...prev, { tipo: "OUTROS", rotulo: "" }])}
              style={{
                alignSelf: "flex-start",
                padding: "5px 12px",
                border: "1px dashed rgba(47,125,79,0.45)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                color: "#2f7d4f",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600
              }}
            >
              + Adicionar outro documento
            </button>
            {tamanhoTotal > LIMITE_BYTES && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--red)" }}>
                Os arquivos somam {(tamanhoTotal / 1024 / 1024).toFixed(1)} MB — o limite é 10 MB.
              </p>
            )}
            {faltaObrigatorio.length > 0 && anexados.length > 0 && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--red)" }}>
                Falta anexar: {faltaObrigatorio.map((t) => ROTULO_DOC_FERIAS[t]).join(" e ")}.
              </p>
            )}
            {outrosSemDescricao && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--red)" }}>
                Informe a descrição de cada documento em “Outros”.
              </p>
            )}
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)"
              }}
            >
              Mensagem ao funcionário
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "9px 11px",
                border: "1px solid rgba(122,30,38,0.14)",
                borderRadius: "var(--radius-md)",
                fontSize: 12.5,
                resize: "vertical",
                boxSizing: "border-box"
              }}
            />
          </div>
          {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>⚠️ {erro}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "10px 20px",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink-600)"
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() =>
                podeEnviar &&
                onConfirm(
                  anexados.map((d) => ({
                    tipo: d.tipo,
                    rotulo: d.tipo === "OUTROS" ? d.rotulo.trim() : undefined,
                    nomeArquivo: d.nomeArquivo,
                    mimeType: d.mimeType,
                    arquivoBase64: d.arquivoBase64!
                  })),
                  obs
                )
              }
              disabled={!podeEnviar}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: !podeEnviar ? "#9ca3af" : "#2f7d4f",
                color: "#fff",
                cursor: !podeEnviar ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700
              }}
            >
              {loading
                ? "Enviando…"
                : `🌴 Enviar ${anexados.length || ""} documento${anexados.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

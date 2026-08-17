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
  LICENCA: "Licença",
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

export function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function diffDias(inicio: string, fim: string): number {
  try {
    const d1 = new Date(inicio);
    const d2 = new Date(fim);
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1);
  } catch {
    return 1;
  }
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
              `${i + 1}º período: ${fmtDate(p.dataInicio)} a ${fmtDate(p.dataFim)} (${p.dias} dias)`
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
  const gestorNome = s.gestorUser?.name ?? "Gestor";
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
        Etapa do gestor
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
          📤 <strong>Enviada</strong> em {fmtDateTime(s.createdAt)}
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
            <strong>Gestor {gestorNome}</strong>{" "}
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
            💬 <strong>Gestor {gestorNome}</strong>: "{gestorObs}"
          </p>
        ) : null}
        {!gestorRejeitou && s.status === "AGUARDANDO_RH" && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#7c3aed" }}>
            ⏳ <strong>Encaminhada ao RH</strong> — aguardando análise final
          </p>
        )}
        {!gestorRejeitou && s.status === "APROVADA" && s.rhResolvidoEm && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#16a34a", lineHeight: 1.45 }}>
            ✅ <strong>RH aprovou</strong> em {fmtDateTime(s.rhResolvidoEm)}
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
        {!gestorRejeitou && s.status === "REJEITADA_RH" && s.rhResolvidoEm && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#dc2626", lineHeight: 1.45 }}>
            ❌ <strong>RH rejeitou</strong> em {fmtDateTime(s.rhResolvidoEm)}
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
  const gestorNome = s.gestorUser?.name ?? "Gestor";

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
          📤 <strong>Enviada</strong> em {fmtDateTime(s.createdAt)}
        </p>
        {s.gestorResolvidoEm && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#2563eb", lineHeight: 1.45 }}>
            {s.tipo === "ATESTADO" ? "✍️" : "✅"} <strong>Gestor {gestorNome}</strong>{" "}
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
        <p style={{ margin: 0, fontSize: 11.5, color: "#7c3aed" }}>
          ⏳ <strong>Aguardando análise do RH</strong>
        </p>
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
  const aguardandoFolhaAssinada =
    s.tipo === "FERIAS" && (!s.guiaMedicoUrl || !s.documentoRetornoUrl);
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
                <LinkDocumentoAnexado
                  href={s.guiaMedicoUrl}
                  label="Ver documento — Folha de pagamento de férias"
                  variant="folha"
                />
                {s.guiaMedicoEnviadaEm && (
                  <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
                    Enviada em {fmtDateTime(s.guiaMedicoEnviadaEm)}
                  </p>
                )}
              </>
            )}
            {s.documentoRetornoUrl && (
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

        {s.tipo === "ENVIO_DOCUMENTO_RH" && typeof s.metadados?.documentoUrl === "string" && (
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
                    ? !s.guiaMedicoUrl
                      ? "Envie a folha de pagamento de férias ao funcionário antes de aprovar"
                      : "Aguardando o funcionário enviar a folha de férias assinada"
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
              🌴 Enviar Folha de Férias
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
            solicitacao.tipo === "ENVIO_DOCUMENTO_RH" &&
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

export function FeriasDetalheBlock({ meta }: { meta: Record<string, unknown> | null | undefined }) {
  if (!meta) return null;
  const periodos = Array.isArray(meta.periodos)
    ? (meta.periodos as Array<{ dataInicio: string; dataFim: string; dias: number }>)
    : [];
  const diasVendidos = Number(meta.diasVendidos ?? meta.diasVenda ?? 0);
  const totalGozo = Number(meta.totalDiasGozo ?? periodos.reduce((s, p) => s + p.dias, 0));
  const isAlteracao = typeof meta.alteracaoDeId === "string";
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
        {isAlteracao ? " — solicitação de mudança" : ""}
      </p>
      {periodos.map((p, i) => (
        <p key={i} style={{ margin: "0 0 3px", fontSize: 12.5, color: "var(--ink-800)" }}>
          <span style={{ fontWeight: 600 }}>{i + 1}º período:</span> {fmtDate(p.dataInicio)} a{" "}
          {fmtDate(p.dataFim)} <span style={{ color: "var(--ink-500)" }}>({p.dias} dias)</span>
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
    </div>
  );
}

export function ModalEnviarFolhaFerias({
  solicitacao,
  onConfirm,
  onClose,
  loading,
  erro
}: {
  solicitacao: SolicitacaoResumo;
  onConfirm: (folhaBase64: string, observacao: string) => void;
  onClose: () => void;
  loading: boolean;
  erro?: string;
}) {
  const [obs, setObs] = useState(
    "Segue em anexo a folha de pagamento de férias para sua assinatura. Após assinar, envie o documento de volta pelo sistema."
  );
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
              Enviar Folha de Pagamento de Férias
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
                  {i + 1}º: {fmtDate(p.dataInicio)} a {fmtDate(p.dataFim)} —{" "}
                  <strong>{p.dias} dias</strong>
                </p>
              ))}
              {Number(solicitacao.metadados?.diasVendidos ?? 0) > 0 && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-500)" }}>
                  + {solicitacao.metadados!.diasVendidos as number} dias vendidos
                </p>
              )}
            </div>
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
              Folha de Pagamento (PDF) <span style={{ color: "var(--red)" }}>*</span>
            </label>
            <input
              id="folha-ferias-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleArquivo}
              style={{ display: "none" }}
            />
            <label
              htmlFor="folha-ferias-file"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 16px",
                border: "1px solid rgba(47,125,79,0.35)",
                borderRadius: "var(--radius-md)",
                background: "rgba(47,125,79,0.06)",
                color: "#2f7d4f",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 600
              }}
            >
              📎 {nomeArquivo ?? "Selecionar PDF"}
            </label>
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
              onClick={() => base64 && onConfirm(base64, obs)}
              disabled={loading || !base64}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: loading || !base64 ? "#9ca3af" : "#2f7d4f",
                color: "#fff",
                cursor: loading || !base64 ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700
              }}
            >
              {loading ? "Enviando…" : "🌴 Enviar Folha"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

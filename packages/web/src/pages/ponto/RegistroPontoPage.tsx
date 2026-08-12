import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircleIcon,
  RefreshCwIcon,
  MapPinIcon,
  InfoIcon,
  ArrowRightIcon,
  PauseIcon,
  PlayIcon
} from "../../components/icons";

import { CameraModal } from "../../components/CameraModal";
import { CameraPermissionGuide, useCameraPermission } from "../../components/CameraPermissionGuide";
import { MapaGeolocalizacao } from "../../components/MapaGeolocalizacao";
import { SafariGeoAtivacao } from "../../components/SafariGeoAtivacao";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import {
  usePontoRegistration,
  TipoRegistro,
  RegistroConfirmado,
  SistemaConfig,
  ModoRegistro
} from "../../hooks/usePontoRegistration";

/* ─── Helpers ─── */
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtShort = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function horarioBrasiliaAgora(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function horarioDentroFaixa(horario: string, min: string, max: string): boolean {
  const [h, m] = horario.split(":").map(Number);
  const [hMin, mMin] = min.split(":").map(Number);
  const [hMax, mMax] = max.split(":").map(Number);
  const atual = h * 60 + m;
  return atual >= hMin * 60 + mMin && atual <= hMax * 60 + mMax;
}

/* ─── Observações (anotações automáticas de ajuste) ─── */
interface ObservacaoRegistro {
  data: string;
  texto: string;
  tipo?: string;
  turno?: string;
  motivo?: string;
  janelaAlmoco?: string;
}

function temTurnoSemIntervalo(observacoes?: ObservacaoRegistro[]): boolean {
  return !!obsForcaSemIntervalo(observacoes);
}

function obsTurnoSemIntervalo(observacoes?: ObservacaoRegistro[]): ObservacaoRegistro | undefined {
  return observacoes?.find((o) => o.tipo === "TURNO_SEM_INTERVALO");
}

/** Só força dispensa de almoço após a janela ou por categoria — nunca por pausa/DURANTE_JANELA. */
function obsForcaSemIntervalo(observacoes?: ObservacaoRegistro[]): ObservacaoRegistro | undefined {
  const obs = obsTurnoSemIntervalo(observacoes);
  if (!obs) return undefined;
  if (obs.motivo === "DURANTE_JANELA") return undefined;
  return obs;
}

/** Estagiário / menor aprendiz: carga horária corrida — sem intervalo de almoço. */
function categoriaSemIntervaloAlmoco(categoria: string | null | undefined): boolean {
  return categoria === "ESTAGIARIO" || categoria === "MENOR_APRENDIZ";
}

/* ─── Informações visuais de cada tipo de registro ─── */
interface AcaoInfo {
  tipo: TipoRegistro;
  label: string;
  desc: string;
  cor: string;
  bg: string;
}

const ACAO_INFO: Record<TipoRegistro, AcaoInfo> = {
  ENTRADA: {
    tipo: "ENTRADA",
    label: "Iniciar Jornada",
    desc: "Início do expediente",
    cor: "var(--green)",
    bg: "rgba(47,125,79,0.12)"
  },
  INICIO_INTERVALO: {
    tipo: "INICIO_INTERVALO",
    label: "Início do Almoço",
    desc: "Saída para intervalo de almoço",
    cor: "#8a6a00",
    bg: "rgba(247,196,55,0.14)"
  },
  FIM_INTERVALO: {
    tipo: "FIM_INTERVALO",
    label: "Fim do Almoço",
    desc: "Retorno do intervalo",
    cor: "var(--blue-ink)",
    bg: "rgba(30,74,122,0.10)"
  },
  SAIDA: {
    tipo: "SAIDA",
    label: "Encerrar Jornada",
    desc: "Encerramento do expediente",
    cor: "var(--red)",
    bg: "rgba(200,57,63,0.10)"
  },
  INTERROMPER_EXPEDIENTE: {
    tipo: "INTERROMPER_EXPEDIENTE",
    label: "Interromper Expediente",
    desc: "Pausa temporária do expediente",
    cor: "var(--gray-cfo)",
    bg: "rgba(109,110,113,0.12)"
  },
  REINICIAR_EXPEDIENTE: {
    tipo: "REINICIAR_EXPEDIENTE",
    label: "Reiniciar Jornada",
    desc: "Retomar o expediente após a pausa",
    cor: "var(--gray-cfo)",
    bg: "rgba(109,110,113,0.12)"
  }
};

const TIPO_LABEL: Record<TipoRegistro, string> = {
  ENTRADA: "Iniciar Jornada",
  INICIO_INTERVALO: "Início do Almoço",
  FIM_INTERVALO: "Fim do Almoço",
  SAIDA: "Encerrar Jornada",
  INTERROMPER_EXPEDIENTE: "Interromper Expediente",
  REINICIAR_EXPEDIENTE: "Reiniciar Expediente"
};

/* ─── Marcos do fluxo principal (para a barra de progresso) ─── */
const MARCOS: TipoRegistro[] = ["ENTRADA", "INICIO_INTERVALO", "FIM_INTERVALO", "SAIDA"];

/* ══════════════════════════════════════════════════════
   MÁQUINA DE ESTADOS — fase da jornada
══════════════════════════════════════════════════════ */
type FaseJornada =
  | "NENHUMA"
  | "MANHA"
  | "PAUSA_MANHA"
  | "ALMOCO"
  | "TARDE"
  | "PAUSA_TARDE"
  | "ENCERRADA";

function getFase(
  registros: { tipo: TipoRegistro; observacoes?: ObservacaoRegistro[] }[],
  opts?: { forcarSemIntervalo?: boolean }
): FaseJornada {
  const forcarSemIntervalo = !!opts?.forcarSemIntervalo;
  let fase: FaseJornada = "NENHUMA";
  for (const r of registros) {
    switch (r.tipo) {
      case "ENTRADA":
        fase = forcarSemIntervalo || temTurnoSemIntervalo(r.observacoes) ? "TARDE" : "MANHA";
        break;
      case "INICIO_INTERVALO":
        fase = "ALMOCO";
        break;
      case "FIM_INTERVALO":
        fase = "TARDE";
        break;
      case "SAIDA":
        fase = "ENCERRADA";
        break;
      case "INTERROMPER_EXPEDIENTE":
        if (fase === "MANHA") fase = "PAUSA_MANHA";
        else if (fase === "TARDE") fase = "PAUSA_TARDE";
        break;
      case "REINICIAR_EXPEDIENTE":
        if (fase === "PAUSA_MANHA") fase = "MANHA";
        else if (fase === "PAUSA_TARDE") fase = "TARDE";
        break;
    }
  }
  if (forcarSemIntervalo) {
    if (fase === "MANHA") fase = "TARDE";
    else if (fase === "PAUSA_MANHA") fase = "PAUSA_TARDE";
    else if (fase === "ALMOCO") fase = "TARDE";
  }
  return fase;
}

function labelFaseInfo(
  fase: FaseJornada,
  turno?: string | null,
  semIntervalo?: boolean
): { label: string; cor: string; bg: string; pulse?: boolean } {
  const base = FASE_INFO[fase];
  if (semIntervalo && fase === "TARDE") {
    if (turno === "NOTURNO") return { ...base, label: "Trabalhando (turno noturno)" };
    if (turno === "VESPERTINO") return { ...base, label: "Trabalhando (turno vespertino)" };
    return { ...base, label: "Trabalhando" };
  }
  if ((fase === "TARDE" || fase === "PAUSA_TARDE") && turno && turno !== "MATUTINO") {
    const nome = turno === "NOTURNO" ? "noturno" : "vespertino";
    if (fase === "TARDE") {
      return { ...base, label: `Trabalhando (turno ${nome})` };
    }
  }
  return base;
}

function descFase(fase: FaseJornada, semIntervalo: boolean): string {
  if (semIntervalo && fase === "TARDE") {
    return "Intervalo de almoço não aplicável — encerre a jornada ou interrompa o expediente, se necessário";
  }
  if (semIntervalo && fase === "PAUSA_TARDE") {
    return "Retome o expediente para continuar trabalhando";
  }
  return FASE_DESC[fase];
}

const FASE_INFO: Record<FaseJornada, { label: string; cor: string; bg: string; pulse?: boolean }> =
  {
    NENHUMA: { label: "Aguardando início", cor: "var(--gray-cfo)", bg: "rgba(109,110,113,0.12)" },
    MANHA: { label: "Trabalhando", cor: "var(--green)", bg: "rgba(47,125,79,0.12)", pulse: true },
    PAUSA_MANHA: { label: "Expediente pausado", cor: "#8a6a00", bg: "rgba(247,196,55,0.14)" },
    ALMOCO: { label: "Intervalo de almoço", cor: "#8a6a00", bg: "rgba(247,196,55,0.14)" },
    TARDE: {
      label: "Trabalhando (pós-almoço)",
      cor: "var(--green)",
      bg: "rgba(47,125,79,0.12)",
      pulse: true
    },
    PAUSA_TARDE: { label: "Expediente pausado", cor: "#8a6a00", bg: "rgba(247,196,55,0.14)" },
    ENCERRADA: { label: "Jornada encerrada", cor: "var(--blue-ink)", bg: "rgba(30,74,122,0.10)" }
  };

const FASE_DESC: Record<FaseJornada, string> = {
  NENHUMA: "Início do expediente",
  MANHA: "Vá para o almoço ou interrompa o expediente, se necessário",
  PAUSA_MANHA:
    "Retome o expediente para continuar trabalhando, ou inicie o almoço se já chegou a hora",
  ALMOCO: "Intervalo de almoço em andamento",
  TARDE: "Encerre a jornada ou interrompa o expediente, se necessário",
  PAUSA_TARDE: "Retome o expediente para continuar trabalhando",
  ENCERRADA: "Jornada do dia encerrada"
};

/* ─── Layout dos botões de ação para cada fase ─── */
interface AcaoSlot {
  tipo: TipoRegistro;
  width: number;
  iconOnly?: boolean;
}

function getLayout(
  fase: FaseJornada,
  cfg: SistemaConfig,
  opts?: { semIntervalo?: boolean }
): AcaoSlot[] {
  const semIntervalo = !!opts?.semIntervalo;
  switch (fase) {
    case "NENHUMA":
      return [{ tipo: "ENTRADA", width: 100 }];
    case "MANHA":
      /* Carga corrida (estagiário/aprendiz) ou turno sem intervalo: só pausa + encerrar. */
      if (semIntervalo) {
        return [
          { tipo: "SAIDA", width: 80 },
          { tipo: "INTERROMPER_EXPEDIENTE", width: 20, iconOnly: true }
        ];
      }
      return [
        { tipo: "INICIO_INTERVALO", width: 80 },
        { tipo: "INTERROMPER_EXPEDIENTE", width: 20, iconOnly: true }
      ];
    case "PAUSA_MANHA":
      /* Precisa reiniciar a pausa antes de bater o almoço. */
      return [{ tipo: "REINICIAR_EXPEDIENTE", width: 100 }];
    case "ALMOCO":
      /* Com semIntervalo a fase é remapeada; se restar, não oferecer fim de almoço. */
      if (semIntervalo) {
        return [
          { tipo: "SAIDA", width: 80 },
          { tipo: "INTERROMPER_EXPEDIENTE", width: 20, iconOnly: true }
        ];
      }
      return [{ tipo: "FIM_INTERVALO", width: 100 }];
    case "TARDE":
      return [
        { tipo: "SAIDA", width: 80 },
        { tipo: "INTERROMPER_EXPEDIENTE", width: 20, iconOnly: true }
      ];
    case "PAUSA_TARDE":
      return [{ tipo: "REINICIAR_EXPEDIENTE", width: 100 }];
    case "ENCERRADA":
    default:
      return [];
  }
}

/* ─── Cor de fundo do botão a partir da cor de destaque ─── */
function btnBgFor(cor: string): string {
  if (cor === "var(--green)") return "#1e5c38";
  if (cor === "var(--blue-ink)") return "var(--blue-ink)";
  if (cor === "var(--red)") return "#8b1d23";
  if (cor === "var(--gray-cfo)") return "#5a5b5e";
  return "var(--burgundy-600)";
}

/* ─── Tipo local de registro do dia ─── */
export interface RegistroDia {
  tipo: TipoRegistro;
  hora: string;
  dataCompleta: string;
  timestamp: number;
  fotoDataUrl?: string;
  latitude?: number;
  longitude?: number;
  modo: string;
  observacoes?: ObservacaoRegistro[];
}

/* ══════════════════════════════════════════════════════
   PROGRESSO DA JORNADA
══════════════════════════════════════════════════════ */
function ProgressoJornada({ n, semIntervalo }: { n: number; semIntervalo?: boolean }) {
  const passos = semIntervalo
    ? [
        { label: "Entrada", key: "e" },
        { label: "Almoço", key: "a", dispensado: true },
        { label: "Retorno", key: "r", dispensado: true },
        { label: "Saída", key: "s" }
      ]
    : [
        { label: "Entrada", key: "e" },
        { label: "Almoço", key: "a" },
        { label: "Retorno", key: "r" },
        { label: "Saída", key: "s" }
      ];

  /* Com semIntervalo: n=0 nenhum; n=1 entrada; n=2 entrada+saída (almoço/retorno dispensados). */
  const efetivo = semIntervalo ? (n >= 2 ? 4 : n >= 1 ? 1 : 0) : n;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {passos.map((p, i) => {
        const dispensado =
          !!(p as { dispensado?: boolean }).dispensado && semIntervalo && efetivo >= 1;
        const done = dispensado || i < efetivo;
        const current = !dispensado && i === efetivo && efetivo < 4;
        const cor = dispensado
          ? "var(--green)"
          : done
            ? "var(--green)"
            : current
              ? "var(--burgundy-600)"
              : "var(--gray-cfo)";
        return (
          <React.Fragment key={p.key}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                flex: 1
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background:
                    done || dispensado
                      ? "var(--green)"
                      : current
                        ? "var(--burgundy-600)"
                        : "rgba(109,110,113,0.15)",
                  border: `2px solid ${cor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 300ms",
                  opacity: dispensado ? 0.75 : 1
                }}
                title={dispensado ? "Intervalo de almoço não aplicável" : undefined}
              >
                {done || dispensado ? (
                  <CheckCircleIcon size={14} style={{ color: "#fff" }} />
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: current ? "#fff" : "var(--ink-500)"
                    }}
                  >
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: cor,
                  textAlign: "center",
                  lineHeight: 1.2
                }}
              >
                {dispensado ? "N/A" : p.label}
              </span>
            </div>
            {i < passos.length - 1 && (
              <div
                style={{
                  height: 2,
                  flex: 1,
                  background:
                    i < efetivo || (dispensado && i < 3 && efetivo >= 1)
                      ? "var(--green)"
                      : "rgba(122,30,38,0.10)",
                  marginBottom: 18,
                  transition: "background 300ms"
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   PAINEL DE VALIDAÇÕES — idêntico em mobile e desktop
══════════════════════════════════════════════════════ */
interface ValidacaoItem {
  icon: string;
  label: string;
  ativa: boolean;
  status?: "ok" | "fora" | "pendente" | "capturado";
}

function ValidacoesPanel({ items }: { items: ValidacaoItem[] }) {
  return (
    <div
      style={{
        background: "var(--cream-50)",
        borderRadius: "var(--radius-md)",
        padding: "10px 12px",
        marginBottom: 14,
        border: "1px solid rgba(122,30,38,0.08)"
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-500)",
          marginBottom: 8
        }}
      >
        Verificações desta sessão
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => {
          const statusLabel = !item.ativa ? (
            <span style={{ fontSize: 11, color: "var(--ink-400)" }}>N/A</span>
          ) : item.status === "ok" ? (
            <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>✓ OK</span>
          ) : item.status === "fora" ? (
            <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>⚠ Fora</span>
          ) : item.status === "capturado" ? (
            <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>✓ Pronto</span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>⏳ Aguardando</span>
          );
          return (
            <div
              key={item.label}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 13, opacity: item.ativa ? 1 : 0.35 }}>{item.icon}</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: item.ativa ? 500 : 400,
                    color: item.ativa ? "var(--ink-700)" : "var(--ink-400)"
                  }}
                >
                  {item.label}
                </span>
              </div>
              {statusLabel}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   TELA DE CONFIRMAÇÃO
══════════════════════════════════════════════════════ */
function ConfirmacaoRegistro({
  registro,
  onVoltar
}: {
  registro: RegistroConfirmado;
  onVoltar: () => void;
}) {
  const encerrada = registro.tipo === "SAIDA";
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        boxSizing: "border-box"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(10,5,6,0.14)"
        }}
      >
        {/* Header */}
        <div
          style={{
            background: `linear-gradient(135deg, ${encerrada ? "#1e5c38" : "#5c1519"} 0%, ${encerrada ? "var(--green)" : "var(--burgundy-600)"} 100%)`,
            padding: "28px 24px 24px",
            textAlign: "center"
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.20)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px"
            }}
          >
            <CheckCircleIcon size={36} style={{ color: "#fff" }} />
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "#fff",
              fontSize: 22,
              fontWeight: 400,
              margin: 0
            }}
          >
            {encerrada ? "Jornada Encerrada!" : "Registro Confirmado!"}
          </h2>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 4 }}>
            {TIPO_LABEL[registro.tipo]}
          </p>
        </div>

        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, alignItems: "flex-start" }}>
            {registro.fotoDataUrl && (
              <div style={{ position: "relative", flexShrink: 0 }}>
                <img
                  src={registro.fotoDataUrl}
                  alt="Foto"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "3px solid var(--green)"
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "var(--green)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid #fff",
                    fontSize: 10
                  }}
                >
                  ✓
                </span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "var(--green)",
                  lineHeight: 1,
                  marginBottom: 4
                }}
              >
                {registro.hora}
              </p>
              <p style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.5 }}>
                {registro.dataCompleta}
              </p>
            </div>
          </div>

          <div
            style={{
              background: "var(--cream-50)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              marginBottom: 16
            }}
          >
            {(
              [
                { label: "Registro", value: TIPO_LABEL[registro.tipo] },
                {
                  label: "Modo",
                  value:
                    registro.modo === "MOBILE"
                      ? "📱 Celular"
                      : registro.modo === "HIBRIDO"
                        ? "🏠 Híbrido"
                        : registro.modo === "VIAGEM"
                          ? "✈️ Viagem"
                          : "🖥 Desktop"
                },
                registro.dentroPerimetro !== undefined && {
                  label: "Localização",
                  value: registro.dentroPerimetro
                    ? `✅ Dentro do perímetro (${registro.distanciaMetros}m)`
                    : `⚠️ ${registro.distanciaMetros}m do CFO`
                },
                registro.fotoDataUrl && { label: "Biometria", value: "📷 Foto registrada" }
              ].filter(Boolean) as { label: string; value: string }[]
            ).map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "5px 0",
                  borderBottom: "1px solid rgba(122,30,38,0.06)"
                }}
              >
                <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{item.label}</span>
                <span
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink-900)",
                    fontWeight: 500,
                    textAlign: "right",
                    maxWidth: "60%"
                  }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              background: "rgba(200,57,63,0.05)",
              border: "1px solid rgba(200,57,63,0.15)",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              marginBottom: 18,
              display: "flex",
              gap: 8
            }}
          >
            <InfoIcon size={13} style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11.5, color: "var(--red)", lineHeight: 1.6 }}>
              Registro não pode ser desfeito. Para correções, use <strong>Solicitações</strong>.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link
              to="/ponto/historico"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "13px",
                borderRadius: "var(--radius-md)",
                background: "var(--burgundy-600)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "var(--font-body)"
              }}
            >
              Ver Histórico <ArrowRightIcon size={15} />
            </Link>
            <button
              onClick={onVoltar}
              style={{
                padding: "11px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.18)",
                background: "transparent",
                color: "var(--ink-500)",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                cursor: "pointer"
              }}
            >
              Registrar outro ponto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════ */
export function RegistroPontoPage() {
  const isMobile = useIsMobile(768);
  const { token } = useAuth();
  const { registrar, loading: regLoading, erro: regErro, setErro } = usePontoRegistration();
  const permCamera = useCameraPermission();

  /* Estado de UI */
  const [now, setNow] = useState(new Date());
  const [registros, setRegistros] = useState<RegistroDia[]>([]);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [guiaAberto, setGuiaAberto] = useState(false);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);
  const [pendingTipo, setPendingTipo] = useState<TipoRegistro | null>(null);
  const [confirmado, setConfirmado] = useState<RegistroConfirmado | null>(null);
  const [geoloc, setGeoloc] = useState(true);
  const [geoStatus, setGeoStatus] = useState<"pendente" | "ok" | "fora">("pendente");
  const [categoriaFuncional, setCategoriaFuncional] = useState<string | null>(null);
  const [semRegistroPontoHoje, setSemRegistroPontoHoje] = useState(false);

  const [cfg, setCfg] = useState<SistemaConfig | null>(null);
  const [erroCfg, setErroCfg] = useState(false);

  /* ── Feriado hoje ── */
  const [feriadoHoje, setFeriadoHoje] = useState<{ bloqueado: boolean; nome?: string } | null>(
    null
  );

  /* Modo detectado pelo viewport */
  const modo: ModoRegistro = isMobile ? "MOBILE" : "DESKTOP";

  /* Regras de validação para o modo atual (só ficam ativas após cfg carregar) */
  const checkGeo = cfg ? (modo === "MOBILE" ? cfg.mobileCheckGeo : cfg.desktopCheckGeo) : false;
  const checkRede = cfg
    ? modo === "MOBILE"
      ? cfg.mobileCheckSubrede
      : cfg.desktopCheckSubrede
    : false;
  const exigirFoto = cfg ? (modo === "MOBILE" ? cfg.mobileExigirFoto !== false : false) : false;

  /* ── Relógio live ── */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      api.get<SistemaConfig>("/ponto/config/sistema"),
      api
        .get<
          Array<{ id: string; lat: number; lng: number; raioMetros: number; ativa: boolean }>
        >("/ponto/config/areas")
        .catch(() => [])
    ])
      .then(([data, areas]) => {
        if (data) setCfg({ ...data, areasViagem: (areas ?? []).filter((a) => a.ativa) });
        else setErroCfg(true);
      })
      .catch(() => setErroCfg(true));
  }, []);

  useEffect(() => {
    const tk = token();
    if (!tk) return;
    api
      .get<{ bloqueado: boolean; nome?: string }>("/ponto/feriado-hoje", tk)
      .then((data) => {
        if (data) setFeriadoHoje(data);
      })
      .catch(() => {
        /* Se falhar, não bloqueia — o backend ainda rejeitará se for feriado */
      });
  }, []);

  /* ── Afastamento (atestado, licença, abono, férias) que cobre o dia de hoje ── */
  const [afastamentoHoje, setAfastamentoHoje] = useState<{
    tipo: string;
    label: string;
    dataInicio: string;
    dataFim: string;
  } | null>(null);

  /* ── Carrega registros de hoje + dados de home office do backend ── */
  useEffect(() => {
    const tk = token();
    if (!tk) return;

    api
      .get<{
        registrosHoje: { tipo: string; dataHora: string; observacoes?: ObservacaoRegistro[] }[];
        afastamentoHoje: {
          tipo: string;
          label: string;
          dataInicio: string;
          dataFim: string;
        } | null;
        categoria?: string;
        semRegistroPonto?: boolean;
        isentoHoje?: boolean;
        modoHomeOffice?: boolean;
        modoHibridoLocal?: boolean;
        enderecoResidencial?: { lat: number | null; lng: number | null; raioMetros: number } | null;
      }>("/ponto/status", tk)
      .then((status) => {
        setAfastamentoHoje(status?.afastamentoHoje ?? null);
        if (status?.categoria) setCategoriaFuncional(status.categoria);
        setSemRegistroPontoHoje(
          !!status?.semRegistroPonto ||
            !!status?.isentoHoje ||
            status?.categoria === "ASSESSOR" ||
            status?.categoria === "GERENTE"
        );
        // Mescla dados de home office/híbrido no cfg para o hook usePontoRegistration
        if (status?.modoHomeOffice !== undefined || status?.modoHibridoLocal !== undefined) {
          setCfg((prev) =>
            prev
              ? {
                  ...prev,
                  modoHomeOffice: status.modoHomeOffice ?? false,
                  modoHibridoLocal: status.modoHibridoLocal ?? false,
                  enderecoResidencial: status.enderecoResidencial ?? null
                }
              : prev
          );
        }
        if (!status?.registrosHoje?.length) return;
        const regs: RegistroDia[] = status.registrosHoje.map((r) => {
          const d = new Date(r.dataHora);
          return {
            tipo: r.tipo as TipoRegistro,
            hora: fmtShort(d),
            dataCompleta: d.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric"
            }),
            timestamp: d.getTime(),
            modo,
            observacoes: r.observacoes
          };
        });
        setRegistros(regs);
      })
      .catch(() => {});
  }, []);

  /* ── Derivações ── */
  const forcarSemIntervalo = categoriaSemIntervaloAlmoco(categoriaFuncional);
  const fase = getFase(registros, { forcarSemIntervalo });
  const entradaReg = registros.find((r) => r.tipo === "ENTRADA");
  const obsTurno = obsTurnoSemIntervalo(entradaReg?.observacoes);
  const semIntervalo = !!obsForcaSemIntervalo(entradaReg?.observacoes) || forcarSemIntervalo;
  const turno = obsTurno?.turno ?? null;
  const faseInfo = labelFaseInfo(fase, turno, semIntervalo);
  const slots = cfg ? getLayout(fase, cfg, { semIntervalo }) : [];
  const marcosFeitos = semIntervalo
    ? registros.some((r) => r.tipo === "SAIDA")
      ? 2
      : registros.some((r) => r.tipo === "ENTRADA")
        ? 1
        : 0
    : registros.filter((r) => MARCOS.includes(r.tipo)).length;
  const totalMarcos = semIntervalo ? 2 : 4;

  /* ── Validações panel items ── */
  const validacoes: ValidacaoItem[] = [
    {
      icon: "📍",
      label: modo === "MOBILE" ? "Geolocalização" : "Geolocalização (complementar)",
      ativa: checkGeo && geoloc,
      status: checkGeo && geoloc ? geoStatus : undefined
    },
    {
      icon: "🌐",
      label: modo === "MOBILE" ? "Rede Wi-Fi corporativa" : "IP do provedor corporativo",
      ativa: checkRede
    },
    {
      icon: "📷",
      label: "Foto biométrica",
      ativa: exigirFoto,
      status: exigirFoto ? (fotoCapturada ? "capturado" : "pendente") : undefined
    }
  ];

  /* ── Câmera ── */
  function abrirCamera() {
    if (permCamera === "granted") setCameraAberta(true);
    else setGuiaAberto(true);
  }

  /* ── Executar registro ── */
  const executarRegistro = useCallback(
    async (tipo: TipoRegistro, foto?: string) => {
      if (!cfg) {
        setErro("Configurações do sistema ainda não carregadas. Aguarde…");
        return;
      }
      // Pré-verificação de geo (para feedback no painel antes de chamar o hook)
      if (checkGeo && geoloc && navigator.geolocation) {
        setGeoStatus("pendente");
      }

      const resultado = await registrar({
        tipo,
        foto: foto ?? fotoCapturada ?? undefined,
        modo,
        config: cfg
      });
      if (!resultado) return;

      const agora = new Date();
      const novoReg: RegistroDia = {
        tipo,
        hora: fmtShort(agora),
        dataCompleta: resultado.dataCompleta,
        timestamp: agora.getTime(),
        fotoDataUrl: foto ?? fotoCapturada ?? undefined,
        latitude: resultado.latitude,
        longitude: resultado.longitude,
        modo,
        /* Espelha a observação do backend para estagiário/aprendiz até o próximo reload. */
        observacoes:
          tipo === "ENTRADA" && categoriaSemIntervaloAlmoco(categoriaFuncional)
            ? [
                {
                  data: agora.toISOString(),
                  tipo: "TURNO_SEM_INTERVALO",
                  texto:
                    "Carga horária corrida — intervalo de almoço não se aplica. Use Interromper/Reiniciar Expediente para pausas.",
                  motivo: "CATEGORIA_CARGA_CORRIDA",
                  turno: "MATUTINO"
                }
              ]
            : undefined
      };

      if (resultado.dentroPerimetro !== undefined) {
        setGeoStatus(resultado.dentroPerimetro ? "ok" : "fora");
      }

      setRegistros((prev) => [...prev, novoReg]);
      setFotoCapturada(null);
      setPendingTipo(null);
      setConfirmado(resultado);
    },
    [registrar, fotoCapturada, modo, cfg, checkGeo, geoloc, categoriaFuncional]
  );

  async function handleAcao(tipo: TipoRegistro) {
    if (afastamentoHoje) {
      setErro(`Você está em ${afastamentoHoje.label} hoje. Não é possível registrar ponto.`);
      return;
    }
    setErro(null);
    const min = cfg?.pontoHorarioMinimo ?? "06:00";
    const max = cfg?.pontoHorarioMaximo ?? "23:59";
    const agora = horarioBrasiliaAgora();
    if (!horarioDentroFaixa(agora, min, max)) {
      setErro(
        `Registro permitido apenas entre ${min} e ${max} (horário de Brasília). Agora: ${agora}.`
      );
      return;
    }
    if (exigirFoto && !fotoCapturada) {
      setPendingTipo(tipo);
      abrirCamera();
      return;
    }
    await executarRegistro(tipo);
  }

  async function onFotoCapturada(dataUrl: string) {
    const tipo = pendingTipo ?? slots[0]?.tipo;
    if (!tipo) return;
    setFotoCapturada(dataUrl);
    setCameraAberta(false);
    await executarRegistro(tipo, dataUrl);
  }

  /* ── Confirmação ── */
  if (confirmado) {
    return <ConfirmacaoRegistro registro={confirmado} onVoltar={() => setConfirmado(null)} />;
  }

  if (erroCfg) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          gap: 8,
          color: "var(--red)",
          fontSize: 14,
          textAlign: "center",
          padding: "0 24px"
        }}
      >
        <span style={{ fontSize: 24 }}>⚠️</span>
        <strong>Não foi possível carregar as configurações do sistema.</strong>
        <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
          Verifique se o backend está rodando e se o banco de dados foi inicializado.
        </span>
        <button
          onClick={() => {
            setErroCfg(false);
            setCfg(null);
          }}
          style={{
            marginTop: 8,
            padding: "8px 20px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--red)",
            background: "transparent",
            color: "var(--red)",
            cursor: "pointer",
            fontSize: 13
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!cfg) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          color: "var(--ink-500)",
          fontSize: 14
        }}
      >
        Carregando configurações…
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: isMobile ? "100%" : 640,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box"
      }}
    >
      {/* Título — desktop only */}
      {!isMobile && (
        <div style={{ marginBottom: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Ponto Eletrônico
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            Registrar <em>Ponto</em>
          </h1>
        </div>
      )}

      {/* ── Relógio + Estado + Modo ── */}
      <div
        style={{
          background: "var(--burgundy-900)",
          borderRadius: "var(--radius-xl)",
          padding: isMobile ? "20px 16px" : "32px 24px",
          marginBottom: 14,
          textAlign: "center",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -50,
            right: -50,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(122,30,38,0.25)",
            pointerEvents: "none"
          }}
        />

        <p className="eyebrow" style={{ color: "var(--gold-500)", marginBottom: 6, fontSize: 10 }}>
          {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
        </p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: isMobile ? "clamp(44px,16vw,60px)" : "clamp(48px,8vw,68px)",
            color: "#fff",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            marginBottom: 14
          }}
        >
          {fmt(now)}
        </p>

        {/* Estado + Modo na mesma linha */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap"
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 14px",
              borderRadius: "var(--radius-full)",
              background: faseInfo.bg,
              border: `1px solid ${faseInfo.cor}40`
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: faseInfo.cor,
                flexShrink: 0,
                animation: faseInfo.pulse ? "pulse-dot 2s ease-in-out infinite" : "none"
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: faseInfo.cor }}>
              {faseInfo.label}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: "var(--radius-full)",
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.18)"
              }}
            >
              <span style={{ fontSize: 11 }}>{modo === "MOBILE" ? "📱" : "🖥"}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.80)" }}>
                {modo === "MOBILE" ? "Mobile" : "Desktop"}
              </span>
            </div>
            {cfg?.modoHomeOffice && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: "var(--radius-full)",
                  background: "rgba(47,125,79,0.30)",
                  border: "1px solid rgba(47,125,79,0.50)"
                }}
              >
                <span style={{ fontSize: 11 }}>🏠</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>Home Office</span>
              </div>
            )}
            {cfg?.modoHibridoLocal && !cfg?.modoHomeOffice && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: "var(--radius-full)",
                  background: "rgba(247,196,55,0.30)",
                  border: "1px solid rgba(247,196,55,0.50)"
                }}
              >
                <span style={{ fontSize: 11 }}>🏠</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>Híbrido</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Progresso ── */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: "16px 16px 12px",
          marginBottom: 14
        }}
      >
        <ProgressoJornada n={marcosFeitos} semIntervalo={semIntervalo} />

        <div style={{ textAlign: "center", paddingTop: 10 }}>
          {fase !== "ENCERRADA" ? (
            <>
              <p style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 500 }}>
                {slots.length > 1 ? "Próximas ações:" : "Próximo registro:"}
              </p>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: slots.length ? ACAO_INFO[slots[0].tipo].cor : "var(--burgundy-600)"
                }}
              >
                {slots.map((s) => ACAO_INFO[s.tipo].label).join(" ou ")}
              </p>
              <p style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                {descFase(fase, semIntervalo)}
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--blue-ink)" }}>
                ✅ Jornada completa para hoje
              </p>
              <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>
                Os registros do dia foram efetuados.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Erro ── */}
      {regErro && (
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(200,57,63,0.07)",
            border: "1px solid rgba(200,57,63,0.20)",
            borderRadius: "var(--radius-md)",
            marginBottom: 14,
            fontSize: 13,
            color: "var(--red)",
            lineHeight: 1.6,
            display: "flex",
            alignItems: "flex-start",
            gap: 8
          }}
        >
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span style={{ flex: 1 }}>{regErro}</span>
          <button
            onClick={() => setErro(null)}
            style={{
              color: "var(--red)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              flexShrink: 0
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Foto preview ── */}
      {fotoCapturada && !regLoading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            background: "rgba(47,125,79,0.07)",
            border: "1px solid rgba(47,125,79,0.20)",
            borderRadius: "var(--radius-md)",
            marginBottom: 14
          }}
        >
          <img
            src={fotoCapturada}
            alt="Foto"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid var(--green)",
              flexShrink: 0
            }}
          />
          <p style={{ fontSize: 13, color: "var(--ink-700)", flex: 1 }}>Foto biométrica pronta</p>
          <button
            onClick={() => setFotoCapturada(null)}
            style={{
              fontSize: 12,
              color: "var(--ink-500)",
              background: "none",
              border: "none",
              cursor: "pointer"
            }}
          >
            Refazer
          </button>
        </div>
      )}

      {/* ── Painel de ação ── */}
      {semRegistroPontoHoje ? (
        <div
          style={{
            background: "rgba(122,30,38,0.04)",
            border: "1px solid rgba(122,30,38,0.16)",
            borderRadius: "var(--radius-lg)",
            padding: "24px 20px",
            marginBottom: 14,
            textAlign: "center"
          }}
        >
          <p style={{ fontSize: 28, marginBottom: 12 }}>
            {categoriaFuncional === "GERENTE" ? "👑" : "📋"}
          </p>
          <p
            style={{ fontSize: 15, fontWeight: 700, color: "var(--burgundy-600)", marginBottom: 8 }}
          >
            Registro de ponto não aplicável
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.7, margin: 0 }}>
            {categoriaFuncional === "ASSESSOR" || categoriaFuncional === "GERENTE" ? (
              <>
                Funcionários na categoria{" "}
                <strong>{categoriaFuncional === "GERENTE" ? "Gerente" : "Assessor"}</strong> não
                utilizam o sistema de registro de ponto eletrônico. Solicitações, envio ao RH e
                demais fluxos permanecem disponíveis; após aprovação, o histórico é apenas
                informativo e não entra em base de cálculo (mesmo após eventual mudança de
                categoria). Em caso de dúvidas, entre em contato com o setor de RH.
              </>
            ) : (
              <>
                Hoje ainda não há obrigação de registro de ponto. Após o retorno de Assessor/Gerente
                para categoria com ponto, a obrigação começa apenas no <strong>dia seguinte</strong>
                .
              </>
            )}
          </p>
        </div>
      ) : feriadoHoje?.bloqueado ? (
        /* Feriado nacional/estadual/municipal hoje — registro de ponto bloqueado */
        <div
          style={{
            background: "rgba(247,196,55,0.08)",
            border: "1px solid rgba(247,196,55,0.35)",
            borderRadius: "var(--radius-lg)",
            padding: "20px 16px",
            marginBottom: 14,
            textAlign: "center"
          }}
        >
          <p style={{ fontSize: 22, marginBottom: 10 }}>🎉</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#8a6a00", marginBottom: 8 }}>
            Hoje é feriado: {feriadoHoje.nome}
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 0, lineHeight: 1.6 }}>
            O registro de ponto está suspenso. Em caso de dúvidas, fale com o RH.
          </p>
        </div>
      ) : afastamentoHoje ? (
        afastamentoHoje.tipo === "FERIAS" ? (
          /* Funcionário em período de gozo de férias aprovado */
          <div
            style={{
              background: "rgba(47,125,79,0.06)",
              border: "1px solid rgba(47,125,79,0.22)",
              borderRadius: "var(--radius-lg)",
              padding: "24px 20px",
              marginBottom: 14,
              textAlign: "center"
            }}
          >
            <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }}>🌴</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#2f7d4f", marginBottom: 6 }}>
              Você está de férias hoje!
            </p>
            <p style={{ fontSize: 13, color: "#2f7d4f", marginBottom: 4, lineHeight: 1.6 }}>
              Período de gozo aprovado:{" "}
              <strong>
                {new Date(afastamentoHoje.dataInicio + "T12:00:00").toLocaleDateString("pt-BR")}
                {" até "}
                {new Date(afastamentoHoje.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}
              </strong>
            </p>
            <p
              style={{ fontSize: 12.5, color: "var(--ink-500)", marginBottom: 20, lineHeight: 1.6 }}
            >
              O registro de ponto está suspenso durante o período de férias. Aproveite o descanso!
            </p>
            <Link
              to="/ponto/solicitacoes"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 18px",
                borderRadius: "var(--radius-md)",
                background: "#2f7d4f",
                color: "#fff",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--font-body)"
              }}
            >
              Ver minhas férias
            </Link>
          </div>
        ) : (
          /* Outros afastamentos: atestado, licença, abono */
          <div
            style={{
              background: "rgba(37,99,235,0.05)",
              border: "1px solid rgba(37,99,235,0.15)",
              borderRadius: "var(--radius-lg)",
              padding: "20px 16px",
              marginBottom: 14,
              textAlign: "center"
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>
              Registro de ponto desabilitado hoje
            </p>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}>
              Você está em <strong>{afastamentoHoje.label}</strong> hoje, conforme solicitação
              aprovada. Não é necessário (nem possível) registrar ponto neste dia.
            </p>
            <Link
              to="/ponto/historico"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                background: "var(--burgundy-600)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--font-body)"
              }}
            >
              Ver Histórico
            </Link>
          </div>
        )
      ) : slots.length > 0 ? (
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "16px",
            marginBottom: 14
          }}
        >
          {/* Validações — mesmo componente em mobile e desktop */}
          <ValidacoesPanel items={validacoes} />

          {/* Pré-ativação de GPS — somente Safari iOS */}
          {isMobile && checkGeo && geoloc && !cameraAberta && !guiaAberto && (
            <SafariGeoAtivacao ativo={true} onPronto={() => setGeoStatus("pendente")} />
          )}

          {/* Mapa de geolocalização — somente mobile, quando geo está ativo e câmera/guia fechados */}
          {isMobile && checkGeo && geoloc && !cameraAberta && !guiaAberto && (
            <MapaGeolocalizacao cfg={cfg} ativo={true} onStatusChange={(s) => setGeoStatus(s)} />
          )}

          {/* Botões de ação — proporção definida pela fase atual */}
          <div style={{ display: "flex", gap: 10 }}>
            {slots.map((slot) => {
              const info = ACAO_INFO[slot.tipo];
              const Icon =
                slot.tipo === "INTERROMPER_EXPEDIENTE"
                  ? PauseIcon
                  : slot.tipo === "REINICIAR_EXPEDIENTE"
                    ? PlayIcon
                    : null;
              return (
                <button
                  key={slot.tipo}
                  className="btn btn-primary"
                  onClick={() => handleAcao(slot.tipo)}
                  disabled={regLoading}
                  title={slot.iconOnly ? info.label : undefined}
                  aria-label={slot.iconOnly ? info.label : undefined}
                  style={{
                    flex: `${slot.width} 1 0%`,
                    fontSize: 15,
                    minHeight: 54,
                    background: btnBgFor(info.cor),
                    opacity: regLoading ? 0.7 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: slot.iconOnly ? "0 6px" : undefined
                  }}
                >
                  {regLoading ? (
                    <RefreshCwIcon size={18} style={{ animation: "spin 1s linear infinite" }} />
                  ) : slot.iconOnly ? (
                    Icon && <Icon size={20} />
                  ) : (
                    <>
                      {Icon && <Icon size={16} />}
                      {info.label}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Toggle de geolocalização */}
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 2px"
            }}
          >
            <button
              onClick={() => setGeoloc((v) => !v)}
              style={{
                width: 38,
                height: 22,
                borderRadius: 11,
                border: "none",
                cursor: "pointer",
                position: "relative",
                background: geoloc ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)",
                transition: "background 180ms",
                flexShrink: 0
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: geoloc ? 19 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 180ms",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                }}
              />
            </button>
            <MapPinIcon
              size={13}
              style={{ color: geoloc ? "var(--burgundy-600)" : "var(--ink-500)", flexShrink: 0 }}
            />
            <span style={{ fontSize: 11.5, color: "var(--ink-700)" }}>
              {geoloc ? "Geolocalização ativa" : "Geolocalização desativada"}
            </span>
          </div>
        </div>
      ) : (
        /* Jornada encerrada */
        <div
          style={{
            background: "rgba(30,74,122,0.05)",
            border: "1px solid rgba(30,74,122,0.15)",
            borderRadius: "var(--radius-lg)",
            padding: "20px 16px",
            marginBottom: 14,
            textAlign: "center"
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--blue-ink)", marginBottom: 8 }}>
            Jornada do dia encerrada
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}>
            Todos os registros foram efetuados. Para corrigir algum registro, abra uma solicitação.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <Link
              to="/ponto/historico"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                background: "var(--burgundy-600)",
                color: "#fff",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--font-body)"
              }}
            >
              Ver Histórico
            </Link>
            <Link
              to="/ponto/solicitacoes"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                color: "var(--burgundy-600)",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--font-body)"
              }}
            >
              Solicitar correção
            </Link>
          </div>
        </div>
      )}

      {/* ── Timeline de registros do dia ── */}
      {registros.length > 0 && (
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "16px"
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 15,
              marginBottom: 14
            }}
          >
            Registros de Hoje ({marcosFeitos}/{totalMarcos})
          </p>
          {registros.map((r, i) => {
            const info = ACAO_INFO[r.tipo];
            const cor = info?.cor ?? "var(--burgundy-600)";
            const Icon =
              r.tipo === "INTERROMPER_EXPEDIENTE"
                ? PauseIcon
                : r.tipo === "REINICIAR_EXPEDIENTE"
                  ? PlayIcon
                  : null;
            const ajusteAutomatico = r.observacoes?.find((o) => o.tipo === "AJUSTE_AUTOMATICO");
            const turnoObs = r.tipo === "ENTRADA" ? obsTurnoSemIntervalo(r.observacoes) : undefined;
            return (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: cor,
                      marginTop: 3,
                      boxShadow: `0 0 0 3px ${cor}20`
                    }}
                  />
                  {i < registros.length - 1 && (
                    <div
                      style={{
                        width: 1,
                        flex: 1,
                        minHeight: 22,
                        background: "rgba(122,30,38,0.10)",
                        margin: "4px 0"
                      }}
                    />
                  )}
                </div>
                <div style={{ paddingBottom: i < registros.length - 1 ? 12 : 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink-900)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    {Icon && <Icon size={13} style={{ color: cor }} />}
                    {TIPO_LABEL[r.tipo]}
                    {turnoObs && (
                      <span
                        title={
                          turnoObs.motivo === "CATEGORIA_CARGA_CORRIDA"
                            ? "Carga horária corrida — sem intervalo de almoço"
                            : turnoObs.turno === "NOTURNO"
                              ? "Turno noturno — sem intervalo"
                              : "Turno vespertino — sem intervalo"
                        }
                        style={{ display: "inline-flex", lineHeight: 0 }}
                      >
                        <CheckCircleIcon size={13} style={{ color: "var(--green)" }} />
                      </span>
                    )}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--ink-500)",
                      marginTop: 1
                    }}
                  >
                    {r.hora}
                    <span style={{ marginLeft: 8, fontSize: 10, color: "var(--ink-400)" }}>
                      {r.modo === "MOBILE" ? "📱" : "🖥"}
                    </span>
                  </p>
                  {(ajusteAutomatico || turnoObs) && (
                    <p
                      style={{
                        fontSize: 11,
                        fontStyle: "italic",
                        color: "var(--ink-500)",
                        marginTop: 4,
                        lineHeight: 1.35,
                        maxWidth: 320
                      }}
                    >
                      {turnoObs?.texto ?? ajusteAutomatico?.texto}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Nota legal ── */}
      <div style={{ display: "flex", gap: 8, padding: "12px 4px", marginTop: 8 }}>
        <InfoIcon size={13} style={{ color: "var(--ink-500)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11.5, color: "var(--ink-500)", lineHeight: 1.6 }}>
          {forcarSemIntervalo ? (
            <>
              Estagiário e menor aprendiz seguem <strong>carga horária corrida</strong> (sem
              intervalo de almoço no ponto). Fluxo: <strong>Iniciar → Encerrar</strong>, com pausas
              via <strong>Interromper/Reiniciar Expediente</strong> — o tempo pausado não conta como
              trabalhado. Inconsistências via{" "}
            </>
          ) : (
            <>
              Fluxo diário: <strong>Iniciar → Almoço → Retorno → Encerrar</strong>, com pausas
              opcionais via <strong>Interromper/Reiniciar Expediente</strong>. Entradas após o
              início da janela de almoço seguem jornada sem intervalo. Inconsistências via{" "}
            </>
          )}
          <Link to="/ponto/solicitacoes" style={{ color: "var(--burgundy-600)", fontWeight: 500 }}>
            Solicitações
          </Link>
          .
        </p>
      </div>

      {/* ── Modais ── */}
      {guiaAberto && (
        <CameraPermissionGuide
          onGranted={() => {
            setGuiaAberto(false);
            setCameraAberta(true);
          }}
          onClose={() => setGuiaAberto(false)}
        />
      )}
      {cameraAberta && (
        <CameraModal onCapture={onFotoCapturada} onClose={() => setCameraAberta(false)} />
      )}

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%,100%{box-shadow:0 0 0 0 rgba(47,125,79,0.4)} 50%{box-shadow:0 0 0 6px rgba(47,125,79,0)} }
      `}</style>
    </div>
  );
}

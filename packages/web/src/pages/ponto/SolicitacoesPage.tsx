import { CID_ORIENTACAO, normalizarCid } from "../../utils/cid";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PlusIcon,
  CheckCircleIcon,
  CalendarIcon,
  RefreshCwIcon,
  InfoIcon,
  SetaAlteracaoHorario,
  TextoComSetaHorario
} from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  FeriasDetalheBlock,
  LinksDocumentosFerias,
  AssinarDocumentosFerias,
  AssinarRodadasFerias,
  AbonoDetalheBlock,
  AvisoInterjornadaBlock,
  LinkDocumentoAnexado,
  LogTimelineGestor,
  textoCorrecaoPontoFuncionario
} from "./solicitacaoUi";
import {
  MSG_SOLICITACAO_APENAS_INFORMATIVA,
  categoriaSemIntervaloAlmoco
} from "../../utils/categoriaPonto";
import {
  hojeBrasiliaISO,
  instanteCivilBrasilia,
  normalizarHorarioParcial,
  somarDiasCivil,
  dataCivilPeriodo
} from "../../utils/horario-brasilia";
import {
  motivoVedacaoInicio,
  validarPeriodosEstagiario,
  type CalendarioFerias
} from "../../utils/feriasRegras";
import {
  SolicitanteProvider,
  useApiSolicitante
} from "../../components/solicitacao/SolicitanteContext";
import { FormLicenca } from "../../components/licenca/FormLicenca";
import { CotaAbonoCard, type CotaAbono } from "../../components/abono/CotaAbonoCard";
import { InputHorario } from "../../components/ponto/InputHorario";

/* ══════════════════════════════════════════
   TIPOS
══════════════════════════════════════════ */

type TipoSolicitacao =
  | "CORRECAO_PONTO"
  | "ATESTADO"
  | "FERIAS"
  | "LICENCA"
  | "ABONO"
  | "DAY_OFF"
  | "HORA_EXTRA"
  | "ENVIO_DOCUMENTO_RH";
type StatusSolicitacao =
  | "PENDENTE"
  | "AGUARDANDO_RH"
  | "AGUARDANDO_DOCUMENTO_FUNCIONARIO"
  | "APROVADA"
  | "REJEITADA"
  | "REJEITADA_GESTOR"
  | "REJEITADA_RH"
  | "CANCELADA";

interface Solicitacao {
  id: string;
  tipo: string;
  dataReferencia: string;
  dataInicio: string | null;
  dataFim: string | null;
  descricao: string;
  metadados: Record<string, unknown> | null;
  status: StatusSolicitacao;
  apenasInformativo?: boolean;
  observacaoGestor?: string;
  gestorObservacao?: string;
  gestorResolvidoEm?: string | null;
  gestorUser?: { name: string } | null;
  rhObservacao?: string;
  rhResolvidoEm?: string | null;
  resolvidoEm?: string;
  guiaMedicoUrl?: string | null;
  guiaMedicoEnviadaEm?: string | null;
  guiaMedicoObservacao?: string | null;
  documentoRetornoUrl?: string | null;
  documentoRetornoEm?: string | null;
  createdAt: string;
}

interface RegistroDoDia {
  id: string;
  tipo: string;
  dataHora: string;
  ajustado: boolean;
  observacao: string | null;
}

interface ConfigSolicitacoes {
  atestadoDiasLimiteSimples: number;
  atestadoDiasLimiteInss: number;
  atestadoPrazoEnvioDias: number;
  atestadoMensagemOriginais: string;
  feriasAntecedenciaMinDias: number;
  feriasMinimoGrandePeriodo: number;
  feriasMinimoOutrosPeriodos: number;
  feriasMaxPeriodos: number;
  feriasMaxDiasVenda: number;
  feriasVedacaoPreFeriadoDias: number;
  tipoAtivoCorrecaoPonto?: boolean;
  tipoAtivoAtestado?: boolean;
  tipoAtivoFerias?: boolean;
  tipoAtivoLicenca?: boolean;
  tipoAtivoAbono?: boolean;
  tipoAtivoDayOff?: boolean;
  tipoAtivoHoraExtra?: boolean;
  tipoAtivoEnvioDocumentoRh?: boolean;
  /** Grupo do CID no atestado: OBRIGATORIO | OPCIONAL | DESATIVADO. */
  atestadoCidModo?: "OBRIGATORIO" | "OPCIONAL" | "DESATIVADO";
}

const TIPO_LABEL: Record<TipoSolicitacao, string> = {
  CORRECAO_PONTO: "Correção de Ponto",
  ATESTADO: "Atestado Médico",
  FERIAS: "Férias",
  LICENCA: "Licença e Outros",
  ABONO: "Abono",
  DAY_OFF: "Day Off de Aniversário",
  HORA_EXTRA: "Hora Extra",
  ENVIO_DOCUMENTO_RH: "Envio de Documento ao RH"
};

const TIPO_EMOJI: Record<TipoSolicitacao, string> = {
  CORRECAO_PONTO: "🕐",
  ATESTADO: "🏥",
  FERIAS: "🌴",
  LICENCA: "📋",
  ABONO: "📆",
  DAY_OFF: "🎂",
  HORA_EXTRA: "⏱️",
  ENVIO_DOCUMENTO_RH: "📎"
};

/* Status que encerram a análise — a partir daqui, documentos anexados pelo
   funcionário não podem mais ser editados/substituídos. */
const STATUS_FINALIZADOS: StatusSolicitacao[] = [
  "APROVADA",
  "REJEITADA",
  "REJEITADA_GESTOR",
  "REJEITADA_RH"
];

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** Dias corridos entre duas datas, contados no calendário de Brasília (inclusive). */
function diffDias(inicio: string, fim: string): number {
  if (!inicio || !fim) return 0;
  const ini = dataCivilPeriodo(inicio);
  const fi = dataCivilPeriodo(fim);
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const dias = Math.round((utc(fi) - utc(ini)) / 86_400_000) + 1;
  return Number.isFinite(dias) ? Math.max(0, dias) : 0;
}

function mensagemStatusCorrecaoPonto(status: StatusSolicitacao): string {
  switch (status) {
    case "PENDENTE":
      return "Enviada ao seu chefe de área. Você será notificado quando houver uma decisão.";
    case "AGUARDANDO_RH":
      return "Aprovada pelo chefe e encaminhada ao RH. Após a análise final, seu ponto será atualizado automaticamente.";
    case "APROVADA":
      return "Aprovada pelo chefe e pelo RH. Seu histórico de ponto já reflete a alteração solicitada.";
    case "REJEITADA_GESTOR":
      return "Rejeitada pelo chefe de área. Confira o motivo abaixo; se precisar, você pode abrir uma nova solicitação.";
    case "REJEITADA_RH":
      return "Aprovada pelo chefe, mas rejeitada pelo RH na análise final. Confira o motivo abaixo.";
    case "REJEITADA":
      return "Solicitação rejeitada. Confira as observações abaixo.";
    default:
      return "";
  }
}

function StatusBadge({ status }: { status: StatusSolicitacao }) {
  const map: Record<StatusSolicitacao, { label: string; cls: string }> = {
    PENDENTE: { label: "Aguardando Chefe", cls: "badge-amber" },
    AGUARDANDO_RH: { label: "Aguardando RH", cls: "badge-blue" },
    AGUARDANDO_DOCUMENTO_FUNCIONARIO: { label: "Aguardando seu documento", cls: "badge-amber" },
    APROVADA: { label: "Aprovada", cls: "badge-green" },
    REJEITADA: { label: "Rejeitada", cls: "badge-red" },
    REJEITADA_GESTOR: { label: "Rejeitada pelo Chefe", cls: "badge-red" },
    REJEITADA_RH: { label: "Rejeitada pelo RH", cls: "badge-red" },
    CANCELADA: { label: "Cancelada (substituída)", cls: "badge-amber" }
  };
  const { label, cls } = map[status] ?? { label: status, cls: "badge-amber" };
  return <span className={`badge ${cls}`}>{label}</span>;
}

/* ══════════════════════════════════════════
   SELETOR DE TIPO
══════════════════════════════════════════ */

const TIPO_FLAG: Record<TipoSolicitacao, keyof ConfigSolicitacoes> = {
  CORRECAO_PONTO: "tipoAtivoCorrecaoPonto",
  ATESTADO: "tipoAtivoAtestado",
  FERIAS: "tipoAtivoFerias",
  LICENCA: "tipoAtivoLicenca",
  ABONO: "tipoAtivoAbono",
  DAY_OFF: "tipoAtivoDayOff",
  HORA_EXTRA: "tipoAtivoHoraExtra",
  ENVIO_DOCUMENTO_RH: "tipoAtivoEnvioDocumentoRh"
};

function TipoSeletor({
  onSelect,
  config,
  excluir
}: {
  onSelect: (t: TipoSolicitacao) => void;
  config: ConfigSolicitacoes | null;
  /** RH: tipos que não entram aqui (férias e correção de ponto têm fluxo próprio). */
  excluir?: TipoSolicitacao[];
}) {
  const tipos = (Object.keys(TIPO_LABEL) as TipoSolicitacao[]).filter((t) => {
    if (excluir?.includes(t)) return false;
    if (excluir) return true; /* RH: mostra todos; o servidor confere ou exige a dispensa */
    const flag = TIPO_FLAG[t];
    const val = config?.[flag];
    return val === undefined || val === true;
  });

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16 }}>
        Selecione o tipo de solicitação:
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10
        }}
      >
        {tipos.map((t) => (
          <button
            key={t}
            onClick={() => onSelect(t)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "16px 10px",
              border: "1.5px solid rgba(122,30,38,0.15)",
              borderRadius: "var(--radius-lg)",
              background: "#fff",
              cursor: "pointer",
              transition: "all 160ms"
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--burgundy-600)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(122,30,38,0.03)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(122,30,38,0.15)";
              (e.currentTarget as HTMLButtonElement).style.background = "#fff";
            }}
          >
            <span style={{ fontSize: 26 }}>{TIPO_EMOJI[t]}</span>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)",
                textAlign: "center",
                lineHeight: 1.3
              }}
            >
              {TIPO_LABEL[t]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   FORMULÁRIO: CORREÇÃO DE PONTO
══════════════════════════════════════════ */

function horarioDentroFaixa(horario: string, min: string, max: string): boolean {
  const h = normalizarHorarioParcial(horario) || horario;
  const [hh, mm] = h.split(":").map(Number);
  const [hMin, mMin] = min.split(":").map(Number);
  const [hMax, mMax] = max.split(":").map(Number);
  const atual = (hh || 0) * 60 + (mm || 0);
  return atual >= hMin * 60 + mMin && atual <= hMax * 60 + mMax;
}

/* Tipos de registro exibidos no formulário de correção */
const TIPOS_CORRECAO_BASE = [
  { tipo: "ENTRADA", label: "Entrada", emoji: "🟢" },
  { tipo: "INICIO_INTERVALO", label: "Início Intervalo", emoji: "🟡" },
  { tipo: "FIM_INTERVALO", label: "Fim Intervalo", emoji: "🔵" },
  { tipo: "SAIDA", label: "Saída", emoji: "🔴" }
] as const;

const TIPO_RETORNO_PAUSA = {
  tipo: "REINICIAR_EXPEDIENTE",
  label: "Retorno da pausa",
  emoji: "↩️"
} as const;

const TIPOS_INTERVALO_ALMOCO = new Set(["INICIO_INTERVALO", "FIM_INTERVALO"]);

/** Pausa (INTERROMPER) sem REINICIAR correspondente. */
function temPausaAberta(regs: Array<{ tipo: string }>): boolean {
  let aberta = false;
  for (const r of regs) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") aberta = true;
    else if (r.tipo === "REINICIAR_EXPEDIENTE") aberta = false;
  }
  return aberta;
}

function FormCorrecaoPonto({
  onSubmit,
  enviando
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const [dataRef, setDataRef] = useState("");
  const [registros, setRegistros] = useState<RegistroDoDia[]>([]);
  const [loadingRegistros, setLoadingRegistros] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [horarioMin, setHorarioMin] = useState("06:00");
  const [horarioMax, setHorarioMax] = useState("23:59");
  const [semIntervaloAlmoco, setSemIntervaloAlmoco] = useState(false);
  const hojeIso = hojeBrasiliaISO();
  const ontemIso = somarDiasCivil(hojeIso, -1);

  /* Horários desejados para cada tipo — "" = sem alteração */
  const [horarios, setHorarios] = useState<Record<string, string>>({
    ENTRADA: "",
    INICIO_INTERVALO: "",
    FIM_INTERVALO: "",
    SAIDA: "",
    REINICIAR_EXPEDIENTE: ""
  });

  const diaFechado = !!dataRef && dataRef < hojeIso;
  const podeCorrigirRetornoPausa =
    diaFechado &&
    (temPausaAberta(registros) || registros.some((r) => r.tipo === "REINICIAR_EXPEDIENTE"));

  const tiposCorrecao = (() => {
    const base = semIntervaloAlmoco
      ? TIPOS_CORRECAO_BASE.filter((t) => !TIPOS_INTERVALO_ALMOCO.has(t.tipo))
      : [...TIPOS_CORRECAO_BASE];
    if (podeCorrigirRetornoPausa) return [...base, TIPO_RETORNO_PAUSA];
    return base;
  })();

  useEffect(() => {
    api
      .get<{ pontoHorarioMinimo?: string; pontoHorarioMaximo?: string }>("/ponto/config/sistema")
      .then((cfg) => {
        if (cfg?.pontoHorarioMinimo) setHorarioMin(cfg.pontoHorarioMinimo);
        if (cfg?.pontoHorarioMaximo) setHorarioMax(cfg.pontoHorarioMaximo);
      })
      .catch(() => {});
    api
      .get<{ categoria?: string }>("/ponto/status")
      .then((status) => {
        const cat = status?.categoria;
        setSemIntervaloAlmoco(categoriaSemIntervaloAlmoco(cat));
      })
      .catch(() => {});
  }, []);

  const carregarRegistros = useCallback(async (data: string) => {
    if (!data) return;
    setLoadingRegistros(true);
    setHorarios({
      ENTRADA: "",
      INICIO_INTERVALO: "",
      FIM_INTERVALO: "",
      SAIDA: "",
      REINICIAR_EXPEDIENTE: ""
    });
    try {
      const lista = await api.get<RegistroDoDia[]>(`/ponto/registros-do-dia?data=${data}`);
      setRegistros(lista ?? []);
    } catch {
      setRegistros([]);
    } finally {
      setLoadingRegistros(false);
    }
  }, []);

  useEffect(() => {
    if (dataRef) carregarRegistros(dataRef);
  }, [dataRef, carregarRegistros]);

  /* Retorna o registro existente para um tipo (último REINICIAR, se houver vários) */
  const regDoTipo = (tipo: string) => {
    if (tipo === "REINICIAR_EXPEDIENTE") {
      return [...registros].reverse().find((r) => r.tipo === tipo);
    }
    return registros.find((r) => r.tipo === tipo);
  };

  /* Valida todos os horários preenchidos */
  const erros: Record<string, string> = {};
  for (const { tipo } of tiposCorrecao) {
    const h = normalizarHorarioParcial(horarios[tipo]) || horarios[tipo];
    if (h && !horarioDentroFaixa(h, horarioMin, horarioMax)) {
      erros[tipo] = `Fora da faixa ${horarioMin}–${horarioMax}`;
    }
  }

  /* Constrói a lista de correções apenas dos campos alterados */
  const correcoesDia = tiposCorrecao
    .map(({ tipo }) => {
      const novoHorario = normalizarHorarioParcial(horarios[tipo]) || horarios[tipo];
      if (!novoHorario) return null;
      const reg = regDoTipo(tipo);
      const atual = reg ? fmtTime(reg.dataHora) : null;
      if (novoHorario === atual) return null; // sem mudança
      return {
        acao: reg ? "CORRIGIR" : "INCLUIR",
        tipoRegistro: tipo,
        horario: novoHorario,
        registroId: reg?.id,
        horarioOriginal: atual ?? undefined
      };
    })
    .filter(Boolean);

  const temAlteracao = correcoesDia.length > 0;
  const temErro = Object.keys(erros).length > 0;

  const handleSubmit = () => {
    if (!dataRef || dataRef >= hojeIso || !descricao || !temAlteracao || temErro) return;
    onSubmit({
      tipo: "CORRECAO_PONTO",
      dataReferencia: instanteCivilBrasilia(dataRef, "12:00:00").toISOString(),
      descricao,
      metadados: { correcoesDia }
    });
  };

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Data */}
      <div>
        <label style={labelBase}>Data de referência</label>
        <input
          type="date"
          style={{ ...input, maxWidth: 200 }}
          value={dataRef}
          onChange={(e) => setDataRef(e.target.value)}
          max={ontemIso}
        />
        <p style={{ fontSize: 11.5, color: "var(--ink-400)", margin: "6px 0 0" }}>
          Somente dias anteriores ao dia de hoje. O dia corrente e datas futuras não podem ser
          corrigidos.
        </p>
      </div>

      {dataRef && !diaFechado && (
        <p
          style={{
            fontSize: 13,
            color: "var(--red)",
            margin: 0,
            padding: "10px 12px",
            background: "rgba(200,57,63,0.06)",
            border: "1px solid rgba(200,57,63,0.18)",
            borderRadius: "var(--radius-md)",
            lineHeight: 1.45
          }}
        >
          Correção de ponto só é permitida para dias anteriores. O dia de hoje ainda não está
          fechado — aguarde o dia seguinte.
        </p>
      )}

      {/* Tabela de horários */}
      {dataRef && diaFechado && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--ink-400)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              margin: "0 0 8px"
            }}
          >
            Registros do dia
            {loadingRegistros && (
              <span style={{ fontWeight: 400, marginLeft: 8 }}>⏳ carregando...</span>
            )}
          </p>

          {semIntervaloAlmoco && (
            <p
              style={{
                fontSize: 12,
                color: "var(--ink-500)",
                margin: "0 0 10px",
                lineHeight: 1.45
              }}
            >
              Carga horária corrida: correção de intervalo de almoço não se aplica. Use Entrada e
              Saída (pausas via Interromper/Reiniciar no registro do dia).
            </p>
          )}

          {podeCorrigirRetornoPausa && (
            <p
              style={{
                fontSize: 12,
                color: "var(--ink-500)",
                margin: "0 0 10px",
                lineHeight: 1.45
              }}
            >
              {temPausaAberta(registros)
                ? "Há pausa sem retorno neste dia. Você pode incluir apenas o horário de retorno da pausa (Reiniciar). O início da pausa não pode ser criado por correção."
                : "Você pode ajustar o horário de retorno da pausa. O início da pausa (Interromper) não pode ser alterado por correção."}
            </p>
          )}

          {/* Cabeçalho */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 110px",
              gap: "0 12px",
              padding: "6px 10px",
              background: "rgba(122,30,38,0.04)",
              borderRadius: "var(--radius-md)",
              marginBottom: 4
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-500)" }}>
              Tipo de registro
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-500)" }}>Atual</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-500)" }}>
              Corrigir para
            </span>
          </div>

          {tiposCorrecao.map(({ tipo, label, emoji }) => {
            const reg = regDoTipo(tipo);
            const atual = reg ? fmtTime(reg.dataHora) : null;
            const novo = horarios[tipo];
            const mudou = novo && novo !== atual;
            const erro = erros[tipo];
            return (
              <div
                key={tipo}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 110px",
                  gap: "0 12px",
                  padding: "10px 10px",
                  borderRadius: "var(--radius-md)",
                  alignItems: "center",
                  background: mudou ? "rgba(37,99,235,0.04)" : "#fff",
                  border: mudou
                    ? "1px solid rgba(37,99,235,0.18)"
                    : "1px solid rgba(122,30,38,0.07)"
                }}
              >
                {/* Label */}
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-800)" }}>
                  {emoji} {label}
                  {reg?.ajustado && (
                    <span
                      style={{ fontSize: 10, color: "#1e40af", marginLeft: 6, fontWeight: 400 }}
                    >
                      já ajustado
                    </span>
                  )}
                </span>

                {/* Atual */}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: atual ? "var(--ink-700)" : "var(--ink-300)"
                  }}
                >
                  {atual ?? "—"}
                </span>

                {/* Novo horário */}
                <div>
                  <InputHorario
                    value={novo}
                    onChange={(v) => setHorarios((h) => ({ ...h, [tipo]: v }))}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      border: `1px solid ${erro ? "rgba(200,57,63,0.5)" : mudou ? "rgba(37,99,235,0.4)" : "rgba(122,30,38,0.14)"}`,
                      borderRadius: "var(--radius-md)",
                      background: mudou ? "rgba(37,99,235,0.04)" : "#fff",
                      boxSizing: "border-box"
                    }}
                  />
                  {erro && (
                    <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "var(--red)" }}>{erro}</p>
                  )}
                  {mudou && !erro && (
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: 10.5,
                        color: "#1e40af",
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap"
                      }}
                    >
                      {reg ? (
                        <>
                          {atual}
                          <SetaAlteracaoHorario />
                          {novo}
                        </>
                      ) : (
                        `Incluir ${novo}`
                      )}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {!loadingRegistros && !temAlteracao && (
            <p
              style={{
                fontSize: 12,
                color: "var(--ink-500)",
                margin: "8px 0 0",
                fontStyle: "italic"
              }}
            >
              Preencha ao menos um horário para criar a solicitação.
            </p>
          )}
          {temAlteracao && (
            <p style={{ fontSize: 12, color: "#1e40af", margin: "8px 0 0", fontWeight: 500 }}>
              {correcoesDia.length} {correcoesDia.length !== 1 ? "alterações" : "alteração"}{" "}
              detectada
              {correcoesDia.length !== 1 ? "s" : ""} — será enviada como uma única solicitação ao
              chefe.
            </p>
          )}

          <p style={{ fontSize: 11.5, color: "var(--ink-400)", margin: "4px 0 0" }}>
            Horário permitido: {horarioMin} – {horarioMax} (Brasília). Deixe em branco para não
            alterar.
          </p>
        </div>
      )}

      {/* Justificativa */}
      <div>
        <label style={labelBase}>
          Descrição / Justificativa <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Explique o motivo da correção..."
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={enviando || !diaFechado || !descricao || !temAlteracao || temErro}
        onClick={handleSubmit}
      >
        {enviando ? "Enviando…" : "Enviar Solicitação"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   COMPONENTE: CÂMERA SCANNER
══════════════════════════════════════════ */

function CameraScanner({ onCaptura }: { onCaptura: (base64: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ativo, setAtivo] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const iniciar = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setAtivo(true);
    } catch {
      alert("Câmera não disponível. Use o upload de arquivo.");
    }
  };

  const capturar = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    const b64 = c.toDataURL("image/jpeg", 0.92);
    setPreview(b64);
    parar();
  };

  const parar = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setAtivo(false);
  };

  const confirmar = () => {
    if (preview) {
      onCaptura(preview);
      setPreview(null);
    }
  };

  const repetir = () => {
    setPreview(null);
    iniciar();
  };

  if (preview) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <img
          src={preview}
          alt="Preview"
          style={{
            borderRadius: "var(--radius-md)",
            maxHeight: 300,
            objectFit: "contain",
            border: "1px solid rgba(0,0,0,0.1)"
          }}
        />
        <p style={{ fontSize: 12, color: "var(--ink-500)", textAlign: "center" }}>
          Verifique se todas as informações do atestado estão legíveis na foto.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={repetir}>
            🔄 Repetir
          </button>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={confirmar}>
            ✅ Confirmar foto
          </button>
        </div>
      </div>
    );
  }

  if (ativo) {
    return (
      <div
        style={{
          position: "relative",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          background: "#000"
        }}
      >
        <video
          ref={videoRef}
          style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }}
          playsInline
          muted
        />
        {/* Máscara retangular estilo scanner */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none"
          }}
        >
          <div
            style={{
              width: "85%",
              height: "65%",
              border: "3px solid rgba(122,30,38,0.85)",
              borderRadius: 8,
              boxShadow: "0 0 0 2000px rgba(0,0,0,0.40)"
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 10
          }}
        >
          <button className="btn btn-primary" onClick={capturar}>
            📸 Capturar
          </button>
          <button
            className="btn btn-ghost"
            style={{ color: "#fff", borderColor: "#fff" }}
            onClick={parar}
          >
            Cancelar
          </button>
        </div>
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn btn-ghost btn-sm" onClick={iniciar}>
        📷 Tirar foto com câmera
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   FORMULÁRIO: ATESTADO MÉDICO
══════════════════════════════════════════ */

function FormAtestado({
  config,
  onSubmit,
  enviando
}: {
  config: ConfigSolicitacoes | null;
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [descricao, setDescricao] = useState("");
  const [documentoBase64, setDocumentoBase64] = useState<string | null>(null);
  const [documentoMime, setDocumentoMime] = useState<string>("image/jpeg");
  const [nomeArquivo, setNomeArquivo] = useState("");
  /* CID (dado de saúde: visível só ao RH): só a categoria, 1 letra + 2 números. */
  const [cidTexto, setCidTexto] = useState("");
  const cidModo = config?.atestadoCidModo ?? "OBRIGATORIO";
  const cidCategoria = normalizarCid(cidTexto);
  const cidInvalido = cidTexto.trim() !== "" && !cidCategoria;

  const isMobile = useIsMobile(768);
  const dias = diffDias(dataInicio, dataFim);
  const diaUnico = dias <= 1;
  const limite = config?.atestadoDiasLimiteSimples ?? 3;
  const limiteInss = config?.atestadoDiasLimiteInss ?? 14;

  const aplicarAtalho = (periodo: "MATUTINO" | "VESPERTINO") => {
    if (periodo === "MATUTINO") {
      setHoraInicio("08:00");
      setHoraFim("12:00");
    } else {
      setHoraInicio("13:00");
      setHoraFim("18:00");
    }
  };

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setDocumentoMime(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => setDocumentoBase64(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const cidFaltando = (cidModo === "OBRIGATORIO" && !cidCategoria) || cidInvalido;

  const handleSubmit = () => {
    if (!dataInicio || !descricao || cidFaltando) return;
    onSubmit({
      tipo: "ATESTADO",
      dataReferencia: new Date(dataInicio + "T12:00:00-03:00").toISOString(),
      dataInicio: new Date(dataInicio + "T00:00:00-03:00").toISOString(),
      dataFim: new Date((dataFim || dataInicio) + "T23:59:59.999-03:00").toISOString(),
      descricao,
      metadados: {
        horarioInicio: diaUnico ? normalizarHorarioParcial(horaInicio) || horaInicio || null : null,
        horarioFim: diaUnico ? normalizarHorarioParcial(horaFim) || horaFim || null : null,
        diasDuracao: dias,
        requerHomologacao: dias > limite && dias < limiteInss,
        requerInss: dias >= limiteInss,
        ...(cidCategoria && cidModo !== "DESATIVADO" ? { cidCodigo: cidCategoria } : {}),
        documentoBase64: documentoBase64 || undefined,
        documentoMime
      }
    });
  };

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelBase}>
            Data Inicial <span style={{ color: "var(--red)" }}>*</span>
          </label>
          <input
            type="date"
            style={input}
            value={dataInicio}
            onChange={(e) => {
              const novoInicio = e.target.value;
              setDataInicio(novoInicio);
              if (dataFim && dataFim !== novoInicio) {
                setHoraInicio("");
                setHoraFim("");
              }
            }}
          />
        </div>
        <div>
          <label style={labelBase}>Data Final</label>
          <input
            type="date"
            style={input}
            value={dataFim}
            min={dataInicio}
            onChange={(e) => {
              const novoFim = e.target.value;
              setDataFim(novoFim);
              if (novoFim !== dataInicio) {
                setHoraInicio("");
                setHoraFim("");
              }
            }}
          />
        </div>
      </div>

      {dias > 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>
          Duração:{" "}
          <strong>
            {dias} dia{dias !== 1 ? "s" : ""}
          </strong>
          {diaUnico ? " — dia inteiro ou período" : " — dias inteiros"}
        </p>
      )}

      {/* Atalhos de período (apenas para atestado de 1 dia) */}
      {diaUnico ? (
        <div>
          <label style={labelBase}>Período do atestado (atalhos)</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => aplicarAtalho("MATUTINO")}
            >
              ☀️ Matutino (08:00–12:00)
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => aplicarAtalho("VESPERTINO")}
            >
              🌆 Vespertino (13:00–18:00)
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelBase}>Horário inicial</label>
              <InputHorario
                style={{ ...input, maxWidth: 140 }}
                value={horaInicio}
                onChange={setHoraInicio}
              />
            </div>
            <div>
              <label style={labelBase}>Horário final</label>
              <InputHorario
                style={{ ...input, maxWidth: 140 }}
                value={horaFim}
                onChange={setHoraFim}
              />
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
            Deixe em branco se o atestado cobrir o dia inteiro.
          </p>
        </div>
      ) : (
        dias > 1 && (
          <p style={{ fontSize: 11, color: "var(--ink-500)", margin: 0 }}>
            Atestados com mais de um dia são sempre considerados dia inteiro (sem horário parcial).
          </p>
        )
      )}

      {/* Banner de regras */}
      {config && dias > 0 && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: `1px solid ${dias >= limiteInss ? "rgba(200,57,63,0.35)" : dias > limite ? "rgba(198,127,0,0.35)" : "rgba(37,99,235,0.25)"}`,
            background:
              dias >= limiteInss
                ? "rgba(200,57,63,0.05)"
                : dias > limite
                  ? "rgba(198,127,0,0.06)"
                  : "rgba(37,99,235,0.05)"
          }}
        >
          {dias <= limite && (
            <>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#1e40af", margin: "0 0 4px" }}>
                ℹ️ Atestado padrão (até {limite} dias)
              </p>
              <p style={{ fontSize: 12.5, color: "#1e40af", margin: 0 }}>
                {config.atestadoMensagemOriginais}
              </p>
            </>
          )}
          {dias > limite && dias < limiteInss && (
            <>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#92400e", margin: "0 0 4px" }}>
                ⚠️ Atestado com homologação necessária ({limite + 1}–{limiteInss - 1} dias)
              </p>
              <p style={{ fontSize: 12.5, color: "#92400e", margin: "0 0 8px" }}>
                Após a aprovação do seu chefe, o RH avaliará se este atestado precisa de uma Guia do
                Médico do Trabalho. Caso seja necessário, o RH enviará a guia específica diretamente
                nesta solicitação e você poderá acompanhá-la aqui.
              </p>
              <p style={{ fontSize: 12.5, color: "#92400e", margin: "6px 0 0" }}>
                {config.atestadoMensagemOriginais}
              </p>
            </>
          )}
          {dias >= limiteInss && (
            <>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#7a1e26", margin: "0 0 4px" }}>
                🔴 Afastamento longo (≥ {limiteInss} dias) — INSS necessário
              </p>
              <p style={{ fontSize: 12.5, color: "#7a1e26", margin: "0 0 4px" }}>
                Anexe o documento do INSS para aprovação do RH.
              </p>
              <p style={{ fontSize: 12.5, color: "#7a1e26", margin: 0 }}>
                {config.atestadoMensagemOriginais}
              </p>
            </>
          )}
        </div>
      )}

      {/* Upload do documento */}
      <div>
        <label style={labelBase}>Documento do atestado (foto ou PDF)</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {isMobile && (
            <CameraScanner
              onCaptura={(b64) => {
                setDocumentoBase64(b64);
                setDocumentoMime("image/jpeg");
                setNomeArquivo("foto-câmera.jpg");
              }}
            />
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="file"
              id="atestado-arquivo"
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={handleArquivo}
            />
            <label
              htmlFor="atestado-arquivo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                border: "1px solid rgba(122,30,38,0.22)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--burgundy-600)",
                background: "#fff"
              }}
            >
              📎 Upload (imagem ou PDF)
            </label>
            {nomeArquivo && (
              <span style={{ fontSize: 12, color: "var(--ink-500)" }}>✓ {nomeArquivo}</span>
            )}
          </div>
          {documentoBase64 && documentoMime.startsWith("image/") && (
            <img
              src={documentoBase64}
              alt="Prévia"
              style={{
                maxHeight: 180,
                objectFit: "contain",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(0,0,0,0.1)"
              }}
            />
          )}
        </div>
      </div>

      {cidModo !== "DESATIVADO" && (
        <div>
          <label style={labelBase} htmlFor="atestado-cid">
            CID {cidModo === "OBRIGATORIO" && <span style={{ color: "var(--red)" }}>*</span>}
          </label>
          <input
            id="atestado-cid"
            style={{ ...input, textTransform: "uppercase", maxWidth: 220 }}
            value={cidTexto}
            maxLength={8}
            placeholder="Ex.: Z13"
            autoComplete="off"
            onChange={(e) => setCidTexto(e.target.value)}
            onBlur={() => cidCategoria && setCidTexto(cidCategoria)}
          />
          <p
            style={{
              fontSize: 11,
              color: cidInvalido ? "var(--red)" : "var(--ink-500)",
              margin: "4px 0 0"
            }}
          >
            {cidInvalido
              ? "CID inválido. Use 1 letra seguida de 2 números, como Z13."
              : cidCategoria &&
                  cidTexto
                    .trim()
                    .toUpperCase()
                    .replace(/[\s.-]/g, "") !== cidCategoria
                ? `Será registrado como ${cidCategoria} (a categoria é a mesma).`
                : CID_ORIENTACAO}
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "2px 0 0" }}>
            Informação de saúde protegida (LGPD): fica visível apenas para o RH.
          </p>
        </div>
      )}

      <div>
        <label style={labelBase}>
          Descrição / Justificativa <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva o motivo..."
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={enviando || !dataInicio || !descricao || cidFaltando}
        onClick={handleSubmit}
      >
        {enviando ? "Enviando…" : "Enviar Solicitação"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   FORMULÁRIO: FÉRIAS (multi-período)
══════════════════════════════════════════ */

interface PeriodoFerias {
  dataInicio: string;
  dataFim: string;
  dias: number;
}

interface CicloFerias {
  numero: number;
  inicio: string;
  fim: string;
  diasPorCiclo: number;
  diasGozo: number;
  diasVendidos: number;
  diasDisponiveis: number;
  status: "DISPONIVEL" | "EM_ANALISE" | "CONFIGURADO";
  solicitacaoId: string | null;
  solicitacaoStatus: string | null;
  /** Ciclo ainda não vencido: dá para marcar, mas só usufruir a partir de `liberaEm`. */
  emFormacao?: boolean;
  liberaEm?: string | null;
}

/** Calendário neutro (seg–sex) enquanto o real não chegou. */
const CALENDARIO_PADRAO_FERIAS: CalendarioFerias = {
  diasUteis: [false, true, true, true, true, true, false],
  feriados: []
};

interface SaldoFerias {
  dataAdmissao: string;
  ciclosVencidos: number;
  diasDisponiveis: number;
  diasGozo: number;
  diasVendidos: number;
  totalVencido: number;
  obrigatorio: boolean;
  mesesTotal: number;
  isEstagiario?: boolean;
  duracaoCicloMeses?: number;
  diasPorCiclo?: number;
  ciclos: CicloFerias[];
}

function slotsPeriodosIniciais(qtd: number): PeriodoFerias[] {
  return Array.from({ length: Math.max(1, qtd) }, () => ({
    dataInicio: "",
    dataFim: "",
    dias: 0
  }));
}

/** Data de um período de férias em pt-BR, no dia civil de Brasília (ver dataCivilPeriodo). */
function fmtPeriodoCurto(iso: string) {
  const [y, m, d] = dataCivilPeriodo(iso).split("-");
  return d ? `${d}/${m}/${y}` : iso;
}

/** Calendário da vedação (feriados e dias úteis) cobrindo os inícios informados. */
function useCalendarioFerias(inicios: string[]): CalendarioFerias | null {
  const chave = [...new Set(inicios.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().join(",");
  const [cal, setCal] = useState<CalendarioFerias | null>(null);
  useEffect(() => {
    if (!chave) return;
    const datas = chave.split(",");
    let ativo = true;
    api
      .get<CalendarioFerias>(
        `/ponto/ferias/calendario?de=${datas[0]}&ate=${somarDiasCivil(datas[datas.length - 1], 10)}`
      )
      .then((r) => ativo && setCal(r ?? null))
      .catch(() => ativo && setCal(null));
    return () => {
      ativo = false;
    };
  }, [chave]);
  return cal;
}

/** Erro de vedação do início (feriado/repouso), ou null — mesma regra do backend. */
function erroVedacao(
  n: number,
  inicio: string,
  dias: number,
  cal: CalendarioFerias | null
): string | null {
  if (!cal || !inicio) return null;
  const motivo = motivoVedacaoInicio(inicio, dias, cal);
  return motivo
    ? `Período ${n}: férias não podem começar em dia sem expediente nem nos ${dias} dias que antecedem feriado ou repouso semanal — ${motivo}`
    : null;
}

function FormFerias({
  config,
  onSubmit,
  enviando,
  solicitacoesFerias = []
}: {
  config: ConfigSolicitacoes | null;
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
  solicitacoesFerias?: Solicitacao[];
}) {
  const cfg = config ?? {
    feriasAntecedenciaMinDias: 30,
    feriasMinimoGrandePeriodo: 14,
    feriasMinimoOutrosPeriodos: 5,
    feriasMaxPeriodos: 3,
    feriasMaxDiasVenda: 10,
    feriasVedacaoPreFeriadoDias: 1
  };

  const [saldo, setSaldo] = useState<SaldoFerias | null>(null);
  const [saldoLoading, setSaldoLoading] = useState(true);
  const [cicloSelecionado, setCicloSelecionado] = useState<number | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoFerias[]>(() =>
    slotsPeriodosIniciais(cfg.feriasMaxPeriodos)
  );
  const [diasVenda, setDiasVenda] = useState(0);
  const [descricao, setDescricao] = useState("");
  const [erros, setErros] = useState<string[]>([]);
  const calendarioFerias = useCalendarioFerias(periodos.map((p) => p.dataInicio));

  useEffect(() => {
    api
      .get<SaldoFerias>("/ponto/ferias/saldo")
      .then((s) => {
        setSaldo(s);
        if (s?.ciclos?.length) {
          const preferido =
            s.ciclos.find((c) => c.status === "DISPONIVEL" && c.diasDisponiveis > 0) ??
            s.ciclos.find((c) => c.status === "CONFIGURADO" || c.status === "EM_ANALISE") ??
            s.ciclos[0];
          setCicloSelecionado(preferido?.numero ?? null);
        }
      })
      .catch(() => setSaldo(null))
      .finally(() => setSaldoLoading(false));
  }, []);

  const isEstagiario = saldo?.isEstagiario ?? false;
  const diasPorCiclo = saldo?.diasPorCiclo ?? 30;
  const cicloAtual = saldo?.ciclos?.find((c) => c.numero === cicloSelecionado) ?? null;

  const solicitacaoDoCiclo = (() => {
    if (!cicloAtual?.solicitacaoId) return null;
    return (
      solicitacoesFerias.find((s) => s.id === cicloAtual.solicitacaoId) ??
      solicitacoesFerias.find((s) => {
        const m = s.metadados;
        return m && Number(m.cicloNumero) === cicloAtual.numero;
      }) ??
      null
    );
  })();

  const modo: "nova" | "alteracao" | "em_analise" | "indisponivel" = (() => {
    if (!cicloAtual) {
      if ((saldo?.diasDisponiveis ?? 0) > 0) return "nova";
      return "indisponivel";
    }
    if (cicloAtual.status === "EM_ANALISE") return "em_analise";
    /* Estagiário pode abrir nova solicitação enquanto houver saldo residual no ciclo
       (desconta o que já foi gozado). CLT: ciclo completo → só alteração. */
    if (isEstagiario && cicloAtual.diasDisponiveis > 0) return "nova";
    if (cicloAtual.status === "CONFIGURADO" && solicitacaoDoCiclo?.status === "APROVADA")
      return "alteracao";
    if (cicloAtual.diasDisponiveis > 0) return "nova";
    return "indisponivel";
  })();

  const diasDisponiveisCiclo =
    modo === "nova" ? (cicloAtual?.diasDisponiveis ?? saldo?.diasDisponiveis ?? 0) : 0;
  const diasJaGozadosCiclo = cicloAtual?.diasGozo ?? 0;

  // Garante que estagiário não tenha diasVenda > 0
  useEffect(() => {
    if (isEstagiario && diasVenda > 0) setDiasVenda(0);
  }, [isEstagiario, diasVenda]);

  /* CLT: mantém 3 slots (ou 2 com venda). Estagiário: só 1 obrigatório; extras via “Adicionar”. */
  useEffect(() => {
    if (modo !== "nova") return;
    if (isEstagiario) {
      setPeriodos((prev) => {
        const todosVazios = prev.every((p) => !p.dataInicio && !p.dataFim);
        if (prev.length === 0 || (todosVazios && prev.length !== 1)) {
          return slotsPeriodosIniciais(1);
        }
        return prev;
      });
      return;
    }
    const maxGozo = diasVenda > 0 ? cfg.feriasMaxPeriodos - 1 : cfg.feriasMaxPeriodos;
    setPeriodos((prev) => {
      if (prev.length === maxGozo) return prev;
      if (prev.length > maxGozo) return prev.slice(0, maxGozo);
      return [...prev, ...slotsPeriodosIniciais(maxGozo - prev.length)];
    });
  }, [modo, diasVenda, isEstagiario, cfg.feriasMaxPeriodos, cicloSelecionado]);

  // Reset form ao trocar de ciclo (modo nova)
  useEffect(() => {
    if (modo !== "nova") return;
    setDiasVenda(0);
    setDescricao("");
    setPeriodos(
      slotsPeriodosIniciais(
        isEstagiario ? 1 : diasVenda > 0 ? cfg.feriasMaxPeriodos - 1 : cfg.feriasMaxPeriodos
      )
    );
    // Reset proposital ao trocar ciclo (deps incompletas de propósito).
  }, [cicloSelecionado]);

  const hojeIso = hojeBrasiliaISO();
  const minAntecedencia = somarDiasCivil(hojeIso, cfg.feriasAntecedenciaMinDias);
  const liberaEmCiclo = cicloAtual?.liberaEm ?? null;
  const minDataStr =
    liberaEmCiclo && liberaEmCiclo > minAntecedencia ? liberaEmCiclo : minAntecedencia;
  const maxPeriodoEstagiario = (cicloAtual?.diasPorCiclo ?? diasPorCiclo) <= 15 ? 10 : 30;

  const periodosPreenchidos = periodos.filter((p) => p.dataInicio && p.dataFim);
  const totalDiasGozo = periodosPreenchidos.reduce((s, p) => s + p.dias, 0);
  const diasVendaEfetivo = isEstagiario ? 0 : diasVenda;
  const totalDiasUtilizados = totalDiasGozo + diasVendaEfetivo;
  const diasRestantes = diasDisponiveisCiclo - totalDiasUtilizados;
  const maxVenda = isEstagiario ? 0 : Math.min(cfg.feriasMaxDiasVenda, diasDisponiveisCiclo);
  /** Estagiário: N períodos (só o 1º obrigatório). CLT: limite da config. */
  const maxPeriodosGozo = isEstagiario
    ? 3
    : diasVenda > 0
      ? cfg.feriasMaxPeriodos - 1
      : cfg.feriasMaxPeriodos;

  function calcDias(ini: string, fim: string) {
    return diffDias(ini, fim);
  }

  function updPeriodo(idx: number, field: "dataInicio" | "dataFim", val: string) {
    setPeriodos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      const p = next[idx];
      if (p.dataInicio && p.dataFim) next[idx].dias = calcDias(p.dataInicio, p.dataFim);
      else next[idx].dias = 0;
      return next;
    });
  }

  function addPeriodo() {
    if (periodos.length < maxPeriodosGozo) {
      setPeriodos((p) => [...p, { dataInicio: "", dataFim: "", dias: 0 }]);
    }
  }

  function removePeriodo(idx: number) {
    if (isEstagiario && idx === 0) return; // 1º período obrigatório
    if (periodos.length > 1) setPeriodos((p) => p.filter((_, i) => i !== idx));
  }

  useEffect(() => {
    if (modo !== "nova") {
      setErros([]);
      return;
    }
    const errs: string[] = [];
    const preenchidos = periodos.filter((p) => p.dataInicio && p.dataFim);

    // Períodos parcialmente preenchidos (válido para todos)
    periodos.forEach((p, i) => {
      if ((p.dataInicio && !p.dataFim) || (!p.dataInicio && p.dataFim))
        errs.push(`Período ${i + 1}: informe início e fim.`);
    });

    if (diasDisponiveisCiclo <= 0) {
      errs.push("Não há dias disponíveis neste ciclo para uma nova solicitação.");
    }

    /* Estagiário: 1º período obrigatório; demais opcionais; sem zerar saldo. */
    if (isEstagiario) {
      const p0 = periodos[0];
      if (!p0?.dataInicio || !p0?.dataFim) {
        errs.push("O 1º período é obrigatório.");
      } else if (p0.dias <= 0) {
        errs.push("Período 1: a data fim deve ser igual ou posterior ao início.");
      }
      if (preenchidos.length > 0) {
        errs.push(
          ...validarPeriodosEstagiario({
            periodos: preenchidos.map((p) => ({ inicio: p.dataInicio, fim: p.dataFim })),
            maxPeriodoDias: maxPeriodoEstagiario,
            regras: {
              antecedenciaMinDias: cfg.feriasAntecedenciaMinDias,
              vedacaoPreFeriadoDias: cfg.feriasVedacaoPreFeriadoDias
            },
            hoje: hojeIso,
            calendario: calendarioFerias ?? CALENDARIO_PADRAO_FERIAS,
            liberaEm: liberaEmCiclo
          })
        );
      }
      if (diasDisponiveisCiclo > 0 && preenchidos.length > 0 && diasRestantes < 0) {
        errs.push(
          `Total excede os ${diasDisponiveisCiclo} dias disponíveis neste ciclo (Restam = ${diasRestantes}d).`
        );
      }
      setErros(errs);
      return;
    }

    if (diasVenda > 0 && periodos.length > maxPeriodosGozo) {
      errs.push(`Com venda de dias, o máximo é ${maxPeriodosGozo} período(s) de gozo.`);
    }

    preenchidos.forEach((p) => {
      const i = periodos.indexOf(p);
      if (liberaEmCiclo && p.dataInicio < liberaEmCiclo)
        errs.push(
          `Período ${i + 1}: as férias só podem ser usufruídas a partir de ${liberaEmCiclo.split("-").reverse().join("/")} (fim do período aquisitivo).`
        );
      if (p.dataInicio < minAntecedencia)
        errs.push(
          `Período ${i + 1}: início deve ter pelo menos ${cfg.feriasAntecedenciaMinDias} dias de antecedência.`
        );
      if (p.dias > 0 && p.dias < cfg.feriasMinimoOutrosPeriodos)
        errs.push(`Período ${i + 1}: mínimo de ${cfg.feriasMinimoOutrosPeriodos} dias.`);
      const vedado = erroVedacao(
        i + 1,
        p.dataInicio,
        cfg.feriasVedacaoPreFeriadoDias,
        calendarioFerias
      );
      if (vedado) errs.push(vedado);
    });

    if (
      preenchidos.length > 0 &&
      !preenchidos.some((p) => p.dias >= cfg.feriasMinimoGrandePeriodo)
    ) {
      errs.push(
        `Ao menos um período deve ter no mínimo ${cfg.feriasMinimoGrandePeriodo} dias corridos.`
      );
    }

    if (diasVenda > maxVenda) errs.push(`Venda máxima de ${maxVenda} dias.`);

    if (diasDisponiveisCiclo > 0 && preenchidos.length > 0 && diasRestantes !== 0) {
      errs.push(
        diasRestantes > 0
          ? `Gozo + venda deve igualar os ${diasDisponiveisCiclo} dias do ciclo (Restam deve ser 0; faltam ${diasRestantes} dias).`
          : `Total excede os ${diasDisponiveisCiclo} dias do ciclo (Restam = ${diasRestantes}d).`
      );
    }

    setErros(errs);
  }, [
    modo,
    periodos,
    diasVenda,
    isEstagiario,
    diasDisponiveisCiclo,
    diasRestantes,
    maxVenda,
    maxPeriodosGozo,
    cfg,
    minDataStr,
    minAntecedencia,
    liberaEmCiclo,
    maxPeriodoEstagiario,
    hojeIso,
    calendarioFerias
  ]);

  const podeEnviar =
    modo === "nova" &&
    periodosPreenchidos.length > 0 &&
    periodos.every(
      (p) => (!p.dataInicio && !p.dataFim) || (p.dataInicio && p.dataFim && p.dias > 0)
    ) &&
    erros.length === 0 &&
    totalDiasUtilizados > 0 &&
    (isEstagiario ? diasRestantes >= 0 : diasRestantes === 0);

  const handleSubmit = () => {
    if (!podeEnviar) return;
    const preenchidos = periodos.filter((p) => p.dataInicio && p.dataFim && p.dias > 0);
    const primeiroInicio = preenchidos.reduce(
      (m, p) => (!m || p.dataInicio < m ? p.dataInicio : m),
      ""
    );
    const ultimoFim = preenchidos.reduce((m, p) => (!m || p.dataFim > m ? p.dataFim : m), "");
    onSubmit({
      tipo: "FERIAS",
      dataReferencia: instanteCivilBrasilia(primeiroInicio, "12:00:00").toISOString(),
      dataInicio: instanteCivilBrasilia(primeiroInicio, "00:00:00").toISOString(),
      dataFim: instanteCivilBrasilia(ultimoFim, "23:59:59").toISOString(),
      descricao,
      metadados: {
        periodos: preenchidos.map((p) => ({
          /* Fuso de Brasília, como as demais datas da solicitação. */
          dataInicio: instanteCivilBrasilia(p.dataInicio, "00:00:00").toISOString(),
          dataFim: instanteCivilBrasilia(p.dataFim, "23:59:59").toISOString(),
          dias: p.dias
        })),
        diasVendidos: diasVendaEfetivo,
        totalDiasGozo: totalDiasGozo,
        totalDias: totalDiasUtilizados,
        diasDisponiveis: diasDisponiveisCiclo,
        cicloNumero: cicloAtual?.numero ?? null,
        diasPorCiclo
      }
    });
  };

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box"
  };

  if (modo === "alteracao" && solicitacaoDoCiclo) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {saldo && saldo.ciclos.length > 1 && (
          <SeletorCicloFerias
            ciclos={saldo.ciclos}
            selecionado={cicloSelecionado}
            onSelect={setCicloSelecionado}
          />
        )}
        <ResumoSolicitacaoFeriasOriginal solicitacao={solicitacaoDoCiclo} />
        <FormFeriasAlteracao
          solicitacaoOriginal={solicitacaoDoCiclo}
          config={config}
          onSubmit={onSubmit}
          enviando={enviando}
          cicloNumero={cicloAtual?.numero}
          isEstagiario={isEstagiario}
        />
      </div>
    );
  }

  if (modo === "em_analise" && solicitacaoDoCiclo) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {saldo && saldo.ciclos.length > 1 && (
          <SeletorCicloFerias
            ciclos={saldo.ciclos}
            selecionado={cicloSelecionado}
            onSelect={setCicloSelecionado}
          />
        )}
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(247,196,55,0.10)",
            border: "1px solid rgba(247,196,55,0.35)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            color: "#8a6a00",
            lineHeight: 1.55
          }}
        >
          Já existe uma solicitação de férias <strong>em análise</strong> para este ciclo. Aguarde a
          conclusão para solicitar alteração dos períodos.
        </div>
        <ResumoSolicitacaoFeriasOriginal solicitacao={solicitacaoDoCiclo} />
      </div>
    );
  }

  if (modo === "indisponivel") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {saldo && saldo.ciclos.length > 1 && (
          <SeletorCicloFerias
            ciclos={saldo.ciclos}
            selecionado={cicloSelecionado}
            onSelect={setCicloSelecionado}
          />
        )}
        {!saldoLoading && !saldo ? (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(247,196,55,0.08)",
              border: "1px solid rgba(247,196,55,0.25)",
              borderRadius: "var(--radius-md)",
              fontSize: 12.5,
              color: "#8a6a00"
            }}
          >
            Data de admissão não cadastrada. Solicite ao RH para calcular o saldo de férias.
          </div>
        ) : (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(122,30,38,0.05)",
              border: "1px solid rgba(122,30,38,0.15)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              color: "var(--ink-700)",
              lineHeight: 1.55
            }}
          >
            {saldoLoading
              ? "Carregando saldo de férias…"
              : isEstagiario
                ? "Não há dias disponíveis neste ciclo. O saldo já foi totalmente gozado ou há solicitação em análise."
                : "Não há dias disponíveis para nova solicitação neste ciclo. Se já configurou as férias, use a opção de mudança nos períodos ainda elegíveis (antecedência mínima)."}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Saldo do ciclo */}
      {saldoLoading ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-500)" }}>Carregando saldo de férias…</p>
      ) : saldo ? (
        <div
          style={{
            padding: "12px 14px",
            background: saldo.obrigatorio ? "rgba(200,57,63,0.07)" : "rgba(47,125,79,0.06)",
            border: `1px solid ${saldo.obrigatorio ? "rgba(200,57,63,0.25)" : "rgba(47,125,79,0.20)"}`,
            borderRadius: "var(--radius-md)"
          }}
        >
          {saldo.isEstagiario && (
            <p style={{ fontSize: 11.5, fontWeight: 700, color: "#1e40af", margin: "0 0 6px" }}>
              Estagiário — recesso: 15 dias aos 6 meses e 30 dias ao completar 1 ano
            </p>
          )}
          {saldo.obrigatorio && (
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--red)", margin: "0 0 6px" }}>
              ⚠️ Período de gozo obrigatório — tire suas férias antes do fim do ciclo!
            </p>
          )}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              [
                "Dias disponíveis",
                String(saldo.diasDisponiveis),
                saldo.diasDisponiveis > 0 ? "var(--green)" : "var(--ink-500)"
              ],
              ["Já gozados", String(saldo.diasGozo), "var(--ink-700)"],
              ...(!saldo.isEstagiario
                ? [["Já vendidos", String(saldo.diasVendidos), "var(--ink-700)"]]
                : []),
              ["Ciclos vencidos", String(saldo.ciclosVencidos), "var(--ink-700)"]
            ].map(([l, v, c]) => (
              <div key={l}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    margin: 0
                  }}
                >
                  {l}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 18,
                    fontWeight: 700,
                    color: c,
                    margin: 0
                  }}
                >
                  {v}
                </p>
              </div>
            ))}
          </div>
          {saldo.ciclos.length > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 8, marginBottom: 0 }}>
              Ciclo(s) ativo(s):{" "}
              {saldo.ciclos
                .map(
                  (c) =>
                    `${fmtPeriodoCurto(c.inicio)} – ${fmtPeriodoCurto(c.fim)} (${c.diasDisponiveis}d disp.)`
                )
                .join(" | ")}
            </p>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(247,196,55,0.08)",
            border: "1px solid rgba(247,196,55,0.25)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            color: "#8a6a00"
          }}
        >
          Data de admissão não cadastrada. Solicite ao RH para calcular o saldo de férias.
        </div>
      )}

      {saldo && saldo.ciclos.length > 1 && (
        <SeletorCicloFerias
          ciclos={saldo.ciclos}
          selecionado={cicloSelecionado}
          onSelect={setCicloSelecionado}
        />
      )}

      {cicloAtual && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(47,125,79,0.06)",
            border: "1px solid rgba(47,125,79,0.18)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            color: "#166534"
          }}
        >
          {isEstagiario ? (
            <>
              Configurando <strong>ciclo {cicloAtual.numero}</strong> —{" "}
              <strong>{diasDisponiveisCiclo}</strong> dia
              {diasDisponiveisCiclo !== 1 ? "s" : ""} disponível
              {diasDisponiveisCiclo !== 1 ? "eis" : ""}
              {diasJaGozadosCiclo > 0
                ? ` (${diasJaGozadosCiclo} já gozado${diasJaGozadosCiclo !== 1 ? "s" : ""} neste ciclo)`
                : ""}
              . Divida em blocos de 5 dias (até 3 períodos). Não é necessário zerar o saldo.
              {cicloAtual.liberaEm
                ? ` O gozo só vale a partir de ${cicloAtual.liberaEm.split("-").reverse().join("/")}.`
                : ""}
            </>
          ) : (
            <>
              Configurando <strong>ciclo {cicloAtual.numero}</strong> ({diasDisponiveisCiclo} dias a
              programar). Na primeira solicitação, informe todos os períodos até Restam = 0.
              {cicloAtual.liberaEm
                ? ` Você já pode marcar, mas só poderá usufruir a partir de ${cicloAtual.liberaEm.split("-").reverse().join("/")} (fim do período aquisitivo).`
                : ""}
            </>
          )}
        </div>
      )}

      {/* Regras */}
      <div
        style={{
          padding: "10px 14px",
          background: "rgba(37,99,235,0.05)",
          border: "1px solid rgba(37,99,235,0.2)",
          borderRadius: "var(--radius-md)",
          fontSize: 12,
          color: "#1e40af",
          lineHeight: 1.6
        }}
      >
        {isEstagiario ? (
          <>
            <strong>Recesso do estagiário:</strong> 15 dias com 6 meses (5+5+5, 5+10 ou 10+5) e 30
            dias com 1 ano (blocos de 5 dias, até 3 períodos) · antecedência mín.{" "}
            {cfg.feriasAntecedenciaMinDias} dias · não pode começar nos{" "}
            {cfg.feriasVedacaoPreFeriadoDias} dia(s) que antecedem feriado ou repouso. Marcações
            posteriores descontam o que já foi gozado.
          </>
        ) : (
          <>
            <strong>Regras:</strong> até {cfg.feriasMaxPeriodos} períodos de gozo · todos os
            períodos mín. {cfg.feriasMinimoOutrosPeriodos} dias · ao menos 1 período deve ter ≥{" "}
            {cfg.feriasMinimoGrandePeriodo} dias · venda equivale a 1 período (máx.{" "}
            {cfg.feriasMaxPeriodos - 1} períodos de gozo com venda) · venda máx.{" "}
            {cfg.feriasMaxDiasVenda} dias · antecedência mín. {cfg.feriasAntecedenciaMinDias} dias ·
            na primeira solicitação preencha os períodos (com ou sem venda) até Restam = 0 ·
            alterações posteriores com antecedência por período · cada ciclo se configura à parte.
          </>
        )}
      </div>

      {/* Venda de dias — oculto para estagiários */}
      {!isEstagiario && (
        <div>
          <label style={labelBase}>Dias a vender (abono pecuniário) — máx. {maxVenda}</label>
          <input
            type="number"
            style={{ ...input, maxWidth: 120 }}
            min={0}
            max={maxVenda}
            value={diasVenda}
            onChange={(e) =>
              setDiasVenda(Math.min(maxVenda, Math.max(0, parseInt(e.target.value) || 0)))
            }
          />
          {diasVenda > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 4 }}>
              {diasVenda} dia(s) serão convertidos em pagamento (contam como 1 período).
            </p>
          )}
        </div>
      )}

      {/* Períodos — CLT: 3 pré-exibidos; estagiário: 1 obrigatório + N via botão */}
      {periodos.map((p, idx) => (
        <div
          key={idx}
          style={{
            padding: "12px 14px",
            background: "var(--cream-50)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.10)"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--burgundy-600)", margin: 0 }}>
              {idx + 1}º Período
              {isEstagiario
                ? idx === 0
                  ? " (obrigatório)"
                  : " (opcional)"
                : ` (mín. ${cfg.feriasMinimoOutrosPeriodos} dias)`}
            </p>
            {periodos.length > 1 && !(isEstagiario && idx === 0) && (
              <button
                onClick={() => removePeriodo(idx)}
                style={{
                  fontSize: 11,
                  color: "var(--red)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0
                }}
              >
                Remover
              </button>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto",
              gap: 10,
              alignItems: "flex-end"
            }}
          >
            <div>
              <label style={labelBase}>
                Início
                {(!isEstagiario || idx === 0) && <span style={{ color: "var(--red)" }}> *</span>}
              </label>
              <input
                type="date"
                style={input}
                value={p.dataInicio}
                min={minDataStr}
                onChange={(e) => updPeriodo(idx, "dataInicio", e.target.value)}
              />
            </div>
            <div>
              <label style={labelBase}>
                Fim
                {(!isEstagiario || idx === 0) && <span style={{ color: "var(--red)" }}> *</span>}
              </label>
              <input
                type="date"
                style={input}
                value={p.dataFim}
                min={p.dataInicio || minDataStr}
                onChange={(e) => updPeriodo(idx, "dataFim", e.target.value)}
              />
            </div>
            <div style={{ paddingBottom: 1 }}>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 16,
                  fontWeight: 700,
                  color: p.dias > 0 ? "var(--green)" : "var(--ink-400)",
                  margin: 0,
                  textAlign: "center",
                  minWidth: 52
                }}
              >
                {p.dias > 0 ? `${p.dias}d` : "—"}
              </p>
            </div>
          </div>
        </div>
      ))}

      {periodos.length < maxPeriodosGozo && (isEstagiario || diasRestantes > 0) && (
        <button
          onClick={addPeriodo}
          style={{
            alignSelf: "flex-start",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--burgundy-600)",
            background: "none",
            border: "1px dashed rgba(122,30,38,0.30)",
            borderRadius: "var(--radius-md)",
            padding: "7px 14px",
            cursor: "pointer"
          }}
        >
          + Adicionar período
        </button>
      )}

      {/* Resumo */}
      {(totalDiasUtilizados > 0 || diasDisponiveisCiclo > 0) && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--cream-50)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              ["Gozo", totalDiasGozo],
              ...(!isEstagiario ? [["Venda", diasVendaEfetivo]] : []),
              ["Total", totalDiasUtilizados],
              ["Restam", diasRestantes]
            ].map(([l, v]) => (
              <div key={String(l)}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    textTransform: "uppercase",
                    margin: 0
                  }}
                >
                  {l}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 15,
                    fontWeight: 700,
                    color:
                      l === "Restam"
                        ? Number(v) < 0
                          ? "var(--red)"
                          : Number(v) === 0 || isEstagiario
                            ? "var(--green)"
                            : "var(--red)"
                        : Number(v) === 0
                          ? "var(--ink-400)"
                          : "var(--ink-900)",
                    margin: 0
                  }}
                >
                  {v}d
                </p>
              </div>
            ))}
          </div>
          {!isEstagiario && diasRestantes !== 0 && (
            <p style={{ fontSize: 11.5, color: "var(--red)", margin: "8px 0 0" }}>
              Para enviar a primeira solicitação, Restam deve ser igual a 0.
            </p>
          )}
          {isEstagiario && diasRestantes < 0 && (
            <p style={{ fontSize: 11.5, color: "var(--red)", margin: "8px 0 0" }}>
              O total não pode ultrapassar os dias disponíveis do ciclo.
            </p>
          )}
        </div>
      )}

      {erros.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {erros.map((e, i) => (
            <p key={i} style={{ fontSize: 12.5, color: "var(--red)", margin: 0 }}>
              ⚠️ {e}
            </p>
          ))}
        </div>
      )}

      <div>
        <label style={labelBase}>Descrição / Justificativa</label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Informações adicionais (opcional)..."
        />
      </div>

      <button className="btn btn-primary" disabled={enviando || !podeEnviar} onClick={handleSubmit}>
        {enviando ? "Enviando…" : "Enviar Solicitação"}
      </button>
    </div>
  );
}

function SeletorCicloFerias({
  ciclos,
  selecionado,
  onSelect
}: {
  ciclos: CicloFerias[];
  selecionado: number | null;
  onSelect: (n: number) => void;
}) {
  const statusLabel: Record<CicloFerias["status"], string> = {
    DISPONIVEL: "Disponível",
    EM_ANALISE: "Em análise",
    CONFIGURADO: "Configurado"
  };
  return (
    <div>
      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ink-700)",
          margin: "0 0 8px"
        }}
      >
        Selecione o ciclo de férias
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ciclos.map((c) => {
          const ativo = selecionado === c.numero;
          return (
            <button
              key={c.numero}
              type="button"
              onClick={() => onSelect(c.numero)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: ativo
                  ? "1.5px solid var(--burgundy-600)"
                  : "1px solid rgba(122,30,38,0.12)",
                background: ativo ? "rgba(122,30,38,0.05)" : "#fff",
                cursor: "pointer"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center"
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-800)" }}>
                  Ciclo {c.numero}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color:
                      c.status === "DISPONIVEL"
                        ? "var(--green)"
                        : c.status === "EM_ANALISE"
                          ? "#8a6a00"
                          : "var(--ink-500)"
                  }}
                >
                  {statusLabel[c.status]}
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "4px 0 0" }}>
                {fmtPeriodoCurto(c.inicio)} – {fmtPeriodoCurto(c.fim)} · {c.diasDisponiveis}d
                disponíveis
                {c.diasVendidos > 0 ? ` · ${c.diasVendidos}d vendidos` : ""}
                {c.diasGozo > 0 ? ` · ${c.diasGozo}d gozo` : ""}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResumoSolicitacaoFeriasOriginal({ solicitacao }: { solicitacao: Solicitacao }) {
  const meta = solicitacao.metadados ?? {};
  const periodos =
    (meta.periodos as Array<{ dataInicio: string; dataFim: string; dias: number }> | undefined) ??
    [];
  const diasVendidos = Number(meta.diasVendidos ?? 0);
  const cicloNumero = meta.cicloNumero != null ? Number(meta.cicloNumero) : null;
  const totalGozo = Number(meta.totalDiasGozo ?? periodos.reduce((s, p) => s + (p.dias || 0), 0));

  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(47,125,79,0.06)",
        border: "1px solid rgba(47,125,79,0.20)",
        borderRadius: "var(--radius-md)"
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          fontWeight: 700,
          color: "#2f7d4f",
          textTransform: "uppercase",
          letterSpacing: "0.06em"
        }}
      >
        O que foi solicitado
        {cicloNumero != null ? ` — ciclo ${cicloNumero}` : ""}
      </p>
      {periodos.length === 0 && diasVendidos === 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-600)" }}>
          Sem detalhe de períodos na solicitação original.
        </p>
      )}
      {periodos.map((p, i) => (
        <p key={i} style={{ margin: "0 0 3px", fontSize: 12.5, color: "var(--ink-800)" }}>
          <span style={{ fontWeight: 600 }}>{i + 1}º período:</span> {fmtPeriodoCurto(p.dataInicio)}{" "}
          a {fmtPeriodoCurto(p.dataFim)}{" "}
          <span style={{ color: "var(--ink-500)" }}>({p.dias} dias)</span>
        </p>
      ))}
      {diasVendidos > 0 ? (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-700)" }}>
          <strong>Venda (abono pecuniário):</strong> {diasVendidos} dia
          {diasVendidos !== 1 ? "s" : ""} — não pode ser alterada nesta mudança.
        </p>
      ) : (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink-500)" }}>
          Nenhum dia vendido na solicitação original.
        </p>
      )}
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 12,
          fontWeight: 700,
          color: "#2f7d4f",
          borderTop: "1px solid rgba(47,125,79,0.12)",
          paddingTop: 6
        }}
      >
        Total: {totalGozo + diasVendidos} dias ({totalGozo} gozo
        {diasVendidos > 0 ? ` + ${diasVendidos} venda` : ""})
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════
   FORMULÁRIO DE ALTERAÇÃO DE FÉRIAS
══════════════════════════════════════════ */

function FormFeriasAlteracao({
  solicitacaoOriginal,
  config,
  onSubmit,
  enviando,
  cicloNumero,
  isEstagiario = false
}: {
  solicitacaoOriginal: Solicitacao;
  config: ConfigSolicitacoes | null;
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
  cicloNumero?: number | null;
  isEstagiario?: boolean;
}) {
  const cfg = config ?? {
    feriasAntecedenciaMinDias: 30,
    feriasMinimoGrandePeriodo: 14,
    feriasMinimoOutrosPeriodos: 5,
    feriasMaxPeriodos: 3,
    feriasMaxDiasVenda: 10,
    feriasVedacaoPreFeriadoDias: 1
  };
  const metaOriginal = solicitacaoOriginal.metadados;
  const periodosOriginais =
    (metaOriginal?.periodos as
      | Array<{ dataInicio: string; dataFim: string; dias: number }>
      | undefined) ?? [];
  const diasVendaOriginal = (metaOriginal?.diasVendidos as number | undefined) ?? 0;
  const cicloOriginal =
    cicloNumero ?? (metaOriginal?.cicloNumero != null ? Number(metaOriginal.cicloNumero) : null);

  const hojeIso = hojeBrasiliaISO();
  const minDataStr = somarDiasCivil(hojeIso, cfg.feriasAntecedenciaMinDias);

  type PeriodoAlt = { dataInicio: string; dataFim: string; dias: number; bloqueado: boolean };
  const [periodos, setPeriodos] = useState<PeriodoAlt[]>(() =>
    periodosOriginais.map((p) => ({
      dataInicio: dataCivilPeriodo(p.dataInicio),
      dataFim: dataCivilPeriodo(p.dataFim),
      dias: p.dias,
      bloqueado: dataCivilPeriodo(p.dataInicio) <= minDataStr
    }))
  );
  const calendarioFerias = useCalendarioFerias(
    periodos.filter((p) => !p.bloqueado).map((p) => p.dataInicio)
  );
  const [descricao, setDescricao] = useState("");
  const [erros, setErros] = useState<string[]>([]);

  function updPeriodo(idx: number, field: "dataInicio" | "dataFim", val: string) {
    setPeriodos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      const p = next[idx];
      if (p.dataInicio && p.dataFim) next[idx].dias = diffDias(p.dataInicio, p.dataFim);
      return next;
    });
  }

  useEffect(() => {
    const errs: string[] = [];
    const editaveis = periodos.filter((p) => !p.bloqueado);

    if (isEstagiario) {
      const completos = periodos.every((p) => p.dataInicio && p.dataFim);
      if (completos) {
        errs.push(
          ...validarPeriodosEstagiario({
            periodos: periodos.map((p) => ({ inicio: p.dataInicio, fim: p.dataFim })),
            maxPeriodoDias: 30,
            regras: {
              antecedenciaMinDias: cfg.feriasAntecedenciaMinDias,
              vedacaoPreFeriadoDias: cfg.feriasVedacaoPreFeriadoDias
            },
            hoje: hojeIso,
            calendario: calendarioFerias ?? CALENDARIO_PADRAO_FERIAS,
            novos: new Set(periodos.map((p, i) => (p.bloqueado ? -1 : i)).filter((i) => i >= 0))
          })
        );
      }
      setErros(errs);
      return;
    }

    editaveis.forEach((p) => {
      if (!p.dataInicio || !p.dataFim) return;
      const vedado = erroVedacao(
        periodos.indexOf(p) + 1,
        p.dataInicio,
        cfg.feriasVedacaoPreFeriadoDias,
        calendarioFerias
      );
      if (vedado) errs.push(vedado);
      if (p.dataInicio < minDataStr)
        errs.push(
          `Período ${periodos.indexOf(p) + 1}: início deve ter pelo menos ${cfg.feriasAntecedenciaMinDias} dias de antecedência.`
        );
      if (p.dias > 0 && p.dias < cfg.feriasMinimoOutrosPeriodos)
        errs.push(
          `Período ${periodos.indexOf(p) + 1}: mínimo de ${cfg.feriasMinimoOutrosPeriodos} dias.`
        );
    });
    const todosPreenchidos = editaveis.every((p) => p.dataInicio && p.dataFim);
    if (
      todosPreenchidos &&
      editaveis.length > 0 &&
      !periodos.some((p) => p.dias >= cfg.feriasMinimoGrandePeriodo)
    ) {
      errs.push(
        `Ao menos um período deve ter no mínimo ${cfg.feriasMinimoGrandePeriodo} dias corridos.`
      );
    }
    setErros(errs);
  }, [periodos, cfg, minDataStr, hojeIso, isEstagiario, calendarioFerias]);

  const podeEnviar =
    periodos.some((p) => !p.bloqueado) &&
    periodos.filter((p) => !p.bloqueado).every((p) => p.dataInicio && p.dataFim && p.dias > 0) &&
    erros.length === 0;

  const handleSubmit = () => {
    if (!podeEnviar) return;
    const primeiroInicio = periodos.reduce(
      (m, p) => (!m || p.dataInicio < m ? p.dataInicio : m),
      ""
    );
    const ultimoFim = periodos.reduce((m, p) => (!m || p.dataFim > m ? p.dataFim : m), "");
    const totalDiasGozo = periodos.reduce((s, p) => s + p.dias, 0);
    onSubmit({
      tipo: "FERIAS",
      dataReferencia: instanteCivilBrasilia(primeiroInicio, "12:00:00").toISOString(),
      dataInicio: instanteCivilBrasilia(primeiroInicio, "00:00:00").toISOString(),
      dataFim: instanteCivilBrasilia(ultimoFim, "23:59:59").toISOString(),
      descricao,
      metadados: {
        periodos: periodos.map((p) => ({
          /* Fuso de Brasília, como as demais datas da solicitação. */
          dataInicio: instanteCivilBrasilia(p.dataInicio, "00:00:00").toISOString(),
          dataFim: instanteCivilBrasilia(p.dataFim, "23:59:59").toISOString(),
          dias: p.dias
        })),
        diasVendidos: diasVendaOriginal,
        totalDiasGozo,
        totalDias: totalDiasGozo + diasVendaOriginal,
        alteracaoDeId: solicitacaoOriginal.id,
        cicloNumero: cicloOriginal
      }
    });
  };

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box"
  };
  const inputBloqueado: React.CSSProperties = {
    ...input,
    background: "var(--cream-100)",
    color: "var(--ink-400)",
    cursor: "not-allowed"
  };

  const algumEditavel = periodos.some((p) => !p.bloqueado);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          padding: "10px 14px",
          background: "rgba(37,99,235,0.05)",
          border: "1px solid rgba(37,99,235,0.2)",
          borderRadius: "var(--radius-md)",
          fontSize: 12,
          color: "#1e40af",
          lineHeight: 1.6
        }}
      >
        Solicitação de <strong>mudança de férias</strong>
        {cicloOriginal != null ? ` (ciclo ${cicloOriginal})` : ""}.
        {isEstagiario ? (
          <>
            {" "}
            Estagiário: única regra é o saldo de 30 dias por ciclo — períodos livres para ajuste.
          </>
        ) : (
          <>
            {" "}
            Períodos bloqueados (início em menos de {cfg.feriasAntecedenciaMinDias} dias) não podem
            ser alterados. A venda de dias da solicitação original permanece inalterada.
          </>
        )}
      </div>

      {!algumEditavel && !isEstagiario && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(122,30,38,0.05)",
            border: "1px solid rgba(122,30,38,0.15)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            color: "var(--ink-700)"
          }}
        >
          Nenhum período está elegível para alteração no momento (todos com menos de{" "}
          {cfg.feriasAntecedenciaMinDias} dias de antecedência).
        </div>
      )}

      {periodos.map((p, idx) => (
        <div
          key={idx}
          style={{
            padding: "12px 14px",
            background: p.bloqueado ? "var(--cream-100)" : "var(--cream-50)",
            borderRadius: "var(--radius-md)",
            border: `1px solid ${p.bloqueado ? "rgba(122,30,38,0.05)" : "rgba(122,30,38,0.10)"}`,
            opacity: p.bloqueado ? 0.65 : 1
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: p.bloqueado ? "var(--ink-400)" : "var(--burgundy-600)",
              margin: "0 0 10px"
            }}
          >
            {idx + 1}º Período{" "}
            {p.bloqueado
              ? "(bloqueado — menos de 30 dias)"
              : isEstagiario
                ? ""
                : `(mín. ${cfg.feriasMinimoOutrosPeriodos} dias)`}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto",
              gap: 10,
              alignItems: "flex-end"
            }}
          >
            <div>
              <label style={labelBase}>Início</label>
              <input
                type="date"
                style={p.bloqueado ? inputBloqueado : input}
                value={p.dataInicio}
                min={minDataStr}
                disabled={p.bloqueado}
                onChange={(e) => updPeriodo(idx, "dataInicio", e.target.value)}
              />
            </div>
            <div>
              <label style={labelBase}>Fim</label>
              <input
                type="date"
                style={p.bloqueado ? inputBloqueado : input}
                value={p.dataFim}
                min={p.dataInicio || minDataStr}
                disabled={p.bloqueado}
                onChange={(e) => updPeriodo(idx, "dataFim", e.target.value)}
              />
            </div>
            <div style={{ paddingBottom: 1 }}>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 16,
                  fontWeight: 700,
                  color:
                    p.dias > 0
                      ? p.bloqueado
                        ? "var(--ink-400)"
                        : "var(--green)"
                      : "var(--ink-400)",
                  margin: 0,
                  textAlign: "center",
                  minWidth: 52
                }}
              >
                {p.dias > 0 ? `${p.dias}d` : "—"}
              </p>
            </div>
          </div>
        </div>
      ))}

      {erros.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {erros.map((e, i) => (
            <p key={i} style={{ fontSize: 12.5, color: "var(--red)", margin: 0 }}>
              ⚠️ {e}
            </p>
          ))}
        </div>
      )}

      <div>
        <label style={labelBase}>Motivo da alteração</label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva o motivo da alteração (opcional)..."
        />
      </div>

      <button className="btn btn-primary" disabled={enviando || !podeEnviar} onClick={handleSubmit}>
        {enviando ? "Enviando…" : "Solicitar Alteração"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   FORMULÁRIO: ABONO (vários períodos + documento opcional)
══════════════════════════════════════════ */

interface LinhaAbono {
  dataInicio: string;
  dataFim: string;
  horaInicio: string;
  horaFim: string;
}

/** 00:00–23:59 = dia inteiro (padrão); outra faixa = abono parcial (só em período de 1 dia). */
const HORA_DIA_INICIO = "00:00";
const HORA_DIA_FIM = "23:59";
const linhaAbonoVazia = (): LinhaAbono => ({
  dataInicio: "",
  dataFim: "",
  horaInicio: HORA_DIA_INICIO,
  horaFim: HORA_DIA_FIM
});

function fimLinha(l: LinhaAbono) {
  return l.dataFim || l.dataInicio;
}
function linhaDiaUnico(l: LinhaAbono) {
  return !!l.dataInicio && fimLinha(l) === l.dataInicio;
}
function linhaParcial(l: LinhaAbono) {
  return linhaDiaUnico(l) && !(l.horaInicio === HORA_DIA_INICIO && l.horaFim === HORA_DIA_FIM);
}
const fmtDiaBr = (iso: string) => iso.split("-").reverse().join("/");

/** Mesmas regras do backend (utils/abono-periodos.ts → validarPeriodosAbono). */
function errosLinhasAbono(linhas: LinhaAbono[]): string[] {
  const erros: string[] = [];
  linhas.forEach((l, i) => {
    const n = i + 1;
    if (!l.dataInicio) {
      erros.push(`Período ${n}: informe a data inicial.`);
      return;
    }
    if (fimLinha(l) < l.dataInicio) erros.push(`Período ${n}: a data final é anterior à inicial.`);
    if (linhaParcial(l)) {
      if (!/^\d{2}:\d{2}$/.test(l.horaInicio) || !/^\d{2}:\d{2}$/.test(l.horaFim)) {
        erros.push(`Período ${n}: informe as horas no formato HH:MM.`);
      } else if (l.horaFim <= l.horaInicio) {
        erros.push(`Período ${n}: a hora final deve ser depois da inicial.`);
      }
    }
  });
  for (let i = 0; i < linhas.length; i++) {
    for (let j = i + 1; j < linhas.length; j++) {
      const a = linhas[i];
      const b = linhas[j];
      if (!a.dataInicio || !b.dataInicio) continue;
      if (a.dataInicio > fimLinha(b) || b.dataInicio > fimLinha(a)) continue;
      const semCruzar =
        linhaParcial(a) &&
        linhaParcial(b) &&
        (a.horaFim <= b.horaInicio || b.horaFim <= a.horaInicio);
      if (!semCruzar) {
        erros.push(`Os períodos ${i + 1} e ${j + 1} se sobrepõem (${fmtDiaBr(b.dataInicio)}).`);
      }
    }
  }
  return erros;
}

interface CreditoBancoRh {
  disponivelMinutos: number;
  temLiberacao: boolean;
  /** Config: pode pedir abono além do tempo liberado (o liberado é usado primeiro). */
  permitirAlemLimite?: boolean;
  liberacoes: Array<{ validaAte: string; disponivelMinutos: number }>;
}

const fmtHMCredito = (min: number) =>
  `${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}`;

function FormAbono({
  onSubmit,
  enviando
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const [linhas, setLinhas] = useState<LinhaAbono[]>([linhaAbonoVazia()]);
  const [descricao, setDescricao] = useState("");
  const [documentoBase64, setDocumentoBase64] = useState<string | null>(null);
  const [documentoMime, setDocumentoMime] = useState("application/pdf");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const telaEstreita = useIsMobile(480);

  /* Tempo de banco de horas liberado pelo RH (opcional): o abono consome esse crédito. */
  const [credito, setCredito] = useState<CreditoBancoRh | null>(null);
  const [usarCredito, setUsarCredito] = useState(false);
  const [simulacao, setSimulacao] = useState<{
    minutosTotal: number;
    disponivelMinutos: number;
    permitirAlemLimite?: boolean;
  } | null>(null);
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);
  /* Abono diário da cota do acordo coletivo (saldo de dias); separado do tempo liberado. */
  const [cota, setCota] = useState<CotaAbono | null>(null);
  const [usarCota, setUsarCota] = useState(false);

  const apiSol = useApiSolicitante();
  useEffect(() => {
    let ativo = true;
    apiSol
      .get<CreditoBancoRh>("/ponto/banco-horas/credito")
      .then((c) => {
        if (!ativo) return;
        setCredito(c);
        /* O tempo liberado pelo RH é prioritário: já vem marcado quando há saldo. */
        if (c.disponivelMinutos > 0) setUsarCredito(true);
      })
      .catch(() => ativo && setCredito(null));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line
  }, [apiSol.funcionarioId]);

  const erros = errosLinhasAbono(linhas);
  const preenchidas = linhas.every((l) => l.dataInicio);

  const chavePeriodos = JSON.stringify(
    linhas.map((l) => [
      l.dataInicio,
      fimLinha(l),
      linhaParcial(l) ? l.horaInicio : "",
      linhaParcial(l) ? l.horaFim : ""
    ])
  );
  useEffect(() => {
    if (usarCota || !usarCredito || !preenchidas || erros.length > 0) {
      setSimulacao(null);
      setErroSimulacao(null);
      return;
    }
    let ativo = true;
    const t = setTimeout(() => {
      apiSol
        .post<{
          minutosTotal: number;
          disponivelMinutos: number;
          permitirAlemLimite?: boolean;
        }>("/ponto/banco-horas/credito/simular", {
          periodos: linhas.map((l) => ({
            dataInicio: l.dataInicio,
            dataFim: fimLinha(l),
            horarioInicio: linhaParcial(l)
              ? normalizarHorarioParcial(l.horaInicio) || l.horaInicio
              : null,
            horarioFim: linhaParcial(l) ? normalizarHorarioParcial(l.horaFim) || l.horaFim : null
          }))
        })
        .then((r) => {
          if (!ativo) return;
          setSimulacao(r);
          setErroSimulacao(null);
        })
        .catch((e: Error) => {
          if (!ativo) return;
          setSimulacao(null);
          setErroSimulacao(e.message || "Não foi possível calcular o tempo do abono.");
        });
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [usarCredito, usarCota, chavePeriodos]);

  const permitirAlem = !!credito?.permitirAlemLimite;
  const creditoOk =
    !usarCredito ||
    (!!simulacao &&
      (permitirAlem ||
        (simulacao.minutosTotal > 0 && simulacao.minutosTotal <= simulacao.disponivelMinutos)));
  /* Cota: só dias inteiros, um dia por período, dentro do saldo. */
  const errosCota: string[] = [];
  if (usarCota) {
    if (linhas.some((l) => l.dataInicio && (fimLinha(l) !== l.dataInicio || linhaParcial(l)))) {
      errosCota.push("A cota é só de abono diário: cada período deve ser um único dia inteiro.");
    }
    if (cota && linhas.length > cota.saldo) {
      errosCota.push(
        `Você tem saldo de ${cota.saldo} dia(s) na cota; o pedido tem ${linhas.length}.`
      );
    }
  }
  /* Abono livre desligado e sem tempo liberado: não há como pedir abono (exceto pela cota). */
  const abonoBloqueado =
    !usarCota && !!credito && !credito.permitirAlemLimite && credito.disponivelMinutos <= 0;
  const podeEnviar =
    preenchidas &&
    erros.length === 0 &&
    errosCota.length === 0 &&
    !!descricao.trim() &&
    !enviando &&
    (usarCota || creditoOk) &&
    !abonoBloqueado;

  const atualizar = (idx: number, campos: Partial<LinhaAbono>) =>
    setLinhas((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const nova = { ...l, ...campos };
        /* Vários dias = sempre dia inteiro: volta as horas para 00:00–23:59. */
        if (nova.dataInicio && fimLinha(nova) !== nova.dataInicio) {
          nova.horaInicio = HORA_DIA_INICIO;
          nova.horaFim = HORA_DIA_FIM;
        }
        return nova;
      })
    );

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setDocumentoMime(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => setDocumentoBase64(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSubmit = () => {
    if (!podeEnviar) return;
    const inicios = linhas.map((l) => l.dataInicio).sort();
    const fins = linhas.map(fimLinha).sort();
    const primeiro = inicios[0];
    const ultimo = fins[fins.length - 1];
    onSubmit({
      tipo: "ABONO",
      dataReferencia: instanteCivilBrasilia(primeiro, "12:00:00").toISOString(),
      dataInicio: instanteCivilBrasilia(primeiro, "00:00:00").toISOString(),
      dataFim: instanteCivilBrasilia(ultimo, "23:59:59").toISOString(),
      descricao: descricao.trim(),
      metadados: {
        tipoAbono: primeiro < hojeBrasiliaISO() ? "PASSADO" : "FUTURO",
        periodos: linhas.map((l) => ({
          dataInicio: instanteCivilBrasilia(l.dataInicio, "00:00:00").toISOString(),
          dataFim: instanteCivilBrasilia(fimLinha(l), "23:59:59").toISOString(),
          horarioInicio: linhaParcial(l)
            ? normalizarHorarioParcial(l.horaInicio) || l.horaInicio
            : null,
          horarioFim: linhaParcial(l) ? normalizarHorarioParcial(l.horaFim) || l.horaFim : null
        })),
        ...(usarCota ? { usarCotaAbono: true } : usarCredito ? { usarCreditoBanco: true } : {}),
        ...(documentoBase64 ? { documentoBase64, documentoMime, nomeArquivo } : {})
      }
    });
  };

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box"
  };
  /* Campo compacto para caber data e hora na mesma linha. */
  const inputLinha: React.CSSProperties = { ...input, padding: "8px 6px", fontSize: 12.5 };
  const btnAtalho: React.CSSProperties = {
    padding: "3px 9px",
    borderRadius: 999,
    border: "1px solid rgba(122,30,38,0.18)",
    background: "#fff",
    color: "var(--ink-600)",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Caixa explicativa */}
      <div
        style={{
          padding: "12px 14px",
          background: "rgba(37,99,235,0.05)",
          border: "1px solid rgba(37,99,235,0.15)",
          borderRadius: "var(--radius-md)",
          fontSize: 12.5,
          color: "var(--ink-700)",
          lineHeight: 1.55
        }}
      >
        <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#1e40af" }}>
          ℹ️ Como funciona o abono
        </p>
        <ul
          style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}
        >
          <li>
            Pode ser pedido para <strong>datas passadas ou futuras</strong>.
          </li>
          <li>
            Cada linha é um período. Use <strong>+ Adicionar período</strong> para incluir outros
            dias ou horários <strong>na mesma solicitação</strong>.
          </li>
          <li>
            Hora <strong>00:00 a 23:59 = dia inteiro</strong>. Mude a hora só se o abono for{" "}
            <strong>parcial</strong> (ex.: 08:00 a 10:00).
          </li>
          <li>
            Horário parcial só vale em período de <strong>1 dia</strong>; um período de vários dias
            é sempre dia inteiro.
          </li>
          <li>
            O <strong>documento é opcional</strong> (imagem ou PDF), mas ajuda o chefe e o RH a
            analisar.
          </li>
          <li>
            O pedido passa pelo <strong>chefe</strong> e depois pelo <strong>RH</strong>. Só depois
            de aprovado o abono vale no ponto e no banco de horas.
          </li>
        </ul>
      </div>

      <CotaAbonoCard
        url={apiSol.url("/ponto/abono/cota")}
        onCarregou={setCota}
        recarregar={enviando ? 1 : 0}
      />
      {cota && cota.cotaDias > 0 && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            cursor: cota.saldo > 0 ? "pointer" : "not-allowed",
            opacity: cota.saldo > 0 ? 1 : 0.6
          }}
        >
          <input
            type="checkbox"
            checked={usarCota}
            disabled={cota.saldo <= 0}
            onChange={(e) => setUsarCota(e.target.checked)}
          />
          <strong>Pedir como abono diário do acordo coletivo</strong>
          <span style={{ color: "var(--ink-500)" }}>
            (desconta {linhas.length} dia(s) do saldo de {cota.saldo})
          </span>
        </label>
      )}
      {usarCota && errosCota.length > 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--red)",
            display: "flex",
            flexDirection: "column",
            gap: 2
          }}
        >
          {errosCota.map((e) => (
            <span key={e}>⚠ {e}</span>
          ))}
        </div>
      )}

      {abonoBloqueado && (
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(200,57,63,0.06)",
            border: "1px solid rgba(200,57,63,0.25)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            color: "var(--ink-700)",
            lineHeight: 1.55
          }}
        >
          <strong style={{ color: "var(--red)" }}>Abono livre desativado.</strong> Neste momento o
          abono só pode ser pedido com tempo de banco de horas liberado pelo RH, e você não tem
          tempo liberado disponível. Procure o RH.
        </div>
      )}

      {/* Tempo liberado pelo RH */}
      {!usarCota && credito && credito.disponivelMinutos > 0 && (
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(22,128,61,0.06)",
            border: "1px solid rgba(22,128,61,0.25)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            color: "var(--ink-700)",
            lineHeight: 1.55
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#166534" }}>
            ⏱ Tempo liberado pelo RH: {fmtHMCredito(credito.disponivelMinutos)} disponíveis
          </p>
          <p style={{ margin: "0 0 8px" }}>
            {credito.liberacoes
              .map((l) => `${fmtHMCredito(l.disponivelMinutos)} até ${fmtDiaBr(l.validaAte)}`)
              .join(" · ")}
            . O RH liberou este tempo do seu banco de horas para você usar como abono. O pedido
            segue o fluxo normal (chefe e RH); o tempo fica reservado até a decisão.{" "}
            {credito.permitirAlemLimite
              ? "O tempo liberado é usado primeiro; o que passar dele segue como abono comum."
              : "O abono só pode usar o tempo liberado, dentro do limite."}
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={usarCredito} disabled readOnly />
            <strong>Usar o tempo liberado pelo RH neste abono (prioritário)</strong>
          </label>
          {usarCredito && (
            <div style={{ marginTop: 8 }}>
              {!preenchidas || erros.length > 0 ? (
                <span style={{ color: "var(--ink-500)" }}>
                  Informe os períodos para calcular o tempo consumido.
                </span>
              ) : erroSimulacao ? (
                <span style={{ color: "var(--red)" }}>⚠ {erroSimulacao}</span>
              ) : simulacao ? (
                simulacao.minutosTotal <= 0 && !permitirAlem ? (
                  <span style={{ color: "var(--red)" }}>
                    ⚠ Os dias escolhidos não consomem tempo (fim de semana ou feriado). Escolha dias
                    úteis.
                  </span>
                ) : simulacao.minutosTotal > simulacao.disponivelMinutos && permitirAlem ? (
                  <span>
                    Este abono usa <strong>{fmtHMCredito(simulacao.disponivelMinutos)}</strong> do
                    tempo liberado e{" "}
                    <strong>
                      {fmtHMCredito(simulacao.minutosTotal - simulacao.disponivelMinutos)}
                    </strong>{" "}
                    como abono comum, além do limite liberado pelo RH.
                  </span>
                ) : simulacao.minutosTotal > simulacao.disponivelMinutos ? (
                  <span style={{ color: "var(--red)" }}>
                    ⚠ O abono consome {fmtHMCredito(simulacao.minutosTotal)}, mas só há{" "}
                    {fmtHMCredito(simulacao.disponivelMinutos)} disponíveis.
                  </span>
                ) : (
                  <span>
                    Este abono consome <strong>{fmtHMCredito(simulacao.minutosTotal)}</strong> do
                    tempo liberado; sobram{" "}
                    <strong>
                      {fmtHMCredito(simulacao.disponivelMinutos - simulacao.minutosTotal)}
                    </strong>
                    . Dia inteiro vale a sua jornada do dia; fim de semana e feriado não consomem.
                  </span>
                )
              ) : (
                <span style={{ color: "var(--ink-500)" }}>Calculando…</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Períodos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {linhas.map((l, i) => {
          const diaUnico = linhaDiaUnico(l);
          const variosDias = !!l.dataInicio && !diaUnico;
          return (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                border: "1px solid rgba(122,30,38,0.12)",
                borderRadius: "var(--radius-md)",
                background: "var(--cream-50)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8
                }}
              >
                <strong style={{ fontSize: 12.5, color: "var(--burgundy-600)" }}>
                  Período {i + 1}
                  <span style={{ fontWeight: 500, color: "var(--ink-500)" }}>
                    {" "}
                    ·{" "}
                    {!l.dataInicio
                      ? "informe as datas"
                      : linhaParcial(l)
                        ? `parcial ${l.horaInicio}–${l.horaFim}`
                        : variosDias
                          ? `${diffDias(l.dataInicio, fimLinha(l))} dias inteiros`
                          : "dia inteiro"}
                  </span>
                </strong>
                {linhas.length > 1 && (
                  <button
                    type="button"
                    title="Remover período"
                    aria-label={`Remover período ${i + 1}`}
                    onClick={() => setLinhas((prev) => prev.filter((_, k) => k !== i))}
                    style={{ ...btnAtalho, color: "var(--red)", padding: "2px 10px" }}
                  >
                    −
                  </button>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  /* Datas e horas na mesma linha; no celular estreito, 2 por linha. */
                  gridTemplateColumns: telaEstreita
                    ? "1fr 1fr"
                    : "minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 6
                }}
              >
                <div>
                  <label style={labelBase}>
                    Data inicial <span style={{ color: "var(--red)" }}>*</span>
                  </label>
                  <input
                    type="date"
                    style={inputLinha}
                    value={l.dataInicio}
                    onChange={(e) => atualizar(i, { dataInicio: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelBase}>Data final</label>
                  <input
                    type="date"
                    style={inputLinha}
                    value={l.dataFim}
                    min={l.dataInicio || undefined}
                    onChange={(e) => atualizar(i, { dataFim: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelBase}>Hora inicial</label>
                  <InputHorario
                    style={{ ...inputLinha, opacity: variosDias ? 0.6 : 1 }}
                    value={l.horaInicio}
                    disabled={variosDias}
                    onChange={(v) => atualizar(i, { horaInicio: v })}
                  />
                </div>
                <div>
                  <label style={labelBase}>Hora final</label>
                  <InputHorario
                    style={{ ...inputLinha, opacity: variosDias ? 0.6 : 1 }}
                    value={l.horaFim}
                    disabled={variosDias}
                    onChange={(v) => atualizar(i, { horaFim: v })}
                  />
                </div>
              </div>
              {diaUnico && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <button
                    type="button"
                    style={btnAtalho}
                    onClick={() =>
                      atualizar(i, { horaInicio: HORA_DIA_INICIO, horaFim: HORA_DIA_FIM })
                    }
                  >
                    Dia inteiro
                  </button>
                  <button
                    type="button"
                    style={btnAtalho}
                    onClick={() => atualizar(i, { horaInicio: "08:00", horaFim: "12:00" })}
                  >
                    ☀️ Matutino (08:00–12:00)
                  </button>
                  <button
                    type="button"
                    style={btnAtalho}
                    onClick={() => atualizar(i, { horaInicio: "13:00", horaFim: "18:00" })}
                  >
                    🌆 Vespertino (13:00–18:00)
                  </button>
                </div>
              )}
              {variosDias && (
                <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "6px 0 0" }}>
                  Períodos de mais de um dia são sempre dia inteiro.
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setLinhas((prev) => [...prev, linhaAbonoVazia()])}
        >
          + Adicionar período
        </button>
      </div>

      {preenchidas && erros.length > 0 && (
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

      {/* Documento (opcional) */}
      <div>
        <label style={labelBase}>Documento (opcional)</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            id="abono-arquivo"
            accept="image/*,application/pdf"
            style={{ display: "none" }}
            onChange={handleArquivo}
          />
          <label
            htmlFor="abono-arquivo"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              border: "1px solid rgba(122,30,38,0.22)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--burgundy-600)",
              background: "#fff"
            }}
          >
            📎 Anexar documento (imagem ou PDF)
          </label>
          {nomeArquivo && (
            <>
              <span style={{ fontSize: 12, color: "var(--ink-500)" }}>✓ {nomeArquivo}</span>
              <button
                type="button"
                style={{ ...btnAtalho, color: "var(--red)" }}
                onClick={() => {
                  setDocumentoBase64(null);
                  setNomeArquivo("");
                }}
              >
                Remover
              </button>
            </>
          )}
        </div>
        {documentoBase64 && documentoMime.startsWith("image/") && (
          <img
            src={documentoBase64}
            alt="Prévia do documento"
            style={{
              marginTop: 8,
              maxHeight: 160,
              objectFit: "contain",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(0,0,0,0.1)"
            }}
          />
        )}
      </div>

      <div>
        <label style={labelBase}>
          Descrição / Justificativa <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva o motivo..."
        />
      </div>
      <button className="btn btn-primary" disabled={!podeEnviar} onClick={handleSubmit}>
        {enviando ? "Enviando…" : "Enviar Solicitação"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   FORMULÁRIO: DAY OFF DE ANIVERSÁRIO
══════════════════════════════════════════ */

function FormDayOff({
  onSubmit,
  enviando
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const [perfil, setPerfil] = useState<{
    dataNascimento: string | null;
  } | null>(null);
  const [loadingPerfil, setLoadingPerfil] = useState(true);
  const [dataEscolhida, setDataEscolhida] = useState("");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    api
      .get<{ dataNascimento: string | null }>("/ponto/meu-perfil")
      .then((p) => setPerfil(p))
      .catch(() => setPerfil({ dataNascimento: null }))
      .finally(() => setLoadingPerfil(false));
  }, []);

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box"
  };

  if (loadingPerfil) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center", padding: "24px 0" }}>
        Carregando perfil…
      </p>
    );
  }

  if (!perfil?.dataNascimento) {
    return (
      <div
        style={{
          padding: "16px 18px",
          background: "rgba(198,127,0,0.06)",
          border: "1px solid rgba(198,127,0,0.30)",
          borderRadius: "var(--radius-md)",
          fontSize: 13,
          color: "#92400e",
          lineHeight: 1.6
        }}
      >
        <p style={{ margin: "0 0 6px", fontWeight: 700 }}>⚠️ Data de nascimento não cadastrada</p>
        <p style={{ margin: 0 }}>
          Para solicitar o Day Off de Aniversário, é necessário que o RH cadastre sua data de
          nascimento no sistema. Entre em contato com o setor de Recursos Humanos.
        </p>
      </div>
    );
  }

  const aniversario = new Date(perfil.dataNascimento);
  const mes = aniversario.getUTCMonth(); // 0-indexed
  const hoje = new Date();
  const mesHoje = hoje.getMonth(); // 0-indexed
  // Se o mês de aniversário já passou neste ano, usa o próximo ano
  const anoDayOff = mesHoje > mes ? hoje.getFullYear() + 1 : hoje.getFullYear();
  const ultimoDia = new Date(anoDayOff, mes + 1, 0).getDate();
  // Se for o mês atual, min = hoje; caso contrário, min = primeiro dia do mês
  const ehMesAtual = mesHoje === mes && anoDayOff === hoje.getFullYear();
  const minData = ehMesAtual
    ? hojeBrasiliaISO()
    : `${anoDayOff}-${String(mes + 1).padStart(2, "0")}-01`;
  const maxData = `${anoDayOff}-${String(mes + 1).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const nomeMes = aniversario.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

  const handleSubmit = () => {
    if (!dataEscolhida || !descricao) return;
    onSubmit({
      tipo: "DAY_OFF",
      dataReferencia: instanteCivilBrasilia(dataEscolhida, "12:00:00").toISOString(),
      dataInicio: instanteCivilBrasilia(dataEscolhida, "00:00:00").toISOString(),
      dataFim: instanteCivilBrasilia(dataEscolhida, "23:59:59").toISOString(),
      descricao,
      metadados: { mesAniversario: mes + 1 }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          padding: "12px 14px",
          background: "rgba(122,30,38,0.04)",
          border: "1px solid rgba(122,30,38,0.12)",
          borderRadius: "var(--radius-md)",
          fontSize: 12.5,
          color: "var(--ink-700)",
          lineHeight: 1.5
        }}
      >
        🎂 Seu mês de aniversário é <strong>{nomeMes}</strong>. Escolha qualquer dia útil desse mês
        para o seu day off.
      </div>

      <div>
        <label style={labelBase}>
          Dia do Day Off <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <input
          type="date"
          style={{ ...input, maxWidth: 200 }}
          value={dataEscolhida}
          min={minData}
          max={maxData}
          onChange={(e) => setDataEscolhida(e.target.value)}
        />
        <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "4px 0 0" }}>
          Permitido apenas em {nomeMes} de {anoDayOff}.
        </p>
      </div>

      <div>
        <label style={labelBase}>
          Descrição / Justificativa <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva como pretende usufruir do seu day off de aniversário..."
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={enviando || !dataEscolhida || !descricao}
        onClick={handleSubmit}
      >
        {enviando ? "Enviando…" : "Enviar Solicitação"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   FORM HORA EXTRA
══════════════════════════════════════════ */

function FormHoraExtra({
  onSubmit,
  enviando
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const hoje = hojeBrasiliaISO();
  /* Limite mínimo configurado (em minutos) — carregado da API; 120 enquanto carrega */
  const [limiteConfigMin, setLimiteMin] = useState<number>(120);
  const [cfgCarregada, setCfgCarregada] = useState(false);

  const [data, setData] = useState(hoje);
  const [horas, setHoras] = useState("");
  const [minutos, setMinutos] = useState("0");
  const [descricao, setDescricao] = useState("");
  /* Dia em home office / híbrido em casa: nenhuma HE entra sem aprovação,
     então qualquer tempo pode ser solicitado (o backend confere o mesmo). */
  const [diaRemoto, setDiaRemoto] = useState(false);

  useEffect(() => {
    if (!data) return;
    let ativo = true;
    /* Mesma apuração do banco de horas: local das batidas do dia (casa/CFO). */
    api
      .get<{ remoto: boolean }>(`/ponto/hora-extra/local-do-dia?data=${encodeURIComponent(data)}`)
      .then((r) => ativo && setDiaRemoto(!!r?.remoto))
      .catch(() => ativo && setDiaRemoto(false));
    return () => {
      ativo = false;
    };
  }, [data]);

  useEffect(() => {
    api
      .get<{ horaExtraLimiteAuto?: number }>("/ponto/config/sistema")
      .then((cfg) => {
        const lim = cfg?.horaExtraLimiteAuto ?? 120;
        setLimiteMin(lim);
        /* Inicializa o campo horas com o valor mínimo exigido */
        setHoras(String(Math.floor(lim / 60)));
        setMinutos(String(lim % 60));
      })
      .catch(() => {
        setHoras("2");
        setMinutos("0");
      })
      .finally(() => setCfgCarregada(true));
  }, []);

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-500)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    borderRadius: "var(--radius-md)",
    border: "1px solid rgba(122,30,38,0.14)",
    fontSize: 13.5,
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box"
  };

  const limiteMin = diaRemoto ? 1 : limiteConfigMin;
  const horasNum = Math.max(0, parseInt(horas) || 0);
  const minutosNum = Math.max(0, Math.min(59, parseInt(minutos) || 0));
  const totalMin = horasNum * 60 + minutosNum;

  const abaixoLimite = totalMin > 0 && totalMin < limiteMin;
  const limiteLabel = `${Math.floor(limiteMin / 60)}h${String(limiteMin % 60).padStart(2, "0")}`;

  const handleSubmit = () => {
    if (!data || !descricao.trim() || totalMin < limiteMin) return;
    onSubmit({
      tipo: "HORA_EXTRA",
      dataReferencia: instanteCivilBrasilia(data, "12:00:00").toISOString(),
      dataInicio: instanteCivilBrasilia(data, "00:00:00").toISOString(),
      dataFim: instanteCivilBrasilia(data, "23:59:59").toISOString(),
      descricao: descricao.trim(),
      metadados: { automatica: false, horasExtraMinutos: totalMin }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          padding: "12px 14px",
          background: "rgba(122,30,38,0.04)",
          border: "1px solid rgba(122,30,38,0.12)",
          borderRadius: "var(--radius-md)",
          fontSize: 12.5,
          color: "var(--ink-700)",
          lineHeight: 1.5
        }}
      >
        ⏱️ Use este formulário para solicitar <strong>antecipadamente</strong> horas extras ao seu
        chefe.{" "}
        {diaRemoto ? (
          <>
            Neste dia suas batidas não foram todas no CFO (<strong>home office/híbrido</strong>):
            conforme ACT, nenhuma hora extra entra no banco de horas sem aprovação, então qualquer
            tempo pode ser solicitado.
          </>
        ) : (
          <>
            O mínimo permitido é <strong>{cfgCarregada ? limiteLabel : "…"}</strong>, conforme
            configuração do sistema.
          </>
        )}
      </div>

      <div>
        <label style={labelBase}>
          Data da Hora Extra <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <input
          type="date"
          style={{ ...input, maxWidth: 200 }}
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </div>

      <div>
        <label style={labelBase}>
          Tempo Extra Estimado <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number"
              min={0}
              max={12}
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              style={{
                ...input,
                width: 72,
                fontFamily: "var(--font-mono)",
                borderColor: abaixoLimite ? "var(--red)" : "rgba(122,30,38,0.14)"
              }}
            />
            <span style={{ fontSize: 13, color: "var(--ink-500)" }}>h</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number"
              min={0}
              max={59}
              value={minutos}
              onChange={(e) => setMinutos(e.target.value)}
              style={{
                ...input,
                width: 72,
                fontFamily: "var(--font-mono)",
                borderColor: abaixoLimite ? "var(--red)" : "rgba(122,30,38,0.14)"
              }}
            />
            <span style={{ fontSize: 13, color: "var(--ink-500)" }}>min</span>
          </div>
        </div>

        {/* Feedback dinâmico */}
        {totalMin > 0 && !abaixoLimite && (
          <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 4 }}>
            Total:{" "}
            <strong>
              {horasNum}h{String(minutosNum).padStart(2, "0")}
            </strong>
          </p>
        )}
        {abaixoLimite && (
          <p
            style={{
              fontSize: 12,
              color: "var(--red)",
              marginTop: 5,
              display: "flex",
              alignItems: "center",
              gap: 5
            }}
          >
            ⚠️ O mínimo para solicitação de hora extra é <strong>{limiteLabel}</strong>. Informe um
            tempo igual ou superior.
          </p>
        )}
      </div>

      <div>
        <label style={labelBase}>
          Motivo / Justificativa <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva o motivo da hora extra solicitada…"
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={enviando || !data || !descricao.trim() || totalMin < limiteMin}
        onClick={handleSubmit}
      >
        {enviando ? "Enviando…" : "Enviar Solicitação"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   FORM ENVIO DE DOCUMENTO AO RH
══════════════════════════════════════════ */

function FormEnvioDocumentoRh({
  onSubmit,
  enviando
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const [descricao, setDescricao] = useState("");
  const [documentoBase64, setDocumentoBase64] = useState<string | null>(null);
  const [documentoMime, setDocumentoMime] = useState("application/pdf");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [erroLocal, setErroLocal] = useState("");

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box"
  };

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setDocumentoMime(file.type || "application/octet-stream");
    setErroLocal("");
    const reader = new FileReader();
    reader.onload = (ev) => setDocumentoBase64(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!descricao.trim() || descricao.trim().length < 3) {
      setErroLocal("Informe uma descrição com pelo menos 3 caracteres.");
      return;
    }
    if (!documentoBase64) {
      setErroLocal("Selecione um arquivo (imagem ou PDF).");
      return;
    }
    const agora = new Date();
    onSubmit({
      tipo: "ENVIO_DOCUMENTO_RH",
      dataReferencia: agora.toISOString(),
      descricao: descricao.trim(),
      metadados: {
        documentoBase64,
        documentoMime,
        nomeArquivo: nomeArquivo || undefined
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0, lineHeight: 1.5 }}>
        Envie documentos ao setor de RH com uma breve descrição (comprovantes, declarações, etc.). A
        solicitação vai direto para análise do RH.
      </p>

      <div>
        <label style={labelBase}>
          Descrição do documento <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => {
            setDescricao(e.target.value);
            setErroLocal("");
          }}
          placeholder="Descreva o documento que está enviando…"
        />
      </div>

      <div>
        <label style={labelBase}>
          Arquivo (imagem ou PDF) <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: "1.5px dashed rgba(122,30,38,0.22)",
            background: "rgba(122,30,38,0.03)",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--ink-700)"
          }}
        >
          <span style={{ fontSize: 18 }}>📎</span>
          <span
            style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {nomeArquivo || "Selecionar arquivo…"}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            style={{ display: "none" }}
            onChange={handleArquivo}
          />
        </label>
      </div>

      {erroLocal && <p style={{ fontSize: 12, color: "var(--red)", margin: 0 }}>⚠️ {erroLocal}</p>}

      <button
        className="btn btn-primary"
        disabled={enviando || !descricao.trim() || !documentoBase64}
        onClick={handleSubmit}
      >
        {enviando ? "Enviando…" : "Enviar ao RH"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════
   MODAL ALTERAÇÃO DE FÉRIAS
══════════════════════════════════════════ */

function AlterarFeriasModal({
  solicitacao,
  onClose,
  onCriada
}: {
  solicitacao: Solicitacao;
  onClose: () => void;
  onCriada: (s: Solicitacao) => void;
}) {
  const [config, setConfig] = useState<ConfigSolicitacoes | null>(null);
  const [isEstagiario, setIsEstagiario] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .get<ConfigSolicitacoes>("/ponto/config/solicitacoes")
      .then((c) => {
        if (c) setConfig(c);
      })
      .catch(() => {});
    api
      .get<{ isEstagiario?: boolean }>("/ponto/ferias/saldo")
      .then((s) => setIsEstagiario(!!s?.isEstagiario))
      .catch(() => {});
  }, []);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setEnviando(true);
    setErro("");
    try {
      const nova = await api.post<Solicitacao>("/ponto/solicitacoes", data);
      onCriada(nova);
      setOk(true);
      setTimeout(onClose, 1600);
    } catch (e: unknown) {
      setErro((e as Error).message ?? "Falha ao enviar solicitação.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,5,6,0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflow: "hidden"
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 560,
          maxHeight: "calc(100dvh - 32px)",
          boxShadow: "0 24px 64px -16px rgba(10,5,6,0.30)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {ok ? (
          <div style={{ textAlign: "center", padding: "52px 28px" }}>
            <CheckCircleIcon size={40} style={{ color: "var(--green)", margin: "0 auto 12px" }} />
            <p style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>Alteração enviada!</p>
            <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Aguardando análise do chefe.</p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 28px 16px",
                borderBottom: "1px solid rgba(122,30,38,0.08)",
                flexShrink: 0
              }}
            >
              <h2 style={{ fontSize: 19, fontFamily: "var(--font-display)", margin: 0 }}>
                ✏️ Solicitar Mudança de Férias
              </h2>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  color: "var(--ink-500)"
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                padding: "16px 28px 28px",
                overflowY: "auto",
                flex: 1,
                minHeight: 0,
                WebkitOverflowScrolling: "touch"
              }}
            >
              {erro && (
                <p style={{ fontSize: 12.5, color: "var(--red)", marginBottom: 12 }}>⚠️ {erro}</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <ResumoSolicitacaoFeriasOriginal solicitacao={solicitacao} />
                <FormFeriasAlteracao
                  solicitacaoOriginal={solicitacao}
                  config={config}
                  onSubmit={handleSubmit}
                  enviando={enviando}
                  isEstagiario={isEstagiario}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MODAL NOVA SOLICITAÇÃO
══════════════════════════════════════════ */

export function NovaModal({
  onClose,
  onCriada,
  solicitacoesFerias = [],
  rhFuncionario
}: {
  onClose: () => void;
  onCriada: (s: Solicitacao) => void;
  solicitacoesFerias?: Solicitacao[];
  /** Modo RH: abre a solicitação em nome deste funcionário (mesmo fluxo; fica marcada). */
  rhFuncionario?: { id: string; nome: string };
}) {
  const [tipo, setTipo] = useState<TipoSolicitacao | null>(null);
  const [dispensar, setDispensar] = useState(false);
  const [justDispensa, setJustDispensa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState("");
  const [config, setConfig] = useState<ConfigSolicitacoes | null>(null);

  useEffect(() => {
    api
      .get<ConfigSolicitacoes>("/ponto/config/solicitacoes")
      .then((c) => {
        if (c) setConfig(c);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setEnviando(true);
    setErro("");
    try {
      if (rhFuncionario && dispensar && justDispensa.trim().length < 10) {
        throw new Error("Informe a justificativa da dispensa (mínimo de 10 caracteres).");
      }
      const nova = rhFuncionario
        ? await api.post<Solicitacao>(
            `/auditoria/rh/funcionarios/${rhFuncionario.id}/solicitacoes`,
            {
              ...data,
              rh: { dispensarPrazos: dispensar, justificativa: justDispensa.trim() }
            }
          )
        : await api.post<Solicitacao>("/ponto/solicitacoes", data);
      onCriada(nova);
      setOk(true);
      setTimeout(onClose, 1600);
    } catch (e: unknown) {
      setErro((e as Error).message ?? "Falha ao enviar solicitação.");
    } finally {
      setEnviando(false);
    }
  };

  const tituloModal =
    tipo === "FERIAS"
      ? solicitacoesFerias.some((s) => s.status === "APROVADA")
        ? `${TIPO_EMOJI.FERIAS} Férias / Mudança`
        : `${TIPO_EMOJI.FERIAS} Férias`
      : tipo
        ? `${TIPO_EMOJI[tipo]} ${TIPO_LABEL[tipo]}`
        : "Nova Solicitação";

  return (
    <SolicitanteProvider funcionarioId={rhFuncionario?.id}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,5,6,0.55)",
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          overflow: "hidden"
        }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-xl)",
            width: "100%",
            maxWidth: rhFuncionario ? 760 : 560,
            maxHeight: "calc(100dvh - 32px)",
            boxShadow: "0 24px 64px -16px rgba(10,5,6,0.30)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          {ok ? (
            <div style={{ textAlign: "center", padding: "52px 28px" }}>
              <CheckCircleIcon size={40} style={{ color: "var(--green)", margin: "0 auto 12px" }} />
              <p style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>
                Solicitação enviada!
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-500)" }}>
                {rhFuncionario
                  ? `Aberta pelo RH em nome de ${rhFuncionario.nome}. O funcionário e o chefe foram avisados.`
                  : tipo === "ENVIO_DOCUMENTO_RH"
                    ? "Documento encaminhado ao RH para análise."
                    : "Aguardando análise do chefe."}
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "20px 28px 16px",
                  borderBottom: "1px solid rgba(122,30,38,0.08)",
                  flexShrink: 0
                }}
              >
                <div>
                  {tipo && (
                    <button
                      onClick={() => setTipo(null)}
                      style={{
                        fontSize: 12,
                        color: "var(--ink-500)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        marginBottom: 4
                      }}
                    >
                      ← Voltar
                    </button>
                  )}
                  <h2 style={{ fontSize: 19, fontFamily: "var(--font-display)", margin: 0 }}>
                    {tituloModal}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 20,
                    color: "var(--ink-500)"
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  padding: "16px 28px 28px",
                  overflowY: "auto",
                  flex: 1,
                  minHeight: 0,
                  WebkitOverflowScrolling: "touch"
                }}
              >
                {erro && (
                  <p style={{ fontSize: 12.5, color: "var(--red)", marginBottom: 12 }}>⚠️ {erro}</p>
                )}

                {rhFuncionario && (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: "10px 12px",
                      border: "1px solid rgba(122,30,38,0.25)",
                      background: "rgba(122,30,38,0.04)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12.5,
                      lineHeight: 1.5
                    }}
                  >
                    <strong style={{ color: "var(--burgundy-600)" }}>
                      🏢 Solicitação aberta pelo RH em nome de {rhFuncionario.nome}
                    </strong>
                    <p style={{ margin: "4px 0 6px", color: "var(--ink-600)" }}>
                      Segue o mesmo fluxo do funcionário (chefe → RH) e fica marcada como feita pelo
                      RH. Férias: use a aba Férias. Correção de ponto: use o Histórico.
                    </p>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={dispensar}
                        onChange={(e) => setDispensar(e.target.checked)}
                      />
                      <span>Dispensar prazos e regras de antecedência (exige justificativa)</span>
                    </label>
                    {dispensar && (
                      <textarea
                        rows={2}
                        value={justDispensa}
                        onChange={(e) => setJustDispensa(e.target.value)}
                        placeholder="Justificativa da dispensa (mín. 10 caracteres)"
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          marginTop: 6,
                          padding: "7px 10px",
                          border: "1px solid rgba(122,30,38,0.2)",
                          borderRadius: "var(--radius-md)",
                          fontFamily: "inherit",
                          fontSize: 13
                        }}
                      />
                    )}
                  </div>
                )}
                {!tipo && (
                  <TipoSeletor
                    onSelect={setTipo}
                    config={config}
                    excluir={rhFuncionario ? ["FERIAS", "CORRECAO_PONTO"] : undefined}
                  />
                )}
                {tipo === "CORRECAO_PONTO" && (
                  <FormCorrecaoPonto onSubmit={handleSubmit} enviando={enviando} />
                )}
                {tipo === "ATESTADO" && (
                  <FormAtestado config={config} onSubmit={handleSubmit} enviando={enviando} />
                )}
                {tipo === "FERIAS" && (
                  <FormFerias
                    config={config}
                    onSubmit={handleSubmit}
                    enviando={enviando}
                    solicitacoesFerias={solicitacoesFerias}
                  />
                )}
                {tipo === "LICENCA" && <FormLicenca onSubmit={handleSubmit} enviando={enviando} />}
                {tipo === "ABONO" && <FormAbono onSubmit={handleSubmit} enviando={enviando} />}
                {tipo === "DAY_OFF" && <FormDayOff onSubmit={handleSubmit} enviando={enviando} />}
                {tipo === "HORA_EXTRA" && (
                  <FormHoraExtra onSubmit={handleSubmit} enviando={enviando} />
                )}
                {tipo === "ENVIO_DOCUMENTO_RH" && (
                  <FormEnvioDocumentoRh onSubmit={handleSubmit} enviando={enviando} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </SolicitanteProvider>
  );
}

/* ══════════════════════════════════════════
   CARD DE SOLICITAÇÃO (listagem)
══════════════════════════════════════════ */

function AtestadoGuiaSection({
  s,
  onAtualizado,
  tipo = "ATESTADO"
}: {
  s: Solicitacao;
  onAtualizado: () => void;
  tipo?: "ATESTADO" | "FERIAS";
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const isFerias = tipo === "FERIAS";
  const cor = isFerias ? "#2f7d4f" : "#7c3aed";
  const corBg = isFerias ? "rgba(47,125,79,0.05)" : "rgba(124,58,237,0.05)";
  const corBorder = isFerias ? "rgba(47,125,79,0.18)" : "rgba(124,58,237,0.18)";
  const corBorderUpload = isFerias ? "rgba(47,125,79,0.35)" : "rgba(124,58,237,0.35)";

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mimeType = file.type;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setEnviando(true);
      setErro("");
      try {
        await api.patch(`/ponto/solicitacoes/${s.id}/documento-retorno`, {
          documentoBase64: base64,
          mimeType
        });
        onAtualizado();
      } catch (err) {
        setErro((err as Error).message || "Erro ao enviar documento. Tente novamente.");
      } finally {
        setEnviando(false);
      }
    };
    reader.readAsDataURL(file);
  };

  /* Férias com Aviso/Recibo do RH: assinatura pelo sistema (sem upload de retorno). */
  if (isFerias && Array.isArray(s.metadados?.documentosFerias)) {
    return (
      <>
        <AssinarDocumentosFerias solicitacao={s} onAssinado={onAtualizado} />
        <AssinarRodadasFerias solicitacao={s} onAssinado={onAtualizado} />
      </>
    );
  }
  if (isFerias && s.status === "APROVADA" && s.metadados?.rodadasFerias) {
    return <AssinarRodadasFerias solicitacao={s} onAssinado={onAtualizado} />;
  }

  if (!s.guiaMedicoUrl && !s.documentoRetornoUrl) return null;

  const podeEnviarOuEditarRetorno =
    s.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO" ||
    (s.status === "AGUARDANDO_RH" && !!s.documentoRetornoUrl);

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {s.guiaMedicoUrl && (
        <div
          style={{
            padding: "10px 12px",
            background: corBg,
            border: `1px solid ${corBorder}`,
            borderRadius: "var(--radius-md)"
          }}
        >
          <p style={{ margin: 0, fontSize: 12.5, color: cor, lineHeight: 1.5 }}>
            📄{" "}
            <strong>
              {isFerias
                ? "O RH enviou os documentos das suas férias"
                : "O RH enviou sua guia médica"}
            </strong>
            {s.guiaMedicoEnviadaEm ? ` em ${fmtDateTime(s.guiaMedicoEnviadaEm)}` : ""}.
          </p>
          {s.guiaMedicoObservacao && (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12,
                color: "var(--ink-600)",
                fontStyle: "italic"
              }}
            >
              "{s.guiaMedicoObservacao}"
            </p>
          )}
          {s.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO" && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: cor, lineHeight: 1.5 }}>
              {isFerias
                ? "Baixe os documentos, assine e envie o documento assinado de volta pelo sistema para que o RH possa concluir a aprovação."
                : "Vá à consulta com o médico do trabalho e envie aqui o documento de retorno (resultado/aptidão) para que o RH possa concluir a análise."}
            </p>
          )}
          {s.status === "AGUARDANDO_RH" && s.documentoRetornoUrl && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: cor, lineHeight: 1.5 }}>
              {isFerias
                ? "Encontrou um erro na folha assinada enviada? Você pode substituí-la enquanto o RH ainda não concluir a aprovação."
                : "Encontrou um erro no documento de retorno enviado? Você pode substituí-lo enquanto o RH ainda não concluir a análise."}
            </p>
          )}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center"
            }}
          >
            {isFerias ? (
              <LinksDocumentosFerias
                meta={s.metadados}
                guiaMedicoUrl={s.guiaMedicoUrl}
                style={{ marginTop: 0 }}
              />
            ) : (
              <LinkDocumentoAnexado
                href={s.guiaMedicoUrl}
                label="Ver documento — Guia médica"
                variant="guia"
                style={{ marginTop: 0 }}
              />
            )}
            {podeEnviarOuEditarRetorno && (
              <>
                <input
                  type="file"
                  id={`retorno-upload-${s.id}`}
                  accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={handleArquivo}
                  disabled={enviando}
                />
                <label
                  htmlFor={`retorno-upload-${s.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    border: `1px solid ${corBorderUpload}`,
                    borderRadius: "var(--radius-md)",
                    background: "#fff",
                    color: cor,
                    cursor: enviando ? "not-allowed" : "pointer",
                    fontSize: 12.5,
                    fontWeight: 600
                  }}
                >
                  {enviando
                    ? "⏳ Enviando..."
                    : s.documentoRetornoUrl
                      ? isFerias
                        ? "✏️ Substituir folha assinada"
                        : "✏️ Substituir documento de retorno"
                      : isFerias
                        ? "📎 Enviar folha assinada"
                        : "📎 Enviar documento de retorno"}
                </label>
              </>
            )}
          </div>
          {erro && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--red)" }}>⚠️ {erro}</p>
          )}
        </div>
      )}

      {s.documentoRetornoUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <LinkDocumentoAnexado
            href={s.documentoRetornoUrl}
            label={
              isFerias
                ? "Ver documento — Folha de férias assinada enviada"
                : "Ver documento — Documento de retorno enviado"
            }
            variant="retorno"
            style={{ marginTop: 0 }}
          />
          {s.documentoRetornoEm && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-500)" }}>
              Enviado em {fmtDateTime(s.documentoRetornoEm)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   SEÇÃO: DOCUMENTO ANEXADO À SOLICITAÇÃO
   (editável pelo funcionário até a decisão final do RH)
══════════════════════════════════════════ */

function DocumentoAnexadoSection({
  s,
  onAtualizado
}: {
  s: Solicitacao;
  onAtualizado: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const documentoUrl = s.metadados?.documentoUrl as string | undefined;
  if (!documentoUrl) return null;

  const editavel = !STATUS_FINALIZADOS.includes(s.status);

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mimeType = file.type;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setEnviando(true);
      setErro("");
      try {
        await api.patch(`/ponto/solicitacoes/${s.id}/documento`, {
          documentoBase64: base64,
          mimeType
        });
        onAtualizado();
      } catch (err) {
        setErro((err as Error).message || "Erro ao atualizar documento. Tente novamente.");
      } finally {
        setEnviando(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <LinkDocumentoAnexado
          href={documentoUrl}
          nomeArquivo={
            typeof s.metadados?.nomeArquivo === "string" ? s.metadados.nomeArquivo : null
          }
          variant="funcionario"
          style={{ marginTop: 0 }}
        />
        {editavel && (
          <>
            <input
              type="file"
              id={`documento-edit-${s.id}`}
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={handleArquivo}
              disabled={enviando}
            />
            <label
              htmlFor={`documento-edit-${s.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                border: "1px solid rgba(124,58,237,0.35)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                color: "#7c3aed",
                cursor: enviando ? "not-allowed" : "pointer",
                fontSize: 11.5,
                fontWeight: 600
              }}
            >
              {enviando ? "⏳ Enviando..." : "✏️ Substituir documento"}
            </label>
          </>
        )}
      </div>
      {editavel && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)" }}>
          Errou o anexo? Você pode substituí-lo até que o RH conclua a análise.
        </p>
      )}
      {erro && <p style={{ margin: 0, fontSize: 11.5, color: "var(--red)" }}>⚠️ {erro}</p>}
    </div>
  );
}

function SolicitacaoCard({
  s,
  onAtualizado,
  onAlterar,
  antecedenciaFeriasDias = 30
}: {
  s: Solicitacao;
  onAtualizado: () => void;
  onAlterar?: (s: Solicitacao) => void;
  /** Antecedência mínima configurada: só períodos que começam depois dela podem mudar. */
  antecedenciaFeriasDias?: number;
}) {
  const borderColor =
    {
      APROVADA: "var(--green)",
      REJEITADA: "var(--red)",
      REJEITADA_GESTOR: "var(--red)",
      REJEITADA_RH: "var(--red)",
      AGUARDANDO_RH: "#2563eb",
      AGUARDANDO_DOCUMENTO_FUNCIONARIO: "var(--amber)",
      PENDENTE: "var(--amber)",
      CANCELADA: "var(--ink-300)"
    }[s.status] ?? "var(--amber)";

  const meta = s.metadados;
  const tipo = s.tipo as TipoSolicitacao;
  const isCorrecaoPonto = tipo === "CORRECAO_PONTO";

  let subInfo: React.ReactNode = null;
  if (isCorrecaoPonto && meta) {
    subInfo = (
      <span>
        Dia {fmtDate(s.dataReferencia)} · aberta em {fmtDateTime(s.createdAt)}
      </span>
    );
  } else if (tipo === "DAY_OFF") {
    const dia = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
    subInfo = <span>Dia: {dia}</span>;
  } else if (tipo === "HORA_EXTRA") {
    const dia = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
    const minExtra = meta?.horasExtraMinutos as number | undefined;
    const isAuto = meta?.automatica === true;
    const tempoStr = minExtra
      ? `${Math.floor(minExtra / 60)}h${String(minExtra % 60).padStart(2, "0")}`
      : null;
    subInfo = (
      <span>
        Dia: {dia}
        {tempoStr ? ` · ${tempoStr} extras` : ""}
        {isAuto ? " · gerada automaticamente" : ""}
      </span>
    );
  } else if (tipo === "ENVIO_DOCUMENTO_RH") {
    subInfo = (
      <span>
        Enviado em {fmtDateTime(s.createdAt)}
        {meta?.documentoUrl ? " · 📎 doc. anexado" : ""}
        {typeof meta?.nomeArquivo === "string" ? ` · ${meta.nomeArquivo}` : ""}
      </span>
    );
  } else if (
    (tipo === "ATESTADO" || tipo === "FERIAS" || tipo === "LICENCA" || tipo === "ABONO") &&
    s.dataInicio
  ) {
    const horarioPeriodo =
      (tipo === "ATESTADO" || tipo === "ABONO" || tipo === "LICENCA") &&
      typeof meta?.horarioInicio === "string" &&
      typeof meta?.horarioFim === "string" &&
      meta.horarioInicio &&
      meta.horarioFim
        ? ` · ${meta.horarioInicio}–${meta.horarioFim}`
        : "";
    subInfo = (
      <span>
        Período: {fmtDate(s.dataInicio)}
        {s.dataFim && s.dataFim !== s.dataInicio ? ` → ${fmtDate(s.dataFim)}` : ""}
        {horarioPeriodo}
      </span>
    );
    if (tipo === "FERIAS" && (meta?.diasVendidos || meta?.diasVenda)) {
      const dv = Number(meta?.diasVendidos ?? meta?.diasVenda ?? 0);
      if (dv > 0)
        subInfo = (
          <>
            {subInfo} · Vender {dv} dias
          </>
        );
    }
    if (tipo === "ABONO" && Array.isArray(meta?.periodos) && meta.periodos.length > 1) {
      subInfo = (
        <>
          {subInfo} · {meta.periodos.length} períodos
        </>
      );
    }
    if ((tipo === "ATESTADO" || tipo === "ABONO" || tipo === "LICENCA") && meta?.documentoUrl) {
      subInfo = <>{subInfo} · 📎 doc. anexado</>;
    }
  }

  const statusInfo = isCorrecaoPonto ? mensagemStatusCorrecaoPonto(s.status) : "";
  const statusInfoCor =
    s.status === "APROVADA"
      ? "#065f46"
      : s.status === "PENDENTE" || s.status === "AGUARDANDO_RH"
        ? "#1e40af"
        : s.status.startsWith("REJEITADA") || s.status === "REJEITADA"
          ? "#991b1b"
          : "var(--ink-600)";
  const statusInfoBg =
    s.status === "APROVADA"
      ? "rgba(22,163,74,0.08)"
      : s.status === "PENDENTE" || s.status === "AGUARDANDO_RH"
        ? "rgba(37,99,235,0.06)"
        : s.status.startsWith("REJEITADA") || s.status === "REJEITADA"
          ? "rgba(220,38,38,0.06)"
          : "var(--cream-50)";

  return (
    <div className="card-flat" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: isCorrecaoPonto ? 12 : 8
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{TIPO_EMOJI[tipo] ?? "📋"}</span>
          <div>
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ink-900)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              {TIPO_LABEL[tipo] ?? tipo}
              {s.apenasInformativo && (
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
            </p>
            <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "2px 0 0" }}>
              {subInfo ?? `Ref: ${fmtDate(s.dataReferencia)}`}{" "}
              {!isCorrecaoPonto && `· Aberta ${fmtDate(s.createdAt)}`}
            </p>
          </div>
        </div>
        <StatusBadge status={s.status} />
      </div>

      {s.apenasInformativo && (
        <p
          style={{
            fontSize: 11.5,
            color: "#1e40af",
            lineHeight: 1.45,
            margin: "0 0 10px",
            padding: "8px 10px",
            background: "rgba(37,99,235,0.06)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(37,99,235,0.18)",
            display: "flex",
            alignItems: "flex-start",
            gap: 6
          }}
        >
          <InfoIcon size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{MSG_SOLICITACAO_APENAS_INFORMATIVA}</span>
        </p>
      )}

      {isCorrecaoPonto ? (
        <>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--ink-800)",
              lineHeight: 1.55,
              margin: "0 0 10px",
              fontWeight: 500
            }}
          >
            <TextoComSetaHorario texto={textoCorrecaoPontoFuncionario(s)} />
          </p>
          {statusInfo && (
            <p
              style={{
                fontSize: 12.5,
                color: statusInfoCor,
                lineHeight: 1.5,
                margin: "0 0 10px",
                padding: "9px 12px",
                background: statusInfoBg,
                borderRadius: "var(--radius-md)",
                border: `1px solid ${statusInfoCor}22`
              }}
            >
              {statusInfo}
            </p>
          )}
          {s.descricao && (
            <p style={{ fontSize: 12.5, color: "var(--ink-600)", lineHeight: 1.5, margin: 0 }}>
              <span style={{ fontWeight: 600, color: "var(--ink-700)" }}>Sua justificativa: </span>
              {s.descricao}
            </p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.6, margin: 0 }}>
          {s.descricao}
        </p>
      )}

      {tipo === "ATESTADO" && <DocumentoAnexadoSection s={s} onAtualizado={onAtualizado} />}
      {tipo === "ENVIO_DOCUMENTO_RH" && (
        <DocumentoAnexadoSection s={s} onAtualizado={onAtualizado} />
      )}

      {tipo === "ATESTADO" && <AtestadoGuiaSection s={s} onAtualizado={onAtualizado} />}

      {tipo === "FERIAS" && <FeriasDetalheBlock meta={s.metadados} />}
      {["ABONO", "LICENCA", "ATESTADO", "DAY_OFF", "HORA_EXTRA", "ENVIO_DOCUMENTO_RH"].includes(
        tipo
      ) && <AbonoDetalheBlock meta={s.metadados} />}
      {tipo === "CORRECAO_PONTO" && <AvisoInterjornadaBlock meta={s.metadados} />}

      {tipo === "FERIAS" && <AtestadoGuiaSection s={s} onAtualizado={onAtualizado} tipo="FERIAS" />}

      {tipo === "FERIAS" &&
        s.status === "APROVADA" &&
        onAlterar &&
        (() => {
          const periodos =
            (s.metadados?.periodos as Array<{ dataInicio: string }> | undefined) ?? [];
          const minAlteracao = somarDiasCivil(hojeBrasiliaISO(), antecedenciaFeriasDias);
          const temPeriodoAlteravel = periodos.some(
            (p) => dataCivilPeriodo(p.dataInicio) > minAlteracao
          );
          if (!temPeriodoAlteravel) return null;
          return (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => onAlterar(s)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#1e40af",
                  background: "rgba(37,99,235,0.06)",
                  border: "1px solid rgba(37,99,235,0.20)",
                  borderRadius: "var(--radius-md)",
                  padding: "6px 12px",
                  cursor: "pointer"
                }}
              >
                ✏️ Solicitar Mudança
              </button>
            </div>
          );
        })()}

      {(s.gestorResolvidoEm ||
        s.status === "AGUARDANDO_RH" ||
        s.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO" ||
        s.status === "APROVADA" ||
        s.status === "REJEITADA_RH" ||
        s.status === "REJEITADA_GESTOR") &&
        s.tipo !== "ENVIO_DOCUMENTO_RH" && (
          <LogTimelineGestor
            s={{
              id: s.id,
              tipo: s.tipo,
              status: s.status,
              dataReferencia: s.dataReferencia,
              dataInicio: s.dataInicio,
              dataFim: s.dataFim,
              descricao: s.descricao,
              metadados: s.metadados,
              createdAt: s.createdAt,
              gestorObservacao: s.gestorObservacao,
              gestorResolvidoEm: s.gestorResolvidoEm,
              gestorUser: s.gestorUser,
              rhObservacao: s.rhObservacao,
              rhResolvidoEm: s.rhResolvidoEm,
              funcionario: {
                user: { name: "" }
              }
            }}
          />
        )}

      {(s.gestorObservacao || s.rhObservacao || s.observacaoGestor) && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "var(--cream-50)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-400)"
            }}
          >
            Retorno da análise
          </p>
          {s.gestorObservacao && (
            <p style={{ fontSize: 12, color: "#1e40af", margin: "0 0 4px", lineHeight: 1.45 }}>
              <strong>Chefe:</strong> {s.gestorObservacao}
            </p>
          )}
          {s.rhObservacao && (
            <p style={{ fontSize: 12, color: "#065f46", margin: 0, lineHeight: 1.45 }}>
              <strong>RH:</strong> {s.rhObservacao}
            </p>
          )}
          {!s.gestorObservacao && s.observacaoGestor && (
            <p style={{ fontSize: 12, color: "var(--ink-600)", margin: 0, lineHeight: 1.45 }}>
              <strong>Observação:</strong> {s.observacaoGestor}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════ */

const POR_PAGINA = 6;

export function SolicitacoesPage() {
  const { token } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [alterandoFerias, setAlterandoFerias] = useState<Solicitacao | null>(null);
  /* Antecedência de férias configurada (mesma usada no formulário de alteração). */
  const [antecedenciaFeriasDias, setAntecedenciaFeriasDias] = useState(30);
  useEffect(() => {
    api
      .get<ConfigSolicitacoes>("/ponto/config/solicitacoes")
      .then((c) => {
        if (c?.feriasAntecedenciaMinDias != null) {
          setAntecedenciaFeriasDias(c.feriasAntecedenciaMinDias);
        }
      })
      .catch(() => {});
  }, []);
  type FiltroView = StatusSolicitacao | "TODAS" | "FERIAS_TODAS";
  const [filtro, setFiltro] = useState<FiltroView>("TODAS");
  const [pagina, setPagina] = useState(1);

  const carregar = useCallback(() => {
    const tk = token();
    if (!tk) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get<Solicitacao[]>("/ponto/solicitacoes", tk)
      .then((data) => setSolicitacoes(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function mudarFiltro(v: FiltroView) {
    setFiltro(v);
    setPagina(1);
  }

  const exibir =
    filtro === "TODAS"
      ? solicitacoes
      : filtro === "FERIAS_TODAS"
        ? solicitacoes.filter((s) => s.tipo === "FERIAS")
        : solicitacoes.filter((s) => s.status === filtro);

  const totalPaginas = Math.max(1, Math.ceil(exibir.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * POR_PAGINA;
  const pagAtual = exibir.slice(inicio, inicio + POR_PAGINA);

  const filtros: { v: FiltroView; l: string }[] = [
    { v: "TODAS", l: "Todas" },
    { v: "FERIAS_TODAS", l: "🌴 Férias" },
    { v: "PENDENTE", l: "Pendentes" },
    { v: "AGUARDANDO_RH", l: "Aguardando RH" },
    { v: "AGUARDANDO_DOCUMENTO_FUNCIONARIO", l: "Aguardando seu documento" },
    { v: "APROVADA", l: "Aprovadas" },
    { v: "REJEITADA_GESTOR", l: "Rej. Chefe" },
    { v: "REJEITADA_RH", l: "Rej. RH" }
  ];

  return (
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
      {modalAberto && (
        <NovaModal
          onClose={() => setModalAberto(false)}
          solicitacoesFerias={solicitacoes.filter((s) => s.tipo === "FERIAS")}
          onCriada={(nova) => {
            setSolicitacoes((prev) => [nova, ...prev]);
            setPagina(1);
          }}
        />
      )}

      {alterandoFerias && (
        <AlterarFeriasModal
          solicitacao={alterandoFerias}
          onClose={() => setAlterandoFerias(null)}
          onCriada={(nova) => {
            setSolicitacoes((prev) => [nova, ...prev]);
            setPagina(1);
            setAlterandoFerias(null);
          }}
        />
      )}

      <div style={{ marginBottom: 24 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Ponto Eletrônico
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            Solicitações e <em>Justificativas</em>
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={carregar} title="Atualizar">
              <RefreshCwIcon size={14} />
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setModalAberto(true)}>
              <PlusIcon size={15} /> Nova solicitação
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {filtros.map(({ v, l }) => {
          const isFerias = v === "FERIAS_TODAS";
          const ativo = filtro === v;
          return (
            <button
              key={v}
              onClick={() => mudarFiltro(v)}
              style={{
                padding: "5px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: 12,
                fontWeight: ativo ? 700 : 500,
                cursor: "pointer",
                border: ativo
                  ? `1.5px solid ${isFerias ? "#2f7d4f" : "var(--burgundy-600)"}`
                  : isFerias
                    ? "1px solid rgba(47,125,79,0.30)"
                    : "1px solid rgba(122,30,38,0.18)",
                background: ativo
                  ? isFerias
                    ? "#2f7d4f"
                    : "var(--burgundy-600)"
                  : isFerias
                    ? "rgba(47,125,79,0.06)"
                    : "white",
                color: ativo ? "white" : isFerias ? "#2f7d4f" : "var(--ink-700)",
                transition: "all 180ms ease"
              }}
            >
              {l}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div
          style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-500)", fontSize: 14 }}
        >
          Carregando solicitações…
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pagAtual.length === 0 ? (
              <div
                className="card-flat"
                style={{ textAlign: "center", padding: "36px 16px", color: "var(--ink-500)" }}
              >
                <CalendarIcon size={28} style={{ margin: "0 auto 8px" }} />
                <p>
                  {solicitacoes.length === 0
                    ? "Nenhuma solicitação aberta."
                    : "Nenhuma solicitação para o filtro selecionado."}
                </p>
              </div>
            ) : (
              pagAtual.map((s) => (
                <SolicitacaoCard
                  key={s.id}
                  s={s}
                  onAtualizado={carregar}
                  onAlterar={setAlterandoFerias}
                  antecedenciaFeriasDias={antecedenciaFeriasDias}
                />
              ))
            )}
          </div>

          {exibir.length > POR_PAGINA && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 20
              }}
            >
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={paginaSegura <= 1}
                className="btn-icon"
                style={{
                  background: "white",
                  border: "1px solid rgba(122,30,38,0.12)",
                  opacity: paginaSegura <= 1 ? 0.35 : 1,
                  fontSize: 18,
                  lineHeight: 1
                }}
              >
                ‹
              </button>

              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPagina(p)}
                  style={{
                    minWidth: 32,
                    height: 32,
                    borderRadius: "var(--radius-md)",
                    border: p === paginaSegura ? "none" : "1px solid rgba(122,30,38,0.12)",
                    background: p === paginaSegura ? "var(--burgundy-600)" : "white",
                    color: p === paginaSegura ? "#fff" : "var(--ink-600)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "0 6px"
                  }}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura >= totalPaginas}
                className="btn-icon"
                style={{
                  background: "white",
                  border: "1px solid rgba(122,30,38,0.12)",
                  opacity: paginaSegura >= totalPaginas ? 0.35 : 1,
                  fontSize: 18,
                  lineHeight: 1
                }}
              >
                ›
              </button>

              <span style={{ fontSize: 12, color: "var(--ink-400)", marginLeft: 4 }}>
                {inicio + 1}–{Math.min(inicio + POR_PAGINA, exibir.length)} de {exibir.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

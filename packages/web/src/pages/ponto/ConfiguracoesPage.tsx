import { ConfigRepP } from "../../components/arquivos-fiscais/ConfigRepP";
import { ConfigTermosUso } from "../../components/termos/ConfigTermosUso";
import React, { useState, useEffect, useCallback } from "react";
import { ToleranciaFechamentoGlobal } from "../../components/banco/ToleranciaFechamento";
import { GruposCidConfig } from "../../components/atestado/GruposCidConfig";
import { TiposLicencaConfig } from "../../components/licenca/TiposLicencaConfig";
import { MapModal } from "../../components/MapModal";
import {
  SettingsIcon,
  BuildingIcon,
  InfoIcon,
  PlusIcon,
  Trash2Icon,
  CheckCircleIcon,
  MapPinIcon,
  ShieldCheckIcon,
  UsersIcon,
  AlertCircleIcon,
  CalendarIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  XIcon
} from "../../components/icons";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import { invalidateInstituicaoBranding } from "../../hooks/useInstituicaoBranding";
import { TIPO_ABONO } from "../../utils/historicoTransform";
import { hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { ABAS_RH, CAMPOS_SISTEMA_POR_FUNCAO } from "../../utils/recursosRh";
import { SemAcessoRh } from "../../components/SemAcessoRh";

/** Cor própria do abono do RH — diferente de todos os tipos de feriado. */
const ABONO_COR = "#0f766e";

/* ─── Tipos ─── */
interface Provedor {
  id: string;
  nome: string;
  ip: string;
  isPrincipal: boolean;
  ativo: boolean;
}
interface Subrede {
  id: string;
  cidr: string;
  descricao: string;
}
interface MarcoBancoHoras {
  id: string;
  dia: number;
  mes: number;
  ano: number | null;
  chave: string;
  descricao: string | null;
}
interface AreaViagem {
  id: string;
  nome: string;
  descricao: string;
  lat: number;
  lng: number;
  raioMetros: number;
  ativa: boolean;
}

interface SistemaApi {
  nome: string;
  cnpj: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  emailInstitucional?: string;
  lat: number;
  lng: number;
  raioMetros: number;
  modoDesktop: boolean;
  modoMobile: boolean;
  modoHibrido: boolean;
  modoViagem: boolean;
  desktopCheckSubrede: boolean;
  desktopCheckGeo: boolean;
  mobileCheckSubrede: boolean;
  mobileCheckGeo: boolean;
  mobileExigirFoto: boolean;
  hibridoExigirFoto: boolean;
  cicloCompletoEmCasaDesde?: string | null;
  cicloCompletoPresencialDesde?: string | null;
  intervaloLongoAcimaDeMin?: number;
  intervaloCurtoAcimaDeMin?: number;
  intervaloCurtoMinMin?: number;
  // Períodos / jornada (retornados pelo backend com defaults)
  horaEntrada: string;
  horaSaida: string;
  pontoHorarioMinimo: string;
  pontoHorarioMaximo: string;
  jornadaDiariaMin: number;
  jornadaSemanalMin: number;
  diasUteis: boolean[] | string;
  toleranciaEntradaMin: number;
  toleranciaSaidaMin: number;
  toleranciaHoraExtraMin: number;
  toleranciaCalculoMin: number;
  tipoFlexibilidade: string;
  almocoPodeIniciarA: string;
  almocoPodeIniciarAte: string;
  almocoMinMin: number;
  almocoMaxMin: number;
  hibridoMaxDiasSemana: number;
  hibridoExigeAprovacao: boolean;
  viagemJanelaMinutos: number;
  viagemExigeAprovacao: boolean;
  bancoHorasLimiteMin: number;
  bancoHorasVigenciaDias: number;
  horaExtraLimiteAuto: number;
  interjornadaMin?: number;
  bancoHorasSabadoPct: number;
  bancoHorasDomingoPct: number;
  bancoHorasFeriadoPct: number;
  contratoAvisoAntecedenciaDias?: number;
  jornadaAcordoColetivo?: string | null;
}

interface Config {
  // Instituição
  nome: string;
  cnpj: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  // Geoloc
  lat: number;
  lng: number;
  raioMetros: number;
  // Modos
  modoDesktop: boolean;
  modoMobile: boolean;
  modoHibrido: boolean;
  modoViagem: boolean;
  // Desktop
  desktopCheckSubrede: boolean;
  desktopCheckGeo: boolean;
  // Mobile
  mobileCheckSubrede: boolean;
  mobileCheckGeo: boolean;
  mobileExigirFoto: boolean;
  // Híbrido / Viagem
  hibridoExigirFoto: boolean;
  /** Dias em casa só são OK com o ciclo completo de batidas, desde esta data (AAAA-MM-DD); null = desligado. */
  cicloCompletoEmCasaDesde: string | null;
  /** Ponto presencial: dia só OK com o ciclo que a lei exige para a jornada, desde esta data. */
  cicloCompletoPresencialDesde: string | null;
}

/* ─── Toggle ─── */
function Toggle({
  value,
  onChange,
  label,
  desc,
  disabled
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  desc?: string;
  disabled?: boolean;
}) {
  const btn = (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        flexShrink: 0,
        background: value ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)",
        position: "relative",
        transition: "background 200ms",
        opacity: disabled ? 0.65 : 1
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? 22 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 200ms",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)"
        }}
      />
    </button>
  );

  if (!label) return btn;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid rgba(122,30,38,0.06)"
      }}
    >
      <div>
        <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>{label}</p>
        {desc && <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{desc}</p>}
      </div>
      {btn}
    </div>
  );
}

interface CampoProps {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  readOnly?: boolean;
}
/* ─── Campo de formulário ─── */
function Campo({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
  readOnly = false
}: CampoProps) {
  return (
    <div>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-500)",
          display: "block",
          marginBottom: 5
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          width: "100%",
          padding: "9px 11px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.14)",
          background: readOnly ? "var(--cream-50)" : "#fff",
          fontSize: 13.5,
          fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
          outline: "none",
          boxSizing: "border-box" as const,
          color: readOnly ? "var(--ink-500)" : "var(--ink-900)"
        }}
      />
    </div>
  );
}

/* ─── Seção ─── */
function Secao({
  titulo,
  icon,
  children
}: {
  titulo: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "20px 22px",
        marginBottom: 16
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {icon && <span style={{ color: "var(--burgundy-600)" }}>{icon}</span>}
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: 17,
            color: "var(--burgundy-600)",
            fontWeight: 400
          }}
        >
          {titulo}
        </h3>
      </div>
      {children}
    </div>
  );
}

type Tab =
  | "institucional"
  | "rede"
  | "modos"
  | "areas"
  | "periodos"
  | "solicitacoes"
  | "feriados"
  | "notificacoes"
  | "termos";

interface ConfigSolicitacoes {
  atestadoDiasLimiteSimples: number;
  atestadoDiasLimiteInss: number;
  atestadoPrazoEnvioDias: number;
  atestadoTempoRetornoMin: number;
  atestadoTempoIdaMin: number;
  atestadoMensagemOriginais: string;
  feriasAntecedenciaMinDias: number;
  feriasMinimoGrandePeriodo: number;
  feriasMinimoOutrosPeriodos: number;
  feriasMaxPeriodos: number;
  feriasMaxDiasVenda: number;
  feriasVedacaoPreFeriadoDias: number;
  feriasRodadaAvisoDias: number;
  tipoAtivoCorrecaoPonto: boolean;
  tipoAtivoAtestado: boolean;
  tipoAtivoFerias: boolean;
  tipoAtivoLicenca: boolean;
  tipoAtivoAbono: boolean;
  tipoAtivoDayOff: boolean;
  tipoAtivoHoraExtra: boolean;
  tipoAtivoEnvioDocumentoRh: boolean;
  abonoAlemLimiteLiberadoRh: boolean;
  abonoCotaDiasDoisCiclos: number;
  atestadoCidModo: "OBRIGATORIO" | "OPCIONAL" | "DESATIVADO";
}

interface FeriadoConfig {
  id: string;
  data: string; // ISO date string
  nome: string;
  tipo: string; // "NACIONAL" | "DISTRITAL" | "FACULTATIVO" | "MANUAL"
  bloqueiaRegistro: boolean;
  origem: string;
  observacao?: string | null;
  marcoHorario?: string | null;
  marcoLado?: string | null;
}

/* ─── JornadaPeriodo ─── */
interface JornadaPeriodo {
  id: string;
  nome: string;
  descricao?: string | null;
  ePadrao: boolean;
  ativo: boolean;
  horaEntrada: string;
  horaSaida: string;
  jornadaDiariaMin: number;
  jornadaSemanalMin: number;
  diasUteis: string;
  tipoFlexibilidade: "FIXO" | "ELASTICO" | "BANCO_HORAS";
  toleranciaEntradaMin: number;
  toleranciaSaidaMin: number;
  toleranciaHoraExtraMin: number;
  toleranciaCalculoMin: number;
  almocoPodeIniciarA: string;
  almocoPodeIniciarAte: string;
  almocoMinMin: number;
  almocoMaxMin: number;
  bancoHorasLimiteMin: number;
  bancoHorasVigenciaDias: number;
  horaExtraLimiteAuto: number;
  /** Jornada de estagiários/jovens aprendizes: sem almoço, banco de horas e hora extra. */
  paraEstagiarios?: boolean;
}

const JP_VAZIO: Omit<JornadaPeriodo, "id" | "ePadrao" | "ativo"> = {
  nome: "",
  descricao: "",
  horaEntrada: "08:00",
  horaSaida: "17:00",
  jornadaDiariaMin: 480,
  jornadaSemanalMin: 2400,
  diasUteis: "[false,true,true,true,true,true,false]",
  tipoFlexibilidade: "FIXO",
  toleranciaEntradaMin: 5,
  toleranciaSaidaMin: 5,
  toleranciaHoraExtraMin: 10,
  toleranciaCalculoMin: 0,
  almocoPodeIniciarA: "11:30",
  almocoPodeIniciarAte: "13:00",
  almocoMinMin: 60,
  almocoMaxMin: 90,
  bancoHorasLimiteMin: 120,
  bancoHorasVigenciaDias: 30,
  horaExtraLimiteAuto: 120,
  paraEstagiarios: false
};

/* ─── Tipos de períodos ─── */
interface ConfigPeriodos {
  // Jornada padrão
  horaEntrada: string; // "08:00"
  horaSaida: string; // "17:00"
  pontoHorarioMinimo: string; // "06:00" — limite para bater/ajustar ponto (Brasília)
  pontoHorarioMaximo: string; // "23:59"
  jornadaDiariaMin: number; // 480
  jornadaSemanalMin: number; // 2400
  diasUteis: boolean[]; // [false,true,true,true,true,true,false] Dom→Sáb
  // Flexibilidade
  toleranciaEntradaMin: number; // 5 — janela simétrica ±N (entrada, saída e excesso de almoço)
  toleranciaSaidaMin: number; // espelho de toleranciaEntradaMin (sempre iguais)
  toleranciaHoraExtraMin: number; // 10 — minutos além da saída não contados como hora extra
  toleranciaCalculoMin: number; // legado (sempre 0; flexibilidade está na tolerância simétrica)
  tipoFlexibilidade: "FIXO" | "ELASTICO" | "BANCO_HORAS";
  // Intervalo de almoço
  almocoPodeIniciarA: string; // "11:30"
  almocoPodeIniciarAte: string; // "13:00"
  almocoMinMin: number; // 60
  almocoMaxMin: number; // 90
  // Modo híbrido
  hibridoMaxDiasSemana: number; // 2
  hibridoExigeAprovacao: boolean;
  // Modo viagem
  viagemJanelaMinutos: number; // 120
  viagemExigeAprovacao: boolean;
  // Banco de horas
  bancoHorasLimiteMin: number; // 120 = 2h
  bancoHorasVigenciaDias: number; // 30
  // Hora extra
  horaExtraLimiteAuto: number; // 120 = 2h — acima deste valor cria solicitação automática
  interjornadaMin: number; // 660 = 11h — descanso mínimo entre jornadas; 0 = desativado
  /** CLT art. 71: jornada acima disso (min) exige o almoço; acima do curto, um intervalo curto. */
  intervaloLongoAcimaDeMin: number; // 360
  intervaloCurtoAcimaDeMin: number; // 240
  intervaloCurtoMinMin: number; // 15
  // Multiplicadores banco de horas fins de semana/feriados (%)
  bancoHorasSabadoPct: number;
  bancoHorasDomingoPct: number;
  bancoHorasFeriadoPct: number;
  // Aviso de fim de contrato (Estagiário/Jovem Aprendiz), em dias de antecedência
  contratoAvisoAntecedenciaDias: number;
  // Acordo coletivo que reduz a jornada (Espelho de Ponto)
  jornadaAcordoColetivo: string;
}

/** 360 → "6 h"; 390 → "6 h 30 min". */
function fmtHorasCfg(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function patchPeriodos(
  prev: ConfigPeriodos | null,
  patch: Partial<ConfigPeriodos>
): ConfigPeriodos | null {
  if (!prev) return prev;
  const next = { ...prev, ...patch };
  /* Tolerância simétrica: entrada e saída sempre iguais. */
  if (patch.toleranciaEntradaMin !== undefined) {
    const n = Math.max(0, Number(patch.toleranciaEntradaMin) || 0);
    next.toleranciaEntradaMin = n;
    next.toleranciaSaidaMin = n;
  } else if (patch.toleranciaSaidaMin !== undefined) {
    const n = Math.max(0, Number(patch.toleranciaSaidaMin) || 0);
    next.toleranciaEntradaMin = n;
    next.toleranciaSaidaMin = n;
  }
  next.toleranciaCalculoMin = 0;
  return next;
}

function horaParaMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function calcJornadaEfetiva(
  horaEntrada: string,
  horaSaida: string,
  almocoDuracaoMin: number,
  diasUteis: boolean[]
): { diaria: number; semanal: number } {
  const span = horaParaMin(horaSaida) - horaParaMin(horaEntrada);
  const diaria = Math.max(0, span - almocoDuracaoMin);
  const semanal = diaria * diasUteis.filter(Boolean).length;
  return { diaria, semanal };
}

/* ═══════════════════════════════════════════════
   TAB: NOTIFICAÇÕES & E-MAIL
═══════════════════════════════════════════════ */

const PROVEDORES = [
  {
    id: "LOCAWEB",
    label: "Locaweb",
    host: "email-ssl.com.br",
    porta: 587,
    seguranca: "STARTTLS" as const
  },
  {
    id: "MICROSOFT",
    label: "Microsoft 365 / Office 365",
    host: "smtp.office365.com",
    porta: 587,
    seguranca: "STARTTLS" as const
  }
];

const EVENTOS_NOTIFICACAO = [
  {
    id: "ASSINAR_QUADRO",
    titulo: "Assinar Quadro de Pontos",
    descricao:
      "Notifica o funcionário para assinar o quadro de pontos após o fechamento do mês. " +
      "Disparado no 1º dia de cada mês, junto com a criação das assinaturas.",
    destinatario: "Funcionário",
    gatilho: "Automático — 1º dia de cada mês"
  },
  {
    id: "FOLHA_PONTO_CORRECAO_PENDENTE",
    titulo: "Folha de Ponto — Correções Pendentes para Assinatura",
    descricao:
      "Notifica o funcionário, todos os dias, de que é necessário regularizar a folha de ponto " +
      "(correção de ponto ou atestado) para poder fechá-la e assiná-la. " +
      "O envio cessa quando não houver mais pendências de cálculo e a folha for assinada.",
    destinatario: "Funcionário",
    gatilho:
      "Automático — diário às 00:10 (Brasília), enquanto a folha estiver pendente de assinatura " +
      "e houver registros de saldo não regularizados"
  },
  {
    id: "ASSINAR_QUADRO_GESTOR",
    titulo: "Quadro Aguardando Assinatura do Chefe",
    descricao:
      "Notifica o gestor quando um funcionário da sua equipe assinou o quadro de pontos " +
      "e está aguardando aprovação.",
    destinatario: "Chefe",
    gatilho: "Automático — ao funcionário assinar o quadro"
  },
  {
    id: "FERIAS_OBRIGATORIO",
    titulo: "Agendar Férias — Período Obrigatório",
    descricao:
      "Notifica o funcionário quando está no período obrigatório de agendamento de férias " +
      "(11º mês do ciclo anual; 5º mês para estagiários). Verificação mensal.",
    destinatario: "Funcionário",
    gatilho: "Automático — mensal, para funcionários no período obrigatório"
  },
  {
    id: "SOLICITACAO_APROVADA",
    titulo: "Solicitação Aprovada",
    descricao:
      "Notifica o funcionário quando uma solicitação (férias, atestado, licença etc.) " +
      "foi aprovada pelo RH.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao aprovar solicitação"
  },
  {
    id: "SOLICITACAO_RECUSADA",
    titulo: "Solicitação Recusada",
    descricao:
      "Notifica o funcionário quando uma solicitação foi recusada pelo RH, " +
      "incluindo a justificativa informada.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao recusar solicitação"
  },
  {
    id: "BANCO_HORAS_VENCIMENTO",
    titulo: "Banco de Horas — Alerta de Vencimento",
    descricao:
      "Notifica o funcionário quando o saldo de banco de horas está próximo do vencimento, " +
      "conforme a data de marco configurada.",
    destinatario: "Funcionário",
    gatilho: "Automático — mensal"
  },
  {
    id: "ASSINATURA_CONCLUIDA",
    titulo: "Quadro Totalmente Assinado",
    descricao:
      "Notifica o funcionário quando o gestor assinou o quadro de pontos e o processo " +
      "de assinatura foi concluído.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao chefe concluir a assinatura"
  },
  {
    id: "SOLICITACAO_NOVA_GESTOR",
    titulo: "Nova Solicitação — Aviso ao Chefe",
    descricao:
      "Notifica o gestor quando um funcionário da equipe abre uma nova solicitação " +
      "(férias, atestado, licença, correção de ponto etc.).",
    destinatario: "Chefe",
    gatilho: "Automático — ao funcionário criar solicitação"
  },
  {
    id: "SOLICITACAO_AGUARDANDO_RH",
    titulo: "Solicitação Aguardando RH",
    descricao:
      "Notifica a equipe de RH quando o gestor aprova uma solicitação e ela passa " +
      "para análise do RH.",
    destinatario: "RH",
    gatilho: "Automático — ao chefe encaminhar para o RH"
  },
  {
    id: "RH_DOCUMENTO_ENVIADO",
    titulo: "Documento Enviado pelo RH",
    descricao:
      "Notifica o funcionário quando o RH envia a guia médica ou a folha de pagamento " +
      "de férias para assinatura.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao RH enviar guia ou folha de férias"
  },
  {
    id: "DOCUMENTO_RETORNO_PENDENTE",
    titulo: "Documento de Retorno Pendente",
    descricao:
      "Notifica o funcionário quando é necessário enviar o documento de retorno " +
      "(atestado assinado, folha de férias assinada etc.).",
    destinatario: "Funcionário",
    gatilho: "Automático — ao solicitar documento de retorno"
  },
  {
    id: "REGISTRO_PONTO",
    titulo: "Registro de Ponto",
    descricao:
      "Notifica o gestor quando um funcionário da equipe registra entrada ou saída " +
      "no ponto eletrônico.",
    destinatario: "Chefe",
    gatilho: "Automático — ao registrar entrada ou saída"
  },
  {
    id: "AFASTAMENTO_REGISTRADO",
    titulo: "Afastamento Registrado",
    descricao:
      "Notifica o funcionário quando um afastamento (férias, atestado, licença, abono) " +
      "é registrado após aprovação da solicitação.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao aprovar solicitação com afastamento"
  },
  {
    id: "PERIODO_FECHADO",
    titulo: "Período de Ponto Fechado",
    descricao: "Notifica o funcionário quando o período mensal de ponto é fechado pelo RH.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao fechar período"
  },
  {
    id: "REQUISICAO_RH",
    titulo: "Requisição do RH",
    descricao:
      "Notifica o funcionário quando o RH cria uma requisição dirigida a ele " +
      "(periódico, exame médico, férias, assinatura de documentos etc.).",
    destinatario: "Funcionário",
    gatilho: "Automático — ao RH criar requisição"
  },
  {
    id: "PAPEL_CRITICO_DESATIVADO",
    titulo: "Supervisor ou Chefe Substituto Desativado",
    descricao:
      "Notifica toda a equipe de RH quando um Supervisor de Estágio (estagiário/jovem aprendiz) " +
      "ou um Chefe Substituto em exercício é desativado, para providenciar substituição imediata.",
    destinatario: "RH",
    gatilho: "Automático — ao desativar funcionário com papel crítico ativo"
  }
];

interface EmailCfg {
  provedor: "LOCAWEB" | "MICROSOFT";
  host: string;
  porta: number;
  seguranca: "NONE" | "SSL" | "STARTTLS";
  usuario: string;
  nomeRemetente: string;
  emailRemetente: string;
  ativo: boolean;
  senhaDefinida?: boolean;
}

interface NotifCfg {
  id: string;
  titulo: string;
  descricao: string;
  destinatario: string;
  gatilho: string;
  ativoEmail: boolean;
  ativoSistema: boolean;
}

interface FuncResult {
  id: string;
  name: string;
  email: string;
  matricula: string;
  cargo: string;
}

function TabNotificacoes({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  /* Perfil do RH: cada ação da aba exige a sua função. */
  const { podeRh } = useAuth();
  const exigirFuncaoNotif = (recurso: string) => {
    if (podeRh(recurso)) return true;
    alert("O seu perfil do RH não permite esta ação. Fale com o Gerente de RH.");
    return false;
  };
  /* ── state: email config ── */
  const [emailCfg, setEmailCfg] = useState<EmailCfg>({
    provedor: "LOCAWEB",
    host: PROVEDORES[0].host,
    porta: PROVEDORES[0].porta,
    seguranca: "STARTTLS",
    usuario: "",
    nomeRemetente: "",
    emailRemetente: "",
    ativo: false
  });
  const [senha, setSenha] = useState("");
  const [emailCfgLoading, setEmailCfgLoading] = useState(true);
  const [emailCfgSaving, setEmailCfgSaving] = useState(false);
  const [emailCfgMsg, setEmailCfgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailTeste, setEmailTeste] = useState("");
  const [testando, setTestando] = useState(false);

  /* ── state: notificação por evento ── */
  const [notifCfgs, setNotifCfgs] = useState<NotifCfg[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);

  /* ── state: envio manual ── */
  const [manualGrupo, setManualGrupo] = useState<"todos" | "gestores" | "funcionarios" | "custom">(
    "funcionarios"
  );
  const [manualTipoEnvio, setManualTipoEnvio] = useState<"email" | "sistema" | "ambos">("email");
  const [funcSearch, setFuncSearch] = useState("");
  const [funcResultados, setFuncResultados] = useState<FuncResult[]>([]);
  const [funcBuscando, setFuncBuscando] = useState(false);
  const [funcSelecionados, setFuncSelecionados] = useState<FuncResult[]>([]);
  const [funcDropdown, setFuncDropdown] = useState(false);
  const [manualAssunto, setManualAssunto] = useState("");
  const [manualCorpo, setManualCorpo] = useState("");
  const [manualEnviando, setManualEnviando] = useState(false);
  const [manualResultado, setManualResultado] = useState<{
    enviados: number;
    tipo: string;
    erros: string[];
  } | null>(null);

  const styleInput: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box",
    fontFamily: "var(--font-body)"
  };
  const styleLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };

  /* ── carregar email config ── */
  useEffect(() => {
    if (!isSuperAdmin) {
      setEmailCfgLoading(false);
      return;
    }
    api
      .get<EmailCfg>("/notificacao/email-config")
      .then((cfg) => {
        if (cfg) setEmailCfg(cfg);
      })
      .catch(() => {})
      .finally(() => setEmailCfgLoading(false));
  }, [isSuperAdmin]);

  /* ── carregar notif configs ── */
  useEffect(() => {
    api
      .get<NotifCfg[]>("/notificacao/config")
      .then((data) => {
        if (Array.isArray(data) && data.length) setNotifCfgs(data);
        else
          setNotifCfgs(
            EVENTOS_NOTIFICACAO.map((e) => ({ ...e, ativoEmail: false, ativoSistema: false }))
          );
      })
      .catch(() =>
        setNotifCfgs(
          EVENTOS_NOTIFICACAO.map((e) => ({ ...e, ativoEmail: false, ativoSistema: false }))
        )
      )
      .finally(() => setNotifLoading(false));
  }, []);

  function updEmailCfg<K extends keyof EmailCfg>(key: K, val: EmailCfg[K]) {
    setEmailCfg((prev) => ({ ...prev, [key]: val }));
    setEmailCfgMsg(null);
  }

  function onProvedorChange(id: "LOCAWEB" | "MICROSOFT") {
    const p = PROVEDORES.find((x) => x.id === id);
    if (p) {
      setEmailCfg((prev) => ({
        ...prev,
        provedor: id,
        host: p.host,
        porta: p.porta,
        seguranca: p.seguranca
      }));
    }
  }

  async function salvarEmailCfg() {
    if (!exigirFuncaoNotif("configuracoes.notificacoes.email")) return;
    setEmailCfgSaving(true);
    setEmailCfgMsg(null);
    try {
      await api.put("/notificacao/email-config", { ...emailCfg, senha });
      setEmailCfg((prev) => ({ ...prev, senhaDefinida: prev.senhaDefinida || !!senha.trim() }));
      setEmailCfgMsg({ ok: true, text: "Configuração salva com sucesso." });
      setSenha("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEmailCfgMsg({ ok: false, text: msg });
    } finally {
      setEmailCfgSaving(false);
    }
  }

  async function testarConexao() {
    if (!exigirFuncaoNotif("configuracoes.notificacoes.email")) return;
    if (!emailTeste) return;
    setTestando(true);
    setEmailCfgMsg(null);
    try {
      await api.post("/notificacao/email-config/testar", {
        ...emailCfg,
        senha,
        emailTeste
      });
      setEmailCfgMsg({ ok: true, text: `E-mail de teste enviado para ${emailTeste}.` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEmailCfgMsg({ ok: false, text: msg });
    } finally {
      setTestando(false);
    }
  }

  const toggleNotif = useCallback(
    async (id: string, campo: "ativoEmail" | "ativoSistema", valor: boolean) => {
      if (!exigirFuncaoNotif("configuracoes.notificacoes.eventos")) return;
      setNotifCfgs((prev) => prev.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)));
      try {
        await api.put(`/notificacao/config/${id}`, { [campo]: valor });
      } catch {
        setNotifCfgs((prev) => prev.map((c) => (c.id === id ? { ...c, [campo]: !valor } : c)));
      }
    },
    [podeRh]
  );

  /* ── busca debounced de funcionários ── */
  useEffect(() => {
    if (!funcSearch.trim() || manualGrupo !== "custom") {
      setFuncResultados([]);
      setFuncBuscando(false);
      return;
    }
    setFuncBuscando(true);
    const timer = setTimeout(async () => {
      try {
        type ApiFuncRaw = {
          id: string;
          user: { name: string; email: string; emailReal?: string | null };
          matricula: string;
          cargo: string;
        };
        const data = await api.get<ApiFuncRaw[]>(
          `/auditoria/funcionarios?busca=${encodeURIComponent(funcSearch.trim())}&ativo=true`
        );
        const selecionadosIds = new Set(funcSelecionados.map((s) => s.id));
        setFuncResultados(
          data
            .filter((f) => (f.user.emailReal || f.user.email) && !selecionadosIds.has(f.id))
            .slice(0, 8)
            .map((f) => ({
              id: f.id,
              name: f.user.name,
              email: f.user.emailReal || f.user.email,
              matricula: f.matricula,
              cargo: f.cargo
            }))
        );
      } catch {
        setFuncResultados([]);
      } finally {
        setFuncBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [funcSearch, manualGrupo, funcSelecionados]);

  function selecionarFunc(f: FuncResult) {
    setFuncSelecionados((prev) => (prev.some((s) => s.id === f.id) ? prev : [...prev, f]));
    setFuncSearch("");
    setFuncResultados([]);
  }

  function removerFunc(id: string) {
    setFuncSelecionados((prev) => prev.filter((f) => f.id !== id));
  }

  async function enviarManual() {
    if (!exigirFuncaoNotif("configuracoes.notificacoes.manual")) return;
    setManualEnviando(true);
    setManualResultado(null);
    try {
      let destinatarios: string[] = [];
      if (manualGrupo === "custom") {
        destinatarios = funcSelecionados.map((f) => f.email).filter(Boolean);
        if (!destinatarios.length) {
          setManualResultado({
            enviados: 0,
            tipo: manualTipoEnvio,
            erros: ["Selecione ao menos um funcionário."]
          });
          return;
        }
      } else {
        const lista = await api.get<{ name: string; email: string }[]>(
          `/notificacao/emails-funcionarios/${manualGrupo}`
        );
        destinatarios = lista.map((u) => u.email).filter(Boolean);
      }
      const res = await api.post<{ enviados: number; erros: string[] }>("/notificacao/manual", {
        destinatarios,
        assunto: manualAssunto,
        corpo: manualCorpo,
        tipoEnvio: manualTipoEnvio
      });
      setManualResultado({ ...res, tipo: manualTipoEnvio });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setManualResultado({ enviados: 0, tipo: manualTipoEnvio, erros: [msg] });
    } finally {
      setManualEnviando(false);
    }
  }

  const tagStyle = (color: string): React.CSSProperties => ({
    display: "inline-block",
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 7px",
    borderRadius: 20,
    background: color + "18",
    color: color,
    letterSpacing: "0.04em"
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ──── Configuração de E-mail SMTP ──── */}
      {isSuperAdmin ? (
        <Secao titulo="Configuração de E-mail SMTP" icon={<SettingsIcon size={18} />}>
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(37,99,235,0.06)",
              border: "1px solid rgba(37,99,235,0.20)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
              color: "#1e40af",
              marginBottom: 4
            }}
          >
            Restrito a Super Administrador — define o servidor SMTP usado para envio de
            notificações.
          </div>

          {emailCfgLoading ? (
            <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Carregando…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Provedor */}
              <div>
                <label style={styleLabel}>Provedor de E-mail</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {PROVEDORES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onProvedorChange(p.id as "LOCAWEB" | "MICROSOFT")}
                      style={{
                        padding: "8px 18px",
                        borderRadius: "var(--radius-md)",
                        border: "2px solid",
                        borderColor:
                          emailCfg.provedor === p.id
                            ? "var(--burgundy-600)"
                            : "rgba(122,30,38,0.15)",
                        background: emailCfg.provedor === p.id ? "rgba(122,30,38,0.06)" : "#fff",
                        color:
                          emailCfg.provedor === p.id ? "var(--burgundy-600)" : "var(--ink-600)",
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer"
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {emailCfg.provedor === "MICROSOFT" && (
                  <p
                    style={{
                      fontSize: 11.5,
                      color: "var(--ink-500)",
                      marginTop: 6,
                      marginBottom: 0
                    }}
                  >
                    Para Microsoft 365, use uma Senha de Aplicativo criada em{" "}
                    <em>Segurança → Métodos de entrada → Senhas de aplicativo</em> na conta
                    Microsoft.
                  </p>
                )}
              </div>

              {/* Campos de servidor */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", gap: 12 }}>
                <div>
                  <label style={styleLabel}>Servidor SMTP (Host)</label>
                  <input
                    style={styleInput}
                    value={emailCfg.host}
                    onChange={(e) => updEmailCfg("host", e.target.value)}
                    placeholder="smtp.exemplo.com.br"
                  />
                </div>
                <div>
                  <label style={styleLabel}>Porta</label>
                  <input
                    style={styleInput}
                    type="number"
                    value={emailCfg.porta}
                    onChange={(e) => updEmailCfg("porta", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={styleLabel}>Segurança</label>
                  <select
                    style={{ ...styleInput }}
                    value={emailCfg.seguranca}
                    onChange={(e) =>
                      updEmailCfg("seguranca", e.target.value as EmailCfg["seguranca"])
                    }
                  >
                    <option value="STARTTLS">STARTTLS (recomendado)</option>
                    <option value="SSL">SSL / TLS</option>
                    <option value="NONE">Nenhuma</option>
                  </select>
                </div>
              </div>

              {/* Autenticação */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={styleLabel}>Usuário / E-mail de autenticação</label>
                  <input
                    style={styleInput}
                    value={emailCfg.usuario}
                    onChange={(e) => updEmailCfg("usuario", e.target.value)}
                    placeholder="envio@exemplo.com.br"
                  />
                </div>
                <div>
                  <label style={styleLabel}>
                    Senha{" "}
                    {emailCfg.senhaDefinida && (
                      <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>
                        (já definida — deixe em branco para manter)
                      </span>
                    )}
                  </label>
                  <input
                    style={styleInput}
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder={emailCfg.senhaDefinida ? "••••••••" : "Senha do e-mail"}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {/* Remetente */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={styleLabel}>Nome do Remetente</label>
                  <input
                    style={styleInput}
                    value={emailCfg.nomeRemetente}
                    onChange={(e) => updEmailCfg("nomeRemetente", e.target.value)}
                    placeholder="Ponto Eletrônico CFO"
                  />
                </div>
                <div>
                  <label style={styleLabel}>E-mail do Remetente</label>
                  <input
                    style={styleInput}
                    type="email"
                    value={emailCfg.emailRemetente}
                    onChange={(e) => updEmailCfg("emailRemetente", e.target.value)}
                    placeholder="noreply@exemplo.com.br"
                  />
                </div>
              </div>

              {/* Toggle ativo */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Toggle value={emailCfg.ativo} onChange={(v) => updEmailCfg("ativo", v)} />
                <span style={{ fontSize: 13, color: "var(--ink-700)" }}>
                  {emailCfg.ativo ? "Envio de e-mail ativado" : "Envio de e-mail desativado"}
                </span>
              </div>

              {/* Feedback */}
              {emailCfgMsg && (
                <p
                  style={{
                    fontSize: 12.5,
                    color: emailCfgMsg.ok ? "var(--green)" : "var(--red)",
                    margin: 0
                  }}
                >
                  {emailCfgMsg.ok ? "✓ " : "⚠️ "}
                  {emailCfgMsg.text}
                </p>
              )}

              {/* Ações */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void salvarEmailCfg()}
                  disabled={emailCfgSaving}
                >
                  {emailCfgSaving ? "Salvando…" : "Salvar Configuração"}
                </button>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    style={{ ...styleInput, width: 220 }}
                    type="email"
                    value={emailTeste}
                    onChange={(e) => setEmailTeste(e.target.value)}
                    placeholder="seu@email.com (teste)"
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void testarConexao()}
                    disabled={testando || !emailTeste}
                  >
                    {testando ? "Testando…" : "Testar Conexão"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Secao>
      ) : (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(122,30,38,0.04)",
            border: "1px solid rgba(122,30,38,0.12)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            color: "var(--ink-500)"
          }}
        >
          A configuração do servidor de e-mail SMTP é restrita ao Super Administrador.
        </div>
      )}

      {/* ──── Notificações Automáticas por Evento ──── */}
      <Secao titulo="Notificações Automáticas" icon={<AlertCircleIcon size={18} />}>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "0 0 12px" }}>
          Para cada evento abaixo, defina se o sistema deve enviar um <strong>e-mail</strong> e/ou
          uma <strong>notificação no sistema</strong> de forma automática. O envio de e-mail requer
          a configuração SMTP ativa acima.
        </p>

        {notifLoading ? (
          <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Carregando…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Cabeçalho */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 110px",
                gap: 8,
                padding: "6px 12px",
                background: "var(--cream-100)",
                borderRadius: "var(--radius-md)",
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--ink-500)",
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}
            >
              <span>Evento</span>
              <span style={{ textAlign: "center" }}>E-mail</span>
              <span style={{ textAlign: "center" }}>No Sistema</span>
            </div>

            {notifCfgs.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 110px",
                  gap: 8,
                  padding: "12px 12px",
                  border: "1px solid rgba(122,30,38,0.08)",
                  borderRadius: "var(--radius-md)",
                  alignItems: "start"
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--ink-900)",
                      margin: "0 0 3px"
                    }}
                  >
                    {ev.titulo}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--ink-500)",
                      margin: "0 0 6px",
                      lineHeight: 1.5
                    }}
                  >
                    {ev.descricao}
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={tagStyle("#1e40af")}>→ {ev.destinatario}</span>
                    <span style={tagStyle("#6b7280")}>{ev.gatilho}</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 2 }}>
                  <Toggle
                    value={ev.ativoEmail}
                    onChange={(v) => void toggleNotif(ev.id, "ativoEmail", v)}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 2 }}>
                  <Toggle
                    value={ev.ativoSistema}
                    onChange={(v) => void toggleNotif(ev.id, "ativoSistema", v)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* ──── Envio Manual ──── */}
      <Secao titulo="Envio Manual de Notificação" icon={<UsersIcon size={18} />}>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "0 0 14px" }}>
          Envie uma mensagem personalizada para um grupo de funcionários ou para pessoas
          específicas. O envio por e-mail requer a configuração SMTP ativa.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Canal de envio */}
          <div>
            <label style={styleLabel}>Canal de Envio</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  { id: "email", label: "E-mail", desc: "Envia por SMTP" },
                  { id: "sistema", label: "Notificação no Sistema", desc: "Notificação interna" },
                  { id: "ambos", label: "Ambos", desc: "E-mail + Sistema" }
                ] as const
              ).map((op) => (
                <button
                  key={op.id}
                  onClick={() => setManualTipoEnvio(op.id)}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid",
                    borderColor:
                      manualTipoEnvio === op.id ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)",
                    background: manualTipoEnvio === op.id ? "rgba(122,30,38,0.06)" : "#fff",
                    color: manualTipoEnvio === op.id ? "var(--burgundy-600)" : "var(--ink-600)",
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 1
                  }}
                >
                  <span>{op.label}</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 400,
                      color: manualTipoEnvio === op.id ? "var(--burgundy-600)" : "var(--ink-400)"
                    }}
                  >
                    {op.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Destinatários — grupo */}
          <div>
            <label style={styleLabel}>Destinatários</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {(
                [
                  { id: "funcionarios", label: "Todos os funcionários" },
                  { id: "gestores", label: "Todos os gestores" },
                  { id: "todos", label: "Todos" },
                  { id: "custom", label: "Funcionários específicos" }
                ] as const
              ).map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    setManualGrupo(op.id);
                    setFuncSearch("");
                    setFuncResultados([]);
                    setFuncSelecionados([]);
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid",
                    borderColor:
                      manualGrupo === op.id ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)",
                    background: manualGrupo === op.id ? "rgba(122,30,38,0.06)" : "#fff",
                    color: manualGrupo === op.id ? "var(--burgundy-600)" : "var(--ink-600)",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer"
                  }}
                >
                  {op.label}
                </button>
              ))}
            </div>

            {/* Busca inteligente de funcionários (modo custom) */}
            {manualGrupo === "custom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Chips dos selecionados */}
                {funcSelecionados.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {funcSelecionados.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "3px 8px 3px 10px",
                          background: "rgba(122,30,38,0.08)",
                          border: "1px solid rgba(122,30,38,0.18)",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--burgundy-600)"
                        }}
                      >
                        <span>{f.name}</span>
                        <button
                          onClick={() => removerFunc(f.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "0 1px",
                            fontSize: 14,
                            lineHeight: 1,
                            color: "var(--burgundy-600)",
                            display: "flex",
                            alignItems: "center"
                          }}
                          title="Remover"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Campo de busca + dropdown */}
                <div style={{ position: "relative" }}>
                  <input
                    style={styleInput}
                    value={funcSearch}
                    onChange={(e) => {
                      setFuncSearch(e.target.value);
                      setFuncDropdown(true);
                    }}
                    onFocus={() => setFuncDropdown(true)}
                    onBlur={() => setTimeout(() => setFuncDropdown(false), 160)}
                    placeholder="Buscar por nome, matrícula ou cargo…"
                    autoComplete="off"
                  />
                  {funcBuscando && (
                    <span
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 11,
                        color: "var(--ink-400)"
                      }}
                    >
                      buscando…
                    </span>
                  )}

                  {/* Dropdown de resultados */}
                  {funcDropdown && funcResultados.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        zIndex: 999,
                        background: "#fff",
                        border: "1px solid rgba(122,30,38,0.18)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
                        overflow: "hidden"
                      }}
                    >
                      {funcResultados.map((f, idx) => (
                        <div
                          key={f.id}
                          onMouseDown={() => selecionarFunc(f)}
                          style={{
                            padding: "9px 12px",
                            cursor: "pointer",
                            borderBottom:
                              idx < funcResultados.length - 1
                                ? "1px solid rgba(122,30,38,0.06)"
                                : "none",
                            background: "#fff",
                            transition: "background 120ms"
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLDivElement).style.background =
                              "rgba(122,30,38,0.04)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLDivElement).style.background = "#fff";
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)" }}>
                            {f.name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 1 }}>
                            {f.matricula} · {f.cargo} · {f.email}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Nenhum resultado */}
                  {funcDropdown &&
                    funcSearch.trim().length >= 2 &&
                    !funcBuscando &&
                    funcResultados.length === 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          left: 0,
                          right: 0,
                          zIndex: 999,
                          background: "#fff",
                          border: "1px solid rgba(122,30,38,0.12)",
                          borderRadius: "var(--radius-md)",
                          padding: "10px 14px",
                          fontSize: 12.5,
                          color: "var(--ink-400)"
                        }}
                      >
                        Nenhum funcionário ativo encontrado para "{funcSearch}".
                      </div>
                    )}
                </div>

                {funcSelecionados.length === 0 && (
                  <p style={{ fontSize: 11.5, color: "var(--ink-400)", margin: 0 }}>
                    Digite para buscar e clique no funcionário para adicioná-lo.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Assunto */}
          <div>
            <label style={styleLabel}>Assunto</label>
            <input
              style={styleInput}
              value={manualAssunto}
              onChange={(e) => setManualAssunto(e.target.value)}
              placeholder="Ex: Lembrete — assine o quadro de pontos de maio/2026"
            />
          </div>

          {/* Corpo */}
          <div>
            <label style={styleLabel}>Mensagem</label>
            <textarea
              style={{ ...styleInput, resize: "vertical" }}
              rows={6}
              value={manualCorpo}
              onChange={(e) => setManualCorpo(e.target.value)}
              placeholder="Texto da mensagem. Quebras de linha serão preservadas."
            />
          </div>

          {/* Resultado */}
          {manualResultado && (
            <div
              style={{
                padding: "10px 14px",
                background:
                  manualResultado.erros.length === 0
                    ? "rgba(47,125,79,0.06)"
                    : "rgba(200,57,63,0.06)",
                border: `1px solid ${manualResultado.erros.length === 0 ? "rgba(47,125,79,0.25)" : "rgba(200,57,63,0.25)"}`,
                borderRadius: "var(--radius-md)",
                fontSize: 12.5
              }}
            >
              <p
                style={{
                  margin: "0 0 4px",
                  fontWeight: 700,
                  color: manualResultado.erros.length === 0 ? "var(--green)" : "var(--red)"
                }}
              >
                {manualResultado.enviados}{" "}
                {manualResultado.tipo === "email"
                  ? "e-mail(s) enviado(s)"
                  : manualResultado.tipo === "sistema"
                    ? "notificação(ões) enviada(s) no sistema"
                    : "envio(s) realizado(s) (e-mail + sistema)"}{" "}
                com sucesso.
              </p>
              {manualResultado.erros.map((e, i) => (
                <p key={i} style={{ margin: "2px 0", color: "var(--red)" }}>
                  ⚠️ {e}
                </p>
              ))}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ alignSelf: "flex-start" }}
            disabled={
              manualEnviando ||
              !manualAssunto ||
              !manualCorpo ||
              (manualGrupo === "custom" && funcSelecionados.length === 0)
            }
            onClick={() => void enviarManual()}
          >
            {manualEnviando ? "Enviando…" : "Enviar Notificação"}
          </button>
        </div>
      </Secao>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
export function ConfiguracoesPage() {
  const { user, podeRh, permissoesRhCarregadas } = useAuth();
  /** Perfil do RH: a ação está liberada? Se não, avisa e interrompe. */
  function exigirFuncao(recurso: string): boolean {
    if (podeRh(recurso)) return true;
    alert("O seu perfil do RH não permite esta ação. Fale com o Gerente de RH.");
    return false;
  }
  const [tab, setTab] = useState<Tab>("institucional");
  const [config, setConfig] = useState<Config | null>(null);
  const [periodos, setPeriodos] = useState<ConfigPeriodos | null>(null);
  const [configSol, setConfigSol] = useState<ConfigSolicitacoes | null>(null);
  const [provedores, setProvedores] = useState<Provedor[]>([]);
  const [subredes, setSubredes] = useState<Subrede[]>([]);
  const [marcosBancoHoras, setMarcosBancoHoras] = useState<MarcoBancoHoras[]>([]);
  const [areas, setAreas] = useState<AreaViagem[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // JornadaPeriodo
  const [jornadas, setJornadas] = useState<JornadaPeriodo[]>([]);
  const [jpModal, setJpModal] = useState(false);
  const [jpEditando, setJpEditando] = useState<JornadaPeriodo | null>(null);
  const [jpForm, setJpForm] = useState<Omit<JornadaPeriodo, "id" | "ePadrao" | "ativo">>(JP_VAZIO);
  const [jpDiasUteis, setJpDiasUteis] = useState<boolean[]>([
    false,
    true,
    true,
    true,
    true,
    true,
    false
  ]);

  // Feriados
  const hoje = new Date();
  const [feriadosAno, setFeriadosAno] = useState(hoje.getFullYear());
  const [feriadosMes, setFeriadosMes] = useState(hoje.getMonth()); // 0-based
  const [feriados, setFeriados] = useState<FeriadoConfig[]>([]);
  const [feriadosLoading, setFeriadosLoading] = useState(false);
  const [feriadoModal, setFeriadoModal] = useState(false);
  const [feriadoForm, setFeriadoForm] = useState({
    data: "",
    nome: "",
    tipo: "MANUAL",
    observacao: "",
    bloqueiaRegistro: true,
    marcoHorario: "",
    marcoLado: "DEPOIS" as "ANTES" | "DEPOIS"
  });
  /** Ciência de que o abono do RH não é feriado convencional (obrigatória para salvar). */
  const [cienteAbono, setCienteAbono] = useState(false);
  const [editandoFeriado, setEditandoFeriado] = useState<FeriadoConfig | null>(null);
  const [feriadoSyncMsg, setFeriadoSyncMsg] = useState<string | null>(null);

  function notificarSyncFeriadosApi() {
    setFeriadoSyncMsg(
      "Alteração publicada automaticamente na API Servidora para sistemas conectados."
    );
    window.setTimeout(() => setFeriadoSyncMsg(null), 5000);
  }

  // Mapa modal
  const [mapaModal, setMapaModal] = useState(false);
  const [mapaAreaId, setMapaAreaId] = useState<string | null>(null); // null = sede

  // Novo provedor form
  const [novoProvedor, setNovoProvedor] = useState({ nome: "", ip: "", isPrincipal: false });
  // Nova subrede form
  const [novaSubrede, setNovaSubrede] = useState({ cidr: "", descricao: "" });
  // Nova data marco do Banco de Horas (dia/mês recorrente)
  const [novoMarco, setNovoMarco] = useState({ dia: "", mes: "", descricao: "" });
  // Nova área
  const [novaArea, setNovaArea] = useState({ nome: "", descricao: "" });

  // Geocodificação automática
  const [geocodingStatus, setGeocodingStatus] = useState<"idle" | "loading" | "ok" | "erro">(
    "idle"
  );
  const [geocodingMsg, setGeocodingMsg] = useState("");

  // IP público detectado
  const [ipPublico, setIpPublico] = useState("Detectando…");

  /* Carrega dados da API ao montar */
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 20_000);

    api
      .get<ConfigSolicitacoes>("/ponto/config/solicitacoes")
      .then((d) => {
        if (d) setConfigSol(d);
      })
      .catch(() => {});

    api
      .get<JornadaPeriodo[]>("/ponto/config/jornadas")
      .then((jps) => {
        setJornadas(jps ?? []);
      })
      .catch(() => {});

    Promise.all([
      api.get<SistemaApi>("/ponto/config/sistema"),
      api.get<Provedor[]>("/ponto/config/provedores"),
      api.get<Subrede[]>("/ponto/config/subredes"),
      api.get<AreaViagem[]>("/ponto/config/areas"),
      api.get<MarcoBancoHoras[]>("/ponto/config/banco-horas/marcos")
    ])
      .then(([sis, provs, subs, areasApi, marcos]) => {
        if (sis) {
          setConfig({
            nome: sis.nome,
            cnpj: sis.cnpj,
            endereco: sis.endereco ?? "",
            numero: sis.numero ?? "",
            bairro: sis.bairro ?? "",
            cidade: sis.cidade ?? "",
            uf: sis.uf ?? "",
            cep: sis.cep ?? "",
            telefone: sis.telefone ?? "",
            email: sis.emailInstitucional ?? "",
            lat: sis.lat,
            lng: sis.lng,
            raioMetros: sis.raioMetros,
            modoDesktop: sis.modoDesktop,
            modoMobile: sis.modoMobile,
            modoHibrido: sis.modoHibrido,
            modoViagem: sis.modoViagem,
            desktopCheckSubrede: sis.desktopCheckSubrede,
            desktopCheckGeo: sis.desktopCheckGeo,
            mobileCheckSubrede: sis.mobileCheckSubrede,
            mobileCheckGeo: sis.mobileCheckGeo,
            mobileExigirFoto: sis.mobileExigirFoto,
            hibridoExigirFoto: sis.hibridoExigirFoto,
            cicloCompletoEmCasaDesde: sis.cicloCompletoEmCasaDesde
              ? sis.cicloCompletoEmCasaDesde.slice(0, 10)
              : null,
            cicloCompletoPresencialDesde: sis.cicloCompletoPresencialDesde
              ? sis.cicloCompletoPresencialDesde.slice(0, 10)
              : null
          });
          const diasUteisParsed: boolean[] =
            typeof sis.diasUteis === "string" ? JSON.parse(sis.diasUteis) : sis.diasUteis;
          const calcFallback = calcJornadaEfetiva(
            sis.horaEntrada,
            sis.horaSaida,
            sis.almocoMinMin,
            diasUteisParsed
          );
          setPeriodos({
            horaEntrada: sis.horaEntrada,
            horaSaida: sis.horaSaida,
            pontoHorarioMinimo: sis.pontoHorarioMinimo ?? "06:00",
            pontoHorarioMaximo: sis.pontoHorarioMaximo ?? "23:59",
            jornadaDiariaMin: calcFallback.diaria,
            jornadaSemanalMin: calcFallback.semanal,
            diasUteis: diasUteisParsed,
            toleranciaEntradaMin: (() => {
              return Math.max(0, Number(sis.toleranciaEntradaMin ?? sis.toleranciaSaidaMin) || 5);
            })(),
            toleranciaSaidaMin: (() => {
              return Math.max(0, Number(sis.toleranciaEntradaMin ?? sis.toleranciaSaidaMin) || 5);
            })(),
            toleranciaHoraExtraMin: sis.toleranciaHoraExtraMin,
            toleranciaCalculoMin: 0,
            tipoFlexibilidade: sis.tipoFlexibilidade as ConfigPeriodos["tipoFlexibilidade"],
            almocoPodeIniciarA: sis.almocoPodeIniciarA,
            almocoPodeIniciarAte: sis.almocoPodeIniciarAte,
            almocoMinMin: sis.almocoMinMin,
            almocoMaxMin: sis.almocoMaxMin,
            hibridoMaxDiasSemana: sis.hibridoMaxDiasSemana,
            hibridoExigeAprovacao: sis.hibridoExigeAprovacao,
            viagemJanelaMinutos: sis.viagemJanelaMinutos,
            viagemExigeAprovacao: sis.viagemExigeAprovacao,
            bancoHorasLimiteMin: sis.bancoHorasLimiteMin,
            bancoHorasVigenciaDias: sis.bancoHorasVigenciaDias,
            horaExtraLimiteAuto: sis.horaExtraLimiteAuto ?? 120,
            interjornadaMin: sis.interjornadaMin ?? 660,
            intervaloLongoAcimaDeMin: sis.intervaloLongoAcimaDeMin ?? 360,
            intervaloCurtoAcimaDeMin: sis.intervaloCurtoAcimaDeMin ?? 240,
            intervaloCurtoMinMin: sis.intervaloCurtoMinMin ?? 15,
            bancoHorasSabadoPct: sis.bancoHorasSabadoPct ?? 100,
            bancoHorasDomingoPct: sis.bancoHorasDomingoPct ?? 200,
            bancoHorasFeriadoPct: sis.bancoHorasFeriadoPct ?? 200,
            contratoAvisoAntecedenciaDias: sis.contratoAvisoAntecedenciaDias ?? 90,
            jornadaAcordoColetivo: sis.jornadaAcordoColetivo ?? ""
          });
        }
        setProvedores(provs ?? []);
        setSubredes(subs ?? []);
        setAreas(areasApi ?? []);
        setMarcosBancoHoras(marcos ?? []);
      })
      .catch(() => {
        /* config/periodos permanecem null → tela de erro */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        clearTimeout(timeout);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((d) => setIpPublico(d.ip))
      .catch(() => setIpPublico("Não detectado"));
  }, []);

  useEffect(() => {
    if (tab !== "feriados") return;
    setFeriadosLoading(true);
    api
      .get<FeriadoConfig[]>(`/ponto/config/feriados?ano=${feriadosAno}`)
      .then(async (d) => {
        const lista = d ?? [];
        if (lista.length === 0) {
          // Auto-importa silenciosamente quando não há feriados para o ano
          await api.post(`/ponto/config/feriados/importar`, { ano: feriadosAno }).catch(() => {});
          const importados = await api
            .get<FeriadoConfig[]>(`/ponto/config/feriados?ano=${feriadosAno}`)
            .catch(() => null);
          setFeriados(importados ?? []);
        } else {
          setFeriados(lista);
        }
      })
      .catch(() => {})
      .finally(() => setFeriadosLoading(false));
  }, [tab, feriadosAno]);

  function feriadoDoMes() {
    return feriados.filter((f) => {
      const d = new Date(f.data);
      return d.getUTCMonth() === feriadosMes && d.getUTCFullYear() === feriadosAno;
    });
  }

  function feriadoPorDia(dia: number): FeriadoConfig | undefined {
    return feriados.find((f) => {
      const d = new Date(f.data);
      return (
        d.getUTCMonth() === feriadosMes &&
        d.getUTCFullYear() === feriadosAno &&
        d.getUTCDate() === dia
      );
    });
  }

  async function toggleFeriadoBloqueio(f: FeriadoConfig) {
    if (!exigirFuncao("configuracoes.feriados.gerenciar")) return;
    const updated = await api.patch<FeriadoConfig>(`/ponto/config/feriados/${f.id}/bloqueio`);
    setFeriados((prev) => prev.map((x) => (x.id === f.id ? updated : x)));
    notificarSyncFeriadosApi();
  }

  async function deletarFeriado(id: string) {
    const alvo = feriados.find((x) => x.id === id);
    if (
      !exigirFuncao(
        alvo?.tipo === TIPO_ABONO
          ? "configuracoes.feriados.abonar"
          : "configuracoes.feriados.gerenciar"
      )
    )
      return;
    await api.delete(`/ponto/config/feriados/${id}`);
    setFeriados((prev) => prev.filter((x) => x.id !== id));
    notificarSyncFeriadosApi();
  }

  function abrirModalDia(dia: number, feriado: FeriadoConfig | null, modoAbono = false) {
    setCienteAbono(false);
    const mm = String(feriadosMes + 1).padStart(2, "0");
    const dd = String(dia).padStart(2, "0");
    const dataStr = `${feriadosAno}-${mm}-${dd}`;
    if (feriado) {
      setEditandoFeriado(feriado);
      setFeriadoForm({
        data: dataStr,
        nome: feriado.nome,
        tipo: feriado.tipo,
        observacao: feriado.observacao ?? "",
        bloqueiaRegistro: feriado.bloqueiaRegistro,
        marcoHorario: feriado.marcoHorario ?? "",
        marcoLado: (feriado.marcoLado as "ANTES" | "DEPOIS") ?? "DEPOIS"
      });
    } else {
      setEditandoFeriado(null);
      setFeriadoForm({
        data: dataStr,
        nome: "",
        tipo: modoAbono ? TIPO_ABONO : "MANUAL",
        observacao: "",
        bloqueiaRegistro: true,
        marcoHorario: "",
        marcoLado: "DEPOIS"
      });
    }
    setFeriadoModal(true);
  }

  async function salvarFeriadoModal() {
    if (
      !exigirFuncao(
        feriadoForm.tipo === TIPO_ABONO || editandoFeriado?.tipo === TIPO_ABONO
          ? "configuracoes.feriados.abonar"
          : "configuracoes.feriados.gerenciar"
      )
    )
      return;
    if (!feriadoForm.data || !feriadoForm.nome.trim()) return;
    if (exigeCienciaAbono && !cienteAbono) return;
    /* Abono do RH: sempre dia inteiro e sempre bloqueia o registro (o backend também força). */
    const ehAbono = feriadoForm.tipo === TIPO_ABONO;
    const marcoPayload =
      feriadoForm.marcoHorario && !ehAbono
        ? { marcoHorario: feriadoForm.marcoHorario, marcoLado: feriadoForm.marcoLado }
        : { marcoHorario: null, marcoLado: null };

    if (editandoFeriado) {
      const atualizado = await api.patch<FeriadoConfig>(
        `/ponto/config/feriados/${editandoFeriado.id}`,
        {
          nome: feriadoForm.nome.trim(),
          tipo: feriadoForm.tipo,
          bloqueiaRegistro: ehAbono || feriadoForm.bloqueiaRegistro,
          observacao: feriadoForm.observacao || undefined,
          ...marcoPayload
        }
      );
      setFeriados((prev) => prev.map((f) => (f.id === editandoFeriado.id ? atualizado : f)));
    } else {
      const novo = await api.post<FeriadoConfig>("/ponto/config/feriados", {
        data: feriadoForm.data,
        nome: feriadoForm.nome.trim(),
        tipo: feriadoForm.tipo,
        bloqueiaRegistro: ehAbono || feriadoForm.bloqueiaRegistro,
        observacao: feriadoForm.observacao || undefined,
        ...marcoPayload
      });
      setFeriados((prev) => [...prev, novo].sort((a, b) => (a.data < b.data ? -1 : 1)));
      const d = new Date(`${feriadoForm.data}T00:00:00.000Z`);
      setFeriadosAno(d.getUTCFullYear());
      setFeriadosMes(d.getUTCMonth());
    }
    setFeriadoModal(false);
    notificarSyncFeriadosApi();
    setFeriadoForm({
      data: "",
      nome: "",
      tipo: "MANUAL",
      observacao: "",
      bloqueiaRegistro: true,
      marcoHorario: "",
      marcoLado: "DEPOIS"
    });
    setEditandoFeriado(null);
  }

  function navMes(delta: number) {
    let m = feriadosMes + delta;
    let a = feriadosAno;
    if (m < 0) {
      m = 11;
      a--;
    }
    if (m > 11) {
      m = 0;
      a++;
    }
    setFeriadosMes(m);
    if (a !== feriadosAno) setFeriadosAno(a);
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
  const TIPO_COR: Record<string, string> = {
    NACIONAL: "#b91c1c",
    DISTRITAL: "#1d4ed8",
    FACULTATIVO: "#b45309",
    MANUAL: "#7c3aed",
    [TIPO_ABONO]: ABONO_COR
  };
  const TIPO_LABEL_F: Record<string, string> = {
    NACIONAL: "Nacional",
    DISTRITAL: "Distrital (DF)",
    FACULTATIVO: "Facultativo",
    MANUAL: "Manual",
    [TIPO_ABONO]: "Abono do RH (não é feriado)"
  };

  /* Modalidade do modal: feriado convencional × abono do RH. Criar um abono, ou trocar a
     modalidade de um dia já salvo, exige confirmar ciência. */
  const ehAbonoForm = feriadoForm.tipo === TIPO_ABONO;
  const trocouModalidade =
    !!editandoFeriado && (editandoFeriado.tipo === TIPO_ABONO) !== ehAbonoForm;
  const exigeCienciaAbono = (ehAbonoForm && !editandoFeriado) || trocouModalidade;
  const dataAbonoPassada =
    ehAbonoForm && !!feriadoForm.data && feriadoForm.data < hojeBrasiliaISO();
  function escolherModalidade(abono: boolean) {
    if (abono === ehAbonoForm) return;
    setCienteAbono(false);
    setFeriadoForm((f) => ({
      ...f,
      tipo: abono
        ? TIPO_ABONO
        : editandoFeriado && editandoFeriado.tipo !== TIPO_ABONO
          ? editandoFeriado.tipo
          : "MANUAL",
      ...(abono ? { bloqueiaRegistro: true, marcoHorario: "" } : {})
    }));
  }

  function upd(k: keyof Config, v: Config[keyof Config]) {
    setConfig((c) => (c ? { ...c, [k]: v } : c));
  }

  /* Geocodificação automática via Nominatim — busca pelo endereço ou nome da instituição */
  async function geocodificar() {
    if (!config) return;
    setGeocodingStatus("loading");
    setGeocodingMsg("");

    const partes = [
      config.endereco,
      config.numero,
      config.bairro,
      config.cidade,
      config.uf,
      "Brasil"
    ]
      .filter(Boolean)
      .join(", ");

    const queries =
      partes.length > 10
        ? [partes, `${config.nome}, ${config.cidade}, Brasil`]
        : [`${config.nome}, ${config.cidade || ""}, Brasil`];

    for (const q of queries) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`,
          { headers: { "Accept-Language": "pt-BR" } }
        );
        const data = await res.json();
        if (data.length > 0) {
          const { lat, lon, display_name } = data[0];
          setConfig((c) => (c ? { ...c, lat: parseFloat(lat), lng: parseFloat(lon) } : c));
          setGeocodingStatus("ok");
          setGeocodingMsg(display_name);
          return;
        }
      } catch {
        /* tenta próxima query */
      }
    }

    setGeocodingStatus("erro");
    setGeocodingMsg("Endereço não encontrado. Ajuste o endereço ou posicione manualmente no mapa.");
  }

  async function salvarTudo() {
    if (!config || !periodos) return;
    /* Perfil do RH: envia só os grupos de campos que o usuário pode alterar. */
    const pInst = podeRh("configuracoes.institucional.salvar");
    const pReg = podeRh("configuracoes.registro.salvar");
    const pPer = podeRh("configuracoes.periodos.salvar");
    const pSol = podeRh("configuracoes.solicitacoes.salvar");
    if (!pInst && !pReg && !pPer && !pSol) {
      alert("O seu perfil do RH não permite salvar configurações. Fale com o Gerente de RH.");
      return;
    }
    const tudo: Record<string, unknown> = {
      // Instituição
      nome: config.nome,
      cnpj: config.cnpj,
      endereco: config.endereco,
      numero: config.numero,
      bairro: config.bairro,
      cidade: config.cidade,
      uf: config.uf,
      cep: config.cep,
      telefone: config.telefone,
      emailInstitucional: config.email,
      // Geoloc
      lat: config.lat,
      lng: config.lng,
      raioMetros: config.raioMetros,
      // Modos
      modoDesktop: config.modoDesktop,
      modoMobile: config.modoMobile,
      modoHibrido: config.modoHibrido,
      modoViagem: config.modoViagem,
      desktopCheckSubrede: config.desktopCheckSubrede,
      desktopCheckGeo: config.desktopCheckGeo,
      mobileCheckSubrede: config.mobileCheckSubrede,
      mobileCheckGeo: config.mobileCheckGeo,
      mobileExigirFoto: config.mobileExigirFoto,
      hibridoExigirFoto: config.hibridoExigirFoto,
      cicloCompletoEmCasaDesde: config.cicloCompletoEmCasaDesde ?? null,
      cicloCompletoPresencialDesde: config.cicloCompletoPresencialDesde ?? null,
      // Períodos
      horaEntrada: periodos.horaEntrada,
      horaSaida: periodos.horaSaida,
      pontoHorarioMinimo: periodos.pontoHorarioMinimo,
      pontoHorarioMaximo: periodos.pontoHorarioMaximo,
      jornadaDiariaMin: periodos.jornadaDiariaMin,
      jornadaSemanalMin: periodos.jornadaSemanalMin,
      diasUteis: JSON.stringify(periodos.diasUteis),
      toleranciaEntradaMin: periodos.toleranciaEntradaMin,
      toleranciaSaidaMin: periodos.toleranciaEntradaMin,
      toleranciaHoraExtraMin: periodos.toleranciaHoraExtraMin,
      toleranciaCalculoMin: 0,
      tipoFlexibilidade: periodos.tipoFlexibilidade,
      almocoPodeIniciarA: periodos.almocoPodeIniciarA,
      almocoPodeIniciarAte: periodos.almocoPodeIniciarAte,
      almocoMinMin: periodos.almocoMinMin,
      almocoMaxMin: periodos.almocoMaxMin,
      hibridoMaxDiasSemana: periodos.hibridoMaxDiasSemana,
      hibridoExigeAprovacao: periodos.hibridoExigeAprovacao,
      viagemJanelaMinutos: periodos.viagemJanelaMinutos,
      viagemExigeAprovacao: periodos.viagemExigeAprovacao,
      bancoHorasLimiteMin: periodos.bancoHorasLimiteMin,
      bancoHorasVigenciaDias: periodos.bancoHorasVigenciaDias,
      horaExtraLimiteAuto: periodos.horaExtraLimiteAuto,
      interjornadaMin: periodos.interjornadaMin,
      intervaloLongoAcimaDeMin: periodos.intervaloLongoAcimaDeMin,
      intervaloCurtoAcimaDeMin: periodos.intervaloCurtoAcimaDeMin,
      intervaloCurtoMinMin: periodos.intervaloCurtoMinMin
    };
    const payload = Object.fromEntries(
      Object.entries(tudo).filter(([campo]) => {
        if (CAMPOS_SISTEMA_POR_FUNCAO["configuracoes.institucional.salvar"].includes(campo))
          return pInst;
        if (CAMPOS_SISTEMA_POR_FUNCAO["configuracoes.registro.salvar"].includes(campo)) return pReg;
        return pPer;
      })
    );
    if (Object.keys(payload).length) await api.put("/ponto/config/sistema", payload);
    // Salva regras de solicitações se na aba correspondente ou se foi editada
    if (configSol && pSol) {
      await api.put("/ponto/config/solicitacoes", configSol);
    }

    invalidateInstituicaoBranding();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  /* ── JornadaPeriodo ── */
  function abrirJpModal(jp: JornadaPeriodo | null) {
    if (jp) {
      setJpEditando(jp);
      const dias: boolean[] =
        typeof jp.diasUteis === "string" ? JSON.parse(jp.diasUteis) : jp.diasUteis;
      setJpDiasUteis(dias);
      const calc = calcJornadaEfetiva(jp.horaEntrada, jp.horaSaida, jp.almocoMinMin, dias);
      const tol = Math.max(0, Number(jp.toleranciaEntradaMin ?? jp.toleranciaSaidaMin) || 5);
      setJpForm({
        nome: jp.nome,
        descricao: jp.descricao ?? "",
        horaEntrada: jp.horaEntrada,
        horaSaida: jp.horaSaida,
        jornadaDiariaMin: calc.diaria,
        jornadaSemanalMin: calc.semanal,
        diasUteis: jp.diasUteis,
        tipoFlexibilidade: jp.tipoFlexibilidade,
        toleranciaEntradaMin: tol,
        toleranciaSaidaMin: tol,
        toleranciaHoraExtraMin: jp.toleranciaHoraExtraMin,
        toleranciaCalculoMin: 0,
        almocoPodeIniciarA: jp.almocoPodeIniciarA,
        almocoPodeIniciarAte: jp.almocoPodeIniciarAte,
        almocoMinMin: jp.almocoMinMin,
        almocoMaxMin: jp.almocoMaxMin,
        bancoHorasLimiteMin: jp.bancoHorasLimiteMin,
        bancoHorasVigenciaDias: jp.bancoHorasVigenciaDias,
        horaExtraLimiteAuto: jp.horaExtraLimiteAuto,
        paraEstagiarios: !!jp.paraEstagiarios
      });
    } else {
      const diasPadrao = [false, true, true, true, true, true, false];
      setJpEditando(null);
      setJpDiasUteis(diasPadrao);
      const calc = calcJornadaEfetiva(
        JP_VAZIO.horaEntrada,
        JP_VAZIO.horaSaida,
        JP_VAZIO.almocoMinMin,
        diasPadrao
      );
      setJpForm({ ...JP_VAZIO, jornadaDiariaMin: calc.diaria, jornadaSemanalMin: calc.semanal });
    }
    setJpModal(true);
  }

  async function salvarJornada() {
    if (!exigirFuncao("configuracoes.periodos.jornadas")) return;
    if (!jpForm.nome.trim()) return;
    const tol = Math.max(0, Number(jpForm.toleranciaEntradaMin) || 0);
    const payload = {
      ...jpForm,
      diasUteis: JSON.stringify(jpDiasUteis),
      toleranciaEntradaMin: tol,
      toleranciaSaidaMin: tol,
      toleranciaCalculoMin: 0
    };
    if (jpEditando) {
      const atualizado = await api.put<JornadaPeriodo>(
        `/ponto/config/jornadas/${jpEditando.id}`,
        payload
      );
      setJornadas((prev) => prev.map((j) => (j.id === jpEditando.id ? atualizado : j)));
    } else {
      const novo = await api.post<JornadaPeriodo>("/ponto/config/jornadas", payload);
      setJornadas((prev) => [...prev, novo]);
    }
    setJpModal(false);
  }

  async function excluirJornada(id: string) {
    if (!exigirFuncao("configuracoes.periodos.jornadas")) return;
    try {
      await api.delete(`/ponto/config/jornadas/${id}`);
      setJornadas((prev) => prev.filter((j) => j.id !== id));
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? "Erro ao excluir.");
    }
  }

  async function setJornadaPadrao(id: string) {
    if (!exigirFuncao("configuracoes.periodos.jornadas")) return;
    const atualizada = await api.patch<JornadaPeriodo>(`/ponto/config/jornadas/${id}/padrao`);
    setJornadas((prev) => prev.map((j) => ({ ...j, ePadrao: j.id === atualizada.id })));
  }

  /* ── Provedores ── */
  async function addProvedor() {
    if (!exigirFuncao("configuracoes.rede.provedores")) return;
    if (!novoProvedor.nome || !novoProvedor.ip) return;
    const novo = await api.post<Provedor>("/ponto/config/provedores", novoProvedor);
    setProvedores((p) => [...p, novo]);
    setNovoProvedor({ nome: "", ip: "", isPrincipal: false });
  }
  async function removeProvedor(id: string) {
    if (!exigirFuncao("configuracoes.rede.provedores")) return;
    await api.delete(`/ponto/config/provedores/${id}`);
    setProvedores((p) => p.filter((x) => x.id !== id));
  }
  async function toggleProvedor(id: string) {
    if (!exigirFuncao("configuracoes.rede.provedores")) return;
    const atualizado = await api.patch<Provedor>(`/ponto/config/provedores/${id}/toggle`);
    setProvedores((p) => p.map((x) => (x.id === id ? atualizado : x)));
  }

  /* ── Subredes ── */
  async function addSubrede() {
    if (!exigirFuncao("configuracoes.rede.subredes")) return;
    if (!novaSubrede.cidr) return;
    const nova = await api.post<Subrede>("/ponto/config/subredes", novaSubrede);
    setSubredes((s) => [...s, nova]);
    setNovaSubrede({ cidr: "", descricao: "" });
  }
  async function removeSubrede(id: string) {
    if (!exigirFuncao("configuracoes.rede.subredes")) return;
    await api.delete(`/ponto/config/subredes/${id}`);
    setSubredes((s) => s.filter((x) => x.id !== id));
  }

  /* ── Banco de Horas: datas marco (dia/mês anual) ── */
  async function addMarcoBancoHoras() {
    if (!exigirFuncao("configuracoes.periodos.marcos")) return;
    const dia = Number(novoMarco.dia);
    const mes = Number(novoMarco.mes);
    if (!dia || !mes) return;
    const novo = await api.post<MarcoBancoHoras>("/ponto/config/banco-horas/marcos", {
      dia,
      mes,
      descricao: novoMarco.descricao || undefined
    });
    setMarcosBancoHoras((m) =>
      [...m, novo].sort((a, b) => a.mes - b.mes || a.dia - b.dia || (a.ano ?? 0) - (b.ano ?? 0))
    );
    setNovoMarco({ dia: "", mes: "", descricao: "" });
  }
  async function removeMarcoBancoHoras(id: string) {
    if (!exigirFuncao("configuracoes.periodos.marcos")) return;
    await api.delete(`/ponto/config/banco-horas/marcos/${id}`);
    setMarcosBancoHoras((m) => m.filter((x) => x.id !== id));
  }

  /* ── Áreas ── */
  function addArea() {
    if (!novaArea.nome) return;
    setMapaAreaId("NEW:" + novaArea.nome + ":" + novaArea.descricao);
    setMapaModal(true);
  }
  async function removeArea(id: string) {
    if (!exigirFuncao("configuracoes.areas.gerenciar")) return;
    await api.delete(`/ponto/config/areas/${id}`);
    setAreas((a) => a.filter((x) => x.id !== id));
  }
  async function toggleArea(id: string) {
    if (!exigirFuncao("configuracoes.areas.gerenciar")) return;
    const atualizada = await api.patch<AreaViagem>(`/ponto/config/areas/${id}/toggle`);
    setAreas((a) => a.map((x) => (x.id === id ? atualizada : x)));
  }

  /* ── Callback do mapa ── */
  async function onMapaConfirm(res: { lat: number; lng: number; raio: number }) {
    if (mapaAreaId !== null && !exigirFuncao("configuracoes.areas.gerenciar")) return;
    if (mapaAreaId === null) {
      upd("lat", res.lat);
      upd("lng", res.lng);
      upd("raioMetros", res.raio);
    } else if (mapaAreaId.startsWith("NEW:")) {
      const parts = mapaAreaId.split(":");
      const nova = await api.post<AreaViagem>("/ponto/config/areas", {
        nome: parts[1],
        descricao: parts[2] ?? "",
        lat: res.lat,
        lng: res.lng,
        raioMetros: res.raio
      });
      setAreas((a) => [...a, nova]);
      setNovaArea({ nome: "", descricao: "" });
    } else {
      const atualizada = await api.patch<AreaViagem>(`/ponto/config/areas/${mapaAreaId}`, {
        lat: res.lat,
        lng: res.lng,
        raioMetros: res.raio
      });
      setAreas((a) => a.map((x) => (x.id === mapaAreaId ? atualizada : x)));
    }
  }

  /* ─── Tabs ─── */
  const TABS: { key: Tab; label: string }[] = [
    { key: "institucional", label: "Instituição" },
    { key: "rede", label: "Rede & IP" },
    { key: "periodos", label: "Períodos" },
    { key: "modos", label: "Registro" },
    { key: "areas", label: "Áreas Especiais" },
    { key: "solicitacoes", label: "Solicitações" },
    { key: "feriados", label: "Feriados" },
    { key: "notificacoes", label: "Notificações" },
    { key: "termos", label: "Termos de uso" }
  ];
  /* Perfil do RH: cada aba corresponde a uma aba do catálogo (recursosRh). */
  const RECURSO_TAB: Record<Tab, string> = {
    institucional: "configuracoes.institucional",
    rede: "configuracoes.rede",
    periodos: "configuracoes.periodos",
    modos: "configuracoes.registro",
    areas: "configuracoes.areas",
    solicitacoes: "configuracoes.solicitacoes",
    feriados: "configuracoes.feriados",
    notificacoes: "configuracoes.notificacoes",
    termos: "configuracoes.termos"
  };
  const TABS_PERMITIDAS = TABS.filter((t) => podeRh(RECURSO_TAB[t.key]));
  const funcoesDaTab = ABAS_RH.find((a) => a.chave === RECURSO_TAB[tab])?.funcoes ?? [];
  /* Aba sem nenhuma função liberada: tudo fica somente leitura. */
  const somenteLeitura = !funcoesDaTab.some((fn) => podeRh(fn.chave));
  const podeSalvarGeral = [
    "configuracoes.institucional.salvar",
    "configuracoes.registro.salvar",
    "configuracoes.periodos.salvar",
    "configuracoes.solicitacoes.salvar"
  ].some((r) => podeRh(r));
  useEffect(() => {
    if (TABS_PERMITIDAS.length && !TABS_PERMITIDAS.some((t) => t.key === tab)) {
      setTab(TABS_PERMITIDAS[0].key);
    }
  }, [TABS_PERMITIDAS.map((t) => t.key).join(","), tab]);

  if (permissoesRhCarregadas && TABS_PERMITIDAS.length === 0) {
    return <SemAcessoRh pagina="Configurações" />;
  }

  if (loading) {
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

  if (!config || !periodos) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          gap: 12
        }}
      >
        <p style={{ color: "var(--red)", fontSize: 14 }}>
          ⚠️ Não foi possível carregar as configurações do sistema.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Administração
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            <em>Configurações</em> do Sistema
          </h1>
        </div>
        {podeSalvarGeral && (
          <button className="btn btn-primary" onClick={salvarTudo} style={{ gap: 8 }}>
            {saved ? (
              <>
                <CheckCircleIcon size={16} /> Salvo!
              </>
            ) : (
              <>
                <SettingsIcon size={16} /> Salvar Configurações
              </>
            )}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          background: "var(--cream-100)",
          borderRadius: "var(--radius-lg)",
          padding: 4,
          marginBottom: 20,
          flexWrap: "nowrap",
          overflowX: "auto"
        }}
      >
        {TABS_PERMITIDAS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              padding: "9px 10px",
              borderRadius: "var(--radius-md)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
              transition: "all 160ms",
              background: tab === t.key ? "#fff" : "transparent",
              color: tab === t.key ? "var(--burgundy-600)" : "var(--ink-500)",
              boxShadow: tab === t.key ? "0 1px 4px rgba(122,30,38,0.10)" : "none"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {somenteLeitura && (
        <p
          role="note"
          style={{
            margin: "0 0 14px",
            padding: "8px 12px",
            borderRadius: "var(--radius-md)",
            background: "var(--cream-50)",
            border: "1px solid rgba(122,30,38,0.12)",
            fontSize: 12.5,
            color: "var(--ink-600)"
          }}
        >
          🔒 Somente leitura: o seu perfil do RH permite ver esta aba, mas não alterá-la.
        </p>
      )}
      <fieldset disabled={somenteLeitura} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {/* ═══════ TAB: INSTITUIÇÃO ═══════ */}
        {tab === "institucional" && (
          <>
            <Secao titulo="Dados Institucionais" icon={<BuildingIcon size={18} />}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <Campo
                    label="Nome da Instituição"
                    value={config.nome}
                    onChange={(v: string) => upd("nome", v)}
                    placeholder="Conselho Federal de Odontologia"
                  />
                </div>
                <Campo
                  label="CNPJ"
                  value={config.cnpj}
                  onChange={(v: string) => upd("cnpj", v)}
                  placeholder="00.000.000/0001-00"
                  mono
                />
                <Campo
                  label="Telefone"
                  value={config.telefone}
                  onChange={(v: string) => upd("telefone", v)}
                  placeholder="(61) 3044-3400"
                />
                <div style={{ gridColumn: "1/-1" }}>
                  <Campo
                    label="E-mail institucional"
                    value={config.email}
                    onChange={(v: string) => upd("email", v)}
                    placeholder="cfo@cfo.org.br"
                    type="email"
                  />
                </div>
              </div>
            </Secao>

            <Secao titulo="Endereço" icon={<MapPinIcon size={18} />}>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 14 }}>
                <Campo
                  label="Logradouro"
                  value={config.endereco}
                  onChange={(v: string) => upd("endereco", v)}
                  placeholder="SAUS Qd. 1 Bloco J"
                />
                <Campo
                  label="Número"
                  value={config.numero}
                  onChange={(v: string) => upd("numero", v)}
                  placeholder="S/N"
                />
                <div style={{ gridColumn: "1/-1" }}>
                  <Campo
                    label="Bairro / Setor"
                    value={config.bairro}
                    onChange={(v: string) => upd("bairro", v)}
                    placeholder="Setor de Autarquias Sul"
                  />
                </div>
                <Campo
                  label="Cidade"
                  value={config.cidade}
                  onChange={(v: string) => upd("cidade", v)}
                  placeholder="Brasília"
                />
                <Campo
                  label="UF"
                  value={config.uf}
                  onChange={(v: string) => upd("uf", v)}
                  placeholder="DF"
                />
                <Campo
                  label="CEP"
                  value={config.cep}
                  onChange={(v: string) => upd("cep", v)}
                  placeholder="70000-000"
                  mono
                />
              </div>
            </Secao>

            <Secao titulo="Geolocalização & Perímetro" icon={<MapPinIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.6 }}
              >
                As coordenadas são preenchidas automaticamente a partir do endereço ou nome da
                instituição acima. Você também pode ajustar o marcador diretamente no mapa
                interativo.
              </p>

              {/* Botão de busca automática */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 14,
                  alignItems: "flex-start",
                  flexWrap: "wrap"
                }}
              >
                <button
                  onClick={geocodificar}
                  disabled={geocodingStatus === "loading"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "9px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "var(--burgundy-600)",
                    color: "#fff",
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: geocodingStatus === "loading" ? "wait" : "pointer",
                    opacity: geocodingStatus === "loading" ? 0.7 : 1,
                    transition: "opacity 150ms"
                  }}
                >
                  <MapPinIcon size={15} />
                  {geocodingStatus === "loading" ? "Buscando…" : "Buscar coordenadas pelo endereço"}
                </button>

                {/* Feedback */}
                {geocodingStatus === "ok" && (
                  <div
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(47,125,79,0.08)",
                      border: "1px solid rgba(47,125,79,0.20)",
                      fontSize: 12.5,
                      color: "var(--green)",
                      lineHeight: 1.5
                    }}
                  >
                    <strong>✓ Encontrado:</strong> {geocodingMsg}
                  </div>
                )}
                {geocodingStatus === "erro" && (
                  <div
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(200,57,63,0.06)",
                      border: "1px solid rgba(200,57,63,0.18)",
                      fontSize: 12.5,
                      color: "var(--red)",
                      lineHeight: 1.5
                    }}
                  >
                    {geocodingMsg}
                  </div>
                )}
              </div>

              {/* Coordenadas editáveis */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                  marginBottom: 14
                }}
              >
                <Campo
                  label="Latitude"
                  value={config.lat.toFixed(6)}
                  onChange={(v: string) => upd("lat", parseFloat(v))}
                  mono
                />
                <Campo
                  label="Longitude"
                  value={config.lng.toFixed(6)}
                  onChange={(v: string) => upd("lng", parseFloat(v))}
                  mono
                />
                <Campo
                  label="Raio (metros)"
                  value={String(config.raioMetros)}
                  onChange={(v: string) => upd("raioMetros", parseInt(v))}
                  mono
                />
              </div>

              {/* Preview + botão mapa */}
              <div
                style={{
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8
                }}
              >
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-700)" }}>
                    {config.cidade || "—"} — {config.uf || "—"}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      color: "var(--ink-500)",
                      marginTop: 2
                    }}
                  >
                    {config.lat.toFixed(6)}, {config.lng.toFixed(6)} · raio {config.raioMetros} m
                  </p>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setMapaAreaId(null);
                    setMapaModal(true);
                  }}
                  style={{ gap: 6, fontSize: 13, border: "1.5px solid rgba(122,30,38,0.22)" }}
                >
                  <MapPinIcon size={14} />
                  Ajustar no Mapa
                </button>
              </div>
            </Secao>
            <ConfigRepP />
          </>
        )}

        {/* ═══════ TAB: REDE & IP ═══════ */}
        {tab === "rede" && (
          <>
            {/* IP público detectado */}
            <Secao titulo="IP Público desta Sessão" icon={<InfoIcon size={18} />}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div
                  style={{
                    background: "var(--cream-50)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 16px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--burgundy-600)",
                    letterSpacing: "0.04em"
                  }}
                >
                  {ipPublico}
                </div>
                <p style={{ fontSize: 12.5, color: "var(--ink-500)", flex: 1, lineHeight: 1.6 }}>
                  IP público detectado automaticamente. Use este valor como referência para
                  configurar os provedores abaixo.
                </p>
              </div>
            </Secao>

            {/* Provedores */}
            <Secao titulo="Provedores de Internet" icon={<ShieldCheckIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}
              >
                Configure os IPs públicos dos provedores do CFO. O sistema verificará se o IP do
                computador pertence a um provedor cadastrado antes de permitir o registro de ponto
                desktop.
              </p>

              {/* Lista */}
              <div style={{ marginBottom: 16 }}>
                {provedores.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      background: p.ativo ? "rgba(47,125,79,0.05)" : "var(--cream-50)",
                      border: `1px solid ${p.ativo ? "rgba(47,125,79,0.15)" : "rgba(122,30,38,0.08)"}`,
                      borderRadius: "var(--radius-md)",
                      marginBottom: 8
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>
                          {p.nome}
                        </p>
                        {p.isPrincipal && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              background: "var(--burgundy-600)",
                              color: "#fff",
                              padding: "2px 7px",
                              borderRadius: "var(--radius-full)"
                            }}
                          >
                            PRINCIPAL
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12.5,
                          color: "var(--ink-500)",
                          marginTop: 2
                        }}
                      >
                        {p.ip}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: p.ativo ? "var(--green)" : "var(--gray-cfo)"
                      }}
                    >
                      {p.ativo ? "● Ativo" : "○ Inativo"}
                    </span>
                    <button
                      onClick={() => toggleProvedor(p.id)}
                      title={p.ativo ? "Desativar" : "Ativar"}
                      style={{
                        padding: 6,
                        border: "1px solid rgba(122,30,38,0.14)",
                        borderRadius: "var(--radius-sm)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--ink-500)",
                        fontSize: 11
                      }}
                    >
                      {p.ativo ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => removeProvedor(p.id)}
                      style={{
                        padding: 6,
                        border: "1px solid rgba(200,57,63,0.20)",
                        borderRadius: "var(--radius-sm)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--red)",
                        display: "flex"
                      }}
                    >
                      <Trash2Icon size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Adicionar provedor */}
              <div
                style={{
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                  border: "1px dashed rgba(122,30,38,0.20)"
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    marginBottom: 10,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase"
                  }}
                >
                  Adicionar provedor redundante
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr",
                    gap: 10,
                    marginBottom: 10
                  }}
                >
                  <input
                    value={novoProvedor.nome}
                    onChange={(e) => setNovoProvedor((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Nome do provedor"
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13,
                      fontFamily: "var(--font-body)",
                      outline: "none"
                    }}
                  />
                  <input
                    value={novoProvedor.ip}
                    onChange={(e) => setNovoProvedor((p) => ({ ...p, ip: e.target.value }))}
                    placeholder="IP ex: 200.150.10.1"
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      outline: "none"
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      color: "var(--ink-700)",
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={novoProvedor.isPrincipal}
                      onChange={(e) =>
                        setNovoProvedor((p) => ({ ...p, isPrincipal: e.target.checked }))
                      }
                      style={{ accentColor: "var(--burgundy-600)" }}
                    />
                    Marcar como principal
                  </label>
                  <button
                    className="btn btn-primary"
                    onClick={addProvedor}
                    style={{ gap: 6, fontSize: 13, padding: "7px 14px" }}
                  >
                    <PlusIcon size={14} /> Adicionar
                  </button>
                </div>
              </div>
            </Secao>

            {/* Subredes */}
            <Secao titulo="Subredes Configuradas (CIDR)" icon={<ShieldCheckIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}
              >
                Subredes da rede interna do CFO. O sistema valida se o computador ou celular (Wi-Fi)
                pertence a uma dessas subredes antes de permitir o registro de ponto.
              </p>

              <div style={{ marginBottom: 14 }}>
                {subredes.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      background: "rgba(30,74,122,0.04)",
                      border: "1px solid rgba(30,74,122,0.12)",
                      borderRadius: "var(--radius-md)",
                      marginBottom: 8
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--blue-ink)"
                        }}
                      >
                        {s.cidr}
                      </p>
                      {s.descricao && (
                        <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                          {s.descricao}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeSubrede(s.id)}
                      style={{
                        padding: 6,
                        border: "1px solid rgba(200,57,63,0.20)",
                        borderRadius: "var(--radius-sm)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--red)",
                        display: "flex"
                      }}
                    >
                      <Trash2Icon size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div
                style={{
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                  border: "1px dashed rgba(122,30,38,0.20)"
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    marginBottom: 10,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase"
                  }}
                >
                  Adicionar subrede
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 2fr",
                    gap: 10,
                    marginBottom: 10
                  }}
                >
                  <input
                    value={novaSubrede.cidr}
                    onChange={(e) => setNovaSubrede((s) => ({ ...s, cidr: e.target.value }))}
                    placeholder="Ex: 192.168.1.0/24"
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      outline: "none"
                    }}
                  />
                  <input
                    value={novaSubrede.descricao}
                    onChange={(e) => setNovaSubrede((s) => ({ ...s, descricao: e.target.value }))}
                    placeholder="Descrição (opcional)"
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13,
                      fontFamily: "var(--font-body)",
                      outline: "none"
                    }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={addSubrede}
                  style={{ gap: 6, fontSize: 13, padding: "7px 14px" }}
                >
                  <PlusIcon size={14} /> Adicionar Subrede
                </button>
              </div>
            </Secao>
          </>
        )}

        {/* ═══════ TAB: MODOS DE REGISTRO ═══════ */}
        {tab === "modos" && (
          <>
            {/* Desktop */}
            <Secao titulo="Computador (Desktop)" icon={<SettingsIcon size={18} />}>
              <Toggle
                value={config.modoDesktop}
                onChange={(v) => upd("modoDesktop", v)}
                label="Habilitar registro por computador"
                desc="Permite registrar o ponto via navegador desktop"
              />
              {config.modoDesktop && (
                <>
                  <Toggle
                    value={config.desktopCheckSubrede}
                    onChange={(v) => upd("desktopCheckSubrede", v)}
                    label="Verificar IP do provedor"
                    desc="Compara o IP público do computador com os provedores cadastrados"
                  />
                  <Toggle
                    value={config.desktopCheckGeo}
                    onChange={(v) => upd("desktopCheckGeo", v)}
                    label="Verificar geolocalização (complementar)"
                    desc="Verifica se o computador está dentro do perímetro configurado. Exige permissão de localização."
                  />
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      background: "rgba(30,74,122,0.06)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12.5,
                      color: "var(--blue-ink)",
                      lineHeight: 1.6
                    }}
                  >
                    <strong>Critérios de validação:</strong> IP provedor{" "}
                    {config.desktopCheckGeo && "+ Geolocalização"}. Sem exigência de fotografia para
                    o modo desktop.
                  </div>
                </>
              )}
            </Secao>

            {/* Mobile */}
            <Secao titulo="Celular (Mobile)" icon={<SettingsIcon size={18} />}>
              <Toggle
                value={config.modoMobile}
                onChange={(v) => upd("modoMobile", v)}
                label="Habilitar registro por celular"
                desc="Permite registrar o ponto via aplicativo ou navegador mobile"
              />
              {config.modoMobile && (
                <>
                  <Toggle
                    value={config.mobileCheckSubrede}
                    onChange={(v) => upd("mobileCheckSubrede", v)}
                    label="Verificar rede Wi-Fi (subrede)"
                    desc="Confere se o celular está conectado à rede Wi-Fi do CFO"
                  />
                  <Toggle
                    value={config.mobileCheckGeo}
                    onChange={(v) => upd("mobileCheckGeo", v)}
                    label="Verificar geolocalização (obrigatório para mobile)"
                    desc="O celular deve estar dentro do raio configurado na sede do CFO"
                  />
                  <Toggle
                    value={config.mobileExigirFoto}
                    onChange={(v) => upd("mobileExigirFoto", v)}
                    label="Exigir fotografia (biometria)"
                    desc="O funcionário deve se fotografar pela câmera frontal para confirmar o registro"
                  />
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      background: "rgba(47,125,79,0.07)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12.5,
                      color: "var(--green)",
                      lineHeight: 1.6
                    }}
                  >
                    <strong>Critérios de validação:</strong> Geolocalização dentro do raio{" "}
                    {config.mobileCheckSubrede && "+ Wi-Fi/Subrede"}{" "}
                    {config.mobileExigirFoto && "+ Fotografia biométrica"}.
                  </div>
                </>
              )}
            </Secao>

            {/* Híbrido */}
            <Secao titulo="Híbrido (Home Office)" icon={<SettingsIcon size={18} />}>
              <Toggle
                value={config.modoHibrido}
                onChange={(v) => upd("modoHibrido", v)}
                label="Habilitar modo híbrido"
                desc="Funcionários em regime híbrido registram o ponto de casa pelo celular"
              />
              {config.modoHibrido && (
                <>
                  <Toggle
                    value={config.hibridoExigirFoto}
                    onChange={(v) => upd("hibridoExigirFoto", v)}
                    label="Exigir fotografia"
                    desc="Fotografia obrigatória para registro no modo híbrido"
                  />
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      background: "rgba(247,196,55,0.10)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12.5,
                      color: "#8a6a00",
                      lineHeight: 1.6
                    }}
                  >
                    Cada funcionário deve ter o <strong>endereço residencial configurado</strong>{" "}
                    (Gestão → Funcionários). O registro é validado pela geolocalização do endereço
                    de cada um. Exclusivo por celular.
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <a
                      href="/ponto/gestao"
                      style={{ fontSize: 13, color: "var(--burgundy-600)", fontWeight: 500 }}
                    >
                      → Gerenciar endereços residenciais dos funcionários
                    </a>
                  </div>
                </>
              )}
            </Secao>

            {/* Ciclo completo de batidas — presencial */}
            <Secao
              titulo="Ciclo completo de batidas — presencial"
              icon={<SettingsIcon size={18} />}
            >
              <Toggle
                value={!!config.cicloCompletoPresencialDesde}
                onChange={(v) => upd("cicloCompletoPresencialDesde", v ? hojeBrasiliaISO() : null)}
                label="Exigir o ciclo de batidas da lei nos dias presenciais"
                desc="O dia só fica OK com o intervalo que a jornada exige (CLT art. 71): almoço para jornadas longas; almoço ou pausa para jornadas curtas. Entrada + Saída não bastam. Os limites ficam em Períodos → Intervalo do Almoço."
              />
              {config.cicloCompletoPresencialDesde && (
                <>
                  <div style={{ marginTop: 10, maxWidth: 220 }}>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)",
                        display: "block",
                        marginBottom: 5
                      }}
                    >
                      Vale a partir de
                    </label>
                    <input
                      type="date"
                      value={config.cicloCompletoPresencialDesde}
                      onChange={(e) => upd("cicloCompletoPresencialDesde", e.target.value || null)}
                      style={{
                        width: "100%",
                        padding: "9px 11px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        fontSize: 14,
                        boxSizing: "border-box" as const
                      }}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      background: "rgba(247,196,55,0.10)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12.5,
                      color: "#8a6a00",
                      lineHeight: 1.6
                    }}
                  >
                    <strong>Dias anteriores a esta data não mudam.</strong> A partir dela, o dia sem
                    o intervalo exigido fica <strong>Inconsistente</strong> (impede assinar o quadro
                    até regularizar por Correção de ponto). A <strong>Falta</strong> (nenhum
                    registro no dia) não impede a assinatura. O registro de ponto não é bloqueado: a
                    tela apenas avisa antes da Saída.{" "}
                    <strong>Estagiários e jovens aprendizes</strong> (que não fazem intervalo de
                    almoço) são exceção e ficam fora, assim como atestado que cobre o almoço,
                    feriado parcial, isentos de ponto e dias em casa (que têm regra própria).
                  </div>
                </>
              )}
            </Secao>

            {/* Ciclo completo de batidas em casa */}
            <Secao titulo="Ciclo completo de batidas em casa" icon={<SettingsIcon size={18} />}>
              <Toggle
                value={!!config.cicloCompletoEmCasaDesde}
                onChange={(v) => upd("cicloCompletoEmCasaDesde", v ? hojeBrasiliaISO() : null)}
                label="Exigir o ciclo completo nos dias em casa"
                desc="Em home office/híbrido em casa, o dia só fica OK com Entrada, Início e Fim do intervalo e Saída (pares adicionais, como pausas, precisam estar fechados). Entrada + Saída não bastam."
              />
              {config.cicloCompletoEmCasaDesde && (
                <>
                  <div style={{ marginTop: 10, maxWidth: 220 }}>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)",
                        display: "block",
                        marginBottom: 5
                      }}
                    >
                      Vale a partir de
                    </label>
                    <input
                      type="date"
                      value={config.cicloCompletoEmCasaDesde}
                      onChange={(e) => upd("cicloCompletoEmCasaDesde", e.target.value || null)}
                      style={{
                        width: "100%",
                        padding: "9px 11px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        fontSize: 14,
                        boxSizing: "border-box" as const
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      background: "rgba(247,196,55,0.10)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12.5,
                      color: "#8a6a00",
                      lineHeight: 1.6
                    }}
                  >
                    <strong>Dias anteriores a esta data não mudam.</strong> A partir dela: o dia em
                    casa sem o ciclo completo fica <strong>Inconsistente</strong> (e impede assinar
                    o quadro até regularizar por Correção de ponto), e o registro da{" "}
                    <strong>Saída é bloqueado</strong> enquanto o intervalo de almoço não for
                    registrado. Não vale para turnos sem intervalo, estagiários e jovens aprendizes
                    e feriado parcial.
                  </div>
                </>
              )}
            </Secao>

            {/* Viagem */}
            <Secao titulo="Viagem / Área Externa" icon={<MapPinIcon size={18} />}>
              <Toggle
                value={config.modoViagem}
                onChange={(v) => upd("modoViagem", v)}
                label="Habilitar modo viagem"
                desc="Permite registro em áreas externas pré-configuradas (outras cidades, eventos, etc.)"
              />
              {config.modoViagem && (
                <>
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      background: "rgba(122,30,38,0.05)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 12.5,
                      color: "var(--ink-700)",
                      lineHeight: 1.6
                    }}
                  >
                    O funcionário pode registrar o ponto dentro das <strong>áreas de viagem</strong>{" "}
                    configuradas na aba "Áreas Especiais". Exclusivo por celular, com geolocalização
                    e fotografia obrigatória.
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 13 }}
                      onClick={() => setTab("areas")}
                    >
                      → Configurar áreas de viagem
                    </button>
                  </div>
                </>
              )}
            </Secao>
          </>
        )}

        {/* ═══════ TAB: ÁREAS ESPECIAIS ═══════ */}
        {tab === "areas" && (
          <>
            <Secao titulo="Áreas de Viagem / Postos Externos" icon={<MapPinIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}
              >
                Configure áreas geográficas onde funcionários em viagem poderão registrar o ponto.
                Cada área tem um raio de cobertura configurável no mapa.
              </p>

              {/* Cards de áreas */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
                  gap: 12,
                  marginBottom: 16
                }}
              >
                {areas.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      background: a.ativa ? "#fff" : "var(--cream-50)",
                      border: `1px solid rgba(122,30,38,${a.ativa ? "0.10" : "0.05"})`,
                      borderRadius: "var(--radius-lg)",
                      padding: "16px 18px",
                      opacity: a.ativa ? 1 : 0.65
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 8
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
                          {a.nome}
                        </p>
                        {a.descricao && (
                          <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                            {a.descricao}
                          </p>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: a.ativa ? "var(--green)" : "var(--gray-cfo)",
                          whiteSpace: "nowrap",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginLeft: 8
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: a.ativa ? "var(--green)" : "var(--gray-cfo)",
                            display: "inline-block"
                          }}
                        />
                        {a.ativa ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11.5,
                        color: "var(--ink-500)",
                        marginBottom: 6
                      }}
                    >
                      {a.lat.toFixed(4)}, {a.lng.toFixed(4)} · {a.raioMetros}m
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        paddingTop: 10,
                        borderTop: "1px solid rgba(122,30,38,0.06)"
                      }}
                    >
                      <button
                        onClick={() => {
                          setMapaAreaId(a.id);
                          setMapaModal(true);
                        }}
                        title="Editar no mapa"
                        style={{
                          flex: 1,
                          padding: "6px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid rgba(122,30,38,0.14)",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--ink-700)",
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: "var(--font-body)"
                        }}
                      >
                        🗺 Editar no Mapa
                      </button>
                      <button
                        onClick={() => toggleArea(a.id)}
                        style={{
                          padding: 6,
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid rgba(122,30,38,0.14)",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--ink-500)",
                          fontSize: 11
                        }}
                      >
                        {a.ativa ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        onClick={() => removeArea(a.id)}
                        style={{
                          padding: 6,
                          border: "1px solid rgba(200,57,63,0.20)",
                          borderRadius: "var(--radius-sm)",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--red)",
                          display: "flex"
                        }}
                      >
                        <Trash2Icon size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Formulário nova área */}
              <div
                style={{
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  padding: "16px",
                  border: "1px dashed rgba(122,30,38,0.22)"
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    marginBottom: 12,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase"
                  }}
                >
                  Nova área de viagem
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 2fr",
                    gap: 10,
                    marginBottom: 10
                  }}
                >
                  <input
                    value={novaArea.nome}
                    onChange={(e) => setNovaArea((a) => ({ ...a, nome: e.target.value }))}
                    placeholder="Nome ex: CRO-SP"
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13,
                      fontFamily: "var(--font-body)",
                      outline: "none"
                    }}
                  />
                  <input
                    value={novaArea.descricao}
                    onChange={(e) => setNovaArea((a) => ({ ...a, descricao: e.target.value }))}
                    placeholder="Descrição (opcional)"
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13,
                      fontFamily: "var(--font-body)",
                      outline: "none"
                    }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={addArea}
                  disabled={!novaArea.nome}
                  style={{
                    gap: 6,
                    fontSize: 13,
                    padding: "8px 16px",
                    opacity: novaArea.nome ? 1 : 0.5
                  }}
                >
                  <MapPinIcon size={14} />
                  Definir no Mapa e Adicionar
                </button>
                <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 8 }}>
                  Após clicar, um mapa interativo será aberto para você posicionar o marcador e
                  definir o raio.
                </p>
              </div>
            </Secao>

            {/* Endereços residenciais */}
            <Secao titulo="Endereços Residenciais (Modo Híbrido)" icon={<UsersIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6, marginBottom: 14 }}
              >
                Para o modo híbrido, cada funcionário precisa ter seu endereço residencial
                cadastrado com as coordenadas geográficas e raio de cobertura. O registro de ponto
                home office será validado contra essa localização.
              </p>
              <div
                style={{
                  background: "rgba(247,196,55,0.08)",
                  border: "1px solid rgba(247,196,55,0.25)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                  fontSize: 13,
                  color: "#8a6a00",
                  lineHeight: 1.6
                }}
              >
                <strong>Como configurar:</strong> Acesse{" "}
                <a href="/ponto/gestao" style={{ color: "var(--burgundy-600)", fontWeight: 500 }}>
                  Gestão de Funcionários
                </a>
                , selecione o funcionário e edite seu endereço residencial. O sistema geocodificará
                automaticamente o CEP e permitirá ajuste fino no mapa.
              </div>
            </Secao>
          </>
        )}

        {/* ═══════ TAB: PERÍODOS ═══════ */}
        {tab === "periodos" && (
          <>
            {/* ── Jornadas de Trabalho (JornadaPeriodo CRUD) ── */}
            <Secao titulo="Jornadas de Trabalho" icon={<SettingsIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}
              >
                Configure uma ou mais jornadas nomeadas. Cada funcionário pode ter uma jornada
                específica atribuída em{" "}
                <a href="/ponto/gestao" style={{ color: "var(--burgundy-600)", fontWeight: 500 }}>
                  Gestão de Funcionários
                </a>
                . Se não houver jornada atribuída, a marcada como <strong>Padrão</strong> é usada.
              </p>

              {/* Lista de jornadas */}
              <div style={{ marginBottom: 16 }}>
                {jornadas.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 8 }}>
                    Nenhuma jornada cadastrada. Crie uma abaixo.
                  </p>
                )}
                {jornadas.map((jp) => {
                  const dias: boolean[] =
                    typeof jp.diasUteis === "string" ? JSON.parse(jp.diasUteis) : jp.diasUteis;
                  const diasNomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                  const diasAtivos = diasNomes.filter((_, i) => dias[i]).join(", ");
                  return (
                    <div
                      key={jp.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        background: jp.ePadrao ? "rgba(122,30,38,0.04)" : "#fff",
                        border: `1px solid ${jp.ePadrao ? "rgba(122,30,38,0.20)" : "rgba(122,30,38,0.08)"}`,
                        borderRadius: "var(--radius-md)",
                        marginBottom: 8
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}
                        >
                          <p
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "var(--ink-900)",
                              margin: 0
                            }}
                          >
                            {jp.nome}
                          </p>
                          {jp.ePadrao && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                background: "var(--burgundy-600)",
                                color: "#fff",
                                padding: "2px 7px",
                                borderRadius: "var(--radius-full)",
                                letterSpacing: "0.06em"
                              }}
                            >
                              PADRÃO
                            </span>
                          )}
                          {!jp.ativo && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                background: "var(--ink-300)",
                                color: "#fff",
                                padding: "2px 7px",
                                borderRadius: "var(--radius-full)"
                              }}
                            >
                              INATIVA
                            </span>
                          )}
                        </div>
                        <p
                          style={{
                            fontSize: 12,
                            color: "var(--ink-500)",
                            margin: 0,
                            fontFamily: "var(--font-mono)"
                          }}
                        >
                          {jp.horaEntrada}–{jp.horaSaida} · {Math.floor(jp.jornadaDiariaMin / 60)}
                          h/dia · {diasAtivos}
                        </p>
                        {jp.descricao && (
                          <p style={{ fontSize: 11.5, color: "var(--ink-400)", margin: "2px 0 0" }}>
                            {jp.descricao}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {!jp.ePadrao && (
                          <button
                            onClick={() => setJornadaPadrao(jp.id)}
                            title="Definir como padrão"
                            style={{
                              padding: "5px 10px",
                              border: "1px solid rgba(122,30,38,0.20)",
                              borderRadius: "var(--radius-sm)",
                              background: "transparent",
                              cursor: "pointer",
                              color: "var(--ink-600)",
                              fontSize: 11.5,
                              fontWeight: 600,
                              fontFamily: "var(--font-body)"
                            }}
                          >
                            Definir padrão
                          </button>
                        )}
                        <button
                          onClick={() => abrirJpModal(jp)}
                          title="Editar"
                          style={{
                            padding: 6,
                            border: "1px solid rgba(122,30,38,0.14)",
                            borderRadius: "var(--radius-sm)",
                            background: "transparent",
                            cursor: "pointer",
                            color: "var(--ink-700)",
                            fontSize: 12,
                            fontFamily: "var(--font-body)",
                            fontWeight: 500
                          }}
                        >
                          Editar
                        </button>
                        {!jp.ePadrao && (
                          <button
                            onClick={() => {
                              if (confirm(`Excluir jornada "${jp.nome}"?`)) excluirJornada(jp.id);
                            }}
                            title="Excluir"
                            style={{
                              padding: 6,
                              border: "1px solid rgba(200,57,63,0.20)",
                              borderRadius: "var(--radius-sm)",
                              background: "transparent",
                              cursor: "pointer",
                              color: "var(--red)",
                              display: "flex"
                            }}
                          >
                            <Trash2Icon size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                className="btn btn-primary"
                onClick={() => abrirJpModal(null)}
                style={{ gap: 6, fontSize: 13 }}
              >
                <PlusIcon size={14} /> Nova Jornada
              </button>
            </Secao>

            {/* ── Modal de edição/criação de JornadaPeriodo ── */}
            {jpModal && (
              <>
                <div
                  onClick={() => setJpModal(false)}
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(10,5,6,0.40)",
                    zIndex: 60
                  }}
                />
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 520,
                    maxWidth: "100vw",
                    background: "#fff",
                    zIndex: 70,
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "-8px 0 40px rgba(10,5,6,0.14)",
                    overflowY: "auto"
                  }}
                >
                  <div
                    style={{
                      padding: "20px 24px",
                      borderBottom: "1px solid rgba(122,30,38,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexShrink: 0
                    }}
                  >
                    <div>
                      <p className="eyebrow" style={{ marginBottom: 2 }}>
                        Jornada de Trabalho
                      </p>
                      <h2
                        style={{
                          fontFamily: "var(--font-display)",
                          fontStyle: "italic",
                          fontSize: 20,
                          color: "var(--burgundy-600)",
                          fontWeight: 400
                        }}
                      >
                        {jpEditando ? "Editar Jornada" : "Nova Jornada"}
                      </h2>
                    </div>
                    <button
                      onClick={() => setJpModal(false)}
                      style={{
                        padding: 8,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--ink-500)"
                      }}
                    >
                      <XIcon size={18} />
                    </button>
                  </div>

                  <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
                    {/* Nome e descrição */}
                    <div style={{ marginBottom: 16 }}>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--ink-500)",
                          display: "block",
                          marginBottom: 5
                        }}
                      >
                        Nome da Jornada *
                      </label>
                      <input
                        type="text"
                        value={jpForm.nome}
                        onChange={(e) => setJpForm((f) => ({ ...f, nome: e.target.value }))}
                        placeholder="Ex: Jornada 8h, Estagiário 6h, Turno Tarde"
                        style={{
                          width: "100%",
                          padding: "9px 12px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid rgba(122,30,38,0.14)",
                          fontSize: 13.5,
                          fontFamily: "var(--font-body)",
                          outline: "none",
                          boxSizing: "border-box"
                        }}
                      />
                    </div>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        marginBottom: 16,
                        fontSize: 13,
                        cursor: "pointer"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!jpForm.paraEstagiarios}
                        onChange={(e) => {
                          const marcado = e.target.checked;
                          /* Sem almoço: a jornada efetiva é o horário de entrada a saída. */
                          const almoco = marcado ? 0 : JP_VAZIO.almocoMinMin;
                          const calc = calcJornadaEfetiva(
                            jpForm.horaEntrada,
                            jpForm.horaSaida,
                            almoco,
                            jpDiasUteis
                          );
                          setJpForm((f) => ({
                            ...f,
                            paraEstagiarios: marcado,
                            almocoMinMin: almoco,
                            jornadaDiariaMin: calc.diaria,
                            jornadaSemanalMin: calc.semanal
                          }));
                        }}
                      />
                      <span>
                        <strong>Jornada de estagiários e jovens aprendizes</strong>
                        <br />
                        <span style={{ color: "var(--ink-500)", fontSize: 12 }}>
                          Carga corrida, sem intervalo de almoço, banco de horas nem hora extra:
                          esses campos não se aplicam e ficam ocultos.
                        </span>
                      </span>
                    </label>
                    {!jpForm.paraEstagiarios && (
                      <>
                        <div style={{ marginBottom: 20 }}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: "var(--ink-500)",
                              display: "block",
                              marginBottom: 5
                            }}
                          >
                            Descrição
                          </label>
                          <input
                            type="text"
                            value={jpForm.descricao ?? ""}
                            onChange={(e) =>
                              setJpForm((f) => ({ ...f, descricao: e.target.value }))
                            }
                            placeholder="Opcional — ex: Efetivos com carga horária de 40h semanais"
                            style={{
                              width: "100%",
                              padding: "9px 12px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid rgba(122,30,38,0.14)",
                              fontSize: 13.5,
                              fontFamily: "var(--font-body)",
                              outline: "none",
                              boxSizing: "border-box"
                            }}
                          />
                        </div>
                      </>
                    )}

                    <hr
                      style={{
                        border: "none",
                        borderTop: "1px solid rgba(122,30,38,0.08)",
                        margin: "0 0 18px"
                      }}
                    />

                    {/* Horários */}
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                        color: "var(--burgundy-600)",
                        marginBottom: 12
                      }}
                    >
                      Horários
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 14,
                        marginBottom: 14
                      }}
                    >
                      {(
                        [
                          ["horaEntrada", "Hora de Entrada"],
                          ["horaSaida", "Hora de Saída"]
                        ] as const
                      ).map(([k, l]) => (
                        <div key={k}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: "var(--ink-500)",
                              display: "block",
                              marginBottom: 5
                            }}
                          >
                            {l}
                          </label>
                          <input
                            type="time"
                            value={jpForm[k]}
                            onChange={(e) => {
                              const novo = { ...jpForm, [k]: e.target.value };
                              const calc = calcJornadaEfetiva(
                                novo.horaEntrada,
                                novo.horaSaida,
                                novo.almocoMinMin,
                                jpDiasUteis
                              );
                              setJpForm((f) => ({
                                ...f,
                                [k]: e.target.value,
                                jornadaDiariaMin: calc.diaria,
                                jornadaSemanalMin: calc.semanal
                              }));
                            }}
                            style={{
                              width: "100%",
                              padding: "9px 11px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid rgba(122,30,38,0.14)",
                              fontSize: 14,
                              fontFamily: "var(--font-mono)",
                              boxSizing: "border-box"
                            }}
                          />
                        </div>
                      ))}
                      <div>
                        <label
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--ink-500)",
                            display: "block",
                            marginBottom: 5
                          }}
                        >
                          Duração do Almoço (min)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={jpForm.almocoMinMin}
                          onChange={(e) => {
                            const almoco = +e.target.value;
                            const calc = calcJornadaEfetiva(
                              jpForm.horaEntrada,
                              jpForm.horaSaida,
                              almoco,
                              jpDiasUteis
                            );
                            setJpForm((f) => ({
                              ...f,
                              almocoMinMin: almoco,
                              jornadaDiariaMin: calc.diaria,
                              jornadaSemanalMin: calc.semanal
                            }));
                          }}
                          style={{
                            width: "100%",
                            padding: "9px 11px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid rgba(122,30,38,0.14)",
                            fontSize: 14,
                            fontFamily: "var(--font-mono)",
                            boxSizing: "border-box"
                          }}
                        />
                        <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                          Subtrai do total de horas do expediente
                        </p>
                      </div>
                    </div>

                    {/* Resumo calculado */}
                    {(() => {
                      const d = jpForm.jornadaDiariaMin;
                      const s = jpForm.jornadaSemanalMin;
                      const dH = Math.floor(d / 60),
                        dM = d % 60;
                      const sH = Math.floor(s / 60),
                        sM = s % 60;
                      return (
                        <div
                          style={{
                            marginBottom: 18,
                            padding: "10px 14px",
                            background: "rgba(47,125,79,0.07)",
                            border: "1px solid rgba(47,125,79,0.18)",
                            borderRadius: "var(--radius-md)",
                            display: "flex",
                            gap: 24,
                            flexWrap: "wrap"
                          }}
                        >
                          <div>
                            <p
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--green)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                margin: "0 0 2px"
                              }}
                            >
                              Jornada Diária
                            </p>
                            <p
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 18,
                                fontWeight: 700,
                                color: "var(--green)",
                                margin: 0
                              }}
                            >
                              {dH}h{dM > 0 ? `${String(dM).padStart(2, "0")}` : ""}
                            </p>
                          </div>
                          <div>
                            <p
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--green)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                margin: "0 0 2px"
                              }}
                            >
                              Jornada Semanal
                            </p>
                            <p
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 18,
                                fontWeight: 700,
                                color: "var(--green)",
                                margin: 0
                              }}
                            >
                              {sH}h{sM > 0 ? `${String(sM).padStart(2, "0")}` : ""}
                            </p>
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                            <p
                              style={{
                                fontSize: 11.5,
                                color: "var(--green)",
                                margin: 0,
                                lineHeight: 1.5
                              }}
                            >
                              {jpForm.horaEntrada} → {jpForm.horaSaida} − {jpForm.almocoMinMin}min
                              almoço
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Dias úteis */}
                    <div style={{ marginBottom: 18 }}>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--ink-500)",
                          display: "block",
                          marginBottom: 8
                        }}
                      >
                        Dias Úteis
                      </label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia, i) => (
                          <button
                            key={dia}
                            onClick={() => {
                              setJpDiasUteis((d) => {
                                const nd = [...d];
                                nd[i] = !nd[i];
                                const calc = calcJornadaEfetiva(
                                  jpForm.horaEntrada,
                                  jpForm.horaSaida,
                                  jpForm.almocoMinMin,
                                  nd
                                );
                                setJpForm((f) => ({ ...f, jornadaSemanalMin: calc.semanal }));
                                return nd;
                              });
                            }}
                            style={{
                              padding: "7px 12px",
                              borderRadius: "var(--radius-md)",
                              border: `2px solid ${jpDiasUteis[i] ? "var(--burgundy-600)" : "rgba(122,30,38,0.14)"}`,
                              background: jpDiasUteis[i] ? "rgba(122,30,38,0.08)" : "transparent",
                              fontFamily: "var(--font-body)",
                              fontSize: 13,
                              fontWeight: 600,
                              color: jpDiasUteis[i] ? "var(--burgundy-600)" : "var(--ink-500)",
                              cursor: "pointer",
                              transition: "all 140ms"
                            }}
                          >
                            {dia}
                          </button>
                        ))}
                      </div>
                    </div>

                    <hr
                      style={{
                        border: "none",
                        borderTop: "1px solid rgba(122,30,38,0.08)",
                        margin: "0 0 18px"
                      }}
                    />

                    {!jpForm.paraEstagiarios && (
                      <>
                        {/* Tipo de controle */}
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.07em",
                            textTransform: "uppercase",
                            color: "var(--burgundy-600)",
                            marginBottom: 12
                          }}
                        >
                          Tipo de Controle
                        </p>
                        <div
                          style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}
                        >
                          {(
                            [
                              ["FIXO", "Fixo", "Horário rígido com tolerância"],
                              ["ELASTICO", "Elástico", "Entrada variável, total de horas fixo"],
                              ["BANCO_HORAS", "Banco de Horas", "Saldo acumulado e compensado"]
                            ] as const
                          ).map(([v, l, d]) => (
                            <button
                              key={v}
                              onClick={() => setJpForm((f) => ({ ...f, tipoFlexibilidade: v }))}
                              style={{
                                flex: 1,
                                minWidth: 100,
                                padding: "10px 12px",
                                borderRadius: "var(--radius-md)",
                                border: `2px solid ${jpForm.tipoFlexibilidade === v ? "var(--burgundy-600)" : "rgba(122,30,38,0.12)"}`,
                                background:
                                  jpForm.tipoFlexibilidade === v
                                    ? "rgba(122,30,38,0.06)"
                                    : "transparent",
                                cursor: "pointer",
                                textAlign: "left"
                              }}
                            >
                              <p
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color:
                                    jpForm.tipoFlexibilidade === v
                                      ? "var(--burgundy-600)"
                                      : "var(--ink-700)",
                                  marginBottom: 2
                                }}
                              >
                                {l}
                              </p>
                              <p style={{ fontSize: 11, color: "var(--ink-500)", lineHeight: 1.4 }}>
                                {d}
                              </p>
                            </button>
                          ))}
                        </div>

                        <hr
                          style={{
                            border: "none",
                            borderTop: "1px solid rgba(122,30,38,0.08)",
                            margin: "0 0 18px"
                          }}
                        />
                      </>
                    )}
                    {/* Tolerâncias */}
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                        color: "var(--burgundy-600)",
                        marginBottom: 12
                      }}
                    >
                      Tolerâncias (minutos)
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 14,
                        marginBottom: 18
                      }}
                    >
                      {(
                        [
                          ["toleranciaEntradaMin", "Tolerância Entrada/Saída (±N)"],
                          ["toleranciaHoraExtraMin", "Tolerância Hora Extra"]
                        ] as const
                      ).map(([k, l]) => (
                        <div key={k}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: "var(--ink-500)",
                              display: "block",
                              marginBottom: 5
                            }}
                          >
                            {l}
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={60}
                            value={jpForm[k]}
                            onChange={(e) => {
                              const v = +e.target.value;
                              if (k === "toleranciaEntradaMin") {
                                setJpForm((f) => ({
                                  ...f,
                                  toleranciaEntradaMin: v,
                                  toleranciaSaidaMin: v,
                                  toleranciaCalculoMin: 0
                                }));
                              } else {
                                setJpForm((f) => ({ ...f, [k]: v }));
                              }
                            }}
                            style={{
                              width: "100%",
                              padding: "9px 11px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid rgba(122,30,38,0.14)",
                              fontSize: 14,
                              fontFamily: "var(--font-mono)",
                              boxSizing: "border-box"
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <hr
                      style={{
                        border: "none",
                        borderTop: "1px solid rgba(122,30,38,0.08)",
                        margin: "0 0 18px"
                      }}
                    />

                    {!jpForm.paraEstagiarios && (
                      <>
                        {/* Almoço — janela e validação */}
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.07em",
                            textTransform: "uppercase",
                            color: "var(--burgundy-600)",
                            marginBottom: 12
                          }}
                        >
                          Janela do Almoço
                        </p>
                        <p
                          style={{
                            fontSize: 12,
                            color: "var(--ink-500)",
                            marginBottom: 12,
                            lineHeight: 1.5
                          }}
                        >
                          Define o horário em que o almoço pode começar e a duração máxima aceita.
                        </p>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 14,
                            marginBottom: 18
                          }}
                        >
                          {(
                            [
                              ["almocoPodeIniciarA", "Pode Iniciar A Partir De"],
                              ["almocoPodeIniciarAte", "Pode Iniciar Até"]
                            ] as const
                          ).map(([k, l]) => (
                            <div key={k}>
                              <label
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  letterSpacing: "0.06em",
                                  textTransform: "uppercase",
                                  color: "var(--ink-500)",
                                  display: "block",
                                  marginBottom: 5
                                }}
                              >
                                {l}
                              </label>
                              <input
                                type="time"
                                value={jpForm[k]}
                                onChange={(e) => setJpForm((f) => ({ ...f, [k]: e.target.value }))}
                                style={{
                                  width: "100%",
                                  padding: "9px 11px",
                                  borderRadius: "var(--radius-md)",
                                  border: "1px solid rgba(122,30,38,0.14)",
                                  fontSize: 14,
                                  fontFamily: "var(--font-mono)",
                                  boxSizing: "border-box"
                                }}
                              />
                            </div>
                          ))}
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                color: "var(--ink-500)",
                                display: "block",
                                marginBottom: 5
                              }}
                            >
                              Duração Máxima (min)
                            </label>
                            <input
                              type="number"
                              min={30}
                              max={180}
                              value={jpForm.almocoMaxMin}
                              onChange={(e) =>
                                setJpForm((f) => ({ ...f, almocoMaxMin: +e.target.value }))
                              }
                              style={{
                                width: "100%",
                                padding: "9px 11px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid rgba(122,30,38,0.14)",
                                fontSize: 14,
                                fontFamily: "var(--font-mono)",
                                boxSizing: "border-box"
                              }}
                            />
                          </div>
                        </div>

                        <hr
                          style={{
                            border: "none",
                            borderTop: "1px solid rgba(122,30,38,0.08)",
                            margin: "0 0 18px"
                          }}
                        />
                      </>
                    )}
                    {!jpForm.paraEstagiarios && (
                      <>
                        {/* Banco de Horas / Hora Extra */}
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.07em",
                            textTransform: "uppercase",
                            color: "var(--burgundy-600)",
                            marginBottom: 12
                          }}
                        >
                          Banco de Horas & Hora Extra
                        </p>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 14,
                            marginBottom: 18
                          }}
                        >
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                color: "var(--ink-500)",
                                display: "block",
                                marginBottom: 5
                              }}
                            >
                              Limite do Banco (horas)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={jpForm.bancoHorasLimiteMin / 60}
                              onChange={(e) =>
                                setJpForm((f) => ({
                                  ...f,
                                  bancoHorasLimiteMin: Math.round(+e.target.value * 60)
                                }))
                              }
                              style={{
                                width: "100%",
                                padding: "9px 11px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid rgba(122,30,38,0.14)",
                                fontSize: 14,
                                fontFamily: "var(--font-mono)",
                                boxSizing: "border-box"
                              }}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                color: "var(--ink-500)",
                                display: "block",
                                marginBottom: 5
                              }}
                            >
                              Vigência (dias)
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={jpForm.bancoHorasVigenciaDias}
                              onChange={(e) =>
                                setJpForm((f) => ({
                                  ...f,
                                  bancoHorasVigenciaDias: +e.target.value
                                }))
                              }
                              style={{
                                width: "100%",
                                padding: "9px 11px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid rgba(122,30,38,0.14)",
                                fontSize: 14,
                                fontFamily: "var(--font-mono)",
                                boxSizing: "border-box"
                              }}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                color: "var(--ink-500)",
                                display: "block",
                                marginBottom: 5
                              }}
                            >
                              Limite Hora Extra (horas)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={8}
                              step={0.5}
                              value={jpForm.horaExtraLimiteAuto / 60}
                              onChange={(e) =>
                                setJpForm((f) => ({
                                  ...f,
                                  horaExtraLimiteAuto: Math.round(+e.target.value * 60)
                                }))
                              }
                              style={{
                                width: "100%",
                                padding: "9px 11px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid rgba(122,30,38,0.14)",
                                fontSize: 14,
                                fontFamily: "var(--font-mono)",
                                boxSizing: "border-box"
                              }}
                            />
                            <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                              Hora extra acima deste limite gera solicitação automática
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      padding: "16px 24px",
                      borderTop: "1px solid rgba(122,30,38,0.08)",
                      display: "flex",
                      gap: 10,
                      flexShrink: 0
                    }}
                  >
                    <button
                      className="btn btn-primary"
                      onClick={salvarJornada}
                      disabled={!jpForm.nome.trim()}
                      style={{ flex: 1, opacity: jpForm.nome.trim() ? 1 : 0.5 }}
                    >
                      {jpEditando ? "Salvar Alterações" : "Criar Jornada"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setJpModal(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Configuração Global (Fallback) ── */}
            <Secao titulo="Configuração Global (Fallback)" icon={<SettingsIcon size={18} />}>
              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 14px",
                  background: "rgba(37,99,235,0.05)",
                  border: "1px solid rgba(37,99,235,0.15)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12.5,
                  color: "#1e40af",
                  lineHeight: 1.6
                }}
              >
                Estes parâmetros são usados como <strong>fallback do sistema</strong> quando nenhuma
                Jornada de Trabalho está definida como padrão nem atribuída ao funcionário.
                Mantenha-os atualizados.
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 14,
                  marginBottom: 14
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Hora de Entrada
                  </label>
                  <input
                    type="time"
                    value={periodos.horaEntrada}
                    onChange={(e) =>
                      setPeriodos((p) => {
                        if (!p) return p;
                        const calc = calcJornadaEfetiva(
                          e.target.value,
                          p.horaSaida,
                          p.almocoMinMin,
                          p.diasUteis
                        );
                        return {
                          ...p,
                          horaEntrada: e.target.value,
                          jornadaDiariaMin: calc.diaria,
                          jornadaSemanalMin: calc.semanal
                        };
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Hora de Saída
                  </label>
                  <input
                    type="time"
                    value={periodos.horaSaida}
                    onChange={(e) =>
                      setPeriodos((p) => {
                        if (!p) return p;
                        const calc = calcJornadaEfetiva(
                          p.horaEntrada,
                          e.target.value,
                          p.almocoMinMin,
                          p.diasUteis
                        );
                        return {
                          ...p,
                          horaSaida: e.target.value,
                          jornadaDiariaMin: calc.diaria,
                          jornadaSemanalMin: calc.semanal
                        };
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Duração do Almoço (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={periodos.almocoMinMin}
                    onChange={(e) =>
                      setPeriodos((p) => {
                        if (!p) return p;
                        const almoco = +e.target.value;
                        const calc = calcJornadaEfetiva(
                          p.horaEntrada,
                          p.horaSaida,
                          almoco,
                          p.diasUteis
                        );
                        return {
                          ...p,
                          almocoMinMin: almoco,
                          jornadaDiariaMin: calc.diaria,
                          jornadaSemanalMin: calc.semanal
                        };
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                    Subtrai do total do expediente
                  </p>
                </div>
              </div>

              {/* Resumo em tempo real */}
              {(() => {
                const d = periodos.jornadaDiariaMin;
                const s = periodos.jornadaSemanalMin;
                return (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: "10px 14px",
                      background: "rgba(47,125,79,0.07)",
                      border: "1px solid rgba(47,125,79,0.18)",
                      borderRadius: "var(--radius-md)",
                      display: "flex",
                      gap: 24,
                      flexWrap: "wrap",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--green)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          margin: "0 0 2px"
                        }}
                      >
                        Jornada Diária
                      </p>
                      <p
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 17,
                          fontWeight: 700,
                          color: "var(--green)",
                          margin: 0
                        }}
                      >
                        {Math.floor(d / 60)}h{d % 60 > 0 ? String(d % 60).padStart(2, "0") : ""}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--green)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          margin: "0 0 2px"
                        }}
                      >
                        Jornada Semanal
                      </p>
                      <p
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 17,
                          fontWeight: 700,
                          color: "var(--green)",
                          margin: 0
                        }}
                      >
                        {Math.floor(s / 60)}h{s % 60 > 0 ? String(s % 60).padStart(2, "0") : ""}
                      </p>
                    </div>
                    <p style={{ fontSize: 11.5, color: "var(--green)", margin: 0 }}>
                      {periodos.horaEntrada} → {periodos.horaSaida} − {periodos.almocoMinMin}min
                      almoço
                    </p>
                  </div>
                );
              })()}

              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(37,99,235,0.18)",
                  background: "rgba(37,99,235,0.04)"
                }}
              >
                <p
                  style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 600, color: "#1e40af" }}
                >
                  Janela para registrar ou ajustar ponto (horário de Brasília)
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--ink-500)",
                        display: "block",
                        marginBottom: 5
                      }}
                    >
                      Não antes de
                    </label>
                    <input
                      type="time"
                      value={periodos.pontoHorarioMinimo}
                      onChange={(e) =>
                        setPeriodos((p) => (p ? { ...p, pontoHorarioMinimo: e.target.value } : p))
                      }
                      style={{
                        width: "100%",
                        padding: "9px 11px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        fontSize: 14,
                        fontFamily: "var(--font-mono)",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--ink-500)",
                        display: "block",
                        marginBottom: 5
                      }}
                    >
                      Não depois de
                    </label>
                    <input
                      type="time"
                      value={periodos.pontoHorarioMaximo}
                      onChange={(e) =>
                        setPeriodos((p) => (p ? { ...p, pontoHorarioMaximo: e.target.value } : p))
                      }
                      style={{
                        width: "100%",
                        padding: "9px 11px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        fontSize: 14,
                        fontFamily: "var(--font-mono)",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 11.5,
                    color: "var(--ink-500)",
                    lineHeight: 1.45
                  }}
                >
                  Bloqueia o registro de ponto e solicitações de correção fora desse intervalo (fuso
                  de Brasília). Padrão: 06:00–23:59 (11:59 da noite).
                </p>
              </div>

              {/* Dias úteis */}
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Dias Úteis
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia, i) => (
                    <button
                      key={dia}
                      onClick={() =>
                        setPeriodos((p) => {
                          if (!p) return p;
                          const d = [...p.diasUteis];
                          d[i] = !d[i];
                          const calc = calcJornadaEfetiva(
                            p.horaEntrada,
                            p.horaSaida,
                            p.almocoMinMin,
                            d
                          );
                          return { ...p, diasUteis: d, jornadaSemanalMin: calc.semanal };
                        })
                      }
                      style={{
                        padding: "7px 12px",
                        borderRadius: "var(--radius-md)",
                        border: `2px solid ${periodos.diasUteis[i] ? "var(--burgundy-600)" : "rgba(122,30,38,0.14)"}`,
                        background: periodos.diasUteis[i] ? "rgba(122,30,38,0.08)" : "transparent",
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        fontWeight: 600,
                        color: periodos.diasUteis[i] ? "var(--burgundy-600)" : "var(--ink-500)",
                        cursor: "pointer",
                        transition: "all 140ms"
                      }}
                    >
                      {dia}
                    </button>
                  ))}
                </div>
              </div>
            </Secao>

            {/* ── Flexibilidade ── */}
            <Secao titulo="Flexibilidade de Horário" icon={<InfoIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}
              >
                Define a tolerância simétrica (±N) única para entrada e saída no cálculo do saldo, e
                o mesmo N para excesso de almoço. Os dois campos de entrada/saída permanecem sempre
                iguais. O horário real continua visível no histórico.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14
                }}
              >
                {/* Tolerância de entrada — atraso ignorado */}
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Tolerância de Entrada (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={periodos.toleranciaEntradaMin}
                    onChange={(e) =>
                      setPeriodos((p) =>
                        patchPeriodos(p, { toleranciaEntradaMin: +e.target.value })
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                    Janela <strong>simétrica ±N</strong> em torno do horário de entrada no cálculo
                    do saldo (o registro exibe o horário real). O mesmo N vale para a saída e
                    absorve excesso de almoço até o mínimo + N (ex.: 60+5 → 1h05 conta como 1h).
                  </p>
                </div>
                {/* Tolerância de saída — espelho da entrada (simetria) */}
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Tolerância de Saída (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={periodos.toleranciaSaidaMin}
                    onChange={(e) =>
                      setPeriodos((p) => patchPeriodos(p, { toleranciaSaidaMin: +e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                    Sempre igual à Tolerância de Entrada (simetria ±N). Alterar um campo atualiza o
                    outro automaticamente.
                  </p>
                </div>
                {/* Tolerância de hora extra — permanência ignorada */}
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Tolerância de Hora Extra (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={periodos.toleranciaHoraExtraMin}
                    onChange={(e) =>
                      setPeriodos((p) =>
                        patchPeriodos(p, { toleranciaHoraExtraMin: +e.target.value })
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                    Permanência além do horário até este limite{" "}
                    <strong>não é computada como hora extra</strong>. Ex: 10 min → saída até 17:10
                    não gera crédito
                  </p>
                </div>
                {/* Limite para solicitação automática de hora extra */}
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Limite para Solicitação de Hora Extra (horas)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={0.5}
                    value={periodos.horaExtraLimiteAuto / 60}
                    onChange={(e) =>
                      setPeriodos((p) =>
                        patchPeriodos(p, { horaExtraLimiteAuto: Math.round(+e.target.value * 60) })
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                    Hora extra além deste limite gera <strong>solicitação automática</strong> de
                    aprovação pelo chefe e RH. Abaixo do limite, vai direto para o banco de horas.
                  </p>
                </div>
                {/* Descanso de interjornada */}
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Descanso de Interjornada (horas)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={periodos.interjornadaMin / 60}
                    onChange={(e) =>
                      setPeriodos((p) =>
                        patchPeriodos(p, {
                          interjornadaMin: Math.min(
                            1440,
                            Math.max(0, Math.round(+e.target.value * 60))
                          )
                        })
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                    Descanso mínimo entre a <strong>última saída</strong> e a{" "}
                    <strong>próxima entrada</strong>. Pela CLT (art. 66) são <strong>11 h</strong>.
                    Enquanto o descanso não se completa, o funcionário{" "}
                    <strong>não consegue registrar a entrada</strong>; só por solicitação de
                    correção de ponto, aprovada pelo chefe e pelo RH. Use <strong>0</strong> para
                    desativar.
                  </p>
                </div>
              </div>

              {/* Resumo visual das tolerâncias */}
              <div
                style={{
                  background: "rgba(122,30,38,0.04)",
                  border: "1px solid rgba(122,30,38,0.10)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px"
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--burgundy-600)",
                    marginBottom: 8,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase"
                  }}
                >
                  Resumo da jornada com tolerâncias
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
                  {[
                    {
                      label: `Entrada`,
                      hora: periodos.horaEntrada,
                      tol: `±${periodos.toleranciaEntradaMin}min`,
                      cor: "var(--green)"
                    },
                    { sep: "→ trabalho →" },
                    {
                      label: `Almoço`,
                      hora: periodos.almocoPodeIniciarA,
                      tol: `${periodos.almocoMinMin}min (+≤${periodos.toleranciaEntradaMin}min)`,
                      cor: "#8a6a00"
                    },
                    { sep: "→ trabalho →" },
                    {
                      label: `Saída`,
                      hora: periodos.horaSaida,
                      tol: `±${periodos.toleranciaEntradaMin}min`,
                      cor: "var(--red)"
                    }
                  ].map(
                    (
                      item: {
                        label?: string;
                        hora?: string;
                        tol?: string;
                        cor?: string;
                        sep?: string;
                      },
                      i
                    ) =>
                      item.sep ? (
                        <span
                          key={i}
                          style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 6px" }}
                        >
                          {item.sep}
                        </span>
                      ) : (
                        <span
                          key={i}
                          style={{
                            display: "inline-flex",
                            flexDirection: "column",
                            alignItems: "center",
                            padding: "4px 8px",
                            borderRadius: "var(--radius-sm)",
                            background: "#fff",
                            border: `1px solid ${item.cor}40`
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 13,
                              fontWeight: 700,
                              color: item.cor
                            }}
                          >
                            {item.hora}
                          </span>
                          <span style={{ fontSize: 9.5, color: "var(--ink-500)" }}>{item.tol}</span>
                          <span style={{ fontSize: 9, color: "var(--ink-500)" }}>{item.label}</span>
                        </span>
                      )
                  )}
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Tipo de Controle
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(
                    [
                      ["FIXO", "Fixo", "Horário rígido com tolerância definida"],
                      [
                        "ELASTICO",
                        "Elástico",
                        "Entrada variável, mas total de horas deve ser cumprido"
                      ],
                      ["BANCO_HORAS", "Banco de Horas", "Saldo de horas acumulado e compensado"]
                    ] as const
                  ).map(([v, l, d]) => (
                    <button
                      key={v}
                      onClick={() => setPeriodos((p) => patchPeriodos(p, { tipoFlexibilidade: v }))}
                      style={{
                        flex: 1,
                        minWidth: 100,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-md)",
                        border: `2px solid ${periodos.tipoFlexibilidade === v ? "var(--burgundy-600)" : "rgba(122,30,38,0.12)"}`,
                        background:
                          periodos.tipoFlexibilidade === v ? "rgba(122,30,38,0.06)" : "transparent",
                        cursor: "pointer",
                        textAlign: "left" as const
                      }}
                    >
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color:
                            periodos.tipoFlexibilidade === v
                              ? "var(--burgundy-600)"
                              : "var(--ink-700)",
                          marginBottom: 2
                        }}
                      >
                        {l}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--ink-500)", lineHeight: 1.4 }}>{d}</p>
                    </button>
                  ))}
                </div>
              </div>

              {periodos.tipoFlexibilidade === "BANCO_HORAS" && (
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14
                  }}
                >
                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)",
                        display: "block",
                        marginBottom: 5
                      }}
                    >
                      Limite do Banco (horas)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={Math.floor(periodos.bancoHorasLimiteMin / 60)}
                      onChange={(e) =>
                        setPeriodos((p) =>
                          patchPeriodos(p, { bancoHorasLimiteMin: +e.target.value * 60 })
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "9px 11px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        fontSize: 14,
                        fontFamily: "var(--font-mono)",
                        boxSizing: "border-box" as const
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)",
                        display: "block",
                        marginBottom: 5
                      }}
                    >
                      Vigência (dias)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={periodos.bancoHorasVigenciaDias}
                      onChange={(e) =>
                        setPeriodos((p) =>
                          patchPeriodos(p, { bancoHorasVigenciaDias: +e.target.value })
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "9px 11px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        fontSize: 14,
                        fontFamily: "var(--font-mono)",
                        boxSizing: "border-box" as const
                      }}
                    />
                  </div>
                </div>
              )}

              <ToleranciaFechamentoGlobal podeEditar={podeRh("configuracoes.periodos.marcos")} />

              <div style={{ marginTop: 20 }}>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    marginBottom: 10,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase"
                  }}
                >
                  Datas Marco (zeram o Banco de Horas)
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-500)",
                    marginBottom: 14,
                    lineHeight: 1.6
                  }}
                >
                  Informe apenas dia e mês. Nessa data o saldo zera e um novo ciclo começa, já
                  incluindo as horas do próprio dia da virada (o ciclo anterior vai até o dia
                  anterior).
                </p>

                {/* Lista */}
                <div style={{ marginBottom: 16 }}>
                  {marcosBancoHoras.length === 0 && (
                    <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 8 }}>
                      Nenhuma data marco configurada.
                    </p>
                  )}
                  {marcosBancoHoras.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        background: "var(--cream-50)",
                        border: "1px solid rgba(122,30,38,0.08)",
                        borderRadius: "var(--radius-md)",
                        marginBottom: 8
                      }}
                    >
                      <CalendarIcon size={16} style={{ color: "var(--burgundy-600)" }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>
                          {String(m.dia).padStart(2, "0")}/{String(m.mes).padStart(2, "0")}
                          {m.ano == null ? (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: "var(--ink-500)",
                                marginLeft: 8
                              }}
                            >
                              todos os anos
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: "var(--ink-500)",
                                marginLeft: 8
                              }}
                            >
                              apenas {m.ano}
                            </span>
                          )}
                        </p>
                        {m.descricao && (
                          <p style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>
                            {m.descricao}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeMarcoBancoHoras(m.id)}
                        style={{
                          padding: 6,
                          border: "1px solid rgba(200,57,63,0.20)",
                          borderRadius: "var(--radius-sm)",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--red)",
                          display: "flex"
                        }}
                      >
                        <Trash2Icon size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Adicionar data marco */}
                <div
                  style={{
                    background: "var(--cream-50)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    border: "1px dashed rgba(122,30,38,0.20)"
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink-500)",
                      marginBottom: 10,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase"
                    }}
                  >
                    Adicionar data marco (dia/mês)
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 140px 1fr",
                      gap: 10,
                      marginBottom: 10
                    }}
                  >
                    <input
                      type="number"
                      min={1}
                      max={31}
                      placeholder="Dia"
                      value={novoMarco.dia}
                      onChange={(e) => setNovoMarco((p) => ({ ...p, dia: e.target.value }))}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        background: "#fff",
                        fontSize: 13,
                        fontFamily: "var(--font-body)",
                        outline: "none"
                      }}
                    />
                    <select
                      value={novoMarco.mes}
                      onChange={(e) => setNovoMarco((p) => ({ ...p, mes: e.target.value }))}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        background: "#fff",
                        fontSize: 13,
                        fontFamily: "var(--font-body)",
                        outline: "none"
                      }}
                    >
                      <option value="">Mês</option>
                      {[
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
                      ].map((nome, i) => (
                        <option key={nome} value={String(i + 1)}>
                          {nome}
                        </option>
                      ))}
                    </select>
                    <input
                      value={novoMarco.descricao}
                      onChange={(e) => setNovoMarco((p) => ({ ...p, descricao: e.target.value }))}
                      placeholder="Descrição (opcional)"
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        background: "#fff",
                        fontSize: 13,
                        fontFamily: "var(--font-body)",
                        outline: "none"
                      }}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={addMarcoBancoHoras}
                    disabled={!novoMarco.dia || !novoMarco.mes}
                    style={{
                      gap: 6,
                      fontSize: 13,
                      padding: "7px 14px",
                      opacity: !novoMarco.dia || !novoMarco.mes ? 0.5 : 1
                    }}
                  >
                    <PlusIcon size={14} /> Adicionar
                  </button>
                </div>
              </div>
            </Secao>

            {/* ── Intervalo do Almoço ── */}
            <Secao titulo="Intervalo do Almoço" icon={<InfoIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}
              >
                Define a janela de horário permitida para o início do almoço e os limites de duração
                (mínimo e máximo). O sistema valida se o intervalo está dentro desse range.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Início Permitido A Partir De
                  </label>
                  <input
                    type="time"
                    value={periodos.almocoPodeIniciarA}
                    onChange={(e) =>
                      setPeriodos((p) => patchPeriodos(p, { almocoPodeIniciarA: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Início Permitido Até
                  </label>
                  <input
                    type="time"
                    value={periodos.almocoPodeIniciarAte}
                    onChange={(e) =>
                      setPeriodos((p) => patchPeriodos(p, { almocoPodeIniciarAte: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Duração Mínima (min)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={120}
                    value={periodos.almocoMinMin}
                    onChange={(e) =>
                      setPeriodos((p) => patchPeriodos(p, { almocoMinMin: +e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Duração Máxima (min)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={180}
                    value={periodos.almocoMaxMin}
                    onChange={(e) =>
                      setPeriodos((p) => patchPeriodos(p, { almocoMaxMin: +e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 14px",
                  fontSize: 12.5,
                  color: "var(--ink-700)"
                }}
              >
                📌 Almoço permitido entre <strong>{periodos.almocoPodeIniciarA}</strong> e{" "}
                <strong>{periodos.almocoPodeIniciarAte}</strong>, duração de{" "}
                <strong>
                  {periodos.almocoMinMin}–{periodos.almocoMaxMin} min
                </strong>
              </div>

              {/* Intervalo conforme a jornada (CLT art. 71) */}
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: "1px solid rgba(122,30,38,0.10)"
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--ink-900)",
                    margin: "0 0 4px"
                  }}
                >
                  Intervalo conforme a jornada (CLT art. 71)
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink-500)",
                    margin: "0 0 12px",
                    lineHeight: 1.6
                  }}
                >
                  Define qual intervalo o ponto exige de acordo com a jornada do dia. Vale para a
                  regra do ciclo completo do ponto presencial (Configurações → Registro). O tempo do
                  almoço continua sendo o mínimo e o máximo acima (e o de cada jornada).
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: 14,
                    marginBottom: 12
                  }}
                >
                  {(
                    [
                      ["intervaloLongoAcimaDeMin", "Almoço acima de (horas)", 60, 1, 24, 0.5],
                      [
                        "intervaloCurtoAcimaDeMin",
                        "Intervalo curto acima de (horas)",
                        60,
                        0,
                        24,
                        0.5
                      ],
                      ["intervaloCurtoMinMin", "Tempo do intervalo curto (min)", 1, 0, 240, 1]
                    ] as const
                  ).map(([campo, rotulo, divisor, min, max, passo]) => (
                    <div key={campo}>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--ink-500)",
                          display: "block",
                          marginBottom: 5
                        }}
                      >
                        {rotulo}
                      </label>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={passo}
                        value={periodos[campo] / divisor}
                        onChange={(e) =>
                          setPeriodos((p) =>
                            patchPeriodos(p, {
                              [campo]: Math.min(
                                1440,
                                Math.max(0, Math.round(+e.target.value * divisor))
                              )
                            })
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "9px 11px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid rgba(122,30,38,0.14)",
                          fontSize: 14,
                          fontFamily: "var(--font-mono)",
                          boxSizing: "border-box" as const
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    background: "var(--cream-50)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 14px",
                    fontSize: 12.5,
                    color: "var(--ink-700)",
                    lineHeight: 1.6
                  }}
                >
                  📌 Jornada acima de{" "}
                  <strong>{fmtHorasCfg(periodos.intervaloLongoAcimaDeMin)}</strong>: intervalo de
                  almoço (mínimo de <strong>{periodos.almocoMinMin} min</strong>). Acima de{" "}
                  <strong>{fmtHorasCfg(periodos.intervaloCurtoAcimaDeMin)}</strong> até{" "}
                  <strong>{fmtHorasCfg(periodos.intervaloLongoAcimaDeMin)}</strong>: intervalo curto
                  de <strong>{periodos.intervaloCurtoMinMin} min</strong>. Até{" "}
                  <strong>{fmtHorasCfg(periodos.intervaloCurtoAcimaDeMin)}</strong>: sem intervalo.
                </div>
              </div>
            </Secao>

            {/* ── Modo Híbrido ── */}
            <Secao titulo="Parâmetros do Modo Híbrido" icon={<UsersIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.6 }}
              >
                Configurações específicas para funcionários em regime de trabalho híbrido (home
                office parcial).
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                  marginBottom: 14
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Máximo de dias/semana em casa
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={periodos.hibridoMaxDiasSemana}
                    onChange={(e) =>
                      setPeriodos((p) =>
                        patchPeriodos(p, { hibridoMaxDiasSemana: +e.target.value })
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
              </div>
              <Toggle
                value={periodos.hibridoExigeAprovacao}
                onChange={(v) => setPeriodos((p) => patchPeriodos(p, { hibridoExigeAprovacao: v }))}
                label="Exigir aprovação prévia do chefe"
                desc="O funcionário deve ter o dia híbrido aprovado antes de registrar o ponto de casa"
              />
            </Secao>

            {/* ── Modo Viagem ── */}
            <Secao titulo="Parâmetros do Modo Viagem" icon={<MapPinIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.6 }}
              >
                Define a janela de flexibilidade de horário para registro de ponto em áreas de
                viagem externas. O funcionário pode registrar dentro desse intervalo em relação ao
                horário padrão.
              </p>
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 5
                  }}
                >
                  Janela de flexibilidade (minutos)
                </label>
                <input
                  type="number"
                  min={0}
                  max={480}
                  value={periodos.viagemJanelaMinutos}
                  onChange={(e) =>
                    setPeriodos((p) => patchPeriodos(p, { viagemJanelaMinutos: +e.target.value }))
                  }
                  style={{
                    width: "100%",
                    maxWidth: 200,
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
                <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 5 }}>
                  Ex: 120 min → entrada entre 06:00 e 10:00 (±2h do horário padrão 08:00) é aceita.
                </p>
              </div>
              <Toggle
                value={periodos.viagemExigeAprovacao}
                onChange={(v) => setPeriodos((p) => patchPeriodos(p, { viagemExigeAprovacao: v }))}
                label="Exigir aprovação prévia de viagem"
                desc="O chefe deve autorizar o modo viagem antes do registro ser aceito"
              />
            </Secao>
          </>
        )}

        {/* ═══════ TAB: SOLICITAÇÕES ═══════ */}
        {tab === "solicitacoes" && configSol && (
          <>
            {/* ── Tipos ativos ── */}
            <Secao titulo="Tipos de Solicitação Disponíveis" icon={<CheckCircleIcon size={18} />}>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-500)",
                  margin: "0 0 16px",
                  lineHeight: 1.5
                }}
              >
                Tipos desativados não aparecem como opção para os funcionários ao abrir uma nova
                solicitação.
              </p>
              {(
                [
                  {
                    key: "tipoAtivoCorrecaoPonto",
                    emoji: "🕐",
                    label: "Correção de Ponto",
                    desc: "Ajuste ou inclusão de registros de ponto"
                  },
                  {
                    key: "tipoAtivoAtestado",
                    emoji: "🏥",
                    label: "Atestado Médico",
                    desc: "Afastamento por doença com documento médico"
                  },
                  {
                    key: "tipoAtivoFerias",
                    emoji: "🌴",
                    label: "Férias",
                    desc: "Solicitação de período de férias"
                  },
                  {
                    key: "tipoAtivoLicenca",
                    emoji: "📋",
                    label: "Licença e Outros",
                    desc: "Licença de qualquer natureza"
                  },
                  {
                    key: "tipoAtivoAbono",
                    emoji: "📆",
                    label: "Abono",
                    desc: "Abono de falta passada ou futura"
                  },
                  {
                    key: "tipoAtivoDayOff",
                    emoji: "🎂",
                    label: "Day Off de Aniversário",
                    desc: "Um dia de folga no mês do aniversário"
                  },
                  {
                    key: "tipoAtivoHoraExtra",
                    emoji: "⏱️",
                    label: "Hora Extra",
                    desc: "Solicitação antecipada de hora extra (≥ limite configurado) — aprovação do chefe e RH"
                  },
                  {
                    key: "tipoAtivoEnvioDocumentoRh",
                    emoji: "📎",
                    label: "Envio de Documento ao RH",
                    desc: "Envio de documentos (comprovantes, declarações, etc.) diretamente ao RH"
                  }
                ] as { key: keyof ConfigSolicitacoes; emoji: string; label: string; desc: string }[]
              ).map(({ key, emoji, label, desc }) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: "1px solid rgba(122,30,38,0.06)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22, lineHeight: 1 }}>{emoji}</span>
                    <div>
                      <p
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "var(--ink-900)",
                          margin: 0
                        }}
                      >
                        {label}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "2px 0 0" }}>
                        {desc}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfigSol((c) => (c ? { ...c, [key]: !c[key] } : c))}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                      background: (configSol[key] as boolean)
                        ? "var(--burgundy-600)"
                        : "rgba(122,30,38,0.15)",
                      position: "relative",
                      transition: "background 200ms"
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 3,
                        left: (configSol[key] as boolean) ? 22 : 3,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 200ms",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.25)"
                      }}
                    />
                  </button>
                </div>
              ))}
            </Secao>

            {/* ── Regras do Abono ── */}
            <Secao titulo="Regras do Abono" icon={<CalendarIcon size={18} />}>
              <Toggle
                value={configSol.abonoAlemLimiteLiberadoRh}
                onChange={(v) =>
                  setConfigSol((c) => (c ? { ...c, abonoAlemLimiteLiberadoRh: v } : c))
                }
                label="Permitir abono livre (além do tempo liberado pelo RH)"
                desc="Ligado: o funcionário pode pedir abono livremente. Se tiver tempo de banco liberado pelo RH, ele é usado primeiro e o que passar dele segue como abono comum. Desligado: o funcionário só pode pedir abono usando o tempo liberado pelo RH, dentro do limite; sem tempo liberado, não consegue pedir abono."
              />

              <div style={{ padding: "14px 0 4px" }}>
                <label
                  htmlFor="abono-cota-dias"
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--ink-900)",
                    display: "block"
                  }}
                >
                  Cota de abono diário por acordo coletivo (dias)
                </label>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--ink-500)",
                    margin: "2px 0 8px",
                    lineHeight: 1.5
                  }}
                >
                  Quantidade de dias de abono diário que cada funcionário (com ou sem registro de
                  ponto) pode pedir a cada <strong>dois ciclos cheios</strong> do banco de horas,
                  conforme acordo coletivo. Vale só para dias inteiros, um dia por período, em dias
                  úteis. <strong>0 = desativado</strong> (padrão). O pedido segue o fluxo normal
                  (chefe e RH), o funcionário vê o saldo e o histórico em Solicitações, e o RH vê em
                  Auditoria → Funcionário. Pedido rejeitado ou cancelado devolve o saldo.
                </p>
                <input
                  id="abono-cota-dias"
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  value={configSol.abonoCotaDiasDoisCiclos ?? 0}
                  onChange={(e) =>
                    setConfigSol((c) =>
                      c
                        ? {
                            ...c,
                            abonoCotaDiasDoisCiclos: Math.max(
                              0,
                              Math.min(365, Math.floor(Number(e.target.value)) || 0)
                            )
                          }
                        : c
                    )
                  }
                  style={{
                    width: 90,
                    padding: "7px 10px",
                    border: "1px solid rgba(122,30,38,0.14)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)"
                  }}
                />{" "}
                <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                  dia(s) a cada dois ciclos
                </span>
              </div>
            </Secao>

            {/* ── Grupos do CID ── */}
            <Secao titulo="Grupos do CID (atestado médico)" icon={<AlertCircleIcon size={18} />}>
              <GruposCidConfig podeEditar={podeRh("configuracoes.solicitacoes.cid-grupos")} />
            </Secao>

            {/* ── Tipos de Licença ── */}
            <Secao titulo="Tipos de Licença" icon={<CalendarIcon size={18} />}>
              <TiposLicencaConfig podeEditar={podeRh("configuracoes.solicitacoes.tipos-licenca")} />
            </Secao>

            {/* ── Regras de Atestado ── */}
            <Secao titulo="Regras de Atestado Médico" icon={<AlertCircleIcon size={18} />}>
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="atestado-cid-modo"
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--ink-900)",
                    display: "block"
                  }}
                >
                  Grupo do CID no atestado
                </label>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--ink-500)",
                    margin: "2px 0 8px",
                    lineHeight: 1.5
                  }}
                >
                  Define se o funcionário precisa escolher o grupo do CID ao enviar o atestado. É
                  dado de saúde (LGPD): aparece só para o RH na Auditoria, nunca para o chefe.
                </p>
                <select
                  id="atestado-cid-modo"
                  value={configSol.atestadoCidModo ?? "OBRIGATORIO"}
                  onChange={(e) =>
                    setConfigSol((c) =>
                      c
                        ? {
                            ...c,
                            atestadoCidModo: e.target.value as ConfigSolicitacoes["atestadoCidModo"]
                          }
                        : c
                    )
                  }
                  style={{
                    padding: "7px 10px",
                    border: "1px solid rgba(122,30,38,0.14)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13.5
                  }}
                >
                  <option value="OBRIGATORIO">Obrigatório</option>
                  <option value="OPCIONAL">Opcional</option>
                  <option value="DESATIVADO">Não exibir</option>
                </select>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 16,
                  alignItems: "stretch"
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      display: "block",
                      marginBottom: 4
                    }}
                  >
                    Limite simples (dias)
                  </label>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 0 6px", flex: 1 }}>
                    Atestados até este limite são padrão sem homologação
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={configSol.atestadoDiasLimiteSimples}
                    onChange={(e) =>
                      setConfigSol((c) =>
                        c ? { ...c, atestadoDiasLimiteSimples: parseInt(e.target.value) || 3 } : c
                      )
                    }
                    style={{
                      width: 80,
                      padding: "7px 10px",
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      marginTop: "auto"
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      display: "block",
                      marginBottom: 4
                    }}
                  >
                    Limite para INSS (dias)
                  </label>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 0 6px", flex: 1 }}>
                    A partir deste limite exige documento do INSS
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={configSol.atestadoDiasLimiteInss}
                    onChange={(e) =>
                      setConfigSol((c) =>
                        c ? { ...c, atestadoDiasLimiteInss: parseInt(e.target.value) || 14 } : c
                      )
                    }
                    style={{
                      width: 80,
                      padding: "7px 10px",
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      marginTop: "auto"
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      display: "block",
                      marginBottom: 4
                    }}
                  >
                    Prazo para envio do atestado (dias)
                  </label>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 0 6px", flex: 1 }}>
                    Prazo informado no e-mail de ponto incompleto para envio do atestado
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={configSol.atestadoPrazoEnvioDias ?? 2}
                    onChange={(e) =>
                      setConfigSol((c) =>
                        c ? { ...c, atestadoPrazoEnvioDias: parseInt(e.target.value) || 2 } : c
                      )
                    }
                    style={{
                      width: 80,
                      padding: "7px 10px",
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      marginTop: "auto"
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      display: "block",
                      marginBottom: 4
                    }}
                  >
                    Tempo de ida tolerado (minutos)
                  </label>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 0 6px", flex: 1 }}>
                    Tolerância máxima de deslocamento creditada entre a saída do trabalho e o início
                    do atestado (se a saída for para o almoço, o almoço mínimo não conta). 0
                    desliga.
                  </p>
                  <input
                    type="number"
                    min={0}
                    value={configSol.atestadoTempoIdaMin ?? 60}
                    onChange={(e) =>
                      setConfigSol((c) =>
                        c
                          ? {
                              ...c,
                              atestadoTempoIdaMin: Math.max(0, parseInt(e.target.value, 10) || 0)
                            }
                          : c
                      )
                    }
                    style={{
                      width: 80,
                      padding: "7px 10px",
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      marginTop: "auto"
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      display: "block",
                      marginBottom: 4
                    }}
                  >
                    Tempo de volta tolerado (minutos)
                  </label>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 0 6px", flex: 1 }}>
                    Tolerância máxima de deslocamento creditada quando o retorno ao trabalho ocorre
                    após o horário final do atestado. 0 desliga.
                  </p>
                  <input
                    type="number"
                    min={0}
                    value={configSol.atestadoTempoRetornoMin ?? 60}
                    onChange={(e) =>
                      setConfigSol((c) =>
                        c
                          ? {
                              ...c,
                              atestadoTempoRetornoMin: Math.max(
                                0,
                                parseInt(e.target.value, 10) || 0
                              )
                            }
                          : c
                      )
                    }
                    style={{
                      width: 80,
                      padding: "7px 10px",
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      marginTop: "auto"
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-700)",
                    display: "block",
                    marginBottom: 4
                  }}
                >
                  Mensagem sobre originais
                </label>
                <textarea
                  value={configSol.atestadoMensagemOriginais}
                  onChange={(e) =>
                    setConfigSol((c) =>
                      c ? { ...c, atestadoMensagemOriginais: e.target.value } : c
                    )
                  }
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid rgba(122,30,38,0.14)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                    resize: "vertical",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </Secao>

            {/* ── Regras de Férias ── */}
            <Secao titulo="Regras de Férias" icon={<CalendarIcon size={18} />}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {(
                  [
                    {
                      key: "feriasAntecedenciaMinDias",
                      label: "Antecedência mínima (dias)",
                      desc: "Prazo mínimo para solicitar férias"
                    },
                    {
                      key: "feriasMinimoGrandePeriodo",
                      label: "Mínimo período principal (dias)",
                      desc: "Primeiro período deve ter no mínimo X dias"
                    },
                    {
                      key: "feriasMinimoOutrosPeriodos",
                      label: "Mínimo outros períodos (dias)",
                      desc: "Períodos 2 e 3 devem ter no mínimo X dias"
                    },
                    {
                      key: "feriasMaxPeriodos",
                      label: "Máximo de períodos",
                      desc: "Férias podem ser divididas em até X períodos"
                    },
                    {
                      key: "feriasMaxDiasVenda",
                      label: "Máximo dias a vender",
                      desc: "Funcionário pode vender até X dias de férias"
                    },
                    {
                      key: "feriasVedacaoPreFeriadoDias",
                      label: "Vedação pré-feriado (dias)",
                      desc: "Não pode iniciar férias X dia(s) antes de feriado/repouso (CFO: 1)"
                    },
                    {
                      key: "feriasRodadaAvisoDias",
                      label: "Aviso ao RH: Aviso/Recibo do 2º e 3º período (dias antes)",
                      desc: "O RH é avisado X dias antes do início de cada período seguinte"
                    }
                  ] as { key: keyof ConfigSolicitacoes; label: string; desc: string }[]
                ).map(({ key, label, desc }) => (
                  <div key={key}>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ink-700)",
                        display: "block",
                        marginBottom: 4
                      }}
                    >
                      {label}
                    </label>
                    <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 0 6px" }}>
                      {desc}
                    </p>
                    <input
                      type="number"
                      min={1}
                      value={configSol[key] as number}
                      onChange={(e) =>
                        setConfigSol((c) =>
                          c ? { ...c, [key]: parseInt(e.target.value) || 1 } : c
                        )
                      }
                      style={{
                        width: 80,
                        padding: "7px 10px",
                        border: "1px solid rgba(122,30,38,0.14)",
                        borderRadius: "var(--radius-md)",
                        fontSize: 14,
                        fontFamily: "var(--font-mono)"
                      }}
                    />
                  </div>
                ))}
              </div>
            </Secao>

            {/* ── Banco de Horas — Fins de Semana e Feriados ── */}
            <Secao
              titulo="Banco de Horas — Fins de Semana e Feriados"
              icon={<SettingsIcon size={18} />}
            >
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 20, lineHeight: 1.6 }}
              >
                Define o multiplicador aplicado ao banco de horas quando o funcionário trabalha em
                fins de semana ou feriados. 100% = banco normal (1 h trabalhada = 1 h no banco).
                200% = hora em dobro (1 h = 2 h). Conforme acordo coletivo.
              </p>
              {periodos && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 20
                  }}
                >
                  {(
                    [
                      [
                        "bancoHorasSabadoPct",
                        "Sábado (%)",
                        "100%  = banco normal  |  200% = hora em dobro"
                      ],
                      ["bancoHorasDomingoPct", "Domingo (%)", "200% padrão (hora em dobro)"],
                      ["bancoHorasFeriadoPct", "Feriados (%)", "200% padrão (hora em dobro)"]
                    ] as const
                  ).map(([campo, label, dica]) => (
                    <div key={campo}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--ink-700)",
                          marginBottom: 4
                        }}
                      >
                        {label}
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="number"
                          min={100}
                          max={500}
                          step={10}
                          value={
                            (periodos[campo as keyof typeof periodos] as number) ??
                            (campo === "bancoHorasSabadoPct" ? 100 : 200)
                          }
                          onChange={(e) => {
                            const v = Math.max(100, Math.min(500, parseInt(e.target.value) || 100));
                            setPeriodos((p) => (p ? { ...p, [campo]: v } : p));
                          }}
                          style={{
                            width: 90,
                            padding: "8px 10px",
                            border: "1px solid rgba(122,30,38,0.14)",
                            borderRadius: "var(--radius-md)",
                            fontSize: 14,
                            fontFamily: "var(--font-mono)",
                            textAlign: "right"
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{dica}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 20 }}>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    if (!periodos) return;
                    if (!exigirFuncao("configuracoes.periodos.salvar")) return;
                    try {
                      await api.put("/ponto/config/sistema", {
                        bancoHorasSabadoPct: periodos.bancoHorasSabadoPct,
                        bancoHorasDomingoPct: periodos.bancoHorasDomingoPct,
                        bancoHorasFeriadoPct: periodos.bancoHorasFeriadoPct
                      });
                      alert("Multiplicadores salvos com sucesso.");
                    } catch (e) {
                      alert("Erro ao salvar: " + (e as Error).message);
                    }
                  }}
                >
                  Salvar Multiplicadores
                </button>
              </div>
            </Secao>

            {/* ── Acordo coletivo da jornada (Espelho de Ponto) ── */}
            <Secao titulo="Acordo coletivo da jornada" icon={<AlertCircleIcon size={18} />}>
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}
              >
                Quando o acordo coletivo reduz a jornada do contrato, o Espelho de Ponto mostra as
                duas (ex.: "8h00/dia – ACT 2026-2028: 7h00/dia"). Informe a identificação do acordo.
              </p>
              {periodos && (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <label
                      htmlFor="jornadaAcordoColetivo"
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ink-700)",
                        marginBottom: 4
                      }}
                    >
                      Identificação do acordo
                    </label>
                    <input
                      id="jornadaAcordoColetivo"
                      value={periodos.jornadaAcordoColetivo}
                      maxLength={40}
                      placeholder="ACT 2026-2028"
                      onChange={(e) =>
                        setPeriodos((p) =>
                          p ? { ...p, jornadaAcordoColetivo: e.target.value } : p
                        )
                      }
                      style={{
                        width: 220,
                        padding: "8px 10px",
                        border: "1px solid rgba(122,30,38,0.14)",
                        borderRadius: "var(--radius-md)",
                        fontSize: 14
                      }}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      if (!periodos) return;
                      if (!exigirFuncao("configuracoes.periodos.aviso-contrato")) return;
                      try {
                        await api.put("/ponto/config/sistema", {
                          jornadaAcordoColetivo: periodos.jornadaAcordoColetivo.trim() || null
                        });
                        alert("Acordo coletivo da jornada salvo com sucesso.");
                      } catch (e) {
                        alert("Erro ao salvar: " + (e as Error).message);
                      }
                    }}
                  >
                    Salvar acordo
                  </button>
                </div>
              )}
            </Secao>

            {/* ── Contratos de Estágio / Jovem Aprendiz ── */}
            <Secao
              titulo="Contratos de Estágio e Jovem Aprendiz"
              icon={<AlertCircleIcon size={18} />}
            >
              <p
                style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}
              >
                Antecedência com que o painel da Gestão passa a exibir os contratos de Estagiário e
                Jovem Aprendiz que estão para terminar. As faixas de urgência do painel dividem esse
                prazo em três partes (ex.: 90 dias → até 30, 31–60 e 61–90 dias).
              </p>
              {periodos && (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <label
                      htmlFor="contratoAvisoAntecedenciaDias"
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ink-700)",
                        marginBottom: 4
                      }}
                    >
                      Avisar com antecedência de (dias)
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        id="contratoAvisoAntecedenciaDias"
                        type="number"
                        min={1}
                        max={365}
                        step={1}
                        value={periodos.contratoAvisoAntecedenciaDias}
                        onChange={(e) =>
                          setPeriodos((p) =>
                            p ? { ...p, contratoAvisoAntecedenciaDias: Number(e.target.value) } : p
                          )
                        }
                        style={{
                          width: 100,
                          padding: "8px 10px",
                          border: "1px solid rgba(122,30,38,0.14)",
                          borderRadius: "var(--radius-md)",
                          fontSize: 14,
                          fontFamily: "var(--font-mono)"
                        }}
                      />
                      <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                        padrão: 90 dias (de 1 a 365)
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      if (!periodos) return;
                      if (!exigirFuncao("configuracoes.periodos.aviso-contrato")) return;
                      const dias = periodos.contratoAvisoAntecedenciaDias;
                      if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
                        alert("Informe um número inteiro de 1 a 365 dias.");
                        return;
                      }
                      try {
                        await api.put("/ponto/config/sistema", {
                          contratoAvisoAntecedenciaDias: dias
                        });
                        alert("Antecedência do aviso de fim de contrato salva com sucesso.");
                      } catch (e) {
                        alert("Erro ao salvar: " + (e as Error).message);
                      }
                    }}
                  >
                    Salvar antecedência
                  </button>
                </div>
              )}
            </Secao>
          </>
        )}

        {/* ═══════ TAB: FERIADOS ═══════ */}
        {tab === "feriados" &&
          (() => {
            const diasNoMes = new Date(feriadosAno, feriadosMes + 1, 0).getDate();
            const primeiroDia = new Date(Date.UTC(feriadosAno, feriadosMes, 1)).getUTCDay(); // 0=Dom
            const celulas = primeiroDia + diasNoMes;
            const semanas = Math.ceil(celulas / 7);
            const feriadosMesAtual = feriadoDoMes();

            return (
              <>
                {/* Cabeçalho do calendário: navegação */}
                <Secao titulo="Calendário de Feriados" icon={<CalendarIcon size={18} />}>
                  {feriadoSyncMsg && (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: "10px 14px",
                        borderRadius: 8,
                        background: "#dcfce7",
                        border: "1px solid #86efac",
                        color: "#15803d",
                        fontSize: 13
                      }}
                    >
                      {feriadoSyncMsg}
                    </div>
                  )}
                  <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--ink-500)" }}>
                    Alterações manuais neste calendário são enviadas automaticamente para a API
                    Servidora com <strong>todos os feriados configurados</strong> (todos os anos),
                    disponibilizando os dados atualizados para os demais sistemas integrados.
                  </p>
                  {/* Navegação mês/ano */}
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
                      className="btn btn-ghost btn-sm"
                      onClick={() => navMes(-1)}
                      style={{ padding: "6px 10px" }}
                    >
                      <ArrowLeftIcon size={15} />
                    </button>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        color: "var(--ink-900)",
                        minWidth: 160,
                        textAlign: "center"
                      }}
                    >
                      {MESES_PT[feriadosMes]} {feriadosAno}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navMes(1)}
                      style={{ padding: "6px 10px" }}
                    >
                      <ArrowRightIcon size={15} />
                    </button>
                    <select
                      value={feriadosAno}
                      onChange={(e) => setFeriadosAno(parseInt(e.target.value))}
                      style={{
                        marginLeft: 8,
                        padding: "5px 8px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        fontSize: 13,
                        background: "#fff"
                      }}
                    >
                      {Array.from({ length: 10 }, (_, i) => hoje.getFullYear() - 3 + i).map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <div style={{ flex: 1 }} />
                    {podeRh("configuracoes.feriados.abonar") && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => abrirModalDia(new Date().getDate(), null, true)}
                        title="Abono do RH: dia neutro no banco de horas para todos, com registro bloqueado — não é feriado"
                        style={{ gap: 6, color: ABONO_COR, borderColor: `${ABONO_COR}66` }}
                      >
                        ✋ Abonar um dia
                      </button>
                    )}
                    {podeRh("configuracoes.feriados.gerenciar") && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => abrirModalDia(new Date().getDate(), null)}
                        style={{ gap: 6 }}
                      >
                        <PlusIcon size={14} />
                        Adicionar
                      </button>
                    )}
                  </div>

                  {feriadosLoading ? (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--ink-500)",
                        textAlign: "center",
                        padding: 32
                      }}
                    >
                      Carregando feriados…
                    </p>
                  ) : (
                    <>
                      {/* Grade do calendário */}
                      <div style={{ overflowX: "auto" }}>
                        <div style={{ minWidth: 280 }}>
                          {/* Cabeçalho dias da semana */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(7,1fr)",
                              gap: 2,
                              marginBottom: 4
                            }}
                          >
                            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                              <div
                                key={d}
                                style={{
                                  textAlign: "center",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "var(--ink-400)",
                                  padding: "4px 0",
                                  letterSpacing: "0.04em"
                                }}
                              >
                                {d}
                              </div>
                            ))}
                          </div>
                          {/* Semanas */}
                          {Array.from({ length: semanas }, (_, s) => (
                            <div
                              key={s}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(7,1fr)",
                                gap: 2,
                                marginBottom: 2
                              }}
                            >
                              {Array.from({ length: 7 }, (_, dow) => {
                                const idx = s * 7 + dow;
                                const dia = idx - primeiroDia + 1;
                                if (dia < 1 || dia > diasNoMes) {
                                  return (
                                    <div
                                      key={dow}
                                      style={{ aspectRatio: "1", borderRadius: "var(--radius-md)" }}
                                    />
                                  );
                                }
                                const feriado = feriadoPorDia(dia);
                                const isBloq = feriado?.bloqueiaRegistro;
                                const cor = feriado
                                  ? (TIPO_COR[feriado.tipo] ?? "#7c3aed")
                                  : undefined;
                                const ehHoje =
                                  dia === hoje.getDate() &&
                                  feriadosMes === hoje.getMonth() &&
                                  feriadosAno === hoje.getFullYear();

                                const tituloCell = feriado
                                  ? feriado.tipo === TIPO_ABONO
                                    ? `${feriado.nome} — Abono do RH, não é feriado (clique para editar)`
                                    : `${feriado.nome} — ${isBloq ? "Bloqueado (clique para editar)" : "Liberado (clique para editar)"}`
                                  : "Clique para adicionar feriado ou bloqueio neste dia";

                                return (
                                  <div
                                    key={dow}
                                    title={tituloCell}
                                    onClick={() => abrirModalDia(dia, feriado ?? null)}
                                    style={{
                                      aspectRatio: "1",
                                      borderRadius: "var(--radius-md)",
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      cursor: "pointer",
                                      background: feriado
                                        ? isBloq
                                          ? cor
                                          : `${cor}22`
                                        : ehHoje
                                          ? "var(--cream-100)"
                                          : "transparent",
                                      border: ehHoje
                                        ? "1.5px solid var(--burgundy-300)"
                                        : "1.5px solid transparent",
                                      transition: "all 120ms",
                                      position: "relative"
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!feriado)
                                        (e.currentTarget as HTMLDivElement).style.background =
                                          "rgba(122,30,38,0.06)";
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!feriado && !ehHoje)
                                        (e.currentTarget as HTMLDivElement).style.background =
                                          "transparent";
                                      if (!feriado && ehHoje)
                                        (e.currentTarget as HTMLDivElement).style.background =
                                          "var(--cream-100)";
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 13,
                                        fontWeight: feriado || ehHoje ? 700 : 400,
                                        color: feriado
                                          ? isBloq
                                            ? "#fff"
                                            : cor
                                          : ehHoje
                                            ? "var(--burgundy-700)"
                                            : "var(--ink-700)"
                                      }}
                                    >
                                      {dia}
                                    </span>
                                    {feriado && (
                                      <span
                                        style={{
                                          fontSize: 7,
                                          marginTop: 1,
                                          color: isBloq ? "rgba(255,255,255,0.85)" : cor
                                        }}
                                      >
                                        {feriado.tipo === TIPO_ABONO ? "✋" : isBloq ? "●" : "○"}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Legenda */}
                      <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                        {Object.entries(TIPO_COR).map(([tipo, cor]) => (
                          <div key={tipo} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: cor,
                                display: "inline-block"
                              }}
                            />
                            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                              {TIPO_LABEL_F[tipo]}
                            </span>
                          </div>
                        ))}
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                            ● bloqueado &nbsp; ○ liberado
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </Secao>

                {/* Lista de feriados do mês */}
                <Secao
                  titulo={`Feriados — ${MESES_PT[feriadosMes]} ${feriadosAno}`}
                  icon={<AlertCircleIcon size={18} />}
                >
                  {feriadosMesAtual.length === 0 ? (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--ink-400)",
                        textAlign: "center",
                        padding: "20px 0"
                      }}
                    >
                      Nenhum feriado cadastrado para este mês.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {feriadosMesAtual.map((f) => {
                        const d = new Date(f.data);
                        const dd = String(d.getUTCDate()).padStart(2, "0");
                        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
                        const cor = TIPO_COR[f.tipo] ?? "#7c3aed";
                        return (
                          <div
                            key={f.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "10px 0",
                              borderBottom: "1px solid rgba(122,30,38,0.06)"
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: cor,
                                minWidth: 42,
                                fontFamily: "var(--font-mono)"
                              }}
                            >
                              {dd}/{mm}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                fontSize: 13.5,
                                color: "var(--ink-900)",
                                fontWeight: 500
                              }}
                            >
                              {f.nome}
                              {f.marcoHorario && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "var(--ink-500)",
                                    fontWeight: 400,
                                    marginLeft: 6
                                  }}
                                >
                                  ({f.marcoLado === "ANTES" ? "até" : "após"} {f.marcoHorario})
                                </span>
                              )}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 7px",
                                borderRadius: 20,
                                background: `${cor}18`,
                                color: cor,
                                fontWeight: 600
                              }}
                            >
                              {f.tipo === TIPO_ABONO
                                ? "ABONO DO RH"
                                : (TIPO_LABEL_F[f.tipo] ?? f.tipo)}
                            </span>
                            <button
                              disabled={f.tipo === TIPO_ABONO}
                              onClick={() => toggleFeriadoBloqueio(f)}
                              title={
                                f.tipo === TIPO_ABONO
                                  ? "Dia abonado pelo RH sempre bloqueia o registro de ponto"
                                  : f.bloqueiaRegistro
                                    ? "Clique para liberar o registro de ponto"
                                    : "Clique para bloquear o registro de ponto"
                              }
                              style={{
                                padding: "4px 10px",
                                borderRadius: "var(--radius-md)",
                                border: `1.5px solid ${f.bloqueiaRegistro ? "#b91c1c" : "#15803d"}`,
                                background: f.bloqueiaRegistro ? "#fef2f2" : "#f0fdf4",
                                color: f.bloqueiaRegistro ? "#b91c1c" : "#15803d",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: f.tipo === TIPO_ABONO ? "default" : "pointer"
                              }}
                            >
                              {f.bloqueiaRegistro ? "Bloqueado" : "Liberado"}
                            </button>
                            <button
                              onClick={() => deletarFeriado(f.id)}
                              title="Remover feriado"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--ink-400)",
                                padding: 4,
                                display: "flex",
                                alignItems: "center"
                              }}
                            >
                              <Trash2Icon size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Secao>
              </>
            );
          })()}

        {/* Modal: adicionar / editar feriado */}
        {feriadoModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9000,
              padding: 16
            }}
            onClick={() => {
              setFeriadoModal(false);
              setEditandoFeriado(null);
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "var(--radius-lg)",
                padding: 24,
                width: "100%",
                maxWidth: 460,
                maxHeight: "92dvh",
                overflowY: "auto",
                boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                borderTop: `4px solid ${ehAbonoForm ? ABONO_COR : "var(--burgundy-600)"}`
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cabeçalho */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: 18,
                    color: ehAbonoForm ? ABONO_COR : "var(--burgundy-600)",
                    fontWeight: 400
                  }}
                >
                  {ehAbonoForm
                    ? editandoFeriado
                      ? "Editar abono do RH (não é feriado)"
                      : "Abonar dia (não é feriado)"
                    : editandoFeriado
                      ? "Editar Feriado"
                      : "Adicionar Feriado"}
                </h3>
                <button
                  onClick={() => {
                    setFeriadoModal(false);
                    setEditandoFeriado(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--ink-400)"
                  }}
                >
                  <XIcon size={18} />
                </button>
              </div>
              {/* Data selecionada */}
              {feriadoForm.data && (
                <p style={{ fontSize: 12.5, color: "var(--ink-500)", marginBottom: 18 }}>
                  {new Date(`${feriadoForm.data}T12:00:00`).toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric"
                  })}
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Chave de modalidade: feriado convencional × abono do RH */}
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    Modalidade
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Modalidade"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                      padding: 4,
                      borderRadius: "var(--radius-md)",
                      background: "var(--cream-50)",
                      border: "1px solid rgba(122,30,38,0.12)"
                    }}
                  >
                    {(
                      [
                        [false, "🗓 Feriado convencional", "var(--burgundy-600)"],
                        [true, "✋ Abono do RH — não é feriado", ABONO_COR]
                      ] as const
                    ).map(([abono, texto, cor]) => {
                      const ativo = ehAbonoForm === abono;
                      return (
                        <button
                          key={String(abono)}
                          type="button"
                          role="radio"
                          aria-checked={ativo}
                          onClick={() => escolherModalidade(abono)}
                          style={{
                            padding: "8px 6px",
                            borderRadius: "var(--radius-md)",
                            border: `1.5px solid ${ativo ? cor : "transparent"}`,
                            background: ativo ? "#fff" : "transparent",
                            color: ativo ? cor : "var(--ink-500)",
                            fontSize: 12.5,
                            fontWeight: 700,
                            cursor: "pointer",
                            boxShadow: ativo ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                            lineHeight: 1.3
                          }}
                        >
                          {texto}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {ehAbonoForm && (
                  <div
                    role="note"
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      background: `${ABONO_COR}12`,
                      border: `1px solid ${ABONO_COR}55`,
                      color: "var(--ink-700)",
                      fontSize: 12.5,
                      lineHeight: 1.55
                    }}
                  >
                    Você está configurando um <strong>abono do RH</strong>, e não um feriado
                    convencional. Para <strong>todos os funcionários</strong>: o dia fica{" "}
                    <strong>neutro no banco de horas</strong> (sem horas positivas ou negativas), o{" "}
                    <strong>registro de ponto fica bloqueado</strong> e o{" "}
                    <strong>nome abaixo aparece como status</strong> em todos os históricos.
                    {dataAbonoPassada && (
                      <>
                        <br />
                        <strong style={{ color: "#b45309" }}>
                          Esta data já passou: o banco de horas já apurado de todos os funcionários
                          será recalculado.
                        </strong>
                      </>
                    )}
                  </div>
                )}

                {/* Data — só aparece no modo criar */}
                {!editandoFeriado && (
                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--ink-500)",
                        display: "block",
                        marginBottom: 5
                      }}
                    >
                      Data
                    </label>
                    <input
                      type="date"
                      value={feriadoForm.data}
                      onChange={(e) => setFeriadoForm((f) => ({ ...f, data: e.target.value }))}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        border: "1px solid rgba(122,30,38,0.14)",
                        borderRadius: "var(--radius-md)",
                        fontSize: 13.5,
                        boxSizing: "border-box" as const
                      }}
                    />
                  </div>
                )}

                {/* Nome */}
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    {ehAbonoForm ? "Nome exibido no status *" : "Nome *"}
                  </label>
                  <input
                    type="text"
                    value={feriadoForm.nome}
                    onChange={(e) => setFeriadoForm((f) => ({ ...f, nome: e.target.value }))}
                    placeholder={
                      ehAbonoForm
                        ? "Ex: Recesso — Portaria nº 12/2026"
                        : "Ex: Aniversário da cidade"
                    }
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 13.5,
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>

                {!ehAbonoForm && (
                  <>
                    {/* Tipo */}
                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--ink-500)",
                          display: "block",
                          marginBottom: 5
                        }}
                      >
                        Tipo
                      </label>
                      <select
                        value={feriadoForm.tipo}
                        onChange={(e) => setFeriadoForm((f) => ({ ...f, tipo: e.target.value }))}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          border: "1px solid rgba(122,30,38,0.14)",
                          borderRadius: "var(--radius-md)",
                          fontSize: 13.5,
                          background: "#fff",
                          boxSizing: "border-box" as const
                        }}
                      >
                        <option value="NACIONAL">Nacional</option>
                        <option value="DISTRITAL">Distrital (DF)</option>
                        <option value="FACULTATIVO">Facultativo</option>
                        <option value="MANUAL">Manual</option>
                      </select>
                    </div>

                    {/* Marco de Horário (feriado parcial) */}
                    <div
                      style={{
                        border: "1px solid rgba(122,30,38,0.14)",
                        borderRadius: "var(--radius-md)",
                        padding: "12px 14px"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: feriadoForm.marcoHorario ? 12 : 0
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: "var(--ink-700)",
                              margin: 0
                            }}
                          >
                            Feriado parcial
                          </p>
                          <p
                            style={{
                              fontSize: 11.5,
                              color: "var(--ink-500)",
                              margin: "2px 0 0",
                              lineHeight: 1.4
                            }}
                          >
                            Libera apenas o período antes ou após um horário
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setFeriadoForm((f) => ({
                              ...f,
                              marcoHorario: f.marcoHorario ? "" : "12:00"
                            }))
                          }
                          style={{
                            width: 44,
                            height: 24,
                            borderRadius: 12,
                            border: "none",
                            cursor: "pointer",
                            flexShrink: 0,
                            background: feriadoForm.marcoHorario
                              ? "var(--brand-600, #7a1e26)"
                              : "#9ca3af",
                            position: "relative",
                            transition: "background 200ms"
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: 3,
                              left: feriadoForm.marcoHorario ? 22 : 3,
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              background: "#fff",
                              transition: "left 200ms",
                              display: "block"
                            }}
                          />
                        </button>
                      </div>

                      {feriadoForm.marcoHorario && (
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                          <div style={{ flex: 1 }}>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: "var(--ink-500)",
                                display: "block",
                                marginBottom: 4
                              }}
                            >
                              Horário marco
                            </label>
                            <input
                              type="time"
                              value={feriadoForm.marcoHorario}
                              onChange={(e) =>
                                setFeriadoForm((f) => ({ ...f, marcoHorario: e.target.value }))
                              }
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                border: "1px solid rgba(122,30,38,0.14)",
                                borderRadius: "var(--radius-md)",
                                fontSize: 13.5,
                                boxSizing: "border-box" as const
                              }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: "var(--ink-500)",
                                display: "block",
                                marginBottom: 4
                              }}
                            >
                              Período feriado
                            </label>
                            <select
                              value={feriadoForm.marcoLado}
                              onChange={(e) =>
                                setFeriadoForm((f) => ({
                                  ...f,
                                  marcoLado: e.target.value as "ANTES" | "DEPOIS"
                                }))
                              }
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                border: "1px solid rgba(122,30,38,0.14)",
                                borderRadius: "var(--radius-md)",
                                fontSize: 13.5,
                                background: "#fff",
                                boxSizing: "border-box" as const
                              }}
                            >
                              <option value="DEPOIS">Após {feriadoForm.marcoHorario || "—"}</option>
                              <option value="ANTES">
                                Antes de {feriadoForm.marcoHorario || "—"}
                              </option>
                            </select>
                          </div>
                        </div>
                      )}

                      {feriadoForm.marcoHorario && (
                        <p
                          style={{
                            fontSize: 11.5,
                            color: "var(--ink-500)",
                            marginTop: 8,
                            marginBottom: 0,
                            lineHeight: 1.5
                          }}
                        >
                          {feriadoForm.marcoLado === "DEPOIS"
                            ? `Feriado a partir das ${feriadoForm.marcoHorario} — a jornada obrigatória é reduzida proporcionalmente (período da manhã conta normalmente).`
                            : `Feriado até as ${feriadoForm.marcoHorario} — a jornada obrigatória é reduzida proporcionalmente (período da tarde conta normalmente).`}
                        </p>
                      )}
                    </div>

                    {/* Bloqueio de registro */}
                    <div
                      style={{
                        background: feriadoForm.bloqueiaRegistro
                          ? "rgba(185,28,28,0.05)"
                          : "rgba(21,128,61,0.05)",
                        border: `1px solid ${feriadoForm.bloqueiaRegistro ? "rgba(185,28,28,0.18)" : "rgba(21,128,61,0.18)"}`,
                        borderRadius: "var(--radius-md)",
                        padding: "12px 14px"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: feriadoForm.bloqueiaRegistro ? "#b91c1c" : "#15803d",
                              margin: 0
                            }}
                          >
                            {feriadoForm.bloqueiaRegistro
                              ? "🔒 Registro bloqueado"
                              : "🔓 Registro liberado"}
                          </p>
                          <p
                            style={{
                              fontSize: 11.5,
                              color: "var(--ink-500)",
                              margin: "3px 0 0",
                              lineHeight: 1.4
                            }}
                          >
                            {feriadoForm.bloqueiaRegistro
                              ? feriadoForm.marcoHorario
                                ? `Bloqueio de registro ${feriadoForm.marcoLado === "ANTES" ? `antes das ${feriadoForm.marcoHorario}` : `a partir das ${feriadoForm.marcoHorario}`}.`
                                : "Funcionários não poderão registrar ponto neste dia."
                              : "Funcionários poderão registrar ponto normalmente neste dia."}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setFeriadoForm((f) => ({ ...f, bloqueiaRegistro: !f.bloqueiaRegistro }))
                          }
                          style={{
                            width: 44,
                            height: 24,
                            borderRadius: 12,
                            border: "none",
                            cursor: "pointer",
                            flexShrink: 0,
                            background: feriadoForm.bloqueiaRegistro ? "#b91c1c" : "#15803d",
                            position: "relative",
                            transition: "background 200ms"
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: 3,
                              left: feriadoForm.bloqueiaRegistro ? 22 : 3,
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              background: "#fff",
                              transition: "left 200ms",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.25)"
                            }}
                          />
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Justificativa / Observação */}
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 5
                    }}
                  >
                    {ehAbonoForm ? "Ato/Portaria (observação)" : "Justificativa / Observação"}
                    <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 4 }}>
                      (opcional)
                    </span>
                  </label>
                  <textarea
                    value={feriadoForm.observacao}
                    onChange={(e) => setFeriadoForm((f) => ({ ...f, observacao: e.target.value }))}
                    placeholder={
                      ehAbonoForm
                        ? "Ex: Portaria nº 12/2026 da Presidência"
                        : "Ex: Ponto facultativo concedido pela direção"
                    }
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-md)",
                      fontSize: 13,
                      resize: "vertical",
                      boxSizing: "border-box" as const,
                      fontFamily: "var(--font-body)"
                    }}
                  />
                </div>

                {ehAbonoForm && (
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    Como o funcionário verá no histórico:{" "}
                    <span
                      className="badge badge-gray"
                      style={{ marginLeft: 4, fontSize: 11.5, whiteSpace: "normal" }}
                    >
                      {feriadoForm.nome.trim() || "Nome do abono"}
                    </span>
                  </div>
                )}

                {exigeCienciaAbono && (
                  <label
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                      fontSize: 12.5,
                      color: "var(--ink-700)",
                      lineHeight: 1.45,
                      cursor: "pointer",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      border: `1px solid ${cienteAbono ? `${ABONO_COR}66` : "rgba(185,28,28,0.25)"}`,
                      background: cienteAbono ? `${ABONO_COR}0d` : "rgba(185,28,28,0.03)"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cienteAbono}
                      onChange={(e) => setCienteAbono(e.target.checked)}
                      style={{ width: 16, height: 16, marginTop: 1, accentColor: ABONO_COR }}
                    />
                    <span>
                      {ehAbonoForm
                        ? "Estou ciente de que este dia não é um feriado convencional e que o abono se aplica a todos os funcionários."
                        : "Estou ciente de que este dia deixará de ser um abono do RH e passará a seguir as regras de feriado convencional."}
                      {trocouModalidade &&
                        " O banco de horas desta data será recalculado para todos os funcionários."}
                    </span>
                  </label>
                )}
              </div>

              <div
                style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20 }}
              >
                <div>
                  {editandoFeriado && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--red)", borderColor: "rgba(200,57,63,0.25)" }}
                      onClick={() => {
                        void deletarFeriado(editandoFeriado.id);
                        setFeriadoModal(false);
                        setEditandoFeriado(null);
                      }}
                    >
                      <Trash2Icon size={13} /> Excluir
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setFeriadoModal(false);
                      setEditandoFeriado(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => void salvarFeriadoModal()}
                    disabled={
                      !feriadoForm.data ||
                      !feriadoForm.nome.trim() ||
                      (exigeCienciaAbono && !cienteAbono)
                    }
                    style={{
                      opacity:
                        !feriadoForm.data ||
                        !feriadoForm.nome.trim() ||
                        (exigeCienciaAbono && !cienteAbono)
                          ? 0.5
                          : 1,
                      ...(ehAbonoForm ? { background: ABONO_COR, borderColor: ABONO_COR } : {})
                    }}
                  >
                    {ehAbonoForm
                      ? editandoFeriado
                        ? "Salvar abono"
                        : "Abonar dia"
                      : editandoFeriado
                        ? "Salvar alterações"
                        : "Adicionar feriado"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ TAB: NOTIFICAÇÕES ═══════ */}
        {tab === "notificacoes" && <TabNotificacoes isSuperAdmin={user?.isSuperAdmin ?? false} />}
        {tab === "termos" && (
          <Secao titulo="Termos de uso" icon={<AlertCircleIcon size={18} />}>
            <ConfigTermosUso />
          </Secao>
        )}

        {/* Modal de mapa */}
        {mapaModal && (
          <MapModal
            lat={
              mapaAreaId && !mapaAreaId.startsWith("NEW:")
                ? (areas.find((a) => a.id === mapaAreaId)?.lat ?? config.lat)
                : config.lat
            }
            lng={
              mapaAreaId && !mapaAreaId.startsWith("NEW:")
                ? (areas.find((a) => a.id === mapaAreaId)?.lng ?? config.lng)
                : config.lng
            }
            raio={
              mapaAreaId && !mapaAreaId.startsWith("NEW:")
                ? (areas.find((a) => a.id === mapaAreaId)?.raioMetros ?? config.raioMetros)
                : config.raioMetros
            }
            titulo={mapaAreaId === null ? "Localização da Sede CFO" : "Área de Viagem"}
            onConfirm={onMapaConfirm}
            onClose={() => setMapaModal(false)}
          />
        )}
      </fieldset>
    </div>
  );
}

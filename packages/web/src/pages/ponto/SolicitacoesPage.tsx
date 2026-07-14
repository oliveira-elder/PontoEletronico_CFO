import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PlusIcon,
  CheckCircleIcon,
  CalendarIcon,
  RefreshCwIcon,
  InfoIcon
} from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  FeriasDetalheBlock,
  LinkDocumentoAnexado,
  textoCorrecaoPontoFuncionario
} from "./solicitacaoUi";
import {
  categoriaSemRegistroPonto,
  MSG_SOLICITACAO_APENAS_INFORMATIVA
} from "../../utils/categoriaPonto";

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
  | "HORA_EXTRA";
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
  rhObservacao?: string;
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
}

const TIPO_LABEL: Record<TipoSolicitacao, string> = {
  CORRECAO_PONTO: "Correção de Ponto",
  ATESTADO: "Atestado Médico",
  FERIAS: "Férias",
  LICENCA: "Licença",
  ABONO: "Abono",
  DAY_OFF: "Day Off de Aniversário",
  HORA_EXTRA: "Hora Extra"
};

const TIPO_EMOJI: Record<TipoSolicitacao, string> = {
  CORRECAO_PONTO: "🕐",
  ATESTADO: "🏥",
  FERIAS: "🌴",
  LICENCA: "📋",
  ABONO: "📆",
  DAY_OFF: "🎂",
  HORA_EXTRA: "⏱️"
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

function diffDias(inicio: string, fim: string): number {
  if (!inicio || !fim) return 0;
  const d1 = new Date(inicio);
  const d2 = new Date(fim);
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1);
}

function mensagemStatusCorrecaoPonto(status: StatusSolicitacao): string {
  switch (status) {
    case "PENDENTE":
      return "Enviada ao seu gestor de área. Você será notificado quando houver uma decisão.";
    case "AGUARDANDO_RH":
      return "Aprovada pelo gestor e encaminhada ao RH. Após a aálise final, seu ponto será atualizado automaticamente.";
    case "APROVADA":
      return "Aprovada pelo gestor e pelo RH. Seu histórico de ponto já reflete a alteração solicitada.";
    case "REJEITADA_GESTOR":
      return "Rejeitada pelo gestor de área. Confira o motivo abaixo; se precisar, você pode abrir uma nova solicitação.";
    case "REJEITADA_RH":
      return "Aprovada pelo gestor, mas rejeitada pelo RH na análise final. Confira o motivo abaixo.";
    case "REJEITADA":
      return "Solicitação rejeitada. Confira as observações abaixo.";
    default:
      return "";
  }
}

function StatusBadge({ status }: { status: StatusSolicitacao }) {
  const map: Record<StatusSolicitacao, { label: string; cls: string }> = {
    PENDENTE: { label: "Aguardando Gestor", cls: "badge-amber" },
    AGUARDANDO_RH: { label: "Aguardando RH", cls: "badge-blue" },
    AGUARDANDO_DOCUMENTO_FUNCIONARIO: { label: "Aguardando seu documento", cls: "badge-amber" },
    APROVADA: { label: "Aprovada", cls: "badge-green" },
    REJEITADA: { label: "Rejeitada", cls: "badge-red" },
    REJEITADA_GESTOR: { label: "Rejeitada pelo Gestor", cls: "badge-red" },
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
  HORA_EXTRA: "tipoAtivoHoraExtra"
};

function TipoSeletor({
  onSelect,
  config
}: {
  onSelect: (t: TipoSolicitacao) => void;
  config: ConfigSolicitacoes | null;
}) {
  const tipos = (Object.keys(TIPO_LABEL) as TipoSolicitacao[]).filter((t) => {
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
  const [h, m] = horario.split(":").map(Number);
  const [hMin, mMin] = min.split(":").map(Number);
  const [hMax, mMax] = max.split(":").map(Number);
  const atual = h * 60 + m;
  return atual >= hMin * 60 + mMin && atual <= hMax * 60 + mMax;
}

/* Tipos de registro exibidos no formulário de correção */
const TIPOS_CORRECAO_TODOS = [
  { tipo: "ENTRADA", label: "Entrada", emoji: "🟢" },
  { tipo: "INICIO_INTERVALO", label: "Início Intervalo", emoji: "🟡" },
  { tipo: "FIM_INTERVALO", label: "Fim Intervalo", emoji: "🔵" },
  { tipo: "SAIDA", label: "Saída", emoji: "🔴" }
] as const;

const TIPOS_INTERVALO_ALMOCO = new Set(["INICIO_INTERVALO", "FIM_INTERVALO"]);

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

  /* Horários desejados para cada tipo — "" = sem alteração */
  const [horarios, setHorarios] = useState<Record<string, string>>({
    ENTRADA: "",
    INICIO_INTERVALO: "",
    FIM_INTERVALO: "",
    SAIDA: ""
  });

  const tiposCorrecao = semIntervaloAlmoco
    ? TIPOS_CORRECAO_TODOS.filter((t) => !TIPOS_INTERVALO_ALMOCO.has(t.tipo))
    : TIPOS_CORRECAO_TODOS;

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
        setSemIntervaloAlmoco(cat === "ESTAGIARIO" || cat === "MENOR_APRENDIZ");
      })
      .catch(() => {});
  }, []);

  const carregarRegistros = useCallback(async (data: string) => {
    if (!data) return;
    setLoadingRegistros(true);
    setHorarios({ ENTRADA: "", INICIO_INTERVALO: "", FIM_INTERVALO: "", SAIDA: "" });
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

  /* Retorna o registro existente para um tipo */
  const regDoTipo = (tipo: string) => registros.find((r) => r.tipo === tipo);

  /* Valida todos os horários preenchidos */
  const erros: Record<string, string> = {};
  for (const { tipo } of tiposCorrecao) {
    const h = horarios[tipo];
    if (h && !horarioDentroFaixa(h, horarioMin, horarioMax)) {
      erros[tipo] = `Fora da faixa ${horarioMin}–${horarioMax}`;
    }
  }

  /* Constrói a lista de correções apenas dos campos alterados */
  const correcoesDia = tiposCorrecao
    .map(({ tipo }) => {
      const novoHorario = horarios[tipo];
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
    if (!dataRef || !descricao || !temAlteracao || temErro) return;
    onSubmit({
      tipo: "CORRECAO_PONTO",
      dataReferencia: new Date(dataRef + "T12:00:00").toISOString(),
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
          max={new Date().toISOString().slice(0, 10)}
        />
      </div>

      {/* Tabela de horários */}
      {dataRef && (
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
                  <input
                    type="time"
                    value={novo}
                    onChange={(e) => setHorarios((h) => ({ ...h, [tipo]: e.target.value }))}
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
                    <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "#1e40af" }}>
                      {reg ? `${atual} → ${novo}` : `Incluir ${novo}`}
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
              gestor.
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
        disabled={enviando || !dataRef || !descricao || !temAlteracao || temErro}
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

  const handleSubmit = () => {
    if (!dataInicio || !descricao) return;
    onSubmit({
      tipo: "ATESTADO",
      dataReferencia: new Date(dataInicio + "T12:00:00").toISOString(),
      dataInicio: new Date(dataInicio + "T00:00:00").toISOString(),
      dataFim: new Date((dataFim || dataInicio) + "T23:59:59").toISOString(),
      descricao,
      metadados: {
        horarioInicio: diaUnico ? horaInicio || null : null,
        horarioFim: diaUnico ? horaFim || null : null,
        diasDuracao: dias,
        requerHomologacao: dias > limite && dias < limiteInss,
        requerInss: dias >= limiteInss,
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
              if (!dataFim) {
                setDataFim(novoInicio);
              } else if (dataFim !== novoInicio) {
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
              <input
                type="time"
                style={{ ...input, maxWidth: 140 }}
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
              />
            </div>
            <div>
              <label style={labelBase}>Horário final</label>
              <input
                type="time"
                style={{ ...input, maxWidth: 140 }}
                value={horaFim}
                onChange={(e) => setHoraFim(e.target.value)}
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
                Após a aprovação do seu gestor, o RH avaliará se este atestado precisa de uma Guia
                do Médico do Trabalho. Caso seja necessário, o RH enviará a guia específica
                diretamente nesta solicitação e você poderá acompanhá-la aqui.
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
        disabled={enviando || !dataInicio || !descricao}
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
  ciclos: Array<{ numero: number; inicio: string; fim: string }>;
}

function FormFerias({
  config,
  onSubmit,
  enviando
}: {
  config: ConfigSolicitacoes | null;
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const cfg = config ?? {
    feriasAntecedenciaMinDias: 30,
    feriasMinimoGrandePeriodo: 14,
    feriasMinimoOutrosPeriodos: 5,
    feriasMaxPeriodos: 3,
    feriasMaxDiasVenda: 10,
    feriasVedacaoPreFeriadoDias: 2
  };

  const [saldo, setSaldo] = useState<SaldoFerias | null>(null);
  const [saldoLoading, setSaldoLoading] = useState(true);
  const [periodos, setPeriodos] = useState<PeriodoFerias[]>([
    { dataInicio: "", dataFim: "", dias: 0 }
  ]);
  const [diasVenda, setDiasVenda] = useState(0);
  const [descricao, setDescricao] = useState("");
  const [erros, setErros] = useState<string[]>([]);

  useEffect(() => {
    api
      .get<SaldoFerias>("/ponto/ferias/saldo")
      .then((s) => setSaldo(s))
      .catch(() => setSaldo(null))
      .finally(() => setSaldoLoading(false));
  }, []);

  const isEstagiario = saldo?.isEstagiario ?? false;

  // Garante que estagiário não tenha diasVenda > 0
  useEffect(() => {
    if (isEstagiario && diasVenda > 0) setDiasVenda(0);
  }, [isEstagiario, diasVenda]);

  const hoje = new Date();
  const minData = new Date(hoje);
  minData.setDate(minData.getDate() + cfg.feriasAntecedenciaMinDias);
  const minDataStr = minData.toISOString().slice(0, 10);

  const totalDiasGozo = periodos.reduce((s, p) => s + p.dias, 0);
  // Estagiário não pode vender dias
  const diasVendaEfetivo = isEstagiario ? 0 : diasVenda;
  const totalDiasUtilizados = totalDiasGozo + diasVendaEfetivo;
  const diasRestantes = (saldo?.diasDisponiveis ?? 0) - totalDiasUtilizados;
  const maxVenda = isEstagiario
    ? 0
    : Math.min(cfg.feriasMaxDiasVenda, saldo?.diasDisponiveis ?? cfg.feriasMaxDiasVenda);
  // venda ocupa 1 slot dos feriasMaxPeriodos disponíveis (não se aplica a estagiários)
  const maxPeriodosGozo =
    !isEstagiario && diasVenda > 0 ? cfg.feriasMaxPeriodos - 1 : cfg.feriasMaxPeriodos;

  function calcDias(ini: string, fim: string) {
    return diffDias(ini, fim);
  }

  function updPeriodo(idx: number, field: "dataInicio" | "dataFim", val: string) {
    setPeriodos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      const p = next[idx];
      if (p.dataInicio && p.dataFim) next[idx].dias = calcDias(p.dataInicio, p.dataFim);
      return next;
    });
  }

  function addPeriodo() {
    if (periodos.length < maxPeriodosGozo) {
      setPeriodos((p) => [...p, { dataInicio: "", dataFim: "", dias: 0 }]);
    }
  }

  function removePeriodo(idx: number) {
    if (periodos.length > 1) setPeriodos((p) => p.filter((_, i) => i !== idx));
  }

  useEffect(() => {
    const errs: string[] = [];
    const todosPreenchidos = periodos.every((p) => p.dataInicio && p.dataFim);

    // venda excede limite de slots (não se aplica a estagiários)
    if (!isEstagiario && diasVenda > 0 && periodos.length > maxPeriodosGozo) {
      errs.push(`Com venda de dias, o máximo é ${maxPeriodosGozo} período(s) de gozo.`);
    }

    // validação por período
    periodos.forEach((p, i) => {
      if (!p.dataInicio || !p.dataFim) return;
      if (new Date(p.dataInicio) < minData)
        errs.push(
          `Período ${i + 1}: início deve ter pelo menos ${cfg.feriasAntecedenciaMinDias} dias de antecedência.`
        );
      if (p.dias > 0 && p.dias < cfg.feriasMinimoOutrosPeriodos)
        errs.push(`Período ${i + 1}: mínimo de ${cfg.feriasMinimoOutrosPeriodos} dias.`);
    });

    // ao menos um período deve ter o mínimo do grande período
    if (
      todosPreenchidos &&
      periodos.length > 0 &&
      !periodos.some((p) => p.dias >= cfg.feriasMinimoGrandePeriodo)
    ) {
      errs.push(
        `Ao menos um período deve ter no mínimo ${cfg.feriasMinimoGrandePeriodo} dias corridos.`
      );
    }

    if (!isEstagiario && diasVenda > maxVenda) errs.push(`Venda máxima de ${maxVenda} dias.`);

    // invariante: gozo (+ venda para não-estagiários) = dias disponíveis
    if (saldo && todosPreenchidos && diasRestantes !== 0) {
      errs.push(
        diasRestantes > 0
          ? `${isEstagiario ? "Gozo" : "Gozo + venda"} deve igualar os ${saldo.diasDisponiveis} dias disponíveis (faltam ${diasRestantes} dias).`
          : `Total excede os ${saldo.diasDisponiveis} dias disponíveis (sobram ${-diasRestantes} dias).`
      );
    }

    setErros(errs);
  }, [
    periodos,
    diasVenda,
    isEstagiario,
    saldo,
    totalDiasUtilizados,
    diasRestantes,
    maxVenda,
    maxPeriodosGozo,
    cfg,
    minData
  ]);

  const diasDisponiveis = saldo?.diasDisponiveis ?? 0;

  const podeEnviar =
    periodos.every((p) => p.dataInicio && p.dataFim && p.dias > 0) &&
    erros.length === 0 &&
    totalDiasUtilizados > 0;

  const handleSubmit = () => {
    if (!podeEnviar) return;
    const primeiroInicio = periodos.reduce(
      (m, p) => (!m || p.dataInicio < m ? p.dataInicio : m),
      ""
    );
    const ultimoFim = periodos.reduce((m, p) => (!m || p.dataFim > m ? p.dataFim : m), "");
    onSubmit({
      tipo: "FERIAS",
      dataReferencia: new Date(primeiroInicio + "T12:00:00").toISOString(),
      dataInicio: new Date(primeiroInicio + "T00:00:00").toISOString(),
      dataFim: new Date(ultimoFim + "T23:59:59").toISOString(),
      descricao,
      metadados: {
        periodos: periodos.map((p) => ({
          dataInicio: p.dataInicio + "T00:00:00.000Z",
          dataFim: p.dataFim + "T23:59:59.000Z",
          dias: p.dias
        })),
        diasVendidos: diasVendaEfetivo,
        totalDiasGozo: totalDiasGozo,
        totalDias: totalDiasUtilizados,
        diasDisponiveis: diasDisponiveis
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
              Estagiário — ciclo de 6 meses · 15 dias por ciclo · sem acúmulo · sem venda de dias
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
                    `${new Date(c.inicio).toLocaleDateString("pt-BR")} – ${new Date(c.fim).toLocaleDateString("pt-BR")}`
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
            <strong>Regras (estagiário):</strong> ciclo de 6 meses · 15 dias de gozo por ciclo · sem
            acúmulo de ciclos · sem venda de dias · todos os períodos mín.{" "}
            {cfg.feriasMinimoOutrosPeriodos} dias · ao menos 1 período deve ter ≥{" "}
            {cfg.feriasMinimoGrandePeriodo} dias · antecedência mín. {cfg.feriasAntecedenciaMinDias}{" "}
            dias · agendar até o 5º mês do ciclo.
          </>
        ) : (
          <>
            <strong>Regras:</strong> até {cfg.feriasMaxPeriodos} períodos de gozo · todos os
            períodos mín. {cfg.feriasMinimoOutrosPeriodos} dias · ao menos 1 período deve ter ≥{" "}
            {cfg.feriasMinimoGrandePeriodo} dias · venda equivale a 1 período (máx.{" "}
            {cfg.feriasMaxPeriodos - 1} períodos de gozo com venda) · venda máx.{" "}
            {cfg.feriasMaxDiasVenda} dias · antecedência mín. {cfg.feriasAntecedenciaMinDias} dias ·
            na primeira solicitação informe todos os períodos · gozo + venda deve igualar os dias
            disponíveis · alterações permitidas com 30 dias de antecedência por período.
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
              {diasVenda} dia(s) serão convertidos em pagamento.
            </p>
          )}
        </div>
      )}

      {/* Períodos */}
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
              {idx + 1}º Período (mín. {cfg.feriasMinimoOutrosPeriodos} dias)
            </p>
            {periodos.length > 1 && (
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
                Início <span style={{ color: "var(--red)" }}>*</span>
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
                Fim <span style={{ color: "var(--red)" }}>*</span>
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

      {periodos.length < maxPeriodosGozo && (!saldo || diasRestantes > 0) && (
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
      {totalDiasUtilizados > 0 && (
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
              <div key={l}>
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
                      Number(v) === 0
                        ? "var(--green)"
                        : l === "Restam" && Number(v) > 0
                          ? "var(--red)"
                          : "var(--ink-900)",
                    margin: 0
                  }}
                >
                  {v}d
                </p>
              </div>
            ))}
          </div>
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

      <button
        className="btn btn-primary"
        disabled={enviando || periodos.some((p) => !p.dataInicio || !p.dataFim) || erros.length > 0}
        onClick={handleSubmit}
      >
        {enviando ? "Enviando…" : "Enviar Solicitação"}
      </button>
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
  enviando
}: {
  solicitacaoOriginal: Solicitacao;
  config: ConfigSolicitacoes | null;
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const cfg = config ?? {
    feriasAntecedenciaMinDias: 30,
    feriasMinimoGrandePeriodo: 14,
    feriasMinimoOutrosPeriodos: 5,
    feriasMaxPeriodos: 3,
    feriasMaxDiasVenda: 10,
    feriasVedacaoPreFeriadoDias: 2
  };
  const metaOriginal = solicitacaoOriginal.metadados;
  const periodosOriginais =
    (metaOriginal?.periodos as
      | Array<{ dataInicio: string; dataFim: string; dias: number }>
      | undefined) ?? [];
  const diasVendaOriginal = (metaOriginal?.diasVendidos as number | undefined) ?? 0;

  const hoje = new Date();
  const minAlteracao = new Date(hoje);
  minAlteracao.setDate(minAlteracao.getDate() + cfg.feriasAntecedenciaMinDias);
  const minDataStr = minAlteracao.toISOString().slice(0, 10);

  type PeriodoAlt = { dataInicio: string; dataFim: string; dias: number; bloqueado: boolean };
  const [periodos, setPeriodos] = useState<PeriodoAlt[]>(() =>
    periodosOriginais.map((p) => ({
      dataInicio: p.dataInicio.slice(0, 10),
      dataFim: p.dataFim.slice(0, 10),
      dias: p.dias,
      bloqueado: new Date(p.dataInicio) <= minAlteracao
    }))
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
    editaveis.forEach((p) => {
      if (!p.dataInicio || !p.dataFim) return;
      if (new Date(p.dataInicio) <= minAlteracao)
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
  }, [periodos, cfg, minAlteracao]);

  const podeEnviar =
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
      dataReferencia: new Date(primeiroInicio + "T12:00:00").toISOString(),
      dataInicio: new Date(primeiroInicio + "T00:00:00").toISOString(),
      dataFim: new Date(ultimoFim + "T23:59:59").toISOString(),
      descricao,
      metadados: {
        periodos: periodos.map((p) => ({
          dataInicio: p.dataInicio + "T00:00:00.000Z",
          dataFim: p.dataFim + "T23:59:59.000Z",
          dias: p.dias
        })),
        diasVendidos: diasVendaOriginal,
        totalDiasGozo,
        totalDias: totalDiasGozo + diasVendaOriginal,
        alteracaoDeId: solicitacaoOriginal.id
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
        Períodos bloqueados (início em menos de {cfg.feriasAntecedenciaMinDias} dias) não podem ser
        alterados. Altere apenas os períodos disponíveis.
      </div>

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
   FORMULÁRIOS SIMPLES: LICENÇA e ABONO
══════════════════════════════════════════ */

function FormSimples({
  tipo,
  onSubmit,
  enviando,
  obs
}: {
  tipo: TipoSolicitacao;
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
  obs?: string;
}) {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [descricao, setDescricao] = useState("");
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

  const handleSubmit = () => {
    if (!dataInicio || !descricao) return;
    onSubmit({
      tipo,
      dataReferencia: new Date(dataInicio + "T12:00:00").toISOString(),
      dataInicio: new Date(dataInicio + "T00:00:00").toISOString(),
      dataFim: new Date((dataFim || dataInicio) + "T23:59:59").toISOString(),
      descricao,
      metadados:
        tipo === "ABONO"
          ? { tipoAbono: new Date(dataInicio) < new Date() ? "PASSADO" : "FUTURO" }
          : {}
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {obs && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--ink-500)",
            margin: 0,
            padding: "10px 12px",
            background: "rgba(122,30,38,0.04)",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.1)"
          }}
        >
          {obs}
        </p>
      )}
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
              setDataInicio(e.target.value);
              if (!dataFim) setDataFim(e.target.value);
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
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>
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
      <button
        className="btn btn-primary"
        disabled={enviando || !dataInicio || !descricao}
        onClick={handleSubmit}
      >
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
    ? hoje.toISOString().slice(0, 10)
    : `${anoDayOff}-${String(mes + 1).padStart(2, "0")}-01`;
  const maxData = `${anoDayOff}-${String(mes + 1).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const nomeMes = aniversario.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

  const handleSubmit = () => {
    if (!dataEscolhida || !descricao) return;
    onSubmit({
      tipo: "DAY_OFF",
      dataReferencia: new Date(dataEscolhida + "T12:00:00").toISOString(),
      dataInicio: new Date(dataEscolhida + "T00:00:00").toISOString(),
      dataFim: new Date(dataEscolhida + "T23:59:59").toISOString(),
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
  const hoje = new Date().toISOString().slice(0, 10);
  /* Limite mínimo configurado (em minutos) — carregado da API; 120 enquanto carrega */
  const [limiteMin, setLimiteMin] = useState<number>(120);
  const [cfgCarregada, setCfgCarregada] = useState(false);

  const [data, setData] = useState(hoje);
  const [horas, setHoras] = useState("");
  const [minutos, setMinutos] = useState("0");
  const [descricao, setDescricao] = useState("");

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

  const horasNum = Math.max(0, parseInt(horas) || 0);
  const minutosNum = Math.max(0, Math.min(59, parseInt(minutos) || 0));
  const totalMin = horasNum * 60 + minutosNum;

  const abaixoLimite = totalMin > 0 && totalMin < limiteMin;
  const limiteLabel = `${Math.floor(limiteMin / 60)}h${String(limiteMin % 60).padStart(2, "0")}`;

  const handleSubmit = () => {
    if (!data || !descricao.trim() || totalMin < limiteMin) return;
    onSubmit({
      tipo: "HORA_EXTRA",
      dataReferencia: new Date(data + "T12:00:00").toISOString(),
      dataInicio: new Date(data + "T00:00:00").toISOString(),
      dataFim: new Date(data + "T23:59:59").toISOString(),
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
        gestor. O mínimo permitido é <strong>{cfgCarregada ? limiteLabel : "…"}</strong>, conforme
        configuração do sistema.
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
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "16px 16px 80px",
        overflowY: "auto"
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 560,
          padding: 28,
          boxShadow: "0 24px 64px -16px rgba(10,5,6,0.30)",
          marginTop: 24
        }}
      >
        {ok ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <CheckCircleIcon size={40} style={{ color: "var(--green)", margin: "0 auto 12px" }} />
            <p style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>Alteração enviada!</p>
            <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Aguardando análise do gestor.</p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20
              }}
            >
              <h2 style={{ fontSize: 19, fontFamily: "var(--font-display)", margin: 0 }}>
                ✏️ Alterar Períodos de Férias
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
            {erro && (
              <p style={{ fontSize: 12.5, color: "var(--red)", marginBottom: 12 }}>⚠️ {erro}</p>
            )}
            <FormFeriasAlteracao
              solicitacaoOriginal={solicitacao}
              config={config}
              onSubmit={handleSubmit}
              enviando={enviando}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MODAL NOVA SOLICITAÇÃO
══════════════════════════════════════════ */

function NovaModal({
  onClose,
  onCriada
}: {
  onClose: () => void;
  onCriada: (s: Solicitacao) => void;
}) {
  const [tipo, setTipo] = useState<TipoSolicitacao | null>(null);
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
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "16px 16px 80px",
        overflowY: "auto"
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 560,
          padding: 28,
          boxShadow: "0 24px 64px -16px rgba(10,5,6,0.30)",
          marginTop: 24
        }}
      >
        {ok ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <CheckCircleIcon size={40} style={{ color: "var(--green)", margin: "0 auto 12px" }} />
            <p style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>Solicitação enviada!</p>
            <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Aguardando análise do gestor.</p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20
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
                  {tipo ? `${TIPO_EMOJI[tipo]} ${TIPO_LABEL[tipo]}` : "Nova Solicitação"}
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

            {erro && (
              <p style={{ fontSize: 12.5, color: "var(--red)", marginBottom: 12 }}>⚠️ {erro}</p>
            )}

            {!tipo && <TipoSeletor onSelect={setTipo} config={config} />}
            {tipo === "CORRECAO_PONTO" && (
              <FormCorrecaoPonto onSubmit={handleSubmit} enviando={enviando} />
            )}
            {tipo === "ATESTADO" && (
              <FormAtestado config={config} onSubmit={handleSubmit} enviando={enviando} />
            )}
            {tipo === "FERIAS" && (
              <FormFerias config={config} onSubmit={handleSubmit} enviando={enviando} />
            )}
            {tipo === "LICENCA" && (
              <FormSimples
                tipo="LICENCA"
                onSubmit={handleSubmit}
                enviando={enviando}
                obs="Preencha o período de licença e descreva a justificativa."
              />
            )}
            {tipo === "ABONO" && (
              <FormSimples
                tipo="ABONO"
                onSubmit={handleSubmit}
                enviando={enviando}
                obs="O abono pode ser solicitado para datas passadas ou futuras."
              />
            )}
            {tipo === "DAY_OFF" && <FormDayOff onSubmit={handleSubmit} enviando={enviando} />}
            {tipo === "HORA_EXTRA" && <FormHoraExtra onSubmit={handleSubmit} enviando={enviando} />}
          </>
        )}
      </div>
    </div>
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
                ? "O RH enviou sua folha de pagamento de férias"
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
                ? "Baixe a folha de pagamento, assine e envie o documento assinado de volta pelo sistema para que o RH possa concluir a aprovação."
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
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={s.guiaMedicoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                border: `1px solid ${cor}`,
                borderRadius: "var(--radius-md)",
                background: cor,
                color: "#fff",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              {isFerias ? "📥 Baixar Folha de Férias" : "📥 Baixar Guia Médica"}
            </a>
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
        <p style={{ margin: 0, fontSize: 12, color: "#16a34a" }}>
          📎{" "}
          <a href={s.documentoRetornoUrl} target="_blank" rel="noopener noreferrer">
            {isFerias ? "Ver folha de férias assinada enviada" : "Ver documento de retorno enviado"}
          </a>
          {s.documentoRetornoEm ? ` em ${fmtDateTime(s.documentoRetornoEm)}` : ""}
        </p>
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
          label="Ver documento anexado"
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
  onAlterar
}: {
  s: Solicitacao;
  onAtualizado: () => void;
  onAlterar?: (s: Solicitacao) => void;
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
  } else if (
    (tipo === "ATESTADO" || tipo === "FERIAS" || tipo === "LICENCA" || tipo === "ABONO") &&
    s.dataInicio
  ) {
    const horarioAtestado =
      tipo === "ATESTADO" &&
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
        {horarioAtestado}
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
    if (tipo === "ATESTADO" && meta?.documentoUrl) subInfo = <>{subInfo} · 📎 doc. anexado</>;
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
            {textoCorrecaoPontoFuncionario(s)}
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

      {tipo === "ATESTADO" && <AtestadoGuiaSection s={s} onAtualizado={onAtualizado} />}

      {tipo === "FERIAS" && <FeriasDetalheBlock meta={s.metadados} />}

      {tipo === "FERIAS" && <AtestadoGuiaSection s={s} onAtualizado={onAtualizado} tipo="FERIAS" />}

      {tipo === "FERIAS" &&
        s.status === "APROVADA" &&
        onAlterar &&
        (() => {
          const periodos =
            (s.metadados?.periodos as Array<{ dataInicio: string }> | undefined) ?? [];
          const minAlteracao = new Date();
          minAlteracao.setDate(minAlteracao.getDate() + 30);
          const temPeriodoAlteravel = periodos.some((p) => new Date(p.dataInicio) > minAlteracao);
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
                ✏️ Alterar Períodos
              </button>
            </div>
          );
        })()}

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
              <strong>Gestor:</strong> {s.gestorObservacao}
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
  const [semRegistroPonto, setSemRegistroPonto] = useState(false);
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

  useEffect(() => {
    api
      .get<{ categoria?: string; semRegistroPonto?: boolean }>("/ponto/status")
      .then((status) => {
        setSemRegistroPonto(
          !!status?.semRegistroPonto || categoriaSemRegistroPonto(status?.categoria)
        );
      })
      .catch(() => {});
  }, []);

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
    { v: "REJEITADA_GESTOR", l: "Rej. Gestor" },
    { v: "REJEITADA_RH", l: "Rej. RH" }
  ];

  const mostrarAvisoInformativo = semRegistroPonto || solicitacoes.some((s) => s.apenasInformativo);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {modalAberto && (
        <NovaModal
          onClose={() => setModalAberto(false)}
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

      {mostrarAvisoInformativo && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginBottom: 16,
            padding: "12px 14px",
            background: "rgba(37,99,235,0.06)",
            border: "1px solid rgba(37,99,235,0.20)",
            borderRadius: "var(--radius-md)",
            color: "#1e40af",
            fontSize: 12.5,
            lineHeight: 1.55
          }}
        >
          <InfoIcon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ display: "block", marginBottom: 2 }}>
              Solicitações apenas informativas
            </strong>
            {MSG_SOLICITACAO_APENAS_INFORMATIVA} Após todas as aprovações, o registro permanece no
            histórico somente para consulta.
          </div>
        </div>
      )}

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

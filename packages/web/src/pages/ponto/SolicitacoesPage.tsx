import React, { useState, useEffect, useRef, useCallback } from "react";
import { PlusIcon, CheckCircleIcon, CalendarIcon, RefreshCwIcon } from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";

/* ══════════════════════════════════════════
   TIPOS
══════════════════════════════════════════ */

type TipoSolicitacao = "CORRECAO_PONTO" | "ATESTADO" | "FERIAS" | "LICENCA" | "ABONO";
type StatusSolicitacao =
  | "PENDENTE"
  | "AGUARDANDO_RH"
  | "APROVADA"
  | "REJEITADA"
  | "REJEITADA_GESTOR"
  | "REJEITADA_RH";

interface Solicitacao {
  id: string;
  tipo: string;
  dataReferencia: string;
  dataInicio: string | null;
  dataFim: string | null;
  descricao: string;
  metadados: Record<string, unknown> | null;
  status: StatusSolicitacao;
  observacaoGestor?: string;
  gestorObservacao?: string;
  rhObservacao?: string;
  resolvidoEm?: string;
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
  atestadoGuiaUrl: string | null;
  atestadoMensagemOriginais: string;
  feriasAntecedenciaMinDias: number;
  feriasMinimoGrandePeriodo: number;
  feriasMinimoOutrosPeriodos: number;
  feriasMaxPeriodos: number;
  feriasMaxDiasVenda: number;
  feriasVedacaoPreFeriadoDias: number;
}

const TIPO_LABEL: Record<TipoSolicitacao, string> = {
  CORRECAO_PONTO: "Correção de Ponto",
  ATESTADO: "Atestado Médico",
  FERIAS: "Férias",
  LICENCA: "Licença",
  ABONO: "Abono"
};

const TIPO_EMOJI: Record<TipoSolicitacao, string> = {
  CORRECAO_PONTO: "🕐",
  ATESTADO: "🏥",
  FERIAS: "🌴",
  LICENCA: "📋",
  ABONO: "📆"
};

const TIPO_PONTO_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  INICIO_INTERVALO: "Início de Intervalo",
  FIM_INTERVALO: "Fim de Intervalo",
  SAIDA: "Saída"
};

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

function textoCorrecaoPonto(s: Solicitacao): string {
  const meta = s.metadados;
  if (!meta) return "Solicitação de correção de ponto em análise.";

  const data = fmtDate(s.dataReferencia);
  const tipoPonto =
    TIPO_PONTO_LABEL[(meta.tipoRegistro as string) ?? ""] ??
    (meta.tipoRegistro as string) ??
    "registro";
  const horarioNovo = meta.horarioSolicitado as string;

  if ((meta.acao as string) === "INCLUIR") {
    return `Você pediu para incluir um registro de ${tipoPonto} às ${horarioNovo}, referente ao dia ${data}.`;
  }

  const horarioAntigo = meta.horarioOriginal as string | undefined;
  if (horarioAntigo) {
    return `Você pediu para alterar o registro de ${tipoPonto} do dia ${data}: de ${horarioAntigo} para ${horarioNovo}.`;
  }

  return `Você pediu para corrigir o registro de ${tipoPonto} do dia ${data} para ${horarioNovo}.`;
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
    APROVADA: { label: "Aprovada", cls: "badge-green" },
    REJEITADA: { label: "Rejeitada", cls: "badge-red" },
    REJEITADA_GESTOR: { label: "Rejeitada pelo Gestor", cls: "badge-red" },
    REJEITADA_RH: { label: "Rejeitada pelo RH", cls: "badge-red" }
  };
  const { label, cls } = map[status] ?? { label: status, cls: "badge-amber" };
  return <span className={`badge ${cls}`}>{label}</span>;
}

/* ══════════════════════════════════════════
   SELETOR DE TIPO
══════════════════════════════════════════ */

function TipoSeletor({ onSelect }: { onSelect: (t: TipoSolicitacao) => void }) {
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
        {(Object.keys(TIPO_LABEL) as TipoSolicitacao[]).map((t) => (
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

function FormCorrecaoPonto({
  onSubmit,
  enviando
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const [dataRef, setDataRef] = useState("");
  const [acao, setAcao] = useState<"CORRIGIR" | "INCLUIR">("CORRIGIR");
  const [registros, setRegistros] = useState<RegistroDoDia[]>([]);
  const [loadingRegistros, setLoadingRegistros] = useState(false);
  const [registroId, setRegistroId] = useState("");
  const [horarioSolicitado, setHorarioSolicitado] = useState("");
  const [tipoInclusao, setTipoInclusao] = useState("ENTRADA");
  const [descricao, setDescricao] = useState("");
  const [horarioMin, setHorarioMin] = useState("06:00");
  const [horarioMax, setHorarioMax] = useState("23:59");

  useEffect(() => {
    api
      .get<{ pontoHorarioMinimo?: string; pontoHorarioMaximo?: string }>("/ponto/config/sistema")
      .then((cfg) => {
        if (cfg?.pontoHorarioMinimo) setHorarioMin(cfg.pontoHorarioMinimo);
        if (cfg?.pontoHorarioMaximo) setHorarioMax(cfg.pontoHorarioMaximo);
      })
      .catch(() => {});
  }, []);

  const carregarRegistros = useCallback(async (data: string) => {
    if (!data) return;
    setLoadingRegistros(true);
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

  const horarioInvalido = horarioSolicitado
    ? !horarioDentroFaixa(horarioSolicitado, horarioMin, horarioMax)
    : false;

  const handleSubmit = () => {
    if (!dataRef || !horarioSolicitado || !descricao || horarioInvalido) return;
    const reg = registros.find((r) => r.id === registroId);
    onSubmit({
      tipo: "CORRECAO_PONTO",
      dataReferencia: new Date(dataRef + "T12:00:00").toISOString(),
      descricao,
      metadados: {
        acao,
        registroId: acao === "CORRIGIR" ? registroId : null,
        tipoRegistro: acao === "CORRIGIR" ? reg?.tipo : tipoInclusao,
        horarioOriginal: acao === "CORRIGIR" && reg ? fmtTime(reg.dataHora) : null,
        horarioSolicitado
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
      <div>
        <label style={labelBase}>Data de referência</label>
        <input
          type="date"
          style={input}
          value={dataRef}
          onChange={(e) => setDataRef(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
        />
      </div>

      <div>
        <label style={labelBase}>Tipo de ação</label>
        <div style={{ display: "flex", gap: 10 }}>
          {(["CORRIGIR", "INCLUIR"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAcao(a)}
              style={{
                flex: 1,
                padding: "9px 12px",
                border: `2px solid ${acao === a ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)"}`,
                borderRadius: "var(--radius-md)",
                background: acao === a ? "rgba(122,30,38,0.05)" : "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: acao === a ? "var(--burgundy-600)" : "var(--ink-500)"
              }}
            >
              {a === "CORRIGIR" ? "✏️ Corrigir horário existente" : "➕ Incluir ponto faltante"}
            </button>
          ))}
        </div>
      </div>

      {acao === "CORRIGIR" && (
        <div>
          <label style={labelBase}>
            De (ponto do dia)
            {loadingRegistros && (
              <span style={{ fontWeight: 400, marginLeft: 8 }}>⏳ carregando...</span>
            )}
          </label>
          {registros.length === 0 && !loadingRegistros && dataRef ? (
            <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>
              Nenhum registro encontrado para este dia.
            </p>
          ) : (
            <select
              style={input}
              value={registroId}
              onChange={(e) => setRegistroId(e.target.value)}
            >
              <option value="">Selecione o registro...</option>
              {registros.map((r) => (
                <option key={r.id} value={r.id}>
                  {fmtTime(r.dataHora)} — {TIPO_PONTO_LABEL[r.tipo] ?? r.tipo}
                  {r.ajustado ? " (já ajustado)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {acao === "INCLUIR" && (
        <div>
          <label style={labelBase}>Tipo do ponto a incluir</label>
          <select
            style={input}
            value={tipoInclusao}
            onChange={(e) => setTipoInclusao(e.target.value)}
          >
            {Object.entries(TIPO_PONTO_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label style={labelBase}>Para (horário correto)</label>
        <input
          type="time"
          style={{ ...input, maxWidth: 140 }}
          value={horarioSolicitado}
          min={horarioMin}
          max={horarioMax}
          onChange={(e) => setHorarioSolicitado(e.target.value)}
        />
        <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "4px 0 0" }}>
          Permitido entre {horarioMin} e {horarioMax} (horário de Brasília).
        </p>
        {horarioInvalido && (
          <p style={{ fontSize: 11.5, color: "var(--red)", margin: "4px 0 0" }}>
            Horário fora da faixa permitida.
          </p>
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
          placeholder="Explique o motivo da correção..."
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={
          enviando ||
          !dataRef ||
          !horarioSolicitado ||
          !descricao ||
          horarioInvalido ||
          (acao === "CORRIGIR" && !registroId)
        }
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

  const dias = diffDias(dataInicio, dataFim);
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
        horarioInicio: horaInicio || null,
        horarioFim: horaFim || null,
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

      {dias > 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>
          Duração:{" "}
          <strong>
            {dias} dia{dias !== 1 ? "s" : ""}
          </strong>
          {dataInicio === dataFim ? " — dia inteiro ou período" : ""}
        </p>
      )}

      {/* Atalhos de período */}
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
                É necessário a Guia do Médico do Trabalho. Baixe, preencha e leve ao médico.
              </p>
              {config.atestadoGuiaUrl && (
                <a
                  href={config.atestadoGuiaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#92400e",
                    textDecoration: "underline"
                  }}
                >
                  📄 Baixar Guia do Médico do Trabalho
                </a>
              )}
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
          <CameraScanner
            onCaptura={(b64) => {
              setDocumentoBase64(b64);
              setDocumentoMime("image/jpeg");
              setNomeArquivo("foto-câmera.jpg");
            }}
          />
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
   FORMULÁRIO: FÉRIAS
══════════════════════════════════════════ */

function FormFerias({
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
  const [diasVenda, setDiasVenda] = useState(0);
  const [periodoNumero, setPeriodoNumero] = useState(1);
  const [descricao, setDescricao] = useState("");
  const [erros, setErros] = useState<string[]>([]);
  const [feriadosVedados, setFeriadosVedados] = useState<string[]>([]);

  const cfg = config ?? {
    feriasAntecedenciaMinDias: 30,
    feriasMinimoGrandePeriodo: 14,
    feriasMinimoOutrosPeriodos: 5,
    feriasMaxPeriodos: 3,
    feriasMaxDiasVenda: 10,
    feriasVedacaoPreFeriadoDias: 2
  };

  const dias = diffDias(dataInicio, dataFim);
  const hoje = new Date();
  const minData = new Date(hoje);
  minData.setDate(minData.getDate() + cfg.feriasAntecedenciaMinDias);

  useEffect(() => {
    if (!dataInicio) return;
    const ano = parseInt(dataInicio.slice(0, 4));
    api
      .get<{ date: string; name: string }[]>(`/ponto/feriados?ano=${ano}`)
      .then((lista) => {
        const vedados = (lista ?? [])
          .filter((f) => {
            const d = new Date(f.date + "T12:00:00");
            const inicio = new Date(dataInicio + "T12:00:00");
            const diff = (d.getTime() - inicio.getTime()) / 86_400_000;
            return diff >= -cfg.feriasVedacaoPreFeriadoDias && diff <= 0;
          })
          .map((f) => f.name);
        setFeriadosVedados(vedados);
      })
      .catch(() => {});
  }, [dataInicio, cfg.feriasVedacaoPreFeriadoDias]);

  useEffect(() => {
    const errs: string[] = [];
    if (dataInicio) {
      const inicio = new Date(dataInicio + "T12:00:00");
      if (inicio < minData) {
        errs.push(
          `Solicitação deve ser feita com pelo menos ${cfg.feriasAntecedenciaMinDias} dias de antecedência.`
        );
      }
      if (feriadosVedados.length > 0) {
        errs.push(
          `Início vedado: próximo ao feriado "${feriadosVedados[0]}" (regra dos ${cfg.feriasVedacaoPreFeriadoDias} dias).`
        );
      }
    }
    if (dias > 0) {
      if (periodoNumero === 1 && dias < cfg.feriasMinimoGrandePeriodo) {
        errs.push(`O primeiro período deve ter no mínimo ${cfg.feriasMinimoGrandePeriodo} dias.`);
      }
      if (periodoNumero > 1 && dias < cfg.feriasMinimoOutrosPeriodos) {
        errs.push(`Este período deve ter no mínimo ${cfg.feriasMinimoOutrosPeriodos} dias.`);
      }
    }
    setErros(errs);
  }, [dataInicio, dataFim, dias, periodoNumero, feriadosVedados, cfg, minData]);

  const handleSubmit = () => {
    if (!dataInicio || !dataFim || !descricao || erros.length > 0) return;
    onSubmit({
      tipo: "FERIAS",
      dataReferencia: new Date(dataInicio + "T12:00:00").toISOString(),
      dataInicio: new Date(dataInicio + "T00:00:00").toISOString(),
      dataFim: new Date(dataFim + "T23:59:59").toISOString(),
      descricao,
      metadados: { diasVenda, periodoNumero, diasCorridos: dias }
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
      <div
        style={{
          padding: "10px 14px",
          background: "rgba(37,99,235,0.05)",
          border: "1px solid rgba(37,99,235,0.2)",
          borderRadius: "var(--radius-md)",
          fontSize: 12.5,
          color: "#1e40af",
          lineHeight: 1.5
        }}
      >
        <strong>Regras:</strong> Férias em até {cfg.feriasMaxPeriodos} períodos — 1º período mínimo{" "}
        {cfg.feriasMinimoGrandePeriodo} dias; outros mínimo {cfg.feriasMinimoOutrosPeriodos} dias.
        Antecedência mínima: {cfg.feriasAntecedenciaMinDias} dias.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelBase}>
            Data Inicial <span style={{ color: "var(--red)" }}>*</span>
          </label>
          <input
            type="date"
            style={input}
            value={dataInicio}
            min={minData.toISOString().slice(0, 10)}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div>
          <label style={labelBase}>
            Data Final <span style={{ color: "var(--red)" }}>*</span>
          </label>
          <input
            type="date"
            style={input}
            value={dataFim}
            min={dataInicio}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>
      </div>

      {dias > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: 0 }}>
          Duração: <strong>{dias} dias corridos</strong>
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelBase}>Número do período</label>
          <select
            style={input}
            value={periodoNumero}
            onChange={(e) => setPeriodoNumero(parseInt(e.target.value))}
          >
            {Array.from({ length: cfg.feriasMaxPeriodos }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}º período
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelBase}>Vender férias (dias) — máx. {cfg.feriasMaxDiasVenda}</label>
          <input
            type="number"
            style={input}
            min={0}
            max={cfg.feriasMaxDiasVenda}
            value={diasVenda}
            onChange={(e) =>
              setDiasVenda(
                Math.min(cfg.feriasMaxDiasVenda, Math.max(0, parseInt(e.target.value) || 0))
              )
            }
          />
        </div>
      </div>

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
        <label style={labelBase}>
          Descrição / Justificativa <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Informações adicionais..."
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={enviando || !dataInicio || !dataFim || !descricao || erros.length > 0}
        onClick={handleSubmit}
      >
        {enviando ? "Enviando…" : "Enviar Solicitação"}
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

            {!tipo && <TipoSeletor onSelect={setTipo} />}
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
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CARD DE SOLICITAÇÃO (listagem)
══════════════════════════════════════════ */

function SolicitacaoCard({ s }: { s: Solicitacao }) {
  const borderColor =
    {
      APROVADA: "var(--green)",
      REJEITADA: "var(--red)",
      REJEITADA_GESTOR: "var(--red)",
      REJEITADA_RH: "var(--red)",
      AGUARDANDO_RH: "#2563eb",
      PENDENTE: "var(--amber)"
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
  } else if (
    (tipo === "ATESTADO" || tipo === "FERIAS" || tipo === "LICENCA" || tipo === "ABONO") &&
    s.dataInicio
  ) {
    subInfo = (
      <span>
        Período: {fmtDate(s.dataInicio)}{" "}
        {s.dataFim && s.dataFim !== s.dataInicio ? `→ ${fmtDate(s.dataFim)}` : ""}
      </span>
    );
    if (tipo === "FERIAS" && meta?.diasVenda)
      subInfo = (
        <>
          {subInfo} · Vender {meta.diasVenda as number} dias
        </>
      );
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
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
              {TIPO_LABEL[tipo] ?? tipo}
            </p>
            <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "2px 0 0" }}>
              {subInfo ?? `Ref: ${fmtDate(s.dataReferencia)}`}{" "}
              {!isCorrecaoPonto && `· Aberta ${fmtDate(s.createdAt)}`}
            </p>
          </div>
        </div>
        <StatusBadge status={s.status} />
      </div>

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
            {textoCorrecaoPonto(s)}
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

export function SolicitacoesPage() {
  const { token } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [filtro, setFiltro] = useState<StatusSolicitacao | "TODAS">("TODAS");

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

  const exibir =
    filtro === "TODAS" ? solicitacoes : solicitacoes.filter((s) => s.status === filtro);

  const filtros: { v: StatusSolicitacao | "TODAS"; l: string }[] = [
    { v: "TODAS", l: "Todas" },
    { v: "PENDENTE", l: "Pendentes" },
    { v: "AGUARDANDO_RH", l: "Aguardando RH" },
    { v: "APROVADA", l: "Aprovadas" },
    { v: "REJEITADA_GESTOR", l: "Rej. Gestor" },
    { v: "REJEITADA_RH", l: "Rej. RH" }
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {modalAberto && (
        <NovaModal
          onClose={() => setModalAberto(false)}
          onCriada={(nova) => {
            setSolicitacoes((prev) => [nova, ...prev]);
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
        {filtros.map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            style={{
              padding: "5px 12px",
              borderRadius: "var(--radius-full)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              border:
                filtro === v ? "1.5px solid var(--burgundy-600)" : "1px solid rgba(122,30,38,0.18)",
              background: filtro === v ? "var(--burgundy-600)" : "white",
              color: filtro === v ? "white" : "var(--ink-700)",
              transition: "all 180ms ease"
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-500)", fontSize: 14 }}
        >
          Carregando solicitações…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {exibir.length === 0 ? (
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
            exibir.map((s) => <SolicitacaoCard key={s.id} s={s} />)
          )}
        </div>
      )}
    </div>
  );
}

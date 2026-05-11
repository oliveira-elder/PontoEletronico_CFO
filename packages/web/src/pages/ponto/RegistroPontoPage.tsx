import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircleIcon,
  RefreshCwIcon,
  MapPinIcon,
  InfoIcon,
  ArrowRightIcon
} from "../../components/icons";
import { CameraModal } from "../../components/CameraModal";
import { CameraPermissionGuide, useCameraPermission } from "../../components/CameraPermissionGuide";
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

/* ─── Fluxo fixo ─── */
interface AcaoInfo {
  tipo: TipoRegistro;
  label: string;
  desc: string;
  cor: string;
  bg: string;
}

const FLUXO: AcaoInfo[] = [
  {
    tipo: "ENTRADA",
    label: "Iniciar Jornada",
    desc: "Início do expediente",
    cor: "var(--green)",
    bg: "rgba(47,125,79,0.12)"
  },
  {
    tipo: "INICIO_INTERVALO",
    label: "Início do Almoço",
    desc: "Saída para intervalo de almoço",
    cor: "#8a6a00",
    bg: "rgba(247,196,55,0.14)"
  },
  {
    tipo: "FIM_INTERVALO",
    label: "Fim do Almoço",
    desc: "Retorno do intervalo",
    cor: "var(--blue-ink)",
    bg: "rgba(30,74,122,0.10)"
  },
  {
    tipo: "SAIDA",
    label: "Encerrar Jornada",
    desc: "Encerramento do expediente",
    cor: "var(--red)",
    bg: "rgba(200,57,63,0.10)"
  }
];

type EstadoJornada = "AGUARDANDO" | "TRABALHANDO" | "ALMOCO" | "POS_ALMOCO" | "ENCERRADA";

function getEstado(n: number): EstadoJornada {
  if (n === 0) return "AGUARDANDO";
  if (n === 1) return "TRABALHANDO";
  if (n === 2) return "ALMOCO";
  if (n === 3) return "POS_ALMOCO";
  return "ENCERRADA";
}

const ESTADO_INFO: Record<
  EstadoJornada,
  { label: string; cor: string; bg: string; pulse?: boolean }
> = {
  AGUARDANDO: { label: "Aguardando início", cor: "var(--gray-cfo)", bg: "rgba(109,110,113,0.12)" },
  TRABALHANDO: {
    label: "Trabalhando",
    cor: "var(--green)",
    bg: "rgba(47,125,79,0.12)",
    pulse: true
  },
  ALMOCO: { label: "Intervalo de almoço", cor: "#8a6a00", bg: "rgba(247,196,55,0.14)" },
  POS_ALMOCO: {
    label: "Trabalhando (pós-almoço)",
    cor: "var(--green)",
    bg: "rgba(47,125,79,0.12)",
    pulse: true
  },
  ENCERRADA: { label: "Jornada encerrada", cor: "var(--blue-ink)", bg: "rgba(30,74,122,0.10)" }
};

const TIPO_LABEL: Record<TipoRegistro, string> = {
  ENTRADA: "Iniciar Jornada",
  INICIO_INTERVALO: "Início do Almoço",
  FIM_INTERVALO: "Fim do Almoço",
  SAIDA: "Encerrar Jornada"
};

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
}

/* ══════════════════════════════════════════════════════
   PROGRESSO DA JORNADA
══════════════════════════════════════════════════════ */
function ProgressoJornada({ n }: { n: number }) {
  const passos = ["Entrada", "Almoço", "Retorno", "Saída"];
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {passos.map((p, i) => {
        const done = i < n;
        const current = i === n && n < 4;
        const cor = done ? "var(--green)" : current ? "var(--burgundy-600)" : "var(--gray-cfo)";
        return (
          <React.Fragment key={p}>
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
                  background: done
                    ? "var(--green)"
                    : current
                      ? "var(--burgundy-600)"
                      : "rgba(109,110,113,0.15)",
                  border: `2px solid ${cor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 300ms"
                }}
              >
                {done ? (
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
                {p}
              </span>
            </div>
            {i < passos.length - 1 && (
              <div
                style={{
                  height: 2,
                  flex: 1,
                  background: i < n ? "var(--green)" : "rgba(122,30,38,0.10)",
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
  const [confirmado, setConfirmado] = useState<RegistroConfirmado | null>(null);
  const [geoloc, setGeoloc] = useState(true);
  const [geoStatus, setGeoStatus] = useState<"pendente" | "ok" | "fora">("pendente");

  /* Configuração do sistema — carregada exclusivamente da API */
  const [cfg, setCfg] = useState<SistemaConfig | null>(null);

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

  /* ── Carrega config do sistema ── */
  useEffect(() => {
    api
      .get<SistemaConfig>("/ponto/config/sistema")
      .then((data) => {
        if (data) setCfg(data);
      })
      .catch(() => {});
  }, []);

  /* ── Carrega registros de hoje do backend ── */
  useEffect(() => {
    const tk = token();
    if (!tk) return;

    api
      .get<{ registrosHoje: { tipo: string; dataHora: string }[] }>("/ponto/status", tk)
      .then((status) => {
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
            modo
          };
        });
        setRegistros(regs);
      })
      .catch(() => {});
  }, []);

  /* ── Derivações ── */
  const proximaAcao = FLUXO[registros.length] ?? null;
  const estado = getEstado(registros.length);
  const estadoInfo = ESTADO_INFO[estado];

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
        modo
      };

      if (resultado.dentroPerimetro !== undefined) {
        setGeoStatus(resultado.dentroPerimetro ? "ok" : "fora");
      }

      setRegistros((prev) => [...prev, novoReg]);
      setFotoCapturada(null);
      setConfirmado(resultado);
    },
    [registrar, fotoCapturada, modo, cfg, checkGeo, geoloc]
  );

  async function handleAcao() {
    if (!proximaAcao) return;
    setErro(null);
    if (exigirFoto && !fotoCapturada) {
      abrirCamera();
      return;
    }
    await executarRegistro(proximaAcao.tipo);
  }

  async function onFotoCapturada(dataUrl: string) {
    if (!proximaAcao) return;
    setFotoCapturada(dataUrl);
    setCameraAberta(false);
    await executarRegistro(proximaAcao.tipo, dataUrl);
  }

  /* ── Cor do botão de ação ── */
  function btnBg() {
    if (!proximaAcao) return "var(--burgundy-600)";
    if (proximaAcao.cor === "var(--green)") return "#1e5c38";
    if (proximaAcao.cor === "var(--blue-ink)") return "var(--blue-ink)";
    if (proximaAcao.cor === "var(--red)") return "#8b1d23";
    return "var(--burgundy-600)";
  }

  /* ── Confirmação ── */
  if (confirmado) {
    return <ConfirmacaoRegistro registro={confirmado} onVoltar={() => setConfirmado(null)} />;
  }

  /* ── Loading: aguarda configuração do sistema antes de renderizar a UI ── */
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
              background: estadoInfo.bg,
              border: `1px solid ${estadoInfo.cor}40`
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: estadoInfo.cor,
                flexShrink: 0,
                animation: estadoInfo.pulse ? "pulse-dot 2s ease-in-out infinite" : "none"
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: estadoInfo.cor }}>
              {estadoInfo.label}
            </span>
          </div>
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
        <ProgressoJornada n={registros.length} />

        <div style={{ textAlign: "center", paddingTop: 10 }}>
          {proximaAcao ? (
            <>
              <p style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 500 }}>
                Próximo registro:
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: proximaAcao.cor }}>
                {proximaAcao.label}
              </p>
              <p style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{proximaAcao.desc}</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--blue-ink)" }}>
                ✅ Jornada completa para hoje
              </p>
              <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>
                Os 4 registros do dia foram efetuados.
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
      {proximaAcao ? (
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

          {/* Botão principal — mesmo visual em ambos */}
          <button
            className="btn btn-primary"
            onClick={handleAcao}
            disabled={regLoading}
            style={{
              width: "100%",
              fontSize: 15,
              minHeight: 54,
              background: btnBg(),
              opacity: regLoading ? 0.7 : 1
            }}
          >
            {regLoading ? (
              <>
                <RefreshCwIcon size={18} style={{ animation: "spin 1s linear infinite" }} />{" "}
                Registrando…
              </>
            ) : (
              proximaAcao.label
            )}
          </button>

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
            Todos os 4 registros foram efetuados. Para corrigir algum registro, abra uma
            solicitação.
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
            Registros de Hoje ({registros.length}/4)
          </p>
          {registros.map((r, i) => {
            const info = FLUXO.find((f) => f.tipo === r.tipo);
            const cor = info?.cor ?? "var(--burgundy-600)";
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
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)" }}>
                    {TIPO_LABEL[r.tipo]}
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
          Fluxo diário: <strong>Iniciar → Almoço → Retorno → Encerrar</strong>. Inconsistências via{" "}
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

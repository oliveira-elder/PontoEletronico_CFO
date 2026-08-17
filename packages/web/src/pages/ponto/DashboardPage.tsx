import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ClockIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  SunriseIcon,
  SunsetIcon,
  CoffeeIcon,
  LogInIcon,
  PauseIcon,
  PlayIcon,
  FileTextIcon
} from "../../components/icons";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { categoriaSemVisibilidadeBancoHoras } from "../../utils/categoriaPonto";
import { formatarDataExtensoPt } from "../../utils/horario-brasilia";

/* ─── Helpers ─── */
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtDate = (d: Date) => formatarDataExtensoPt(d);
const toHM = (m: number) => {
  const sign = m < 0 ? "-" : "";
  const abs = Math.abs(m);
  return `${sign}${Math.floor(abs / 60)}h${pad(abs % 60)}`;
};

/* ─── Types ─── */
interface ApiStatus {
  estado: "FORA" | "TRABALHANDO" | "INTERVALO" | "PAUSADO";
  registrosHoje: { tipo: string; dataHora: string }[];
  horasTrabalhadasMinutos: number;
  jornadaMinutos: number;
  proximaAcao: string;
  categoria?: string;
}

interface ApiRelatorio {
  diasTrabalhados: number;
  horasTrabalhadasMinutos: number;
  horasEsperadasMinutos: number;
  horasExtrasMinutos: number;
  horasFaltaMinutos: number;
  saldoMinutos: number;
  ocultarBancoHoras?: boolean;
}

interface DiaQuinzena {
  dia: string;
  data: string;
  isoKey: string;
  isHoje: boolean;
  horasMin: number;
  status: "OK" | "PARCIAL" | "FALTA" | "FUTURO";
}

/* ─── Computa a quinzena atual (1–15 ou 16–fim) a partir dos registros ─── */
function computeQuinzena(
  registros: { tipo: string; dataHora: string }[],
  today: Date
): DiaQuinzena[] {
  const ano = today.getFullYear();
  const mes = today.getMonth();
  const diaMes = today.getDate();
  const inicioDia = diaMes <= 15 ? 1 : 16;
  const fimDia = diaMes <= 15 ? 15 : new Date(ano, mes + 1, 0).getDate();

  const toMin = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  };
  const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const dias: DiaQuinzena[] = [];
  for (let diaNum = inicioDia; diaNum <= fimDia; diaNum++) {
    const d = new Date(ano, mes, diaNum);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    /* Apenas dias úteis (seg–sex) */
    if (dow === 0 || dow === 6) continue;

    const isoKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const dayRegs = registros.filter((r) => r.dataHora.slice(0, 10) === isoKey);
    const isFuture = d > today;
    const isHoje = d.toDateString() === today.toDateString();

    let horasMin = 0;
    const entradaR = dayRegs.find((r) => r.tipo === "ENTRADA");
    const saidaR = dayRegs.find((r) => r.tipo === "SAIDA");
    const iniAlmR = dayRegs.find((r) => r.tipo === "INICIO_INTERVALO");
    const fimAlmR = dayRegs.find((r) => r.tipo === "FIM_INTERVALO");

    if (entradaR && saidaR) {
      const intervalo = iniAlmR && fimAlmR ? toMin(fimAlmR.dataHora) - toMin(iniAlmR.dataHora) : 0;
      horasMin = toMin(saidaR.dataHora) - toMin(entradaR.dataHora) - intervalo;
    } else if (entradaR) {
      const nowMin = today.getHours() * 60 + today.getMinutes();
      const intervalo = iniAlmR && fimAlmR ? toMin(fimAlmR.dataHora) - toMin(iniAlmR.dataHora) : 0;
      horasMin = nowMin - toMin(entradaR.dataHora) - intervalo;
    }

    const status: DiaQuinzena["status"] = isFuture
      ? "FUTURO"
      : !entradaR
        ? "FALTA"
        : saidaR
          ? "OK"
          : "PARCIAL";

    dias.push({
      dia: nomes[dow],
      data: pad(d.getDate()),
      isoKey,
      isHoje,
      horasMin: Math.max(0, horasMin),
      status
    });
  }
  return dias;
}

/** Dias com registro na quinzena profissional atual. */
function progressoQuinzena(quinzena: DiaQuinzena[]) {
  const diasTrabalhados = quinzena.filter(
    (d) => d.status === "OK" || d.status === "PARCIAL"
  ).length;
  return { diasTrabalhados, diasUteis: quinzena.length };
}

/* ─── Config visual de estado ─── */
const ESTADO_LABEL = {
  TRABALHANDO: "Trabalhando",
  INTERVALO: "Em intervalo",
  PAUSADO: "Pausado",
  FORA: "Fora"
};

const PROXIMA_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  INICIO_INTERVALO: "Início do Almoço",
  FIM_INTERVALO: "Fim do Almoço",
  SAIDA: "Encerrar Jornada",
  INTERROMPER_EXPEDIENTE: "Interromper Expediente",
  REINICIAR_EXPEDIENTE: "Reiniciar Expediente"
};

function getIconForTipo(tipo: string): React.ElementType {
  if (tipo === "ENTRADA") return SunriseIcon;
  if (tipo === "INICIO_INTERVALO") return CoffeeIcon;
  if (tipo === "FIM_INTERVALO") return LogInIcon;
  if (tipo === "INTERROMPER_EXPEDIENTE") return PauseIcon;
  if (tipo === "REINICIAR_EXPEDIENTE") return PlayIcon;
  return SunsetIcon;
}

function fmtHoraCurta(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TIPO_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  INICIO_INTERVALO: "Início Intervalo",
  FIM_INTERVALO: "Fim Intervalo",
  SAIDA: "Saída",
  INTERROMPER_EXPEDIENTE: "Interromper Expediente",
  REINICIAR_EXPEDIENTE: "Reiniciar Expediente"
};

/* ─── Stat pill (mobile) ─── */
function StatPill({
  label,
  value,
  sub,
  color
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "14px",
        flex: 1,
        minWidth: 0
      }}
    >
      <p
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--ink-500)",
          marginBottom: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          color: color ?? "var(--ink-900)",
          lineHeight: 1
        }}
      >
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 3 }}>{sub}</p>}
    </div>
  );
}

/* ─── Day card ─── */
function DayCard({ dia, data, isHoje, horasMin, status }: DiaQuinzena) {
  const pct = status === "FUTURO" ? 0 : Math.min(100, (horasMin / 480) * 100);
  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        background:
          status === "OK"
            ? "rgba(47,125,79,0.08)"
            : isHoje
              ? "rgba(122,30,38,0.06)"
              : "var(--cream-50)",
        border: isHoje
          ? "2px solid var(--burgundy-600)"
          : status === "OK"
            ? "1px solid rgba(47,125,79,0.20)"
            : "1px solid rgba(122,30,38,0.08)",
        borderRadius: "var(--radius-md)",
        padding: "12px 4px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        boxSizing: "border-box"
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-500)"
        }}
      >
        {dia}
      </p>
      <p
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: isHoje ? "var(--burgundy-600)" : "var(--ink-900)",
          lineHeight: 1
        }}
      >
        {data}
      </p>
      <div style={{ width: "70%", height: 4, background: "rgba(122,30,38,0.08)", borderRadius: 2 }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: status === "OK" ? "var(--green)" : "var(--burgundy-600)",
            borderRadius: 2,
            transition: "width 400ms ease"
          }}
        />
      </div>
      <p
        style={{
          fontSize: 11,
          color: status === "FUTURO" ? "var(--ink-500)" : "var(--ink-700)",
          fontFamily: "var(--font-mono)"
        }}
      >
        {status === "FUTURO" ? "—" : toHM(horasMin)}
      </p>
    </div>
  );
}

/* ─── Seção: Essa Quinzena ─── */
function QuinzenaSection({ quinzena, compact }: { quinzena: DiaQuinzena[]; compact?: boolean }) {
  const hoje = new Date();
  const diaMes = hoje.getDate();
  const inicio = diaMes <= 15 ? 1 : 16;
  const fim = diaMes <= 15 ? 15 : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const periodoLabel = `${pad(inicio)}–${pad(fim)}/${pad(hoje.getMonth() + 1)}`;
  const colunas = Math.min(Math.max(quinzena.length, 1), compact ? 5 : 10);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: compact ? 14 : 16,
          gap: 8,
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: compact ? 16 : 18,
              margin: 0
            }}
          >
            Essa Quinzena
          </p>
          <span style={{ fontSize: 12, color: "var(--ink-500)", fontFamily: "var(--font-mono)" }}>
            {periodoLabel}
          </span>
        </div>
        <Link
          to="/ponto/historico"
          style={{
            display: "flex",
            alignItems: "center",
            gap: compact ? 3 : 4,
            fontSize: 12,
            color: "var(--ink-500)"
          }}
        >
          Ver histórico <ArrowRightIcon size={compact ? 11 : 12} />
        </Link>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`,
          gap: compact ? 6 : 8,
          width: "100%"
        }}
      >
        {quinzena.length > 0 ? (
          quinzena.map((d) => <DayCard key={d.isoKey} {...d} />)
        ) : (
          <p style={{ fontSize: 13, color: "var(--ink-500)", gridColumn: "1 / -1" }}>
            Sem registros nesta quinzena.
          </p>
        )}
      </div>
    </>
  );
}

/* ─── Seção: Requisições do RH ─── */
interface ReqRhMiniItem {
  id: string;
  status: "PENDENTE" | "VISUALIZADO" | "RESPONDIDO";
  requisicao: {
    id: string;
    tipo: string;
    titulo: string;
    criadaEm: string;
  };
}

function RequisicoesRhSection({ token }: { token: string }) {
  const [items, setItems] = useState<ReqRhMiniItem[]>([]);
  const [reqEnderecoPendente, setReqEnderecoPendente] = useState(false);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([
      api.get<ReqRhMiniItem[]>("/requisicoes-rh/minhas", token).catch(() => []),
      api
        .get<{ id: string; status: string } | null>("/ponto/requerimento-endereco", token)
        .catch(() => null)
    ])
      .then(([d, req]) => {
        setItems(d ?? []);
        setReqEnderecoPendente(req?.status === "PENDENTE");
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pendentes =
    items.filter((i) => i.status === "PENDENTE").length + (reqEnderecoPendente ? 1 : 0);
  const naoRespondidos = items.filter((i) => i.status !== "RESPONDIDO");
  const recentes = naoRespondidos.slice(0, reqEnderecoPendente ? 2 : 3);

  const statusStyle = (s: string) =>
    s === "PENDENTE"
      ? { bg: "rgba(247,196,55,0.18)", text: "#8a6a00", label: "Novo" }
      : s === "RESPONDIDO"
        ? { bg: "rgba(47,125,79,0.10)", text: "var(--green, #2f7d4f)", label: "Respondido" }
        : { bg: "rgba(26,79,122,0.10)", text: "#1a4f7a", label: "Lido" };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 8,
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 15,
              margin: 0
            }}
          >
            Requisições do RH
          </p>
          {pendentes > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: "var(--radius-full)",
                background: "rgba(247,196,55,0.22)",
                color: "#8a6a00"
              }}
            >
              {pendentes} nova(s)
            </span>
          )}
        </div>
        <Link
          to="/ponto/minhas-requisicoes"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--burgundy-600)",
            textDecoration: "none"
          }}
        >
          Ver todas →
        </Link>
      </div>

      {loading && <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>Carregando...</p>}

      {!loading && recentes.length === 0 && !reqEnderecoPendente && (
        <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0, fontStyle: "italic" }}>
          {items.length > 0
            ? "Todas as requisições foram respondidas."
            : "Nenhuma requisição no momento."}
        </p>
      )}

      {!loading && (recentes.length > 0 || reqEnderecoPendente) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Item especial: requerimento de endereço residencial */}
          {reqEnderecoPendente && (
            <Link to="/ponto/minhas-requisicoes" style={{ textDecoration: "none" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: "rgba(122,30,38,0.04)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.14)",
                  cursor: "pointer"
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(122,30,38,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--burgundy-600)",
                    flexShrink: 0,
                    fontSize: 16
                  }}
                >
                  📍
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink-900)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    Cadastrar Endereço Residencial
                  </p>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "2px 0 0" }}>
                    Solicitado pelo RH
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(247,196,55,0.22)",
                    color: "#8a6a00",
                    flexShrink: 0
                  }}
                >
                  Novo
                </span>
              </div>
            </Link>
          )}
          {recentes.map((item) => {
            const ss = statusStyle(item.status);
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background:
                    item.status === "PENDENTE" ? "rgba(122,30,38,0.04)" : "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  border:
                    item.status === "PENDENTE"
                      ? "1px solid rgba(122,30,38,0.14)"
                      : "1px solid rgba(122,30,38,0.08)"
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "rgba(122,30,38,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--burgundy-600)",
                    flexShrink: 0
                  }}
                >
                  <FileTextIcon size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink-900)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {item.requisicao.titulo}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "2px 0 0" }}>
                    {new Date(item.requisicao.criadaEm).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: "var(--radius-full)",
                    background: ss.bg,
                    color: ss.text,
                    flexShrink: 0
                  }}
                >
                  {ss.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ─── Card unificado: Quinzena + Requisições RH ─── */
function DashboardPainelPrincipal({
  quinzena,
  compact,
  token
}: {
  quinzena: DiaQuinzena[];
  compact?: boolean;
  token: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: compact ? "14px" : undefined,
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        width: "100%"
      }}
      className={compact ? undefined : "card-flat"}
    >
      <div
        style={{
          marginBottom: compact ? 16 : 20,
          paddingBottom: compact ? 16 : 20,
          borderBottom: "1px solid rgba(122,30,38,0.08)"
        }}
      >
        <QuinzenaSection quinzena={quinzena} compact={compact} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <RequisicoesRhSection token={token} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════ */
export function DashboardPage() {
  const isMobile = useIsMobile(768);
  const { token, user } = useAuth();
  const [now, setNow] = useState(new Date());

  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [relatorio, setRelatorio] = useState<ApiRelatorio | null>(null);
  const [quinzena, setQuinzena] = useState<DiaQuinzena[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 20_000);

    const hoje = new Date();
    const mes = hoje.getMonth() + 1;
    const ano = hoje.getFullYear();

    Promise.all([
      api.get<ApiStatus>("/ponto/status"),
      api.get<ApiRelatorio>(`/ponto/relatorio?mes=${mes}&ano=${ano}`),
      api.get<{ registros: { tipo: string; dataHora: string }[] }>(
        `/ponto/historico?mes=${mes}&ano=${ano}`
      )
    ])
      .then(([statusData, relData, histData]) => {
        if (cancelled) return;
        setStatus(statusData);
        setRelatorio(relData);
        const todos = [
          ...(statusData?.registrosHoje ?? []),
          ...(histData?.registros ?? []).filter(
            (r) => !statusData?.registrosHoje?.some((h) => h.dataHora === r.dataHora)
          )
        ];
        setQuinzena(computeQuinzena(todos, new Date()));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
        clearTimeout(timeout);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const hora = now.getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = (user?.name ?? "").split(" ")[0] || "Olá";

  const estado = status?.estado ?? "FORA";
  const horasHoje = status?.horasTrabalhadasMinutos ?? 0;
  const jornada = status?.jornadaMinutos ?? 480;
  const saldoHoje = horasHoje - jornada;

  const trabMes = relatorio?.horasTrabalhadasMinutos ?? 0;
  const esperMes = relatorio?.horasEsperadasMinutos ?? 0;
  const extrasMes = relatorio?.horasExtrasMinutos ?? 0;
  const diasTrab = relatorio?.diasTrabalhados ?? 0;
  const saldoMes = relatorio?.saldoMinutos ?? 0;
  const ocultarBancoHoras =
    !!relatorio?.ocultarBancoHoras || categoriaSemVisibilidadeBancoHoras(status?.categoria);

  const { diasTrabalhados: diasTrabQuinzena, diasUteis: diasUteisQuinzena } =
    progressoQuinzena(quinzena);

  /* Dias úteis do mês atual até hoje (para o card mensal de dias trabalhados) */
  const diasUteisMes = (() => {
    const h = new Date();
    let c = 0;
    for (let d = 1; d <= h.getDate(); d++) {
      const dow = new Date(h.getFullYear(), h.getMonth(), d).getDay();
      if (dow !== 0 && dow !== 6) c++;
    }
    return c;
  })();

  const proximaLabel = status?.proximaAcao
    ? (PROXIMA_LABEL[status.proximaAcao] ?? status.proximaAcao)
    : null;

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
        Carregando painel…
      </div>
    );
  }

  /* ════════════ MOBILE ════════════ */
  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          boxSizing: "border-box",
          overflowX: "hidden"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 20,
                lineHeight: 1.1,
                color: "var(--ink-900)",
                margin: 0
              }}
            >
              {saudacao}! 👋
            </h1>
            <p
              style={{
                fontSize: 11,
                color: "var(--ink-500)",
                marginTop: 2
              }}
            >
              {fmtDate(now)}
            </p>
          </div>
          <Link
            to="/ponto/registrar"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--burgundy-600)",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
              whiteSpace: "nowrap"
            }}
          >
            <ClockIcon size={15} /> Bater Ponto
          </Link>
        </div>

        <div
          style={{
            background: "var(--burgundy-900)",
            borderRadius: "var(--radius-xl)",
            padding: "20px 16px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 120,
              height: 120,
              borderRadius: "50%",
              background: "rgba(122,30,38,0.25)",
              pointerEvents: "none"
            }}
          />
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(40px,14vw,56px)",
              color: "#fff",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              marginBottom: 12
            }}
          >
            {fmt(now)}
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 14px",
              borderRadius: "var(--radius-full)",
              background:
                estado === "TRABALHANDO"
                  ? "rgba(74, 222, 128, 0.24)"
                  : estado === "INTERVALO" || estado === "PAUSADO"
                    ? "rgba(251, 191, 36, 0.26)"
                    : "rgba(255, 255, 255, 0.16)",
              border:
                estado === "TRABALHANDO"
                  ? "1px solid rgba(134, 239, 172, 0.65)"
                  : estado === "INTERVALO" || estado === "PAUSADO"
                    ? "1px solid rgba(253, 224, 71, 0.6)"
                    : "1px solid rgba(255, 255, 255, 0.4)"
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background:
                  estado === "TRABALHANDO"
                    ? "#4ade80"
                    : estado === "INTERVALO" || estado === "PAUSADO"
                      ? "#facc15"
                      : "#e5e7eb",
                flexShrink: 0
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color:
                  estado === "TRABALHANDO"
                    ? "#bbf7d0"
                    : estado === "INTERVALO" || estado === "PAUSADO"
                      ? "#fde68a"
                      : "#f3f4f6"
              }}
            >
              {ESTADO_LABEL[estado]}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <StatPill label="Hoje" value={toHM(horasHoje)} sub={`de ${toHM(jornada)}`} />
          <StatPill
            label="Saldo"
            value={toHM(saldoHoje)}
            sub={saldoHoje >= 0 ? "extras" : "a cumprir"}
            color={saldoHoje >= 0 ? "var(--green)" : "var(--red)"}
          />
        </div>

        {/* Painel principal: quinzena + requisições RH */}
        <DashboardPainelPrincipal quinzena={quinzena} compact token={token() ?? ""} />

        {/* Registros hoje */}
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "14px"
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 15,
              marginBottom: 12
            }}
          >
            Registros de Hoje
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(status?.registrosHoje ?? []).map((r, i) => {
              const Ic = getIconForTipo(r.tipo);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    background: "var(--cream-50)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.07)"
                  }}
                >
                  <Ic size={16} style={{ color: "var(--burgundy-600)", flexShrink: 0 }} />
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--ink-700)",
                      flex: 1
                    }}
                  >
                    {TIPO_LABEL[r.tipo] ?? r.tipo}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      color: "var(--ink-900)",
                      fontWeight: 600,
                      flexShrink: 0
                    }}
                  >
                    {fmtHoraCurta(r.dataHora)}
                  </p>
                </div>
              );
            })}
            {proximaLabel && (
              <Link
                to="/ponto/registrar"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: "rgba(122,30,38,0.03)",
                  borderRadius: "var(--radius-md)",
                  border: "1.5px dashed rgba(122,30,38,0.18)",
                  textDecoration: "none"
                }}
              >
                <SunsetIcon
                  size={16}
                  style={{ color: "var(--burgundy-600)", opacity: 0.5, flexShrink: 0 }}
                />
                <p style={{ fontSize: 12, color: "var(--ink-500)", flex: 1 }}>
                  Próximo: {proximaLabel}
                </p>
                <ArrowRightIcon size={13} style={{ color: "var(--burgundy-600)", flexShrink: 0 }} />
              </Link>
            )}
          </div>
        </div>

        {/* Resumo mês */}
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "14px"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14
            }}
          >
            <div>
              <p className="eyebrow" style={{ marginBottom: 2 }}>
                Resumo
              </p>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  color: "var(--burgundy-600)",
                  fontSize: 15
                }}
              >
                {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </p>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}
            >
              {!ocultarBancoHoras && (
                <Link
                  to="/ponto/banco-horas"
                  style={{ fontSize: 12, color: "var(--burgundy-600)", fontWeight: 600 }}
                >
                  Banco de Horas →
                </Link>
              )}
              <Link
                to="/ponto/relatorios"
                style={{ fontSize: 12, color: "var(--burgundy-600)", fontWeight: 600 }}
              >
                Ver relatório →
              </Link>
            </div>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}
          >
            {[
              {
                label: "Horas Trabalhadas",
                value: toHM(trabMes),
                sub: `de ${toHM(esperMes)}`,
                ok: true
              },
              ...(ocultarBancoHoras
                ? []
                : [{ label: "Horas Extras", value: toHM(extrasMes), sub: "acumuladas", ok: true }]),
              {
                label: "Dias Trabalhados",
                value: `${diasTrab}`,
                sub: `de ${diasUteisMes} úteis no mês`,
                ok: true
              },
              ...(ocultarBancoHoras
                ? []
                : [
                    {
                      label: "Saldo Mensal",
                      value: toHM(saldoMes),
                      sub: saldoMes >= 0 ? "a favor" : "negativo",
                      ok: saldoMes >= 0
                    }
                  ])
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px"
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    marginBottom: 6
                  }}
                >
                  {item.label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 20,
                    color: item.ok ? "var(--ink-900)" : "var(--red)"
                  }}
                >
                  {item.value}
                </p>
                <p style={{ fontSize: 10.5, color: "var(--ink-500)", marginTop: 2 }}>{item.sub}</p>
              </div>
            ))}
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                {diasTrabQuinzena} de {diasUteisQuinzena} dias úteis
              </span>
              <span
                style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-700)" }}
              >
                {diasUteisQuinzena > 0
                  ? Math.round((diasTrabQuinzena / diasUteisQuinzena) * 100)
                  : 0}
                %
              </span>
            </div>
            <div style={{ height: 5, background: "rgba(122,30,38,0.08)", borderRadius: 3 }}>
              <div
                style={{
                  width: `${diasUteisQuinzena > 0 ? (diasTrabQuinzena / diasUteisQuinzena) * 100 : 0}%`,
                  height: "100%",
                  background: "var(--burgundy-600)",
                  borderRadius: 3
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 14px",
              background: "rgba(47,125,79,0.06)",
              border: "1px solid rgba(47,125,79,0.15)",
              borderRadius: "var(--radius-md)"
            }}
          >
            <CheckCircleIcon
              size={16}
              style={{ color: "var(--green)", flexShrink: 0, marginTop: 1 }}
            />
            <p style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.55 }}>
              {saldoMes >= 0
                ? "Ponto em dia — nenhuma pendência registrada."
                : `Saldo negativo de ${toHM(Math.abs(saldoMes))} — verifique seus registros.`}
            </p>
          </div>
          {proximaLabel && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "12px 14px",
                background: "rgba(247,196,55,0.08)",
                border: "1px solid rgba(247,196,55,0.25)",
                borderRadius: "var(--radius-md)"
              }}
            >
              <AlertCircleIcon
                size={16}
                style={{ color: "#8a6a00", flexShrink: 0, marginTop: 1 }}
              />
              <p style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.55 }}>
                Próximo registro pendente: <strong>{proximaLabel}</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ════════════ DESKTOP ════════════ */
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 28 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Painel Principal
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap"
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <h1
              style={{
                fontSize: "clamp(22px,3vw,30px)",
                fontFamily: "var(--font-display)",
                lineHeight: 1.1
              }}
            >
              {saudacao}, <em>{primeiroNome}</em>!
            </h1>
            <p
              style={{
                color: "var(--ink-500)",
                marginTop: 4,
                fontSize: 14
              }}
            >
              {fmtDate(now)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span
              className={`badge badge-destaque badge-${estado === "TRABALHANDO" ? "green" : estado === "INTERVALO" || estado === "PAUSADO" ? "amber" : "gray"}`}
            >
              <span
                className={`dot dot-${estado === "TRABALHANDO" ? "green" : estado === "INTERVALO" || estado === "PAUSADO" ? "amber" : "gray"}`}
              />
              {ESTADO_LABEL[estado]}
            </span>
            <Link to="/ponto/registrar" className="btn btn-primary btn-sm">
              <ClockIcon size={15} /> Bater Ponto
            </Link>
          </div>
        </div>
      </div>

      {/* Grid topo — 3 colunas iguais */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
          marginBottom: 24,
          alignItems: "stretch"
        }}
      >
        <div
          className="card-flat"
          style={{
            background: "var(--burgundy-900)",
            border: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px 16px",
            gap: 8,
            minWidth: 0,
            width: "100%",
            boxSizing: "border-box"
          }}
        >
          <p className="eyebrow" style={{ color: "var(--gold-500)" }}>
            Agora
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 38,
              color: "#fff",
              letterSpacing: "-0.02em",
              lineHeight: 1
            }}
          >
            {fmt(now)}
          </p>
          <span
            className={`badge badge-on-dark badge-${estado === "TRABALHANDO" ? "green" : estado === "INTERVALO" || estado === "PAUSADO" ? "amber" : "gray"}`}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            <span
              className={`dot dot-${estado === "TRABALHANDO" ? "green" : estado === "INTERVALO" || estado === "PAUSADO" ? "amber" : "gray"}`}
              style={{ width: 6, height: 6 }}
            />
            {ESTADO_LABEL[estado]}
          </span>
        </div>
        <div
          className="card-flat"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
            width: "100%",
            boxSizing: "border-box"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-500)"
              }}
            >
              Horas Hoje
            </p>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "rgba(122,30,38,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--burgundy-600)",
                flexShrink: 0
              }}
            >
              <ClockIcon size={18} />
            </span>
          </div>
          <div>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                color: "var(--ink-900)",
                lineHeight: 1
              }}
            >
              {toHM(horasHoje)}
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>
              de {toHM(jornada)} esperadas
            </p>
          </div>
        </div>
        <div
          className="card-flat"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
            width: "100%",
            boxSizing: "border-box"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-500)"
              }}
            >
              Saldo Hoje
            </p>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: saldoHoje >= 0 ? "rgba(47,125,79,0.08)" : "rgba(200,57,63,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: saldoHoje >= 0 ? "var(--green)" : "var(--red)",
                flexShrink: 0
              }}
            >
              <TrendingUpIcon size={18} />
            </span>
          </div>
          <div>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                color: saldoHoje >= 0 ? "var(--ink-900)" : "var(--red)",
                lineHeight: 1
              }}
            >
              {toHM(saldoHoje)}
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>
              {saldoHoje >= 0 ? "horas extras" : "horas a cumprir"}
            </p>
          </div>
        </div>
      </div>

      {/* Painel principal (2fr) + Registros hoje (1fr) — alinha com o card Saldo do topo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 16,
          marginBottom: 24,
          alignItems: "stretch"
        }}
      >
        <DashboardPainelPrincipal quinzena={quinzena} token={token() ?? ""} />

        <div
          className="card-flat"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minWidth: 0,
            width: "100%",
            boxSizing: "border-box"
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              marginBottom: 14
            }}
          >
            Registros de Hoje
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {(status?.registrosHoje ?? []).map((r, i) => {
              const Ic = getIconForTipo(r.tipo);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 12px",
                    background: "var(--cream-50)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.07)",
                    width: "100%",
                    boxSizing: "border-box"
                  }}
                >
                  <Ic size={16} style={{ color: "var(--burgundy-600)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--ink-500)"
                      }}
                    >
                      {TIPO_LABEL[r.tipo] ?? r.tipo}
                    </p>
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      color: "var(--ink-900)",
                      fontWeight: 500,
                      flexShrink: 0
                    }}
                  >
                    {fmtHoraCurta(r.dataHora)}
                  </p>
                </div>
              );
            })}
            {proximaLabel && (
              <Link
                to="/ponto/registrar"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 12px",
                  background: "rgba(122,30,38,0.04)",
                  borderRadius: "var(--radius-md)",
                  border: "1.5px dashed rgba(122,30,38,0.20)",
                  textDecoration: "none",
                  width: "100%",
                  boxSizing: "border-box"
                }}
              >
                <SunsetIcon size={16} style={{ color: "var(--burgundy-600)", opacity: 0.5 }} />
                <p style={{ fontSize: 12, color: "var(--ink-500)", flex: 1 }}>
                  Próximo: {proximaLabel}
                </p>
                <ArrowRightIcon size={14} style={{ color: "var(--burgundy-600)" }} />
              </Link>
            )}
            {!proximaLabel && (status?.registrosHoje?.length ?? 0) === 0 && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-500)",
                  textAlign: "center",
                  padding: "12px 0"
                }}
              >
                Nenhum registro hoje.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Resumo mês */}
      <div className="card-flat">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20
          }}
        >
          <div>
            <p className="eyebrow">Resumo do Mês</p>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontStyle: "italic",
                color: "var(--burgundy-600)",
                marginTop: 4
              }}
            >
              {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!ocultarBancoHoras && (
              <Link to="/ponto/banco-horas" className="btn btn-ghost btn-sm">
                Banco de Horas
              </Link>
            )}
            <Link to="/ponto/relatorios" className="btn btn-ghost btn-sm">
              Ver relatório completo
            </Link>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: ocultarBancoHoras
              ? isMobile
                ? "1fr 1fr"
                : "repeat(2, minmax(0, 1fr))"
              : "repeat(4, minmax(0, 1fr))",
            gap: 12
          }}
        >
          {[
            {
              label: "Horas Trabalhadas",
              value: toHM(trabMes),
              sub: `de ${toHM(esperMes)}`,
              ok: true
            },
            ...(ocultarBancoHoras
              ? []
              : [{ label: "Horas Extras", value: toHM(extrasMes), sub: "acumuladas", ok: true }]),
            {
              label: "Dias Trabalhados",
              value: `${diasTrab}`,
              sub: `de ${diasUteisMes} úteis no mês`,
              ok: true
            },
            ...(ocultarBancoHoras
              ? []
              : [
                  {
                    label: "Saldo Mensal",
                    value: toHM(saldoMes),
                    sub: saldoMes >= 0 ? "a favor" : "negativo",
                    ok: saldoMes >= 0
                  }
                ])
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: "var(--cream-50)",
                borderRadius: "var(--radius-md)",
                padding: "14px",
                border: "1px solid rgba(122,30,38,0.08)"
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--ink-500)",
                  marginBottom: 8
                }}
              >
                {item.label}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  color: item.ok ? "var(--ink-900)" : "var(--red)"
                }}
              >
                {item.value}
              </p>
              <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 3 }}>{item.sub}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
              Progresso ({diasTrabQuinzena} de {diasUteisQuinzena} dias úteis)
            </span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-700)" }}>
              {diasUteisQuinzena > 0 ? Math.round((diasTrabQuinzena / diasUteisQuinzena) * 100) : 0}
              %
            </span>
          </div>
          <div style={{ height: 6, background: "rgba(122,30,38,0.08)", borderRadius: 3 }}>
            <div
              style={{
                width: `${diasUteisQuinzena > 0 ? (diasTrabQuinzena / diasUteisQuinzena) * 100 : 0}%`,
                height: "100%",
                background: "var(--burgundy-600)",
                borderRadius: 3
              }}
            />
          </div>
        </div>
      </div>

      {/* Avisos */}
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <div
          style={{
            flex: 1,
            minWidth: 260,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            background: "rgba(47,125,79,0.06)",
            border: "1px solid rgba(47,125,79,0.15)",
            borderRadius: "var(--radius-md)"
          }}
        >
          <CheckCircleIcon size={18} style={{ color: "var(--green)", flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "var(--ink-700)" }}>
            {saldoMes >= 0
              ? "Ponto em dia — nenhuma pendência registrada para o período atual."
              : `Saldo negativo de ${toHM(Math.abs(saldoMes))} — verifique seu banco de horas.`}
          </p>
        </div>
        {proximaLabel && (
          <div
            style={{
              flex: 1,
              minWidth: 260,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "rgba(247,196,55,0.08)",
              border: "1px solid rgba(247,196,55,0.25)",
              borderRadius: "var(--radius-md)"
            }}
          >
            <AlertCircleIcon size={18} style={{ color: "#8a6a00", flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: "var(--ink-700)" }}>
              Próximo registro pendente: <strong>{proximaLabel}</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

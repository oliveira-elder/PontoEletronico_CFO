import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  SunriseIcon,
  SunsetIcon,
  CoffeeIcon,
  LogInIcon,
  PauseIcon,
  PlayIcon,
  FileTextIcon,
  BarChart2Icon
} from "../../components/icons";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useHoraServidor } from "../../hooks/useHoraServidor";
import { ComprovanteModal } from "../../components/comprovante/ComprovanteModal";
import {
  acharComprovante,
  useComprovantes,
  type ComprovanteItem
} from "../../hooks/useComprovantes";
import { REQUERIMENTO_INFO, type TipoRequerimento } from "../../utils/requerimentos";
import { useAuth } from "../../auth/AuthContext";
import { api, isRequestAborted } from "../../hooks/useApi";
import {
  categoriaSemIntervaloAlmoco,
  categoriaSemVisibilidadeBancoHoras
} from "../../utils/categoriaPonto";
import {
  formatarDataExtensoPt,
  hojeBrasiliaISO,
  horarioHHMMBrasilia
} from "../../utils/horario-brasilia";
import {
  transformarHistorico,
  marcarDiasFeriado,
  resumoFromHistoricoApi,
  JORNADA_PADRAO,
  type HistoricoApiResponse,
  type ApiFeriado,
  type DiaRegistro
} from "../../utils/historicoTransform";

/* ─── Helpers ─── */
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtDate = (d: Date) => formatarDataExtensoPt(d);
const toHM = (m: number) => {
  const sign = m < 0 ? "-" : "";
  const abs = Math.abs(m);
  return `${sign}${Math.floor(abs / 60)}h${pad(abs % 60)}`;
};

function mesAnteriorInfo(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const yyyyMM = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const mesmoAno = d.getFullYear() === ref.getFullYear();
  const nome = d.toLocaleDateString(
    "pt-BR",
    mesmoAno ? { month: "long" } : { month: "long", year: "numeric" }
  );
  return { yyyyMM, nome: nome.charAt(0).toUpperCase() + nome.slice(1) };
}

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

interface ApiBancoHoras {
  saldoAtualMinutos: number;
  proximaZeragem: string | null;
  dias?: { data: string; saldoDiaMinutos: number }[];
}

interface DiaQuinzena {
  dia: string;
  data: string;
  isoKey: string;
  isHoje: boolean;
  horasMin: number;
  status: "OK" | "PARCIAL" | "FALTA" | "FUTURO";
}

/* ─── Computa a quinzena atual (1–15 ou 16–fim) a partir do histórico ─── */
function statusQuinzena(dia: DiaRegistro): DiaQuinzena["status"] {
  if (dia.status === "FUTURO") return "FUTURO";
  if (dia.status === "OK") return "OK";
  if (dia.status === "PENDENTE" || dia.status === "INCONSISTENTE") return "PARCIAL";
  if (dia.horasMin > 0) return "OK";
  return "FALTA";
}

function computeQuinzena(diasMes: DiaRegistro[]): DiaQuinzena[] {
  const hojeIso = hojeBrasiliaISO();
  const [, , diaMes] = hojeIso.split("-").map(Number);
  const inicioDia = diaMes <= 15 ? 1 : 16;
  const fimDia =
    diaMes <= 15
      ? 15
      : new Date(Number(hojeIso.slice(0, 4)), Number(hojeIso.slice(5, 7)), 0).getDate();

  return diasMes.flatMap((dia) => {
    const [d, m, a] = dia.data.split("/");
    const isoKey = `${a}-${m}-${d}`;
    const dayNum = Number(d);
    if (dayNum < inicioDia || dayNum > fimDia) return [];
    if ((dia.diaSemana === "Sáb" || dia.diaSemana === "Dom") && !(dia.horasMin > 0)) return [];
    return [
      {
        dia: dia.diaSemana,
        data: pad(dayNum),
        isoKey,
        isHoje: isoKey === hojeIso,
        horasMin: dia.horasMin,
        status: statusQuinzena(dia)
      }
    ];
  });
}

/** Segunda e domingo (AAAA-MM-DD) da semana de hoje, no fuso de Brasília. */
function limitesSemanaAtual() {
  const hoje = new Date(`${hojeBrasiliaISO()}T12:00:00Z`);
  const dow = hoje.getUTCDay(); // 0 = domingo
  const seg = new Date(hoje.getTime() - ((dow + 6) % 7) * 86_400_000);
  const dom = new Date(seg.getTime() + 6 * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: iso(seg), fim: iso(dom) };
}

/** Dias da semana atual (segunda a domingo; sábado e domingo só quando houver registro). */
function computeSemana(diasMes: DiaRegistro[]): DiaQuinzena[] {
  const hojeIso = hojeBrasiliaISO();
  const { inicio, fim } = limitesSemanaAtual();
  return diasMes.flatMap((dia) => {
    const [d, m, a] = dia.data.split("/");
    const isoKey = `${a}-${m}-${d}`;
    if (isoKey < inicio || isoKey > fim) return [];
    if ((dia.diaSemana === "Sáb" || dia.diaSemana === "Dom") && !(dia.horasMin > 0)) return [];
    return [
      {
        dia: dia.diaSemana,
        data: pad(Number(d)),
        isoKey,
        isHoje: isoKey === hojeIso,
        horasMin: dia.horasMin,
        status: statusQuinzena(dia)
      }
    ];
  });
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
  return horarioHHMMBrasilia(new Date(iso));
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

/* ─── Comprovante de Registro de Ponto (art. 79) ─── */
function BotaoComprovante({
  c,
  onAbrir
}: {
  c?: ComprovanteItem;
  onAbrir: (c: ComprovanteItem) => void;
}) {
  if (!c) return null;
  return (
    <button
      type="button"
      onClick={() => onAbrir(c)}
      title="Comprovante de Registro de Ponto do Trabalhador"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--burgundy-600)",
        background: "#fff",
        border: "1px solid rgba(122,30,38,0.22)",
        borderRadius: 999,
        cursor: "pointer",
        flexShrink: 0
      }}
    >
      <FileTextIcon size={12} /> Comprovante
    </button>
  );
}

/* ─── Day card ─── */
function DayCard({
  dia,
  data,
  isHoje,
  horasMin,
  status,
  semRotuloDia
}: DiaQuinzena & { semRotuloDia?: boolean }) {
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
        padding: semRotuloDia ? "7px 2px" : "12px 4px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: semRotuloDia ? 3 : 6,
        boxSizing: "border-box"
      }}
    >
      {!semRotuloDia && (
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
      )}
      <p
        style={{
          fontSize: semRotuloDia ? 15 : 17,
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

/** Organiza os dias em semanas (Seg a Sex; Dom e Sáb só quando houver registro). */
function montarSemanas(quinzena: DiaQuinzena[]) {
  const temDom = quinzena.some((d) => d.dia === "Dom");
  const temSab = quinzena.some((d) => d.dia === "Sáb");
  const colunas = [
    ...(temDom ? ["Dom"] : []),
    "Seg",
    "Ter",
    "Qua",
    "Qui",
    "Sex",
    ...(temSab ? ["Sáb"] : [])
  ];
  const inicioSemana = temDom ? 0 : 1;
  const semanas = new Map<string, Record<string, DiaQuinzena>>();
  for (const d of quinzena) {
    const dt = new Date(`${d.isoKey}T12:00:00`);
    dt.setDate(dt.getDate() - ((dt.getDay() - inicioSemana + 7) % 7));
    const chave = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    semanas.set(chave, { ...(semanas.get(chave) ?? {}), [d.dia]: d });
  }
  return {
    colunas,
    semanas: [...semanas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  };
}

/* ─── Seção: Essa Quinzena ─── */
function SemanaSection({ semana, compact }: { semana: DiaQuinzena[]; compact?: boolean }) {
  const { inicio, fim } = limitesSemanaAtual();
  const [, mi, di] = inicio.split("-");
  const [, mf, df] = fim.split("-");
  const periodoLabel = mi === mf ? `${di}–${df}/${mi}` : `${di}/${mi}–${df}/${mf}`;
  const grade = montarSemanas(semana);

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
            Essa Semana
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
      {semana.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${grade.colunas.length}, minmax(0, 1fr))`,
            gap: 10,
            width: "100%"
          }}
        >
          {grade.colunas.map((c) => (
            <p
              key={`h-${c}`}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                textAlign: "center",
                margin: 0
              }}
            >
              {c}
            </p>
          ))}
          {grade.semanas.flatMap((sem, i) =>
            grade.colunas.map((c) =>
              sem[c] ? (
                <DayCard key={sem[c].isoKey} {...sem[c]} semRotuloDia />
              ) : (
                <div key={`v-${i}-${c}`} />
              )
            )
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Sem registros nesta semana.</p>
      )}
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
  /** Requerimentos pendentes do funcionário (endereço + dados cadastrais), por tipo. */
  const [reqsPendentes, setReqsPendentes] = useState<TipoRequerimento[]>([]);
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
        .catch(() => null),
      api.get<{ tipo: TipoRequerimento }[]>("/ponto/requerimento-cadastro", token).catch(() => [])
    ])
      .then(([d, req, cadastro]) => {
        setItems(d ?? []);
        setReqsPendentes([
          ...(req?.status === "PENDENTE" ? (["ENDERECO"] as const) : []),
          ...(cadastro ?? []).map((c) => c.tipo)
        ]);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pendentes = items.filter((i) => i.status === "PENDENTE").length + reqsPendentes.length;
  const naoRespondidos = items.filter((i) => i.status !== "RESPONDIDO");
  const recentes = naoRespondidos.slice(0, Math.max(0, 3 - reqsPendentes.length));

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

      {!loading && recentes.length === 0 && reqsPendentes.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0, fontStyle: "italic" }}>
          {items.length > 0
            ? "Todas as requisições foram respondidas."
            : "Nenhuma requisição no momento."}
        </p>
      )}

      {!loading && (recentes.length > 0 || reqsPendentes.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Requerimentos do RH para o funcionário preencher (endereço, dependentes, …) */}
          {reqsPendentes.map((tipo) => (
            <Link key={tipo} to="/ponto/minhas-requisicoes" style={{ textDecoration: "none" }}>
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
                  {REQUERIMENTO_INFO[tipo].icone}
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
                    {REQUERIMENTO_INFO[tipo].tituloFuncionario}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "2px 0 0" }}>
                    Solicitado pelo RH · Apresente os originais no RH
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
          ))}
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
  semana,
  compact,
  token
}: {
  semana: DiaQuinzena[];
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
        <SemanaSection semana={semana} compact={compact} />
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
  const horaServidor = useHoraServidor();
  const [now, setNow] = useState(new Date());

  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [relatorio, setRelatorio] = useState<ApiRelatorio | null>(null);
  const [bancoHoras, setBancoHoras] = useState<ApiBancoHoras | null>(null);
  const [quinzena, setQuinzena] = useState<DiaQuinzena[]>([]);
  const [semana, setSemana] = useState<DiaQuinzena[]>([]);
  const [loading, setLoading] = useState(true);
  const { itens: comprovantes, recarregar: recarregarComprovantes } = useComprovantes({
    horas: 48
  });
  /* Atualização em tempo real: status a cada 30 s; histórico e banco a cada 5 min e ao voltar à aba. */
  const [tick, setTick] = useState(0);
  const [comprovanteAberto, setComprovanteAberto] = useState<ComprovanteItem | null>(null);
  const abrirComprovante = useCallback((c: ComprovanteItem) => setComprovanteAberto(c), []);

  useEffect(() => {
    const t = setInterval(() => setNow(horaServidor()), 1_000);
    return () => clearInterval(t);
  }, [horaServidor]);

  /* Status do dia (leve): a cada 30 s com a aba visível. */
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api
        .get<ApiStatus>("/ponto/status")
        .then((st) => st && setStatus(st))
        .catch(() => undefined);
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  /* Histórico, semana e banco (mais pesados): a cada 5 min e ao voltar para a aba. */
  useEffect(() => {
    const atualizar = () => setTick((n) => n + 1);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, 5 * 60_000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []);

  useEffect(() => {
    if (tick > 0) void recarregarComprovantes();
  }, [tick, recarregarComprovantes]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 20_000);

    const hojeIso = hojeBrasiliaISO();
    const [ano, mes] = hojeIso.split("-").map(Number);

    Promise.all([
      api.get<ApiStatus>("/ponto/status", undefined, ac.signal),
      api.get<HistoricoApiResponse>(`/ponto/historico?mes=${mes}&ano=${ano}`, undefined, ac.signal),
      api
        .get<ApiFeriado[]>(`/ponto/config/feriados?ano=${ano}`, undefined, ac.signal)
        .catch((err: unknown) => {
          if (isRequestAborted(err)) throw err;
          return [] as ApiFeriado[];
        })
    ])
      .then(async ([statusData, histData, feriadosCfg]) => {
        if (cancelled) return;
        setStatus(statusData);
        const ocultar =
          !!histData?.ocultarBancoHoras ||
          categoriaSemVisibilidadeBancoHoras(histData?.categoria ?? statusData?.categoria);
        const resumo = resumoFromHistoricoApi(histData, mes, ano);
        setRelatorio({
          ...resumo,
          ocultarBancoHoras: ocultar,
          ...(ocultar ? { horasExtrasMinutos: 0, horasFaltaMinutos: 0, saldoMinutos: 0 } : {})
        });
        const feriados =
          Array.isArray(feriadosCfg) && feriadosCfg.length > 0
            ? feriadosCfg
            : (histData?.feriados ?? []);
        const diasMes = marcarDiasFeriado(
          transformarHistorico(
            histData?.registros ?? [],
            histData?.afastamentos ?? [],
            mes,
            ano,
            feriados,
            histData?.multiplicadores ?? { sabadoPct: 100, domingoPct: 200, feriadoPct: 200 },
            histData?.jornada ?? JORNADA_PADRAO,
            histData?.inicioAtividades ?? null,
            {
              pontoObrigatorioDesde: histData?.pontoObrigatorioDesde ?? null,
              semRegistroPonto: !!histData?.semRegistroPonto,
              periodosSemObrigacao: histData?.periodosSemObrigacao ?? [],
              periodosCessao: histData?.periodosCessao ?? [],
              exigirIntervalo: !categoriaSemIntervaloAlmoco(histData?.categoria),
              diasCicloCompletoEmCasa: histData?.cicloCompletoEmCasa?.dias,
              exigenciasCicloPresencial: histData?.cicloCompletoPresencial?.porDia
            }
          ),
          feriados,
          histData?.bancoPorDia
        );
        setQuinzena(computeQuinzena(diasMes));
        setSemana(computeSemana(diasMes));
        if (ocultar) {
          setBancoHoras(null);
          return;
        }
        const bancoData = await api
          .get<ApiBancoHoras>("/ponto/banco-horas", undefined, ac.signal)
          .catch((err: unknown) => {
            if (isRequestAborted(err)) throw err;
            return null;
          });
        if (!cancelled) setBancoHoras(bancoData);
      })
      .catch((err: unknown) => {
        if (isRequestAborted(err) || cancelled) return;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        clearTimeout(timeout);
      });

    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(timeout);
    };
  }, [tick]);

  const hora = now.getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = (user?.name ?? "").split(" ")[0] || "Olá";

  const estado = status?.estado ?? "FORA";
  /* Horas do dia sempre do servidor (mesma regra da folha: almoço mínimo, pausas, tolerâncias),
     relidas a cada 30 s — sem estimar no navegador, que não conhece essas regras. */
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
  const saldoBanco = bancoHoras?.saldoAtualMinutos;
  const mesAnt = mesAnteriorInfo(now);
  const diasMesAnterior = bancoHoras?.dias?.filter((d) => d.data?.slice(0, 7) === mesAnt.yyyyMM);
  const saldoMesAnterior =
    diasMesAnterior && diasMesAnterior.length > 0
      ? diasMesAnterior.reduce((s, d) => s + d.saldoDiaMinutos, 0)
      : null;

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
          <StatPill
            label="Hoje"
            value={toHM(horasHoje)}
            sub={`de ${toHM(jornada)} · saldo ${toHM(saldoHoje)}`}
          />
          {!ocultarBancoHoras && (
            <Link
              to="/ponto/banco-horas"
              title="Ver banco de horas"
              style={{
                textDecoration: "none",
                color: "inherit",
                flex: 1,
                minWidth: 0,
                background: "#fff",
                borderRadius: "var(--radius-lg)",
                border: "1px solid rgba(122,30,38,0.08)",
                padding: "14px",
                boxSizing: "border-box"
              }}
            >
              <p
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "var(--ink-500)",
                  marginBottom: 8
                }}
              >
                Banco de Horas
              </p>
              <div style={{ display: "flex", alignItems: "stretch", gap: 12, minWidth: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      color:
                        saldoBanco == null
                          ? "var(--ink-900)"
                          : saldoBanco >= 0
                            ? "var(--green)"
                            : "var(--red)",
                      lineHeight: 1
                    }}
                  >
                    {saldoBanco == null ? "—" : toHM(saldoBanco)}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 3 }}>acumulado</p>
                </div>
                <div style={{ width: 1, background: "rgba(122,30,38,0.10)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      color:
                        saldoMesAnterior == null
                          ? "var(--ink-500)"
                          : saldoMesAnterior >= 0
                            ? "var(--ink-900)"
                            : "var(--red)",
                      lineHeight: 1
                    }}
                  >
                    {saldoMesAnterior == null ? "—" : toHM(saldoMesAnterior)}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 3 }}>
                    {saldoMesAnterior == null ? `${mesAnt.nome} · fora do ciclo` : mesAnt.nome}
                  </p>
                </div>
              </div>
            </Link>
          )}
        </div>

        {/* Painel principal: quinzena + requisições RH */}
        <DashboardPainelPrincipal semana={semana} compact token={token() ?? ""} />

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
          {comprovanteAberto && (
            <ComprovanteModal
              nsr={comprovanteAberto.nsr}
              rotulo={`${comprovanteAberto.rotulo} ${comprovanteAberto.hora}`}
              onClose={() => setComprovanteAberto(null)}
            />
          )}
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
                  <BotaoComprovante
                    c={acharComprovante(comprovantes, {
                      id: (r as { id?: string }).id,
                      tipo: r.tipo,
                      dataHora: r.dataHora
                    })}
                    onAbrir={abrirComprovante}
                  />
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

      {/* Grid topo — relógio, horas de hoje e banco de horas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: ocultarBancoHoras
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(3, minmax(0, 1fr))",
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
          <div style={{ display: "flex", alignItems: "stretch", gap: 16, minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
            <div
              style={{
                width: 1,
                background: "rgba(122,30,38,0.10)",
                flexShrink: 0
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
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
        {!ocultarBancoHoras && (
          <Link
            to="/ponto/banco-horas"
            className="card-flat"
            title="Ver banco de horas"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minWidth: 0,
              width: "100%",
              boxSizing: "border-box",
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer"
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
                Banco de Horas
              </p>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background:
                    saldoBanco == null || saldoBanco >= 0
                      ? "rgba(47,125,79,0.08)"
                      : "rgba(200,57,63,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: saldoBanco == null || saldoBanco >= 0 ? "var(--green)" : "var(--red)",
                  flexShrink: 0
                }}
              >
                <BarChart2Icon size={18} />
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "stretch", gap: 16, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 26,
                    color:
                      saldoBanco == null
                        ? "var(--ink-900)"
                        : saldoBanco >= 0
                          ? "var(--ink-900)"
                          : "var(--red)",
                    lineHeight: 1
                  }}
                >
                  {saldoBanco == null ? "—" : toHM(saldoBanco)}
                </p>
                <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>acumulado</p>
              </div>
              <div
                style={{
                  width: 1,
                  background: "rgba(122,30,38,0.10)",
                  flexShrink: 0
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 26,
                    color:
                      saldoMesAnterior == null
                        ? "var(--ink-500)"
                        : saldoMesAnterior >= 0
                          ? "var(--ink-900)"
                          : "var(--red)",
                    lineHeight: 1
                  }}
                >
                  {saldoMesAnterior == null ? "—" : toHM(saldoMesAnterior)}
                </p>
                <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>
                  {saldoMesAnterior == null ? `${mesAnt.nome} · fora do ciclo` : mesAnt.nome}
                </p>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Painel principal (2fr) + Registros hoje (1fr) — alinha com o card Banco de Horas do topo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
          gap: 16,
          marginBottom: 24,
          alignItems: "stretch"
        }}
      >
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
          {comprovanteAberto && (
            <ComprovanteModal
              nsr={comprovanteAberto.nsr}
              rotulo={`${comprovanteAberto.rotulo} ${comprovanteAberto.hora}`}
              onClose={() => setComprovanteAberto(null)}
            />
          )}
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
                  <BotaoComprovante
                    c={acharComprovante(comprovantes, {
                      id: (r as { id?: string }).id,
                      tipo: r.tipo,
                      dataHora: r.dataHora
                    })}
                    onAbrir={abrirComprovante}
                  />
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
            <Link
              to="/ponto/comprovantes"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--ink-500)",
                marginTop: "auto",
                paddingTop: 6
              }}
            >
              Meus comprovantes <ArrowRightIcon size={12} />
            </Link>
          </div>
        </div>

        <DashboardPainelPrincipal semana={semana} token={token() ?? ""} />
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

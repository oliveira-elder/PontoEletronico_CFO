import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { useNavigate } from "react-router-dom";
import { api } from "../../../hooks/useApi";
import { CHART_PALETTE } from "../../../utils/chartPalette";
import { hojeBrasiliaISO, minutosBrasilia } from "../../../utils/horario-brasilia";
import {
  UsersIcon,
  ClockIcon,
  BarChart2Icon,
  InboxIcon,
  CalendarIcon,
  ArrowLeftIcon
} from "../../../components/icons";
import { StatCard } from "../../../components/dashboard/StatCard";
import { DashboardPanel } from "../../../components/dashboard/DashboardPanel";
import { MiniDonut } from "../../../components/dashboard/MiniDonut";
import { MiniBarChart } from "../../../components/dashboard/MiniBarChart";
import {
  RankingHorizontalChart,
  abbreviarNome
} from "../../../components/dashboard/RankingHorizontalChart";
import type { AuditoriaDashboardData } from "./types";

const statValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "var(--ink-900)",
  lineHeight: 1,
  fontFamily: "var(--font-display)"
};

function construirSerieHoraria(contagemPorHora: Map<number, number>) {
  if (contagemPorHora.size === 0) return [];
  const horas = Array.from(contagemPorHora.keys());
  const min = Math.min(...horas);
  const max = Math.max(...horas);
  const out: { label: string; minuto: number; total: number }[] = [];
  for (let h = min; h <= max; h++) {
    out.push({
      label: `${String(h).padStart(2, "0")}h`,
      minuto: h * 60,
      total: contagemPorHora.get(h) ?? 0
    });
  }
  return out;
}

function agregarPorHora(datas: Array<string | Date>) {
  const contagemPorHora = new Map<number, number>();
  for (const raw of datas) {
    const d = typeof raw === "string" ? new Date(raw) : raw;
    if (Number.isNaN(d.getTime())) continue;
    const hora = Math.floor(minutosBrasilia(d) / 60);
    contagemPorHora.set(hora, (contagemPorHora.get(hora) ?? 0) + 1);
  }
  return construirSerieHoraria(contagemPorHora);
}

/** Gráfico "Registros por horário/dia" com drill-down no clique de um dia. */
function RegistrosPorHorarioChart({
  data,
  token
}: {
  data: AuditoriaDashboardData;
  token: string;
}) {
  const [diaDetalhe, setDiaDetalhe] = useState<string | null>(null);
  const [serieDetalhe, setSerieDetalhe] = useState<
    { label: string; minuto: number; total: number }[]
  >([]);
  const [horaLoading, setHoraLoading] = useState(false);
  const [horaErro, setHoraErro] = useState<string | null>(null);
  const pontosDiaRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const chartHostRef = useRef<HTMLDivElement | null>(null);

  const abrirDia = useCallback(
    async (dia: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
      setDiaDetalhe(dia);
      setSerieDetalhe([]);
      setHoraErro(null);
      setHoraLoading(true);
      try {
        try {
          const res = await api.get<{
            data: string;
            porMinuto?: { label: string; minuto: number; total: number }[];
            porHora?: { hora: number; label: string; total: number }[];
          }>(`/auditoria/dashboard/registros-hora?data=${dia}`, token);
          if (res?.porMinuto && res.porMinuto.length > 0) {
            const contagemPorHora = new Map<number, number>();
            for (const m of res.porMinuto) {
              const hora = Math.floor(m.minuto / 60);
              contagemPorHora.set(hora, (contagemPorHora.get(hora) ?? 0) + m.total);
            }
            setSerieDetalhe(construirSerieHoraria(contagemPorHora));
            setDiaDetalhe(res.data ?? dia);
            setHoraErro(null);
            return;
          }
          if (res?.porHora) {
            const contagemPorHora = new Map<number, number>();
            for (const h of res.porHora) {
              if (h.total > 0)
                contagemPorHora.set(h.hora, (contagemPorHora.get(h.hora) ?? 0) + h.total);
            }
            setSerieDetalhe(construirSerieHoraria(contagemPorHora));
            setDiaDetalhe(res.data ?? dia);
            setHoraErro(null);
            return;
          }
        } catch {
          /* 404 ou indisponível — fallback abaixo */
        }

        const horarios: Array<string | Date> = [];
        let page = 1;
        let total = Infinity;
        while (horarios.length < total && page <= 20) {
          const res = await api.get<{ total: number; registros: Array<{ dataHora: string }> }>(
            `/auditoria/registros?dataInicio=${dia}&dataFim=${dia}&page=${page}&limit=500`,
            token
          );
          total = res?.total ?? 0;
          for (const r of res?.registros ?? []) horarios.push(r.dataHora);
          if (!res?.registros?.length) break;
          page += 1;
        }
        setSerieDetalhe(agregarPorHora(horarios));
        setDiaDetalhe(dia);
        setHoraErro(null);
      } catch (e) {
        setHoraErro((e as Error).message || "Não foi possível carregar o dia.");
        setSerieDetalhe([]);
      } finally {
        setHoraLoading(false);
      }
    },
    [token]
  );

  function voltarSerieDiaria() {
    setDiaDetalhe(null);
    setSerieDetalhe([]);
    setHoraErro(null);
    pontosDiaRef.current.clear();
  }

  function onClickSerieDiaria(_state: unknown, event?: { clientX?: number; clientY?: number }) {
    if (diaDetalhe) return;
    const clientX = event?.clientX;
    const clientY = event?.clientY;
    if (typeof clientX !== "number" || typeof clientY !== "number") return;

    const host = chartHostRef.current;
    if (host) {
      host.querySelectorAll<SVGCircleElement>("circle[data-dia]").forEach((el) => {
        const dia = el.getAttribute("data-dia");
        if (!dia) return;
        const r = el.getBoundingClientRect();
        pontosDiaRef.current.set(dia, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      });
    }

    const HIT_PX = 28;
    let melhorDia: string | null = null;
    let melhorDist = HIT_PX;
    for (const [dia, p] of pontosDiaRef.current.entries()) {
      const dist = Math.hypot(p.x - clientX, p.y - clientY);
      if (dist <= melhorDist) {
        melhorDist = dist;
        melhorDia = dia;
      }
    }
    if (melhorDia) void abrirDia(melhorDia);
  }

  useEffect(() => {
    setDiaDetalhe(null);
    setSerieDetalhe([]);
    setHoraErro(null);
    pontosDiaRef.current.clear();
  }, [data]);

  const serieBase =
    data.registrosPorTempo && data.registrosPorTempo.length > 0
      ? data.registrosPorTempo
      : (data.registrosPorDia ?? []).map((d) => ({ data: d.data, total: d.entradas }));
  const serieLinha = serieBase.map((d) => ({
    ...d,
    label: new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short"
    })
  }));

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "18px 20px",
        minWidth: 0
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap"
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-500)",
            margin: 0
          }}
        >
          {diaDetalhe
            ? `Registros por horário — ${new Date(diaDetalhe + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}`
            : "Quantidade de registros por tempo"}
        </p>
        {diaDetalhe && (
          <button
            type="button"
            onClick={voltarSerieDiaria}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.20)",
              background: "transparent",
              color: "var(--burgundy-600)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <ArrowLeftIcon size={12} /> Voltar ao período
          </button>
        )}
      </div>
      {!diaDetalhe && (
        <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "0 0 8px" }}>
          Clique no ponto de um dia para ver a quantidade de registros por hora.
        </p>
      )}
      {horaErro && <p style={{ fontSize: 12, color: "#b91c1c", margin: "0 0 8px" }}>{horaErro}</p>}
      <div style={{ width: "100%", height: 280 }}>
        {horaLoading ? (
          <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}>
            Carregando…
          </p>
        ) : diaDetalhe ? (
          serieDetalhe.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}>
              Sem registros neste dia.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieDetalhe} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
                <Tooltip
                  formatter={(v) => [v, "Registros"] as [number, string]}
                  labelFormatter={(label) => `Hora ${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Registros"
                  stroke="var(--burgundy-600)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--burgundy-600)" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )
        ) : serieLinha.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}>
            Sem registros no período.
          </p>
        ) : (
          <div ref={chartHostRef} style={{ width: "100%", height: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={serieLinha}
                margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
                onClick={onClickSerieDiaria}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
                <Tooltip
                  formatter={(v) => [v, "Registros"] as [number, string]}
                  labelFormatter={(_l: unknown, p: unknown) => {
                    const payload = p as Array<{ payload?: { data?: string } }> | undefined;
                    const d = payload?.[0]?.payload?.data;
                    return d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "";
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Registros"
                  stroke="var(--burgundy-600)"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  activeDot={{
                    r: 7,
                    fill: "var(--burgundy-600)",
                    stroke: "#fff",
                    strokeWidth: 2,
                    style: { cursor: "pointer" }
                  }}
                  dot={(props: {
                    cx?: number;
                    cy?: number;
                    payload?: { data?: string; total?: number };
                    index?: number;
                  }) => {
                    const { cx, cy, payload, index } = props;
                    if (cx == null || cy == null || !payload?.data) {
                      return <g key={`empty-dot-${index ?? 0}`} />;
                    }
                    return (
                      <circle
                        key={`dot-${payload.data}`}
                        data-dia={payload.data}
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill="var(--burgundy-600)"
                        stroke="#fff"
                        strokeWidth={2}
                        style={{ cursor: "pointer", pointerEvents: "none" }}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export function PontoFrequenciaTab({
  data,
  token
}: {
  data: AuditoriaDashboardData;
  token: string;
}) {
  const navigate = useNavigate();
  const [modoPontualidade, setModoPontualidade] = useState<"atrasados" | "adiantados">("atrasados");
  const [modoBanco, setModoBanco] = useState<"negativo" | "positivo">("negativo");

  const isoHoje = hojeBrasiliaISO();
  const maxEntradas = Math.max(...(data.registrosPorDia ?? []).map((d) => d.entradas), 1);
  const uc = data.usoCanal;

  const rankingPont =
    modoPontualidade === "atrasados" ? (data.topAtrasados ?? []) : (data.topAdiantados ?? []);
  const rankingBanco =
    modoBanco === "negativo" ? (data.topBancoNegativo ?? []) : (data.topBancoPositivo ?? []);
  const chartPont = rankingPont.map((r) => ({
    nome: abbreviarNome(r.nome),
    nomeCompleto: r.nome,
    minutos: r.minutos,
    label: r.minutosFormatado
  }));
  const chartBanco = rankingBanco.map((r) => ({
    nome: abbreviarNome(r.nome),
    nomeCompleto: r.nome,
    minutos: r.minutos,
    label: r.minutosFormatado
  }));

  const barAtrasoPorGerencia = (data.atrasoMedioPorGerencia ?? []).map((g) => ({
    name: g.nome,
    value: g.minutos
  }));
  const registrosAjustados = data.registrosAjustados;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="dashboard-grid-4">
        <StatCard
          label="Funcionários"
          value={data.totalFuncionarios}
          sub={`${data.funcionariosAtivos} ativos`}
          color={CHART_PALETTE[0]}
          icon={<UsersIcon size={16} />}
          onClick={() => navigate("/ponto/auditoria")}
        />
        <StatCard
          label="Trabalhando agora"
          value={data.trabalhando}
          sub="no expediente"
          color="var(--green)"
          icon={<ClockIcon size={16} />}
          onClick={() => navigate("/ponto/auditoria")}
        />
        <StatCard
          label="Em intervalo"
          value={data.emIntervalo}
          sub="pausa ativa"
          color={CHART_PALETTE[3]}
          icon={<ClockIcon size={16} />}
        />
        <StatCard
          label="Pausados"
          value={data.pausados ?? 0}
          sub="expediente interrompido"
          color={CHART_PALETTE[4]}
          icon={<ClockIcon size={16} />}
        />
        <StatCard
          label="Registros hoje"
          value={data.registrosHoje}
          sub="todos os tipos"
          color={CHART_PALETTE[2]}
          icon={<BarChart2Icon size={16} />}
        />
        <StatCard
          label="Sol. pendentes"
          value={data.solicitacoesPendentes}
          sub="aguardando revisão"
          color={data.solicitacoesPendentes > 0 ? CHART_PALETTE[3] : undefined}
          icon={<InboxIcon size={16} />}
        />
        <StatCard
          label="Afastamentos"
          value={data.afastamentosAtivos}
          sub="ativos hoje"
          color="var(--red)"
          icon={<CalendarIcon size={16} />}
        />
        <StatCard
          label="Períodos abertos"
          value={data.periodosAbertos}
          sub={`${data.periodosFechados} fechados · ${data.periodosAprovados} aprovados`}
          color={CHART_PALETTE[0]}
          icon={<BarChart2Icon size={16} />}
        />
      </div>

      <div className="dashboard-grid-sidebar">
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            height: 130,
            boxSizing: "border-box"
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              marginBottom: 16
            }}
          >
            Entradas no período
          </p>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            {data.registrosPorDia.map((d) => {
              const pct = maxEntradas > 0 ? (d.entradas / maxEntradas) * 100 : 0;
              const dt = new Date(d.data + "T12:00:00");
              const dayName = dt.toLocaleDateString("pt-BR", { weekday: "short" });
              const eHoje = d.data === isoHoje;
              return (
                <div
                  key={d.data}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    minWidth: 0
                  }}
                >
                  <span
                    style={{
                      ...statValueStyle,
                      color: eHoje ? "var(--burgundy-600)" : "var(--ink-900)"
                    }}
                  >
                    {d.entradas}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(pct, 4)}%`,
                      background: eHoje ? "var(--burgundy-600)" : "var(--burgundy-200)",
                      borderRadius: "3px 3px 0 0",
                      minHeight: 4
                    }}
                  />
                  <span
                    style={{ fontSize: 9, color: "var(--ink-400)", textTransform: "capitalize" }}
                  >
                    {dayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            boxSizing: "border-box",
            alignSelf: "stretch",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              marginBottom: 12
            }}
          >
            Origens (hoje)
          </p>
          {data.origens.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--ink-400)",
                fontStyle: "italic",
                padding: "24px 0"
              }}
            >
              Sem registros hoje.
            </p>
          ) : (
            <MiniDonut
              data={data.origens.map((o) => ({ name: o.origem, value: o.total }))}
              height={190}
            />
          )}
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            boxSizing: "border-box",
            alignSelf: "stretch",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              marginBottom: 4
            }}
          >
            Uso por Canal
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "0 0 8px" }}>
            {uc.totalRegistros.toLocaleString("pt-BR")} registros totais
          </p>
          <MiniDonut
            data={[
              { name: "Mobile", value: uc.mobile },
              { name: "Desktop", value: uc.desktop }
            ]}
            colors={[CHART_PALETTE[6], CHART_PALETTE[2]]}
            height={190}
          />
        </div>
      </div>

      <RegistrosPorHorarioChart data={data} token={token} />

      <div className="dashboard-grid-2">
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            minWidth: 0
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap"
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                margin: 0
              }}
            >
              Top 10 {modoPontualidade === "atrasados" ? "mais atrasados" : "mais adiantados"}
            </p>
            <button
              type="button"
              onClick={() =>
                setModoPontualidade((m) => (m === "atrasados" ? "adiantados" : "atrasados"))
              }
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer"
              }}
            >
              Ver {modoPontualidade === "atrasados" ? "adiantados" : "atrasados"}
            </button>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <RankingHorizontalChart
              chart={chartPont}
              dataKey="minutos"
              unidade="m"
              corPositiva="var(--red)"
              corNegativa="var(--green)"
              modoNegativo={modoPontualidade !== "atrasados"}
            />
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            minWidth: 0
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap"
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                margin: 0
              }}
            >
              Top 10 banco {modoBanco === "negativo" ? "negativo" : "positivo"}
            </p>
            <button
              type="button"
              onClick={() => setModoBanco((m) => (m === "negativo" ? "positivo" : "negativo"))}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer"
              }}
            >
              Ver {modoBanco === "negativo" ? "positivos" : "negativos"}
            </button>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <RankingHorizontalChart
              chart={chartBanco}
              dataKey="minutos"
              unidade="m"
              corPositiva="var(--green)"
              corNegativa="var(--red)"
              modoNegativo={modoBanco === "negativo"}
            />
          </div>
        </div>
      </div>

      <div className="dashboard-grid-side">
        <DashboardPanel title="Atraso Médio por Gerência (top 10)">
          <MiniBarChart data={barAtrasoPorGerencia} color={CHART_PALETTE[7]} />
        </DashboardPanel>
        <DashboardPanel title="Registros Ajustados">
          {!registrosAjustados || registrosAjustados.total === 0 ? (
            <div
              style={{
                height: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ink-400)",
                fontSize: 12.5
              }}
            >
              Sem registros no período.
            </div>
          ) : (
            <>
              <MiniDonut
                data={[
                  { name: "Ajustados", value: registrosAjustados.ajustados },
                  {
                    name: "Originais",
                    value: registrosAjustados.total - registrosAjustados.ajustados
                  }
                ]}
                colors={[CHART_PALETTE[3], CHART_PALETTE[2]]}
                height={190}
              />
              <p
                style={{
                  fontSize: 11,
                  color: "var(--ink-400)",
                  margin: "4px 0 0",
                  textAlign: "center"
                }}
              >
                {registrosAjustados.pct}% dos {registrosAjustados.total} registros do período foram
                corrigidos manualmente.
              </p>
            </>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
}

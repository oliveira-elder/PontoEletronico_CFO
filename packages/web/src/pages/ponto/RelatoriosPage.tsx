import React, { useState, useEffect } from "react";
import {
  DownloadIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  TrendingUpIcon,
  CalendarIcon,
  BarChart2Icon,
  UsersIcon
} from "../../components/icons";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";

/* ─── Helpers ─── */
function minToHM(min: number) {
  const sign = min < 0 ? "−" : "";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

function diasUteisMes(mes: number, ano: number): number {
  const hoje = new Date();
  const isCurrentMonth = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  let count = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, mes - 1, d);
    if (isCurrentMonth && dt > hoje) break;
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/* ─── Types ─── */
interface RelatorioMes {
  mes: number;
  ano: number;
  diasTrabalhados: number;
  horasTrabalhadasMinutos: number;
  horasEsperadasMinutos: number;
  horasExtrasMinutos: number;
  horasFaltaMinutos: number;
  saldoMinutos: number;
  funcionario?: { matricula: string; cargo: string };
}

const EMPTY: RelatorioMes = {
  mes: 0,
  ano: 0,
  diasTrabalhados: 0,
  horasTrabalhadasMinutos: 0,
  horasEsperadasMinutos: 0,
  horasExtrasMinutos: 0,
  horasFaltaMinutos: 0,
  saldoMinutos: 0
};

/* ─── Mini bar chart ─── */
function BarChart({
  dados
}: {
  dados: { label: string; value: number; max: number; cor: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {dados.map((d) => {
        const pct = d.max > 0 ? Math.min(100, (d.value / d.max) * 100) : 0;
        return (
          <div key={d.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "var(--ink-700)" }}>{d.label}</span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink-900)",
                  fontWeight: 500
                }}
              >
                {minToHM(d.value)}
              </span>
            </div>
            <div style={{ height: 6, background: "rgba(122,30,38,0.07)", borderRadius: 3 }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: d.cor,
                  borderRadius: 3,
                  transition: "width 500ms cubic-bezier(0.16,1,0.3,1)"
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── 6-month trend ─── */
function TrendChart({ meses }: { meses: RelatorioMes[] }) {
  const max = Math.max(...meses.map((m) => m.horasTrabalhadasMinutos), 1);
  const nomeMes = (m: number) =>
    new Date(2026, m - 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {meses.map((m, i) => {
        const pct = (m.horasTrabalhadasMinutos / max) * 100;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4
            }}
          >
            <div
              style={{
                width: "100%",
                height: `${pct}%`,
                minHeight: 4,
                background: i === meses.length - 1 ? "var(--burgundy-600)" : "rgba(122,30,38,0.20)",
                borderRadius: "4px 4px 0 0",
                transition: "height 500ms ease"
              }}
            />
            <span style={{ fontSize: 10, color: "var(--ink-500)", textTransform: "capitalize" }}>
              {nomeMes(m.mes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  cor = "var(--ink-900)"
}: {
  label: string;
  value: string;
  sub?: string;
  cor?: string;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-500)",
          marginBottom: 6
        }}
      >
        {label}
      </p>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 28, color: cor, lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

/* ─── Page ─── */
export function RelatoriosPage() {
  const hoje = new Date();
  const isMobile = useIsMobile(768);
  const { token, user } = useAuth();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [rel, setRel] = useState<RelatorioMes>(EMPTY);
  const [trend, setTrend] = useState<RelatorioMes[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tk = token();
    if (!tk) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const trendMeses = Array.from({ length: 6 }, (_, i) => {
      let m = mes - 5 + i,
        a = ano;
      if (m < 1) {
        m += 12;
        a--;
      }
      return { m, a };
    });

    Promise.all([
      api.get<RelatorioMes>(`/ponto/relatorio?mes=${mes}&ano=${ano}`, tk),
      ...trendMeses.map(({ m, a }) =>
        api
          .get<RelatorioMes>(`/ponto/relatorio?mes=${m}&ano=${a}`, tk)
          .catch(() => ({ ...EMPTY, mes: m, ano: a }))
      )
    ])
      .then(([relData, ...trendData]) => {
        setRel(relData ?? EMPTY);
        setTrend(trendData as RelatorioMes[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mes, ano]);

  function navMes(dir: -1 | 1) {
    let nm = mes + dir,
      na = ano;
    if (nm < 1) {
      nm = 12;
      na--;
    }
    if (nm > 12) {
      nm = 1;
      na++;
    }
    setMes(nm);
    setAno(na);
  }

  const nomeMes = new Date(ano, mes - 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  const diasUteis = diasUteisMes(mes, ano);
  const pctDias = diasUteis > 0 ? (rel.diasTrabalhados / diasUteis) * 100 : 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: isMobile ? 14 : 24 }}>
        {!isMobile && (
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Ponto Eletrônico
          </p>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10
          }}
        >
          <h1
            style={{
              fontSize: isMobile ? 20 : "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            Relatório de <em>Frequência</em>
          </h1>
          <button className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
            <DownloadIcon size={14} />
            {isMobile ? "PDF" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {/* Navegação de mês */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button
          className="btn-icon"
          onClick={() => navMes(-1)}
          style={{ background: "white", border: "1px solid rgba(122,30,38,0.12)", flexShrink: 0 }}
        >
          <ArrowLeftIcon size={16} />
        </button>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: isMobile ? 16 : 20,
            color: "var(--burgundy-600)",
            textTransform: "capitalize",
            flex: 1,
            textAlign: "center",
            minWidth: 0
          }}
        >
          {nomeMes}
        </p>
        <button
          className="btn-icon"
          onClick={() => navMes(1)}
          disabled={mes === hoje.getMonth() + 1 && ano === hoje.getFullYear()}
          style={{
            background: "white",
            border: "1px solid rgba(122,30,38,0.12)",
            flexShrink: 0,
            opacity: mes === hoje.getMonth() + 1 && ano === hoje.getFullYear() ? 0.4 : 1
          }}
        >
          <ArrowRightIcon size={16} />
        </button>
      </div>

      {loading ? (
        <div
          style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-500)", fontSize: 14 }}
        >
          Carregando relatório…
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="card-flat" style={{ marginBottom: 16 }}>
            <p className="eyebrow" style={{ marginBottom: 16 }}>
              Síntese do Período
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)",
                gap: isMobile ? 16 : 24
              }}
            >
              <Stat
                label="Horas Trabalhadas"
                value={minToHM(rel.horasTrabalhadasMinutos)}
                sub={`de ${minToHM(rel.horasEsperadasMinutos)}`}
              />
              <Stat
                label="Saldo Mensal"
                value={minToHM(rel.saldoMinutos)}
                sub={rel.saldoMinutos >= 0 ? "a favor" : "negativo"}
                cor={rel.saldoMinutos >= 0 ? "var(--green)" : "var(--red)"}
              />
              <Stat
                label="Horas Extras"
                value={minToHM(rel.horasExtrasMinutos)}
                sub="acumuladas no mês"
                cor={rel.horasExtrasMinutos > 0 ? "var(--burgundy-600)" : "var(--ink-900)"}
              />
              <Stat
                label="Horas de Falta"
                value={minToHM(rel.horasFaltaMinutos)}
                sub="a compensar"
                cor={rel.horasFaltaMinutos > 0 ? "var(--red)" : "var(--ink-900)"}
              />
            </div>
            <div className="divider" />
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--ink-700)", fontWeight: 500 }}>
                  Assiduidade — {rel.diasTrabalhados} de {diasUteis} dias úteis
                </span>
                <span
                  style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--ink-900)" }}
                >
                  {pctDias.toFixed(0)}%
                </span>
              </div>
              <div style={{ height: 8, background: "rgba(122,30,38,0.07)", borderRadius: 4 }}>
                <div
                  style={{
                    width: `${pctDias}%`,
                    height: "100%",
                    background:
                      pctDias >= 90
                        ? "var(--green)"
                        : pctDias >= 75
                          ? "var(--burgundy-600)"
                          : "var(--red)",
                    borderRadius: 4,
                    transition: "width 500ms ease"
                  }}
                />
              </div>
            </div>
          </div>

          {/* Grid detalhes */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 16,
              marginBottom: 16
            }}
          >
            <div className="card-flat">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <BarChart2Icon size={16} style={{ color: "var(--burgundy-600)" }} />
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: 16,
                    color: "var(--burgundy-600)"
                  }}
                >
                  Distribuição de Horas
                </p>
              </div>
              <BarChart
                dados={[
                  {
                    label: "Trabalhadas",
                    value: rel.horasTrabalhadasMinutos,
                    max: rel.horasEsperadasMinutos + 120,
                    cor: "var(--burgundy-600)"
                  },
                  {
                    label: "Esperadas (jornada)",
                    value: rel.horasEsperadasMinutos,
                    max: rel.horasEsperadasMinutos + 120,
                    cor: "rgba(122,30,38,0.25)"
                  },
                  {
                    label: "Horas extras",
                    value: rel.horasExtrasMinutos,
                    max: rel.horasEsperadasMinutos + 120,
                    cor: "var(--green)"
                  },
                  {
                    label: "Horas de falta",
                    value: rel.horasFaltaMinutos,
                    max: rel.horasEsperadasMinutos + 120,
                    cor: "var(--red)"
                  }
                ]}
              />
            </div>

            <div className="card-flat">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <CalendarIcon size={16} style={{ color: "var(--burgundy-600)" }} />
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: 16,
                    color: "var(--burgundy-600)"
                  }}
                >
                  Presença
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  {
                    label: "Dias trabalhados",
                    value: rel.diasTrabalhados,
                    total: diasUteis,
                    cor: "var(--burgundy-600)",
                    invertido: false
                  }
                ].map((item) => (
                  <div key={item.label}>
                    <div
                      style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
                    >
                      <span style={{ fontSize: 13, color: "var(--ink-700)" }}>{item.label}</span>
                      <span
                        style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 500 }}
                      >
                        {item.value}
                        <span style={{ color: "var(--ink-500)", fontWeight: 400 }}>
                          {" "}
                          / {item.total}
                        </span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: "rgba(122,30,38,0.07)", borderRadius: 3 }}>
                      <div
                        style={{
                          width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%`,
                          height: "100%",
                          background: item.cor,
                          borderRadius: 3
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trend */}
          {trend.length > 0 && (
            <div className="card-flat" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <TrendingUpIcon size={16} style={{ color: "var(--burgundy-600)" }} />
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: 16,
                    color: "var(--burgundy-600)"
                  }}
                >
                  Tendência dos Últimos 6 Meses
                </p>
              </div>
              <TrendChart meses={trend} />
              <p
                style={{
                  fontSize: 11,
                  color: "var(--ink-500)",
                  marginTop: 10,
                  textAlign: "center"
                }}
              >
                Horas trabalhadas por mês · barra mais escura = período selecionado
              </p>
            </div>
          )}

          {/* Rodapé */}
          <div
            style={{
              padding: "14px 16px",
              background: "var(--cream-100)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.08)",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: 8
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <UsersIcon size={14} style={{ color: "var(--ink-500)" }} />
              <p style={{ fontSize: 12, color: "var(--ink-500)" }}>
                Relatório gerado para:{" "}
                <strong style={{ color: "var(--ink-900)" }}>{user?.name ?? "—"}</strong>
                {rel.funcionario
                  ? ` · Matrícula ${rel.funcionario.matricula} · ${rel.funcionario.cargo}`
                  : ""}
              </p>
            </div>
            <p style={{ fontSize: 11, color: "var(--ink-500)", fontFamily: "var(--font-mono)" }}>
              Sistema de Ponto Eletrônico CFO
            </p>
          </div>
        </>
      )}
    </div>
  );
}

import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { DashboardPanel } from "../../../components/dashboard/DashboardPanel";
import { Modal } from "../../../components/Modal";
import { CHART_PALETTE as PALETTE } from "../../../utils/chartPalette";
import { hojeBrasiliaISO } from "../../../utils/horario-brasilia";
import { categoriaFuncLabel, MESES_LABEL, type GestaoDashboardStats } from "./types";

const MESES_NOME = [
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

const ACCENT = "var(--burgundy-600)";
const NEUTRAL = PALETTE[0];

function AniversariantesChart({ stats }: { stats: GestaoDashboardStats }) {
  const mesAtual = Number(hojeBrasiliaISO().slice(5, 7));
  const [mesSelecionado, setMesSelecionado] = useState<number | null>(null);

  const porMes = useMemo(() => {
    const contagem = new Map<number, number>();
    for (const a of stats.aniversariantes) contagem.set(a.mes, (contagem.get(a.mes) ?? 0) + 1);
    return MESES_LABEL.map((label, i) => ({ mes: i + 1, label, total: contagem.get(i + 1) ?? 0 }));
  }, [stats.aniversariantes]);

  const listaMes = mesSelecionado
    ? stats.aniversariantes.filter((a) => a.mes === mesSelecionado).sort((a, b) => a.dia - b.dia)
    : [];

  return (
    <DashboardPanel title="Aniversariantes por Mês">
      <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "-6px 0 12px" }}>
        Mês atual em destaque. Clique em uma barra para ver os nomes.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={porMes} margin={{ left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
          <Tooltip formatter={(v) => [v, "Aniversariantes"] as [number, string]} />
          <Bar
            dataKey="total"
            radius={[4, 4, 0, 0]}
            barSize={26}
            onClick={(entry: { mes?: number; payload?: { mes?: number } }) =>
              setMesSelecionado(entry.payload?.mes ?? entry.mes ?? null)
            }
            style={{ cursor: "pointer" }}
          >
            {porMes.map((m) => (
              <Cell key={m.mes} fill={m.mes === mesAtual ? ACCENT : NEUTRAL} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {mesSelecionado && (
        <Modal
          eyebrow="Dashboard"
          title={`Aniversariantes de ${MESES_NOME[mesSelecionado - 1]}`}
          onClose={() => setMesSelecionado(null)}
        >
          {listaMes.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-400)",
                textAlign: "center",
                padding: "24px 0"
              }}
            >
              Nenhum aniversariante neste mês.
            </p>
          ) : (
            <div>
              {listaMes.map((a, i) => (
                <div
                  key={`${a.nome}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom:
                      i < listaMes.length - 1 ? "1px solid rgba(122,30,38,0.08)" : "none",
                    fontSize: 13
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--burgundy-600)",
                      fontWeight: 700,
                      minWidth: 32
                    }}
                  >
                    {String(a.dia).padStart(2, "0")}/{String(a.mes).padStart(2, "0")}
                  </span>
                  <span style={{ color: "var(--ink-800)", fontWeight: 600 }}>{a.nome}</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </DashboardPanel>
  );
}

const FAIXAS_URGENCIA = [
  { chave: "ate30", label: "≤ 30 dias", max: 30, color: "var(--red)" },
  { chave: "31a60", label: "31–60 dias", max: 60, color: "#c67f00" },
  { chave: "61a90", label: "61–90 dias", max: 90, color: PALETTE[2] }
] as const;

function ContratosAVencerChart({ stats }: { stats: GestaoDashboardStats }) {
  const hoje = hojeBrasiliaISO();
  const hojeMs = Date.parse(`${hoje}T12:00:00-03:00`);

  const comDiasRestantes = useMemo(
    () =>
      stats.contratosAVencer.map((c) => {
        const termMs = Date.parse(`${c.contratoTermino}T12:00:00-03:00`);
        const diasRestantes = Math.round((termMs - hojeMs) / 86_400_000);
        const faixa = diasRestantes <= 30 ? "ate30" : diasRestantes <= 60 ? "31a60" : "61a90";
        return { ...c, diasRestantes, faixa };
      }),
    [stats.contratosAVencer, hojeMs]
  );

  const [faixaSelecionada, setFaixaSelecionada] = useState<string | null>(null);

  const dataChart = FAIXAS_URGENCIA.map((f) => ({
    ...f,
    total: comDiasRestantes.filter((c) => c.faixa === f.chave).length
  }));

  const listaFaixa = faixaSelecionada
    ? comDiasRestantes
        .filter((c) => c.faixa === faixaSelecionada)
        .sort((a, b) => a.diasRestantes - b.diasRestantes)
    : [];

  const faixaInfo = FAIXAS_URGENCIA.find((f) => f.chave === faixaSelecionada);

  return (
    <DashboardPanel title="Contratos a Vencer (Estágio/Jovem Aprendiz — 90 dias)">
      {stats.contratosAVencer.length === 0 ? (
        <div
          style={{
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-400)",
            fontSize: 12.5
          }}
        >
          Nenhum contrato a vencer nos próximos 90 dias.
        </div>
      ) : (
        <>
          <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "-6px 0 12px" }}>
            Clique em uma faixa para ver os nomes e as datas.
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dataChart} layout="vertical" margin={{ left: 12, right: 20 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(122,30,38,0.08)"
                horizontal={false}
              />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={90} />
              <Tooltip formatter={(v) => [v, "Contratos"] as [number, string]} />
              <Bar
                dataKey="total"
                radius={[0, 4, 4, 0]}
                barSize={22}
                onClick={(entry: { chave?: string; payload?: { chave?: string } }) =>
                  setFaixaSelecionada(entry.payload?.chave ?? entry.chave ?? null)
                }
                style={{ cursor: "pointer" }}
              >
                {dataChart.map((f) => (
                  <Cell key={f.chave} fill={f.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      {faixaSelecionada && (
        <Modal
          eyebrow="Dashboard"
          title={`Contratos a vencer — ${faixaInfo?.label}`}
          onClose={() => setFaixaSelecionada(null)}
        >
          <div>
            {listaFaixa.map((c, i) => (
              <div
                key={`${c.matricula}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom:
                    i < listaFaixa.length - 1 ? "1px solid rgba(122,30,38,0.08)" : "none",
                  fontSize: 13
                }}
              >
                <span style={{ color: "var(--ink-800)", fontWeight: 600 }}>
                  {c.nome}{" "}
                  <span style={{ color: "var(--ink-500)", fontWeight: 400 }}>
                    ({categoriaFuncLabel(c.categoria)})
                  </span>
                </span>
                <span style={{ textAlign: "right", flexShrink: 0 }}>
                  <span
                    style={{
                      display: "block",
                      color: "var(--red)",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5
                    }}
                  >
                    {new Date(`${c.contratoTermino}T12:00:00`).toLocaleDateString("pt-BR")}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
                    em {c.diasRestantes} dia{c.diasRestantes === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </DashboardPanel>
  );
}

export function AlertasEventosTab({ stats }: { stats: GestaoDashboardStats }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AniversariantesChart stats={stats} />
      <ContratosAVencerChart stats={stats} />
    </div>
  );
}

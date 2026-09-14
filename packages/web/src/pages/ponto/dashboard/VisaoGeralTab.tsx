import React, { useState } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { DashboardPanel } from "../../../components/dashboard/DashboardPanel";
import { StatCard } from "../../../components/dashboard/StatCard";
import { StatGroup, StatDivider } from "../../../components/dashboard/StatGroup";
import { MiniDonut } from "../../../components/dashboard/MiniDonut";
import {
  EmployeeListModal,
  type EmployeeListItem
} from "../../../components/dashboard/EmployeeListModal";
import { CHART_PALETTE as PALETTE } from "../../../utils/chartPalette";
import { AlertCircleIcon, CrownIcon, UsersIcon } from "../../../components/icons";
import {
  categoriaFuncLabel,
  mesLabelDeChave,
  type GestaoDashboardStats,
  type DetalheFuncionario
} from "./types";
import type { ChartDatum, RechartsClickEntry } from "../../../components/dashboard/chartTypes";

function paraItens(funcs: DetalheFuncionario[]): EmployeeListItem[] {
  return funcs.map((f) => ({ nome: f.nome, matricula: f.matricula, extra: f.lotacao }));
}

function HorizontalBarChart({
  data,
  color = PALETTE[0],
  onItemClick
}: {
  data: ChartDatum[];
  color?: string;
  onItemClick?: (item: ChartDatum) => void;
}) {
  if (!data.length) {
    return (
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
        Sem dados suficientes.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 12, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11.5 }} width={150} interval={0} />
        <Tooltip />
        <Bar
          dataKey="value"
          fill={color}
          radius={[0, 4, 4, 0]}
          barSize={16}
          onClick={
            onItemClick
              ? (entry: unknown) => {
                  const e = entry as RechartsClickEntry<ChartDatum>;
                  onItemClick(e.payload ?? e);
                }
              : undefined
          }
          style={onItemClick ? { cursor: "pointer" } : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VisaoGeralTab({ stats }: { stats: GestaoDashboardStats }) {
  const [modal, setModal] = useState<{
    title: string;
    subtitle?: string;
    itens: EmployeeListItem[];
  } | null>(null);

  const semChefe = stats.chefesPorLotacao.filter((g) => !g.temChefe);

  function abrirPorCategoria(item: ChartDatum) {
    const chave = item.key ?? item.name;
    setModal({
      title: categoriaFuncLabel(chave),
      subtitle: "Distribuição por Categoria",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.categoria === chave))
    });
  }

  function abrirPorLotacao(item: ChartDatum) {
    setModal({
      title: item.name,
      subtitle: "Headcount por Lotação",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.lotacao === item.name))
    });
  }

  function abrirPorModalidade(item: ChartDatum) {
    const chave = item.key as DetalheFuncionario["modalidade"];
    setModal({
      title: item.name,
      subtitle: "Modalidade de Trabalho",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.modalidade === chave))
    });
  }

  function abrirPorRegistroPonto(isento: boolean) {
    setModal({
      title: isento ? "Isento" : "Obrigatório",
      subtitle: "Registro de Ponto",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.isentoRegistroPonto === isento))
    });
  }

  function abrirPorValeTransporte(recebe: boolean) {
    setModal({
      title: recebe ? "Recebe vale-transporte" : "Não recebe vale-transporte",
      subtitle: "Vale-transporte",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.valeTransporte === recebe))
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "nowrap", alignItems: "stretch" }}>
        <StatGroup>
          <StatCard label="Total" value={stats.totais.total} color="var(--burgundy-600)" />
          <StatCard label="Ativos" value={stats.totais.ativos} color="var(--green)" />
          <StatCard label="Inativos" value={stats.totais.inativos} color="var(--ink-500)" />
        </StatGroup>
        <StatDivider />
        <StatGroup>
          <StatCard label="Chefes" value={stats.totais.chefes} color="var(--burgundy-600)" />
          <StatCard
            label="Lotações sem chefe"
            value={semChefe.length}
            color={semChefe.length > 0 ? "#c67f00" : "var(--green)"}
          />
        </StatGroup>
        <StatDivider />
        <StatGroup>
          <StatCard
            label="Isentos de Ponto"
            value={stats.isencaoPonto.isento}
            sub={`de ${stats.totais.ativos} ativos`}
            color={PALETTE[3]}
            onClick={() => abrirPorRegistroPonto(true)}
          />
          <StatCard
            label="Recebem Vale-transporte"
            value={stats.valeTransporte.sim}
            sub={`de ${stats.totais.ativos} ativos`}
            color={PALETTE[2]}
            onClick={() => abrirPorValeTransporte(true)}
          />
        </StatGroup>
        <StatDivider />
        <StatGroup>
          <StatCard
            label="Total de Dependentes"
            value={stats.totalDependentes}
            color={PALETTE[4]}
          />
          <StatCard
            label="Dependentes / func."
            value={stats.dependentesMedia.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
            color={PALETTE[4]}
          />
        </StatGroup>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <DashboardPanel title="Distribuição por Categoria">
          <MiniDonut
            data={stats.porCategoria.map((c) => ({
              name: categoriaFuncLabel(c.chave),
              value: c.total,
              key: c.chave
            }))}
            onItemClick={abrirPorCategoria}
          />
        </DashboardPanel>
        <DashboardPanel title="Headcount por Lotação (top 10)">
          <HorizontalBarChart
            data={stats.porLotacao.map((l) => ({ name: l.nome, value: l.total }))}
            color={PALETTE[0]}
            onItemClick={abrirPorLotacao}
          />
        </DashboardPanel>
      </div>

      <DashboardPanel title="Admissões × Desligamentos — últimos 12 meses">
        {stats.admissoesDesligamentos.every((m) => !m.admissoes && !m.desligamentos) ? (
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
            Sem dados suficientes.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={stats.admissoesDesligamentos.map((m) => ({
                ...m,
                mes: mesLabelDeChave(m.chave)
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Area
                type="monotone"
                dataKey="admissoes"
                name="Admissões"
                stroke={PALETTE[2]}
                fill={PALETTE[2]}
                fillOpacity={0.2}
              />
              <Area
                type="monotone"
                dataKey="desligamentos"
                name="Desligamentos"
                stroke={PALETTE[7]}
                fill={PALETTE[7]}
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </DashboardPanel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <DashboardPanel title="Modalidade de Trabalho">
          <MiniDonut
            data={[
              { name: "Presencial", value: stats.porModalidade.presencial, key: "presencial" },
              { name: "Home Office", value: stats.porModalidade.homeOffice, key: "homeOffice" },
              { name: "Híbrido", value: stats.porModalidade.hibrido, key: "hibrido" }
            ]}
            onItemClick={abrirPorModalidade}
          />
        </DashboardPanel>
        <DashboardPanel title="Registro de Ponto">
          <MiniDonut
            data={[
              { name: "Obrigatório", value: stats.isencaoPonto.obrigatorio, key: "obrigatorio" },
              { name: "Isento", value: stats.isencaoPonto.isento, key: "isento" }
            ]}
            colors={[PALETTE[0], PALETTE[3]]}
            onItemClick={(item) => abrirPorRegistroPonto(item.key === "isento")}
          />
        </DashboardPanel>
        <DashboardPanel title="Vale-transporte">
          <MiniDonut
            data={[
              { name: "Recebe", value: stats.valeTransporte.sim, key: "sim" },
              { name: "Não recebe", value: stats.valeTransporte.nao, key: "nao" }
            ]}
            colors={[PALETTE[2], PALETTE[6]]}
            onItemClick={(item) => abrirPorValeTransporte(item.key === "sim")}
          />
        </DashboardPanel>
      </div>

      <DashboardPanel title="Cobertura de Chefes por Lotação">
        {semChefe.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--green)",
              fontSize: 12.5,
              padding: "20px 0",
              justifyContent: "center"
            }}
          >
            <CrownIcon size={16} />
            Todas as lotações têm chefe designado.
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "0 0 10px" }}>
              {semChefe.length} lotaç{semChefe.length === 1 ? "ão" : "ões"} sem chefe (
              <UsersIcon size={11} style={{ verticalAlign: "-1px" }} />) designado:
            </p>
            {semChefe.map((g) => (
              <div
                key={g.gerenciaId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  fontSize: 12.5,
                  color: "var(--ink-700)"
                }}
              >
                <AlertCircleIcon size={13} style={{ color: "#c67f00", flexShrink: 0 }} />
                {g.nome}
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>

      {modal && (
        <EmployeeListModal
          title={modal.title}
          subtitle={modal.subtitle}
          items={modal.itens}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

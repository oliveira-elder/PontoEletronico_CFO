import React, { useState } from "react";
import {
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
import { FuncionariosDetalheModal } from "../../../components/dashboard/FuncionariosDetalheModal";
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
import type { ChartDatum } from "../../../components/dashboard/chartTypes";

function paraItens(funcs: DetalheFuncionario[]): EmployeeListItem[] {
  return funcs.map((f) => ({ nome: f.nome, matricula: f.matricula, extra: f.lotacao }));
}

/** Headcount de TODOS os cargos ou lotações (busca, sem rolagem, em colunas); o item abre os funcionários. */
function HeadcountPanel({
  stats,
  onAbrir
}: {
  stats: GestaoDashboardStats;
  onAbrir: (dim: "cargo" | "lotacao", nome: string) => void;
}) {
  const [dim, setDim] = useState<"cargo" | "lotacao">("cargo");
  const [busca, setBusca] = useState("");
  const base = dim === "cargo" ? stats.porCargo : stats.porLotacao;
  const dados = base
    .filter((i) => i.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    .map((i) => ({ name: i.nome, value: i.total }));
  const maximo = Math.max(1, ...base.map((i) => i.total));
  const totalAtivos = Math.max(1, stats.totais.ativos);
  return (
    <DashboardPanel title={`Headcount por ${dim === "cargo" ? "Cargo" : "Lotação"} (todos)`}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {(["cargo", "lotacao"] as const).map((d) => (
          <button
            key={d}
            className={dim === d ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
            onClick={() => setDim(d)}
          >
            {d === "cargo" ? "Cargo" : "Lotação"}
          </button>
        ))}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar ${dim === "cargo" ? "cargo" : "lotação"}`}
          style={{
            flex: 1,
            minWidth: 120,
            height: 30,
            padding: "0 10px",
            border: "1px solid rgba(122,30,38,0.18)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5
          }}
        />
      </div>
      <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "0 0 6px" }}>
        {base.length} {dim === "cargo" ? "cargos" : "lotações"} · clique em um item para ver as
        pessoas
      </p>
      {dados.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-400)", textAlign: "center", padding: 24 }}>
          Nada encontrado.
        </p>
      ) : (
        <div style={{ columnWidth: 300, columnGap: 28 }}>
          {dados.map((d) => (
            <button
              key={d.name}
              onClick={() => onAbrir(dim, d.name)}
              title={`${d.name}: ${d.value} (${((d.value / totalAtivos) * 100).toFixed(1).replace(".", ",")}%)`}
              className="headcount-linha"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                padding: "6px 8px",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                breakInside: "avoid"
              }}
            >
              <span
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  fontSize: 12.5,
                  color: "var(--ink-800)"
                }}
              >
                <span>{d.name}</span>
                <strong style={{ flexShrink: 0 }}>{d.value}</strong>
              </span>
              <span
                style={{
                  display: "block",
                  height: 7,
                  marginTop: 4,
                  borderRadius: 4,
                  background: "rgba(122,30,38,0.08)"
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.max(2, (d.value / maximo) * 100)}%`,
                    borderRadius: 4,
                    background: PALETTE[0]
                  }}
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

export function VisaoGeralTab({ stats }: { stats: GestaoDashboardStats }) {
  const [modal, setModal] = useState<{
    title: string;
    subtitle?: string;
    itens: EmployeeListItem[];
  } | null>(null);

  const [detalhe, setDetalhe] = useState<{
    title: string;
    subtitle: string;
    funcs: DetalheFuncionario[];
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

  function abrirHeadcount(dim: "cargo" | "lotacao", nome: string) {
    const semCargo = "Sem cargo informado";
    setDetalhe({
      title: nome,
      subtitle: `Headcount por ${dim === "cargo" ? "Cargo" : "Lotação"}`,
      funcs: stats.detalheFuncionarios.filter((f) =>
        dim === "cargo" ? (f.cargo ?? semCargo) === nome : f.lotacao === nome
      )
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

      <div className="dashboard-grid-2">
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
      </div>

      <HeadcountPanel stats={stats} onAbrir={abrirHeadcount} />

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

      <div className="dashboard-grid-2">
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

      {detalhe && (
        <FuncionariosDetalheModal
          title={detalhe.title}
          subtitle={detalhe.subtitle}
          funcs={detalhe.funcs}
          onClose={() => setDetalhe(null)}
        />
      )}
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

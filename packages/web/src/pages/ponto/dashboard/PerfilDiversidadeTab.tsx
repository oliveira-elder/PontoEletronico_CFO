import React, { useState } from "react";
import { DashboardPanel } from "../../../components/dashboard/DashboardPanel";
import { MiniDonut } from "../../../components/dashboard/MiniDonut";
import { MiniBarChart } from "../../../components/dashboard/MiniBarChart";
import {
  EmployeeListModal,
  type EmployeeListItem
} from "../../../components/dashboard/EmployeeListModal";
import { CHART_PALETTE as PALETTE } from "../../../utils/chartPalette";
import { categoriaFuncLabel, type GestaoDashboardStats, type DetalheFuncionario } from "./types";
import type { ChartDatum } from "../../../components/dashboard/chartTypes";

function paraItens(funcs: DetalheFuncionario[]): EmployeeListItem[] {
  return funcs.map((f) => ({ nome: f.nome, matricula: f.matricula, extra: f.lotacao }));
}

export function PerfilDiversidadeTab({ stats }: { stats: GestaoDashboardStats }) {
  const [modal, setModal] = useState<{
    title: string;
    subtitle?: string;
    itens: EmployeeListItem[];
  } | null>(null);

  function abrirPorEscolaridade(item: ChartDatum) {
    const chave = item.key ?? item.name;
    setModal({
      title: chave,
      subtitle: "Escolaridade",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.escolaridades.includes(chave)))
    });
  }

  function abrirPorFaixaEtaria(item: ChartDatum) {
    const chave = item.key ?? item.name;
    setModal({
      title: chave,
      subtitle: "Faixa Etária",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.faixaEtaria === chave))
    });
  }

  function abrirPorGenero(item: ChartDatum) {
    setModal({
      title: item.name,
      subtitle: "Diversidade — Gênero",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.genero === item.name))
    });
  }

  function abrirPorRaca(item: ChartDatum) {
    setModal({
      title: item.name,
      subtitle: "Diversidade — Raça",
      itens: paraItens(stats.detalheFuncionarios.filter((f) => f.raca === item.name))
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <DashboardPanel title="Escolaridade (formações cadastradas)">
          <MiniBarChart
            data={stats.porEscolaridade.map((e) => ({
              name: e.chave,
              value: e.total,
              key: e.chave
            }))}
            color={PALETTE[1]}
            onItemClick={abrirPorEscolaridade}
          />
        </DashboardPanel>
        <DashboardPanel title="Faixa Etária">
          <MiniBarChart
            data={stats.faixaEtaria.map((f) => ({ name: f.chave, value: f.total, key: f.chave }))}
            color={PALETTE[4]}
            onItemClick={abrirPorFaixaEtaria}
          />
        </DashboardPanel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <DashboardPanel title="Diversidade — Gênero">
          <MiniDonut
            data={stats.porGenero.map((g) => ({ name: g.chave, value: g.total }))}
            onItemClick={abrirPorGenero}
          />
        </DashboardPanel>
        <DashboardPanel title="Diversidade — Raça">
          <MiniBarChart
            data={stats.porRaca.map((r) => ({ name: r.chave, value: r.total }))}
            color={PALETTE[6]}
            onItemClick={abrirPorRaca}
          />
        </DashboardPanel>
      </div>

      <DashboardPanel title="Tempo Médio de Casa por Categoria (anos)">
        <MiniBarChart
          data={stats.tenurePorCategoria.map((t) => ({
            name: categoriaFuncLabel(t.chave),
            value: t.mediaAnos
          }))}
          color={PALETTE[5]}
        />
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

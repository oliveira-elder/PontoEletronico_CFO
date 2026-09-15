import React, { useState } from "react";
import { CHART_PALETTE } from "../../../utils/chartPalette";
import { DashboardPanel } from "../../../components/dashboard/DashboardPanel";
import { MiniDonut } from "../../../components/dashboard/MiniDonut";
import { MiniBarChart } from "../../../components/dashboard/MiniBarChart";
import {
  RankingHorizontalChart,
  abbreviarNome
} from "../../../components/dashboard/RankingHorizontalChart";
import {
  LABEL_STATUS_SOLICITACAO,
  LABEL_TIPO_SOLICITACAO,
  LABEL_STATUS_ASSINATURA,
  type AuditoriaDashboardData
} from "./types";

export function SolicitacoesTab({ data }: { data: AuditoriaDashboardData }) {
  const [modoAbono, setModoAbono] = useState<"mais" | "menos">("mais");

  const rankingAbono =
    modoAbono === "mais" ? (data.topMaisAbonos ?? []) : (data.topMenosAbonos ?? []);
  const chartAbono = rankingAbono.map((r) => ({
    nome: abbreviarNome(r.nome),
    nomeCompleto: r.nome,
    quantidade: r.quantidade,
    label: String(r.quantidade)
  }));

  const donutSolicitacoesPorStatus = (data.solicitacoesPorStatus ?? []).map((s) => ({
    name: LABEL_STATUS_SOLICITACAO[s.status] ?? s.status,
    value: s.total
  }));
  const barSolicitacoesPorTipo = (data.solicitacoesPorTipo ?? []).map((s) => ({
    name: LABEL_TIPO_SOLICITACAO[s.tipo] ?? s.tipo,
    value: s.total
  }));
  const donutAssinaturaPorStatus = (data.assinaturaPorStatus ?? []).map((a) => ({
    name: LABEL_STATUS_ASSINATURA[a.status] ?? a.status,
    value: a.total
  }));
  const tempoAprovacao = data.tempoMedioAprovacao;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
            Top 10{" "}
            {modoAbono === "mais" ? "mais solicitações de abono" : "menos solicitações de abono"}
          </p>
          <button
            type="button"
            onClick={() => setModoAbono((m) => (m === "mais" ? "menos" : "mais"))}
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
            Ver {modoAbono === "mais" ? "menos solicitações" : "mais solicitações"}
          </button>
        </div>
        <div style={{ width: "100%", height: 280 }}>
          <RankingHorizontalChart
            chart={chartAbono}
            dataKey="quantidade"
            corPositiva="var(--red)"
            corNegativa="var(--green)"
            modoNegativo={modoAbono !== "mais"}
          />
        </div>
      </div>

      <div className="dashboard-grid-2">
        <DashboardPanel title="Solicitações por Status">
          <MiniDonut data={donutSolicitacoesPorStatus} />
        </DashboardPanel>
        <DashboardPanel title="Solicitações por Tipo">
          <MiniBarChart data={barSolicitacoesPorTipo} color={CHART_PALETTE[1]} />
        </DashboardPanel>
      </div>

      <div className="dashboard-grid-2">
        <DashboardPanel title="Tempo Médio de Aprovação por Etapa">
          {!tempoAprovacao ||
          (tempoAprovacao.amostraGestor === 0 && tempoAprovacao.amostraRh === 0) ? (
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
              Sem solicitações resolvidas no período.
            </div>
          ) : (
            <>
              <MiniBarChart
                data={[
                  {
                    name: `Gestor (${tempoAprovacao.amostraGestor})`,
                    value: tempoAprovacao.gestorHoras
                  },
                  { name: `RH (${tempoAprovacao.amostraRh})`, value: tempoAprovacao.rhHoras }
                ]}
                color={CHART_PALETTE[6]}
                height={190}
              />
              <p
                style={{
                  fontSize: 11,
                  color: "var(--ink-400)",
                  margin: "8px 0 0",
                  textAlign: "center"
                }}
              >
                Média em horas entre a criação/etapa anterior e a resolução de cada etapa.
              </p>
            </>
          )}
        </DashboardPanel>
        <DashboardPanel title="Assinatura do Quadro de Ponto">
          <MiniDonut
            data={donutAssinaturaPorStatus}
            colors={[CHART_PALETTE[3], CHART_PALETTE[1], CHART_PALETTE[2], CHART_PALETTE[7]]}
          />
        </DashboardPanel>
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import {
  ShieldCheckIcon,
  UsersIcon,
  GraduationCapIcon,
  BellIcon,
  ClockIcon,
  ActivityIcon,
  CalendarIcon,
  InboxIcon,
  RefreshCwIcon
} from "../../components/icons";
import { PainelDemandasTab } from "./dashboard/PainelDemandasTab";
import { VisaoGeralTab } from "./dashboard/VisaoGeralTab";
import { PerfilDiversidadeTab } from "./dashboard/PerfilDiversidadeTab";
import { AlertasEventosTab } from "./dashboard/AlertasEventosTab";
import { PontoFrequenciaTab } from "./dashboard/PontoFrequenciaTab";
import { AfastamentosTab } from "./dashboard/AfastamentosTab";
import { SolicitacoesTab } from "./dashboard/SolicitacoesTab";
import type { GestaoDashboardStats, AuditoriaDashboardData } from "./dashboard/types";
import { SemAcessoRh } from "../../components/SemAcessoRh";

type Categoria =
  | "painel"
  | "visao-geral"
  | "perfil-diversidade"
  | "alertas-eventos"
  | "ponto-frequencia"
  | "afastamentos"
  | "solicitacoes";

const CATEGORIAS: {
  id: Categoria;
  label: string;
  icon: React.ReactNode;
  fonte: "gestao" | "auditoria" | "tempo-real";
}[] = [
  {
    id: "painel",
    label: "Painel de Demandas",
    icon: <ActivityIcon size={14} />,
    fonte: "tempo-real"
  },
  {
    id: "visao-geral",
    label: "Visão Geral do Quadro",
    icon: <UsersIcon size={14} />,
    fonte: "gestao"
  },
  {
    id: "perfil-diversidade",
    label: "Perfil e Diversidade",
    icon: <GraduationCapIcon size={14} />,
    fonte: "gestao"
  },
  {
    id: "alertas-eventos",
    label: "Alertas e Eventos",
    icon: <BellIcon size={14} />,
    fonte: "gestao"
  },
  {
    id: "ponto-frequencia",
    label: "Ponto e Frequência",
    icon: <ClockIcon size={14} />,
    fonte: "auditoria"
  },
  {
    id: "afastamentos",
    label: "Afastamentos e Atestados",
    icon: <CalendarIcon size={14} />,
    fonte: "auditoria"
  },
  {
    id: "solicitacoes",
    label: "Solicitações e Aprovações",
    icon: <InboxIcon size={14} />,
    fonte: "auditoria"
  }
];

function isoBrasilia(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function InputField({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-500)"
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "7px 10px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.18)",
          fontSize: 12.5,
          fontFamily: "var(--font-body)",
          outline: "none",
          background: "#fff"
        }}
      />
    </label>
  );
}

function Loading() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Carregando…</div>
  );
}

function ErroBox({ msg }: { msg: string }) {
  return <div style={{ padding: 40, textAlign: "center", color: "var(--red)" }}>{msg}</div>;
}

export function DashboardConsolidadoPage() {
  const { user, token, hasRole, podeRh, permissoesRhCarregadas } = useAuth();
  const tk = token();
  const isRH =
    !!user?.isSuperAdmin ||
    hasRole("RH_AUDITORIA") ||
    hasRole("ponto-admin") ||
    hasRole("PONTO_ADMIN");

  const [categoria, setCategoria] = useState<Categoria>("painel");
  /* Perfil do RH: só as abas liberadas aparecem; os dados só são buscados se usados. */
  const categoriasPermitidas = CATEGORIAS.filter((c) => podeRh(`dashboard.${c.id}`));
  const usaGestao = categoriasPermitidas.some((c) =>
    ["visao-geral", "perfil-diversidade", "alertas-eventos"].includes(c.id)
  );
  const usaAuditoria = categoriasPermitidas.some((c) =>
    ["ponto-frequencia", "afastamentos", "solicitacoes"].includes(c.id)
  );
  useEffect(() => {
    if (categoriasPermitidas.length && !categoriasPermitidas.some((c) => c.id === categoria)) {
      setCategoria(categoriasPermitidas[0].id);
    }
  }, [categoriasPermitidas.map((c) => c.id).join(","), categoria]);

  const [gestaoStats, setGestaoStats] = useState<GestaoDashboardStats | null>(null);
  const [gestaoErro, setGestaoErro] = useState<string | null>(null);
  const [gestaoLoading, setGestaoLoading] = useState(true);

  const hoje = new Date();
  /* Período padrão: último mês (mesmo dia do mês anterior até hoje). */
  const umMesAtras = new Date(hoje);
  umMesAtras.setMonth(umMesAtras.getMonth() - 1);
  const [dataInicio, setDataInicio] = useState(isoBrasilia(umMesAtras));
  const [dataFim, setDataFim] = useState(isoBrasilia(hoje));
  const [auditoriaData, setAuditoriaData] = useState<AuditoriaDashboardData | null>(null);
  const [auditoriaErro, setAuditoriaErro] = useState<string | null>(null);
  const [auditoriaLoading, setAuditoriaLoading] = useState(true);

  const carregarGestao = useCallback(async () => {
    if (!tk || !usaGestao) return;
    setGestaoLoading(true);
    setGestaoErro(null);
    try {
      const res = await api.get<GestaoDashboardStats>("/ponto/gestao/dashboard", tk);
      setGestaoStats(res ?? null);
    } catch (e) {
      setGestaoErro((e as Error).message || "Não foi possível carregar os indicadores de Gestão.");
    } finally {
      setGestaoLoading(false);
    }
  }, [tk, usaGestao]);

  const carregarAuditoria = useCallback(async () => {
    if (!tk || !usaAuditoria) return;
    setAuditoriaLoading(true);
    setAuditoriaErro(null);
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.set("dataInicio", dataInicio);
      if (dataFim) params.set("dataFim", dataFim);
      const res = await api.get<AuditoriaDashboardData>(`/auditoria/dashboard?${params}`, tk);
      setAuditoriaData(res ?? null);
    } catch (e) {
      setAuditoriaErro(
        (e as Error).message || "Não foi possível carregar os indicadores de Auditoria."
      );
    } finally {
      setAuditoriaLoading(false);
    }
  }, [tk, dataInicio, dataFim, usaAuditoria]);

  useEffect(() => {
    void carregarGestao();
  }, [carregarGestao]);

  useEffect(() => {
    void carregarAuditoria();
  }, [carregarAuditoria]);

  if (isRH && permissoesRhCarregadas && categoriasPermitidas.length === 0) {
    return <SemAcessoRh pagina="Dashboard" />;
  }

  if (!isRH) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <ShieldCheckIcon
          size={40}
          style={{ color: "var(--burgundy-600)", margin: "0 auto 12px", display: "block" }}
        />
        <p style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-700)", margin: 0 }}>
          Acesso restrito
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6 }}>
          Esta área é exclusiva para o setor de Recursos Humanos e administradores do sistema.
        </p>
      </div>
    );
  }

  if (!tk) return <Loading />;

  const categoriaAtual = CATEGORIAS.find((c) => c.id === categoria)!;

  return (
    <div
      style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto", minWidth: 0, width: "100%" }}
    >
      <div style={{ marginBottom: 24 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          RH / Indicadores
        </p>
        <h1
          style={{
            fontSize: "clamp(22px,3vw,28px)",
            fontFamily: "var(--font-display)",
            lineHeight: 1.1,
            margin: 0
          }}
        >
          Dashboard <em>Consolidado</em>
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4, marginBottom: 0 }}>
          Indicadores de Gestão de Funcionários e Auditoria de Frequência, organizados por
          categoria.
        </p>
      </div>

      <div
        className="dashboard-categoria-nav"
        style={{
          marginBottom: 20,
          borderBottom: "2px solid rgba(122,30,38,0.08)"
        }}
      >
        {categoriasPermitidas.map((c) => (
          <button
            key={c.id}
            className="dashboard-categoria-nav-item"
            onClick={() => setCategoria(c.id)}
            style={{
              minWidth: 0,
              padding: "8px 6px",
              borderRadius: "var(--radius-md) var(--radius-md) 0 0",
              border: "none",
              background: categoria === c.id ? "var(--burgundy-600)" : "transparent",
              color: categoria === c.id ? "#fff" : "var(--ink-500)",
              fontWeight: 600,
              fontSize: 11.5,
              cursor: "pointer",
              transition: "all 150ms",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              textAlign: "center",
              lineHeight: 1.2
            }}
          >
            {c.icon}
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {categoriaAtual.fonte === "tempo-real" ? (
        <PainelDemandasTab token={tk} />
      ) : categoriaAtual.fonte === "gestao" ? (
        <>
          <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "-8px 0 16px" }}>
            Foto do momento atual — não é filtrado por período.
          </p>
          {gestaoLoading && !gestaoStats ? (
            <Loading />
          ) : gestaoErro && !gestaoStats ? (
            <ErroBox msg={gestaoErro} />
          ) : gestaoStats ? (
            <>
              {categoria === "visao-geral" && <VisaoGeralTab stats={gestaoStats} />}
              {categoria === "perfil-diversidade" && <PerfilDiversidadeTab stats={gestaoStats} />}
              {categoria === "alertas-eventos" && <AlertasEventosTab stats={gestaoStats} />}
            </>
          ) : null}
        </>
      ) : (
        <>
          <div
            style={{
              background: "#fff",
              borderRadius: "var(--radius-lg)",
              border: "1px solid rgba(122,30,38,0.08)",
              padding: "14px 16px",
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "flex-end",
              marginBottom: 20
            }}
          >
            <InputField
              label="Data início"
              type="date"
              value={dataInicio}
              onChange={setDataInicio}
            />
            <InputField label="Data fim" type="date" value={dataFim} onChange={setDataFim} />
            <button
              className="btn btn-primary"
              onClick={() => void carregarAuditoria()}
              style={{ padding: "7px 16px", fontSize: 12 }}
            >
              <RefreshCwIcon size={13} /> &nbsp;Atualizar
            </button>
            {auditoriaErro && (
              <span style={{ fontSize: 12, color: "#c8393f", alignSelf: "center" }}>
                {auditoriaErro}
              </span>
            )}
          </div>

          {auditoriaLoading && !auditoriaData ? (
            <Loading />
          ) : auditoriaErro && !auditoriaData ? (
            <ErroBox msg={auditoriaErro} />
          ) : auditoriaData ? (
            <>
              {categoria === "ponto-frequencia" && (
                <PontoFrequenciaTab data={auditoriaData} token={tk} />
              )}
              {categoria === "afastamentos" && <AfastamentosTab data={auditoriaData} />}
              {categoria === "solicitacoes" && <SolicitacoesTab data={auditoriaData} />}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

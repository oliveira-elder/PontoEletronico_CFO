import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../hooks/useApi";
import { useIsMobile } from "../../hooks/useIsMobile";
import { nomeArquivoRelatorioMes } from "../../utils/nomeArquivo";

/** Aba global de férias da Auditoria: controle geral por funcionário, do mais problemático ao melhor. */

type Gravidade =
  | "EM_DOBRO"
  | "VENCE_CRITICO"
  | "SEM_ADMISSAO"
  | "VENCE_EM_BREVE"
  | "NAO_PROGRAMADO"
  | "PARCIAL"
  | "FRACIONAMENTO_IRREGULAR"
  | "PROGRAMADO"
  | "EM_GOZO"
  | "EM_DIA";
type Status = "USUFRUIDO" | "PROGRAMADO" | "NAO_PROGRAMADO";

interface Ciclo {
  numero: number;
  inicio: string;
  fim: string;
  concessivoFim: string;
  vencido: boolean;
  concessivoEncerrado: boolean;
  anteriorAoControle: boolean;
  gozados: number;
  agendados: number;
  vendidos: number;
  naoProgramados: number;
  diasEmDobro: number;
  diasParaVencer: number | null;
  emAnalise: boolean;
  adiantamento13: boolean | null;
  gravidade: Gravidade;
}
interface Item {
  funcionarioId: string;
  nome: string;
  matricula: string | null;
  categoria: string;
  gerencia: string | null;
  gerenciaId: string | null;
  dataAdmissao: string | null;
  ciclos: Ciclo[];
  gozados: number;
  agendados: number;
  vendidos: number;
  naoProgramados: number;
  diasEmDobro: number;
  abono: boolean;
  adiantamento13: boolean | null;
  status: Status;
  gravidade: Gravidade;
  proximoVencimento: string | null;
  emGozoHoje: boolean;
  estagiario: boolean;
  docsPendentes?: number;
  docsVencidos?: number;
}
interface Painel {
  hoje: string;
  marcoInicial: string | null;
  resumo: Record<Gravidade | "total", number>;
  itens: Item[];
}

const GRAV: Record<Gravidade, { label: string; cor: string; bg: string; dica: string }> = {
  EM_DOBRO: {
    label: "Remuneração em dobro",
    cor: "#fff",
    bg: "#7f1d1d",
    dica: "Período concessivo encerrado sem gozo completo (CLT art. 137): remuneração em dobro dos dias não gozados."
  },
  VENCE_CRITICO: {
    label: "Vence em até 30 dias",
    cor: "#fff",
    bg: "#b91c1c",
    dica: "Concessivo termina em até 30 dias e há dias sem programar."
  },
  SEM_ADMISSAO: {
    label: "Sem data de admissão",
    cor: "#fff",
    bg: "#6d28d9",
    dica: "Pendência de cadastro: sem a admissão não é possível calcular os ciclos."
  },
  VENCE_EM_BREVE: {
    label: "Vence em até 90 dias",
    cor: "#92400e",
    bg: "#fde68a",
    dica: "Concessivo termina em até 90 dias e há dias sem programar."
  },
  NAO_PROGRAMADO: {
    label: "Vencida, não programada",
    cor: "#9a3412",
    bg: "#fed7aa",
    dica: "Período aquisitivo cumprido (direito adquirido) e nenhuma férias gozada ou agendada."
  },
  PARCIAL: {
    label: "Parcial",
    cor: "#92400e",
    bg: "#fef3c7",
    dica: "Parte dos dias foi gozada, vendida ou agendada; restam dias sem programar."
  },
  FRACIONAMENTO_IRREGULAR: {
    label: "Fracionamento irregular",
    cor: "#9a3412",
    bg: "#ffedd5",
    dica: "Férias aprovadas fora do art. 134 §1º: até 3 períodos, um de 14+ dias e os demais de 5+."
  },
  PROGRAMADO: {
    label: "Programada",
    cor: "#1a4f7a",
    bg: "#dbeafe",
    dica: "Todos os dias pendentes estão agendados."
  },
  EM_GOZO: {
    label: "Em gozo",
    cor: "#1a4f7a",
    bg: "#bfdbfe",
    dica: "Em férias hoje."
  },
  EM_DIA: {
    label: "Em dia",
    cor: "#166534",
    bg: "#dcfce7",
    dica: "Sem pendência: férias usufruídas ou ainda dentro do período aquisitivo."
  }
};
const ORDEM: Gravidade[] = [
  "EM_DOBRO",
  "VENCE_CRITICO",
  "VENCE_EM_BREVE",
  "NAO_PROGRAMADO",
  "PARCIAL",
  "FRACIONAMENTO_IRREGULAR",
  "PROGRAMADO",
  "EM_GOZO",
  "EM_DIA",
  "SEM_ADMISSAO"
];
const STATUS_LABEL: Record<Status, string> = {
  USUFRUIDO: "Usufruído",
  PROGRAMADO: "Programado",
  NAO_PROGRAMADO: "Não programado"
};
const CATEGORIA_LABEL: Record<string, string> = {
  CONCURSADO: "Efetivo",
  ASSESSOR: "Comissionado",
  ESTAGIARIO: "Estagiário",
  MENOR_APRENDIZ: "Jovem aprendiz"
};

/** Data civil AAAA-MM-DD → DD/MM/AAAA, sem deslocar fuso. */
const fmt = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
const sn = (v: boolean | null) => (v === null ? "—" : v ? "Sim" : "Não");

const input: React.CSSProperties = {
  height: 38,
  padding: "0 10px",
  border: "1px solid rgba(122,30,38,0.18)",
  background: "#fff",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  boxSizing: "border-box"
};

function Selo({ g }: { g: Gravidade }) {
  const s = GRAV[g];
  return (
    <span
      title={s.dica}
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        color: s.cor,
        background: s.bg,
        whiteSpace: "nowrap"
      }}
    >
      {s.label}
    </span>
  );
}

export function FeriasControlePage({ embutida = false }: { embutida?: boolean }) {
  const isMobile = useIsMobile(768);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [gerenciaId, setGerenciaId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [gravidade, setGravidade] = useState("");
  const [status, setStatus] = useState("");
  const [gerencias, setGerencias] = useState<
    Array<{ id: string; nome: string; sigla: string | null }>
  >([]);
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  /* Carrega o quadro completo UMA vez; busca, filtros e cartões filtram na hora, no navegador. */
  const carregar = useCallback(async () => {
    try {
      setPainel(await api.get<Painel>("/ponto/ferias-controle/painel"));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    api
      .get<Array<{ id: string; nome: string; sigla: string | null }>>("/ponto/gestao/gerencias")
      .then((g) => setGerencias(g ?? []))
      .catch(() => setGerencias([]));
  }, []);

  const itens = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (painel?.itens ?? []).filter(
      (i) =>
        (!gravidade || i.gravidade === gravidade) &&
        (!status || i.status === status) &&
        (!categoria || i.categoria === categoria) &&
        (!gerenciaId || i.gerenciaId === gerenciaId) &&
        (!b || i.nome.toLowerCase().includes(b) || (i.matricula ?? "").toLowerCase().includes(b))
    );
  }, [painel, busca, gravidade, status, categoria, gerenciaId]);

  function alternar(id: string) {
    const n = new Set(aberto);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setAberto(n);
  }

  function exportarCsv() {
    const linhas: (string | number)[][] = [
      [
        "Nome",
        "Matrícula",
        "Gerência",
        "Categoria",
        "Admissão",
        "Ciclo",
        "Aquisitivo início",
        "Aquisitivo fim",
        "Concessivo até",
        "Vencido",
        "Gozados",
        "Agendados",
        "Vendidos",
        "Dias sem programar",
        "Dias com remuneração em dobro",
        "Adiantamento 13º",
        "Situação do ciclo",
        "Status geral"
      ]
    ];
    for (const i of itens) {
      const base = [
        i.nome,
        i.matricula ?? "",
        i.gerencia ?? "",
        CATEGORIA_LABEL[i.categoria] ?? i.categoria,
        fmt(i.dataAdmissao)
      ];
      if (!i.ciclos.length) {
        linhas.push([
          ...base,
          "",
          "",
          "",
          "",
          "",
          i.gozados,
          i.agendados,
          i.vendidos,
          0,
          0,
          "",
          GRAV[i.gravidade].label,
          STATUS_LABEL[i.status]
        ]);
        continue;
      }
      for (const c of i.ciclos) {
        linhas.push([
          ...base,
          c.numero,
          fmt(c.inicio),
          fmt(c.fim),
          fmt(c.concessivoFim),
          c.vencido ? "Sim" : "Não",
          c.gozados,
          c.agendados,
          c.vendidos,
          c.vencido ? c.naoProgramados : 0,
          c.diasEmDobro,
          sn(c.adiantamento13),
          c.anteriorAoControle ? "Anterior ao controle" : GRAV[c.gravidade].label,
          STATUS_LABEL[i.status]
        ]);
      }
    }
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const [ano, mes] = (painel?.hoje ?? "").split("-").map(Number);
    a.download = nomeArquivoRelatorioMes(mes || 1, ano || new Date().getFullYear(), {
      prefixo: "Relatório controle de férias",
      extensao: "csv"
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const card = (g: Gravidade) => {
    const s = GRAV[g];
    const ativo = gravidade === g;
    return (
      <button
        key={g}
        title={s.dica}
        onClick={() => setGravidade(ativo ? "" : g)}
        style={{
          textAlign: "left",
          padding: "10px 14px",
          borderRadius: "var(--radius-lg)",
          border: `1px solid ${ativo ? s.bg : "rgba(122,30,38,0.10)"}`,
          boxShadow: ativo ? `0 0 0 2px ${s.bg}` : undefined,
          background: "#fff",
          cursor: "pointer"
        }}
      >
        <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)", textTransform: "uppercase" }}>
          {s.label}
        </p>
        <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--ink-900)" }}>
          {painel?.resumo[g] ?? 0}
        </p>
      </button>
    );
  };

  return (
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
      {!embutida && (
        <h1
          style={{
            fontSize: "clamp(22px,3vw,28px)",
            fontFamily: "var(--font-display)",
            lineHeight: 1.1,
            marginBottom: 6
          }}
        >
          Controle de <em>Férias</em>
        </h1>
      )}
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-500)" }}>
        Ciclos de 12 meses (período aquisitivo) seguidos de 12 meses para conceder as férias
        (período concessivo, CLT art. 130 e 134). Férias fora do concessivo são pagas em dobro (art.
        137). Venda de até 1/3 (10 dias) e adiantamento do 13º (Lei 4.749). Os mais problemáticos
        aparecem primeiro. Horário de Brasília
        {painel ? `, hoje ${fmt(painel.hoje)}` : ""}.
      </p>

      {erro && (
        <p style={{ color: "var(--red)", fontSize: 13 }}>
          ⚠ {erro}{" "}
          <button className="btn btn-ghost btn-sm" onClick={() => void carregar()}>
            Tentar novamente
          </button>
        </p>
      )}

      {painel && (
        <>
          {/* 10 cartões: duas linhas de 5 (celular: 2 por linha). */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${isMobile ? 2 : 5}, minmax(0, 1fr))`,
              gap: 10,
              marginBottom: 14
            }}
          >
            {ORDEM.map(card)}
          </div>
          {painel.marcoInicial && (
            <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--ink-500)" }}>
              Ciclos cujo concessivo terminou antes de {fmt(painel.marcoInicial)} (primeira
              solicitação de férias no sistema) não são avaliados, por falta de histórico. Não
              considera suspensão do aquisitivo por afastamento (art. 133) nem perda de dias por
              faltas (art. 130): revise esses casos manualmente.
            </p>
          )}
        </>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12
        }}
      >
        <input
          style={{ ...input, width: 240 }}
          placeholder="Buscar por nome ou matrícula"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select
          style={{ ...input, width: 200 }}
          value={gerenciaId}
          onChange={(e) => setGerenciaId(e.target.value)}
        >
          <option value="">Todas as gerências</option>
          {gerencias.map((g) => (
            <option key={g.id} value={g.id}>
              {g.sigla ?? g.nome}
            </option>
          ))}
        </select>
        <select
          style={{ ...input, width: 170 }}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          style={{ ...input, width: 170 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {(gravidade || status || categoria || gerenciaId || busca) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setGravidade("");
              setStatus("");
              setCategoria("");
              setGerenciaId("");
              setBusca("");
            }}
          >
            Limpar filtros
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={exportarCsv} disabled={!itens.length}>
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="card-flat" style={{ padding: 0, overflowX: "auto" }}>
        <table className="table-cfo table-cfo-destaque" style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th>Funcionário</th>
              <th>Gerência</th>
              <th>Admissão</th>
              <th>Ciclo em atenção</th>
              <th style={{ textAlign: "center" }}>Gozados</th>
              <th style={{ textAlign: "center" }}>Agendados</th>
              <th style={{ textAlign: "center" }}>Abono</th>
              <th style={{ textAlign: "center" }}>13º</th>
              <th>Status</th>
              <th>Documentos</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", color: "var(--ink-500)" }}>
                  {painel ? "Nenhum funcionário encontrado." : "Carregando…"}
                </td>
              </tr>
            )}
            {itens.map((i) => {
              /* Ciclo que mais pesa: o pior avaliado; sem pendência, o último ciclo vencido. */
              const foco =
                i.ciclos
                  .filter((c) => c.vencido && !c.anteriorAoControle)
                  .sort(
                    (a, b) =>
                      ORDEM.indexOf(a.gravidade) - ORDEM.indexOf(b.gravidade) || a.numero - b.numero
                  )[0] ?? i.ciclos[i.ciclos.length - 1];
              const exp = aberto.has(i.funcionarioId);
              return (
                <React.Fragment key={i.funcionarioId}>
                  <tr
                    onClick={() => alternar(i.funcionarioId)}
                    style={{ cursor: i.ciclos.length ? "pointer" : "default" }}
                  >
                    <td>
                      <strong>
                        {i.ciclos.length > 0 && (exp ? "▾ " : "▸ ")}
                        {i.nome}
                      </strong>
                      <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
                        {i.matricula ?? "—"} · {CATEGORIA_LABEL[i.categoria] ?? i.categoria}
                      </div>
                    </td>
                    <td>{i.gerencia ?? "—"}</td>
                    <td>{fmt(i.dataAdmissao)}</td>
                    <td>
                      {foco ? (
                        <>
                          <div>
                            Ciclo {foco.numero}: {fmt(foco.inicio)} a {fmt(foco.fim)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
                            {foco.vencido ? "Vencido" : "Em formação"} · concessivo até{" "}
                            {fmt(foco.concessivoFim)}
                            {foco.vencido && foco.diasParaVencer !== null
                              ? foco.diasParaVencer < 0
                                ? ` (venceu há ${-foco.diasParaVencer} dias)`
                                : ` (${foco.diasParaVencer} dias)`
                              : ""}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>{i.gozados}</td>
                    <td style={{ textAlign: "center" }}>{i.agendados}</td>
                    <td style={{ textAlign: "center" }}>
                      {i.abono ? `Sim (${i.vendidos}d)` : "Não"}
                    </td>
                    <td style={{ textAlign: "center" }}>{sn(i.adiantamento13)}</td>
                    <td>
                      {i.ciclos.length === 0 ? "—" : STATUS_LABEL[i.status]}
                      {i.diasEmDobro > 0 && (
                        <div style={{ fontSize: 11, color: "#7f1d1d", fontWeight: 700 }}>
                          {i.diasEmDobro} dias com remuneração em dobro
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                      {(i.docsVencidos ?? 0) > 0 ? (
                        <span style={{ color: "var(--red)", fontWeight: 700 }}>
                          {i.docsVencidos} vencido(s)
                        </span>
                      ) : (i.docsPendentes ?? 0) > 0 ? (
                        <span style={{ color: "#8a6a00", fontWeight: 600 }}>
                          {i.docsPendentes} p/ assinar
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-400)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <Selo g={i.gravidade} />
                    </td>
                  </tr>
                  {exp && (
                    <tr>
                      <td colSpan={11} style={{ background: "rgba(122,30,38,0.03)" }}>
                        <table style={{ width: "100%", fontSize: 12.5 }}>
                          <thead>
                            <tr style={{ textAlign: "left", color: "var(--ink-500)" }}>
                              <th>Ciclo</th>
                              <th>Aquisitivo</th>
                              <th>Concessivo até</th>
                              <th style={{ textAlign: "center" }}>Gozados</th>
                              <th style={{ textAlign: "center" }}>Agendados</th>
                              <th style={{ textAlign: "center" }}>Vendidos</th>
                              <th style={{ textAlign: "center" }}>Sem programar</th>
                              <th style={{ textAlign: "center" }}>13º</th>
                              <th>Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...i.ciclos].reverse().map((c) => (
                              <tr key={c.numero}>
                                <td>
                                  {c.numero}
                                  {c.emAnalise ? " · em análise" : ""}
                                </td>
                                <td>
                                  {fmt(c.inicio)} a {fmt(c.fim)} (
                                  {c.vencido ? "vencido" : "em formação"})
                                </td>
                                <td>{fmt(c.concessivoFim)}</td>
                                <td style={{ textAlign: "center" }}>{c.gozados}</td>
                                <td style={{ textAlign: "center" }}>{c.agendados}</td>
                                <td style={{ textAlign: "center" }}>{c.vendidos}</td>
                                <td style={{ textAlign: "center" }}>
                                  {c.vencido ? c.naoProgramados : "—"}
                                </td>
                                <td style={{ textAlign: "center" }}>{sn(c.adiantamento13)}</td>
                                <td>
                                  {c.anteriorAoControle ? (
                                    <span style={{ color: "var(--ink-500)" }}>
                                      Anterior ao controle
                                    </span>
                                  ) : (
                                    <Selo g={c.gravidade} />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 8 }}>
        {itens.length} funcionário(s). Alta Administração e inativos ficam fora do quadro.
        {itens.some((i) => i.estagiario)
          ? " Estagiários seguem o recesso da Lei 11.788 (sem venda de dias)."
          : ""}
      </p>
    </div>
  );
}

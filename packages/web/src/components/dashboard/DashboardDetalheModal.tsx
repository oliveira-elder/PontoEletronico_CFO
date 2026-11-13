import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";
import { api } from "../../hooks/useApi";

/** Qual gráfico/item foi clicado e o período filtrado (os mesmos do dashboard). */
export interface DetalheParams {
  tipo: string;
  chave?: string;
  hora?: string;
  dataInicio?: string;
  dataFim?: string;
}

interface Linha {
  funcionarioId: string | null;
  nome: string;
  matricula: string;
  gerencia: string;
  quando: string;
  detalhe: string;
  valor: string;
}
interface Resposta {
  titulo: string;
  colunas: { quando: string; detalhe: string; valor: string };
  total: number;
  truncado: boolean;
  periodo: { dataInicio: string; dataFim: string };
  linhas: Linha[];
}

type Coluna = "nome" | "matricula" | "gerencia" | "quando" | "detalhe" | "valor";

const simples = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtDia = (iso: string) => iso.split("-").reverse().join("/");

/** Estado + modal de detalhamento das abas de Auditoria (usa o período filtrado do dashboard). */
export function useDetalheDashboard(filtro?: { dataInicio: string; dataFim: string }) {
  const [sel, setSel] = useState<{ params: DetalheParams; titulo?: string } | null>(null);
  const inicio = filtro?.dataInicio;
  const fim = filtro?.dataFim;
  const abrir = useCallback(
    (tipo: string, chave?: string, titulo?: string, hora?: string) =>
      setSel({ params: { tipo, chave, hora, dataInicio: inicio, dataFim: fim }, titulo }),
    [inicio, fim]
  );
  const modal = sel ? (
    <DashboardDetalheModal
      params={sel.params}
      tituloFallback={sel.titulo}
      onClose={() => setSel(null)}
    />
  ) : null;
  return { abrir, modal };
}

/**
 * Modal único de detalhamento dos gráficos da Auditoria: busca a lista real por trás da barra, fatia ou ponto
 * clicado (`GET /auditoria/dashboard/detalhe`), com busca, ordenação e exportação CSV.
 */
export function DashboardDetalheModal({
  params,
  tituloFallback,
  onClose
}: {
  params: DetalheParams;
  tituloFallback?: string;
  onClose: () => void;
}) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, String(v));
    api
      .get<Resposta>(`/auditoria/dashboard/detalhe?${qs.toString()}`)
      .then((r) => vivo && setDados(r))
      .catch(
        (e: Error) => vivo && setErro(e.message || "Não foi possível carregar o detalhamento.")
      );
    return () => {
      vivo = false;
    };
  }, [params]);

  const col = dados?.colunas;
  const lista = useMemo(() => {
    if (!dados) return [];
    const termos = simples(busca).split(/\s+/).filter(Boolean);
    const filtrada = termos.length
      ? dados.linhas.filter((l) => {
          const texto = simples(
            [l.nome, l.matricula, l.gerencia, l.quando, l.detalhe, l.valor].join(" ")
          );
          return termos.every((t) => texto.includes(t));
        })
      : dados.linhas;
    if (!ordem) return filtrada;
    return [...filtrada].sort((a, b) => {
      const r = String(a[ordem.col]).localeCompare(String(b[ordem.col]), "pt-BR", {
        numeric: true
      });
      return (ordem.asc ? r : -r) || a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [dados, busca, ordem]);

  const th = (c: Coluna, rotulo: string) =>
    rotulo ? (
      <th
        onClick={() => setOrdem((o) => ({ col: c, asc: o?.col === c ? !o.asc : true }))}
        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
        title="Ordenar"
      >
        {rotulo}
        {ordem?.col === c ? (ordem.asc ? " ▲" : " ▼") : ""}
      </th>
    ) : null;

  function exportarCsv() {
    if (!dados || !col) return;
    const cab = ["Funcionário", "Matrícula", "Gerência", col.quando, col.detalhe, col.valor].filter(
      (c, i) => i < 3 || c
    );
    const linhas = lista.map((l) =>
      [l.nome, l.matricula, l.gerencia, l.quando, l.detalhe, l.valor].filter((_, i) =>
        i < 3 ? true : [col.quando, col.detalhe, col.valor][i - 3]
      )
    );
    const csv = [cab, ...linhas]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(dados.titulo || "detalhamento").replace(/[\\/:*?"<>|]+/g, " ")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Modal
      eyebrow="Dashboard"
      title={dados?.titulo ?? tituloFallback ?? "Detalhamento"}
      subtitle={
        dados
          ? `Período ${fmtDia(dados.periodo.dataInicio)} a ${fmtDia(dados.periodo.dataFim)}`
          : undefined
      }
      onClose={onClose}
      maxWidth={940}
    >
      {erro ? (
        <p style={{ fontSize: 13, color: "var(--red)" }}>⚠ {erro}</p>
      ) : !dados ? (
        <p style={{ fontSize: 13, color: "var(--ink-500)", padding: "20px 0" }}>Carregando…</p>
      ) : dados.linhas.length === 0 ? (
        <p
          style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: "24px 0" }}
        >
          Nenhum registro encontrado.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, matrícula, gerência ou detalhe"
              aria-label="Buscar na lista"
              style={{
                flex: 1,
                height: 36,
                padding: "0 10px",
                border: "1px solid rgba(122,30,38,0.18)",
                borderRadius: "var(--radius-md)",
                fontSize: 13
              }}
            />
            <span style={{ fontSize: 11.5, color: "var(--ink-500)", whiteSpace: "nowrap" }}>
              {lista.length === dados.linhas.length
                ? `${dados.linhas.length} registro${dados.linhas.length === 1 ? "" : "s"}`
                : `${lista.length} de ${dados.linhas.length}`}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={exportarCsv}>
              ⬇ CSV
            </button>
          </div>
          {dados.truncado && (
            <p style={{ margin: 0, fontSize: 11.5, color: "#92400e" }}>
              Lista limitada aos primeiros {dados.linhas.length} registros; refine o período.
            </p>
          )}
          <div style={{ overflow: "auto", maxHeight: "52vh" }}>
            <table className="table-cfo table-cfo-destaque" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  {th("nome", "Funcionário")}
                  {th("matricula", "Matrícula")}
                  {th("gerencia", "Gerência")}
                  {th("quando", col?.quando ?? "")}
                  {th("detalhe", col?.detalhe ?? "")}
                  {th("valor", col?.valor ?? "")}
                </tr>
              </thead>
              <tbody>
                {lista.map((l, i) => (
                  <tr key={`${l.funcionarioId}-${i}`}>
                    <td>
                      <strong>{l.nome}</strong>
                    </td>
                    <td>{l.matricula || "—"}</td>
                    <td>{l.gerencia || "—"}</td>
                    {col?.quando && <td style={{ whiteSpace: "nowrap" }}>{l.quando || "—"}</td>}
                    {col?.detalhe && <td>{l.detalhe || "—"}</td>}
                    {col?.valor && <td>{l.valor || "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

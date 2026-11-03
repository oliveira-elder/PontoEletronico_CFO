import React, { useMemo, useState } from "react";
import { Modal } from "../Modal";
import { categoriaFuncLabel } from "../../pages/ponto/dashboard/types";

export interface EmployeeListItem {
  nome: string;
  matricula?: string | null;
  /** Categoria funcional (enum, ex.: CONCURSADO); exibida pelo rótulo do sistema. */
  categoria?: string | null;
  extra?: string | null;
}

type Coluna = "nome" | "matricula" | "categoria" | "extra";

/** Sem acento e minúsculo: a busca ignora acentuação e caixa. */
const simples = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const rotuloCategoria = (c?: string | null) => (c ? categoriaFuncLabel(c) : "");

const valor = (it: EmployeeListItem, c: Coluna) =>
  c === "categoria" ? rotuloCategoria(it.categoria) : (it[c] ?? "");

/**
 * Modal "quem está nesta barra": quadro com cabeçalho (Funcionário, Matrícula, Categoria e uma
 * coluna de detalhe), ordenado pelo nome, com busca em todos os campos (todas as palavras digitadas
 * precisam aparecer, em qualquer coluna) e ordenação ao clicar no cabeçalho.
 */
export function EmployeeListModal({
  title,
  subtitle,
  items,
  onClose,
  rodape,
  vazio = "Nenhum funcionário encontrado.",
  colunaExtra = "Lotação"
}: {
  title: string;
  subtitle?: string;
  items: EmployeeListItem[];
  onClose: () => void;
  /** Conteúdo fixo no fim do modal (ex.: botão "Abrir tela"). */
  rodape?: React.ReactNode;
  vazio?: string;
  /** Título da última coluna (Lotação nos indicadores; Detalhe no painel de demandas). */
  colunaExtra?: string;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean }>({ col: "nome", asc: true });

  const lista = useMemo(() => {
    const termos = simples(busca).split(/\s+/).filter(Boolean);
    const filtrada = termos.length
      ? items.filter((it) => {
          const texto = simples(
            [it.nome, it.matricula, rotuloCategoria(it.categoria), it.extra]
              .filter(Boolean)
              .join(" ")
          );
          return termos.every((t) => texto.includes(t));
        })
      : items;
    return [...filtrada].sort((a, b) => {
      const r = valor(a, ordem.col).localeCompare(valor(b, ordem.col), "pt-BR", { numeric: true });
      return (ordem.asc ? r : -r) || a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [items, busca, ordem]);

  const th = (col: Coluna, rotulo: string) => (
    <th
      onClick={() => setOrdem((o) => ({ col, asc: o.col === col ? !o.asc : true }))}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      title="Ordenar"
    >
      {rotulo}
      {ordem.col === col ? (ordem.asc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <Modal eyebrow="Dashboard" title={title} subtitle={subtitle} onClose={onClose} maxWidth={860}>
      {items.length === 0 ? (
        <p
          style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: "24px 0" }}
        >
          {vazio}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, matrícula, categoria ou detalhe"
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
              {lista.length === items.length
                ? `${items.length} registro${items.length === 1 ? "" : "s"}`
                : `${lista.length} de ${items.length}`}
            </span>
          </div>
          {lista.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-400)",
                textAlign: "center",
                padding: "20px 0"
              }}
            >
              Nada encontrado para “{busca}”.
            </p>
          ) : (
            <div style={{ overflow: "auto", maxHeight: "52vh" }}>
              <table className="table-cfo table-cfo-destaque" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {th("nome", "Funcionário")}
                    {th("matricula", "Matrícula")}
                    {th("categoria", "Categoria")}
                    {th("extra", colunaExtra)}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((it, i) => (
                    <tr key={`${it.nome}-${i}`}>
                      <td>
                        <strong>{it.nome}</strong>
                      </td>
                      <td>{it.matricula || "—"}</td>
                      <td>{rotuloCategoria(it.categoria) || "—"}</td>
                      <td>{it.extra || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {rodape && (
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>{rodape}</div>
      )}
    </Modal>
  );
}

import React, { useMemo, useState } from "react";
import { Modal } from "../Modal";
import { categoriaFuncLabel, type DetalheFuncionario } from "../../pages/ponto/dashboard/types";

const MODALIDADE_LABEL: Record<DetalheFuncionario["modalidade"], string> = {
  presencial: "Presencial",
  homeOffice: "Home office",
  hibrido: "Híbrido"
};
const SITUACAO_LABEL: Record<DetalheFuncionario["situacaoHoje"], string> = {
  TRABALHANDO: "Em atividade",
  FERIAS: "Em férias",
  AFASTADO: "Afastado"
};

type Coluna = "nome" | "cargo" | "lotacao" | "categoria" | "modalidade" | "admissao" | "situacao";

function fmtData(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Tempo de casa em texto curto (ex.: "2 anos e 3 meses"). */
function tempoDeCasa(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  const hoje = new Date();
  let meses = (hoje.getFullYear() - a) * 12 + (hoje.getMonth() + 1 - m);
  if (hoje.getDate() < d) meses -= 1;
  if (meses < 1) return "menos de 1 mês";
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes = [];
  if (anos) partes.push(`${anos} ano${anos > 1 ? "s" : ""}`);
  if (resto) partes.push(`${resto} ${resto > 1 ? "meses" : "mês"}`);
  return partes.join(" e ");
}

const valorColuna = (f: DetalheFuncionario, c: Coluna): string =>
  ({
    nome: f.nome,
    cargo: f.cargo ?? "",
    lotacao: f.lotacao ?? "",
    categoria: categoriaFuncLabel(f.categoria),
    modalidade: MODALIDADE_LABEL[f.modalidade],
    admissao: f.dataAdmissao ?? "9999-12-31",
    situacao: SITUACAO_LABEL[f.situacaoHoje]
  })[c];

const chip: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 999,
  background: "var(--cream-50)",
  border: "1px solid rgba(122,30,38,0.10)",
  fontSize: 11.5,
  color: "var(--ink-700)"
};

/** Modal "quem está nesta barra" com os dados completos das pessoas (busca, ordenação e CSV). */
export function FuncionariosDetalheModal({
  title,
  subtitle,
  funcs,
  onClose
}: {
  title: string;
  subtitle?: string;
  funcs: DetalheFuncionario[];
  onClose: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean }>({ col: "nome", asc: true });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrada = q
      ? funcs.filter((f) =>
          [f.nome, f.matricula, f.cargo, f.lotacao].some((v) => (v ?? "").toLowerCase().includes(q))
        )
      : funcs;
    return [...filtrada].sort((a, b) => {
      const r = valorColuna(a, ordem.col).localeCompare(valorColuna(b, ordem.col), "pt-BR");
      return (ordem.asc ? r : -r) || a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [funcs, busca, ordem]);

  const resumo = useMemo(() => {
    const conta = (fn: (f: DetalheFuncionario) => string) => {
      const m = new Map<string, number>();
      for (const f of lista) m.set(fn(f), (m.get(fn(f)) ?? 0) + 1);
      return [...m.entries()].map(([k, n]) => `${k}: ${n}`);
    };
    return {
      categorias: conta((f) => categoriaFuncLabel(f.categoria)),
      modalidades: conta((f) => MODALIDADE_LABEL[f.modalidade]),
      chefes: lista.filter((f) => f.chefe).length,
      ausentes: lista.filter((f) => f.situacaoHoje !== "TRABALHANDO").length
    };
  }, [lista]);

  function exportarCsv() {
    const linhas = [
      ["Nome", "Matrícula", "Cargo", "Lotação", "Categoria", "Modalidade", "Admissão", "Situação"],
      ...lista.map((f) => [
        f.nome,
        f.matricula ?? "",
        f.cargo ?? "",
        f.lotacao ?? "",
        categoriaFuncLabel(f.categoria),
        MODALIDADE_LABEL[f.modalidade],
        fmtData(f.dataAdmissao),
        SITUACAO_LABEL[f.situacaoHoje]
      ])
    ];
    const csv = linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const th = (col: Coluna, rotulo: string) => (
    <th
      onClick={() => setOrdem((o) => ({ col, asc: o.col === col ? !o.asc : true }))}
      style={{ cursor: "pointer", userSelect: "none" }}
      title="Ordenar"
    >
      {rotulo}
      {ordem.col === col ? (ordem.asc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <Modal eyebrow="Dashboard" title={title} subtitle={subtitle} onClose={onClose} maxWidth={1000}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ ...chip, fontWeight: 700 }}>
            {lista.length} funcionário{lista.length === 1 ? "" : "s"}
          </span>
          {resumo.chefes > 0 && <span style={chip}>Chefes: {resumo.chefes}</span>}
          {resumo.ausentes > 0 && <span style={chip}>Ausentes hoje: {resumo.ausentes}</span>}
          {resumo.categorias.map((t) => (
            <span key={t} style={chip}>
              {t}
            </span>
          ))}
          {resumo.modalidades.map((t) => (
            <span key={t} style={chip}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, matrícula, cargo ou lotação"
            style={{
              flex: 1,
              height: 36,
              padding: "0 10px",
              border: "1px solid rgba(122,30,38,0.18)",
              borderRadius: "var(--radius-md)",
              fontSize: 13
            }}
          />
          <button className="btn btn-secondary btn-sm" onClick={exportarCsv}>
            ⬇ Exportar CSV
          </button>
        </div>
        {lista.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 24 }}>
            Nenhum funcionário encontrado.
          </p>
        ) : (
          <div style={{ overflow: "auto", maxHeight: "46vh" }}>
            <table className="table-cfo table-cfo-destaque" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  {th("nome", "Funcionário")}
                  {th("cargo", "Cargo")}
                  {th("lotacao", "Lotação")}
                  {th("categoria", "Categoria")}
                  {th("modalidade", "Modalidade")}
                  {th("admissao", "Admissão")}
                  {th("situacao", "Hoje")}
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <strong>{f.nome}</strong>
                      {f.chefe && (
                        <span
                          style={{ ...chip, marginLeft: 6, padding: "1px 7px", fontSize: 10.5 }}
                        >
                          Chefe
                        </span>
                      )}
                      <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
                        {f.matricula ?? "—"}
                      </div>
                    </td>
                    <td>{f.cargo ?? "—"}</td>
                    <td>{f.lotacao ?? "—"}</td>
                    <td>{categoriaFuncLabel(f.categoria)}</td>
                    <td>{MODALIDADE_LABEL[f.modalidade]}</td>
                    <td>
                      {fmtData(f.dataAdmissao)}
                      {f.dataAdmissao && (
                        <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
                          {tempoDeCasa(f.dataAdmissao)}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        color: f.situacaoHoje === "TRABALHANDO" ? "var(--ink-700)" : "#c67f00",
                        fontWeight: f.situacaoHoje === "TRABALHANDO" ? 400 : 700
                      }}
                    >
                      {SITUACAO_LABEL[f.situacaoHoje]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

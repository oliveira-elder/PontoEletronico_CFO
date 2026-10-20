import React, { useEffect, useMemo, useRef, useState } from "react";
import { MermaidDiagrama } from "./MermaidDiagrama";
import type {
  BancoDoc,
  CoberturaDoc,
  JobDoc,
  RotaDoc,
  StackDoc,
  TabelaDoc,
  VariavelDoc
} from "./tipos";

const COR_METODO: Record<string, string> = {
  GET: "#198754",
  POST: "#0d6efd",
  PUT: "#fd7e14",
  PATCH: "#6f42c1",
  DELETE: "#dc3545"
};

const CAMPO: React.CSSProperties = {
  padding: "6px 9px",
  border: "1px solid #ced4da",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  background: "#fff"
};

function Etiqueta({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        background: cor,
        color: "#fff",
        borderRadius: 4,
        padding: "1px 7px",
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </span>
  );
}

const rotuloAcesso = (r: RotaDoc) =>
  r.acesso === "publico"
    ? "Público (sem login)"
    : r.acesso === "papeis"
      ? r.papeis.join(", ")
      : "Qualquer usuário autenticado";

/* ───────────── APIs ───────────── */

export function VistaApis({
  rotas,
  compacto,
  foco
}: {
  rotas: RotaDoc[];
  compacto?: boolean;
  foco?: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [metodo, setMetodo] = useState("");
  const [acesso, setAcesso] = useState("");
  const [tabela, setTabela] = useState("");
  const [aberta, setAberta] = useState<string | null>(foco ?? null);
  const focoRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (foco) {
      setAberta(foco);
      setBusca("");
      setTimeout(() => focoRef.current?.scrollIntoView({ block: "center" }), 80);
    }
  }, [foco]);

  const tabelas = useMemo(
    () => [...new Set(rotas.flatMap((r) => [...r.tabelasLeitura, ...r.tabelasEscrita]))].sort(),
    [rotas]
  );
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rotas.filter((r) => {
      if (metodo && r.metodo !== metodo) return false;
      if (acesso && r.acesso !== acesso) return false;
      if (tabela && ![...r.tabelasLeitura, ...r.tabelasEscrita].includes(tabela)) return false;
      if (!q) return true;
      return `${r.metodo} ${r.caminho} ${r.titulo ?? ""} ${r.descricao ?? ""} ${r.controlador} ${r.papeis.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
  }, [rotas, busca, metodo, acesso, tabela]);

  const grupos = useMemo(() => {
    const m = new Map<string, RotaDoc[]>();
    for (const r of lista) m.set(r.controlador, [...(m.get(r.controlador) ?? []), r]);
    return [...m.entries()];
  }, [lista]);

  return (
    <div>
      {!compacto && (
        <div
          className="doc-nao-imprimir"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
        >
          <input
            style={{ ...CAMPO, flex: "1 1 240px" }}
            placeholder="Filtrar por caminho, descrição, controlador, papel…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select style={CAMPO} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="">Todos os métodos</option>
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select style={CAMPO} value={acesso} onChange={(e) => setAcesso(e.target.value)}>
            <option value="">Todo acesso</option>
            <option value="publico">Público</option>
            <option value="autenticado">Autenticado</option>
            <option value="papeis">Com papéis</option>
          </select>
          <select style={CAMPO} value={tabela} onChange={(e) => setTabela(e.target.value)}>
            <option value="">Qualquer tabela</option>
            {tabelas.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      )}
      <p style={{ fontSize: 12.5, color: "#6c757d", margin: "0 0 8px" }}>
        {lista.length} de {rotas.length} endpoints. “Lê/Grava” e “Consultas” são{" "}
        <b>inferidos do código</b> (análise das chamadas ao Prisma e SQL).
      </p>
      {grupos.map(([ctrl, itens]) => (
        <div key={ctrl} style={{ marginBottom: 18 }}>
          <h4 style={{ margin: "10px 0 6px" }}>{ctrl}</h4>
          <div className="doc-tabela">
            <table>
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Caminho</th>
                  <th>Descrição</th>
                  <th>Acesso</th>
                  <th>Lê</th>
                  <th>Grava</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((r) => {
                  const expandida = compacto || aberta === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        id={`rota-${r.id}`}
                        ref={r.id === foco ? focoRef : undefined}
                        onClick={() => !compacto && setAberta(aberta === r.id ? null : r.id)}
                        style={{
                          cursor: compacto ? undefined : "pointer",
                          background: aberta === r.id ? "#f1f5ff" : undefined
                        }}
                      >
                        <td>
                          <Etiqueta cor={COR_METODO[r.metodo] ?? "#6c757d"}>{r.metodo}</Etiqueta>
                        </td>
                        <td>
                          <code>{r.caminho}</code>
                        </td>
                        <td>{r.titulo ?? <i style={{ color: "#adb5bd" }}>sem descrição</i>}</td>
                        <td style={{ fontSize: 12.5 }}>
                          {r.acesso === "publico" ? (
                            <Etiqueta cor="#dc3545">Público</Etiqueta>
                          ) : (
                            rotuloAcesso(r)
                          )}
                          {r.recursosRh.length > 0 && (
                            <div style={{ color: "#6c757d" }}>RH: {r.recursosRh.join(", ")}</div>
                          )}
                        </td>
                        <td style={{ fontSize: 12.5 }}>{r.tabelasLeitura.join(", ")}</td>
                        <td style={{ fontSize: 12.5 }}>{r.tabelasEscrita.join(", ")}</td>
                      </tr>
                      {expandida && !compacto && (
                        <tr>
                          <td colSpan={6} style={{ background: "#f8f9fa", fontSize: 13 }}>
                            {r.descricao && <p style={{ margin: "4px 0 8px" }}>{r.descricao}</p>}
                            <div>
                              <b>Implementação:</b> {r.controlador}.{r.funcao} ({r.modulo})
                            </div>
                            <div>
                              <b>Guardas:</b>{" "}
                              {r.guardas.length
                                ? r.guardas.join(" → ")
                                : "nenhuma (rota sem login)"}
                            </div>
                            {r.statusHttp && (
                              <div>
                                <b>Status de sucesso:</b> {r.statusHttp}
                              </div>
                            )}
                            {r.parametros.length > 0 && (
                              <div>
                                <b>Entrada:</b>{" "}
                                {r.parametros
                                  .map(
                                    (p) =>
                                      `${p.origem}${p.nome ? `:${p.nome}` : ""}${p.tipo ? ` (${p.tipo})` : ""}`
                                  )
                                  .join(" · ")}
                              </div>
                            )}
                            {r.consultas.length > 0 && (
                              <div>
                                <b>Consultas inferidas:</b> {r.consultas.join(" · ")}
                                {r.sqlCru ? " · usa SQL cru" : ""}
                              </div>
                            )}
                            {r.categoria && (
                              <div>
                                <b>Categoria:</b> {r.categoria}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Banco ───────────── */

export function VistaBanco({
  dados,
  vista,
  compacto,
  foco
}: {
  dados: BancoDoc;
  vista: "der" | "dicionario";
  compacto?: boolean;
  foco?: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [dominio, setDominio] = useState("");
  const [aberta, setAberta] = useState<string | null>(foco ?? null);
  const focoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (foco) {
      setAberta(foco);
      setBusca("");
      setDominio("");
      setTimeout(() => focoRef.current?.scrollIntoView({ block: "start" }), 80);
    }
  }, [foco]);

  if (vista === "der") {
    return (
      <div>
        <p style={{ fontSize: 13 }}>
          {dados.totais.tabelas} tabelas · {dados.totais.enums} enums · {dados.totais.relacoes}{" "}
          relações. Notação: <code>PK</code> chave primária · <code>FK</code> chave estrangeira ·{" "}
          <code>UK</code> único. Relações: <code>||--o{"{"}</code> um-para-muitos ·{" "}
          <code>||--o|</code> um-para-um.
        </p>
        <h3>Visão geral (entidades e relações)</h3>
        <MermaidDiagrama codigo={dados.geral} titulo="der-geral" compacto={compacto} />
        {dados.dominios.map((d) => (
          <div key={d.id}>
            <h3>{d.titulo}</h3>
            <p style={{ margin: "0 0 4px" }}>{d.descricao}</p>
            <MermaidDiagrama codigo={d.mermaid} titulo={`der-${d.id}`} compacto={compacto} />
          </div>
        ))}
      </div>
    );
  }

  const q = busca.trim().toLowerCase();
  const tabelas = dados.tabelas.filter((t) => {
    if (dominio && !t.dominios.includes(dominio)) return false;
    if (!q) return true;
    return (
      t.nome.toLowerCase().includes(q) ||
      (t.descricao ?? "").toLowerCase().includes(q) ||
      t.campos.some((c) => c.nome.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      {!compacto && (
        <div
          className="doc-nao-imprimir"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
        >
          <input
            style={{ ...CAMPO, flex: "1 1 260px" }}
            placeholder="Buscar tabela, descrição ou campo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select style={CAMPO} value={dominio} onChange={(e) => setDominio(e.target.value)}>
            <option value="">Todos os domínios</option>
            {dados.dominios.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo}
              </option>
            ))}
          </select>
        </div>
      )}
      {tabelas.map((t) => (
        <FichaTabela
          key={t.nome}
          t={t}
          aberta={compacto || aberta === t.nome}
          compacto={compacto}
          onAlternar={() => setAberta(aberta === t.nome ? null : t.nome)}
          refFoco={t.nome === foco ? focoRef : undefined}
        />
      ))}
      <h3>Enums</h3>
      <div className="doc-tabela">
        <table>
          <thead>
            <tr>
              <th>Enum</th>
              <th>Valores</th>
            </tr>
          </thead>
          <tbody>
            {dados.enums.map((e) => (
              <tr key={e.nome}>
                <td>
                  <code>{e.nome}</code>
                </td>
                <td style={{ fontSize: 12.5 }}>{e.valores.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FichaTabela({
  t,
  aberta,
  compacto,
  onAlternar,
  refFoco
}: {
  t: TabelaDoc;
  aberta: boolean;
  compacto?: boolean;
  onAlternar: () => void;
  refFoco?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={refFoco}
      id={`tabela-${t.nome}`}
      style={{ border: "1px solid #dee2e6", borderRadius: 8, marginBottom: 8 }}
    >
      <div
        onClick={compacto ? undefined : onAlternar}
        style={{
          padding: "8px 12px",
          cursor: compacto ? undefined : "pointer",
          display: "flex",
          gap: 10,
          alignItems: "baseline"
        }}
      >
        <b style={{ fontSize: 14.5 }}>{t.nome}</b>
        <span style={{ fontSize: 12.5, color: "#6c757d", flex: 1 }}>
          {t.descricao ?? "sem descrição"}
        </span>
        <span style={{ fontSize: 12, color: "#6c757d" }}>{t.campos.length} campos</span>
      </div>
      {aberta && (
        <div style={{ padding: "0 12px 10px" }}>
          <div className="doc-tabela">
            <table>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Tipo</th>
                  <th>Obrig.</th>
                  <th>Chave</th>
                  <th>Padrão</th>
                  <th>Referência / observação</th>
                </tr>
              </thead>
              <tbody>
                {t.campos.map((c) => (
                  <tr key={c.nome}>
                    <td>
                      <code>{c.nome}</code>
                    </td>
                    <td>
                      {c.tipo}
                      {c.lista ? "[]" : ""}
                    </td>
                    <td>{c.obrigatorio ? "sim" : "não"}</td>
                    <td>{c.chave.join(", ")}</td>
                    <td style={{ fontSize: 12 }}>{c.padrao ?? ""}</td>
                    <td style={{ fontSize: 12.5 }}>{c.referencia ?? c.descricao ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.indices.length > 0 && (
            <p style={{ fontSize: 12.5, margin: "6px 0 0" }}>
              <b>Índices:</b>{" "}
              {t.indices.map((i) => `${i.tipo} (${i.campos.join(", ")})`).join(" · ")}
            </p>
          )}
          {t.relacoes.length > 0 && (
            <p style={{ fontSize: 12.5, margin: "4px 0 0" }}>
              <b>Relações:</b>{" "}
              {t.relacoes.map((r) => `${r.campo} → ${r.para}${r.lista ? "[]" : ""}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Stack, jobs, ambiente, cobertura ───────────── */

export function VistaStack({ dados }: { dados: StackDoc }) {
  return (
    <div>
      <p style={{ fontSize: 13 }}>
        Node <b>{dados.node}</b> · Prisma <b>{dados.prisma ?? "—"}</b> · Sistema{" "}
        <b>{dados.sistema ?? "—"}</b>
      </p>
      <h3>Serviços (Docker Compose)</h3>
      <div className="doc-tabela">
        <table>
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Imagem</th>
              <th>Portas / expõe</th>
              <th>Volumes</th>
              <th>Depende de</th>
            </tr>
          </thead>
          <tbody>
            {dados.servicos.map((s) => (
              <tr key={s.nome}>
                <td>
                  <b>{s.nome}</b>
                  {s.perfis.length > 0 && (
                    <div style={{ fontSize: 11.5, color: "#6c757d" }}>
                      perfil {s.perfis.join(", ")}
                    </div>
                  )}
                </td>
                <td>{s.imagem ?? (s.construido ? "build local" : "—")}</td>
                <td style={{ fontSize: 12.5 }}>{[...s.portas, ...s.expoe].join(", ")}</td>
                <td style={{ fontSize: 12 }}>{s.volumes.join(", ")}</td>
                <td>{s.dependeDe.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dados.pacotes.map((p) => (
        <div key={p.pacote}>
          <h3>
            {p.pacote} <small style={{ color: "#6c757d" }}>{p.versao}</small>
          </h3>
          <div className="doc-tabela">
            <table>
              <thead>
                <tr>
                  <th>Dependência</th>
                  <th>Faixa</th>
                  <th>Instalada</th>
                </tr>
              </thead>
              <tbody>
                {p.dependencias.map((d) => (
                  <tr key={d.nome}>
                    <td>{d.nome}</td>
                    <td>{d.faixa}</td>
                    <td>{d.instalada ?? "—"}</td>
                  </tr>
                ))}
                {p.desenvolvimento.map((d) => (
                  <tr key={`dev-${d.nome}`} style={{ color: "#6c757d" }}>
                    <td>{d.nome} (dev)</td>
                    <td>{d.faixa}</td>
                    <td>{d.instalada ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function VistaJobs({ jobs }: { jobs: JobDoc[] }) {
  return (
    <div className="doc-tabela">
      <table>
        <thead>
          <tr>
            <th>Classe</th>
            <th>Método</th>
            <th>Agenda (cron)</th>
            <th>Fuso</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={`${j.classe}.${j.metodo}`}>
              <td>{j.classe}</td>
              <td>
                <code>{j.metodo}</code>
              </td>
              <td>
                <code>{j.agenda}</code>
              </td>
              <td>{j.fusoHorario ?? "servidor"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VistaAmbiente({ variaveis }: { variaveis: VariavelDoc[] }) {
  return (
    <div className="doc-tabela">
      <table>
        <thead>
          <tr>
            <th>Variável</th>
            <th>Função</th>
            <th>Obrigatória</th>
            <th>Usada em</th>
          </tr>
        </thead>
        <tbody>
          {variaveis.map((v) => (
            <tr key={v.nome}>
              <td>
                <code>{v.nome}</code>
              </td>
              <td>{v.funcao ?? <i style={{ color: "#adb5bd" }}>sem descrição</i>}</td>
              <td>{v.obrigatoria === null ? "—" : v.obrigatoria ? "sim" : "não"}</td>
              <td style={{ fontSize: 12 }}>{v.usadaEm.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VistaCobertura({ dados }: { dados: CoberturaDoc }) {
  const item = (rotulo: string, lista: string[]) => (
    <tr>
      <td>{rotulo}</td>
      <td>
        {lista.length === 0 ? (
          <span style={{ color: "#198754" }}>nenhuma pendência</span>
        ) : (
          lista.join(", ")
        )}
      </td>
    </tr>
  );
  return (
    <div>
      <p style={{ fontSize: 13 }}>
        {dados.secoes} seções · {dados.rotas} endpoints · {dados.tabelas} tabelas —{" "}
        <b style={{ color: dados.ok ? "#198754" : "#dc3545" }}>
          {dados.ok ? "cobertura completa" : "há pendências"}
        </b>
      </p>
      <div className="doc-tabela">
        <table>
          <tbody>
            {item("Seções do índice sem arquivo", dados.secoesSemArquivo)}
            {item("Endpoints sem descrição no catálogo", dados.rotasSemDescricao)}
            {item("Tabelas sem domínio", dados.tabelasSemDominio)}
            {item("Tabelas sem descrição", dados.tabelasSemDescricao)}
            {item("Variáveis de ambiente sem descrição", dados.variaveisSemDescricao)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

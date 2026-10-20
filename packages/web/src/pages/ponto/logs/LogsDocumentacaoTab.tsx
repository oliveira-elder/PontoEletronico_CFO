import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../../hooks/useApi";
import { DocumentacaoLeitor } from "../../../components/documentacao/DocumentacaoLeitor";

interface Autoria {
  autor: string;
  dataEntrega: string;
  local: string;
  gerenteResponsavel: string;
  solicitacao: string;
  versaoAtual: string;
  atualizadoPorNome: string | null;
}

interface Revisao {
  id: string;
  versao: string;
  tipo: "MANUAL" | "AUTOMATICA";
  desenvolvedor: string;
  revisor: string | null;
  dataRevisao: string;
  comentario: string;
  local: string | null;
  equipe: string | null;
  secoesAfetadas: string | null;
  anuladaEm: string | null;
  motivoAnulacao: string | null;
  anuladaPorNome: string | null;
}

const AZUL = "#0d6efd";
const br = (d: string) => d.split("-").reverse().join("/");
const hoje = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

const CELULA: React.CSSProperties = {
  padding: "9px 10px",
  borderRight: "1px solid #dee2e6",
  verticalAlign: "top",
  fontSize: 13.5
};
const CAMPO: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid #ced4da",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
  fontFamily: "inherit"
};

const VAZIA = {
  tipoVersao: "CORRECAO" as "MAIOR" | "MENOR" | "CORRECAO",
  desenvolvedor: "",
  revisor: "",
  dataRevisao: hoje(),
  comentario: "",
  local: "",
  equipe: "",
  secoesAfetadas: ""
};

/** Logs → Documentação: cabeçalho "Autoria e Revisões" (gravado no servidor) e controle de versões. */
export function LogsDocumentacaoTab({ onVoltar }: { onVoltar: () => void }) {
  const [autoria, setAutoria] = useState<Autoria | null>(null);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Autoria | null>(null);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [nova, setNova] = useState<typeof VAZIA | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([
        api.get<Autoria>("/logs/documentacao/autoria"),
        api.get<Revisao[]>("/logs/documentacao/revisoes")
      ]);
      setAutoria(a);
      setRevisoes(r);
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, texto: ok });
      await carregar();
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  const salvarAutoria = () =>
    rascunho &&
    executar(async () => {
      await api.put("/logs/documentacao/autoria", {
        autor: rascunho.autor,
        dataEntrega: rascunho.dataEntrega,
        local: rascunho.local,
        gerenteResponsavel: rascunho.gerenteResponsavel,
        solicitacao: rascunho.solicitacao
      });
      setEditando(false);
    }, "Autoria salva (a alteração ficou registrada nas revisões).");

  const salvarRevisao = () =>
    nova &&
    executar(async () => {
      await api.post("/logs/documentacao/revisoes", nova);
      setNova(null);
    }, "Revisão registrada e versão atualizada.");

  const anular = (r: Revisao) => {
    const motivo = window.prompt(
      `Anular a revisão ${r.versao}? A linha continua na trilha, riscada. Informe o motivo:`
    );
    if (!motivo) return;
    void executar(
      () => api.post(`/logs/documentacao/revisoes/${r.id}/anular`, { motivo }),
      "Revisão anulada."
    );
  };

  const linhaAutoria = (rotulo: string, valor: React.ReactNode) => (
    <div style={{ display: "flex", gap: 16, padding: "5px 0", fontSize: 14.5 }}>
      <strong style={{ width: 230, flexShrink: 0 }}>{rotulo}</strong>
      <span style={{ flex: 1, minWidth: 0 }}>{valor}</span>
    </div>
  );

  return (
    <div>
      {/* Título + Voltar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 28,
            color: "#495057",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke={AZUL}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
            <line x1="14" y1="4" x2="10" y2="20" />
          </svg>
          Documentação Técnica
        </h2>
        <button
          type="button"
          onClick={onVoltar}
          style={{
            background: "#6c757d",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            cursor: "pointer",
            fontSize: 13
          }}
        >
          ← Voltar
        </button>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #dee2e6",
          borderRadius: 8,
          padding: "18px 24px"
        }}
      >
        <h3
          style={{
            margin: "0 0 16px",
            fontSize: 19,
            color: AZUL,
            borderBottom: `2px solid ${AZUL}`,
            paddingBottom: 10,
            fontWeight: 500
          }}
        >
          Autoria e Revisões
        </h3>

        {msg && (
          <div
            role="status"
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 13,
              background: msg.ok ? "#d1e7dd" : "#f8d7da",
              color: msg.ok ? "#0f5132" : "#842029"
            }}
          >
            {msg.texto}
          </div>
        )}

        {/* Autoria do Desenvolvimento */}
        {autoria && (
          <div
            style={{
              background: "#e0f7fc",
              borderLeft: "4px solid #0dcaf0",
              padding: "14px 20px",
              borderRadius: 4
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 15, color: "#495057" }}>Autoria do Desenvolvimento</strong>
              {!editando ? (
                <button
                  type="button"
                  onClick={() => {
                    setRascunho(autoria);
                    setEditando(true);
                  }}
                  style={{
                    background: "#fff",
                    border: "1px solid #6c757d",
                    borderRadius: 6,
                    padding: "3px 12px",
                    cursor: "pointer",
                    fontSize: 12.5
                  }}
                >
                  Editar
                </button>
              ) : (
                <span style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => void salvarAutoria()}
                    style={{
                      background: "#198754",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 14px",
                      cursor: "pointer",
                      fontSize: 12.5
                    }}
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(false)}
                    style={{
                      background: "#fff",
                      border: "1px solid #6c757d",
                      borderRadius: 6,
                      padding: "3px 12px",
                      cursor: "pointer",
                      fontSize: 12.5
                    }}
                  >
                    Cancelar
                  </button>
                </span>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              {editando && rascunho ? (
                <>
                  {linhaAutoria(
                    "Autor:",
                    <input
                      style={CAMPO}
                      value={rascunho.autor}
                      onChange={(e) => setRascunho({ ...rascunho, autor: e.target.value })}
                    />
                  )}
                  {linhaAutoria(
                    "Data de Entrega:",
                    <input
                      type="date"
                      style={{ ...CAMPO, width: 180 }}
                      value={rascunho.dataEntrega}
                      onChange={(e) => setRascunho({ ...rascunho, dataEntrega: e.target.value })}
                    />
                  )}
                  {linhaAutoria(
                    "Local de Desenvolvimento:",
                    <input
                      style={CAMPO}
                      value={rascunho.local}
                      onChange={(e) => setRascunho({ ...rascunho, local: e.target.value })}
                    />
                  )}
                  {linhaAutoria(
                    "Gerente responsável:",
                    <input
                      style={CAMPO}
                      value={rascunho.gerenteResponsavel}
                      onChange={(e) =>
                        setRascunho({ ...rascunho, gerenteResponsavel: e.target.value })
                      }
                    />
                  )}
                  {linhaAutoria(
                    "Solicitação de desenvolvimento:",
                    <textarea
                      rows={3}
                      style={CAMPO}
                      value={rascunho.solicitacao}
                      onChange={(e) => setRascunho({ ...rascunho, solicitacao: e.target.value })}
                    />
                  )}
                </>
              ) : (
                <>
                  {linhaAutoria("Autor:", autoria.autor)}
                  {linhaAutoria("Data de Entrega:", br(autoria.dataEntrega))}
                  {linhaAutoria("Local de Desenvolvimento:", autoria.local)}
                  {linhaAutoria("Gerente responsável:", autoria.gerenteResponsavel)}
                  {linhaAutoria("Solicitação de desenvolvimento:", autoria.solicitacao)}
                  {linhaAutoria(
                    "Versão da documentação:",
                    <strong style={{ color: AZUL }}>{autoria.versaoAtual}</strong>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <p style={{ fontSize: 12.5, color: "#6c757d", margin: "16px 0 10px" }}>
          Cada revisão é gravada no servidor e sai nos registros (tela, impressão e exportação).
          Revisões não são excluídas: use <strong>Anular</strong>, que mantém a linha riscada com o
          motivo. Alterações automáticas do sistema também aparecem aqui.
        </p>

        <div style={{ overflowX: "auto", border: "1px solid #dee2e6", borderRadius: 4 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr
                style={{ background: "#fff", borderBottom: "1px solid #dee2e6", textAlign: "left" }}
              >
                {[
                  "Versão",
                  "Desenvolvedor",
                  "Revisor",
                  "Data da revisão",
                  "Comentário (o que foi feito)",
                  "Local de desenvolvimento",
                  "Equipe de desenvolvimento",
                  "Ações"
                ].map((h) => (
                  <th key={h} style={{ ...CELULA, fontWeight: 700, fontSize: 13.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nova && (
                <tr style={{ background: "#fffbe6", borderBottom: "1px solid #dee2e6" }}>
                  <td style={CELULA}>
                    <select
                      style={CAMPO}
                      value={nova.tipoVersao}
                      onChange={(e) =>
                        setNova({ ...nova, tipoVersao: e.target.value as typeof nova.tipoVersao })
                      }
                      title="Define o próximo número de versão"
                    >
                      <option value="CORRECAO">Correção (x.y.+1)</option>
                      <option value="MENOR">Menor (x.+1.0)</option>
                      <option value="MAIOR">Maior (+1.0.0)</option>
                    </select>
                  </td>
                  <td style={CELULA}>
                    <input
                      style={CAMPO}
                      value={nova.desenvolvedor}
                      onChange={(e) => setNova({ ...nova, desenvolvedor: e.target.value })}
                    />
                  </td>
                  <td style={CELULA}>
                    <input
                      style={CAMPO}
                      value={nova.revisor}
                      onChange={(e) => setNova({ ...nova, revisor: e.target.value })}
                    />
                  </td>
                  <td style={CELULA}>
                    <input
                      type="date"
                      style={CAMPO}
                      value={nova.dataRevisao}
                      onChange={(e) => setNova({ ...nova, dataRevisao: e.target.value })}
                    />
                  </td>
                  <td style={CELULA}>
                    <textarea
                      rows={3}
                      style={CAMPO}
                      placeholder="O que foi feito (Shift+Enter quebra a linha)"
                      value={nova.comentario}
                      onChange={(e) => setNova({ ...nova, comentario: e.target.value })}
                    />
                    <input
                      style={{ ...CAMPO, marginTop: 4 }}
                      placeholder="Seções afetadas (opcional)"
                      value={nova.secoesAfetadas}
                      onChange={(e) => setNova({ ...nova, secoesAfetadas: e.target.value })}
                    />
                  </td>
                  <td style={CELULA}>
                    <input
                      style={CAMPO}
                      value={nova.local}
                      placeholder="Padrão da autoria"
                      onChange={(e) => setNova({ ...nova, local: e.target.value })}
                    />
                  </td>
                  <td style={CELULA}>
                    <input
                      style={CAMPO}
                      value={nova.equipe}
                      placeholder="Padrão: TI - CFO"
                      onChange={(e) => setNova({ ...nova, equipe: e.target.value })}
                    />
                  </td>
                  <td style={{ ...CELULA, borderRight: "none", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void salvarRevisao()}
                      style={{
                        background: "#198754",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 12px",
                        cursor: "pointer",
                        fontSize: 12.5,
                        marginRight: 6
                      }}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setNova(null)}
                      style={{
                        background: "#fff",
                        border: "1px solid #6c757d",
                        borderRadius: 6,
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontSize: 12.5
                      }}
                    >
                      Cancelar
                    </button>
                  </td>
                </tr>
              )}
              {revisoes.map((r) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: "1px solid #dee2e6",
                    background: r.anuladaEm
                      ? "#f8f9fa"
                      : r.tipo === "AUTOMATICA"
                        ? "#f1f8ff"
                        : "#fff"
                  }}
                >
                  <td
                    style={{ ...CELULA, textDecoration: r.anuladaEm ? "line-through" : undefined }}
                  >
                    <strong style={{ color: AZUL }}>{r.versao}</strong>
                    {r.tipo === "AUTOMATICA" && (
                      <div style={{ fontSize: 11, color: "#6c757d" }}>automática</div>
                    )}
                  </td>
                  <td
                    style={{ ...CELULA, textDecoration: r.anuladaEm ? "line-through" : undefined }}
                  >
                    {r.desenvolvedor}
                  </td>
                  <td
                    style={{ ...CELULA, textDecoration: r.anuladaEm ? "line-through" : undefined }}
                  >
                    {r.revisor ?? "—"}
                  </td>
                  <td
                    style={{
                      ...CELULA,
                      textDecoration: r.anuladaEm ? "line-through" : undefined,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {br(r.dataRevisao)}
                  </td>
                  <td style={{ ...CELULA, whiteSpace: "pre-wrap" }}>
                    <span style={{ textDecoration: r.anuladaEm ? "line-through" : undefined }}>
                      {r.comentario}
                    </span>
                    {r.secoesAfetadas && (
                      <div style={{ fontSize: 12, color: "#6c757d" }}>
                        Seções: {r.secoesAfetadas}
                      </div>
                    )}
                    {r.anuladaEm && (
                      <div style={{ fontSize: 12, color: "#842029", marginTop: 3 }}>
                        Anulada{r.anuladaPorNome ? ` por ${r.anuladaPorNome}` : ""}:{" "}
                        {r.motivoAnulacao}
                      </div>
                    )}
                  </td>
                  <td
                    style={{ ...CELULA, textDecoration: r.anuladaEm ? "line-through" : undefined }}
                  >
                    {r.local ?? "—"}
                  </td>
                  <td
                    style={{ ...CELULA, textDecoration: r.anuladaEm ? "line-through" : undefined }}
                  >
                    {r.equipe ?? "—"}
                  </td>
                  <td style={{ ...CELULA, borderRight: "none" }}>
                    {!r.anuladaEm && r.tipo === "MANUAL" && (
                      <button
                        type="button"
                        onClick={() => anular(r)}
                        title="Anular revisão (mantém a linha riscada)"
                        style={{
                          background: "#dc3545",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontSize: 12.5
                        }}
                      >
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          disabled={!!nova}
          onClick={() =>
            setNova({
              ...VAZIA,
              dataRevisao: hoje(),
              desenvolvedor: autoria?.autor ?? "",
              local: autoria?.local ?? ""
            })
          }
          style={{
            marginTop: 14,
            background: "#198754",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "7px 16px",
            cursor: "pointer",
            fontSize: 13.5,
            opacity: nova ? 0.6 : 1
          }}
        >
          + Adicionar Linha
        </button>
      </div>

      <DocumentacaoLeitor
        autoria={autoria}
        revisoes={revisoes}
        emitidoPor={autoria?.atualizadoPorNome ?? "Super Admin"}
        onIndiceCarregado={carregar}
      />
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import { Modal } from "../../components/Modal";
import { hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { nomeArquivoRelatorioMes } from "../../utils/nomeArquivo";
import {
  RESULTADO_LABEL,
  RESULTADO_OPCOES,
  SITUACAO_LABEL,
  fmtDataBr,
  lerArquivoBase64,
  type ExameOcupacional,
  type SituacaoExame
} from "../../components/saude/tipos";

interface ItemPainel {
  funcionarioId: string;
  nome: string;
  matricula: string | null;
  categoria: string;
  gerencia: string | null;
  ultimoExame: string | null;
  resultado: string | null;
  proximoVencimento: string | null;
  situacao: SituacaoExame;
  diasParaVencer: number | null;
  aguardandoConferencia: { id: string; dataRealizacao: string } | null;
}

interface Painel {
  config: { periodicidadeMeses: number; avisoDias: number };
  resumo: {
    total: number;
    emDia: number;
    aVencer: number;
    vencidos: number;
    semExame: number;
    aguardandoConferencia: number;
  };
  itens: ItemPainel[];
}

const input: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 10px",
  border: "1px solid rgba(122,30,38,0.18)",
  background: "#fff",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  boxSizing: "border-box"
};
const lbl: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  display: "block",
  marginBottom: 5,
  color: "var(--ink-700)"
};
const soNumero = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

function baixarAso(e: Pick<ExameOcupacional, "id" | "nomeArquivo">) {
  api
    .download(`/ponto/saude-ocupacional/exames/${e.id}/arquivo`, e.nomeArquivo ?? "ASO.pdf")
    .catch((er: Error) => alert("Erro ao baixar o ASO: " + er.message));
}

/* ─── Modal: registrar (RH) ─── */
function RegistrarModal({
  funcionarioId,
  nome,
  onClose,
  onSalvo
}: {
  funcionarioId: string;
  nome: string;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [data, setData] = useState("");
  const [resultado, setResultado] = useState("");
  const [clinica, setClinica] = useState("");
  const [obs, setObs] = useState("");
  const [arq, setArq] = useState<{ base64: string; nome: string } | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro("");
    if (!data) return setErro("Informe a data do exame.");
    if (!resultado) return setErro("Informe o resultado do ASO.");
    setSalvando(true);
    try {
      await api.post(`/ponto/saude-ocupacional/funcionarios/${funcionarioId}/exames`, {
        dataRealizacao: data,
        resultado,
        clinica: clinica || undefined,
        observacao: obs || undefined,
        arquivoBase64: arq?.base64,
        nomeArquivo: arq?.nome
      });
      onSalvo();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      eyebrow="Saúde Ocupacional"
      title="Registrar exame periódico"
      subtitle={nome}
      onClose={() => !salvando && onClose()}
      maxWidth={900}
      maxHeight="92vh"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "14px 16px",
            alignItems: "start"
          }}
        >
          <div>
            <label style={lbl}>Data do exame *</label>
            <input
              type="date"
              style={input}
              value={data}
              max={hojeBrasiliaISO()}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>Resultado *</label>
            <select style={input} value={resultado} onChange={(e) => setResultado(e.target.value)}>
              <option value="">Selecione…</option>
              {Object.entries(RESULTADO_OPCOES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Clínica</label>
            <input style={input} value={clinica} onChange={(e) => setClinica(e.target.value)} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={lbl}>Observação</label>
            <input style={input} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>ASO (PDF/imagem)</label>
            <label
              className="btn btn-secondary btn-sm"
              style={{
                ...input,
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                overflow: "hidden",
                whiteSpace: "nowrap"
              }}
              title={arq?.nome ?? "Anexar o ASO"}
            >
              <span style={{ fontWeight: 600, flexShrink: 0 }}>
                {arq ? "Trocar arquivo" : "Escolher arquivo"}
              </span>
              <span
                style={{
                  color: "var(--ink-500)",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {arq?.nome ?? "Nenhum arquivo"}
              </span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setArq({ base64: await lerArquivoBase64(f), nome: f.name });
                }}
              />
            </label>
          </div>
        </div>
        {erro && <p style={{ margin: 0, color: "var(--red)", fontSize: 12.5 }}>⚠ {erro}</p>}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            paddingTop: 14,
            borderTop: "1px solid rgba(122,30,38,0.10)"
          }}
        >
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void salvar()}
            disabled={salvando}
          >
            {salvando ? "Salvando…" : "Registrar exame"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Modal: conferir exame enviado pelo funcionário ─── */
function ConferirModal({
  exame,
  nome,
  onClose,
  onFeito
}: {
  exame: ExameOcupacional;
  nome: string;
  onClose: () => void;
  onFeito: () => void;
}) {
  const [resultado, setResultado] = useState("");
  const [data, setData] = useState(exame.dataRealizacao);
  const [motivo, setMotivo] = useState("");
  const [devolvendo, setDevolvendo] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function executar(fn: () => Promise<unknown>) {
    setOcupado(true);
    setErro("");
    try {
      await fn();
      onFeito();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      eyebrow="Saúde Ocupacional"
      title="Conferir exame enviado"
      subtitle={nome}
      onClose={() => !ocupado && onClose()}
      maxWidth={900}
      maxHeight="92vh"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          Enviado em {fmtDataBr(exame.createdAt)} · clínica: {exame.clinica || "—"}
          {exame.observacao ? ` · obs.: ${exame.observacao}` : ""}
        </p>
        {exame.temArquivo && (
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => baixarAso(exame)}>
              ⬇ Abrir o ASO enviado
            </button>
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12
          }}
        >
          <div>
            <label style={lbl}>Data do exame (confira no ASO)</label>
            <input
              type="date"
              style={input}
              value={data}
              max={hojeBrasiliaISO()}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>Resultado do ASO *</label>
            <select style={input} value={resultado} onChange={(e) => setResultado(e.target.value)}>
              <option value="">Selecione…</option>
              {Object.entries(RESULTADO_OPCOES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        {devolvendo && (
          <div>
            <label style={lbl}>Motivo da devolução *</label>
            <textarea
              rows={2}
              style={{ ...input, height: "auto", padding: "8px 10px", resize: "vertical" }}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: ASO ilegível; envie a página com a assinatura do médico."
            />
          </div>
        )}
        {erro && <p style={{ margin: 0, color: "var(--red)", fontSize: 12.5 }}>⚠ {erro}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {!devolvendo ? (
            <>
              <button
                className="btn btn-secondary btn-sm"
                disabled={ocupado}
                onClick={() => setDevolvendo(true)}
              >
                Devolver ao funcionário
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={ocupado || !resultado}
                onClick={() =>
                  void executar(() =>
                    api.post(`/ponto/saude-ocupacional/exames/${exame.id}/confirmar`, {
                      resultado,
                      dataRealizacao: data
                    })
                  )
                }
              >
                Confirmar exame
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-secondary btn-sm"
                disabled={ocupado}
                onClick={() => setDevolvendo(false)}
              >
                Voltar
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={ocupado || motivo.trim().length < 5}
                onClick={() =>
                  void executar(() =>
                    api.post(`/ponto/saude-ocupacional/exames/${exame.id}/devolver`, { motivo })
                  )
                }
              >
                Confirmar devolução
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ─── Modal: histórico ─── */
function HistoricoModal({
  funcionarioId,
  nome,
  podeExcluir,
  onClose,
  onMudou
}: {
  funcionarioId: string;
  nome: string;
  podeExcluir: boolean;
  onClose: () => void;
  onMudou: () => void;
}) {
  const [lista, setLista] = useState<ExameOcupacional[] | null>(null);
  const carregar = useCallback(() => {
    api
      .get<ExameOcupacional[]>(`/ponto/saude-ocupacional/funcionarios/${funcionarioId}/exames`)
      .then(setLista)
      .catch(() => setLista([]));
  }, [funcionarioId]);
  useEffect(carregar, [carregar]);
  const sitLabel = (e: ExameOcupacional) =>
    e.situacao === "CONFIRMADO"
      ? `Confirmado${e.resultado ? ` · ${RESULTADO_LABEL[e.resultado]}` : ""}`
      : e.situacao === "AGUARDANDO_CONFERENCIA"
        ? "Aguardando conferência"
        : `Devolvido: ${e.motivoDevolucao ?? ""}`;
  return (
    <Modal
      eyebrow="Saúde Ocupacional"
      title="Histórico de exames"
      subtitle={nome}
      onClose={onClose}
      maxWidth={900}
      maxHeight="92vh"
    >
      {!lista ? (
        <p style={{ fontSize: 13 }}>Carregando…</p>
      ) : lista.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Nenhum exame registrado.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lista.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                padding: "8px 10px",
                border: "1px solid rgba(122,30,38,0.10)",
                borderRadius: "var(--radius-md)",
                fontSize: 12.5
              }}
            >
              <strong>{fmtDataBr(e.dataRealizacao)}</strong>
              <span>{sitLabel(e)}</span>
              {e.proximoVencimento && (
                <span style={{ color: "var(--ink-500)" }}>
                  vence em {fmtDataBr(e.proximoVencimento)}
                </span>
              )}
              <span style={{ color: "var(--ink-500)", flex: 1 }}>
                {e.origem === "FUNCIONARIO" ? "enviado pelo funcionário" : "lançado pelo RH"}
                {e.conferidoPorNome ? ` · conferido por ${e.conferidoPorNome}` : ""}
              </span>
              {e.temArquivo && (
                <button className="btn btn-ghost btn-sm" onClick={() => baixarAso(e)}>
                  ⬇ ASO
                </button>
              )}
              {podeExcluir && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--red)" }}
                  onClick={() => {
                    if (window.confirm("Excluir definitivamente este exame?")) {
                      api
                        .delete(`/ponto/saude-ocupacional/exames/${e.id}`)
                        .then(() => {
                          carregar();
                          onMudou();
                        })
                        .catch((er: Error) => alert(er.message));
                    }
                  }}
                >
                  Excluir
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ─── Modal: solicitar exame ─── */
function SolicitarModal({
  selecionadosIniciais,
  onClose,
  onFeito
}: {
  selecionadosIniciais: string[];
  onClose: () => void;
  onFeito: (msg: string) => void;
}) {
  type Modo = "ESCOLHER" | "TODOS" | "VENCIDOS_E_A_VENCER";
  const [modo, setModo] = useState<Modo>("ESCOLHER");
  const [todos, setTodos] = useState<ItemPainel[]>([]);
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set(selecionadosIniciais));
  const [prazo, setPrazo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [arquivo, setArquivo] = useState<{ base64: string; nome: string } | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api
      .get<Painel>("/ponto/saude-ocupacional/painel")
      .then((p) => setTodos(p.itens))
      .catch(() => setTodos([]));
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q
      ? todos.filter(
          (i) => i.nome.toLowerCase().includes(q) || (i.matricula ?? "").toLowerCase().includes(q)
        )
      : todos;
  }, [todos, busca]);
  const vencidosEAVencer = todos.filter(
    (i) => i.situacao === "VENCIDO" || i.situacao === "A_VENCER"
  ).length;

  const total =
    modo === "ESCOLHER" ? escolhidos.size : modo === "TODOS" ? todos.length : vencidosEAVencer;
  const todosFiltradosMarcados =
    filtrados.length > 0 && filtrados.every((i) => escolhidos.has(i.funcionarioId));

  async function enviar() {
    setOcupado(true);
    setErro("");
    try {
      const r = await api.post<{ criadas: number; ignoradas: number }>(
        "/ponto/saude-ocupacional/solicitar",
        {
          ...(modo === "ESCOLHER"
            ? { modo: "SELECIONADOS", funcionarioIds: [...escolhidos] }
            : { modo }),
          prazo: prazo || undefined,
          mensagem: mensagem || undefined,
          arquivoBase64: arquivo?.base64,
          nomeArquivo: arquivo?.nome
        }
      );
      onFeito(
        `Pedido enviado a ${r.criadas} funcionário(s)` +
          (r.ignoradas ? `; ${r.ignoradas} já tinham pedido em aberto.` : ".")
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const opcao = (m: Modo, titulo: string, detalhe: string) => (
    <label
      key={m}
      style={{
        flex: "1 1 220px",
        padding: "10px 12px",
        border: `1.5px solid ${modo === m ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)"}`,
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        background: modo === m ? "rgba(122,30,38,0.04)" : "#fff"
      }}
    >
      <input type="radio" checked={modo === m} onChange={() => setModo(m)} />{" "}
      <strong style={{ fontSize: 13 }}>{titulo}</strong>
      <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginLeft: 22 }}>{detalhe}</div>
    </label>
  );

  return (
    <Modal
      eyebrow="Saúde Ocupacional"
      title="Solicitar exame médico periódico"
      subtitle={`${total} funcionário(s) no pedido`}
      onClose={() => !ocupado && onClose()}
      maxWidth={1000}
      maxHeight="94vh"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {opcao("ESCOLHER", "Escolher funcionários", "Um ou vários, marcando na lista")}
          {opcao("TODOS", "Todos os funcionários", `Todos os ativos (${todos.length})`)}
          {opcao(
            "VENCIDOS_E_A_VENCER",
            "Vencidos e a vencer",
            `Quem precisa renovar agora (${vencidosEAVencer})`
          )}
        </div>

        {modo === "ESCOLHER" && (
          <div
            style={{
              border: "1px solid rgba(122,30,38,0.12)",
              borderRadius: "var(--radius-md)",
              padding: 10
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <input
                style={{ ...input, flex: 1, minWidth: 220 }}
                placeholder="Buscar por nome ou matrícula"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const n = new Set(escolhidos);
                  if (todosFiltradosMarcados) filtrados.forEach((i) => n.delete(i.funcionarioId));
                  else filtrados.forEach((i) => n.add(i.funcionarioId));
                  setEscolhidos(n);
                }}
              >
                {todosFiltradosMarcados ? "Desmarcar a lista" : "Marcar a lista"}
              </button>
              {escolhidos.size > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setEscolhidos(new Set())}>
                  Limpar ({escolhidos.size})
                </button>
              )}
            </div>
            <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 2 }}>
              {filtrados.map((i) => {
                const s = SITUACAO_LABEL[i.situacao];
                return (
                  <label
                    key={i.funcionarioId}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      padding: "4px 6px",
                      fontSize: 13,
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={escolhidos.has(i.funcionarioId)}
                      onChange={(e) => {
                        const n = new Set(escolhidos);
                        if (e.target.checked) n.add(i.funcionarioId);
                        else n.delete(i.funcionarioId);
                        setEscolhidos(n);
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      {i.nome}{" "}
                      <span style={{ color: "var(--ink-500)", fontSize: 11.5 }}>
                        {i.matricula ?? ""} {i.gerencia ? `· ${i.gerencia}` : ""}
                      </span>
                    </span>
                    <span style={{ fontSize: 11, color: s.cor, fontWeight: 700 }}>{s.label}</span>
                  </label>
                );
              })}
              {todos.length === 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: 8 }}>Carregando…</p>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={lbl}>Prazo para envio (opcional)</label>
            <input
              type="date"
              style={input}
              min={hojeBrasiliaISO()}
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={lbl}>Mensagem (opcional)</label>
            <input style={input} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Documento do RH (opcional)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return setArquivo(null);
                try {
                  setArquivo({ base64: await lerArquivoBase64(f), nome: f.name });
                } catch (er) {
                  setErro((er as Error).message);
                }
              }}
            />
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-500)" }}>
          O funcionário recebe a requisição em Minhas Requisições do RH (com o documento, se houver)
          e envia a data e o ASO. Quem já tem um pedido de exame em aberto é ignorado.
        </p>
        {erro && <p style={{ margin: 0, color: "var(--red)", fontSize: 12.5 }}>⚠ {erro}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={ocupado}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void enviar()}
            disabled={ocupado || total === 0}
          >
            {ocupado ? "Enviando…" : `Enviar pedido (${total})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Página ─── */
export function SaudeOcupacionalPage({ embutida = false }: { embutida?: boolean }) {
  const { user, podeRh } = useAuth();
  const superUsuario = !!user?.isSuperAdmin;
  const podeRegistrar = superUsuario || podeRh("saude.exames.registrar");
  const podeConfigurar = superUsuario || podeRh("saude.exames.configurar");

  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [gerenciaId, setGerenciaId] = useState("");
  const [situacao, setSituacao] = useState("");
  const [gerencias, setGerencias] = useState<
    Array<{ id: string; nome: string; sigla: string | null }>
  >([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [registrar, setRegistrar] = useState<ItemPainel | null>(null);
  const [historico, setHistorico] = useState<ItemPainel | null>(null);
  const [conferir, setConferir] = useState<{ item: ItemPainel; exame: ExameOcupacional } | null>(
    null
  );
  const [solicitar, setSolicitar] = useState(false);
  const [cfgPer, setCfgPer] = useState("12");
  const [cfgAviso, setCfgAviso] = useState("30");

  const carregar = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (busca.trim()) qs.set("busca", busca.trim());
      if (gerenciaId) qs.set("gerenciaId", gerenciaId);
      if (situacao) qs.set("situacao", situacao);
      const p = await api.get<Painel>(`/ponto/saude-ocupacional/painel?${qs.toString()}`);
      setPainel(p);
      setCfgPer(String(p.config.periodicidadeMeses));
      setCfgAviso(String(p.config.avisoDias));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [busca, gerenciaId, situacao]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    api
      .get<Array<{ id: string; nome: string; sigla: string | null }>>("/ponto/gestao/gerencias")
      .then((g) => setGerencias(g ?? []))
      .catch(() => setGerencias([]));
  }, []);

  const itens = painel?.itens ?? [];
  const todosSel = useMemo(
    () => itens.length > 0 && itens.every((i) => sel.has(i.funcionarioId)),
    [itens, sel]
  );

  async function abrirConferencia(item: ItemPainel) {
    try {
      const lista = await api.get<ExameOcupacional[]>(
        `/ponto/saude-ocupacional/funcionarios/${item.funcionarioId}/exames`
      );
      const ex = lista.find((e) => e.situacao === "AGUARDANDO_CONFERENCIA");
      if (ex) setConferir({ item, exame: ex });
      else void carregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function exportarCsv() {
    const hoje = new Date();
    const linhas = [
      [
        "Nome",
        "Matrícula",
        "Gerência",
        "Categoria",
        "Último exame",
        "Vencimento",
        "Dias para vencer",
        "Resultado",
        "Situação"
      ],
      ...itens.map((i) => [
        i.nome,
        i.matricula ?? "",
        i.gerencia ?? "",
        i.categoria,
        fmtDataBr(i.ultimoExame),
        fmtDataBr(i.proximoVencimento),
        i.diasParaVencer ?? "",
        i.resultado ? RESULTADO_LABEL[i.resultado] : "",
        SITUACAO_LABEL[i.situacao].label
      ])
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivoRelatorioMes(hoje.getMonth() + 1, hoje.getFullYear(), {
      prefixo: "Relatório exames ocupacionais",
      extensao: "csv"
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function salvarConfig() {
    try {
      await api.put("/ponto/saude-ocupacional/config", {
        periodicidadeMeses: cfgPer,
        avisoDias: cfgAviso
      });
      setMsg("Configuração salva.");
      void carregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const card = (rotulo: string, valor: number, cor: string, filtro: string) => (
    <button
      key={rotulo}
      onClick={() => setSituacao(situacao === filtro ? "" : filtro)}
      style={{
        flex: "1 1 150px",
        textAlign: "left",
        padding: "10px 14px",
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${situacao === filtro ? cor : "rgba(122,30,38,0.10)"}`,
        background: "#fff",
        cursor: "pointer"
      }}
    >
      <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)", textTransform: "uppercase" }}>
        {rotulo}
      </p>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: cor }}>{valor}</p>
    </button>
  );

  return (
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
      {!embutida && (
        <>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            RH
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1,
              marginBottom: 6
            }}
          >
            Saúde <em>Ocupacional</em>
          </h1>
        </>
      )}
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-500)" }}>
        Exame médico ocupacional periódico: a cada {painel?.config.periodicidadeMeses ?? 12} meses.
        Dado de saúde (LGPD): visível só ao RH autorizado e ao próprio funcionário.
      </p>

      {msg && <p style={{ color: "var(--green)", fontSize: 13 }}>✓ {msg}</p>}
      {erro && <p style={{ color: "var(--red)", fontSize: 13 }}>⚠ {erro}</p>}

      {painel && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {card("Em dia", painel.resumo.emDia, "#166534", "EM_DIA")}
          {card("A vencer", painel.resumo.aVencer, "#92400e", "A_VENCER")}
          {card("Vencidos", painel.resumo.vencidos, "#b91c1c", "VENCIDO")}
          {card("Sem exame", painel.resumo.semExame, "#475569", "SEM_EXAME")}
          {card(
            "Aguardando conferência",
            painel.resumo.aguardandoConferencia,
            "#1a4f7a",
            "AGUARDANDO_CONFERENCIA"
          )}
        </div>
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
          style={{ ...input, width: 220 }}
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
        <span style={{ flex: 1 }} />
        {podeRegistrar && (
          <button className="btn btn-primary btn-sm" onClick={() => setSolicitar(true)}>
            ✉ Solicitar exame{sel.size ? ` (${sel.size})` : ""}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={exportarCsv}>
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="card-flat" style={{ padding: 0, overflowX: "auto" }}>
        <table className="table-cfo table-cfo-destaque" style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={todosSel}
                  onChange={(e) =>
                    setSel(
                      e.target.checked ? new Set(itens.map((i) => i.funcionarioId)) : new Set()
                    )
                  }
                  aria-label="Selecionar todos"
                />
              </th>
              <th>Funcionário</th>
              <th>Gerência</th>
              <th>Último exame</th>
              <th>Vencimento</th>
              <th style={{ textAlign: "center" }}>Dias p/ vencer</th>
              <th>Resultado</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const s = SITUACAO_LABEL[i.situacao];
              return (
                <tr key={i.funcionarioId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={sel.has(i.funcionarioId)}
                      onChange={(e) => {
                        const n = new Set(sel);
                        if (e.target.checked) n.add(i.funcionarioId);
                        else n.delete(i.funcionarioId);
                        setSel(n);
                      }}
                    />
                  </td>
                  <td>
                    <strong>{i.nome}</strong>
                    <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
                      {i.matricula ?? "—"}
                    </div>
                  </td>
                  <td>{i.gerencia ?? "—"}</td>
                  <td>{fmtDataBr(i.ultimoExame)}</td>
                  <td>{fmtDataBr(i.proximoVencimento)}</td>
                  <td style={{ textAlign: "center", fontWeight: 700 }}>
                    {i.diasParaVencer === null ? (
                      <span style={{ color: "var(--ink-500)", fontWeight: 400 }}>—</span>
                    ) : (
                      <span style={{ color: s.cor }} title={s.label}>
                        {i.diasParaVencer}
                      </span>
                    )}
                  </td>
                  <td>{i.resultado ? RESULTADO_LABEL[i.resultado] : "—"}</td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        whiteSpace: "nowrap"
                      }}
                    >
                      <span
                        style={{
                          padding: "2px 9px",
                          borderRadius: 999,
                          background: s.bg,
                          color: s.cor,
                          fontWeight: 700,
                          fontSize: 11.5
                        }}
                      >
                        {s.label}
                      </span>
                      {i.aguardandoConferencia && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "#1a4f7a" }}
                          onClick={() => void abrirConferencia(i)}
                        >
                          ⏳ Conferir
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {podeRegistrar && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setRegistrar(i)}>
                        Registrar
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setHistorico(i)}>
                      Histórico
                    </button>
                  </td>
                </tr>
              );
            })}
            {painel && itens.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{ textAlign: "center", padding: 24, color: "var(--ink-500)" }}
                >
                  Nenhum funcionário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {podeConfigurar && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            border: "1px dashed rgba(122,30,38,0.3)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-end"
          }}
        >
          <div>
            <label style={lbl}>Periodicidade (meses)</label>
            <input
              style={{ ...input, width: 110 }}
              inputMode="numeric"
              value={cfgPer}
              onChange={(e) => setCfgPer(soNumero(e.target.value))}
            />
          </div>
          <div>
            <label style={lbl}>Avisar com antecedência (dias)</label>
            <input
              style={{ ...input, width: 140 }}
              inputMode="numeric"
              value={cfgAviso}
              onChange={(e) => setCfgAviso(soNumero(e.target.value))}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => void salvarConfig()}>
            Salvar
          </button>
          <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
            A periodicidade vale para os próximos cálculos; ao editar um exame o vencimento é
            recalculado.
          </span>
        </div>
      )}

      {registrar && (
        <RegistrarModal
          funcionarioId={registrar.funcionarioId}
          nome={registrar.nome}
          onClose={() => setRegistrar(null)}
          onSalvo={() => {
            setRegistrar(null);
            setMsg("Exame registrado.");
            void carregar();
          }}
        />
      )}
      {conferir && (
        <ConferirModal
          exame={conferir.exame}
          nome={conferir.item.nome}
          onClose={() => setConferir(null)}
          onFeito={() => {
            setConferir(null);
            setMsg("Conferência concluída.");
            void carregar();
          }}
        />
      )}
      {historico && (
        <HistoricoModal
          funcionarioId={historico.funcionarioId}
          nome={historico.nome}
          podeExcluir={superUsuario}
          onClose={() => setHistorico(null)}
          onMudou={() => void carregar()}
        />
      )}
      {solicitar && (
        <SolicitarModal
          selecionadosIniciais={[...sel]}
          onClose={() => setSolicitar(false)}
          onFeito={(m) => {
            setSolicitar(false);
            setSel(new Set());
            setMsg(m);
          }}
        />
      )}
    </div>
  );
}

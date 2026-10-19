import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../hooks/useApi";

type TipoArquivo = "AFD" | "AEJ";
type Escopo = "todos" | "gerencia" | "funcionarios";

interface PreValidacao {
  tipoRep: "REP_P";
  bloqueios: string[];
  avisos: string[];
  funcionarios: number;
  certificado: boolean;
  nsrAtual: number;
}

const hojeIso = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
function mesRef(delta: number) {
  const [y, m] = hojeIso().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const ini = d.toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  return { ini, fim };
}

const DESCRICAO: Record<TipoArquivo, string> = {
  AFD: "Arquivo Fonte de Dados — as marcações ORIGINAIS registradas no REP, por NSR (Portaria MTP 671/2021, art. 81).",
  AEJ: "Arquivo Eletrônico de Jornada — a jornada tratada pelo PTRP: marcações (originais, incluídas e desconsideradas, com motivo), horário contratual, ausências e banco de horas (art. 83)."
};

/**
 * Extração do AFD/AEJ. Por funcionário: tipo fixo. Por grupo: abas AFD | AEJ e escopo
 * (todos = AFD oficial do REP; gerência/seleção = extrato do AFD).
 */
export function ModalArquivosFiscais({
  tipoInicial,
  funcionario,
  onClose
}: {
  tipoInicial: TipoArquivo;
  /** Presente = extração por funcionário. */
  funcionario?: { id: string; nome: string };
  onClose: () => void;
}) {
  const grupo = !funcionario;
  const [tipo, setTipo] = useState<TipoArquivo>(tipoInicial);
  const anterior = mesRef(-1);
  const [inicio, setInicio] = useState(anterior.ini);
  const [fim, setFim] = useState(anterior.fim);
  const [escopo, setEscopo] = useState<Escopo>(grupo ? "todos" : "funcionarios");
  const [gerenciaId, setGerenciaId] = useState("");
  const [gerencias, setGerencias] = useState<Array<{ id: string; nome: string; sigla: string }>>(
    []
  );
  const [lista, setLista] = useState<Array<{ id: string; nome: string; matricula: string | null }>>(
    []
  );
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [assinar, setAssinar] = useState(true);
  const [pre, setPre] = useState<PreValidacao | null>(null);
  const [carregandoPre, setCarregandoPre] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!grupo) return;
    api
      .get<Array<{ id: string; nome: string; sigla: string }>>("/ponto/gestao/gerencias")
      .then((g) => setGerencias(g ?? []))
      .catch(() => setGerencias([]));
    api
      .get<Array<{ id: string; matricula: string | null; user: { name: string } }>>(
        "/auditoria/funcionarios?ativo=true"
      )
      .then((f) =>
        setLista((f ?? []).map((x) => ({ id: x.id, nome: x.user.name, matricula: x.matricula })))
      )
      .catch(() => setLista([]));
  }, [grupo]);

  const filtro = useMemo(
    () => ({
      inicio,
      fim,
      escopo: grupo ? escopo : ("funcionarios" as Escopo),
      gerenciaId: escopo === "gerencia" ? gerenciaId : undefined,
      funcionarioIds: grupo
        ? escopo === "funcionarios"
          ? [...selecionados]
          : undefined
        : [funcionario!.id],
      assinar
    }),
    [inicio, fim, escopo, gerenciaId, selecionados, assinar, grupo, funcionario?.id]
  );

  const escopoIncompleto =
    (filtro.escopo === "gerencia" && !gerenciaId) ||
    (filtro.escopo === "funcionarios" && !(filtro.funcionarioIds ?? []).length);

  useEffect(() => {
    if (escopoIncompleto || !inicio || !fim) {
      setPre(null);
      return;
    }
    let ativo = true;
    setCarregandoPre(true);
    const qs = new URLSearchParams({
      inicio,
      fim,
      escopo: filtro.escopo,
      ...(filtro.gerenciaId ? { gerenciaId: filtro.gerenciaId } : {}),
      ...(filtro.funcionarioIds ? { funcionarioIds: filtro.funcionarioIds.join(",") } : {})
    });
    api
      .get<PreValidacao>(`/auditoria/arquivos-fiscais/pre-validacao?${qs.toString()}`)
      .then((r) => ativo && setPre(r))
      .catch((e: Error) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregandoPre(false));
    return () => {
      ativo = false;
    };
  }, [filtro, escopoIncompleto, inicio, fim]);

  const oficial = tipo === "AEJ" || filtro.escopo === "todos";

  async function gerar() {
    setGerando(true);
    setErro("");
    setOk("");
    try {
      const r = await api.postDownload(
        `/auditoria/arquivos-fiscais/${tipo.toLowerCase()}`,
        filtro,
        `${tipo}.zip`
      );
      setOk(
        `${r.nome} gerado${r.assinado ? " e ASSINADO (CAdES .p7s)" : " SEM assinatura ICP-Brasil"}.`
      );
    } catch (e) {
      setErro((e as Error).message || "Não foi possível gerar o arquivo.");
    } finally {
      setGerando(false);
    }
  }

  const filtrados = lista.filter((f) =>
    `${f.nome} ${f.matricula ?? ""}`.toLowerCase().includes(busca.toLowerCase())
  );
  const input: React.CSSProperties = {
    padding: "7px 9px",
    border: "1px solid rgba(122,30,38,0.2)",
    borderRadius: 8,
    fontSize: 12.5
  };
  const rotulo: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--ink-500)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    display: "block",
    marginBottom: 4
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && !gerando && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 640,
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)"
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)", fontWeight: 700 }}>
            PORTARIA MTP Nº 671/2021 · REP-P + PTRP
          </p>
          <h3 style={{ margin: "2px 0 0", fontFamily: "var(--font-display)", fontSize: 19 }}>
            {grupo ? "Arquivos fiscais (AFD / AEJ)" : `${tipo} — ${funcionario!.nome}`}
          </h3>
        </div>

        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {grupo && (
            <div style={{ display: "flex", gap: 6 }}>
              {(["AFD", "AEJ"] as TipoArquivo[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tipo === t ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                  onClick={() => setTipo(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-600)", lineHeight: 1.5 }}>
            {DESCRICAO[tipo]}
          </p>

          <div>
            <span style={rotulo}>Período</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="date"
                style={input}
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
              <span style={{ fontSize: 12 }}>a</span>
              <input
                type="date"
                style={input}
                value={fim}
                onChange={(e) => setFim(e.target.value)}
              />
              {[
                ["Mês anterior", mesRef(-1)],
                ["Mês atual", { ini: mesRef(0).ini, fim: hojeIso() }]
              ].map(([l, r]) => (
                <button
                  key={l as string}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setInicio((r as { ini: string }).ini);
                    setFim((r as { fim: string }).fim);
                  }}
                >
                  {l as string}
                </button>
              ))}
            </div>
          </div>

          {grupo && (
            <div>
              <span style={rotulo}>Funcionários</span>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
                {(
                  [
                    ["todos", "Todos (AFD oficial do REP)"],
                    ["gerencia", "Por gerência"],
                    ["funcionarios", "Selecionar funcionários"]
                  ] as Array<[Escopo, string]>
                ).map(([v, l]) => (
                  <label key={v} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <input type="radio" checked={escopo === v} onChange={() => setEscopo(v)} />
                    {l}
                  </label>
                ))}
              </div>
              {escopo === "gerencia" && (
                <select
                  style={{ ...input, marginTop: 8, width: "100%" }}
                  value={gerenciaId}
                  onChange={(e) => setGerenciaId(e.target.value)}
                >
                  <option value="">Escolha a gerência…</option>
                  {gerencias.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.sigla ? `${g.sigla} — ` : ""}
                      {g.nome}
                    </option>
                  ))}
                </select>
              )}
              {escopo === "funcionarios" && (
                <div style={{ marginTop: 8 }}>
                  <input
                    style={{ ...input, width: "100%", boxSizing: "border-box" }}
                    placeholder="Buscar nome ou matrícula…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                  <div
                    style={{
                      maxHeight: 170,
                      overflow: "auto",
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 8,
                      marginTop: 6
                    }}
                  >
                    {filtrados.map((f) => (
                      <label
                        key={f.id}
                        style={{ display: "flex", gap: 8, padding: "5px 9px", fontSize: 12.5 }}
                      >
                        <input
                          type="checkbox"
                          checked={selecionados.has(f.id)}
                          onChange={(e) => {
                            const n = new Set(selecionados);
                            if (e.target.checked) n.add(f.id);
                            else n.delete(f.id);
                            setSelecionados(n);
                          }}
                        />
                        {f.nome}
                        <span style={{ color: "var(--ink-400)" }}>{f.matricula ?? ""}</span>
                      </label>
                    ))}
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                    {selecionados.size} selecionado(s)
                  </span>
                </div>
              )}
            </div>
          )}

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={assinar}
              disabled={pre ? !pre.certificado : false}
              onChange={(e) => setAssinar(e.target.checked)}
            />
            Assinar com certificado ICP-Brasil (CAdES, arquivo .p7s destacado — art. 88)
          </label>

          {tipo === "AFD" && !oficial && (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: "rgba(247,196,55,0.12)",
                border: "1px solid rgba(180,83,9,0.3)",
                fontSize: 12.5,
                color: "#92400E"
              }}
            >
              ⚠ <strong>Extrato do AFD</strong>: com parte dos funcionários o arquivo não substitui
              o AFD do REP (que reúne todas as marcações por NSR). Para a fiscalização, gere em
              “Arquivos fiscais” → Todos.
            </div>
          )}

          {carregandoPre && <p style={{ fontSize: 12, margin: 0 }}>⏳ Conferindo pendências…</p>}
          {pre && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pre.bloqueios.map((b) => (
                <div
                  key={b}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "#FEE2E2",
                    border: "1px solid #FCA5A5",
                    fontSize: 12.5,
                    color: "#991B1B"
                  }}
                >
                  ✕ {b}
                </div>
              ))}
              {pre.avisos.map((a) => (
                <div
                  key={a}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(247,196,55,0.10)",
                    border: "1px solid rgba(180,83,9,0.25)",
                    fontSize: 12,
                    color: "#78350F"
                  }}
                >
                  ⚠ {a}
                </div>
              ))}
              {!pre.bloqueios.length && (
                <p style={{ margin: 0, fontSize: 12, color: "#15803D" }}>
                  ✓ Pronto para gerar · {pre.funcionarios} funcionário(s) · NSR atual {pre.nsrAtual}
                </p>
              )}
            </div>
          )}
          {erro && <p style={{ color: "var(--red)", fontSize: 12.5, margin: 0 }}>⚠ {erro}</p>}
          {ok && <p style={{ color: "#15803D", fontSize: 12.5, margin: 0 }}>✓ {ok}</p>}
        </div>

        <div
          style={{
            padding: "12px 22px",
            borderTop: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8
          }}
        >
          <button type="button" className="btn btn-ghost" disabled={gerando} onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={gerando || escopoIncompleto || !pre || pre.bloqueios.length > 0}
            onClick={() => void gerar()}
          >
            {gerando ? "Gerando…" : `Gerar e baixar ${tipo} (ZIP)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

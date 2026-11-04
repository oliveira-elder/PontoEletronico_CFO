import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../hooks/useApi";
import { EyeIcon, EyeOffIcon } from "../icons";

type Estado = "OK" | "ALTERADO" | "SEM_LACRE" | "LACRE_ADULTERADO" | "INDISPONIVEL";

interface Item {
  id: string;
  sha256: string;
  bytes: number;
}

interface Registro {
  id: string;
  tipo: string;
  ator: string | null;
  motivo: string | null;
  hashNovo: string | null;
  createdAt: string;
  ip: string | null;
}

interface Status {
  estado: Estado;
  hashAtual: string | null;
  hashSelado: string | null;
  lacre: { versao: string; seladoEm: string; motivo: string } | null;
  divergencias: { id: string; situacao: string }[];
  ausentes: string[];
  itens: Item[];
  senhaConfigurada: boolean;
  senhaVisualizavel: boolean;
  senhaMinima: number;
  bloqueadoAte: string | null;
  historico: Registro[];
}

const ESTADO: Record<Estado, { rotulo: string; cor: string; bg: string; texto: string }> = {
  OK: {
    rotulo: "Íntegro",
    cor: "#166534",
    bg: "rgba(22,128,61,0.10)",
    texto: "Os arquivos do núcleo de registro de ponto estão iguais ao lacre."
  },
  ALTERADO: {
    rotulo: "Alterado",
    cor: "#b91c1c",
    bg: "rgba(200,57,63,0.12)",
    texto:
      "Há arquivos do núcleo de registro diferentes do lacre: o hash do código-fonte registrado no INPI não confere mais."
  },
  LACRE_ADULTERADO: {
    rotulo: "Lacre adulterado",
    cor: "#b91c1c",
    bg: "rgba(200,57,63,0.12)",
    texto:
      "O arquivo do lacre não bate com o último selo registrado no servidor. Investigue antes de qualquer registro no INPI."
  },
  SEM_LACRE: {
    rotulo: "Sem lacre",
    cor: "#92400e",
    bg: "rgba(217,119,6,0.14)",
    texto: "Ainda não existe lacre. Gere o primeiro com: npm run rep:selar -- --inicial"
  },
  INDISPONIVEL: {
    rotulo: "Indisponível",
    cor: "#475569",
    bg: "rgba(71,85,105,0.10)",
    texto: "O servidor não enxerga os arquivos do código-fonte (instalação sem a pasta src)."
  }
};

const TIPO_ROTULO: Record<string, string> = {
  SENHA_DEFINIDA: "Senha definida",
  SENHA_ALTERADA: "Senha alterada",
  LIBERACAO: "Liberação emitida",
  SELO: "Novo lacre selado",
  TENTATIVA_FALHA: "Senha incorreta",
  BLOQUEIO: "Bloqueio por tentativas",
  SENHA_REJEITADA: "Senha recusada",
  SENHA_REDEFINIDA: "Senha apagada (redefinição)",
  SENHA_VISUALIZAVEL: "Visualização habilitada",
  SENHA_CARREGADA: "Senha carregada na tela (oculta)",
  SENHA_EXIBIDA: "Senha exibida (olho)"
};

const cartao: React.CSSProperties = {
  background: "var(--surface-1, #fff)",
  border: "1px solid rgba(122,30,38,0.1)",
  borderRadius: "var(--radius-lg)",
  padding: 20,
  marginBottom: 20
};
const campo: React.CSSProperties = {
  height: 38,
  padding: "0 12px",
  border: "1px solid rgba(122,30,38,0.18)",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box"
};
const rotulo: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-700)",
  display: "block",
  marginBottom: 4
};
const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 };

const fmtData = (iso: string) => new Date(iso).toLocaleString("pt-BR");

/** Campo de senha em pontinhos com o ícone de olho para mostrar/ocultar. */
function CampoSenha({
  value,
  onChange,
  autoComplete,
  onKeyDown,
  onMostrar
}: {
  value: string;
  onChange?: (v: string) => void;
  autoComplete: string;
  onKeyDown?: (ev: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Chamado quando a senha passa a ficar visível (para registrar em log). */
  onMostrar?: () => void;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={visivel ? "text" : "password"}
        autoComplete={autoComplete}
        style={{ ...campo, paddingRight: 40, ...(visivel ? mono : {}) }}
        value={value}
        onChange={(ev) => onChange?.(ev.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        onClick={() => {
          if (!visivel) onMostrar?.();
          setVisivel((v) => !v);
        }}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--ink-500)",
          display: "flex",
          padding: 4
        }}
      >
        {visivel ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
      </button>
    </div>
  );
}

/** Sistema → Integridade do código (REP-P): lacre do hash do núcleo de registro, senha root e liberações. */
export function RepEscopoTab() {
  const [st, setSt] = useState<Status | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [senhaLiberar, setSenhaLiberar] = useState("");
  const [liberacao, setLiberacao] = useState<{ token: string; expiraEm: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  /** A senha atual (oculta) já foi carregada no campo nesta abertura/troca. */
  const senhaCarregada = useRef(false);

  const carregar = useCallback(async () => {
    try {
      setSt(await api.get<Status>("/sistema/rep-escopo"));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o estado do lacre.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /* Com a senha guardada cifrada, o campo "Senha atual" já vem preenchido (em pontinhos). */
  useEffect(() => {
    if (!st?.senhaConfigurada || !st.senhaVisualizavel || senhaCarregada.current) return;
    senhaCarregada.current = true;
    api
      .post<{ senha: string }>("/sistema/rep-escopo/senha/revelar", {})
      .then((r) => setSenhaAtual(r.senha))
      .catch(() => {
        senhaCarregada.current = false;
      });
  }, [st?.senhaConfigurada, st?.senhaVisualizavel]);

  async function habilitarVisualizacao() {
    setErro("");
    setMsg("");
    setOcupado(true);
    try {
      await api.post("/sistema/rep-escopo/senha/habilitar-visualizacao", { senha: senhaAtual });
      senhaCarregada.current = true; // o campo já tem a senha digitada
      setMsg("Visualização habilitada: a senha atual agora aparece neste campo.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível habilitar a visualização.");
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  function registrarExibicao() {
    void api.post("/sistema/rep-escopo/senha/exibida", {}).catch(() => undefined);
  }

  async function salvarSenha() {
    setErro("");
    setMsg("");
    if (novaSenha !== confirma) return setErro("A confirmação da senha não confere.");
    setOcupado(true);
    try {
      await api.put("/sistema/rep-escopo/senha", {
        senha: novaSenha,
        ...(st?.senhaConfigurada ? { senhaAtual } : {})
      });
      setMsg(st?.senhaConfigurada ? "Senha alterada." : "Senha definida.");
      senhaCarregada.current = false; // recarrega a nova senha no campo "Senha atual"
      setSenhaAtual("");
      setNovaSenha("");
      setConfirma("");
      setLiberacao(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a senha.");
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function liberar() {
    setErro("");
    setMsg("");
    setOcupado(true);
    try {
      setLiberacao(
        await api.post<{ token: string; expiraEm: string }>("/sistema/rep-escopo/liberar", {
          senha: senhaLiberar
        })
      );
      setSenhaLiberar("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível liberar.");
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão da área de transferência */
    }
  }

  if (!st) {
    return <p style={{ color: erro ? "var(--red)" : "var(--ink-400)" }}>{erro || "Carregando…"}</p>;
  }

  const e = ESTADO[st.estado];
  const bloqueado = st.bloqueadoAte ? new Date(st.bloqueadoAte) : null;

  return (
    <section>
      {erro && (
        <p
          style={{
            background: "#fee2e2",
            color: "#7a1e26",
            border: "1px solid #fca5a5",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13
          }}
        >
          {erro}
        </p>
      )}
      {msg && (
        <p
          style={{
            background: "#d1fae5",
            color: "#065f46",
            border: "1px solid #6ee7b7",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13
          }}
        >
          {msg}
        </p>
      )}

      {/* Estado do lacre */}
      <div style={cartao}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            Lacre do código-fonte (REP-P)
          </h2>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: e.bg,
              color: e.cor,
              fontWeight: 700,
              fontSize: 12
            }}
          >
            {e.rotulo}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-500)", margin: "0 0 12px" }}>{e.texto}</p>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "0 0 12px" }}>
          O hash cobre <strong>só o núcleo de registro de ponto</strong> (livro do REP, NSR, cadeia
          de hash, AFD, hora oficial e o modelo de dados do registro). As demais funcionalidades
          podem ser mantidas livremente sem alterar o hash.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <span style={rotulo}>Hash atual (SHA-256)</span>
            <p style={{ ...mono, margin: 0, wordBreak: "break-all" }}>{st.hashAtual ?? "—"}</p>
          </div>
          <div>
            <span style={rotulo}>Hash selado (lacre)</span>
            <p style={{ ...mono, margin: 0, wordBreak: "break-all" }}>{st.hashSelado ?? "—"}</p>
            {st.lacre && (
              <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "4px 0 0" }}>
                v{st.lacre.versao} · {fmtData(st.lacre.seladoEm)} · {st.lacre.motivo}
              </p>
            )}
          </div>
        </div>
        {(st.divergencias.length > 0 || st.ausentes.length > 0) && (
          <ul style={{ margin: "14px 0 0", paddingLeft: 18, fontSize: 12.5, color: "#b91c1c" }}>
            {st.divergencias.map((d) => (
              <li key={d.id}>
                <span style={mono}>{d.id}</span> — {d.situacao}
              </li>
            ))}
            {st.ausentes.map((a) => (
              <li key={a}>
                <span style={mono}>{a}</span> — ausente
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Arquivos protegidos */}
      <div style={cartao}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Arquivos protegidos</h2>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "0 0 12px" }}>
          {st.itens.length} itens no escopo. A lista fica em{" "}
          <span style={mono}>packages/backend/rep-escopo.json</span>.
        </p>
        <div style={{ overflow: "auto" }}>
          <table className="table-cfo" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Tamanho</th>
                <th>SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {st.itens.map((i) => (
                <tr key={i.id}>
                  <td style={mono}>{i.id}</td>
                  <td>{i.bytes.toLocaleString("pt-BR")} B</td>
                  <td style={mono}>{i.sha256.slice(0, 20)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Senha root */}
      <div style={cartao}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
          Senha root do Super Admin
        </h2>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "0 0 12px" }}>
          {st.senhaConfigurada
            ? st.senhaVisualizavel
              ? "Senha definida. A atual aparece em pontinhos (use o olho para ver) e cada exibição fica registrada. Uma troca cancela liberações em andamento."
              : "Senha definida antes da visualização existir: ela está guardada só como hash e não pode ser mostrada. Digite-a em “Senha atual” e clique em “Habilitar visualização”; depois ela passa a aparecer aqui. (Ou defina uma nova senha.)"
            : `Nenhuma senha definida. Mínimo de ${st.senhaMinima} caracteres. Fica guardada cifrada no servidor e só o Super Admin pode vê-la; tudo é registrado no histórico.`}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          {st.senhaConfigurada && (
            <div>
              <label style={rotulo}>Senha atual</label>
              <CampoSenha
                autoComplete="off"
                value={senhaAtual}
                onChange={setSenhaAtual}
                onMostrar={st.senhaVisualizavel ? registrarExibicao : undefined}
              />
            </div>
          )}
          <div>
            <label style={rotulo}>Nova senha</label>
            <CampoSenha autoComplete="new-password" value={novaSenha} onChange={setNovaSenha} />
          </div>
          <div>
            <label style={rotulo}>Confirmar nova senha</label>
            <CampoSenha autoComplete="new-password" value={confirma} onChange={setConfirma} />
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            disabled={
              ocupado || novaSenha.length < st.senhaMinima || (st.senhaConfigurada && !senhaAtual)
            }
            onClick={() => void salvarSenha()}
          >
            {st.senhaConfigurada ? "Alterar senha" : "Definir senha"}
          </button>
          {st.senhaConfigurada && !st.senhaVisualizavel && (
            <button
              className="btn btn-secondary"
              disabled={ocupado || !senhaAtual}
              onClick={() => void habilitarVisualizacao()}
              title="Confere a senha digitada em “Senha atual” e passa a poder exibi-la"
            >
              Habilitar visualização da senha atual
            </button>
          )}
        </div>
      </div>

      {/* Liberar */}
      <div style={cartao}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
          Liberar alteração dos arquivos protegidos
        </h2>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "0 0 12px" }}>
          Só use quando a alteração do núcleo de registro for intencional. A liberação vale 30
          minutos e fica registrada. Depois, o novo hash precisa ser registrado no INPI.
        </p>
        {bloqueado && bloqueado > new Date() && (
          <p style={{ fontSize: 12.5, color: "#b91c1c", margin: "0 0 12px" }}>
            Bloqueado por tentativas incorretas até {bloqueado.toLocaleTimeString("pt-BR")}.
          </p>
        )}
        {!st.senhaConfigurada ? (
          <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
            Defina a senha root acima para poder liberar.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 520 }}>
            <div style={{ flex: 1 }}>
              <label style={rotulo}>Senha root</label>
              <CampoSenha
                autoComplete="off"
                value={senhaLiberar}
                onChange={setSenhaLiberar}
                onKeyDown={(ev) => ev.key === "Enter" && senhaLiberar && void liberar()}
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={ocupado || !senhaLiberar}
              onClick={() => void liberar()}
            >
              Gerar token de liberação
            </button>
          </div>
        )}
        {liberacao && (
          <div style={{ marginTop: 16 }}>
            <label style={rotulo}>
              Token (vale até {fmtData(liberacao.expiraEm)}) — não compartilhe
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly style={{ ...campo, ...mono }} value={liberacao.token} />
              <button className="btn btn-secondary" onClick={() => void copiar(liberacao.token)}>
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
            <ol
              style={{
                fontSize: 12.5,
                color: "var(--ink-700)",
                margin: "12px 0 0",
                paddingLeft: 18
              }}
            >
              <li>
                No servidor: <span style={mono}>npm run rep:liberar -- &lt;token&gt;</span> (libera
                os arquivos para edição).
              </li>
              <li>Faça a alteração necessária no código.</li>
              <li>
                Sele o novo hash:{" "}
                <span style={mono}>
                  npm run rep:selar -- --motivo &quot;descreva a mudança&quot;
                </span>
              </li>
              <li>
                Gere o pacote para o INPI: <span style={mono}>npm run rep:hash</span>
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* Histórico */}
      <div style={cartao}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Histórico</h2>
        {st.historico.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>Nenhum registro ainda.</p>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table className="table-cfo" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Evento</th>
                  <th>Quem</th>
                  <th>IP</th>
                  <th>Motivo</th>
                  <th>Novo hash</th>
                </tr>
              </thead>
              <tbody>
                {st.historico.map((h) => (
                  <tr key={h.id}>
                    <td>{fmtData(h.createdAt)}</td>
                    <td>{TIPO_ROTULO[h.tipo] ?? h.tipo}</td>
                    <td>{h.ator ?? "—"}</td>
                    <td style={mono}>{h.ip ?? "—"}</td>
                    <td>{h.motivo ?? "—"}</td>
                    <td style={mono}>{h.hashNovo ? `${h.hashNovo.slice(0, 16)}…` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

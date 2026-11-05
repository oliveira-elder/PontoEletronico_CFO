import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../hooks/useApi";
import { Modal } from "../Modal";
import { lerArquivoBase64 } from "../saude/tipos";
import { SUBCATEGORIAS_ALTA_ADM, rotuloSubcategoria } from "../../pages/ponto/gestaoShared";

interface Pessoa {
  id: string;
  nome: string;
  email: string | null;
  ramal: string | null;
  secaoNome: string;
  subsecao: string | null;
  situacao:
    | "DISPONIVEL"
    | "SEM_EMAIL"
    | "EMAIL_GERAL"
    | "SOLICITACAO_PENDENTE"
    | "SOLICITACAO_AUTORIZADA";
}

interface Checagem {
  chave: string;
  rotulo: string;
  ok: boolean;
  detalhe?: string;
}

interface Verificacao {
  em: string;
  aprovado: boolean;
  checagens: Checagem[];
}

type Status = "PENDENTE" | "AUTORIZADA" | "NEGADA" | "REVOGADA";

interface Entrada {
  id: string;
  nomeApi: string;
  usuarioSso: string;
  emailInstitucional: string;
  cpf: string;
  subcategoria: string;
  numeroChamado: string;
  anexoNome: string;
  anexoSha256: string;
  status: Status;
  solicitadoPorNome: string;
  createdAt: string;
  decididoPorNome: string | null;
  decididoEm: string | null;
  categoriaMotivo: string | null;
  motivoDecisao: string | null;
  chamadoDecisao: string | null;
  resultadoVerificacao: Verificacao | null;
  solicitadoPorMim?: boolean;
}

const SITUACAO: Record<Pessoa["situacao"], { rotulo: string; cor: string; bg: string }> = {
  DISPONIVEL: { rotulo: "Disponível", cor: "#166534", bg: "rgba(22,128,61,0.10)" },
  SEM_EMAIL: { rotulo: "Sem e-mail na API", cor: "#92400e", bg: "rgba(217,119,6,0.14)" },
  EMAIL_GERAL: { rotulo: "E-mail geral/compartilhado", cor: "#b91c1c", bg: "rgba(200,57,63,0.12)" },
  SOLICITACAO_PENDENTE: {
    rotulo: "Solicitação pendente",
    cor: "#1a4f7a",
    bg: "rgba(26,79,122,0.10)"
  },
  SOLICITACAO_AUTORIZADA: { rotulo: "Autorizada", cor: "#166534", bg: "rgba(22,128,61,0.10)" }
};

const STATUS: Record<Status, { rotulo: string; cor: string; bg: string }> = {
  PENDENTE: { rotulo: "Pendente", cor: "#1a4f7a", bg: "rgba(26,79,122,0.10)" },
  AUTORIZADA: { rotulo: "Autorizada", cor: "#166534", bg: "rgba(22,128,61,0.10)" },
  NEGADA: { rotulo: "Negada", cor: "#b91c1c", bg: "rgba(200,57,63,0.12)" },
  REVOGADA: { rotulo: "Revogada", cor: "#92400e", bg: "rgba(217,119,6,0.14)" }
};

const MOTIVOS = [
  { v: "FRAUDE_SUSPEITA", l: "Suspeita de fraude" },
  { v: "ERRO_DE_CADASTRO", l: "Erro de cadastro" },
  { v: "DADOS_DIVERGENTES", l: "Dados divergentes" },
  { v: "OUTRO", l: "Outro" }
];

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

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

function Selo({ t }: { t: { rotulo: string; cor: string; bg: string } }) {
  return (
    <span
      style={{
        padding: "2px 9px",
        borderRadius: 999,
        background: t.bg,
        color: t.cor,
        fontWeight: 700,
        fontSize: 11.5,
        whiteSpace: "nowrap"
      }}
    >
      {t.rotulo}
    </span>
  );
}

function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Abre o anexo do chamado numa nova aba (aberta já no clique, para não ser bloqueada). */
async function abrirAnexo(id: string) {
  const aba = window.open("", "_blank");
  try {
    const blob = await api.blob(`/admin/extensions/sem-matricula/solicitacoes/${id}/anexo`);
    const url = URL.createObjectURL(blob);
    if (aba) aba.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (e) {
    aba?.close();
    alert("Não foi possível abrir o anexo: " + (e as Error).message);
  }
}

function Checklist({ v }: { v: Verificacao | null }) {
  if (!v) return null;
  return (
    <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, fontSize: 12.5 }}>
      {v.checagens.map((c) => (
        <li
          key={c.chave}
          style={{ display: "flex", gap: 8, padding: "2px 0", color: c.ok ? "#166534" : "#b91c1c" }}
        >
          <span aria-hidden>{c.ok ? "✓" : "✗"}</span>
          <span>
            {c.rotulo}
            {c.detalhe && <span style={{ color: "var(--ink-500)" }}> — {c.detalhe}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Sistema → Alta Administração (sem matrícula): pessoas da API sem matrícula, solicitações e decisões. */
export function AltaAdministracaoTab() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [sso, setSso] = useState<{ disponivel: boolean; exigeSegundoAprovador: boolean } | null>(
    null
  );
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [solicitar, setSolicitar] = useState<Pessoa | null>(null);
  const [decisao, setDecisao] = useState<{
    tipo: "autorizar" | "negar" | "revogar";
    e: Entrada;
  } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, e, s] = await Promise.all([
        api.get<Pessoa[]>("/admin/extensions/sem-matricula"),
        api.get<Entrada[]>("/admin/extensions/sem-matricula/solicitacoes"),
        api.get<{ disponivel: boolean; exigeSegundoAprovador: boolean }>(
          "/admin/extensions/sem-matricula/status-sso"
        )
      ]);
      setPessoas(p ?? []);
      setEntradas(e ?? []);
      setSso(s ?? null);
      setErro("");
    } catch (er) {
      setErro(er instanceof Error ? er.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pessoas;
    return pessoas.filter((p) =>
      `${p.nome} ${p.email ?? ""} ${p.secaoNome} ${p.ramal ?? ""}`.toLowerCase().includes(q)
    );
  }, [pessoas, busca]);

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

      <div style={cartao}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
          Alta Administração — entrada sem matrícula
        </h2>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "0 0 10px", lineHeight: 1.6 }}>
          Exceção para quem está na API de ramais <strong>sem matrícula</strong>. O RH solicita por
          chamado; o Super Administrador registra o chamado com o anexo, e{" "}
          <strong>
            {sso?.exigeSegundoAprovador === false
              ? "um Super Administrador"
              : "outro Super Administrador"}
          </strong>{" "}
          autoriza ou nega (fraude ou erro). A pessoa não registra ponto, não entra no REP-P e só
          pode ser da categoria Alta Administração. O acesso acompanha a conta do SSO/AD: se for
          desabilitada, o acesso no Ponto é revogado e não volta sozinho.
        </p>
        {sso && !sso.disponivel && (
          <p
            style={{
              margin: 0,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              background: "rgba(200,57,63,0.08)",
              color: "#b91c1c",
              fontSize: 12.5
            }}
          >
            Verificação do SSO/AD indisponível: a API Admin do Keycloak não respondeu (configure{" "}
            <code>KEYCLOAK_ADMIN_USER</code> e <code>KEYCLOAK_ADMIN_PASSWORD</code>). Enquanto isso,{" "}
            <strong>nenhuma entrada pode ser autorizada</strong>.
          </p>
        )}
      </div>

      <div style={cartao}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            Pessoas da API sem matrícula ({pessoas.length})
          </h2>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail, setor ou ramal"
            style={{ ...campo, maxWidth: 340 }}
          />
        </div>
        {carregando ? (
          <p style={{ color: "var(--ink-400)", fontSize: 13 }}>Carregando…</p>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table className="table-cfo table-cfo-destaque" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail (API)</th>
                  <th>Setor</th>
                  <th>Ramal</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nome}</strong>
                    </td>
                    <td style={mono}>{p.email ?? "—"}</td>
                    <td>
                      {p.secaoNome}
                      {p.subsecao ? ` › ${p.subsecao}` : ""}
                    </td>
                    <td>{p.ramal ?? "—"}</td>
                    <td>
                      <Selo t={SITUACAO[p.situacao]} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {(p.situacao === "DISPONIVEL" || p.situacao === "SEM_EMAIL") && (
                        <button className="btn btn-primary btn-sm" onClick={() => setSolicitar(p)}>
                          Solicitar entrada
                        </button>
                      )}
                      {p.situacao === "EMAIL_GERAL" && (
                        <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                          Corrija o e-mail na API
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: "center", color: "var(--ink-500)", padding: 20 }}
                    >
                      Nenhuma pessoa encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={cartao}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Solicitações</h2>
        {entradas.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
            Nenhuma solicitação ainda.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {entradas.map((e) => (
              <div
                key={e.id}
                style={{
                  border: "1px solid rgba(122,30,38,0.12)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center"
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13.5 }}>{e.nomeApi}</strong>{" "}
                    <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                      · {rotuloSubcategoria(e.subcategoria)} ·{" "}
                      <span style={mono}>{e.usuarioSso}</span> · chamado{" "}
                      <strong>{e.numeroChamado}</strong>
                    </span>
                  </div>
                  <Selo t={STATUS[e.status]} />
                </div>
                <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "4px 0 0" }}>
                  Solicitada por {e.solicitadoPorNome} em {fmtData(e.createdAt)} · anexo{" "}
                  {e.anexoNome} (SHA-256 <span style={mono}>{e.anexoSha256.slice(0, 12)}…</span>)
                  {e.decididoPorNome && (
                    <>
                      {" "}
                      · decidida por {e.decididoPorNome} em {fmtData(e.decididoEm)}
                      {e.categoriaMotivo
                        ? ` (${MOTIVOS.find((m) => m.v === e.categoriaMotivo)?.l ?? e.categoriaMotivo})`
                        : ""}
                    </>
                  )}
                </p>
                {e.motivoDecisao && (
                  <p style={{ fontSize: 12, color: "var(--ink-700)", margin: "4px 0 0" }}>
                    Motivo: {e.motivoDecisao}
                    {e.chamadoDecisao ? ` (chamado ${e.chamadoDecisao})` : ""}
                  </p>
                )}
                {(e.status === "PENDENTE" || e.status === "AUTORIZADA") && (
                  <Checklist v={e.resultadoVerificacao} />
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => void abrirAnexo(e.id)}>
                    Ver anexo
                  </button>
                  {e.status === "PENDENTE" && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!!e.solicitadoPorMim && sso?.exigeSegundoAprovador !== false}
                        title={
                          e.solicitadoPorMim && sso?.exigeSegundoAprovador !== false
                            ? "Quem registrou a solicitação não pode autorizá-la: outro Super Administrador deve decidir."
                            : undefined
                        }
                        onClick={() => setDecisao({ tipo: "autorizar", e })}
                      >
                        Autorizar
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDecisao({ tipo: "negar", e })}
                      >
                        Negar
                      </button>
                    </>
                  )}
                  {e.status === "AUTORIZADA" && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDecisao({ tipo: "revogar", e })}
                    >
                      Revogar acesso
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {solicitar && (
        <ModalSolicitar
          pessoa={solicitar}
          onClose={() => setSolicitar(null)}
          onFeito={(m) => {
            setSolicitar(null);
            setMsg(m);
            void carregar();
          }}
        />
      )}
      {decisao && (
        <ModalDecisao
          decisao={decisao}
          onClose={() => setDecisao(null)}
          onFeito={(m) => {
            setDecisao(null);
            setMsg(m);
            void carregar();
          }}
        />
      )}
    </section>
  );
}

function ModalSolicitar({
  pessoa,
  onClose,
  onFeito
}: {
  pessoa: Pessoa;
  onClose: () => void;
  onFeito: (msg: string) => void;
}) {
  const [usuario, setUsuario] = useState("");
  const [cpf, setCpf] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [chamado, setChamado] = useState("");
  const [arq, setArq] = useState<{ base64: string; nome: string; kb: number } | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const usuarioNorm = usuario.trim().toLowerCase();

  async function enviar() {
    setErro("");
    if (!usuarioNorm || !subcategoria || !chamado.trim() || !arq) {
      return setErro(
        "Preencha o usuário, a subcategoria e o chamado, e anexe o print ou PDF do chamado."
      );
    }
    if (cpf && cpf.replace(/\D/g, "").length !== 11) {
      return setErro("CPF incompleto: informe os 11 dígitos ou deixe em branco.");
    }
    setEnviando(true);
    try {
      await api.post("/admin/extensions/sem-matricula/solicitacoes", {
        apiId: pessoa.id,
        usuarioSso: usuarioNorm,
        cpf: cpf || undefined,
        subcategoria,
        numeroChamado: chamado.trim(),
        arquivoBase64: arq.base64,
        nomeArquivo: arq.nome
      });
      onFeito(
        "Solicitação registrada como PENDENTE. Outro Super Administrador deve autorizar ou negar."
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      eyebrow="Alta Administração"
      title="Solicitar entrada sem matrícula"
      subtitle={pessoa.nome}
      onClose={() => !enviando && onClose()}
      maxWidth={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: 0, lineHeight: 1.6 }}>
          Registra a requisição do RH. <strong>Nada é liberado agora</strong>: a solicitação fica
          pendente e passa por verificações do SSO/AD (conta pessoal, habilitada) antes de outro
          Super Administrador decidir.
        </p>
        <div>
          <label style={rotulo}>Usuário do SSO (login da pessoa) *</label>
          <input
            style={campo}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="ex.: marcondes.junior"
            autoComplete="off"
          />
          <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "4px 0 0" }}>
            E-mail institucional que será gravado:{" "}
            <span style={mono}>
              {usuarioNorm ? `${usuarioNorm}@cfo.org.br` : "usuario@cfo.org.br"}
            </span>
            . Deve ser a conta <strong>pessoal</strong> (nome.sobrenome); e-mail geral não é aceito.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={rotulo}>CPF (opcional)</label>
            <input
              style={campo}
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              placeholder="000.000.000-00"
            />
          </div>
          <div>
            <label style={rotulo}>Subcategoria *</label>
            <select
              style={campo}
              value={subcategoria}
              onChange={(e) => setSubcategoria(e.target.value)}
            >
              <option value="">Selecione…</option>
              {SUBCATEGORIAS_ALTA_ADM.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label style={rotulo}>Número do chamado *</label>
          <input
            style={campo}
            value={chamado}
            onChange={(e) => setChamado(e.target.value)}
            placeholder="ex.: GLPI-10191"
          />
        </div>
        <div>
          <label style={rotulo}>
            Print ou PDF da solicitação do chamado * (PDF, JPG ou PNG, até 8 MB)
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              if (f)
                setArq({
                  base64: await lerArquivoBase64(f),
                  nome: f.name,
                  kb: Math.round(f.size / 1024)
                });
            }}
          />
          {arq && (
            <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "4px 0 0" }}>
              {arq.nome} ({arq.kb} KB)
            </p>
          )}
        </div>
        {erro && <p style={{ margin: 0, color: "var(--red)", fontSize: 12.5 }}>⚠ {erro}</p>}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            paddingTop: 12,
            borderTop: "1px solid rgba(122,30,38,0.10)"
          }}
        >
          <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => void enviar()} disabled={enviando}>
            {enviando ? "Enviando…" : "Registrar solicitação"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ModalDecisao({
  decisao,
  onClose,
  onFeito
}: {
  decisao: { tipo: "autorizar" | "negar" | "revogar"; e: Entrada };
  onClose: () => void;
  onFeito: (msg: string) => void;
}) {
  const { tipo, e } = decisao;
  const [confirmo, setConfirmo] = useState(false);
  const [categoriaMotivo, setCategoriaMotivo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [chamado, setChamado] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const titulo =
    tipo === "autorizar"
      ? "Autorizar entrada"
      : tipo === "negar"
        ? "Negar entrada"
        : "Revogar acesso";

  async function enviar() {
    setErro("");
    setEnviando(true);
    try {
      const base = `/admin/extensions/sem-matricula/solicitacoes/${e.id}`;
      if (tipo === "autorizar") {
        await api.post(`${base}/autorizar`, { confirmo });
        onFeito(
          `Entrada de ${e.nomeApi} AUTORIZADA. No primeiro login do SSO o acesso é vinculado.`
        );
      } else if (tipo === "negar") {
        await api.post(`${base}/negar`, { categoriaMotivo, motivo });
        onFeito(`Entrada de ${e.nomeApi} NEGADA.`);
      } else {
        await api.post(`${base}/revogar`, { categoriaMotivo, motivo, chamado });
        onFeito(`Acesso de ${e.nomeApi} REVOGADO.`);
      }
    } catch (er) {
      setErro((er as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      eyebrow="Alta Administração"
      title={titulo}
      subtitle={`${e.nomeApi} · chamado ${e.numeroChamado}`}
      onClose={() => !enviando && onClose()}
      maxWidth={620}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {tipo === "autorizar" ? (
          <>
            <p style={{ fontSize: 12.5, color: "var(--ink-700)", margin: 0, lineHeight: 1.6 }}>
              Ao autorizar, o sistema <strong>refaz as verificações</strong> (SSO, AD, e-mail
              pessoal, CPF) e só então cria o cadastro da Alta Administração, sem matrícula. Confira
              o <strong>anexo do chamado</strong> antes de decidir.
            </p>
            <Checklist v={e.resultadoVerificacao} />
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={confirmo}
                onChange={(ev) => setConfirmo(ev.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>Autorizo expressamente</strong> a entrada desta pessoa sem matrícula,
                conforme a requisição do RH (chamado {e.numeroChamado}), ciente de que a
                responsabilidade pela autenticidade do chamado é minha e fica registrada.
              </span>
            </label>
          </>
        ) : (
          <>
            <div>
              <label style={rotulo}>Tipo do motivo *</label>
              <select
                style={campo}
                value={categoriaMotivo}
                onChange={(ev) => setCategoriaMotivo(ev.target.value)}
              >
                <option value="">Selecione…</option>
                {MOTIVOS.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={rotulo}>Descrição do motivo * (mínimo de 10 caracteres)</label>
              <textarea
                style={{ ...campo, height: 84, padding: 10 }}
                value={motivo}
                onChange={(ev) => setMotivo(ev.target.value)}
              />
            </div>
            {tipo === "revogar" && (
              <div>
                <label style={rotulo}>Número do chamado da revogação *</label>
                <input
                  style={campo}
                  value={chamado}
                  onChange={(ev) => setChamado(ev.target.value)}
                  placeholder="ex.: GLPI-20000"
                />
              </div>
            )}
          </>
        )}
        {erro && <p style={{ margin: 0, color: "var(--red)", fontSize: 12.5 }}>⚠ {erro}</p>}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            paddingTop: 12,
            borderTop: "1px solid rgba(122,30,38,0.10)"
          }}
        >
          <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void enviar()}
            disabled={
              enviando ||
              (tipo === "autorizar"
                ? !confirmo
                : !categoriaMotivo ||
                  motivo.trim().length < 10 ||
                  (tipo === "revogar" && !chamado.trim()))
            }
          >
            {enviando ? "Enviando…" : titulo}
          </button>
        </div>
      </div>
    </Modal>
  );
}

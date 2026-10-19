import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import { TextoTermo } from "./TextoTermo";

interface Vigente {
  termo: {
    id: string;
    versao: number;
    titulo: string;
    conteudo: string;
    resumoAlteracoes: string | null;
    publicadoEm: string | null;
  } | null;
  aceite: { aceitoEm: string; codigo: string } | null;
  usuario: { nome: string; matricula: string | null };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * Aceite obrigatório dos Termos de Uso: aparece em qualquer tela até o aceite (sem fechar). Para não
 * restringir a marcação (Portaria 671, art. 74), "Registrar ponto agora" esconde o aviso só até a batida
 * ser concluída — em seguida ele volta.
 */
export function AceiteTermosModal() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const local = useLocation();
  const [vig, setVig] = useState<Vigente | null>(null);
  const [adiado, setAdiado] = useState(false);
  const [leuAteFim, setLeuAteFim] = useState(false);
  const [marcou, setMarcou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aceito, setAceito] = useState<{ codigo: string; aceitoEm: string } | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    api
      .get<Vigente>("/termos-uso/vigente")
      .then((v) => setVig(v))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    carregar();
    const reabrir = () => {
      setAdiado(false);
      carregar();
    };
    const aposBatida = () => setAdiado(false);
    window.addEventListener("termos-pendentes", reabrir);
    window.addEventListener("ponto-registrado", aposBatida);
    return () => {
      window.removeEventListener("termos-pendentes", reabrir);
      window.removeEventListener("ponto-registrado", aposBatida);
    };
  }, [carregar]);

  /* Saiu da tela de registro sem bater o ponto: o aviso volta. */
  useEffect(() => {
    if (adiado && local.pathname !== "/ponto/registrar") setAdiado(false);
  }, [local.pathname, adiado]);

  /* Texto curto (sem rolagem): considera lido. */
  useEffect(() => {
    const el = rolagem.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) setLeuAteFim(true);
  }, [vig]);

  const pendente = !!vig?.termo && !vig.aceite;
  if (aceito) {
    return (
      <Fundo>
        <div style={{ ...CARTAO, maxWidth: 480, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, color: "#15803D" }}>✓</div>
          <h2 style={{ fontFamily: "var(--font-display)", margin: "4px 0 10px" }}>
            Termos aceitos
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-700)", margin: 0 }}>
            {vig?.usuario.nome}
            {vig?.usuario.matricula ? ` — Matrícula nº ${vig.usuario.matricula}` : ""}
            <br />
            Versão {vig?.termo?.versao} · aceito em {fmt(aceito.aceitoEm)}
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "10px 0 16px" }}>
            Código do aceite:{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{aceito.codigo}</span>
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setAceito(null);
              carregar();
            }}
          >
            Continuar
          </button>
        </div>
      </Fundo>
    );
  }
  if (!pendente || adiado || !vig?.termo) return null;
  const termo = vig.termo;

  async function aceitar() {
    setEnviando(true);
    setErro("");
    try {
      const r = await api.post<{ codigo: string; aceitoEm: string }>(
        `/termos-uso/${termo.id}/aceitar`,
        { confirmacao: true }
      );
      setAceito(r);
      setVig((v) => (v ? { ...v, aceite: r } : v));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Fundo>
      <div role="dialog" aria-modal="true" aria-label="Termos de Uso" style={CARTAO}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(122,30,38,0.12)" }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Aceite obrigatório · versão {termo.versao}
          </p>
          <strong style={{ fontSize: 16 }}>{termo.titulo}</strong>
          {termo.resumoAlteracoes && termo.versao > 1 && (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#92400E" }}>
              Nova versão: {termo.resumoAlteracoes}
            </p>
          )}
        </div>
        <div
          ref={rolagem}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) setLeuAteFim(true);
          }}
          style={{ flex: 1, overflow: "auto", padding: "16px 22px", background: "#fffdfb" }}
        >
          <TextoTermo conteudo={termo.conteudo} />
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(122,30,38,0.12)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            Aceite de: <strong>{vig.usuario.nome}</strong>
            {vig.usuario.matricula ? (
              <>
                {" "}
                — Matrícula nº <strong>{vig.usuario.matricula}</strong>
              </>
            ) : null}
          </p>
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 13,
              opacity: leuAteFim ? 1 : 0.55
            }}
          >
            <input
              type="checkbox"
              disabled={!leuAteFim}
              checked={marcou}
              onChange={(e) => setMarcou(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            Li e aceito os Termos de Uso (versão {termo.versao}). Reconheço que este aceite é
            registrado com meu nome, matrícula, data, hora, endereço IP e navegador.
          </label>
          {!leuAteFim && (
            <p style={{ margin: "4px 0 0 24px", fontSize: 11.5, color: "var(--ink-500)" }}>
              Role o texto até o fim para habilitar o aceite.
            </p>
          )}
          {erro && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#991B1B" }}>⚠ {erro}</p>}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 12,
              flexWrap: "wrap",
              alignItems: "center"
            }}
          >
            <button
              type="button"
              className="btn btn-primary"
              disabled={!leuAteFim || !marcou || enviando}
              onClick={() => void aceitar()}
            >
              {enviando ? "Registrando…" : "Aceitar e continuar"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              title="O registro de ponto não depende do aceite (Portaria MTP 671/2021, art. 74)"
              onClick={() => {
                setAdiado(true);
                navigate("/ponto/registrar");
              }}
            >
              Registrar ponto agora
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
      </div>
    </Fundo>
  );
}

const CARTAO: React.CSSProperties = {
  background: "#fff",
  borderRadius: "var(--radius-lg)",
  width: "100%",
  maxWidth: 760,
  maxHeight: "92vh",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 16px 60px rgba(10,5,6,0.35)",
  overflow: "hidden"
};

function Fundo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background: "rgba(10,5,6,0.62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12
      }}
    >
      {children}
    </div>
  );
}

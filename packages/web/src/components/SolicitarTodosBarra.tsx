import React, { useEffect, useState } from "react";
import { api } from "../hooks/useApi";
import { XIcon } from "./icons";
import { AvisoOriginaisRh } from "./AvisoOriginaisRh";
import {
  REQUERIMENTO_INFO,
  TIPOS_REQUERIMENTO_CADASTRO,
  type TipoRequerimento
} from "../utils/requerimentos";

const PALAVRA_CONFIRMACAO = "CONFIRMAR";

const rotasTodos = (tipo: TipoRequerimento) =>
  tipo === "ENDERECO"
    ? {
        alvos: "/ponto/gestao/requerimento-endereco/alvos",
        enviar: "/ponto/gestao/requerimento-endereco/todos"
      }
    : {
        alvos: `/ponto/gestao/requerimento-cadastro/${tipo}/alvos`,
        enviar: `/ponto/gestao/requerimento-cadastro/${tipo}/todos`
      };

/**
 * Confirmação em duas etapas para solicitar um requerimento a todos:
 * 1) resumo (o que, para quantos, aviso dos originais no RH); 2) digitar CONFIRMAR.
 */
function ConfirmarSolicitacaoTodosModal({
  tipo,
  onClose,
  onEnviado
}: {
  tipo: TipoRequerimento;
  onClose: () => void;
  onEnviado: (total: number) => void;
}) {
  const info = REQUERIMENTO_INFO[tipo];
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [total, setTotal] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api
      .get<{ total: number }>(rotasTodos(tipo).alvos)
      .then((r) => setTotal(r?.total ?? 0))
      .catch(() => setErro("Não foi possível contar os destinatários."));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !enviando) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tipo]);

  async function enviar() {
    setEnviando(true);
    setErro("");
    try {
      const r = await api.post<{ total: number }>(rotasTodos(tipo).enviar, {});
      onEnviado(r?.total ?? 0);
    } catch (e) {
      setErro((e as Error)?.message ?? "Erro ao enviar.");
      setEnviando(false);
    }
  }

  const liberado = texto.trim().toUpperCase() === PALAVRA_CONFIRMACAO && !enviando;
  const plural = (n: number) => `${n} ${n === 1 ? "funcionário" : "funcionários"}`;

  return (
    <>
      <div
        onClick={() => !enviando && onClose()}
        style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.45)", zIndex: 100 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitar-todos-titulo"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "90dvh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          zIndex: 101,
          boxShadow: "0 24px 80px rgba(10,5,6,0.28)",
          padding: "20px 22px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "var(--gold-500)",
                margin: "0 0 2px"
              }}
            >
              Etapa {etapa} de 2
            </p>
            <h2
              id="solicitar-todos-titulo"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 19,
                color: "var(--burgundy-600)",
                fontWeight: 400,
                margin: 0
              }}
            >
              Solicitar {info.rotulo} a todos
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            aria-label="Fechar"
            style={{
              padding: 6,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--ink-500)",
              alignSelf: "flex-start"
            }}
          >
            <XIcon size={18} />
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontSize: 13.5,
            color: "var(--ink-700)",
            lineHeight: 1.55
          }}
        >
          {etapa === 1 ? (
            <>
              <p style={{ margin: 0 }}>
                Será enviado um requerimento para o funcionário informar{" "}
                <strong>{info.rotulo.toLowerCase()}</strong>. O pedido aparece no Dashboard e em
                &quot;Minhas Requisições&quot; de cada um.
              </p>
              <p
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--cream-50)",
                  border: "1px solid rgba(122,30,38,0.10)"
                }}
              >
                Destinatários: <strong>{total === null ? "contando…" : plural(total)}</strong> (
                {info.publico}).
                <br />
                <span style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                  Quem já respondeu terá o pedido reaberto.
                </span>
              </p>
              <AvisoOriginaisRh tipo={tipo} />
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                Você está prestes a enviar o requerimento de{" "}
                <strong>{info.rotulo.toLowerCase()}</strong> para{" "}
                <strong>{plural(total ?? 0)}</strong>. Esta ação não pode ser desfeita em massa.
              </p>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-700)" }}>
                Digite <strong>{PALAVRA_CONFIRMACAO}</strong> para enviar:
                <input
                  type="text"
                  autoFocus
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && liberado) void enviar();
                  }}
                  placeholder={PALAVRA_CONFIRMACAO}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.20)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    boxSizing: "border-box"
                  }}
                />
              </label>
            </>
          )}

          {erro && <p style={{ margin: 0, fontSize: 12, color: "var(--red)" }}>{erro}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={etapa === 1 ? onClose : () => setEtapa(1)}
              disabled={enviando}
              style={{ flex: 1 }}
            >
              {etapa === 1 ? "Cancelar" : "Voltar"}
            </button>
            {etapa === 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setEtapa(2)}
                disabled={!total}
                style={{ flex: 2 }}
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void enviar()}
                disabled={!liberado}
                style={{ flex: 2, opacity: liberado ? 1 : 0.55 }}
              >
                {enviando ? "Enviando…" : `Enviar para ${plural(total ?? 0)}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Barra "Solicitar a todos": Endereço | Dependentes | Formação Acadêmica | Cursos. */
/** Função do Perfil do RH de cada botão "Solicitar a todos". */
export const FUNCAO_SOLICITAR_TODOS: Record<TipoRequerimento, string> = {
  ENDERECO: "gestao.solicitar-todos.endereco",
  DEPENDENTES: "gestao.solicitar-todos.dependentes",
  FORMACAO_ACADEMICA: "gestao.solicitar-todos.formacao",
  CAPACITACOES: "gestao.solicitar-todos.cursos"
};

export function SolicitarTodosBarra({
  pode = () => true
}: {
  /** Perfil do RH: o botão do tipo está liberado? */
  pode?: (recurso: string) => boolean;
}) {
  const [aberto, setAberto] = useState<TipoRequerimento | null>(null);
  const [enviado, setEnviado] = useState<{ tipo: TipoRequerimento; total: number } | null>(null);

  const tipos = (["ENDERECO", ...TIPOS_REQUERIMENTO_CADASTRO] as TipoRequerimento[]).filter((t) =>
    pode(FUNCAO_SOLICITAR_TODOS[t])
  );
  if (!tipos.length) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        flexWrap: "wrap"
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-500)" }}>
        Solicitar a todos:
      </span>
      {tipos.map((tipo) => {
        const ok = enviado?.tipo === tipo;
        return (
          <button
            key={tipo}
            type="button"
            onClick={() => setAberto(tipo)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              borderRadius: "var(--radius-md)",
              border: "1.5px solid rgba(122,30,38,0.22)",
              background: ok ? "rgba(47,125,79,0.08)" : "transparent",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              color: ok ? "var(--green)" : "var(--ink-700)",
              whiteSpace: "nowrap"
            }}
          >
            <span aria-hidden>{REQUERIMENTO_INFO[tipo].icone}</span>
            {ok ? `✓ Enviado a ${enviado.total}` : REQUERIMENTO_INFO[tipo].rotulo}
          </button>
        );
      })}

      {aberto && (
        <ConfirmarSolicitacaoTodosModal
          tipo={aberto}
          onClose={() => setAberto(null)}
          onEnviado={(total) => {
            setEnviado({ tipo: aberto, total });
            setAberto(null);
            setTimeout(() => setEnviado(null), 5000);
          }}
        />
      )}
    </div>
  );
}

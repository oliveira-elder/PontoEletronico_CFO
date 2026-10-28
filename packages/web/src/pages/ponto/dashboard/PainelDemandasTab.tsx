import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../hooks/useApi";
import { EmployeeListModal } from "../../../components/dashboard/EmployeeListModal";
import {
  AlertCircleIcon,
  BellIcon,
  BuildingIcon,
  ClipboardListIcon,
  FileTextIcon,
  InboxIcon,
  RefreshCwIcon,
  ShieldCheckIcon
} from "../../../components/icons";

type Nivel = "ok" | "atencao" | "urgente";

interface Cartao {
  id: string;
  secao: string;
  titulo: string;
  total: number;
  nivel: Nivel;
  rota: string;
  detalhe?: string;
  itens: { nome: string; matricula: string | null; extra: string | null }[];
}

interface PainelResposta {
  geradoEm: string;
  cartoes: Cartao[];
}

const ATUALIZACAO_MS = 30_000;

const COR: Record<Nivel, { cor: string; fundo: string; rotulo: string }> = {
  ok: { cor: "var(--green)", fundo: "rgba(34,139,84,0.06)", rotulo: "Em dia" },
  atencao: { cor: "#c67f00", fundo: "rgba(198,127,0,0.08)", rotulo: "Atenção" },
  urgente: { cor: "var(--red)", fundo: "rgba(200,57,63,0.08)", rotulo: "Urgente" }
};

const ICONE_SECAO: Record<string, React.ElementType> = {
  Aprovações: InboxIcon,
  "Folhas de ponto": FileTextIcon,
  "Saúde ocupacional": ShieldCheckIcon,
  "Requisições do RH": ClipboardListIcon,
  "Contratos e cadastro": BuildingIcon
};

const hhmmss = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Painel de acompanhamento das demandas em tempo real (atualiza sozinho a cada 30 s). */
export function PainelDemandasTab({ token }: { token: string }) {
  const [dados, setDados] = useState<PainelResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<Cartao | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "pendentes">("todos");
  const montado = useRef(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await api.get<PainelResposta>("/ponto/gestao/dashboard/painel", token);
      if (!montado.current) return;
      setDados(res ?? null);
      setErro(null);
    } catch (e) {
      if (montado.current) setErro((e as Error).message || "Não foi possível carregar o painel.");
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    montado.current = true;
    void carregar();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, ATUALIZACAO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      montado.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [carregar]);

  if (!dados) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: erro ? "var(--red)" : "var(--ink-500)"
        }}
      >
        {erro ?? "Carregando…"}
      </div>
    );
  }

  const cartoes = dados.cartoes.filter((c) => filtro === "todos" || c.total > 0);
  const secoes = [...new Set(cartoes.map((c) => c.secao))];
  const totalPendente = dados.cartoes.reduce((s, c) => s + c.total, 0);
  const urgentes = dados.cartoes.filter((c) => c.nivel === "urgente").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              fontWeight: 700,
              color: erro ? "var(--red)" : "var(--green)"
            }}
            title="O painel se atualiza sozinho a cada 30 segundos"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: erro ? "var(--red)" : "var(--green)"
              }}
            />
            {erro ? "Sem conexão" : "Ao vivo"}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
            atualizado às {hhmmss(new Date(dados.geradoEm))} · {totalPendente} demanda
            {totalPendente === 1 ? "" : "s"}
            {urgentes > 0 ? ` · ${urgentes} urgente${urgentes === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["todos", "pendentes"] as const).map((f) => (
            <button
              key={f}
              className={filtro === f ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              onClick={() => setFiltro(f)}
            >
              {f === "todos" ? "Todos" : "Só com pendência"}
            </button>
          ))}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void carregar()}
            disabled={carregando}
          >
            <RefreshCwIcon size={13} /> Atualizar
          </button>
        </div>
      </div>

      {secoes.length === 0 && (
        <p style={{ textAlign: "center", color: "var(--ink-500)", fontSize: 13, padding: 24 }}>
          Nenhuma demanda pendente. 🎉
        </p>
      )}

      {secoes.map((secao) => {
        const Icone = ICONE_SECAO[secao] ?? BellIcon;
        return (
          <section key={secao}>
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                margin: "0 0 10px"
              }}
            >
              <Icone size={14} /> {secao}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                gap: 12
              }}
            >
              {cartoes
                .filter((c) => c.secao === secao)
                .map((c) => {
                  const t = COR[c.nivel];
                  return (
                    <button
                      key={c.id}
                      onClick={() => setAberto(c)}
                      title={`${t.rotulo} — clique para ver a lista`}
                      style={{
                        position: "relative",
                        overflow: "hidden",
                        textAlign: "left",
                        cursor: "pointer",
                        background: t.fundo,
                        border: "1px solid rgba(122,30,38,0.08)",
                        borderTop: `3px solid ${t.cor}`,
                        borderRadius: "var(--radius-lg)",
                        padding: "14px 14px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        minHeight: 104,
                        transition: "box-shadow 150ms"
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.boxShadow = "0 2px 10px rgba(122,30,38,0.12)")
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                    >
                      <Icone
                        size={64}
                        style={{
                          position: "absolute",
                          right: -8,
                          bottom: -10,
                          color: t.cor,
                          opacity: 0.1
                        }}
                      />
                      <span
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          lineHeight: 1,
                          color: t.cor,
                          fontFamily: "var(--font-display)"
                        }}
                      >
                        {c.total}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-800)" }}>
                        {c.titulo}
                      </span>
                      {c.detalhe && (
                        <span style={{ fontSize: 11, color: "var(--ink-500)" }}>{c.detalhe}</span>
                      )}
                      {c.nivel === "urgente" && (
                        <AlertCircleIcon
                          size={14}
                          style={{ position: "absolute", top: 10, right: 10, color: t.cor }}
                        />
                      )}
                    </button>
                  );
                })}
            </div>
          </section>
        );
      })}

      {aberto && (
        <EmployeeListModal
          title={aberto.titulo}
          subtitle={aberto.secao}
          items={aberto.itens}
          vazio="Nenhum item pendente."
          onClose={() => setAberto(null)}
          rodape={
            <Link to={aberto.rota} className="btn btn-primary btn-sm">
              Abrir a tela →
            </Link>
          }
        />
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../hooks/useApi";
import { BellIcon, CheckCircleIcon } from "../../components/icons";

interface Notificacao {
  id: string;
  titulo: string;
  corpo?: string;
  tipo?: string;
  lida: boolean;
  criadoEm: string;
}

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} dia${d > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function dataCompleta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function NotificacoesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const abertaId = searchParams.get("id");
  const [notifs, setNotifs] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const carregar = useCallback(async () => {
    try {
      const data = await api.get<Notificacao[]>("/notificacao/minhas?limit=100");
      setNotifs(data ?? []);
    } catch {
      setNotifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcarLida(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    try {
      await api.patch(`/notificacao/${id}/lida`);
    } catch {
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lida: false } : n)));
    }
  }

  async function marcarTodas() {
    setMarcandoTodas(true);
    setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
    try {
      await api.patch("/notificacao/marcar-todas-lidas");
    } catch {
      void carregar();
    } finally {
      setMarcandoTodas(false);
    }
  }

  function abrirNotificacao(id: string) {
    setSearchParams({ id }, { replace: true });
  }

  useEffect(() => {
    if (!abertaId || loading) return;

    const el = itemRefs.current[abertaId];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    const notif = notifs.find((n) => n.id === abertaId);
    if (notif && !notif.lida) {
      void marcarLida(abertaId);
    }
  }, [abertaId, loading, notifs]);

  const naoLidas = notifs.filter((n) => !n.lida).length;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 0 48px" }}>
      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BellIcon size={22} style={{ color: "var(--burgundy-600)" }} />
          <div>
            <h1
              style={{
                fontSize: "clamp(20px,3vw,26px)",
                fontFamily: "var(--font-display)",
                lineHeight: 1.1,
                margin: 0
              }}
            >
              <em>Notificações</em>
            </h1>
            {naoLidas > 0 && (
              <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "2px 0 0" }}>
                {naoLidas} não lida{naoLidas > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
        {naoLidas > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void marcarTodas()}
            disabled={marcandoTodas}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <CheckCircleIcon size={15} />
            {marcandoTodas ? "Marcando…" : "Marcar todas como lidas"}
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <p style={{ color: "var(--ink-500)", fontSize: 14 }}>Carregando…</p>
      ) : notifs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-400)" }}>
          <BellIcon size={40} style={{ opacity: 0.25, marginBottom: 12 }} />
          <p style={{ fontSize: 14, margin: 0 }}>Nenhuma notificação ainda.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notifs.map((n) => {
            const isAberta = abertaId === n.id;
            return (
              <div
                key={n.id}
                ref={(el) => {
                  itemRefs.current[n.id] = el;
                }}
                onClick={() => abrirNotificacao(n.id)}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: isAberta ? "18px 18px" : "14px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "2px solid",
                  borderColor: isAberta
                    ? "var(--burgundy-600)"
                    : n.lida
                      ? "rgba(122,30,38,0.07)"
                      : "rgba(122,30,38,0.18)",
                  background: isAberta
                    ? "rgba(122,30,38,0.06)"
                    : n.lida
                      ? "#fff"
                      : "rgba(122,30,38,0.03)",
                  cursor: "pointer",
                  transition: "background 160ms, border-color 160ms, padding 160ms",
                  alignItems: "flex-start",
                  boxShadow: isAberta ? "0 4px 16px rgba(122,30,38,0.10)" : "none"
                }}
                onMouseEnter={(e) => {
                  if (!isAberta) {
                    (e.currentTarget as HTMLDivElement).style.background = "rgba(122,30,38,0.06)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAberta) {
                    (e.currentTarget as HTMLDivElement).style.background = n.lida
                      ? "#fff"
                      : "rgba(122,30,38,0.03)";
                  }
                }}
              >
                {/* Indicador não lida */}
                <div style={{ paddingTop: 5, flexShrink: 0 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: n.lida ? "transparent" : "var(--burgundy-600)",
                      border: n.lida ? "1.5px solid rgba(122,30,38,0.18)" : "none",
                      transition: "all 200ms"
                    }}
                  />
                </div>

                {/* Conteúdo */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: isAberta ? 15 : 13.5,
                      fontWeight: n.lida && !isAberta ? 400 : 600,
                      color: "var(--ink-900)",
                      margin: "0 0 3px",
                      lineHeight: 1.35
                    }}
                  >
                    {n.titulo}
                  </p>
                  {n.corpo && (
                    <p
                      style={{
                        fontSize: isAberta ? 13.5 : 12.5,
                        color: "var(--ink-500)",
                        margin: "0 0 6px",
                        lineHeight: 1.55,
                        whiteSpace: isAberta ? "pre-wrap" : "normal",
                        overflow: isAberta ? "visible" : "hidden",
                        display: isAberta ? "block" : "-webkit-box",
                        WebkitLineClamp: isAberta ? undefined : 2,
                        WebkitBoxOrient: isAberta ? undefined : "vertical"
                      }}
                    >
                      {n.corpo}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: "var(--ink-400)", margin: 0 }}>
                    {isAberta ? dataCompleta(n.criadoEm) : tempoRelativo(n.criadoEm)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

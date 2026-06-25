import React, { useRef, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { MapPinIcon, MailIcon, PhoneIcon, BellIcon } from "../icons";
import { useAuth } from "../../auth/AuthContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { api } from "../../hooks/useApi";

/* ─── Chip (faixa 1) ─── */
function TopChip({
  icon,
  children,
  variant = "default",
  href
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "amber";
  href?: string;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px 3px 6px",
    borderRadius: 100,
    fontSize: 11.5,
    fontWeight: variant === "amber" ? 600 : 500,
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    cursor: href ? "pointer" : "default",
    textDecoration: "none",
    ...(variant === "amber"
      ? {
          background: "var(--amber)",
          color: "var(--ink-900)",
          border: "1px solid transparent"
        }
      : {
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.16)",
          color: "rgba(255,255,255,0.90)"
        })
  };

  const content = (
    <>
      {icon && <span style={{ opacity: variant === "amber" ? 0.8 : 0.7 }}>{icon}</span>}
      {children}
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={base}>
        {content}
      </a>
    );
  }
  return <span style={base}>{content}</span>;
}

/* ─── Avatar com foto de perfil e popover ─── */
function AvatarPerfil() {
  const { user, token, refreshProfile } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [solicitando, setSolicitando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fotoUrl = user?.funcionario?.fotoPerfilUrl ?? null;
  const flagAtiva = user?.funcionario?.solicitarAtualizacaoFoto ?? false;
  const inicial = (user?.name?.[0] ?? user?.username?.[0] ?? "?").toUpperCase();

  /* Fecha ao clicar fora */
  React.useEffect(() => {
    if (!aberto) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
        setConfirmado(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [aberto]);

  async function solicitarAtualizacao() {
    setSolicitando(true);
    try {
      await api.post("/ponto/minha-foto/solicitar-atualizacao", {}, token());
      await refreshProfile();
      setConfirmado(true);
    } finally {
      setSolicitando(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Botão avatar */}
      <button
        onClick={() => {
          setAberto((v) => !v);
          setConfirmado(false);
        }}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: fotoUrl ? "2px solid var(--burgundy-600)" : "2px solid rgba(122,30,38,0.20)",
          background: fotoUrl ? "transparent" : "var(--burgundy-600)",
          cursor: "pointer",
          padding: 0,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "border-color 150ms"
        }}
        title="Foto de perfil"
        aria-label="Foto de perfil"
      >
        {fotoUrl ? (
          <img
            src={fotoUrl}
            alt="Foto de perfil"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
            {inicial}
          </span>
        )}
      </button>

      {/* Popover */}
      {aberto && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 260,
            background: "#fff",
            borderRadius: "var(--radius-xl)",
            boxShadow: "0 8px 32px rgba(10,5,6,0.18)",
            border: "1px solid rgba(122,30,38,0.10)",
            overflow: "hidden",
            zIndex: 200
          }}
        >
          {/* Cabeçalho do popover */}
          <div
            style={{
              background:
                "linear-gradient(135deg, var(--burgundy-700) 0%, var(--burgundy-600) 100%)",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10
            }}
          >
            {/* Foto grande no popover */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                border: "3px solid rgba(255,255,255,0.50)",
                overflow: "hidden",
                background: "rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              {fotoUrl ? (
                <img
                  src={fotoUrl}
                  alt="Foto de perfil"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>{inicial}</span>
              )}
            </div>
            <div style={{ textAlign: "center" }}>
              <p
                style={{ color: "#fff", fontWeight: 600, fontSize: 13, margin: 0, lineHeight: 1.3 }}
              >
                {user?.name || user?.username}
              </p>
              <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, margin: "2px 0 0" }}>
                {user?.emailReal ?? user?.email?.replace(/@(sso|pending)\.local$/, "@cfo.org.br")}
              </p>
            </div>
          </div>

          {/* Corpo do popover */}
          <div style={{ padding: "14px 16px" }}>
            {!fotoUrl ? (
              /* Sem foto ainda */
              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--ink-500)",
                    margin: "0 0 4px",
                    lineHeight: 1.5
                  }}
                >
                  Sem foto de perfil
                </p>
                <p style={{ fontSize: 11, color: "var(--ink-400)", margin: 0, lineHeight: 1.5 }}>
                  Sua foto será definida automaticamente no primeiro registro de ponto com câmera.
                </p>
              </div>
            ) : confirmado || flagAtiva ? (
              /* Solicitação já enviada */
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(47,125,79,0.08)",
                  border: "1px solid rgba(47,125,79,0.20)"
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>✓</span>
                <p
                  style={{
                    fontSize: 12,
                    color: "#2f7d4f",
                    margin: 0,
                    lineHeight: 1.5,
                    fontWeight: 600
                  }}
                >
                  Foto será atualizada no próximo registro de entrada com câmera.
                </p>
              </div>
            ) : (
              /* Com foto, sem solicitação pendente */
              <button
                onClick={solicitarAtualizacao}
                disabled={solicitando}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.20)",
                  background: "transparent",
                  color: "var(--burgundy-600)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: solicitando ? "not-allowed" : "pointer",
                  opacity: solicitando ? 0.6 : 1,
                  textAlign: "center",
                  transition: "all 150ms",
                  fontFamily: "var(--font-body)"
                }}
              >
                {solicitando ? "Registrando…" : "Atualizar foto no próximo registro"}
              </button>
            )}
            <p
              style={{
                fontSize: 10.5,
                color: "var(--ink-400)",
                margin: "10px 0 0",
                lineHeight: 1.5,
                textAlign: "center"
              }}
            >
              A foto de perfil é registrada exclusivamente via câmera no momento do ponto.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sino de Notificações ─── */
interface NotifItem {
  id: string;
  titulo: string;
  corpo?: string;
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
  return d < 7
    ? `há ${d}d`
    : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function SinoBell() {
  const [naoLidas, setNaoLidas] = useState(0);
  const [ultima, setUltima] = useState<NotifItem | null>(null);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const buscarContagem = useCallback(async () => {
    try {
      const d = await api.get<{ total: number; ultima: NotifItem | null }>("/notificacao/contagem");
      setNaoLidas(d?.total ?? 0);
      setUltima(d?.ultima ?? null);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    void buscarContagem();
    const id = setInterval(() => void buscarContagem(), 30_000);
    return () => clearInterval(id);
  }, [buscarContagem]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Botão do sino */}
      <button
        className="btn-icon"
        aria-label={naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : "Notificações"}
        title={naoLidas > 0 ? `${naoLidas} notificação(ões) não lida(s)` : "Notificações"}
        onClick={() => {
          setAberto((v) => {
            if (!v) void buscarContagem();
            return !v;
          });
        }}
        style={{ position: "relative", overflow: "visible" }}
      >
        <BellIcon size={18} />
        {naoLidas > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              minWidth: 18,
              height: 18,
              padding: "0 4px",
              background: "var(--burgundy-600)",
              color: "#fff",
              borderRadius: 9,
              border: "2px solid #fff",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 2,
              boxShadow: "0 1px 4px rgba(0,0,0,0.18)"
            }}
          >
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {/* Popover */}
      {aberto && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 320,
            zIndex: 300,
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.14)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
            overflow: "hidden"
          }}
        >
          {/* Cabeçalho do popover */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 14px 10px",
              borderBottom: "1px solid rgba(122,30,38,0.08)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BellIcon size={15} style={{ color: "var(--burgundy-600)" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-900)" }}>
                Notificações
              </span>
              {naoLidas > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: "var(--red)",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "1px 6px"
                  }}
                >
                  {naoLidas}
                </span>
              )}
            </div>
          </div>

          {/* Última notificação */}
          <div style={{ padding: "12px 14px" }}>
            {ultima ? (
              <Link
                to={`/ponto/notificacoes?id=${ultima.id}`}
                onClick={() => setAberto(false)}
                style={{
                  display: "block",
                  padding: "10px 12px",
                  background: ultima.lida ? "var(--cream-50)" : "rgba(122,30,38,0.04)",
                  borderRadius: "var(--radius-md)",
                  border: `1px solid ${ultima.lida ? "rgba(122,30,38,0.07)" : "rgba(122,30,38,0.15)"}`,
                  textDecoration: "none",
                  color: "inherit",
                  cursor: "pointer",
                  transition: "background 140ms, border-color 140ms"
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(122,30,38,0.07)";
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(122,30,38,0.22)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = ultima.lida
                    ? "var(--cream-50)"
                    : "rgba(122,30,38,0.04)";
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = ultima.lida
                    ? "rgba(122,30,38,0.07)"
                    : "rgba(122,30,38,0.15)";
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {!ultima.lida && (
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--burgundy-600)",
                        flexShrink: 0,
                        marginTop: 5
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12.5,
                        fontWeight: ultima.lida ? 400 : 600,
                        color: "var(--ink-900)",
                        margin: "0 0 3px",
                        lineHeight: 1.35
                      }}
                    >
                      {ultima.titulo}
                    </p>
                    {ultima.corpo && (
                      <p
                        style={{
                          fontSize: 11.5,
                          color: "var(--ink-500)",
                          margin: "0 0 4px",
                          lineHeight: 1.4,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical"
                        }}
                      >
                        {ultima.corpo}
                      </p>
                    )}
                    <p style={{ fontSize: 10.5, color: "var(--ink-400)", margin: 0 }}>
                      {tempoRelativo(ultima.criadoEm)}
                    </p>
                  </div>
                </div>
              </Link>
            ) : (
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-400)",
                  margin: 0,
                  textAlign: "center",
                  padding: "8px 0"
                }}
              >
                Nenhuma notificação ainda.
              </p>
            )}
          </div>

          {/* Rodapé — link para página completa */}
          <Link
            to="/ponto/notificacoes"
            onClick={() => setAberto(false)}
            style={{
              display: "block",
              padding: "10px 14px",
              borderTop: "1px solid rgba(122,30,38,0.08)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--burgundy-600)",
              textDecoration: "none",
              textAlign: "center",
              background: "var(--cream-50)",
              transition: "background 140ms"
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "rgba(122,30,38,0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = "var(--cream-50)";
            }}
          >
            Ver todas as notificações →
          </Link>
        </div>
      )}
    </div>
  );
}

/* ─── Topbar ─── */
export function Topbar() {
  const { user, logout } = useAuth();
  const isMobile = useIsMobile(768);

  /* ── Versão compacta mobile ── */
  if (isMobile) {
    return (
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          height: "60px",
          background: "#fff",
          borderBottom: "1px solid rgba(122,30,38,0.10)",
          boxShadow: "0 2px 8px rgba(10,5,6,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 10
        }}
      >
        <img src="/logo.png" alt="CFO" style={{ height: 32, width: "auto", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 15,
              lineHeight: 1.1,
              margin: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            Ponto Eletrônico
          </p>
          <p
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              margin: 0
            }}
          >
            CFO
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <SinoBell />
          <AvatarPerfil />
          <button
            onClick={logout}
            title="Sair"
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--burgundy-600)"
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>
    );
  }

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: "var(--topbar-h)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 2px 16px rgba(10,5,6,0.10)"
      }}
    >
      {/* ── Faixa 1 — Bordô institucional ── */}
      <div
        style={{
          background: "var(--cfo-bar)",
          height: "var(--topbar-bar-h)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 10,
          flexShrink: 0
        }}
      >
        <TopChip icon={<MapPinIcon size={13} />}>Brasília — DF</TopChip>
        <TopChip icon={<MailIcon size={13} />} href="mailto:ouvidoria@cfo.org.br">
          ouvidoria@cfo.org.br
        </TopChip>
        <TopChip icon={<PhoneIcon size={13} />}>CFO Odonto</TopChip>

        <div style={{ flex: 1 }} />

        {/* LGPD — obrigatório por lei */}
        <TopChip variant="amber">🔒 Lei Geral de Proteção de Dados — LGPD 13.709/2018</TopChip>
      </div>

      {/* ── Faixa 2 — Branca com identidade ── */}
      <div
        style={{
          background: "#ffffff",
          flex: 1,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 16,
          borderBottom: "1px solid rgba(122,30,38,0.08)"
        }}
      >
        {/* Logo */}
        <img
          src="/logo.png"
          alt="Logo CFO"
          style={{ height: 36, width: "auto", objectFit: "contain", flexShrink: 0 }}
        />

        {/* Divisor vertical */}
        <div
          style={{
            width: 1,
            height: 52,
            background: "rgba(122,30,38,0.10)",
            flexShrink: 0
          }}
        />

        {/* Nome e subtítulo do sistema */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 18,
              lineHeight: 1.2,
              margin: 0
            }}
          >
            Ponto Eletrônico
          </p>
          <p
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              margin: 0,
              marginTop: 2
            }}
          >
            Conselho Federal de Odontologia · Controle de Frequência
          </p>
        </div>

        <div style={{ flex: 1 }} />

        {/* Sino de notificações */}
        <SinoBell />

        {/* Avatar + info do usuário autenticado */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              border: "1px solid rgba(122,30,38,0.14)",
              minHeight: 44
            }}
          >
            <AvatarPerfil />
            <div style={{ textAlign: "left" }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ink-900)",
                  lineHeight: 1.2,
                  margin: 0
                }}
              >
                {user?.name || user?.username || "Usuário"}
              </p>
              <p style={{ fontSize: 11, color: "var(--ink-500)", lineHeight: 1, margin: 0 }}>
                {user?.emailReal ??
                  user?.email?.replace(/@(sso|pending)\.local$/, "@cfo.org.br") ??
                  "Autenticado via SSO"}
              </p>
            </div>
          </div>

          {/* Botão de logout */}
          <button
            onClick={logout}
            title="Sair do sistema"
            aria-label="Sair"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--burgundy-600)",
              transition: "all 180ms ease"
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(122,30,38,0.06)";
              b.style.borderColor = "rgba(122,30,38,0.30)";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "transparent";
              b.style.borderColor = "rgba(122,30,38,0.14)";
            }}
          >
            {/* Ícone de sair (logout) */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

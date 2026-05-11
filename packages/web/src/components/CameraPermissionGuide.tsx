import React, { useEffect, useRef, useState } from "react";
import { XIcon, CheckCircleIcon } from "./icons";

/* ─── Persistência ─── */
const KEY_GRANTED = "cfo_camera_permission_granted";
const KEY_SEEN = "cfo_camera_guide_seen";

/* ─── Hook de status ─── */
export type PermissionStatus = "unknown" | "checking" | "granted" | "denied" | "prompt";

export function useCameraPermission() {
  const [status, setStatus] = useState<PermissionStatus>("unknown");
  useEffect(() => {
    if (localStorage.getItem(KEY_GRANTED) === "true") {
      setStatus("granted");
      return;
    }
    setStatus("checking");
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((r) => {
        setStatus(r.state as PermissionStatus);
        r.onchange = () => {
          setStatus(r.state as PermissionStatus);
          if (r.state === "granted") localStorage.setItem(KEY_GRANTED, "true");
          else localStorage.removeItem(KEY_GRANTED);
        };
      })
      .catch(() => setStatus("prompt"));
  }, []);
  return status;
}

/* ─── Detecta SO ─── */
function getOS(): "ios" | "android" | "other" {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

/* ─── Animações CSS ─── */
const CSS = `
  @keyframes pulse-ring {
    0%   { box-shadow: 0 0 0 0 rgba(200,57,63,0.6); }
    70%  { box-shadow: 0 0 0 14px rgba(200,57,63,0); }
    100% { box-shadow: 0 0 0 0 rgba(200,57,63,0); }
  }
  @keyframes bounce-arrow {
    0%,100% { transform: translateX(0); }
    50%      { transform: translateX(6px); }
  }
  @keyframes blink-toggle {
    0%,100% { opacity: 1; }
    50%      { opacity: 0.4; }
  }
  @keyframes spin-slow {
    to { transform: rotate(360deg); }
  }
  @keyframes fade-in {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:none; }
  }
  @keyframes countdown-shrink {
    from { width: 100%; }
    to   { width: 0%; }
  }
`;

/* ─── Componente visual do cadeado (simula barra do navegador) ─── */
function LockVisual({ step }: { step: 1 | 2 }) {
  const os = getOS();

  /* Passo 1: barra de endereço com cadeado pulsando */
  if (step === 1) {
    return (
      <div
        style={{
          background: "#f1f3f4",
          borderRadius: 12,
          padding: "10px 12px",
          marginBottom: 16,
          animation: "fade-in 300ms ease"
        }}
      >
        {/* Barra de endereço simulada */}
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)"
          }}
        >
          {/* Cadeado pulsando */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(200,57,63,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              animation: "pulse-ring 1.4s ease-out infinite",
              cursor: "pointer"
            }}
          >
            <span style={{ fontSize: 16 }}>🔒</span>
          </div>
          <span style={{ fontSize: 12, color: "#555", flex: 1 }}>ponto.cfo.org.br</span>
        </div>

        {/* Seta animada */}
        <div
          style={{
            textAlign: "center",
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8
          }}
        >
          <span style={{ fontSize: 22, animation: "bounce-arrow 1s ease-in-out infinite" }}>
            👆
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--burgundy-600)" }}>
            {os === "ios" ? 'Toque em "aA" ou no cadeado' : "Toque no cadeado 🔒"}
          </span>
        </div>
      </div>
    );
  }

  /* Passo 2: menu de permissão com câmera destacada */
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
        overflow: "hidden",
        marginBottom: 16,
        animation: "fade-in 300ms ease"
      }}
    >
      {/* Título do menu */}
      <div
        style={{
          background: "#f1f3f4",
          padding: "10px 14px",
          fontSize: 13,
          fontWeight: 600,
          color: "#333",
          borderBottom: "1px solid #e0e0e0"
        }}
      >
        {os === "ios" ? "Configurações do site" : "Permissões"}
      </div>

      {/* Item câmera — destaque pulsante */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 14px",
          background: "rgba(200,57,63,0.06)",
          border: "2px solid rgba(200,57,63,0.30)",
          animation: "pulse-ring 1.4s ease-out infinite"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📷</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>Câmera</span>
        </div>
        {/* Toggle visual animado */}
        <div
          style={{
            width: 48,
            height: 26,
            borderRadius: 13,
            background: "var(--burgundy-600)",
            position: "relative",
            animation: "blink-toggle 1s ease-in-out infinite",
            cursor: "pointer"
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 3,
              right: 3,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
            }}
          />
        </div>
      </div>

      {/* Outros itens (cinza, não destacados) */}
      {["Microfone", "Localização"].map((item) => (
        <div
          key={item}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 14px",
            borderTop: "1px solid #f0f0f0",
            opacity: 0.4
          }}
        >
          <span style={{ fontSize: 14, color: "#555" }}>
            {item === "Microfone" ? "🎙 " : "📍 "}
            {item}
          </span>
          <div
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              background: "#ccc",
              position: "relative"
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 3,
                left: 3,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff"
              }}
            />
          </div>
        </div>
      ))}

      {/* Seta */}
      <div
        style={{
          textAlign: "center",
          padding: "10px 14px",
          background: "rgba(200,57,63,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8
        }}
      >
        <span style={{ fontSize: 20, animation: "bounce-arrow 1s ease-in-out infinite" }}>👆</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--burgundy-600)" }}>
          Ative a Câmera
        </span>
      </div>
    </div>
  );
}

/* ─── Tela de negado — visual interativo ─── */
function DeniedScreen({ onRetry }: { onRetry: () => void; onClose: () => void }) {
  const [visualStep, setVisualStep] = useState<1 | 2>(1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Avança passo visual automaticamente */
  useEffect(() => {
    const t = setTimeout(() => setVisualStep(2), 3500);
    return () => clearTimeout(t);
  }, []);

  function iniciarRecarga() {
    setCountdown(5);
    countRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countRef.current!);
          window.location.reload();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(
    () => () => {
      if (countRef.current) clearInterval(countRef.current);
    },
    []
  );

  return (
    <div style={{ padding: "16px 20px 20px" }}>
      <p
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--ink-900)",
          marginBottom: 4,
          textAlign: "center"
        }}
      >
        Siga estes 2 passos:
      </p>
      <p style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center", marginBottom: 16 }}>
        Passo {visualStep} de 2 — as figuras mostram onde tocar
      </p>

      {/* Indicador de passos */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[1, 2].map((n) => (
          <div
            key={n}
            onClick={() => setVisualStep(n as 1 | 2)}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: visualStep >= n ? "var(--burgundy-600)" : "var(--cream-200)",
              cursor: "pointer",
              transition: "background 300ms"
            }}
          />
        ))}
      </div>

      {/* Visual animado */}
      {visualStep === 1 ? <LockVisual step={1} /> : <LockVisual step={2} />}

      {/* Instrução de texto simples */}
      <div
        style={{
          background: "var(--cream-50)",
          borderRadius: "var(--radius-md)",
          padding: "12px 14px",
          marginBottom: 16,
          textAlign: "center"
        }}
      >
        {visualStep === 1 ? (
          <p style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.6 }}>
            <strong>Passo 1:</strong> Toque no cadeado 🔒 na parte de cima da tela (barra do
            navegador)
          </p>
        ) : (
          <p style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.6 }}>
            <strong>Passo 2:</strong> Ative o botão ao lado de <strong>Câmera 📷</strong> (deve
            ficar vermelho/ativado)
          </p>
        )}
      </div>

      {/* Navegação entre passos */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setVisualStep(1)}
          style={{
            flex: 1,
            padding: "9px",
            border: `1.5px solid ${visualStep === 1 ? "var(--burgundy-600)" : "rgba(122,30,38,0.14)"}`,
            borderRadius: "var(--radius-md)",
            background: visualStep === 1 ? "rgba(122,30,38,0.06)" : "transparent",
            color: "var(--burgundy-600)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          ← Passo 1
        </button>
        <button
          onClick={() => setVisualStep(2)}
          style={{
            flex: 1,
            padding: "9px",
            border: `1.5px solid ${visualStep === 2 ? "var(--burgundy-600)" : "rgba(122,30,38,0.14)"}`,
            borderRadius: "var(--radius-md)",
            background: visualStep === 2 ? "rgba(122,30,38,0.06)" : "transparent",
            color: "var(--burgundy-600)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          Passo 2 →
        </button>
      </div>

      {/* Botão principal — após seguir os passos */}
      {countdown === null ? (
        <button
          onClick={iniciarRecarga}
          style={{
            width: "100%",
            padding: "15px",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "var(--burgundy-600)",
            color: "#fff",
            fontFamily: "var(--font-body)",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8
          }}
        >
          ✅ Já habilitei a câmera — continuar
        </button>
      ) : (
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              background: "var(--cream-50)",
              borderRadius: "var(--radius-md)",
              padding: "14px",
              textAlign: "center",
              border: "1px solid rgba(122,30,38,0.12)"
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)", marginBottom: 8 }}>
              Recarregando em {countdown}s…
            </p>
            <div
              style={{
                height: 6,
                background: "var(--cream-200)",
                borderRadius: 3,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "var(--burgundy-600)",
                  borderRadius: 3,
                  animation: `countdown-shrink ${countdown + 1}s linear forwards`
                }}
              />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onRetry}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.16)",
          background: "transparent",
          color: "var(--ink-500)",
          fontFamily: "var(--font-body)",
          fontSize: 14,
          cursor: "pointer"
        }}
      >
        Tentar permissão novamente
      </button>

      {/* Suporte TI */}
      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          background: "rgba(30,74,122,0.06)",
          borderRadius: "var(--radius-md)",
          textAlign: "center"
        }}
      >
        <p style={{ fontSize: 12, color: "var(--blue-ink)" }}>
          Precisa de ajuda? Entre em contato com a <strong>TI</strong>:
          <a
            href="tel:+556130443400"
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--blue-ink)",
              marginTop: 4
            }}
          >
            📞 (61) 3044-3400 — Ramal TI
          </a>
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════ */
interface Props {
  onGranted: () => void;
  onClose: () => void;
}

type Stage = "guide" | "requesting" | "denied" | "granted";

export function CameraPermissionGuide({ onGranted, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("requesting"); // começa checando

  /* Na montagem, tenta acessar a câmera imediatamente.
     Se o navegador já tem permissão concedida (Chrome, etc.),
     getUserMedia resolve sem mostrar popup e chamamos onGranted() direto.
     Só mostramos o guia se realmente for necessário. */
  useEffect(() => {
    async function probe() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false
        });
        stream.getTracks().forEach((t) => t.stop());
        localStorage.setItem(KEY_GRANTED, "true");
        // Permissão já existe — abre câmera sem mostrar nada
        onGranted();
      } catch (e: unknown) {
        const name = (e as DOMException).name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          // Bloqueado — mostra guia visual de desbloqueio
          setStage("denied");
        } else {
          // 'prompt' ou outro estado — mostra guia inicial de solicitação
          setStage("guide");
        }
      }
    }
    probe();
  }, []);

  async function solicitarPermissao() {
    setStage("requesting");
    localStorage.setItem(KEY_SEEN, "true");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });
      stream.getTracks().forEach((t) => t.stop());
      localStorage.setItem(KEY_GRANTED, "true");
      setStage("granted");
      setTimeout(onGranted, 900);
    } catch {
      localStorage.removeItem(KEY_GRANTED);
      setStage("denied");
    }
  }

  const headerTitle: Record<Stage, string> = {
    guide: "Autorizar câmera",
    requesting: "Aguardando…",
    denied: "Siga os 2 passos abaixo",
    granted: "Câmera liberada!"
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.55)", zIndex: 300 }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(420px,96vw)",
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          zIndex: 301,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(10,5,6,0.28)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg,var(--burgundy-700),var(--burgundy-600))",
            padding: "20px 20px 16px",
            textAlign: "center",
            position: "relative",
            flexShrink: 0
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              padding: 6,
              border: "none",
              background: "rgba(255,255,255,0.15)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "#fff",
              display: "flex"
            }}
          >
            <XIcon size={16} />
          </button>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 10px",
              fontSize: 26
            }}
          >
            {stage === "granted" ? "✅" : stage === "denied" ? "⚠️" : "📷"}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: 19,
              color: "#fff",
              fontWeight: 400,
              margin: 0
            }}
          >
            {headerTitle[stage]}
          </h2>
        </div>

        {/* Conteúdo — scrollável */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* Guia inicial */}
          {stage === "guide" && (
            <div style={{ padding: "20px 20px 24px" }}>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--ink-700)",
                  lineHeight: 1.7,
                  marginBottom: 16,
                  textAlign: "center"
                }}
              >
                O sistema precisa da sua <strong>câmera frontal</strong> para confirmar sua
                identidade ao registrar o ponto.
              </p>
              <div
                style={{
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px",
                  marginBottom: 18
                }}
              >
                {[
                  "O navegador pedirá permissão",
                  'Toque em "Permitir"',
                  "Pronto — câmera salva para sempre"
                ].map((txt, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: i < 2 ? 10 : 0
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--burgundy-600)",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}
                    >
                      {i + 1}
                    </span>
                    <p style={{ fontSize: 14, color: "var(--ink-700)" }}>{txt}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={solicitarPermissao}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--burgundy-600)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  marginBottom: 10
                }}
              >
                📷 Permitir câmera agora
              </button>
              <button
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "11px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.14)",
                  background: "transparent",
                  color: "var(--ink-500)",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  cursor: "pointer"
                }}
              >
                Agora não
              </button>
            </div>
          )}

          {/* Solicitando */}
          {stage === "requesting" && (
            <div style={{ textAlign: "center", padding: "32px 24px" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: "3px solid var(--cream-200)",
                  borderTop: "3px solid var(--burgundy-600)",
                  borderRadius: "50%",
                  animation: "spin-slow 0.8s linear infinite",
                  margin: "0 auto 16px"
                }}
              />
              <p
                style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)", marginBottom: 8 }}
              >
                Aguardando sua confirmação
              </p>
              <p style={{ fontSize: 14, color: "var(--ink-500)", lineHeight: 1.7 }}>
                Toque em <strong>"Permitir"</strong>
                <br />
                na caixa que aparecer na tela.
              </p>
            </div>
          )}

          {/* Negado — visual interativo */}
          {stage === "denied" && <DeniedScreen onRetry={solicitarPermissao} onClose={onClose} />}

          {/* Concedido */}
          {stage === "granted" && (
            <div style={{ textAlign: "center", padding: "32px 24px" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(47,125,79,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px"
                }}
              >
                <CheckCircleIcon size={36} style={{ color: "var(--green)" }} />
              </div>
              <p
                style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-900)", marginBottom: 6 }}
              >
                Câmera autorizada!
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Abrindo para fotografar…</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

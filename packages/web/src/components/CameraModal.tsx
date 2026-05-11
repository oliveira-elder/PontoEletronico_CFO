import React, { useCallback, useEffect, useRef, useState } from "react";
import { XIcon, RefreshCwIcon, CheckCircleIcon } from "./icons";

interface Props {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

type Stage = "loading" | "camera" | "preview" | "error";

/* ─── Sequência de constraints em fallback ─── */
const CONSTRAINTS_FALLBACK = [
  // 1. Câmera frontal HD
  {
    video: { facingMode: { exact: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  },
  // 2. Câmera frontal sem exigência de resolução
  { video: { facingMode: { ideal: "user" } }, audio: false },
  // 3. Qualquer câmera disponível
  { video: true, audio: false }
] as const;

async function openStream(): Promise<MediaStream> {
  let lastError: unknown;
  for (const constraints of CONSTRAINTS_FALLBACK) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function errorMessage(e: unknown): string {
  const name = (e as DOMException)?.name ?? "";
  if (!window.isSecureContext)
    return "A câmera só funciona em conexão segura (HTTPS ou localhost). Contate a TI para configurar HTTPS.";
  if (name === "NotAllowedError" || name === "PermissionDeniedError")
    return "Permissão negada. Autorize a câmera nas configurações do navegador e tente novamente.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "Nenhuma câmera encontrada neste dispositivo.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "A câmera está em uso por outro aplicativo. Feche outros programas e tente novamente.";
  if (name === "OverconstrainedError")
    return "Câmera não suporta as configurações requeridas. Tentando modo básico…";
  return `Falha ao acessar câmera: ${name || "erro desconhecido"}. Tente recarregar a página.`;
}

export function CameraModal({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const healthRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCount = useRef(0);
  const mountedRef = useRef(true);

  const [stage, setStage] = useState<Stage>("loading");
  const [preview, setPreview] = useState("");
  const [erro, setErro] = useState("");
  const [videoW, setVideoW] = useState(640);
  const [videoH, setVideoH] = useState(480);

  const stopAll = useCallback(() => {
    if (healthRef.current) {
      clearInterval(healthRef.current);
      healthRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!mountedRef.current) return;
    stopAll();
    setStage("loading");
    setErro("");

    // Verifica contexto seguro antes de tentar
    if (!navigator.mediaDevices?.getUserMedia) {
      if (!mountedRef.current) return;
      setErro(
        !window.isSecureContext
          ? "A câmera requer HTTPS. Acesse via https:// ou localhost."
          : "Este navegador não suporta acesso à câmera."
      );
      setStage("error");
      return;
    }

    try {
      const stream = await openStream();
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;

      // Aguarda metadados + play com timeout de 10s
      await new Promise<void>((resolve, reject) => {
        const tid = setTimeout(() => reject(new Error("Timeout ao carregar vídeo")), 10_000);
        video.onloadedmetadata = () => {
          clearTimeout(tid);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(tid);
          reject(new Error("Erro no elemento de vídeo"));
        };
      });

      await video.play().catch(() => {}); // alguns browsers ignoram autoplay, tudo bem

      if (!mountedRef.current) return;

      // Dimensões reais do vídeo para a captura
      setVideoW(video.videoWidth || 640);
      setVideoH(video.videoHeight || 480);
      setStage("camera");
      retryCount.current = 0;

      // Monitor de saúde: se a track morrer (ex: cabo desconectado), reinicia
      healthRef.current = setInterval(() => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (track && track.readyState === "ended") {
          console.warn("[Camera] Track ended unexpectedly — restarting");
          startCamera();
        }
      }, 2000);
    } catch (e) {
      if (!mountedRef.current) return;
      stopAll();

      // Retry automático até 2 vezes antes de mostrar erro
      if (retryCount.current < 2) {
        retryCount.current++;
        console.warn(`[Camera] Retry ${retryCount.current}/2`);
        await new Promise((r) => setTimeout(r, 800));
        return startCamera();
      }

      setErro(errorMessage(e));
      setStage("error");
    }
  }, [stopAll]);

  useEffect(() => {
    mountedRef.current = true;
    startCamera();
    return () => {
      mountedRef.current = false;
      stopAll();
    };
  }, [startCamera, stopAll]);

  /* ─── Captura a foto ─── */
  function capturar() {
    const video = videoRef.current;
    if (!video) return;

    // Usa dimensões reais do vídeo; fallback para 640x480
    const W = video.videoWidth || videoW || 640;
    const H = video.videoHeight || videoH || 480;
    const scale = Math.min(1, 960 / W);
    const cW = Math.round(W * scale);
    const cH = Math.round(H * scale);

    const canvas = document.createElement("canvas");
    canvas.width = cW;
    canvas.height = cH;
    const ctx = canvas.getContext("2d")!;

    // Espelha horizontalmente (câmera frontal)
    ctx.translate(cW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, cW, cH);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    stopAll();
    setPreview(dataUrl);
    setStage("preview");
  }

  const handleClose = useCallback(() => {
    stopAll();
    onClose();
  }, [stopAll, onClose]);
  const confirmar = useCallback(() => {
    stopAll();
    onCapture(preview);
    onClose();
  }, [stopAll, onCapture, onClose, preview]);

  /* ─── Layout: proporção fixa sem aspect-ratio CSS ─── */
  const videoArea = (
    /* Wrapper com padding-bottom trick — funciona em qualquer browser */
    <div
      style={{
        position: "relative",
        width: "100%",
        paddingBottom: "75%",
        background: "#000",
        overflow: "hidden",
        flexShrink: 0
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        {/* Vídeo nativo — o browser renderiza, sem canvas loop */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            transform: "scaleX(-1)",
            opacity: stage === "camera" ? 1 : 0,
            transition: "opacity 400ms"
          }}
        />

        {/* Overlay oval — SVG puro, sem JS */}
        {stage === "camera" && (
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none"
            }}
            viewBox="0 0 640 480"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <mask id="cm-mask">
                <rect width="640" height="480" fill="white" />
                <ellipse cx="320" cy="232" rx="188" ry="212" fill="black" />
              </mask>
            </defs>
            <rect width="640" height="480" fill="rgba(0,0,0,0.50)" mask="url(#cm-mask)" />
            <ellipse
              cx="320"
              cy="232"
              rx="188"
              ry="212"
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.5"
              strokeDasharray="10 6"
            />
            {/* 4 cantos de guia */}
            <path
              d="M132,50 L132,74 M132,50 L156,50"
              stroke="rgba(255,255,255,0.65)"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M508,50 L508,74 M508,50 L484,50"
              stroke="rgba(255,255,255,0.65)"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M132,414 L132,390 M132,414 L156,414"
              stroke="rgba(255,255,255,0.65)"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M508,414 L508,390 M508,414 L484,414"
              stroke="rgba(255,255,255,0.65)"
              strokeWidth="3"
              fill="none"
            />
            <text
              x="320"
              y="462"
              textAnchor="middle"
              fill="rgba(255,255,255,0.75)"
              fontSize="13"
              fontFamily="system-ui,-apple-system,sans-serif"
            >
              Centralize seu rosto · toque em "Tirar Foto"
            </text>
          </svg>
        )}

        {/* Preview da foto */}
        {stage === "preview" && preview && (
          <>
            <img
              src={preview}
              alt="Foto capturada"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block"
              }}
            />
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none"
              }}
              viewBox="0 0 640 480"
              preserveAspectRatio="xMidYMid slice"
            >
              <ellipse
                cx="320"
                cy="232"
                rx="188"
                ry="212"
                fill="none"
                stroke="rgba(80,200,120,0.9)"
                strokeWidth="3"
                strokeDasharray="10 6"
              />
              <text
                x="320"
                y="462"
                textAnchor="middle"
                fill="rgba(255,255,255,0.80)"
                fontSize="13"
                fontFamily="system-ui,-apple-system,sans-serif"
              >
                Foto capturada — confirme abaixo
              </text>
            </svg>
          </>
        )}

        {/* Loading spinner */}
        {stage === "loading" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                border: "3px solid rgba(255,255,255,0.15)",
                borderTop: "3px solid #fff",
                borderRadius: "50%",
                animation: "cam-spin 0.8s linear infinite"
              }}
            />
            <p style={{ color: "rgba(255,255,255,0.60)", fontSize: 13 }}>Iniciando câmera…</p>
          </div>
        )}

        {/* Erro */}
        {stage === "error" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              textAlign: "center",
              gap: 10
            }}
          >
            <span style={{ fontSize: 40 }}>📷</span>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 1.65 }}>
              {erro}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div
        onClick={handleClose}
        style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.72)", zIndex: 200 }}
      />

      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(520px, 96vw)",
          background: "#111",
          borderRadius: "var(--radius-xl)",
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(10,5,6,0.55)",
          maxHeight: "96vh",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.05)",
            flexShrink: 0
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
            {
              {
                loading: "Iniciando câmera…",
                camera: "Identificação biométrica",
                preview: "Confirmar e registrar ponto",
                error: "Câmera indisponível"
              }[stage]
            }
          </p>
          <button
            onClick={handleClose}
            style={{
              padding: 6,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "rgba(255,255,255,0.6)",
              display: "flex"
            }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {videoArea}

        {/* Botões */}
        <div
          style={{
            padding: "14px 18px",
            background: "rgba(255,255,255,0.04)",
            display: "flex",
            gap: 10,
            flexShrink: 0
          }}
        >
          {stage === "camera" && (
            <>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  cursor: "pointer"
                }}
              >
                Cancelar
              </button>
              <button
                onClick={capturar}
                style={{
                  flex: 2,
                  padding: "11px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--burgundy-600)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                📷 Tirar Foto
              </button>
            </>
          )}
          {stage === "preview" && (
            <>
              <button
                onClick={() => {
                  setPreview("");
                  setStage("loading");
                  startCamera();
                }}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6
                }}
              >
                <RefreshCwIcon size={14} /> Refazer
              </button>
              <button
                onClick={confirmar}
                style={{
                  flex: 2,
                  padding: "11px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--green)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6
                }}
              >
                <CheckCircleIcon size={16} /> Registrar Ponto Agora
              </button>
            </>
          )}
          {stage === "loading" && (
            <button
              onClick={handleClose}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "rgba(255,255,255,0.7)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                cursor: "pointer"
              }}
            >
              Cancelar
            </button>
          )}
          {stage === "error" && (
            <>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  cursor: "pointer"
                }}
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  retryCount.current = 0;
                  startCamera();
                }}
                style={{
                  flex: 2,
                  padding: "11px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--burgundy-600)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                🔄 Tentar novamente
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes cam-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

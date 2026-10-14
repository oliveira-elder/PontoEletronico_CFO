import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";

/**
 * Visualização protegida da folha na tela: as páginas são desenhadas como imagem (sem texto
 * selecionável), com marca d'água de QUEM está visualizando (nome + data/hora) por cima.
 * Bloqueia menu de contexto, seleção, arrastar e impressão pela página; ao perder o foco
 * (ferramenta de recorte/print) o conteúdo é borrado. Não impede foto da tela — a marca d'água
 * identifica a origem de um vazamento ou de uma montagem.
 */
export function VisualizadorPdfProtegido({
  caminho,
  titulo,
  onClose
}: {
  caminho: string;
  titulo: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [oculto, setOculto] = useState(false);
  const marca = `${user?.name ?? "Usuário"} · ${new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo"
  })} · visualização no sistema — cópia não controlada`;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const blob = await api.blob(caminho);
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
          .promise;
        const alvo = containerRef.current;
        if (!alvo || cancelado) return;
        alvo.innerHTML = "";
        for (let n = 1; n <= doc.numPages; n++) {
          const pagina = await doc.getPage(n);
          const vp = pagina.getViewport({ scale: 1.6 });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = "100%";
          canvas.style.display = "block";
          canvas.style.marginBottom = "12px";
          canvas.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
          /* Marca d'água de quem visualiza, desenhada NO PRÓPRIO desenho da página. */
          ctx.save();
          ctx.globalAlpha = 0.13;
          ctx.fillStyle = "#6B0F1A";
          ctx.font = `bold ${Math.round(vp.width / 42)}px Helvetica, Arial, sans-serif`;
          ctx.translate(vp.width / 2, vp.height / 2);
          ctx.rotate(-Math.PI / 5);
          for (let y = -vp.height; y < vp.height; y += vp.width / 9) {
            ctx.fillText(marca, -vp.width, y);
          }
          ctx.restore();
          if (cancelado) return;
          alvo.appendChild(canvas);
        }
        await doc.destroy();
      } catch (e) {
        if (!cancelado) setErro((e as Error).message || "Não foi possível abrir o documento.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [caminho]);

  /* Ao perder o foco (ferramenta de recorte, troca de janela) ou na tecla PrintScreen, borra. */
  useEffect(() => {
    const borrar = () => setOculto(true);
    const voltar = () => setOculto(false);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        setOculto(true);
        void navigator.clipboard?.writeText("").catch(() => {});
        window.setTimeout(() => setOculto(false), 1500);
      }
      if ((e.ctrlKey || e.metaKey) && ["p", "s", "c"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    window.addEventListener("blur", borrar);
    window.addEventListener("focus", voltar);
    window.addEventListener("keyup", tecla);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("blur", borrar);
      window.removeEventListener("focus", voltar);
      window.removeEventListener("keyup", tecla);
      window.removeEventListener("keydown", tecla);
    };
  }, []);

  return createPortal(
    <div
      className="visualizador-protegido"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(20,20,20,0.85)",
        display: "flex",
        flexDirection: "column",
        userSelect: "none"
      }}
    >
      <style>{"@media print { .visualizador-protegido { display: none !important; } }"}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          background: "#fff",
          borderBottom: "1px solid #e5e7eb"
        }}
      >
        <strong style={{ flex: 1, fontSize: 14 }}>{titulo}</strong>
        <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
          Visualização protegida · marca d'água com o seu nome
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Fechar
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto",
            filter: oculto ? "blur(18px)" : undefined,
            transition: "filter 0.1s"
          }}
        >
          {carregando && <p style={{ color: "#fff", textAlign: "center" }}>Carregando…</p>}
          {erro && <p style={{ color: "#fecaca", textAlign: "center" }}>⚠ {erro}</p>}
          <div ref={containerRef} />
        </div>
      </div>
    </div>,
    document.body
  );
}

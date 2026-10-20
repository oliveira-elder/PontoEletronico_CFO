import React, { useEffect, useRef, useState } from "react";

type MermaidApi = typeof import("mermaid").default;
let carregando: Promise<MermaidApi> | null = null;
let contador = 0;
const cache = new Map<string, string>();

/** Carrega o Mermaid só quando o primeiro diagrama aparece (a biblioteca é grande). */
function carregarMermaid(): Promise<MermaidApi> {
  carregando ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      fontFamily: "Inter, system-ui, sans-serif",
      er: { useMaxWidth: false },
      flowchart: { useMaxWidth: false, htmlLabels: true },
      sequence: { useMaxWidth: false }
    });
    return m.default;
  });
  return carregando;
}

/** Avisa o modo de impressão que um diagrama terminou de ser desenhado. */
export const EVENTO_DIAGRAMA = "doc-diagrama-pronto";

const BOTAO: React.CSSProperties = {
  border: "1px solid #ced4da",
  background: "#fff",
  borderRadius: 6,
  padding: "3px 9px",
  cursor: "pointer",
  fontSize: 12.5,
  color: "#343a40"
};

function baixar(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Diagrama Mermaid com zoom, arrastar, tela cheia e download em SVG/PNG. */
export function MermaidDiagrama({
  codigo,
  titulo,
  compacto
}: {
  codigo: string;
  titulo?: string;
  compacto?: boolean;
}) {
  const [svg, setSvg] = useState<string | null>(cache.get(codigo) ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cheia, setCheia] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useEffect(() => {
    let ativo = true;
    const pronto = cache.get(codigo);
    if (pronto) {
      setSvg(pronto);
      window.dispatchEvent(new CustomEvent(EVENTO_DIAGRAMA));
      return;
    }
    carregarMermaid()
      .then((m) => m.render(`doc-mmd-${++contador}`, codigo))
      .then((r) => {
        cache.set(codigo, r.svg);
        if (ativo) setSvg(r.svg);
      })
      .catch((e: Error) => {
        if (ativo) setErro(e.message || "Não foi possível desenhar o diagrama.");
      })
      .finally(() => window.dispatchEvent(new CustomEvent(EVENTO_DIAGRAMA)));
    return () => {
      ativo = false;
    };
  }, [codigo]);

  useEffect(() => {
    if (!cheia) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setCheia(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [cheia]);

  async function baixarPng() {
    if (!svg) return;
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    const vb = doc.getAttribute("viewBox")?.split(/\s+/).map(Number);
    const w = Math.ceil(vb?.[2] ?? Number(doc.getAttribute("width")) ?? 1200);
    const h = Math.ceil(vb?.[3] ?? Number(doc.getAttribute("height")) ?? 800);
    doc.setAttribute("width", String(w));
    doc.setAttribute("height", String(h));
    const xml = new XMLSerializer().serializeToString(doc);
    const img = new Image();
    img.onload = () => {
      const esc = 2;
      const canvas = document.createElement("canvas");
      canvas.width = w * esc;
      canvas.height = h * esc;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => b && baixar(`${titulo ?? "diagrama"}.png`, b), "image/png");
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }

  if (erro)
    return (
      <pre style={{ background: "#fff5f5", color: "#842029", padding: 10, borderRadius: 6 }}>
        Diagrama inválido: {erro}
      </pre>
    );
  if (!svg)
    return <div style={{ padding: 16, color: "#6c757d", fontSize: 13 }}>Desenhando diagrama…</div>;

  const caixa: React.CSSProperties = cheia
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        padding: 12
      }
    : { border: "1px solid #dee2e6", borderRadius: 8, margin: "12px 0", background: "#fff" };

  return (
    <div className={`doc-mermaid${zoom === 1 ? " ajustado" : ""}`} style={caixa}>
      {!compacto && (
        <div
          className="doc-nao-imprimir"
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            padding: "6px 8px",
            borderBottom: "1px solid #eef0f2"
          }}
        >
          <button type="button" style={BOTAO} onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}>
            +
          </button>
          <button
            type="button"
            style={BOTAO}
            onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
          >
            −
          </button>
          <button type="button" style={BOTAO} onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" style={BOTAO} onClick={() => setCheia((v) => !v)}>
            {cheia ? "Fechar (Esc)" : "Tela cheia"}
          </button>
          <button
            type="button"
            style={BOTAO}
            onClick={() =>
              baixar(`${titulo ?? "diagrama"}.svg`, new Blob([svg], { type: "image/svg+xml" }))
            }
          >
            SVG
          </button>
          <button type="button" style={BOTAO} onClick={() => void baixarPng()}>
            PNG
          </button>
          <span style={{ fontSize: 12, color: "#6c757d", alignSelf: "center" }}>
            Arraste para mover
          </span>
        </div>
      )}
      <div
        ref={area}
        className="doc-mermaid-area"
        onMouseDown={(e) => {
          const el = area.current;
          if (!el) return;
          arrasto.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
        }}
        onMouseMove={(e) => {
          const a = arrasto.current;
          const el = area.current;
          if (!a || !el) return;
          el.scrollLeft = a.sl - (e.clientX - a.x);
          el.scrollTop = a.st - (e.clientY - a.y);
        }}
        onMouseUp={() => (arrasto.current = null)}
        onMouseLeave={() => (arrasto.current = null)}
        style={{
          overflow: "auto",
          maxHeight: cheia ? "none" : zoom === 1 ? "none" : 560,
          flex: cheia ? 1 : undefined,
          cursor: "grab",
          padding: 8
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "0 0",
            width: zoom === 1 ? "100%" : "max-content"
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}

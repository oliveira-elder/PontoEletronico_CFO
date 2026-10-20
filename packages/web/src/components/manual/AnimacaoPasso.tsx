import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Estado, Roteiro } from "./tipos";

const reduzido = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Estado da cena depois de executados os `n` primeiros passos. */
function estadoAte(r: Roteiro, n: number): Estado {
  const e: Estado = { ...(r.estadoInicial ?? {}) };
  for (const p of r.passos.slice(0, Math.max(0, n))) {
    if ((p.acao === "digitar" || p.acao === "selecionar") && p.alvo) e[p.alvo] = p.valor ?? "";
    if (p.set) Object.assign(e, p.set);
  }
  return e;
}

/**
 * Passo a passo animado: cursor, cliques e digitação sobre uma réplica da tela (dados fictícios).
 * Controles: reproduzir/pausar, anterior/próximo, reiniciar, velocidade e teclado (espaço, ← →).
 */
export function AnimacaoPasso({ roteiro }: { roteiro: Roteiro }) {
  const { passos } = roteiro;
  const [passo, setPasso] = useState(-1);
  const [tocando, setTocando] = useState(false);
  const [vel, setVel] = useState(1);
  const [concluido, setConcluido] = useState(false);
  const [parcial, setParcial] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 40, y: 40, vis: false });
  const [clique, setClique] = useState(0);
  const [dur, setDur] = useState(0.8);
  const palco = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.7);
  const altura = roteiro.altura ?? 720;
  const vp = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const [alturaReal, setAlturaReal] = useState(altura);
  const velRef = useRef(vel);
  const modoRef = useRef<"auto" | "manual">("manual");
  velRef.current = vel;

  const estado = useMemo<Estado>(() => {
    if (passo < 0) return estadoAte(roteiro, 0);
    if (concluido) return estadoAte(roteiro, passo + 1);
    const e = estadoAte(roteiro, passo);
    const p = passos[passo];
    if (parcial !== null && p.alvo) e[p.alvo] = parcial;
    if (p.acao === "digitar" && p.alvo) e.__digitando = p.alvo;
    if (aberto) e.__aberto = aberto;
    return e;
  }, [roteiro, passos, passo, concluido, parcial, aberto]);

  /* A réplica tem largura fixa (1280 px, como uma tela de desktop) e é reduzida para caber na largura
     E na altura da janela do navegador (sem precisar rolar a página para ver a animação inteira). */
  const [larguraPalco, setLarguraPalco] = useState(1280);
  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const ajustar = () => {
      const w = el.clientWidth;
      const maxAltura = Math.max(380, window.innerHeight - 250);
      setLarguraPalco(w);
      setEscala(Math.max(0.3, Math.min(1, w / 1280, maxAltura / alturaReal)));
    };
    ajustar();
    const ro = new ResizeObserver(() => {
      ajustar();
      requestAnimationFrame(() => alvoAtual.current && medir(alvoAtual.current));
    });
    ro.observe(el);
    window.addEventListener("resize", ajustar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", ajustar);
    };
  }, [alturaReal]);

  /* A altura da réplica acompanha o conteúdo (nada fica cortado); `altura` é só o mínimo. */
  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const medirAltura = () => setAlturaReal(Math.max(altura, el.scrollHeight));
    medirAltura();
    const ro = new ResizeObserver(medirAltura);
    ro.observe(el);
    const mo = new MutationObserver(medirAltura);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [altura]);

  /* Mantém o passo atual visível no painel lateral (sem rolar a página inteira). */
  useEffect(() => {
    const p = painel.current;
    const li = p?.querySelector<HTMLElement>("li.ativo");
    if (p && li) p.scrollTo({ top: Math.max(0, li.offsetTop - 60), behavior: "smooth" });
  }, [passo]);

  const focoAtual = passo >= 0 && !concluido ? passos[passo]?.alvo : undefined;

  const alvoAtual = useRef<string | null>(null);
  /** Posiciona a ponta do cursor no centro do alvo (ou a até 140 px da borda esquerda, se for largo). */
  const medir = useCallback((alvo: string) => {
    alvoAtual.current = alvo;
    const pal = palco.current;
    const el = pal?.querySelector<HTMLElement>(`[data-alvo="${CSS.escape(alvo)}"]`);
    if (!pal || !el) return;
    const base = pal.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const larguraUtil = Math.min(r.width / 2, 140);
    setCursor({
      x: r.left - base.left - pal.clientLeft + larguraUtil,
      y: r.top - base.top - pal.clientTop + r.height / 2,
      vis: true
    });
  }, []);

  /* Executa o passo atual (animado quando tocando; quase instantâneo quando o usuário navega). */
  useEffect(() => {
    if (passo < 0) {
      setConcluido(false);
      setParcial(null);
      setAberto(null);
      setCursor((c) => ({ ...c, vis: false }));
      return;
    }
    const p = passos[passo];
    let vivo = true;
    const timers: number[] = [];
    const esp = (ms: number) =>
      new Promise<void>((res) => {
        timers.push(window.setTimeout(res, ms));
      });
    const inst = modoRef.current === "manual" || reduzido();
    const f = (ms: number) => (inst ? 0 : ms / velRef.current);

    (async () => {
      setConcluido(false);
      setParcial(null);
      setAberto(null);
      setDur(inst ? 0.25 : 0.8 / velRef.current);
      /* Espera a tela assentar (ex.: o menu lateral leva ~220 ms para abrir/fechar) antes de medir. */
      await esp(320);
      if (!vivo) return;
      if (p.alvo) medir(p.alvo);
      await esp(inst ? 280 : 850 / velRef.current);
      if (!vivo) return;
      /* Confere de novo a posição do alvo: o layout pode ter mudado durante o movimento. */
      if (p.alvo) medir(p.alvo);
      await esp(200);
      if (!vivo) return;
      if (p.acao === "clicar" || p.acao === "digitar" || p.acao === "selecionar") {
        setClique((c) => c + 1);
        await esp(f(300));
      }
      if (p.acao === "digitar" && p.valor && !inst) {
        for (let i = 1; i <= p.valor.length && vivo; i++) {
          setParcial(p.valor.slice(0, i));
          await esp(55 / velRef.current);
        }
      }
      if (p.acao === "selecionar" && p.alvo && p.valor) {
        setAberto(p.alvo);
        await esp(f(500));
        if (!vivo) return;
        medir(`${p.alvo}::${p.valor}`);
        await esp(inst ? 280 : 750 / velRef.current);
        if (!vivo) return;
        setClique((c) => c + 1);
        await esp(f(300));
      }
      if (p.acao === "aguardar") await esp(f(1300));
      if (!vivo) return;
      setConcluido(true);
      setParcial(null);
      setAberto(null);
      if (modoRef.current === "auto") {
        await esp(1200 / velRef.current);
        if (!vivo) return;
        if (passo < passos.length - 1) setPasso(passo + 1);
        else {
          modoRef.current = "manual";
          setTocando(false);
        }
      }
    })();
    return () => {
      vivo = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [passo, passos, medir, tocando]);

  const reproduzir = () => {
    if (tocando) {
      modoRef.current = "manual";
      setTocando(false);
      return;
    }
    modoRef.current = "auto";
    setTocando(true);
    setPasso((p) => (p >= passos.length - 1 ? 0 : concluido || p < 0 ? p + 1 : p));
  };
  const irPara = (n: number) => {
    modoRef.current = "manual";
    setTocando(false);
    setPasso(Math.max(-1, Math.min(passos.length - 1, n)));
  };

  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === " ") {
      e.preventDefault();
      reproduzir();
    } else if (e.key === "ArrowRight") irPara(passo + 1);
    else if (e.key === "ArrowLeft") irPara(passo - 1);
  };

  const BTN: React.CSSProperties = {
    border: "1px solid #ced4da",
    background: "#fff",
    borderRadius: 6,
    padding: "5px 11px",
    cursor: "pointer",
    fontSize: 13
  };

  const controles = (
    <div className="mk-controles">
      <button type="button" style={BTN} onClick={() => irPara(-1)} title="Recomeçar">
        ⟲
      </button>
      <button type="button" style={BTN} onClick={() => irPara(passo - 1)} disabled={passo < 0}>
        ◀ Anterior
      </button>
      <button
        type="button"
        style={{ ...BTN, background: "#7a1e26", color: "#fff", borderColor: "#7a1e26" }}
        onClick={reproduzir}
      >
        {tocando
          ? "❚❚ Pausar"
          : passo >= passos.length - 1 && passo >= 0
            ? "▶ Rever"
            : "▶ Reproduzir"}
      </button>
      <button
        type="button"
        style={BTN}
        onClick={() => irPara(passo + 1)}
        disabled={passo >= passos.length - 1}
      >
        Próximo ▶
      </button>
      <select
        value={vel}
        onChange={(e) => setVel(Number(e.target.value))}
        style={{ ...BTN, padding: "5px 6px" }}
        aria-label="Velocidade"
      >
        <option value={0.5}>0,5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
      </select>
      <span className="mk-dica">Espaço = reproduzir · ← → = passos</span>
    </div>
  );

  return (
    <div
      className="mk-player"
      tabIndex={0}
      onKeyDown={tecla}
      aria-label={`Animação: ${roteiro.titulo}`}
    >
      <div className="mk-grade">
        <div className="mk-esq">
          <div className="mk-palco" ref={palco} style={{ height: alturaReal * escala }}>
            <div
              className="mk-vp"
              ref={vp}
              style={{
                width: 1280,
                minHeight: alturaReal,
                transform: `scale(${escala})`,
                marginLeft: Math.max(0, (larguraPalco - 1280 * escala) / 2)
              }}
            >
              {roteiro.render(estado)}
            </div>
            <div
              className="mk-cursor"
              style={{
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                transitionDuration: `${dur}s`,
                opacity: cursor.vis ? 1 : 0
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
                <path d="M4 2l15 9-6.5 1.6L9 19z" fill="#111" stroke="#fff" strokeWidth="1.5" />
              </svg>
              <span key={clique} className="mk-onda" />
            </div>
            {focoAtual && (
              <style>{`.mk-vp [data-alvo="${focoAtual}"]{outline:3px solid #fd7e14;outline-offset:2px;border-radius:6px}`}</style>
            )}
          </div>

          {controles}
        </div>
        <div className="mk-dir" ref={painel}>
          <div className="mk-controles-topo">{controles}</div>
          <ol className="mk-legendas">
            {passos.map((p, i) => (
              <li key={i} className={i === passo ? "ativo" : i < passo ? "feito" : ""}>
                <button type="button" onClick={() => irPara(i)}>
                  <span className="mk-num">{i + 1}</span>
                  {p.legenda}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

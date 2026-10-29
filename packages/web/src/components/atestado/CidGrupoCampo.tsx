import React, { useMemo, useRef, useState } from "react";
import { CID_ORIENTACAO, normalizarCid } from "../../utils/cid";

export interface GrupoCidOpcao {
  id: string;
  codigo: string;
  descricao: string;
}

/** Texto sem acento e em minúsculas, para a busca ignorar acentuação e caixa. */
const simples = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A categoria (ex.: "Z13") cai na faixa do grupo (ex.: "Z00-Z99")? */
function categoriaNoGrupo(categoria: string, codigo: string) {
  const [ini, fim = ini] = codigo.toUpperCase().replace(/\s/g, "").split("-");
  return categoria >= ini && categoria <= fim;
}

/**
 * Grupo do CID do atestado: lista (mesma ordem de Configurações) com busca por código,
 * por categoria (Z13, Z136, Z13.6) ou por parte do nome. A lista fica dentro do modal,
 * com rolagem própria, para não cortar nem empurrar o formulário.
 */
export function CidGrupoCampo({
  grupos,
  valorId,
  onSelecionar,
  obrigatorio,
  inputStyle
}: {
  grupos: GrupoCidOpcao[];
  valorId: string;
  /** `categoria` vem preenchida quando a pessoa digitou um CID válido antes de escolher. */
  onSelecionar: (grupo: GrupoCidOpcao | null, categoria: string | null) => void;
  obrigatorio: boolean;
  inputStyle: React.CSSProperties;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  const selecionado = grupos.find((g) => g.id === valorId) ?? null;
  const categoria = normalizarCid(busca);

  const filtrados = useMemo(() => {
    const q = simples(busca.trim());
    if (!q) return grupos;
    return grupos.filter(
      (g) =>
        simples(g.codigo).includes(q) ||
        simples(g.descricao).includes(q) ||
        (categoria !== null && categoriaNoGrupo(categoria, g.codigo))
    );
  }, [grupos, busca, categoria]);

  function escolher(g: GrupoCidOpcao) {
    onSelecionar(g, categoria);
    setBusca("");
    setAberto(false);
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setAtivo((i) => Math.min(i + 1, filtrados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && aberto && filtrados[ativo]) {
      e.preventDefault();
      escolher(filtrados[ativo]);
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  const rotuloSelecionado = selecionado ? `${selecionado.codigo} — ${selecionado.descricao}` : "";

  return (
    <div>
      <div style={{ position: "relative" }}>
        <input
          id="atestado-cid"
          role="combobox"
          aria-expanded={aberto}
          aria-controls="atestado-cid-lista"
          aria-required={obrigatorio}
          style={{ ...inputStyle, width: "100%", paddingRight: selecionado ? 34 : undefined }}
          value={aberto ? busca : rotuloSelecionado || busca}
          placeholder="Digite o código (ex.: Z13) ou parte do nome para buscar"
          autoComplete="off"
          onFocus={() => {
            setAberto(true);
            setAtivo(0);
          }}
          onBlur={() => setTimeout(() => setAberto(false), 120)}
          onChange={(e) => {
            setBusca(e.target.value);
            setAberto(true);
            setAtivo(0);
          }}
          onKeyDown={aoTeclar}
        />
        {selecionado && !aberto && (
          <button
            type="button"
            aria-label="Limpar grupo do CID"
            title="Limpar"
            onClick={() => {
              onSelecionar(null, null);
              setBusca("");
            }}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "transparent",
              color: "var(--ink-500)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 4
            }}
          >
            ×
          </button>
        )}
      </div>

      {aberto && (
        <ul
          id="atestado-cid-lista"
          ref={listaRef}
          role="listbox"
          style={{
            listStyle: "none",
            margin: "6px 0 0",
            padding: 4,
            maxHeight: 190,
            overflowY: "auto",
            border: "1px solid rgba(122,30,38,0.14)",
            borderRadius: "var(--radius-md)",
            background: "#fff"
          }}
        >
          {filtrados.length === 0 && (
            <li style={{ padding: "8px 10px", fontSize: 12, color: "var(--ink-500)" }}>
              Nenhum grupo encontrado para “{busca}”.
            </li>
          )}
          {filtrados.map((g, i) => (
            <li
              key={g.id}
              role="option"
              aria-selected={g.id === valorId}
              ref={(el) => {
                if (el && i === ativo) el.scrollIntoView({ block: "nearest" });
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(g);
              }}
              onMouseEnter={() => setAtivo(i)}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "baseline",
                padding: "7px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                background:
                  i === ativo
                    ? "rgba(122,30,38,0.08)"
                    : g.id === valorId
                      ? "rgba(122,30,38,0.04)"
                      : "transparent"
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontWeight: 700,
                  minWidth: 72,
                  flexShrink: 0
                }}
              >
                {g.codigo}
              </span>
              <span style={{ color: "var(--ink-700, #333)" }}>{g.descricao}</span>
            </li>
          ))}
        </ul>
      )}

      <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "6px 0 0" }}>{CID_ORIENTACAO}</p>
    </div>
  );
}

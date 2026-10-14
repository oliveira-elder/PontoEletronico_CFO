import React, { useState } from "react";
import { api } from "../hooks/useApi";
import { useAuth } from "../auth/AuthContext";
import { PlusIcon, TrashIcon } from "./icons";
import { AvisoOriginaisRh } from "./AvisoOriginaisRh";
import { formatCpf, isValidCpf, GRAU_ESCOLARIDADE_OPCOES } from "../pages/ponto/gestaoShared";
import { REQUERIMENTO_INFO, type TipoRequerimentoCadastro } from "../utils/requerimentos";

type Item = Record<string, string>;

export interface RequerimentoCadastroPendente {
  tipo: TipoRequerimentoCadastro;
  criadoEm: string;
  itens: Array<Record<string, string | null>>;
}

type Campo = {
  chave: string;
  rotulo: string;
  tipo: "text" | "date" | "cpf" | "grau";
  obrigatorio?: boolean;
  placeholder?: string;
  largura: string;
};

/** Campos de cada lista — mesmos do cadastro do funcionário (seções Dependentes/Capacitação). */
const CAMPOS: Record<TipoRequerimentoCadastro, Campo[]> = {
  DEPENDENTES: [
    { chave: "nome", rotulo: "Nome", tipo: "text", obrigatorio: true, largura: "2fr" },
    { chave: "cpf", rotulo: "CPF", tipo: "cpf", placeholder: "000.000.000-00", largura: "1.2fr" },
    { chave: "dataNascimento", rotulo: "Nascimento", tipo: "date", largura: "1fr" }
  ],
  FORMACAO_ACADEMICA: [
    { chave: "grauEscolaridade", rotulo: "Grau", tipo: "grau", largura: "1fr" },
    { chave: "curso", rotulo: "Curso", tipo: "text", obrigatorio: true, largura: "1.6fr" },
    { chave: "instituicao", rotulo: "Instituição", tipo: "text", largura: "1.3fr" },
    { chave: "conclusao", rotulo: "Conclusão", tipo: "date", largura: "1fr" }
  ],
  CAPACITACOES: [
    { chave: "nome", rotulo: "Curso/Capacitação", tipo: "text", obrigatorio: true, largura: "2fr" },
    { chave: "instituicao", rotulo: "Instituição", tipo: "text", largura: "1.3fr" },
    { chave: "conclusao", rotulo: "Conclusão", tipo: "date", largura: "1fr" }
  ]
};

const TEXTO_SEM_REGISTROS: Record<TipoRequerimentoCadastro, string> = {
  DEPENDENTES: "Não possuo dependentes",
  FORMACAO_ACADEMICA: "Não possuo formação acadêmica a informar",
  CAPACITACOES: "Não possuo cursos/capacitações a informar"
};

const itemVazio = (tipo: TipoRequerimentoCadastro): Item =>
  Object.fromEntries(CAMPOS[tipo].map((c) => [c.chave, ""]));

/**
 * Card que o funcionário preenche quando o RH solicita dependentes, formação acadêmica
 * ou cursos/capacitações. Vem pré-carregado com os dados atuais; a resposta substitui a lista.
 */
export function RequerimentoCadastroCard({
  requerimento,
  isMobile,
  onRespondido
}: {
  requerimento: RequerimentoCadastroPendente;
  isMobile?: boolean;
  onRespondido?: () => void;
}) {
  const { token } = useAuth();
  const { tipo } = requerimento;
  const campos = CAMPOS[tipo];
  const info = REQUERIMENTO_INFO[tipo];

  const [itens, setItens] = useState<Item[]>(() =>
    requerimento.itens.map((i) => ({
      ...itemVazio(tipo),
      ...Object.fromEntries(
        Object.entries(i).map(([k, v]) => [k, k === "cpf" && v ? formatCpf(v) : (v ?? "")])
      )
    }))
  );
  const [semRegistros, setSemRegistros] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const alterar = (idx: number, chave: string, valor: string) =>
    setItens((l) => l.map((it, i) => (i === idx ? { ...it, [chave]: valor } : it)));

  function validar(): string {
    if (!itens.length && !semRegistros) {
      return `Adicione ao menos um registro ou marque "${TEXTO_SEM_REGISTROS[tipo]}".`;
    }
    for (const c of campos.filter((c) => c.obrigatorio)) {
      if (itens.some((it) => !it[c.chave]?.trim())) return `Preencha o campo "${c.rotulo}".`;
    }
    if (itens.some((it) => it.cpf?.trim() && !isValidCpf(it.cpf))) {
      return "Há CPF de dependente inválido.";
    }
    return "";
  }

  async function enviar() {
    const msg = validar();
    if (msg) {
      setErro(msg);
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      await api.post(
        `/ponto/requerimento-cadastro/${tipo}/responder`,
        {
          itens: itens.map((it) =>
            Object.fromEntries(Object.entries(it).map(([k, v]) => [k, v.trim() || null]))
          ),
          semRegistros: itens.length === 0 && semRegistros
        },
        token() ?? undefined
      );
      onRespondido?.();
    } catch (e: unknown) {
      setErro((e as Error).message ?? "Erro ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "var(--radius-md)",
    border: "1px solid rgba(122,30,38,0.14)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "var(--font-body)",
    background: "#fff"
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--ink-500)",
    display: "block",
    marginBottom: 4
  };
  const colunas = isMobile ? "1fr" : `${campos.map((c) => c.largura).join(" ")} 36px`;

  function renderCampo(c: Campo, it: Item, idx: number) {
    const valor = it[c.chave] ?? "";
    if (c.tipo === "grau") {
      return (
        <select
          value={valor}
          onChange={(e) => alterar(idx, c.chave, e.target.value)}
          style={inputStyle}
        >
          <option value="">Selecione…</option>
          {GRAU_ESCOLARIDADE_OPCOES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type={c.tipo === "date" ? "date" : "text"}
        value={valor}
        placeholder={c.placeholder}
        inputMode={c.tipo === "cpf" ? "numeric" : undefined}
        onChange={(e) =>
          alterar(idx, c.chave, c.tipo === "cpf" ? formatCpf(e.target.value) : e.target.value)
        }
        style={{
          ...inputStyle,
          /* CPF completo e inválido: destaca em vermelho. */
          ...(c.tipo === "cpf" && valor.replace(/\D/g, "").length === 11 && !isValidCpf(valor)
            ? { border: "1px solid var(--red)" }
            : {})
        }}
      />
    );
  }

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "2px solid rgba(122,30,38,0.25)",
        background: "#fff",
        overflow: "hidden",
        marginBottom: 16
      }}
    >
      <div style={{ background: "var(--burgundy-600)", padding: "14px 18px" }}>
        <p
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <span aria-hidden>{info.icone}</span> O RH solicita: {info.rotulo}
        </p>
        <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 12, marginTop: 4 }}>
          Confira os registros abaixo, corrija, adicione ou remova o que for preciso e confirme.
        </p>
      </div>

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!isMobile && itens.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: colunas, gap: 8 }}>
            {campos.map((c) => (
              <span key={c.chave} style={{ ...labelStyle, marginBottom: 0 }}>
                {c.rotulo}
                {c.obrigatorio ? " *" : ""}
              </span>
            ))}
            <span />
          </div>
        )}

        {itens.map((it, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: colunas,
              gap: 8,
              alignItems: "end",
              ...(isMobile
                ? {
                    padding: 10,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.10)"
                  }
                : {})
            }}
          >
            {campos.map((c) => (
              <div key={c.chave}>
                {isMobile && (
                  <label style={labelStyle}>
                    {c.rotulo}
                    {c.obrigatorio ? " *" : ""}
                  </label>
                )}
                {renderCampo(c, it, idx)}
              </div>
            ))}
            <button
              type="button"
              aria-label="Remover"
              title="Remover"
              onClick={() => setItens((l) => l.filter((_, i) => i !== idx))}
              style={{
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(200,57,63,0.25)",
                background: "transparent",
                color: "var(--red)",
                cursor: "pointer"
              }}
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => {
            setItens((l) => [...l, itemVazio(tipo)]);
            setSemRegistros(false);
          }}
          style={{
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px dashed rgba(122,30,38,0.28)",
            background: "transparent",
            color: "var(--burgundy-600)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600
          }}
        >
          <PlusIcon size={13} /> Adicionar
        </button>

        {itens.length === 0 && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--ink-700)",
              cursor: "pointer"
            }}
          >
            <input
              type="checkbox"
              checked={semRegistros}
              onChange={(e) => setSemRegistros(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--burgundy-600)" }}
            />
            {TEXTO_SEM_REGISTROS[tipo]}
          </label>
        )}

        <AvisoOriginaisRh tipo={tipo} />

        {erro && <p style={{ fontSize: 12, color: "var(--red)", margin: 0 }}>{erro}</p>}

        <button
          onClick={() => void enviar()}
          disabled={enviando}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: enviando ? "rgba(122,30,38,0.25)" : "var(--burgundy-600)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: enviando ? "not-allowed" : "pointer"
          }}
        >
          {enviando ? "Enviando…" : `Confirmar ${info.rotulo}`}
        </button>
      </div>
    </div>
  );
}

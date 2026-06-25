import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  PlusIcon,
  FileTextIcon,
  DownloadIcon,
  ChevronDownIcon,
  XIcon,
  RefreshCwIcon,
  UploadIcon
} from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";

/* ── Tipos ─────────────────────────────────────────────── */
type TipoReq = "PERIODICO" | "EXAME_MEDICO" | "FERIAS" | "ASSINATURA_DOCUMENTOS" | "OUTRO";
type StatusDest = "PENDENTE" | "VISUALIZADO" | "RESPONDIDO";

interface ReqRhListItem {
  id: string;
  tipo: TipoReq;
  titulo: string;
  descricao?: string;
  arquivoUrl?: string;
  prazo?: string;
  ativa: boolean;
  criadaEm: string;
  criadoPor: { name: string };
  totalDestinatarios: number;
  respondidos: number;
  visualizados: number;
  pendentes: number;
}

interface DestItem {
  id: string;
  status: StatusDest;
  visualizadaEm?: string;
  respondidaEm?: string;
  respostaTexto?: string;
  respostaArquivoUrl?: string;
  arquivoIndividualUrl?: string;
  funcionario: {
    id: string;
    cargo: string;
    matricula?: string;
    user: { name: string; email: string; emailReal?: string };
    gerencia?: { nome: string; sigla: string };
  };
}

interface ReqRhDetalhe extends ReqRhListItem {
  destinatarios: DestItem[];
}

interface FuncionarioItem {
  id: string;
  cargo: string;
  matricula?: string;
  user: { name: string };
  gerencia?: { nome: string; sigla: string };
}

interface GerenciaItem {
  id: string;
  nome: string;
  sigla: string;
}

/* ── Constantes ─────────────────────────────────────────── */
const TIPO_LABEL: Record<TipoReq, string> = {
  PERIODICO: "Periódico",
  EXAME_MEDICO: "Exame Médico",
  FERIAS: "Férias",
  ASSINATURA_DOCUMENTOS: "Assinatura de Documentos",
  OUTRO: "Outro"
};

const TIPO_COLOR: Record<TipoReq, string> = {
  PERIODICO: "#1e5c38",
  EXAME_MEDICO: "#1a4f7a",
  FERIAS: "#7a6c1a",
  ASSINATURA_DOCUMENTOS: "var(--burgundy-600)",
  OUTRO: "#555"
};

const STATUS_LABEL: Record<StatusDest, string> = {
  PENDENTE: "Pendente",
  VISUALIZADO: "Visualizado",
  RESPONDIDO: "Respondido"
};

const STATUS_COLOR: Record<StatusDest, { bg: string; text: string }> = {
  PENDENTE: { bg: "rgba(247,196,55,0.18)", text: "#8a6a00" },
  VISUALIZADO: { bg: "rgba(26,79,122,0.12)", text: "#1a4f7a" },
  RESPONDIDO: { bg: "rgba(47,125,79,0.12)", text: "#1e5c38" }
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/* ── Badge de tipo ─────────────────────────────────────── */
function TipoBadge({ tipo }: { tipo: TipoReq }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: "var(--radius-full)",
        background: `${TIPO_COLOR[tipo]}18`,
        color: TIPO_COLOR[tipo],
        flexShrink: 0
      }}
    >
      {TIPO_LABEL[tipo]}
    </span>
  );
}

/* ── Barra de progresso ────────────────────────────────── */
function ProgressBar({ respondidos, total }: { respondidos: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((respondidos / total) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "rgba(122,30,38,0.10)",
          borderRadius: 99
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: pct === 100 ? "var(--green, #2f7d4f)" : "var(--burgundy-600)",
            borderRadius: 99,
            transition: "width 300ms"
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "var(--ink-500)", whiteSpace: "nowrap" }}>
        {respondidos}/{total}
      </span>
    </div>
  );
}

/* ── Modal de Nova Requisição ──────────────────────────── */
function NovaReqModal({
  onClose,
  onCreated,
  token
}: {
  onClose: () => void;
  onCreated: () => void;
  token: string;
}) {
  const [tipo, setTipo] = useState<TipoReq>("ASSINATURA_DOCUMENTOS");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prazo, setPrazo] = useState("");
  const [arquivoBase64, setArquivoBase64] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [abaDestinatarios, setAbaDestinatarios] = useState<
    "individual" | "gerencia" | "categoria" | "todos"
  >("individual");
  const [selectedCategoria, setSelectedCategoria] = useState<
    "ESTAGIARIO" | "CONCURSADO" | "ASSESSOR" | ""
  >("");
  const [funcionarios, setFuncionarios] = useState<FuncionarioItem[]>([]);
  const [gerencias, setGerencias] = useState<GerenciaItem[]>([]);
  const [funcsComDocs, setFuncsComDocs] = useState<
    { funcionarioId: string; arquivoBase64?: string; arquivoNome?: string }[]
  >([]);
  const [selectedGerencia, setSelectedGerencia] = useState("");
  const [buscaFunc, setBuscaFunc] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const indFileRef = useRef<HTMLInputElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<FuncionarioItem[]>("/ponto/gestao/funcionarios", token)
      .then((d) => setFuncionarios(Array.isArray(d) ? d : []))
      .catch(() => {});
    api
      .get<GerenciaItem[]>("/ponto/gestao/gerencias", token)
      .then((d) => setGerencias(d ?? []))
      .catch(() => {});
  }, [token]);

  const selectedFuncIds = funcsComDocs.map((f) => f.funcionarioId);

  const sugestoes =
    buscaFunc.trim().length === 0
      ? []
      : funcionarios
          .filter((f) => {
            if (selectedFuncIds.includes(f.id)) return false;
            const b = buscaFunc.toLowerCase();
            return (
              f.user.name.toLowerCase().includes(b) ||
              f.cargo.toLowerCase().includes(b) ||
              (f.gerencia?.nome.toLowerCase().includes(b) ?? false) ||
              (f.gerencia?.sigla.toLowerCase().includes(b) ?? false)
            );
          })
          .slice(0, 8);

  function adicionarFunc(id: string) {
    setFuncsComDocs((prev) =>
      prev.some((f) => f.funcionarioId === id) ? prev : [...prev, { funcionarioId: id }]
    );
    setBuscaFunc("");
    setDropdownAberto(false);
    buscaRef.current?.focus();
  }

  function removerFunc(id: string) {
    setFuncsComDocs((prev) => prev.filter((f) => f.funcionarioId !== id));
  }

  function handleIndArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeUploadId) return;
    const nome = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      setFuncsComDocs((prev) =>
        prev.map((f) =>
          f.funcionarioId === activeUploadId
            ? { ...f, arquivoBase64: reader.result as string, arquivoNome: nome }
            : f
        )
      );
    };
    reader.readAsDataURL(file);
    if (indFileRef.current) indFileRef.current.value = "";
  }

  function removerDocIndividual(id: string) {
    setFuncsComDocs((prev) =>
      prev.map((f) =>
        f.funcionarioId === id ? { ...f, arquivoBase64: undefined, arquivoNome: undefined } : f
      )
    );
  }

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArquivoNome(file.name);
    const reader = new FileReader();
    reader.onload = () => setArquivoBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!titulo.trim()) {
      setErro("Título é obrigatório.");
      return;
    }
    if (abaDestinatarios === "individual" && funcsComDocs.length === 0) {
      setErro("Selecione ao menos um funcionário.");
      return;
    }
    if (abaDestinatarios === "gerencia" && !selectedGerencia) {
      setErro("Selecione uma gerência.");
      return;
    }
    if (abaDestinatarios === "categoria" && !selectedCategoria) {
      setErro("Selecione uma categoria.");
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      await api.post(
        "/requisicoes-rh",
        {
          tipo,
          titulo: titulo.trim(),
          descricao: descricao.trim() || undefined,
          arquivoBase64: arquivoBase64 || undefined,
          prazo: prazo || undefined,
          destinatarios: {
            modo: abaDestinatarios,
            funcionariosComDocumentos:
              abaDestinatarios === "individual"
                ? funcsComDocs.map((f) => ({
                    funcionarioId: f.funcionarioId,
                    arquivoBase64: f.arquivoBase64
                  }))
                : undefined,
            gerenciaId: abaDestinatarios === "gerencia" ? selectedGerencia : undefined,
            categoria: abaDestinatarios === "categoria" ? selectedCategoria : undefined
          }
        },
        token
      );
      onCreated();
      onClose();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,5,6,0.45)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 780,
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 60px rgba(10,5,6,0.18)"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 17,
              margin: 0
            }}
          >
            Nova Requisição
          </p>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-500)",
              padding: 4
            }}
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16
          }}
        >
          {/* Tipo */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-700)",
                display: "block",
                marginBottom: 6
              }}
            >
              Tipo *
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoReq)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid rgba(122,30,38,0.2)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                color: "var(--ink-700)",
                background: "#fff"
              }}
            >
              {(Object.keys(TIPO_LABEL) as TipoReq[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-700)",
                display: "block",
                marginBottom: 6
              }}
            >
              Título *
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Assinatura do contrato de trabalho"
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid rgba(122,30,38,0.2)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                boxSizing: "border-box"
              }}
            />
          </div>

          {/* Descrição */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-700)",
                display: "block",
                marginBottom: 6
              }}
            >
              Descrição <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>(opcional)</span>
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Instruções ou observações para o funcionário..."
              rows={3}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid rgba(122,30,38,0.2)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box"
              }}
            />
          </div>

          {/* Arquivo */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-700)",
                display: "block",
                marginBottom: 6
              }}
            >
              Documento global{" "}
              <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>
                (enviado a todos — PDF ou imagem)
              </span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleArquivo}
              style={{ display: "none" }}
            />
            <input
              ref={indFileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleIndArquivo}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                border: "1px dashed rgba(122,30,38,0.3)",
                borderRadius: "var(--radius-md)",
                background: "var(--cream-50)",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--ink-600)"
              }}
            >
              <UploadIcon size={15} />
              {arquivoNome || "Selecionar arquivo"}
            </button>
          </div>

          {/* Prazo */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-700)",
                display: "block",
                marginBottom: 6
              }}
            >
              Prazo <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>(opcional)</span>
            </label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid rgba(122,30,38,0.2)",
                borderRadius: "var(--radius-md)",
                fontSize: 13
              }}
            />
          </div>

          {/* Destinatários */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ink-700)",
                display: "block",
                marginBottom: 8
              }}
            >
              Destinatários *
            </label>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              {(["individual", "gerencia", "categoria", "todos"] as const).map((aba) => {
                const labels = {
                  individual: "Individual",
                  gerencia: "Por Gerência",
                  categoria: "Por Categoria",
                  todos: "Todos os ativos"
                };
                return (
                  <button
                    key={aba}
                    onClick={() => setAbaDestinatarios(aba)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid",
                      borderColor:
                        abaDestinatarios === aba ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)",
                      background: abaDestinatarios === aba ? "var(--burgundy-600)" : "#fff",
                      color: abaDestinatarios === aba ? "#fff" : "var(--ink-600)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    {labels[aba]}
                  </button>
                );
              })}
            </div>

            {abaDestinatarios === "individual" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Input de busca com dropdown */}
                <div style={{ position: "relative" }}>
                  <input
                    ref={buscaRef}
                    value={buscaFunc}
                    onChange={(e) => {
                      setBuscaFunc(e.target.value);
                      setDropdownAberto(e.target.value.trim().length > 0);
                    }}
                    onFocus={() => buscaFunc.trim().length > 0 && setDropdownAberto(true)}
                    onBlur={() => setTimeout(() => setDropdownAberto(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setBuscaFunc("");
                        setDropdownAberto(false);
                      }
                      if (e.key === "Enter" && sugestoes.length > 0) {
                        adicionarFunc(sugestoes[0].id);
                        e.preventDefault();
                      }
                    }}
                    placeholder={
                      funcsComDocs.length > 0
                        ? "Adicionar outro funcionário..."
                        : "Digite o nome, cargo ou gerência..."
                    }
                    autoComplete="off"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      border: "1px solid",
                      borderColor: dropdownAberto ? "var(--burgundy-600)" : "rgba(122,30,38,0.22)",
                      borderRadius: dropdownAberto
                        ? "var(--radius-md) var(--radius-md) 0 0"
                        : "var(--radius-md)",
                      fontSize: 13,
                      boxSizing: "border-box",
                      outline: "none",
                      transition: "border-color 150ms"
                    }}
                  />
                  {dropdownAberto && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "#fff",
                        border: "1px solid var(--burgundy-600)",
                        borderTop: "none",
                        borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                        boxShadow: "0 6px 20px rgba(10,5,6,0.12)",
                        zIndex: 300,
                        maxHeight: 240,
                        overflowY: "auto"
                      }}
                    >
                      {sugestoes.length === 0 ? (
                        <div
                          style={{
                            padding: "12px 14px",
                            fontSize: 12,
                            color: "var(--ink-400)",
                            textAlign: "center"
                          }}
                        >
                          Nenhum resultado para "{buscaFunc}"
                        </div>
                      ) : (
                        sugestoes.map((f) => (
                          <button
                            key={f.id}
                            onMouseDown={() => adicionarFunc(f.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              width: "100%",
                              padding: "9px 14px",
                              background: "none",
                              border: "none",
                              borderBottom: "1px solid rgba(122,30,38,0.06)",
                              cursor: "pointer",
                              textAlign: "left"
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = "rgba(122,30,38,0.04)")
                            }
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "rgba(122,30,38,0.10)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "var(--burgundy-600)",
                                flexShrink: 0
                              }}
                            >
                              {f.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--ink-800)"
                                }}
                              >
                                {f.user.name}
                              </p>
                              <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)" }}>
                                {f.cargo}
                                {f.gerencia ? ` · ${f.gerencia.nome}` : ""}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Cards por funcionário */}
                {funcsComDocs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    {funcsComDocs.map(
                      ({ funcionarioId, arquivoBase64: b64, arquivoNome: nome }) => {
                        const f = funcionarios.find((x) => x.id === funcionarioId);
                        if (!f) return null;
                        return (
                          <div
                            key={funcionarioId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "10px 12px",
                              background: "var(--cream-50)",
                              border: "1px solid rgba(122,30,38,0.12)",
                              borderRadius: "var(--radius-md)"
                            }}
                          >
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                                background: "rgba(122,30,38,0.10)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                fontWeight: 700,
                                color: "var(--burgundy-600)",
                                flexShrink: 0
                              }}
                            >
                              {f.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--ink-800)"
                                }}
                              >
                                {f.user.name}
                              </p>
                              <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)" }}>
                                {f.cargo}
                                {f.gerencia ? ` · ${f.gerencia.nome}` : ""}
                              </p>
                            </div>
                            {/* Documento individual */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                flexShrink: 0
                              }}
                            >
                              {b64 ? (
                                <>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: "#1e5c38",
                                      fontWeight: 600,
                                      maxWidth: 120,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap"
                                    }}
                                  >
                                    ✓ {nome}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setActiveUploadId(funcionarioId);
                                      setTimeout(() => indFileRef.current?.click(), 0);
                                    }}
                                    title="Substituir documento"
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      padding: "2px 4px",
                                      fontSize: 11,
                                      color: "var(--ink-500)"
                                    }}
                                  >
                                    ✎
                                  </button>
                                  <button
                                    onClick={() => removerDocIndividual(funcionarioId)}
                                    title="Remover documento"
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      padding: "2px 4px",
                                      fontSize: 13,
                                      color: "var(--ink-400)"
                                    }}
                                  >
                                    ×
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setActiveUploadId(funcionarioId);
                                    setTimeout(() => indFileRef.current?.click(), 0);
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "5px 10px",
                                    border: "1px dashed rgba(122,30,38,0.28)",
                                    borderRadius: "var(--radius-md)",
                                    background: "#fff",
                                    cursor: "pointer",
                                    fontSize: 11,
                                    color: "var(--ink-600)"
                                  }}
                                >
                                  <UploadIcon size={12} /> Doc. individual
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => removerFunc(funcionarioId)}
                              title="Remover destinatário"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "4px",
                                color: "var(--ink-400)",
                                fontSize: 16,
                                lineHeight: 1,
                                flexShrink: 0
                              }}
                              aria-label={`Remover ${f.user.name}`}
                            >
                              ×
                            </button>
                          </div>
                        );
                      }
                    )}
                    <p style={{ fontSize: 11, color: "var(--ink-500)", margin: 0 }}>
                      {funcsComDocs.length} destinatário(s) · Os documentos individuais são
                      exclusivos de cada funcionário.
                    </p>
                  </div>
                )}
              </div>
            )}

            {abaDestinatarios === "gerencia" && (
              <select
                value={selectedGerencia}
                onChange={(e) => setSelectedGerencia(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid rgba(122,30,38,0.2)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  background: "#fff"
                }}
              >
                <option value="">Selecione uma gerência...</option>
                {gerencias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            )}

            {abaDestinatarios === "categoria" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>
                  Selecione a categoria de funcionários que receberão a requisição:
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(
                    [
                      { value: "ASSESSOR", label: "Assessores", cor: "#1a4f7a" },
                      { value: "ESTAGIARIO", label: "Estagiários", cor: "#7a6c1a" },
                      { value: "CONCURSADO", label: "Concursados", cor: "#1e5c38" }
                    ] as const
                  ).map((cat) => {
                    const ativo = selectedCategoria === cat.value;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setSelectedCategoria(ativo ? "" : cat.value)}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "var(--radius-md)",
                          border: `2px solid ${ativo ? cat.cor : "rgba(0,0,0,0.12)"}`,
                          background: ativo ? `${cat.cor}14` : "#fff",
                          color: ativo ? cat.cor : "var(--ink-600)",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 150ms"
                        }}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
                {selectedCategoria && (
                  <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>
                    A requisição será enviada para todos os{" "}
                    <strong style={{ color: "var(--ink-700)" }}>
                      {selectedCategoria === "ASSESSOR"
                        ? "Assessores"
                        : selectedCategoria === "ESTAGIARIO"
                          ? "Estagiários"
                          : "Concursados"}
                    </strong>{" "}
                    ativos.
                  </p>
                )}
              </div>
            )}

            {abaDestinatarios === "todos" && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "rgba(122,30,38,0.04)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.10)",
                  fontSize: 13,
                  color: "var(--ink-600)"
                }}
              >
                A requisição será enviada para <strong>todos os funcionários ativos</strong>{" "}
                cadastrados no sistema.
              </div>
            )}
          </div>

          {erro && (
            <p
              style={{
                fontSize: 13,
                color: "var(--red, #c0392b)",
                margin: 0,
                padding: "8px 12px",
                background: "rgba(192,57,43,0.07)",
                borderRadius: "var(--radius-md)"
              }}
            >
              {erro}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "14px 24px",
            borderTop: "1px solid rgba(122,30,38,0.08)",
            justifyContent: "flex-end"
          }}
        >
          <button
            onClick={onClose}
            disabled={salvando}
            style={{
              padding: "9px 18px",
              border: "1px solid rgba(122,30,38,0.2)",
              borderRadius: "var(--radius-md)",
              background: "#fff",
              fontSize: 13,
              cursor: "pointer",
              color: "var(--ink-600)"
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={salvando}
            style={{
              padding: "9px 20px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--burgundy-600)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: salvando ? "not-allowed" : "pointer",
              opacity: salvando ? 0.7 : 1
            }}
          >
            {salvando ? "Criando..." : "Criar Requisição"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Card expandível ───────────────────────────────────── */
function ReqCard({ item, token }: { item: ReqRhListItem; token: string }) {
  const [expanded, setExpanded] = useState(false);
  const [detalhe, setDetalhe] = useState<ReqRhDetalhe | null>(null);
  const [loadingDet, setLoadingDet] = useState(false);

  async function toggleExpand() {
    if (!expanded && !detalhe) {
      setLoadingDet(true);
      try {
        const d = await api.get<ReqRhDetalhe>(`/requisicoes-rh/${item.id}`, token);
        setDetalhe(d);
      } catch {
        /* ignore */
      } finally {
        setLoadingDet(false);
      }
    }
    setExpanded((v) => !v);
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(122,30,38,0.08)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(10,5,6,0.05)"
      }}
    >
      {/* Header do card */}
      <button
        onClick={toggleExpand}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          padding: "14px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left"
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: `${TIPO_COLOR[item.tipo]}14`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: TIPO_COLOR[item.tipo],
            flexShrink: 0
          }}
        >
          <FileTextIcon size={16} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 4
            }}
          >
            <TipoBadge tipo={item.tipo} />
            {item.prazo && (
              <span style={{ fontSize: 10, color: "var(--ink-500)" }}>
                Prazo: {fmtDate(item.prazo)}
              </span>
            )}
          </div>
          <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
            {item.titulo}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)" }}>
            Criado em {fmtDate(item.criadaEm)} por {item.criadoPor.name}
          </p>
          <div style={{ marginTop: 8, maxWidth: 240 }}>
            <ProgressBar respondidos={item.respondidos} total={item.totalDestinatarios} />
          </div>
        </div>

        <ChevronDownIcon
          size={16}
          style={{
            color: "var(--ink-400)",
            flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 200ms"
          }}
        />
      </button>

      {/* Detalhe expandido */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(122,30,38,0.08)", padding: "14px 16px" }}>
          {loadingDet && (
            <p style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center" }}>
              Carregando...
            </p>
          )}
          {detalhe && (
            <>
              {detalhe.descricao && (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-600)",
                    margin: "0 0 12px",
                    lineHeight: 1.5
                  }}
                >
                  {detalhe.descricao}
                </p>
              )}
              {detalhe.arquivoUrl && (
                <a
                  href={detalhe.arquivoUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--burgundy-600)",
                    marginBottom: 14,
                    fontWeight: 600
                  }}
                >
                  <DownloadIcon size={13} /> Documento do RH
                </a>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--cream-50)" }}>
                      {[
                        "Funcionário",
                        "Gerência",
                        "Status",
                        "Respondido em",
                        "Documento",
                        "Resposta"
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "7px 10px",
                            textAlign: "left",
                            fontWeight: 700,
                            color: "var(--ink-600)",
                            borderBottom: "1px solid rgba(122,30,38,0.08)",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.destinatarios.map((d) => {
                      const sc = STATUS_COLOR[d.status];
                      return (
                        <tr key={d.id} style={{ borderBottom: "1px solid rgba(122,30,38,0.05)" }}>
                          <td
                            style={{
                              padding: "8px 10px",
                              color: "var(--ink-800)",
                              fontWeight: 500
                            }}
                          >
                            {d.funcionario.user.name}
                          </td>
                          <td style={{ padding: "8px 10px", color: "var(--ink-500)" }}>
                            {d.funcionario.gerencia?.nome ?? "—"}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "3px 7px",
                                borderRadius: "var(--radius-full)",
                                background: sc.bg,
                                color: sc.text
                              }}
                            >
                              {STATUS_LABEL[d.status]}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", color: "var(--ink-500)" }}>
                            {d.respondidaEm ? fmtDate(d.respondidaEm) : "—"}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            {d.arquivoIndividualUrl ? (
                              <a
                                href={d.arquivoIndividualUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  color: "#1a4f7a",
                                  fontSize: 11
                                }}
                              >
                                <DownloadIcon size={12} /> Baixar
                              </a>
                            ) : (
                              <span style={{ color: "var(--ink-400)" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            {d.respostaArquivoUrl ? (
                              <a
                                href={d.respostaArquivoUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  color: "var(--burgundy-600)",
                                  fontSize: 11
                                }}
                              >
                                <DownloadIcon size={12} /> Baixar
                              </a>
                            ) : d.respostaTexto ? (
                              <span style={{ color: "var(--ink-600)", fontStyle: "italic" }}>
                                {d.respostaTexto}
                              </span>
                            ) : (
                              <span style={{ color: "var(--ink-400)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Página principal ──────────────────────────────────── */
export function RequisicaoRhAdminPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<ReqRhListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  /* filtros */
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoReq | "">("");
  const [filtroProgresso, setFiltroProgresso] = useState<"" | "pendentes" | "concluidas">("");
  const [filtroAtiva, setFiltroAtiva] = useState(true);

  const carregar = useCallback(async () => {
    const tk = token();
    if (!tk) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const res = await api.get<{ data: ReqRhListItem[] }>("/requisicoes-rh?limit=200", tk);
      setItems(res?.data ?? []);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const tk = token() ?? "";

  const temFiltro = !!(busca || filtroTipo || filtroProgresso || !filtroAtiva);

  const itensFiltrados = items.filter((item) => {
    if (filtroAtiva && !item.ativa) return false;
    if (filtroTipo && item.tipo !== filtroTipo) return false;
    if (filtroProgresso === "pendentes" && item.pendentes === 0) return false;
    if (filtroProgresso === "concluidas" && item.respondidos !== item.totalDestinatarios)
      return false;
    if (busca.trim()) {
      const b = busca.toLowerCase();
      const matchTitulo = item.titulo.toLowerCase().includes(b);
      const matchCriador = item.criadoPor.name.toLowerCase().includes(b);
      const matchTipo = TIPO_LABEL[item.tipo].toLowerCase().includes(b);
      if (!matchTitulo && !matchCriador && !matchTipo) return false;
    }
    return true;
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 22,
              fontWeight: 400,
              margin: "0 0 4px"
            }}
          >
            Requisições do RH
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
            Crie e acompanhe solicitações enviadas aos funcionários.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={carregar}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              border: "1px solid rgba(122,30,38,0.2)",
              borderRadius: "var(--radius-md)",
              background: "#fff",
              fontSize: 12,
              cursor: "pointer",
              color: "var(--ink-600)"
            }}
          >
            <RefreshCwIcon size={13} /> Atualizar
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--burgundy-600)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            <PlusIcon size={14} /> Nova Requisição
          </button>
        </div>
      </div>

      {/* Barra de filtros */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(122,30,38,0.10)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 16px",
          marginBottom: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        {/* Busca por texto */}
        <div style={{ position: "relative" }}>
          <svg
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-400)",
              pointerEvents: "none"
            }}
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, tipo ou criador..."
            style={{
              width: "100%",
              padding: "8px 12px 8px 30px",
              border: "1px solid rgba(122,30,38,0.18)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              boxSizing: "border-box",
              outline: "none",
              color: "var(--ink-700)"
            }}
          />
          {busca && (
            <button
              onClick={() => setBusca("")}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-400)",
                lineHeight: 1,
                fontSize: 16
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Filtros em linha */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* Tipo */}
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoReq | "")}
            style={{
              padding: "6px 10px",
              border: `1px solid ${filtroTipo ? "var(--burgundy-600)" : "rgba(122,30,38,0.18)"}`,
              borderRadius: "var(--radius-md)",
              fontSize: 12,
              background: "#fff",
              color: filtroTipo ? "var(--burgundy-600)" : "var(--ink-600)",
              fontWeight: filtroTipo ? 600 : 400,
              cursor: "pointer"
            }}
          >
            <option value="">Todos os tipos</option>
            {(Object.keys(TIPO_LABEL) as TipoReq[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>

          {/* Progresso */}
          {(["", "pendentes", "concluidas"] as const).map((v) => {
            const labels = { "": "Todos", pendentes: "Com pendentes", concluidas: "Concluídas" };
            const ativo = filtroProgresso === v;
            return (
              <button
                key={v}
                onClick={() => setFiltroProgresso(v)}
                style={{
                  padding: "6px 12px",
                  border: `1px solid ${ativo ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)"}`,
                  borderRadius: "var(--radius-full)",
                  background: ativo ? "var(--burgundy-600)" : "#fff",
                  color: ativo ? "#fff" : "var(--ink-600)",
                  fontSize: 12,
                  fontWeight: ativo ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 150ms"
                }}
              >
                {labels[v]}
              </button>
            );
          })}

          {/* Separador */}
          <div
            style={{ width: 1, height: 20, background: "rgba(122,30,38,0.12)", margin: "0 2px" }}
          />

          {/* Ativas / Todas */}
          <button
            onClick={() => setFiltroAtiva((v) => !v)}
            style={{
              padding: "6px 12px",
              border: `1px solid ${filtroAtiva ? "rgba(47,125,79,0.4)" : "rgba(122,30,38,0.15)"}`,
              borderRadius: "var(--radius-full)",
              background: filtroAtiva ? "rgba(47,125,79,0.10)" : "#fff",
              color: filtroAtiva ? "#1e5c38" : "var(--ink-500)",
              fontSize: 12,
              fontWeight: filtroAtiva ? 600 : 400,
              cursor: "pointer",
              transition: "all 150ms"
            }}
          >
            {filtroAtiva ? "Somente ativas" : "Todas (incl. inativas)"}
          </button>

          {/* Limpar filtros */}
          {temFiltro && (
            <button
              onClick={() => {
                setBusca("");
                setFiltroTipo("");
                setFiltroProgresso("");
                setFiltroAtiva(true);
              }}
              style={{
                marginLeft: "auto",
                padding: "6px 10px",
                border: "none",
                background: "none",
                color: "var(--burgundy-600)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Contador de resultados */}
        {!loading && (
          <p style={{ fontSize: 11, color: "var(--ink-400)", margin: 0 }}>
            {itensFiltrados.length === items.length
              ? `${items.length} requisição(ões)`
              : `${itensFiltrados.length} de ${items.length} requisição(ões)`}
          </p>
        )}
      </div>

      {/* Lista */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--ink-500)", fontSize: 13 }}>
          Carregando...
        </div>
      )}
      {!loading && erro && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(192,57,43,0.07)",
            borderRadius: "var(--radius-md)",
            fontSize: 13,
            color: "#c0392b"
          }}
        >
          {erro}
        </div>
      )}
      {!loading && !erro && items.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          <FileTextIcon size={32} style={{ color: "var(--ink-300)", marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: "var(--ink-500)", margin: 0 }}>
            Nenhuma requisição criada. Clique em "Nova Requisição" para começar.
          </p>
        </div>
      )}
      {!loading && !erro && items.length > 0 && itensFiltrados.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 24px",
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
            Nenhuma requisição com os filtros selecionados.{" "}
            <button
              onClick={() => {
                setBusca("");
                setFiltroTipo("");
                setFiltroProgresso("");
                setFiltroAtiva(true);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--burgundy-600)",
                fontSize: 13,
                fontWeight: 600,
                padding: 0
              }}
            >
              Limpar filtros
            </button>
          </p>
        </div>
      )}
      {!loading && !erro && itensFiltrados.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {itensFiltrados.map((item) => (
            <ReqCard key={item.id} item={item} token={tk} />
          ))}
        </div>
      )}

      {showModal && (
        <NovaReqModal token={tk} onClose={() => setShowModal(false)} onCreated={carregar} />
      )}
    </div>
  );
}

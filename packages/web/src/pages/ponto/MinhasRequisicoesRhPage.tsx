import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftIcon,
  UploadIcon,
  SendIcon,
  RefreshCwIcon,
  FileTextIcon
} from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { RequerimentoEnderecoCard } from "../../components/RequerimentoEnderecoCard";
import { LinkDocumentoAnexado } from "./solicitacaoUi";

/* ── Tipos ─────────────────────────────────────────────── */
type TipoReq = "PERIODICO" | "EXAME_MEDICO" | "FERIAS" | "ASSINATURA_DOCUMENTOS" | "OUTRO";
type StatusDest = "PENDENTE" | "VISUALIZADO" | "RESPONDIDO";

interface MinhaReqItem {
  id: string;
  status: StatusDest;
  visualizadaEm?: string;
  respondidaEm?: string;
  respostaTexto?: string;
  respostaArquivoUrl?: string;
  arquivoIndividualUrl?: string;
  requisicao: {
    id: string;
    tipo: TipoReq;
    titulo: string;
    descricao?: string;
    arquivoUrl?: string;
    prazo?: string;
    criadaEm: string;
    criadoPor: { name: string };
  };
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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function prazoInfo(prazo?: string): { label: string; color: string } | null {
  if (!prazo) return null;
  const diff = Math.ceil((new Date(prazo).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { label: `Vencido há ${Math.abs(diff)} dia(s)`, color: "#c0392b" };
  if (diff <= 3) return { label: `Prazo: ${fmtDate(prazo)} (${diff} dia(s))`, color: "#e67e22" };
  return { label: `Prazo: ${fmtDate(prazo)}`, color: "var(--ink-500)" };
}

/* ── Card de requisição do funcionário ─────────────────── */
function MinhaReqCard({
  item,
  token,
  onAtualizar
}: {
  item: MinhaReqItem;
  token: string;
  onAtualizar: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [texto, setTexto] = useState("");
  const [arquivoBase64, setArquivoBase64] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const req = item.requisicao;
  const pz = prazoInfo(req.prazo);

  async function handleExpand() {
    if (!expanded && item.status === "PENDENTE") {
      try {
        await api.patch(`/requisicoes-rh/${item.id}/visualizar`, {}, token);
        onAtualizar();
      } catch {
        /* ignore */
      }
    }
    setExpanded((v) => !v);
  }

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArquivoNome(file.name);
    const reader = new FileReader();
    reader.onload = () => setArquivoBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleEnviar() {
    if (!arquivoBase64 && !texto.trim()) {
      setErro("Envie um arquivo ou escreva uma resposta.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await api.patch(
        `/requisicoes-rh/${item.id}/responder`,
        {
          texto: texto.trim() || undefined,
          arquivoBase64: arquivoBase64 || undefined
        },
        token
      );
      onAtualizar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const statusColors: Record<StatusDest, { bg: string; text: string; label: string }> = {
    PENDENTE: { bg: "rgba(247,196,55,0.18)", text: "#8a6a00", label: "Pendente" },
    VISUALIZADO: { bg: "rgba(26,79,122,0.12)", text: "#1a4f7a", label: "Visualizado" },
    RESPONDIDO: { bg: "rgba(47,125,79,0.12)", text: "#1e5c38", label: "Respondido" }
  };

  const sc = statusColors[item.status];

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${item.status === "PENDENTE" ? "rgba(122,30,38,0.14)" : "rgba(122,30,38,0.08)"}`,
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        boxShadow:
          item.status === "PENDENTE"
            ? "0 2px 8px rgba(122,30,38,0.07)"
            : "0 1px 4px rgba(10,5,6,0.04)"
      }}
    >
      {/* Header clicável */}
      <button
        onClick={handleExpand}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          padding: "14px 16px",
          background: item.status === "PENDENTE" ? "rgba(122,30,38,0.02)" : "none",
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
            background: `${TIPO_COLOR[req.tipo]}14`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: TIPO_COLOR[req.tipo],
            flexShrink: 0,
            marginTop: 2
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
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: "var(--radius-full)",
                background: `${TIPO_COLOR[req.tipo]}18`,
                color: TIPO_COLOR[req.tipo]
              }}
            >
              {TIPO_LABEL[req.tipo]}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "var(--radius-full)",
                background: sc.bg,
                color: sc.text
              }}
            >
              {sc.label}
            </span>
          </div>
          <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
            {req.titulo}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--ink-500)" }}>
            Enviado por {req.criadoPor.name} em {fmtDate(req.criadaEm)}
          </p>
          {pz && (
            <p style={{ margin: "3px 0 0", fontSize: 11, color: pz.color, fontWeight: 600 }}>
              {pz.label}
            </p>
          )}
        </div>

        <span style={{ fontSize: 18, color: "var(--ink-300)", flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Conteúdo expandido */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(122,30,38,0.08)", padding: "16px" }}>
          {req.descricao && (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-700)",
                margin: "0 0 14px",
                lineHeight: 1.55
              }}
            >
              {req.descricao}
            </p>
          )}

          {(req.arquivoUrl || item.arquivoIndividualUrl) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {req.arquivoUrl && (
                <LinkDocumentoAnexado
                  href={req.arquivoUrl}
                  label="Ver documento — Documento do RH"
                  variant="rh"
                  style={{ marginTop: 0 }}
                />
              )}
              {item.arquivoIndividualUrl && (
                <LinkDocumentoAnexado
                  href={item.arquivoIndividualUrl}
                  label="Ver documento — Documento individual"
                  variant="rh"
                  style={{ marginTop: 0 }}
                />
              )}
            </div>
          )}

          {item.status === "RESPONDIDO" ? (
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(47,125,79,0.06)",
                border: "1px solid rgba(47,125,79,0.15)",
                borderRadius: "var(--radius-md)"
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 700, color: "#1e5c38", margin: "0 0 6px" }}>
                ✓ Resposta enviada em {item.respondidaEm ? fmtDate(item.respondidaEm) : "—"}
              </p>
              {item.respostaTexto && (
                <p style={{ fontSize: 13, color: "var(--ink-700)", margin: "0 0 6px" }}>
                  {item.respostaTexto}
                </p>
              )}
              {item.respostaArquivoUrl && (
                <LinkDocumentoAnexado
                  href={item.respostaArquivoUrl}
                  label="Ver documento — Arquivo enviado"
                  variant="retorno"
                  style={{ marginTop: 0 }}
                />
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-700)", margin: 0 }}>
                Sua resposta
              </p>

              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Observações (opcional)..."
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

              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleArquivo}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "8px 14px",
                    border: "1px dashed rgba(122,30,38,0.3)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--cream-50)",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--ink-600)"
                  }}
                >
                  <UploadIcon size={14} />
                  {arquivoNome || "Anexar arquivo (PDF ou imagem)"}
                </button>
              </div>

              {erro && <p style={{ fontSize: 12, color: "#c0392b", margin: 0 }}>{erro}</p>}

              <button
                onClick={handleEnviar}
                disabled={enviando}
                style={{
                  alignSelf: "flex-start",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "9px 20px",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  background: "var(--burgundy-600)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: enviando ? "not-allowed" : "pointer",
                  opacity: enviando ? 0.7 : 1
                }}
              >
                <SendIcon size={14} />
                {enviando ? "Enviando..." : "Enviar Resposta"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Página principal ──────────────────────────────────── */
export function MinhasRequisicoesRhPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<MinhaReqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<StatusDest | "">("");
  const [filtroTipo, setFiltroTipo] = useState<TipoReq | "">("");
  const [reqEnderecoPendente, setReqEnderecoPendente] = useState(false);

  const carregar = useCallback(async () => {
    const tk = token();
    if (!tk) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const [data, req] = await Promise.all([
        api.get<MinhaReqItem[]>("/requisicoes-rh/minhas", tk),
        api
          .get<{ id: string; status: string } | null>("/ponto/requerimento-endereco", tk)
          .catch(() => null)
      ]);
      setItems(data ?? []);
      setReqEnderecoPendente(req?.status === "PENDENTE");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pendentes = items.filter((i) => i.status === "PENDENTE").length;
  const tk = token() ?? "";

  const itensFiltrados = items.filter((i) => {
    if (filtroStatus && i.status !== filtroStatus) return false;
    if (filtroTipo && i.requisicao.tipo !== filtroTipo) return false;
    return true;
  });

  const contStatus = (s: StatusDest) => items.filter((i) => i.status === s).length;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 24 }}>
        <Link
          to="/ponto"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--ink-500)",
            marginBottom: 10,
            textDecoration: "none"
          }}
        >
          <ArrowLeftIcon size={13} /> Voltar ao início
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10
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
              Minhas Requisições do RH
            </h1>
            {!loading && (
              <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
                {pendentes > 0 ? (
                  <span>
                    <strong style={{ color: "#8a6a00" }}>{pendentes} pendente(s)</strong>
                    {items.length - pendentes > 0 &&
                      ` · ${items.length - pendentes} já respondida(s)`}
                  </span>
                ) : items.length > 0 ? (
                  "Todas as requisições foram respondidas."
                ) : (
                  "Nenhuma requisição no momento."
                )}
              </p>
            )}
          </div>
          <button
            onClick={carregar}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
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
        </div>
      </div>

      {/* Requerimento de endereço residencial */}
      {reqEnderecoPendente && (
        <RequerimentoEnderecoCard
          onRespondido={() => {
            setReqEnderecoPendente(false);
          }}
        />
      )}

      {/* Filtros */}
      {!loading && !erro && items.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Filtro por status */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              {
                value: "" as const,
                label: "Todos",
                count: items.length,
                bg: "rgba(122,30,38,0.06)",
                color: "var(--ink-700)",
                active: "var(--burgundy-600)",
                activeText: "#fff"
              },
              {
                value: "PENDENTE" as const,
                label: "Pendentes",
                count: contStatus("PENDENTE"),
                bg: "rgba(247,196,55,0.14)",
                color: "#8a6a00",
                active: "rgba(247,196,55,0.9)",
                activeText: "#5a4400"
              },
              {
                value: "VISUALIZADO" as const,
                label: "Visualizados",
                count: contStatus("VISUALIZADO"),
                bg: "rgba(26,79,122,0.10)",
                color: "#1a4f7a",
                active: "#1a4f7a",
                activeText: "#fff"
              },
              {
                value: "RESPONDIDO" as const,
                label: "Respondidos",
                count: contStatus("RESPONDIDO"),
                bg: "rgba(47,125,79,0.10)",
                color: "#1e5c38",
                active: "#1e5c38",
                activeText: "#fff"
              }
            ].map((opt) => {
              const ativo = filtroStatus === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setFiltroStatus(opt.value)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    border: `1px solid ${ativo ? opt.active : "rgba(122,30,38,0.14)"}`,
                    borderRadius: "var(--radius-full)",
                    background: ativo ? opt.active : "#fff",
                    color: ativo ? opt.activeText : opt.color,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 150ms"
                  }}
                >
                  {opt.label}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: "var(--radius-full)",
                      background: ativo ? "rgba(255,255,255,0.22)" : opt.bg,
                      color: ativo ? opt.activeText : opt.color
                    }}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filtro por tipo */}
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoReq | "")}
            style={{
              alignSelf: "flex-start",
              padding: "6px 10px",
              border: `1px solid ${filtroTipo ? "var(--burgundy-600)" : "rgba(122,30,38,0.18)"}`,
              borderRadius: "var(--radius-md)",
              fontSize: 12,
              color: filtroTipo ? "var(--burgundy-600)" : "var(--ink-600)",
              background: "#fff",
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
        </div>
      )}

      {/* Conteúdo */}
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
            padding: "56px 24px",
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          <FileTextIcon size={36} style={{ color: "var(--ink-300)", marginBottom: 14 }} />
          <p style={{ fontSize: 14, color: "var(--ink-500)", margin: 0 }}>
            Nenhuma requisição do RH para você no momento.
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
                setFiltroStatus("");
                setFiltroTipo("");
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
            <MinhaReqCard key={item.id} item={item} token={tk} onAtualizar={carregar} />
          ))}
        </div>
      )}
    </div>
  );
}

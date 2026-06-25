import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileTextIcon, ArrowLeftIcon, DownloadIcon, RefreshCwIcon } from "../../components/icons";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { DocumentoRhEnvio, DocumentoRhUpload } from "../../components/ponto/DocumentoRhUpload";

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

export function DocumentosRhPage() {
  const isMobile = useIsMobile(768);
  const { token } = useAuth();
  const [documentos, setDocumentos] = useState<DocumentoRhEnvio[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const tk = token();
    if (!tk) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const data = await api.get<DocumentoRhEnvio[]>("/ponto/documentos-rh", tk);
      setDocumentos(data ?? []);
    } catch (e) {
      setErro((e as Error).message);
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12
        }}
      >
        <div>
          <Link
            to="/ponto"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: "var(--ink-500)",
              marginBottom: 10
            }}
          >
            <ArrowLeftIcon size={13} /> Voltar ao início
          </Link>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Comunicação com o RH
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            Documentos <em>enviados ao RH</em>
          </h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={carregar} style={{ gap: 6 }}>
          <RefreshCwIcon size={14} /> Atualizar
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 16,
          marginBottom: 24
        }}
      >
        <div className="card-flat">
          <DocumentoRhUpload onEnviado={() => carregar()} />
        </div>

        <div className="card-flat" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 16,
              margin: 0
            }}
          >
            Orientações
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: "var(--ink-700)",
              lineHeight: 1.55
            }}
          >
            <li>Formatos aceitos: JPG, PNG, WEBP e PDF.</li>
            <li>Descreva o conteúdo do documento para facilitar a triagem do RH.</li>
            <li>O histórico abaixo registra todos os envios realizados por você.</li>
          </ul>
        </div>
      </div>

      <div className="card-flat">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            gap: 12
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 16,
              margin: 0
            }}
          >
            Histórico de envios
          </p>
          <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
            {documentos.length} documento{documentos.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-500)",
              textAlign: "center",
              padding: "24px 0"
            }}
          >
            Carregando histórico…
          </p>
        ) : erro ? (
          <p style={{ fontSize: 13, color: "var(--red)", textAlign: "center", padding: "24px 0" }}>
            {erro}
          </p>
        ) : documentos.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-500)",
              textAlign: "center",
              padding: "24px 0"
            }}
          >
            Nenhum documento enviado ainda.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {documentos.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 14px",
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.08)"
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(122,30,38,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--burgundy-600)",
                    flexShrink: 0
                  }}
                >
                  <FileTextIcon size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--ink-900)",
                      margin: "0 0 4px"
                    }}
                  >
                    {doc.descricao}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0 }}>
                    {fmtDateTime(doc.createdAt)}
                    {doc.nomeArquivo ? ` · ${doc.nomeArquivo}` : ""}
                  </p>
                </div>
                {doc.arquivoUrl && (
                  <a
                    href={doc.arquivoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    style={{ gap: 5, flexShrink: 0 }}
                  >
                    <DownloadIcon size={14} /> Abrir
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

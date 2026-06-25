import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadIcon, ArrowRightIcon, CheckCircleIcon, SendIcon, XIcon } from "../icons";
import { api } from "../../hooks/useApi";

export interface DocumentoRhEnvio {
  id: string;
  descricao: string;
  arquivoUrl: string;
  nomeArquivo: string | null;
  mimeType: string | null;
  createdAt: string;
}

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

interface Props {
  compact?: boolean;
  onEnviado?: (doc: DocumentoRhEnvio) => void;
}

export function DocumentoRhUpload({ compact = false, onEnviado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [descricao, setDescricao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function handleArquivo(file: File | null) {
    setArquivo(file);
    setErro(null);
    setSucesso(false);
  }

  function removerArquivo(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function enviar() {
    if (!descricao.trim() || descricao.trim().length < 3) {
      setErro("Informe uma descrição com pelo menos 3 caracteres.");
      return;
    }
    if (!arquivo) {
      setErro("Selecione um arquivo (imagem ou PDF).");
      return;
    }

    setEnviando(true);
    setErro(null);
    setSucesso(false);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
        reader.readAsDataURL(arquivo);
      });

      const doc = await api.post<DocumentoRhEnvio>("/ponto/documentos-rh", {
        descricao: descricao.trim(),
        arquivoBase64: base64,
        mimeType: arquivo.type,
        nomeArquivo: arquivo.name
      });

      setDescricao("");
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      setSucesso(true);
      onEnviado?.(doc);
    } catch (e) {
      setErro((e as Error).message || "Erro ao enviar documento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14, height: "100%" }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            color: "var(--burgundy-600)",
            fontSize: compact ? 15 : 16,
            margin: 0
          }}
        >
          Envio ao RH
        </p>
        <Link
          to="/ponto/documentos-rh"
          style={{
            fontSize: 12,
            color: "var(--ink-500)",
            display: "flex",
            alignItems: "center",
            gap: 3,
            whiteSpace: "nowrap"
          }}
        >
          Ver histórico <ArrowRightIcon size={11} />
        </Link>
      </div>

      <p style={{ fontSize: 12, color: "var(--ink-500)", margin: 0, lineHeight: 1.45 }}>
        Envie documentos ao setor de RH com uma breve descrição (atestados, comprovantes, etc.).
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <textarea
          value={descricao}
          onChange={(e) => {
            setDescricao(e.target.value);
            setErro(null);
            setSucesso(false);
          }}
          placeholder="Descrição do documento…"
          rows={compact ? 2 : 3}
          style={{
            width: "100%",
            resize: "vertical",
            minHeight: compact ? 48 : 72,
            padding: compact ? "8px 10px" : "10px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.12)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            background: "var(--cream-50)",
            color: "var(--ink-900)"
          }}
        />

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: compact ? "4px 4px 4px 8px" : "5px 5px 5px 10px",
              borderRadius: "var(--radius-md)",
              border: "1.5px dashed rgba(122,30,38,0.20)",
              background: "rgba(122,30,38,0.03)",
              height: compact ? 32 : 36
            }}
          >
            <label
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer"
              }}
            >
              <UploadIcon size={14} style={{ color: "var(--burgundy-600)", flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-700)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {arquivo ? arquivo.name : "Imagem ou PDF"}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                style={{ display: "none" }}
                onChange={(e) => handleArquivo(e.target.files?.[0] ?? null)}
              />
            </label>
            {arquivo && (
              <button
                type="button"
                onClick={removerArquivo}
                aria-label="Remover arquivo selecionado"
                title="Remover arquivo"
                style={{
                  width: 22,
                  height: 22,
                  padding: 0,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  borderRadius: 6,
                  background: "rgba(122,30,38,0.10)",
                  color: "var(--burgundy-600)",
                  cursor: "pointer"
                }}
              >
                <XIcon size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={enviar}
            disabled={enviando}
            aria-label="Enviar documento"
            title={enviando ? "Enviando…" : "Enviar documento"}
            style={{
              width: compact ? 32 : 36,
              height: compact ? 32 : 36,
              padding: 0,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <SendIcon size={15} />
          </button>
        </div>
      </div>

      {erro && <p style={{ fontSize: 11, color: "var(--red)", margin: 0 }}>{erro}</p>}
      {sucesso && (
        <p
          style={{
            fontSize: 11,
            color: "var(--green)",
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 4
          }}
        >
          <CheckCircleIcon size={13} /> Enviado!
        </p>
      )}
    </div>
  );
}

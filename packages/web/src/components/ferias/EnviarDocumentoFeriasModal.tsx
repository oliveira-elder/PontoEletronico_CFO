import React, { useState } from "react";
import { api } from "../../hooks/useApi";

export type TipoDocumentoFerias = "AVISO" | "RECIBO" | "OUTROS";

/** Modal do RH para enviar UM documento de férias (Aviso, Recibo ou outro). `url` é o PATCH do tipo escolhido. */
export function EnviarDocumentoFeriasModal({
  tipo,
  url,
  onClose,
  onEnviado
}: {
  tipo: TipoDocumentoFerias;
  /** Ex.: `/auditoria/rh/solicitacoes/ID/ferias/documentos/AVISO`. */
  url: string;
  onClose: () => void;
  onEnviado: () => void;
}) {
  const [arquivo, setArquivo] = useState<{ base64: string; nome: string; mime: string } | null>(
    null
  );
  const [rotulo, setRotulo] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const escolher = (file: File | undefined) => {
    if (!file) return;
    if (!(file.type === "application/pdf" || file.type.startsWith("image/"))) {
      setErro("Formato não aceito. Envie PDF ou imagem (JPG, PNG).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErro("O arquivo excede 10 MB.");
      return;
    }
    setErro("");
    const reader = new FileReader();
    reader.onload = (ev) =>
      setArquivo({ base64: ev.target?.result as string, nome: file.name, mime: file.type });
    reader.readAsDataURL(file);
  };

  async function enviar() {
    if (!arquivo) return;
    if (tipo === "OUTROS" && !rotulo.trim()) {
      setErro("Descreva o documento.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await api.patch(url, {
        arquivoBase64: arquivo.base64,
        nomeArquivo: arquivo.nome,
        mimeType: arquivo.mime,
        rotulo: tipo === "OUTROS" ? rotulo.trim() : undefined,
        observacao: obs.trim() || undefined
      });
      onEnviado();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível enviar o documento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && !enviando && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 480,
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#2f7d4f" }}>
          🌴{" "}
          {tipo === "AVISO"
            ? "Enviar Aviso de Férias"
            : tipo === "RECIBO"
              ? "Enviar Recibo de Férias"
              : "Enviar outro documento"}
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-600)" }}>
          {tipo === "AVISO"
            ? "O funcionário assina até o 1º dia de gozo; a assinatura do Aviso aprova as férias."
            : tipo === "RECIBO"
              ? "O funcionário assina até o fim do mês do término do gozo; não trava a aprovação das férias."
              : "Documento adicional para o funcionário assinar."}
        </p>
        {tipo === "OUTROS" && (
          <input
            type="text"
            value={rotulo}
            onChange={(e) => setRotulo(e.target.value)}
            placeholder="Descrição (ex.: Termo de opção)"
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(122,30,38,0.14)",
              borderRadius: "var(--radius-md)",
              fontSize: 13
            }}
          />
        )}
        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 12px",
            border: "1px dashed rgba(47,125,79,0.5)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontSize: 13
          }}
        >
          📎 {arquivo ? arquivo.nome : "Selecionar arquivo (PDF ou imagem, até 10 MB)"}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            style={{ display: "none" }}
            onChange={(e) => {
              escolher(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          rows={2}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observação para o funcionário (opcional)"
          style={{
            padding: "8px 10px",
            border: "1px solid rgba(122,30,38,0.14)",
            borderRadius: "var(--radius-md)",
            fontSize: 13,
            resize: "vertical"
          }}
        />
        {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>⚠ {erro}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={enviando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void enviar()}
            disabled={enviando || !arquivo}
          >
            {enviando ? "Enviando…" : "Enviar ao funcionário"}
          </button>
        </div>
      </div>
    </div>
  );
}

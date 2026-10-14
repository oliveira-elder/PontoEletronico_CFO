import React, { useRef, useState } from "react";
import { api } from "../../hooks/useApi";
import { hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { lerArquivoBase64 } from "./tipos";

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid rgba(122,30,38,0.18)",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  boxSizing: "border-box"
};
const lbl: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  display: "block",
  marginBottom: 3
};

/**
 * Funcionário envia o ASO do exame periódico (resposta a uma requisição "Exame Médico" ou envio
 * por conta própria). Vale só depois de conferido pelo RH.
 */
export function FormEnviarExame({
  destinatarioId,
  onEnviado
}: {
  destinatarioId?: string;
  onEnviado: () => void;
}) {
  const [data, setData] = useState("");
  const [medico, setMedico] = useState("");
  const [clinica, setClinica] = useState("");
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<{ base64: string; nome: string } | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function enviar() {
    setErro("");
    if (!data) return setErro("Informe a data em que o exame foi realizado.");
    if (data > hojeBrasiliaISO()) return setErro("A data do exame não pode ser futura.");
    if (!arquivo) return setErro("Anexe o ASO (PDF, JPG ou PNG).");
    setEnviando(true);
    try {
      await api.post("/ponto/meus-exames", {
        dataRealizacao: data,
        medico: medico.trim() || undefined,
        clinica: clinica.trim() || undefined,
        observacao: observacao.trim() || undefined,
        arquivoBase64: arquivo.base64,
        nomeArquivo: arquivo.nome,
        destinatarioId
      });
      onEnviado();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12
        }}
      >
        <div>
          <label style={lbl}>
            Data do exame <span style={{ color: "var(--red)" }}>*</span>
          </label>
          <input
            type="date"
            style={input}
            value={data}
            max={hojeBrasiliaISO()}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div>
          <label style={lbl}>Médico (opcional)</label>
          <input style={input} value={medico} onChange={(e) => setMedico(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Clínica (opcional)</label>
          <input style={input} value={clinica} onChange={(e) => setClinica(e.target.value)} />
        </div>
      </div>
      <div>
        <label style={lbl}>
          ASO — Atestado de Saúde Ocupacional <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <input
          ref={ref}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              setArquivo({ base64: await lerArquivoBase64(f), nome: f.name });
            } catch (er) {
              setErro((er as Error).message);
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ border: "1px dashed rgba(122,30,38,0.3)" }}
          onClick={() => ref.current?.click()}
        >
          📎 {arquivo ? arquivo.nome : "Anexar o ASO (PDF ou imagem)"}
        </button>
      </div>
      <div>
        <label style={lbl}>Observação (opcional)</label>
        <textarea
          rows={2}
          style={{ ...input, resize: "vertical" }}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
        Dado de saúde (LGPD): só você e o RH autorizado veem este documento. O exame passa a valer
        depois da conferência do RH.
      </p>
      {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>⚠ {erro}</p>}
      <button
        className="btn btn-primary"
        style={{ alignSelf: "flex-start" }}
        disabled={enviando}
        onClick={() => void enviar()}
      >
        {enviando ? "Enviando…" : "Enviar exame para conferência"}
      </button>
    </div>
  );
}

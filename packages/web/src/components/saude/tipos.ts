export type SituacaoExame = "EM_DIA" | "A_VENCER" | "VENCIDO" | "SEM_EXAME";

export interface ExameOcupacional {
  id: string;
  funcionarioId: string;
  dataRealizacao: string;
  situacao: "AGUARDANDO_CONFERENCIA" | "CONFIRMADO" | "DEVOLVIDO";
  resultado: "APTO" | "APTO_COM_RESTRICAO" | "INAPTO" | null;
  medico: string | null;
  clinica: string | null;
  proximoVencimento: string | null;
  temArquivo: boolean;
  nomeArquivo: string | null;
  origem: "RH" | "FUNCIONARIO";
  requisicaoDestinatarioId: string | null;
  motivoDevolucao: string | null;
  observacao: string | null;
  registradoPorNome: string | null;
  conferidoPorNome: string | null;
  conferidoEm: string | null;
  createdAt: string;
}

export const RESULTADO_LABEL: Record<string, string> = {
  APTO: "Apto",
  APTO_COM_RESTRICAO: "Apto com restrição",
  INAPTO: "Inapto"
};

export const SITUACAO_LABEL: Record<SituacaoExame, { label: string; cor: string; bg: string }> = {
  EM_DIA: { label: "Em dia", cor: "#166534", bg: "rgba(22,128,61,0.10)" },
  A_VENCER: { label: "A vencer", cor: "#92400e", bg: "rgba(217,119,6,0.14)" },
  VENCIDO: { label: "Vencido", cor: "#b91c1c", bg: "rgba(200,57,63,0.12)" },
  SEM_EXAME: { label: "Sem exame registrado", cor: "#475569", bg: "rgba(71,85,105,0.10)" }
};

export const fmtDataBr = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

export const lerArquivoBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(file);
  });

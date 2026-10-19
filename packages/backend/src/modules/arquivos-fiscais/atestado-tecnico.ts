/**
 * Atestado Técnico e Termo de Responsabilidade (Portaria MTP nº 671/2021, art. 89) no modelo
 * oficial do portal gov.br. O sistema gera o documento preenchido e SEM assinatura: ele precisa
 * ser assinado em PAdES com e-CPF do responsável técnico e do responsável legal (art. 89, §§ 2º e 3º).
 */
export type TipoAtestado = "REP_P" | "PTRP";

export interface DadosAtestado {
  tipo: TipoAtestado;
  /** Fabricante/desenvolvedor (quem atesta). */
  desenvolvedor: { razao: string; cnpj: string };
  /** Empresa destinatária (empregador que usa o sistema). */
  destinatario: { razao: string; cnpj: string };
  programa: { identificador: string; versao: string };
  inpi: { registro: string | null; certificado: string | null };
}

const fmtCnpj = (c: string) =>
  c.length === 14 ? c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : c;

export async function gerarAtestadoTecnico(d: DadosAtestado): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PdfPrinter = require("pdfmake/src/printer");
  const printer = new PdfPrinter({
    Times: {
      normal: "Times-Roman",
      bold: "Times-Bold",
      italics: "Times-Italic",
      bolditalics: "Times-BoldItalic"
    }
  });
  const na = "N/A";
  const ehRepP = d.tipo === "REP_P";
  const campo = (rotulo: string, valor: string) => ({
    text: [{ text: `${rotulo}: ` }, { text: valor, italics: true }],
    margin: [0, 0, 0, 3]
  });
  const doc = {
    pageSize: "A4",
    pageMargins: [70, 64, 70, 64],
    defaultStyle: { font: "Times", fontSize: 12, lineHeight: 1.35 },
    info: {
      title: "Atestado Técnico e Termo de Responsabilidade",
      subject: "Portaria MTP nº 671/2021, art. 89"
    },
    content: [
      {
        text: "ATESTADO TÉCNICO E TERMO DE RESPONSABILIDADE",
        bold: true,
        alignment: "center",
        margin: [0, 0, 0, 18]
      },
      {
        text: [
          { text: "Na qualidade de responsável técnico e de responsável legal da empresa " },
          { text: d.desenvolvedor.razao, italics: true, decoration: "underline" },
          { text: ", (CNPJ nº " },
          { text: fmtCnpj(d.desenvolvedor.cnpj), italics: true, decoration: "underline" },
          {
            text: "), os signatários abaixo, em atenção ao art. 89 da Portaria MTP nº 671/2021, atestam e declaram que o equipamento e/ou programa identificados abaixo estão em conformidade com a Portaria MTP nº 671/2021."
          }
        ],
        alignment: "justify",
        margin: [0, 0, 0, 16]
      },
      campo("Tipo do REP/PTRP", ehRepP ? "REP-P" : "PTRP"),
      campo("Marca Equipamento", na),
      campo("Modelo Equipamento", na),
      campo("Certificado de conformidade", na),
      campo("Número de fabricação", na),
      campo(
        "Número de registro no INPI",
        ehRepP ? (d.inpi.registro ?? "informar após o registro") : na
      ),
      campo(
        "Certificado de registro de programa de computador no INPI",
        ehRepP ? (d.inpi.certificado ?? "informar após o registro") : na
      ),
      campo("Identificador do Programa", d.programa.identificador),
      campo("Versão do Programa", d.programa.versao),
      { text: "", margin: [0, 6, 0, 0] },
      {
        text: [
          { text: "Assinatura Eletrônica: ", bold: true },
          { text: "(somente REP-C)", italics: true }
        ],
        margin: [0, 0, 0, 3]
      },
      campo("Chave pública", na),
      campo("Algoritmo de criptografia assimétrica", na),
      campo("Algoritmo de hash", na),
      {
        text: "Declaramos ainda, que estamos cientes das consequências legais, cíveis e criminais, quanto à falsa declaração, falso atestado e falsidade ideológica. Reiteramos ao usuário que este documento deve ficar disponível para pronta apresentação para a Inspeção do Trabalho.",
        alignment: "justify",
        margin: [0, 14, 0, 14]
      },
      { text: "Empresa/Pessoa Destinatária:", bold: true, margin: [0, 0, 0, 2] },
      campo("Razão Social", d.destinatario.razao),
      campo("CNPJ/CPF", fmtCnpj(d.destinatario.cnpj)),
      { text: "", margin: [0, 26, 0, 0] },
      {
        stack: [
          { text: "___________________________________________", alignment: "center" },
          { text: "Nome e CPF do Responsável Legal", alignment: "center", margin: [0, 0, 0, 22] },
          { text: "___________________________________________", alignment: "center" },
          { text: "Nome e CPF do Responsável Técnico", alignment: "center" }
        ]
      }
    ]
  };
  const pdf = printer.createPdfKitDocument(doc);
  return new Promise<Buffer>((resolve, reject) => {
    const partes: Buffer[] = [];
    pdf.on("data", (c: Buffer) => partes.push(c));
    pdf.on("end", () => resolve(Buffer.concat(partes)));
    pdf.on("error", reject);
    pdf.end();
  });
}

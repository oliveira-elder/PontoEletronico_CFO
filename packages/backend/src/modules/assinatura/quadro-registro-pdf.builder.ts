import * as fs from "fs";
import * as path from "path";
import type { RelatorioQuadroMensal } from "../../utils/historico-quadro";
import { computeQuadroSignatoryHash, groupCodigoAssinatura } from "../../utils/assinatura-codigo";
import { categoriaSemVisibilidadeBancoHoras } from "../../utils/categoria-jornada";

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

const CATEGORIA_LABEL: Record<string, string> = {
  CONCURSADO: "Concursado",
  ESTAGIARIO: "Estagiário",
  MENOR_APRENDIZ: "Menor Aprendiz",
  ASSESSOR: "Assessor",
  GERENTE: "Gerente"
};

/** Largura útil A4 com margens [25, 22, 25, 28] */
const PAGE_CONTENT_WIDTH = 545;

const TABLE_LAYOUT = {
  // i=0: borda topo da tabela suprimida; i=1: separador cabeçalho→1ª linha (mantido);
  // última linha: borda inferior da tabela suprimida; demais: linha sutil entre dados.
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === node.table.body.length ? 0 : i === 1 ? 0.8 : 0.4,
  hLineColor: (i: number) => (i === 1 ? "#9CA3AF" : "#E5E7EB"),
  vLineWidth: () => 0,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  paddingLeft: () => 3,
  paddingRight: () => 3
};

export type RelatorioMensalPdf = RelatorioQuadroMensal;

export interface FuncionarioPdf {
  matricula: string | null;
  cpf: string | null;
  cargo: string | null;
  section: string | null;
  categoria: string | null;
  jornadaHorasDia: number;
  user: { name: string };
  gerencia: { nome: string; sigla: string } | null;
}

export interface AssinaturaPdf {
  assinadoFuncionarioEm: Date | null;
  assinadoFuncionarioIp: string | null;
  assinadoFuncionarioIpGateway?: string | null;
  assinadoFuncionarioUserAgent?: string | null;
  assinadoGestorEm: Date | null;
  assinadoGestorIp: string | null;
  assinadoGestorIpGateway?: string | null;
  assinadoGestorUserAgent?: string | null;
  assinadoGestorNome: string | null;
  bancoHorasSaldoTotalMinutos: number;
}

export interface QuadroPdfInput {
  mes: number;
  ano: number;
  funcionario: FuncionarioPdf;
  assinatura: AssinaturaPdf;
  relatorio: RelatorioMensalPdf;
  logoBase64: string | null;
  certificadoBase64: string | null;
}

interface PausaPar {
  inicio: string;
  fim: string | null;
}

/* ─── Assets ─── */

export function loadAssetBase64(filename: string): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "src", "assets", filename),
    path.join(cwd, "dist", "assets", filename),
    path.join(cwd, "packages", "backend", "src", "assets", filename),
    path.join(cwd, "packages", "backend", "dist", "assets", filename)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p).toString("base64");
    }
  }
  return null;
}

/* ─── Formatação ─── */

function formatBancoHoras(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}min`;
}

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function diaNome(iso: string): string {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const [y, m, day] = iso.split("-").map(Number);
  return dias[new Date(y, m - 1, day).getDay()];
}

function horaOuTraco(h: string | null): string {
  return h ?? "—";
}

export function formatPausas(pausas: PausaPar[]): string {
  if (!pausas.length) return "—";
  return pausas.map((p) => `${p.inicio}–${p.fim ?? "…"}`).join("\n");
}

function maskCpf(cpf: string | null): string {
  if (!cpf) return "—";
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "***.$2.$3-**");
}

/** Resume um User-Agent em "Navegador • SO" legível para o quadro */
function shortUserAgent(ua: string | null | undefined): string {
  if (!ua) return "—";
  let browser = "Navegador";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return os ? `${browser} • ${os}` : browser;
}

const computeSignatoryHash = computeQuadroSignatoryHash;
const groupCode = groupCodigoAssinatura;

/* ─── Blocos do documento ─── */

/** Altura fixa da faixa topbar — alinha logo, divisor e títulos no mesmo eixo vertical */
const TOPBAR_ROW_HEIGHT = 46;

/** Topbar centralizado — reproduz layout do sistema (Topbar.tsx): logo | gap | divisor | gap | títulos */
function buildHeader(logoBase64: string | null): unknown {
  const tituloStack = {
    stack: [
      { text: "Ponto Eletrônico", style: "orgTitle" },
      { text: "QUADRO DE REGISTRO DE PONTO", style: "orgSubtitle" }
    ],
    alignment: "left" as const
  };

  const topbarInner = logoBase64
    ? {
        table: {
          widths: ["auto", 14, 6, 14, "auto"],
          heights: [TOPBAR_ROW_HEIGHT],
          body: [
            [
              {
                image: `data:image/png;base64,${logoBase64}`,
                fit: [118, 32] as [number, number],
                alignment: "center" as const,
                verticalAlignment: "middle" as const,
                margin: [0, 0, 0, 0] as [number, number, number, number]
              },
              { text: "", verticalAlignment: "middle" as const },
              {
                verticalAlignment: "middle" as const,
                alignment: "center" as const,
                stack: [
                  {
                    canvas: [
                      {
                        type: "line",
                        x1: 3,
                        y1: 0,
                        x2: 3,
                        y2: TOPBAR_ROW_HEIGHT,
                        lineWidth: 0.75,
                        lineColor: "#EBE0E1"
                      }
                    ]
                  }
                ]
              },
              { text: "", verticalAlignment: "middle" as const },
              {
                ...tituloStack,
                verticalAlignment: "middle" as const
              }
            ]
          ]
        },
        layout: "noBorders"
      }
    : {
        stack: [
          { text: "Ponto Eletrônico", style: "orgTitle", alignment: "center" as const },
          {
            text: "QUADRO DE REGISTRO DE PONTO",
            style: "orgSubtitle",
            alignment: "center" as const
          }
        ]
      };

  return {
    stack: [
      {
        table: {
          widths: ["*", "auto", "*"],
          body: [[{ text: "" }, topbarInner, { text: "" }]]
        },
        layout: "noBorders",
        margin: [0, 0, 0, 4]
      },
      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: PAGE_CONTENT_WIDTH,
            y2: 0,
            lineWidth: 1,
            lineColor: "#6B0F1A"
          }
        ]
      }
    ],
    margin: [0, 0, 0, 4]
  };
}

function buildFuncionarioCard(input: QuadroPdfInput): unknown {
  const { funcionario, mes, ano } = input;
  const nomeMes = MESES_PT[mes - 1];
  const periodoStr = `01/${String(mes).padStart(2, "0")}/${ano} a ${new Date(ano, mes, 0).getDate()}/${String(mes).padStart(2, "0")}/${ano}`;
  const jornadaLabel = funcionario.jornadaHorasDia ? `${funcionario.jornadaHorasDia}h/dia` : "—";

  const labelCell = (txt: string) => ({
    text: txt.toUpperCase(),
    style: "fieldLabel",
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean]
  });

  const valueCell = (txt: string, bold = false) => ({
    text: txt,
    style: bold ? "fieldValueBold" : "fieldValue",
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean]
  });

  const formTable = {
    table: {
      widths: ["*"],
      body: [
        [
          {
            table: {
              widths: [76, "*", 76, "*"],
              body: [
                [
                  labelCell("Nome completo"),
                  valueCell(funcionario.user.name, true),
                  labelCell("Matrícula"),
                  valueCell(funcionario.matricula ?? "—", true)
                ],
                [
                  labelCell("CPF"),
                  valueCell(maskCpf(funcionario.cpf)),
                  labelCell("Cargo"),
                  valueCell(funcionario.cargo || "—")
                ],
                [
                  labelCell("Departamento"),
                  valueCell(
                    funcionario.gerencia
                      ? `${funcionario.gerencia.nome} (${funcionario.gerencia.sigla})`
                      : "—"
                  ),
                  labelCell("Seção"),
                  valueCell(funcionario.section || "—")
                ],
                [
                  labelCell("Regime"),
                  valueCell(
                    CATEGORIA_LABEL[funcionario.categoria ?? ""] ?? funcionario.categoria ?? "—"
                  ),
                  labelCell("Jornada"),
                  valueCell(jornadaLabel)
                ],
                [
                  labelCell("Referência"),
                  valueCell(`${nomeMes}/${ano}`),
                  labelCell("Período"),
                  valueCell(periodoStr)
                ]
              ]
            },
            layout: {
              hLineWidth: () => 0.4,
              vLineWidth: () => 0,
              hLineColor: () => "#E5E7EB",
              paddingTop: () => 2,
              paddingBottom: () => 2,
              paddingLeft: () => 6,
              paddingRight: () => 6
            }
          }
        ]
      ]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => "#D1D5DB",
      vLineColor: () => "#D1D5DB"
    }
  };

  return {
    stack: [{ text: "Dados do Funcionário", style: "sectionTitle" }, formTable],
    margin: [0, 0, 0, 5]
  };
}

function buildTabelaDias(input: QuadroPdfInput): unknown {
  const { relatorio, funcionario } = input;
  const ocultarBh = categoriaSemVisibilidadeBancoHoras(funcionario.categoria);

  const tableBody: unknown[][] = [
    [
      { text: "Data", style: "thCell" },
      { text: "Dia", style: "thCell" },
      { text: "Entrada", style: "thCell" },
      { text: "Iníc. Interv.", style: "thCell" },
      { text: "Fim Interv.", style: "thCell" },
      { text: "Saída", style: "thCell" },
      { text: "Pausa", style: "thCell" },
      { text: "Horas", style: "thCell" },
      ...(ocultarBh ? [] : [{ text: "Saldo", style: "thCell" }]),
      { text: "Status", style: "thCell" }
    ]
  ];

  for (const [idx, dia] of relatorio.dias.entries()) {
    const bgColor = idx % 2 === 0 ? "#FFFFFF" : "#F7F7F7";
    const cellFill = dia.statusInterno === "AFASTAMENTO" ? "#EFF6FF" : bgColor;
    const cell = (txt: string) => ({ text: txt, style: "tdCell", fillColor: cellFill });

    tableBody.push([
      cell(dia.iso.split("-").reverse().join("/")),
      cell(diaNome(dia.iso)),
      cell(horaOuTraco(dia.entrada)),
      cell(horaOuTraco(dia.inicioIntervalo)),
      cell(horaOuTraco(dia.fimIntervalo)),
      cell(horaOuTraco(dia.saida)),
      cell(formatPausas(dia.pausas)),
      cell(dia.horasFormatado),
      ...(ocultarBh ? [] : [cell(dia.saldoFormatado)]),
      cell(dia.status)
    ]);
  }

  return {
    table: {
      headerRows: 1,
      // Colunas de largura fixa (caracteres de hora/data sempre do mesmo tamanho);
      // Pausa e Status recebem o espaço restante (*) pois variam de tamanho.
      //        Data  Dia  Entr  IInt  FInt  Saíd  Pausa Horas Saldo Status
      widths: ocultarBh
        ? [42, 22, 34, 34, 34, 34, "*", 40, "*"]
        : [42, 22, 34, 34, 34, 34, "*", 34, 40, "*"],
      body: tableBody
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 5]
  };
}

function buildTotais(input: QuadroPdfInput): unknown {
  const { relatorio, assinatura, funcionario } = input;
  const ocultarBh = categoriaSemVisibilidadeBancoHoras(funcionario.categoria);

  if (ocultarBh) {
    return {
      table: {
        widths: ["*", "*"],
        body: [
          [
            { text: "Dias Trabalhados", style: "totalLabel", alignment: "center" },
            { text: "Total Horas", style: "totalLabel", alignment: "center" }
          ],
          [
            { text: String(relatorio.diasTrabalhados), style: "totalValue", alignment: "center" },
            { text: relatorio.horasTrabalhadasFormatado, style: "totalValue", alignment: "center" }
          ]
        ]
      },
      layout: {
        hLineWidth: () => 0.4,
        vLineWidth: () => 0.4,
        hLineColor: () => "#D1D5DB",
        vLineColor: () => "#D1D5DB",
        paddingTop: () => 4,
        paddingBottom: () => 4,
        paddingLeft: () => 4,
        paddingRight: () => 4
      },
      margin: [0, 0, 0, 6]
    };
  }

  return {
    table: {
      widths: ["*", "*", "*", "*"],
      body: [
        [
          { text: "Dias Trabalhados", style: "totalLabel", alignment: "center" },
          { text: "Total Horas", style: "totalLabel", alignment: "center" },
          { text: "Saldo do Mês", style: "totalLabel", alignment: "center" },
          { text: "Banco de Horas Total", style: "totalLabel", alignment: "center" }
        ],
        [
          { text: String(relatorio.diasTrabalhados), style: "totalValue", alignment: "center" },
          { text: relatorio.horasTrabalhadasFormatado, style: "totalValue", alignment: "center" },
          {
            text: relatorio.saldoFormatado,
            style: "totalValue",
            alignment: "center",
            color: relatorio.saldoMinutos >= 0 ? "#15803D" : "#B91C1C"
          },
          {
            text: formatBancoHoras(assinatura.bancoHorasSaldoTotalMinutos),
            style: "totalValue",
            alignment: "center",
            color: assinatura.bancoHorasSaldoTotalMinutos >= 0 ? "#15803D" : "#B91C1C"
          }
        ]
      ]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => "#D1D5DB",
      vLineColor: () => "#D1D5DB",
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => 4,
      paddingRight: () => 4
    },
    margin: [0, 0, 0, 6]
  };
}

interface AssinaturaColunaMeta {
  assinadoEm: Date | null;
  ipReal: string | null;
  ipGateway?: string | null;
  userAgent?: string | null;
}

/** Linha rótulo+valor compacta usada nos metadados de assinatura */
function metaLinha(label: string, valor: string): unknown {
  return {
    columns: [
      { text: label, width: 56, fontSize: 6, color: "#6B0F1A", bold: true },
      { text: valor, width: "*", fontSize: 6, color: "#444" }
    ],
    margin: [0, 0.6, 0, 0] as [number, number, number, number]
  };
}

function buildAssinaturaColuna(
  titulo: string,
  tituloColor: string,
  headerBg: string,
  bodyBg: string,
  nome: string,
  subtitulo: string,
  meta: AssinaturaColunaMeta,
  certificadoBase64: string | null
): unknown {
  const assinado = !!meta.assinadoEm;

  const infoStack: unknown[] = [
    { text: nome, fontSize: 7.5, bold: true, color: "#111" },
    {
      text: subtitulo,
      fontSize: 6.5,
      color: "#555",
      margin: [0, 1, 0, 2] as [number, number, number, number]
    }
  ];

  if (assinado) {
    infoStack.push(
      metaLinha("Assinado em", formatDateTime(meta.assinadoEm)),
      metaLinha("IP do PC", meta.ipReal ?? "—"),
      metaLinha("Gateway borda", meta.ipGateway ?? "—"),
      metaLinha("Dispositivo", shortUserAgent(meta.userAgent))
    );
  } else {
    infoStack.push({
      text: "Pendente de assinatura",
      fontSize: 6.5,
      color: "#9CA3AF",
      italics: true,
      margin: [0, 4, 0, 0] as [number, number, number, number]
    });
  }

  const bodyContent: unknown =
    assinado && certificadoBase64
      ? {
          columns: [
            {
              image: `data:image/png;base64,${certificadoBase64}`,
              width: 32,
              margin: [0, 0, 7, 0] as [number, number, number, number]
            },
            { stack: infoStack, width: "*" }
          ]
        }
      : { stack: infoStack };

  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            text: titulo,
            bold: true,
            fontSize: 7,
            color: tituloColor,
            fillColor: headerBg,
            border: [true, true, true, false] as [boolean, boolean, boolean, boolean],
            margin: [6, 3, 6, 3] as [number, number, number, number]
          }
        ],
        [
          {
            ...(typeof bodyContent === "object" && bodyContent !== null
              ? bodyContent
              : { stack: infoStack }),
            fillColor: bodyBg,
            border: [true, false, true, true] as [boolean, boolean, boolean, boolean],
            margin: [6, 5, 6, 5] as [number, number, number, number]
          }
        ]
      ]
    },
    layout: {
      hLineColor: () => "#D1D5DB",
      vLineColor: () => "#D1D5DB"
    }
  };
}

function buildAssinaturas(input: QuadroPdfInput): unknown {
  const { funcionario, assinatura, certificadoBase64 } = input;

  return {
    stack: [
      { text: "Assinaturas", style: "sectionTitle" },
      {
        columns: [
          {
            width: "*",
            stack: [
              buildAssinaturaColuna(
                "FUNCIONÁRIO",
                "#6B0F1A",
                "#FFF5F5",
                "#FFF5F5",
                funcionario.user.name,
                `Matrícula: ${funcionario.matricula ?? "—"}`,
                {
                  assinadoEm: assinatura.assinadoFuncionarioEm,
                  ipReal: assinatura.assinadoFuncionarioIp,
                  ipGateway: assinatura.assinadoFuncionarioIpGateway,
                  userAgent: assinatura.assinadoFuncionarioUserAgent
                },
                certificadoBase64
              )
            ]
          },
          { width: 8, text: "" },
          {
            width: "*",
            stack: [
              buildAssinaturaColuna(
                "GESTOR DA ÁREA",
                "#374151",
                "#F8FAFC",
                "#F8FAFC",
                assinatura.assinadoGestorNome ?? funcionario.gerencia?.nome ?? "—",
                funcionario.gerencia
                  ? `${funcionario.gerencia.nome} (${funcionario.gerencia.sigla})`
                  : "—",
                {
                  assinadoEm: assinatura.assinadoGestorEm,
                  ipReal: assinatura.assinadoGestorIp,
                  ipGateway: assinatura.assinadoGestorIpGateway,
                  userAgent: assinatura.assinadoGestorUserAgent
                },
                certificadoBase64
              )
            ]
          }
        ]
      },
      buildAutenticidade(input)
    ],
    margin: [0, 0, 0, 0],
    unbreakable: true
  };
}

/** Bloco de autenticidade individual de um signatário */
function buildAutenticidadeColuna(
  titulo: string,
  assinadoEm: Date | null,
  ip: string | null,
  matricula: string,
  periodo: string
): unknown {
  const assinado = !!assinadoEm;
  const hash = assinado
    ? groupCode(computeSignatoryHash(matricula, periodo, assinadoEm, ip))
    : null;

  const bodyStack: unknown[] = [
    {
      columns: [
        {
          text: titulo,
          width: "*",
          fontSize: 6,
          bold: true,
          color: "#6B0F1A",
          characterSpacing: 0.4
        },
        {
          text: assinado ? "ASSINADO" : "PENDENTE",
          width: "auto",
          fontSize: 5.5,
          bold: true,
          color: assinado ? "#15803D" : "#B45309"
        }
      ]
    }
  ];

  if (hash) {
    bodyStack.push({
      columns: [
        {
          text: "SHA-256:",
          width: 34,
          fontSize: 5.5,
          color: "#888",
          bold: true,
          margin: [0, 2, 0, 0] as [number, number, number, number]
        },
        {
          text: hash,
          width: "*",
          fontSize: 5.5,
          bold: true,
          color: "#111",
          characterSpacing: 0.3,
          margin: [0, 2, 0, 0] as [number, number, number, number]
        }
      ]
    });
  } else {
    bodyStack.push({
      text: "Hash calculado após a assinatura",
      fontSize: 5.5,
      color: "#9CA3AF",
      italics: true,
      margin: [0, 2, 0, 0] as [number, number, number, number]
    });
  }

  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: bodyStack,
            border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
            margin: [6, 4, 6, 4] as [number, number, number, number]
          }
        ]
      ]
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#E5C9CC",
      vLineColor: () => "#E5C9CC"
    }
  };
}

/** Faixa de autenticidade — um bloco por signatário, lado a lado */
function buildAutenticidade(input: QuadroPdfInput): unknown {
  const { assinatura, funcionario } = input;
  const periodo = `${input.mes}/${input.ano}`;
  const matricula = funcionario.matricula ?? "";

  return {
    stack: [
      {
        columns: [
          {
            width: "*",
            stack: [
              buildAutenticidadeColuna(
                "AUTENTICIDADE — FUNCIONÁRIO",
                assinatura.assinadoFuncionarioEm,
                assinatura.assinadoFuncionarioIp,
                matricula,
                periodo
              )
            ]
          },
          { width: 8, text: "" },
          {
            width: "*",
            stack: [
              buildAutenticidadeColuna(
                "AUTENTICIDADE — GESTOR DA ÁREA",
                assinatura.assinadoGestorEm,
                assinatura.assinadoGestorIp,
                matricula,
                periodo
              )
            ]
          }
        ]
      },
      {
        text:
          "Assinado eletronicamente pelo Sistema de Ponto Eletrônico CFO. " +
          "A autenticidade de cada assinatura pode ser verificada confrontando o código SHA-256 " +
          "com o IP e horário registrados na base do sistema. " +
          "Qualquer alteração no conteúdo invalida os códigos de validação.",
        fontSize: 5.5,
        color: "#777",
        margin: [0, 4, 0, 0] as [number, number, number, number],
        lineHeight: 1.2
      }
    ],
    margin: [0, 6, 0, 0] as [number, number, number, number]
  };
}

export function buildQuadroPdfDocDefinition(input: QuadroPdfInput): Record<string, unknown> {
  return {
    pageSize: "A4",
    pageMargins: [25, 22, 25, 28],
    defaultStyle: { font: "Helvetica", fontSize: 7 },
    styles: {
      orgTitle: {
        font: "InstrumentSerif",
        fontSize: 15,
        italics: true,
        color: "#7A1E26",
        lineHeight: 1.15
      },
      orgSubtitle: {
        font: "Helvetica",
        fontSize: 8,
        bold: true,
        color: "#666666",
        characterSpacing: 1,
        marginTop: 2,
        lineHeight: 1.1
      },
      sectionTitle: { fontSize: 7.5, bold: true, color: "#6B0F1A", marginBottom: 2, marginTop: 2 },
      thCell: {
        bold: true,
        fontSize: 6.5,
        color: "#FFFFFF",
        fillColor: "#6B0F1A",
        alignment: "center"
      },
      tdCell: { fontSize: 6.5, alignment: "center" },
      fieldLabel: { fontSize: 6.5, bold: true, color: "#111111" },
      fieldValue: { fontSize: 7, color: "#111111" },
      fieldValueBold: { fontSize: 7, bold: true, color: "#111111" },
      totalLabel: { fontSize: 6.5, bold: true, color: "#666666" },
      totalValue: { fontSize: 9, bold: true, color: "#111111" }
    },
    content: [
      buildHeader(input.logoBase64),
      buildFuncionarioCard(input),
      { text: "Registros do Mês", style: "sectionTitle" },
      buildTabelaDias(input),
      buildTotais(input),
      buildAssinaturas(input)
    ],
    footer: () => ({
      text: `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — Sistema de Ponto Eletrônico CFO`,
      alignment: "center",
      fontSize: 6,
      color: "#999",
      margin: [0, 0, 0, 6]
    })
  };
}

/** Rascunho sem assinaturas — marca d'água + espaço para assinatura manual */
export function buildRascunhoPdfDocDefinition(input: QuadroPdfInput): Record<string, unknown> {
  const STYLES = {
    orgTitle: {
      font: "InstrumentSerif",
      fontSize: 15,
      italics: true,
      color: "#7A1E26",
      lineHeight: 1.15
    },
    orgSubtitle: {
      font: "Helvetica",
      fontSize: 8,
      bold: true,
      color: "#666666",
      characterSpacing: 1,
      marginTop: 2,
      lineHeight: 1.1
    },
    sectionTitle: { fontSize: 7.5, bold: true, color: "#6B0F1A", marginBottom: 2, marginTop: 2 },
    thCell: {
      bold: true,
      fontSize: 6.5,
      color: "#FFFFFF",
      fillColor: "#6B0F1A",
      alignment: "center"
    },
    tdCell: { fontSize: 6.5, alignment: "center" },
    fieldLabel: { fontSize: 6.5, bold: true, color: "#111111" },
    fieldValue: { fontSize: 7, color: "#111111" },
    fieldValueBold: { fontSize: 7, bold: true, color: "#111111" },
    totalLabel: { fontSize: 6.5, bold: true, color: "#666666" },
    totalValue: { fontSize: 9, bold: true, color: "#111111" }
  };

  const assinaturaManual = {
    stack: [
      { text: "Assinaturas", style: "sectionTitle" },
      {
        columns: [
          {
            width: "*",
            stack: [
              {
                table: {
                  widths: ["*"],
                  body: [
                    [
                      {
                        stack: [
                          {
                            text: "FUNCIONÁRIO",
                            fontSize: 7,
                            bold: true,
                            color: "#6B0F1A",
                            margin: [0, 0, 0, 32] as [number, number, number, number]
                          },
                          {
                            canvas: [
                              {
                                type: "line",
                                x1: 0,
                                y1: 0,
                                x2: 220,
                                y2: 0,
                                lineWidth: 0.6,
                                lineColor: "#9CA3AF"
                              }
                            ]
                          },
                          {
                            text: input.funcionario.user.name,
                            fontSize: 6.5,
                            color: "#555",
                            margin: [0, 2, 0, 0] as [number, number, number, number]
                          },
                          {
                            text: `Matrícula: ${input.funcionario.matricula ?? "—"}`,
                            fontSize: 6,
                            color: "#888",
                            margin: [0, 1, 0, 0] as [number, number, number, number]
                          }
                        ],
                        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                        margin: [8, 6, 8, 8] as [number, number, number, number]
                      }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => "#D1D5DB",
                  vLineColor: () => "#D1D5DB"
                }
              }
            ]
          },
          { width: 8, text: "" },
          {
            width: "*",
            stack: [
              {
                table: {
                  widths: ["*"],
                  body: [
                    [
                      {
                        stack: [
                          {
                            text: "GESTOR DA ÁREA",
                            fontSize: 7,
                            bold: true,
                            color: "#374151",
                            margin: [0, 0, 0, 32] as [number, number, number, number]
                          },
                          {
                            canvas: [
                              {
                                type: "line",
                                x1: 0,
                                y1: 0,
                                x2: 220,
                                y2: 0,
                                lineWidth: 0.6,
                                lineColor: "#9CA3AF"
                              }
                            ]
                          },
                          {
                            text: input.funcionario.gerencia
                              ? `${input.funcionario.gerencia.nome} (${input.funcionario.gerencia.sigla})`
                              : "—",
                            fontSize: 6.5,
                            color: "#555",
                            margin: [0, 2, 0, 0] as [number, number, number, number]
                          }
                        ],
                        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                        margin: [8, 6, 8, 8] as [number, number, number, number]
                      }
                    ]
                  ]
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => "#D1D5DB",
                  vLineColor: () => "#D1D5DB"
                }
              }
            ]
          }
        ]
      }
    ],
    margin: [0, 0, 0, 0] as [number, number, number, number],
    unbreakable: true
  };

  return {
    pageSize: "A4",
    pageMargins: [25, 22, 25, 28],
    defaultStyle: { font: "Helvetica", fontSize: 7 },
    watermark: { text: "RASCUNHO", color: "#6B0F1A", opacity: 0.055, bold: true, fontSize: 90 },
    styles: STYLES,
    content: [
      buildHeader(input.logoBase64),
      buildFuncionarioCard(input),
      { text: "Registros do Mês", style: "sectionTitle" },
      buildTabelaDias(input),
      buildTotais(input),
      assinaturaManual
    ],
    footer: () => ({
      columns: [
        {
          text: `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — Sistema de Ponto Eletrônico CFO`,
          fontSize: 6,
          color: "#999"
        },
        {
          text: "RASCUNHO — Não possui validade sem assinatura eletrônica",
          fontSize: 6,
          color: "#B91C1C",
          bold: true,
          alignment: "right"
        }
      ],
      margin: [25, 0, 25, 6]
    })
  };
}

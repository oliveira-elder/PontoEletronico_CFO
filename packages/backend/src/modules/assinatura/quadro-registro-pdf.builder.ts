import * as fs from "fs";
import * as path from "path";
import type { RelatorioQuadroMensal } from "../../utils/historico-quadro";
import { computeQuadroSignatoryHash, groupCodigoAssinatura } from "../../utils/assinatura-codigo";
import { categoriaSemVisibilidadeBancoHoras } from "../../utils/categoria-jornada";

const CATEGORIA_LABEL: Record<string, string> = {
  CONCURSADO: "Empregado",
  ESTAGIARIO: "Estagiário",
  MENOR_APRENDIZ: "Jovem Aprendiz",
  ASSESSOR: "Comissionado"
};

/** "Chefe" deixou de ser categoria (GERENTE) e virou característica (isManager) —
 *  exibida como qualificador junto da categoria real, não mais isolada. */
function regimeLabel(
  categoria: string | null | undefined,
  isManager: boolean | null | undefined
): string {
  const base = CATEGORIA_LABEL[categoria ?? ""] ?? categoria ?? "—";
  return isManager ? `${base} — Chefe` : base;
}

/** Orientação do Espelho de Ponto: trocar aqui para "landscape" se o retrato ficar apertado. */
const ORIENTACAO_PAGINA: "portrait" | "landscape" = "portrait";

/** Largura útil A4 com margens [25, 22, 25, 28] */
const PAGE_CONTENT_WIDTH = ORIENTACAO_PAGINA === "portrait" ? 545 : 792;

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
  isManager?: boolean | null;
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

/** Resumo equivalente aos badges da página Histórico. */
export interface ResumoBadgesPdf {
  diasOk: number;
  faltas: number;
  afastamentos: number;
  horasTrabalhadasMinutos: number;
  ocultarBancoHoras: boolean;
  saldoAcumuladoMesAnteriorMinutos: number;
  labelMesAnterior: string;
  saldoMesMinutos: number;
  totalAcumuladoMinutos: number;
}

export interface QuadroPdfInput {
  mes: number;
  ano: number;
  funcionario: FuncionarioPdf;
  assinatura: AssinaturaPdf;
  relatorio: RelatorioMensalPdf;
  logoBase64: string | null;
  certificadoBase64: string | null;
  resumoBadges?: ResumoBadgesPdf;
  /** Verificação pública (QR Code/link) e estado do selo ICP-Brasil, para a página de declaração. */
  verificacao?: VerificacaoDocumentoPdf;
  /** Nº de registro da versão do conteúdo + QR selado por página (documento assinado). */
  registro?: RegistroDocumentoPdf;
  /** Dados do empregador e da jornada contratual (Espelho de Ponto, Portaria MTP 671/2021). */
  espelho?: EspelhoExtrasPdf;
  /** Relatório de ciclo de banco de horas (período customizado). */
  cicloBancoHoras?: {
    inicio: string;
    fim: string;
    /** Síntese mês a mês — espelha o card do front no rodapé do relatório. */
    mesesResumo?: MesCicloResumoPdf[];
  };
}

/**
 * QR Codes e link de verificação NÃO são desenhados na página: o builder reserva o espaço com um
 * retângulo-marcador (cor quase branca) e o serviço coloca ali ANOTAÇÕES do PDF com o desenho do
 * QR / o texto do link. Word e a maioria dos conversores importam só o conteúdo da página e
 * descartam anotações — a cópia convertida sai sem QR e sem link.
 */
export const MARCADOR_QR_PAGINA = "#FFFFFE";
export const MARCADOR_QR_DECLARACAO = "#FFFFFD";
export const MARCADOR_LINK_DECLARACAO = "#FFFFFC";

export const marcador = (cor: string, w: number, h: number) => ({
  canvas: [{ type: "rect", x: 0, y: 0, w, h, color: cor, lineWidth: 0 }],
  width: w
});

export interface RegistroDocumentoPdf {
  /** Muda sempre que o conteúdo do documento muda (deriva da impressão digital dos dados). */
  numero: string;
  /** Link do QR da página, com selo criptográfico de registro + página + total de páginas. */
  urlPagina: (pagina: number, total: number) => string;
}

export interface VerificacaoDocumentoPdf {
  /** Link público de verificação (vazio quando o documento ainda não foi assinado). */
  url: string | null;
  /** Código de verificação (SHA-256 agrupado) da assinatura do funcionário. */
  codigo: string | null;
  /** Selo ICP-Brasil (e-CNPJ A1) será aplicado ao arquivo final. */
  seloAtivo: boolean;
}

export interface EspelhoExtrasPdf {
  razaoSocial: string;
  cnpj: string | null;
  /** CEI/CAEPF/CNO do empregador, quando houver. */
  cadastroComplementar?: string | null;
  dataAdmissao: Date | string | null;
  /** Ex.: "7h00/dia – 35h semanais". */
  jornadaContratual: string;
  /** Ex.: "07:00 às 15:00". */
  horarioContratual: string;
  /** Multiplicadores do banco no mês (sáb/dom/feriado), quando aplicáveis. */
  multiplicadores?: { sabadoPct: number; domingoPct: number; feriadoPct: number };
}

/** Linha da síntese mensal do ciclo (espelha Julho/Agosto do front). */
export type MesCicloResumoPdf = {
  yyyyMM: string;
  label: string;
  trabalhadoMinutos: number;
  saldoMesMinutos: number;
  acumuladoMinutos: number;
  situacao: "ASSINADO" | "PENDENTE" | "AGUARDA_FECHAMENTO";
};

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

/** Formato dos badges do Histórico (sem sufixo "min"). */
function formatBadgeHoras(min: number): string {
  const sign = min < 0 ? "-" : min > 0 ? "+" : "+";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

function formatHorasNeutro(min: number): string {
  const abs = Math.abs(min);
  return `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
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

export function formatPausas(pausas: PausaPar[]): string {
  if (!pausas.length) return "—";
  return pausas.map((p) => `${p.inicio}–${p.fim ?? "…"}`).join("\n");
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

/** Cabeçalho documental: logo do CFO + título lado a lado, filete vinho e texto introdutório. */
function buildHeader(
  logoBase64: string | null,
  docSubtitle = "RELATÓRIO DE PONTO DO FUNCIONÁRIO"
): unknown {
  const titulo = {
    width: "auto" as const,
    stack: [
      { text: "Espelho de Ponto Eletrônico", style: "orgTitle" },
      { text: docSubtitle, style: "orgSubtitle" }
    ],
    margin: [0, 2, 0, 0] as [number, number, number, number]
  };

  const linhaTopo = logoBase64
    ? {
        columns: [
          {
            image: `data:image/png;base64,${logoBase64}`,
            fit: [150, 40] as [number, number],
            width: 150,
            margin: [0, 5, 0, 0] as [number, number, number, number]
          },
          {
            width: 12,
            canvas: [
              {
                type: "line",
                x1: 6,
                y1: 0,
                x2: 6,
                y2: 42,
                lineWidth: 0.75,
                lineColor: "#D9C7C9"
              }
            ]
          },
          titulo
        ],
        columnGap: 4
      }
    : { stack: titulo.stack };

  /* Conjunto logo | títulos centralizado na horizontal da página. */
  const linhaCentralizada = {
    table: { widths: ["*", "auto", "*"], body: [[{ text: "" }, linhaTopo, { text: "" }]] },
    layout: "noBorders"
  };

  return {
    stack: [
      linhaCentralizada,
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
        ],
        margin: [0, 5, 0, 0] as [number, number, number, number]
      },
      {
        text:
          "Relatório que apresenta, de forma clara e completa, a jornada do trabalhador. " +
          "Disponibilizado ao trabalhador e à fiscalização.",
        fontSize: 6.5,
        color: "#555",
        alignment: "center" as const,
        margin: [0, 4, 0, 0] as [number, number, number, number]
      }
    ],
    margin: [0, 0, 0, 6]
  };
}

function fmtDataBr(v: Date | string | null | undefined): string {
  if (!v) return "—";
  const iso = typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatCpf(cpf: string | null): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpf;
}

function formatCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D/g, "");
  return d.length === 14
    ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    : cnpj;
}

/** Bloco de identificação em duas colunas rótulo/valor, com título de seção. */
function blocoIdentificacao(titulo: string, linhas: Array<[string, string, string?, string?]>) {
  const lab = (t: string) => ({
    text: t,
    style: "fieldLabel",
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean]
  });
  const val = (t: string) => ({
    text: t,
    style: "fieldValue",
    border: [false, false, false, false] as [boolean, boolean, boolean, boolean]
  });
  return {
    stack: [
      { text: titulo, style: "sectionTitle" },
      {
        table: {
          widths: [86, "*", 86, "*"],
          body: linhas.map(([l1, v1, l2, v2]) => [lab(l1), val(v1), lab(l2 ?? ""), val(v2 ?? "")])
        },
        layout: {
          hLineWidth: () => 0.4,
          vLineWidth: () => 0,
          hLineColor: () => "#E5E7EB",
          paddingTop: () => 2,
          paddingBottom: () => 2,
          paddingLeft: () => 5,
          paddingRight: () => 5,
          fillColor: () => "#F8FAFC"
        }
      }
    ],
    margin: [0, 0, 0, 4] as [number, number, number, number]
  };
}

/** Identificação do empregador, do trabalhador, período e jornada contratual (art. 84). */
function buildFuncionarioCard(input: QuadroPdfInput): unknown {
  const { funcionario, mes, ano, cicloBancoHoras, espelho } = input;
  const fmtBr = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const periodoStr = cicloBancoHoras
    ? `${fmtBr(cicloBancoHoras.inicio)} a ${fmtBr(cicloBancoHoras.fim)}`
    : `01/${String(mes).padStart(2, "0")}/${ano} a ${new Date(ano, mes, 0).getDate()}/${String(mes).padStart(2, "0")}/${ano}`;
  const emitido = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const lotacao = funcionario.gerencia
    ? `${funcionario.gerencia.nome} (${funcionario.gerencia.sigla})${funcionario.section ? ` — ${funcionario.section}` : ""}`
    : (funcionario.section ?? "—");
  const jornada =
    espelho?.jornadaContratual ??
    (funcionario.jornadaHorasDia ? `${funcionario.jornadaHorasDia}h/dia` : "—");

  return {
    stack: [
      blocoIdentificacao("Identificação do empregador", [
        [
          "Razão social",
          espelho?.razaoSocial ?? "Conselho Federal de Odontologia",
          "CNPJ",
          formatCnpj(espelho?.cnpj)
        ],
        ...(espelho?.cadastroComplementar
          ? [["CEI/CAEPF/CNO", espelho.cadastroComplementar] as [string, string]]
          : [])
      ]),
      blocoIdentificacao("Identificação do trabalhador", [
        ["Nome", funcionario.user.name, "Matrícula", funcionario.matricula ?? "—"],
        ["CPF", formatCpf(funcionario.cpf), "Cargo/Função", funcionario.cargo || "—"],
        [
          "Regime",
          regimeLabel(funcionario.categoria, funcionario.isManager),
          "Data de admissão",
          fmtDataBr(espelho?.dataAdmissao)
        ],
        ["Lotação", lotacao]
      ]),
      blocoIdentificacao("Período e jornada", [
        ["Período do relatório", periodoStr, "Data de emissão", emitido],
        ["Jornada contratual", jornada, "Horário contratual", espelho?.horarioContratual ?? "—"]
      ])
    ]
  };
}

/** "08:00-11:30 12:30-16:00" (Entrada-Início do intervalo, Fim do intervalo-Saída). */
function textoMarcacoes(m: {
  entrada: string | null;
  inicioIntervalo: string | null;
  fimIntervalo: string | null;
  saida: string | null;
}): string {
  if (!m.entrada && !m.inicioIntervalo && !m.fimIntervalo && !m.saida) return "—";
  const h = (v: string | null) => v ?? "--:--";
  return `${h(m.entrada)}-${h(m.inicioIntervalo)} ${h(m.fimIntervalo)}-${h(m.saida)}`;
}

/** Marcações originais do dia (antes das correções aprovadas) e as alteradas (vigentes). */
function marcacoesOriginalEAlterada(dia: RelatorioMensalPdf["dias"][number]): {
  original: string;
  alterada: string;
} {
  const atuais = {
    entrada: dia.entrada,
    inicioIntervalo: dia.inicioIntervalo,
    fimIntervalo: dia.fimIntervalo,
    saida: dia.saida
  };
  const ajustes = dia.ajustesDetalhe ?? [];
  if (!ajustes.length) return { original: textoMarcacoes(atuais), alterada: "—" };
  const campo: Record<string, keyof typeof atuais> = {
    ENTRADA: "entrada",
    INICIO_INTERVALO: "inicioIntervalo",
    FIM_INTERVALO: "fimIntervalo",
    SAIDA: "saida"
  };
  const originais = { ...atuais };
  for (const a of ajustes) {
    const k = campo[a.tipoRegistro];
    if (k) originais[k] = a.anterior; // inclusão: a batida não existia (null)
  }
  return { original: textoMarcacoes(originais), alterada: textoMarcacoes(atuais) };
}

function buildTabelaDias(input: QuadroPdfInput): unknown {
  const { relatorio, funcionario } = input;
  const ocultarBh = categoriaSemVisibilidadeBancoHoras(funcionario.categoria);
  const th = (t: string, extra: Record<string, unknown> = {}) => ({
    text: t,
    style: "thCell",
    ...extra
  });
  const vazio = { text: "" };

  /* Cabeçalho em dois níveis (padrão da fiscalização): Marcações · Marcações Alteradas ·
     H.Trab · Rendimento (H.E. aut./não aut.) · Banco de horas (Débito/Crédito) · Justificativa. */
  const cab1: unknown[] = [
    th("Data", { rowSpan: 2 }),
    th("Dia", { rowSpan: 2 }),
    th("Marcações\n(Ent-Int Inter-Saída)", { rowSpan: 2 }),
    th("Marcações alteradas\n(Ent-Int Inter-Saída)", { rowSpan: 2 }),
    th("H. Trab.", { rowSpan: 2 }),
    ...(ocultarBh
      ? []
      : [th("Rendimento", { colSpan: 2 }), vazio, th("Banco de horas", { colSpan: 2 }), vazio]),
    th("Justificativa", { rowSpan: 2 })
  ];
  const cab2: unknown[] = [
    vazio,
    vazio,
    vazio,
    vazio,
    vazio,
    ...(ocultarBh
      ? []
      : [th("H.E. autorizada"), th("H.E. não autorizada"), th("Débito"), th("Crédito")]),
    vazio
  ];

  const fmtH = (min: number | undefined) =>
    min && min > 0 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : "—";

  const tableBody: unknown[][] = [cab1, cab2];
  for (const [idx, dia] of relatorio.dias.entries()) {
    const bgColor = idx % 2 === 0 ? "#FFFFFF" : "#F7F7F7";
    const cellFill = dia.statusInterno === "AFASTAMENTO" ? "#EFF6FF" : bgColor;
    const cell = (txt: string, extra: Record<string, unknown> = {}) => ({
      text: txt,
      style: "tdCell",
      fillColor: cellFill,
      ...extra
    });
    const { original, alterada } = marcacoesOriginalEAlterada(dia);
    const pausas = dia.pausas.length
      ? `\nPausa: ${formatPausas(dia.pausas).replace(/\n/g, "; ")}`
      : "";
    /* Sem decisão do banco (fora do relatório do banco): deriva do saldo apurado do dia. */
    const saldo = dia.saldoMin ?? 0;
    const heAut = dia.heAutorizadaMin ?? Math.max(0, saldo);
    const heNao = dia.heNaoAutorizadaMin ?? 0;
    const deb = dia.debitoMin ?? Math.max(0, -saldo);
    const cred = dia.creditoMin ?? Math.max(0, saldo);

    tableBody.push([
      cell(dia.iso.split("-").reverse().join("/")),
      cell(diaNome(dia.iso)),
      cell(original),
      cell(alterada, alterada === "—" ? {} : { bold: true, color: "#6B0F1A" }),
      cell(dia.horasFormatado),
      ...(ocultarBh
        ? []
        : [
            cell(fmtH(heAut), heAut > 0 ? { color: "#15803D", bold: true } : {}),
            cell(fmtH(heNao), heNao > 0 ? { color: "#B45309", bold: true } : {}),
            cell(fmtH(deb), deb > 0 ? { color: "#B91C1C", bold: true } : {}),
            cell(fmtH(cred), cred > 0 ? { color: "#15803D", bold: true } : {})
          ]),
      cell(`${dia.status}${pausas}`, { alignment: "left" })
    ]);
  }

  return {
    stack: [
      {
        table: {
          headerRows: 2,
          dontBreakRows: true,
          //        Data Dia Marc  Alter HTrab [HEa HEn Déb Créd]  Justificativa
          widths: ocultarBh ? [40, 24, 96, 96, 34, "*"] : [38, 22, 84, 84, 30, 28, 30, 28, 28, "*"],
          body: tableBody
        },
        layout: {
          ...TABLE_LAYOUT,
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === node.table.body.length ? 0 : i <= 2 ? 0.6 : 0.4,
          hLineColor: (i: number) => (i <= 2 ? "#9CA3AF" : "#E5E7EB"),
          vLineWidth: (i: number, node: { table: { widths?: unknown[] } }) =>
            i === 0 || i === (node.table.widths?.length ?? 0) ? 0 : 0.3,
          vLineColor: () => "#E5E7EB"
        }
      },
      {
        text:
          'Marcações (Ent-Int Inter-Saída): horários batidos; "--:--" = sem batida. ' +
          "Marcações alteradas: horários vigentes após correção aprovada. " +
          "H.E. autorizada: creditada ao banco; H.E. não autorizada: apurada e não creditada. ",
        fontSize: 5.8,
        color: "#6B7280",
        margin: [0, 2, 0, 0] as [number, number, number, number]
      }
    ],
    margin: [0, 0, 0, 5]
  };
}

/** Atrasos = saldo negativo dos dias com batidas (falta inteira não é atraso). */
function atrasosMinutos(dias: RelatorioMensalPdf["dias"]): number {
  return dias
    .filter((d) => d.horasMin > 0 && d.saldoMin !== null && d.saldoMin < 0)
    .reduce((s, d) => s + Math.abs(d.saldoMin ?? 0), 0);
}

/** Horas extras = saldo positivo dos dias de jornada normal (multiplicador 100%). */
function horasExtrasMinutos(dias: RelatorioMensalPdf["dias"]): number {
  return dias
    .filter((d) => d.saldoMin !== null && d.saldoMin > 0)
    .reduce((s, d) => s + (d.saldoMin ?? 0), 0);
}

function buildTotais(input: QuadroPdfInput): unknown {
  const { relatorio, assinatura, funcionario, resumoBadges, espelho } = input;
  const ocultarBh =
    resumoBadges?.ocultarBancoHoras ?? categoriaSemVisibilidadeBancoHoras(funcionario.categoria);
  const b = resumoBadges;
  const dias = relatorio.dias;

  const faltas = b?.faltas ?? dias.filter((d) => d.statusInterno === "FALTA").length;
  const afastamentos =
    b?.afastamentos ?? dias.filter((d) => d.statusInterno === "AFASTAMENTO").length;
  const saldoMesBanco = b?.saldoMesMinutos ?? relatorio.saldoMinutos;
  const saldoPeriodo = ocultarBh ? null : saldoMesBanco;

  const esq: Array<[string, string]> = [
    ["Dias trabalhados", String(relatorio.diasTrabalhados)],
    ["Dias de afastamento", String(afastamentos)],
    ["Faltas", String(faltas)],
    ["Horas previstas", formatHorasNeutro(relatorio.horasEsperadasMinutos)]
  ];
  const dir: Array<[string, string]> = [
    ["Horas realizadas", formatHorasNeutro(relatorio.horasTrabalhadasMinutos)],
    ...(saldoPeriodo === null
      ? []
      : [["Saldo do período", formatBadgeHoras(saldoPeriodo)] as [string, string]]),
    ["Atrasos", formatHorasNeutro(atrasosMinutos(dias))],
    ...(ocultarBh
      ? []
      : [["Horas extras", formatHorasNeutro(horasExtrasMinutos(dias))] as [string, string]])
  ];

  const cellLabel = (t: string) => ({ text: t, style: "totalLabel", alignment: "left" as const });
  const cellValor = (t: string) => ({ text: t, style: "totalValue", alignment: "right" as const });
  const linhasResumo = Math.max(esq.length, dir.length);
  const bodyResumo: unknown[][] = [];
  for (let i = 0; i < linhasResumo; i++) {
    const e = esq[i];
    const d = dir[i];
    bodyResumo.push([
      e ? cellLabel(e[0]) : { text: "" },
      e ? cellValor(e[1]) : { text: "" },
      d ? cellLabel(d[0]) : { text: "" },
      d ? cellValor(d[1]) : { text: "" }
    ]);
  }
  const layoutLinhas = {
    hLineWidth: () => 0.4,
    vLineWidth: () => 0,
    hLineColor: () => "#E5E7EB",
    paddingTop: () => 3,
    paddingBottom: () => 3,
    paddingLeft: () => 4,
    paddingRight: () => 4
  };

  const stack: unknown[] = [
    { text: "Resumo do período", style: "sectionTitle", margin: [0, 4, 0, 2] },
    {
      table: { widths: ["*", 70, "*", 70], body: bodyResumo },
      layout: layoutLinhas,
      margin: [0, 0, 0, 6]
    }
  ];

  /* Extrato de cálculo (banco de horas): só para quem tem visibilidade do banco. */
  if (!ocultarBh) {
    const verde = "#15803D";
    const verm = "#B91C1C";
    const cor = (n: number) => (n >= 0 ? verde : verm);
    const he = horasExtrasMinutos(dias);
    const debitos = dias
      .filter((d) => d.saldoMin !== null && d.saldoMin < 0)
      .reduce((s, d) => s + Math.abs(d.saldoMin ?? 0), 0);
    const linhas: Array<{ label: string; valor: string; color?: string }> = [
      {
        label: "Horas trabalhadas no período",
        valor: formatHorasNeutro(relatorio.horasTrabalhadasMinutos)
      },
      {
        label: "Horas previstas (jornada × dias)",
        valor: formatHorasNeutro(relatorio.horasEsperadasMinutos)
      },
      { label: "(+) Horas extras / créditos", valor: formatBadgeHoras(he), color: verde },
      {
        label: "(-) Débitos (faltas e atrasos)",
        valor: `-${formatHorasNeutro(debitos)}`,
        color: verm
      },
      {
        label: "(=) Saldo do mês",
        valor: formatBadgeHoras(saldoMesBanco),
        color: cor(saldoMesBanco)
      }
    ];
    if (b) {
      linhas.push(
        {
          label: `Acumulado (${b.labelMesAnterior})`,
          valor: formatBadgeHoras(b.saldoAcumuladoMesAnteriorMinutos),
          color: cor(b.saldoAcumuladoMesAnteriorMinutos)
        },
        {
          label: "Banco de horas total (acumulado + saldo)",
          valor: formatBadgeHoras(b.totalAcumuladoMinutos),
          color: cor(b.totalAcumuladoMinutos)
        }
      );
    } else {
      linhas.push({
        label: "Banco de horas total",
        valor: formatBancoHoras(assinatura.bancoHorasSaldoTotalMinutos),
        color: cor(assinatura.bancoHorasSaldoTotalMinutos)
      });
    }
    const bodyExtrato = linhas.map((l) => [
      cellLabel(l.label),
      { ...cellValor(l.valor), ...(l.color ? { color: l.color } : {}) }
    ]);
    const mult = espelho?.multiplicadores;
    stack.push(
      { text: "Extrato de cálculo de horas", style: "sectionTitle", margin: [0, 2, 0, 2] },
      {
        table: { widths: ["*", 90], body: bodyExtrato },
        layout: layoutLinhas,
        margin: [0, 0, 0, mult ? 2 : 6]
      }
    );
    if (mult) {
      stack.push({
        text: `Multiplicadores do banco: sábado ${mult.sabadoPct}% · domingo ${mult.domingoPct}% · feriado ${mult.feriadoPct}%`,
        fontSize: 6,
        color: "#6B7280",
        margin: [0, 0, 0, 6]
      });
    }
  }

  return { stack };
}

/** Lista de ocorrências derivada dos dias (afastamento, feriado, falta, correções…). */
function buildOcorrencias(input: QuadroPdfInput): unknown {
  type Item = { data: string; tipo: string; texto: string; cor: string; registro: string };
  const itens: Item[] = [];
  for (const d of input.relatorio.dias) {
    const data = d.iso.split("-").reverse().join("/").slice(0, 5);
    if (d.statusInterno === "FUTURO" || d.statusInterno === "FOLGA") continue;
    if (d.statusInterno !== "OK" || /atestado/i.test(d.status)) {
      itens.push({
        data,
        tipo:
          d.statusInterno === "FALTA"
            ? "Falta"
            : d.statusInterno === "INCONSISTENTE"
              ? "Inconsistência"
              : "Afastamento",
        texto: d.status,
        cor:
          d.statusInterno === "FALTA" || d.statusInterno === "INCONSISTENTE"
            ? "#B91C1C"
            : "#1E40AF",
        registro: "—"
      });
    }
    for (const a of d.ajustes ?? []) {
      itens.push({
        data,
        tipo: "Correção",
        texto: a.replace(/ conforme sua solicitação aprovada\.?$/, " (solicitação aprovada)"),
        cor: "#6B0F1A",
        registro: "Alterado"
      });
    }
    /* Ajustes automáticos de almoço: mudam só o cálculo do banco, não o registro. */
    for (const a of d.ajustesAlmoco ?? []) {
      itens.push({
        data,
        tipo: "Almoço",
        texto: a.replace(/^Almoço /, ""),
        registro: "Não modificado",
        cor: "#92400E"
      });
    }
  }
  if (!itens.length) return { text: "" };

  /* Tabela em toda a largura; com muitas ocorrências, duas tabelas lado a lado (leitura de cima
     para baixo, depois a da direita). Datas sem o ano (o período está no cabeçalho). */
  /* Uma tabela em toda a largura (cabe ~35 linhas na página); acima disso, duas lado a lado. */
  const duasColunas = itens.length > 36;
  const tabela = (parte: Item[]) => ({
    width: "*",
    table: {
      headerRows: 1,
      widths: duasColunas ? [24, 40, "*", 50] : [34, 52, "*", 62],
      body: [
        ["Dia", "Tipo", "Ocorrência", "Registro"].map((t) => ({
          text: t,
          style: "thCell",
          fontSize: 6.3
        })),
        ...parte.map((it, k) => {
          const fill = k % 2 === 0 ? "#FFFFFF" : "#F7F7F7";
          return [
            { text: it.data, fontSize: 6.6, bold: true, fillColor: fill },
            { text: it.tipo, fontSize: 6.3, bold: true, color: it.cor, fillColor: fill },
            { text: it.texto, fontSize: 6.4, color: "#1F2937", fillColor: fill },
            {
              text: it.registro,
              fontSize: 6.1,
              bold: it.registro !== "—",
              color: it.registro === "Alterado" ? "#6B0F1A" : "#15803D",
              fillColor: fill
            }
          ];
        })
      ]
    },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 0.6 : 0.3),
      hLineColor: () => "#E5E7EB",
      vLineWidth: () => 0,
      paddingTop: () => 2.2,
      paddingBottom: () => 2.2,
      paddingLeft: () => 3,
      paddingRight: () => 3
    }
  });
  const metade = Math.ceil(itens.length / 2);
  const temAlteradas = input.relatorio.dias.some((d) => d.ajustes?.length);
  const temAlmoco = input.relatorio.dias.some((d) => d.ajustesAlmoco?.length);
  return {
    stack: [
      {
        text: `Ocorrências do período (${itens.length})`,
        style: "sectionTitle",
        margin: [0, 4, 0, 3]
      },
      duasColunas
        ? {
            columns: [tabela(itens.slice(0, metade)), tabela(itens.slice(metade))],
            columnGap: 12
          }
        : tabela(itens),
      ...(temAlteradas || temAlmoco
        ? [
            {
              text: [
                temAlteradas
                  ? "Correção: marcação alterada por solicitação aprovada — a coluna “Marcações” mostra o horário original batido. "
                  : "",
                temAlmoco
                  ? "Almoço: ajuste automático aplicado somente no cálculo de horas e do banco, conforme a jornada — o registro de ponto NÃO é modificado (os horários batidos permanecem como foram registrados)."
                  : ""
              ].join(""),
              fontSize: 6,
              color: "#6B7280",
              margin: [0, 4, 0, 4] as [number, number, number, number]
            }
          ]
        : [])
    ],
    margin: [0, 0, 0, 2]
  };
}

/** Última página: declaração de autenticidade, integridade e não repúdio (+ QR de verificação). */
function buildPaginaDeclaracao(input: QuadroPdfInput, rascunho: boolean): unknown {
  const { funcionario, assinatura, verificacao } = input;
  const brData = (iso: string) => iso.split("-").reverse().join("/");
  const periodo = input.cicloBancoHoras
    ? `${brData(input.cicloBancoHoras.inicio)} a ${brData(input.cicloBancoHoras.fim)}`
    : `${String(input.mes).padStart(2, "0")}/${input.ano}`;
  const matricula = funcionario.matricula ?? "";
  const periodoHash = input.cicloBancoHoras
    ? `${input.cicloBancoHoras.inicio}/${input.cicloBancoHoras.fim}`
    : `${input.mes}/${input.ano}`;

  const evidencia = (
    papel: string,
    nome: string,
    em: Date | null,
    ip: string | null,
    gateway: string | null | undefined,
    ua: string | null | undefined
  ) => {
    const ok = !!em && !rascunho;
    return [
      { text: papel, style: "fieldLabel" },
      { text: nome, style: "fieldValue" },
      { text: ok ? formatDateTime(em) : "Pendente", style: "fieldValue" },
      { text: ok ? `${ip ?? "—"}${gateway ? ` / ${gateway}` : ""}` : "—", style: "fieldValue" },
      { text: ok ? shortUserAgent(ua) : "—", style: "fieldValue" },
      {
        text: ok ? groupCode(computeSignatoryHash(matricula, periodoHash, em, ip)) : "—",
        fontSize: 5.8,
        bold: true
      }
    ];
  };
  const linhasEvid: unknown[][] = [
    ["Signatário", "Nome", "Assinado em", "IP (PC / borda)", "Dispositivo", "Código SHA-256"].map(
      (t) => ({ text: t, style: "thCell" })
    ),
    evidencia(
      "Funcionário",
      funcionario.user.name,
      assinatura.assinadoFuncionarioEm,
      assinatura.assinadoFuncionarioIp,
      assinatura.assinadoFuncionarioIpGateway,
      assinatura.assinadoFuncionarioUserAgent
    ),
    ...(input.cicloBancoHoras
      ? []
      : [
          evidencia(
            "Gestor da área",
            assinatura.assinadoGestorNome ?? funcionario.gerencia?.nome ?? "—",
            assinatura.assinadoGestorEm,
            assinatura.assinadoGestorIp,
            assinatura.assinadoGestorIpGateway,
            assinatura.assinadoGestorUserAgent
          )
        ])
  ];

  const paragrafo = (t: string) => ({
    text: t,
    fontSize: 7,
    color: "#374151",
    lineHeight: 1.25,
    margin: [0, 0, 0, 5] as [number, number, number, number]
  });
  const titulo = (t: string) => ({
    text: t,
    style: "sectionTitle",
    margin: [0, 6, 0, 3] as [number, number, number, number]
  });

  const qr = verificacao?.url
    ? {
        columns: [
          input.registro && !rascunho
            ? { ...marcador(MARCADOR_QR_DECLARACAO, 92, 92), width: 100 }
            : { qr: verificacao.url, fit: 92, width: 100 },
          {
            width: "*",
            stack: [
              {
                text: "Verifique a validade deste documento",
                fontSize: 8,
                bold: true,
                color: "#6B0F1A"
              },
              {
                text: "Leia o QR Code ou acesse o endereço abaixo e informe o código de verificação. A página confirma a autenticidade, as assinaturas e a integridade do arquivo.",
                fontSize: 6.8,
                color: "#374151",
                margin: [0, 2, 0, 4] as [number, number, number, number]
              },
              ...(input.registro && !rascunho
                ? [marcador(MARCADOR_LINK_DECLARACAO, 330, 24)]
                : [
                    { text: verificacao.url, fontSize: 7, bold: true, color: "#1E40AF" },
                    {
                      text: `Código: ${verificacao.codigo ?? "—"}`,
                      fontSize: 6.5,
                      color: "#111",
                      margin: [0, 3, 0, 0] as [number, number, number, number]
                    }
                  ])
            ]
          }
        ],
        columnGap: 10,
        margin: [0, 0, 0, 4] as [number, number, number, number]
      }
    : {
        text: rascunho
          ? "Rascunho: o QR Code e o link de verificação são gerados quando o documento é assinado."
          : "O QR Code e o link de verificação estarão disponíveis após a conclusão das assinaturas.",
        fontSize: 6.8,
        italics: true,
        color: "#6B7280",
        margin: [0, 0, 0, 4] as [number, number, number, number]
      };

  return {
    pageBreak: "before",
    stack: [
      {
        text: "Declaração de Autenticidade, Integridade e Não Repúdio",
        fontSize: 11,
        bold: true,
        color: "#6B0F1A",
        margin: [0, 0, 0, 4] as [number, number, number, number]
      },
      paragrafo(
        `Documento: ${input.cicloBancoHoras ? "Relatório do ciclo do banco de horas" : "Espelho de Ponto Eletrônico (folha mensal)"} — ` +
          `competência/período ${periodo} — ${funcionario.user.name}` +
          `${matricula ? `, matrícula ${matricula}` : ""}.` +
          (input.registro && !rascunho
            ? ` Registro nº ${input.registro.numero} — muda sempre que o conteúdo muda; cada página traz um QR Code selado com este registro.`
            : "")
      ),
      titulo("1. Assinaturas e evidências"),
      {
        table: {
          headerRows: 1,
          widths: [52, "*", 70, 78, 70, 120],
          body: linhasEvid
        },
        layout: TABLE_LAYOUT,
        margin: [0, 0, 0, 4] as [number, number, number, number]
      },
      titulo("2. Declaração"),
      paragrafo(
        "As assinaturas deste documento foram realizadas por meio de autenticação individual e " +
          "intransferível no Sistema de Ponto Eletrônico do CFO, com registro de data e hora (horário " +
          "de Brasília), endereço IP e dispositivo do signatário. O conteúdo é protegido por código de " +
          "integridade (SHA-256), de modo que qualquer alteração posterior invalida os códigos de " +
          "validação. O signatário reconhece a autoria do ato e a conformidade das informações com os " +
          "registros apresentados, não podendo repudiá-lo (não repúdio)."
      ),
      titulo("3. Selo institucional ICP-Brasil"),
      paragrafo(
        verificacao?.seloAtivo
          ? "Este arquivo recebe o selo digital do CFO com certificado e-CNPJ emitido no âmbito da " +
              "ICP-Brasil (assinatura PAdES), nos termos do art. 10, §1º, da MP nº 2.200-2/2001, " +
              "assegurando origem e integridade. A validade pode ser conferida no Verificador de " +
              "Conformidade do ITI (https://validar.iti.gov.br)."
          : "O selo digital do CFO com certificado e-CNPJ (ICP-Brasil) será aplicado a este " +
              "documento assim que o certificado for instalado. Até lá, a autenticidade é comprovada " +
              "pelas evidências acima e pelo código de verificação, nos termos do art. 10, §2º, da " +
              "MP nº 2.200-2/2001 e da Lei nº 14.063/2020."
      ),
      titulo("4. Verificação"),
      qr,
      titulo("5. Confidencialidade e proteção de dados"),
      paragrafo(
        "Este documento contém dados pessoais tratados pelo CFO para controle de jornada, " +
          "cumprimento de obrigação legal e gestão da relação de trabalho (Lei nº 13.709/2018 — " +
          "LGPD). O acesso é restrito ao titular, à chefia imediata e ao RH, sendo vedado o " +
          "compartilhamento indevido. A página pública de verificação exibe apenas dados mínimos."
      ),
      {
        text: "Base normativa: MP nº 2.200-2/2001; Lei nº 14.063/2020; Portaria MTP nº 671/2021, art. 84.",
        fontSize: 6,
        color: "#6B7280",
        italics: true
      }
    ]
  };
}

const NOTA_LEGAL = {
  text:
    "Documento gerado pelo sistema de Ponto Eletrônico do CFO, conforme art. 84 da Portaria " +
    "MTP nº 671/2021.",
  fontSize: 6,
  color: "#6B7280",
  italics: true,
  margin: [0, 6, 0, 0] as [number, number, number, number]
};

/**
 * Síntese mês a mês do ciclo — espelha a estrutura do front (Julho / Agosto
 * com Trabalhado, Saldo do mês, Acumulado e situação), no layout do relatório.
 */
function buildSinteseMesesCiclo(meses: MesCicloResumoPdf[]): unknown {
  const th = (t: string) => ({
    text: t,
    style: "thCell",
    alignment: "center" as const
  });
  const td = (t: string, opts?: { bold?: boolean; color?: string; align?: string }) => ({
    text: t,
    fontSize: 7,
    alignment: (opts?.align ?? "center") as "left" | "center" | "right",
    ...(opts?.bold ? { bold: true } : {}),
    ...(opts?.color ? { color: opts.color } : {})
  });

  const situacaoLabel: Record<MesCicloResumoPdf["situacao"], { text: string; color: string }> = {
    ASSINADO: { text: "Assinado", color: "#15803D" },
    PENDENTE: { text: "Pendente de assinatura", color: "#B45309" },
    AGUARDA_FECHAMENTO: { text: "Aguarda fechamento do mês", color: "#6B7280" }
  };

  const body: unknown[][] = [
    [th("Mês"), th("Trabalhado"), th("Saldo do mês"), th("Acumulado"), th("Situação")]
  ];

  for (const m of meses) {
    const sit = situacaoLabel[m.situacao];
    body.push([
      td(m.label, { bold: true, align: "left", color: "#6B0F1A" }),
      td(formatHorasNeutro(m.trabalhadoMinutos)),
      td(formatBadgeHoras(m.saldoMesMinutos), {
        color: m.saldoMesMinutos >= 0 ? "#15803D" : "#B91C1C",
        bold: true
      }),
      td(formatBadgeHoras(m.acumuladoMinutos), {
        color: m.acumuladoMinutos >= 0 ? "#15803D" : "#B91C1C",
        bold: true
      }),
      td(sit.text, { color: sit.color, bold: true })
    ]);
  }

  return {
    stack: [
      {
        text: "Síntese do ciclo — mês a mês",
        style: "sectionTitle",
        margin: [0, 8, 0, 2] as [number, number, number, number]
      },
      {
        text: "Mesma estrutura do acompanhamento no sistema (trabalhado, saldo, acumulado e situação da folha).",
        fontSize: 6.5,
        color: "#6B7280",
        margin: [0, 0, 0, 4] as [number, number, number, number]
      },
      {
        table: {
          headerRows: 1,
          widths: ["*", 70, 70, 70, 110],
          body
        },
        layout: TABLE_LAYOUT
      }
    ],
    margin: [0, 0, 0, 16] as [number, number, number, number],
    unbreakable: true
  };
}

/** Altura reservada no rodapé para a estrutura de assinatura (uma por página). */
const ALTURA_RODAPE_ASSINATURA = 96;

/**
 * Estrutura de assinatura da página — renderizada no rodapé de TODAS as páginas (uma por
 * página, nunca mais). Cada página leva funcionário e gestor (ciclo: só funcionário), com
 * data/hora, IP, dispositivo e o código SHA-256 de autenticidade.
 */
function buildAssinaturaRodape(
  input: QuadroPdfInput,
  paginaAtual: number,
  totalPaginas: number,
  rascunho = false
): unknown {
  const { funcionario, assinatura, certificadoBase64 } = input;
  const soFuncionario = !!input.cicloBancoHoras;
  const periodo = input.cicloBancoHoras
    ? `${input.cicloBancoHoras.inicio}/${input.cicloBancoHoras.fim}`
    : `${input.mes}/${input.ano}`;
  const matricula = funcionario.matricula ?? "";

  const coluna = (
    titulo: string,
    cor: string,
    fundo: string,
    nome: string,
    assinadoEm: Date | null,
    ip: string | null,
    ipGateway: string | null | undefined,
    userAgent: string | null | undefined
  ) => {
    const assinado = !!assinadoEm && !rascunho;
    const hash = assinado
      ? groupCode(computeSignatoryHash(matricula, periodo, assinadoEm, ip))
      : null;
    const linhas: unknown[] = [
      { text: titulo, fontSize: 6, bold: true, color: cor, characterSpacing: 0.4 },
      { text: nome, fontSize: 7.5, bold: true, color: "#111", margin: [0, 1, 0, 0] }
    ];
    if (rascunho) {
      linhas.push(
        {
          canvas: [
            { type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.6, lineColor: "#9CA3AF" }
          ],
          margin: [0, 14, 0, 2]
        },
        { text: "Assinatura", fontSize: 5.5, color: "#888" }
      );
    } else if (assinado) {
      linhas.push(
        {
          text: `Assinado eletronicamente em ${formatDateTime(assinadoEm)} · IP ${ip ?? "—"}${ipGateway ? ` · borda ${ipGateway}` : ""} · ${shortUserAgent(userAgent)}`,
          fontSize: 5.8,
          color: "#444",
          margin: [0, 1, 0, 0]
        },
        {
          text: `SHA-256: ${hash}`,
          fontSize: 5.5,
          bold: true,
          color: "#111",
          characterSpacing: 0.3,
          margin: [0, 2, 0, 0]
        }
      );
    } else {
      linhas.push({
        text: "Pendente de assinatura",
        fontSize: 6.5,
        italics: true,
        color: "#9CA3AF",
        margin: [0, 4, 0, 0]
      });
    }
    const corpo =
      assinado && certificadoBase64
        ? {
            columns: [
              {
                image: `data:image/png;base64,${certificadoBase64}`,
                width: 24,
                margin: [0, 2, 6, 0]
              },
              { stack: linhas, width: "*" }
            ]
          }
        : { stack: linhas };
    return {
      table: { widths: ["*"], body: [[{ ...corpo, margin: [6, 4, 6, 4] }]] },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => "#E5C9CC",
        vLineColor: () => "#E5C9CC",
        fillColor: () => fundo
      }
    };
  };

  const colFunc = coluna(
    "FUNCIONÁRIO",
    "#6B0F1A",
    "#FFF5F5",
    funcionario.user.name,
    assinatura.assinadoFuncionarioEm,
    assinatura.assinadoFuncionarioIp,
    assinatura.assinadoFuncionarioIpGateway,
    assinatura.assinadoFuncionarioUserAgent
  );
  const colGestor = coluna(
    "GESTOR DA ÁREA",
    "#374151",
    "#F8FAFC",
    assinatura.assinadoGestorNome ?? funcionario.gerencia?.nome ?? "—",
    assinatura.assinadoGestorEm,
    assinatura.assinadoGestorIp,
    assinatura.assinadoGestorIpGateway,
    assinatura.assinadoGestorUserAgent
  );

  return {
    margin: [25, 4, 25, 0],
    stack: [
      {
        columns: [
          ...(soFuncionario
            ? [{ width: "*", ...colFunc }]
            : [
                { width: "*", ...colFunc },
                { width: 8, text: "" },
                { width: "*", ...colGestor }
              ]),
          /* QR selado desta página: registro + nº da página + total, assinados pelo sistema. */
          ...(input.registro && !rascunho
            ? [
                { width: 6, text: "" },
                {
                  width: 52,
                  stack: [
                    marcador(MARCADOR_QR_PAGINA, 52, 52),
                    { text: "Verificar página", fontSize: 4.8, color: "#555", alignment: "center" }
                  ]
                }
              ]
            : [])
        ]
      },
      {
        columns: [
          {
            text:
              (input.registro && !rascunho ? `Registro nº ${input.registro.numero} — ` : "") +
              `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — ` +
              "Sistema de Ponto Eletrônico CFO. Qualquer alteração no conteúdo invalida os códigos de validação." +
              (rascunho ? "  RASCUNHO — sem validade sem assinatura eletrônica." : ""),
            fontSize: 5.3,
            color: rascunho ? "#B91C1C" : "#777"
          },
          {
            text: `Página ${paginaAtual} de ${totalPaginas}`,
            fontSize: 6.5,
            bold: true,
            color: "#374151",
            alignment: "right",
            width: 70
          }
        ],
        margin: [0, 3, 0, 0]
      }
    ]
  };
}

/**
 * Fundo de segurança de cada página (documento assinado): ondas finas tipo "guilhoché" e
 * microtexto com o nº de registro e a página. Recortes/colagens de prints desalinham o padrão e
 * o microtexto denuncia de qual registro/página veio o pedaço.
 */
export function buildFundoSeguranca(registro: string) {
  return (paginaAtual: number, tamanho: { width: number; height: number }) => {
    const ondas: unknown[] = [];
    for (let y = 30, k = 0; y < tamanho.height - 20; y += 22, k++) {
      const pontos: Array<{ x: number; y: number }> = [];
      for (let x = 0; x <= tamanho.width; x += 6) {
        pontos.push({ x, y: y + 3.2 * Math.sin(x / 13 + k * 0.9) });
      }
      ondas.push({ type: "polyline", lineWidth: 0.25, lineColor: "#EFE3E5", points: pontos });
    }
    const unidade = `${registro} · PÁG ${paginaAtual} · `;
    const linhaMicro = unidade.repeat(Math.ceil(tamanho.width / (unidade.length * 1.35)) + 1);
    const micro: unknown[] = [];
    for (let y = 41; y < tamanho.height - 20; y += 44) {
      micro.push({
        text: linhaMicro,
        fontSize: 2.6,
        color: "#E4D6D8",
        absolutePosition: { x: 4, y },
        noWrap: true
      });
    }
    return [{ canvas: ondas, absolutePosition: { x: 0, y: 0 } }, ...micro];
  };
}

/** A seção do Resumo inicia na 2ª página; se a tabela já passou para a 2ª, segue junto. */
const resumoPageBreakBefore = (node: {
  id?: string;
  startPosition?: { pageNumber: number };
}): boolean => node.id === "resumo" && (node.startPosition?.pageNumber ?? 0) === 1;

export function buildQuadroPdfDocDefinition(input: QuadroPdfInput): Record<string, unknown> {
  const docSubtitle = input.cicloBancoHoras
    ? "RELATÓRIO DO CICLO DE BANCO DE HORAS"
    : "RELATÓRIO DE PONTO DO FUNCIONÁRIO";
  const sectionRegistros = "Marcações e jornada realizada";
  return {
    pageSize: "A4",
    pageOrientation: ORIENTACAO_PAGINA,
    pageMargins: [25, 16, 25, ALTURA_RODAPE_ASSINATURA],
    defaultStyle: { font: "Helvetica", fontSize: 7 },
    styles: {
      orgTitle: {
        font: "InstrumentSerif",
        fontSize: 18,
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
      buildHeader(input.logoBase64, docSubtitle),
      buildFuncionarioCard(input),
      { text: sectionRegistros, style: "sectionTitle" },
      buildTabelaDias(input),
      {
        id: "resumo",
        stack: [
          buildTotais(input),
          buildOcorrencias(input),
          ...(input.cicloBancoHoras?.mesesResumo?.length
            ? [buildSinteseMesesCiclo(input.cicloBancoHoras.mesesResumo)]
            : []),
          NOTA_LEGAL
        ]
      },
      buildPaginaDeclaracao(input, false)
    ],
    pageBreakBefore: resumoPageBreakBefore,
    ...(input.registro
      ? {
          background: buildFundoSeguranca(input.registro.numero),
          watermark: {
            text: input.registro.numero,
            color: "#6B0F1A",
            opacity: 0.045,
            bold: true,
            fontSize: 34,
            angle: -38
          }
        }
      : {}),
    footer: (paginaAtual: number, totalPaginas: number) =>
      buildAssinaturaRodape(input, paginaAtual, totalPaginas)
  };
}

/** Rascunho sem assinaturas — marca d'água + espaço para assinatura manual */
export function buildRascunhoPdfDocDefinition(input: QuadroPdfInput): Record<string, unknown> {
  const STYLES = {
    orgTitle: {
      font: "InstrumentSerif",
      fontSize: 18,
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

  return {
    pageSize: "A4",
    pageOrientation: ORIENTACAO_PAGINA,
    pageMargins: [25, 16, 25, ALTURA_RODAPE_ASSINATURA],
    defaultStyle: { font: "Helvetica", fontSize: 7 },
    watermark: { text: "RASCUNHO", color: "#6B0F1A", opacity: 0.055, bold: true, fontSize: 90 },
    styles: STYLES,
    content: [
      buildHeader(
        input.logoBase64,
        input.cicloBancoHoras
          ? "RELATÓRIO DO CICLO DE BANCO DE HORAS"
          : "RELATÓRIO DE PONTO DO FUNCIONÁRIO"
      ),
      buildFuncionarioCard(input),
      {
        text: "Marcações e jornada realizada",
        style: "sectionTitle"
      },
      buildTabelaDias(input),
      {
        id: "resumo",
        stack: [
          buildTotais(input),
          buildOcorrencias(input),
          ...(input.cicloBancoHoras?.mesesResumo?.length
            ? [buildSinteseMesesCiclo(input.cicloBancoHoras.mesesResumo)]
            : []),
          NOTA_LEGAL
        ]
      },
      buildPaginaDeclaracao(input, true)
    ],
    pageBreakBefore: resumoPageBreakBefore,
    footer: (paginaAtual: number, totalPaginas: number) =>
      buildAssinaturaRodape(input, paginaAtual, totalPaginas, true)
  };
}

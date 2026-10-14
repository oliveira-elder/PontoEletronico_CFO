import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { NotificacaoService } from "../notificacao/notificacao.service";
import { ConfigSolicitacoesService } from "../ponto/config-solicitacoes.service";
import {
  dataBrasiliaISO,
  dataCivilFimAfastamento,
  dataCivilISO,
  hojeBrasiliaISO,
  intervaloColunaDate,
  intervaloDiaBrasilia,
  somarDiasCivil
} from "../../utils/horario-brasilia";
import { diasCicloCompletoEmCasa, rotulosModalidadePorDia } from "../../utils/hora-extra-decisao";
import { exigenciasCicloPresencial } from "../../utils/ciclo-completo-presencial";
import {
  contarDiasTrabalhados,
  montarRelatorioQuadro,
  type RelatorioQuadroMensal,
  resolverJornadaHistoricoContexto,
  type DiaQuadroPdf
} from "../../utils/historico-quadro";
import { SeloIcpService } from "../selo-icp/selo-icp.service";
import { createHash, createHmac, randomBytes } from "crypto";
import { extrairLinhasPdf, normalizarTexto, tokensNumericos } from "../../utils/pdf-texto";
import { existsSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { enriquecerAfastamentosComSolicitacoes } from "../../utils/atestado-parcial-enrich";
import { inicioAtividadesUsuario } from "../../utils/inicio-atividades";
import { ensureCategoriaHistorico } from "../../utils/categoria-historico";
import { diaSemObrigacaoPonto } from "../../utils/categoria-jornada";
import { periodosCessao, type IntervaloCessao } from "../../utils/cessao-historico";
import { montarDiaNeutro } from "../../utils/dias-neutros";

export type ElegibilidadeAssinatura = {
  funcionarioId: string;
  nome: string;
  matricula: string | null;
  categoria: string;
  gerenciaId: string | null;
  gerencia: string | null;
  /** APTO: gera; JA_POSSUI: já tem assinatura no mês; NAO_APTO: fora dos critérios. */
  situacao: "APTO" | "JA_POSSUI" | "NAO_APTO";
  motivo: string | null;
  /** Observações que não impedem a geração (ex.: cessão em parte do mês). */
  aviso: string | null;
};

/** O intervalo [ini, fim] cobre todos os dias de [alvoIni, alvoFim]? (datas civis YYYY-MM-DD) */
function cobreMesInteiro(
  periodos: Array<{ inicio: string; fim: string | null }>,
  alvoIni: string,
  alvoFim: string
): boolean {
  const ord = [...periodos].sort((a, b) => a.inicio.localeCompare(b.inicio));
  let cursor = alvoIni;
  for (const p of ord) {
    if (p.inicio > cursor) break;
    const fim = p.fim ?? "9999-12-31";
    if (fim >= cursor) {
      if (fim >= alvoFim) return true;
      cursor = somarDiasCivil(fim, 1);
    }
  }
  return false;
}

const sobrepoe = (p: IntervaloCessao, ini: string, fim: string) =>
  p.inicio <= fim && (p.fim ?? "9999-12-31") >= ini;
import { urlHomeSistema } from "../notificacao/atalhos-evento";
import {
  codigoAssinaturaCoincide,
  codigoCienciaGestorExibido,
  computeQuadroSignatoryHash,
  groupCodigoAssinatura,
  normalizeCodigoAssinatura
} from "../../utils/assinatura-codigo";
import {
  buildQuadroPdfDocDefinition,
  type EspelhoExtrasPdf,
  type VerificacaoDocumentoPdf,
  type QuadroPdfInput,
  type RegistroDocumentoPdf,
  buildRascunhoPdfDocDefinition,
  loadAssetBase64,
  type ResumoBadgesPdf
} from "./quadro-registro-pdf.builder";
import { getPdfFonts } from "./pdf-fonts";
import {
  categoriaSemIntervaloAlmoco,
  funcionarioSemRegistroPonto,
  categoriaSemVisibilidadeBancoHoras
} from "../../utils/categoria-jornada";

/** Troca o saldo do dia/mês do quadro pelo do banco de horas (fonte única). */
function aplicarBancoNoRelatorio(
  rel: RelatorioQuadroMensal,
  diasBanco: Array<{ data: string; saldoDiaMinutos: number; movimentoRhMinutos?: unknown }>
): RelatorioQuadroMensal {
  const porData = new Map(diasBanco.map((d) => [d.data, d]));
  const fmt = (m: number) => {
    const sinal = m < 0 ? "-" : m > 0 ? "+" : "";
    const abs = Math.abs(m);
    return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}m`;
  };
  if (!diasBanco.length) return rel;
  const dias = rel.dias.map((d) => {
    const b = porData.get(d.iso);
    if (!b && d.saldoMin !== null) {
      /* Dia que o banco não conta (fora dos dias de trabalho da jornada do funcionário, ex.:
         aprendiz que não trabalha às terças, ou antes do início das atividades): não é falta
         nem gera saldo. */
      if (d.statusInterno === "FALTA") {
        return {
          ...d,
          saldoMin: null,
          saldoFormatado: "—",
          status: "Sem Expediente",
          statusInterno: "FOLGA" as const
        };
      }
      return { ...d, saldoMin: null, saldoFormatado: "—" };
    }
    if (!b || d.saldoMin === null) return d;
    /* Liberação de tempo pelo RH é movimento do banco, não do dia de ponto. */
    const saldo = b.saldoDiaMinutos - Number(b.movimentoRhMinutos ?? 0);
    /* Rendimento do dia: o que foi apurado além da jornada × o que o banco creditou. */
    const apurado = Math.max(0, d.saldoMin);
    const creditado = Math.max(0, saldo);
    const rendimento = {
      heAutorizadaMin: apurado > 0 ? creditado : 0,
      heNaoAutorizadaMin: Math.max(0, apurado - creditado),
      debitoMin: Math.max(0, -saldo),
      creditoMin: creditado
    };
    return {
      ...d,
      ...rendimento,
      ...(saldo === d.saldoMin ? {} : { saldoMin: saldo, saldoFormatado: fmt(saldo) })
    };
  });
  const saldoMinutos = dias
    .filter((d) => d.saldoMin !== null)
    .reduce((t, d) => t + (d.saldoMin ?? 0), 0);
  return { ...rel, dias, saldoMinutos, saldoFormatado: fmt(saldoMinutos) };
}

const STATUS_SOLICITACAO_EM_ANDAMENTO = [
  "PENDENTE",
  "AGUARDANDO_RH",
  "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
  "AGUARDANDO_GESTOR_RH"
] as const;

/**
 * O que impede a assinatura da folha: dias INCONSISTENTES (registro iniciado e não completado) e
 * solicitações do mês em andamento. A Falta (nenhum registro) NÃO impede: o funcionário optou
 * por faltar e o banco de horas já desconta.
 */
export interface PendenciasFolha {
  /** Dias Inconsistentes (exceto hoje), com o motivo. */
  dias: Array<{ iso: string; status: "INCONSISTENTE"; motivo: string }>;
  /** Solicitações do mês ainda sem decisão final. */
  solicitacoes: Array<{
    id: string;
    tipo: string;
    tipoLabel: string;
    status: string;
    etapa: string;
    inicio: string;
    fim: string;
  }>;
  /** Não foi possível conferir os dias do mês (erro interno). */
  erroConferencia: boolean;
}

const TIPO_SOLICITACAO_LABEL_FOLHA: Record<string, string> = {
  CORRECAO_PONTO: "Correção de ponto",
  ATESTADO: "Atestado médico",
  ABONO: "Abono",
  FERIAS: "Férias",
  LICENCA: "Licença e Outros",
  DAY_OFF: "Day Off",
  HORA_EXTRA: "Hora extra"
};

const ETAPA_SOLICITACAO_FOLHA: Record<string, string> = {
  PENDENTE: "aguardando o chefe",
  AGUARDANDO_RH: "aguardando o RH",
  AGUARDANDO_DOCUMENTO_FUNCIONARIO: "aguardando o seu documento",
  AGUARDANDO_GESTOR_RH: "aguardando o Gerente de RH"
};

const fmtDiaBr = (iso: string) => iso.split("-").reverse().join("/");

/** Texto da pendência para a mensagem de bloqueio (e e-mail/notificação, se preciso). */
export function textoPendenciasFolha(p: PendenciasFolha): string {
  const partes: string[] = [];
  if (p.erroConferencia) {
    partes.push("não foi possível conferir os dias do mês (tente novamente ou fale com o RH)");
  }
  if (p.dias.length) {
    partes.push(
      "dias para regularizar: " +
        p.dias.map((d) => `${fmtDiaBr(d.iso)} (Inconsistente — ${d.motivo})`).join("; ")
    );
  }
  if (p.solicitacoes.length) {
    partes.push(
      "solicitações em andamento: " +
        p.solicitacoes
          .map(
            (s) =>
              `${s.tipoLabel} ${s.inicio === s.fim ? fmtDiaBr(s.inicio) : `${fmtDiaBr(s.inicio)} a ${fmtDiaBr(s.fim)}`} (${s.etapa})`
          )
          .join("; ")
    );
  }
  return partes.join(" | ");
}

function montarMensagemCorrecaoPendenteFolha(
  mes: number,
  ano: number
): { titulo: string; corpo: string } {
  const mesNome = new Date(ano, mes - 1).toLocaleString("pt-BR", { month: "long" });
  const periodo = `${mesNome}/${ano}`;
  const titulo = `Folha de ponto de ${periodo} — regularize os registros para assinar`;
  const corpo =
    `Olá,\n\n` +
    `A folha de ponto de ${periodo} ainda não pode ser fechada nem assinada. ` +
    `Há dias com registro inconsistente (iniciado e não completado) ou solicitações do mês em andamento.\n\n` +
    `Regularize esses registros para liberar a assinatura.\n\n` +
    `ATENÇÃO: depois de assinar, não será mais possível solicitar correção deste período.\n\n` +
    `Como regularizar\n\n` +
    `1. Acesse o sistema: ${urlHomeSistema()}\n` +
    `2. Abra Histórico e localize o mês da folha que precisa ser assinada (${periodo}).\n` +
    `3. Identifique os dias com status Inconsistente (destacados na tabela).\n` +
    `4. Para ajustar batidas (entrada, intervalo, saída ou retorno de pausa):\n` +
    `   Solicitações → Nova solicitação → Correção de ponto\n` +
    `   Selecione a data, informe os horários corretos e envie. A solicitação segue para o gestor.\n` +
    `5. Se a ausência for por atestado médico:\n` +
    `   Solicitações → Nova solicitação → Atestado médico\n` +
    `   Anexe o documento e informe o período.\n` +
    `6. Acompanhe em Solicitações → Minhas solicitações até a aprovação.\n` +
    `7. Volte ao Histórico, no mesmo mês. Quando todos os dias estiverem regularizados, o botão Assinar Quadro será liberado.\n\n` +
    `Regularize o quanto antes para não atrasar o fechamento da folha.`;
  return { titulo, corpo };
}

/** Metadados de autenticidade capturados no momento da assinatura. */
export interface SignatureMeta {
  /** IP real do PC do signatário (primeiro salto do X-Forwarded-For) */
  ipReal: string;
  /** IP da gateway de borda — peer imediato/último proxy que entregou a requisição */
  ipGateway: string | null;
  /** Navegador/dispositivo do signatário */
  userAgent: string | null;
}

// Carregamento defensivo — o backend sobe mesmo se pdfmake não estiver disponível
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PdfPrinter: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  PdfPrinter = require("pdfmake/src/printer");
} catch (e) {
  console.warn("[AssinaturaService] pdfmake não disponível — PDF desativado:", String(e));
}

const PDF_FONTS = getPdfFonts();

/**
 * Versão do layout da folha em PDF. Aumente a cada mudança visual: as folhas concluídas e AINDA
 * NÃO seladas são regeradas no próximo download; as seladas com ICP-Brasil nunca mudam.
 */
const VERSAO_LAYOUT_PDF = 5;

@Injectable()
export class AssinaturaService {
  private readonly logger = new Logger(AssinaturaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoriaService: AuditoriaService,
    private readonly notificacaoService: NotificacaoService,
    private readonly configSolicitacoesService: ConfigSolicitacoesService,
    private readonly seloIcpService: SeloIcpService
  ) {}

  /* ─── PDF final imutável, selo ICP-Brasil e verificação pública ─── */

  private get dirPdfFinal(): string {
    return join(process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads"), "folhas-finais");
  }

  private chaveSeloCache: Buffer | null = null;
  private textoOriginalCache = new Map<string, string[]>();

  /**
   * Chave secreta do selo das páginas (HMAC). DOC_SEAL_SECRET no ambiente ou, na falta, um
   * arquivo gerado uma única vez ao lado das folhas finais (persistido no volume).
   */
  private async chaveSeloDocumentos(): Promise<Buffer> {
    if (this.chaveSeloCache) return this.chaveSeloCache;
    const env = process.env.DOC_SEAL_SECRET?.trim();
    if (env) return (this.chaveSeloCache = Buffer.from(env, "utf8"));
    const arq = join(this.dirPdfFinal, "..", ".chave-selo-documentos");
    if (existsSync(arq)) return (this.chaveSeloCache = await readFile(arq));
    const nova = randomBytes(32);
    await mkdir(join(this.dirPdfFinal, ".."), { recursive: true });
    await writeFile(arq, nova, { mode: 0o600 });
    return (this.chaveSeloCache = nova);
  }

  /** Nº de registro: muda sempre que o conteúdo (impressão digital dos dados) muda. */
  private numeroRegistro(mes: number, ano: number, fingerprint: string): string {
    return `ESP-${ano}${String(mes).padStart(2, "0")}-${fingerprint.slice(0, 12).toUpperCase()}`;
  }

  /** Selo de uma página: só o sistema (com a chave) consegue gerar um par registro/página válido. */
  private seloPagina(chave: Buffer, registro: string, pagina: number, total: number): string {
    return createHmac("sha256", chave)
      .update(`${registro}|${pagina}|${total}`)
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();
  }

  /** Link e código de verificação (código = SHA-256 agrupado da assinatura do funcionário). */
  private montarVerificacao(a: {
    assinadoFuncionarioEm: Date | null;
    assinadoFuncionarioIp: string | null;
    matricula: string | null;
    periodo: string;
  }): VerificacaoDocumentoPdf {
    const seloAtivo = this.seloIcpService.status().configurado;
    if (!a.assinadoFuncionarioEm) return { url: null, codigo: null, seloAtivo };
    const codigo = groupCodigoAssinatura(
      computeQuadroSignatoryHash(
        a.matricula ?? "",
        a.periodo,
        a.assinadoFuncionarioEm,
        a.assinadoFuncionarioIp
      ),
      32
    );
    const base = (process.env.APP_BASE_URL ?? process.env.VITE_APP_BASE_URL ?? "").replace(
      /\/+$/,
      ""
    );
    return {
      url: `${base}/verificar/${normalizeCodigoAssinatura(codigo)}`,
      codigo,
      seloAtivo
    };
  }

  /**
   * PDF da folha: só gera um arquivo NOVO quando os dados do documento mudam. A impressão
   * digital (fingerprint) considera apenas o que aparece no PDF — dias, horas, saldos,
   * assinaturas, dados cadastrais e a versão do layout —, nunca o horário do download. Assim,
   * baixar de novo devolve o MESMO arquivo (mesmo SHA-256) e todas as cópias continuam válidas.
   * Quando os dados mudam, o arquivo anterior vai para o histórico (verificação o reconhece como
   * versão substituída). Arquivo selado com ICP-Brasil é definitivo.
   */
  async congelarPdfFinal(assinaturaId: string): Promise<Buffer> {
    const reg = await this.prisma.assinaturaQuadro.findUnique({
      where: { id: assinaturaId },
      select: {
        id: true,
        status: true,
        pdfFinalUrl: true,
        pdfFinalSha256: true,
        pdfFingerprint: true,
        pdfHistorico: true,
        seladoEm: true,
        criadoEm: true
      }
    });
    if (!reg) throw new NotFoundException("Assinatura não encontrada");
    const arquivoAtual = reg.pdfFinalUrl ? join(this.dirPdfFinal, reg.pdfFinalUrl) : null;
    if (reg.seladoEm && arquivoAtual && existsSync(arquivoAtual)) return readFile(arquivoAtual);

    const { input, fingerprint } = await this.montarEntradaPdfQuadro(assinaturaId);
    if (reg.pdfFingerprint === fingerprint && arquivoAtual && existsSync(arquivoAtual)) {
      return readFile(arquivoAtual);
    }

    /* Dados mudaram (ou 1ª emissão): gera, sela se concluída e guarda. */
    let pdf = await this.renderizarPdfQuadro(input);
    let selado: { selado: boolean; serial?: string } = { selado: false };
    if (reg.status === "CONCLUIDA") {
      const cfg = await this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: { nome: true }
      });
      const r = await this.seloIcpService.selarPdf(pdf, {
        razaoSocial: cfg?.nome ?? "Conselho Federal de Odontologia"
      });
      pdf = r.pdf;
      selado = r;
    }
    await mkdir(this.dirPdfFinal, { recursive: true });
    const nome = `${assinaturaId}-${fingerprint.slice(0, 16)}.pdf`;
    await writeFile(join(this.dirPdfFinal, nome), pdf);

    const historico = Array.isArray(reg.pdfHistorico)
      ? (reg.pdfHistorico as Array<Record<string, unknown>>)
      : [];
    if (reg.pdfFinalSha256) {
      historico.push({
        sha256: reg.pdfFinalSha256,
        fingerprint: reg.pdfFingerprint,
        arquivo: reg.pdfFinalUrl,
        substituidoEm: new Date().toISOString()
      });
    }
    await this.prisma.assinaturaQuadro.update({
      where: { id: assinaturaId },
      data: {
        pdfFinalUrl: nome,
        pdfFinalSha256: createHash("sha256").update(pdf).digest("hex"),
        pdfFingerprint: fingerprint,
        pdfHistorico: historico as unknown as Prisma.InputJsonValue,
        seladoEm: selado.selado ? new Date() : null,
        seloSerial: selado.selado ? (selado.serial ?? null) : null
      }
    });
    /* O arquivo substituído não é mais servido: fica só o hash no histórico. */
    if (arquivoAtual && reg.pdfFinalUrl !== nome) await unlink(arquivoAtual).catch(() => {});
    return pdf;
  }

  /** Estado do selo ICP-Brasil (e-CNPJ A1) para Configurações — sem expor senha. */
  statusSeloIcp() {
    return this.seloIcpService.status();
  }

  /** Todo dia: avisa o RH quando o e-CNPJ A1 está a 60/30/7 dias do vencimento (ou vencido). */
  @Cron("30 7 * * *", { timeZone: "America/Sao_Paulo" })
  async avisarVencimentoSeloIcp() {
    try {
      const st = this.seloIcpService.status();
      if (!st.validadeAte) return;
      const dias = Math.ceil((new Date(st.validadeAte).getTime() - Date.now()) / 86_400_000);
      if (![60, 30, 15, 7, 3, 1, 0].includes(dias) && dias > 0) return;
      const rh = await this.notificacaoService.getUsuariosRh();
      if (!rh.length) return;
      await this.notificacaoService.dispararEvento(
        "SELO_ICP_VENCENDO",
        dias <= 0
          ? "Certificado e-CNPJ A1 VENCIDO"
          : `Certificado e-CNPJ A1 vence em ${dias} dia(s)`,
        `O certificado e-CNPJ A1 usado no selo ICP-Brasil dos documentos ` +
          `${dias <= 0 ? "venceu" : `vence em ${dias} dia(s)`} (${st.validadeAte.slice(0, 10)}). ` +
          "Renove e substitua o arquivo .pfx no servidor para que os documentos continuem selados.",
        rh
      );
    } catch (e) {
      this.logger.error(`Falha ao avisar vencimento do selo ICP: ${(e as Error).message}`);
    }
  }

  /** Consulta pública pelo PRÓPRIO ARQUIVO: localiza a folha pelo SHA-256 do PDF enviado. */
  async verificarArquivoPublico(sha256Raw: string) {
    const sha256 = (sha256Raw ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new BadRequestException("Arquivo inválido para conferência.");
    }
    /* Arquivo vigente ou versão anterior (histórico) da mesma folha. */
    const anterior = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "AssinaturaQuadro"
      WHERE "pdfHistorico" @> ${JSON.stringify([{ sha256 }])}::jsonb
      LIMIT 1`;
    const reg = await this.prisma.assinaturaQuadro.findFirst({
      where: anterior.length ? { id: anterior[0].id } : { pdfFinalSha256: sha256 },
      select: {
        assinadoFuncionarioEm: true,
        assinadoFuncionarioIp: true,
        periodo: { select: { mes: true, ano: true, funcionario: { select: { matricula: true } } } }
      }
    });
    if (!reg) return { encontrado: false, arquivoNaoReconhecido: true };
    const { codigo } = this.montarVerificacao({
      assinadoFuncionarioEm: reg.assinadoFuncionarioEm,
      assinadoFuncionarioIp: reg.assinadoFuncionarioIp,
      matricula: reg.periodo.funcionario.matricula,
      periodo: `${reg.periodo.mes}/${reg.periodo.ano}`
    });
    if (!codigo) return { encontrado: false, arquivoNaoReconhecido: true };
    return {
      ...(await this.verificarDocumentoPublico(codigo, sha256)),
      codigo: normalizeCodigoAssinatura(codigo)
    };
  }

  /** Consulta pública (sem login): dados mínimos e situação do documento. */
  async verificarDocumentoPublico(
    codigoRaw: string,
    sha256Arquivo?: string,
    qr?: { r?: string; p?: string; t?: string; s?: string }
  ) {
    const codigo = normalizeCodigoAssinatura(codigoRaw ?? "");
    if (codigo.length < 16) {
      throw new BadRequestException("Informe o código de verificação completo.");
    }
    const achados = await this.buscarPorCodigoAssinatura(codigo);
    const lista = achados.encontrados;
    const item = lista.find((x) => x.tipo === "QUADRO_MENSAL") as
      | {
          id: string;
          papel: string;
          assinadoEm: string | null;
          periodo?: { mes: number; ano: number };
          funcionarioNome: string;
          matricula: string | null;
          status?: string;
        }
      | undefined;
    if (!item) return { encontrado: false };

    const reg = await this.prisma.assinaturaQuadro.findUnique({
      where: { id: item.id },
      select: {
        status: true,
        pdfFinalSha256: true,
        pdfFingerprint: true,
        pdfHistorico: true,
        seladoEm: true,
        assinadoFuncionarioEm: true,
        assinadoGestorEm: true
      }
    });
    const versaoAnterior =
      sha256Arquivo && Array.isArray(reg?.pdfHistorico)
        ? ((reg!.pdfHistorico as Array<{ sha256?: string; substituidoEm?: string }>).find(
            (h) => h.sha256?.toLowerCase() === sha256Arquivo.toLowerCase()
          ) ?? null)
        : null;
    /* QR da página: registro + página + total, com selo HMAC do sistema. */
    let registro: {
      vigente: string | null;
      informado: string | null;
      situacao: "VIGENTE" | "ANTERIOR" | "DESCONHECIDO" | "SELO_INVALIDO" | null;
      pagina: number | null;
      total: number | null;
    } | null = null;
    if (item.periodo && reg?.pdfFingerprint) {
      const { mes, ano } = item.periodo;
      const vigente = this.numeroRegistro(mes, ano, reg.pdfFingerprint);
      registro = { vigente, informado: null, situacao: null, pagina: null, total: null };
      if (qr?.r) {
        const p = Number(qr.p);
        const t = Number(qr.t);
        const chave = await this.chaveSeloDocumentos();
        const seloOk =
          Number.isInteger(p) &&
          Number.isInteger(t) &&
          (qr.s ?? "").toUpperCase() === this.seloPagina(chave, qr.r, p, t);
        const anteriores = (
          Array.isArray(reg.pdfHistorico)
            ? (reg.pdfHistorico as Array<{ fingerprint?: string }>)
            : []
        )
          .filter((h) => h.fingerprint)
          .map((h) => this.numeroRegistro(mes, ano, h.fingerprint!));
        registro = {
          vigente,
          informado: qr.r,
          pagina: Number.isInteger(p) ? p : null,
          total: Number.isInteger(t) ? t : null,
          situacao: !seloOk
            ? "SELO_INVALIDO"
            : qr.r === vigente
              ? "VIGENTE"
              : anteriores.includes(qr.r)
                ? "ANTERIOR"
                : "DESCONHECIDO"
        };
      }
    }
    const mascarar = (nome: string) =>
      nome
        .split(" ")
        .filter(Boolean)
        .map((p, i) => (i === 0 ? p : `${p[0]}.`))
        .join(" ");
    const mat = item.matricula ?? "";
    return {
      encontrado: true,
      documento: "Espelho de Ponto Eletrônico (folha mensal)",
      competencia: item.periodo
        ? `${String(item.periodo.mes).padStart(2, "0")}/${item.periodo.ano}`
        : null,
      funcionario: mascarar(item.funcionarioNome),
      matricula: mat.length > 2 ? `${"*".repeat(mat.length - 2)}${mat.slice(-2)}` : "**",
      situacao: reg?.status ?? item.status ?? null,
      assinaturas: {
        funcionarioEm: reg?.assinadoFuncionarioEm?.toISOString() ?? null,
        gestorEm: reg?.assinadoGestorEm?.toISOString() ?? null
      },
      arquivo: {
        sha256: reg?.pdfFinalSha256 ?? null,
        conferido:
          sha256Arquivo && reg?.pdfFinalSha256
            ? sha256Arquivo.toLowerCase() === reg.pdfFinalSha256.toLowerCase()
            : null,
        /* O arquivo enviado é uma versão anterior autêntica, substituída por mudança nos dados. */
        versaoAnterior: versaoAnterior
          ? { substituidoEm: versaoAnterior.substituidoEm ?? null }
          : null
      },
      seloIcpBrasil: { aplicado: !!reg?.seladoEm, em: reg?.seladoEm?.toISOString() ?? null },
      registro
    };
  }

  /**
   * Conferência AUTOMÁTICA do conteúdo: o navegador extrai o texto do PDF enviado (ou lê a foto
   * por OCR) e o sistema compara com o original arquivado. Aponta as linhas que não existem no
   * original — sem revelar os valores originais (LGPD).
   */
  async compararConteudoPublico(body: {
    codigo?: string;
    registro?: string;
    linhas?: string[];
    origem?: "pdf" | "ocr";
  }) {
    const linhas = (Array.isArray(body.linhas) ? body.linhas : [])
      .slice(0, 3000)
      .map((l) => String(l ?? "").slice(0, 500))
      .filter((l) => l.trim());
    if (!linhas.length) throw new BadRequestException("Não foi possível ler o texto do arquivo.");
    const origem = body.origem === "ocr" ? "ocr" : "pdf";

    /* 1. Qual documento: nº de registro (lido do arquivo) ou código. */
    const registroLido =
      body.registro?.trim().toUpperCase() ||
      linhas
        .join(" ")
        .toUpperCase()
        .match(/ESP-\d{6}-[0-9A-F]{12}/)?.[0] ||
      null;
    let assinaturaId: string | null = null;
    if (registroLido) {
      const fp12 = registroLido.slice(-12).toLowerCase();
      const atual = await this.prisma.assinaturaQuadro.findFirst({
        where: { pdfFingerprint: { startsWith: fp12 } },
        select: { id: true }
      });
      if (atual) assinaturaId = atual.id;
      else {
        const comHistorico = await this.prisma.assinaturaQuadro.findMany({
          where: { pdfHistorico: { not: Prisma.AnyNull } },
          select: { id: true, pdfHistorico: true }
        });
        const anterior = comHistorico.find((a) =>
          (a.pdfHistorico as Array<{ fingerprint?: string }>).some((h) =>
            h.fingerprint?.startsWith(fp12)
          )
        );
        if (anterior) {
          return {
            encontrado: true,
            registro: registroLido,
            veredito: "VERSAO_ANTERIOR" as const,
            divergencias: [],
            linhasRemovidas: 0
          };
        }
      }
    }
    if (!assinaturaId && body.codigo) {
      const achados = await this.buscarPorCodigoAssinatura(normalizeCodigoAssinatura(body.codigo));
      assinaturaId = achados.encontrados.find((x) => x.tipo === "QUADRO_MENSAL")?.id ?? null;
    }
    if (!assinaturaId) {
      return {
        encontrado: false,
        registro: registroLido,
        veredito: "NAO_IDENTIFICADO" as const,
        divergencias: [],
        linhasRemovidas: 0
      };
    }

    /* 2. Texto do original arquivado (mesma extração usada no navegador). */
    const original = await this.congelarPdfFinal(assinaturaId);
    const shaOrig = createHash("sha256").update(original).digest("hex");
    let linhasOrig = this.textoOriginalCache.get(shaOrig);
    if (!linhasOrig) {
      linhasOrig = await extrairLinhasPdf(original);
      this.textoOriginalCache.set(shaOrig, linhasOrig);
    }
    const compactoOrig = linhasOrig.map(normalizarTexto).join("");
    const reg = await this.prisma.assinaturaQuadro.findUnique({
      where: { id: assinaturaId },
      select: { pdfFingerprint: true, periodo: { select: { mes: true, ano: true } } }
    });
    const registroVigente = reg?.pdfFingerprint
      ? this.numeroRegistro(reg.periodo.mes, reg.periodo.ano, reg.pdfFingerprint)
      : null;

    /* 3. Comparação. */
    const divergencias: Array<{ linha: string; trechos?: string[] }> = [];
    let linhasRemovidas = 0;
    if (origem === "pdf") {
      for (const l of linhas) {
        const n = normalizarTexto(l);
        if (n.length < 4) continue;
        if (!compactoOrig.includes(n)) divergencias.push({ linha: l.trim() });
      }
      /* Linhas de dia do original que sumiram do arquivo enviado. */
      const compactoEnviado = linhas.map(normalizarTexto).join("");
      linhasRemovidas = linhasOrig.filter(
        (l) =>
          /^\d{2}\/\d{2}\/\d{4}/.test(l.trim()) && !compactoEnviado.includes(normalizarTexto(l))
      ).length;
    } else {
      /* OCR: compara datas, horários e durações linha a linha (tolerante ao resto do texto). */
      const todosOrig = new Set(linhasOrig.flatMap(tokensNumericos));
      for (const l of linhas) {
        const tokens = tokensNumericos(l);
        if (!tokens.length) continue;
        const data = tokens.find((t) => /\d{2}\/\d{2}\/\d{4}/.test(t));
        const referencia = data
          ? new Set(linhasOrig.filter((o) => o.includes(data)).flatMap(tokensNumericos))
          : todosOrig;
        const extras = tokens.filter((t) => !referencia.has(t));
        if (extras.length) divergencias.push({ linha: l.trim(), trechos: extras });
      }
    }

    const veredito =
      registroLido && registroVigente && registroLido !== registroVigente
        ? ("VERSAO_ANTERIOR" as const)
        : divergencias.length || linhasRemovidas
          ? origem === "pdf"
            ? ("ADULTERADO" as const)
            : ("DIVERGENCIAS" as const)
          : ("CONFERE" as const);
    return {
      encontrado: true,
      registro: registroVigente,
      veredito,
      divergencias: divergencias.slice(0, 50),
      totalDivergencias: divergencias.length,
      linhasRemovidas
    };
  }

  /* ─── Cron: 00:05 (Brasília) do 1º de cada mês → gera o mês anterior, já encerrado ─── */

  @Cron("5 0 1 * *", { timeZone: "America/Sao_Paulo" })
  async criarAssinaturasAutomaticas() {
    const [anoHoje, mesHoje] = hojeBrasiliaISO().split("-").map(Number);
    const mes = mesHoje === 1 ? 12 : mesHoje - 1;
    const ano = mesHoje === 1 ? anoHoje - 1 : anoHoje;
    this.logger.log(`Cron: criando assinaturas para ${mes}/${ano}`);
    const { criadas, ignoradas, naoAptos } = await this.criarAssinaturasMensais(mes, ano);
    this.logger.log(
      `Assinaturas criadas: ${criadas}, já existiam: ${ignoradas}, fora dos critérios: ${naoAptos}`
    );
  }

  /* ─── Elegibilidade (prévia do RH e geração) ─── */

  /**
   * Quem pode receber a assinatura do quadro de um mês:
   * - o mês precisa estar encerrado (verificado em criarAssinaturasMensais/prévia);
   * - funcionário ativo;
   * - admitido até o fim do mês e com primeiro acesso ao sistema até o fim do mês;
   * - com obrigação de ponto em ao menos um dia do mês (isentos o mês todo ficam de fora);
   * - não cedido a outro órgão durante o mês inteiro.
   * Folha com dias Inconsistentes continua apta: a regularização é exigida na assinatura.
   */
  async avaliarElegibilidadeMes(mes: number, ano: number): Promise<ElegibilidadeAssinatura[]> {
    const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fim = somarDiasCivil(
      `${mes === 12 ? ano + 1 : ano}-${String(mes === 12 ? 1 : mes + 1).padStart(2, "0")}-01`,
      -1
    );
    const funcionarios = await this.prisma.funcionario.findMany({
      where: { ativo: true },
      orderBy: { user: { name: "asc" } },
      select: {
        id: true,
        matricula: true,
        categoria: true,
        isManager: true,
        isFiscal: true,
        registroPontoObrigatorio: true,
        pontoObrigatorioDesde: true,
        dataAdmissao: true,
        gerenciaId: true,
        gerencia: { select: { nome: true, sigla: true } },
        user: { select: { name: true, primeiroLoginEm: true } },
        periodos: {
          where: { mes, ano },
          select: { assinatura: { select: { status: true } } }
        }
      }
    });

    const fmt = (iso: string) => iso.split("-").reverse().join("/");
    const out: ElegibilidadeAssinatura[] = [];
    for (const f of funcionarios) {
      const base = {
        funcionarioId: f.id,
        nome: f.user.name,
        matricula: f.matricula,
        categoria: f.categoria,
        gerenciaId: f.gerenciaId,
        gerencia: f.gerencia?.sigla || f.gerencia?.nome || null,
        aviso: null as string | null
      };
      const naoApto = (motivo: string) => out.push({ ...base, situacao: "NAO_APTO", motivo });

      const assinaturaExistente = f.periodos[0]?.assinatura;
      if (assinaturaExistente) {
        out.push({
          ...base,
          situacao: "JA_POSSUI",
          motivo: `Já possui assinatura neste mês (${assinaturaExistente.status})`
        });
        continue;
      }

      const admissao = f.dataAdmissao ? dataCivilISO(f.dataAdmissao) : null;
      if (admissao && admissao > fim) {
        naoApto(`Admitido após o mês (${fmt(admissao)})`);
        continue;
      }

      const primeiroAcesso = inicioAtividadesUsuario(f.user);
      if (primeiroAcesso > fim) {
        naoApto(
          f.user.primeiroLoginEm
            ? `Primeiro acesso ao sistema após o mês (${fmt(primeiroAcesso)})`
            : "Nunca acessou o sistema"
        );
        continue;
      }

      const historicoCat = await ensureCategoriaHistorico(this.prisma, f.id);
      /* Mesma regra do banco de horas, dia a dia (inclui dias antes da 1ª vigência). */
      const optsObrigacao = {
        historico: historicoCat,
        pontoObrigatorioDesde: f.pontoObrigatorioDesde
          ? dataCivilISO(f.pontoObrigatorioDesde)
          : null,
        categoriaAtual: f.categoria,
        isManagerAtual: f.isManager,
        isFiscalAtual: f.isFiscal,
        registroPontoObrigatorioAtual: f.registroPontoObrigatorio
      };
      let algumDiaComObrigacao = false;
      for (let dia = ini; dia <= fim; dia = somarDiasCivil(dia, 1)) {
        if (!diaSemObrigacaoPonto(dia, optsObrigacao)) {
          algumDiaComObrigacao = true;
          break;
        }
      }
      if (!algumDiaComObrigacao) {
        naoApto("Sem obrigação de ponto no mês (isento — Comissionado/Chefe/Assessor)");
        continue;
      }

      const cessoes = await periodosCessao(this.prisma, f.id);
      if (cobreMesInteiro(cessoes, ini, fim)) {
        naoApto("Cedido a outro órgão durante todo o mês");
        continue;
      }

      out.push({
        ...base,
        situacao: "APTO",
        motivo: null,
        aviso: cessoes.some((c) => sobrepoe(c, ini, fim))
          ? "Cedido em parte do mês (dias da cessão ficam neutros)"
          : null
      });
    }
    return out;
  }

  /** Prévia para o modal do RH: elegibilidade de cada funcionário ativo. */
  async previaAssinaturasMes(mes: number, ano: number) {
    return {
      mes,
      ano,
      mesEncerrado: this.mesEncerrado(mes, ano),
      funcionarios: await this.avaliarElegibilidadeMes(mes, ano)
    };
  }

  private mesEncerrado(mes: number, ano: number) {
    const [anoHoje, mesHoje] = hojeBrasiliaISO().split("-").map(Number);
    return ano < anoHoje || (ano === anoHoje && mes < mesHoje);
  }

  /* ─── Criação batch (cron ou disparo manual pelo RH) ─── */

  async criarAssinaturasMensais(
    mes: number,
    ano: number,
    /** Seleção manual do RH (subconjunto dos aptos). Ausente = todos os aptos. */
    funcionarioIds?: string[]
  ): Promise<{ criadas: number; ignoradas: number; naoAptos: number }> {
    if (!this.mesEncerrado(mes, ano)) {
      throw new BadRequestException("Assinaturas só podem ser geradas para meses já encerrados.");
    }
    const elegibilidade = await this.avaliarElegibilidadeMes(mes, ano);
    const selecionados = funcionarioIds ? new Set(funcionarioIds) : null;
    const alvo = elegibilidade.filter((e) => !selecionados || selecionados.has(e.funcionarioId));
    const aptosIds = alvo.filter((e) => e.situacao === "APTO").map((e) => e.funcionarioId);
    const naoAptos = alvo.filter((e) => e.situacao === "NAO_APTO").length;

    const funcionarios = await this.prisma.funcionario.findMany({
      where: { id: { in: aptosIds } },
      select: { id: true, user: { select: { externalId: true, email: true, emailReal: true } } }
    });

    let criadas = 0;
    let ignoradas = 0;

    for (const func of funcionarios) {
      try {
        // Garante que o PeriodoPonto existe
        const periodo = await this.prisma.periodoPonto.upsert({
          where: { funcionarioId_mes_ano: { funcionarioId: func.id, mes, ano } },
          create: { funcionarioId: func.id, mes, ano },
          update: {}
        });

        // Calcula saldo do banco de horas (snapshot)
        let bancoHorasSaldoTotalMinutos = 0;
        try {
          const bh = await this.auditoriaService.getBancoHorasFuncionario(func.id);
          bancoHorasSaldoTotalMinutos = bh.saldoAtualMinutos ?? 0;
        } catch {
          // Falha no cálculo não deve bloquear a criação
        }

        const existente = await this.prisma.assinaturaQuadro.findUnique({
          where: { periodoId: periodo.id }
        });

        if (existente) {
          ignoradas++;
          continue;
        }

        await this.prisma.assinaturaQuadro.create({
          data: {
            periodoId: periodo.id,
            bancoHorasSaldoTotalMinutos,
            criadoPor: "SISTEMA"
          }
        });
        criadas++;

        // Notifica o funcionário para assinar o quadro
        this.dispararNotificacaoAssinarQuadro(func, mes, ano).catch((e) =>
          this.logger.error(`Falha ao notificar ASSINAR_QUADRO para funcionário ${func.id}: ${e}`)
        );
      } catch (err) {
        this.logger.error(`Erro ao criar assinatura para funcionário ${func.id}: ${err}`);
      }
    }

    ignoradas += alvo.filter((e) => e.situacao === "JA_POSSUI").length;
    return { criadas, ignoradas, naoAptos };
  }

  /* ─── Busca assinatura do funcionário (por keycloakSub) — com lazy creation ─── */

  /**
   * A folha guarda um resumo (dias trabalhados, horas e banco total) gravado na criação; ele
   * envelhece com correções, atestados e abonos aprovados depois. Enquanto não concluída, a folha
   * é recalculada com a conta atual (a mesma do PDF e da página Banco de Horas) e o resumo gravado
   * é atualizado. Folha concluída mantém o que foi assinado.
   */
  private async atualizarResumoFolha<
    T extends {
      id: string;
      status: string;
      bancoHorasSaldoTotalMinutos: number;
      periodo: {
        id: string;
        funcionarioId: string;
        mes: number;
        ano: number;
        diasTrabalhados: number;
        horasTrabalhadasMinutos: number;
      };
    }
  >(a: T, relatorioPronto?: RelatorioQuadroMensal): Promise<T> {
    if (a.status === "CONCLUIDA" || a.status === "DISPENSADA") return a;
    try {
      const { funcionarioId, mes, ano } = a.periodo;
      const montado = await this.montarRelatorioParaPdf(funcionarioId, mes, ano);
      const relatorio = relatorioPronto ?? montado.relatorio;
      const cat =
        (
          await this.prisma.funcionario.findUnique({
            where: { id: funcionarioId },
            select: { categoria: true }
          })
        )?.categoria ?? null;
      const badges = await this.montarResumoBadgesPdf(
        funcionarioId,
        cat,
        mes,
        ano,
        relatorio,
        montado.bancoMes
      );
      const saldo = badges.totalAcumuladoMinutos;
      if (
        a.periodo.diasTrabalhados !== relatorio.diasTrabalhados ||
        a.periodo.horasTrabalhadasMinutos !== relatorio.horasTrabalhadasMinutos
      ) {
        await this.prisma.periodoPonto.update({
          where: { id: a.periodo.id },
          data: {
            diasTrabalhados: relatorio.diasTrabalhados,
            horasTrabalhadasMinutos: relatorio.horasTrabalhadasMinutos
          }
        });
        a.periodo.diasTrabalhados = relatorio.diasTrabalhados;
        a.periodo.horasTrabalhadasMinutos = relatorio.horasTrabalhadasMinutos;
      }
      if (saldo !== a.bancoHorasSaldoTotalMinutos) {
        await this.prisma.assinaturaQuadro.update({
          where: { id: a.id },
          data: { bancoHorasSaldoTotalMinutos: saldo }
        });
        a.bancoHorasSaldoTotalMinutos = saldo;
      }
    } catch (e) {
      this.logger.warn(`atualizarResumoFolha(${a.id}): ${String(e)}`);
    }
    return a;
  }

  async getAssinaturaFuncionario(keycloakSub: string, mes?: number, ano?: number) {
    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) throw new NotFoundException("Usuário não encontrado");

    const func = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });
    if (!func) throw new NotFoundException("Funcionário não encontrado");

    // Se um mês/ano específico foi solicitado e é um mês passado, cria a assinatura se não existir
    if (mes && ano) {
      const agora = new Date();
      const mesAtual = agora.getMonth() + 1;
      const anoAtual = agora.getFullYear();
      const eMesPassado = ano < anoAtual || (ano === anoAtual && mes < mesAtual);

      if (eMesPassado) {
        const periodo = await this.prisma.periodoPonto.upsert({
          where: { funcionarioId_mes_ano: { funcionarioId: func.id, mes, ano } },
          create: { funcionarioId: func.id, mes, ano },
          update: {}
        });

        const existente = await this.prisma.assinaturaQuadro.findUnique({
          where: { periodoId: periodo.id }
        });

        if (!existente) {
          let bancoHorasSaldoTotalMinutos = 0;
          try {
            const bh = await this.auditoriaService.getBancoHorasFuncionario(func.id);
            bancoHorasSaldoTotalMinutos = bh.saldoAtualMinutos ?? 0;
          } catch {
            // ignora falha no BH
          }

          await this.prisma.assinaturaQuadro.create({
            data: { periodoId: periodo.id, bancoHorasSaldoTotalMinutos, criadoPor: "SISTEMA" }
          });
        }
      }
    }

    const where: Record<string, unknown> = { periodo: { funcionarioId: func.id } };
    if (mes || ano) {
      where.periodo = {
        funcionarioId: func.id,
        ...(mes ? { mes } : {}),
        ...(ano ? { ano } : {})
      };
    }

    const lista = await this.prisma.assinaturaQuadro.findMany({
      where,
      include: { periodo: true },
      orderBy: { criadoEm: "desc" }
    });

    return Promise.all(
      lista.map(async (itemGravado) => {
        const item = await this.atualizarResumoFolha(itemGravado);
        const avaliacao = await this.avaliarSaldoFolha(
          item.periodo.funcionarioId,
          item.periodo.mes,
          item.periodo.ano
        );
        return {
          ...item,
          saldoRegularizado: avaliacao.saldoRegularizado,
          pendencias: avaliacao.pendencias
        };
      })
    );
  }

  /**
   * Lista (e cria sob demanda) assinaturas mensais de um ciclo encerrado
   * do banco de horas. Só inclui meses já fechados (mesma regra do Histórico):
   * a folha mensal não se assina enquanto o mês civil ainda está em curso,
   * mesmo que a data marco tenha cortado o ciclo no meio do mês.
   */
  async listarAssinaturasCicloBancoHoras(keycloakSub: string, inicioIso: string, fimIso: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioIso) || !/^\d{4}-\d{2}-\d{2}$/.test(fimIso)) {
      throw new BadRequestException("Informe inicio e fim no formato YYYY-MM-DD.");
    }
    if (inicioIso > fimIso) {
      throw new BadRequestException("O início do ciclo deve ser anterior ou igual ao fim.");
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    const func = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });
    if (!func) throw new NotFoundException("Funcionário não encontrado");

    const hojeIso = hojeBrasiliaISO();
    const [anoHoje, mesHoje] = hojeIso.split("-").map(Number);

    const meses: { mes: number; ano: number }[] = [];
    let [y, m] = inicioIso.slice(0, 7).split("-").map(Number);
    const [yFim, mFim] = fimIso.slice(0, 7).split("-").map(Number);
    while (y < yFim || (y === yFim && m <= mFim)) {
      const eMesPassado = y < anoHoje || (y === anoHoje && m < mesHoje);
      if (eMesPassado) meses.push({ mes: m, ano: y });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }

    let bancoHorasSaldoTotalMinutos = 0;
    try {
      const bh = await this.auditoriaService.getBancoHorasFuncionario(func.id);
      bancoHorasSaldoTotalMinutos = bh.saldoAtualMinutos ?? 0;
    } catch {
      /* ignora */
    }

    const itens = [];
    for (const { mes, ano } of meses) {
      const periodo = await this.prisma.periodoPonto.upsert({
        where: { funcionarioId_mes_ano: { funcionarioId: func.id, mes, ano } },
        create: { funcionarioId: func.id, mes, ano },
        update: {}
      });

      let assinatura = await this.prisma.assinaturaQuadro.findUnique({
        where: { periodoId: periodo.id },
        include: { periodo: true }
      });

      if (!assinatura) {
        assinatura = await this.prisma.assinaturaQuadro.create({
          data: {
            periodoId: periodo.id,
            bancoHorasSaldoTotalMinutos,
            criadoPor: "BANCO_HORAS_CICLO"
          },
          include: { periodo: true }
        });
      }

      const avaliacao = await this.avaliarSaldoFolha(func.id, mes, ano);
      const relatorio =
        avaliacao.relatorio ?? (await this.montarRelatorioParaPdf(func.id, mes, ano)).relatorio;
      assinatura = await this.atualizarResumoFolha(assinatura, relatorio);
      const diasOk = relatorio.dias.filter((d) => d.statusInterno === "OK").length;
      itens.push({
        ...assinatura,
        saldoRegularizado: avaliacao.saldoRegularizado,
        pendencias: avaliacao.pendencias,
        /** Mesmos números do PDF da folha (mês civil completo). */
        folhaResumo: {
          diasOk,
          diasTrabalhados: relatorio.diasTrabalhados,
          horasTrabalhadasMinutos: relatorio.horasTrabalhadasMinutos,
          saldoMinutos: relatorio.saldoMinutos
        }
      });
    }

    return itens;
  }

  /**
   * Assinatura do relatório do ciclo de banco de horas (somente funcionário).
   * Exige que todos os meses civis do intervalo estejam fechados e com folha CONCLUIDA
   * (funcionário + chefe da área).
   */
  async assinarCicloBancoHoras(
    keycloakSub: string,
    inicioIso: string,
    fimIso: string,
    meta: SignatureMeta
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioIso) || !/^\d{4}-\d{2}-\d{2}$/.test(fimIso)) {
      throw new BadRequestException("Informe inicio e fim no formato YYYY-MM-DD.");
    }
    if (inicioIso > fimIso) {
      throw new BadRequestException("O início do ciclo deve ser anterior ou igual ao fim.");
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) throw new ForbiddenException("Usuário não encontrado");
    const func = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });
    if (!func) throw new ForbiddenException("Funcionário não encontrado");

    const existente = await this.prisma.assinaturaCicloBancoHoras.findUnique({
      where: {
        funcionarioId_inicioIso_fimIso: {
          funcionarioId: func.id,
          inicioIso,
          fimIso
        }
      }
    });
    if (existente) {
      throw new BadRequestException("Este ciclo já foi assinado.");
    }

    const meses = this.mesesNoIntervalo(inicioIso, fimIso);
    const hojeIso = hojeBrasiliaISO();
    const mesAtualPrefix = hojeIso.slice(0, 7);

    for (const { mes, ano } of meses) {
      const yyyyMM = `${ano}-${String(mes).padStart(2, "0")}`;
      if (yyyyMM >= mesAtualPrefix) {
        throw new BadRequestException(
          `Não é possível assinar o ciclo enquanto ${yyyyMM} aguarda o fechamento do mês.`
        );
      }
    }

    const folhas = await this.listarAssinaturasCicloBancoHoras(keycloakSub, inicioIso, fimIso);
    if (folhas.length !== meses.length) {
      throw new BadRequestException(
        "Assine todas as folhas mensais do ciclo (funcionário e chefe da área) antes de assinar o ciclo."
      );
    }
    const pendentes = folhas.filter((a) => a.status !== "CONCLUIDA");
    if (pendentes.length > 0) {
      throw new BadRequestException(
        "Há folhas mensais pendentes de assinatura (funcionário ou chefe da área). " +
          "Conclua todas antes de assinar o ciclo."
      );
    }

    /* Saldo do ciclo = acumulado do banco no fim do ciclo (mesma conta da página). */
    const saldoCicloMinutos = (
      await this.auditoriaService.bancoHorasDoIntervalo(func.id, inicioIso, fimIso)
    ).saldoFinalMinutos;

    return this.prisma.assinaturaCicloBancoHoras.create({
      data: {
        funcionarioId: func.id,
        inicioIso,
        fimIso,
        saldoCicloMinutos,
        assinadoEm: new Date(),
        assinadoIp: meta.ipReal,
        assinadoIpGateway: meta.ipGateway,
        assinadoUserAgent: meta.userAgent,
        assinadoUserId: keycloakSub
      }
    });
  }

  async obterAssinaturaCicloBancoHoras(keycloakSub: string, inicioIso: string, fimIso: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioIso) || !/^\d{4}-\d{2}-\d{2}$/.test(fimIso)) {
      throw new BadRequestException("Informe inicio e fim no formato YYYY-MM-DD.");
    }
    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    const func = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });
    if (!func) throw new NotFoundException("Funcionário não encontrado");

    return this.prisma.assinaturaCicloBancoHoras.findUnique({
      where: {
        funcionarioId_inicioIso_fimIso: {
          funcionarioId: func.id,
          inicioIso,
          fimIso
        }
      }
    });
  }

  private mesesNoIntervalo(inicioIso: string, fimIso: string): { mes: number; ano: number }[] {
    const meses: { mes: number; ano: number }[] = [];
    let [y, m] = inicioIso.slice(0, 7).split("-").map(Number);
    const [yFim, mFim] = fimIso.slice(0, 7).split("-").map(Number);
    while (y < yFim || (y === yFim && m <= mFim)) {
      meses.push({ mes: m, ano: y });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return meses;
  }

  /* ─── Funcionário assina ─── */

  async assinarFuncionario(assinaturaId: string, keycloakSub: string, meta: SignatureMeta) {
    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) throw new ForbiddenException("Usuário não encontrado");

    const func = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });
    if (!func) throw new ForbiddenException("Funcionário não encontrado");

    const assinatura = await this.prisma.assinaturaQuadro.findUnique({
      where: { id: assinaturaId },
      include: { periodo: true }
    });

    if (!assinatura) throw new NotFoundException("Assinatura não encontrada");
    if (assinatura.periodo.funcionarioId !== func.id)
      throw new ForbiddenException("Esta assinatura não pertence ao seu quadro");
    if (assinatura.status !== "PENDENTE_FUNCIONARIO")
      throw new BadRequestException(
        `Status atual (${assinatura.status}) não permite assinatura do funcionário`
      );

    const hojeIso = hojeBrasiliaISO();
    const [anoHoje, mesHoje] = hojeIso.split("-").map(Number);
    const { mes, ano } = assinatura.periodo;
    const eMesPassado = ano < anoHoje || (ano === anoHoje && mes < mesHoje);
    if (!eMesPassado) {
      throw new BadRequestException(
        "A folha de ponto mensal só pode ser assinada após o fechamento do mês."
      );
    }

    const avaliacao = await this.avaliarSaldoFolha(
      func.id,
      assinatura.periodo.mes,
      assinatura.periodo.ano
    );
    if (!avaliacao.saldoRegularizado) {
      throw new BadRequestException({
        message:
          `A folha de ponto ainda não pode ser assinada — ${textoPendenciasFolha(avaliacao.pendencias)}. ` +
          "Depois de assinar, não será mais possível solicitar correção deste período.",
        pendencias: avaliacao.pendencias
      });
    }

    let bancoHorasSaldoTotalMinutos = assinatura.bancoHorasSaldoTotalMinutos;
    try {
      const { relatorio, bancoMes } = await this.montarRelatorioParaPdf(
        func.id,
        assinatura.periodo.mes,
        assinatura.periodo.ano
      );
      const badges = await this.montarResumoBadgesPdf(
        func.id,
        func.categoria,
        assinatura.periodo.mes,
        assinatura.periodo.ano,
        relatorio,
        bancoMes
      );
      bancoHorasSaldoTotalMinutos = badges.totalAcumuladoMinutos;
    } catch {
      /* mantém o valor já gravado */
    }

    const atualizada = await this.prisma.assinaturaQuadro.update({
      where: { id: assinaturaId },
      data: {
        status: "PENDENTE_GESTOR",
        bancoHorasSaldoTotalMinutos,
        assinadoFuncionarioEm: new Date(),
        assinadoFuncionarioIp: meta.ipReal,
        assinadoFuncionarioIpGateway: meta.ipGateway,
        assinadoFuncionarioUserAgent: meta.userAgent,
        assinadoFuncionarioUserId: keycloakSub
      },
      include: {
        periodo: { include: { funcionario: { include: { user: true, gerencia: true } } } }
      }
    });

    // Notifica o gestor da equipe do funcionário
    this.dispararNotificacaoGestor(atualizada).catch((e) =>
      this.logger.error(`Falha ao notificar ASSINAR_QUADRO_GESTOR: ${e}`)
    );

    return atualizada;
  }

  /**
   * Gestor rejeita o quadro: devolve ao funcionário (PENDENTE_FUNCIONARIO)
   * para correção e nova assinatura. Não conclui nem assina como gestor.
   */
  async rejeitarAssinaturaGestor(
    assinaturaId: string,
    keycloakSub: string,
    isSuperAdmin = false,
    temRoleGestor = false,
    motivo?: string
  ) {
    const assinatura = await this.prisma.assinaturaQuadro.findUnique({
      where: { id: assinaturaId },
      include: {
        periodo: {
          include: {
            funcionario: { include: { user: true, gerencia: true } }
          }
        }
      }
    });

    if (!assinatura) throw new NotFoundException("Assinatura não encontrada");
    if (assinatura.status !== "PENDENTE_GESTOR") {
      throw new BadRequestException(
        `Status atual (${assinatura.status}) não permite rejeição pelo chefe`
      );
    }

    if (!isSuperAdmin) {
      const equipe = await this.auditoriaService.getEquipeDoGestor(
        keycloakSub,
        false,
        temRoleGestor
      );
      const pertenceEquipe = equipe.some((f) => f.id === assinatura.periodo.funcionarioId);
      if (!pertenceEquipe) throw new ForbiddenException("Funcionário não pertence à sua equipe");
    }

    let bancoHorasSaldoTotalMinutos = assinatura.bancoHorasSaldoTotalMinutos;
    try {
      const { relatorio, bancoMes } = await this.montarRelatorioParaPdf(
        assinatura.periodo.funcionarioId,
        assinatura.periodo.mes,
        assinatura.periodo.ano
      );
      const cat = assinatura.periodo.funcionario.categoria ?? null;
      const badges = await this.montarResumoBadgesPdf(
        assinatura.periodo.funcionarioId,
        cat,
        assinatura.periodo.mes,
        assinatura.periodo.ano,
        relatorio,
        bancoMes
      );
      bancoHorasSaldoTotalMinutos = badges.totalAcumuladoMinutos;
    } catch {
      /* mantém */
    }

    const atualizada = await this.prisma.assinaturaQuadro.update({
      where: { id: assinaturaId },
      data: {
        status: "PENDENTE_FUNCIONARIO",
        bancoHorasSaldoTotalMinutos,
        assinadoFuncionarioEm: null,
        assinadoFuncionarioIp: null,
        assinadoFuncionarioIpGateway: null,
        assinadoFuncionarioUserAgent: null,
        assinadoFuncionarioUserId: null,
        assinadoGestorEm: null,
        assinadoGestorIp: null,
        assinadoGestorIpGateway: null,
        assinadoGestorUserAgent: null,
        assinadoGestorUserId: null,
        assinadoGestorNome: null
      },
      include: {
        periodo: { include: { funcionario: { include: { user: true, gerencia: true } } } }
      }
    });

    const { mes, ano } = atualizada.periodo;
    this.dispararNotificacaoAssinarQuadro(atualizada.periodo.funcionario, mes, ano, motivo).catch(
      (e) => this.logger.error(`Falha ao notificar rejeição de quadro: ${e}`)
    );

    return atualizada;
  }

  /* ─── Gestor assina ─── */

  async assinarGestor(
    assinaturaId: string,
    keycloakSub: string,
    gestorNome: string,
    meta: SignatureMeta,
    isSuperAdmin = false,
    temRoleGestor = false
  ) {
    const assinatura = await this.prisma.assinaturaQuadro.findUnique({
      where: { id: assinaturaId },
      include: { periodo: { include: { funcionario: { include: { gerencia: true } } } } }
    });

    if (!assinatura) throw new NotFoundException("Assinatura não encontrada");
    if (assinatura.status !== "PENDENTE_GESTOR")
      throw new BadRequestException(
        `Status atual (${assinatura.status}) não permite assinatura do gestor`
      );

    // Valida que o gestor é responsável pela equipe (não aplica a super admin)
    if (!isSuperAdmin) {
      const equipe = await this.auditoriaService.getEquipeDoGestor(
        keycloakSub,
        false,
        temRoleGestor
      );
      const pertenceEquipe = equipe.some((f) => f.id === assinatura.periodo.funcionarioId);
      if (!pertenceEquipe) throw new ForbiddenException("Funcionário não pertence à sua equipe");
    }

    const concluida = await this.prisma.assinaturaQuadro.update({
      where: { id: assinaturaId },
      data: {
        status: "CONCLUIDA",
        assinadoGestorEm: new Date(),
        assinadoGestorIp: meta.ipReal,
        assinadoGestorIpGateway: meta.ipGateway,
        assinadoGestorUserAgent: meta.userAgent,
        assinadoGestorUserId: keycloakSub,
        assinadoGestorNome: gestorNome
      },
      include: { periodo: { include: { funcionario: { include: { user: true } } } } }
    });

    /* Congela o PDF final (e aplica o selo ICP-Brasil, quando configurado). */
    this.congelarPdfFinal(concluida.id).catch((e) =>
      this.logger.error(`Falha ao congelar o PDF final (${concluida.id}): ${e}`)
    );

    // Notifica o funcionário que o quadro foi totalmente assinado
    this.dispararNotificacaoConcluida(concluida).catch((e) =>
      this.logger.error(`Falha ao notificar ASSINATURA_CONCLUIDA: ${e}`)
    );

    return concluida;
  }

  /* ─── Assinaturas pendentes para o gestor (equipe, status PENDENTE_GESTOR) ─── */

  async getAssinaturasGestor(
    keycloakSub: string,
    isSuperAdmin = false,
    temRoleGestor = false,
    status?: string
  ) {
    const equipe = await this.auditoriaService.getEquipeDoGestor(
      keycloakSub,
      isSuperAdmin,
      temRoleGestor
    );
    const ids = equipe.map((f) => f.id);
    if (!ids.length) return [];

    const statusFiltro = status
      ? [status]
      : ["PENDENTE_GESTOR", "CONCLUIDA", "PENDENTE_FUNCIONARIO"];

    const rows = await this.prisma.assinaturaQuadro.findMany({
      where: {
        status: {
          in: statusFiltro as (
            | "PENDENTE_FUNCIONARIO"
            | "PENDENTE_GESTOR"
            | "CONCLUIDA"
            | "DISPENSADA"
          )[]
        },
        periodo: { funcionarioId: { in: ids } }
      },
      include: {
        periodo: {
          include: {
            funcionario: {
              include: {
                user: { select: { name: true } },
                gerencia: { select: { nome: true, sigla: true } }
              }
            }
          }
        }
      },
      orderBy: [{ status: "asc" }, { criadoEm: "desc" }]
    });

    // Resumo da folha (dias, horas, BH total) com a conta atual — igual ao PDF e à página do banco.
    for (const a of rows) await this.atualizarResumoFolha(a);

    return rows;
  }

  /* ─── Lista geral para o RH ─── */

  async getAssinaturasRH(filtros: {
    gerenciaId?: string;
    funcionarioId?: string;
    mes?: number;
    ano?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filtros.status) where.status = filtros.status;

    const periodoWhere: Record<string, unknown> = {};
    if (filtros.mes) periodoWhere.mes = filtros.mes;
    if (filtros.ano) periodoWhere.ano = filtros.ano;
    if (filtros.funcionarioId) periodoWhere.funcionarioId = filtros.funcionarioId;
    if (filtros.gerenciaId) {
      periodoWhere.funcionario = { gerenciaId: filtros.gerenciaId };
    }
    if (Object.keys(periodoWhere).length) where.periodo = periodoWhere;

    const [total, assinaturas] = await Promise.all([
      this.prisma.assinaturaQuadro.count({ where }),
      this.prisma.assinaturaQuadro.findMany({
        where,
        include: {
          periodo: {
            include: {
              funcionario: {
                include: {
                  user: { select: { name: true } },
                  gerencia: { select: { nome: true, sigla: true } }
                }
              }
            }
          }
        },
        orderBy: [{ criadoEm: "desc" }],
        skip,
        take: limit
      })
    ]);

    for (const a of assinaturas) await this.atualizarResumoFolha(a);
    return { total, page, limit, assinaturas };
  }

  /**
   * Busca assinaturas digitais pelo código SHA impresso no PDF
   * (quadro mensal — funcionário/gestor — e ciência do gestor em atestados).
   */
  async buscarPorCodigoAssinatura(codigoRaw: string) {
    const codigo = normalizeCodigoAssinatura(codigoRaw);
    if (codigo.length < 4) {
      throw new BadRequestException(
        "Informe ao menos 4 caracteres do código da assinatura digital."
      );
    }

    const encontrados: Array<{
      tipo: "QUADRO_MENSAL" | "CIENCIA_ATESTADO";
      papel: "FUNCIONARIO" | "GESTOR" | "CIENCIA_GESTOR";
      codigo: string;
      id: string;
      funcionarioNome: string;
      matricula: string | null;
      gerenciaNome: string | null;
      assinadoEm: string | null;
      signatarioNome: string | null;
      periodo?: { mes: number; ano: number };
      status?: string;
      documentoUrl?: string | null;
    }> = [];

    const quadros = await this.prisma.assinaturaQuadro.findMany({
      where: {
        OR: [{ assinadoFuncionarioEm: { not: null } }, { assinadoGestorEm: { not: null } }]
      },
      include: {
        periodo: {
          include: {
            funcionario: {
              include: {
                user: { select: { name: true } },
                gerencia: { select: { nome: true } }
              }
            }
          }
        }
      }
    });

    for (const a of quadros) {
      const matricula = a.periodo.funcionario.matricula ?? "";
      const periodo = `${a.periodo.mes}/${a.periodo.ano}`;
      const base = {
        tipo: "QUADRO_MENSAL" as const,
        id: a.id,
        funcionarioNome: a.periodo.funcionario.user.name,
        matricula: a.periodo.funcionario.matricula,
        gerenciaNome: a.periodo.funcionario.gerencia?.nome ?? null,
        periodo: { mes: a.periodo.mes, ano: a.periodo.ano },
        status: a.status
      };

      if (a.assinadoFuncionarioEm) {
        const hash = computeQuadroSignatoryHash(
          matricula,
          periodo,
          a.assinadoFuncionarioEm,
          a.assinadoFuncionarioIp
        );
        const codigoExibido = groupCodigoAssinatura(hash, 32);
        if (codigoAssinaturaCoincide(codigoExibido, codigo)) {
          encontrados.push({
            ...base,
            papel: "FUNCIONARIO",
            codigo: codigoExibido,
            assinadoEm: a.assinadoFuncionarioEm.toISOString(),
            signatarioNome: a.periodo.funcionario.user.name
          });
        }
      }

      if (a.assinadoGestorEm) {
        const hash = computeQuadroSignatoryHash(
          matricula,
          periodo,
          a.assinadoGestorEm,
          a.assinadoGestorIp
        );
        const codigoExibido = groupCodigoAssinatura(hash, 32);
        if (codigoAssinaturaCoincide(codigoExibido, codigo)) {
          encontrados.push({
            ...base,
            papel: "GESTOR",
            codigo: codigoExibido,
            assinadoEm: a.assinadoGestorEm.toISOString(),
            signatarioNome: a.assinadoGestorNome
          });
        }
      }
    }

    const atestados = await this.prisma.solicitacao.findMany({
      where: { tipo: "ATESTADO" },
      include: {
        funcionario: {
          include: {
            user: { select: { name: true } },
            gerencia: { select: { nome: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 5000
    });

    for (const s of atestados) {
      const meta =
        s.metadados && typeof s.metadados === "object"
          ? (s.metadados as Record<string, unknown>)
          : null;
      const ciencia =
        meta?.cienciaGestor && typeof meta.cienciaGestor === "object"
          ? (meta.cienciaGestor as Record<string, unknown>)
          : null;
      if (!ciencia) continue;

      const gestorNome = typeof ciencia.gestorNome === "string" ? ciencia.gestorNome : "";
      const em = typeof ciencia.em === "string" ? ciencia.em : null;
      const ipReal = typeof ciencia.ipReal === "string" ? ciencia.ipReal : "";
      const userAgent = typeof ciencia.userAgent === "string" ? ciencia.userAgent : null;
      if (!gestorNome || !em || !ipReal) continue;

      const persistido =
        typeof ciencia.codigoHash === "string"
          ? normalizeCodigoAssinatura(ciencia.codigoHash)
          : null;
      const codigoExibido =
        persistido?.slice(0, 16) ??
        codigoCienciaGestorExibido(gestorNome, new Date(em), ipReal, userAgent);

      if (!codigoAssinaturaCoincide(codigoExibido, codigo)) continue;

      const documentoUrl =
        typeof meta?.documentoUrl === "string" ? (meta.documentoUrl as string) : null;

      encontrados.push({
        tipo: "CIENCIA_ATESTADO",
        papel: "CIENCIA_GESTOR",
        codigo: groupCodigoAssinatura(codigoExibido.replace(/\s/g, ""), 16),
        id: s.id,
        funcionarioNome: s.funcionario.user.name,
        matricula: s.funcionario.matricula,
        gerenciaNome: s.funcionario.gerencia?.nome ?? null,
        assinadoEm: em,
        signatarioNome: gestorNome,
        status: s.status,
        documentoUrl
      });
    }

    return {
      codigoBuscado: codigo,
      total: encontrados.length,
      encontrados
    };
  }

  /* ─── Metadados para filename do PDF ─── */

  /**
   * Folhas de ponto do funcionário: as **totalmente assinadas** (funcionário + chefe), prontas
   * para baixar como documento, e as que ainda faltam assinar (em andamento).
   */
  async listarFolhasAssinadasDoFuncionario(funcionarioId: string) {
    const [func, rows] = await Promise.all([
      this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { categoria: true }
      }),
      this.prisma.assinaturaQuadro.findMany({
        where: { periodo: { funcionarioId } },
        include: { periodo: { select: { mes: true, ano: true } } },
        orderBy: [{ periodo: { ano: "desc" } }, { periodo: { mes: "desc" } }]
      })
    ]);
    const mostrarBanco = !categoriaSemVisibilidadeBancoHoras(func?.categoria);
    const item = (a: (typeof rows)[number]) => ({
      id: a.id,
      mes: a.periodo.mes,
      ano: a.periodo.ano,
      status: a.status,
      assinadoFuncionarioEm: a.assinadoFuncionarioEm,
      assinadoGestorEm: a.assinadoGestorEm,
      assinadoGestorNome: a.assinadoGestorNome,
      bancoHorasSaldoTotalMinutos: mostrarBanco ? a.bancoHorasSaldoTotalMinutos : null
    });
    return {
      assinadas: rows.filter((a) => a.status === "CONCLUIDA").map(item),
      emAndamento: rows
        .filter((a) => a.status === "PENDENTE_FUNCIONARIO" || a.status === "PENDENTE_GESTOR")
        .map(item)
    };
  }

  async listarFolhasAssinadasPorSub(keycloakSub: string) {
    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    const func = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });
    if (!func) throw new NotFoundException("Funcionário não encontrado");
    return this.listarFolhasAssinadasDoFuncionario(func.id);
  }

  async getAssinaturaParaPdf(id: string) {
    return this.prisma.assinaturaQuadro.findUnique({
      where: { id },
      include: {
        periodo: { include: { funcionario: { include: { user: { select: { name: true } } } } } }
      }
    });
  }

  /* ─── Valida que a assinatura pertence ao funcionário autenticado ─── */

  async validarPropriedadeFuncionario(assinaturaId: string, keycloakSub: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) return false;
    const func = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });
    if (!func) return false;
    const assinatura = await this.prisma.assinaturaQuadro.findUnique({
      where: { id: assinaturaId },
      include: { periodo: { select: { funcionarioId: true } } }
    });
    return assinatura?.periodo.funcionarioId === func.id;
  }

  /* ─── Dados do histórico (mesma fonte da página /ponto/historico) ─── */

  private async buscarRegistrosEAfastamentos(funcionarioId: string, mes: number, ano: number) {
    const mm = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const { inicio } = intervaloDiaBrasilia(`${ano}-${mm}-01`);
    const { fim } = intervaloDiaBrasilia(`${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`);

    const registros = await this.prisma.registroPonto.findMany({
      where: { funcionarioId, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" }
    });

    const inicioBuffer = new Date(inicio);
    inicioBuffer.setUTCDate(inicioBuffer.getUTCDate() - 1);
    const fimBuffer = new Date(fim);
    fimBuffer.setUTCDate(fimBuffer.getUTCDate() + 1);

    const afastamentosRaw = await this.prisma.afastamento.findMany({
      where: {
        funcionarioId,
        dataInicio: { lte: fimBuffer },
        dataFim: { gte: inicioBuffer }
      },
      orderBy: { dataInicio: "asc" }
    });

    const sols = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: { in: ["ATESTADO", "ABONO"] },
        status: "APROVADA",
        OR: [
          { dataInicio: { lte: fimBuffer }, dataFim: { gte: inicioBuffer } },
          { dataReferencia: { gte: inicioBuffer, lte: fimBuffer } }
        ]
      },
      select: { dataInicio: true, dataFim: true, dataReferencia: true, metadados: true }
    });

    const afastamentos = enriquecerAfastamentosComSolicitacoes(afastamentosRaw, sols);

    return { registros, afastamentos };
  }

  private async montarRelatorioParaPdf(funcionarioId: string, mes: number, ano: number) {
    const funcJornada = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        jornadaPeriodoId: true,
        jornadaHorasDia: true,
        jornadaPeriodoDesde: true,
        jornadaPeriodoAssociadoEm: true,
        jornadaPeriodo: {
          select: { nome: true, jornadaDiariaMin: true, horaEntrada: true, horaSaida: true }
        },
        user: { select: { primeiroLoginEm: true } },
        categoria: true
      }
    });
    const cfgJornada = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { horaEntrada: true, horaSaida: true }
    });
    const cfgSolicitacoes = await this.configSolicitacoesService.getConfig();
    const jornada = {
      ...resolverJornadaHistoricoContexto({
        ...funcJornada,
        configuracaoHoraEntrada: cfgJornada?.horaEntrada ?? null,
        configuracaoHoraSaida: cfgJornada?.horaSaida ?? null
      }),
      atestadoTempoRetornoMin: cfgSolicitacoes.atestadoTempoRetornoMin,
      atestadoTempoIdaMin: cfgSolicitacoes.atestadoTempoIdaMin
    };

    const { registros, afastamentos } = await this.buscarRegistrosEAfastamentos(
      funcionarioId,
      mes,
      ano
    );

    const mm = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const { inicio: feriadoIni, fim: feriadoFim } = intervaloColunaDate(
      `${ano}-${mm}-01`,
      `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`
    );

    const [feriados, cfg] = await Promise.all([
      this.prisma.feriadoConfig.findMany({
        where: { data: { gte: feriadoIni, lte: feriadoFim } },
        select: { data: true, nome: true, tipo: true, marcoHorario: true, marcoLado: true }
      }),
      this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: {
          bancoHorasSabadoPct: true,
          bancoHorasDomingoPct: true,
          bancoHorasFeriadoPct: true
        }
      })
    ]);

    const cicloEmCasa = await diasCicloCompletoEmCasa(
      this.prisma,
      funcionarioId,
      intervaloDiaBrasilia(`${ano}-${mm}-01`).inicio,
      intervaloDiaBrasilia(`${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`).fim
    );

    const relatorioBase = montarRelatorioQuadro(
      registros,
      afastamentos,
      mes,
      ano,
      jornada,
      feriados,
      cfg?.bancoHorasSabadoPct ?? 100,
      cfg?.bancoHorasDomingoPct ?? 200,
      cfg?.bancoHorasFeriadoPct ?? 200,
      inicioAtividadesUsuario(funcJornada?.user),
      {
        forcarSemIntervalo: categoriaSemIntervaloAlmoco(funcJornada?.categoria),
        diasCicloCompletoEmCasa: cicloEmCasa.dias,
        exigenciasCicloPresencial: (
          await exigenciasCicloPresencial(
            this.prisma,
            funcionarioId,
            intervaloDiaBrasilia(`${ano}-${mm}-01`).inicio,
            intervaloDiaBrasilia(`${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`).fim,
            jornada,
            cicloEmCasa.dias
          )
        ).porDia,
        diaNeutro: await montarDiaNeutro(this.prisma, funcionarioId),
        rotuloModalidadePorDia: await rotulosModalidadePorDia(
          this.prisma,
          funcionarioId,
          intervaloDiaBrasilia(`${ano}-${mm}-01`).inicio,
          intervaloDiaBrasilia(`${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`).fim
        )
      }
    );

    /* Saldo do dia e do mês = MESMA conta da página Banco de Horas (regra de hora extra,
       atestados, isenção…). O quadro só mostra as batidas e o status; o saldo vem do banco. */
    const banco = await this.auditoriaService.bancoHorasDoIntervalo(
      funcionarioId,
      `${ano}-${mm}-01`,
      `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`
    );
    const relatorio = aplicarBancoNoRelatorio(relatorioBase, banco.dias);
    return {
      relatorio,
      jornada,
      bancoMes: {
        saldoAntesMinutos: banco.saldoAntesMinutos,
        saldoFinalMinutos: banco.saldoFinalMinutos
      }
    };
  }

  /**
   * Dias Inconsistentes (exceto o dia corrente) ou solicitações de correção/atestado
   * em andamento impedem a assinatura da folha.
   */
  async avaliarSaldoFolha(
    funcionarioId: string,
    mes: number,
    ano: number
  ): Promise<{
    saldoRegularizado: boolean;
    temDiasIrregulares: boolean;
    temSolicitacoesPendentes: boolean;
    pendencias: PendenciasFolha;
    /** Relatório do mês já montado (evita montar de novo em quem precisa dele). */
    relatorio: Awaited<ReturnType<AssinaturaService["montarRelatorioParaPdf"]>>["relatorio"] | null;
  }> {
    /* Sem atalho pela situação ATUAL (ex.: hoje Comissionado): a folha do mês já trata,
       dia a dia, os períodos isentos e a cessão como neutros — então só sobram como
       Inconsistentes os dias que de fato tinham obrigação de ponto naquele mês. Só o status
       Inconsistente barra a assinatura; Falta (nenhum registro) não barra. */
    const pendencias: PendenciasFolha = { dias: [], solicitacoes: [], erroConferencia: false };
    let relatorioMes:
      | Awaited<ReturnType<AssinaturaService["montarRelatorioParaPdf"]>>["relatorio"]
      | null = null;
    try {
      const { relatorio } = await this.montarRelatorioParaPdf(funcionarioId, mes, ano);
      relatorioMes = relatorio;
      const hojeIso = hojeBrasiliaISO();
      for (const d of relatorio.dias) {
        if (d.statusInterno !== "INCONSISTENTE" || d.iso === hojeIso) continue;
        let motivo: string;
        if (d.cicloIncompleto) {
          motivo = d.cicloIncompleto.replace(/^Ciclo incompleto( em casa)? — falta: /, "falta ");
        } else if (!d.entrada) {
          motivo = "há registros no dia, mas falta a entrada";
        } else if (d.inicioIntervalo && !d.fimIntervalo) {
          motivo = "intervalo sem retorno";
        } else if (d.pausas.some((p) => !p.fim)) {
          motivo = "pausa sem retorno";
        } else if (!d.saida && !d.inicioIntervalo) {
          motivo = d.pausas.length ? "sem registro de saída" : "apenas a entrada foi registrada";
        } else if (!d.saida) {
          motivo = "sem registro de saída";
        } else {
          motivo = "registro incompleto";
        }
        pendencias.dias.push({ iso: d.iso, status: "INCONSISTENTE", motivo });
      }
    } catch (err) {
      this.logger.warn(
        `avaliarSaldoFolha: falha ao montar relatório ${mes}/${ano} func ${funcionarioId}: ${String(err)}`
      );
      pendencias.erroConferencia = true;
    }

    const mm = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const { inicio } = intervaloDiaBrasilia(`${ano}-${mm}-01`);
    const { fim } = intervaloDiaBrasilia(`${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`);

    const solsPendentes = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        /* Qualquer solicitação em andamento que mexa na folha do mês (correção, atestado,
           abono, férias, licença, day off, hora extra). Só o envio de documento ao RH e
           as solicitações apenas informativas (isentos) não afetam a folha. */
        tipo: { not: "ENVIO_DOCUMENTO_RH" },
        apenasInformativo: false,
        status: { in: [...STATUS_SOLICITACAO_EM_ANDAMENTO] },
        OR: [
          { dataReferencia: { gte: inicio, lte: fim } },
          { dataInicio: { lte: fim }, dataFim: { gte: inicio } }
        ]
      },
      select: {
        id: true,
        tipo: true,
        status: true,
        dataReferencia: true,
        dataInicio: true,
        dataFim: true
      },
      orderBy: { dataReferencia: "asc" }
    });
    /* Pedidos idênticos (mesmo tipo, período e etapa) aparecem uma vez só na lista. */
    const jaListadas = new Set<string>();
    for (const sol of solsPendentes) {
      const ini = sol.dataInicio ?? sol.dataReferencia;
      const chave = [
        sol.tipo,
        sol.status,
        dataBrasiliaISO(ini),
        dataCivilFimAfastamento(ini, sol.dataFim ?? ini)
      ].join("|");
      if (jaListadas.has(chave)) continue;
      jaListadas.add(chave);
      pendencias.solicitacoes.push({
        id: sol.id,
        tipo: sol.tipo,
        tipoLabel: TIPO_SOLICITACAO_LABEL_FOLHA[sol.tipo] ?? sol.tipo,
        status: sol.status,
        etapa: ETAPA_SOLICITACAO_FOLHA[sol.status] ?? "em andamento",
        inicio: dataBrasiliaISO(ini),
        fim: dataCivilFimAfastamento(ini, sol.dataFim ?? ini)
      });
    }

    const temDiasIrregulares = pendencias.dias.length > 0 || pendencias.erroConferencia;
    const temSolicitacoesPendentes = pendencias.solicitacoes.length > 0;
    return {
      temDiasIrregulares,
      temSolicitacoesPendentes,
      saldoRegularizado: !temDiasIrregulares && !temSolicitacoesPendentes,
      pendencias,
      relatorio: relatorioMes
    };
  }

  /* ─── Cron diário: correções pendentes para assinar a folha ─── */

  @Cron("10 0 * * *", { timeZone: "America/Sao_Paulo" })
  async cronFolhaPontoCorrecaoPendente() {
    const eventoId = "FOLHA_PONTO_CORRECAO_PENDENTE";
    const [emailAtivo, sistemaAtivo] = await Promise.all([
      this.notificacaoService.isEmailAtivoParaEvento(eventoId),
      this.notificacaoService.isSistemaAtivoParaEvento(eventoId)
    ]);
    if (!emailAtivo && !sistemaAtivo) return;

    const pendentes = await this.prisma.assinaturaQuadro.findMany({
      where: { status: "PENDENTE_FUNCIONARIO" },
      include: {
        periodo: {
          include: {
            funcionario: {
              select: {
                id: true,
                categoria: true,
                isManager: true,
                isFiscal: true,
                registroPontoObrigatorio: true,
                user: { select: { externalId: true, email: true, emailReal: true } }
              }
            }
          }
        }
      }
    });

    let enviados = 0;
    for (const ass of pendentes) {
      const func = ass.periodo.funcionario;
      if (funcionarioSemRegistroPonto(func)) continue;

      const avaliacao = await this.avaliarSaldoFolha(func.id, ass.periodo.mes, ass.periodo.ano);
      if (avaliacao.saldoRegularizado) continue;

      const { titulo, corpo } = montarMensagemCorrecaoPendenteFolha(
        ass.periodo.mes,
        ass.periodo.ano
      );
      await this.notificacaoService.dispararEvento(eventoId, titulo, corpo, [
        {
          externalId: func.user?.externalId ?? null,
          email: func.user?.email ?? null,
          emailReal: func.user?.emailReal ?? null
        }
      ]);
      enviados++;
    }

    this.logger.log(
      `Cron FOLHA_PONTO_CORRECAO_PENDENTE: ${enviados} notificações disparadas ` +
        `(${pendentes.length} folhas pendentes de assinatura).`
    );
  }

  /** Monta o resumo equivalente aos badges da página Histórico para o PDF. */
  private async montarResumoBadgesPdf(
    funcionarioId: string,
    categoria: string | null | undefined,
    mes: number,
    ano: number,
    relatorio: {
      dias: Array<{ statusInterno: string }>;
      horasTrabalhadasMinutos: number;
      saldoMinutos: number;
    },
    bancoMes?: { saldoAntesMinutos: number; saldoFinalMinutos: number }
  ): Promise<ResumoBadgesPdf> {
    const diasOk = relatorio.dias.filter((d) => d.statusInterno === "OK").length;
    const faltas = relatorio.dias.filter((d) => d.statusInterno === "FALTA").length;
    const afastamentos = relatorio.dias.filter((d) => d.statusInterno === "AFASTAMENTO").length;
    const ocultarBancoHoras = categoriaSemVisibilidadeBancoHoras(categoria);

    const mesAnterior = mes === 1 ? 12 : mes - 1;
    const anoMesAnterior = mes === 1 ? ano - 1 : ano;
    const labelMesAnterior = new Date(anoMesAnterior, mesAnterior - 1, 1).toLocaleDateString(
      "pt-BR",
      { month: "short", year: "numeric" }
    );

    /* Acumulado do ciclo até o mês anterior e no fim do mês: mesma conta da página do banco. */
    let saldoAcumuladoMesAnteriorMinutos = 0;
    let totalAcumuladoMinutos: number | null = null;
    if (!ocultarBancoHoras) {
      try {
        const mm = String(mes).padStart(2, "0");
        const ultimo = new Date(ano, mes, 0).getDate();
        const b =
          bancoMes ??
          (await this.auditoriaService.bancoHorasDoIntervalo(
            funcionarioId,
            `${ano}-${mm}-01`,
            `${ano}-${mm}-${String(ultimo).padStart(2, "0")}`
          ));
        saldoAcumuladoMesAnteriorMinutos = b.saldoAntesMinutos;
        totalAcumuladoMinutos = b.saldoFinalMinutos;
      } catch (err) {
        this.logger.warn(`montarResumoBadgesPdf: falha ao obter banco de horas — ${String(err)}`);
      }
    }

    const saldoMesMinutos = relatorio.saldoMinutos;
    return {
      diasOk,
      faltas,
      afastamentos,
      horasTrabalhadasMinutos: relatorio.horasTrabalhadasMinutos,
      ocultarBancoHoras,
      saldoAcumuladoMesAnteriorMinutos,
      labelMesAnterior,
      saldoMesMinutos,
      totalAcumuladoMinutos:
        totalAcumuladoMinutos ?? saldoAcumuladoMesAnteriorMinutos + saldoMesMinutos
    };
  }

  /** Dados do empregador e da jornada contratual exibidos no Espelho de Ponto. */
  private async montarEspelhoExtras(
    funcionario: { dataAdmissao: Date | null },
    jornada: { atualMin: number; horaEntrada?: string; horaSaida?: string }
  ): Promise<EspelhoExtrasPdf> {
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: {
        nome: true,
        cnpj: true,
        bancoHorasSabadoPct: true,
        bancoHorasDomingoPct: true,
        bancoHorasFeriadoPct: true
      }
    });
    const h = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
    const semanal = jornada.atualMin * 5;
    return {
      razaoSocial: (cfg?.nome ?? "Conselho Federal de Odontologia").toUpperCase(),
      cnpj: cfg?.cnpj ?? null,
      dataAdmissao: funcionario.dataAdmissao,
      jornadaContratual: `${h(jornada.atualMin)}/dia – ${h(semanal)} semanais`,
      horarioContratual:
        jornada.horaEntrada && jornada.horaSaida
          ? `${jornada.horaEntrada} às ${jornada.horaSaida}`
          : "—",
      multiplicadores: {
        sabadoPct: cfg?.bancoHorasSabadoPct ?? 100,
        domingoPct: cfg?.bancoHorasDomingoPct ?? 200,
        feriadoPct: cfg?.bancoHorasFeriadoPct ?? 200
      }
    };
  }

  /* ─── Geração de PDF ─── */

  async gerarRascunhoPdf(keycloakSub: string, mes: number, ano: number): Promise<Buffer> {
    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) throw new NotFoundException("Usuário não encontrado");

    const funcionario = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      include: { user: true, gerencia: true }
    });
    if (!funcionario) throw new NotFoundException("Funcionário não encontrado");

    const { relatorio, jornada, bancoMes } = await this.montarRelatorioParaPdf(
      funcionario.id,
      mes,
      ano
    );
    const jornadaHorasExibicao = Math.round(jornada.atualMin / 60);
    const resumoBadges = await this.montarResumoBadgesPdf(
      funcionario.id,
      funcionario.categoria,
      mes,
      ano,
      relatorio,
      bancoMes
    );

    const logoBase64 = loadAssetBase64("logo.png");

    const espelho = await this.montarEspelhoExtras(funcionario, jornada);
    const docDefinition = buildRascunhoPdfDocDefinition({
      mes,
      ano,
      espelho,
      verificacao: { url: null, codigo: null, seloAtivo: this.seloIcpService.status().configurado },
      funcionario: {
        matricula: funcionario.matricula,
        cpf: funcionario.cpf,
        cargo: funcionario.cargo,
        section: funcionario.section,
        categoria: funcionario.categoria,
        isManager: funcionario.isManager,
        jornadaHorasDia: jornadaHorasExibicao,
        user: { name: funcionario.user.name },
        gerencia: funcionario.gerencia
          ? { nome: funcionario.gerencia.nome, sigla: funcionario.gerencia.sigla }
          : null
      },
      assinatura: {
        assinadoFuncionarioEm: null,
        assinadoFuncionarioIp: null,
        assinadoGestorEm: null,
        assinadoGestorIp: null,
        assinadoGestorNome: null,
        bancoHorasSaldoTotalMinutos: resumoBadges.totalAcumuladoMinutos
      },
      relatorio,
      logoBase64,
      certificadoBase64: null,
      resumoBadges
    });

    if (!PdfPrinter) throw new InternalServerErrorException("pdfmake não disponível");

    const printer = new PdfPrinter(PDF_FONTS);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfDoc.on("data", (c: Buffer) => chunks.push(c));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });
  }

  /**
   * PDF do ciclo de banco de horas (apenas o intervalo [inicio, fim]),
   * com o mesmo cabeçalho/estrutura da folha de ponto.
   */
  async gerarPdfCicloBancoHoras(
    keycloakSub: string,
    inicioIso: string,
    fimIso: string
  ): Promise<Buffer> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioIso) || !/^\d{4}-\d{2}-\d{2}$/.test(fimIso)) {
      throw new BadRequestException("Informe inicio e fim no formato YYYY-MM-DD.");
    }
    if (inicioIso > fimIso) {
      throw new BadRequestException("O início do ciclo deve ser anterior ou igual ao fim.");
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) throw new NotFoundException("Usuário não encontrado");

    const funcionario = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      include: { user: true, gerencia: true }
    });
    if (!funcionario) throw new NotFoundException("Funcionário não encontrado");

    const meses: { mes: number; ano: number }[] = [];
    let [y, m] = inicioIso.slice(0, 7).split("-").map(Number);
    const [yFim, mFim] = fimIso.slice(0, 7).split("-").map(Number);
    while (y < yFim || (y === yFim && m <= mFim)) {
      meses.push({ mes: m, ano: y });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }

    const dias: DiaQuadroPdf[] = [];
    const diasPorMes = new Map<string, DiaQuadroPdf[]>();
    for (const { mes, ano } of meses) {
      const { relatorio } = await this.montarRelatorioParaPdf(funcionario.id, mes, ano);
      const yyyyMM = `${ano}-${String(mes).padStart(2, "0")}`;
      const doMes: DiaQuadroPdf[] = [];
      for (const d of relatorio.dias) {
        if (d.iso >= inicioIso && d.iso <= fimIso) {
          dias.push(d);
          doMes.push(d);
        }
      }
      diasPorMes.set(yyyyMM, doMes);
    }
    dias.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));

    const hojeIso = hojeBrasiliaISO();
    const mesAtualPrefix = hojeIso.slice(0, 7);
    const periodosAss = await this.prisma.periodoPonto.findMany({
      where: {
        funcionarioId: funcionario.id,
        OR: meses.map(({ mes, ano }) => ({ mes, ano }))
      },
      include: { assinatura: true }
    });
    const assByMes = new Map(
      periodosAss.map((p) => [`${p.ano}-${String(p.mes).padStart(2, "0")}`, p.assinatura])
    );

    let acumuladoCorrente = 0;
    const MESES_PT_PDF = [
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
    const mesesResumo = meses.map(({ mes, ano }) => {
      const yyyyMM = `${ano}-${String(mes).padStart(2, "0")}`;
      const doMes = diasPorMes.get(yyyyMM) ?? [];
      const trabalhadoMinutos = doMes
        .filter((d) => ["OK", "PENDENTE", "INCONSISTENTE"].includes(d.statusInterno))
        .reduce((s, d) => s + d.horasMin, 0);
      const saldoMesMinutos = doMes
        .filter((d) => d.saldoMin !== null)
        .reduce((s, d) => s + (d.saldoMin ?? 0), 0);
      for (const d of doMes) {
        if (d.saldoMin !== null) acumuladoCorrente += d.saldoMin;
      }
      const aguardaFechamento = yyyyMM >= mesAtualPrefix;
      const ass = assByMes.get(yyyyMM);
      const situacao = aguardaFechamento
        ? ("AGUARDA_FECHAMENTO" as const)
        : ass?.status === "CONCLUIDA"
          ? ("ASSINADO" as const)
          : ("PENDENTE" as const);
      return {
        yyyyMM,
        label: `${MESES_PT_PDF[mes - 1]} de ${ano}`,
        trabalhadoMinutos,
        saldoMesMinutos,
        acumuladoMinutos: acumuladoCorrente,
        situacao
      };
    });

    const horasTrabalhadasMinutos = dias
      .filter((d) => ["OK", "PENDENTE", "INCONSISTENTE"].includes(d.statusInterno))
      .reduce((s, d) => s + d.horasMin, 0);
    const diasTrabalhados = contarDiasTrabalhados(dias);
    const horasEsperadasMinutos = dias.reduce((s, d) => {
      if (d.statusInterno === "FUTURO" || d.statusInterno === "FOLGA") return s;
      if (d.statusInterno === "AFASTAMENTO") return s;
      if (d.multiplicadorPct && d.multiplicadorPct !== 100) return s;
      if (d.saldoMin === null) return s;
      return s + Math.max(0, d.horasMin - d.saldoMin);
    }, 0);
    const saldoMinutos = dias
      .filter((d) => d.saldoMin !== null)
      .reduce((s, d) => s + (d.saldoMin ?? 0), 0);

    const fmt = (min: number) => {
      const sign = min < 0 ? "-" : min > 0 ? "+" : "";
      const abs = Math.abs(min);
      return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}m`;
    };

    const relatorio = {
      dias,
      diasTrabalhados,
      horasTrabalhadasMinutos,
      horasTrabalhadasFormatado: fmt(horasTrabalhadasMinutos).replace(/^\+/, ""),
      horasEsperadasMinutos,
      saldoMinutos,
      saldoFormatado: fmt(saldoMinutos)
    };

    const { jornada } = await this.montarRelatorioParaPdf(
      funcionario.id,
      meses[0]?.mes ?? Number(inicioIso.slice(5, 7)),
      meses[0]?.ano ?? Number(inicioIso.slice(0, 4))
    );
    const jornadaHorasExibicao = Math.round(jornada.atualMin / 60);

    const diasOk = dias.filter((d) => d.statusInterno === "OK").length;
    const faltas = dias.filter((d) => d.statusInterno === "FALTA").length;
    const afastamentos = dias.filter((d) => d.statusInterno === "AFASTAMENTO").length;

    const logoBase64 = loadAssetBase64("logo.png");
    const mesRef = meses[0]?.mes ?? Number(inicioIso.slice(5, 7));
    const anoRef = meses[0]?.ano ?? Number(inicioIso.slice(0, 4));

    const assinaturaCiclo = await this.prisma.assinaturaCicloBancoHoras.findUnique({
      where: {
        funcionarioId_inicioIso_fimIso: {
          funcionarioId: funcionario.id,
          inicioIso,
          fimIso
        }
      }
    });
    const cicloAssinado = !!assinaturaCiclo;

    const pdfInput = {
      mes: mesRef,
      ano: anoRef,
      espelho: await this.montarEspelhoExtras(funcionario, jornada),
      cicloBancoHoras: { inicio: inicioIso, fim: fimIso, mesesResumo },
      verificacao: this.montarVerificacao({
        assinadoFuncionarioEm: assinaturaCiclo?.assinadoEm ?? null,
        assinadoFuncionarioIp: assinaturaCiclo?.assinadoIp ?? null,
        matricula: funcionario.matricula,
        periodo: `${inicioIso}/${fimIso}`
      }),
      funcionario: {
        matricula: funcionario.matricula,
        cpf: funcionario.cpf,
        cargo: funcionario.cargo,
        section: funcionario.section,
        categoria: funcionario.categoria,
        isManager: funcionario.isManager,
        jornadaHorasDia: jornadaHorasExibicao,
        user: { name: funcionario.user.name },
        gerencia: funcionario.gerencia
          ? { nome: funcionario.gerencia.nome, sigla: funcionario.gerencia.sigla }
          : null
      },
      assinatura: {
        assinadoFuncionarioEm: assinaturaCiclo?.assinadoEm ?? null,
        assinadoFuncionarioIp: assinaturaCiclo?.assinadoIp ?? null,
        assinadoFuncionarioIpGateway: assinaturaCiclo?.assinadoIpGateway ?? null,
        assinadoFuncionarioUserAgent: assinaturaCiclo?.assinadoUserAgent ?? null,
        assinadoGestorEm: null,
        assinadoGestorIp: null,
        assinadoGestorNome: null,
        bancoHorasSaldoTotalMinutos: saldoMinutos
      },
      relatorio,
      logoBase64,
      certificadoBase64: cicloAssinado ? loadAssetBase64("certificado-digital.png") : null,
      resumoBadges: {
        diasOk,
        faltas,
        afastamentos,
        horasTrabalhadasMinutos,
        ocultarBancoHoras: categoriaSemVisibilidadeBancoHoras(funcionario.categoria),
        saldoAcumuladoMesAnteriorMinutos: 0,
        labelMesAnterior: "ciclo",
        saldoMesMinutos: saldoMinutos,
        totalAcumuladoMinutos: saldoMinutos
      }
    };

    const docDefinition = cicloAssinado
      ? buildQuadroPdfDocDefinition(pdfInput)
      : buildRascunhoPdfDocDefinition(pdfInput);

    if (!PdfPrinter) throw new InternalServerErrorException("pdfmake não disponível");
    const printer = new PdfPrinter(PDF_FONTS);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfDoc.on("data", (c: Buffer) => chunks.push(c));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });
  }

  async gerarPdfQuadro(assinaturaId: string): Promise<Buffer> {
    return this.congelarPdfFinal(assinaturaId);
  }

  /** Entrada do PDF da folha + impressão digital dos dados exibidos (sem horário de emissão). */
  private async montarEntradaPdfQuadro(
    assinaturaId: string
  ): Promise<{ input: QuadroPdfInput; fingerprint: string }> {
    this.logger.log(`gerarPdfQuadro iniciado para: ${assinaturaId}`);
    const assinatura = await this.prisma.assinaturaQuadro.findUnique({
      where: { id: assinaturaId },
      include: {
        periodo: {
          include: {
            funcionario: {
              include: {
                user: true,
                gerencia: true
              }
            }
          }
        }
      }
    });

    if (!assinatura) throw new NotFoundException("Assinatura não encontrada");

    const { periodo } = assinatura;
    const { funcionario } = periodo;
    const { mes, ano } = periodo;

    this.logger.log(`Buscando relatório para funcionário ${funcionario.id}, ${mes}/${ano}`);
    const { relatorio, bancoMes, jornada } = await this.montarRelatorioParaPdf(
      funcionario.id,
      mes,
      ano
    );
    this.logger.log(`Relatório OK — ${relatorio.dias.length} dias`);
    const resumoBadges = await this.montarResumoBadgesPdf(
      funcionario.id,
      funcionario.categoria,
      mes,
      ano,
      relatorio,
      bancoMes
    );

    const logoBase64 = loadAssetBase64("logo.png");
    const certificadoBase64 = loadAssetBase64("certificado-digital.png");
    if (logoBase64) this.logger.log("Logo carregada");
    else this.logger.warn("Logo não encontrada");
    if (certificadoBase64) this.logger.log("Ícone de certificado digital carregado");
    else this.logger.warn("Ícone de certificado digital não encontrado");

    const espelho = await this.montarEspelhoExtras(funcionario, jornada);
    const verificacao = this.montarVerificacao({
      assinadoFuncionarioEm: assinatura.assinadoFuncionarioEm,
      assinadoFuncionarioIp: assinatura.assinadoFuncionarioIp,
      matricula: funcionario.matricula,
      periodo: `${mes}/${ano}`
    });
    const input: QuadroPdfInput = {
      mes,
      ano,
      espelho,
      verificacao,
      funcionario,
      assinatura,
      relatorio,
      logoBase64,
      certificadoBase64,
      resumoBadges
    };
    /* Só o que aparece no documento (nada de updatedAt, último login, data do download…). */
    const conteudo = {
      layout: VERSAO_LAYOUT_PDF,
      mes,
      ano,
      status: assinatura.status,
      assinaturas: {
        funcionarioEm: assinatura.assinadoFuncionarioEm,
        funcionarioIp: assinatura.assinadoFuncionarioIp,
        funcionarioGw: assinatura.assinadoFuncionarioIpGateway,
        funcionarioUa: assinatura.assinadoFuncionarioUserAgent,
        gestorEm: assinatura.assinadoGestorEm,
        gestorIp: assinatura.assinadoGestorIp,
        gestorGw: assinatura.assinadoGestorIpGateway,
        gestorUa: assinatura.assinadoGestorUserAgent,
        gestorNome: assinatura.assinadoGestorNome,
        banco: assinatura.bancoHorasSaldoTotalMinutos
      },
      funcionario: {
        nome: funcionario.user.name,
        matricula: funcionario.matricula,
        cpf: funcionario.cpf,
        cargo: funcionario.cargo,
        secao: funcionario.section,
        categoria: funcionario.categoria,
        chefe: funcionario.isManager,
        gerencia: funcionario.gerencia
          ? [funcionario.gerencia.nome, funcionario.gerencia.sigla]
          : null
      },
      relatorio,
      resumoBadges,
      espelho,
      verificacao
    };
    const fingerprint = createHash("sha256").update(JSON.stringify(conteudo)).digest("hex");
    if (verificacao.url) {
      const chave = await this.chaveSeloDocumentos();
      const numero = this.numeroRegistro(mes, ano, fingerprint);
      const registro: RegistroDocumentoPdf = {
        numero,
        urlPagina: (p, t) =>
          `${verificacao.url}?r=${numero}&p=${p}&t=${t}&s=${this.seloPagina(chave, numero, p, t)}`
      };
      input.registro = registro;
    }
    return { input, fingerprint };
  }

  private async renderizarPdfQuadro(input: QuadroPdfInput): Promise<Buffer> {
    /* Impressão liberada; cópia de texto, edição, montagem e conversão bloqueadas (senha de
       proprietário aleatória, descartada). Com o selo ICP-Brasil ativo, a proteção passa a ser a
       assinatura PAdES (o PDF criptografado não pode receber a assinatura). */
    const docDefinition = {
      ...buildQuadroPdfDocDefinition(input),
      ...(this.seloIcpService.status().configurado
        ? {}
        : {
            ownerPassword: randomBytes(24).toString("hex"),
            permissions: {
              printing: "highResolution",
              modifying: false,
              copying: false,
              annotating: false,
              fillingForms: false,
              contentAccessibility: true,
              documentAssembly: false
            }
          })
    };

    if (!PdfPrinter) {
      throw new InternalServerErrorException(
        "pdfmake não está instalado no servidor. Execute npm install no backend e reinicie."
      );
    }

    try {
      const printer = new PdfPrinter(PDF_FONTS);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      return await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
        pdfDoc.on("error", (err: Error) => {
          this.logger.error("pdfmake stream error: " + err.message);
          reject(err);
        });
        pdfDoc.end();
      });
    } catch (err) {
      this.logger.error("gerarPdfQuadro falhou: " + String(err));
      throw new InternalServerErrorException("Falha ao gerar PDF: " + String(err));
    }
  }

  /* ─── Helpers de notificação ─── */

  private async dispararNotificacaoAssinarQuadro(
    func: {
      id: string;
      user: { externalId: string | null; email: string; emailReal: string | null } | null;
    },
    mes: number,
    ano: number,
    motivoRejeicao?: string
  ) {
    if (
      !(await this.notificacaoService.isEmailAtivoParaEvento("ASSINAR_QUADRO")) &&
      !(await this.notificacaoService.isSistemaAtivoParaEvento("ASSINAR_QUADRO"))
    )
      return;

    const email = func.user?.emailReal ?? func.user?.email;
    const externalId = func.user?.externalId;
    const mesNome = new Date(ano, mes - 1).toLocaleString("pt-BR", { month: "long" });
    const titulo = motivoRejeicao
      ? `Quadro devolvido pelo chefe — ${mesNome}/${ano}`
      : `Assinar quadro de pontos — ${mesNome}/${ano}`;
    const corpo = motivoRejeicao
      ? `Seu quadro de ponto de ${mesNome}/${ano} foi rejeitado pelo chefe da área e voltou para nova assinatura.` +
        (motivoRejeicao.trim() ? ` Motivo: ${motivoRejeicao.trim()}` : "") +
        ` Acesse o Histórico ou o Banco de horas para revisar e assinar novamente.`
      : `Seu quadro de ponto de ${mesNome}/${ano} está disponível para assinatura. Acesse o sistema para assinar.`;

    if (email && (await this.notificacaoService.isEmailAtivoParaEvento("ASSINAR_QUADRO"))) {
      await this.notificacaoService.enviarEmailSistema(email, titulo, corpo, "ASSINAR_QUADRO");
    }
    if (externalId && (await this.notificacaoService.isSistemaAtivoParaEvento("ASSINAR_QUADRO"))) {
      await this.notificacaoService.criarNotificacaoParaUsuario(
        externalId,
        titulo,
        corpo,
        "ASSINAR_QUADRO"
      );
    }
  }

  private async dispararNotificacaoGestor(assinatura: {
    periodo: {
      mes: number;
      ano: number;
      funcionarioId: string;
      funcionario: {
        nome?: string;
        user: { name: string } | null;
        gerencia: { responsavelUserId: string | null } | null;
      };
    };
  }) {
    if (
      !(await this.notificacaoService.isEmailAtivoParaEvento("ASSINAR_QUADRO_GESTOR")) &&
      !(await this.notificacaoService.isSistemaAtivoParaEvento("ASSINAR_QUADRO_GESTOR"))
    )
      return;

    const { periodo } = assinatura;
    const gestor = await this.notificacaoService.getGestorDoFuncionario(periodo.funcionarioId);
    if (!gestor) return;

    const funcNome = periodo.funcionario.user?.name ?? "Funcionário";
    const mesNome = new Date(periodo.ano, periodo.mes - 1).toLocaleString("pt-BR", {
      month: "long"
    });
    const titulo = `Quadro de pontos aguardando sua assinatura — ${funcNome}`;
    const corpo = `${funcNome} assinou o quadro de ponto de ${mesNome}/${periodo.ano}. Acesse o sistema para revisar e assinar.`;
    const emailGestor = gestor.emailReal ?? gestor.email;

    if (
      emailGestor &&
      (await this.notificacaoService.isEmailAtivoParaEvento("ASSINAR_QUADRO_GESTOR"))
    ) {
      await this.notificacaoService.enviarEmailSistema(
        emailGestor,
        titulo,
        corpo,
        "ASSINAR_QUADRO_GESTOR"
      );
    }
    if (
      gestor.externalId &&
      (await this.notificacaoService.isSistemaAtivoParaEvento("ASSINAR_QUADRO_GESTOR"))
    ) {
      await this.notificacaoService.criarNotificacaoParaUsuario(
        gestor.externalId,
        titulo,
        corpo,
        "ASSINAR_QUADRO_GESTOR"
      );
    }
  }

  private async dispararNotificacaoConcluida(assinatura: {
    periodo: {
      mes: number;
      ano: number;
      funcionario: {
        user: { externalId: string | null; email: string; emailReal: string | null } | null;
      };
    };
  }) {
    if (
      !(await this.notificacaoService.isEmailAtivoParaEvento("ASSINATURA_CONCLUIDA")) &&
      !(await this.notificacaoService.isSistemaAtivoParaEvento("ASSINATURA_CONCLUIDA"))
    )
      return;

    const { periodo } = assinatura;
    const user = periodo.funcionario.user;
    const mesNome = new Date(periodo.ano, periodo.mes - 1).toLocaleString("pt-BR", {
      month: "long"
    });
    const titulo = `Quadro de pontos assinado — ${mesNome}/${periodo.ano}`;
    const corpo = `O gestor assinou seu quadro de ponto de ${mesNome}/${periodo.ano}. O processo de assinatura foi concluído.`;
    const email = user?.emailReal ?? user?.email;

    if (email && (await this.notificacaoService.isEmailAtivoParaEvento("ASSINATURA_CONCLUIDA"))) {
      await this.notificacaoService.enviarEmailSistema(
        email,
        titulo,
        corpo,
        "ASSINATURA_CONCLUIDA"
      );
    }
    if (
      user?.externalId &&
      (await this.notificacaoService.isSistemaAtivoParaEvento("ASSINATURA_CONCLUIDA"))
    ) {
      await this.notificacaoService.criarNotificacaoParaUsuario(
        user.externalId,
        titulo,
        corpo,
        "ASSINATURA_CONCLUIDA"
      );
    }
  }
}

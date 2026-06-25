import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { intervaloDiaBrasilia } from "../../utils/horario-brasilia";
import {
  montarRelatorioQuadro,
  resolverJornadaHistoricoContexto
} from "../../utils/historico-quadro";
import {
  buildQuadroPdfDocDefinition,
  buildRascunhoPdfDocDefinition,
  loadAssetBase64
} from "./quadro-registro-pdf.builder";
import { getPdfFonts } from "./pdf-fonts";

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

@Injectable()
export class AssinaturaService {
  private readonly logger = new Logger(AssinaturaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoriaService: AuditoriaService
  ) {}

  /* ─── Cron: 00:05 UTC do 1º de cada mês (= 21:05 BRT do último dia do mês anterior) ─── */

  @Cron("5 0 1 * *")
  async criarAssinaturasAutomaticas() {
    const now = new Date();
    // getMonth() 0-indexed; no 1º do mês, getMonth() como número 1-indexed = mês anterior
    const mes = now.getMonth() === 0 ? 12 : now.getMonth();
    const ano = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    this.logger.log(`Cron: criando assinaturas para ${mes}/${ano}`);
    const { criadas, ignoradas } = await this.criarAssinaturasMensais(mes, ano);
    this.logger.log(`Assinaturas criadas: ${criadas}, ignoradas (já existiam): ${ignoradas}`);
  }

  /* ─── Criação batch (cron ou disparo manual pelo RH) ─── */

  async criarAssinaturasMensais(
    mes: number,
    ano: number
  ): Promise<{ criadas: number; ignoradas: number }> {
    const funcionarios = await this.prisma.funcionario.findMany({
      where: { ativo: true },
      select: { id: true }
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
      } catch (err) {
        this.logger.error(`Erro ao criar assinatura para funcionário ${func.id}: ${err}`);
      }
    }

    return { criadas, ignoradas };
  }

  /* ─── Busca assinatura do funcionário (por keycloakSub) — com lazy creation ─── */

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

    return this.prisma.assinaturaQuadro.findMany({
      where,
      include: { periodo: true },
      orderBy: { criadoEm: "desc" }
    });
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

    return this.prisma.assinaturaQuadro.update({
      where: { id: assinaturaId },
      data: {
        status: "PENDENTE_GESTOR",
        assinadoFuncionarioEm: new Date(),
        assinadoFuncionarioIp: meta.ipReal,
        assinadoFuncionarioIpGateway: meta.ipGateway,
        assinadoFuncionarioUserAgent: meta.userAgent,
        assinadoFuncionarioUserId: keycloakSub
      },
      include: { periodo: true }
    });
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

    return this.prisma.assinaturaQuadro.update({
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
      include: { periodo: true }
    });
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

    return this.prisma.assinaturaQuadro.findMany({
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

    return { total, page, limit, assinaturas };
  }

  /* ─── Metadados para filename do PDF ─── */

  async getAssinaturaParaPdf(id: string) {
    return this.prisma.assinaturaQuadro.findUnique({
      where: { id },
      include: { periodo: { include: { funcionario: true } } }
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

    const afastamentos = await this.prisma.afastamento.findMany({
      where: {
        funcionarioId,
        dataInicio: { lte: fimBuffer },
        dataFim: { gte: inicioBuffer }
      },
      orderBy: { dataInicio: "asc" }
    });

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
        jornadaPeriodo: { select: { jornadaDiariaMin: true } }
      }
    });
    const jornada = resolverJornadaHistoricoContexto(funcJornada);

    const { registros, afastamentos } = await this.buscarRegistrosEAfastamentos(
      funcionarioId,
      mes,
      ano
    );

    const mm = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const { inicio } = intervaloDiaBrasilia(`${ano}-${mm}-01`);
    const { fim } = intervaloDiaBrasilia(`${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`);

    const [feriados, cfg] = await Promise.all([
      this.prisma.feriadoConfig.findMany({
        where: { data: { gte: inicio, lte: fim } },
        select: { data: true, nome: true }
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

    return {
      relatorio: montarRelatorioQuadro(
        registros,
        afastamentos,
        mes,
        ano,
        jornada,
        feriados,
        cfg?.bancoHorasSabadoPct ?? 100,
        cfg?.bancoHorasDomingoPct ?? 200,
        cfg?.bancoHorasFeriadoPct ?? 200
      ),
      jornada
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

    const { relatorio, jornada } = await this.montarRelatorioParaPdf(funcionario.id, mes, ano);
    const jornadaHorasExibicao = Math.round(jornada.atualMin / 60);

    const logoBase64 = loadAssetBase64("logo.png");

    const docDefinition = buildRascunhoPdfDocDefinition({
      mes,
      ano,
      funcionario: {
        matricula: funcionario.matricula,
        cpf: funcionario.cpf,
        cargo: funcionario.cargo,
        section: funcionario.section,
        categoria: funcionario.categoria,
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
        bancoHorasSaldoTotalMinutos: 0
      },
      relatorio,
      logoBase64,
      certificadoBase64: null
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

  async gerarPdfQuadro(assinaturaId: string): Promise<Buffer> {
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
    const { relatorio } = await this.montarRelatorioParaPdf(funcionario.id, mes, ano);
    this.logger.log(`Relatório OK — ${relatorio.dias.length} dias`);

    const logoBase64 = loadAssetBase64("logo.png");
    const certificadoBase64 = loadAssetBase64("certificado-digital.png");
    if (logoBase64) this.logger.log("Logo carregada");
    else this.logger.warn("Logo não encontrada");
    if (certificadoBase64) this.logger.log("Ícone de certificado digital carregado");
    else this.logger.warn("Ícone de certificado digital não encontrado");

    const docDefinition = buildQuadroPdfDocDefinition({
      mes,
      ano,
      funcionario,
      assinatura,
      relatorio,
      logoBase64,
      certificadoBase64
    });

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
}

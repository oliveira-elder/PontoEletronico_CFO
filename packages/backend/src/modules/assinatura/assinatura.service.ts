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
import { NotificacaoService } from "../notificacao/notificacao.service";
import { ConfigSolicitacoesService } from "../ponto/config-solicitacoes.service";
import {
  hojeBrasiliaISO,
  intervaloColunaDate,
  intervaloDiaBrasilia
} from "../../utils/horario-brasilia";
import {
  montarRelatorioQuadro,
  resolverJornadaHistoricoContexto,
  type DiaQuadroPdf
} from "../../utils/historico-quadro";
import { enriquecerAfastamentosComSolicitacoes } from "../../utils/atestado-parcial-enrich";
import { inicioAtividadesUsuario } from "../../utils/inicio-atividades";
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

const STATUS_SOLICITACAO_EM_ANDAMENTO = [
  "PENDENTE",
  "AGUARDANDO_RH",
  "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
  "AGUARDANDO_GESTOR_RH"
] as const;

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
    `Há dias com cálculo de saldo irregular (status Falta ou Pendente) ou solicitações de correção em andamento.\n\n` +
    `Regularize esses registros para liberar a assinatura.\n\n` +
    `ATENÇÃO: depois de assinar, não será mais possível solicitar correção deste período.\n\n` +
    `Como regularizar\n\n` +
    `1. Acesse o sistema: ${urlHomeSistema()}\n` +
    `2. Abra Histórico e localize o mês da folha que precisa ser assinada (${periodo}).\n` +
    `3. Identifique os dias com status Falta ou Pendente.\n` +
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

@Injectable()
export class AssinaturaService {
  private readonly logger = new Logger(AssinaturaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoriaService: AuditoriaService,
    private readonly notificacaoService: NotificacaoService,
    private readonly configSolicitacoesService: ConfigSolicitacoesService
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

    const lista = await this.prisma.assinaturaQuadro.findMany({
      where,
      include: { periodo: true },
      orderBy: { criadoEm: "desc" }
    });

    return Promise.all(
      lista.map(async (item) => {
        const avaliacao = await this.avaliarSaldoFolha(
          item.periodo.funcionarioId,
          item.periodo.mes,
          item.periodo.ano
        );
        return { ...item, saldoRegularizado: avaliacao.saldoRegularizado };
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
      const { relatorio } = await this.montarRelatorioParaPdf(func.id, mes, ano);
      const diasOk = relatorio.dias.filter((d) => d.statusInterno === "OK").length;
      itens.push({
        ...assinatura,
        saldoRegularizado: avaliacao.saldoRegularizado,
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

    let saldoCicloMinutos = 0;
    for (const { mes, ano } of meses) {
      const { relatorio } = await this.montarRelatorioParaPdf(func.id, mes, ano);
      for (const d of relatorio.dias) {
        if (d.iso >= inicioIso && d.iso <= fimIso && d.saldoMin !== null) {
          saldoCicloMinutos += d.saldoMin;
        }
      }
    }

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
      throw new BadRequestException(
        "Há correções pendentes na folha de ponto. Regularize os dias com status Falta ou Pendente " +
          "antes de assinar. Depois de assinar, não será mais possível solicitar correção deste período."
      );
    }

    let bancoHorasSaldoTotalMinutos = assinatura.bancoHorasSaldoTotalMinutos;
    try {
      const { relatorio } = await this.montarRelatorioParaPdf(
        func.id,
        assinatura.periodo.mes,
        assinatura.periodo.ano
      );
      const badges = await this.montarResumoBadgesPdf(
        func.id,
        func.categoria,
        assinatura.periodo.mes,
        assinatura.periodo.ano,
        relatorio
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
      const { relatorio } = await this.montarRelatorioParaPdf(
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
        relatorio
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

    // BH da folha do período (igual ao PDF: acumulado anterior + saldo do mês).
    // Não usar saldoAtualMinutos ao vivo — muda a cada ciclo e diverge do quadro.
    for (const a of rows) {
      if (a.status !== "PENDENTE_GESTOR" && a.status !== "PENDENTE_FUNCIONARIO") continue;
      try {
        const funcionarioId = a.periodo.funcionarioId;
        const { relatorio } = await this.montarRelatorioParaPdf(
          funcionarioId,
          a.periodo.mes,
          a.periodo.ano
        );
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
          a.periodo.mes,
          a.periodo.ano,
          relatorio
        );
        const saldo = badges.totalAcumuladoMinutos;
        if (saldo !== a.bancoHorasSaldoTotalMinutos) {
          await this.prisma.assinaturaQuadro.update({
            where: { id: a.id },
            data: { bancoHorasSaldoTotalMinutos: saldo }
          });
          a.bancoHorasSaldoTotalMinutos = saldo;
        }
      } catch {
        /* mantém valor gravado */
      }
    }

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
      atestadoTempoRetornoMin: cfgSolicitacoes.atestadoTempoRetornoMin
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
        select: { data: true, nome: true, marcoHorario: true, marcoLado: true }
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
        cfg?.bancoHorasFeriadoPct ?? 200,
        inicioAtividadesUsuario(funcJornada?.user),
        { forcarSemIntervalo: categoriaSemIntervaloAlmoco(funcJornada?.categoria) }
      ),
      jornada
    };
  }

  /**
   * Dias Falta/Pendente (exceto o dia corrente) ou solicitações de correção/atestado
   * em andamento impedem a assinatura da folha.
   */
  private async avaliarSaldoFolha(
    funcionarioId: string,
    mes: number,
    ano: number
  ): Promise<{
    saldoRegularizado: boolean;
    temDiasIrregulares: boolean;
    temSolicitacoesPendentes: boolean;
  }> {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { categoria: true, isManager: true, isFiscal: true, registroPontoObrigatorio: true }
    });
    if (!func || funcionarioSemRegistroPonto(func)) {
      return {
        saldoRegularizado: true,
        temDiasIrregulares: false,
        temSolicitacoesPendentes: false
      };
    }

    let temDiasIrregulares = false;
    try {
      const { relatorio } = await this.montarRelatorioParaPdf(funcionarioId, mes, ano);
      const hojeIso = hojeBrasiliaISO();
      temDiasIrregulares = relatorio.dias.some(
        (d) => (d.statusInterno === "FALTA" || d.statusInterno === "PENDENTE") && d.iso !== hojeIso
      );
    } catch (err) {
      this.logger.warn(
        `avaliarSaldoFolha: falha ao montar relatório ${mes}/${ano} func ${funcionarioId}: ${String(err)}`
      );
      temDiasIrregulares = true;
    }

    const mm = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const { inicio } = intervaloDiaBrasilia(`${ano}-${mm}-01`);
    const { fim } = intervaloDiaBrasilia(`${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`);

    const solPendente = await this.prisma.solicitacao.findFirst({
      where: {
        funcionarioId,
        tipo: { in: ["CORRECAO_PONTO", "ATESTADO"] },
        status: { in: [...STATUS_SOLICITACAO_EM_ANDAMENTO] },
        OR: [
          { dataReferencia: { gte: inicio, lte: fim } },
          { dataInicio: { lte: fim }, dataFim: { gte: inicio } }
        ]
      },
      select: { id: true }
    });

    const temSolicitacoesPendentes = !!solPendente;
    return {
      temDiasIrregulares,
      temSolicitacoesPendentes,
      saldoRegularizado: !temDiasIrregulares && !temSolicitacoesPendentes
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
    }
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

    let saldoAcumuladoMesAnteriorMinutos = 0;
    if (!ocultarBancoHoras) {
      try {
        const bh = await this.auditoriaService.getBancoHorasFuncionario(funcionarioId);
        const mesPrefixInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const diasAntes = (bh.dias ?? [])
          .filter((d: { data: string }) => d.data < mesPrefixInicio)
          .sort((a: { data: string }, b: { data: string }) =>
            a.data < b.data ? -1 : a.data > b.data ? 1 : 0
          );
        if (diasAntes.length > 0) {
          saldoAcumuladoMesAnteriorMinutos =
            diasAntes[diasAntes.length - 1].saldoAcumuladoMinutos ?? 0;
        } else {
          const mesPrefix = `${ano}-${String(mes).padStart(2, "0")}`;
          const bancoMes = (bh.dias ?? [])
            .filter((d: { data: string }) => d.data.startsWith(mesPrefix))
            .sort((a: { data: string }, b: { data: string }) =>
              a.data < b.data ? -1 : a.data > b.data ? 1 : 0
            );
          if (bancoMes.length > 0) {
            const primeiro = bancoMes[0] as {
              saldoAcumuladoMinutos: number;
              saldoDiaMinutos: number;
            };
            saldoAcumuladoMesAnteriorMinutos =
              primeiro.saldoAcumuladoMinutos - primeiro.saldoDiaMinutos;
          }
        }
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
      totalAcumuladoMinutos: saldoAcumuladoMesAnteriorMinutos + saldoMesMinutos
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
    const resumoBadges = await this.montarResumoBadgesPdf(
      funcionario.id,
      funcionario.categoria,
      mes,
      ano,
      relatorio
    );

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
        .filter((d) => d.statusInterno === "OK" || d.statusInterno === "PENDENTE")
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
      .filter((d) => d.statusInterno === "OK" || d.statusInterno === "PENDENTE")
      .reduce((s, d) => s + d.horasMin, 0);
    const diasTrabalhados = dias.filter(
      (d) => d.horasMin > 0 && (d.statusInterno === "OK" || d.statusInterno === "PENDENTE")
    ).length;
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
      cicloBancoHoras: { inicio: inicioIso, fim: fimIso, mesesResumo },
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
    const resumoBadges = await this.montarResumoBadgesPdf(
      funcionario.id,
      funcionario.categoria,
      mes,
      ano,
      relatorio
    );

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
      certificadoBase64,
      resumoBadges
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

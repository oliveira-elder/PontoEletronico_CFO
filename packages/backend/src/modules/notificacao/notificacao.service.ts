import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { PrismaService } from "../../prisma/prisma.service";
import { isGerenciaRh } from "../../common/gerencia-rh.util";
import {
  dataBrasiliaISO,
  hojeBrasiliaISO,
  intervaloDiaBrasilia
} from "../../utils/horario-brasilia";
import {
  categoriaSemIntervaloAlmoco,
  categoriaSemRegistroPonto,
  diaSemObrigacaoPonto
} from "../../utils/categoria-jornada";
import { ensureCategoriaHistorico } from "../../utils/categoria-historico";
import { cicloPontoIncompleto, faltantesCicloPonto } from "../../utils/calc-horas-trabalhadas";
import { observacaoTurnoSemIntervalo } from "../../utils/turno-entrada";
import {
  isAfastamentoParcial,
  atestadoParcialDispensaSaida,
  dispensarAlmocoPorAtestadoParcial
} from "../../utils/jornada-historico";
import { enriquecerAfastamentosComSolicitacoes } from "../../utils/atestado-parcial-enrich";

export interface DestinatarioNotificacao {
  externalId: string | null;
  email: string | null;
  emailReal?: string | null;
}

export interface EmailConfigDto {
  provedor: "LOCAWEB" | "MICROSOFT";
  host: string;
  porta: number;
  seguranca: "NONE" | "SSL" | "STARTTLS";
  usuario: string;
  /** Se omitido na atualização, mantém a senha já salva */
  senha?: string;
  nomeRemetente: string;
  emailRemetente: string;
  ativo: boolean;
}

export interface NotificacaoConfigDto {
  ativoEmail?: boolean;
  ativoSistema?: boolean;
}

export interface EnviarManualDto {
  destinatarios: string[];
  assunto: string;
  corpo: string;
  tipoEnvio?: "email" | "sistema" | "ambos";
}

// Eventos conhecidos — usados para garantir linhas default no banco
export const EVENTOS_NOTIFICACAO = [
  {
    id: "ASSINAR_QUADRO",
    titulo: "Assinar Quadro de Pontos",
    descricao:
      "Notifica o funcionário para assinar o quadro de pontos após o fechamento mensal. " +
      "Disparado automaticamente no 1º dia de cada mês, junto com a criação das assinaturas.",
    destinatario: "Funcionário",
    gatilho: "Automático — 1º dia de cada mês"
  },
  {
    id: "ASSINAR_QUADRO_GESTOR",
    titulo: "Quadro Aguardando Assinatura do Gestor",
    descricao:
      "Notifica o gestor quando um funcionário da sua equipe assinou o quadro de pontos " +
      "e está aguardando aprovação do gestor.",
    destinatario: "Gestor",
    gatilho: "Automático — ao funcionário assinar o quadro"
  },
  {
    id: "FERIAS_OBRIGATORIO",
    titulo: "Agendar Férias — Período Obrigatório",
    descricao:
      "Notifica o funcionário quando está no período obrigatório de agendamento de férias " +
      "(a partir do 11º mês do ciclo anual; 5º mês para estagiários). " +
      "Verificação mensal automática.",
    destinatario: "Funcionário",
    gatilho: "Automático — mensal, para funcionários no período obrigatório"
  },
  {
    id: "SOLICITACAO_APROVADA",
    titulo: "Solicitação Aprovada",
    descricao:
      "Notifica o funcionário quando uma solicitação (férias, atestado, licença, etc.) " +
      "foi aprovada pelo RH.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao aprovar solicitação"
  },
  {
    id: "SOLICITACAO_RECUSADA",
    titulo: "Solicitação Recusada",
    descricao:
      "Notifica o funcionário quando uma solicitação foi recusada pelo RH, " +
      "incluindo a justificativa informada.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao recusar solicitação"
  },
  {
    id: "BANCO_HORAS_VENCIMENTO",
    titulo: "Banco de Horas — Alerta de Vencimento",
    descricao:
      "Notifica o funcionário quando o saldo de banco de horas está próximo do vencimento, " +
      "conforme a data de marco configurada no sistema.",
    destinatario: "Funcionário",
    gatilho: "Automático — mensal"
  },
  {
    id: "ASSINATURA_CONCLUIDA",
    titulo: "Quadro Totalmente Assinado",
    descricao:
      "Notifica o funcionário quando o gestor assinou o quadro de pontos e o processo " +
      "de assinatura foi concluído.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao gestor concluir a assinatura"
  },
  {
    id: "SOLICITACAO_NOVA_GESTOR",
    titulo: "Nova Solicitação — Aviso ao Gestor",
    descricao:
      "Notifica o gestor quando um funcionário da sua equipe abre uma nova solicitação " +
      "(férias, atestado, licença, correção de ponto etc.).",
    destinatario: "Gestor",
    gatilho: "Automático — ao funcionário criar solicitação"
  },
  {
    id: "SOLICITACAO_AGUARDANDO_RH",
    titulo: "Solicitação Aguardando RH",
    descricao:
      "Notifica a equipe de RH quando o gestor aprova uma solicitação e ela passa " +
      "para análise do RH.",
    destinatario: "RH",
    gatilho: "Automático — ao gestor encaminhar para o RH"
  },
  {
    id: "RH_DOCUMENTO_ENVIADO",
    titulo: "Documento Enviado pelo RH",
    descricao:
      "Notifica o funcionário quando o RH envia a guia médica ou a folha de pagamento " +
      "de férias para assinatura.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao RH enviar guia ou folha de férias"
  },
  {
    id: "DOCUMENTO_RETORNO_PENDENTE",
    titulo: "Documento de Retorno Pendente",
    descricao:
      "Notifica o funcionário quando é necessário enviar o documento de retorno " +
      "(atestado assinado, folha de férias assinada etc.).",
    destinatario: "Funcionário",
    gatilho: "Automático — ao solicitar documento de retorno"
  },
  {
    id: "REGISTRO_PONTO",
    titulo: "Registro de Ponto",
    descricao:
      "Notifica o gestor quando um funcionário da equipe registra entrada ou saída " +
      "no ponto eletrônico.",
    destinatario: "Gestor",
    gatilho: "Automático — ao registrar entrada ou saída"
  },
  {
    id: "AFASTAMENTO_REGISTRADO",
    titulo: "Afastamento Registrado",
    descricao:
      "Notifica o funcionário quando um afastamento (férias, atestado, licença, abono) " +
      "é registrado após aprovação da solicitação.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao aprovar solicitação com afastamento"
  },
  {
    id: "PERIODO_FECHADO",
    titulo: "Período de Ponto Fechado",
    descricao: "Notifica o funcionário quando o período mensal de ponto é fechado pelo RH.",
    destinatario: "Funcionário",
    gatilho: "Automático — ao fechar período"
  },
  {
    id: "REQUISICAO_RH",
    titulo: "Requisição do RH",
    descricao:
      "Notifica o funcionário quando o RH cria uma requisição dirigida a ele " +
      "(periódico, exame médico, férias, assinatura de documentos etc.).",
    destinatario: "Funcionário",
    gatilho: "Automático — ao RH criar requisição"
  },
  {
    id: "PAPEL_CRITICO_DESATIVADO",
    titulo: "Supervisor ou Gerente Substituto Desativado",
    descricao:
      "Notifica toda a equipe de RH quando um Supervisor de Estágio (estagiário/menor aprendiz) " +
      "ou um Gerente Substituto em exercício é desativado, para providenciar substituição imediata.",
    destinatario: "RH",
    gatilho: "Automático — ao desativar funcionário com papel crítico ativo"
  },
  {
    id: "REGISTRO_PONTO_INCOMPLETO",
    titulo: "Registro de Ponto Incompleto — Solicitar Correção",
    descricao:
      "Notifica o funcionário na virada do dia (00:01) quando faltou algum registro de ponto " +
      "no dia anterior (entrada, intervalo de almoço ou saída). Solicita abertura de correção de ponto.",
    destinatario: "Funcionário",
    gatilho: "Automático — diário às 00:01 (Brasília)"
  },
  {
    id: "SUPER_ADMIN_CONCEDIDO",
    titulo: "Super Administrador Concedido",
    descricao:
      "Notifica o gerente da GERTI, o responsável de RH e o usuário afetado quando " +
      "um Super Administrador concede a permissão a outro usuário da GERTI.",
    destinatario: "Gerente GERTI, Responsável RH e usuário",
    gatilho: "Automático — ao conceder Super Admin"
  },
  {
    id: "SUPER_ADMIN_REVOGADO",
    titulo: "Super Administrador Revogado",
    descricao:
      "Notifica o gerente da GERTI, o responsável de RH e o usuário afetado quando " +
      "uma concessão de Super Administrador é revogada.",
    destinatario: "Gerente GERTI, Responsável RH e usuário",
    gatilho: "Automático — ao revogar Super Admin"
  },
  {
    id: "SISTEMA_START_SOLICITADO",
    titulo: "Start do Sistema — Aguardando GERTI",
    descricao:
      "Notifica o responsável da GERTI quando um Super Administrador solicita o Start " +
      "(go-live) do sistema para um mês de referência.",
    destinatario: "Gerente GERTI",
    gatilho: "Automático — ao solicitar Start"
  },
  {
    id: "SISTEMA_START_AGUARDANDO_RH",
    titulo: "Start do Sistema — Aguardando RH",
    descricao:
      "Notifica o responsável da gerência de RH quando a GERTI aprova a solicitação de Start.",
    destinatario: "Responsável RH",
    gatilho: "Automático — ao GERTI aprovar Start"
  },
  {
    id: "SISTEMA_START_APROVADO",
    titulo: "Start do Sistema Executado",
    descricao:
      "Notifica as partes envolvidas quando o Start é aprovado pelo RH e o go-live é executado " +
      "(marco de banco de horas e início de produção).",
    destinatario: "Solicitante, GERTI e RH",
    gatilho: "Automático — ao RH aprovar e executar Start"
  },
  {
    id: "SISTEMA_START_REJEITADO",
    titulo: "Start do Sistema Rejeitado",
    descricao: "Notifica as partes envolvidas quando a solicitação de Start é rejeitada.",
    destinatario: "Solicitante, GERTI e RH",
    gatilho: "Automático — ao rejeitar Start"
  }
];

/** Eventos que devem nascer (e permanecer default) com e-mail + sistema ativos. */
export const EVENTOS_NOTIFICACAO_CRITICOS = new Set([
  "PAPEL_CRITICO_DESATIVADO",
  "SUPER_ADMIN_CONCEDIDO",
  "SUPER_ADMIN_REVOGADO",
  "SISTEMA_START_SOLICITADO",
  "SISTEMA_START_AGUARDANDO_RH",
  "SISTEMA_START_APROVADO",
  "SISTEMA_START_REJEITADO"
]);

@Injectable()
export class NotificacaoService {
  private readonly logger = new Logger(NotificacaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ── Configuração de E-mail ── */

  async getEmailConfig() {
    const cfg = await this.prisma.configuracaoEmail.findUnique({
      where: { id: "singleton" }
    });
    if (!cfg) return null;
    // Nunca retorna a senha para o frontend
    const { senha: _, ...rest } = cfg;
    return { ...rest, senhaDefinida: !!_ };
  }

  async salvarEmailConfig(dto: EmailConfigDto) {
    const senhaFinal = await this.resolveSenha(dto.senha);

    await this.prisma.configuracaoEmail.upsert({
      where: { id: "singleton" },
      create: {
        provedor: dto.provedor,
        host: dto.host,
        porta: dto.porta,
        seguranca: dto.seguranca,
        usuario: dto.usuario,
        senha: senhaFinal,
        nomeRemetente: dto.nomeRemetente,
        emailRemetente: dto.emailRemetente,
        ativo: dto.ativo
      },
      update: {
        provedor: dto.provedor,
        host: dto.host,
        porta: dto.porta,
        seguranca: dto.seguranca,
        usuario: dto.usuario,
        senha: senhaFinal,
        nomeRemetente: dto.nomeRemetente,
        emailRemetente: dto.emailRemetente,
        ativo: dto.ativo
      }
    });

    return { ok: true };
  }

  async testarEmailConfig(dto: EmailConfigDto & { emailTeste: string }) {
    const senha = await this.resolveSenha(dto.senha);
    const cfg: EmailConfigDto = { ...dto, senha };
    this.assertCredenciaisSmtp(cfg);
    const transporter = this.buildTransporter(cfg);
    try {
      await transporter.verify();
    } catch (err) {
      throw new BadRequestException(
        `Falha na conexão SMTP: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    try {
      await transporter.sendMail({
        from: `"${cfg.nomeRemetente}" <${cfg.emailRemetente}>`,
        to: dto.emailTeste,
        subject: "Teste de configuração de e-mail — Ponto Eletrônico",
        text: "Se você recebeu este e-mail, a configuração SMTP está funcionando corretamente."
      });
    } catch (err) {
      throw new BadRequestException(
        `Conexão OK, mas envio falhou: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return { ok: true };
  }

  /* ── Configuração de Notificações ── */

  async getNotificacaoConfigs() {
    // Garante que todos os eventos conhecidos têm uma linha no banco
    const ids = EVENTOS_NOTIFICACAO.map((e) => e.id);
    const existentes = await this.prisma.configuracaoNotificacao.findMany({
      where: { id: { in: ids } }
    });
    const existentesIds = new Set(existentes.map((e) => e.id));
    const faltando = ids.filter((id) => !existentesIds.has(id));

    if (faltando.length > 0) {
      await this.prisma.configuracaoNotificacao.createMany({
        data: faltando.map((id) => ({
          id,
          ativoEmail: EVENTOS_NOTIFICACAO_CRITICOS.has(id),
          ativoSistema: EVENTOS_NOTIFICACAO_CRITICOS.has(id)
        })),
        skipDuplicates: true
      });
    }

    /* Corrige eventos críticos criados antes com ambos os canais desligados. */
    await this.garantirEventosCriticos();

    const todos = await this.prisma.configuracaoNotificacao.findMany({
      where: { id: { in: ids } }
    });

    // Mescla metadados estáticos com configurações do banco
    return EVENTOS_NOTIFICACAO.map((evento) => {
      const cfg = todos.find((c) => c.id === evento.id);
      return {
        ...evento,
        ativoEmail: cfg?.ativoEmail ?? false,
        ativoSistema: cfg?.ativoSistema ?? false
      };
    });
  }

  async upsertNotificacaoConfig(id: string, dto: NotificacaoConfigDto) {
    if (!EVENTOS_NOTIFICACAO.some((e) => e.id === id)) {
      throw new BadRequestException(`Evento de notificação desconhecido: ${id}`);
    }
    if (dto.ativoEmail === undefined && dto.ativoSistema === undefined) {
      throw new BadRequestException("Informe ao menos um canal para atualizar.");
    }

    const existente = await this.prisma.configuracaoNotificacao.findUnique({ where: { id } });
    const ativoEmail = dto.ativoEmail ?? existente?.ativoEmail ?? false;
    const ativoSistema = dto.ativoSistema ?? existente?.ativoSistema ?? false;

    await this.prisma.configuracaoNotificacao.upsert({
      where: { id },
      create: { id, ativoEmail, ativoSistema },
      update: {
        ...(dto.ativoEmail !== undefined ? { ativoEmail: dto.ativoEmail } : {}),
        ...(dto.ativoSistema !== undefined ? { ativoSistema: dto.ativoSistema } : {})
      }
    });
    return { ok: true };
  }

  /* ── Envio Manual ── */

  async enviarManual(dto: EnviarManualDto) {
    const tipo = dto.tipoEnvio ?? "email";

    if (!dto.destinatarios.length) {
      throw new BadRequestException("Nenhum destinatário informado.");
    }

    const erros: string[] = [];
    let enviados = 0;

    // Envio por e-mail
    if (tipo === "email" || tipo === "ambos") {
      const cfg = await this.prisma.configuracaoEmail.findUnique({ where: { id: "singleton" } });
      if (!cfg?.ativo) {
        throw new BadRequestException(
          "Configuração de e-mail não está ativa. Configure o SMTP primeiro."
        );
      }
      if (!cfg.senha || !cfg.usuario) {
        throw new BadRequestException(
          "Credenciais SMTP incompletas. Salve usuário e senha na configuração de e-mail."
        );
      }
      const transporter = this.buildTransporter(cfg as EmailConfigDto);
      for (const email of dto.destinatarios) {
        try {
          await transporter.sendMail({
            from: `"${cfg.nomeRemetente}" <${cfg.emailRemetente}>`,
            to: email,
            subject: dto.assunto,
            html: dto.corpo.replace(/\n/g, "<br>")
          });
          enviados++;
        } catch (err) {
          erros.push(`${email}: ${err instanceof Error ? err.message : String(err)}`);
          this.logger.error(`Falha ao enviar para ${email}: ${String(err)}`);
        }
      }
    }

    // Notificação no sistema (sino / página de notificações)
    if (tipo === "sistema" || tipo === "ambos") {
      const usuarios = await this.prisma.user.findMany({
        where: {
          externalId: { not: null },
          OR: [{ email: { in: dto.destinatarios } }, { emailReal: { in: dto.destinatarios } }]
        },
        select: { externalId: true, email: true, emailReal: true }
      });

      const encontrados = new Set(
        usuarios.flatMap((u) => [u.email, u.emailReal].filter(Boolean) as string[])
      );

      for (const user of usuarios) {
        if (!user.externalId) continue;
        try {
          await this.criarNotificacaoParaUsuario(user.externalId, dto.assunto, dto.corpo, "MANUAL");
          enviados++;
        } catch (err) {
          const ref = user.emailReal ?? user.email;
          erros.push(`${ref}: ${err instanceof Error ? err.message : String(err)}`);
          this.logger.error(`Falha ao criar notificação para ${ref}: ${String(err)}`);
        }
      }

      for (const dest of dto.destinatarios) {
        if (!encontrados.has(dest)) {
          erros.push(`${dest}: usuário não encontrado no sistema`);
        }
      }
    }

    return { enviados, erros };
  }

  /* ── Busca de e-mails de funcionários ── */

  async getEmailsFuncionarios(grupo: "todos" | "gestores" | "funcionarios") {
    const users = await this.prisma.user.findMany({
      where: {
        funcionario: {
          isNot: null,
          ...(grupo === "gestores"
            ? {
                gerenciaResponsavel: {
                  isNot: null
                }
              }
            : {})
        }
      },
      select: {
        name: true,
        email: true,
        emailReal: true,
        funcionario: { select: { cargo: true } }
      }
    });

    return users
      .map((u) => ({ name: u.name, email: u.emailReal ?? u.email }))
      .filter((u) => u.email);
  }

  /* ── Helpers internos ── */

  private async resolveSenha(senhaInformada?: string): Promise<string | undefined> {
    if (senhaInformada && senhaInformada.trim() !== "") {
      return senhaInformada.trim();
    }
    const atual = await this.prisma.configuracaoEmail.findUnique({
      where: { id: "singleton" },
      select: { senha: true }
    });
    return atual?.senha ?? undefined;
  }

  private assertCredenciaisSmtp(cfg: Pick<EmailConfigDto, "usuario" | "senha">) {
    if (!cfg.usuario?.trim() || !cfg.senha) {
      throw new BadRequestException(
        "Usuário e senha SMTP são obrigatórios. Informe a senha ou salve a configuração antes de testar."
      );
    }
  }

  private buildTransporter(
    cfg: Pick<EmailConfigDto, "host" | "porta" | "seguranca" | "usuario" | "senha">
  ): Transporter {
    const secure = cfg.seguranca === "SSL";
    const port = cfg.porta ?? (secure ? 465 : 587);

    return nodemailer.createTransport({
      host: cfg.host ?? "",
      port,
      secure,
      ...(cfg.seguranca === "STARTTLS" ? { requireTLS: true } : {}),
      auth: {
        user: cfg.usuario!.trim(),
        pass: cfg.senha!
      },
      tls: { rejectUnauthorized: false }
    });
  }

  /** Verifica se o envio de e-mail está configurado e ativo para um evento específico */
  async isEmailAtivoParaEvento(eventoId: string): Promise<boolean> {
    const cfg = await this.prisma.configuracaoEmail.findUnique({ where: { id: "singleton" } });
    if (!cfg?.ativo) return false;
    await this.ensureEventoRow(eventoId);
    const evento = await this.prisma.configuracaoNotificacao.findUnique({
      where: { id: eventoId }
    });
    return evento?.ativoEmail ?? false;
  }

  /** Verifica se a notificação no sistema está ativa para um evento específico */
  async isSistemaAtivoParaEvento(eventoId: string): Promise<boolean> {
    await this.ensureEventoRow(eventoId);
    const evento = await this.prisma.configuracaoNotificacao.findUnique({
      where: { id: eventoId }
    });
    return evento?.ativoSistema ?? false;
  }

  /**
   * Garante linha do evento no banco. Eventos críticos mantêm e-mail + sistema ativos
   * (reativa canal individualmente se estiver desligado por seed antigo).
   */
  async ensureEventoRow(eventoId: string): Promise<void> {
    const existente = await this.prisma.configuracaoNotificacao.findUnique({
      where: { id: eventoId }
    });
    if (!existente) {
      const critico = EVENTOS_NOTIFICACAO_CRITICOS.has(eventoId);
      await this.prisma.configuracaoNotificacao.create({
        data: { id: eventoId, ativoEmail: critico, ativoSistema: critico }
      });
      return;
    }
    if (!EVENTOS_NOTIFICACAO_CRITICOS.has(eventoId)) return;

    const data: { ativoEmail?: boolean; ativoSistema?: boolean } = {};
    if (!existente.ativoEmail) data.ativoEmail = true;
    if (!existente.ativoSistema) data.ativoSistema = true;
    if (Object.keys(data).length > 0) {
      await this.prisma.configuracaoNotificacao.update({
        where: { id: eventoId },
        data
      });
    }
  }

  /** E-mail entregável: preferir emailReal; ignorar máscaras SSO. */
  private emailEntregavel(dest: DestinatarioNotificacao): string | null {
    const candidatos = [dest.emailReal, dest.email]
      .map((e) => (e ?? "").trim().toLowerCase())
      .filter(Boolean);
    const fake = ["sso.local", "pending.local"];
    for (const e of candidatos) {
      const domain = e.includes("@") ? e.split("@")[1] : "";
      if (domain && !fake.includes(domain)) return e;
    }
    return null;
  }

  async garantirEventosCriticos(): Promise<void> {
    for (const id of EVENTOS_NOTIFICACAO_CRITICOS) {
      await this.ensureEventoRow(id);
    }
  }

  /** Dispara e-mail e/ou notificação no sistema para uma lista de destinatários */
  async dispararEvento(
    eventoId: string,
    titulo: string,
    corpo: string,
    destinatarios: DestinatarioNotificacao[]
  ): Promise<void> {
    await this.ensureEventoRow(eventoId);

    const [emailAtivo, sistemaAtivo] = await Promise.all([
      this.isEmailAtivoParaEvento(eventoId),
      this.isSistemaAtivoParaEvento(eventoId)
    ]);
    if (!emailAtivo && !sistemaAtivo) {
      this.logger.warn(
        `Evento ${eventoId}: canais inativos (email=${emailAtivo}, sistema=${sistemaAtivo}).`
      );
      return;
    }

    const unicos = new Map<string, DestinatarioNotificacao>();
    for (const dest of destinatarios) {
      const chave = dest.externalId ?? dest.emailReal ?? dest.email ?? "";
      if (!chave || unicos.has(chave)) continue;
      unicos.set(chave, dest);
    }

    if (unicos.size === 0) {
      this.logger.warn(`Evento ${eventoId}: nenhum destinatário válido (lista vazia).`);
      return;
    }

    this.logger.log(
      `Evento ${eventoId}: enviando para ${unicos.size} destinatário(s) (email=${emailAtivo}, sistema=${sistemaAtivo}).`
    );

    let emailsEnviados = 0;
    for (const dest of unicos.values()) {
      const email = this.emailEntregavel(dest);
      if (emailAtivo) {
        if (email) {
          await this.enviarEmailSistema(email, titulo, corpo)
            .then(() => {
              emailsEnviados++;
            })
            .catch((e) => this.logger.error(`Falha ${eventoId} email para ${email}: ${e}`));
        } else {
          this.logger.warn(
            `Evento ${eventoId}: sem e-mail entregável (externalId=${dest.externalId ?? "n/a"}, email=${dest.email ?? "n/a"}, emailReal=${dest.emailReal ?? "n/a"}).`
          );
        }
      }
      if (sistemaAtivo && dest.externalId) {
        await this.criarNotificacaoParaUsuario(dest.externalId, titulo, corpo, eventoId).catch(
          (e) => this.logger.error(`Falha ${eventoId} sistema para ${dest.externalId}: ${e}`)
        );
      } else if (sistemaAtivo && !dest.externalId) {
        this.logger.warn(
          `Evento ${eventoId}: destinatário sem externalId (e-mail=${email ?? "n/a"}) — skip sistema.`
        );
      }
    }

    if (emailAtivo && emailsEnviados === 0) {
      this.logger.warn(
        `Evento ${eventoId}: canal e-mail ativo, mas nenhum e-mail foi enviado (SMTP/destinatários).`
      );
    }
  }

  async getGestorDoFuncionario(funcionarioId: string): Promise<DestinatarioNotificacao | null> {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        section: true,
        categoria: true,
        supervisorEstagioId: true,
        supervisorEstagio: {
          select: {
            ativo: true,
            user: { select: { externalId: true, email: true, emailReal: true } }
          }
        },
        gerencia: { select: { responsavelUserId: true } }
      }
    });
    if (!func) return null;

    const isEstagio = func.categoria === "ESTAGIARIO" || func.categoria === "MENOR_APRENDIZ";
    if (isEstagio && func.supervisorEstagio?.user && func.supervisorEstagio.ativo !== false) {
      return func.supervisorEstagio.user;
    }

    if (func.gerencia?.responsavelUserId) {
      const gestor = await this.prisma.user.findUnique({
        where: { id: func.gerencia.responsavelUserId },
        select: { externalId: true, email: true, emailReal: true }
      });
      if (gestor) return gestor;
    }

    // Fallback: gerente da mesma seção (hierarquia da API de ramais)
    if (func.section) {
      const gestorFunc = await this.prisma.funcionario.findFirst({
        where: { section: func.section, isManager: true, ativo: true },
        select: { user: { select: { externalId: true, email: true, emailReal: true } } },
        orderBy: { createdAt: "asc" }
      });
      if (gestorFunc?.user) return gestorFunc.user;
    }

    return null;
  }

  async getFuncionarioDestinatario(funcionarioId: string): Promise<DestinatarioNotificacao | null> {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { user: { select: { externalId: true, email: true, emailReal: true } } }
    });
    return func?.user ?? null;
  }

  async getUsuariosRh(): Promise<DestinatarioNotificacao[]> {
    const gerencias = await this.prisma.gerencia.findMany({
      select: { id: true, nome: true, sigla: true }
    });
    const rhIds = gerencias.filter((g) => isGerenciaRh(g)).map((g) => g.id);
    if (!rhIds.length) return [];

    const funcs = await this.prisma.funcionario.findMany({
      where: { ativo: true, gerenciaId: { in: rhIds } },
      select: { user: { select: { externalId: true, email: true, emailReal: true } } }
    });

    return funcs
      .map((f) => f.user)
      .filter((u) => u != null)
      .map((u) => ({
        externalId: u.externalId,
        email: u.email ?? null,
        emailReal: u.emailReal
      }));
  }

  /**
   * Quando um Supervisor de Estágio ou Gerente Substituto em exercício é desativado,
   * alerta todo o RH para substituição imediata.
   */
  async notificarRhPapelCriticoDesativado(funcionarioId: string): Promise<void> {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        id: true,
        matricula: true,
        categoria: true,
        user: { select: { name: true, email: true, emailReal: true } },
        gerencia: { select: { nome: true, sigla: true } }
      }
    });
    if (!func) return;

    const supervisionados = await this.prisma.funcionario.findMany({
      where: {
        supervisorEstagioId: funcionarioId,
        categoria: { in: ["ESTAGIARIO", "MENOR_APRENDIZ"] }
      },
      select: {
        categoria: true,
        user: { select: { name: true } },
        gerencia: { select: { nome: true, sigla: true } }
      }
    });

    const substituicaoAtiva = await this.prisma.gerenteSubstituicao.findFirst({
      where: { substitutoId: funcionarioId, status: "ATIVA" },
      select: {
        dataInicio: true,
        dataFim: true,
        gerencia: { select: { nome: true, sigla: true } },
        titular: { select: { user: { select: { name: true } }, matricula: true } }
      }
    });

    if (!supervisionados.length && !substituicaoAtiva) return;

    const nome = func.user?.name ?? "Funcionário";
    const matr = func.matricula ? ` (matrícula ${func.matricula})` : "";
    const gerenciaLabel = func.gerencia
      ? `${func.gerencia.sigla || func.gerencia.nome}`
      : "sem gerência";

    const partes: string[] = [
      `${nome}${matr}, da gerência ${gerenciaLabel}, foi desativado(a) no sistema e ocupava papel(is) crítico(s) que exigem substituição imediata:`
    ];

    if (supervisionados.length) {
      const lista = supervisionados
        .map((s) => {
          const cat = s.categoria === "MENOR_APRENDIZ" ? "Menor Aprendiz" : "Estagiário";
          return `• ${s.user?.name ?? "—"} (${cat}${s.gerencia ? ` — ${s.gerencia.sigla || s.gerencia.nome}` : ""})`;
        })
        .join("\n");
      partes.push(
        `\nSupervisor de Estágio — ${supervisionados.length} supervisionado(s) sem supervisor ativo:\n${lista}`
      );
    }

    if (substituicaoAtiva) {
      const titularNome = substituicaoAtiva.titular.user?.name ?? "titular";
      const g = substituicaoAtiva.gerencia.sigla || substituicaoAtiva.gerencia.nome || "gerência";
      const ini = new Date(substituicaoAtiva.dataInicio).toLocaleDateString("pt-BR");
      const fim = new Date(substituicaoAtiva.dataFim).toLocaleDateString("pt-BR");
      partes.push(
        `\nGerente Substituto em exercício na ${g} (titular: ${titularNome}; período ${ini}–${fim}). ` +
          `A gerência ficou sem substituto ativo — reatribuir ou encerrar a substituição.`
      );
    }

    partes.push(
      "\n\nAcesse Gestão de Funcionários para designar novo supervisor e/ou gerente substituto."
    );

    const titulo = `Ação urgente RH — ${nome} desativado com papel crítico`;
    const corpo = partes.join("");

    // Garante linha de config (habilitada por padrão na primeira criação)
    await this.getNotificacaoConfigs();

    const rh = await this.getUsuariosRh();
    if (!rh.length) {
      this.logger.warn(
        `PAPEL_CRITICO_DESATIVADO: ${nome} desativado, mas nenhum destinatário RH encontrado.`
      );
      return;
    }

    await this.dispararEvento("PAPEL_CRITICO_DESATIVADO", titulo, corpo, rh);
    this.logger.log(
      `PAPEL_CRITICO_DESATIVADO enviado ao RH (${rh.length}) — funcionarioId=${funcionarioId}`
    );
  }

  async getDestinatariosFuncionarios(funcionarioIds: string[]): Promise<DestinatarioNotificacao[]> {
    if (!funcionarioIds.length) return [];
    const funcs = await this.prisma.funcionario.findMany({
      where: { id: { in: funcionarioIds } },
      select: { user: { select: { externalId: true, email: true, emailReal: true } } }
    });
    return funcs
      .map((f) => f.user)
      .filter((u) => u != null)
      .map((u) => ({
        externalId: u.externalId,
        email: u.email ?? null,
        emailReal: u.emailReal
      }));
  }

  /** Envia e-mail de sistema para um endereço, se configurado */
  async enviarEmailSistema(to: string, subject: string, body: string): Promise<void> {
    const cfg = await this.prisma.configuracaoEmail.findUnique({ where: { id: "singleton" } });
    if (!cfg?.ativo) {
      this.logger.warn(`enviarEmailSistema: SMTP inativo — não enviou para ${to}.`);
      return;
    }
    if (!cfg.senha) {
      this.logger.warn(`enviarEmailSistema: senha SMTP ausente — não enviou para ${to}.`);
      return;
    }

    try {
      const transporter = this.buildTransporter(cfg as EmailConfigDto);
      await transporter.sendMail({
        from: `"${cfg.nomeRemetente}" <${cfg.emailRemetente}>`,
        to,
        subject,
        html: body.replace(/\n/g, "<br>")
      });
      this.logger.log(`E-mail enviado para ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail de sistema para ${to}: ${String(err)}`);
      throw err;
    }
  }

  /* ── Notificações do usuário (bell icon) ── */

  /** Cria uma notificação para um usuário a partir do seu Keycloak sub */
  async criarNotificacaoParaUsuario(
    userExternalId: string,
    titulo: string,
    corpo?: string,
    tipo?: string
  ) {
    return this.prisma.notificacao.create({
      data: { userExternalId, titulo, corpo, tipo }
    });
  }

  async getMinhasNotificacoes(keycloakSub: string, limit = 50) {
    return this.prisma.notificacao.findMany({
      where: { userExternalId: keycloakSub },
      orderBy: { criadoEm: "desc" },
      take: limit
    });
  }

  async contarNaoLidas(keycloakSub: string) {
    const [total, ultima] = await Promise.all([
      this.prisma.notificacao.count({
        where: { userExternalId: keycloakSub, lida: false }
      }),
      this.prisma.notificacao.findFirst({
        where: { userExternalId: keycloakSub },
        orderBy: { criadoEm: "desc" }
      })
    ]);
    return { total, ultima };
  }

  async marcarLida(id: string, keycloakSub: string) {
    const notif = await this.prisma.notificacao.findUnique({ where: { id } });
    if (!notif || notif.userExternalId !== keycloakSub) return null;
    return this.prisma.notificacao.update({ where: { id }, data: { lida: true } });
  }

  async marcarTodasLidas(keycloakSub: string) {
    const { count } = await this.prisma.notificacao.updateMany({
      where: { userExternalId: keycloakSub, lida: false },
      data: { lida: true }
    });
    return { atualizadas: count };
  }

  /* ─── Crons automáticos ─── */

  /* Roda no 1º de cada mês às 08:00 UTC — verifica férias obrigatórias */
  @Cron("0 8 1 * *")
  async verificarFeriasObrigatorio() {
    const eventoId = "FERIAS_OBRIGATORIO";
    const [emailAtivo, sistemaAtivo] = await Promise.all([
      this.isEmailAtivoParaEvento(eventoId),
      this.isSistemaAtivoParaEvento(eventoId)
    ]);
    if (!emailAtivo && !sistemaAtivo) return;

    const agora = new Date();
    const mesAtual = agora.getMonth() + 1; // 1-12

    const funcionarios = await this.prisma.funcionario.findMany({
      where: { ativo: true, dataAdmissao: { not: null } },
      select: {
        id: true,
        dataAdmissao: true,
        categoria: true,
        user: { select: { externalId: true, email: true, emailReal: true } }
      }
    });

    for (const func of funcionarios) {
      if (!func.dataAdmissao || !func.user) continue;

      const mesAdmissao = func.dataAdmissao.getMonth() + 1; // 1-12
      const mesNoCiclo = ((mesAtual - mesAdmissao + 12) % 12) + 1;
      const limiteObrigatorio = func.categoria === "ESTAGIARIO" ? 5 : 11;
      if (mesNoCiclo < limiteObrigatorio) continue;

      // Verifica se já há férias aprovadas ou solicitadas no ciclo atual
      const anoAdmissao = func.dataAdmissao.getFullYear();
      const anosDecorridos = agora.getFullYear() - anoAdmissao;
      const inicioCiclo = new Date(anoAdmissao + anosDecorridos, mesAdmissao - 1, 1);
      const fimCiclo = new Date(inicioCiclo.getFullYear() + 1, inicioCiclo.getMonth(), 0);

      const jaTemFerias = await this.prisma.solicitacao.findFirst({
        where: {
          funcionarioId: func.id,
          tipo: "FERIAS",
          status: { in: ["PENDENTE", "AGUARDANDO_RH", "APROVADA"] },
          dataInicio: { gte: inicioCiclo, lte: fimCiclo }
        }
      });
      if (jaTemFerias) continue;

      const titulo = "Agendar férias — período obrigatório";
      const corpo = `Você está no período obrigatório de agendamento de férias. Solicite suas férias o quanto antes para evitar pendências.`;
      const email = func.user.emailReal ?? func.user.email;

      if (emailAtivo && email) {
        await this.enviarEmailSistema(email, titulo, corpo).catch((e) =>
          this.logger.error(`Falha FERIAS_OBRIGATORIO email para func ${func.id}: ${e}`)
        );
      }
      if (sistemaAtivo && func.user.externalId) {
        await this.criarNotificacaoParaUsuario(func.user.externalId, titulo, corpo, eventoId).catch(
          (e) => this.logger.error(`Falha FERIAS_OBRIGATORIO sistema para func ${func.id}: ${e}`)
        );
      }
    }
  }

  /* Roda no 1º de cada mês às 08:10 UTC — alerta banco de horas próximo do vencimento */
  @Cron("10 8 1 * *")
  async verificarBancoHorasVencimento() {
    const eventoId = "BANCO_HORAS_VENCIMENTO";
    const [emailAtivo, sistemaAtivo] = await Promise.all([
      this.isEmailAtivoParaEvento(eventoId),
      this.isSistemaAtivoParaEvento(eventoId)
    ]);
    if (!emailAtivo && !sistemaAtivo) return;

    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasVigenciaDias: true }
    });
    const vigenciaDias = cfg?.bancoHorasVigenciaDias ?? 30;

    const agora = new Date();
    const limiteVencimento = new Date(agora);
    limiteVencimento.setDate(limiteVencimento.getDate() + 7); // alerta 7 dias antes

    // Busca assinaturas com saldo positivo cujo período vence em breve
    const assinaturas = await this.prisma.assinaturaQuadro.findMany({
      where: { bancoHorasSaldoTotalMinutos: { gt: 0 } },
      select: {
        bancoHorasSaldoTotalMinutos: true,
        periodo: {
          select: {
            mes: true,
            ano: true,
            funcionario: {
              select: {
                id: true,
                user: { select: { externalId: true, email: true, emailReal: true } }
              }
            }
          }
        }
      }
    });

    const notificados = new Set<string>();
    for (const ass of assinaturas) {
      const funcId = ass.periodo.funcionario.id;
      if (notificados.has(funcId)) continue;

      // Data de vencimento: último dia do mês do período + vigenciaDias
      const fimPeriodo = new Date(ass.periodo.ano, ass.periodo.mes, 0); // último dia do mês
      const dataVencimento = new Date(fimPeriodo);
      dataVencimento.setDate(dataVencimento.getDate() + vigenciaDias);

      if (dataVencimento > limiteVencimento) continue; // vence depois da janela de alerta

      const user = ass.periodo.funcionario.user;
      if (!user) continue;

      const saldoH = Math.floor(ass.bancoHorasSaldoTotalMinutos / 60);
      const saldoM = ass.bancoHorasSaldoTotalMinutos % 60;
      const saldoStr = `${saldoH}h${saldoM > 0 ? `${saldoM}min` : ""}`;
      const vencStr = dataVencimento.toLocaleDateString("pt-BR");
      const titulo = `Banco de horas — saldo de ${saldoStr} vencendo em ${vencStr}`;
      const corpo = `Seu saldo de banco de horas (${saldoStr}) vence em ${vencStr}. Utilize o saldo antes desta data.`;
      const email = user.emailReal ?? user.email;

      if (emailAtivo && email) {
        await this.enviarEmailSistema(email, titulo, corpo).catch((e) =>
          this.logger.error(`Falha BANCO_HORAS_VENCIMENTO email para func ${funcId}: ${e}`)
        );
      }
      if (sistemaAtivo && user.externalId) {
        await this.criarNotificacaoParaUsuario(user.externalId, titulo, corpo, eventoId).catch(
          (e) => this.logger.error(`Falha BANCO_HORAS_VENCIMENTO sistema para func ${funcId}: ${e}`)
        );
      }
      notificados.add(funcId);
    }
  }

  /**
   * Virada do dia (00:01 Brasília): notifica funcionários com registros
   * incompletos ou ausentes no dia útil anterior, pedindo correção de ponto.
   */
  @Cron("1 0 * * *", { timeZone: "America/Sao_Paulo" })
  async cronRegistroPontoIncompleto() {
    const eventoId = "REGISTRO_PONTO_INCOMPLETO";
    const [emailAtivo, sistemaAtivo] = await Promise.all([
      this.isEmailAtivoParaEvento(eventoId),
      this.isSistemaAtivoParaEvento(eventoId)
    ]);
    if (!emailAtivo && !sistemaAtivo) return;

    const hojeIso = hojeBrasiliaISO();
    const [y, m, d] = hojeIso.split("-").map(Number);
    const ontem = new Date(y, m - 1, d);
    ontem.setDate(ontem.getDate() - 1);
    const ontemIso = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;
    const dow = ontem.getDay();

    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { diasUteis: true }
    });
    const diasUteis: boolean[] = JSON.parse(
      cfg?.diasUteis ?? "[false,true,true,true,true,true,false]"
    );
    if (!diasUteis[dow]) {
      this.logger.log(`Cron REGISTRO_PONTO_INCOMPLETO: ${ontemIso} não é dia útil — ignorado.`);
      return;
    }

    const feriado = await this.prisma.feriadoConfig.findFirst({
      where: { data: new Date(`${ontemIso}T00:00:00.000Z`) },
      select: { id: true, marcoHorario: true }
    });
    /* Feriado integral (sem marco): não exige ponto. */
    if (feriado && !feriado.marcoHorario) {
      this.logger.log(`Cron REGISTRO_PONTO_INCOMPLETO: ${ontemIso} é feriado — ignorado.`);
      return;
    }

    const { inicio, fim } = intervaloDiaBrasilia(ontemIso);

    const funcionarios = await this.prisma.funcionario.findMany({
      where: { ativo: true },
      select: {
        id: true,
        categoria: true,
        pontoObrigatorioDesde: true,
        user: { select: { externalId: true, email: true, emailReal: true, name: true } }
      }
    });

    const LABEL_FALTANTE: Record<string, string> = {
      ENTRADA: "entrada",
      INICIO_INTERVALO: "início do intervalo de almoço",
      FIM_INTERVALO: "fim do intervalo de almoço",
      SAIDA: "saída"
    };

    const dataFmt = ontem.toLocaleDateString("pt-BR");
    let enviados = 0;

    for (const func of funcionarios) {
      if (categoriaSemRegistroPonto(func.categoria)) continue;

      const historicoCat = await ensureCategoriaHistorico(this.prisma, func.id);
      const pontoObrigatorioDesde = func.pontoObrigatorioDesde
        ? dataBrasiliaISO(func.pontoObrigatorioDesde)
        : null;
      if (
        diaSemObrigacaoPonto(ontemIso, {
          historico: historicoCat,
          categoriaAtual: func.categoria,
          pontoObrigatorioDesde
        })
      ) {
        continue;
      }

      const afastamentosRaw = await this.prisma.afastamento.findMany({
        where: {
          funcionarioId: func.id,
          apenasInformativo: false,
          dataInicio: { lte: fim },
          dataFim: { gte: inicio }
        },
        select: {
          id: true,
          tipo: true,
          dataInicio: true,
          dataFim: true,
          horarioInicio: true,
          horarioFim: true
        }
      });
      const sols = await this.prisma.solicitacao.findMany({
        where: {
          funcionarioId: func.id,
          tipo: "ATESTADO",
          status: "APROVADA",
          OR: [
            { dataInicio: { lte: fim }, dataFim: { gte: inicio } },
            { dataReferencia: { gte: inicio, lte: fim } }
          ]
        },
        select: { dataInicio: true, dataFim: true, dataReferencia: true, metadados: true }
      });
      const afastamentos = enriquecerAfastamentosComSolicitacoes(afastamentosRaw, sols);
      const afastamentoDia = afastamentos.find((a) => {
        const aIni = dataBrasiliaISO(a.dataInicio);
        const aFim = dataBrasiliaISO(a.dataFim);
        return ontemIso >= aIni && ontemIso <= aFim;
      });
      /* Afastamento dia inteiro: não exige ponto. */
      if (afastamentoDia && !isAfastamentoParcial(afastamentoDia)) continue;

      const registros = await this.prisma.registroPonto.findMany({
        where: {
          funcionarioId: func.id,
          apenasInformativo: false,
          dataHora: { gte: inicio, lte: fim }
        },
        orderBy: { dataHora: "asc" },
        select: { tipo: true, observacoes: true }
      });

      const entrada = registros.find((r) => r.tipo === "ENTRADA");
      const parcial = afastamentoDia && isAfastamentoParcial(afastamentoDia);
      const exigirIntervalo =
        !categoriaSemIntervaloAlmoco(func.categoria) &&
        !observacaoTurnoSemIntervalo(entrada?.observacoes) &&
        !dispensarAlmocoPorAtestadoParcial(!!parcial, registros, {
          horarioInicio: afastamentoDia?.horarioInicio,
          horarioFim: afastamentoDia?.horarioFim,
          almocoPodeIniciarAte: "13:00"
        });
      const exigirSaida =
        !parcial ||
        !atestadoParcialDispensaSaida(afastamentoDia!.horarioInicio!, afastamentoDia!.horarioFim!);

      if (!cicloPontoIncompleto(registros, { exigirIntervalo, exigirSaida })) continue;

      const faltantes = faltantesCicloPonto(registros, { exigirIntervalo, exigirSaida });
      const listaFaltantes = faltantes.map((f) => LABEL_FALTANTE[f] ?? f).join(", ");
      const titulo = `Ponto incompleto em ${dataFmt} — solicite correção`;
      const corpo =
        `Identificamos registros de ponto incompletos ou ausentes em ${dataFmt} ` +
        `(faltando: ${listaFaltantes || "ciclo completo"}). ` +
        `Por favor, abra uma solicitação de correção de ponto no sistema para regularizar o dia.`;

      const dest = {
        externalId: func.user.externalId,
        email: func.user.email,
        emailReal: func.user.emailReal
      };
      await this.dispararEvento(eventoId, titulo, corpo, [dest]);
      enviados++;
    }

    this.logger.log(
      `Cron REGISTRO_PONTO_INCOMPLETO (${ontemIso}): ${enviados} notificações disparadas.`
    );
  }
}

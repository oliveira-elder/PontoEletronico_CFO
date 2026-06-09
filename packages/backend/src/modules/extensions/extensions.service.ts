import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Cron, CronExpression } from "@nestjs/schedule";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";

interface ExtensionRecord {
  id: string;
  floor: string;
  section: string;
  room: string;
  name: string;
  extension: string;
  email: string;
  staffId: number | null;
  Manager: boolean;
  isSuperAdmin: boolean;
}

@Injectable()
export class ExtensionsService {
  private readonly logger = new Logger(ExtensionsService.name);
  private readonly apiUrl =
    process.env.EXTENSIONS_API_URL ?? "http://192.168.100.32:11003/api/extensions";

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService
  ) {}

  async fetchExtensions(): Promise<ExtensionRecord[]> {
    const response = await firstValueFrom(
      this.http.get<ExtensionRecord[]>(this.apiUrl, { timeout: 10_000 })
    );
    return (response as { data: ExtensionRecord[] }).data;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncExtensionsScheduled() {
    this.logger.log("Sync automático da API Extensions iniciado.");
    await this.syncExtensions();
  }

  async syncExtensions(): Promise<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    let records: ExtensionRecord[] = [];
    const notMapped: string[] = [];

    try {
      records = await this.fetchExtensions();
    } catch (err) {
      this.logger.error("Falha ao buscar API Extensions:", err);
      await this.prisma.syncLog.create({
        data: { source: "extensions", status: "error", details: { error: String(err) } }
      });
      return { total: 0, created: 0, updated: 0, skipped: 0, errors: 1 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Agrupar por seção para processar gerentes primeiro
    const porSecao = new Map<string, ExtensionRecord[]>();
    for (const rec of records) {
      if (!rec.section) continue;
      if (!porSecao.has(rec.section)) porSecao.set(rec.section, []);
      porSecao.get(rec.section)!.push(rec);
    }

    for (const [section, membros] of porSecao.entries()) {
      try {
        // Garantir que a Gerencia existe
        const sigla = section
          .split(/[\s-]+/)
          .map((w) => w[0]?.toUpperCase() ?? "")
          .join("")
          .slice(0, 10);

        let gerencia = await this.prisma.gerencia.findFirst({
          where: { OR: [{ nome: section }, { sigla }] }
        });

        if (!gerencia) {
          gerencia = await this.prisma.gerencia.create({
            data: { nome: section, sigla, responsavel: "", ativa: true }
          });
          created++;
        }

        // Identificar o gerente da seção
        const gerente = membros.find((m) => m.Manager);
        if (gerente) {
          const userGerente = await this.resolveUser(gerente.email);
          if (userGerente) {
            await this.prisma.gerencia.update({
              where: { id: gerencia.id },
              data: {
                responsavel: gerente.name,
                responsavelUserId: userGerente.id
              }
            });
          }
        }

        // Atualizar cada membro
        for (const rec of membros) {
          const user = await this.resolveUser(rec.email);
          if (!user) {
            notMapped.push(rec.email);
            skipped++;
            continue;
          }

          let funcionario = await this.prisma.funcionario.findUnique({
            where: { userId: user.id }
          });

          // Atualiza emailReal com o e-mail da API se ainda não foi definido
          if (!user.emailReal && rec.email) {
            await this.prisma.user.update({
              where: { id: user.id },
              data: { emailReal: rec.email }
            });
          }

          const matriculaAtualizada = rec.staffId != null ? String(rec.staffId) : undefined;

          if (!funcionario) {
            // Usuário logou via SSO mas ainda não tem Funcionario — cria automaticamente
            try {
              funcionario = await this.prisma.funcionario.create({
                data: {
                  userId: user.id,
                  matricula: matriculaAtualizada ?? user.id.slice(0, 12),
                  cargo: "A definir",
                  ativo: true,
                  gerenciaId: gerencia.id,
                  extensionsId: rec.id,
                  section: rec.section,
                  isManager: rec.Manager
                }
              });
              created++;
            } catch {
              skipped++;
            }
            continue;
          }

          await this.prisma.funcionario.update({
            where: { id: funcionario.id },
            data: {
              gerenciaId: gerencia.id,
              extensionsId: rec.id,
              section: rec.section,
              isManager: rec.Manager,
              ...(matriculaAtualizada ? { matricula: matriculaAtualizada } : {})
            }
          });
          updated++;
        }
      } catch (err) {
        this.logger.error(`Erro ao processar seção "${section}":`, err);
        errors++;
      }
    }

    await this.prisma.syncLog.create({
      data: {
        source: "extensions",
        status: errors > 0 && updated === 0 ? "error" : "success",
        created,
        updated,
        skipped,
        errors,
        details: notMapped.length > 0 ? { naoMapeados: notMapped } : undefined
      }
    });

    this.logger.log(
      `Sync Extensions: ${created} criados, ${updated} atualizados, ${skipped} ignorados, ${errors} erros.`
    );
    return { total: records.length, created, updated, skipped, errors };
  }

  async getLastSync() {
    return this.prisma.syncLog.findFirst({
      where: { source: "extensions" },
      orderBy: { createdAt: "desc" }
    });
  }

  // Resolve User pelo e-mail da API externa (tenta emailReal primeiro, depois prefixo)
  private async resolveUser(emailExterno: string) {
    // Tenta pelo emailReal exato
    const porEmailReal = await this.prisma.user.findFirst({
      where: { emailReal: emailExterno }
    });
    if (porEmailReal) return porEmailReal;

    // Extrai o prefixo (ex: "elder.oliveira" de "elder.oliveira@cfo.org.br")
    const prefixo = emailExterno.split("@")[0];
    if (!prefixo) return null;

    // Busca por e-mail SSO cujo início seja o prefixo
    return this.prisma.user.findFirst({
      where: { email: { startsWith: `${prefixo}@` } }
    });
  }
}

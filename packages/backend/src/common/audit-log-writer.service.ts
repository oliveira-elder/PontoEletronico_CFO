import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LogsSseService } from "../modules/logs/logs.sse.service";
import { MonitorAuditIngestService } from "../modules/ingest/monitor-audit-ingest.service";

export interface AuditLogWriteParams {
  tracker: string;
  category: string;
  actorUserId: string | null;
  username: string | null;
  method: string | null;
  path: string | null;
  action: string;
  statusCode: number | null;
  durationMs: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  payload: Record<string, unknown> | null;
  /** Indica se a requisição trouxe algo efetivamente digitado/enviado pelo
   *  requisitante (corpo ou query, ex.: usuário informado num formulário) —
   *  diferente de `payload`, que pode conter só uma descrição interna fixa
   *  (ex.: motivo de acesso negado). Usado só para decidir o que vale a pena
   *  reportar ao monitor externo quando não há actorUserId/username. */
  hasTraceableContent?: boolean;
}

/** Escreve uma linha de AuditLog e replica para SSE (tela de Logs ao vivo) e
 *  para o MonitorSistema — usado tanto pelo interceptor de requisições normais
 *  quanto pelo filtro de falhas de autenticação (401/403), para não duplicar
 *  a lógica de persistência/replicação em dois lugares. */
@Injectable()
export class AuditLogWriterService {
  private readonly logger = new Logger(AuditLogWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly logsSse?: LogsSseService,
    @Optional() private readonly monitorAudit?: MonitorAuditIngestService
  ) {}

  write(params: AuditLogWriteParams): void {
    /* Falha de autenticação (401/403) sem NENHUM traço de "quem" — nem
       actorUserId, nem username, nem conteúdo submetido (payload/query) —
       é ruído puro (ex.: healthcheck do Docker batendo em /api/auth/me sem
       token a cada 10s). Mesmo critério de MonitorAuditIngestService.shouldSkipPush,
       agora aplicado também à gravação interna, não só ao envio ao monitor
       externo. Uma tentativa de login com usuário/senha errados SEMPRE carrega
       o usuário digitado no corpo (hasTraceableContent=true), então nunca cai
       aqui — continua sendo gravada normalmente. */
    const isUntraceableAuthFailure =
      (params.statusCode === 401 || params.statusCode === 403) &&
      !params.actorUserId &&
      !params.username &&
      !params.hasTraceableContent;
    if (isUntraceableAuthFailure) return;

    /* hasTraceableContent não é coluna do AuditLog (existe só para a decisão de
       push do MonitorAuditIngestService) — precisa ficar de fora do `data` do
       Prisma, senão TODA gravação falha com PrismaClientValidationError
       (argumento desconhecido), derrubando o log inteiro silenciosamente. */
    const { hasTraceableContent: _omitTraceable, ...dbFields } = params;
    void _omitTraceable;

    /* Fire-and-forget — não bloqueia a resposta */
    this.prisma.auditLog
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .create({ data: dbFields as any })
      .then((log) => {
        this.logsSse?.emit({
          id: log.id,
          category: log.category,
          method: log.method ?? params.method ?? "GET",
          path: log.path ?? params.path ?? params.action,
          statusCode: log.statusCode ?? params.statusCode ?? 500,
          durationMs: log.durationMs ?? params.durationMs ?? 0,
          username: log.username,
          ipAddress: log.ipAddress,
          createdAt: log.createdAt.toISOString()
        });

        void this.monitorAudit?.pushAudit({
          tracker: params.tracker,
          method: params.method ?? "GET",
          path: params.path ?? params.action,
          action: params.action,
          statusCode: params.statusCode ?? 500,
          durationMs: params.durationMs ?? 0,
          username: params.username,
          actorUserId: params.actorUserId,
          ipAddress: params.ipAddress,
          hasTraceableContent: params.hasTraceableContent
        });
      })
      .catch((e) => this.logger.warn(`Falha ao gravar AuditLog: ${e}`));
  }
}

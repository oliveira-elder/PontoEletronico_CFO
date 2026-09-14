import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { randomUUID } from "crypto";
import { AuditLogWriterService } from "../common/audit-log-writer.service";

/* Endpoints de alta frequência que poluiriam o log sem valor diagnóstico.
   /api/auth/me FOI REMOVIDO daqui de propósito: é o endpoint de login/sincronização
   de sessão — precisamos dele para rastreabilidade de quem acessou o sistema. */
const SKIP_PATHS = new Set([
  "/api/ponto/status",
  "/api/ponto/config/sistema",
  "/api/ponto/config/branding",
  "/api/logs/stream",
  "/api/logs/metrics/system"
]);

/* Chaves de body que não devem ser persistidas */
const REDACT_KEYS = new Set([
  "fotobase64",
  "password",
  "senha",
  "token",
  "secret",
  "authorization",
  "refreshtoken"
]);

interface RequestWithUser {
  method: string;
  url: string;
  path: string;
  ip: string;
  ips: string[];
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: unknown;
  user?: { sub?: string; username?: string };
  /** Marca que este interceptor já vai observar erros desta requisição (via tap
   *  abaixo) — usado por AuthFailureLogFilter para não duplicar o log quando um
   *  ForbiddenException/UnauthorizedException é lançado de DENTRO de um handler
   *  (nesse caso o próprio interceptor já registra o erro). O filtro só deve agir
   *  quando um Guard barrou a requisição ANTES de chegar aqui. */
  __auditLogInterceptorSeen?: boolean;
}

function deriveCategory(statusCode: number): string {
  if (statusCode >= 500) return "ERROR";
  if (statusCode >= 400) return "FAILURE";
  return "SUCCESS";
}

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class AuditLogInterceptor implements NestInterceptor<any, any> {
  constructor(private readonly writer: AuditLogWriterService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intercept(ctx: ExecutionContext, next: CallHandler<any>): Observable<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (ctx.getType() !== "http") return next.handle() as Observable<any>;

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const path = req.path ?? req.url?.split("?")[0] ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (SKIP_PATHS.has(path)) return next.handle() as Observable<any>;

    const tracker = randomUUID();
    const res = ctx.switchToHttp().getResponse<{ setHeader?: (k: string, v: string) => void }>();
    res?.setHeader?.("X-Trace-Id", tracker);

    req.__auditLogInterceptorSeen = true;
    const start = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return next.handle().pipe(
      tap({
        next: () => this.persist(req, path, start, 200, tracker),
        error: (err: { status?: number }) =>
          this.persist(req, path, start, err?.status ?? 500, tracker)
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as Observable<any>;
  }

  private persist(
    req: RequestWithUser,
    path: string,
    start: number,
    statusCode: number,
    tracker: string
  ): void {
    const durationMs = Date.now() - start;
    const method = req.method?.toUpperCase() ?? "GET";
    const actorUserId = req.user?.sub?.trim() || null;
    /* "" (claim preferred_username ausente no token) deve virar null, não string
       vazia — senão a coluna "Ator" na tela de Logs fica em branco silenciosamente
       em vez de mostrar "—" e o filtro por usuário fica inconsistente. */
    const username = req.user?.username?.trim() || null;
    const ipAddress = (req.ips?.[0] ?? req.ip ?? "").replace(/^::ffff:/, "");
    const userAgent = String(req.headers?.["user-agent"] ?? "").slice(0, 200) || null;
    const action = `${method} ${path}`;
    const category = deriveCategory(statusCode);

    const sanitizedBody = this.sanitize(req.body);
    const sanitizedQuery = this.sanitize(req.query);
    const payload =
      sanitizedBody || sanitizedQuery
        ? {
            ...(sanitizedQuery ? { query: sanitizedQuery } : {}),
            ...(sanitizedBody ? { body: sanitizedBody } : {})
          }
        : null;

    this.writer.write({
      tracker,
      category,
      actorUserId,
      username,
      method,
      path,
      action,
      statusCode,
      durationMs,
      ipAddress: ipAddress || null,
      userAgent,
      payload
    });
  }

  private sanitize(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length === 0) return null;

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        result[k] = "[REDACTED]";
      } else if (typeof v === "string" && v.length > 400) {
        result[k] = v.slice(0, 400) + "…";
      } else {
        result[k] = v;
      }
    }
    return result;
  }
}

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";

/* Endpoints de alta frequência que poluiriam o log sem valor diagnóstico */
const SKIP_PATHS = new Set(["/api/ponto/status", "/api/auth/me", "/api/ponto/config/sistema"]);

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
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== "http") return next.handle();

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const path = req.path ?? req.url?.split("?")[0] ?? "";

    if (SKIP_PATHS.has(path)) return next.handle();

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.persist(req, path, start, 200),
        error: (err: { status?: number }) => this.persist(req, path, start, err?.status ?? 500)
      })
    );
  }

  private persist(req: RequestWithUser, path: string, start: number, statusCode: number): void {
    const durationMs = Date.now() - start;
    const method = req.method?.toUpperCase() ?? "GET";
    const actorUserId = req.user?.sub ?? null;
    const username = req.user?.username ?? null;
    const ipAddress = (req.ips?.[0] ?? req.ip ?? "").replace(/^::ffff:/, "");
    const userAgent = String(req.headers?.["user-agent"] ?? "").slice(0, 200) || null;
    const action = `${method} ${path}`;

    const sanitizedBody = this.sanitize(req.body);
    const sanitizedQuery = this.sanitize(req.query);
    const payload =
      sanitizedBody || sanitizedQuery
        ? {
            ...(sanitizedQuery ? { query: sanitizedQuery } : {}),
            ...(sanitizedBody ? { body: sanitizedBody } : {})
          }
        : null;

    /* Fire-and-forget — não bloqueia a resposta */
    this.prisma.auditLog
      .create({
        data: {
          actorUserId,
          username,
          method,
          path,
          action,
          statusCode,
          durationMs,
          ipAddress: ipAddress || null,
          userAgent,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: (payload as any) ?? null
        }
      })
      .catch(() => {
        /* log failure não afeta a requisição */
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

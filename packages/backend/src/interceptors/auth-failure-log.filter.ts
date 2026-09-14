import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  UnauthorizedException
} from "@nestjs/common";
import { Response } from "express";
import { randomUUID } from "crypto";
import { AuditLogWriterService } from "../common/audit-log-writer.service";

interface RequestLike {
  method?: string;
  path?: string;
  url?: string;
  ip?: string;
  ips?: string[];
  headers?: Record<string, string | string[] | undefined>;
  /** Setado pelo AuditLogInterceptor quando ele chega a rodar para esta requisição —
   *  se presente, o próprio interceptor já registra (ou registrará) o erro, e este
   *  filtro deve ficar de fora para não duplicar a linha no AuditLog. */
  __auditLogInterceptorSeen?: boolean;
}

/** Decodifica (sem verificar assinatura) o payload de um JWT só para fins de log —
 *  nunca usar isto para autorização, apenas para saber "quem alegava ser" em uma
 *  tentativa de acesso negada. */
function decodeJwtPayloadUnsafe(
  authHeader: string | string[] | undefined
): { sub?: string; preferred_username?: string } | null {
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!raw?.startsWith("Bearer ")) return null;
  const token = raw.slice(7).trim();
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Registra no AuditLog toda tentativa de acesso barrada por Guard (401/403) —
 * essas requisições NUNCA chegam ao AuditLogInterceptor porque Guards rodam antes
 * de Interceptors no ciclo de vida do Nest, então sem este filtro ficavam sem
 * nenhum rastro (lacuna de auditoria/segurança: tentativas negadas de acesso).
 */
@Catch(UnauthorizedException, ForbiddenException)
export class AuthFailureLogFilter implements ExceptionFilter {
  constructor(private readonly writer: AuditLogWriterService) {}

  catch(exception: UnauthorizedException | ForbiddenException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestLike>();

    const status = exception.getStatus();
    res.status(status).json(exception.getResponse());

    if (req.__auditLogInterceptorSeen) {
      // Já será (ou já foi) registrado pelo AuditLogInterceptor — evita log duplicado.
      return;
    }

    const method = (req.method ?? "GET").toUpperCase();
    const path = req.path ?? req.url?.split("?")[0] ?? "";
    const ipAddress = (req.ips?.[0] ?? req.ip ?? "").replace(/^::ffff:/, "") || null;
    const userAgent = String(req.headers?.["user-agent"] ?? "").slice(0, 200) || null;
    const claimed = decodeJwtPayloadUnsafe(req.headers?.authorization);

    this.writer.write({
      tracker: randomUUID(),
      category: "FAILURE",
      actorUserId: claimed?.sub ?? null,
      username: claimed?.preferred_username ?? null,
      method,
      path,
      action: `${method} ${path}`,
      statusCode: status,
      durationMs: null,
      ipAddress,
      userAgent,
      payload: { message: exception.message, motivo: "acesso_negado" }
    });
  }
}

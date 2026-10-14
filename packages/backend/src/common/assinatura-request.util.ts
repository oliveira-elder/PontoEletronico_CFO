/** Requisição HTTP com o mínimo para identificar quem assina (IP e navegador). */
export interface RequisicaoComOrigem {
  headers: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}

function normalizeIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return ip.trim().replace(/^::ffff:/i, "") || null;
}

/**
 * IP real, gateway e navegador de quem assina — mesmo padrão da assinatura do quadro de
 * ponto e da ciência do chefe no atestado.
 */
export function metaAssinaturaDaRequisicao(req: RequisicaoComOrigem): {
  ipReal: string;
  ipGateway: string | null;
  userAgent: string | null;
} {
  const xffRaw = req.headers["x-forwarded-for"];
  const xffStr = Array.isArray(xffRaw) ? xffRaw[0] : xffRaw;
  const xff =
    xffStr
      ?.split(",")
      .map((p) => normalizeIp(p))
      .filter((p): p is string => !!p) ?? [];
  const peer = normalizeIp(req.socket?.remoteAddress ?? req.connection?.remoteAddress);
  const ipReal = xff[0] ?? peer ?? "desconhecido";
  const ipGateway = xff.length > 1 ? xff[xff.length - 1] : peer;
  const uaRaw = req.headers["user-agent"];
  const ua = Array.isArray(uaRaw) ? uaRaw[0] : uaRaw;
  return {
    ipReal,
    ipGateway:
      (ipGateway && ipGateway !== ipReal
        ? ipGateway
        : peer && peer !== ipReal
          ? peer
          : ipGateway) ?? null,
    userAgent: ua?.slice(0, 256) ?? null
  };
}

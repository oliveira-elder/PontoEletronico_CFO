/**
 * Metadados de autenticidade de uma requisição (assinaturas e aceites): IP real do computador,
 * gateway de borda e navegador. O X-Forwarded-For é uma cadeia `clientePC, proxy1, ..., gatewayBorda`:
 * o primeiro item é o PC real; o último (ou o peer do socket) é a gateway de borda.
 */
export interface MetaRequisicao {
  ipReal: string;
  ipGateway: string | null;
  userAgent: string | null;
}

export interface RequisicaoComIp {
  headers: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}

/** Normaliza um IP, removendo prefixo IPv4-mapeado (::ffff:) e espaços */
export function normalizeIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return ip.trim().replace(/^::ffff:/i, "") || null;
}

export function metaRequisicao(req: RequisicaoComIp): MetaRequisicao {
  const bruto = req.headers["x-forwarded-for"];
  const xff =
    (Array.isArray(bruto) ? bruto.join(",") : bruto)
      ?.split(",")
      .map((p) => normalizeIp(p))
      .filter((p): p is string => !!p) ?? [];
  const peer = normalizeIp(req.socket?.remoteAddress ?? req.connection?.remoteAddress);
  const ipReal = xff[0] ?? peer ?? "desconhecido";
  const ipGateway = xff.length > 1 ? xff[xff.length - 1] : peer;
  const ua = req.headers["user-agent"];
  return {
    ipReal,
    ipGateway:
      ipGateway && ipGateway !== ipReal ? ipGateway : peer && peer !== ipReal ? peer : ipGateway,
    userAgent: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 256) ?? null
  };
}

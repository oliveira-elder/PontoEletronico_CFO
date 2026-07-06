import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/* Certificado auto-assinado persistente — gerado uma vez e reaproveitado em todos os
   reinícios. Fica em packages/web/certs/ (pasta mapeada pelo volume do Docker). */
const certDir = resolve(__dirname, "certs");
const certFile = resolve(certDir, "dev.crt");
const keyFile = resolve(certDir, "dev.key");

const httpsConfig =
  existsSync(certFile) && existsSync(keyFile)
    ? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
    : true; // fallback para cert auto-gerado pelo Vite se arquivos não existirem

/* Com nginx na frente (Docker), o TLS termina no proxy e o Vite fica em HTTP. */
const behindProxy = process.env.VITE_BEHIND_PROXY === "true";

const KEYCLOAK_UPSTREAM =
  process.env.KEYCLOAK_URL?.replace(/\/$/, "") ?? "http://192.168.100.112:8080";

/** Reescreve URLs do hostname do Keycloak para o proxy /auth no host do Ponto. */
function rewriteKeycloakProxyBody(body: string, publicHost: string): string {
  const base = `https://${publicHost}/auth`;
  let out = body.replace(/https?:\/\/(?:sso\.cfo\.org\.br|192\.168\.100\.112)(?::\d+)?/g, base);
  out = out.replace(/src="\/resources\//g, 'src="/auth/resources/');
  out = out.replace(/href="\/resources\//g, 'href="/auth/resources/');
  return out;
}

export default defineConfig({
  envDir: resolve(__dirname, "../.."),
  plugins: [react()],
  server: {
    port: 12010,
    host: "0.0.0.0",
    strictPort: true,
    https: behindProxy ? false : httpsConfig,
    allowedHosts: behindProxy ? true : ["ponto.cfo.local", "localhost", ".cfo.local"],
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://backend:3000",
        changeOrigin: true
      },
      "/uploads": {
        target: process.env.VITE_API_TARGET ?? "http://backend:3000",
        changeOrigin: true
      },
      /* SSO Keycloak — encaminha /auth e reescreve sso.cfo.org.br → host do Ponto */
      "/auth": {
        target: KEYCLOAK_UPSTREAM,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/auth/, ""),
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("host", KEYCLOAK_UPSTREAM.replace(/^https?:\/\//, ""));
            proxyReq.removeHeader("accept-encoding");
          });
          proxy.on("proxyRes", (proxyRes, req, res) => {
            const chunks: Buffer[] = [];
            proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on("end", () => {
              const raw = Buffer.concat(chunks);
              const publicHost = req.headers.host ?? "localhost:12010";
              const contentType = String(proxyRes.headers["content-type"] ?? "");
              const shouldRewrite =
                contentType.includes("json") ||
                contentType.includes("html") ||
                contentType.includes("javascript");
              const out = shouldRewrite
                ? Buffer.from(rewriteKeycloakProxyBody(raw.toString("utf8"), publicHost), "utf8")
                : raw;
              const headers = { ...proxyRes.headers };
              delete headers["content-length"];
              delete headers["content-encoding"];
              res.writeHead(proxyRes.statusCode ?? 502, headers);
              res.end(out);
            });
          });
        }
      }
    }
  },
  optimizeDeps: {
    include: ["keycloak-js", "react-is", "recharts"]
  }
});

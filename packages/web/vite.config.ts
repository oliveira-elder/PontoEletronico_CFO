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

export default defineConfig({
  plugins: [react()],
  server: {
    port: 12010,
    host: "0.0.0.0",
    https: httpsConfig,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://backend:3000",
        changeOrigin: true
      },
      "/uploads": {
        target: process.env.VITE_API_TARGET ?? "http://backend:3000",
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ["keycloak-js"]
  }
});

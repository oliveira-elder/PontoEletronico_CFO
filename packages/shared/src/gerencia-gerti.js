"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findGerenciaGerti =
  exports.isGerenciaGerti =
  exports.isGerenciaGertiSlug =
  exports.GERENCIA_GERTI_SLUGS =
  exports.GERENCIA_GERTI_SIGLAS =
  exports.GERENCIA_GERTI_NOME =
    void 0;
/**
 * Gerência de Tecnologia da Informação (GERTI) — identificação organizacional.
 * Usuários desta gerência podem receber Super Admin via UI (apenas GERTI).
 */
exports.GERENCIA_GERTI_NOME = "GERTI";
exports.GERENCIA_GERTI_SIGLAS = ["GERTI", "G"];
exports.GERENCIA_GERTI_SLUGS = ["gerti"];
function norm(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function isGerenciaGertiSlug(slug) {
  const s = norm(slug);
  return exports.GERENCIA_GERTI_SLUGS.some((x) => s === x || s.startsWith(`${x}-`));
}
exports.isGerenciaGertiSlug = isGerenciaGertiSlug;
function isGerenciaGerti(gerencia) {
  if (!gerencia) return false;
  if (gerencia.isGerenciaGerti === true) return true;
  const sigla = gerencia.sigla ? norm(gerencia.sigla) : "";
  if (sigla === "gerti") return true;
  const nome = gerencia.nome ? norm(gerencia.nome) : "";
  return nome === "gerti" || nome.includes("gerti");
}
exports.isGerenciaGerti = isGerenciaGerti;
function findGerenciaGerti(gerencias) {
  return gerencias.find((g) => isGerenciaGerti(g));
}
exports.findGerenciaGerti = findGerenciaGerti;

"use strict";
/**
 * Gerência de Recursos Humanos — identificação organizacional.
 * Não substitui o papel de autorização RH_AUDITORIA (Keycloak).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GERENCIA_RH_SLUGS =
  exports.GERENCIA_RH_SIGLAS =
  exports.GERENCIA_RH_SIGLA_PADRAO =
  exports.GERENCIA_RH_NOME_CURTO =
  exports.GERENCIA_RH_NOME =
    void 0;
exports.isGerenciaRhSlug = isGerenciaRhSlug;
exports.isGerenciaRh = isGerenciaRh;
exports.gerenciaRhCanonica = gerenciaRhCanonica;
exports.findGerenciaRh = findGerenciaRh;
exports.findGerenciaRhId = findGerenciaRhId;
exports.labelGerenciaRh = labelGerenciaRh;
exports.formatGerenciaOption = formatGerenciaOption;
exports.GERENCIA_RH_NOME = "Gerência de Recursos Humanos";
exports.GERENCIA_RH_NOME_CURTO = "Recursos Humanos";
exports.GERENCIA_RH_SIGLA_PADRAO = "GERH";
exports.GERENCIA_RH_SIGLAS = ["RH", "GERH", "GRH", "SERHUM", "DDGDP", "DGP"];
/** Slugs da API Extensions / seções que mapeiam para a gerência RH. */
exports.GERENCIA_RH_SLUGS = [
  "rh",
  "serhum",
  "recursos-humanos",
  "gerencia-recursos-humanos",
  "gerencia-de-recursos-humanos",
  "gestao-de-pessoas",
  "departamento-de-gestao-de-pessoas",
  "departamento-gestao-de-pessoas"
];
function norm(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function isGerenciaRhSlug(slug) {
  const s = norm(slug).replace(/\s+/g, "-");
  if (exports.GERENCIA_RH_SLUGS.some((x) => s === x || s.startsWith(`${x}-`))) return true;
  return s.includes("gestao-de-pessoas") || s.includes("recursos-humanos");
}
function nomeIndicaGerenciaRh(nome) {
  const n = norm(nome);
  return (
    n === "rh" ||
    n.includes("recursos humanos") ||
    n.includes("gerencia de recursos humanos") ||
    n.includes("gestao de pessoas")
  );
}
function isGerenciaRh(gerencia) {
  if (!gerencia) return false;
  if (gerencia.isGerenciaRh === true) return true;
  const sigla = gerencia.sigla ? norm(gerencia.sigla) : "";
  if (exports.GERENCIA_RH_SIGLAS.some((s) => norm(s) === sigla)) return true;
  return gerencia.nome ? nomeIndicaGerenciaRh(gerencia.nome) : false;
}
function gerenciaRhCanonica() {
  return { nome: exports.GERENCIA_RH_NOME, sigla: exports.GERENCIA_RH_SIGLA_PADRAO };
}
function findGerenciaRh(gerencias) {
  return gerencias.find((g) => isGerenciaRh(g));
}
function findGerenciaRhId(gerencias) {
  return findGerenciaRh(gerencias)?.id;
}
function labelGerenciaRh(gerencia) {
  if (!gerencia) return "—";
  if (isGerenciaRh(gerencia)) return exports.GERENCIA_RH_NOME;
  return gerencia.nome ?? "—";
}
function formatGerenciaOption(gerencia) {
  if (isGerenciaRh(gerencia)) {
    const sigla = gerencia.sigla ?? exports.GERENCIA_RH_SIGLA_PADRAO;
    return `${exports.GERENCIA_RH_NOME} (${sigla})`;
  }
  const sigla = gerencia.sigla ? ` (${gerencia.sigla})` : "";
  return `${gerencia.nome ?? "—"}${sigla}`;
}
//# sourceMappingURL=gerencia-rh.js.map

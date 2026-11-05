/**
 * Conta pessoal x conta geral/compartilhada (Alta Administração sem matrícula).
 * Uma pessoa sem matrícula só pode usar o sistema com uma conta PESSOAL e intransferível: e-mail geral
 * (presidente@, comissoes@, recepcao@…) ou usuário genérico não é aceito.
 */

/** Palavras que indicam caixa/conta de função (e não de uma pessoa). Extras via EMAIL_GENERICO_EXTRA (vírgulas). */
export const PALAVRAS_GENERICAS_PADRAO = [
  "presidente",
  "vicepresidente",
  "secretaria",
  "secretariogeral",
  "secretario",
  "tesouraria",
  "tesoureiro",
  "superintendencia",
  "superintendente",
  "comissoes",
  "comissao",
  "recepcao",
  "diretoria",
  "gabinete",
  "contato",
  "atendimento",
  "protocolo",
  "financeiro",
  "juridico",
  "ouvidoria",
  "imprensa",
  "comunicacao",
  "suporte",
  "sistema",
  "sistemas",
  "admin",
  "administrador",
  "administracao",
  "rh",
  "ti",
  "geral",
  "naoresponda",
  "noreply",
  "teste",
  "copa",
  "brigadistas"
];

const ACENTOS = new RegExp("[\\u0300-\\u036f]", "g");
const semAcento = (t: string) => t.normalize("NFD").replace(ACENTOS, "").toLowerCase();

/** Palavras genéricas em vigor: padrão + EMAIL_GENERICO_EXTRA. */
export function palavrasGenericas(extra = process.env.EMAIL_GENERICO_EXTRA ?? ""): Set<string> {
  const mais = extra
    .split(",")
    .map((p) => semAcento(p.trim()).replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  return new Set([...PALAVRAS_GENERICAS_PADRAO, ...mais]);
}

/** Partes do nome de usuário/e-mail (antes do @), sem acento, separadas por . _ - e sem hífen interno. */
function partes(local: string): string[] {
  return semAcento(local)
    .split(/[._-]+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

/** O e-mail/usuário parece de função (não de pessoa)? Compara também o texto inteiro sem separadores. */
export function localGenerico(local: string, palavras = palavrasGenericas()): boolean {
  const l = semAcento(local).replace(/@.*$/, "");
  if (palavras.has(l.replace(/[^a-z0-9]/g, ""))) return true;
  return partes(l).some((p) => palavras.has(p));
}

export function emailGenerico(email: string | null | undefined, palavras = palavrasGenericas()) {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return localGenerico(e.split("@")[0], palavras);
}

/** Usuário do SSO normalizado (minúsculas, sem espaços). Devolve null se o formato é inválido. */
export function normalizarUsuarioSso(bruto: string | null | undefined): string | null {
  const u = (bruto ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,64}$/.test(u) ? u : null;
}

/** Padrão de conta pessoal: nome.sobrenome (2+ partes de letras, número final opcional). */
export function usuarioParecePessoal(usuario: string): boolean {
  return /^[a-z]+(?:[._-][a-z]+)+[0-9]*$/.test(usuario);
}

export function usuarioGenerico(usuario: string, palavras = palavrasGenericas()): boolean {
  return localGenerico(usuario, palavras);
}

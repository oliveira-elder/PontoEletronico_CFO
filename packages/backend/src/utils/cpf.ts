/** Valida CPF (11 dígitos, dígitos verificadores, sem sequência repetida). */
export function cpfValido(cpf: string | null | undefined): boolean {
  const d = String(cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let r = (s * 10) % 11;
  if (r >= 10) r = 0;
  if (r !== +d[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  r = (s * 10) % 11;
  if (r >= 10) r = 0;
  return r === +d[10];
}

/** CPF do funcionário é obrigatório (todas as categorias). Lança mensagem pronta. */
export function mensagemCpfObrigatorio(cpf: string | null | undefined): string | null {
  const d = String(cpf ?? "").replace(/\D/g, "");
  if (!d) return "O CPF é obrigatório.";
  if (!cpfValido(d)) return "CPF inválido. Verifique os dígitos.";
  return null;
}

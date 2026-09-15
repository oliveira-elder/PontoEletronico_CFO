import { dataBrasiliaISO } from "./horario-brasilia";

/**
 * Data (ISO, Brasília) a partir da qual o funcionário passa a contar falta/saldo
 * negativo no histórico, banco de horas e auditoria.
 *
 * O marco é o PRIMEIRO LOGIN REAL (`User.primeiroLoginEm`), não a data de cadastro
 * (`createdAt`) — o RH costuma cadastrar o funcionário no sistema bem antes do seu
 * primeiro acesso, e usar `createdAt` fazia esse intervalo virar falta indevida.
 *
 * Enquanto o funcionário nunca logou (`primeiroLoginEm` nulo), retorna uma data no
 * futuro (amanhã) para que nenhum dia até hoje seja contabilizado como falta.
 */
export function inicioAtividadesUsuario(
  user: { primeiroLoginEm?: Date | null } | null | undefined
): string {
  if (user?.primeiroLoginEm) return dataBrasiliaISO(user.primeiroLoginEm);
  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return dataBrasiliaISO(amanha);
}

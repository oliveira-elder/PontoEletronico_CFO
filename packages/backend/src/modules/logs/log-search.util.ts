import { PrismaService } from "../../prisma/prisma.service";
import { buscarEndpointsPorTexto, prefixosParaBusca } from "./endpoint-catalog";

const CONECTORES = [" de ", " do ", " da ", " dos ", " das "];

/**
 * Tenta dividir uma busca do tipo "assunto de pessoa" (ex.: "registro de fulano",
 * "login de fulano") em duas partes. NÃO divide frases que já são, elas mesmas, um
 * assunto composto reconhecido no catálogo (ex.: "banco de horas"), para não
 * interpretar "horas" como nome de pessoa.
 */
function tentarDividirAssuntoPessoa(q: string): { assunto: string; pessoa: string } | null {
  if (buscarEndpointsPorTexto(q).length > 0) return null;

  const qLower = q.toLowerCase();
  for (const conector of CONECTORES) {
    const idx = qLower.indexOf(conector);
    if (idx === -1) continue;
    const assunto = q.slice(0, idx).trim();
    const pessoa = q.slice(idx + conector.length).trim();
    if (assunto && pessoa && buscarEndpointsPorTexto(assunto).length > 0) {
      return { assunto, pessoa };
    }
  }
  return null;
}

/** Condição Prisma que casa um AuditLog cujo ator (por nome, e-mail ou username)
 *  bate com o texto informado. */
export async function buildPersonCondition(
  prisma: PrismaService,
  texto: string
): Promise<Record<string, unknown>> {
  const usuarios = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: texto, mode: "insensitive" } },
        { emailReal: { contains: texto, mode: "insensitive" } },
        { email: { contains: texto, mode: "insensitive" } }
      ]
    },
    select: { externalId: true }
  });
  const externalIds = usuarios.map((u) => u.externalId).filter((id): id is string => !!id);

  const condicoes: Record<string, unknown>[] = [
    { username: { contains: texto, mode: "insensitive" } }
  ];
  if (externalIds.length) condicoes.push({ actorUserId: { in: externalIds } });
  return { OR: condicoes };
}

function buildSubjectCondition(assunto: string): Record<string, unknown> {
  const prefixos = prefixosParaBusca(assunto);
  return {
    OR: [
      { path: { contains: assunto, mode: "insensitive" } },
      { action: { contains: assunto, mode: "insensitive" } },
      ...prefixos.map((p) => ({ path: { contains: p, mode: "insensitive" } }))
    ]
  };
}

/**
 * Constrói a condição Prisma para uma busca livre de log, combinando assunto
 * (endpoint/o que ele faz, via catálogo) e pessoa (ator). Suporta:
 * - "banco de horas"        → assunto composto (não divide)
 * - "registro de fulano"    → assunto "registro" E pessoa "fulano"
 * - "fulano"                → assunto OU pessoa (ambíguo, tenta os dois)
 */
export async function buildQuerySearchCondition(
  prisma: PrismaService,
  q: string
): Promise<Record<string, unknown> | null> {
  const trimmed = q?.trim();
  if (!trimmed) return null;

  const divisao = tentarDividirAssuntoPessoa(trimmed);
  if (divisao) {
    const condicaoPessoa = await buildPersonCondition(prisma, divisao.pessoa);
    return { AND: [buildSubjectCondition(divisao.assunto), condicaoPessoa] };
  }

  const condicaoAssunto = buildSubjectCondition(trimmed);
  const condicaoPessoa = await buildPersonCondition(prisma, trimmed);
  return {
    OR: [
      ...(condicaoAssunto.OR as Record<string, unknown>[]),
      ...(condicaoPessoa.OR as Record<string, unknown>[])
    ]
  };
}

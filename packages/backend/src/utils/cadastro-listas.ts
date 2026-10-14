import { Prisma, TipoRequerimentoCadastro } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type DependenteInput = { nome: string; cpf?: string | null; dataNascimento?: string | null };
export type FormacaoAcademicaInput = {
  grauEscolaridade?: string | null;
  curso: string;
  instituicao?: string | null;
  conclusao?: string | null;
};
export type CapacitacaoInput = {
  nome: string;
  instituicao?: string | null;
  conclusao?: string | null;
};

/* Listas 1:N do cadastro — gravadas por substituição (apaga e recria). Usadas tanto pela
   edição do RH quanto pela resposta do funcionário aos requerimentos de cadastro.
   `undefined` = não mexe na lista. */

export async function syncFormacoesAcademicas(
  tx: Tx,
  funcionarioId: string,
  formacoes?: FormacaoAcademicaInput[]
) {
  if (formacoes === undefined) return;
  await tx.formacaoAcademica.deleteMany({ where: { funcionarioId } });
  const validas = formacoes.filter((f) => f.curso?.trim());
  if (validas.length) {
    await tx.formacaoAcademica.createMany({
      data: validas.map((f) => ({
        funcionarioId,
        grauEscolaridade: f.grauEscolaridade || null,
        curso: f.curso.trim(),
        instituicao: f.instituicao || null,
        conclusao: f.conclusao ? new Date(`${f.conclusao}T12:00:00-03:00`) : null
      }))
    });
  }
}

export async function syncCapacitacoes(
  tx: Tx,
  funcionarioId: string,
  capacitacoes?: CapacitacaoInput[]
) {
  if (capacitacoes === undefined) return;
  await tx.capacitacao.deleteMany({ where: { funcionarioId } });
  const validas = capacitacoes.filter((c) => c.nome?.trim());
  if (validas.length) {
    await tx.capacitacao.createMany({
      data: validas.map((c) => ({
        funcionarioId,
        nome: c.nome.trim(),
        instituicao: c.instituicao || null,
        conclusao: c.conclusao ? new Date(`${c.conclusao}T12:00:00-03:00`) : null
      }))
    });
  }
}

export async function syncDependentes(
  tx: Tx,
  funcionarioId: string,
  dependentes?: DependenteInput[]
) {
  if (dependentes === undefined) return;
  await tx.dependente.deleteMany({ where: { funcionarioId } });
  const validos = dependentes.filter((d) => d.nome?.trim());
  if (validos.length) {
    await tx.dependente.createMany({
      data: validos.map((d) => ({
        funcionarioId,
        nome: d.nome.trim(),
        cpf: d.cpf?.trim() || null,
        dataNascimento: d.dataNascimento ? new Date(d.dataNascimento) : null
      }))
    });
  }
}

/** CPF válido (11 dígitos + dígitos verificadores; rejeita sequências repetidas). */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export const TIPOS_REQUERIMENTO_CADASTRO = Object.values(TipoRequerimentoCadastro);

/** Categorias que têm Dependentes/Capacitação no cadastro (Empregado e Comissionado). */
export const CATEGORIAS_REQUERIMENTO_CADASTRO = ["CONCURSADO", "ASSESSOR"] as const;

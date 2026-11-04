import type { ModoRegistro, OrigemPonto, Prisma, PrismaClient, TipoPonto } from "@prisma/client";
import type { RepLivroService } from "./rep-livro.service";

/**
 * NÚCLEO DO REGISTRO DE PONTO (REP-P). Este arquivo faz parte do escopo do hash do código-fonte
 * (rep-escopo.json): não o altere sem a liberação do Super Admin (npm run rep:liberar).
 * Regras de negócio de ponto (jornada, tolerâncias, solicitações…) ficam FORA daqui, no PontoService.
 */
export interface DadosRegistroPonto {
  funcionarioId: string;
  cpf: string | null;
  tipo: TipoPonto;
  dataHora: Date;
  origem: OrigemPonto;
  modoRegistro: ModoRegistro;
  latitude?: number;
  longitude?: number;
  dentroPerimetro: boolean;
  observacao?: string;
  fotoUrl?: string | null;
  observacoes?: Prisma.InputJsonValue;
}

/**
 * Batida + marcação ORIGINAL no livro do REP (NSR) na MESMA transação (Portaria MTP 671/2021):
 * ou grava as duas, ou nenhuma. Devolve o registro criado e a marcação do livro (com o NSR).
 */
export async function criarRegistroComMarcacao(
  prisma: Pick<PrismaClient, "$transaction">,
  repLivro: RepLivroService | undefined,
  d: DadosRegistroPonto
) {
  return prisma.$transaction(async (tx) => {
    const registro = await tx.registroPonto.create({
      data: {
        funcionarioId: d.funcionarioId,
        tipo: d.tipo,
        dataHora: d.dataHora,
        origem: d.origem,
        modoRegistro: d.modoRegistro,
        latitude: d.latitude,
        longitude: d.longitude,
        dentroPerimetro: d.dentroPerimetro,
        observacao: d.observacao,
        fotoUrl: d.fotoUrl ?? null,
        ...(d.observacoes ? { observacoes: d.observacoes } : {})
      }
    });
    const marcacaoRep = await repLivro?.registrarMarcacao(tx, {
      registroPontoId: registro.id,
      funcionarioId: d.funcionarioId,
      cpf: d.cpf,
      tipoPonto: registro.tipo,
      dataHoraMarcacao: d.dataHora,
      origem: d.origem
    });
    return { registro, marcacaoRep: marcacaoRep ?? null };
  });
}

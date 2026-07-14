import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { dataBrasiliaISO } from "./horario-brasilia";

/** Retorna YYYY-MM-DD do go-live, ou null se ainda em fase de teste. */
export async function getDataInicioProducao(prisma: PrismaService): Promise<string | null> {
  const cfg = await prisma.configuracaoSistema.findUnique({
    where: { id: "singleton" },
    select: { dataInicioProducao: true }
  });
  return cfg?.dataInicioProducao ? dataBrasiliaISO(cfg.dataInicioProducao) : null;
}

/**
 * Bloqueia acesso a meses anteriores ao go-live para quem não é Super Admin.
 * @param mesAnoPrefixo YYYY-MM do período solicitado
 */
export function assertMesAposGoLive(opts: {
  mesAnoPrefixo: string;
  dataInicioProducao: string | null;
  isSuperAdmin: boolean;
  contexto?: string;
}): { periodoTeste: boolean } {
  const { mesAnoPrefixo, dataInicioProducao, isSuperAdmin, contexto } = opts;
  if (!dataInicioProducao) return { periodoTeste: false };

  const goLiveMes = dataInicioProducao.slice(0, 7);
  if (mesAnoPrefixo >= goLiveMes) return { periodoTeste: false };

  if (isSuperAdmin) return { periodoTeste: true };

  throw new ForbiddenException(
    contexto
      ? `${contexto}: o período ${mesAnoPrefixo} é anterior ao go-live (${goLiveMes}) e só pode ser consultado por Super Administrador.`
      : `Período ${mesAnoPrefixo} anterior ao início de produção (${goLiveMes}). Acesso restrito a Super Administrador.`
  );
}

/** Para ranges diários: retorna o piso efetivo (max entre pedido e go-live). */
export function pisoHistoricoEfetivo(
  dataInicioDesejada: string,
  dataInicioProducao: string | null,
  isSuperAdmin: boolean
): string {
  if (!dataInicioProducao || isSuperAdmin) return dataInicioDesejada;
  return dataInicioDesejada < dataInicioProducao ? dataInicioProducao : dataInicioDesejada;
}

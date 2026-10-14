import type { PrismaClient } from "@prisma/client";
import {
  dataBrasiliaISO,
  dataCivilISO,
  intervaloColunaDate,
  somarDiasCivil
} from "./horario-brasilia";
import { jornadaEsperadaMin, type JornadaHistoricoContext } from "./jornada-historico";
import { montarDiaNeutro } from "./dias-neutros";
import { categoriaSemIntervaloAlmoco } from "./categoria-jornada";
import { diasCicloCompletoEmCasa } from "./hora-extra-decisao";
import type { ModoIntervalo } from "./ciclo-completo";

/**
 * Dias do ponto PRESENCIAL que exigem o ciclo completo de batidas (CLT art. 71). Tudo vem da
 * configuração: limites de jornada e tempos do intervalo (Configurações → Períodos) e a data
 * de vigência (Configurações → Registro). Nada de 6 h / 4 h / 15 min fixo no código.
 */
export interface ExigenciaCiclo {
  /** ALMOCO (jornada longa) ou ALMOCO_OU_PAUSA (jornada curta). */
  modo: ModoIntervalo;
  /** Tempo mínimo configurado do intervalo exigido (min), para os textos. */
  minimoMin: number;
}

export interface ExigenciasCicloPresencial {
  desde: string | null;
  porDia: Record<string, ExigenciaCiclo>;
}

type Db = Parameters<typeof diasCicloCompletoEmCasa>[0] &
  Parameters<typeof montarDiaNeutro>[0] &
  Pick<PrismaClient, "feriadoConfig">;

export async function exigenciasCicloPresencial(
  prisma: Db,
  funcionarioId: string,
  inicio: Date,
  fim: Date,
  jornada: JornadaHistoricoContext,
  /** Dias em casa já apurados (evita refazer a apuração quando o chamador já a tem). */
  diasEmCasaJaApurados?: string[]
): Promise<ExigenciasCicloPresencial> {
  const cfg = await prisma.configuracaoSistema.findUnique({
    where: { id: "singleton" },
    select: {
      cicloCompletoPresencialDesde: true,
      intervaloLongoAcimaDeMin: true,
      intervaloCurtoAcimaDeMin: true,
      intervaloCurtoMinMin: true,
      almocoMinMin: true
    }
  });
  if (!cfg?.cicloCompletoPresencialDesde) return { desde: null, porDia: {} };
  const desde = dataCivilISO(cfg.cicloCompletoPresencialDesde);

  const func = await prisma.funcionario.findUnique({
    where: { id: funcionarioId },
    select: { categoria: true }
  });
  /* Estagiário e jovem aprendiz não fazem intervalo de almoço: são exceção à regra geral. */
  if (!func || categoriaSemIntervaloAlmoco(func.categoria)) {
    return { desde, porDia: {} };
  }

  const primeiro = dataBrasiliaISO(inicio) > desde ? dataBrasiliaISO(inicio) : desde;
  const ultimo = dataBrasiliaISO(fim);
  if (primeiro > ultimo) return { desde, porDia: {} };

  const [neutro, emCasa, feriados] = await Promise.all([
    montarDiaNeutro(prisma, funcionarioId),
    diasEmCasaJaApurados
      ? Promise.resolve({ dias: diasEmCasaJaApurados })
      : diasCicloCompletoEmCasa(prisma, funcionarioId, inicio, fim),
    prisma.feriadoConfig.findMany({
      where: {
        data: {
          gte: intervaloColunaDate(primeiro, ultimo).inicio,
          lte: intervaloColunaDate(primeiro, ultimo).fim
        },
        marcoHorario: null,
        tipo: { not: "ABONO" }
      },
      select: { data: true }
    })
  ]);
  const diasEmCasa = new Set(emCasa.dias);
  const diasFeriado = new Set(feriados.map((f) => dataCivilISO(f.data)));

  const porDia: Record<string, ExigenciaCiclo> = {};
  for (let iso = primeiro; iso <= ultimo; iso = somarDiasCivil(iso, 1)) {
    const [y, m, d] = iso.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) continue; // fim de semana: jornada esperada zero
    if (diasFeriado.has(iso) || diasEmCasa.has(iso) || neutro(iso)) continue;

    const jornadaMin = jornadaEsperadaMin(iso, jornada);
    if (jornadaMin <= cfg.intervaloCurtoAcimaDeMin) continue;
    if (jornadaMin > cfg.intervaloLongoAcimaDeMin) {
      porDia[iso] = { modo: "ALMOCO", minimoMin: jornada.almocoMinMin || cfg.almocoMinMin || 60 };
    } else {
      porDia[iso] = { modo: "ALMOCO_OU_PAUSA", minimoMin: cfg.intervaloCurtoMinMin };
    }
  }
  return { desde, porDia };
}

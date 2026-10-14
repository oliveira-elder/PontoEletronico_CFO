import type { PrismaClient } from "@prisma/client";
import { dataBrasiliaISO } from "./horario-brasilia";
import { categoriaSemHoraExtra, labelCategoriaSemIntervalo } from "./categoria-jornada";
import { ensureModalidadeHistorico, modalidadeNoDia } from "./modalidade-historico";

/**
 * Hora extra (saldo positivo do dia) e seu efeito no banco de horas — regra do ACT.
 *
 * Padrão (sem aprovação — pendente, rejeitada ou sem solicitação):
 * — dia em home office / híbrido em casa: nada é creditado;
 * — dia presencial: credita só até o limite diário de HE (Configurações → Períodos,
 *   `horaExtraLimiteAuto`, padrão 2h); o excedente não entra.
 * Aprovada pelo chefe (ou pelo RH): credita tudo, e o informativo traz quem aprovou.
 */

/** Chefe já aprovou (AGUARDANDO_RH) ou aprovação final. */
const STATUS_APROVADA = ["AGUARDANDO_RH", "APROVADA"];
const STATUS_REJEITADA = ["REJEITADA", "REJEITADA_GESTOR", "REJEITADA_RH"];

export type SituacaoHoraExtra = "APROVADA" | "REJEITADA" | "PENDENTE" | "SEM_SOLICITACAO";

/**
 * Onde foram as batidas do dia (só para home office/híbrido):
 * CFO = todas no CFO; CASA = todas em casa; MISTO = em casa e no CFO; FORA = alguma fora
 * dos dois endereços.
 */
export type LocalDiaHoraExtra = "CFO" | "CASA" | "MISTO" | "FORA";

export interface ContextoHoraExtraDia {
  situacao: SituacaoHoraExtra;
  /** Sem direito ao limite diário automático: home office/híbrido fora do CFO. */
  remoto: boolean;
  /** Local apurado das batidas (home office/híbrido). */
  local?: LocalDiaHoraExtra;
  /** Quem aprovou ou rejeitou. */
  decididaPor?: "CHEFE" | "RH";
  /** Nome de quem aprovou ou rejeitou. */
  decididaPorNome?: string | null;
  /** Chefe imediato do funcionário (quem deve aprovar). */
  chefeNome?: string | null;
  observacao?: string | null;
  /** Estagiário/jovem aprendiz (rótulo): não fazem hora extra, o excedente é só informativo. */
  semHoraExtra?: string;
}

export interface AjusteHoraExtraDia extends ContextoHoraExtraDia {
  /** Saldo positivo apurado no dia. */
  apuradoMin: number;
  creditadoMin: number;
  naoCreditadoMin: number;
  limiteMin: number;
  mensagem: string;
}

const fmt = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

/** Contexto de HE do período: por dia (solicitação/dia em casa) e o padrão dos demais dias. */
export interface ContextoHoraExtraPeriodo {
  dias: Record<string, ContextoHoraExtraDia>;
  padrao: ContextoHoraExtraDia;
}

type PrismaHe = Pick<
  PrismaClient,
  | "solicitacao"
  | "registroPonto"
  | "user"
  | "funcionario"
  | "configuracaoSistema"
  | "funcionarioModalidadeHistorico"
>;

/** Folga sobre o raio de cada endereço: a precisão do GPS da batida não é gravada. */
const FOLGA_GPS_METROS = 100;

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface AreaEndereco {
  lat: number;
  lng: number;
  raioMetros: number;
}

/**
 * Local de uma batida pela área configurada nos endereços (casa do funcionário e sede):
 * — com GPS: o endereço mais próximo, se estiver dentro do raio + folga; senão FORA;
 * — DESKTOP sem GPS: CFO (o registro desktop só é aceito na rede do CFO);
 * — VIAGEM: trabalho externo, conta como CFO;
 * — batida ajustada mantém o GPS original e vale por ele; correção sem GPS (ou outro
 *   caso sem como saber): null (não entra na apuração).
 */
function localDaBatida(
  r: {
    latitude: number | null;
    longitude: number | null;
    modoRegistro: string;
    ajustado: boolean;
  },
  casa: AreaEndereco | null,
  sede: AreaEndereco | null
): "CFO" | "CASA" | "FORA" | null {
  if (r.latitude == null || r.longitude == null) {
    if (r.ajustado) return null;
    return r.modoRegistro === "DESKTOP" || r.modoRegistro === "VIAGEM" ? "CFO" : null;
  }
  if (r.modoRegistro === "VIAGEM") return "CFO";
  const dCasa = casa ? distanciaMetros(r.latitude, r.longitude, casa.lat, casa.lng) : Infinity;
  const dSede = sede ? distanciaMetros(r.latitude, r.longitude, sede.lat, sede.lng) : Infinity;
  const naCasa = !!casa && dCasa <= casa.raioMetros + FOLGA_GPS_METROS;
  const naSede = !!sede && dSede <= sede.raioMetros + FOLGA_GPS_METROS;
  if (naCasa && naSede) return dCasa <= dSede ? "CASA" : "CFO";
  if (naCasa) return "CASA";
  if (naSede) return "CFO";
  return "FORA";
}

/** Todas as batidas no mesmo endereço; mistura ou batida fora dos dois → MISTO/FORA. */
function localDoDia(locais: Array<"CFO" | "CASA" | "FORA">): LocalDiaHoraExtra | null {
  if (!locais.length) return null;
  if (locais.includes("FORA")) return "FORA";
  const temCasa = locais.includes("CASA");
  const temCfo = locais.includes("CFO");
  if (temCasa && temCfo) return "MISTO";
  return temCasa ? "CASA" : "CFO";
}

/**
 * Nome do chefe imediato — mesma prioridade de `NotificacaoService.getGestorDoFuncionario`:
 * supervisor do estágio → responsável da gerência → gerente da mesma seção.
 */
async function nomeChefeDoFuncionario(
  prisma: PrismaHe,
  func: {
    section: string | null;
    categoria: string | null;
    supervisorEstagio: { ativo: boolean; user: { name: string | null } | null } | null;
    gerencia: { responsavelUserId: string | null } | null;
  }
): Promise<string | null> {
  const isEstagio = func.categoria === "ESTAGIARIO" || func.categoria === "MENOR_APRENDIZ";
  if (isEstagio && func.supervisorEstagio?.user?.name && func.supervisorEstagio.ativo !== false) {
    return func.supervisorEstagio.user.name;
  }
  if (func.gerencia?.responsavelUserId) {
    const u = await prisma.user.findUnique({
      where: { id: func.gerencia.responsavelUserId },
      select: { name: true }
    });
    if (u?.name) return u.name;
  }
  if (func.section) {
    const g = await prisma.funcionario.findFirst({
      where: { section: func.section, isManager: true, ativo: true },
      select: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" }
    });
    if (g?.user?.name) return g.user.name;
  }
  return null;
}

/**
 * Contexto de HE do período. Só home office e híbrido podem perder o limite diário:
 * o dia dá direito ao limite apenas se TODAS as batidas foram no CFO (área da sede);
 * em casa, misto ou fora → sem o limite automático (só com aprovação do chefe).
 * Dia sem batida localizável: home office = em casa; híbrido = pelo modo gravado na batida.
 * Presencial: sempre com o limite. A modalidade é a do DIA (histórico com vigência), não a
 * configuração atual. Em cada dia vale a solicitação de HE mais recente.
 */
export async function carregarContextoHoraExtra(
  prisma: PrismaHe,
  funcionarioId: string,
  inicio: Date,
  fim: Date
): Promise<ContextoHoraExtraPeriodo> {
  const [func, sols, remotos] = await Promise.all([
    prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        enderecoResidencial: { select: { lat: true, lng: true, raioMetros: true } },
        section: true,
        categoria: true,
        supervisorEstagio: { select: { ativo: true, user: { select: { name: true } } } },
        gerencia: { select: { responsavelUserId: true } }
      }
    }),
    prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: "HORA_EXTRA",
        status: { not: "CANCELADA" },
        dataReferencia: { gte: inicio, lte: fim }
      },
      orderBy: { createdAt: "asc" },
      select: {
        dataReferencia: true,
        status: true,
        gestorUserId: true,
        gestorObservacao: true,
        rhUserId: true,
        rhObservacao: true
      }
    }),
    prisma.registroPonto.findMany({
      where: { funcionarioId, apenasInformativo: false, dataHora: { gte: inicio, lte: fim } },
      select: {
        dataHora: true,
        latitude: true,
        longitude: true,
        modoRegistro: true,
        ajustado: true
      }
    })
  ]);

  /* Modalidade (presencial/home office/híbrido) DE CADA DIA, pelo histórico com vigência:
     mudar a configuração hoje não recalcula os dias passados. */
  const vigencias = await ensureModalidadeHistorico(prisma, funcionarioId);
  const modalidadeDoDia = (dia: string) => modalidadeNoDia(vigencias, dia);
  const algumDiaRemoto = vigencias.some((v) => v.modalidade !== "PRESENCIAL");

  /* Local de cada dia (só nos dias em que a modalidade permite trabalhar em casa). */
  const localPorDia = new Map<string, LocalDiaHoraExtra>();
  if (algumDiaRemoto) {
    const sedeCfg = await prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { lat: true, lng: true, raioMetros: true }
    });
    const end = func?.enderecoResidencial;
    const casa: AreaEndereco | null =
      end?.lat != null && end?.lng != null
        ? { lat: Number(end.lat), lng: Number(end.lng), raioMetros: end.raioMetros ?? 20 }
        : null;
    const sede: AreaEndereco | null =
      sedeCfg?.lat != null && sedeCfg?.lng != null
        ? {
            lat: Number(sedeCfg.lat),
            lng: Number(sedeCfg.lng),
            raioMetros: sedeCfg.raioMetros ?? 100
          }
        : null;
    const porDia = new Map<string, typeof remotos>();
    for (const r of remotos) {
      const dia = dataBrasiliaISO(r.dataHora);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia)!.push(r);
    }
    for (const [dia, regs] of porDia) {
      const modalidade = modalidadeDoDia(dia);
      if (modalidade === "PRESENCIAL") continue;
      const locais = regs
        .map((r) => localDaBatida(r, casa, sede))
        .filter((l): l is "CFO" | "CASA" | "FORA" => l != null);
      const local =
        localDoDia(locais) ??
        (modalidade === "HOME_OFFICE" ||
        regs.some((r) => r.modoRegistro === "HIBRIDO" || r.modoRegistro === "HOME_OFFICE")
          ? "CASA"
          : "CFO");
      localPorDia.set(dia, local);
    }
    /* Home office sem nenhuma batida no dia: em casa (vale para solicitações de HE). */
    for (
      let t = inicio.getTime();
      t <= fim.getTime() + 24 * 3600 * 1000 && localPorDia.size < 2000;
      t += 24 * 3600 * 1000
    ) {
      const dia = dataBrasiliaISO(new Date(t));
      if (!localPorDia.has(dia) && modalidadeDoDia(dia) === "HOME_OFFICE") {
        localPorDia.set(dia, "CASA");
      }
    }
  }
  const localNoDia = (dia: string): LocalDiaHoraExtra | undefined =>
    localPorDia.get(dia) ?? (modalidadeDoDia(dia) === "HOME_OFFICE" ? "CASA" : undefined);
  const remotoNoDia = (dia: string) => {
    const l = localNoDia(dia);
    return !!l && l !== "CFO";
  };
  const chefeNome = func ? await nomeChefeDoFuncionario(prisma, func) : null;

  const ultimaPorDia = new Map<string, (typeof sols)[number]>();
  for (const s of sols) ultimaPorDia.set(dataBrasiliaISO(s.dataReferencia), s);

  const userIds = [
    ...new Set(
      [...ultimaPorDia.values()]
        .flatMap((s) => [s.gestorUserId, s.rhUserId])
        .filter((id): id is string => !!id)
    )
  ];
  const nomes = new Map(
    userIds.length
      ? (
          await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true }
          })
        ).map((u) => [u.id, u.name])
      : []
  );

  const dias: Record<string, ContextoHoraExtraDia> = {};
  for (const [dia, local] of localPorDia) {
    dias[dia] = { situacao: "SEM_SOLICITACAO", remoto: local !== "CFO", local, chefeNome };
  }
  for (const [dia, s] of ultimaPorDia) {
    const base = { remoto: remotoNoDia(dia), local: localNoDia(dia), chefeNome };
    if (STATUS_APROVADA.includes(s.status)) {
      /* Aprovação do chefe basta; sem chefe registrado (ex.: aprovada direto pelo RH), vale o RH. */
      const peloChefe = !!s.gestorUserId;
      dias[dia] = {
        ...base,
        situacao: "APROVADA",
        decididaPor: peloChefe ? "CHEFE" : "RH",
        decididaPorNome: nomes.get((peloChefe ? s.gestorUserId : s.rhUserId) ?? "") ?? null,
        observacao: (peloChefe ? s.gestorObservacao : s.rhObservacao) || null
      };
    } else if (STATUS_REJEITADA.includes(s.status)) {
      const peloRh = s.status === "REJEITADA_RH";
      dias[dia] = {
        ...base,
        situacao: "REJEITADA",
        decididaPor: peloRh ? "RH" : "CHEFE",
        decididaPorNome: nomes.get((peloRh ? s.rhUserId : s.gestorUserId) ?? "") ?? null,
        observacao: (peloRh ? s.rhObservacao : s.gestorObservacao) || null
      };
    } else {
      dias[dia] = { ...base, situacao: "PENDENTE" };
    }
  }
  /* Estagiário/jovem aprendiz: nunca creditam hora extra (só informativo). */
  const semHoraExtra =
    func && categoriaSemHoraExtra(func.categoria)
      ? labelCategoriaSemIntervalo(func.categoria as string)
      : undefined;
  if (semHoraExtra) for (const d of Object.values(dias)) d.semHoraExtra = semHoraExtra;
  return {
    dias,
    /* Dia sem entrada própria: presencial (os dias em casa estão em `dias`, um a um). */
    padrao: {
      situacao: "SEM_SOLICITACAO",
      remoto: false,
      chefeNome,
      ...(semHoraExtra ? { semHoraExtra } : {})
    }
  };
}

/**
 * Dias do período que exigem o ciclo completo de batidas: dias em casa (modalidade do dia +
 * local pelo GPS, a mesma apuração da hora extra) a partir de
 * `ConfiguracaoSistema.cicloCompletoEmCasaDesde`. Sem a data (regra desligada) → nenhum.
 */
export async function diasCicloCompletoEmCasa(
  prisma: PrismaHe,
  funcionarioId: string,
  inicio: Date,
  fim: Date
): Promise<{ desde: string | null; dias: string[] }> {
  const cfg = await prisma.configuracaoSistema.findUnique({
    where: { id: "singleton" },
    select: { cicloCompletoEmCasaDesde: true }
  });
  if (!cfg?.cicloCompletoEmCasaDesde) return { desde: null, dias: [] };
  const desde = cfg.cicloCompletoEmCasaDesde.toISOString().slice(0, 10);
  const ctx = await carregarContextoHoraExtra(prisma, funcionarioId, inicio, fim);
  const dias = Object.entries(ctx.dias)
    .filter(([dia, v]) => v.remoto && dia >= desde)
    .map(([dia]) => dia)
    .sort();
  return { desde, dias };
}

/** Contexto do dia; sem entrada própria vale o padrão do período. */
export function contextoDoDia(ctx: ContextoHoraExtraPeriodo, dia: string): ContextoHoraExtraDia {
  return ctx.dias[dia] ?? ctx.padrao;
}

/**
 * Aplica a regra ao saldo do dia. Saldo ≤ 0, ou HE presencial dentro do limite sem
 * decisão do chefe: nada muda e não há informativo.
 */
export function aplicarRegraHoraExtra(
  saldoDiaMin: number,
  ctx: ContextoHoraExtraDia,
  limiteMin: number | null | undefined
): { saldoDiaMin: number; ajuste?: AjusteHoraExtraDia } {
  if (saldoDiaMin <= 0) return { saldoDiaMin };
  if (ctx.semHoraExtra) {
    /* Estagiário e jovem aprendiz não fazem hora extra: nada entra no banco, só informativo. */
    return {
      saldoDiaMin: 0,
      ajuste: {
        ...ctx,
        apuradoMin: saldoDiaMin,
        creditadoMin: 0,
        naoCreditadoMin: saldoDiaMin,
        limiteMin: 0,
        mensagem:
          `${ctx.semHoraExtra} não faz hora extra: as ${fmt(saldoDiaMin)} além da jornada ` +
          "são apenas informativas e não são creditadas no banco de horas."
      }
    };
  }
  const limite = Math.max(0, limiteMin ?? 120);
  const aprovada = ctx.situacao === "APROVADA";
  const creditadoMin = aprovada ? saldoDiaMin : ctx.remoto ? 0 : Math.min(saldoDiaMin, limite);
  const naoCreditadoMin = saldoDiaMin - creditadoMin;

  /* Presencial dentro do limite, sem decisão: crédito normal, sem informativo. */
  if (!aprovada && ctx.situacao !== "REJEITADA" && naoCreditadoMin === 0) {
    return { saldoDiaMin };
  }

  const chefe = ctx.chefeNome ? `do chefe ${ctx.chefeNome}` : "do chefe imediato";
  const nomeDecisor = ctx.decididaPorNome ?? (ctx.decididaPor === "RH" ? null : ctx.chefeNome);
  const quem =
    ctx.decididaPor === "RH"
      ? `pelo RH${nomeDecisor ? ` (${nomeDecisor})` : ""}`
      : `pelo chefe ${nomeDecisor ?? "imediato"}`;
  const local =
    ctx.local === "MISTO"
      ? "com batidas em casa e no CFO"
      : ctx.local === "FORA"
        ? "com batida fora do CFO"
        : ctx.remoto
          ? "em casa (home office/híbrido)"
          : ctx.local === "CFO"
            ? "no CFO"
            : "presencial";
  /* Explica por que o dia não teve o limite diário automático. */
  const motivoLocal =
    ctx.local === "MISTO" || ctx.local === "FORA"
      ? " O limite diário só vale quando todas as batidas do dia são no CFO."
      : "";
  const parcialAct = `Conforme ACT, foram creditadas ${fmt(creditadoMin)} no banco de horas (limite diário)`;

  let mensagem: string;
  switch (ctx.situacao) {
    case "APROVADA":
      mensagem = `Hora extra de ${fmt(saldoDiaMin)} (${local}) aprovada ${quem} e creditada integralmente no banco de horas.`;
      break;
    case "REJEITADA":
      if (ctx.remoto) {
        mensagem = `Hora extra de ${fmt(naoCreditadoMin)} ${local} rejeitada ${quem}. Conforme ACT, fora do CFO a hora extra só entra no banco de horas com aprovação ${chefe}.${motivoLocal}`;
      } else if (naoCreditadoMin > 0) {
        mensagem = `${parcialAct} e ${fmt(naoCreditadoMin)} que ultrapassaram o limite foram rejeitadas ${quem}.`;
      } else {
        mensagem = `Hora extra rejeitada ${quem}, mas, conforme ACT, as ${fmt(creditadoMin)} ficaram dentro do limite diário de ${fmt(limite)} e foram creditadas no banco de horas.`;
      }
      break;
    case "PENDENTE":
      mensagem = ctx.remoto
        ? `Hora extra de ${fmt(naoCreditadoMin)} ${local} ainda não creditada no banco de horas: aguardando aprovação ${chefe}. Se aprovada, será creditada.${motivoLocal}`
        : `${parcialAct}; as ${fmt(naoCreditadoMin)} excedentes aguardam aprovação ${chefe} e, se aprovadas, serão creditadas.`;
      break;
    default:
      mensagem = ctx.remoto
        ? `Hora extra de ${fmt(naoCreditadoMin)} ${local} não creditada no banco de horas: conforme ACT, fora do CFO só entra com aprovação ${chefe}, e não há solicitação de hora extra para este dia.${motivoLocal}`
        : `${parcialAct}; as ${fmt(naoCreditadoMin)} excedentes não foram creditadas, pois não há solicitação de hora extra aprovada ${chefe} para este dia.`;
  }
  if (ctx.observacao) mensagem += ` Observação: ${ctx.observacao}`;

  return {
    saldoDiaMin: creditadoMin,
    ajuste: {
      ...ctx,
      apuradoMin: saldoDiaMin,
      creditadoMin,
      naoCreditadoMin,
      limiteMin: limite,
      mensagem
    }
  };
}

/**
 * Rótulo do status "OK" por dia para home office / híbrido: "Home Office" ou "Híbrido", só nos
 * dias em que TODAS as batidas foram em casa. Presencial e dias do híbrido no CFO não entram
 * (continuam "OK"). Usa a modalidade vigente em cada dia (histórico), então mudar a modalidade
 * depois não altera os dias passados.
 */
export async function rotulosModalidadePorDia(
  prisma: PrismaHe,
  funcionarioId: string,
  inicio: Date,
  fim: Date
): Promise<Record<string, string>> {
  const [ctx, vigencias] = await Promise.all([
    carregarContextoHoraExtra(prisma, funcionarioId, inicio, fim),
    ensureModalidadeHistorico(prisma, funcionarioId)
  ]);
  const out: Record<string, string> = {};
  for (const [dia, v] of Object.entries(ctx.dias)) {
    if (v.local !== "CASA") continue;
    const mod = modalidadeNoDia(vigencias, dia);
    if (mod === "HOME_OFFICE") out[dia] = "Home Office";
    else if (mod === "HIBRIDO") out[dia] = "Híbrido";
  }
  return out;
}

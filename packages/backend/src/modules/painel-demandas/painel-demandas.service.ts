import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { dataCivilISO, hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { SaudeOcupacionalService } from "../saude-ocupacional/saude-ocupacional.service";

export type NivelDemanda = "ok" | "atencao" | "urgente";

export interface ItemDemanda {
  nome: string;
  matricula: string | null;
  extra: string | null;
}

export interface CartaoDemanda {
  id: string;
  secao: string;
  titulo: string;
  total: number;
  nivel: NivelDemanda;
  /** Tela onde a demanda é resolvida. */
  rota: string;
  /** Detalhamento curto (ex.: "3 abonos · 2 atestados"). */
  detalhe?: string;
  itens: ItemDemanda[];
}

const LIMITE_ITENS = 300;

const ROTULO_TIPO: Record<string, [string, string]> = {
  CORRECAO_PONTO: ["correção", "correções"],
  ATESTADO: ["atestado", "atestados"],
  FERIAS: ["férias", "férias"],
  LICENCA: ["licença", "licenças"],
  ABONO: ["abono", "abonos"],
  DAY_OFF: ["day off", "day offs"],
  HORA_EXTRA: ["hora extra", "horas extras"],
  ENVIO_DOCUMENTO_RH: ["documento", "documentos"]
};

function nivelPor(total: number, urgenteAcima = Infinity): NivelDemanda {
  if (total <= 0) return "ok";
  return total > urgenteAcima ? "urgente" : "atencao";
}

/** Painel de acompanhamento das demandas do RH: contagens e listas em uma só consulta. */
@Injectable()
export class PainelDemandasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saude: SaudeOcupacionalService
  ) {}

  async painel() {
    const hoje = hojeBrasiliaISO();
    const cartoes: CartaoDemanda[] = [];

    /* ── Aprovações (solicitações abertas por etapa) ── */
    const abertas = await this.prisma.solicitacao.findMany({
      where: {
        status: {
          in: [
            "PENDENTE",
            "AGUARDANDO_RH",
            "AGUARDANDO_GESTOR_RH",
            "AGUARDANDO_DOCUMENTO_FUNCIONARIO"
          ]
        },
        funcionario: { ativo: true }
      },
      orderBy: { createdAt: "asc" },
      select: {
        status: true,
        tipo: true,
        createdAt: true,
        funcionario: { select: { matricula: true, user: { select: { name: true } } } }
      }
    });
    const etapas: Array<[string, string, string, number]> = [
      ["sol-chefe", "Aguardando o chefe", "PENDENTE", 10],
      ["sol-rh", "Aguardando o RH", "AGUARDANDO_RH", 5],
      ["sol-gerente-rh", "Aguardando o Gerente de RH", "AGUARDANDO_GESTOR_RH", 0],
      [
        "sol-documento",
        "Aguardando documento do funcionário",
        "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
        10
      ]
    ];
    for (const [id, titulo, status, urgenteAcima] of etapas) {
      const lista = abertas.filter((s) => s.status === status);
      const porTipo = new Map<string, number>();
      for (const s of lista) porTipo.set(s.tipo, (porTipo.get(s.tipo) ?? 0) + 1);
      cartoes.push({
        id,
        secao: "Aprovações",
        titulo,
        total: lista.length,
        nivel: nivelPor(lista.length, urgenteAcima),
        rota: "/ponto/aprovacoes",
        detalhe: [...porTipo.entries()]
          .map(
            ([t, n]) =>
              `${n} ${(ROTULO_TIPO[t] ?? [t.toLowerCase(), t.toLowerCase()])[n === 1 ? 0 : 1]}`
          )
          .join(" · "),
        itens: lista.slice(0, LIMITE_ITENS).map((s) => ({
          nome: s.funcionario.user.name,
          matricula: s.funcionario.matricula,
          extra: `${(ROTULO_TIPO[s.tipo] ?? [s.tipo])[0]} · desde ${dataCivilISO(s.createdAt)}`
        }))
      });
    }

    /* ── Folhas de ponto pendentes de assinatura ── */
    const folhas = await this.prisma.assinaturaQuadro.findMany({
      where: {
        status: { in: ["PENDENTE_FUNCIONARIO", "PENDENTE_GESTOR"] },
        periodo: { funcionario: { ativo: true } }
      },
      orderBy: [{ periodo: { ano: "asc" } }, { periodo: { mes: "asc" } }],
      select: {
        status: true,
        periodo: {
          select: {
            mes: true,
            ano: true,
            funcionario: { select: { matricula: true, user: { select: { name: true } } } }
          }
        }
      }
    });
    for (const [id, titulo, status] of [
      ["folha-funcionario", "Folhas aguardando o funcionário", "PENDENTE_FUNCIONARIO"],
      ["folha-chefe", "Folhas aguardando o chefe", "PENDENTE_GESTOR"]
    ] as const) {
      const lista = folhas.filter((f) => f.status === status);
      cartoes.push({
        id,
        secao: "Folhas de ponto",
        titulo,
        total: lista.length,
        nivel: nivelPor(lista.length, 20),
        rota: "/ponto/auditoria",
        itens: lista.slice(0, LIMITE_ITENS).map((f) => ({
          nome: f.periodo.funcionario.user.name,
          matricula: f.periodo.funcionario.matricula,
          extra: `${String(f.periodo.mes).padStart(2, "0")}/${f.periodo.ano}`
        }))
      });
    }

    /* ── Saúde ocupacional ── */
    const exames = await this.saude.painel({});
    const exame = (filtro: (i: (typeof exames.itens)[number]) => boolean) =>
      exames.itens.filter(filtro).map((i) => ({
        nome: i.nome,
        matricula: i.matricula,
        extra:
          i.diasParaVencer === null
            ? "sem exame registrado"
            : i.diasParaVencer < 0
              ? `vencido há ${-i.diasParaVencer} dia(s)`
              : `vence em ${i.diasParaVencer} dia(s)`
      }));
    for (const [id, titulo, filtro, urgente] of [
      [
        "saude-vencidos",
        "Exames ocupacionais vencidos",
        (i: { situacao: string }) => i.situacao === "VENCIDO",
        true
      ],
      [
        "saude-a-vencer",
        "Exames a vencer",
        (i: { situacao: string }) => i.situacao === "A_VENCER",
        false
      ],
      [
        "saude-sem-exame",
        "Sem exame registrado",
        (i: { situacao: string }) => i.situacao === "SEM_EXAME",
        false
      ]
    ] as const) {
      const itens = exame(filtro as never);
      cartoes.push({
        id,
        secao: "Saúde ocupacional",
        titulo,
        total: itens.length,
        nivel: itens.length === 0 ? "ok" : urgente ? "urgente" : "atencao",
        rota: "/ponto/auditoria",
        itens: itens.slice(0, LIMITE_ITENS)
      });
    }
    const conferir = exames.itens.filter((i) => i.aguardandoConferencia);
    cartoes.push({
      id: "saude-conferir",
      secao: "Saúde ocupacional",
      titulo: "Exames aguardando conferência",
      total: conferir.length,
      nivel: nivelPor(conferir.length),
      rota: "/ponto/auditoria",
      itens: conferir.slice(0, LIMITE_ITENS).map((i) => ({
        nome: i.nome,
        matricula: i.matricula,
        extra: `exame de ${i.aguardandoConferencia?.dataRealizacao ?? ""}`
      }))
    });

    /* ── Requisições do RH em aberto ── */
    const reqs = await this.prisma.requisicaoRhDestinatario.findMany({
      where: {
        status: { not: "RESPONDIDO" },
        requisicao: { ativa: true },
        funcionario: { ativo: true }
      },
      select: {
        requisicao: { select: { titulo: true, prazo: true } },
        funcionario: { select: { matricula: true, user: { select: { name: true } } } }
      }
    });
    const mapReq = (l: typeof reqs) =>
      l.slice(0, LIMITE_ITENS).map((r) => ({
        nome: r.funcionario.user.name,
        matricula: r.funcionario.matricula,
        extra: r.requisicao.titulo
      }));
    const vencidasReq = reqs.filter(
      (r) => r.requisicao.prazo && dataCivilISO(r.requisicao.prazo) < hoje
    );
    cartoes.push(
      {
        id: "req-abertas",
        secao: "Requisições do RH",
        titulo: "Respostas pendentes",
        total: reqs.length,
        nivel: nivelPor(reqs.length, 50),
        rota: "/ponto/requisicoes-rh",
        itens: mapReq(reqs)
      },
      {
        id: "req-vencidas",
        secao: "Requisições do RH",
        titulo: "Com prazo vencido",
        total: vencidasReq.length,
        nivel: vencidasReq.length ? "urgente" : "ok",
        rota: "/ponto/requisicoes-rh",
        itens: mapReq(vencidasReq)
      }
    );

    /* ── Contratos e cadastro ── */
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { contratoAvisoAntecedenciaDias: true }
    });
    const avisoDias = cfg?.contratoAvisoAntecedenciaDias ?? 90;
    const limite = dataCivilISO(
      new Date(Date.parse(`${hoje}T12:00:00-03:00`) + avisoDias * 86400000)
    );
    const contratos = await this.prisma.funcionario.findMany({
      where: {
        ativo: true,
        categoria: { in: ["ESTAGIARIO", "MENOR_APRENDIZ"] },
        contratoTermino: {
          gte: new Date(`${hoje}T00:00:00Z`),
          lte: new Date(`${limite}T00:00:00Z`)
        }
      },
      orderBy: { contratoTermino: "asc" },
      select: { matricula: true, contratoTermino: true, user: { select: { name: true } } }
    });
    cartoes.push({
      id: "contratos-a-vencer",
      secao: "Contratos e cadastro",
      titulo: "Contratos a vencer",
      total: contratos.length,
      nivel: nivelPor(contratos.length),
      rota: "/ponto/gestao",
      detalhe: `próximos ${avisoDias} dias`,
      itens: contratos.slice(0, LIMITE_ITENS).map((c) => ({
        nome: c.user.name,
        matricula: c.matricula,
        extra: `termina em ${dataCivilISO(c.contratoTermino!)}`
      }))
    });
    const [semLotacao, gerencias] = await Promise.all([
      this.prisma.funcionario.findMany({
        where: { ativo: true, gerenciaId: null },
        select: { matricula: true, user: { select: { name: true } } }
      }),
      this.prisma.gerencia.findMany({
        where: { ativa: true },
        select: {
          nome: true,
          funcionarios: { where: { ativo: true, isManager: true }, select: { id: true } }
        }
      })
    ]);
    const semChefe = gerencias.filter((g) => g.funcionarios.length === 0);
    cartoes.push(
      {
        id: "sem-lotacao",
        secao: "Contratos e cadastro",
        titulo: "Funcionários sem lotação",
        total: semLotacao.length,
        nivel: nivelPor(semLotacao.length),
        rota: "/ponto/gestao",
        itens: semLotacao.slice(0, LIMITE_ITENS).map((f) => ({
          nome: f.user.name,
          matricula: f.matricula,
          extra: null
        }))
      },
      {
        id: "gerencias-sem-chefe",
        secao: "Contratos e cadastro",
        titulo: "Gerências sem chefe",
        total: semChefe.length,
        nivel: nivelPor(semChefe.length),
        rota: "/ponto/gerencias",
        itens: semChefe.map((g) => ({ nome: g.nome, matricula: null, extra: null }))
      }
    );

    return {
      geradoEm: new Date().toISOString(),
      cartoes
    };
  }
}

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SEM_ALTA_ADMINISTRACAO } from "../../utils/categoria-jornada";
import {
  RANK_GRAVIDADE,
  calcularControleFerias,
  type GravidadeFerias,
  type SolicitacaoFeriasControle
} from "../../utils/ferias-controle";
import { dataBrasiliaISO, dataCivilISO, hojeBrasiliaISO } from "../../utils/horario-brasilia";

const STATUS_FERIAS = [
  "APROVADA",
  "PENDENTE",
  "AGUARDANDO_RH",
  "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
  "AGUARDANDO_GESTOR_RH"
] as const;

/** Controle geral de férias (aba global do RH). Só leitura: não altera solicitações nem saldos. */
@Injectable()
export class FeriasControleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ciclos cujo concessivo terminou ANTES deste marco não são avaliados (sem histórico no sistema, evitaria falso
   * "em dobro"). Padrão: data da primeira solicitação de férias do sistema; `FERIAS_CONTROLE_MARCO_INICIAL`
   * (AAAA-MM-DD) sobrescreve.
   */
  private async marcoInicial(): Promise<string | null> {
    const env = process.env.FERIAS_CONTROLE_MARCO_INICIAL?.trim();
    if (env && /^\d{4}-\d{2}-\d{2}$/.test(env)) return env;
    const r = await this.prisma.solicitacao.aggregate({
      where: { tipo: "FERIAS" },
      _min: { createdAt: true }
    });
    return r._min.createdAt ? dataBrasiliaISO(r._min.createdAt) : null;
  }

  async painel(filtros: {
    busca?: string;
    gerenciaId?: string;
    categoria?: string;
    gravidade?: string;
    status?: string;
  }) {
    const hoje = hojeBrasiliaISO();
    const marco = await this.marcoInicial();
    /* Estatística: ativos, sem Alta Administração. */
    const funcs = await this.prisma.funcionario.findMany({
      where: { ativo: true, categoria: SEM_ALTA_ADMINISTRACAO },
      select: {
        id: true,
        matricula: true,
        categoria: true,
        dataAdmissao: true,
        gerencia: { select: { nome: true, sigla: true } },
        gerenciaId: true,
        user: { select: { name: true } }
      }
    });
    const sols = await this.prisma.solicitacao.findMany({
      where: {
        tipo: "FERIAS",
        status: { in: [...STATUS_FERIAS] },
        funcionarioId: { in: funcs.map((f) => f.id) }
      },
      select: { id: true, funcionarioId: true, status: true, metadados: true },
      orderBy: { createdAt: "asc" }
    });
    const porFunc = new Map<string, SolicitacaoFeriasControle[]>();
    for (const s of sols) {
      const lista = porFunc.get(s.funcionarioId) ?? [];
      lista.push({ id: s.id, status: s.status, metadados: s.metadados });
      porFunc.set(s.funcionarioId, lista);
    }

    const todos = funcs.map((f) => {
      const calc = calcularControleFerias(
        {
          dataAdmissao: f.dataAdmissao ? dataCivilISO(f.dataAdmissao) : null,
          categoria: f.categoria,
          solicitacoes: porFunc.get(f.id) ?? []
        },
        hoje,
        marco
      );
      return {
        funcionarioId: f.id,
        nome: f.user?.name ?? "—",
        matricula: f.matricula,
        categoria: f.categoria,
        gerenciaId: f.gerenciaId,
        gerencia: f.gerencia?.sigla || f.gerencia?.nome || null,
        ...calc
      };
    });

    const resumo: Record<GravidadeFerias | "total", number> = {
      total: todos.length,
      EM_DOBRO: 0,
      VENCE_CRITICO: 0,
      SEM_ADMISSAO: 0,
      VENCE_EM_BREVE: 0,
      NAO_PROGRAMADO: 0,
      PARCIAL: 0,
      FRACIONAMENTO_IRREGULAR: 0,
      PROGRAMADO: 0,
      EM_GOZO: 0,
      EM_DIA: 0
    };
    for (const i of todos) resumo[i.gravidade]++;

    const busca = filtros.busca?.trim().toLowerCase();
    const itens = todos
      .filter((i) => !filtros.gerenciaId || i.gerenciaId === filtros.gerenciaId)
      .filter((i) => !filtros.categoria || i.categoria === filtros.categoria)
      .filter((i) => !filtros.gravidade || i.gravidade === filtros.gravidade)
      .filter((i) => !filtros.status || i.status === filtros.status)
      .filter(
        (i) =>
          !busca ||
          i.nome.toLowerCase().includes(busca) ||
          (i.matricula ?? "").toLowerCase().includes(busca)
      )
      .sort(
        (a, b) =>
          RANK_GRAVIDADE[a.gravidade] - RANK_GRAVIDADE[b.gravidade] ||
          (a.proximoVencimento ?? "9999-12-31").localeCompare(
            b.proximoVencimento ?? "9999-12-31"
          ) ||
          a.nome.localeCompare(b.nome, "pt-BR")
      );

    return { hoje, marcoInicial: marco, resumo, itens };
  }
}

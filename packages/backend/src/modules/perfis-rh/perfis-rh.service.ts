import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { isGerenciaRh, isGerenciaRhSlug } from "../../common/gerencia-rh.util";
import { TODOS_RECURSOS_RH, recursoRhValido } from "../../utils/recursos-rh";
import { PAPEIS_GERENTE_RH, carregarPermissoesRh } from "../auth/permissao-rh.guard";

type Usuario = { sub: string; roles?: string[]; isSuperAdmin?: boolean };

@Injectable()
export class PerfisRhService {
  constructor(private readonly prisma: PrismaService) {}

  private ehGerenteRh(u: Usuario) {
    return !!u.isSuperAdmin || (u.roles ?? []).some((r) => PAPEIS_GERENTE_RH.includes(r));
  }

  /** Funcionários ativos lotados na gerência de RH (mesmo critério do papel RH_AUDITORIA). */
  private async funcionariosRh() {
    const ativos = await this.prisma.funcionario.findMany({
      where: { ativo: true },
      orderBy: { user: { name: "asc" } },
      select: {
        id: true,
        matricula: true,
        section: true,
        isManager: true,
        user: { select: { name: true, externalId: true } },
        gerencia: { select: { nome: true, sigla: true } },
        permissoesRh: { select: { recurso: true, concedidoEm: true, concedidoPorId: true } }
      }
    });
    return ativos.filter(
      (f) => isGerenciaRh(f.gerencia) || (f.section ? isGerenciaRhSlug(f.section) : false)
    );
  }

  async listar() {
    const lista = await this.funcionariosRh();
    return lista.map((f) => ({
      id: f.id,
      nome: f.user.name,
      matricula: f.matricula,
      isManager: f.isManager,
      gerencia: f.gerencia?.sigla || f.gerencia?.nome || null,
      recursos: f.permissoesRh.map((p) => p.recurso),
      atualizadoEm:
        f.permissoesRh.map((p) => p.concedidoEm).sort((a, b) => b.getTime() - a.getTime())[0] ??
        null
    }));
  }

  private async validarAlvo(funcionarioId: string, u: Usuario) {
    const rh = await this.funcionariosRh();
    const alvo = rh.find((f) => f.id === funcionarioId);
    if (!alvo) {
      const existe = await this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { id: true }
      });
      if (!existe) throw new NotFoundException("Funcionário não encontrado.");
      throw new BadRequestException("Perfis do RH se aplicam somente a funcionários do RH.");
    }
    /* Ninguém ajusta o próprio perfil (mesma regra de não tratar a própria demanda). */
    if (alvo.user.externalId && alvo.user.externalId === u.sub) {
      throw new ForbiddenException("Você não pode alterar o seu próprio perfil do RH.");
    }
  }

  private async gravar(funcionarioId: string, recursos: string[], concedidoPorId: string | null) {
    const unicos = [...new Set(recursos)];
    const invalidos = unicos.filter((r) => !recursoRhValido(r));
    if (invalidos.length) {
      throw new BadRequestException(`Permissões desconhecidas: ${invalidos.join(", ")}.`);
    }
    await this.prisma.$transaction([
      this.prisma.permissaoRh.deleteMany({ where: { funcionarioId } }),
      this.prisma.permissaoRh.createMany({
        data: unicos.map((recurso) => ({ funcionarioId, recurso, concedidoPorId }))
      })
    ]);
  }

  private async userIdLocal(sub: string) {
    return (
      (await this.prisma.user.findFirst({ where: { externalId: sub }, select: { id: true } }))
        ?.id ?? null
    );
  }

  async salvar(funcionarioId: string, recursos: string[], u: Usuario) {
    if (!Array.isArray(recursos)) throw new BadRequestException("Informe a lista de permissões.");
    await this.validarAlvo(funcionarioId, u);
    await this.gravar(funcionarioId, recursos, await this.userIdLocal(u.sub));
    return { ok: true, total: new Set(recursos).size };
  }

  async copiar(origemId: string, destinoIds: string[], u: Usuario) {
    if (!origemId || !Array.isArray(destinoIds) || !destinoIds.length) {
      throw new BadRequestException("Informe o perfil de origem e ao menos um destino.");
    }
    const origem = await this.prisma.permissaoRh.findMany({
      where: { funcionarioId: origemId },
      select: { recurso: true }
    });
    const recursos = origem.map((o) => o.recurso);
    const concedidoPorId = await this.userIdLocal(u.sub);
    const destinos = destinoIds.filter((d) => d !== origemId);
    for (const d of destinos) await this.validarAlvo(d, u);
    for (const d of destinos) await this.gravar(d, recursos, concedidoPorId);
    return { ok: true, copiados: destinos.length, recursos: recursos.length };
  }

  /** Permissões do próprio usuário (menu, abas e botões do front). */
  async minhas(u: Usuario) {
    if (this.ehGerenteRh(u)) return { acessoTotal: true, recursos: TODOS_RECURSOS_RH };
    if (!(u.roles ?? []).includes("RH_AUDITORIA")) return { acessoTotal: false, recursos: [] };
    return { acessoTotal: false, recursos: [...(await carregarPermissoesRh(this.prisma, u.sub))] };
  }
}

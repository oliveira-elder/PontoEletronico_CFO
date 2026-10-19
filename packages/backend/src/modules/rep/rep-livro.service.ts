import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { campoN, dataHoraDH, fusoHorario } from "../../utils/afd-campos";
import { detectarInstancia, type InstanciaDetectada } from "../../utils/instancia-rep";
import { parseObservacoes } from "../../utils/registro-observacoes";
import { RepPService } from "./rep-p.service";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Tipos de evento do AFD guardados em EventoRep. */
export type TipoEventoRep = 2 | 4 | 5 | 6;

/** Coletor da marcação (AFD tipo 7, campo 6). */
export function coletorDaOrigem(origem: string | null | undefined): string {
  if (origem === "MOBILE") return "01";
  if (origem === "TOTEM") return "04";
  return "02"; // navegador (web/desktop no navegador)
}

/**
 * Livro do REP (Portaria MTP 671/2021): NSR sem lacunas, marcações originais imutáveis (base
 * do AFD), eventos dos tipos 2/4/5/6, identidade da instância (VM) e monitor do relógio.
 */
@Injectable()
export class RepLivroService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RepLivroService.name);
  private instancia: (InstanciaDetectada & { id: string }) | null = null;
  /** Motivo do bloqueio de novas marcações (NSR abaixo do exportado / 2ª instância ativa). */
  private bloqueio: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ultimaConferenciaNtp = 0;
  private ultimoTique = { relogio: Date.now(), monotonico: process.hrtime.bigint() };

  /** Resultado da última verificação da cadeia de hash (diária e na subida). */
  private ultimaVerificacao: {
    em: Date;
    ok: boolean;
    marcacoes: number;
    primeiraQuebraNsr?: number;
    detalhe?: string;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repP: RepPService
  ) {}

  async onModuleInit() {
    try {
      await this.garantirImutabilidade();
      await this.prisma.contadorNsr.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", ultimo: 0 },
        update: {}
      });
      await this.registrarInstancia();
      await this.conferirNsrExportado();
      void this.repP.verificarNtp().catch(() => undefined);
      this.timer = setInterval(() => void this.tique(), 60_000);
      this.timer.unref?.();
      /* Carga inicial do livro com os meses anteriores (uma única vez). */
      void this.cargaInicial()
        .then(() => this.sincronizarEmpresa())
        .then(() => this.verificarCadeia())
        .then(() => undefined)
        .catch((e) =>
          this.logger.error(`Carga inicial do livro REP falhou: ${(e as Error).message}`)
        );
    } catch (e) {
      this.logger.error(`Livro REP: inicialização falhou: ${(e as Error).message}`);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Situação para a tela de Configurações e para a pré-validação. */
  async situacao() {
    const [contador, marcacoes, eventos, instancias, ultimaExtracao] = await Promise.all([
      this.prisma.contadorNsr.findUnique({ where: { id: "singleton" } }),
      this.prisma.marcacaoRep.count(),
      this.prisma.eventoRep.count(),
      this.prisma.instanciaRep.findMany({ orderBy: { primeiraVez: "desc" }, take: 10 }),
      this.prisma.extracaoArquivoFiscal.findFirst({ orderBy: { createdAt: "desc" } })
    ]);
    return {
      nsrAtual: contador?.ultimo ?? 0,
      marcacoes,
      eventos,
      bloqueio: this.bloqueio,
      instanciaAtual: this.instancia
        ? { id: this.instancia.id, codigo: this.instancia.codigo, origem: this.instancia.origem }
        : null,
      instancias,
      ultimaExtracao,
      verificacaoCadeia: this.ultimaVerificacao
    };
  }

  /* ─── Integridade da cadeia de hash ─── */

  /**
   * Refaz o hash de cada marcação (campos do AFD tipo 7 + hash anterior) e confere o encadeamento por
   * cadeia única de marcações. Roda na subida e uma vez por dia; uma quebra bloqueia novas marcações até a TI analisar.
   */
  async verificarCadeia(): Promise<NonNullable<RepLivroService["ultimaVerificacao"]>> {
    let total = 0;
    let quebra: { nsr: number; detalhe: string } | null = null;
    let anterior: string | null = null as string | null;
    let cursor = 0;
    for (;;) {
      const lote = await this.prisma.marcacaoRep.findMany({
        where: { nsr: { gt: cursor } },
        orderBy: { nsr: "asc" },
        take: 2000
      });
      if (!lote.length) break;
      for (const m of lote) {
        total++;
        cursor = m.nsr;
        const base =
          campoN(m.nsr, 9) +
          "7" +
          dataHoraDH(m.dataHoraMarcacao) +
          campoN(m.cpf, 12) +
          dataHoraDH(m.dataHoraGravacao) +
          m.coletor +
          (m.offline ? "1" : "0") +
          (anterior ?? "");
        const esperado = createHash("sha256").update(base, "latin1").digest("hex");
        if (!quebra && (m.hash !== esperado || (m.hashAnterior ?? null) !== anterior)) {
          quebra = {
            nsr: m.nsr,
            detalhe:
              m.hash !== esperado
                ? "o hash gravado não confere com os campos da marcação"
                : "o encadeamento com a marcação anterior está quebrado"
          };
        }
        anterior = m.hash;
      }
    }
    this.ultimaVerificacao = {
      em: new Date(),
      ok: !quebra,
      marcacoes: total,
      ...(quebra ? { primeiraQuebraNsr: quebra.nsr, detalhe: quebra.detalhe } : {})
    };
    if (quebra) {
      this.bloqueio = `integridade do livro: NSR ${quebra.nsr} — ${quebra.detalhe}.`;
      this.logger.error(`Cadeia de hash do REP quebrada: ${this.bloqueio}`);
    } else {
      this.logger.log(`Cadeia de hash do REP íntegra (${total} marcações).`);
    }
    return this.ultimaVerificacao;
  }

  /* ─── NSR ─── */

  /** Próximo NSR — o UPDATE trava a linha até o fim da transação: sem lacunas nem repetição. */
  async reservarNsr(tx: Tx): Promise<number> {
    const r = await tx.$queryRaw<Array<{ ultimo: number }>>`
      UPDATE "ContadorNsr" SET ultimo = ultimo + 1 WHERE id = 'singleton' RETURNING ultimo`;
    const nsr = Number(r[0]?.ultimo);
    if (!nsr) throw new Error("Contador de NSR não inicializado.");
    if (nsr > 999_999_999) throw new Error("NSR esgotado (999.999.999).");
    return nsr;
  }

  private assertPodeGravar() {
    const motivo = this.bloqueio ?? this.repP.relogioForaDoLimite();
    if (motivo) {
      throw new ServiceUnavailableException(
        `Registro de ponto temporariamente indisponível: ${motivo} Procure a TI.`
      );
    }
  }

  /* ─── Marcações ─── */

  /**
   * Grava a marcação ORIGINAL no livro (mesma transação da batida). Hash SHA-256 encadeado
   * sobre os campos do registro tipo 7 do AFD.
   */
  async registrarMarcacao(
    tx: Tx,
    m: {
      registroPontoId: string | null;
      funcionarioId: string;
      cpf: string | null;
      tipoPonto: import("@prisma/client").TipoPonto;
      dataHoraMarcacao: Date;
      dataHoraGravacao?: Date;
      origem?: string | null;
      offline?: boolean;
      reconstituida?: boolean;
    }
  ) {
    if (!m.reconstituida) this.assertPodeGravar();
    const nsr = await this.reservarNsr(tx);
    const gravacao = m.dataHoraGravacao ?? new Date();
    /* Cadeia única de hash (AFD tipo 7): o anterior é a última marcação gravada. */
    const anterior = await tx.marcacaoRep.findFirst({
      orderBy: { nsr: "desc" },
      select: { hash: true }
    });
    const coletor = coletorDaOrigem(m.origem);
    const base =
      campoN(nsr, 9) +
      "7" +
      dataHoraDH(m.dataHoraMarcacao) +
      campoN(m.cpf, 12) +
      dataHoraDH(gravacao) +
      coletor +
      (m.offline ? "1" : "0") +
      (anterior?.hash ?? "");
    const hash = createHash("sha256").update(base, "latin1").digest("hex");
    return tx.marcacaoRep.create({
      data: {
        nsr,
        funcionarioId: m.funcionarioId,
        cpf: (m.cpf ?? "").replace(/\D/g, ""),
        tipoPonto: m.tipoPonto,
        dataHoraMarcacao: m.dataHoraMarcacao,
        dataHoraGravacao: gravacao,
        fusoMarcacao: fusoHorario(m.dataHoraMarcacao),
        fusoGravacao: fusoHorario(gravacao),
        coletor,
        offline: !!m.offline,
        registroPontoId: m.registroPontoId,
        instanciaId: this.instancia?.id ?? null,
        hashAnterior: anterior?.hash ?? null,
        hash,
        reconstituida: !!m.reconstituida
      }
    });
  }

  /* ─── Eventos (AFD 2, 4, 5, 6) ─── */

  async registrarEvento(
    tipo: TipoEventoRep,
    dados: Record<string, unknown>,
    opts: { tx?: Tx; dataHora?: Date } = {}
  ) {
    const executar = async (tx: Tx) => {
      const nsr = await this.reservarNsr(tx);
      return tx.eventoRep.create({
        data: {
          nsr,
          tipo,
          dataHora: opts.dataHora ?? new Date(),
          dados: dados as Prisma.InputJsonValue,
          instanciaId: this.instancia?.id ?? null
        }
      });
    };
    if (opts.tx) return executar(opts.tx);
    return this.prisma.$transaction((tx) => executar(tx));
  }

  /** Funcionário incluído/alterado/excluído no REP (tipo 5). */
  async eventoEmpregado(
    operacao: "I" | "A" | "E",
    f: { id: string; cpf: string | null; nome: string; matricula?: string | null },
    responsavelCpf?: string | null
  ) {
    try {
      const cfg = await this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: { repResponsavelCpf: true }
      });
      await this.registrarEvento(5, {
        operacao,
        funcionarioId: f.id,
        cpf: (f.cpf ?? "").replace(/\D/g, ""),
        nome: f.nome,
        demais: (f.matricula ?? "").replace(/\D/g, "").slice(-4),
        responsavelCpf: (responsavelCpf ?? cfg?.repResponsavelCpf ?? "").replace(/\D/g, "")
      });
    } catch (e) {
      this.logger.error(`Evento REP tipo 5 falhou: ${(e as Error).message}`);
    }
  }

  /** Dados da empresa incluídos/alterados no REP (tipo 2). */
  async eventoEmpresa(responsavelCpf?: string | null) {
    try {
      const c = await this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } });
      if (!c) return;
      await this.registrarEvento(2, {
        responsavelCpf: (responsavelCpf ?? c.repResponsavelCpf ?? "").replace(/\D/g, ""),
        cnpj: (c.cnpj ?? "").replace(/\D/g, ""),
        cnoCaepf: (c.repCnoCaepf ?? "").replace(/\D/g, ""),
        razaoSocial: c.nome,
        localPrestacao:
          c.repLocalPrestacao ??
          [c.endereco, c.numero, c.bairro, c.cidade, c.uf].filter(Boolean).join(", ")
      });
    } catch (e) {
      this.logger.error(`Evento REP tipo 2 falhou: ${(e as Error).message}`);
    }
  }

  /* ─── Sincronização dos cadastros (eventos 2 e 5 sem depender de cada tela) ─── */

  /**
   * Compara o cadastro atual com o último evento tipo 5 de cada funcionário e grava I/A/E
   * quando há diferença (inclusão, troca de nome/CPF, desligamento). Cobre todos os caminhos
   * (cadastro, edição, cron de desligamento, substituição) e roda antes de cada AFD.
   */
  async sincronizarEmpregados() {
    try {
      const [funcs, eventos] = await Promise.all([
        this.prisma.funcionario.findMany({
          select: {
            id: true,
            cpf: true,
            matricula: true,
            ativo: true,
            user: { select: { name: true } }
          }
        }),
        this.prisma.eventoRep.findMany({ where: { tipo: 5 }, orderBy: { nsr: "asc" } })
      ]);
      const ultimo = new Map<string, Record<string, unknown>>();
      for (const e of eventos) {
        const d = e.dados as Record<string, unknown>;
        if (typeof d.funcionarioId === "string") ultimo.set(d.funcionarioId, d);
      }
      for (const f of funcs) {
        const cpf = (f.cpf ?? "").replace(/\D/g, "");
        const nome = f.user?.name ?? "";
        const ev = ultimo.get(f.id);
        const noRep = !!ev && ev.operacao !== "E";
        if (f.ativo && cpf && !noRep) {
          await this.eventoEmpregado("I", { id: f.id, cpf, nome, matricula: f.matricula });
        } else if (f.ativo && noRep && (ev!.cpf !== cpf || ev!.nome !== nome)) {
          await this.eventoEmpregado("A", { id: f.id, cpf, nome, matricula: f.matricula });
        } else if (!f.ativo && noRep) {
          await this.eventoEmpregado("E", {
            id: f.id,
            cpf: String(ev!.cpf ?? cpf),
            nome: String(ev!.nome ?? nome),
            matricula: f.matricula
          });
        }
      }
    } catch (e) {
      this.logger.error(`Sincronização de empregados do REP falhou: ${(e as Error).message}`);
    }
  }

  /** Grava o tipo 2 quando os dados da instituição mudaram desde o último. */
  async sincronizarEmpresa(responsavelCpf?: string | null) {
    const c = await this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } });
    if (!c) return;
    const atual = {
      cnpj: (c.cnpj ?? "").replace(/\D/g, ""),
      cnoCaepf: (c.repCnoCaepf ?? "").replace(/\D/g, ""),
      razaoSocial: c.nome,
      localPrestacao:
        c.repLocalPrestacao ??
        [c.endereco, c.numero, c.bairro, c.cidade, c.uf].filter(Boolean).join(", ")
    };
    const ult = await this.prisma.eventoRep.findFirst({
      where: { tipo: 2 },
      orderBy: { nsr: "desc" }
    });
    const d = (ult?.dados ?? {}) as Record<string, unknown>;
    const mudou =
      !ult ||
      d.cnpj !== atual.cnpj ||
      d.cnoCaepf !== atual.cnoCaepf ||
      d.razaoSocial !== atual.razaoSocial ||
      d.localPrestacao !== atual.localPrestacao;
    if (mudou) await this.eventoEmpresa(responsavelCpf);
  }

  /* ─── Imutabilidade ─── */

  private async garantirImutabilidade() {
    await this.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION rep_somente_inclusao() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Livro do REP é somente inclusão (Portaria MTP 671/2021, art. 74, IV).';
      END; $$ LANGUAGE plpgsql;`);
    await this.prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION rep_somente_inclusao_truncate() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Livro do REP não pode ser esvaziado (Anexo IX, item 7).';
      END; $$ LANGUAGE plpgsql;`);
    for (const tabela of ["MarcacaoRep", "EventoRep"]) {
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_${tabela}_sem_truncate') THEN
            CREATE TRIGGER "trg_${tabela}_sem_truncate" BEFORE TRUNCATE ON "${tabela}"
              FOR EACH STATEMENT EXECUTE FUNCTION rep_somente_inclusao_truncate();
          END IF;
        END $$;`);
    }
    for (const tabela of ["MarcacaoRep", "EventoRep"]) {
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_${tabela}_imutavel') THEN
            CREATE TRIGGER "trg_${tabela}_imutavel" BEFORE UPDATE OR DELETE ON "${tabela}"
              FOR EACH ROW EXECUTE FUNCTION rep_somente_inclusao();
          END IF;
        END $$;`);
    }
  }

  /* ─── Instância (VM) ─── */

  private async registrarInstancia() {
    const det = await detectarInstancia();
    const agora = new Date();
    /* Último sinal de vida de qualquer instância, antes desta subida (base do evento 08). */
    const ultimoSinal =
      (await this.prisma.instanciaRep.findFirst({ orderBy: { ultimaVez: "desc" } }))?.ultimaVez ??
      null;
    const existente = await this.prisma.instanciaRep.findUnique({ where: { codigo: det.codigo } });
    /* Outra instância ativa com batimento recente → esta fica em espera (evita NSR duplicado). */
    const outraAtiva = await this.prisma.instanciaRep.findFirst({
      where: {
        codigo: { not: det.codigo },
        ativa: true,
        ultimaVez: { gte: new Date(agora.getTime() - 3 * 60_000) }
      }
    });
    if (outraAtiva) {
      this.bloqueio = `outra instância do REP está ativa (${outraAtiva.codigo}).`;
      this.logger.error(`Duas instâncias do REP detectadas: ${outraAtiva.codigo} e ${det.codigo}.`);
    } else {
      await this.prisma.instanciaRep.updateMany({
        where: { codigo: { not: det.codigo }, ativa: true },
        data: { ativa: false, encerradaEm: agora }
      });
    }
    const inst = existente
      ? await this.prisma.instanciaRep.update({
          where: { id: existente.id },
          data: { ultimaVez: agora, ativa: !outraAtiva, encerradaEm: null, hostname: det.hostname }
        })
      : await this.prisma.instanciaRep.create({
          data: {
            codigo: det.codigo,
            impressaoDigital: det.impressaoDigital,
            origem: det.origem as Prisma.InputJsonValue,
            hostname: det.hostname,
            ativa: !outraAtiva
          }
        });
    this.instancia = { ...det, id: inst.id };
    if (!existente) this.logger.warn(`Nova instância do REP registrada: ${det.codigo}`);
    /* REP-P: eventos sensíveis (AFD tipo 6) a cada início do serviço. */
    if (!outraAtiva) {
      await this.eventosDeDisponibilidade(ultimoSinal, agora, det.codigo);
    }
  }

  /** Identificador da inicialização do host (muda quando a VM/máquina reinicia). */
  private async bootId(): Promise<string | null> {
    try {
      const { readFile } = await import("fs/promises");
      return (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * AFD tipo 6 no REP-P: 08 (indisponibilidade, quando o serviço ficou parado), 02 (retorno de energia,
   * quando a máquina reiniciou) e 07 (disponibilidade), nesta ordem.
   */
  private async eventosDeDisponibilidade(ultimoSinal: Date | null, agora: Date, instancia: string) {
    const recentes = await this.prisma.eventoRep.findMany({
      where: { tipo: 6 },
      orderBy: { nsr: "desc" },
      take: 30
    });
    const ult07 = recentes.find((e) => (e.dados as Record<string, unknown>).evento === "07");
    const bootAnterior = ((ult07?.dados ?? {}) as Record<string, unknown>).bootId as
      | string
      | undefined;
    const boot = await this.bootId();
    if (ultimoSinal && agora.getTime() - ultimoSinal.getTime() > 3 * 60_000 && ult07) {
      await this.registrarEvento(6, {
        evento: "08",
        desde: ultimoSinal.toISOString(),
        motivo: "serviço indisponível até esta inicialização"
      });
    }
    if (boot && bootAnterior && boot !== bootAnterior) {
      await this.registrarEvento(6, { evento: "02", bootId: boot, motivo: "reinício da máquina" });
    }
    await this.registrarEvento(6, { evento: "07", instancia, bootId: boot });
  }

  /** Backup restaurado não pode "voltar" o NSR para baixo do que já foi entregue. */
  private async conferirNsrExportado() {
    const [contador, maior] = await Promise.all([
      this.prisma.contadorNsr.findUnique({ where: { id: "singleton" } }),
      this.prisma.extracaoArquivoFiscal.aggregate({ _max: { nsrMaximo: true } })
    ]);
    const exportado = maior._max.nsrMaximo ?? 0;
    if ((contador?.ultimo ?? 0) < exportado) {
      this.bloqueio = `o NSR atual (${contador?.ultimo}) é menor que o já exportado (${exportado}) — possível restauração de backup.`;
      this.logger.error(`Livro REP bloqueado: ${this.bloqueio}`);
    }
  }

  /** Batimento: mantém a instância viva e detecta ajuste do relógio (AFD tipo 4). */
  private async tique() {
    try {
      const agoraRel = Date.now();
      const agoraMono = process.hrtime.bigint();
      const decorridoMono = Number(agoraMono - this.ultimoTique.monotonico) / 1e6;
      const decorridoRel = agoraRel - this.ultimoTique.relogio;
      const salto = decorridoRel - decorridoMono;
      if (Math.abs(salto) > 60_000) {
        const antes = new Date(this.ultimoTique.relogio + decorridoMono);
        const cfg = await this.prisma.configuracaoSistema.findUnique({
          where: { id: "singleton" },
          select: { repResponsavelCpf: true }
        });
        await this.registrarEvento(4, {
          responsavelCpf: (cfg?.repResponsavelCpf ?? "").replace(/\D/g, ""),
          antes: antes.toISOString(),
          depois: new Date(agoraRel).toISOString(),
          saltoSegundos: Math.round(salto / 1000)
        });
        this.logger.warn(`Ajuste do relógio detectado (${Math.round(salto / 1000)} s): tipo 4.`);
      }
      this.ultimoTique = { relogio: agoraRel, monotonico: agoraMono };
      const hora = new Date().getUTCHours();
      if (hora === 7 && new Date().getUTCMinutes() < 1) {
        await this.sincronizarEmpresa();
        await this.sincronizarEmpregados();
        void this.verificarCadeia();
      }
      /* Relógio: confere com o NTP.br (Hora Legal Brasileira) a cada 5 minutos. */
      if (agoraRel - this.ultimaConferenciaNtp > 5 * 60_000) {
        this.ultimaConferenciaNtp = agoraRel;
        void this.repP.verificarNtp().catch(() => undefined);
      }
      if (this.instancia && !this.bloqueio) {
        await this.prisma.instanciaRep.update({
          where: { id: this.instancia.id },
          data: { ultimaVez: new Date() }
        });
      }
    } catch (e) {
      this.logger.warn(`Batimento do REP falhou: ${(e as Error).message}`);
    }
  }

  /* ─── Carga inicial (meses anteriores ao livro) ─── */

  /**
   * Reconstitui o livro a partir dos registros existentes: a batida original de cada correção
   * vem do "horário anterior" gravado nas observações; inclusões manuais e registros automáticos
   * (início de almoço na pausa) não são marcações e ficam de fora. Batidas apagadas por correção
   * não podem ser recuperadas. Tudo marcado como "reconstituída".
   */
  async cargaInicial() {
    /* Roda uma vez: depois que existe alguma marcação reconstituída, não repete. */
    if (await this.prisma.marcacaoRep.count({ where: { reconstituida: true } })) return;
    /* Só o que é anterior ao livro: registros gravados antes da 1ª marcação "nativa". */
    const primeiraNativa = await this.prisma.marcacaoRep.findFirst({
      where: { reconstituida: false },
      orderBy: { nsr: "asc" },
      select: { dataHoraGravacao: true }
    });
    const ate = primeiraNativa?.dataHoraGravacao ?? new Date();
    const filtro = { apenasInformativo: false, createdAt: { lt: ate } };
    const total = await this.prisma.registroPonto.count({ where: filtro });
    if (!total) return;
    this.logger.log(`Carga inicial do livro REP: ${total} registros…`);
    await this.eventoEmpresa();

    const funcs = await this.prisma.funcionario.findMany({
      select: { id: true, cpf: true, matricula: true, user: { select: { name: true } } }
    });
    const porId = new Map(funcs.map((f) => [f.id, f]));
    const incluidos = new Set<string>();
    const lote = 500;
    for (let pulo = 0; pulo < total; pulo += lote) {
      const regs = await this.prisma.registroPonto.findMany({
        where: filtro,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: pulo,
        take: lote
      });
      for (const r of regs) {
        const obs = parseObservacoes(r.observacoes);
        if (obs.some((o) => o.tipo === "INCLUSAO_PONTO")) continue;
        if (
          obs.some(
            (o) =>
              o.tipo === "AJUSTE_AUTOMATICO" &&
              /Almoço (iniciado na pausa|considerado em conjunto)/.test(o.texto ?? "")
          )
        )
          continue;
        /* Horário original = "horário anterior" da 1ª correção. */
        const ajuste = obs.find((o) => o.tipo === "AJUSTE_HORARIO" && o.horarioAnterior);
        let original = r.dataHora;
        if (ajuste?.horarioAnterior) {
          const [h, mi] = ajuste.horarioAnterior.split(":").map(Number);
          const dia = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
            r.dataHora
          );
          original = new Date(
            `${dia}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00-03:00`
          );
        }
        const f = porId.get(r.funcionarioId);
        await this.prisma.$transaction(async (tx) => {
          if (!incluidos.has(r.funcionarioId)) {
            incluidos.add(r.funcionarioId);
            const nsr = await this.reservarNsr(tx);
            await tx.eventoRep.create({
              data: {
                nsr,
                tipo: 5,
                dataHora: original,
                dados: {
                  operacao: "I",
                  funcionarioId: r.funcionarioId,
                  cpf: (f?.cpf ?? "").replace(/\D/g, ""),
                  nome: f?.user?.name ?? "",
                  demais: (f?.matricula ?? "").replace(/\D/g, "").slice(-4),
                  reconstituido: true
                },
                instanciaId: this.instancia?.id ?? null
              }
            });
          }
          await this.registrarMarcacao(tx, {
            registroPontoId: r.id,
            funcionarioId: r.funcionarioId,
            cpf: f?.cpf ?? null,
            tipoPonto: r.tipo,
            dataHoraMarcacao: original,
            dataHoraGravacao: r.createdAt,
            origem: r.origem,
            reconstituida: true
          });
        });
      }
    }
    this.logger.log("Carga inicial do livro REP concluída.");
    await this.sincronizarEmpregados();
  }
}

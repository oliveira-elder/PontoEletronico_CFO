import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { RepLivroService } from "../rep/rep-livro.service";
import { SeloIcpService } from "../selo-icp/selo-icp.service";
import { AssinaturaService } from "../assinatura/assinatura.service";
import { AcordosRepService } from "./acordos-rep.service";
import { arquivoTexto, dataD } from "../../utils/afd-campos";
import { parseObservacoes } from "../../utils/registro-observacoes";
import {
  montarAej,
  montarAfd,
  type AusenciaAej,
  type EmpresaRep,
  type HorarioAej,
  type MarcacaoAej,
  type TipoRep
} from "./arquivos-fiscais.builders";

export interface FiltroExtracao {
  inicio: string;
  fim: string;
  /** todos = AFD oficial do REP; demais = extrato (AFD) / AEJ dos vínculos escolhidos. */
  escopo: "todos" | "gerencia" | "funcionarios";
  gerenciaId?: string;
  funcionarioIds?: string[];
  assinar?: boolean;
}

const ENTRADAS = new Set(["ENTRADA", "FIM_INTERVALO", "REINICIAR_EXPEDIENTE"]);
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(d);
const minutoChave = (d: Date) => Math.floor(d.getTime() / 60_000);

/**
 * AFD (Arquivo Fonte de Dados) e AEJ (Arquivo Eletrônico de Jornada) — Portaria MTP 671/2021.
 * O AFD sai do livro imutável do REP (marcações originais + eventos, por NSR); o AEJ cruza o
 * livro com o ponto tratado (correções = marcações "D" desconsideradas e "I" incluídas, com motivo).
 */
@Injectable()
export class ArquivosFiscaisService {
  private readonly logger = new Logger(ArquivosFiscaisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repLivro: RepLivroService,
    private readonly selo: SeloIcpService,
    private readonly assinatura: AssinaturaService,
    private readonly acordos: AcordosRepService
  ) {}

  private validarPeriodo(f: FiltroExtracao) {
    const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
    if (!ok(f.inicio) || !ok(f.fim) || f.inicio > f.fim) {
      throw new BadRequestException("Informe o período (início e fim) no formato AAAA-MM-DD.");
    }
    const dias = (Date.parse(f.fim) - Date.parse(f.inicio)) / 86_400_000;
    if (dias > 366) throw new BadRequestException("O período máximo é de 1 ano.");
  }

  private intervalo(f: FiltroExtracao) {
    return {
      ini: new Date(`${f.inicio}T00:00:00-03:00`),
      fim: new Date(`${f.fim}T23:59:59.999-03:00`)
    };
  }

  private async empresa(dataRef?: string): Promise<{
    acordo: Awaited<ReturnType<AcordosRepService["vigentePara"]>>;
    tipoRep: TipoRep;
    empresa: EmpresaRep;
    ptrp: Parameters<typeof montarAej>[0]["ptrp"];
    cfg: Record<string, unknown>;
  }> {
    const c = await this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } });
    if (!c) throw new BadRequestException("Configuração da instituição não encontrada.");
    const tipoRep: TipoRep = c.repTipo === "REP_P" ? "REP_P" : "REP_A";
    const cnpj = (c.cnpj ?? "").replace(/\D/g, "");
    /* REP-A: nº do processo do ACT vigente na data final do período (art. 77 §2º, sem ultratividade);
       reserva: campo antigo; por fim 9×17 (leiaute). */
    const acordo =
      tipoRep === "REP_A"
        ? await this.acordos.vigentePara(
            dataRef ??
              new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date())
          )
        : null;
    const nrRep =
      tipoRep === "REP_P"
        ? (c.repInpiRegistro ?? "").replace(/\D/g, "")
        : (acordo?.numeroProcesso ?? "") ||
          (c.repActProcesso ?? "").replace(/\D/g, "") ||
          "99999999999999999";
    return {
      acordo,
      tipoRep,
      cfg: c as unknown as Record<string, unknown>,
      empresa: {
        cnpj,
        cnoCaepf: (c.repCnoCaepf ?? "").replace(/\D/g, ""),
        razaoSocial: c.nome,
        nrRep,
        cnpjDesenvolvedor: (c.ptrpDesenvolvedorCnpj ?? "").replace(/\D/g, "") || cnpj
      },
      ptrp: {
        nome: c.ptrpNome,
        versao: c.ptrpVersao,
        cnpj: (c.ptrpDesenvolvedorCnpj ?? "").replace(/\D/g, "") || cnpj,
        razao: c.ptrpDesenvolvedorRazao ?? c.nome,
        email: c.ptrpDesenvolvedorEmail ?? c.emailInstitucional ?? ""
      }
    };
  }

  private async funcionariosDoEscopo(f: FiltroExtracao) {
    const where =
      f.escopo === "funcionarios"
        ? { id: { in: f.funcionarioIds ?? [] } }
        : f.escopo === "gerencia"
          ? { gerenciaId: f.gerenciaId }
          : {};
    return this.prisma.funcionario.findMany({
      where,
      select: {
        id: true,
        cpf: true,
        matricula: true,
        ativo: true,
        categoria: true,
        user: { select: { name: true } }
      },
      orderBy: { user: { name: "asc" } }
    });
  }

  /** Pendências antes de gerar: bloqueios e avisos. */
  async preValidacao(f: FiltroExtracao) {
    this.validarPeriodo(f);
    const { tipoRep, empresa, cfg, acordo } = await this.empresa(f.fim);
    const funcs = await this.funcionariosDoEscopo(f);
    const { ini, fim } = this.intervalo(f);
    const situacao = await this.repLivro.situacao();
    const reconstituidas = await this.prisma.marcacaoRep.count({
      where: {
        reconstituida: true,
        dataHoraMarcacao: { gte: ini, lte: fim },
        ...(f.escopo === "todos" ? {} : { funcionarioId: { in: funcs.map((x) => x.id) } })
      }
    });
    const bloqueios: string[] = [];
    const avisos: string[] = [];
    /* Sem CPF: bloqueia só quem tem marcação no período (o CPF identifica a marcação no AFD). */
    const comMarcacao = new Set(
      (
        await this.prisma.marcacaoRep.findMany({
          where: { dataHoraMarcacao: { gte: ini, lte: fim } },
          select: { funcionarioId: true },
          distinct: ["funcionarioId"]
        })
      ).map((m) => m.funcionarioId)
    );
    const semCpf = funcs.filter((x) => !(x.cpf ?? "").replace(/\D/g, ""));
    const semCpfComMarcacao = semCpf.filter((x) => comMarcacao.has(x.id));
    if (semCpfComMarcacao.length) {
      bloqueios.push(
        `Funcionário(s) com marcação no período e sem CPF (cadastre o CPF): ${semCpfComMarcacao
          .slice(0, 8)
          .map((x) => x.user?.name)
          .join(", ")}${semCpfComMarcacao.length > 8 ? "…" : ""}`
      );
    }
    const semCpfAtivos = semCpf.filter((x) => x.ativo && !comMarcacao.has(x.id)).length;
    if (semCpfAtivos) {
      avisos.push(
        `${semCpfAtivos} funcionário(s) ativo(s) sem CPF e sem marcação no período ficam fora dos arquivos.`
      );
    }
    if (situacao.bloqueio) bloqueios.push(`Livro do REP: ${situacao.bloqueio}`);
    if (tipoRep === "REP_P" && !empresa.nrRep) {
      bloqueios.push("REP-P sem o número de registro no INPI (Configurações → Sistema).");
    }
    if (tipoRep === "REP_A") {
      const cob = await this.acordos.cobertura(f.inicio, f.fim);
      const legado = String(cfg.repActProcesso ?? "").replace(/\D/g, "");
      if (!cob.acordos.length && !legado) {
        avisos.push(
          "Nenhum ACT/CCT vigente cadastrado para o período (Configurações → Institucional): o cabeçalho usa 99999999999999999 e o REP-A fica sem autorização documentada (art. 77)."
        );
      } else if (cob.acordos.length) {
        if (cob.diasSemAcordo > 0) {
          avisos.push(
            `${cob.diasSemAcordo} dia(s) do período estão fora da vigência de qualquer ACT/CCT cadastrado (a partir de ${(cob.primeiroDiaSemAcordo ?? "").split("-").reverse().join("/")}): sem ultratividade, o REP-A não tem autorização nesses dias (art. 77 §2º).`
          );
        }
        if (cob.acordos.length > 1) {
          avisos.push(
            `O período cruza ${cob.acordos.length} acordos; o cabeçalho usa o vigente em ${f.fim.split("-").reverse().join("/")} (${acordo?.numeroProcesso ?? "—"}). Gere um arquivo por acordo se o fiscal exigir.`
          );
        }
        if (acordo) {
          const faltam = Math.round((Date.parse(acordo.vigenciaFim) - Date.now()) / 86_400_000);
          if (faltam >= 0 && faltam <= 60) {
            avisos.push(
              `O ACT vigente vence em ${faltam} dia(s) (${acordo.vigenciaFim.split("-").reverse().join("/")}): registre a renovação.`
            );
          }
        }
      }
    }
    const st = this.selo.status();
    if (!st.caminhoCertificado) {
      avisos.push(
        "Certificado ICP-Brasil não instalado: os arquivos saem SEM o .p7s — não aptos à fiscalização (art. 88)."
      );
    } else if (st.validadeAte && new Date(st.validadeAte) < new Date()) {
      bloqueios.push("Certificado ICP-Brasil vencido.");
    }
    if (reconstituidas) {
      avisos.push(
        `${reconstituidas} marcação(ões) do período foram RECONSTITUÍDAS a partir do histórico anterior ao livro do REP.`
      );
    }
    if (f.escopo !== "todos") {
      avisos.push(
        "AFD de parte dos funcionários é EXTRATO (não substitui o AFD do REP); o oficial é o de todos os funcionários."
      );
    }
    return {
      tipoRep,
      bloqueios,
      avisos,
      funcionarios: funcs.length,
      certificado: !!st.caminhoCertificado,
      nsrAtual: situacao.nsrAtual,
      acordo: acordo
        ? {
            numeroProcesso: acordo.numeroProcesso,
            tipo: acordo.tipo,
            ano: acordo.ano,
            vigenciaInicio: acordo.vigenciaInicio,
            vigenciaFim: acordo.vigenciaFim
          }
        : null
    };
  }

  /* ─── AFD ─── */

  async gerarAfd(f: FiltroExtracao, autor: { id?: string | null; nome?: string | null }) {
    this.validarPeriodo(f);
    await this.repLivro.sincronizarEmpresa();
    await this.repLivro.sincronizarEmpregados();
    const pre = await this.preValidacao(f);
    if (pre.bloqueios.length) throw new BadRequestException(pre.bloqueios.join(" "));
    const { tipoRep, empresa, acordo } = await this.empresa(f.fim);
    const { ini, fim } = this.intervalo(f);
    const oficial = f.escopo === "todos";
    const funcs = oficial ? [] : await this.funcionariosDoEscopo(f);
    const ids = new Set(funcs.map((x) => x.id));

    const [eventos, marcacoes] = await Promise.all([
      this.prisma.eventoRep.findMany({
        where: { dataHora: { gte: ini, lte: fim } },
        orderBy: { nsr: "asc" }
      }),
      this.prisma.marcacaoRep.findMany({
        where: {
          dataHoraMarcacao: { gte: ini, lte: fim },
          ...(oficial ? {} : { funcionarioId: { in: [...ids] } })
        },
        orderBy: { nsr: "asc" }
      })
    ]);
    const eventosFiltrados = eventos.filter((e) => {
      if (oficial || e.tipo !== 5) return true;
      return ids.has(String((e.dados as Record<string, unknown>).funcionarioId ?? ""));
    });
    const geradoEm = new Date();
    const afd = montarAfd({
      tipoRep,
      empresa,
      inicio: f.inicio,
      fim: f.fim,
      geradoEm,
      eventos: eventosFiltrados.map((e) => ({
        nsr: e.nsr,
        tipo: e.tipo,
        dataHora: e.dataHora,
        dados: e.dados as Record<string, unknown>
      })),
      marcacoes
    });
    const base =
      tipoRep === "REP_P" ? `AFD${empresa.nrRep}${empresa.cnpj}REP_P` : `AFD${empresa.cnpj}REP_A`;
    const nome = `${oficial ? "" : "EXTRATO_"}${base}`;
    return this.empacotar({
      tipo: "AFD",
      oficial,
      f,
      nome,
      conteudo: arquivoTexto(afd.linhas),
      registros: afd.linhas.length,
      nsrMaximo: oficial ? afd.nsrMaximo : null,
      resumo: [
        `Tipo de REP: ${tipoRep === "REP_A" ? "REP-A (autorizado por acordo coletivo)" : "REP-P"}`,
        `Registros: tipo 2 = ${afd.contagem[2]}, tipo 3 = ${afd.contagem[3]}, tipo 4 = ${afd.contagem[4]}, tipo 5 = ${afd.contagem[5]}, tipo 6 = ${afd.contagem[6]}, tipo 7 = ${afd.contagem[7]}`,
        oficial
          ? "AFD OFICIAL do REP (todos os funcionários)."
          : "EXTRATO do AFD (parte dos funcionários) — NÃO SUBSTITUI o AFD do REP.",
        ...this.linhaAcordo(tipoRep, acordo)
      ],
      acordoId: acordo?.id ?? null,
      autor
    });
  }

  /* ─── AEJ ─── */

  async gerarAej(f: FiltroExtracao, autor: { id?: string | null; nome?: string | null }) {
    this.validarPeriodo(f);
    const pre = await this.preValidacao(f);
    if (pre.bloqueios.length) throw new BadRequestException(pre.bloqueios.join(" "));
    const { tipoRep, empresa, ptrp, acordo } = await this.empresa(f.fim);
    const { ini, fim } = this.intervalo(f);
    const funcs = (await this.funcionariosDoEscopo(f)).filter(
      (x) => (x.cpf ?? "").replace(/\D/g, "") && (x.ativo || f.escopo !== "todos")
    );

    const vinculos = funcs.map((x, i) => ({
      id: i + 1,
      cpf: (x.cpf ?? "").replace(/\D/g, ""),
      nome: x.user?.name ?? ""
    }));
    const horarios = new Map<string, HorarioAej>();
    const marcacoes: MarcacaoAej[] = [];
    const ausencias: AusenciaAej[] = [];

    /* Meses do período (a apuração mensal é a mesma da folha). */
    const meses: Array<{ mes: number; ano: number }> = [];
    for (
      let d = new Date(`${f.inicio.slice(0, 7)}-01T12:00:00Z`);
      dataD(d) <= f.fim;
      d.setUTCMonth(d.getUTCMonth() + 1)
    ) {
      meses.push({ mes: d.getUTCMonth() + 1, ano: d.getUTCFullYear() });
    }

    for (const [i, func] of funcs.entries()) {
      const vinculo = i + 1;
      let codHor = "";
      const diasRelatorio: Array<{ iso: string; statusInterno: string; saldoMin: number | null }> =
        [];
      for (const m of meses) {
        const { relatorio, jornada } = await this.assinatura.relatorioMensal(func.id, m.mes, m.ano);
        if (!codHor) {
          const j = jornada as unknown as {
            atualMin: number;
            horaEntrada?: string;
            horaSaida?: string;
            almocoMinMin?: number;
            almocoPodeIniciarA?: string;
          };
          const ent = (j.horaEntrada ?? "08:00").replace(":", "");
          const sai = (j.horaSaida ?? "17:00").replace(":", "");
          const semAlmoco = ["ESTAGIARIO", "MENOR_APRENDIZ"].includes(func.categoria ?? "");
          const pares: Array<[string, string]> =
            semAlmoco || !j.almocoMinMin
              ? [[ent, sai]]
              : (() => {
                  const [h, mi] = (j.almocoPodeIniciarA ?? "11:30").split(":").map(Number);
                  const volta = h * 60 + mi + (j.almocoMinMin ?? 60);
                  const f2 = (n: number) =>
                    `${String(Math.floor(n / 60)).padStart(2, "0")}${String(n % 60).padStart(2, "0")}`;
                  return [
                    [ent, f2(h * 60 + mi)],
                    [f2(volta), sai]
                  ] as Array<[string, string]>;
                })();
          codHor = `J${j.atualMin}_${ent}`;
          if (!horarios.has(codHor)) {
            horarios.set(codHor, { codigo: codHor, durJornadaMin: j.atualMin, pares });
          }
        }
        for (const d of relatorio.dias) {
          if (d.iso >= f.inicio && d.iso <= f.fim) {
            diasRelatorio.push({
              iso: d.iso,
              statusInterno: d.statusInterno,
              saldoMin: d.saldoMin
            });
          }
        }
      }

      /* 07 — ausências e banco (mesma conta da folha). */
      for (const d of diasRelatorio) {
        const dow = new Date(`${d.iso}T12:00:00Z`).getUTCDay();
        if (d.statusInterno === "FALTA") ausencias.push({ vinculo, tipo: 2, data: d.iso });
        if (d.statusInterno === "FOLGA" && dow === 0)
          ausencias.push({ vinculo, tipo: 1, data: d.iso });
        if (d.saldoMin && d.saldoMin !== 0) {
          ausencias.push({
            vinculo,
            tipo: 3,
            data: d.iso,
            qtMinutos: Math.abs(d.saldoMin),
            tipoMovBH: d.saldoMin > 0 ? 1 : 2
          });
        }
      }

      /* 05 — marcações: original (O), desconsiderada (D) e incluída (I) com motivo. */
      const [regs, livro] = await Promise.all([
        this.prisma.registroPonto.findMany({
          where: {
            funcionarioId: func.id,
            apenasInformativo: false,
            dataHora: { gte: ini, lte: fim }
          },
          orderBy: { dataHora: "asc" }
        }),
        this.prisma.marcacaoRep.findMany({
          where: { funcionarioId: func.id, dataHoraMarcacao: { gte: ini, lte: fim } },
          orderBy: { dataHoraMarcacao: "asc" }
        })
      ]);
      const livroPorReg = new Map(
        livro.filter((l) => l.registroPontoId).map((l) => [l.registroPontoId!, l])
      );
      const usados = new Set<string>();
      type Linha = Omit<MarcacaoAej, "seq" | "vinculo"> & { tipoPonto?: string; dia: string };
      const linhas: Linha[] = [];
      const diaDe = (d: Date) => dataD(d);
      for (const r of regs) {
        const l = livroPorReg.get(r.id);
        const tp: "E" | "S" = ENTRADAS.has(r.tipo) ? "E" : "S";
        if (l) {
          usados.add(l.id);
          if (minutoChave(l.dataHoraMarcacao) === minutoChave(r.dataHora)) {
            linhas.push({
              dataHora: l.dataHoraMarcacao,
              tpMarc: tp,
              fonte: "O",
              dia: diaDe(r.dataHora)
            });
          } else {
            linhas.push({
              dataHora: l.dataHoraMarcacao,
              tpMarc: "D",
              fonte: "O",
              dia: diaDe(l.dataHoraMarcacao),
              motivo: `Desconsiderada: corrigida para ${hhmm(r.dataHora)} por solicitação aprovada`
            });
            linhas.push({
              dataHora: r.dataHora,
              tpMarc: tp,
              fonte: "I",
              dia: diaDe(r.dataHora),
              motivo: `Incluída por correção aprovada (marcação original ${hhmm(l.dataHoraMarcacao)})`
            });
          }
        } else {
          const obs = parseObservacoes(r.observacoes);
          const nota =
            obs.find((o) => o.tipo === "INCLUSAO_PONTO")?.texto ??
            obs.find((o) => o.tipo === "AJUSTE_AUTOMATICO")?.texto ??
            "Incluída no tratamento do ponto";
          linhas.push({
            dataHora: r.dataHora,
            tpMarc: tp,
            fonte: "I",
            dia: diaDe(r.dataHora),
            motivo: nota
          });
        }
      }
      for (const l of livro) {
        if (usados.has(l.id)) continue;
        linhas.push({
          dataHora: l.dataHoraMarcacao,
          tpMarc: "D",
          fonte: "O",
          dia: diaDe(l.dataHoraMarcacao),
          motivo: "Desconsiderada: excluída por correção aprovada"
        });
      }
      /* Sequência dos pares entrada/saída por dia; horário contratual na 1ª entrada. */
      linhas.sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime());
      let diaAtual = "";
      let seq = 0;
      let primeiraEntrada = true;
      for (const l of linhas) {
        if (l.dia !== diaAtual) {
          diaAtual = l.dia;
          seq = 0;
          primeiraEntrada = true;
        }
        if (l.tpMarc === "E") seq += 1;
        const marca: MarcacaoAej = {
          vinculo,
          dataHora: l.dataHora,
          tpMarc: l.tpMarc,
          seq: Math.max(1, seq),
          fonte: l.fonte,
          motivo: l.fonte === "I" || l.tpMarc === "D" ? l.motivo : undefined
        };
        if (l.tpMarc === "E" && seq === 1 && primeiraEntrada) {
          marca.codHorContratual = codHor;
          primeiraEntrada = false;
        }
        marcacoes.push(marca);
      }
    }

    const geradoEm = new Date();
    const aej = montarAej({
      tipoRep,
      empresa,
      inicio: f.inicio,
      fim: f.fim,
      geradoEm,
      vinculos,
      horarios: [...horarios.values()],
      marcacoes,
      ausencias,
      ptrp
    });
    const nome = `AEJ_${empresa.cnpj}_${f.inicio.replace(/-/g, "")}_${f.fim.replace(/-/g, "")}`;
    return this.empacotar({
      tipo: "AEJ",
      oficial: true,
      f,
      nome,
      conteudo: arquivoTexto(aej.linhas),
      registros: aej.linhas.length,
      nsrMaximo: null,
      resumo: [
        `Vínculos: ${vinculos.length}; marcações (05): ${aej.contagem["05"] ?? 0}; ausências/banco (07): ${aej.contagem["07"] ?? 0}`,
        ...this.linhaAcordo(tipoRep, acordo)
      ],
      acordoId: acordo?.id ?? null,
      autor
    });
  }

  /* ─── Atestado Técnico e Termo de Responsabilidade (art. 89) — modelo para assinatura ─── */

  async atestadoTecnico(): Promise<Buffer> {
    const { tipoRep, empresa, ptrp, acordo } = await this.empresa();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PdfPrinter = require("pdfmake/src/printer");
    const printer = new PdfPrinter({
      Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique"
      }
    });
    const cnpjFmt = (c: string) =>
      c.length === 14 ? c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : c;
    const tipoTxt =
      tipoRep === "REP_A"
        ? "Registrador Eletrônico de Ponto Alternativo (REP-A), autorizado por acordo coletivo de trabalho"
        : "Registrador Eletrônico de Ponto via Programa (REP-P)";
    const p = (t: string) => ({ text: t, margin: [0, 0, 0, 8], alignment: "justify" });
    const doc = {
      pageSize: "A4",
      pageMargins: [60, 60, 60, 60],
      defaultStyle: { font: "Helvetica", fontSize: 11, lineHeight: 1.3 },
      content: [
        {
          text: "ATESTADO TÉCNICO E TERMO DE RESPONSABILIDADE",
          bold: true,
          fontSize: 14,
          alignment: "center"
        },
        {
          text: "Portaria MTP nº 671/2021, art. 89",
          alignment: "center",
          margin: [0, 2, 0, 18],
          color: "#555"
        },
        p(
          `${ptrp.razao}, inscrito(a) no CNPJ ${cnpjFmt(ptrp.cnpj)}, na qualidade de desenvolvedor(a) do ` +
            `programa "${ptrp.nome}", versão ${ptrp.versao}, utilizado como ${tipoTxt} e como Programa de ` +
            `Tratamento de Registro de Ponto (PTRP), ATESTA que o referido sistema atende às ` +
            `determinações da Seção do controle de jornada da Portaria MTP nº 671/2021 (arts. 72 a 96), em especial:`
        ),
        {
          ul: [
            "registra fielmente as marcações efetuadas, sem restrição de horário, sem marcação automática, sem exigência de autorização prévia para sobrejornada e sem dispositivo que permita alterar os dados registrados (art. 74);",
            "mantém as marcações originais em livro somente-inclusão, identificadas pelo Número Sequencial de Registro (NSR);",
            "gera o Arquivo Fonte de Dados (AFD) e o Arquivo Eletrônico de Jornada (AEJ) nos leiautes publicados no portal gov.br, assinados em CAdES (.p7s destacado) com certificado ICP-Brasil (arts. 81, 83, 86 e 88);",
            "gera o relatório Espelho de Ponto Eletrônico com as informações do art. 84;",
            "permite a identificação do empregador e do empregado e a extração eletrônica, no local ou remota, do registro fiel das marcações (art. 77, §1º)."
          ],
          margin: [12, 0, 0, 12]
        },
        p(
          `Empregador usuário: ${empresa.razaoSocial}, CNPJ ${cnpjFmt(empresa.cnpj)}.` +
            (tipoRep === "REP_A"
              ? ` Acordo coletivo autorizador: processo nº ${empresa.nrRep}${acordo ? ` (${acordo.tipo} ${acordo.ano}, vigência ${acordo.vigenciaInicio.split("-").reverse().join("/")} a ${acordo.vigenciaFim.split("-").reverse().join("/")})` : ""}.`
              : ` Registro do programa no INPI: nº ${empresa.nrRep}.`)
        ),
        p(
          "Os signatários declaram, sob as penas da lei, a veracidade das informações acima e assumem a responsabilidade técnica e legal pelo atendimento às normas citadas."
        ),
        {
          text: `Brasília/DF, ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
          margin: [0, 10, 0, 50]
        },
        {
          columns: [
            {
              stack: [
                "_______________________________",
                { text: "Responsável técnico", bold: true },
                "Nome / CPF"
              ],
              alignment: "center"
            },
            {
              stack: [
                "_______________________________",
                { text: "Responsável legal", bold: true },
                "Nome / CPF"
              ],
              alignment: "center"
            }
          ]
        },
        {
          text: "Este documento deve ser assinado eletronicamente com assinatura qualificada (certificado ICP-Brasil de pessoa física — e-CPF), em PAdES (art. 89, §§ 2º e 3º), e mantido para apresentação à Inspeção do Trabalho.",
          fontSize: 9,
          color: "#555",
          margin: [0, 40, 0, 0]
        }
      ]
    };
    const pdf = printer.createPdfKitDocument(doc);
    return new Promise<Buffer>((resolve, reject) => {
      const partes: Buffer[] = [];
      pdf.on("data", (c: Buffer) => partes.push(c));
      pdf.on("end", () => resolve(Buffer.concat(partes)));
      pdf.on("error", reject);
      pdf.end();
    });
  }

  private linhaAcordo(
    tipoRep: TipoRep,
    a: Awaited<ReturnType<AcordosRepService["vigentePara"]>>
  ): string[] {
    if (tipoRep !== "REP_A") return [];
    if (!a)
      return ["ACT/CCT: nenhum acordo vigente cadastrado (nº do processo 99999999999999999)."];
    const br = (d: string) => d.split("-").reverse().join("/");
    return [
      `${a.tipo} autorizador do REP-A: processo nº ${a.numeroProcesso} (${a.ano}), vigência ${br(a.vigenciaInicio)} a ${br(a.vigenciaFim)}.`
    ];
  }

  /* ─── ZIP: .txt + .p7s (CAdES destacado) + LEIA-ME ─── */

  private async empacotar(o: {
    tipo: "AFD" | "AEJ";
    oficial: boolean;
    f: FiltroExtracao;
    nome: string;
    conteudo: Buffer;
    registros: number;
    nsrMaximo: number | null;
    resumo: string[];
    acordoId?: string | null;
    autor: { id?: string | null; nome?: string | null };
  }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require("jszip") as typeof import("jszip");
    const zip = new JSZip();
    zip.file(`${o.nome}.txt`, o.conteudo);
    let assinado = false;
    let titular: string | null = null;
    if (o.f.assinar !== false) {
      try {
        const r = this.selo.assinarCades(o.conteudo);
        if (r) {
          zip.file(`${o.nome}.p7s`, r.p7s);
          assinado = true;
          titular = r.titular;
        }
      } catch (e) {
        this.logger.error(`Assinatura CAdES falhou: ${(e as Error).message}`);
      }
    }
    const sha = createHash("sha256").update(o.conteudo).digest("hex");
    zip.file(
      "LEIA-ME.txt",
      [
        `${o.tipo === "AFD" ? "Arquivo Fonte de Dados (AFD)" : "Arquivo Eletrônico de Jornada (AEJ)"} — Portaria MTP nº 671/2021`,
        `Período: ${o.f.inicio.split("-").reverse().join("/")} a ${o.f.fim.split("-").reverse().join("/")}`,
        `Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por ${o.autor.nome ?? "—"}`,
        ...o.resumo,
        `Linhas: ${o.registros} · Codificação ISO-8859-1 · fim de linha CR+LF`,
        `SHA-256 do ${o.nome}.txt: ${sha}`,
        assinado
          ? `Assinatura: ${o.nome}.p7s (CAdES destacado, política AD-RB v2.3 da ICP-Brasil${titular ? ` — ${titular}` : ""}).`
          : "Assinatura: NÃO ASSINADO — certificado ICP-Brasil não instalado (arquivo não apto à fiscalização).",
        o.nsrMaximo ? `Maior NSR do arquivo: ${o.nsrMaximo}` : ""
      ]
        .filter(Boolean)
        .join("\r\n")
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await this.prisma.extracaoArquivoFiscal.create({
      data: {
        tipo: o.tipo,
        oficial: o.oficial,
        escopo: o.f.escopo,
        funcionarioIds: (o.f.funcionarioIds ?? []) as unknown as object,
        periodoInicio: o.f.inicio,
        periodoFim: o.f.fim,
        nomeArquivo: `${o.nome}.txt`,
        sha256: sha,
        assinado,
        nsrMaximo: o.nsrMaximo,
        registros: o.registros,
        acordoId: o.acordoId ?? null,
        geradoPorId: o.autor.id ?? null,
        geradoPorNome: o.autor.nome ?? null
      }
    });
    return { buffer, nomeZip: `${o.nome}.zip`, assinado };
  }
}

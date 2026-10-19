import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { RepLivroService } from "../rep/rep-livro.service";
import { SeloIcpService } from "../selo-icp/selo-icp.service";
import { AssinaturaService } from "../assinatura/assinatura.service";
import { RepPService, versaoDoSistema } from "../rep/rep-p.service";
import { arquivoTexto, dataD } from "../../utils/afd-campos";
import { parseObservacoes } from "../../utils/registro-observacoes";
import {
  montarAej,
  montarAfd,
  type AusenciaAej,
  type EmpresaRep,
  type HorarioAej,
  type MarcacaoAej
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

interface ArquivoGerado {
  nome: string;
  conteudo: Buffer;
  registros: number;
  nsrMaximo: number | null;
  periodo: { inicio: string; fim: string };
  resumo: string[];
}

interface RepAej {
  id: number;
  nrRep: string;
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
    private readonly repP: RepPService
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

  private async empresa(): Promise<{
    empresa: EmpresaRep;
    ptrp: Parameters<typeof montarAej>[0]["ptrp"];
    inpiInformado: boolean;
  }> {
    const c = await this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } });
    if (!c) throw new BadRequestException("Configuração da instituição não encontrada.");
    const cnpj = (c.cnpj ?? "").replace(/\D/g, "");
    /* REP-P: nº de registro do programa no INPI (sem ele, o leiaute leva zeros e o arquivo não é apto). */
    const inpi = (c.repInpiRegistro ?? "").replace(/\D/g, "");
    return {
      inpiInformado: !!inpi,
      empresa: {
        cnpj,
        cnoCaepf: (c.repCnoCaepf ?? "").replace(/\D/g, ""),
        razaoSocial: c.nome,
        nrRep: inpi.padStart(17, "0"),
        cnpjDesenvolvedor: (c.ptrpDesenvolvedorCnpj ?? "").replace(/\D/g, "") || cnpj
      },
      ptrp: {
        nome: c.ptrpNome,
        versao: versaoDoSistema(),
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
    const { inpiInformado } = await this.empresa();
    const estado = await this.repP.estado();
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
    if (!inpiInformado) {
      avisos.push(
        "Nº de registro do programa no INPI não informado (Configurações → Institucional → REP-P): o cabeçalho do AFD e o registro 02 do AEJ saem com zeros, sem validade para a fiscalização."
      );
    }
    if (estado.situacao === "HOMOLOGACAO" || estado.situacao === "PRONTO") {
      avisos.push(
        "O REP-P ainda não iniciou a operação (homologação): os arquivos servem para teste e conferência, não para a fiscalização."
      );
    }
    const st = this.selo.status();
    if (!st.caminhoCertificado || !st.validadeAte) {
      avisos.push(
        st.caminhoCertificado
          ? "Certificado ICP-Brasil não encontrado ou ilegível (confira o arquivo e a senha em deploy/icp): os arquivos saem SEM o .p7s — não aptos à fiscalização (art. 88)."
          : "Certificado ICP-Brasil não instalado: os arquivos saem SEM o .p7s — não aptos à fiscalização (art. 88)."
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
      tipoRep: "REP_P" as const,
      bloqueios,
      avisos,
      funcionarios: funcs.length,
      certificado: !!st.caminhoCertificado && !!st.validadeAte,
      nsrAtual: situacao.nsrAtual,
      emOperacao: estado.situacao === "OPERACAO"
    };
  }

  /* ─── AFD ─── */

  async gerarAfd(f: FiltroExtracao, autor: { id?: string | null; nome?: string | null }) {
    this.validarPeriodo(f);
    await this.repLivro.sincronizarEmpresa();
    await this.repLivro.sincronizarEmpregados();
    const pre = await this.preValidacao(f);
    if (pre.bloqueios.length) throw new BadRequestException(pre.bloqueios.join(" "));
    const oficial = f.escopo === "todos";
    const funcs = oficial ? [] : await this.funcionariosDoEscopo(f);
    const ids = new Set(funcs.map((x) => x.id));
    const { empresa } = await this.empresa();
    const { ini, fim } = this.intervalo(f);
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
    const afd = montarAfd({
      empresa,
      inicio: f.inicio,
      fim: f.fim,
      geradoEm: new Date(),
      eventos: eventosFiltrados.map((e) => ({
        nsr: e.nsr,
        tipo: e.tipo,
        dataHora: e.dataHora,
        dados: e.dados as Record<string, unknown>
      })),
      marcacoes
    });
    /* Nome oficial do REP-P: "AFD" + nº do INPI (17 dígitos) + CNPJ + "REP_P". */
    const nrInpi = empresa.nrRep.padStart(17, "0");
    return this.empacotar({
      tipo: "AFD",
      oficial,
      f,
      arquivos: [
        {
          nome: `${oficial ? "" : "EXTRATO_"}AFD${nrInpi}${empresa.cnpj}REP_P`,
          conteudo: arquivoTexto(afd.linhas),
          registros: afd.linhas.length,
          nsrMaximo: oficial ? afd.nsrMaximo : null,
          periodo: { inicio: f.inicio, fim: f.fim },
          resumo: [
            "REP-P (programa registrado no INPI)",
            `Registros: tipo 2 = ${afd.contagem[2]}, tipo 4 = ${afd.contagem[4]}, tipo 5 = ${afd.contagem[5]}, tipo 6 = ${afd.contagem[6]}, tipo 7 = ${afd.contagem[7]}`,
            oficial
              ? "AFD OFICIAL do REP (todos os funcionários)."
              : "EXTRATO do AFD (parte dos funcionários) — NÃO SUBSTITUI o AFD do REP.",
            `Nº de registro no INPI: ${nrInpi}.`,
            "Hash dos registros tipo 7: SHA-256 de NSR, tipo, data/hora da marcação, CPF, data/hora da gravação, coletor, on/off-line (campos como gravados no arquivo) e o hash do tipo 7 anterior."
          ]
        }
      ],
      nomeZip: `${oficial ? "" : "EXTRATO_"}AFD${nrInpi}${empresa.cnpj}REP_P`,
      autor
    });
  }

  /* ─── AEJ ─── */

  async gerarAej(f: FiltroExtracao, autor: { id?: string | null; nome?: string | null }) {
    this.validarPeriodo(f);
    const pre = await this.preValidacao(f);
    if (pre.bloqueios.length) throw new BadRequestException(pre.bloqueios.join(" "));
    const { empresa, ptrp } = await this.empresa();
    const reps: RepAej[] = [{ id: 1, nrRep: empresa.nrRep }];
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
          /* Marcação incluída manualmente não tem REP associado (idRepAej vazio). */
          idRep: l.fonte === "I" ? undefined : reps[0].id,
          motivo: l.fonte === "I" || l.tpMarc === "D" ? l.motivo : undefined
        };
        if (l.tpMarc === "E" && seq === 1 && primeiraEntrada) {
          marca.codHorContratual = codHor;
          primeiraEntrada = false;
        }
        marcacoes.push(marca);
      }
    }

    const aej = montarAej({
      reps,
      empresa,
      inicio: f.inicio,
      fim: f.fim,
      geradoEm: new Date(),
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
      arquivos: [
        {
          nome,
          conteudo: arquivoTexto(aej.linhas),
          registros: aej.linhas.length,
          nsrMaximo: null,
          periodo: { inicio: f.inicio, fim: f.fim },
          resumo: [
            `Vínculos: ${vinculos.length}; marcações (05): ${aej.contagem["05"] ?? 0}; ausências/banco (07): ${aej.contagem["07"] ?? 0}`,
            `REP-P: registro no INPI nº ${empresa.nrRep.padStart(17, "0")} (registro 02).`
          ]
        }
      ],
      nomeZip: nome,
      autor
    });
  }

  /* ─── ZIP: .txt + .p7s (CAdES destacado) + LEIA-ME ─── */

  private async empacotar(o: {
    tipo: "AFD" | "AEJ";
    oficial: boolean;
    f: FiltroExtracao;
    arquivos: ArquivoGerado[];
    nomeZip: string;
    autor: { id?: string | null; nome?: string | null };
  }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require("jszip") as typeof import("jszip");
    const zip = new JSZip();
    const leiame: string[] = [
      `${o.tipo === "AFD" ? "Arquivo Fonte de Dados (AFD)" : "Arquivo Eletrônico de Jornada (AEJ)"} — Portaria MTP nº 671/2021`,
      `Período: ${o.f.inicio.split("-").reverse().join("/")} a ${o.f.fim.split("-").reverse().join("/")}`,
      `Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por ${o.autor.nome ?? "—"}`
    ];
    let todosAssinados = true;
    const registrosExtracao: Array<{
      a: ArquivoGerado;
      sha: string;
      assinado: boolean;
    }> = [];
    for (const a of o.arquivos) {
      zip.file(`${a.nome}.txt`, a.conteudo);
      let assinado = false;
      let titular: string | null = null;
      if (o.f.assinar !== false) {
        try {
          const r = this.selo.assinarCades(a.conteudo);
          if (r) {
            zip.file(`${a.nome}.p7s`, r.p7s);
            assinado = true;
            titular = r.titular;
          }
        } catch (e) {
          this.logger.error(`Assinatura CAdES falhou: ${(e as Error).message}`);
        }
      }
      if (!assinado) todosAssinados = false;
      const sha = createHash("sha256").update(a.conteudo).digest("hex");
      registrosExtracao.push({ a, sha, assinado });
      leiame.push(
        "",
        `── ${a.nome}.txt ──`,
        ...(o.arquivos.length > 1
          ? [
              `Período do arquivo: ${a.periodo.inicio.split("-").reverse().join("/")} a ${a.periodo.fim.split("-").reverse().join("/")}`
            ]
          : []),
        ...a.resumo,
        `Linhas: ${a.registros} · Codificação ISO-8859-1 · fim de linha CR+LF`,
        `SHA-256 do ${a.nome}.txt: ${sha}`,
        assinado
          ? `Assinatura: ${a.nome}.p7s (CAdES destacado, política AD-RB v2.3 da ICP-Brasil${titular ? ` — ${titular}` : ""}).`
          : "Assinatura: NÃO ASSINADO — certificado ICP-Brasil não instalado (arquivo não apto à fiscalização).",
        a.nsrMaximo ? `Maior NSR do arquivo: ${a.nsrMaximo}` : ""
      );
    }
    zip.file(
      "LEIA-ME.txt",
      leiame.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\r\n")
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    for (const { a, sha, assinado } of registrosExtracao) {
      await this.prisma.extracaoArquivoFiscal.create({
        data: {
          tipo: o.tipo,
          oficial: o.oficial,
          escopo: o.f.escopo,
          funcionarioIds: (o.f.funcionarioIds ?? []) as unknown as object,
          periodoInicio: a.periodo.inicio,
          periodoFim: a.periodo.fim,
          nomeArquivo: `${a.nome}.txt`,
          sha256: sha,
          assinado,
          nsrMaximo: a.nsrMaximo,
          registros: a.registros,
          geradoPorId: o.autor.id ?? null,
          geradoPorNome: o.autor.nome ?? null
        }
      });
    }
    return { buffer, nomeZip: `${o.nomeZip}.zip`, assinado: todosAssinados };
  }
}

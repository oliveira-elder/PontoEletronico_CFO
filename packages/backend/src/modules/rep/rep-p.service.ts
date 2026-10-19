import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "crypto";
import { createSocket } from "dgram";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PrismaService } from "../../prisma/prisma.service";

export const ETAPAS_INPI = [
  { chave: "cadastro_einpi", rotulo: "Cadastro no e-INPI" },
  { chave: "gru_emitida", rotulo: "GRU do serviço 730 emitida" },
  { chave: "gru_paga", rotulo: "GRU paga (R$ 210,00, taxa única, sem anuidade)" },
  { chave: "hash_codigo", rotulo: "Hash do código-fonte gerado" },
  { chave: "declaracao_veracidade", rotulo: "Declaração de Veracidade assinada" },
  { chave: "peticionamento", rotulo: "Peticionamento no e-Software" },
  { chave: "protocolo", rotulo: "Protocolo do pedido" },
  { chave: "certificado", rotulo: "Certificado de registro recebido" }
] as const;

interface Autor {
  id: string | null;
  nome: string | null;
}

export interface EtapaInpi {
  feito?: boolean;
  data?: string;
  responsavel?: string;
  obs?: string;
}

export interface RegistroInpiDto {
  versao?: string;
  etapas?: Record<string, EtapaInpi>;
  hashCodigoFonte?: string | null;
  protocoloNumero?: string | null;
  certificadoNumero?: string | null;
  certificadoData?: string | null;
}

const CAMPOS_IDENT = [
  "repInpiRegistro",
  "repCnoCaepf",
  "repLocalPrestacao",
  "repResponsavelCpf",
  "ptrpNome",
  "ptrpVersao",
  "ptrpDesenvolvedorCnpj",
  "ptrpDesenvolvedorRazao",
  "ptrpDesenvolvedorEmail"
] as const;

const SOMENTE_DIGITOS: Record<string, number> = {
  repInpiRegistro: 17,
  repCnoCaepf: 14,
  repResponsavelCpf: 11,
  ptrpDesenvolvedorCnpj: 14
};

/** Versão publicada do sistema (package.json do backend), usada no AEJ, comprovante e Atestado. */
export function versaoDoSistema(): string {
  const cwd = process.cwd();
  for (const caminho of [
    join(cwd, "package.json"),
    join(cwd, "packages", "backend", "package.json")
  ]) {
    try {
      if (!existsSync(caminho)) continue;
      const pkg = JSON.parse(readFileSync(caminho, "utf8")) as { name?: string; version?: string };
      if (pkg.version) return pkg.version.slice(0, 8);
    } catch {
      /* tenta o próximo */
    }
  }
  return "1.0.0";
}

/** Soma de verificação de data NTP (segundos desde 1900 → ms Unix). */
const NTP_EPOCH = 2_208_988_800;

/**
 * REP-P (Portaria MTP 671/2021, arts. 78, 79 e 91): vigências do REP, registro do programa no INPI,
 * identificação do REP e monitor do relógio (NTP).
 */
@Injectable()
export class RepPService {
  private inicioRepPCache: Date | null = null;
  private ultimoNtp: { em: Date; desvioMs: number | null; servidor: string; erro?: string } | null =
    null;
  /** Medições seguidas acima do limite de 30 s (evita bloquear por uma leitura isolada). */
  private foraDoLimite = 0;

  constructor(private readonly prisma: PrismaService) {}

  /* ─── Vigências ─── */

  async inicioRepP(): Promise<Date | null> {
    if (this.inicioRepPCache) return this.inicioRepPCache; // a virada é irreversível
    const v = await this.prisma.vigenciaRep.findFirst({
      where: { tipo: "REP_P" },
      orderBy: { inicio: "asc" }
    });
    this.inicioRepPCache = v?.inicio ?? null;
    return this.inicioRepPCache;
  }

  /** Verdadeiro a partir do instante de início da operação (antes disso, homologação). */
  async emOperacaoEm(instante: Date): Promise<boolean> {
    const ini = await this.inicioRepP();
    return !!ini && instante.getTime() >= ini.getTime();
  }

  async vigencias() {
    return this.prisma.vigenciaRep.findMany({ orderBy: { inicio: "desc" } });
  }

  /* ─── Identificação do REP-P ─── */

  async identificacao() {
    const c = await this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } });
    const out: Record<string, unknown> = {};
    for (const k of CAMPOS_IDENT) out[k] = (c as Record<string, unknown> | null)?.[k] ?? null;
    return { ...out, versaoSistema: versaoDoSistema() };
  }

  async salvarIdentificacao(dto: Record<string, unknown>) {
    const iniciada = !!(await this.inicioRepP());
    const dados: Record<string, string | null> = {};
    for (const k of CAMPOS_IDENT) {
      if (dto[k] === undefined) continue;
      let v = dto[k] == null ? "" : String(dto[k]).trim();
      const max = SOMENTE_DIGITOS[k];
      if (max) {
        v = v.replace(/\D/g, "");
        if (v.length > max) throw new BadRequestException(`${k}: no máximo ${max} dígitos.`);
      }
      dados[k] = v || null;
    }
    if (iniciada && "repInpiRegistro" in dados) {
      const atual = await this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: { repInpiRegistro: true }
      });
      if ((atual?.repInpiRegistro ?? null) !== dados.repInpiRegistro) {
        throw new BadRequestException(
          "O REP-P já está em operação: o nº de registro no INPI não pode ser alterado."
        );
      }
    }
    if (dados.ptrpNome === null) delete dados.ptrpNome;
    if (dados.ptrpVersao === null) delete dados.ptrpVersao;
    await this.prisma.configuracaoSistema.update({ where: { id: "singleton" }, data: dados });
    return { ok: true };
  }

  /* ─── Registro no INPI ─── */

  private normalizarEtapas(e: unknown): Record<string, EtapaInpi> {
    const base = (e ?? {}) as Record<string, EtapaInpi>;
    const out: Record<string, EtapaInpi> = {};
    for (const { chave } of ETAPAS_INPI) {
      const x = base[chave] ?? {};
      out[chave] = {
        feito: !!x.feito,
        data: x.data && /^\d{4}-\d{2}-\d{2}$/.test(x.data) ? x.data : undefined,
        responsavel: x.responsavel ? String(x.responsavel).slice(0, 120) : undefined,
        obs: x.obs ? String(x.obs).slice(0, 300) : undefined
      };
    }
    return out;
  }

  async registroInpi() {
    const r = await this.prisma.registroProgramaInpi.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        versao: true,
        etapas: true,
        hashCodigoFonte: true,
        protocoloNumero: true,
        certificadoNumero: true,
        certificadoData: true,
        certificadoPdfNome: true,
        certificadoPdfSha: true,
        status: true,
        criadoPorNome: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return {
      etapasModelo: ETAPAS_INPI,
      registro: r
        ? { ...r, etapas: this.normalizarEtapas(r.etapas), temPdf: !!r.certificadoPdfSha }
        : null
    };
  }

  async salvarRegistroInpi(dto: RegistroInpiDto, autor: Autor) {
    const atual = await this.prisma.registroProgramaInpi.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    if (dto.certificadoData && !/^\d{4}-\d{2}-\d{2}$/.test(dto.certificadoData)) {
      throw new BadRequestException("Data do certificado inválida.");
    }
    if (dto.hashCodigoFonte && !/^[0-9a-fA-F]{64}$/.test(dto.hashCodigoFonte.trim())) {
      throw new BadRequestException(
        "O hash do código-fonte deve ser um SHA-256 (64 caracteres hexadecimais)."
      );
    }
    const etapas = dto.etapas ? this.normalizarEtapas(dto.etapas) : undefined;
    const dados = {
      ...(etapas ? { etapas: etapas as object } : {}),
      ...(dto.versao ? { versao: String(dto.versao).slice(0, 20) } : {}),
      ...(dto.hashCodigoFonte !== undefined
        ? { hashCodigoFonte: dto.hashCodigoFonte ? dto.hashCodigoFonte.trim().toLowerCase() : null }
        : {}),
      ...(dto.protocoloNumero !== undefined
        ? { protocoloNumero: dto.protocoloNumero?.toString().trim().slice(0, 60) || null }
        : {}),
      ...(dto.certificadoNumero !== undefined
        ? { certificadoNumero: dto.certificadoNumero?.toString().trim().slice(0, 60) || null }
        : {}),
      ...(dto.certificadoData !== undefined ? { certificadoData: dto.certificadoData || null } : {})
    };
    if (atual) {
      const iniciada = !!(await this.inicioRepP());
      if (iniciada && ("certificadoNumero" in dados || "certificadoData" in dados)) {
        const cur = await this.prisma.registroProgramaInpi.findUnique({ where: { id: atual.id } });
        if (
          ("certificadoNumero" in dados && dados.certificadoNumero !== cur?.certificadoNumero) ||
          ("certificadoData" in dados && dados.certificadoData !== cur?.certificadoData)
        ) {
          throw new BadRequestException(
            "O REP-P já está em operação: o certificado do INPI não pode ser alterado."
          );
        }
      }
      await this.prisma.registroProgramaInpi.update({ where: { id: atual.id }, data: dados });
      return { id: atual.id };
    }
    const novo = await this.prisma.registroProgramaInpi.create({
      data: {
        versao: (dados as { versao?: string }).versao ?? versaoDoSistema(),
        etapas: (etapas ?? this.normalizarEtapas({})) as object,
        ...dados,
        criadoPorNome: autor.nome
      },
      select: { id: true }
    });
    return novo;
  }

  async salvarCertificadoPdf(base64: string, nome?: string) {
    const r = await this.prisma.registroProgramaInpi.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    if (!r)
      throw new BadRequestException("Salve o registro no INPI antes de anexar o certificado.");
    const buf = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buf.length < 100 || buf.subarray(0, 5).toString() !== "%PDF-") {
      throw new BadRequestException("Envie um arquivo PDF válido.");
    }
    if (buf.length > 10 * 1024 * 1024) throw new BadRequestException("PDF acima de 10 MB.");
    await this.prisma.registroProgramaInpi.update({
      where: { id: r.id },
      data: {
        certificadoPdf: buf,
        certificadoPdfSha: createHash("sha256").update(buf).digest("hex"),
        certificadoPdfNome: (nome || "certificado-inpi.pdf")
          .replace(/[^\w.\- ]+/g, "_")
          .slice(0, 120)
      }
    });
    return { ok: true };
  }

  async baixarCertificadoPdf() {
    const r = await this.prisma.registroProgramaInpi.findFirst({
      orderBy: { createdAt: "desc" },
      select: { certificadoPdf: true, certificadoPdfNome: true }
    });
    if (!r?.certificadoPdf) throw new NotFoundException("Certificado do INPI não anexado.");
    return {
      buffer: Buffer.from(r.certificadoPdf),
      nome: r.certificadoPdfNome ?? "certificado-inpi.pdf"
    };
  }

  /* ─── Início da operação ─── */

  /** Pendências para iniciar a operação como REP-P (vazio = pode iniciar). */
  async pendenciasInicio(): Promise<string[]> {
    const out: string[] = [];
    const [c, r] = await Promise.all([
      this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } }),
      this.prisma.registroProgramaInpi.findFirst({ orderBy: { createdAt: "desc" } })
    ]);
    if (await this.inicioRepP()) out.push("O REP-P já está em operação.");
    if (!(c?.repInpiRegistro ?? "").replace(/\D/g, ""))
      out.push("Informe o nº de registro no INPI.");
    if (!c?.cnpj) out.push("CNPJ da instituição não cadastrado.");
    const etapas = this.normalizarEtapas(r?.etapas);
    if (!etapas.certificado?.feito) out.push("Conclua a etapa 'Certificado de registro recebido'.");
    if (!r?.certificadoNumero) out.push("Informe o nº do certificado de registro do INPI.");
    if (!r?.certificadoData) out.push("Informe a data do certificado de registro do INPI.");
    return out;
  }

  async iniciarOperacao(inicio: Date | undefined, autor: Autor) {
    const pend = await this.pendenciasInicio();
    if (pend.length) throw new BadRequestException(pend.join(" "));
    const agora = new Date();
    const ini = inicio ?? agora;
    if (isNaN(ini.getTime())) throw new BadRequestException("Data e hora de início inválidas.");
    if (ini.getTime() < agora.getTime() - 60_000) {
      throw new BadRequestException("O início da operação não pode estar no passado.");
    }
    if (ini.getTime() > agora.getTime() + 30 * 86_400_000) {
      throw new BadRequestException("O início da operação deve ocorrer em até 30 dias.");
    }
    const [c, r] = await Promise.all([
      this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } }),
      this.prisma.registroProgramaInpi.findFirst({ orderBy: { createdAt: "desc" } })
    ]);
    const v = await this.prisma.vigenciaRep.create({
      data: {
        tipo: "REP_P",
        inicio: ini,
        registroInpiId: r?.id ?? null,
        numeroRegistro: (c?.repInpiRegistro ?? "").replace(/\D/g, ""),
        criadoPorId: autor.id,
        criadoPorNome: autor.nome
      }
    });
    this.inicioRepPCache = v.inicio;
    return { id: v.id, inicio: v.inicio };
  }

  /** Estado do REP-P para a tela de Configurações. */
  async estado() {
    const [ini, r] = await Promise.all([
      this.inicioRepP(),
      this.prisma.registroProgramaInpi.findFirst({
        orderBy: { createdAt: "desc" },
        select: { certificadoNumero: true, certificadoData: true }
      })
    ]);
    const pendencias = ini ? [] : await this.pendenciasInicio();
    const agora = new Date();
    const situacao: "HOMOLOGACAO" | "PRONTO" | "AGENDADO" | "OPERACAO" = ini
      ? ini.getTime() > agora.getTime()
        ? "AGENDADO"
        : "OPERACAO"
      : pendencias.length === 0
        ? "PRONTO"
        : "HOMOLOGACAO";
    return {
      situacao,
      inicio: ini,
      pendencias,
      certificadoInpi: r ? { numero: r.certificadoNumero, data: r.certificadoData } : null,
      relogio: this.ultimoNtp
    };
  }

  /* ─── Relógio (NTP) ─── */

  /**
   * Anexo IX, item 2: relógio sincronizado com a Hora Legal Brasileira (Observatório Nacional), com
   * variação máxima de 30 s. Devolve o motivo quando as últimas medições confirmam o desvio.
   */
  relogioForaDoLimite(): string | null {
    if (this.foraDoLimite < 2 || !this.ultimoNtp || this.ultimoNtp.desvioMs == null) return null;
    return `o relógio do servidor está ${Math.round(Math.abs(this.ultimoNtp.desvioMs) / 1000)} s fora da Hora Legal Brasileira (limite: 30 s).`;
  }

  /** Confere com os servidores do NTP.br (Hora Legal Brasileira); tenta um por vez. */
  async verificarNtp(): Promise<void> {
    const servidores = (
      process.env.NTP_SERVER || "a.st1.ntp.br,b.st1.ntp.br,c.st1.ntp.br,d.st1.ntp.br"
    )
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    for (const servidor of servidores) {
      await this.consultarNtp(servidor);
      if (this.ultimoNtp?.desvioMs != null) break;
    }
    const d = this.ultimoNtp?.desvioMs;
    if (d != null) this.foraDoLimite = Math.abs(d) > 30_000 ? this.foraDoLimite + 1 : 0;
  }

  /** Consulta SNTP e guarda o desvio (ms) do relógio do servidor; falha de rede não é erro do REP. */
  private async consultarNtp(servidor: string): Promise<void> {
    const resultado = await new Promise<{ desvioMs: number | null; erro?: string }>((resolve) => {
      const sock = createSocket("udp4");
      const t0 = Date.now();
      const fim = (r: { desvioMs: number | null; erro?: string }) => {
        clearTimeout(timer);
        try {
          sock.close();
        } catch {
          /* já fechado */
        }
        resolve(r);
      };
      const timer = setTimeout(
        () => fim({ desvioMs: null, erro: "sem resposta do servidor NTP" }),
        4000
      );
      sock.on("error", (e) => fim({ desvioMs: null, erro: e.message }));
      sock.on("message", (msg) => {
        if (msg.length < 48) return fim({ desvioMs: null, erro: "resposta NTP inválida" });
        const t3 = Date.now();
        const seg = msg.readUInt32BE(40);
        const frac = msg.readUInt32BE(44);
        const servidorMs = (seg - NTP_EPOCH) * 1000 + Math.round((frac / 2 ** 32) * 1000);
        const rtt = t3 - t0;
        fim({ desvioMs: Math.round(Date.now() - (servidorMs + rtt / 2)) });
      });
      const pacote = Buffer.alloc(48);
      pacote[0] = 0x1b; // LI=0, VN=3, modo cliente
      sock.send(pacote, 123, servidor, (e) => {
        if (e) fim({ desvioMs: null, erro: e.message });
      });
    });
    this.ultimoNtp = { em: new Date(), servidor, ...resultado };
  }
}

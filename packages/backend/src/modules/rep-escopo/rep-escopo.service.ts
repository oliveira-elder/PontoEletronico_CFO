import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { superAdminUsernamesFromEnv } from "../../utils/super-admin";
import {
  calcularEscopo,
  compararComLock,
  lerLock,
  lerManifesto,
  raizBackend,
  type Divergencia,
  type EscopoCalculado,
  type LockEscopo
} from "../rep/escopo-hash";

export type EstadoEscopo = "OK" | "ALTERADO" | "SEM_LACRE" | "LACRE_ADULTERADO" | "INDISPONIVEL";

export const SENHA_MIN = 12;
const TENTATIVAS_MAX = 5;
const BLOQUEIO_MIN = 15;
const TOKEN_VALIDADE_MIN = 30;

const novoSegredo = () => randomBytes(32).toString("hex");

function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(senha, salt, 64).toString("hex")}`;
}

/** Chave (32 bytes) que cifra a senha para visualização. Fica em arquivo no servidor (pasta instance,
 *  fora do git e do banco): um vazamento só do banco não revela a senha. Criada na primeira necessidade. */
function chaveDaSenha(criar: boolean): Buffer | null {
  const dir = process.env.INSTANCE_DIR ?? join(process.cwd(), "instance");
  const caminho = join(dir, "rep_escopo.key");
  if (existsSync(caminho)) return Buffer.from(readFileSync(caminho, "utf8").trim(), "hex");
  if (!criar) return null;
  mkdirSync(dir, { recursive: true });
  const chave = randomBytes(32);
  writeFileSync(caminho, chave.toString("hex"), { mode: 0o600 });
  try {
    chmodSync(caminho, 0o600);
  } catch {
    /* sem permissão para ajustar o modo */
  }
  return chave;
}

function cifrarSenha(senha: string): string {
  const chave = chaveDaSenha(true)!;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  const dados = Buffer.concat([c.update(senha, "utf8"), c.final()]);
  return `aes$${iv.toString("hex")}$${c.getAuthTag().toString("hex")}$${dados.toString("hex")}`;
}

function decifrarSenha(guardado: string | null): string | null {
  const [alg, iv, tag, dados] = (guardado ?? "").split("$");
  const chave = chaveDaSenha(false);
  if (alg !== "aes" || !iv || !tag || !dados || !chave) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "hex"));
    d.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([d.update(Buffer.from(dados, "hex")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function conferirSenha(senha: string, guardado: string | null): boolean {
  const [alg, saltHex, hashHex] = (guardado ?? "").split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = scryptSync(senha, Buffer.from(saltHex, "hex"), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

/**
 * Integridade do código do REP-P: estado do lacre (hash do escopo mínimo), senha root do Super Admin,
 * liberação temporária por token e selo do novo hash. A senha NUNCA é guardada em texto (scrypt).
 */
@Injectable()
export class RepEscopoService implements OnModuleInit {
  private readonly logger = new Logger(RepEscopoService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.verificarIntegridade().catch(() => undefined);
  }

  private async cfg() {
    return this.prisma.repEscopoConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {}
    });
  }

  private async registrar(
    tipo: string,
    d: {
      ator?: string | null;
      motivo?: string | null;
      hashAnterior?: string | null;
      hashNovo?: string | null;
      arquivos?: string[];
      ip?: string | null;
    } = {}
  ) {
    await this.prisma.repEscopoLiberacao.create({
      data: {
        tipo,
        ator: d.ator ?? null,
        motivo: d.motivo ?? null,
        hashAnterior: d.hashAnterior ?? null,
        hashNovo: d.hashNovo ?? null,
        arquivos: d.arquivos ?? undefined,
        ip: d.ip ?? null
      }
    });
  }

  /* ─── Estado do lacre ─── */

  async estado(): Promise<{
    estado: EstadoEscopo;
    escopo: EscopoCalculado | null;
    lock: LockEscopo | null;
    divergencias: Divergencia[];
  }> {
    let escopo: EscopoCalculado;
    try {
      escopo = calcularEscopo();
      const total = lerManifesto().arquivos.length + lerManifesto().modelosPrisma.modelos.length;
      if (escopo.ausentes.length >= total) {
        return { estado: "INDISPONIVEL", escopo: null, lock: null, divergencias: [] };
      }
    } catch {
      return { estado: "INDISPONIVEL", escopo: null, lock: null, divergencias: [] };
    }
    const lock = lerLock();
    if (!lock) return { estado: "SEM_LACRE", escopo, lock: null, divergencias: [] };
    const ultimoSelo = await this.prisma.repEscopoLiberacao.findFirst({
      where: { tipo: "SELO" },
      orderBy: { createdAt: "desc" }
    });
    const divergencias = compararComLock(escopo, lock);
    if (ultimoSelo?.hashNovo && ultimoSelo.hashNovo !== lock.hash) {
      return { estado: "LACRE_ADULTERADO", escopo, lock, divergencias };
    }
    const alterado =
      divergencias.length > 0 || escopo.ausentes.length > 0 || escopo.hash !== lock.hash;
    return { estado: alterado ? "ALTERADO" : "OK", escopo, lock, divergencias };
  }

  async status() {
    const [e, cfg, historico] = await Promise.all([
      this.estado(),
      this.cfg(),
      this.prisma.repEscopoLiberacao.findMany({ orderBy: { createdAt: "desc" }, take: 30 })
    ]);
    return {
      estado: e.estado,
      hashAtual: e.escopo?.hash ?? null,
      hashSelado: e.lock?.hash ?? null,
      lacre: e.lock
        ? { versao: e.lock.versao, seladoEm: e.lock.selado_em, motivo: e.lock.motivo }
        : null,
      divergencias: e.divergencias,
      ausentes: e.escopo?.ausentes ?? [],
      itens: e.escopo?.itens ?? [],
      senhaConfigurada: !!cfg.senhaHash,
      /** A senha atual pode ser exibida (guardada cifrada e a chave do servidor está disponível). */
      senhaVisualizavel: !!cfg.senhaCifrada && decifrarSenha(cfg.senhaCifrada) !== null,
      senhaMinima: SENHA_MIN,
      bloqueadoAte: cfg.bloqueadoAte && cfg.bloqueadoAte > new Date() ? cfg.bloqueadoAte : null,
      historico
    };
  }

  /** Verificação na subida e 1×/dia: avisa os Super Admins uma vez por hash divergente. */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async verificarIntegridade() {
    const e = await this.estado();
    if (e.estado === "OK" || e.estado === "SEM_LACRE" || e.estado === "INDISPONIVEL") return;
    const hash = e.escopo?.hash ?? "";
    this.logger.error(
      `Código do REP-P ${e.estado === "ALTERADO" ? "ALTERADO" : "com lacre adulterado"} em relação ao lacre: ` +
        `${e.divergencias.map((d) => `${d.id} (${d.situacao})`).join(", ") || "lacre inconsistente"}.`
    );
    const cfg = await this.cfg();
    if (cfg.ultimoAvisoHash === hash) return;
    await this.avisarSuperAdmins(e.divergencias);
    await this.prisma.repEscopoConfig.update({
      where: { id: "singleton" },
      data: { ultimoAvisoHash: hash }
    });
  }

  private async avisarSuperAdmins(divergencias: Divergencia[]) {
    const nomes = superAdminUsernamesFromEnv(process.env.SUPER_ADMIN_USERNAMES);
    const users = await this.prisma.user.findMany({
      where: {
        externalId: { not: null },
        OR: [
          { superAdminConcessao: { ativo: true } },
          ...[...nomes].flatMap((n) => [
            { email: { startsWith: `${n}@`, mode: "insensitive" as const } },
            { emailReal: { startsWith: `${n}@`, mode: "insensitive" as const } }
          ])
        ]
      },
      select: { externalId: true }
    });
    const corpo =
      "Arquivos do núcleo do REP-P foram alterados em relação ao lacre: " +
      (divergencias.map((d) => d.id).join(", ") || "lacre inconsistente") +
      ". Veja Sistema → Integridade do código.";
    for (const u of users) {
      await this.prisma.notificacao.create({
        data: {
          userExternalId: u.externalId!,
          titulo: "Código do REP-P alterado",
          corpo,
          tipo: "REP_ESCOPO_ALTERADO"
        }
      });
    }
  }

  /* ─── Senha root ─── */

  private async checarBloqueio() {
    const cfg = await this.cfg();
    if (cfg.bloqueadoAte && cfg.bloqueadoAte > new Date()) {
      throw new ForbiddenException(
        `Muitas tentativas incorretas. Tente novamente após ${cfg.bloqueadoAte.toLocaleTimeString("pt-BR")}.`
      );
    }
    return cfg;
  }

  private async falhaDeSenha(ator: string, ip: string | null) {
    const cfg = await this.cfg();
    const tentativas = cfg.tentativasFalhas + 1;
    const bloquear = tentativas >= TENTATIVAS_MAX;
    await this.prisma.repEscopoConfig.update({
      where: { id: "singleton" },
      data: {
        tentativasFalhas: bloquear ? 0 : tentativas,
        bloqueadoAte: bloquear ? new Date(Date.now() + BLOQUEIO_MIN * 60_000) : cfg.bloqueadoAte
      }
    });
    await this.registrar(bloquear ? "BLOQUEIO" : "TENTATIVA_FALHA", { ator, ip });
    throw new UnauthorizedException(
      bloquear
        ? `Senha incorreta. Acesso bloqueado por ${BLOQUEIO_MIN} minutos.`
        : `Senha incorreta (${tentativas}/${TENTATIVAS_MAX}).`
    );
  }

  async definirSenha(ator: string, d: { senha?: string; senhaAtual?: string }, ip: string | null) {
    const nova = d.senha ?? "";
    const cfg = await this.checarBloqueio();
    const jaTinha = !!cfg.senhaHash;
    if (nova.length < SENHA_MIN) {
      await this.registrar("SENHA_REJEITADA", {
        ator,
        ip,
        motivo: `${jaTinha ? "troca" : "definição"} recusada: nova senha com menos de ${SENHA_MIN} caracteres`
      });
      this.logger.warn(`Senha root do REP-P: tentativa recusada (senha curta) por ${ator}.`);
      throw new BadRequestException(`A senha deve ter pelo menos ${SENHA_MIN} caracteres.`);
    }
    if (jaTinha && !conferirSenha(d.senhaAtual ?? "", cfg.senhaHash)) {
      this.logger.warn(`Senha root do REP-P: troca recusada (senha atual incorreta) por ${ator}.`);
      await this.falhaDeSenha(ator, ip);
    }
    await this.prisma.repEscopoConfig.update({
      where: { id: "singleton" },
      data: {
        senhaHash: hashSenha(nova),
        senhaCifrada: cifrarSenha(nova),
        /* Trocar a senha invalida qualquer liberação em andamento. */
        segredoToken: novoSegredo(),
        tentativasFalhas: 0,
        bloqueadoAte: null,
        atualizadoPorNome: ator
      }
    });
    await this.registrar(jaTinha ? "SENHA_ALTERADA" : "SENHA_DEFINIDA", {
      ator,
      ip,
      motivo: jaTinha
        ? "troca da senha root (liberações em andamento canceladas)"
        : "primeira definição da senha root"
    });
    this.logger.log(
      `Senha root do REP-P ${jaTinha ? "ALTERADA" : "DEFINIDA"} por ${ator} (IP ${ip ?? "?"}).`
    );
    return { ok: true };
  }

  /**
   * Entrega a senha root atual ao Super Admin para preencher o campo "Senha atual" (em pontinhos).
   * Cada entrega fica registrada (quem, quando, IP).
   */
  async revelarSenha(ator: string, ip: string | null) {
    const cfg = await this.cfg();
    if (!cfg.senhaHash) throw new BadRequestException("Nenhuma senha definida.");
    const senha = decifrarSenha(cfg.senhaCifrada);
    if (senha === null) {
      throw new BadRequestException(
        "A senha atual não está disponível para visualização. Gere um token de liberação com ela ou defina-a novamente."
      );
    }
    await this.registrar("SENHA_CARREGADA", {
      ator,
      ip,
      motivo: "senha atual carregada no formulário (oculta, em pontinhos)"
    });
    this.logger.warn(`Senha root do REP-P carregada na tela por ${ator} (IP ${ip ?? "?"}).`);
    return { senha };
  }

  /**
   * Habilita a exibição da senha atual (definida antes da visualização existir, só como hash).
   * Exige a senha: confere pelo hash, depois a guarda cifrada. Erros contam para o bloqueio.
   */
  async habilitarVisualizacao(ator: string, senha: string, ip: string | null) {
    const cfg = await this.checarBloqueio();
    if (!cfg.senhaHash) throw new BadRequestException("Nenhuma senha definida.");
    if (!conferirSenha(senha ?? "", cfg.senhaHash)) {
      this.logger.warn(
        `Senha root do REP-P: habilitar visualização recusado (senha incorreta) por ${ator}.`
      );
      await this.falhaDeSenha(ator, ip);
    }
    await this.prisma.repEscopoConfig.update({
      where: { id: "singleton" },
      data: { senhaCifrada: cifrarSenha(senha), tentativasFalhas: 0 }
    });
    await this.registrar("SENHA_VISUALIZAVEL", {
      ator,
      ip,
      motivo: "visualização habilitada pelo Super Admin informando a senha atual"
    });
    this.logger.warn(
      `Visualização da senha root do REP-P habilitada por ${ator} (IP ${ip ?? "?"}).`
    );
    return { ok: true };
  }

  /** O Super Admin clicou no olho e a senha ficou visível na tela. */
  async registrarExibicao(ator: string, ip: string | null) {
    await this.registrar("SENHA_EXIBIDA", {
      ator,
      ip,
      motivo: "senha root exibida na tela (olho)"
    });
    this.logger.warn(`Senha root do REP-P EXIBIDA na tela por ${ator} (IP ${ip ?? "?"}).`);
    return { ok: true };
  }

  /** Senha correta → token assinado de 30 min para liberar a edição (rep:liberar) e selar (rep:selar). */
  async liberar(ator: string, senha: string, ip: string | null) {
    const cfg = await this.checarBloqueio();
    if (!cfg.senhaHash) {
      throw new BadRequestException("Defina primeiro a senha root nesta aba.");
    }
    if (!conferirSenha(senha ?? "", cfg.senhaHash)) await this.falhaDeSenha(ator, ip);
    /* Senha definida antes da visualização existir: aproveita a digitação correta para habilitá-la. */
    if (!cfg.senhaCifrada) {
      await this.prisma.repEscopoConfig.update({
        where: { id: "singleton" },
        data: { senhaCifrada: cifrarSenha(senha) }
      });
      await this.registrar("SENHA_VISUALIZAVEL", {
        ator,
        ip,
        motivo: "senha cifrada para visualização (habilitado na liberação)"
      });
    }
    const segredo = cfg.segredoToken ?? novoSegredo();
    const exp = Date.now() + TOKEN_VALIDADE_MIN * 60_000;
    const carga = Buffer.from(JSON.stringify({ exp, n: randomBytes(8).toString("hex") })).toString(
      "base64url"
    );
    const token = `${carga}.${createHmac("sha256", segredo).update(carga).digest("hex")}`;
    await this.prisma.repEscopoConfig.update({
      where: { id: "singleton" },
      data: { segredoToken: segredo, tentativasFalhas: 0, bloqueadoAte: null }
    });
    await this.registrar("LIBERACAO", {
      ator,
      ip,
      motivo: `token de ${TOKEN_VALIDADE_MIN} min emitido`
    });
    return { token, expiraEm: new Date(exp).toISOString() };
  }

  async tokenValido(token: string | undefined): Promise<boolean> {
    const [carga, assinatura] = (token ?? "").split(".");
    if (!carga || !assinatura) return false;
    const cfg = await this.cfg();
    if (!cfg.segredoToken) return false;
    const esperado = createHmac("sha256", cfg.segredoToken).update(carga).digest("hex");
    const a = Buffer.from(assinatura);
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    try {
      const { exp } = JSON.parse(Buffer.from(carga, "base64url").toString("utf8")) as {
        exp: number;
      };
      return typeof exp === "number" && exp > Date.now();
    } catch {
      return false;
    }
  }

  /**
   * Sela o escopo atual como o novo lacre. Exige token válido e motivo; o servidor recalcula o hash
   * sobre os arquivos que ele mesmo enxerga. O token é descartado (uso único).
   */
  async selar(token: string | undefined, motivo: string | undefined, ip: string | null) {
    if (!(await this.tokenValido(token))) {
      throw new UnauthorizedException(
        "Liberação inválida ou expirada. Libere novamente com a senha root."
      );
    }
    const m = (motivo ?? "").trim();
    if (m.length < 10) throw new BadRequestException("Informe o motivo (mínimo de 10 caracteres).");
    const escopo = calcularEscopo();
    if (escopo.ausentes.length) {
      throw new BadRequestException(
        `Itens do escopo não encontrados: ${escopo.ausentes.join(", ")}.`
      );
    }
    const anterior = lerLock();
    const lock: LockEscopo = {
      versao: this.versao(),
      algoritmo: "SHA-256",
      hash: escopo.hash,
      selado_em: new Date().toISOString(),
      motivo: m,
      itens: escopo.itens
    };
    await this.registrar("SELO", {
      ator: "liberação por token",
      motivo: m,
      hashAnterior: anterior?.hash ?? null,
      hashNovo: lock.hash,
      arquivos: anterior ? compararComLock(escopo, anterior).map((d) => d.id) : [],
      ip
    });
    await this.prisma.repEscopoConfig.update({
      where: { id: "singleton" },
      data: { segredoToken: novoSegredo(), ultimoAvisoHash: null }
    });
    return lock;
  }

  private versao(): string {
    try {
      return (
        (
          JSON.parse(readFileSync(join(raizBackend(), "package.json"), "utf8")) as {
            version?: string;
          }
        ).version ?? "desconhecida"
      );
    } catch {
      return "desconhecida";
    }
  }
}

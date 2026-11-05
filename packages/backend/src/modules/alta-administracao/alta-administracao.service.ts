import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { cpfValido } from "../../utils/cpf";
import {
  emailGenerico,
  normalizarUsuarioSso,
  usuarioGenerico,
  usuarioParecePessoal
} from "../../utils/conta-pessoal";
import { superAdminUsernamesFromEnv } from "../../utils/super-admin";
import { KeycloakAdminService } from "../admin/keycloak-admin.service";
import { ExtensionsService } from "../extensions/extensions.service";

export const SUBCATEGORIAS = [
  "PRESIDENTE",
  "VICE_PRESIDENTE",
  "SECRETARIO_GERAL",
  "TESOUREIRO",
  "SUPERINTENDENTE",
  "OUTROS"
] as const;
type Subcategoria = (typeof SUBCATEGORIAS)[number];

export const SUBCATEGORIA_ROTULO: Record<Subcategoria, string> = {
  PRESIDENTE: "Presidente",
  VICE_PRESIDENTE: "Vice-Presidente",
  SECRETARIO_GERAL: "Secretário-Geral",
  TESOUREIRO: "Tesoureiro",
  SUPERINTENDENTE: "Superintendente",
  OUTROS: "Outros"
};

export const MOTIVOS = [
  "FRAUDE_SUSPEITA",
  "ERRO_DE_CADASTRO",
  "DADOS_DIVERGENTES",
  "OUTRO"
] as const;

const TAMANHO_MAX_BYTES = 8 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png"
};

export interface Ator {
  nome: string;
  sub: string | null;
  /** Token do Super Admin, usado só como alternativa à credencial de serviço do Keycloak. */
  token: string;
}

export interface Checagem {
  chave: string;
  rotulo: string;
  ok: boolean;
  detalhe?: string;
}

export interface ResultadoVerificacao {
  em: string;
  aprovado: boolean;
  checagens: Checagem[];
  /** Nome completo no SSO (usado no cadastro quando existe). */
  nomeSso?: string | null;
}

/** Tipo real do arquivo pelos primeiros bytes (não confia só no MIME informado). */
export function tipoPelosBytes(buf: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-")
    return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  return null;
}

export const NUMERO_CHAMADO_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/#-]{3,59}$/;

/**
 * Nome completo a partir do nome e do sobrenome do SSO, sem repetir palavras quando o sobrenome já começa pelo
 * fim do nome (ex.: "Marcondes Martins da Silva" + "Martins da Silva Junior" => "Marcondes Martins da Silva Junior").
 */
export function nomeCompletoSso(
  primeiro: string | null | undefined,
  sobrenome: string | null | undefined
): string {
  const a = (primeiro ?? "").trim().split(/\s+/).filter(Boolean);
  const b = (sobrenome ?? "").trim().split(/\s+/).filter(Boolean);
  const norm = (t: string) => t.toLowerCase();
  for (let n = Math.min(a.length, b.length); n > 0; n--) {
    const fimA = a
      .slice(a.length - n)
      .map(norm)
      .join(" ");
    const iniB = b.slice(0, n).map(norm).join(" ");
    if (fimA === iniB) return [...a, ...b.slice(n)].join(" ");
  }
  return [...a, ...b].join(" ");
}

const soDigitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");
const mascararCpf = (d: string) =>
  `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
const dominioReal = () => process.env.REAL_EMAIL_DOMAIN ?? "cfo.org.br";

/**
 * Entrada, SEM matrícula, da Alta Administração. Fluxo: o Super Admin registra a requisição do RH (chamado + anexo),
 * o sistema verifica SSO/AD/e-mail pessoal/CPF, e outro Super Admin AUTORIZA ou NEGA (fraude ou erro). O acesso só
 * existe com a entrada AUTORIZADA e acompanha a conta do SSO/AD: conta desabilitada = acesso revogado.
 */
@Injectable()
export class AltaAdministracaoService implements OnModuleInit {
  private readonly logger = new Logger(AltaAdministracaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extensions: ExtensionsService,
    private readonly kc: KeycloakAdminService
  ) {}

  onModuleInit() {
    void this.verificarSsoAutorizadas().catch(() => undefined);
  }

  private get exigeSegundoAprovador() {
    return process.env.ALTA_ADM_EXIGE_SEGUNDO_APROVADOR !== "false";
  }

  private get exigeAdFederado() {
    return process.env.ALTA_ADM_EXIGE_AD_FEDERADO !== "false";
  }

  private get dirPrivado() {
    return join(
      process.env.UPLOAD_PRIVATE_DIR ?? join(process.cwd(), "uploads-privado"),
      "alta-administracao"
    );
  }

  /* ─── Listagens ─── */

  /** Todas as pessoas da API de ramais SEM matrícula, com a situação de cada uma. */
  async listarPessoas() {
    const pessoas = await this.extensions.pessoasDaApiResumo();
    const contagem = new Map<string, number>();
    for (const p of pessoas) {
      if (p.email)
        contagem.set(p.email.toLowerCase(), (contagem.get(p.email.toLowerCase()) ?? 0) + 1);
    }
    const entradas = await this.prisma.entradaSemMatricula.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, extensionsId: true, status: true }
    });
    const ultima = new Map<string, { id: string; status: string }>();
    for (const e of entradas) if (!ultima.has(e.extensionsId)) ultima.set(e.extensionsId, e);
    return pessoas
      .filter((p) => p.staffId == null)
      .map((p) => {
        const e = ultima.get(p.id);
        const compartilhado = !!p.email && (contagem.get(p.email.toLowerCase()) ?? 0) > 1;
        const genericoApi = !!p.email && emailGenerico(p.email);
        const situacao =
          e?.status === "PENDENTE" || e?.status === "AUTORIZADA"
            ? `SOLICITACAO_${e.status}`
            : !p.email
              ? "SEM_EMAIL"
              : compartilhado || genericoApi
                ? "EMAIL_GERAL"
                : "DISPONIVEL";
        return {
          ...p,
          emailCompartilhado: compartilhado,
          emailGenerico: genericoApi,
          situacao,
          entradaId: e?.id ?? null
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async listarEntradas(sub: string | null = null) {
    await this.encerrarEntradasSemFuncionario();
    const rows = await this.prisma.entradaSemMatricula.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map((e) => {
      const { anexoCaminho, ...resto } = e;
      void anexoCaminho;
      /* O botão Autorizar fica indisponível para quem registrou a solicitação (segundo aprovador). */
      return { ...resto, temAnexo: true, solicitadoPorMim: !!sub && sub === e.solicitadoPorSub };
    });
  }

  /** O SSO responde à API Admin? (a aba avisa quando não, pois sem isso nada é autorizado). */
  async statusSso(token: string) {
    const r = await this.kc.buscarUsuarioExato("verificacao.sso", token);
    return {
      disponivel: r.disponivel,
      exigeAdFederado: this.exigeAdFederado,
      exigeSegundoAprovador: this.exigeSegundoAprovador
    };
  }

  /* ─── Verificações automáticas ─── */

  private async verificar(p: {
    extensionsId: string;
    usuarioSso: string;
    emailInstitucional: string;
    cpf: string | null;
    token: string;
    entradaId?: string;
  }): Promise<ResultadoVerificacao> {
    const checagens: Checagem[] = [];
    const add = (chave: string, rotulo: string, ok: boolean, detalhe?: string) =>
      checagens.push({ chave, rotulo, ok, detalhe });

    /* (a) pessoa ainda sem matrícula na API; (b) e-mail da API não é geral nem compartilhado */
    let pessoaApi: Awaited<ReturnType<ExtensionsService["pessoasDaApiResumo"]>>[number] | undefined;
    let todas: Awaited<ReturnType<ExtensionsService["pessoasDaApiResumo"]>> = [];
    try {
      todas = await this.extensions.pessoasDaApiResumo();
      pessoaApi = todas.find((x) => x.id === p.extensionsId);
    } catch {
      /* API fora do ar: falha fechada abaixo */
    }
    add(
      "api",
      "Pessoa consta na API de ramais e continua sem matrícula",
      !!pessoaApi && pessoaApi.staffId == null,
      !pessoaApi
        ? "Pessoa não encontrada na API (ou API indisponível)."
        : pessoaApi.staffId != null
          ? `A API já informa matrícula ${pessoaApi.staffId}: use o cadastro comum.`
          : undefined
    );
    const emailApi = pessoaApi?.email ?? null;
    const compartilhado =
      !!emailApi &&
      todas.filter((x) => x.email?.toLowerCase() === emailApi.toLowerCase()).length > 1;
    add(
      "email_api",
      "E-mail da API é pessoal (não geral nem compartilhado)",
      !emailApi || (!emailGenerico(emailApi) && !compartilhado),
      emailApi && (emailGenerico(emailApi) || compartilhado)
        ? `O e-mail ${emailApi} é de função ou compartilhado: não pode ser ativado.`
        : emailApi
          ? undefined
          : "Sem e-mail na API (aceito: vale o usuário do SSO)."
    );

    /* usuário do SSO pessoal */
    add(
      "usuario",
      "Usuário do SSO é pessoal (nome.sobrenome)",
      usuarioParecePessoal(p.usuarioSso) && !usuarioGenerico(p.usuarioSso),
      usuarioParecePessoal(p.usuarioSso) && !usuarioGenerico(p.usuarioSso)
        ? undefined
        : `"${p.usuarioSso}" não parece conta pessoal: use o usuário individual (nome.sobrenome).`
    );

    /* livres no Ponto */
    const emailInst = p.emailInstitucional.toLowerCase();
    /* Só conta como "em uso" quem tem FUNCIONÁRIO. Um usuário órfão (sem funcionário, ex.: o funcionário foi
       excluído na Gestão, que não apaga o usuário) é reaproveitado ao autorizar. */
    const usadoPor = (await this.usuariosDoEmail(this.prisma, emailInst, p.usuarioSso)).find(
      (u) => u.funcionario
    );
    add(
      "livre",
      "Usuário/e-mail institucional livres no Ponto",
      !usadoPor,
      usadoPor ? `${emailInst} já está em uso por outro cadastro.` : undefined
    );
    await this.encerrarEntradasSemFuncionario();
    const aberta = await this.prisma.entradaSemMatricula.findFirst({
      where: {
        id: p.entradaId ? { not: p.entradaId } : undefined,
        status: { in: ["PENDENTE", "AUTORIZADA"] },
        OR: [{ extensionsId: p.extensionsId }, { usuarioSso: p.usuarioSso }]
      },
      select: { id: true }
    });
    add(
      "duplicada",
      "Sem outra solicitação aberta para a mesma pessoa/usuário",
      !aberta,
      aberta ? "Já existe solicitação pendente ou autorizada." : undefined
    );
    const jaFunc = await this.prisma.funcionario.findFirst({
      where: { extensionsId: p.extensionsId },
      select: { id: true }
    });
    add(
      "cadastrada",
      "Pessoa ainda não cadastrada no Ponto",
      !jaFunc,
      jaFunc ? "Já existe funcionário ligado a esta pessoa da API." : undefined
    );

    /* CPF */
    const cpf = soDigitos(p.cpf);
    /* CPF é opcional; se foi informado, precisa ser válido e único. */
    let cpfOk = !cpf || cpfValido(cpf);
    let cpfMsg = cpfOk ? undefined : "CPF inválido.";
    if (cpf && cpfOk) {
      const existentes = await this.prisma.funcionario.findMany({
        where: { cpf: { not: null } },
        select: { cpf: true }
      });
      if (existentes.some((f) => soDigitos(f.cpf) === cpf)) {
        cpfOk = false;
        cpfMsg = "Este CPF já está cadastrado em outro funcionário.";
      }
    }
    add(
      "cpf",
      "CPF válido e único (quando informado)",
      cpfOk,
      cpfMsg ?? (cpf ? undefined : "CPF não informado (opcional).")
    );

    /* SSO (e AD via federação do SSO): falha fechada se a API Admin não responde */
    let nomeSso: string | null = null;
    const r = await this.kc.buscarUsuarioExato(p.usuarioSso, p.token);
    if (!r.disponivel) {
      add(
        "sso_disponivel",
        "API Admin do SSO disponível para verificar a conta",
        false,
        "A verificação do SSO/AD está indisponível (credencial da API Admin não configurada): nada é autorizado sem ela."
      );
    } else {
      const u = r.usuario;
      add(
        "sso_existe",
        "Usuário existe no SSO",
        !!u,
        u ? undefined : `O usuário "${p.usuarioSso}" não existe no SSO.`
      );
      add(
        "sso_habilitado",
        "Conta habilitada no SSO",
        !!u?.enabled,
        u && !u.enabled ? "A conta está desabilitada no SSO." : undefined
      );
      const nome = nomeCompletoSso(u?.firstName, u?.lastName);
      nomeSso = nome || null;
      add(
        "sso_nome",
        "Conta com nome e sobrenome",
        !!u?.firstName && !!u?.lastName,
        u?.firstName && u?.lastName ? undefined : "O SSO precisa ter nome e sobrenome da pessoa."
      );
      const emailSso = u?.email?.trim();
      add(
        "sso_email",
        "E-mail do SSO é pessoal (quando informado)",
        !emailSso || !emailGenerico(emailSso),
        emailSso && emailGenerico(emailSso)
          ? `O e-mail ${emailSso} no SSO é de função: não pode ser ativado.`
          : emailSso
            ? undefined
            : "Sem e-mail no SSO (aceito)."
      );
      if (this.exigeAdFederado) {
        add(
          "ad",
          "Conta federada ao AD",
          !!u?.federationLink,
          u?.federationLink
            ? undefined
            : "A conta não é federada ao AD: o desligamento no AD não desabilitaria o acesso. Use a conta do AD."
        );
      }
    }

    const aprovado = checagens.every((c) => c.ok);
    return { em: new Date().toISOString(), aprovado, checagens, nomeSso };
  }

  /** Usuários que usam o e-mail institucional (ou o usuário do SSO), com o funcionário de cada um. */
  private async usuariosDoEmail(
    db: Pick<PrismaService, "user">,
    emailInst: string,
    usuarioSso: string
  ) {
    return db.user.findMany({
      where: {
        OR: [
          { email: { equals: emailInst, mode: "insensitive" } },
          { emailReal: { equals: emailInst, mode: "insensitive" } },
          { email: { startsWith: `${usuarioSso}@`, mode: "insensitive" } }
        ]
      },
      select: { id: true, externalId: true, funcionario: { select: { id: true } } }
    });
  }

  /**
   * Entrada AUTORIZADA cujo funcionário foi excluído (ex.: na Gestão) fica REVOGADA: sem isso ela bloquearia
   * para sempre uma nova solicitação da mesma pessoa.
   */
  private async encerrarEntradasSemFuncionario() {
    const autorizadas = await this.prisma.entradaSemMatricula.findMany({
      where: { status: "AUTORIZADA", funcionarioId: { not: null } },
      select: { id: true, funcionarioId: true }
    });
    for (const e of autorizadas) {
      const f = await this.prisma.funcionario.findUnique({
        where: { id: e.funcionarioId as string },
        select: { id: true }
      });
      if (f) continue;
      await this.prisma.entradaSemMatricula.update({
        where: { id: e.id },
        data: {
          status: "REVOGADA",
          decididoPorNome: "Sistema (funcionário excluído)",
          decididoEm: new Date(),
          categoriaMotivo: "OUTRO",
          motivoDecisao: "O funcionário ligado a esta entrada foi excluído."
        }
      });
    }
  }

  /* ─── Solicitar ─── */

  private validarAnexo(base64: string | undefined) {
    if (!base64) throw new BadRequestException("Anexe o print ou o PDF da solicitação do chamado.");
    const m = /^data:([^;]+);base64,/.exec(base64);
    const mimeInformado = m?.[1] ?? "";
    const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!buf.length) throw new BadRequestException("Arquivo vazio.");
    if (buf.length > TAMANHO_MAX_BYTES) throw new BadRequestException("Arquivo acima de 8 MB.");
    const real = tipoPelosBytes(buf);
    if (!real || !MIME_EXT[real])
      throw new BadRequestException("O anexo deve ser PDF, JPG ou PNG.");
    if (mimeInformado && mimeInformado !== real) {
      throw new BadRequestException("O conteúdo do arquivo não corresponde ao tipo informado.");
    }
    return {
      buf,
      mime: real,
      ext: MIME_EXT[real],
      sha256: createHash("sha256").update(buf).digest("hex")
    };
  }

  async solicitar(
    ator: Ator,
    b: {
      apiId?: string;
      usuarioSso?: string;
      cpf?: string;
      subcategoria?: string;
      numeroChamado?: string;
      arquivoBase64?: string;
      nomeArquivo?: string;
    },
    ip: string | null
  ) {
    const usuario = normalizarUsuarioSso(b.usuarioSso);
    if (!usuario)
      throw new BadRequestException(
        "Usuário do SSO inválido (letras, números, ponto, hífen ou sublinhado; sem @)."
      );
    if (!b.apiId) throw new BadRequestException("Escolha a pessoa da API de ramais.");
    if (!SUBCATEGORIAS.includes(b.subcategoria as Subcategoria))
      throw new BadRequestException("Escolha a subcategoria.");
    const chamado = (b.numeroChamado ?? "").trim();
    if (!NUMERO_CHAMADO_RE.test(chamado))
      throw new BadRequestException("Informe o número do chamado (ex.: GLPI-12345).");
    const cpf = soDigitos(b.cpf);
    if (cpf && !cpfValido(cpf)) throw new BadRequestException("CPF inválido.");
    const anexo = this.validarAnexo(b.arquivoBase64);

    const pessoas = await this.extensions.pessoasDaApiResumo().catch(() => []);
    const pessoa = pessoas.find((x) => x.id === b.apiId);
    if (!pessoa) throw new BadRequestException("Pessoa não encontrada na API de ramais.");
    if (pessoa.staffId != null)
      throw new BadRequestException("Esta pessoa já tem matrícula na API: use o cadastro comum.");

    const emailInstitucional = `${usuario}@${dominioReal()}`;
    const verificacao = await this.verificar({
      extensionsId: pessoa.id,
      usuarioSso: usuario,
      emailInstitucional,
      cpf: cpf || null,
      token: ator.token
    });

    const id = randomUUID();
    const dir = join(this.dirPrivado, id);
    await mkdir(dir, { recursive: true });
    const caminho = join(dir, `anexo.${anexo.ext}`);
    await writeFile(caminho, anexo.buf);
    try {
      const criada = await this.prisma.entradaSemMatricula.create({
        data: {
          id,
          extensionsId: pessoa.id,
          secaoApi: pessoa.secao,
          subsecaoApi: pessoa.subsecao,
          ramal: pessoa.ramal,
          sala: pessoa.sala,
          andar: pessoa.andar,
          nomeApi: pessoa.nome,
          emailApi: pessoa.email,
          usuarioSso: usuario,
          emailInstitucional,
          cpf: cpf ? mascararCpf(cpf) : null,
          subcategoria: b.subcategoria as Subcategoria,
          numeroChamado: chamado,
          anexoCaminho: caminho,
          anexoNome: (b.nomeArquivo ?? `anexo.${anexo.ext}`).slice(0, 120),
          anexoMime: anexo.mime,
          anexoSha256: anexo.sha256,
          solicitadoPorNome: ator.nome,
          solicitadoPorSub: ator.sub,
          ip,
          resultadoVerificacao: verificacao as never
        }
      });
      this.logger.warn(
        `Alta Administração: solicitação ${id} (${pessoa.nome}, usuário ${usuario}, chamado ${chamado}) registrada por ${ator.nome}; verificação ${verificacao.aprovado ? "APROVADA" : "REPROVADA"}.`
      );
      await this.avisarSuperAdmins(
        "Solicitação de entrada sem matrícula",
        `${ator.nome} registrou a entrada de ${pessoa.nome} (Alta Administração, chamado ${chamado}). Outro Super Administrador deve autorizar ou negar em Sistema → Alta Administração.`,
        ator.sub
      );
      const { anexoCaminho, ...resto } = criada;
      void anexoCaminho;
      return resto;
    } catch (e) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw e;
    }
  }

  /* ─── Decisão ─── */

  private async obter(id: string) {
    const e = await this.prisma.entradaSemMatricula.findUnique({ where: { id } });
    if (!e) throw new NotFoundException("Solicitação não encontrada.");
    return e;
  }

  async autorizar(ator: Ator, id: string, confirmou: boolean, ip: string | null) {
    const e = await this.obter(id);
    if (e.status !== "PENDENTE")
      throw new BadRequestException(
        `A solicitação está ${e.status}: só pendentes podem ser autorizadas.`
      );
    if (confirmou !== true)
      throw new BadRequestException('Confirme a autorização expressa ("Autorizo expressamente").');
    if (this.exigeSegundoAprovador) {
      const mesmaPessoa = ator.sub
        ? ator.sub === e.solicitadoPorSub
        : ator.nome === e.solicitadoPorNome;
      if (mesmaPessoa) {
        throw new ForbiddenException(
          "Quem registrou a solicitação não pode autorizá-la: outro Super Administrador deve decidir."
        );
      }
    }
    const verificacao = await this.verificar({
      extensionsId: e.extensionsId,
      usuarioSso: e.usuarioSso,
      emailInstitucional: e.emailInstitucional,
      cpf: e.cpf,
      token: ator.token,
      entradaId: e.id
    });
    await this.prisma.entradaSemMatricula.update({
      where: { id },
      data: { resultadoVerificacao: verificacao as never }
    });
    if (!verificacao.aprovado) {
      const falhas = verificacao.checagens.filter((c) => !c.ok).map((c) => c.detalhe ?? c.rotulo);
      throw new BadRequestException(`Não é possível autorizar: ${falhas.join(" | ")}`);
    }

    const gerencia = e.secaoApi ? await this.extensions.resolverGerenciaPorSecao(e.secaoApi) : null;
    const hoje = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const dados = {
          name: verificacao.nomeSso || e.nomeApi,
          email: e.emailInstitucional,
          emailReal: e.emailInstitucional
        };
        const existentes = await this.usuariosDoEmail(tx, e.emailInstitucional, e.usuarioSso);
        if (existentes.some((u) => u.funcionario)) {
          throw new BadRequestException(
            `${e.emailInstitucional} já está em uso por outro cadastro.`
          );
        }
        /* Usuário órfão (sem funcionário): reaproveita (prefere o que já fez login no SSO) e apaga os
           demais órfãos vazios que conflitariam com o e-mail. */
        const escolhido = [...existentes].sort(
          (a, b) => Number(!!b.externalId) - Number(!!a.externalId)
        )[0];
        for (const outro of existentes) {
          if (outro.id !== escolhido?.id && !outro.externalId) {
            await tx.user.delete({ where: { id: outro.id } });
          }
        }
        const user = escolhido
          ? await tx.user.update({ where: { id: escolhido.id }, data: dados })
          : await tx.user.create({ data: dados });
        const f = await tx.funcionario.create({
          data: {
            userId: user.id,
            matricula: null,
            cpf: e.cpf,
            cargo: SUBCATEGORIA_ROTULO[e.subcategoria as Subcategoria],
            categoria: "ALTA_ADMINISTRACAO",
            subcategoria: e.subcategoria,
            ativo: true,
            gerenciaId: gerencia?.id,
            subsecao: e.subsecaoApi,
            section: e.secaoApi,
            extensionsId: e.extensionsId,
            ramal: e.ramal,
            sala: e.sala,
            andar: e.andar,
            pontoObrigatorioDesde: null
          }
        });
        await tx.funcionarioCategoriaHistorico.create({
          data: {
            funcionarioId: f.id,
            categoria: "ALTA_ADMINISTRACAO",
            isManager: false,
            vigenciaDesde: hoje,
            vigenciaAte: null
          }
        });
        await tx.entradaSemMatricula.update({
          where: { id },
          data: {
            status: "AUTORIZADA",
            funcionarioId: f.id,
            decididoPorNome: ator.nome,
            decididoPorSub: ator.sub,
            decididoEm: hoje,
            motivoDecisao: "Autorização expressa do Super Administrador."
          }
        });
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new BadRequestException("Já existe cadastro com este e-mail, CPF ou pessoa da API.");
      }
      throw err;
    }
    this.logger.warn(
      `Alta Administração: solicitação ${id} AUTORIZADA por ${ator.nome} (IP ${ip ?? "?"}).`
    );
    await this.avisarSuperAdmins(
      "Entrada sem matrícula autorizada",
      `${ator.nome} autorizou a entrada de ${e.nomeApi} (Alta Administração, chamado ${e.numeroChamado}).`,
      ator.sub
    );
    return { ok: true };
  }

  private validarMotivo(b: { categoriaMotivo?: string; motivo?: string }) {
    if (!MOTIVOS.includes(b.categoriaMotivo as (typeof MOTIVOS)[number])) {
      throw new BadRequestException(
        "Escolha o tipo do motivo (fraude suspeita, erro de cadastro, divergência ou outro)."
      );
    }
    const motivo = (b.motivo ?? "").trim();
    if (motivo.length < 10)
      throw new BadRequestException("Descreva o motivo (mínimo de 10 caracteres).");
    return { categoriaMotivo: b.categoriaMotivo as string, motivo };
  }

  async negar(
    ator: Ator,
    id: string,
    b: { categoriaMotivo?: string; motivo?: string },
    ip: string | null
  ) {
    const e = await this.obter(id);
    if (e.status !== "PENDENTE")
      throw new BadRequestException(
        "Só solicitações pendentes podem ser negadas (use revogar para as autorizadas)."
      );
    const { categoriaMotivo, motivo } = this.validarMotivo(b);
    await this.prisma.entradaSemMatricula.update({
      where: { id },
      data: {
        status: "NEGADA",
        decididoPorNome: ator.nome,
        decididoPorSub: ator.sub,
        decididoEm: new Date(),
        categoriaMotivo,
        motivoDecisao: motivo
      }
    });
    this.logger.warn(
      `Alta Administração: solicitação ${id} NEGADA por ${ator.nome} (${categoriaMotivo}; IP ${ip ?? "?"}).`
    );
    await this.avisarSuperAdmins(
      "Entrada sem matrícula negada",
      `${ator.nome} negou a entrada de ${e.nomeApi} (${categoriaMotivo}).`,
      ator.sub
    );
    return { ok: true };
  }

  async revogar(
    ator: Ator,
    id: string,
    b: { categoriaMotivo?: string; motivo?: string; chamado?: string },
    ip: string | null
  ) {
    const e = await this.obter(id);
    if (e.status !== "AUTORIZADA")
      throw new BadRequestException("Só entradas autorizadas podem ser revogadas.");
    const { categoriaMotivo, motivo } = this.validarMotivo(b);
    const chamado = (b.chamado ?? "").trim();
    if (!NUMERO_CHAMADO_RE.test(chamado))
      throw new BadRequestException("Informe o número do chamado da revogação.");
    await this.encerrar(e.id, e.funcionarioId, {
      por: ator.nome,
      sub: ator.sub,
      categoriaMotivo,
      motivo,
      chamado
    });
    this.logger.warn(
      `Alta Administração: entrada ${id} REVOGADA por ${ator.nome} (${categoriaMotivo}; chamado ${chamado}; IP ${ip ?? "?"}).`
    );
    await this.avisarSuperAdmins(
      "Entrada sem matrícula revogada",
      `${ator.nome} revogou o acesso de ${e.nomeApi} (chamado ${chamado}).`,
      ator.sub
    );
    return { ok: true };
  }

  /** Encerra o acesso: entrada REVOGADA e funcionário INATIVO (nada é apagado). */
  private async encerrar(
    entradaId: string,
    funcionarioId: string | null,
    d: {
      por: string;
      sub: string | null;
      categoriaMotivo: string;
      motivo: string;
      chamado?: string;
    }
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.entradaSemMatricula.update({
        where: { id: entradaId },
        data: {
          status: "REVOGADA",
          decididoPorNome: d.por,
          decididoPorSub: d.sub,
          decididoEm: new Date(),
          categoriaMotivo: d.categoriaMotivo,
          motivoDecisao: d.motivo,
          chamadoDecisao: d.chamado ?? null
        }
      });
      if (funcionarioId) {
        await tx.funcionario.update({ where: { id: funcionarioId }, data: { ativo: false } });
      }
    });
  }

  /* ─── Anexo ─── */

  async anexo(id: string, ator: Ator) {
    const e = await this.obter(id);
    if (!existsSync(e.anexoCaminho))
      throw new NotFoundException("Arquivo do anexo não encontrado.");
    this.logger.warn(`Alta Administração: anexo da solicitação ${id} aberto por ${ator.nome}.`);
    return { buffer: await readFile(e.anexoCaminho), mime: e.anexoMime, nome: e.anexoNome };
  }

  /* ─── Acesso preso ao SSO/AD ─── */

  /**
   * De hora em hora: para cada entrada AUTORIZADA, confere no SSO. Conta desabilitada ou inexistente =>
   * funcionário inativo e entrada REVOGADA (automático). NUNCA reativa sozinho. Sem API Admin do SSO, não altera nada.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async verificarSsoAutorizadas() {
    const entradas = await this.prisma.entradaSemMatricula.findMany({
      where: { status: "AUTORIZADA" }
    });
    if (!entradas.length) return;
    let indisponivel = false;
    for (const e of entradas) {
      const r = await this.kc.buscarUsuarioExato(e.usuarioSso);
      if (!r.disponivel) {
        indisponivel = true;
        continue;
      }
      await this.prisma.entradaSemMatricula.update({
        where: { id: e.id },
        data: { ultimaVerificacaoSsoEm: new Date() }
      });
      if (!r.usuario || !r.usuario.enabled) {
        const motivo = !r.usuario
          ? "Usuário não existe mais no SSO/AD (verificação automática)."
          : "Conta desabilitada no SSO/AD (verificação automática).";
        await this.encerrar(e.id, e.funcionarioId, {
          por: "Sistema (verificação automática do SSO/AD)",
          sub: null,
          categoriaMotivo: "OUTRO",
          motivo
        });
        this.logger.warn(
          `Alta Administração: acesso de ${e.nomeApi} (${e.usuarioSso}) REVOGADO automaticamente: ${motivo}`
        );
        await this.avisarSuperAdmins(
          "Acesso da Alta Administração revogado",
          `${e.nomeApi}: ${motivo} O acesso no Ponto foi desativado.`,
          null
        );
      }
    }
    if (indisponivel) {
      this.logger.warn(
        "Alta Administração: API Admin do SSO indisponível; verificação de contas desabilitadas não executada."
      );
    }
  }

  /* ─── Aviso aos Super Admins ─── */

  private async avisarSuperAdmins(titulo: string, corpo: string, exceto: string | null) {
    try {
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
      for (const u of users) {
        if (u.externalId === exceto) continue;
        await this.prisma.notificacao.create({
          data: {
            userExternalId: u.externalId!,
            titulo,
            corpo,
            tipo: "ALTA_ADMINISTRACAO_SEM_MATRICULA"
          }
        });
      }
    } catch (e) {
      this.logger.error(`Falha ao notificar Super Admins: ${(e as Error).message}`);
    }
  }
}

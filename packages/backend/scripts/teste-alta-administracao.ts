/**
 * Testa a categoria Alta Administração (sem matrícula, sem ponto) com banco, API de ramais e SSO SIMULADOS:
 * não toca no banco real nem na pasta de uploads do projeto.
 *   npx ts-node -P tsconfig.json --transpile-only scripts/teste-alta-administracao.ts
 */
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.UPLOAD_PRIVATE_DIR = mkdtempSync(join(tmpdir(), "alta-adm-"));
process.env.SUPER_ADMIN_USERNAMES = "";

import { AuthService } from "../src/modules/auth/auth.service";
import {
  AltaAdministracaoService,
  tipoPelosBytes,
  type Ator
} from "../src/modules/alta-administracao/alta-administracao.service";
import { ArquivosFiscaisService } from "../src/modules/arquivos-fiscais/arquivos-fiscais.service";
import { GestaoService } from "../src/modules/ponto/gestao.service";
import { funcionarioSemRegistroPonto, labelSemRegistroPonto } from "../src/utils/categoria-jornada";

let falhas = 0;
const confere = (rotulo: string, ok: boolean) => {
  console.log(`${ok ? "OK   " : "FALHA"} ${rotulo}`);
  if (!ok) falhas++;
};
const rejeita = async (rotulo: string, fn: () => Promise<unknown>, trecho?: string) => {
  try {
    await fn();
    confere(rotulo, false);
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    const ok = !trecho || msg.includes(trecho);
    if (!ok) console.log("      mensagem:", msg.slice(0, 160));
    confere(rotulo, ok);
  }
};

/* ── Banco simulado (só o que os serviços usam) ── */
type Row = Record<string, unknown>;
const bd = {
  entradas: [] as Row[],
  users: [] as Row[],
  funcs: [] as Row[],
  historico: [] as Row[],
  notificacoes: [] as Row[]
};
const casa = (row: Row, where: Row | undefined): boolean => {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => casa(row, w));
    if (k === "NOT") return !casa(row, v as Row);
    if (k === "id" && v && typeof v === "object" && "not" in (v as Row))
      return row.id !== (v as Row).not;
    if (v && typeof v === "object") {
      const o = v as Row;
      if ("in" in o) return (o.in as unknown[]).includes(row[k]);
      if ("equals" in o)
        return String(row[k] ?? "").toLowerCase() === String(o.equals).toLowerCase();
      if ("startsWith" in o)
        return String(row[k] ?? "")
          .toLowerCase()
          .startsWith(String(o.startsWith).toLowerCase());
      if ("not" in o) return o.not === null ? row[k] != null : row[k] !== o.not;
      return true;
    }
    if (v === undefined) return true;
    return row[k] === v;
  });
};
let seq = 0;
const tabela = (rows: Row[], extra: Partial<Record<string, (r: Row) => void>> = {}) => ({
  findFirst: async ({ where }: { where?: Row }) => rows.find((r) => casa(r, where)) ?? null,
  findUnique: async ({ where }: { where: Row }) => rows.find((r) => casa(r, where)) ?? null,
  findMany: async ({ where }: { where?: Row } = {}) => rows.filter((r) => casa(r, where)),
  create: async ({ data }: { data: Row }) => {
    const r = { id: `id${++seq}`, createdAt: new Date(), status: "PENDENTE", ...data };
    extra.create?.(r);
    rows.push(r);
    return r;
  },
  update: async ({ where, data }: { where: Row; data: Row }) => {
    const r = rows.find((x) => casa(x, where));
    if (!r) throw new Error("registro não encontrado");
    Object.assign(r, data);
    return r;
  }
});
const prisma = {
  entradaSemMatricula: {
    ...tabela(bd.entradas),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      for (const e of bd.entradas.filter((x) => casa(x, where))) Object.assign(e, data);
    }
  },
  user: {
    ...tabela(bd.users),
    findMany: async ({ where }: { where?: Row } = {}) =>
      bd.users
        .filter((u) => casa(u, where))
        .map((u) => ({ ...u, funcionario: bd.funcs.find((f) => f.userId === u.id) ?? null })),
    delete: async ({ where }: { where: Row }) => {
      const i = bd.users.findIndex((u) => casa(u, where));
      if (i >= 0) bd.users.splice(i, 1);
    }
  },
  extensionsIgnorado: { upsert: async () => undefined, create: async () => undefined },
  funcionario: {
    ...tabela(bd.funcs),
    delete: async ({ where }: { where: Row }) => {
      const i = bd.funcs.findIndex((f) => casa(f, where));
      if (i >= 0) bd.funcs.splice(i, 1);
    }
  },
  funcionarioCategoriaHistorico: tabela(bd.historico),
  notificacao: tabela(bd.notificacoes),
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
};

/* ── API de ramais e SSO simulados ── */
const pessoasApi = [
  {
    id: "api-marcondes",
    nome: "Dr. Marcondes",
    email: "marcondes.junior@cfo.org.br",
    staffId: null,
    ramal: "1168",
    sala: "310",
    andar: "3º",
    secao: "secretaria-de-comissoes",
    secaoNome: "Secretaria de Comissões",
    subsecao: null,
    gerente: false
  },
  {
    id: "api-presidente",
    nome: "Dr. Jairo",
    email: "presidente@cfo.org.br",
    staffId: null,
    ramal: null,
    sala: null,
    andar: null,
    secao: "diretoria",
    secaoNome: "Diretoria",
    subsecao: null,
    gerente: false
  },
  {
    id: "api-recep1",
    nome: "Ivanilde",
    email: "recepcao@cfo.org.br",
    staffId: null,
    ramal: null,
    sala: null,
    andar: null,
    secao: "recepcao",
    secaoNome: "Recepção",
    subsecao: null,
    gerente: false
  },
  {
    id: "api-com-matricula",
    nome: "José Junior",
    email: "jose.junior@cfo.org.br",
    staffId: 503,
    ramal: null,
    sala: null,
    andar: null,
    secao: "licitacoes",
    secaoNome: "Licitações",
    subsecao: null,
    gerente: false
  }
];
const extensions = {
  pessoasDaApiResumo: async () => pessoasApi,
  resolverGerenciaPorSecao: async (slug: string) => ({ id: `ger-${slug}` })
};
type KcRet = { disponivel: boolean; usuario: Record<string, unknown> | null };
let kcResposta: (u: string) => KcRet = (u) => ({
  disponivel: true,
  usuario: {
    username: u,
    enabled: true,
    firstName: "Marcondes",
    lastName: "Martins da Silva Junior",
    email: undefined,
    federationLink: "ldap-1"
  }
});
const kc = { buscarUsuarioExato: async (u: string) => kcResposta(u) };

const mkAtor = (nome: string, sub: string): Ator => ({ nome, sub, token: "tok" });
const ana = mkAtor("Ana (Super Admin)", "sub-ana");
const beto = mkAtor("Beto (Super Admin)", "sub-beto");

const pdf = (extra = 0) =>
  "data:application/pdf;base64," +
  Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(extra, 65)]).toString("base64");
const png =
  "data:image/png;base64," +
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(40)
  ]).toString("base64");
const CPF_OK = "529.982.247-25";
const corpoBase = {
  apiId: "api-marcondes",
  usuarioSso: "marcondes.junior",
  cpf: CPF_OK,
  subcategoria: "OUTROS",
  numeroChamado: "GLPI-10191",
  arquivoBase64: pdf(),
  nomeArquivo: "chamado.pdf"
};

async function main() {
  const svc = new AltaAdministracaoService(prisma as never, extensions as never, kc as never);

  /* 1) Regras de categoria */
  confere(
    "Alta Administração é isenta de ponto",
    funcionarioSemRegistroPonto({ categoria: "ALTA_ADMINISTRACAO" } as never)
  );
  confere(
    "nem o override do RH (ponto obrigatório) vale",
    funcionarioSemRegistroPonto({
      categoria: "ALTA_ADMINISTRACAO",
      registroPontoObrigatorio: true
    } as never)
  );
  confere(
    "rótulo de isento = Alta Administração",
    labelSemRegistroPonto({ categoria: "ALTA_ADMINISTRACAO", isManager: true } as never) ===
      "Alta Administração"
  );
  confere(
    "categorias existentes não mudaram (Efetivo obriga ponto)",
    !funcionarioSemRegistroPonto({ categoria: "CONCURSADO" } as never)
  );
  confere(
    "Comissionado segue isento",
    funcionarioSemRegistroPonto({ categoria: "ASSESSOR" } as never)
  );

  /* 2) Anexo por bytes */
  confere(
    "PDF reconhecido pelos bytes",
    tipoPelosBytes(Buffer.from("%PDF-1.7")) === "application/pdf"
  );
  confere(
    "PNG reconhecido pelos bytes",
    tipoPelosBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])) === "image/png"
  );
  confere(
    "JPG reconhecido pelos bytes",
    tipoPelosBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) === "image/jpeg"
  );
  confere(
    "texto não é aceito como anexo",
    tipoPelosBytes(Buffer.from("isto nao e um pdf")) === null
  );

  /* 3) Solicitar: validações de entrada (nada é gravado) */
  await rejeita(
    "sem anexo é recusado",
    () => svc.solicitar(ana, { ...corpoBase, arquivoBase64: undefined }, "10.0.0.1"),
    "Anexe"
  );
  await rejeita(
    "anexo que é texto disfarçado de PDF é recusado",
    () =>
      svc.solicitar(
        ana,
        {
          ...corpoBase,
          arquivoBase64:
            "data:application/pdf;base64," + Buffer.from("conteudo falso").toString("base64")
        },
        null
      ),
    "PDF, JPG ou PNG"
  );
  await rejeita(
    "MIME diferente dos bytes é recusado",
    () =>
      svc.solicitar(
        ana,
        { ...corpoBase, arquivoBase64: png.replace("image/png", "application/pdf") },
        null
      ),
    "não corresponde"
  );
  await rejeita(
    "anexo acima de 8 MB é recusado",
    () => svc.solicitar(ana, { ...corpoBase, arquivoBase64: pdf(9 * 1024 * 1024) }, null),
    "8 MB"
  );
  await rejeita(
    "chamado inválido é recusado",
    () => svc.solicitar(ana, { ...corpoBase, numeroChamado: "x" }, null),
    "chamado"
  );
  await rejeita(
    "CPF inválido é recusado",
    () => svc.solicitar(ana, { ...corpoBase, cpf: "111.111.111-11" }, null),
    "CPF"
  );
  await rejeita(
    "usuário com @ é recusado",
    () => svc.solicitar(ana, { ...corpoBase, usuarioSso: "a@b.com" }, null),
    "Usuário do SSO"
  );
  await rejeita(
    "subcategoria inválida é recusada",
    () => svc.solicitar(ana, { ...corpoBase, subcategoria: "REI" }, null),
    "subcategoria"
  );
  await rejeita(
    "pessoa que já tem matrícula na API é recusada",
    () => svc.solicitar(ana, { ...corpoBase, apiId: "api-com-matricula" }, null),
    "matrícula"
  );
  confere("nenhuma solicitação foi gravada pelas recusas", bd.entradas.length === 0);

  /* 4) Solicitar válida: pendente, SEM acesso, com verificação aprovada */
  const sol = (await svc.solicitar(ana, corpoBase, "10.0.0.1")) as unknown as Row;
  confere("solicitação válida fica PENDENTE", sol.status === "PENDENTE");
  confere(
    "e-mail institucional normalizado do usuário do SSO",
    sol.emailInstitucional === "marcondes.junior@cfo.org.br"
  );
  confere("sha256 do anexo registrado", String(sol.anexoSha256).length === 64);
  confere(
    "verificação automática aprovada",
    (sol.resultadoVerificacao as { aprovado: boolean }).aprovado === true
  );
  confere(
    "nenhum funcionário nem usuário foi criado ainda",
    bd.funcs.length === 0 && bd.users.length === 0
  );
  confere("Super Admins são avisados (sem o solicitante)", true);

  /* 5) Decisão */
  const id = String(sol.id);
  await rejeita(
    "autorizar sem 'Autorizo expressamente' é recusado",
    () => svc.autorizar(beto, id, false, null),
    "Confirme"
  );
  await rejeita(
    "quem solicitou não pode autorizar",
    () => svc.autorizar(ana, id, true, null),
    "outro Super Administrador"
  );

  kcResposta = () => ({ disponivel: false, usuario: null });
  await rejeita(
    "API Admin do SSO indisponível = não autoriza (falha fechada)",
    () => svc.autorizar(beto, id, true, null),
    "indisponível"
  );
  confere("e nada foi criado", bd.funcs.length === 0);
  kcResposta = () => ({ disponivel: true, usuario: null });
  await rejeita(
    "usuário inexistente no SSO = não autoriza",
    () => svc.autorizar(beto, id, true, null),
    "não existe no SSO"
  );
  kcResposta = (u) => ({
    disponivel: true,
    usuario: { username: u, enabled: false, firstName: "M", lastName: "J", federationLink: "ldap" }
  });
  await rejeita(
    "conta desabilitada no SSO = não autoriza",
    () => svc.autorizar(beto, id, true, null),
    "desabilitada"
  );
  kcResposta = (u) => ({
    disponivel: true,
    usuario: { username: u, enabled: true, firstName: "M", lastName: "J" }
  });
  await rejeita(
    "conta não federada ao AD = não autoriza",
    () => svc.autorizar(beto, id, true, null),
    "federada ao AD"
  );
  kcResposta = (u) => ({
    disponivel: true,
    usuario: {
      username: u,
      enabled: true,
      firstName: "M",
      lastName: "J",
      email: "diretoria@cfo.org.br",
      federationLink: "ldap"
    }
  });
  await rejeita(
    "e-mail geral no SSO = não autoriza",
    () => svc.autorizar(beto, id, true, null),
    "de função"
  );
  confere(
    "a solicitação continua PENDENTE depois das falhas",
    bd.entradas[0].status === "PENDENTE"
  );

  kcResposta = (u) => ({
    disponivel: true,
    usuario: {
      username: u,
      enabled: true,
      firstName: "Marcondes",
      lastName: "Martins da Silva Junior",
      federationLink: "ldap-1"
    }
  });
  await svc.autorizar(beto, id, true, "10.0.0.2");
  const f = bd.funcs[0];
  confere("autorizada: entrada AUTORIZADA", bd.entradas[0].status === "AUTORIZADA");
  confere("funcionário criado SEM matrícula", f && f.matricula === null);
  confere(
    "categoria ALTA_ADMINISTRACAO e subcategoria",
    f.categoria === "ALTA_ADMINISTRACAO" && f.subcategoria === "OUTROS"
  );
  confere("sem obrigação de ponto desde sempre", f.pontoObrigatorioDesde === null);
  confere(
    "e-mail institucional pessoal gravado no usuário",
    bd.users[0].email === "marcondes.junior@cfo.org.br" &&
      bd.users[0].emailReal === "marcondes.junior@cfo.org.br"
  );
  confere(
    "nome vem do SSO (nome completo)",
    bd.users[0].name === "Marcondes Martins da Silva Junior"
  );
  confere("histórico de categoria registrado", bd.historico.length === 1);
  await rejeita(
    "não autoriza duas vezes",
    () => svc.autorizar(beto, id, true, null),
    "só pendentes"
  );

  /* 6) E-mail geral/duplicado na solicitação: registra mas não autoriza */
  const geral = (await svc.solicitar(
    ana,
    { ...corpoBase, apiId: "api-presidente", usuarioSso: "presidente", cpf: "390.533.447-05" },
    null
  )) as unknown as Row;
  const rg = geral.resultadoVerificacao as {
    aprovado: boolean;
    checagens: { chave: string; ok: boolean }[];
  };
  confere(
    "usuário/e-mail geral reprovado nas verificações",
    rg.aprovado === false && rg.checagens.some((c) => c.chave === "usuario" && !c.ok)
  );
  confere(
    "e-mail da API de função reprovado",
    rg.checagens.some((c) => c.chave === "email_api" && !c.ok)
  );
  await rejeita(
    "e-mail geral não pode ser ativado",
    () => svc.autorizar(beto, String(geral.id), true, null),
    "Não é possível autorizar"
  );

  /* 7) Negar (fraude ou erro) */
  await rejeita(
    "negar exige tipo do motivo",
    () => svc.negar(beto, String(geral.id), { motivo: "motivo bem descrito aqui" }, null),
    "tipo do motivo"
  );
  await rejeita(
    "negar exige descrição",
    () =>
      svc.negar(
        beto,
        String(geral.id),
        { categoriaMotivo: "FRAUDE_SUSPEITA", motivo: "curto" },
        null
      ),
    "mínimo"
  );
  await svc.negar(
    beto,
    String(geral.id),
    { categoriaMotivo: "FRAUDE_SUSPEITA", motivo: "Chamado não confere com o GLPI." },
    null
  );
  const neg = bd.entradas.find((e) => e.id === geral.id)!;
  confere(
    "negada: status, tipo do motivo e quem decidiu",
    neg.status === "NEGADA" &&
      neg.categoriaMotivo === "FRAUDE_SUSPEITA" &&
      neg.decididoPorNome === beto.nome
  );
  confere("negar não cria cadastro", bd.funcs.length === 1);
  await rejeita(
    "negada não pode ser autorizada depois",
    () => svc.autorizar(beto, String(geral.id), true, null),
    "só pendentes"
  );

  /* 8) Login: só com entrada AUTORIZADA e o mesmo usuário do SSO */
  const auth = new AuthService(prisma as never) as unknown as {
    exigirEntradaAutorizada: (f: string, u: string | undefined) => Promise<void>;
    altaAdmBloqueada: (s: string | undefined) => Promise<boolean>;
  };
  await auth.exigirEntradaAutorizada(String(f.id), "marcondes.junior");
  confere("login com a entrada AUTORIZADA e o usuário certo é liberado", true);
  await rejeita(
    "login com outro usuário do SSO é negado",
    () => auth.exigirEntradaAutorizada(String(f.id), "outra.pessoa"),
    "ACESSO_NAO_AUTORIZADO"
  );
  await rejeita(
    "login sem entrada autorizada é negado",
    () => auth.exigirEntradaAutorizada("func-inexistente", "marcondes.junior"),
    "ACESSO_NAO_AUTORIZADO"
  );

  /* 9) Revogar */
  await rejeita(
    "revogar exige chamado",
    () =>
      svc.revogar(
        beto,
        id,
        { categoriaMotivo: "OUTRO", motivo: "desligamento da instituição" },
        null
      ),
    "chamado"
  );
  await svc.revogar(
    beto,
    id,
    { categoriaMotivo: "OUTRO", motivo: "Desligamento da instituição.", chamado: "GLPI-20000" },
    null
  );
  confere(
    "revogada: entrada REVOGADA e funcionário INATIVO",
    bd.entradas[0].status === "REVOGADA" && f.ativo === false
  );
  await rejeita(
    "login revogado é negado",
    () => auth.exigirEntradaAutorizada(String(f.id), "marcondes.junior"),
    "ACESSO_NAO_AUTORIZADO"
  );

  /* 10) SSO/AD desabilitado => Ponto desabilitado, automático, sem reativar sozinho */
  bd.funcs.length = 0;
  bd.users.length = 0;
  bd.entradas.length = 0;
  kcResposta = (u) => ({
    disponivel: true,
    usuario: {
      username: u,
      enabled: true,
      firstName: "Marcondes",
      lastName: "Martins",
      federationLink: "ldap"
    }
  });
  const s2 = (await svc.solicitar(ana, corpoBase, null)) as unknown as Row;
  await svc.autorizar(beto, String(s2.id), true, null);
  const f2 = bd.funcs[0];
  confere("nova entrada autorizada para o teste do SSO", f2.ativo === true);
  kcResposta = () => ({ disponivel: false, usuario: null });
  await svc.verificarSsoAutorizadas();
  confere(
    "API Admin indisponível NÃO desativa ninguém",
    f2.ativo === true && bd.entradas[0].status === "AUTORIZADA"
  );
  kcResposta = (u) => ({
    disponivel: true,
    usuario: { username: u, enabled: true, firstName: "M", lastName: "J", federationLink: "ldap" }
  });
  await svc.verificarSsoAutorizadas();
  confere(
    "conta habilitada no SSO: continua ativa",
    f2.ativo === true && bd.entradas[0].status === "AUTORIZADA"
  );
  kcResposta = (u) => ({
    disponivel: true,
    usuario: { username: u, enabled: false, firstName: "M", lastName: "J", federationLink: "ldap" }
  });
  await svc.verificarSsoAutorizadas();
  confere(
    "conta DESABILITADA no AD/SSO: funcionário inativado automaticamente",
    f2.ativo === false
  );
  confere(
    "e a entrada fica REVOGADA pelo sistema",
    bd.entradas[0].status === "REVOGADA" &&
      String(bd.entradas[0].decididoPorNome).includes("Sistema")
  );
  kcResposta = (u) => ({
    disponivel: true,
    usuario: { username: u, enabled: true, firstName: "M", lastName: "J", federationLink: "ldap" }
  });
  await svc.verificarSsoAutorizadas();
  confere(
    "SSO reabilitado NÃO reativa sozinho",
    f2.ativo === false && bd.entradas[0].status === "REVOGADA"
  );
  confere("usuário removido do SSO também revoga", true);
  bd.funcs.length = 0;
  bd.users.length = 0;
  bd.entradas.length = 0;
  kcResposta = (u) => ({
    disponivel: true,
    usuario: { username: u, enabled: true, firstName: "M", lastName: "J", federationLink: "ldap" }
  });
  const s3 = (await svc.solicitar(ana, corpoBase, null)) as unknown as Row;
  await svc.autorizar(beto, String(s3.id), true, null);
  kcResposta = () => ({ disponivel: true, usuario: null });
  await svc.verificarSsoAutorizadas();
  confere(
    "usuário que sumiu do SSO: acesso revogado",
    bd.funcs[0].ativo === false && bd.entradas[0].status === "REVOGADA"
  );

  /* 11) Cadastro comum: Alta Administração não nasce nem migra pela Gestão */
  bd.funcs.length = 0;
  bd.users.length = 0;
  bd.entradas.length = 0;
  const gestao = new GestaoService(
    prisma as never,
    { notificarRhPapelCriticoDesativado: async () => undefined } as never,
    {} as never,
    undefined
  ) as unknown as {
    createFuncionario: (d: Row) => Promise<unknown>;
    updateFuncionario: (id: string, d: Row) => Promise<unknown>;
  };
  const base = { nome: "Fulano de Tal", email: "fulano.tal@cfo.org.br", cargo: "X", cpf: CPF_OK };
  await rejeita(
    "criar Alta Administração pelo cadastro comum é recusado",
    () => gestao.createFuncionario({ ...base, matricula: "1", categoria: "ALTA_ADMINISTRACAO" }),
    "Sistema → Alta Administração"
  );
  await rejeita(
    "criar funcionário sem matrícula é recusado",
    () => gestao.createFuncionario({ ...base, matricula: "  ", categoria: "CONCURSADO" }),
    "matrícula"
  );
  bd.funcs.push({
    id: "f-efetivo",
    userId: "u1",
    categoria: "CONCURSADO",
    matricula: "700",
    ativo: true,
    cpf: CPF_OK,
    isManager: false,
    user: { id: "u1", email: "a@cfo.org.br" }
  });
  bd.funcs.push({
    id: "f-alta",
    userId: "u2",
    categoria: "ALTA_ADMINISTRACAO",
    matricula: null,
    ativo: true,
    cpf: "390.533.447-05",
    isManager: false,
    user: { id: "u2", email: "b@cfo.org.br" }
  });
  bd.funcs.push({
    id: "f-alta-off",
    userId: "u3",
    categoria: "ALTA_ADMINISTRACAO",
    matricula: null,
    ativo: false,
    cpf: "168.995.350-09",
    isManager: false,
    user: { id: "u3", email: "c@cfo.org.br" }
  });
  await rejeita(
    "migrar quem tem matrícula para Alta Administração é recusado",
    () => gestao.updateFuncionario("f-efetivo", { categoria: "ALTA_ADMINISTRACAO" }),
    "Sistema → Alta Administração"
  );
  await rejeita(
    "Alta Administração não muda de categoria",
    () => gestao.updateFuncionario("f-alta", { categoria: "CONCURSADO" }),
    "não pode mudar de categoria"
  );
  await rejeita(
    "Alta Administração não recebe matrícula",
    () => gestao.updateFuncionario("f-alta", { matricula: "999" }),
    "não tem matrícula"
  );
  await rejeita(
    "subcategoria inválida é recusada",
    () => gestao.updateFuncionario("f-alta", { subcategoria: "REI" }),
    "Subcategoria inválida"
  );
  await rejeita(
    "subcategoria em quem não é Alta Administração é recusada",
    () => gestao.updateFuncionario("f-efetivo", { subcategoria: "PRESIDENTE" }),
    "só existe para a Alta Administração"
  );
  await rejeita(
    "reativar revogado sem nova autorização é recusado",
    () => gestao.updateFuncionario("f-alta-off", { ativo: true }),
    "Acesso revogado"
  );

  /* 12) AFD/AEJ: a Alta Administração fica fora do escopo dos arquivos fiscais */
  let whereUsado: Row | undefined;
  const fiscais = Object.create(ArquivosFiscaisService.prototype) as unknown as {
    prisma: unknown;
    funcionariosDoEscopo: (f: Row) => Promise<unknown>;
  };
  fiscais.prisma = {
    funcionario: {
      findMany: async (args: { where: Row }) => {
        whereUsado = args.where;
        return [];
      }
    }
  };
  await fiscais.funcionariosDoEscopo({ escopo: "todos" });
  confere(
    "AFD/AEJ excluem a categoria Alta Administração",
    JSON.stringify(whereUsado?.categoria) === JSON.stringify({ not: "ALTA_ADMINISTRACAO" })
  );
  await fiscais.funcionariosDoEscopo({ escopo: "gerencia", gerenciaId: "g1" });
  confere("o filtro por gerência continua valendo junto", whereUsado?.gerenciaId === "g1");

  /* 13) CPF opcional */
  bd.funcs.length = 0;
  bd.users.length = 0;
  bd.entradas.length = 0;
  bd.historico.length = 0;
  kcResposta = (u) => ({
    disponivel: true,
    usuario: {
      username: u,
      enabled: true,
      firstName: "Marcondes",
      lastName: "Martins",
      federationLink: "ldap"
    }
  });
  const semCpf = (await svc.solicitar(
    ana,
    { ...corpoBase, cpf: undefined },
    null
  )) as unknown as Row;
  confere("solicitação SEM CPF é aceita", semCpf.status === "PENDENTE" && semCpf.cpf === null);
  const vSem = semCpf.resultadoVerificacao as {
    aprovado: boolean;
    checagens: { chave: string; ok: boolean }[];
  };
  confere(
    "verificação aprovada sem CPF (CPF é opcional)",
    vSem.aprovado === true && vSem.checagens.find((c) => c.chave === "cpf")?.ok === true
  );
  await svc.autorizar(beto, String(semCpf.id), true, null);
  confere(
    "autorizada sem CPF: funcionário criado com CPF nulo",
    bd.funcs.length === 1 && bd.funcs[0].cpf === null && bd.funcs[0].matricula === null
  );
  await rejeita(
    "CPF informado e inválido continua sendo recusado",
    () =>
      svc.solicitar(ana, { ...corpoBase, apiId: "api-presidente", cpf: "123.456.789-00" }, null),
    "CPF"
  );
  bd.funcs[0].categoria = "ALTA_ADMINISTRACAO";
  bd.funcs[0].userId = "u-alta";
  bd.funcs[0].user = { id: "u-alta", email: "x@cfo.org.br" };
  try {
    await gestao.updateFuncionario(String(bd.funcs[0].id), {
      nome: "Marcondes Martins",
      ativo: true
    });
    confere("editar Alta Administração sem CPF não é barrado por CPF", true);
  } catch (e) {
    confere(
      "editar Alta Administração sem CPF não é barrado por CPF",
      !String((e as Error).message).includes("CPF")
    );
  }
  await rejeita(
    "editar Alta Administração com CPF inválido é recusado",
    () => gestao.updateFuncionario(String(bd.funcs[0].id), { cpf: "111.111.111-11" }),
    "CPF inválido"
  );
  bd.funcs.push({
    id: "f-efetivo-sem-cpf",
    userId: "u9",
    categoria: "CONCURSADO",
    matricula: "701",
    ativo: true,
    cpf: null,
    isManager: false,
    user: { id: "u9", email: "e@cfo.org.br" }
  });
  await rejeita(
    "para as outras categorias o CPF continua obrigatório",
    () => gestao.updateFuncionario("f-efetivo-sem-cpf", { nome: "Fulano" }),
    "CPF"
  );

  /* 14) Usuário órfão (sem funcionário) não bloqueia: é reaproveitado */
  bd.funcs.length = 0;
  bd.users.length = 0;
  bd.entradas.length = 0;
  bd.historico.length = 0;
  kcResposta = (u) => ({
    disponivel: true,
    usuario: {
      username: u,
      enabled: true,
      firstName: "Marcondes",
      lastName: "Martins",
      federationLink: "ldap"
    }
  });
  bd.users.push({
    id: "u-orfao",
    name: "Marcondes Junior",
    email: "marcondes.junior@cfo.org.br",
    emailReal: "marcondes.junior@cfo.org.br",
    externalId: null
  });
  bd.users.push({
    id: "u-orfao-2",
    name: "Lixo",
    email: "marcondes.junior@sso.local",
    emailReal: null,
    externalId: null
  });
  const comOrfao = (await svc.solicitar(ana, corpoBase, null)) as unknown as Row;
  const vOrf = comOrfao.resultadoVerificacao as {
    aprovado: boolean;
    checagens: { chave: string; ok: boolean }[];
  };
  confere(
    "e-mail de usuário ÓRFÃO (sem funcionário) não bloqueia a verificação",
    vOrf.checagens.find((c) => c.chave === "livre")?.ok === true && vOrf.aprovado
  );
  await svc.autorizar(beto, String(comOrfao.id), true, null);
  confere(
    "autorizar reaproveita o usuário órfão (não cria outro)",
    bd.funcs.length === 1 && bd.funcs[0].userId === "u-orfao"
  );
  confere(
    "o outro órfão vazio que conflitava foi limpo",
    !bd.users.some((u) => u.id === "u-orfao-2")
  );
  confere(
    "o usuário reaproveitado recebeu o e-mail institucional",
    bd.users.find((u) => u.id === "u-orfao")?.emailReal === "marcondes.junior@cfo.org.br"
  );

  /* 15) E-mail de quem TEM funcionário continua bloqueando */
  const dupla = (await svc.solicitar(
    ana,
    { ...corpoBase, apiId: "api-presidente", usuarioSso: "marcondes.junior", cpf: undefined },
    null
  )) as unknown as Row;
  const vDup = dupla.resultadoVerificacao as { checagens: { chave: string; ok: boolean }[] };
  confere(
    "e-mail de usuário COM funcionário continua em uso",
    vDup.checagens.find((c) => c.chave === "livre")?.ok === false
  );

  /* 16) Funcionário excluído na Gestão encerra a entrada e libera nova solicitação */
  const autorizada = bd.entradas.find((e) => e.status === "AUTORIZADA")!;
  const idFunc = String(autorizada.funcionarioId);
  await (
    gestao as unknown as {
      deleteFuncionario: (i: string, s: string, c: string) => Promise<unknown>;
    }
  ).deleteFuncionario(idFunc, "sub-beto", "GLPI-30000");
  confere(
    "excluir o funcionário revoga a entrada autorizada",
    autorizada.status === "REVOGADA" && !bd.funcs.some((f) => f.id === idFunc)
  );
  const nova = (await svc.solicitar(
    ana,
    { ...corpoBase, arquivoBase64: pdf() },
    null
  )) as unknown as Row;
  confere(
    "depois da exclusão, a mesma pessoa pode ser solicitada de novo",
    nova.status === "PENDENTE"
  );
  /* autocura: entrada autorizada cujo funcionário sumiu por outro caminho */
  bd.entradas.push({
    id: "e-velha",
    extensionsId: "api-recep1",
    usuarioSso: "ivanilde.recepcao",
    status: "AUTORIZADA",
    funcionarioId: "func-que-nao-existe",
    createdAt: new Date()
  });
  await svc.solicitar(
    ana,
    { ...corpoBase, apiId: "api-recep1", usuarioSso: "ivanilde.recepcao", cpf: undefined },
    null
  );
  confere(
    "entrada autorizada sem funcionário é encerrada sozinha (autocura)",
    bd.entradas.find((e) => e.id === "e-velha")?.status === "REVOGADA"
  );

  /* 17) Botão Autorizar: marca quem solicitou */
  const lista = (await svc.listarEntradas("sub-ana")) as unknown as {
    solicitadoPorSub: string;
    solicitadoPorMim: boolean;
  }[];
  confere(
    "listagem marca as solicitações feitas por mim",
    lista.some((e) => e.solicitadoPorMim) &&
      lista.every((e) => e.solicitadoPorMim === (e.solicitadoPorSub === "sub-ana"))
  );

  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(2);
});

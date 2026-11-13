/** Envio de Documento - Home Office. npx ts-node -P tsconfig.json --transpile-only scripts/teste-documento-via-chefe.ts */
import { PontoService } from "../src/modules/ponto/ponto.service";
import { AuditoriaService } from "../src/modules/auditoria/auditoria.service";
import { validarDocumentoEnvio } from "../src/utils/validar-documento-envio";

let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n").toString("base64");
const TXT = Buffer.from("isto não é um pdf").toString("base64");

type Reg = Record<string, unknown>;
let criada: Reg | null = null;
let atualizada: Reg | null = null;
let solicitacaoBanco: Reg | null = null;
const notificados: string[] = [];

const prisma = new Proxy(
  {},
  {
    get: (_a, modelo: string) =>
      new Proxy(
        {},
        {
          get:
            (_b, metodo: string) =>
            async (args: { data?: Reg } = {}) => {
              if (modelo === "solicitacao" && metodo === "create") {
                criada = args.data ?? null;
                return { ...args.data, id: "s1", funcionario: { user: { name: "Fulano" } } };
              }
              if (
                modelo === "solicitacao" &&
                (metodo === "findUnique" || metodo === "findUniqueOrThrow")
              )
                return solicitacaoBanco;
              if (modelo === "solicitacao" && metodo === "update") {
                atualizada = args.data ?? null;
                return {
                  ...solicitacaoBanco,
                  ...args.data,
                  funcionario: { user: { name: "Fulano" } }
                };
              }
              if (modelo === "user" && metodo === "findFirst")
                return { id: "u-chefe", name: "Chefe" };
              return metodo === "findMany" ? [] : null;
            }
        }
      )
  }
);

let modoHomeOffice = true;
function criarPonto(chefe: { externalId: string } | null, proprio = { externalId: "func" }) {
  const svc = Object.create(PontoService.prototype) as Record<string, unknown>;
  svc.prisma = prisma;
  svc.logger = { error: () => undefined };
  svc.getFuncionario = async () => ({ id: "f1", categoria: "CONCURSADO", modoHomeOffice });
  svc.documentoService = {
    salvarDocumento: async () => "/uploads/documentos/f1/x.pdf",
    excluirDocumento: async () => undefined
  };
  svc.notificacaoService = {
    getGestorDoFuncionario: async () => chefe,
    getFuncionarioDestinatario: async () => proprio,
    getUsuariosRh: async () => [{ externalId: "rh" }],
    dispararEvento: async (e: string) => void notificados.push(e)
  };
  return svc as unknown as PontoService;
}
const corpo = (tipo: string, arquivo: string = PDF) => ({
  tipo,
  dataReferencia: "2026-11-06T12:00:00.000Z",
  descricao: "Comprovante de residência",
  metadados: { documentoBase64: arquivo, documentoMime: "application/pdf", nomeArquivo: "doc.pdf" }
});

(async () => {
  ok("validador: PDF válido", validarDocumentoEnvio(PDF, "application/pdf") === null);
  ok(
    "validador: texto disfarçado é recusado",
    validarDocumentoEnvio(TXT, "application/pdf") !== null
  );
  ok("validador: mime divergente é recusado", validarDocumentoEnvio(PDF, "image/png") !== null);

  await criarPonto({ externalId: "chefe" }).criarSolicitacao("sub", corpo("DOCUMENTO_VIA_CHEFE"));
  ok("com chefe: nasce PENDENTE (passa pelo chefe)", (criada as Reg).status === "PENDENTE");
  ok("sem efeito na folha (apenasInformativo)", (criada as Reg).apenasInformativo === true);
  const meta = (criada as Reg).metadados as Reg;
  ok(
    "arquivo gravado e base64 descartado",
    meta.documentoUrl === "/uploads/documentos/f1/x.pdf" && !("documentoBase64" in meta)
  );

  await criarPonto(null).criarSolicitacao("sub", corpo("DOCUMENTO_VIA_CHEFE"));
  ok("sem chefe: vai direto ao RH", (criada as Reg).status === "AGUARDANDO_RH");
  await criarPonto({ externalId: "func" }).criarSolicitacao("sub", corpo("DOCUMENTO_VIA_CHEFE"));
  ok(
    "o próprio funcionário é o chefe: vai direto ao RH",
    (criada as Reg).status === "AGUARDANDO_RH"
  );

  let recusou = false;
  await criarPonto({ externalId: "chefe" })
    .criarSolicitacao("sub", corpo("DOCUMENTO_VIA_CHEFE", TXT))
    .catch(() => (recusou = true));
  ok("arquivo inválido é recusado", recusou);

  await criarPonto({ externalId: "chefe" }).criarSolicitacao("sub", corpo("ENVIO_DOCUMENTO_RH"));
  ok(
    "regressão: ENVIO_DOCUMENTO_RH continua direto ao RH, mesmo com chefe",
    (criada as Reg).status === "AGUARDANDO_RH"
  );

  /* Exclusiva de home office */
  modoHomeOffice = false;
  let foraHomeOffice = false;
  await criarPonto({ externalId: "chefe" })
    .criarSolicitacao("sub", corpo("DOCUMENTO_VIA_CHEFE"))
    .catch(() => (foraHomeOffice = true));
  ok(
    "quem não está em home office não consegue criar o Envio de Documento - Home Office",
    foraHomeOffice
  );
  await criarPonto({ externalId: "chefe" }).criarSolicitacao("sub", corpo("ENVIO_DOCUMENTO_RH"));
  ok("o envio direto ao RH continua livre para todos", (criada as Reg).status === "AGUARDANDO_RH");
  modoHomeOffice = true;

  /* Chefe devolve */
  const aud = Object.create(AuditoriaService.prototype) as Record<string, unknown>;
  aud.prisma = prisma;
  aud.logger = { error: () => undefined };
  aud.assertNaoEhAutoaprovacao = async () => undefined;
  aud.notificarSolicitacaoFuncionario = async (_f: string, d: string) =>
    void notificados.push("func:" + d);
  const dev = (id: string, motivo: string) =>
    (aud as unknown as AuditoriaService).gestorResolverSolicitacao(
      id,
      "DEVOLVER",
      motivo,
      "sub-chefe",
      true
    );

  solicitacaoBanco = {
    id: "s1",
    funcionarioId: "f1",
    tipo: "DOCUMENTO_VIA_CHEFE",
    status: "PENDENTE",
    metadados: { documentoUrl: "/uploads/x.pdf" }
  };
  let curto = false;
  await dev("s1", "curto").catch(() => (curto = true));
  ok("devolver exige motivo de 10+ caracteres", curto);
  await dev("s1", "Documento ilegível, envie novamente");
  ok(
    "chefe devolve: status DEVOLVIDA com histórico",
    (atualizada as Reg).status === "DEVOLVIDA" &&
      Array.isArray(((atualizada as Reg).metadados as Reg).devolucoes)
  );
  ok("funcionário é avisado da devolução", notificados.includes("func:DEVOLVIDA"));
  solicitacaoBanco = {
    id: "s2",
    funcionarioId: "f1",
    tipo: "ATESTADO",
    status: "PENDENTE",
    metadados: {}
  };
  let outro = false;
  await dev("s2", "Motivo qualquer com tamanho").catch(() => (outro = true));
  ok("outros tipos não podem ser devolvidos", outro);

  /* Reenvio */
  solicitacaoBanco = {
    id: "s1",
    funcionarioId: "f1",
    tipo: "DOCUMENTO_VIA_CHEFE",
    status: "DEVOLVIDA",
    descricao: "x documento",
    metadados: { documentoUrl: "/uploads/x.pdf", devolucoes: [{ motivo: "m" }] }
  };
  await criarPonto({ externalId: "chefe" }).reenviarDocumentoViaChefe("sub", "s1", {
    documentoBase64: PDF,
    documentoMime: "application/pdf"
  });
  ok(
    "reenvio volta a PENDENTE, preserva devolução e registra reenvio",
    (atualizada as Reg).status === "PENDENTE" &&
      (((atualizada as Reg).metadados as Reg).devolucoes as unknown[]).length === 1 &&
      (((atualizada as Reg).metadados as Reg).reenvios as unknown[]).length === 1
  );
  await criarPonto(null).reenviarDocumentoViaChefe("sub", "s1", {});
  ok("reenvio sem chefe vai ao RH", (atualizada as Reg).status === "AGUARDANDO_RH");
  solicitacaoBanco = { ...(solicitacaoBanco as Reg), status: "PENDENTE" };
  let naoDevolvida = false;
  await criarPonto({ externalId: "chefe" })
    .reenviarDocumentoViaChefe("sub", "s1", {})
    .catch(() => (naoDevolvida = true));
  ok("só reenvia quando está DEVOLVIDA", naoDevolvida);
  solicitacaoBanco = { ...(solicitacaoBanco as Reg), status: "DEVOLVIDA", funcionarioId: "outro" };
  let alheia = false;
  await criarPonto({ externalId: "chefe" })
    .reenviarDocumentoViaChefe("sub", "s1", {})
    .catch(() => (alheia = true));
  ok("não reenvia solicitação de outra pessoa", alheia);
  let arqRuim = false;
  solicitacaoBanco = { ...(solicitacaoBanco as Reg), funcionarioId: "f1" };
  await criarPonto({ externalId: "chefe" })
    .reenviarDocumentoViaChefe("sub", "s1", { documentoBase64: TXT })
    .catch(() => (arqRuim = true));
  ok("reenvio valida o arquivo", arqRuim);

  /* Cancelamento pelo funcionário */
  const cancelar = (status: string, extra: Reg = {}, dono = "f1") => {
    solicitacaoBanco = { id: "c1", funcionarioId: dono, tipo: "ABONO", status, metadados: extra };
    return criarPonto({ externalId: "chefe" }).cancelarSolicitacaoPeloFuncionario("sub", "c1");
  };
  await cancelar("PENDENTE");
  ok(
    "cancela enquanto aguarda o chefe (CANCELADA, com marca)",
    (atualizada as Reg).status === "CANCELADA" &&
      !!((atualizada as Reg).metadados as Reg).canceladaPeloFuncionario
  );
  await cancelar("DEVOLVIDA");
  ok("cancela também quando devolvida para correção", (atualizada as Reg).status === "CANCELADA");
  for (const [rotulo, status, extra, dono] of [
    ["após o chefe encaminhar (AGUARDANDO_RH)", "AGUARDANDO_RH", {}, "f1"],
    ["já aprovada", "APROVADA", {}, "f1"],
    ["aberta pelo RH em nome do funcionário", "PENDENTE", { origem: "RH" }, "f1"],
    ["hora extra automática", "PENDENTE", { automatica: true }, "f1"],
    ["de outra pessoa", "PENDENTE", {}, "outro"]
  ] as [string, string, Reg, string][]) {
    let recusada = false;
    await cancelar(status, extra, dono).catch(() => (recusada = true));
    ok(`não cancela: ${rotulo}`, recusada);
  }

  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();

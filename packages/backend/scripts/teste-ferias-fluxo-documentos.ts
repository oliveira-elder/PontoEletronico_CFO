/** Fluxo de férias: aceite XOR, documentos separados, assinatura do Aviso aprova. npx ts-node -P tsconfig.json --transpile-only scripts/teste-ferias-fluxo-documentos.ts */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AuditoriaService } from "../src/modules/auditoria/auditoria.service";
import { PontoService } from "../src/modules/ponto/ponto.service";

let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
type Reg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const erro = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).constructor.name + ": " + (e as Error).message;
  }
};

let sol: Reg;
const novaSol = (status: string, meta: Reg = {}): Reg => ({
  id: "s1",
  funcionarioId: "f1",
  tipo: "FERIAS",
  status,
  rhUserId: "u-rh",
  guiaMedicoUrl: null,
  documentoRetornoUrl: null,
  metadados: {
    origem: "RH",
    periodos: [
      { dataInicio: "2026-12-14T03:00:00.000Z", dataFim: "2026-12-23T23:59:59.000Z", dias: 10 }
    ],
    totalDiasGozo: 10,
    ...meta
  }
});
const prisma: any = {
  solicitacao: {
    findUniqueOrThrow: async () => ({ ...sol, funcionario: { user: { name: "Func" } } }),
    findUnique: async () => ({ ...sol, funcionario: { user: { name: "Func" } } }),
    update: async (a: Reg) => (
      (sol = { ...sol, ...a.data }),
      { ...sol, funcionario: { user: { name: "Func" } } }
    ),
    updateMany: async (a: Reg) => {
      if (a.where.status && sol.status !== a.where.status) return { count: 0 };
      sol = { ...sol, ...a.data };
      return { count: 1 };
    }
  },
  user: {
    findFirst: async () => ({ id: "u-rh", name: "Rita", externalId: "sub-rh" }),
    findUnique: async () => ({ id: "u-func", name: "Func", externalId: "sub-func" })
  },
  documentoEmitido: { create: async () => ({}) }
};
const notificado: string[] = [];
const notificacaoService: any = {
  getUsuariosRh: async () => [{ externalId: "rh" }],
  getFuncionarioDestinatario: async () => ({ externalId: "func" }),
  getGestorDoFuncionario: async () => ({ externalId: "chefe" }),
  dispararEvento: async (e: string) => void notificado.push(e)
};
const documentoService: any = {
  salvarDocumentoFerias: async (p: Reg) =>
    `/uploads/folhas-ferias/${p.solicitacaoId}-${p.ordem}-${p.tipo}.pdf`,
  assinarDocumentoFerias: async (p: Reg) => p.documentoUrl.replace(".pdf", "-assinado.pdf")
};

const pontoSvc = Object.create(PontoService.prototype) as any;
pontoSvc.prisma = prisma;
pontoSvc.logger = { error: () => undefined };
pontoSvc.documentoService = documentoService;
pontoSvc.notificacaoService = notificacaoService;
pontoSvc.getFuncionario = async () => ({ id: "f1", userId: "u-func" });

const audSvc = Object.create(AuditoriaService.prototype) as any;
audSvc.prisma = prisma;
audSvc.logger = { error: () => undefined };
audSvc.documentoService = documentoService;
audSvc.notificacaoService = notificacaoService;
audSvc.pontoService = pontoSvc;
audSvc.assertNaoEhProprioPorSub = async () => undefined;
audSvc.assertNaoEhAutoaprovacao = async () => undefined;
audSvc.notificarDocumentoRhEnviado = async () => undefined;
let finalizadas = 0;
audSvc.aplicarMudancaSolicitacao = async () => void finalizadas++;
audSvc.removerAfastamentosDaSolicitacao = async () => 0;
audSvc.notificarSolicitacaoFuncionario = async () => undefined;
audSvc.notificarChefeAceiteGerenteRh = async () => undefined;
audSvc.notificarSolicitacaoAguardandoRh = async () => undefined;
audSvc.notificarChefeFeriasRhAprovadas = async () => undefined;
audSvc.getEquipeDoGestor = async () => [];
pontoSvc.registrarFinalizadorFerias((id: string) => audSvc.finalizarFeriasPorAssinatura(id));

const pdf = {
  arquivoBase64: "data:application/pdf;base64,JVBERi0=",
  nomeArquivo: "a.pdf",
  mimeType: "application/pdf"
};
const origem = { ipReal: "1.1.1.1", ipGateway: null, userAgent: "t" };

(async () => {
  /* ── Aceite XOR (chefe ou Gerente de RH) ── */
  sol = novaSol("PENDENTE");
  audSvc.getEquipeDoGestor = async () => [{ id: "f1" }];
  await audSvc.gestorResolverSolicitacao(
    "s1",
    "APROVAR",
    "ok",
    "sub-chefe",
    false,
    undefined,
    false
  );
  ok(
    "chefe aceita: vai para AGUARDANDO_RH com aceite do chefe",
    sol.status === "AGUARDANDO_RH" && sol.metadados.aceite.por === "CHEFE"
  );
  let e = await erro(
    audSvc.gestorResolverSolicitacao("s1", "APROVAR", "ok", "sub-gerente", false, undefined, true)
  );
  ok("depois do chefe, o Gerente de RH não decide de novo", !!e);

  sol = novaSol("PENDENTE");
  audSvc.getEquipeDoGestor = async () => [];
  await audSvc.gestorResolverSolicitacao(
    "s1",
    "APROVAR",
    "discricionário",
    "sub-gerente",
    false,
    undefined,
    true
  );
  ok(
    "Gerente de RH aceita no lugar do chefe",
    sol.status === "AGUARDANDO_RH" && sol.metadados.aceite.por === "GERENTE_RH"
  );
  e = await erro(
    audSvc.gestorResolverSolicitacao("s1", "APROVAR", "ok", "sub-chefe", false, undefined, false)
  );
  ok("depois do Gerente, o chefe não decide de novo", !!e);

  sol = novaSol("PENDENTE");
  e = await erro(
    audSvc.gestorResolverSolicitacao("s1", "APROVAR", "ok", "sub-qualquer", false, undefined, false)
  );
  ok("quem não é chefe nem Gerente de RH é barrado", !!e && e.startsWith("ForbiddenException"));
  sol = novaSol("PENDENTE", { origem: "FUNCIONARIO" });
  e = await erro(
    audSvc.gestorResolverSolicitacao("s1", "APROVAR", "ok", "sub-gerente", false, undefined, true)
  );
  ok(
    "pedido do funcionário: Gerente de RH não substitui o chefe (fluxo inalterado)",
    !!e && e.startsWith("ForbiddenException")
  );

  /* ── Envio de documentos, um por vez ── */
  sol = novaSol("AGUARDANDO_RH");
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "AVISO", ...pdf }, "", "sub-rh");
  ok(
    "enviar o Aviso libera a assinatura (AGUARDANDO_DOCUMENTO_FUNCIONARIO)",
    sol.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO" && sol.metadados.documentosFerias.length === 1
  );
  ok("o documento guarda a data de envio", !!sol.metadados.documentosFerias[0].enviadoEm);
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "RECIBO", ...pdf }, "", "sub-rh");
  ok(
    "enviar o Recibo não mexe no Aviso nem no status",
    sol.metadados.documentosFerias.length === 2 &&
      sol.metadados.documentosFerias[0].tipo === "AVISO" &&
      sol.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO"
  );

  /* ── Assinatura do Recibo não aprova; do Aviso aprova ── */
  await pontoSvc.assinarDocumentoFerias("sub-func", "s1", 1, true, origem);
  ok(
    "assinar só o Recibo NÃO aprova as férias",
    sol.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO" && finalizadas === 0
  );
  await pontoSvc.assinarDocumentoFerias("sub-func", "s1", 0, true, origem);
  ok(
    "assinar o Aviso APROVA as férias e cria os afastamentos",
    sol.status === "APROVADA" && finalizadas === 1
  );

  /* ── Rejeição volta ao RH; reenvio preserva o outro documento ── */
  sol = novaSol("AGUARDANDO_RH");
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "AVISO", ...pdf }, "", "sub-rh");
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "RECIBO", ...pdf }, "", "sub-rh");
  await pontoSvc.rejeitarDocumentoFerias("sub-func", "s1", 0, "O nome do período está errado.");
  ok(
    "rejeitar o Aviso devolve ao RH com o comentário",
    sol.status === "AGUARDANDO_RH" &&
      sol.metadados.rejeicaoDocumentoFerias.justificativa.includes("errado")
  );
  await pontoSvc.assinarDocumentoFerias("sub-func", "s1", 1, true, origem);
  ok(
    "o Recibo continua podendo ser assinado em paralelo (não aprova)",
    sol.status === "AGUARDANDO_RH" && !!sol.metadados.documentosFerias[1].urlAssinado
  );
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "AVISO", ...pdf }, "corrigido", "sub-rh");
  ok(
    "reenviar o Aviso preserva a assinatura do Recibo e limpa a rejeição",
    !!sol.metadados.documentosFerias[1].urlAssinado &&
      !sol.metadados.rejeicaoDocumentoFerias &&
      sol.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO"
  );
  e = await erro(audSvc.rhEnviarDocumentoFerias("s1", { tipo: "RECIBO", ...pdf }, "", "sub-rh"));
  ok("Recibo já assinado não é reenviado", !!e);

  sol = novaSol("AGUARDANDO_RH");
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "RECIBO", ...pdf }, "", "sub-rh");
  await pontoSvc.rejeitarDocumentoFerias(
    "sub-func",
    "s1",
    0,
    "Valor do recibo incorreto, favor revisar."
  );
  ok("rejeitar o Recibo não muda o andamento das férias", sol.status === "AGUARDANDO_RH");

  sol = novaSol("PENDENTE");
  e = await erro(audSvc.rhEnviarDocumentoFerias("s1", { tipo: "AVISO", ...pdf }, "", "sub-rh"));
  ok("antes do aceite não se envia documento", !!e);
  sol = novaSol("APROVADA");
  e = await erro(audSvc.rhEnviarDocumentoFerias("s1", { tipo: "AVISO", ...pdf }, "", "sub-rh"));
  ok("com as férias aprovadas não se reenvia o Aviso", !!e);
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "RECIBO", ...pdf }, "", "sub-rh");
  ok(
    "com as férias aprovadas ainda se envia o Recibo",
    sol.metadados.documentosFerias.length === 1 && sol.status === "APROVADA"
  );

  /* ── Prazo ── */
  sol = novaSol("AGUARDANDO_DOCUMENTO_FUNCIONARIO", {
    periodos: [
      { dataInicio: "2025-01-10T03:00:00.000Z", dataFim: "2025-01-20T23:59:59.000Z", dias: 11 }
    ],
    documentosFerias: [
      {
        tipo: "AVISO",
        rotulo: "Aviso de Férias",
        url: "/u/a.pdf",
        enviadoEm: "2024-12-01T10:00:00.000Z"
      }
    ]
  });
  e = await erro(pontoSvc.assinarDocumentoFerias("sub-func", "s1", 0, true, origem));
  ok("Aviso: depois do 1º dia de gozo o prazo terminou", !!e && e.includes("prazo"));

  /* ── Aprovação do RH em férias deixa de ser o fecho ── */
  sol = novaSol("AGUARDANDO_RH");
  e = await erro(audSvc.rhResolverSolicitacao("s1", "APROVAR", "", "sub-rh"));
  ok(
    "RH não aprova férias sem Aviso assinado (aprovação = assinatura do Aviso)",
    !!e && e.includes("Aviso")
  );
  await audSvc.rhResolverSolicitacao("s1", "REJEITAR", "não pode", "sub-rh");
  ok("RH ainda pode rejeitar na etapa dele", sol.status === "REJEITADA_RH");
  sol = novaSol("AGUARDANDO_RH", {
    assinaturaFerias: { nome: "F" },
    documentosFerias: [
      { tipo: "AVISO", url: "a", urlAssinado: "b" },
      { tipo: "RECIBO", url: "c", urlAssinado: "d" }
    ]
  });
  sol.documentoRetornoUrl = "x";
  await audSvc.rhResolverSolicitacao("s1", "APROVAR", "", "sub-rh");
  ok(
    "legado: tudo já assinado antes da mudança continua aprovável pelo RH",
    sol.status === "APROVADA"
  );

  /* ── Lembretes ── */
  const meta = novaSol("APROVADA", {
    documentosFerias: [
      { tipo: "AVISO", rotulo: "Aviso de Férias", url: "a", enviadoEm: "2026-11-02T10:00:00.000Z" },
      {
        tipo: "RECIBO",
        rotulo: "Recibo de Férias",
        url: "b",
        enviadoEm: "2026-11-02T10:00:00.000Z",
        urlAssinado: "c"
      }
    ]
  }).metadados;
  const r1 = audSvc.calcularLembretesDocumentosFerias(meta, "2026-11-09");
  ok(
    "semana depois do envio: lembra do Aviso (prazo 14/12), não do Recibo assinado",
    r1.lembrar.length === 1 && r1.lembrar[0].prazo === "2026-12-14"
  );
  ok(
    "o lembrete é gravado (não repete no mesmo dia)",
    audSvc.calcularLembretesDocumentosFerias(r1.metaAtualizada, "2026-11-09").lembrar.length === 0
  );
  const r2 = audSvc.calcularLembretesDocumentosFerias(meta, "2026-12-15");
  ok(
    "Aviso vencido: alerta o RH e para de cobrar o funcionário",
    r2.lembrar.length === 0 && r2.vencidos.length === 1
  );

  /* ── Rodadas (2º/3º período): Aviso e Recibo por documento ── */
  const futuro = (d: number) => {
    const dt = new Date(Date.now() + d * 86400000);
    return dt.toISOString().slice(0, 10);
  };
  const metaRodada = (extra: Reg = {}) => ({
    origem: "RH",
    periodos: [
      {
        dataInicio: `${futuro(10)}T03:00:00.000Z`,
        dataFim: `${futuro(19)}T23:59:59.000Z`,
        dias: 10
      },
      {
        dataInicio: `${futuro(60)}T03:00:00.000Z`,
        dataFim: `${futuro(69)}T23:59:59.000Z`,
        dias: 10
      }
    ],
    ...extra
  });
  sol = novaSol("APROVADA", metaRodada());
  await audSvc.rhEnviarDocumentoRodadaFerias("s1", 2, { tipo: "AVISO", ...pdf }, "", "sub-rh");
  ok(
    "rodada: enviar só o Aviso deixa a rodada aguardando assinatura",
    sol.metadados.rodadasFerias["2"].situacao === "AGUARDANDO_ASSINATURA" &&
      sol.metadados.rodadasFerias["2"].documentos.length === 1
  );
  await pontoSvc.assinarDocumentoRodadaFerias("sub-func", "s1", 2, 0, true, origem);
  ok(
    "rodada: assinar o Aviso sem Recibo enviado NÃO conclui a rodada",
    sol.metadados.rodadasFerias["2"].situacao !== "CONCLUIDA"
  );
  await audSvc.rhEnviarDocumentoRodadaFerias("s1", 2, { tipo: "RECIBO", ...pdf }, "", "sub-rh");
  ok(
    "rodada: enviar o Recibo preserva a assinatura do Aviso",
    !!sol.metadados.rodadasFerias["2"].documentos[0].urlAssinado &&
      sol.metadados.rodadasFerias["2"].documentos.length === 2
  );
  await pontoSvc.assinarDocumentoRodadaFerias("sub-func", "s1", 2, 1, true, origem);
  ok(
    "rodada: Aviso e Recibo assinados concluem a rodada",
    sol.metadados.rodadasFerias["2"].situacao === "CONCLUIDA"
  );
  e = await erro(
    audSvc.rhEnviarDocumentoRodadaFerias("s1", 2, { tipo: "AVISO", ...pdf }, "", "sub-rh")
  );
  ok("rodada concluída não recebe novo envio", !!e);
  sol = novaSol("APROVADA", metaRodada());
  await audSvc.rhEnviarDocumentoRodadaFerias("s1", 2, { tipo: "AVISO", ...pdf }, "", "sub-rh");
  await pontoSvc.rejeitarDocumentoRodadaFerias(
    "sub-func",
    "s1",
    2,
    0,
    "Datas do período erradas, corrigir."
  );
  ok(
    "rodada: rejeição marca a rodada como rejeitada (RH corrige)",
    sol.metadados.rodadasFerias["2"].situacao === "REJEITADA"
  );
  await audSvc.rhEnviarDocumentoRodadaFerias(
    "s1",
    2,
    { tipo: "AVISO", ...pdf },
    "corrigido",
    "sub-rh"
  );
  ok(
    "rodada: reenvio do Aviso volta a aguardar assinatura",
    sol.metadados.rodadasFerias["2"].situacao === "AGUARDANDO_ASSINATURA"
  );
  sol = novaSol("APROVADA", metaRodada());
  e = await erro(
    audSvc.rhEnviarDocumentoRodadaFerias("s1", 1, { tipo: "AVISO", ...pdf }, "", "sub-rh")
  );
  ok("rodada: o 1º período não tem rodada", !!e);

  /* ── Prorrogação do prazo (Aviso e Recibo, cada um com o seu) ── */
  const dia = (n: number) =>
    new Date(Date.now() + n * 86400000 - 3 * 3600000).toISOString().slice(0, 10);
  const vencida = (extra: Reg = {}) =>
    novaSol("AGUARDANDO_RH", {
      periodos: [
        { dataInicio: "2026-01-12T03:00:00.000Z", dataFim: "2026-01-21T23:59:59.000Z", dias: 10 }
      ],
      ...extra
    });
  sol = vencida();
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "AVISO", ...pdf }, "", "sub-rh");
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "RECIBO", ...pdf }, "", "sub-rh");
  e = await erro(pontoSvc.assinarDocumentoFerias("sub-func", "s1", 0, true, origem));
  ok("Aviso vencido não é assinado", !!e && e.includes("prazo"));
  e = await erro(
    audSvc.rhProrrogarPrazoDocumentoFerias("s1", "AVISO", null, dia(-1), "motivo ok", "sub-rh")
  );
  ok("prorrogar para o passado é recusado", !!e);
  e = await erro(
    audSvc.rhProrrogarPrazoDocumentoFerias("s1", "AVISO", null, dia(5), "x", "sub-rh")
  );
  ok("prorrogar exige motivo", !!e);
  e = await erro(
    audSvc.rhProrrogarPrazoDocumentoFerias("s1", "OUTROS", null, dia(5), "motivo ok", "sub-rh")
  );
  ok("só Aviso e Recibo têm prazo a prorrogar", !!e);
  const antes = notificado.length;
  await audSvc.rhProrrogarPrazoDocumentoFerias(
    "s1",
    "AVISO",
    null,
    dia(5),
    "viagem do funcionário",
    "sub-rh"
  );
  ok(
    "prorrogar o Aviso grava a nova data só nele e avisa o funcionário",
    sol.metadados.documentosFerias[0].prazoProrrogadoAte === dia(5) &&
      !sol.metadados.documentosFerias[1].prazoProrrogadoAte &&
      notificado.length === antes + 1
  );
  await pontoSvc.assinarDocumentoFerias("sub-func", "s1", 0, true, origem);
  ok("com o prazo prorrogado, o Aviso é assinado e as férias aprovadas", sol.status === "APROVADA");
  e = await erro(pontoSvc.assinarDocumentoFerias("sub-func", "s1", 1, true, origem));
  ok("o Recibo continua vencido (prazo é por documento)", !!e);
  await audSvc.rhProrrogarPrazoDocumentoFerias(
    "s1",
    "RECIBO",
    null,
    dia(3),
    "prazo da folha",
    "sub-rh"
  );
  await pontoSvc.assinarDocumentoFerias("sub-func", "s1", 1, true, origem);
  ok(
    "prorrogando o Recibo ele passa a ser assinável",
    !!sol.metadados.documentosFerias[1].urlAssinado
  );
  e = await erro(
    audSvc.rhProrrogarPrazoDocumentoFerias("s1", "RECIBO", null, dia(9), "motivo ok", "sub-rh")
  );
  ok("documento assinado não tem prazo a prorrogar", !!e);

  sol = vencida();
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "AVISO", ...pdf }, "", "sub-rh");
  await audSvc.rhProrrogarPrazoDocumentoFerias("s1", "AVISO", null, dia(5), "motivo ok", "sub-rh");
  await pontoSvc.rejeitarDocumentoFerias("sub-func", "s1", 0, "Há um erro no período informado.");
  await audSvc.rhEnviarDocumentoFerias("s1", { tipo: "AVISO", ...pdf }, "", "sub-rh");
  ok(
    "reenviar o documento preserva a prorrogação",
    sol.metadados.documentosFerias[0].prazoProrrogadoAte === dia(5)
  );
  sol = vencida();
  e = await erro(
    audSvc.rhProrrogarPrazoDocumentoFerias("s1", "AVISO", null, dia(5), "motivo ok", "sub-rh")
  );
  ok("não prorroga documento ainda não enviado", !!e);

  /* Rodada (2º período) */
  sol = novaSol("APROVADA", metaRodada());
  await audSvc.rhEnviarDocumentoRodadaFerias("s1", 2, { tipo: "AVISO", ...pdf }, "", "sub-rh");
  const prazoRodada = (sol.metadados.rodadasFerias["2"].inicio as string).slice(0, 10);
  await audSvc.rhProrrogarPrazoDocumentoFerias(
    "s1",
    "AVISO",
    2,
    `${prazoRodada.slice(0, 4)}-12-31` > prazoRodada
      ? `${prazoRodada.slice(0, 4)}-12-31`
      : dia(400),
    "motivo ok",
    "sub-rh"
  );
  ok(
    "rodada: a prorrogação fica no documento da rodada",
    !!sol.metadados.rodadasFerias["2"].documentos[0].prazoProrrogadoAte
  );

  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();

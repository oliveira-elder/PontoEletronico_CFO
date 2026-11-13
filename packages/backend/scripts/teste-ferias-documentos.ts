/** Prazos e lembretes dos documentos de férias. npx ts-node -P tsconfig.json --transpile-only scripts/teste-ferias-documentos.ts */
import {
  diasParaPrazo,
  precisaAlertaVencidoRh,
  precisaLembrete,
  prazoAviso,
  prazoDocumento,
  prazoRecibo,
  prazoVencido,
  situacaoDocumento,
  validarProrrogacao
} from "../src/utils/ferias-documentos";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
ok("prazo do Aviso = 1º dia do gozo", prazoAviso("2026-12-14") === "2026-12-14");
ok("prazo do Recibo = fim do mês do fim do gozo", prazoRecibo("2026-12-23") === "2026-12-31");
ok("Recibo: fevereiro bissexto", prazoRecibo("2028-02-10") === "2028-02-29");
ok("Recibo: fevereiro comum", prazoRecibo("2027-02-01") === "2027-02-28");
ok("Recibo: gozo que vira o ano termina em janeiro", prazoRecibo("2027-01-05") === "2027-01-31");
const per = { inicio: "2026-12-14", fim: "2027-01-05" };
ok(
  "prazoDocumento por tipo",
  prazoDocumento("AVISO", per) === "2026-12-14" &&
    prazoDocumento("RECIBO", per) === "2027-01-31" &&
    prazoDocumento("OUTROS", per) === null
);
ok(
  "dias para o prazo (hoje = 0, ontem = -1)",
  diasParaPrazo("2026-11-10", "2026-11-10") === 0 &&
    diasParaPrazo("2026-11-10", "2026-11-09") === 1 &&
    diasParaPrazo("2026-11-10", "2026-11-11") === -1
);
ok(
  "situação do documento",
  situacaoDocumento({ tipo: "AVISO" }) === "ENVIADO" &&
    situacaoDocumento({ tipo: "AVISO", urlAssinado: "x" }) === "ASSINADO" &&
    situacaoDocumento({ tipo: "AVISO", rejeicao: {} }) === "REJEITADO"
);

const prazo = "2026-12-14";
const doc = (extra = {}) => ({ tipo: "AVISO", enviadoEm: "2026-11-02T10:00:00.000Z", ...extra });
ok("semanal: 6 dias depois do envio ainda não", !precisaLembrete(doc(), prazo, "2026-11-08"));
ok("semanal: 7 dias depois do envio sim", precisaLembrete(doc(), prazo, "2026-11-09"));
ok(
  "semanal: conta a partir do último lembrete",
  !precisaLembrete(doc({ ultimoLembreteEm: "2026-11-09T07:30:00.000Z" }), prazo, "2026-11-15") &&
    precisaLembrete(doc({ ultimoLembreteEm: "2026-11-09T07:30:00.000Z" }), prazo, "2026-11-16")
);
ok(
  "diário nos últimos 4 dias (11, 12, 13 e 14/12)",
  ["2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14"]
    .map((h) => precisaLembrete(doc({ ultimoLembreteEm: "2026-12-09T07:30:00.000Z" }), prazo, h))
    .join() === "true,true,true,true"
);
ok(
  "os 4 últimos dias incluem o do prazo; 5 dias antes ainda é semanal",
  !precisaLembrete(doc({ ultimoLembreteEm: "2026-12-08T07:30:00.000Z" }), prazo, "2026-12-09")
);
ok(
  "nunca duas vezes no mesmo dia",
  !precisaLembrete(doc({ ultimoLembreteEm: "2026-12-12T07:30:00.000Z" }), prazo, "2026-12-12")
);
ok(
  "assinado ou rejeitado não é lembrado",
  !precisaLembrete(doc({ urlAssinado: "x" }), prazo, "2026-12-13") &&
    !precisaLembrete(doc({ rejeicao: {} }), prazo, "2026-12-13")
);
ok("vencido não é cobrado do funcionário", !precisaLembrete(doc(), prazo, "2026-12-15"));
ok(
  "sem data de envio: não dispara em massa",
  !precisaLembrete({ tipo: "AVISO" }, prazo, "2026-11-20")
);
ok(
  "OUTROS (sem prazo) não gera lembrete",
  !precisaLembrete(doc({ tipo: "OUTROS" }), null, "2026-11-20")
);
ok("alerta ao RH: vencido, 1ª vez", precisaAlertaVencidoRh(doc(), prazo, "2026-12-15"));
ok(
  "alerta ao RH: repete só depois de 7 dias",
  !precisaAlertaVencidoRh(
    doc({ ultimoAlertaRhEm: "2026-12-15T07:30:00.000Z" }),
    prazo,
    "2026-12-21"
  ) &&
    precisaAlertaVencidoRh(
      doc({ ultimoAlertaRhEm: "2026-12-15T07:30:00.000Z" }),
      prazo,
      "2026-12-22"
    )
);
ok("alerta ao RH: dentro do prazo não alerta", !precisaAlertaVencidoRh(doc(), prazo, "2026-12-14"));
/* Prorrogação do prazo pelo RH */
const perPr = { inicio: "2026-12-14", fim: "2026-12-23" };
ok(
  "prorrogação posterior ao prazo legal vale (Aviso)",
  prazoDocumento("AVISO", perPr, "2026-12-20") === "2026-12-20"
);
ok(
  "prorrogação anterior ao prazo legal é ignorada",
  prazoDocumento("AVISO", perPr, "2026-12-01") === "2026-12-14" &&
    prazoDocumento("RECIBO", perPr, "2026-12-10") === "2026-12-31"
);
ok(
  "prorrogação do Recibo é independente do Aviso",
  prazoDocumento("RECIBO", perPr, "2027-01-15") === "2027-01-15" &&
    prazoDocumento("AVISO", perPr) === "2026-12-14"
);
ok("OUTROS não tem prazo nem prorrogação", prazoDocumento("OUTROS", perPr, "2027-01-15") === null);
ok(
  "data de prorrogação inválida é ignorada",
  prazoDocumento("AVISO", perPr, "xx") === "2026-12-14"
);
ok(
  "validar: ok quando posterior ao vigente e não no passado",
  validarProrrogacao("2026-12-14", "2026-12-20", "2026-12-15") === null
);
ok(
  "validar: recusa passado, igual ou anterior ao vigente e formato ruim",
  !!validarProrrogacao("2026-12-14", "2026-12-10", "2026-12-15") &&
    !!validarProrrogacao("2026-12-14", "2026-12-14", "2026-12-10") &&
    !!validarProrrogacao("2026-12-14", "20/12/2026", "2026-12-10") &&
    !!validarProrrogacao(null, "2026-12-20", "2026-12-10")
);
ok(
  "prorrogado: deixa de estar vencido e volta a ser lembrado",
  prazoVencido(prazoDocumento("AVISO", perPr), "2026-12-15") &&
    !prazoVencido(prazoDocumento("AVISO", perPr, "2026-12-20"), "2026-12-15") &&
    precisaLembrete(
      { tipo: "AVISO", enviadoEm: "2026-12-01T10:00:00.000Z" },
      prazoDocumento("AVISO", perPr, "2026-12-20"),
      "2026-12-18"
    )
);
console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
process.exit(falhas ? 1 : 0);

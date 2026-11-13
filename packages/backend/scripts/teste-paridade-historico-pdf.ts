/**
 * Paridade de status: Histórico (web, transformarHistorico) × espelho/PDF (backend, montarRelatorioQuadro).
 * Mesmas batidas, afastamentos e feriados nos dois; o status do dia deve ser o mesmo.
 * npx ts-node -P tsconfig.json --transpile-only scripts/teste-paridade-historico-pdf.ts
 */
import { transformarHistorico } from "../../web/src/utils/historicoTransform";
import {
  montarRelatorioQuadro,
  motivoInconsistencia,
  rotuloAfastamentoIntegral
} from "../src/utils/historico-quadro";
import { resolverJornadaHistoricoContexto } from "../src/utils/jornada-historico";

let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};

const MES = 9;
const ANO = 2026; /* mês fechado: todos os dias já passaram */
const dia = (d: number) => `2026-09-${String(d).padStart(2, "0")}`;
const bat = (d: number, hhmm: string, tipo: string) => ({
  id: `${d}-${hhmm}-${tipo}`,
  tipo,
  dataHora: `${dia(d)}T${hhmm}:00-03:00`,
  ajustado: false
});
const ciclo = (d: number) => [
  bat(d, "08:00", "ENTRADA"),
  bat(d, "12:00", "INICIO_INTERVALO"),
  bat(d, "13:00", "FIM_INTERVALO"),
  bat(d, "17:00", "SAIDA")
];
const registros = [
  ...ciclo(1) /* OK */,
  bat(2, "08:00", "ENTRADA") /* só entrada */,
  bat(3, "08:00", "ENTRADA"),
  bat(3, "12:00", "INICIO_INTERVALO") /* intervalo sem retorno e sem saída */,
  ...ciclo(10),
  ...ciclo(12) /* sábado trabalhado */,
  bat(14, "10:30", "ENTRADA"),
  bat(14, "17:00", "SAIDA") /* dia com atestado parcial */
];
const afastamentos = [
  {
    tipo: "ATESTADO",
    rotulo: null,
    dataInicio: dia(8),
    dataFim: dia(8),
    horarioInicio: null,
    horarioFim: null
  },
  {
    tipo: "FERIAS",
    rotulo: null,
    dataInicio: dia(9),
    dataFim: dia(9),
    horarioInicio: null,
    horarioFim: null
  },
  {
    tipo: "ATESTADO",
    rotulo: null,
    dataInicio: dia(14),
    dataFim: dia(14),
    horarioInicio: "08:00",
    horarioFim: "10:00"
  }
];
const feriados = [{ data: dia(7), nome: "Independência", tipo: "FERIADO" }];

const jornadaBack = resolverJornadaHistoricoContexto({} as never);
const webDias = transformarHistorico(
  registros as never,
  afastamentos as never,
  MES,
  ANO,
  feriados as never
);
const pdf = montarRelatorioQuadro(
  registros.map((r) => ({ tipo: r.tipo, dataHora: new Date(r.dataHora) })),
  afastamentos.map((a) => ({
    ...a,
    dataInicio: new Date(`${a.dataInicio}T00:00:00-03:00`),
    dataFim: new Date(`${a.dataFim}T23:59:59-03:00`)
  })),
  MES,
  ANO,
  jornadaBack,
  feriados.map((f) => ({ ...f, data: new Date(`${f.data}T00:00:00Z`) })),
  100,
  200,
  200
);

const normWeb = (s: string) =>
  s === "FERIADO" || s === "ISENTO" ? "AFASTAMENTO" : s; /* neutros no PDF = AFASTAMENTO */
const porIsoPdf = new Map(pdf.dias.map((d) => [d.iso, d]));
for (const w of webDias) {
  const [dd, mm, aa] = w.data.split("/");
  const iso = `${aa}-${mm}-${dd}`;
  const p = porIsoPdf.get(iso);
  if (!p) continue;
  const esperado = normWeb(w.status);
  ok(
    `${w.data} (${w.status}${w.obs ? ` — ${w.obs}` : ""}): PDF = ${p.statusInterno}`,
    p.statusInterno === esperado
  );
}

/* Justificativa do PDF: o que a tela explica, o PDF também explica */
const d2 = porIsoPdf.get(dia(2))!;
const d3 = porIsoPdf.get(dia(3))!;
ok(
  "PDF 02/09 (só entrada): motivo da inconsistência igual ao da tela",
  motivoInconsistencia(d2) === "Apenas a entrada foi registrada — registro incompleto"
);
ok(
  "PDF 03/09: intervalo sem retorno explicado",
  /Intervalo sem retorno/.test(motivoInconsistencia(d3) ?? "")
);
ok(
  "PDF 08/09: afastamento mostra o tipo (Atestado médico)",
  porIsoPdf.get(dia(8))!.status === "Atestado médico"
);
ok("PDF 09/09: afastamento mostra o tipo (Férias)", porIsoPdf.get(dia(9))!.status === "Férias");
ok(
  "rótulo cadastrado no afastamento tem prioridade",
  rotuloAfastamentoIntegral({ tipo: "ATESTADO", rotulo: "Atestado — cardiologista" }) ===
    "Atestado — cardiologista"
);
ok("dia sem inconsistência não tem motivo", motivoInconsistencia(porIsoPdf.get(dia(1))!) === null);
ok(
  "sábado trabalhado: PDF guarda o multiplicador do banco de horas",
  porIsoPdf.get(dia(12))!.multiplicadorPct === 100
);

console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
process.exit(falhas ? 1 : 0);

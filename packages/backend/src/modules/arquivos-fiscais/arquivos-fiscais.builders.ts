/**
 * Leiautes oficiais (portal gov.br, Portaria MTP nº 671/2021), para o REP-P:
 * - AFD versão "004": posições fixas, registros 1/2/4/5/6/7/9 + linha de assinatura.
 * - AEJ versão "002": campos separados por "|", registros 01–08 e 99 + linha de assinatura.
 */
import {
  LINHA_ASSINATURA,
  campoA,
  campoN,
  comCrc,
  dataD,
  dataHoraDH,
  latin1
} from "../../utils/afd-campos";

export interface EmpresaRep {
  cnpj: string;
  cnoCaepf: string;
  razaoSocial: string;
  /** Nº de registro do programa no INPI (17 dígitos). */
  nrRep: string;
  cnpjDesenvolvedor: string;
}

export interface EventoAfd {
  nsr: number;
  tipo: number;
  dataHora: Date;
  dados: Record<string, unknown>;
}

export interface MarcacaoAfd {
  nsr: number;
  cpf: string;
  dataHoraMarcacao: Date;
  dataHoraGravacao: Date;
  coletor: string;
  offline: boolean;
  hash: string;
}

const s = (v: unknown) => (v == null ? "" : String(v));

/** Monta as linhas do AFD (sem a terminação de linha). */
export function montarAfd(opts: {
  empresa: EmpresaRep;
  inicio: string;
  fim: string;
  geradoEm: Date;
  eventos: EventoAfd[];
  marcacoes: MarcacaoAfd[];
}): { linhas: string[]; contagem: Record<number, number>; nsrMaximo: number } {
  const { empresa } = opts;
  const linhas: string[] = [];
  /* Tipo 1 — cabeçalho (302). */
  linhas.push(
    comCrc(
      "000000000" +
        "1" +
        "1" +
        campoA(empresa.cnpj, 14) +
        campoN(empresa.cnoCaepf, 14) +
        campoA(empresa.razaoSocial, 150) +
        campoN(empresa.nrRep, 17) +
        dataD(opts.inicio) +
        dataD(opts.fim) +
        dataHoraDH(opts.geradoEm) +
        "004" +
        "1" +
        campoA(empresa.cnpjDesenvolvedor, 14) +
        campoA("", 30)
    )
  );

  type Item = { nsr: number; linha: string; tipo: number };
  const itens: Item[] = [];
  for (const e of opts.eventos) {
    const d = e.dados;
    if (e.tipo === 2) {
      itens.push({
        nsr: e.nsr,
        tipo: 2,
        linha: comCrc(
          campoN(e.nsr, 9) +
            "2" +
            dataHoraDH(e.dataHora) +
            campoN(s(d.responsavelCpf), 14) +
            "1" +
            campoA(s(d.cnpj), 14) +
            campoN(s(d.cnoCaepf), 14) +
            campoA(s(d.razaoSocial), 150) +
            campoA(s(d.localPrestacao), 100)
        )
      });
    } else if (e.tipo === 4) {
      itens.push({
        nsr: e.nsr,
        tipo: 4,
        linha: comCrc(
          campoN(e.nsr, 9) +
            "4" +
            dataHoraDH(new Date(s(d.antes))) +
            dataHoraDH(new Date(s(d.depois))) +
            campoN(s(d.responsavelCpf), 11)
        )
      });
    } else if (e.tipo === 5) {
      itens.push({
        nsr: e.nsr,
        tipo: 5,
        linha: comCrc(
          campoN(e.nsr, 9) +
            "5" +
            dataHoraDH(e.dataHora) +
            campoA(s(d.operacao), 1) +
            campoN(s(d.cpf), 12) +
            campoA(s(d.nome), 52) +
            campoA(s(d.demais), 4) +
            campoN(s(d.responsavelCpf), 11)
        )
      });
    } else if (e.tipo === 6) {
      /* Eventos sensíveis do REP-P (02, 07 e 08). Sem CRC (item 8). */
      itens.push({
        nsr: e.nsr,
        tipo: 6,
        linha: campoN(e.nsr, 9) + "6" + dataHoraDH(e.dataHora) + campoN(s(d.evento), 2)
      });
    }
  }
  for (const m of opts.marcacoes) {
    /* Tipo 7 — marcação REP-P (137), hash encadeado gravado no momento da marcação. */
    itens.push({
      nsr: m.nsr,
      tipo: 7,
      linha:
        campoN(m.nsr, 9) +
        "7" +
        dataHoraDH(m.dataHoraMarcacao) +
        campoN(m.cpf, 12) +
        dataHoraDH(m.dataHoraGravacao) +
        campoN(m.coletor, 2) +
        (m.offline ? "1" : "0") +
        campoA(m.hash, 64)
    });
  }
  itens.sort((a, b) => a.nsr - b.nsr);
  const contagem: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const it of itens) {
    linhas.push(it.linha);
    contagem[it.tipo] = (contagem[it.tipo] ?? 0) + 1;
  }
  /* Tipo 9 — trailer (64). */
  linhas.push(
    "999999999" + [2, 3, 4, 5, 6, 7].map((t) => campoN(contagem[t] ?? 0, 9)).join("") + "9"
  );
  linhas.push(LINHA_ASSINATURA);
  return { linhas, contagem, nsrMaximo: itens.at(-1)?.nsr ?? 0 };
}

/* ─── AEJ ─── */

export interface VinculoAej {
  id: number;
  cpf: string;
  nome: string;
}
export interface HorarioAej {
  codigo: string;
  durJornadaMin: number;
  pares: Array<[string, string]>; // ["0700","1130"], ["1230","1500"]
}
export interface MarcacaoAej {
  vinculo: number;
  /** Identificador do REP no AEJ (registro 02); vazio nas marcações incluídas manualmente. */
  idRep?: number;
  dataHora: Date;
  tpMarc: "E" | "S" | "D";
  seq: number;
  fonte: "O" | "I" | "P" | "X" | "T";
  codHorContratual?: string;
  motivo?: string;
}
export interface AusenciaAej {
  vinculo: number;
  tipo: 1 | 2 | 3 | 4;
  data: string;
  qtMinutos?: number;
  tipoMovBH?: 1 | 2;
}

const campoPipe = (v: unknown) => latin1(s(v)).trim();

export interface RepAejDef {
  id: number;
  nrRep: string;
}

export function montarAej(opts: {
  reps: RepAejDef[];
  empresa: EmpresaRep;
  inicio: string;
  fim: string;
  geradoEm: Date;
  vinculos: VinculoAej[];
  horarios: HorarioAej[];
  marcacoes: MarcacaoAej[];
  ausencias: AusenciaAej[];
  ptrp: { nome: string; versao: string; cnpj: string; razao: string; email: string };
}): { linhas: string[]; contagem: Record<string, number> } {
  const { empresa } = opts;
  const linha = (...campos: unknown[]) => campos.map(campoPipe).join("|");
  const cnoCaepf = empresa.cnoCaepf.replace(/\D/g, "");
  const caepf = cnoCaepf.length === 14 ? cnoCaepf : "";
  const cno = cnoCaepf.length === 12 ? cnoCaepf : "";
  const linhas: string[] = [];
  const c: Record<string, number> = {};
  const add = (tipo: string, l: string) => {
    linhas.push(l);
    c[tipo] = (c[tipo] ?? 0) + 1;
  };
  add(
    "01",
    linha(
      "01",
      "1",
      empresa.cnpj.replace(/\D/g, ""),
      caepf,
      cno,
      empresa.razaoSocial,
      dataD(opts.inicio),
      dataD(opts.fim),
      dataHoraDH(opts.geradoEm),
      "002"
    )
  );
  for (const r of opts.reps) {
    /* tpRep 3 = REP-P; nrRep = nº de registro no INPI. */
    add("02", linha("02", r.id, "3", campoN(r.nrRep, 17)));
  }
  for (const v of opts.vinculos) add("03", linha("03", v.id, campoN(v.cpf, 11), v.nome));
  for (const h of opts.horarios) {
    add("04", linha("04", h.codigo, h.durJornadaMin, ...h.pares.flat()));
  }
  for (const m of opts.marcacoes) {
    add(
      "05",
      linha(
        "05",
        m.vinculo,
        dataHoraDH(m.dataHora),
        m.idRep ?? "",
        m.tpMarc,
        String(m.seq).padStart(3, "0"),
        m.fonte,
        m.codHorContratual ?? "",
        (m.motivo ?? "").slice(0, 150)
      )
    );
  }
  for (const a of opts.ausencias) {
    add(
      "07",
      linha(
        "07",
        a.vinculo,
        a.tipo,
        a.data,
        a.tipo === 3 ? a.qtMinutos : "",
        a.tipo === 3 ? a.tipoMovBH : ""
      )
    );
  }
  add(
    "08",
    linha(
      "08",
      opts.ptrp.nome,
      opts.ptrp.versao,
      "1",
      opts.ptrp.cnpj,
      opts.ptrp.razao,
      opts.ptrp.email
    )
  );
  linhas.push(
    linha("99", ...["01", "02", "03", "04", "05", "06", "07", "08"].map((t) => c[t] ?? 0))
  );
  linhas.push(LINHA_ASSINATURA);
  return { linhas, contagem: c };
}

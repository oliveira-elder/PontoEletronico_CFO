import React from "react";
import { dataCivilISO } from "../../utils/horario-brasilia";
import {
  UsersIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
  BriefcaseIcon
} from "../../components/icons";

export type Categoria = "ESTAGIARIO" | "MENOR_APRENDIZ" | "CONCURSADO" | "ASSESSOR";

/** "Estágio" (ESTAGIARIO/MENOR_APRENDIZ) tem "Supervisor"; "Efetivo"/"Comissionado" têm "Chefe". */
export function isCategoriaEstagio(categoria: Categoria | string | null | undefined): boolean {
  return categoria === "ESTAGIARIO" || categoria === "MENOR_APRENDIZ";
}

export type Atividade = "MEIO" | "FIM";

export const ATIVIDADE_OPCOES: { value: Atividade; label: string }[] = [
  { value: "FIM", label: "Atividade-fim" },
  { value: "MEIO", label: "Atividade-meio" }
];

export const RACA_OPCOES = [
  "Branca",
  "Preta",
  "Parda",
  "Amarela",
  "Indígena",
  "Prefiro não informar"
];

export const GENERO_OPCOES = ["Feminino", "Masculino", "Prefiro não informar"];

export const GRAU_ESCOLARIDADE_OPCOES = [
  "Ensino Fundamental",
  "Ensino Médio",
  "Ensino Superior",
  "Pós-graduação",
  "Mestrado",
  "Doutorado"
];

export interface Dependente {
  id?: string;
  nome: string;
  cpf?: string | null;
  dataNascimento?: string | null;
}

export interface FormacaoAcademica {
  id?: string;
  grauEscolaridade?: string | null;
  curso: string;
  instituicao?: string | null;
  conclusao?: string | null;
}

export interface Capacitacao {
  id?: string;
  nome: string;
  instituicao?: string | null;
  conclusao?: string | null;
}

export interface Gerencia {
  id: string;
  nome: string;
  sigla: string;
}

export interface JornadaPeriodo {
  id: string;
  nome: string;
  ePadrao: boolean;
}

export interface EnderecoResidencial {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  lat?: number | null;
  lng?: number | null;
  raioMetros: number;
}

export interface Funcionario {
  id: string;
  matricula: string | null;
  cpf?: string | null;
  fotoPerfilUrl?: string | null;
  email: string;
  cargo: string;
  categoria: Categoria;
  gerenciaId: string;
  jornadaPeriodoId?: string | null;
  jornadaPeriodo?: JornadaPeriodo | null;
  modoHomeOffice?: boolean;
  modoHibridoLocal?: boolean;
  supervisorEstagioId?: string | null;
  supervisorEstagio?: {
    id: string;
    user: { id: string; name: string; email: string };
  } | null;
  enderecoResidencial?: EnderecoResidencial | null;
  requerimentoEndereco?: {
    id: string;
    status: string;
    criadoEm: string;
    respondidoEm?: string | null;
  } | null;
  requerimentosCadastro?: {
    tipo: "DEPENDENTES" | "FORMACAO_ACADEMICA" | "CAPACITACOES";
    status: string;
    criadoEm: string;
    respondidoEm?: string | null;
  }[];
  ativo: boolean;
  camposManuaisConfigurados?: boolean;
  loginHoje?: boolean;
  section?: string | null;
  subsecao?: string | null;
  isManager?: boolean;
  ramal?: string | null;
  sala?: string | null;
  andar?: string | null;
  dataNascimento?: string | null;
  dataAdmissao?: string | null;
  dataDesligamento?: string | null;

  // ── Dados pessoais (RH) ──
  rg?: string | null;
  rgOrgaoEmissor?: string | null;
  rgUf?: string | null;
  rgDataEmissao?: string | null;
  raca?: string | null;
  genero?: string | null;
  emailPessoal?: string | null;
  telefone?: string | null;
  dependentes?: Dependente[];

  // ── Jornada / características (RH) ──
  atividade?: Atividade | null;
  isFiscal?: boolean;
  nivelCargo?: "MEDIO" | "SUPERIOR" | "TECNICO" | null;
  valeTransporte?: boolean;
  registroPontoObrigatorio?: boolean | null;

  // ── Cargo e Lotação (valor atual) ──
  cargoData?: string | null;
  lotacaoInicio?: string | null;
  lotacaoTermino?: string | null;

  // ── Capacitação (RH) — 1:N ──
  formacoesAcademicas?: FormacaoAcademica[];
  capacitacoes?: Capacitacao[];

  // ── Específicos de Estágio / Jovem Aprendiz ──
  bolsaAuxilio?: number | string | null;
  curso?: string | null;
  contratoInicio?: string | null;
  contratoTermino?: string | null;
  cargaHoraria?: string | null;
  diasSemana?: string | null;

  observacoes?: string | null;

  // ── Cessão de Efetivo ──
  cedido?: boolean;
  cessaoInicio?: string | null;
  cessaoFim?: string | null;
  cessaoOrgaoOrigem?: string | null;
  cessaoOrgaoDestino?: string | null;

  user: {
    id: string;
    name: string;
    email: string;
    emailReal: string | null;
    ultimoLoginEm?: string | null;
  };
  gerencia?: {
    id: string;
    nome: string;
    sigla: string;
    responsavel?: string | null;
    responsavelUserId?: string | null;
    responsavelMatricula?: string | null;
  } | null;
  ehGerenteSubstituto?: boolean;
  ehTitularEmSubstituicao?: boolean;
  substituicao?: {
    id: string;
    status: string;
    dataInicio: string;
    dataFim: string;
    titularId: string;
    substitutoId: string;
    substituto?: { id: string; user: { name: string } };
    titular?: { id: string; user: { name: string } };
  } | null;
}

/** Chefe (Efetivo/Comissionado): somente leitura, responsável oficial da Lotação —
 *  não é mais uma seleção manual (ver planejamento "Campo Chefe"). */
export function chefeDaLotacao(f: Pick<Funcionario, "gerencia">): string {
  return f.gerencia?.responsavel?.trim() || "—";
}

const PREPOSICOES_PT = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "a",
  "as",
  "o",
  "os",
  "ao",
  "aos",
  "por",
  "para",
  "com",
  "sem",
  "sob",
  "sobre"
]);

const SIGLAS_SLUG = new Set(["ti", "rh", "serhum", "cfo", "cpd", "gerti", "tj", "tcu"]);

export function slugLabel(slug: string): string {
  return slug
    .split("-")
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (SIGLAS_SLUG.has(lower)) return lower.toUpperCase();
      if (i > 0 && PREPOSICOES_PT.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export function infoContato(f: {
  ramal?: string | null;
  sala?: string | null;
  andar?: string | null;
}): string | null {
  const partes = [
    f.ramal ? `Ramal ${f.ramal}` : null,
    f.sala ? `Sala ${f.sala}` : null,
    f.andar ?? null
  ].filter((v): v is string => Boolean(v));
  return partes.length ? partes.join(" · ") : null;
}

const SSO_FAKE_DOMAINS = ["sso.local", "pending.local"];
const REAL_EMAIL_DOMAIN =
  (import.meta.env.VITE_REAL_EMAIL_DOMAIN as string | undefined)?.trim() || "cfo.org.br";

function normTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Converte máscaras SSO (@sso.local / @pending.local) para o domínio institucional. */
export function emailInstitucional(email: string | null | undefined): string {
  const raw = (email ?? "").trim();
  if (!raw) return "";
  const at = raw.lastIndexOf("@");
  const local = (at >= 0 ? raw.slice(0, at) : raw).trim();
  const domain = (at >= 0 ? raw.slice(at + 1) : "").trim().toLowerCase();
  if (!local) return "";
  if (!domain || SSO_FAKE_DOMAINS.includes(domain)) {
    return `${local}@${REAL_EMAIL_DOMAIN}`;
  }
  return raw;
}

export function resolveEmail(u: { email: string; emailReal: string | null }): string {
  return emailInstitucional(u.emailReal) || emailInstitucional(u.email);
}

export function matriculaPareceLogin(matricula: string | null | undefined): boolean {
  const m = (matricula ?? "").trim();
  if (!m) return true;
  return /[a-zA-Z._-]/.test(m) && !/^\d+$/.test(m);
}

/** Localiza gerência já cadastrada a partir do id, nome ou slug da API. */
export function matchGerenciaId(
  gerencias: Gerencia[],
  opts: { gerenciaId?: string | null; section?: string | null; nome?: string | null }
): string {
  if (opts.gerenciaId && gerencias.some((g) => g.id === opts.gerenciaId)) {
    return opts.gerenciaId;
  }
  const candidatos = [
    opts.nome,
    opts.section ? slugLabel(opts.section) : null,
    opts.section ? opts.section.replace(/-/g, " ") : null
  ].filter((x): x is string => Boolean(x));
  for (const c of candidatos) {
    const n = normTexto(c);
    if (!n) continue;
    const hit = gerencias.find((g) => normTexto(g.nome) === n || normTexto(g.sigla) === n);
    if (hit) return hit.id;
  }
  return "";
}

export function formatCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let r = (s * 10) % 11;
  if (r >= 10) r = 0;
  if (r !== +d[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  r = (s * 10) % 11;
  if (r >= 10) r = 0;
  return r === +d[10];
}

/** Telefone BR: fixo (XX) XXXX-XXXX ou celular (XX) XXXXX-XXXX, conforme a quantidade de dígitos. */
export function formatTelefone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** RG: números corridos, sem pontuação, até 15 dígitos. */
export function formatRg(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

export const CAT: Record<
  Categoria,
  { label: string; cor: string; bg: string; icon: React.ElementType }
> = {
  ESTAGIARIO: {
    label: "Estagiário",
    cor: "var(--blue-ink)",
    bg: "rgba(30,74,122,0.08)",
    icon: GraduationCapIcon
  },
  MENOR_APRENDIZ: {
    label: "Jovem Aprendiz",
    cor: "#5b4a9e",
    bg: "rgba(91,74,158,0.10)",
    icon: UsersIcon
  },
  CONCURSADO: {
    label: "Efetivo",
    cor: "var(--green)",
    bg: "rgba(47,125,79,0.08)",
    icon: ShieldCheckIcon
  },
  ASSESSOR: {
    label: "Comissionado",
    cor: "#8a6a00",
    bg: "rgba(247,196,55,0.12)",
    icon: BriefcaseIcon
  }
};

export const FORM_VAZIO = {
  nome: "",
  matricula: "",
  email: "",
  cpf: "",
  categoria: "CONCURSADO" as Categoria,
  gerenciaId: "",
  jornadaPeriodoId: "",
  subsecao: "",
  ativo: true,
  dataNascimento: "",
  dataAdmissao: "",
  dataDesligamento: "",
  supervisorEstagioId: "",
  substitutoId: "",
  substitutoDataInicio: "",
  substitutoDataFim: "",
  isManager: false,

  // Identificação
  rg: "",
  rgOrgaoEmissor: "",
  rgUf: "",
  rgDataEmissao: "",
  raca: "",
  genero: "",
  emailPessoal: "",
  telefone: "",
  dependentes: [] as Dependente[],

  // Jornada / características
  atividade: "" as Atividade | "",
  isFiscal: false,
  nivelCargo: "" as "" | "MEDIO" | "SUPERIOR" | "TECNICO",
  valeTransporte: false,
  registroPontoObrigatorio: null as boolean | null,

  // Cargo e Lotação
  cargo: "",
  cargoData: "",
  lotacaoInicio: "",
  lotacaoTermino: "",

  // Capacitação (1:N)
  formacoesAcademicas: [] as FormacaoAcademica[],
  capacitacoes: [] as Capacitacao[],

  // Estágio / Jovem Aprendiz
  bolsaAuxilio: "",
  curso: "",
  contratoInicio: "",
  contratoTermino: "",
  cargaHoraria: "",
  diasSemana: "",

  observacoes: "",

  // Cessão de Efetivo
  cedido: false,
  cessaoInicio: "",
  cessaoFim: "",
  cessaoOrgaoOrigem: "",
  cessaoOrgaoDestino: ""
};

export type FuncionarioFormState = typeof FORM_VAZIO;

export function nomeGerencia(
  gerencias: Gerencia[],
  id: string | null | undefined,
  gerencia?: { nome?: string | null } | null
): string {
  return gerencia?.nome ?? (id ? gerencias.find((g) => g.id === id)?.nome : undefined) ?? "—";
}

function dataOuVazio(v: string | null | undefined): string {
  return v ? dataCivilISO(v) : "";
}

export function formFromFuncionario(f: Funcionario): FuncionarioFormState {
  const sub = f.substituicao;
  const isTitularSub =
    sub && sub.titularId === f.id && (sub.status === "AGENDADA" || sub.status === "ATIVA");
  return {
    nome: f.user?.name ?? "",
    matricula: f.matricula ?? "",
    email: f.user ? resolveEmail(f.user) : "",
    cpf: f.cpf ?? "",
    categoria: f.categoria ?? "CONCURSADO",
    gerenciaId: f.gerenciaId ?? "",
    jornadaPeriodoId: f.jornadaPeriodoId ?? "",
    subsecao: f.subsecao ?? "",
    ativo: f.ativo ?? true,
    dataNascimento: dataOuVazio(f.dataNascimento),
    dataAdmissao: dataOuVazio(f.dataAdmissao),
    dataDesligamento: dataOuVazio(f.dataDesligamento),
    supervisorEstagioId: f.supervisorEstagioId ?? "",
    substitutoId: isTitularSub ? sub.substitutoId : "",
    substitutoDataInicio: isTitularSub ? dataCivilISO(sub.dataInicio) : "",
    substitutoDataFim: isTitularSub ? dataCivilISO(sub.dataFim) : "",
    isManager: f.isManager ?? false,

    rg: f.rg ?? "",
    rgOrgaoEmissor: f.rgOrgaoEmissor ?? "",
    rgUf: f.rgUf ?? "",
    rgDataEmissao: dataOuVazio(f.rgDataEmissao),
    raca: f.raca ?? "",
    genero: f.genero ?? "",
    emailPessoal: f.emailPessoal ?? "",
    telefone: f.telefone ?? "",
    /* Datas de sub-itens (dependentes/formações/capacitações) vêm do backend como
       ISO completo (ex.: "2017-12-05T00:00:00.000Z") — sem passar por dataOuVazio,
       o <input type="date"> rejeita o valor e mostra em branco mesmo com dado salvo. */
    dependentes: (f.dependentes ?? []).map((d) => ({
      ...d,
      dataNascimento: dataOuVazio(d.dataNascimento)
    })),

    atividade: f.atividade ?? "",
    isFiscal: f.isFiscal ?? false,
    nivelCargo: f.nivelCargo ?? "",
    valeTransporte: f.valeTransporte ?? false,
    registroPontoObrigatorio: f.registroPontoObrigatorio ?? null,

    cargo: f.cargo ?? "",
    cargoData: dataOuVazio(f.cargoData),
    lotacaoInicio: dataOuVazio(f.lotacaoInicio),
    lotacaoTermino: dataOuVazio(f.lotacaoTermino),

    formacoesAcademicas: (f.formacoesAcademicas ?? []).map((fa) => ({
      ...fa,
      conclusao: dataOuVazio(fa.conclusao)
    })),
    capacitacoes: (f.capacitacoes ?? []).map((c) => ({
      ...c,
      conclusao: dataOuVazio(c.conclusao)
    })),

    bolsaAuxilio: f.bolsaAuxilio != null ? String(f.bolsaAuxilio) : "",
    curso: f.curso ?? "",
    contratoInicio: dataOuVazio(f.contratoInicio),
    contratoTermino: dataOuVazio(f.contratoTermino),
    cargaHoraria: f.cargaHoraria ?? "",
    diasSemana: f.diasSemana ?? "",

    observacoes: f.observacoes ?? "",
    cedido: f.cedido ?? false,
    cessaoInicio: dataOuVazio(f.cessaoInicio),
    cessaoFim: dataOuVazio(f.cessaoFim),
    cessaoOrgaoOrigem: f.cessaoOrgaoOrigem ?? "",
    cessaoOrgaoDestino: f.cessaoOrgaoDestino ?? ""
  };
}

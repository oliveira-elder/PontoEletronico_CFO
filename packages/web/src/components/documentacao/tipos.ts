export interface SecaoIndice {
  id: string;
  grupo: string;
  titulo: string;
  arquivo?: string;
  gerada?: "api" | "banco" | "stack" | "jobs" | "ambiente" | "cobertura";
  vista?: "der" | "dicionario";
  hash: string | null;
}

export interface SecaoConteudo extends Omit<SecaoIndice, "hash"> {
  tipo: "markdown" | "gerada";
  markdown: string | null;
  hash: string | null;
}

export interface RotaDoc {
  id: string;
  metodo: string;
  caminho: string;
  controlador: string;
  modulo: string;
  funcao: string;
  titulo: string | null;
  descricao: string | null;
  categoria: string | null;
  acesso: "publico" | "autenticado" | "papeis";
  papeis: string[];
  recursosRh: string[];
  guardas: string[];
  parametros: { origem: string; nome: string | null; tipo: string | null }[];
  statusHttp: number | null;
  tabelasLeitura: string[];
  tabelasEscrita: string[];
  consultas: string[];
  sqlCru: boolean;
}

export interface TabelaDoc {
  nome: string;
  descricao: string | null;
  dominios: string[];
  campos: {
    nome: string;
    tipo: string;
    obrigatorio: boolean;
    lista: boolean;
    padrao: string | null;
    chave: string[];
    referencia: string | null;
    descricao: string | null;
  }[];
  indices: { tipo: string; campos: string[] }[];
  relacoes: { campo: string; para: string; lista: boolean }[];
}

export interface BancoDoc {
  totais: { tabelas: number; enums: number; relacoes: number };
  geral: string;
  dominios: { id: string; titulo: string; descricao: string; modelos: string[]; mermaid: string }[];
  tabelas: TabelaDoc[];
  enums: { nome: string; valores: string[] }[];
  cobertura: { semDominio: string[]; modelosInexistentes: string[]; semDescricao: string[] };
}

export interface StackDoc {
  node: string;
  sistema: string | null;
  prisma: string | null;
  engines: Record<string, string>;
  pacotes: {
    pacote: string;
    versao: string | null;
    dependencias: { nome: string; faixa: string; instalada: string | null }[];
    desenvolvimento: { nome: string; faixa: string; instalada: string | null }[];
  }[];
  servicos: {
    nome: string;
    imagem: string | null;
    construido: boolean;
    portas: string[];
    expoe: string[];
    volumes: string[];
    dependeDe: string[];
    perfis: string[];
  }[];
}

export interface JobDoc {
  classe: string;
  metodo: string;
  nome: string | null;
  agenda: string;
  fusoHorario: string | null;
}

export interface VariavelDoc {
  nome: string;
  usadaEm: string[];
  funcao: string | null;
  obrigatoria: boolean | null;
}

export interface CoberturaDoc {
  secoes: number;
  secoesSemArquivo: string[];
  rotas: number;
  rotasSemDescricao: string[];
  tabelas: number;
  tabelasSemDominio: string[];
  tabelasSemDescricao: string[];
  variaveisSemDescricao: string[];
  ok: boolean;
}

export type DadosGerados =
  | { rotas: RotaDoc[] }
  | BancoDoc
  | StackDoc
  | { jobs: JobDoc[] }
  | { variaveis: VariavelDoc[] }
  | CoberturaDoc;

export interface AutoriaDoc {
  autor: string;
  dataEntrega: string;
  local: string;
  gerenteResponsavel: string;
  solicitacao: string;
  versaoAtual: string;
}

export interface RevisaoDoc {
  id: string;
  versao: string;
  tipo: "MANUAL" | "AUTOMATICA";
  desenvolvedor: string;
  revisor: string | null;
  dataRevisao: string;
  comentario: string;
  local: string | null;
  equipe: string | null;
  anuladaEm: string | null;
  motivoAnulacao: string | null;
}

export interface ResultadoBusca {
  tipo: string;
  titulo: string;
  trecho: string;
  secao: string;
  ancora?: string;
}

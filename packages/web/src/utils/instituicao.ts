export type InstituicaoBranding = {
  nome: string;
  cnpj: string;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefone?: string | null;
  emailInstitucional?: string | null;
};

export const INSTITUICAO_BRANDING_DEFAULT: InstituicaoBranding = {
  nome: "Conselho Federal de Odontologia",
  cnpj: "33.368.957/0001-00",
  endereco: "Setor de Autarquias Sul, Quadra 1, Bloco J",
  cidade: "Brasília",
  uf: "DF"
};

function part(value?: string | null): string | undefined {
  const t = value?.trim();
  return t || undefined;
}

/** Logradouro completo: "Rua X, 123 — Bairro, Cidade-UF" */
export function formatEnderecoInstitucional(b: InstituicaoBranding): string {
  const logradouro = [part(b.endereco), part(b.numero)].filter(Boolean).join(", ");
  const cidadeUf = [part(b.cidade), part(b.uf)].filter(Boolean).join("-");
  const trecho = [logradouro || undefined, part(b.bairro), cidadeUf || undefined].filter(Boolean);
  return trecho.join(", ");
}

/** Ex.: "Brasília — DF" */
export function formatCidadeUf(b: InstituicaoBranding): string {
  const cidade = part(b.cidade);
  const uf = part(b.uf);
  if (cidade && uf) return `${cidade} — ${uf}`;
  return cidade || uf || "";
}

/** Linha 1 do rodapé: "© 2026 Nome — CNPJ xx" */
export function formatRodapeLinha1(b: InstituicaoBranding, ano = new Date().getFullYear()): string {
  const nome = part(b.nome) || INSTITUICAO_BRANDING_DEFAULT.nome;
  const cnpj = part(b.cnpj);
  return cnpj ? `© ${ano} ${nome} — CNPJ ${cnpj}` : `© ${ano} ${nome}`;
}

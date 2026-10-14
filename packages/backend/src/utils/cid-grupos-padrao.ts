/** Grupos do CID-10 carregados na 1ª consulta (depois são gerenciados em Configurações). */
export const CID_GRUPOS_PADRAO: Array<{ codigo: string; descricao: string }> = [
  { codigo: "A00-B99", descricao: "Doenças infecciosas e parasitárias" },
  { codigo: "C00-D48", descricao: "Neoplasias (tumores)" },
  {
    codigo: "D50-D89",
    descricao: "Doenças do sangue, órgãos hematopoéticos e transtornos imunitários"
  },
  { codigo: "E00-E90", descricao: "Doenças endócrinas, nutricionais e metabólicas" },
  { codigo: "F00-F99", descricao: "Transtornos mentais e comportamentais" },
  { codigo: "G00-G99", descricao: "Doenças do sistema nervoso" },
  { codigo: "H00-H59", descricao: "Doenças do olho e anexos" },
  { codigo: "H60-H95", descricao: "Doenças do ouvido e da apófise mastoide" },
  { codigo: "I00-I99", descricao: "Doenças do aparelho circulatório" },
  { codigo: "J00-J99", descricao: "Doenças do aparelho respiratório" },
  { codigo: "K00-K93", descricao: "Doenças do aparelho digestivo" },
  { codigo: "L00-L99", descricao: "Doenças da pele e do tecido subcutâneo" },
  { codigo: "M00-M99", descricao: "Doenças do sistema osteomuscular e tecido conjuntivo" },
  { codigo: "N00-N99", descricao: "Doenças do aparelho geniturinário" },
  { codigo: "O00-O99", descricao: "Gravidez, parto e puerpério" },
  { codigo: "P00-P96", descricao: "Afecções originadas no período perinatal" },
  {
    codigo: "Q00-Q99",
    descricao: "Malformações congênitas, deformidades e anomalias cromossômicas"
  },
  { codigo: "R00-R99", descricao: "Sintomas, sinais e achados anormais em exames" },
  { codigo: "S00-T98", descricao: "Lesões, envenenamento e consequências de causas externas" },
  { codigo: "U00-U99", descricao: "Códigos para propósitos especiais (como COVID-19)" },
  {
    codigo: "V01-Y98",
    descricao: "Causas externas de morbidade e mortalidade (acidentes/violência)"
  },
  {
    codigo: "Z00-Z99",
    descricao: "Fatores que influenciam o estado de saúde (consultas/atestados)"
  }
];

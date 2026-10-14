/** Requerimentos que o RH pede ao próprio funcionário preencher. */
export type TipoRequerimentoCadastro = "DEPENDENTES" | "FORMACAO_ACADEMICA" | "CAPACITACOES";
export type TipoRequerimento = "ENDERECO" | TipoRequerimentoCadastro;

export const TIPOS_REQUERIMENTO_CADASTRO: TipoRequerimentoCadastro[] = [
  "DEPENDENTES",
  "FORMACAO_ACADEMICA",
  "CAPACITACOES"
];

/**
 * Textos de cada requerimento — usados na confirmação do RH, no card do funcionário e
 * no Dashboard. `originais` é o documento que deve ser apresentado no RH.
 */
export const REQUERIMENTO_INFO: Record<
  TipoRequerimento,
  {
    rotulo: string;
    tituloFuncionario: string;
    icone: string;
    originais: string;
    publico: string;
  }
> = {
  ENDERECO: {
    rotulo: "Endereço",
    tituloFuncionario: "Cadastrar Endereço Residencial",
    icone: "📍",
    originais: "o comprovante de residência",
    publico: "funcionários ativos"
  },
  DEPENDENTES: {
    rotulo: "Dependentes",
    tituloFuncionario: "Informar Dependentes",
    icone: "👨‍👧",
    originais: "a certidão de nascimento e o CPF dos dependentes",
    publico: "Empregados e Comissionados ativos"
  },
  FORMACAO_ACADEMICA: {
    rotulo: "Formação Acadêmica",
    tituloFuncionario: "Informar Formação Acadêmica",
    icone: "🎓",
    originais: "o diploma ou certificado de conclusão",
    publico: "Empregados e Comissionados ativos"
  },
  CAPACITACOES: {
    rotulo: "Cursos/Capacitações",
    tituloFuncionario: "Informar Cursos/Capacitações",
    icone: "📚",
    originais: "os certificados dos cursos",
    publico: "Empregados e Comissionados ativos"
  }
};

/** Frase do aviso: "Apresente <documento> original no setor de Recursos Humanos." */
export function textoAvisoOriginais(tipo: TipoRequerimento): string {
  return `Os documentos originais devem ser apresentados no setor de Recursos Humanos: ${REQUERIMENTO_INFO[tipo].originais}.`;
}

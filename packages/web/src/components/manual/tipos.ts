import type React from "react";

export type Valor = string | boolean | number;
/** Estado da cena: valores de campos, telas abertas e marcadores (`__*` são internos do player). */
export type Estado = Record<string, Valor>;

export interface Passo {
  acao: "mover" | "clicar" | "digitar" | "selecionar" | "aguardar";
  /** Identificador `data-alvo` do elemento (para selecionar, o próprio select). */
  alvo?: string;
  /** Texto digitado ou opção escolhida. */
  valor?: string;
  /** Alterações no estado da cena quando o passo termina (troca de tela, abre modal…). */
  set?: Estado;
  legenda: string;
}

/**
 * Roteiro: uma réplica fiel de tela (feita com os mesmos estilos e textos do sistema, dados
 * fictícios) e a sequência de passos animados. Nunca chama a API.
 */
export interface Roteiro {
  id: string;
  titulo: string;
  /** Altura da réplica em pixels (largura fixa de 1280, reduzida para caber na página). */
  altura?: number;
  estadoInicial?: Estado;
  passos: Passo[];
  render: (e: Estado) => React.ReactNode;
}

export type Perfil = "todos" | "gestor" | "rh" | "superadmin";

export interface Tarefa {
  id: string;
  titulo: string;
  perfil: Perfil;
  resumo: string;
  antes?: string[];
  passos: string[];
  roteiro?: string;
  resultado?: string;
  problemas?: { problema: string; solucao: string }[];
  ver?: string[];
  /** Palavras extras para a busca. */
  palavras?: string;
  /** Rota do sistema que abre esta tarefa pelo botão "?". */
  rota?: string;
}

export interface Capitulo {
  id: string;
  titulo: string;
  perfil: Perfil;
  descricao: string;
  tarefas: Tarefa[];
}

/** Ponto de dado genérico para os gráficos categóricos do dashboard.
 * `key` carrega o valor "cru" (não traduzido) usado para filtrar
 * `detalheFuncionarios` quando o gráfico é clicável. */
export type ChartDatum = { name: string; value: number; key?: string };

/** Formato do argumento recebido pelo onClick de <Bar>/<Pie> do recharts. */
export type RechartsClickEntry<T> = T & { payload?: T };

/**
 * Paleta categórica validada (CVD-safe, ordem fixa) para gráficos do sistema.
 * Fonte única para manter um padrão visual único entre os dashboards
 * (Gestão de Funcionários, Auditoria etc.) — nunca reordenar nem gerar hues
 * ad hoc; ao precisar de mais séries, agrupar em "Outros" ou usar small
 * multiples em vez de estender a lista.
 */
export const CHART_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948" // red
];

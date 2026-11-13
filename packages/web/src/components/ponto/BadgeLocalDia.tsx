import React from "react";

/** Status do dia em que a casinha faz sentido: houve expediente/batidas (não em fim de semana sem expediente). */
const STATUS_COM_EXPEDIENTE = ["OK", "PENDENTE", "INCONSISTENTE"];

/** Ícone da casinha ao lado do status, para quem trabalhou o dia em home office. Sem texto. */
export function BadgeLocalDia({
  local,
  status
}: {
  local?: "HOME_OFFICE" | "PRESENCIAL";
  status?: string;
}) {
  if (local !== "HOME_OFFICE") return null;
  if (status && !STATUS_COM_EXPEDIENTE.includes(status)) return null;
  return (
    <span
      title="Dia trabalhado em home office"
      aria-label="Home office"
      style={{ fontSize: 15, lineHeight: 1, cursor: "default" }}
    >
      🏠
    </span>
  );
}

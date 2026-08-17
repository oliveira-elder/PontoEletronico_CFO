import React from "react";
import { MoonIcon, SunIcon, SunriseIcon } from "../icons";
import {
  classificarPeriodoHorario,
  labelPeriodoPonto,
  tituloPeriodoPonto,
  type PeriodoPonto
} from "../../utils/periodoPonto";

const ESTILO: Record<PeriodoPonto, { Icon: typeof SunriseIcon; color: string }> = {
  MATUTINO: { Icon: SunriseIcon, color: "#CA8A04" },
  VESPERTINO: { Icon: SunIcon, color: "#0284C7" },
  NOTURNO: { Icon: MoonIcon, color: "#4338CA" }
};

export function IconePeriodoPonto({ hora, size = 12 }: { hora: string; size?: number }) {
  const periodo = classificarPeriodoHorario(hora);
  if (!periodo) return null;
  const { Icon, color } = ESTILO[periodo];
  const titulo = tituloPeriodoPonto(periodo);
  return (
    <span
      title={titulo}
      role="img"
      aria-label={titulo}
      style={{ display: "inline-flex", lineHeight: 0, color, cursor: "help" }}
    >
      <Icon size={size} style={{ flexShrink: 0 }} />
    </span>
  );
}

const LEGENDA: PeriodoPonto[] = ["MATUTINO", "VESPERTINO", "NOTURNO"];

export function LegendaPeriodosPonto() {
  return (
    <>
      {LEGENDA.map((periodo) => {
        const { Icon, color } = ESTILO[periodo];
        const titulo = tituloPeriodoPonto(periodo);
        return (
          <span
            key={periodo}
            title={titulo}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              color: "var(--ink-500)",
              cursor: "help"
            }}
          >
            <Icon size={13} style={{ color, flexShrink: 0 }} />
            {labelPeriodoPonto(periodo)}
          </span>
        );
      })}
    </>
  );
}

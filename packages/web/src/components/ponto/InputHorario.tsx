import React, { useRef } from "react";
import { normalizarHorarioParcial } from "../../utils/horario-brasilia";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Campo de horário (HH:mm). Se o usuário preencher só a hora (ex.: 16),
 * os minutos são considerados 00 (16:00).
 */
export function InputHorario({ value, onChange, onBlur, onInput, ...rest }: Props) {
  const digitsRef = useRef("");

  function completarSeParcial(atual: string, digits: string): string | null {
    if (atual) {
      const norm = normalizarHorarioParcial(atual);
      return norm && norm !== atual ? norm : null;
    }
    if (!digits) return null;
    const norm = normalizarHorarioParcial(digits);
    return norm || null;
  }

  return (
    <input
      {...rest}
      type="time"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v) {
          digitsRef.current = "";
          onChange(v);
          return;
        }
        if (value) {
          digitsRef.current = "";
          onChange("");
        }
      }}
      onInput={(e) => {
        onInput?.(e);
        const input = e.currentTarget;
        const ne = e.nativeEvent as InputEvent;
        if (ne.inputType?.startsWith("delete") || ne.inputType === "historyUndo") {
          digitsRef.current = "";
          return;
        }
        if (ne.data && /^\d$/.test(ne.data)) {
          digitsRef.current += ne.data;
          if (!input.value && digitsRef.current.length >= 2) {
            const norm = normalizarHorarioParcial(digitsRef.current.slice(0, 2));
            if (norm) onChange(norm);
          }
        }
      }}
      onBlur={(e) => {
        const norm = completarSeParcial(e.target.value, digitsRef.current);
        if (norm) onChange(norm);
        digitsRef.current = "";
        onBlur?.(e);
      }}
    />
  );
}

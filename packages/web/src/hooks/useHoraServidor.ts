import { useCallback, useEffect, useRef } from "react";
import { api } from "./useApi";

/**
 * Relógio do coletor ancorado na hora do servidor (sincronizada com a Hora Legal Brasileira):
 * Anexo IX da Portaria MTP 671/2021, itens 2 e 3. Devolve uma função que entrega "agora" corrigido
 * pelo desvio medido entre o relógio do aparelho e o do servidor (reavaliado a cada 5 minutos).
 */
export function useHoraServidor(): () => Date {
  const desvio = useRef(0);

  useEffect(() => {
    let ativo = true;
    const medir = async () => {
      try {
        const t0 = Date.now();
        const r = await api.get<{ epochMs: number }>("/ponto/hora");
        const t1 = Date.now();
        if (ativo && typeof r?.epochMs === "number")
          desvio.current = r.epochMs + (t1 - t0) / 2 - t1;
      } catch {
        /* sem rede: mantém o último desvio conhecido */
      }
    };
    void medir();
    const t = setInterval(() => void medir(), 5 * 60_000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, []);

  return useCallback(() => new Date(Date.now() + desvio.current), []);
}

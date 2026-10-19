import { useCallback, useEffect, useState } from "react";
import { api } from "./useApi";
import { useAuth } from "../auth/AuthContext";

export interface ComprovanteItem {
  nsr: number;
  registroPontoId: string | null;
  data: string;
  hora: string;
  diaSemana: string;
  tipo: string;
  rotulo: string;
  homologacao: boolean;
  hash: string;
}

/** Comprovantes de Registro de Ponto do trabalhador (Portaria MTP 671/2021, arts. 79 e 80). */
export function useComprovantes(opts: { horas?: number; mes?: number; ano?: number } = {}) {
  const { token } = useAuth();
  const [itens, setItens] = useState<ComprovanteItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const { horas, mes, ano } = opts;

  const recarregar = useCallback(async () => {
    const tk = token();
    if (!tk) {
      setCarregando(false);
      return;
    }
    const qs = new URLSearchParams();
    if (mes && ano) {
      qs.set("mes", String(mes));
      qs.set("ano", String(ano));
    } else qs.set("horas", String(horas ?? 48));
    try {
      setItens(await api.get<ComprovanteItem[]>(`/ponto/comprovantes?${qs.toString()}`, tk));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [token, horas, mes, ano]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { itens, carregando, erro, recarregar };
}

/** Acha o comprovante de um registro do dia pelo id do registro ou, na falta dele, por tipo e hora. */
export function acharComprovante(
  itens: ComprovanteItem[],
  r: { id?: string; tipo: string; hora?: string; dataHora?: string }
): ComprovanteItem | undefined {
  if (r.id) {
    const porId = itens.find((c) => c.registroPontoId === r.id);
    if (porId) return porId;
  }
  const hora =
    r.hora ??
    (r.dataHora
      ? new Date(r.dataHora).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone: "America/Sao_Paulo"
        })
      : "");
  return itens.find((c) => c.tipo === r.tipo && c.hora === hora);
}

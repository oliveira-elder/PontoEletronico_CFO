import React, { createContext, useContext, useMemo } from "react";
import { api } from "../../hooks/useApi";

/**
 * Em quem a solicitação é feita. Vazio = o próprio usuário logado (funcionário). Com
 * `funcionarioId` = o RH abrindo o pedido em nome do funcionário: as consultas que o
 * formulário faz sobre "o funcionário" passam pelos endpoints do RH.
 */
export interface Solicitante {
  funcionarioId?: string;
}

const Ctx = createContext<Solicitante>({});

export function SolicitanteProvider({
  funcionarioId,
  children
}: {
  funcionarioId?: string;
  children: React.ReactNode;
}) {
  const v = useMemo(() => ({ funcionarioId }), [funcionarioId]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export const useSolicitante = () => useContext(Ctx);

const base = (id: string) => `/auditoria/rh/funcionarios/${id}`;

/** Troca as rotas do usuário logado pelas equivalentes do RH quando há `funcionarioId`. */
export function rotaDoSolicitante(path: string, funcionarioId?: string): string {
  if (!funcionarioId) return path;
  const [p, qs] = path.split("?");
  const mapa: Record<string, string> = {
    "/ponto/status": `${base(funcionarioId)}/solicitar/perfil`,
    "/ponto/ferias/saldo": `${base(funcionarioId)}/solicitar/perfil`,
    "/ponto/banco-horas/credito": `${base(funcionarioId)}/solicitar/credito-banco`,
    "/ponto/banco-horas/credito/simular": `${base(funcionarioId)}/solicitar/credito-banco/simular`,
    "/ponto/abono/cota": `${base(funcionarioId)}/solicitar/abono-cota`,
    "/ponto/licenca/tipos": `${base(funcionarioId)}/solicitar/licenca-tipos`
  };
  const destino = mapa[p];
  return destino ? destino + (qs ? `?${qs}` : "") : path;
}

/** Cliente de API que respeita o solicitante (use no lugar de `api` nos formulários). */
export function useApiSolicitante() {
  const { funcionarioId } = useSolicitante();
  return useMemo(
    () => ({
      funcionarioId,
      url: (path: string) => rotaDoSolicitante(path, funcionarioId),
      get: <T,>(path: string) => api.get<T>(rotaDoSolicitante(path, funcionarioId)),
      post: <T,>(path: string, body: unknown) =>
        api.post<T>(rotaDoSolicitante(path, funcionarioId), body)
    }),
    [funcionarioId]
  );
}

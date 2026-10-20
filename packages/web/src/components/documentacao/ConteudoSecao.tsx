import React from "react";
import { DocMarkdown } from "./DocMarkdown";
import type { Titulo } from "./markdown";
import type {
  BancoDoc,
  CoberturaDoc,
  JobDoc,
  RotaDoc,
  SecaoConteudo,
  StackDoc,
  VariavelDoc
} from "./tipos";
import {
  VistaAmbiente,
  VistaApis,
  VistaBanco,
  VistaCobertura,
  VistaJobs,
  VistaStack
} from "./VistasGeradas";

/** Parte gerada do código (rotas, banco, stack, rotinas…) já carregada do servidor. */
export type DadosVista = Record<string, unknown>;

/** Texto da seção (Markdown) seguido da parte gerada, quando houver. */
export function ConteudoSecao({
  secao,
  dados,
  compacto,
  foco,
  onTitulos
}: {
  secao: SecaoConteudo;
  dados?: DadosVista;
  compacto?: boolean;
  foco?: string | null;
  onTitulos?: (t: Titulo[]) => void;
}) {
  return (
    <div>
      {secao.markdown ? (
        <DocMarkdown
          fonte={secao.markdown}
          prefixo={secao.id}
          compacto={compacto}
          onTitulos={onTitulos}
        />
      ) : !secao.gerada ? (
        <p style={{ color: "#6c757d" }}>Seção ainda não escrita.</p>
      ) : null}
      {secao.gerada && !dados && <p style={{ color: "#6c757d" }}>Carregando dados gerados…</p>}
      {secao.gerada && dados && (
        <div style={{ marginTop: 12 }}>
          {secao.gerada === "api" && (
            <VistaApis
              rotas={(dados as { rotas: RotaDoc[] }).rotas}
              compacto={compacto}
              foco={foco}
            />
          )}
          {secao.gerada === "banco" && (
            <VistaBanco
              dados={dados as unknown as BancoDoc}
              vista={secao.vista ?? "der"}
              compacto={compacto}
              foco={foco}
            />
          )}
          {secao.gerada === "stack" && <VistaStack dados={dados as unknown as StackDoc} />}
          {secao.gerada === "jobs" && <VistaJobs jobs={(dados as { jobs: JobDoc[] }).jobs} />}
          {secao.gerada === "ambiente" && (
            <VistaAmbiente variaveis={(dados as { variaveis: VariavelDoc[] }).variaveis} />
          )}
          {secao.gerada === "cobertura" && (
            <VistaCobertura dados={dados as unknown as CoberturaDoc} />
          )}
        </div>
      )}
    </div>
  );
}

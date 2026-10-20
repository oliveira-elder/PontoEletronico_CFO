import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../hooks/useApi";
import { ConteudoSecao, type DadosVista } from "./ConteudoSecao";
import { EVENTO_DIAGRAMA } from "./MermaidDiagrama";
import { renderizarMarkdown } from "./markdown";
import type { AutoriaDoc, RevisaoDoc, SecaoConteudo, SecaoIndice } from "./tipos";

const br = (d: string) => d.split("-").reverse().join("/");

/**
 * Monta o documento completo (capa com autoria e versão, revisões, sumário e todas as seções) e abre a
 * impressão do navegador ("Salvar como PDF"). O restante da tela fica oculto pelo CSS de impressão.
 */
export function DocumentacaoImpressao({
  indice,
  autoria,
  revisoes,
  emitidoPor,
  onConcluir,
  onErro
}: {
  indice: SecaoIndice[];
  autoria: AutoriaDoc;
  revisoes: RevisaoDoc[];
  emitidoPor: string;
  onConcluir: () => void;
  onErro: (msg: string) => void;
}) {
  const [secoes, setSecoes] = useState<{ secao: SecaoConteudo; dados?: DadosVista }[] | null>(null);
  const disparou = useRef(false);
  const emitidoEm = useMemo(
    () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    []
  );

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const geradas = new Map<string, DadosVista>();
        const out: { secao: SecaoConteudo; dados?: DadosVista }[] = [];
        for (const s of indice) {
          const secao = await api.get<SecaoConteudo>(`/logs/documentacao/secao/${s.id}`);
          let dados: DadosVista | undefined;
          if (secao.gerada) {
            if (!geradas.has(secao.gerada))
              geradas.set(
                secao.gerada,
                await api.get<DadosVista>(`/logs/documentacao/gerado/${secao.gerada}`)
              );
            dados = geradas.get(secao.gerada);
          }
          out.push({ secao, dados });
        }
        if (ativo) setSecoes(out);
      } catch (e) {
        if (ativo) onErro((e as Error).message);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  /* Aguarda todos os diagramas desenharem e então imprime. */
  useEffect(() => {
    if (!secoes || disparou.current) return;
    let esperados = 0;
    for (const { secao, dados } of secoes) {
      if (secao.markdown)
        esperados += renderizarMarkdown(secao.markdown, secao.id).segmentos.filter(
          (x) => x.tipo === "mermaid"
        ).length;
      if (secao.gerada === "banco" && secao.vista === "der" && dados)
        esperados += 1 + ((dados as { dominios?: unknown[] }).dominios?.length ?? 0);
    }
    let prontos = 0;
    const imprimir = () => {
      if (disparou.current) return;
      disparou.current = true;
      window.removeEventListener(EVENTO_DIAGRAMA, aoPronto);
      document.body.classList.add("doc-imprimindo");
      const fim = () => {
        document.body.classList.remove("doc-imprimindo");
        window.removeEventListener("afterprint", fim);
        onConcluir();
      };
      window.addEventListener("afterprint", fim);
      setTimeout(() => window.print(), 300);
    };
    const aoPronto = () => {
      prontos += 1;
      if (prontos >= esperados) {
        clearTimeout(timer);
        setTimeout(imprimir, 400);
      }
    };
    window.addEventListener(EVENTO_DIAGRAMA, aoPronto);
    const timer = setTimeout(imprimir, 30_000);
    if (esperados === 0) imprimir();
    return () => {
      clearTimeout(timer);
      window.removeEventListener(EVENTO_DIAGRAMA, aoPronto);
    };
  }, [secoes]);

  const grupos: string[] = [];
  for (const s of indice) if (!grupos.includes(s.grupo)) grupos.push(s.grupo);

  const conteudo = (
    <div id="doc-print-root">
      <div className="doc-rodape-impressao">
        <span>Documentação Técnica — Sistema de Ponto Eletrônico (CFO)</span>
        <span>
          Versão {autoria.versaoAtual} · emitida em {emitidoEm}
        </span>
      </div>

      <section className="doc-capa">
        <h1 style={{ fontSize: 30, marginTop: 60 }}>Documentação Técnica</h1>
        <h2 style={{ fontWeight: 400, marginTop: 0 }}>
          Sistema de Ponto Eletrônico — Conselho Federal de Odontologia
        </h2>
        <p style={{ fontSize: 15 }}>
          <b>Versão da documentação:</b> {autoria.versaoAtual}
          <br />
          <b>Emitida em:</b> {emitidoEm} por {emitidoPor}
        </p>
        <div style={{ border: "1px solid #999", borderRadius: 6, padding: 12, margin: "18px 0" }}>
          <h3 style={{ marginTop: 0 }}>Autoria do Desenvolvimento</h3>
          <p>
            <b>Autor:</b> {autoria.autor}
            <br />
            <b>Data de entrega:</b> {br(autoria.dataEntrega)}
            <br />
            <b>Local de desenvolvimento:</b> {autoria.local}
            <br />
            <b>Gerente responsável:</b> {autoria.gerenteResponsavel}
            <br />
            <b>Solicitação de desenvolvimento:</b> {autoria.solicitacao}
          </p>
        </div>
        <h3>Revisões</h3>
        <div className="doc-tabela">
          <table>
            <thead>
              <tr>
                <th>Versão</th>
                <th>Tipo</th>
                <th>Desenvolvedor</th>
                <th>Revisor</th>
                <th>Data</th>
                <th>Comentário</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {revisoes.map((r) => (
                <tr
                  key={r.id}
                  style={
                    r.anuladaEm ? { textDecoration: "line-through", color: "#777" } : undefined
                  }
                >
                  <td>{r.versao}</td>
                  <td>{r.tipo === "AUTOMATICA" ? "automática" : "manual"}</td>
                  <td>{r.desenvolvedor}</td>
                  <td>{r.revisor ?? ""}</td>
                  <td>{br(r.dataRevisao)}</td>
                  <td style={{ whiteSpace: "pre-wrap" }}>{r.comentario}</td>
                  <td style={{ textDecoration: "none" }}>
                    {r.anuladaEm ? `ANULADA: ${r.motivoAnulacao ?? ""}` : "vigente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="doc-capa">
        <h2>Sumário</h2>
        {grupos.map((g) => (
          <div key={g}>
            <b>{g}</b>
            <ul>
              {indice
                .filter((s) => s.grupo === g)
                .map((s) => (
                  <li key={s.id}>{s.titulo}</li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      {!secoes && <p>Montando o documento…</p>}
      {secoes &&
        grupos.map((g) => (
          <div key={g}>
            <h1 className="doc-grupo-impresso">{g}</h1>
            {secoes
              .filter((x) => x.secao.grupo === g)
              .map(({ secao, dados }) => (
                <section key={secao.id} className="doc-secao-impressa-bloco">
                  <h2 style={{ borderBottom: "1px solid #999" }}>{secao.titulo}</h2>
                  <ConteudoSecao secao={secao} dados={dados} compacto />
                </section>
              ))}
          </div>
        ))}
    </div>
  );

  return createPortal(conteudo, document.body);
}

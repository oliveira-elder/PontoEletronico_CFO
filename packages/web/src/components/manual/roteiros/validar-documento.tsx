import React from "react";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";
import { InicioPagina } from "./registrar-entrada";

function Navegador({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 1280,
        minHeight: "inherit",
        background: "#dfe1e5",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div style={{ height: 38, display: "flex", alignItems: "flex-end", paddingLeft: 12, gap: 4 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: "8px 8px 0 0",
            padding: "8px 16px",
            fontSize: 12.5,
            width: 220
          }}
        >
          Verificação de documento
        </div>
      </div>
      <div
        style={{
          background: "#fff",
          height: 38,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          borderBottom: "1px solid #ddd"
        }}
      >
        <div
          style={{
            flex: 1,
            background: "#f1f3f4",
            borderRadius: 16,
            padding: "5px 14px",
            fontSize: 12.5,
            color: "#555"
          }}
        >
          🔒 ponto.cfo.org.br/verificar
        </div>
      </div>
      <div
        style={{
          flex: 1,
          background: "var(--cream-50)",
          display: "flex",
          justifyContent: "center",
          padding: 16,
          overflow: "hidden"
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Resultado({ e }: { e: Estado }) {
  const arquivo = e.resultado === "arquivo";
  const linhas: [string, string][] = [
    ["Documento", "Espelho de Ponto"],
    ["Competência", "09/2026"],
    ["Funcionário", "Maria S. (matrícula 0000)"],
    ["Situação", "Concluída"],
    ["Assinado pelo funcionário em", "02/10/2026 09:15"],
    ["Assinado pelo gestor em", "02/10/2026 14:40"],
    ["Selo ICP-Brasil (e-CNPJ)", "Aplicado em 02/10/2026 14:41"]
  ];
  return (
    <div
      style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}
      data-alvo="resultado"
    >
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: arquivo ? "rgba(21,128,61,0.07)" : "rgba(247,196,55,0.10)",
          border: arquivo ? "1px solid rgba(21,128,61,0.25)" : "1px solid rgba(180,83,9,0.30)"
        }}
      >
        <p style={{ fontWeight: 700, fontSize: 15, color: arquivo ? "#15803D" : "#92400E" }}>
          {arquivo
            ? "✓ DOCUMENTO VÁLIDO — arquivo original, íntegro"
            : "⚠ Registro localizado — o conteúdo ainda NÃO foi conferido"}
        </p>
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--ink-700)", lineHeight: 1.5 }}>
          {arquivo
            ? "O arquivo “Espelho-09-2026.pdf” é idêntico ao arquivado pelo sistema: não houve alteração."
            : "O QR Code / código só confirma que este registro existe. Uma cópia alterada ou convertida pode ter o mesmo código: envie o arquivo para conferir."}
        </p>
      </div>
      {linhas.map(([l, v]) => (
        <div key={l} style={{ display: "flex", gap: 8, fontSize: 13 }}>
          <span style={{ width: 200, color: "var(--ink-500)" }}>{l}</span>
          <strong style={{ flex: 1 }}>{v}</strong>
        </div>
      ))}
    </div>
  );
}

function Verificar({ e }: { e: Estado }) {
  return (
    <div
      style={{
        width: 600,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
        padding: 24,
        alignSelf: "flex-start",
        marginTop: 8
      }}
    >
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 21, color: "#6B0F1A" }}>
        Verificação de documento
      </h1>
      <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "4px 0 16px" }}>
        Sistema de Ponto Eletrônico — CFO. Confirme a autenticidade e a integridade de um Espelho de
        Ponto assinado ou de um Comprovante de Registro de Ponto.
      </p>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-700)", marginBottom: 6 }}>
        1. Envie o documento que você recebeu
      </p>
      <div
        data-alvo="area-arquivo"
        style={{
          border: "2px dashed rgba(122,30,38,0.25)",
          background: "#fcfbfa",
          borderRadius: 10,
          padding: "22px 16px",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: 26 }}>📄</div>
        <p style={{ margin: "6px 0 2px", fontSize: 13.5, fontWeight: 700, color: "#6B0F1A" }}>
          Arraste o arquivo (PDF, foto da página ou AFD/AEJ .txt) aqui ou clique para escolher
        </p>
        <p style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
          O arquivo não sai do seu computador: o navegador calcula a impressão digital e lê o texto
          (ou a foto, por OCR); só o resultado da leitura é comparado com o original.
        </p>
        {!!e.arquivo && (
          <p style={{ marginTop: 8, fontSize: 11.5, color: "var(--ink-700)" }}>
            Arquivo: <strong>Espelho-09-2026.pdf</strong>
          </p>
        )}
      </div>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-700)", margin: "16px 0 6px" }}>
        2. Ou informe o código de verificação impresso na declaração
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <div
          data-alvo="campo-codigo"
          style={{
            flex: 1,
            padding: "9px 11px",
            border: "1px solid rgba(122,30,38,0.2)",
            borderRadius: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            background: "#fff"
          }}
        >
          <span
            className={e.__digitando === "campo-codigo" ? "mk-caret" : undefined}
            style={{ color: e["campo-codigo"] ? "var(--ink-900)" : "var(--ink-500)" }}
          >
            {(e["campo-codigo"] as string) || "Código de verificação"}
          </span>
        </div>
        <span className="btn btn-primary" data-alvo="btn-verificar">
          Verificar
        </span>
      </div>
      {!!e.resultado && <Resultado e={e} />}
      <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 18 }}>
        Esta página exibe apenas dados mínimos, conforme a LGPD (Lei nº 13.709/2018). A validade da
        assinatura ICP-Brasil também pode ser conferida em https://validar.iti.gov.br.
      </p>
    </div>
  );
}

export const validarDocumento: Roteiro = {
  id: "validar-documento",
  titulo: "Validar um documento",
  altura: 860,
  estadoInicial: { pagina: "inicio" },
  render: (e) =>
    e.pagina === "inicio" ? (
      <Shell ativo="inicio" e={e}>
        <InicioPagina />
      </Shell>
    ) : (
      <Navegador>
        <Verificar e={e} />
      </Navegador>
    ),
  passos: [
    {
      acao: "clicar",
      alvo: "btn-validar",
      set: { pagina: "verificar" },
      legenda:
        "Na página Início, clique em “Validar documento”. Abre em uma nova aba e não exige login — qualquer pessoa pode conferir um documento."
    },
    {
      acao: "clicar",
      alvo: "area-arquivo",
      set: { arquivo: true, resultado: "arquivo" },
      legenda:
        "Opção 1: envie o PDF recebido (clique ou arraste). O arquivo não sai do seu computador: o navegador calcula a impressão digital dele."
    },
    {
      acao: "mover",
      alvo: "resultado",
      legenda:
        "“DOCUMENTO VÁLIDO — arquivo original, íntegro” significa que o arquivo é idêntico ao emitido pelo sistema. Se aparecer “ARQUIVO INVÁLIDO”, não aceite o documento."
    },
    {
      acao: "digitar",
      alvo: "campo-codigo",
      valor: "A1B2-C3D4-E5F6-7890-ABCD",
      set: { arquivo: false, resultado: "" },
      legenda:
        "Opção 2: digite o código de verificação impresso no documento (ou leia o QR Code com o celular)."
    },
    {
      acao: "clicar",
      alvo: "btn-verificar",
      set: { resultado: "codigo" },
      legenda:
        "Clique em “Verificar”. Só pelo código o sistema confirma que o registro existe; para garantir que o arquivo não foi alterado, envie também o PDF."
    }
  ]
};

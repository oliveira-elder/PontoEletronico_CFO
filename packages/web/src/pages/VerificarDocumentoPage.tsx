import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { extrairLinhasPdf, lerImagemOcr } from "../utils/leituraDocumento";

interface Verificacao {
  encontrado: boolean;
  arquivoNaoReconhecido?: boolean;
  codigo?: string;
  documento?: string;
  competencia?: string | null;
  funcionario?: string;
  matricula?: string;
  situacao?: string | null;
  assinaturas?: { funcionarioEm: string | null; gestorEm: string | null };
  arquivo?: {
    sha256: string | null;
    conferido: boolean | null;
    versaoAnterior?: { substituidoEm: string | null } | null;
  };
  seloIcpBrasil?: { aplicado: boolean; em: string | null };
  /** QR da página: registro + página + total, com selo do sistema. */
  registro?: {
    vigente: string | null;
    informado: string | null;
    situacao: "VIGENTE" | "ANTERIOR" | "DESCONHECIDO" | "SELO_INVALIDO" | null;
    pagina: number | null;
    total: number | null;
  } | null;
}

/** Resultado da conferência automática do conteúdo (texto do PDF ou OCR da foto). */
interface Conteudo {
  encontrado: boolean;
  registro: string | null;
  veredito: "CONFERE" | "ADULTERADO" | "DIVERGENCIAS" | "VERSAO_ANTERIOR" | "NAO_IDENTIFICADO";
  divergencias: Array<{ linha: string; trechos?: string[] }>;
  totalDivergencias?: number;
  linhasRemovidas: number;
  origem: "pdf" | "ocr";
}

async function postConteudo(body: {
  codigo?: string;
  linhas: string[];
  origem: "pdf" | "ocr";
}): Promise<Conteudo> {
  const r = await fetch("/api/ponto/verificar/conteudo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    throw new Error(j?.message ?? "Não foi possível conferir o conteúdo agora.");
  }
  return { ...((await r.json()) as Omit<Conteudo, "origem">), origem: body.origem };
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const SITUACAO: Record<string, string> = {
  CONCLUIDA: "Concluída (assinada pelo funcionário e pelo gestor)",
  PENDENTE_GESTOR: "Aguardando assinatura do gestor",
  PENDENTE_FUNCIONARIO: "Aguardando assinatura do funcionário",
  DISPENSADA: "Dispensada"
};

async function sha256Hex(file: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getJson(url: string): Promise<Verificacao> {
  const r = await fetch(url);
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    throw new Error(j?.message ?? "Não foi possível consultar agora. Tente novamente.");
  }
  return (await r.json()) as Verificacao;
}

/**
 * Página PÚBLICA (sem login) de verificação de autenticidade — destino do QR Code.
 * Duas formas: enviar o PDF recebido (conferência pelo SHA-256, calculado no navegador — o
 * arquivo não sai do computador) ou informar o código impresso na declaração.
 */
export function VerificarDocumentoPage() {
  const params = useParams();
  const [busca] = useSearchParams();
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);
  const [etapa, setEtapa] = useState("");
  const [codigo, setCodigo] = useState(params.codigo ?? "");
  const [dados, setDados] = useState<Verificacao | null>(null);
  const [arquivo, setArquivo] = useState<{ nome: string; sha: string } | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const codigoLimpo = codigo.replace(/\s+/g, "");

  async function consultarCodigo(c: string, sha?: string) {
    setCarregando(true);
    setErro("");
    try {
      const qs = new URLSearchParams();
      if (sha) qs.set("sha256", sha);
      /* Parâmetros do QR da página (registro, página, total e selo). */
      for (const k of ["r", "p", "t", "s"]) {
        const v = busca.get(k);
        if (v) qs.set(k, v);
      }
      const q = qs.toString() ? `?${qs.toString()}` : "";
      setDados(await getJson(`/api/ponto/verificar/${encodeURIComponent(c)}${q}`));
    } catch (e) {
      setDados(null);
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  async function conferirArquivo(file: File) {
    const ehImagem = file.type.startsWith("image/");
    if (!ehImagem && file.type && file.type !== "application/pdf") {
      setErro("Envie o PDF do documento ou uma foto/escaneamento da página.");
      return;
    }
    setCarregando(true);
    setErro("");
    setConteudo(null);
    try {
      if (ehImagem) {
        /* Papel: leitura por OCR no navegador e comparação automática com o original. */
        setArquivo({ nome: file.name, sha: "" });
        setEtapa("Lendo a imagem (OCR)…");
        const linhas = await lerImagemOcr(file, (pct) => setEtapa(`Lendo a imagem (OCR)… ${pct}%`));
        setEtapa("Comparando com o original…");
        const c = await postConteudo({ codigo: codigoLimpo || undefined, linhas, origem: "ocr" });
        setConteudo(c);
        if (codigoLimpo.length >= 16) await consultarCodigo(codigoLimpo);
        return;
      }
      setEtapa("Calculando a impressão digital do arquivo…");
      const sha = await sha256Hex(file);
      setArquivo({ nome: file.name, sha });
      /* Com código informado, confere aquele documento; sem código, localiza pelo arquivo. */
      const r =
        codigoLimpo.length >= 16
          ? await getJson(`/api/ponto/verificar/${encodeURIComponent(codigoLimpo)}?sha256=${sha}`)
          : await getJson(`/api/ponto/verificar/arquivo/${sha}`);
      setDados(r);
      if (r.codigo && !codigoLimpo) setCodigo(r.codigo);
      /* Não é o arquivo emitido: lê o texto e compara o CONTEÚDO com o original. */
      if (r.arquivo?.conferido !== true && !r.arquivo?.versaoAnterior) {
        setEtapa("Lendo o texto do PDF e comparando com o original…");
        const linhas = await extrairLinhasPdf(file);
        const c = await postConteudo({
          codigo: r.codigo ?? (codigoLimpo || undefined),
          linhas,
          origem: "pdf"
        });
        setConteudo(c);
      }
    } catch (e) {
      setDados(null);
      setErro((e as Error).message);
    } finally {
      setEtapa("");
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (params.codigo) void consultarCodigo(params.codigo.replace(/\s+/g, ""));
  }, []);

  const integridade = arquivo ? dados?.arquivo?.conferido : null;
  /* Cópia autêntica de uma versão anterior, substituída porque os dados mudaram. */
  const anterior = arquivo ? (dados?.arquivo?.versaoAnterior ?? null) : null;
  /* Código autêntico, mas o PDF enviado não confere com nenhuma versão emitida: inválido. */
  const conteudoConfere = conteudo?.veredito === "CONFERE";
  const invalido = integridade === false && !anterior && !conteudoConfere;
  const corAviso = anterior ? "#B45309" : invalido ? "#991B1B" : "#15803D";
  const cartao: React.CSSProperties = {
    width: "100%",
    maxWidth: 600,
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
    padding: 24,
    alignSelf: "flex-start",
    marginTop: 24
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--cream-50, #faf7f5)",
        display: "flex",
        justifyContent: "center",
        padding: 16
      }}
    >
      <div style={cartao}>
        <h1
          style={{ fontFamily: "var(--font-display)", fontSize: 21, color: "#6B0F1A", margin: 0 }}
        >
          Verificação de documento
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "4px 0 16px" }}>
          Sistema de Ponto Eletrônico — CFO. Confirme a autenticidade e a integridade de um Espelho
          de Ponto assinado.
        </p>

        {/* 1. Enviar o PDF */}
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-700)", margin: "0 0 6px" }}>
          1. Envie o PDF que você recebeu
        </p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void conferirArquivo(f);
          }}
          style={{
            border: `2px dashed ${arrastando ? "#6B0F1A" : "rgba(122,30,38,0.25)"}`,
            background: arrastando ? "rgba(107,15,26,0.04)" : "#fcfbfa",
            borderRadius: 10,
            padding: "22px 16px",
            textAlign: "center",
            cursor: "pointer"
          }}
        >
          <div style={{ fontSize: 26 }}>📄</div>
          <p style={{ margin: "6px 0 2px", fontSize: 13.5, fontWeight: 700, color: "#6B0F1A" }}>
            Arraste o PDF (ou a foto da página) aqui ou clique para escolher
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
            O arquivo não sai do seu computador: o navegador calcula a impressão digital e lê o
            texto (ou a foto, por OCR); só o resultado da leitura é comparado com o original.
          </p>
          {arquivo && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--ink-700)" }}>
              Arquivo: <strong>{arquivo.nome}</strong>
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void conferirArquivo(f);
              e.target.value = "";
            }}
          />
        </div>

        {/* 2. Ou o código */}
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-700)", margin: "16px 0 6px" }}>
          2. Ou informe o código de verificação impresso na declaração
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && codigoLimpo.length >= 16 && void consultarCodigo(codigoLimpo)
            }
            placeholder="Código de verificação"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "9px 11px",
              border: "1px solid rgba(122,30,38,0.2)",
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 12
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={carregando || codigoLimpo.length < 16}
            onClick={() => {
              setArquivo(null);
              void consultarCodigo(codigoLimpo);
            }}
          >
            {carregando ? "Consultando…" : "Verificar"}
          </button>
        </div>

        {etapa && (
          <p style={{ fontSize: 12.5, color: "var(--ink-600)", marginTop: 12 }}>⏳ {etapa}</p>
        )}
        {erro && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 14 }}>⚠️ {erro}</p>}

        {/* QR da página: selo do sistema (registro + página + total) */}
        {dados?.registro?.situacao && (
          <div
            role={dados.registro.situacao === "SELO_INVALIDO" ? "alert" : undefined}
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              fontSize: 12.5,
              background:
                dados.registro.situacao === "VIGENTE"
                  ? "rgba(21,128,61,0.07)"
                  : dados.registro.situacao === "ANTERIOR"
                    ? "rgba(247,196,55,0.10)"
                    : "#FEE2E2",
              border:
                dados.registro.situacao === "VIGENTE"
                  ? "1px solid rgba(21,128,61,0.25)"
                  : dados.registro.situacao === "ANTERIOR"
                    ? "1px solid rgba(180,83,9,0.30)"
                    : "2px solid #B91C1C"
            }}
          >
            <strong>
              {dados.registro.situacao === "VIGENTE"
                ? `✓ QR Code da página ${dados.registro.pagina} de ${dados.registro.total} — selo válido, registro vigente`
                : dados.registro.situacao === "ANTERIOR"
                  ? `⚠ QR Code de uma versão ANTERIOR do documento (página ${dados.registro.pagina} de ${dados.registro.total})`
                  : dados.registro.situacao === "SELO_INVALIDO"
                    ? "✕ QR Code FALSIFICADO — o selo não foi emitido pelo sistema"
                    : "✕ Registro desconhecido para este documento"}
            </strong>
            <div style={{ marginTop: 4, color: "var(--ink-600)", fontFamily: "var(--font-mono)" }}>
              Registro no QR: {dados.registro.informado} · vigente: {dados.registro.vigente}
            </div>
            {dados.registro.situacao === "VIGENTE" && (
              <div style={{ marginTop: 4, color: "var(--ink-600)" }}>
                O QR confirma a página, mas não o que está impresso: envie o PDF ou uma foto da
                página no item 1 para a conferência automática do conteúdo.
              </div>
            )}
          </div>
        )}

        {/* Conferência automática do conteúdo */}
        {conteudo && <ResultadoConteudo c={conteudo} nome={arquivo?.nome ?? ""} />}

        {/* Resultado */}
        {dados && !dados.encontrado && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 10,
              background: "rgba(200,57,63,0.06)",
              border: "1px solid rgba(200,57,63,0.25)"
            }}
          >
            <p style={{ color: "var(--red)", fontWeight: 700, margin: 0 }}>
              {dados.arquivoNaoReconhecido
                ? "✕ Arquivo não reconhecido"
                : "✕ Documento não localizado"}
            </p>
            {dados.arquivoNaoReconhecido && arquivo && (
              <p
                style={{
                  fontSize: 12.5,
                  margin: "6px 0 0",
                  padding: "6px 8px",
                  background: "#fff",
                  border: "1px solid rgba(200,57,63,0.2)",
                  borderRadius: 6,
                  wordBreak: "break-all"
                }}
              >
                📄 <strong>{arquivo.nome}</strong>
              </p>
            )}
            <p style={{ fontSize: 12.5, color: "var(--ink-700)", margin: "6px 0 0" }}>
              {dados.arquivoNaoReconhecido
                ? `O arquivo ${arquivo ? `“${arquivo.nome}”` : "enviado"} não corresponde a nenhum documento assinado arquivado: pode ter sido alterado, ser uma cópia de outra versão ou não ter sido emitido por este sistema. Confira pelo código impresso na declaração.`
                : "Confira o código impresso na última página do documento."}
            </p>
          </div>
        )}

        {dados?.encontrado && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              role={invalido ? "alert" : undefined}
              style={{
                padding: invalido ? 16 : 14,
                borderRadius: 10,
                background: anterior
                  ? "rgba(247,196,55,0.10)"
                  : invalido
                    ? "#FEE2E2"
                    : "rgba(21,128,61,0.07)",
                border: anterior
                  ? "1px solid rgba(180,83,9,0.30)"
                  : invalido
                    ? "2px solid #B91C1C"
                    : "1px solid rgba(21,128,61,0.25)",
                borderLeft: invalido ? "6px solid #B91C1C" : undefined
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontWeight: 700,
                  fontSize: invalido ? 17 : 15,
                  color: corAviso
                }}
              >
                {anterior
                  ? "⚠ Cópia autêntica de uma versão ANTERIOR do documento"
                  : invalido
                    ? "✕ ARQUIVO INVÁLIDO — não confere com o documento original"
                    : integridade === true
                      ? "✓ Documento autêntico e arquivo íntegro"
                      : "✓ Documento autêntico"}
              </p>
              {invalido && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#991B1B",
                    wordBreak: "break-all"
                  }}
                >
                  📄 {arquivo?.nome}
                </p>
              )}
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: invalido ? 13 : 12,
                  color: invalido ? "#7F1D1D" : "var(--ink-700)",
                  lineHeight: 1.5
                }}
              >
                {anterior
                  ? `O arquivo “${arquivo?.nome ?? ""}” foi emitido pelo sistema, mas foi substituído${anterior.substituidoEm ? ` em ${fmt(anterior.substituidoEm)}` : ""} porque os dados do documento mudaram (ex.: correção de ponto ou assinatura). Baixe novamente para obter a versão vigente.`
                  : integridade === true
                    ? `O arquivo “${arquivo?.nome ?? ""}” é idêntico ao arquivado pelo sistema: não houve alteração.`
                    : invalido
                      ? `Este arquivo NÃO corresponde a nenhuma versão emitida pelo sistema para este documento: ele pode ter sido ADULTERADO ou não foi emitido pelo CFO. Não o aceite como válido. O código informado pertence a um documento autêntico — solicite a via original ao RH ou baixe-a pelo sistema.`
                      : "Para confirmar que o seu arquivo não foi alterado, envie o PDF no item 1."}
              </p>
            </div>

            {invalido && (
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--ink-500)" }}>
                Dados abaixo: documento ORIGINAL vinculado ao código (não ao arquivo enviado).
              </p>
            )}
            {(
              [
                ["Documento", dados.documento],
                ["Competência", dados.competencia],
                ["Funcionário", `${dados.funcionario} (matrícula ${dados.matricula})`],
                ["Situação", SITUACAO[dados.situacao ?? ""] ?? dados.situacao],
                ["Assinado pelo funcionário em", fmt(dados.assinaturas?.funcionarioEm)],
                ["Assinado pelo gestor em", fmt(dados.assinaturas?.gestorEm)],
                [
                  "Selo ICP-Brasil (e-CNPJ)",
                  dados.seloIcpBrasil?.aplicado
                    ? `Aplicado em ${fmt(dados.seloIcpBrasil.em)}`
                    : "Ainda não aplicado"
                ]
              ] as Array<[string, string | null | undefined]>
            ).map(([l, v]) => (
              <div key={l} style={{ display: "flex", gap: 8, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ width: 200, color: "var(--ink-500)" }}>{l}</span>
                <strong style={{ flex: 1, minWidth: 180 }}>{v ?? "—"}</strong>
              </div>
            ))}
            {dados.arquivo?.sha256 && (
              <p
                style={{ fontSize: 11, color: "var(--ink-500)", wordBreak: "break-all", margin: 0 }}
              >
                SHA-256 do arquivo original: {dados.arquivo.sha256}
              </p>
            )}
          </div>
        )}

        <p style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 18 }}>
          Esta página exibe apenas dados mínimos, conforme a LGPD (Lei nº 13.709/2018). A validade
          da assinatura ICP-Brasil também pode ser conferida em https://validar.iti.gov.br.
        </p>
      </div>
    </div>
  );
}

/** Resultado da conferência automática do conteúdo (texto do PDF ou OCR da foto). */
function ResultadoConteudo({ c, nome }: { c: Conteudo; nome: string }) {
  const cfg = {
    CONFERE: {
      cor: "#15803D",
      fundo: "rgba(21,128,61,0.07)",
      borda: "1px solid rgba(21,128,61,0.25)",
      titulo:
        c.origem === "ocr"
          ? "✓ A leitura da foto confere com o original"
          : "✓ O conteúdo do arquivo confere com o original",
      texto:
        c.origem === "ocr"
          ? "Datas, horários e horas lidos na imagem coincidem com o documento arquivado."
          : "O texto é idêntico ao do documento arquivado (o arquivo foi regravado/reimpresso em PDF, mas o conteúdo não foi alterado)."
    },
    ADULTERADO: {
      cor: "#991B1B",
      fundo: "#FEE2E2",
      borda: "2px solid #B91C1C",
      titulo: "✕ DOCUMENTO ADULTERADO — o conteúdo não confere com o original",
      texto: `O arquivo “${nome}” contém ${c.totalDivergencias ?? c.divergencias.length} trecho(s) que NÃO existem no documento original${c.linhasRemovidas ? ` e ${c.linhasRemovidas} linha(s) de dia do original foram removidas` : ""}. Não o aceite como válido.`
    },
    DIVERGENCIAS: {
      cor: "#991B1B",
      fundo: "#FEE2E2",
      borda: "2px solid #B91C1C",
      titulo: "✕ DIVERGÊNCIAS encontradas na leitura da foto",
      texto:
        "Os valores abaixo, lidos na imagem, não existem no documento original. Se a foto estiver nítida, o papel foi alterado. Em caso de dúvida, envie uma foto mais nítida ou o PDF."
    },
    VERSAO_ANTERIOR: {
      cor: "#B45309",
      fundo: "rgba(247,196,55,0.10)",
      borda: "1px solid rgba(180,83,9,0.30)",
      titulo: "⚠ Versão ANTERIOR do documento",
      texto:
        "O nº de registro lido pertence a uma versão substituída porque os dados mudaram. Solicite a versão vigente."
    },
    NAO_IDENTIFICADO: {
      cor: "#991B1B",
      fundo: "#FEE2E2",
      borda: "2px solid #B91C1C",
      titulo: "✕ Documento não identificado",
      texto:
        "Não foi encontrado o nº de registro de um documento emitido pelo sistema. Informe o código de verificação (item 2) e envie novamente; se ainda assim não for identificado, o documento não é autêntico."
    }
  }[c.veredito];
  return (
    <div
      role={cfg.cor === "#991B1B" ? "alert" : undefined}
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 10,
        background: cfg.fundo,
        border: cfg.borda,
        borderLeft: cfg.cor === "#991B1B" ? "6px solid #B91C1C" : undefined
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, fontSize: 15.5, color: cfg.cor }}>{cfg.titulo}</p>
      <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.5 }}>
        {cfg.texto}
      </p>
      {c.registro && (
        <p style={{ margin: "6px 0 0", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>
          Registro: {c.registro}
        </p>
      )}
      {c.divergencias.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "#7F1D1D" }}>
          {c.divergencias.map((d, i) => (
            <li key={i} style={{ marginBottom: 3, wordBreak: "break-word" }}>
              {d.trechos?.length ? (
                <>
                  <strong>{d.trechos.join(", ")}</strong> — em “{d.linha}”
                </>
              ) : (
                <>“{d.linha}”</>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

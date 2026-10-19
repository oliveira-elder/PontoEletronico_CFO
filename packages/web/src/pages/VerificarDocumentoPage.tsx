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
  veredito:
    | "CONFERE"
    | "ADULTERADO"
    | "INCOMPLETO"
    | "DIVERGENCIAS"
    | "VERSAO_ANTERIOR"
    | "NAO_IDENTIFICADO";
  valoresAusentes?: number;
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

interface ConteudoMarcacao {
  encontrado: boolean;
  registro?: string;
  veredito: "CONFERE" | "DIVERGENTE" | "NAO_IDENTIFICADO";
  divergencias: string[];
  origem: "pdf" | "ocr";
}

async function postConteudoMarcacao(body: {
  hash?: string;
  linhas: string[];
  origem: "pdf" | "ocr";
}): Promise<ConteudoMarcacao> {
  const r = await fetch("/api/ponto/verificar-marcacao/conteudo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    throw new Error(j?.message ?? "Não foi possível conferir o conteúdo agora.");
  }
  return { ...((await r.json()) as Omit<ConteudoMarcacao, "origem">), origem: body.origem };
}

const REGISTRO_CRP = /CRP-\d{9}-[0-9A-F]{8}/i;

interface MarcacaoVerificada {
  encontrado: boolean;
  registro?: string;
  selo?: "VALIDO" | "SELO_INVALIDO" | "REGISTRO_DIFERENTE" | null;
  arquivoOriginal?: boolean;
  nsr?: string;
  data?: string;
  hora?: string;
  empregador?: { nome: string; cnpj: string };
  inpi?: string | null;
  homologacao?: boolean;
}

/** Comprovante de Registro de Ponto: o código é o hash SHA-256 (64 hexadecimais) da marcação. */
async function getMarcacao(hash: string, qs = ""): Promise<MarcacaoVerificada> {
  const r = await fetch(`/api/ponto/verificar-marcacao/${encodeURIComponent(hash)}${qs}`);
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    throw new Error(j?.message ?? "Não foi possível consultar agora. Tente novamente.");
  }
  return (await r.json()) as MarcacaoVerificada;
}

async function getArquivoMarcacao(sha: string): Promise<MarcacaoVerificada> {
  const r = await fetch(`/api/ponto/verificar-marcacao/arquivo/${sha}`);
  if (!r.ok) return { encontrado: false };
  return (await r.json()) as MarcacaoVerificada;
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
  const [marcacao, setMarcacao] = useState<MarcacaoVerificada | null>(null);
  const [conteudoMarc, setConteudoMarc] = useState<ConteudoMarcacao | null>(null);
  const [arquivo, setArquivo] = useState<{ nome: string; sha: string } | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const codigoLimpo = codigo.replace(/\s+/g, "");

  async function consultarCodigo(c: string, sha?: string) {
    setCarregando(true);
    setErro("");
    setMarcacao(null);
    try {
      if (/^[0-9a-fA-F]{64}$/.test(c)) {
        setDados(null);
        /* Parâmetros do QR do comprovante (registro, página, total e selo). */
        const qrs = new URLSearchParams();
        for (const k of ["r", "p", "t", "s"]) {
          const v = busca.get(k);
          if (v) qrs.set(k, v);
        }
        const m = await getMarcacao(c.toLowerCase(), qrs.toString() ? `?${qrs.toString()}` : "");
        /* O arquivo enviado (se houver) só é "original" se a impressão digital for a de um PDF emitido. */
        setMarcacao(
          sha
            ? { ...m, arquivoOriginal: (await getArquivoMarcacao(sha)).registro === m.registro }
            : m
        );
        return;
      }
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
    setConteudoMarc(null);
    const modoComprovante = /^[0-9a-fA-F]{64}$/.test(codigoLimpo);
    try {
      if (ehImagem) {
        /* Papel: leitura por OCR no navegador e comparação automática com o original. */
        setArquivo({ nome: file.name, sha: "" });
        setEtapa("Lendo a imagem (OCR)…");
        const linhas = await lerImagemOcr(file, (pct) => setEtapa(`Lendo a imagem (OCR)… ${pct}%`));
        setEtapa("Comparando com o original…");
        if (modoComprovante || REGISTRO_CRP.test(linhas.join(" "))) {
          setDados(null);
          setConteudoMarc(
            await postConteudoMarcacao({
              hash: modoComprovante ? codigoLimpo.toLowerCase() : undefined,
              linhas,
              origem: "ocr"
            })
          );
          if (modoComprovante) await consultarCodigo(codigoLimpo);
          return;
        }
        const c = await postConteudo({ codigo: codigoLimpo || undefined, linhas, origem: "ocr" });
        setConteudo(c);
        if (codigoLimpo.length >= 16) await consultarCodigo(codigoLimpo);
        return;
      }
      setEtapa("Calculando a impressão digital do arquivo…");
      const sha = await sha256Hex(file);
      setArquivo({ nome: file.name, sha });
      /* Comprovante de ponto (código = hash de 64 caracteres): confere arquivo e conteúdo. */
      if (modoComprovante) {
        await consultarCodigo(codigoLimpo, sha);
        const original = (await getArquivoMarcacao(sha)).encontrado;
        if (!original) {
          setEtapa("Lendo o texto do PDF e comparando com o original…");
          setConteudoMarc(
            await postConteudoMarcacao({
              hash: codigoLimpo.toLowerCase(),
              linhas: await extrairLinhasPdf(file),
              origem: "pdf"
            })
          );
        }
        return;
      }
      /* Com código informado, confere aquele documento; sem código, localiza pelo arquivo. */
      const r =
        codigoLimpo.length >= 16
          ? await getJson(`/api/ponto/verificar/${encodeURIComponent(codigoLimpo)}?sha256=${sha}`)
          : await getJson(`/api/ponto/verificar/arquivo/${sha}`);
      if (!r.encontrado && !codigoLimpo) {
        /* Não é folha de ponto: pode ser um comprovante de registro de ponto. */
        const a = await getArquivoMarcacao(sha);
        if (a.encontrado) {
          setDados(null);
          setMarcacao({ ...a, arquivoOriginal: true });
          return;
        }
        const linhasCrp = await extrairLinhasPdf(file);
        if (REGISTRO_CRP.test(linhasCrp.join(" "))) {
          setDados(null);
          setConteudoMarc(await postConteudoMarcacao({ linhas: linhasCrp, origem: "pdf" }));
          return;
        }
      }
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
  /* Só o ARQUIVO ORIGINAL (impressão digital idêntica) é válido. O QR sozinho não comprova o
     conteúdo: uma cópia convertida/alterada carrega o mesmo QR. */
  const semArquivo = !arquivo;
  const invalido = integridade === false && !anterior;
  const corAviso = anterior || semArquivo ? "#B45309" : invalido ? "#991B1B" : "#15803D";
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

        {/* Comprovante de Registro de Ponto (art. 79): confere pelo hash da marcação */}
        {/* Conferência do conteúdo do comprovante (texto do PDF ou OCR da foto) */}
        {conteudoMarc && (
          <div
            role="status"
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.6,
              background:
                conteudoMarc.veredito === "CONFERE"
                  ? "#FFFBEB"
                  : conteudoMarc.veredito === "DIVERGENTE"
                    ? "#FEF2F2"
                    : "#F3F4F6",
              border: `1px solid ${
                conteudoMarc.veredito === "CONFERE"
                  ? "#FDE68A"
                  : conteudoMarc.veredito === "DIVERGENTE"
                    ? "#FECACA"
                    : "#D1D5DB"
              }`,
              color:
                conteudoMarc.veredito === "DIVERGENTE"
                  ? "#991B1B"
                  : conteudoMarc.veredito === "CONFERE"
                    ? "#92400E"
                    : "var(--ink-700)"
            }}
          >
            {conteudoMarc.veredito === "CONFERE" && (
              <>
                <strong>
                  O texto confere com o comprovante original, mas o arquivo NÃO é o PDF emitido.
                </strong>{" "}
                É uma cópia, conversão ou {conteudoMarc.origem === "ocr" ? "foto" : "reprodução"}:
                não tem a assinatura nem a impressão digital do original. Para efeito de prova,
                exija o PDF original.
              </>
            )}
            {conteudoMarc.veredito === "DIVERGENTE" && (
              <>
                <strong>✕ Documento adulterado ou inválido.</strong> Estes dados não conferem com o
                comprovante original: {conteudoMarc.divergencias.join(", ")}.
              </>
            )}
            {conteudoMarc.veredito === "NAO_IDENTIFICADO" && (
              <>
                <strong>Não foi possível identificar o comprovante</strong> a partir do arquivo.
                Informe o hash da marcação (64 caracteres) acima e envie o arquivo de novo.
              </>
            )}
          </div>
        )}

        {marcacao && (
          <div
            role="status"
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 10,
              fontSize: 13,
              background: marcacao.encontrado ? "#F0FDF4" : "#FEF2F2",
              border: `1px solid ${marcacao.encontrado ? "#BBF7D0" : "#FECACA"}`,
              color: marcacao.encontrado ? "#166534" : "#991B1B"
            }}
          >
            {marcacao.encontrado ? (
              <>
                <strong>✓ Comprovante autêntico.</strong> Existe no livro do REP uma marcação com
                este hash:
                <div style={{ marginTop: 6, color: "var(--ink-900)", lineHeight: 1.6 }}>
                  NSR <strong style={{ fontFamily: "var(--font-mono)" }}>{marcacao.nsr}</strong> ·{" "}
                  {marcacao.data} às <strong>{marcacao.hora}</strong>
                  <br />
                  {marcacao.empregador?.nome} · CNPJ {marcacao.empregador?.cnpj}
                  <br />
                  {marcacao.inpi
                    ? `Registro do programa no INPI nº ${marcacao.inpi}`
                    : "Registro do programa no INPI em andamento"}
                </div>
                {marcacao.selo === "SELO_INVALIDO" && (
                  <p style={{ margin: "8px 0 0", color: "#991B1B", fontWeight: 700 }}>
                    ✕ O QR Code deste documento não tem o selo do sistema: pode ter sido forjado.
                  </p>
                )}
                {marcacao.selo === "REGISTRO_DIFERENTE" && (
                  <p style={{ margin: "8px 0 0", color: "#B45309", fontWeight: 700 }}>
                    O selo é autêntico, mas pertence a outro comprovante.
                  </p>
                )}
                {marcacao.arquivoOriginal === undefined && (
                  <p style={{ margin: "8px 0 0", color: "#B45309", fontWeight: 600 }}>
                    O QR Code sozinho não comprova o conteúdo: envie o PDF (ou uma foto) do
                    comprovante abaixo para conferir se ele é o original.
                  </p>
                )}
                {marcacao.arquivoOriginal === false && (
                  <p style={{ margin: "8px 0 0", color: "#991B1B", fontWeight: 700 }}>
                    ✕ O arquivo enviado NÃO é o PDF original emitido pelo sistema.
                  </p>
                )}
                {marcacao.arquivoOriginal === true && (
                  <p style={{ margin: "8px 0 0", color: "#166534", fontWeight: 700 }}>
                    ✓ O arquivo enviado é o PDF original emitido pelo sistema.
                  </p>
                )}
                {marcacao.homologacao && (
                  <p style={{ margin: "8px 0 0", color: "#B45309", fontWeight: 700 }}>
                    Marcação anterior ao início da operação como REP-P (homologação): o comprovante
                    não tem validade jurídica.
                  </p>
                )}
              </>
            ) : (
              <>
                <strong>✕ Hash não encontrado.</strong> Nenhuma marcação do livro do REP tem este
                código: o comprovante pode ser falso ou ter sido digitado errado.
              </>
            )}
          </div>
        )}

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
                background:
                  anterior || semArquivo
                    ? "rgba(247,196,55,0.10)"
                    : invalido
                      ? "#FEE2E2"
                      : "rgba(21,128,61,0.07)",
                border:
                  anterior || semArquivo
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
                      ? "✓ DOCUMENTO VÁLIDO — arquivo original, íntegro"
                      : "⚠ Registro localizado — o conteúdo ainda NÃO foi conferido"}
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
                      ? `Este arquivo NÃO é o original emitido pelo sistema (foi alterado, convertido — ex.: Word — ou regravado). Não o aceite como válido. O resultado da conferência do conteúdo está acima; o código pertence a um documento autêntico — solicite a via original ao RH ou baixe-a pelo sistema.`
                      : "O QR Code / código só confirma que este registro existe. Uma cópia alterada ou convertida (ex.: Word) carrega o MESMO QR Code — por isso, envie o PDF recebido ou uma foto/escaneamento da página no item 1 para a conferência automática do conteúdo."}
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
    CONFERE:
      c.origem === "ocr"
        ? {
            cor: "#15803D",
            fundo: "rgba(21,128,61,0.07)",
            borda: "1px solid rgba(21,128,61,0.25)",
            titulo: "✓ A leitura da foto confere com o original",
            texto: "Datas, horários e horas lidos na imagem coincidem com o documento arquivado."
          }
        : {
            cor: "#B45309",
            fundo: "rgba(247,196,55,0.10)",
            borda: "1px solid rgba(180,83,9,0.30)",
            titulo: "⚠ Valores iguais aos do original, mas o ARQUIVO NÃO É O ORIGINAL",
            texto: `O arquivo “${nome}” foi regravado ou convertido (ex.: Word, “imprimir em PDF”). Não foram encontrados valores alterados, mas só o arquivo original emitido pelo sistema tem validade: solicite ou baixe o original.`
          },
    INCOMPLETO: {
      cor: "#991B1B",
      fundo: "#FEE2E2",
      borda: "2px solid #B91C1C",
      titulo: "✕ ARQUIVO NÃO É O ORIGINAL — conteúdo incompleto",
      texto: `O arquivo “${nome}” foi convertido/regravado e ${c.valoresAusentes ?? 0} valor(es) do documento original (datas, horários ou horas) não estão nele — podem ter sido removidos ou perdidos na conversão. Não o aceite como válido.`
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

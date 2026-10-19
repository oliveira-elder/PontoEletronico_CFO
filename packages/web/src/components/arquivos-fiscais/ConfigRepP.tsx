import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../hooks/useApi";

type Situacao = "HOMOLOGACAO" | "PRONTO" | "AGENDADO" | "OPERACAO";

interface Ident {
  repInpiRegistro: string | null;
  repCnoCaepf: string | null;
  repLocalPrestacao: string | null;
  repResponsavelCpf: string | null;
  ptrpNome: string | null;
  ptrpDesenvolvedorCnpj: string | null;
  ptrpDesenvolvedorRazao: string | null;
  ptrpDesenvolvedorEmail: string | null;
  versaoSistema: string;
}

interface Estado {
  situacao: Situacao;
  inicio: string | null;
  pendencias: string[];
  certificadoInpi: { numero: string | null; data: string | null } | null;
  relogio: { em: string; desvioMs: number | null; servidor: string; erro?: string } | null;
}

interface PainelRep {
  identificacao: Ident;
  estado: Estado;
  livro: {
    nsrAtual: number;
    marcacoes: number;
    eventos: number;
    bloqueio: string | null;
    instanciaAtual: { codigo: string } | null;
    verificacaoCadeia: { em: string; ok: boolean; marcacoes: number; detalhe?: string } | null;
  };
  certificadoIcp: {
    instalado: boolean;
    titular: string | null;
    validadeAte: string | null;
    motivo: string | null;
  };
}

interface EtapaInpi {
  feito?: boolean;
  data?: string;
  responsavel?: string;
}

interface RegistroInpi {
  etapasModelo: Array<{ chave: string; rotulo: string }>;
  registro: {
    versao: string;
    etapas: Record<string, EtapaInpi>;
    hashCodigoFonte: string | null;
    protocoloNumero: string | null;
    certificadoNumero: string | null;
    certificadoData: string | null;
    certificadoPdfNome: string | null;
    temPdf: boolean;
  } | null;
}

const INPUT = { padding: "7px 9px", border: "1px solid rgba(122,30,38,0.2)", borderRadius: 8 };
const CARTAO = {
  background: "#fff",
  border: "1px solid rgba(122,30,38,0.10)",
  borderRadius: 12,
  padding: 18,
  marginTop: 18
} as const;

const SITUACAO: Record<Situacao, { rotulo: string; fundo: string; texto: string; borda: string }> =
  {
    HOMOLOGACAO: { rotulo: "Em homologação", fundo: "#FFFBEB", texto: "#92400E", borda: "#FDE68A" },
    PRONTO: { rotulo: "Pronto para iniciar", fundo: "#EFF6FF", texto: "#1E40AF", borda: "#BFDBFE" },
    AGENDADO: { rotulo: "Início agendado", fundo: "#EFF6FF", texto: "#1E40AF", borda: "#BFDBFE" },
    OPERACAO: {
      rotulo: "Em operação como REP-P",
      fundo: "#F0FDF4",
      texto: "#166534",
      borda: "#BBF7D0"
    }
  };

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const br = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function lerArquivo(f: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(f);
  });
}

/** Configurações → Institucional: REP-P (Portaria MTP 671/2021, arts. 78 e 91) e registro no INPI. */
export function ConfigRepP() {
  const [painel, setPainel] = useState<PainelRep | null>(null);
  const [ident, setIdent] = useState<Ident | null>(null);
  const [inpi, setInpi] = useState<RegistroInpi | null>(null);
  const [etapas, setEtapas] = useState<Record<string, EtapaInpi>>({});
  const [reg, setReg] = useState({ hash: "", protocolo: "", certNumero: "", certData: "" });
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [inicioQuando, setInicioQuando] = useState("");
  const pdfRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        api.get<PainelRep>("/ponto/config/rep-p"),
        api.get<RegistroInpi>("/ponto/config/registro-inpi")
      ]);
      setPainel(p);
      setIdent(p.identificacao);
      setInpi(r);
      setEtapas(r.registro?.etapas ?? {});
      setReg({
        hash: r.registro?.hashCodigoFonte ?? "",
        protocolo: r.registro?.protocoloNumero ?? "",
        certNumero: r.registro?.certificadoNumero ?? "",
        certData: r.registro?.certificadoData ?? ""
      });
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const operacao = painel?.estado.situacao === "OPERACAO" || painel?.estado.situacao === "AGENDADO";

  async function salvarTudo() {
    if (!ident) return;
    setSalvando(true);
    setMsg("");
    try {
      await api.put("/ponto/config/rep-p", {
        repInpiRegistro: ident.repInpiRegistro,
        repCnoCaepf: ident.repCnoCaepf,
        repLocalPrestacao: ident.repLocalPrestacao,
        repResponsavelCpf: ident.repResponsavelCpf,
        ptrpNome: ident.ptrpNome,
        ptrpDesenvolvedorCnpj: ident.ptrpDesenvolvedorCnpj,
        ptrpDesenvolvedorRazao: ident.ptrpDesenvolvedorRazao,
        ptrpDesenvolvedorEmail: ident.ptrpDesenvolvedorEmail
      });
      await api.put("/ponto/config/registro-inpi", {
        etapas,
        hashCodigoFonte: reg.hash || null,
        protocoloNumero: reg.protocolo || null,
        certificadoNumero: reg.certNumero || null,
        certificadoData: reg.certData || null
      });
      const pdf = pdfRef.current?.files?.[0];
      if (pdf) {
        await api.post("/ponto/config/registro-inpi/certificado-pdf", {
          arquivoBase64: await lerArquivo(pdf),
          nome: pdf.name
        });
        if (pdfRef.current) pdfRef.current.value = "";
      }
      setMsg("✓ Dados do REP-P e do registro no INPI salvos.");
      await carregar();
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function iniciar() {
    setIniciando(true);
    setMsg("");
    try {
      await api.post("/ponto/config/rep-p/iniciar-operacao", {
        confirmacao,
        inicio: inicioQuando ? new Date(inicioQuando).toISOString() : undefined
      });
      setConfirmacao("");
      setMsg("✓ Operação como REP-P registrada.");
      await carregar();
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setIniciando(false);
    }
  }

  async function verCertificado() {
    try {
      const b = await api.blob("/ponto/config/registro-inpi/certificado-pdf");
      window.open(URL.createObjectURL(b), "_blank", "noopener");
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    }
  }

  if (!painel || !ident) {
    return (
      <div style={CARTAO}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)" }}>
          {msg || "Carregando REP-P…"}
        </p>
      </div>
    );
  }

  const sit = SITUACAO[painel.estado.situacao];
  const campo = (
    k: keyof Ident,
    rotulo: string,
    opts: { ajuda?: string; travado?: boolean } = {}
  ) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>{rotulo}</span>
      <input
        value={(ident[k] as string | null) ?? ""}
        disabled={opts.travado}
        onChange={(e) => setIdent({ ...ident, [k]: e.target.value })}
        style={{ ...INPUT, opacity: opts.travado ? 0.6 : 1 }}
      />
      {opts.ajuda && <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{opts.ajuda}</span>}
    </label>
  );
  const sub = (t: string) => (
    <h4
      style={{
        margin: "18px 0 8px",
        fontSize: 13,
        color: "var(--burgundy-600)",
        letterSpacing: "0.03em"
      }}
    >
      {t}
    </h4>
  );

  return (
    <div style={CARTAO}>
      <h3 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-display)" }}>
        REP-P — Registro eletrônico de ponto via programa
      </h3>
      <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "var(--ink-500)" }}>
        O sistema opera como REP-P (Portaria MTP nº 671/2021, arts. 78 e 91): programa registrado no
        INPI, que emite o Comprovante de Registro de Ponto a cada marcação e gera o AFD e o AEJ.
      </p>

      {/* 1. Situação */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: sit.fundo,
          color: sit.texto,
          border: `1px solid ${sit.borda}`,
          fontSize: 13
        }}
      >
        <strong>{sit.rotulo}</strong>
        {painel.estado.inicio && ` · desde ${fmt(painel.estado.inicio)}`}
        {painel.estado.situacao === "HOMOLOGACAO" && (
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
            {painel.estado.pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 4, fontSize: 12 }}>
          Enquanto o REP-P não inicia a operação, o comprovante funciona em homologação (marca
          d'água, sem validade) e o AFD e o AEJ servem apenas para teste e conferência.
        </div>
      </div>

      {/* 2. Identificação */}
      {sub("Identificação do REP-P")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {campo("repInpiRegistro", "Nº de registro no INPI", {
          travado: operacao,
          ajuda:
            "Fornecido pelo INPI no certificado de registro. Vai no AFD (tipo 1), no AEJ (registro 02) e no comprovante. Até 17 dígitos."
        })}
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
            Versão publicada do sistema
          </span>
          <input value={ident.versaoSistema} disabled style={{ ...INPUT, opacity: 0.6 }} />
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
            Vem da versão do sistema (somente leitura).
          </span>
        </label>
        {campo("repCnoCaepf", "CNO / CAEPF (se existir)")}
        {campo("repResponsavelCpf", "CPF do responsável técnico", {
          ajuda: "Usado nos eventos automáticos do REP."
        })}
        <div style={{ gridColumn: "1 / -1" }}>
          {campo("repLocalPrestacao", "Local de prestação de serviços", {
            ajuda:
              "Impresso no comprovante e no AFD (tipo 2). Se vazio, usa o endereço da instituição."
          })}
        </div>
      </div>

      {/* 3. Desenvolvedor / PTRP */}
      {sub("Programa e desenvolvedor (REP-P e PTRP)")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {campo("ptrpNome", "Nome do programa")}
        {campo("ptrpDesenvolvedorCnpj", "CNPJ do desenvolvedor", {
          ajuda: "Se vazio, o CNPJ da instituição."
        })}
        {campo("ptrpDesenvolvedorRazao", "Razão social do desenvolvedor")}
        {campo("ptrpDesenvolvedorEmail", "E-mail do desenvolvedor")}
      </div>

      {/* 4. Registro no INPI */}
      {sub("Registro do programa no INPI")}
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ink-500)" }}>
        Taxa única de R$ 210,00 (serviço 730), sem anuidade. Guia:{" "}
        <a
          href="https://www.gov.br/inpi/pt-br/servicos/programas-de-computador/guia-basico"
          target="_blank"
          rel="noreferrer"
        >
          gov.br/inpi, programas de computador
        </a>
        .
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(inpi?.etapasModelo ?? []).map((e, i) => {
          const x = etapas[e.chave] ?? {};
          return (
            <div
              key={e.chave}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,2.4fr) 130px minmax(0,1.2fr)",
                gap: 8,
                alignItems: "center",
                padding: "6px 8px",
                background: x.feito ? "#F0FDF4" : "var(--cream-50)",
                borderRadius: 8,
                fontSize: 12.5
              }}
            >
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!x.feito}
                  onChange={(ev) =>
                    setEtapas({
                      ...etapas,
                      [e.chave]: {
                        ...x,
                        feito: ev.target.checked,
                        data:
                          ev.target.checked && !x.data
                            ? new Date().toISOString().slice(0, 10)
                            : x.data
                      }
                    })
                  }
                />
                <span>
                  {i + 1}. {e.rotulo}
                </span>
              </label>
              <input
                type="date"
                value={x.data ?? ""}
                onChange={(ev) =>
                  setEtapas({ ...etapas, [e.chave]: { ...x, data: ev.target.value } })
                }
                style={{ ...INPUT, padding: "4px 6px", fontSize: 12 }}
              />
              <input
                placeholder="Responsável"
                value={x.responsavel ?? ""}
                onChange={(ev) =>
                  setEtapas({ ...etapas, [e.chave]: { ...x, responsavel: ev.target.value } })
                }
                style={{ ...INPUT, padding: "4px 6px", fontSize: 12 }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            fontSize: 12,
            gridColumn: "1 / -1"
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
            Hash SHA-256 do código-fonte registrado
          </span>
          <input
            value={reg.hash}
            onChange={(e) => setReg({ ...reg, hash: e.target.value })}
            placeholder="64 caracteres hexadecimais (gerado por scripts/inpi-hash.sh)"
            style={{ ...INPUT, fontFamily: "var(--font-mono)", fontSize: 11.5 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
            Nº do protocolo do pedido (INPI)
          </span>
          <input
            value={reg.protocolo}
            onChange={(e) => setReg({ ...reg, protocolo: e.target.value })}
            style={INPUT}
          />
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
            Fornecido pelo INPI ao enviar o pedido no e-Software (comprovante de envio da petição).
          </span>
        </label>
        <div />
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
            Nº do certificado de registro (INPI)
          </span>
          <input
            value={reg.certNumero}
            disabled={operacao}
            onChange={(e) => setReg({ ...reg, certNumero: e.target.value })}
            style={{ ...INPUT, opacity: operacao ? 0.6 : 1 }}
          />
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
            Consta no certificado emitido pelo INPI quando o registro é concedido.
          </span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
            Data do certificado (INPI)
          </span>
          <input
            type="date"
            value={reg.certData}
            disabled={operacao}
            onChange={(e) => setReg({ ...reg, certData: e.target.value })}
            style={{ ...INPUT, opacity: operacao ? 0.6 : 1 }}
          />
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
            Data do certificado do INPI (também publicada na Revista da Propriedade Industrial).
          </span>
        </label>
        <div style={{ gridColumn: "1 / -1", fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
            PDF do certificado emitido pelo INPI (até 10 MB)
          </span>
          <span style={{ display: "block", fontSize: 11, color: "var(--ink-400)" }}>
            Baixe no portal do INPI, na consulta do processo, quando o certificado estiver
            disponível.
          </span>
          <div
            style={{
              marginTop: 4,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap"
            }}
          >
            <input ref={pdfRef} type="file" accept="application/pdf" />
            {inpi?.registro?.temPdf && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void verCertificado()}
              >
                Ver PDF anexado ({inpi.registro.certificadoPdfNome})
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}
      >
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={salvando}
          onClick={() => void salvarTudo()}
        >
          {salvando ? "Salvando…" : "Salvar dados do REP-P"}
        </button>
        {msg && <span style={{ fontSize: 12.5 }}>{msg}</span>}
      </div>

      {/* 5. Início da operação */}
      {!operacao && (
        <>
          {sub("Início da operação como REP-P")}
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-600)" }}>
            Habilitado com o certificado do INPI cadastrado e o e-CNPJ válido. A virada é{" "}
            <strong>irreversível</strong>: a partir do instante informado o comprovante passa a ter
            validade (sem marca d'água) e o nº do INPI e o certificado ficam travados.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
                Início (vazio = agora)
              </span>
              <input
                type="datetime-local"
                value={inicioQuando}
                onChange={(e) => setInicioQuando(e.target.value)}
                style={INPUT}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
                Digite INICIAR para confirmar
              </span>
              <input
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                style={INPUT}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                iniciando || confirmacao !== "INICIAR" || painel.estado.situacao !== "PRONTO"
              }
              onClick={() => void iniciar()}
            >
              {iniciando ? "Registrando…" : "Iniciar operação como REP-P"}
            </button>
          </div>
        </>
      )}

      {/* 7. Documentos */}
      {sub("Documentos")}
      <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--ink-600)" }}>
        Atestado Técnico e Termo de Responsabilidade (art. 89), no modelo oficial, preenchido e sem
        assinatura. Deve ser assinado em PAdES com e-CPF do responsável legal e do responsável
        técnico e guardado para a Inspeção do Trabalho.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {(["REP_P", "PTRP"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              void api
                .download(
                  `/ponto/config/rep-p/atestado?tipo=${t}`,
                  `Atestado-Tecnico-${t === "REP_P" ? "REP-P" : "PTRP"}.pdf`
                )
                .catch((e) => setMsg(`⚠ ${(e as Error).message}`))
            }
          >
            ⬇ Atestado Técnico ({t === "REP_P" ? "REP-P" : "PTRP"})
          </button>
        ))}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--ink-400)" }}>
        Hash do código-fonte para o INPI: execute <code>scripts/inpi-hash.sh</code> na raiz do
        repositório e informe o SHA-256 gerado na etapa 4 do checklist.
      </p>

      {/* 6. Saúde do REP-P */}
      {sub("Saúde do REP-P")}
      <div style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.7 }}>
        <div>
          <strong>Livro de marcações:</strong> NSR atual {painel.livro.nsrAtual} ·{" "}
          {painel.livro.marcacoes} marcações · {painel.livro.eventos} eventos
        </div>
        {painel.livro.bloqueio && (
          <div style={{ color: "#991B1B", fontWeight: 700 }}>
            ✕ Marcações bloqueadas: {painel.livro.bloqueio}
          </div>
        )}
        <div>
          <strong>Instância (máquina):</strong> {painel.livro.instanciaAtual?.codigo ?? "—"}
        </div>
        <div>
          <strong>Cadeia de hash:</strong>{" "}
          {painel.livro.verificacaoCadeia
            ? `${painel.livro.verificacaoCadeia.ok ? "✓ íntegra" : "✕ quebrada"} · ${painel.livro.verificacaoCadeia.marcacoes} marcações · conferida em ${fmt(painel.livro.verificacaoCadeia.em)}`
            : "ainda não conferida"}
        </div>
        <div>
          <strong>Relógio (NTP):</strong>{" "}
          {painel.estado.relogio?.desvioMs != null
            ? `desvio de ${painel.estado.relogio.desvioMs} ms em relação a ${painel.estado.relogio.servidor}`
            : painel.estado.relogio?.erro
              ? `não verificado (${painel.estado.relogio.erro})`
              : "ainda não verificado"}
        </div>
        <div>
          <strong>Certificado e-CNPJ A1 (ICP-Brasil):</strong>{" "}
          {painel.certificadoIcp.instalado
            ? `${painel.certificadoIcp.titular ?? ""} · válido até ${br(painel.certificadoIcp.validadeAte?.slice(0, 10))}`
            : `não instalado${painel.certificadoIcp.motivo ? ` (${painel.certificadoIcp.motivo})` : ""}`}
        </div>
      </div>
    </div>
  );
}

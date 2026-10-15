import React, { useEffect, useState } from "react";
import { api } from "../../hooks/useApi";

interface CamposRep {
  repTipo: "REP_A" | "REP_P";
  repInpiRegistro: string;
  repCnoCaepf: string;
  repLocalPrestacao: string;
  repResponsavelCpf: string;
  ptrpNome: string;
  ptrpVersao: string;
  ptrpDesenvolvedorCnpj: string;
  ptrpDesenvolvedorRazao: string;
  ptrpDesenvolvedorEmail: string;
}

interface Situacao {
  nsrAtual: number;
  marcacoes: number;
  eventos: number;
  bloqueio: string | null;
  instanciaAtual: { codigo: string; origem: Record<string, string> } | null;
  instancias: Array<{
    codigo: string;
    hostname: string | null;
    primeiraVez: string;
    ultimaVez: string;
    ativa: boolean;
  }>;
}

const VAZIO: CamposRep = {
  repTipo: "REP_A",
  repInpiRegistro: "",
  repCnoCaepf: "",
  repLocalPrestacao: "",
  repResponsavelCpf: "",
  ptrpNome: "Sistema de Ponto Eletrônico CFO",
  ptrpVersao: "1.0",
  ptrpDesenvolvedorCnpj: "",
  ptrpDesenvolvedorRazao: "",
  ptrpDesenvolvedorEmail: ""
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Configurações → Instituição: dados do REP/PTRP (Portaria MTP 671/2021) e situação do livro. */
export function ConfigRepPtrp() {
  const [c, setC] = useState<CamposRep>(VAZIO);
  const [sit, setSit] = useState<Situacao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api
      .get<Partial<CamposRep>>("/ponto/config/sistema")
      .then((s) => {
        const n: CamposRep = { ...VAZIO };
        for (const k of Object.keys(VAZIO) as Array<keyof CamposRep>) {
          const v = s?.[k];
          if (v != null) (n as unknown as Record<string, string>)[k] = String(v);
        }
        setC(n);
      })
      .catch(() => undefined);
    api
      .get<Situacao>("/auditoria/arquivos-fiscais/situacao")
      .then(setSit)
      .catch(() => setSit(null));
  }, []);

  async function salvar() {
    setSalvando(true);
    setMsg("");
    try {
      await api.put("/ponto/config/sistema", {
        ...c,
        repInpiRegistro: c.repInpiRegistro.replace(/\D/g, "") || null,
        repCnoCaepf: c.repCnoCaepf.replace(/\D/g, "") || null,
        repResponsavelCpf: c.repResponsavelCpf.replace(/\D/g, "") || null,
        ptrpDesenvolvedorCnpj: c.ptrpDesenvolvedorCnpj.replace(/\D/g, "") || null,
        repLocalPrestacao: c.repLocalPrestacao || null,
        ptrpDesenvolvedorRazao: c.ptrpDesenvolvedorRazao || null,
        ptrpDesenvolvedorEmail: c.ptrpDesenvolvedorEmail || null
      });
      setMsg("✓ Dados do REP/PTRP salvos.");
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  const campo = (k: keyof CamposRep, rotulo: string, ajuda?: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>{rotulo}</span>
      <input
        value={c[k]}
        onChange={(e) => setC({ ...c, [k]: e.target.value })}
        style={{ padding: "7px 9px", border: "1px solid rgba(122,30,38,0.2)", borderRadius: 8 }}
      />
      {ajuda && <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{ajuda}</span>}
    </label>
  );

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(122,30,38,0.10)",
        borderRadius: 12,
        padding: 18,
        marginTop: 18
      }}
    >
      <h3 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-display)" }}>
        Registro eletrônico de ponto (REP) e PTRP
      </h3>
      <p style={{ margin: "4px 0 14px", fontSize: 12.5, color: "var(--ink-500)" }}>
        Dados usados no AFD e no AEJ (Portaria MTP nº 671/2021).
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>Tipo de REP</span>
          <select
            value={c.repTipo}
            onChange={(e) => setC({ ...c, repTipo: e.target.value as CamposRep["repTipo"] })}
            style={{ padding: "7px 9px", border: "1px solid rgba(122,30,38,0.2)", borderRadius: 8 }}
          >
            <option value="REP_A">REP-A — autorizado por acordo coletivo (art. 77)</option>
            <option value="REP_P">REP-P — programa registrado no INPI (art. 78)</option>
          </select>
        </label>
        {c.repTipo === "REP_A" ? (
          <div style={{ fontSize: 12, color: "var(--ink-500)", alignSelf: "end" }}>
            O nº do processo do ACT é cadastrado, com ano e vigência, em
            <strong> Acordo coletivo autorizador do REP-A</strong>, logo abaixo.
          </div>
        ) : (
          campo("repInpiRegistro", "Nº de registro no INPI", "Obrigatório no REP-P (art. 91).")
        )}
        {campo("repCnoCaepf", "CNO / CAEPF (se existir)")}
        {campo(
          "repResponsavelCpf",
          "CPF do responsável técnico",
          "Usado nos eventos automáticos do REP."
        )}
        <div style={{ gridColumn: "1 / -1" }}>
          {campo(
            "repLocalPrestacao",
            "Local de prestação de serviços",
            "Se vazio, usa o endereço da instituição."
          )}
        </div>
        {campo("ptrpNome", "Nome do PTRP")}
        {campo("ptrpVersao", "Versão do PTRP")}
        {campo(
          "ptrpDesenvolvedorCnpj",
          "CNPJ do desenvolvedor",
          "Se vazio, o CNPJ da instituição."
        )}
        {campo("ptrpDesenvolvedorRazao", "Razão social do desenvolvedor")}
        {campo("ptrpDesenvolvedorEmail", "E-mail do desenvolvedor")}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={salvando}
          onClick={() => void salvar()}
        >
          {salvando ? "Salvando…" : "Salvar dados do REP"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title="Modelo do art. 89 para assinatura com e-CPF (PAdES) fora do sistema"
          onClick={() =>
            void api
              .download(
                "/auditoria/arquivos-fiscais/atestado-tecnico",
                "Atestado-Tecnico-Termo-Responsabilidade.pdf"
              )
              .catch((e) => setMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`))
          }
        >
          ⬇ Atestado Técnico (art. 89)
        </button>
        {msg && <span style={{ fontSize: 12.5 }}>{msg}</span>}
      </div>

      {sit && (
        <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--ink-700)" }}>
          <strong>Livro de marcações:</strong> NSR atual {sit.nsrAtual} · {sit.marcacoes} marcações
          · {sit.eventos} eventos
          {sit.bloqueio && (
            <div style={{ color: "#991B1B", fontWeight: 700, marginTop: 4 }}>
              ✕ Marcações bloqueadas: {sit.bloqueio}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <strong>Instância (máquina) atual:</strong> {sit.instanciaAtual?.codigo ?? "—"}{" "}
            <span style={{ color: "var(--ink-400)" }}>
              ({Object.keys(sit.instanciaAtual?.origem ?? {}).join(", ") || "—"})
            </span>
          </div>
          {sit.instancias.length > 1 && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
              {sit.instancias.map((i) => (
                <li key={i.codigo}>
                  {i.codigo} · {i.ativa ? "ativa" : "encerrada"} · desde {fmt(i.primeiraVez)} ·
                  último sinal {fmt(i.ultimaVez)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

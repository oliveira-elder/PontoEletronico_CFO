import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../hooks/useApi";

type Situacao = "VIGENTE" | "FUTURO" | "VENCIDO" | "CANCELADO";

interface Acordo {
  id: string;
  tipo: string;
  numeroProcesso: string;
  numeroRegistroMediador: string | null;
  ano: number;
  vigenciaInicio: string;
  vigenciaFim: string;
  dataRegistro: string | null;
  entidadeSindical: string | null;
  clausula: string | null;
  observacoes: string | null;
  renovacaoDeId: string | null;
  status: string;
  motivoCancelamento: string | null;
  migrado: boolean;
  pdfNome: string | null;
  pdfSha256: string | null;
  situacao: Situacao;
  temPdf: boolean;
  extracoes: number;
  criadoPorNome: string | null;
}

interface Lista {
  acordos: Acordo[];
  vigenteId: string | null;
}

interface Form {
  id?: string;
  renovaDe?: string;
  usado: boolean;
  tipo: string;
  numeroProcesso: string;
  numeroRegistroMediador: string;
  ano: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  dataRegistro: string;
  entidadeSindical: string;
  clausula: string;
  observacoes: string;
}

const COR: Record<Situacao, { fundo: string; texto: string; rotulo: string }> = {
  VIGENTE: { fundo: "#DCFCE7", texto: "#166534", rotulo: "Vigente" },
  FUTURO: { fundo: "#DBEAFE", texto: "#1E40AF", rotulo: "Futuro" },
  VENCIDO: { fundo: "#F3F4F6", texto: "#4B5563", rotulo: "Vencido" },
  CANCELADO: { fundo: "#FEE2E2", texto: "#991B1B", rotulo: "Cancelado" }
};

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const INPUT = { padding: "7px 9px", border: "1px solid rgba(122,30,38,0.2)", borderRadius: 8 };

function formatarProcesso(n: string) {
  return n.length === 17 ? n.replace(/(\d{5})(\d{6})(\d{4})(\d{2})/, "$1.$2/$3-$4") : n;
}

function lerArquivo(f: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(f);
  });
}

/** Configurações → Institucional: ACT/CCT que autoriza o REP-A (art. 77), com histórico de renovações. */
export function ConfigAcordosRep() {
  const [lista, setLista] = useState<Lista | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(() => {
    api
      .get<Lista>("/ponto/config/acordos-rep")
      .then(setLista)
      .catch((e) => setMsg(`⚠ ${(e as Error).message}`));
  }, []);
  useEffect(carregar, [carregar]);

  const vigente = lista?.acordos.find((a) => a.id === lista.vigenteId) ?? null;
  const proximo = lista?.acordos.find((a) => a.situacao === "FUTURO") ?? null;

  function novo(base?: Acordo, renovar = false) {
    setPdf(null);
    setMsg("");
    const ano = base && renovar ? base.ano + 1 : new Date().getFullYear();
    setForm({
      renovaDe: renovar ? base?.id : undefined,
      usado: false,
      tipo: base?.tipo ?? "ACT",
      numeroProcesso: "",
      numeroRegistroMediador: "",
      ano: String(ano),
      vigenciaInicio:
        base && renovar
          ? new Date(Date.parse(`${base.vigenciaFim}T12:00:00Z`) + 86_400_000)
              .toISOString()
              .slice(0, 10)
          : `${ano}-01-01`,
      vigenciaFim: base && renovar ? `${ano}-12-31` : `${ano}-12-31`,
      dataRegistro: "",
      entidadeSindical: base?.entidadeSindical ?? "",
      clausula: base?.clausula ?? "",
      observacoes: ""
    });
  }

  function editar(a: Acordo) {
    setPdf(null);
    setMsg("");
    setForm({
      id: a.id,
      usado: a.extracoes > 0,
      tipo: a.tipo,
      numeroProcesso: a.numeroProcesso,
      numeroRegistroMediador: a.numeroRegistroMediador ?? "",
      ano: String(a.ano),
      vigenciaInicio: a.vigenciaInicio,
      vigenciaFim: a.vigenciaFim,
      dataRegistro: a.dataRegistro ?? "",
      entidadeSindical: a.entidadeSindical ?? "",
      clausula: a.clausula ?? "",
      observacoes: a.observacoes ?? ""
    });
  }

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    setMsg("");
    try {
      const corpo = {
        tipo: form.tipo,
        numeroProcesso: form.numeroProcesso.replace(/\D/g, ""),
        numeroRegistroMediador: form.numeroRegistroMediador,
        ano: Number(form.ano),
        vigenciaInicio: form.vigenciaInicio,
        vigenciaFim: form.vigenciaFim,
        dataRegistro: form.dataRegistro || null,
        entidadeSindical: form.entidadeSindical,
        clausula: form.clausula,
        observacoes: form.observacoes
      };
      let id = form.id;
      if (form.id) {
        await api.patch(`/ponto/config/acordos-rep/${form.id}`, corpo);
      } else if (form.renovaDe) {
        id = (
          await api.post<{ id: string }>(
            `/ponto/config/acordos-rep/${form.renovaDe}/renovar`,
            corpo
          )
        ).id;
      } else {
        id = (await api.post<{ id: string }>("/ponto/config/acordos-rep", corpo)).id;
      }
      if (pdf && id) {
        await api.post(`/ponto/config/acordos-rep/${id}/pdf`, {
          arquivoBase64: await lerArquivo(pdf),
          nome: pdf.name
        });
      }
      setForm(null);
      setPdf(null);
      setMsg("✓ Acordo salvo.");
      carregar();
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar(a: Acordo) {
    const motivo = window.prompt(
      `Cancelar o acordo ${formatarProcesso(a.numeroProcesso)}? Ele continua no histórico. Informe o motivo:`
    );
    if (!motivo) return;
    try {
      await api.post(`/ponto/config/acordos-rep/${a.id}/cancelar`, { motivo });
      carregar();
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    }
  }

  async function verPdf(a: Acordo) {
    try {
      const b = await api.blob(`/ponto/config/acordos-rep/${a.id}/pdf`);
      window.open(URL.createObjectURL(b), "_blank", "noopener");
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    }
  }

  const campo = (
    k: keyof Form,
    rotulo: string,
    opts: { tipo?: string; travado?: boolean; ajuda?: string } = {}
  ) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
      <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>{rotulo}</span>
      <input
        type={opts.tipo ?? "text"}
        value={String(form?.[k] ?? "")}
        disabled={opts.travado}
        onChange={(e) => form && setForm({ ...form, [k]: e.target.value })}
        style={{ ...INPUT, opacity: opts.travado ? 0.6 : 1 }}
      />
      {opts.ajuda && <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{opts.ajuda}</span>}
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-display)" }}>
            Acordo coletivo autorizador do REP-A
          </h3>
          <p style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--ink-500)" }}>
            A autorização do REP-A vale só durante a vigência do acordo, sem ultratividade (Portaria
            MTP 671/2021, art. 77). O número do processo vigente vai no cabeçalho do AFD e no AEJ.
          </p>
        </div>
        {!form && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => novo()}>
            + Novo acordo
          </button>
        )}
      </div>

      {lista && (
        <div
          style={{
            padding: "9px 12px",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 12,
            background: vigente ? "#F0FDF4" : "#FEF2F2",
            color: vigente ? "#166534" : "#991B1B",
            border: `1px solid ${vigente ? "#BBF7D0" : "#FECACA"}`
          }}
        >
          {vigente ? (
            <>
              <strong>ACT vigente:</strong> processo {formatarProcesso(vigente.numeroProcesso)} ·
              válido até {br(vigente.vigenciaFim)}
              {!proximo &&
                Date.parse(vigente.vigenciaFim) - Date.now() < 60 * 86_400_000 &&
                " — vence em breve: registre a renovação."}
            </>
          ) : (
            <>
              <strong>Sem ACT/CCT vigente.</strong> Os arquivos AFD/AEJ saem com 99999999999999999 e
              o REP-A fica sem autorização documentada.
            </>
          )}
        </div>
      )}

      {form && (
        <div
          style={{
            border: "1px solid rgba(122,30,38,0.15)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 14
          }}
        >
          <strong style={{ fontSize: 13 }}>
            {form.id ? "Editar acordo" : form.renovaDe ? "Registrar renovação" : "Novo acordo"}
          </strong>
          {form.usado && (
            <div style={{ fontSize: 12, color: "#92400E", margin: "6px 0" }}>
              Este acordo já consta em arquivo extraído: número, ano, tipo e vigência estão
              travados.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>Tipo</span>
              <select
                value={form.tipo}
                disabled={form.usado}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                style={INPUT}
              >
                <option value="ACT">ACT — Acordo Coletivo de Trabalho</option>
                <option value="CCT">CCT — Convenção Coletiva de Trabalho</option>
              </select>
            </label>
            {campo("numeroProcesso", "Nº do processo (17 dígitos)", {
              travado: form.usado,
              ajuda: "Vai no AFD (tipo 1) e no AEJ (registro 02). Ex.: 46000.123456/2026-11"
            })}
            {campo("numeroRegistroMediador", "Registro no Mediador", {
              ajuda: "Ex.: MR012345/2026 (só documental)."
            })}
            {campo("ano", "Ano do acordo", { tipo: "number", travado: form.usado })}
            {campo("vigenciaInicio", "Vigência — início", { tipo: "date", travado: form.usado })}
            {campo("vigenciaFim", "Vigência — fim", { tipo: "date", travado: form.usado })}
            {campo("dataRegistro", "Data do depósito/registro", { tipo: "date" })}
            {campo("entidadeSindical", "Entidade sindical convenente")}
            <div style={{ gridColumn: "1 / -1" }}>
              {campo("clausula", "Cláusula que autoriza o REP-A")}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>{campo("observacoes", "Observações")}</div>
            <div style={{ gridColumn: "1 / -1", fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: "var(--ink-600)" }}>
                PDF do acordo (até 10 MB)
              </span>
              <div style={{ marginTop: 4 }}>
                <input
                  ref={arquivoRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={salvando}
              onClick={() => void salvar()}
            >
              {salvando ? "Salvando…" : "Salvar acordo"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setForm(null);
                setMsg("");
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {msg && <div style={{ fontSize: 12.5, margin: "6px 0" }}>{msg}</div>}

      {lista && lista.acordos.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--ink-500)" }}>Nenhum acordo cadastrado.</div>
      )}
      {lista && lista.acordos.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-500)" }}>
                {["Situação", "Tipo/Ano", "Processo", "Mediador", "Vigência", "Observação", ""].map(
                  (h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid #eee" }}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {lista.acordos.map((a) => {
                const cor = COR[a.situacao];
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
                    <td style={{ padding: "7px 8px" }}>
                      <span
                        style={{
                          background: cor.fundo,
                          color: cor.texto,
                          borderRadius: 999,
                          padding: "2px 9px",
                          fontWeight: 700,
                          fontSize: 11.5
                        }}
                      >
                        {cor.rotulo}
                      </span>
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      {a.tipo} {a.ano}
                    </td>
                    <td style={{ padding: "7px 8px", fontFamily: "monospace" }}>
                      {formatarProcesso(a.numeroProcesso)}
                    </td>
                    <td style={{ padding: "7px 8px" }}>{a.numeroRegistroMediador ?? "—"}</td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                      {br(a.vigenciaInicio)} a {br(a.vigenciaFim)}
                    </td>
                    <td style={{ padding: "7px 8px", color: "var(--ink-500)" }}>
                      {a.renovacaoDeId ? "Renovação · " : ""}
                      {a.migrado ? "Migrado do campo antigo · " : ""}
                      {a.extracoes > 0 ? `${a.extracoes} arquivo(s) gerado(s)` : "sem arquivos"}
                      {a.motivoCancelamento ? ` · ${a.motivoCancelamento}` : ""}
                    </td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                      {a.temPdf && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void verPdf(a)}
                        >
                          PDF
                        </button>
                      )}
                      {a.status !== "CANCELADO" && (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => editar(a)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => novo(a, true)}
                          >
                            Renovar
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void cancelar(a)}
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

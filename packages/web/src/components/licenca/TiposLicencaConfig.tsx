import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { Modal } from "../Modal";

interface TipoLicenca {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  categorias: string[];
  modoDuracao: "LIMITE" | "FIXO" | "LIVRE";
  limiteDias: number | null;
  prorrogacaoDias: number | null;
  contagem: "CORRIDOS" | "UTEIS";
  consecutivos: boolean;
  unidade: "DIAS" | "OCORRENCIAS";
  janelaMeses: number | null;
  limiteNaJanela: number | null;
  permiteParcial: boolean;
  exigeDocumento: boolean;
  orientacao: string | null;
  efeito: "AFASTAMENTO" | "REDUCAO_JORNADA";
  reducaoMaxPct: number | null;
}

const CATEGORIAS = [
  { v: "CONCURSADO", l: "Concursado" },
  { v: "ASSESSOR", l: "Assessor" },
  { v: "ESTAGIARIO", l: "Estagiário" },
  { v: "MENOR_APRENDIZ", l: "Jovem aprendiz" }
];

/** Campos numéricos em texto: aceitam só dígitos, sem negativo e sem zero à esquerda. */
type FormTipo = Omit<
  TipoLicenca,
  | "id"
  | "ordem"
  | "limiteDias"
  | "prorrogacaoDias"
  | "janelaMeses"
  | "limiteNaJanela"
  | "reducaoMaxPct"
> & {
  limiteDias: string;
  prorrogacaoDias: string;
  janelaMeses: string;
  limiteNaJanela: string;
  reducaoMaxPct: string;
};

const FORM_VAZIO: FormTipo = {
  nome: "",
  ativo: true,
  categorias: [],
  modoDuracao: "LIMITE",
  limiteDias: "",
  prorrogacaoDias: "",
  contagem: "CORRIDOS",
  consecutivos: true,
  unidade: "DIAS",
  janelaMeses: "",
  limiteNaJanela: "",
  permiteParcial: false,
  exigeDocumento: false,
  orientacao: "",
  efeito: "AFASTAMENTO",
  reducaoMaxPct: ""
};

const numTxt = (n: number | null) => (n === null || n === undefined ? "" : String(n));
const soNumero = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

function resumo(t: TipoLicenca): string {
  const dias = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;
  const adj = t.contagem === "UTEIS" ? "úteis" : t.consecutivos ? "consecutivos" : "corridos";
  let r: string;
  if (t.efeito === "REDUCAO_JORNADA") r = `redução de até ${t.reducaoMaxPct ?? 0}% da jornada`;
  else if (t.modoDuracao === "LIVRE" || !t.limiteDias) r = "pelo tempo necessário";
  else if (t.unidade === "OCORRENCIAS") r = `até ${t.limiteDias} ocorrências`;
  else if (t.modoDuracao === "FIXO")
    r = t.prorrogacaoDias ? `${t.limiteDias} + ${dias(t.prorrogacaoDias)}` : dias(t.limiteDias);
  else r = `até ${dias(t.limiteDias)} ${adj}`;
  if (t.janelaMeses && t.limiteNaJanela) {
    r += `; máx. ${t.limiteNaJanela} a cada ${t.janelaMeses} meses`;
  }
  return r;
}

const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid rgba(122,30,38,0.14)",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  boxSizing: "border-box"
};
const lbl: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  display: "block",
  marginBottom: 3
};

function Campo({
  rotulo,
  dica,
  children
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={lbl}>{rotulo}</label>
      {children}
      {dica && <span style={{ fontSize: 11, color: "var(--ink-500)" }}>{dica}</span>}
    </div>
  );
}

/**
 * Configurações → Solicitações → Tipos de Licença: adicionar, editar, duplicar, desativar e
 * reordenar. Excluir de vez é só do super usuário (os pedidos guardam a regra do momento).
 */
export function TiposLicencaConfig({ podeEditar }: { podeEditar: boolean }) {
  const { user } = useAuth();
  const superUsuario = !!user?.isSuperAdmin;
  const [tipos, setTipos] = useState<TipoLicenca[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [form, setForm] = useState<FormTipo | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setTipos(await api.get<TipoLicenca[]>("/ponto/config/tipos-licenca/gestao"));
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = (t?: TipoLicenca, duplicar = false) => {
    setErro(null);
    setEditId(t && !duplicar ? t.id : null);
    setForm(
      t
        ? {
            nome: duplicar ? `${t.nome} (cópia)` : t.nome,
            ativo: t.ativo,
            categorias: t.categorias,
            modoDuracao: t.modoDuracao,
            limiteDias: numTxt(t.limiteDias),
            prorrogacaoDias: numTxt(t.prorrogacaoDias),
            contagem: t.contagem,
            consecutivos: t.consecutivos,
            unidade: t.unidade,
            janelaMeses: numTxt(t.janelaMeses),
            limiteNaJanela: numTxt(t.limiteNaJanela),
            permiteParcial: t.permiteParcial,
            exigeDocumento: t.exigeDocumento,
            orientacao: t.orientacao ?? "",
            efeito: t.efeito,
            reducaoMaxPct: numTxt(t.reducaoMaxPct)
          }
        : { ...FORM_VAZIO }
    );
  };

  async function salvar() {
    if (!form) return;
    setOcupado(true);
    setErro(null);
    const corpo = {
      ...form,
      limiteDias: form.limiteDias,
      prorrogacaoDias: form.prorrogacaoDias,
      janelaMeses: form.janelaMeses,
      limiteNaJanela: form.limiteNaJanela,
      reducaoMaxPct: form.reducaoMaxPct
    };
    try {
      if (editId) await api.put(`/ponto/config/tipos-licenca/${editId}`, corpo);
      else await api.post("/ponto/config/tipos-licenca", corpo);
      setForm(null);
      setMsg({ ok: true, texto: editId ? "Tipo atualizado." : "Tipo adicionado." });
      await carregar();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível salvar.");
    } finally {
      setOcupado(false);
    }
  }

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, texto: ok });
      await carregar();
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message || "Não foi possível concluir." });
    } finally {
      setOcupado(false);
    }
  }

  const mover = (i: number, d: number) => {
    const ids = tipos.map((t) => t.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void executar(
      () => api.patch("/ponto/config/tipos-licenca/ordem", { ids }),
      "Ordem atualizada."
    );
  };

  const set = <K extends keyof FormTipo>(k: K, v: FormTipo[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: 0, lineHeight: 1.5 }}>
        Tipos oferecidos na solicitação de licença. Os valores da CLT (art. 473) são só o ponto de
        partida: o conselho pode deliberar dias diferentes por ACT. Pedidos já feitos mantêm a regra
        vigente na data do pedido.
      </p>
      {msg && (
        <p style={{ margin: 0, fontSize: 12.5, color: msg.ok ? "var(--green)" : "var(--red)" }}>
          {msg.ok ? "✓ " : "⚠ "}
          {msg.texto}
        </p>
      )}
      {podeEditar && (
        <div>
          <button className="btn btn-primary btn-sm" onClick={() => abrir()}>
            ＋ Novo tipo de licença
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tipos.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              padding: "8px 10px",
              border: "1px solid rgba(122,30,38,0.10)",
              borderRadius: "var(--radius-md)",
              background: t.ativo ? "#fff" : "rgba(0,0,0,0.03)",
              opacity: t.ativo ? 1 : 0.75
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <strong style={{ fontSize: 13 }}>{t.nome}</strong>{" "}
              {!t.ativo && <span className="badge badge-gray">Desativado</span>}
              <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                {resumo(t)}
                {t.categorias.length
                  ? ` · só ${t.categorias.map((c) => CATEGORIAS.find((x) => x.v === c)?.l ?? c).join(", ")}`
                  : ""}
                {t.exigeDocumento ? " · documento obrigatório" : ""}
              </div>
            </div>
            {podeEditar && (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={ocupado || i === 0}
                  onClick={() => mover(i, -1)}
                  aria-label="Subir"
                >
                  ↑
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={ocupado || i === tipos.length - 1}
                  onClick={() => mover(i, 1)}
                  aria-label="Descer"
                >
                  ↓
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={ocupado}
                  onClick={() => abrir(t)}
                >
                  Editar
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={ocupado}
                  onClick={() => abrir(t, true)}
                >
                  Duplicar
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(
                      () =>
                        api.patch(`/ponto/config/tipos-licenca/${t.id}/ativo`, { ativo: !t.ativo }),
                      t.ativo ? "Tipo desativado." : "Tipo ativado."
                    )
                  }
                >
                  {t.ativo ? "Desativar" : "Ativar"}
                </button>
                {superUsuario && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--red)" }}
                    disabled={ocupado}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir definitivamente "${t.nome}"? Os pedidos já feitos mantêm a regra.`
                        )
                      ) {
                        void executar(
                          () => api.delete(`/ponto/config/tipos-licenca/${t.id}`),
                          "Tipo excluído."
                        );
                      }
                    }}
                  >
                    Excluir
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {form && (
        <Modal
          eyebrow="Configurações"
          title={editId ? "Editar tipo de licença" : "Novo tipo de licença"}
          subtitle="Os números aceitam apenas inteiros, sem negativo e sem zero à esquerda. 0 = sem limite."
          onClose={() => !ocupado && setForm(null)}
          maxWidth={1100}
          maxHeight="94vh"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: 12
              }}
            >
              <Campo rotulo="Nome do tipo *">
                <input
                  style={inputBase}
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Duração">
                <select
                  style={inputBase}
                  value={form.modoDuracao}
                  onChange={(e) => set("modoDuracao", e.target.value as FormTipo["modoDuracao"])}
                >
                  <option value="LIMITE">Até N dias (limite)</option>
                  <option value="FIXO">Exatamente N dias (fixo)</option>
                  <option value="LIVRE">Pelo tempo necessário (livre)</option>
                </select>
              </Campo>
              <Campo rotulo="Limite (dias ou ocorrências)" dica="0 ou vazio = sem limite">
                <input
                  style={inputBase}
                  inputMode="numeric"
                  value={form.limiteDias}
                  disabled={form.modoDuracao === "LIVRE"}
                  onChange={(e) => set("limiteDias", soNumero(e.target.value))}
                />
              </Campo>
              <Campo rotulo="Prorrogação (dias)" dica="Ex.: Empresa Cidadã">
                <input
                  style={inputBase}
                  inputMode="numeric"
                  value={form.prorrogacaoDias}
                  onChange={(e) => set("prorrogacaoDias", soNumero(e.target.value))}
                />
              </Campo>
              <Campo rotulo="Contagem">
                <select
                  style={inputBase}
                  value={form.contagem}
                  onChange={(e) => set("contagem", e.target.value as FormTipo["contagem"])}
                >
                  <option value="CORRIDOS">Dias corridos</option>
                  <option value="UTEIS">Dias úteis</option>
                </select>
              </Campo>
              <Campo rotulo="Unidade do limite">
                <select
                  style={inputBase}
                  value={form.unidade}
                  onChange={(e) => set("unidade", e.target.value as FormTipo["unidade"])}
                >
                  <option value="DIAS">Dias</option>
                  <option value="OCORRENCIAS">Ocorrências (ex.: consultas)</option>
                </select>
              </Campo>
              <Campo rotulo="Frequência: janela (meses)" dica="Ex.: 12 = a cada 12 meses">
                <input
                  style={inputBase}
                  inputMode="numeric"
                  value={form.janelaMeses}
                  onChange={(e) => set("janelaMeses", soNumero(e.target.value))}
                />
              </Campo>
              <Campo rotulo="Frequência: máximo na janela" dica="Dias/ocorrências na janela">
                <input
                  style={inputBase}
                  inputMode="numeric"
                  value={form.limiteNaJanela}
                  onChange={(e) => set("limiteNaJanela", soNumero(e.target.value))}
                />
              </Campo>
              <Campo rotulo="Efeito no ponto">
                <select
                  style={inputBase}
                  value={form.efeito}
                  onChange={(e) => set("efeito", e.target.value as FormTipo["efeito"])}
                >
                  <option value="AFASTAMENTO">Afastamento (dia neutro)</option>
                  <option value="REDUCAO_JORNADA">Redução de jornada (horas dispensadas)</option>
                </select>
              </Campo>
              <Campo rotulo="Redução máxima da jornada (%)" dica="Só para redução de jornada">
                <input
                  style={inputBase}
                  inputMode="numeric"
                  value={form.reducaoMaxPct}
                  disabled={form.efeito !== "REDUCAO_JORNADA"}
                  onChange={(e) => set("reducaoMaxPct", soNumero(e.target.value))}
                />
              </Campo>
            </div>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5 }}>
              <label>
                <input
                  type="checkbox"
                  checked={form.consecutivos}
                  onChange={(e) => set("consecutivos", e.target.checked)}
                />{" "}
                Período contínuo (consecutivos)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.permiteParcial}
                  onChange={(e) => set("permiteParcial", e.target.checked)}
                />{" "}
                Permite horário parcial
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.exigeDocumento}
                  onChange={(e) => set("exigeDocumento", e.target.checked)}
                />{" "}
                Documento obrigatório
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => set("ativo", e.target.checked)}
                />{" "}
                Ativo
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 12
              }}
            >
              <Campo rotulo="Quem pode pedir" dica="Nenhuma marcada = todas as categorias">
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12.5 }}>
                  {CATEGORIAS.map((c) => (
                    <label key={c.v}>
                      <input
                        type="checkbox"
                        checked={form.categorias.includes(c.v)}
                        onChange={(e) =>
                          set(
                            "categorias",
                            e.target.checked
                              ? [...form.categorias, c.v]
                              : form.categorias.filter((x) => x !== c.v)
                          )
                        }
                      />{" "}
                      {c.l}
                    </label>
                  ))}
                </div>
              </Campo>
              <Campo rotulo="Orientação ao funcionário" dica="Ex.: Anexe a certidão de casamento.">
                <textarea
                  style={{ ...inputBase, resize: "vertical" }}
                  rows={2}
                  value={form.orientacao ?? ""}
                  onChange={(e) => set("orientacao", e.target.value)}
                />
              </Campo>
            </div>

            {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>⚠ {erro}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={ocupado}
                onClick={() => setForm(null)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={ocupado || form.nome.trim().length < 3}
                onClick={() => void salvar()}
              >
                {ocupado ? "Salvando…" : "Salvar tipo"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

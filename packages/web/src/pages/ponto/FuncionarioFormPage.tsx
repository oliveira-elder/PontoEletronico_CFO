import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { MapModal, MapResult } from "../../components/MapModal";
import { geocodificarEndereco } from "../../utils/geocode";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  CrownIcon,
  MapPinIcon,
  PlusIcon,
  TrashIcon
} from "../../components/icons";
import {
  CAT,
  FORM_VAZIO,
  formatCpf,
  formatTelefone,
  formatRg,
  emailInstitucional,
  formFromFuncionario,
  isValidCpf,
  matchGerenciaId,
  matriculaPareceLogin,
  nomeGerencia,
  slugLabel,
  isCategoriaEstagio,
  chefeDaLotacao,
  ATIVIDADE_OPCOES,
  RACA_OPCOES,
  GENERO_OPCOES,
  GRAU_ESCOLARIDADE_OPCOES,
  type Categoria,
  type EnderecoResidencial,
  type Funcionario,
  type FuncionarioFormState,
  type Gerencia,
  type JornadaPeriodo
} from "./gestaoShared";

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-500)",
  display: "block",
  marginBottom: 6
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid rgba(122,30,38,0.14)",
  background: "#fff",
  fontSize: 13.5,
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box"
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={labelStyle}>{children}</label>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>{children}</p>;
}

function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "var(--ink-700)",
        cursor: "pointer"
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: "var(--burgundy-600)" }}
      />
      {label}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: "var(--burgundy-600)",
        margin: "20px 0 12px"
      }}
    >
      {children}
    </p>
  );
}

function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      {children}
      <ChevronDownIcon
        size={14}
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "var(--ink-500)"
        }}
      />
    </div>
  );
}

type VigenciaLotacaoUI = {
  id: string;
  cargo: string;
  gerenciaId: string | null;
  subsecao: string | null;
  situacaoAtiva: boolean;
  data: string | null;
  vigenciaDesde: string;
  vigenciaAte: string | null;
  gerencia?: { id: string; nome: string; sigla: string } | null;
};

function HistoricoLotacaoAccordion({
  funcionarioId,
  gerencias,
  onRegistrado,
  apenasSetorLotacao
}: {
  funcionarioId: string;
  gerencias: Gerencia[];
  onRegistrado: (novo: {
    cargo?: string;
    gerenciaId: string | null;
    subsecao: string | null;
    cargoData: string;
    lotacaoInicio: string;
  }) => void;
  /** Empregado: histórico só mostra/edita Setor e Lotação (+ datas) — sem Cargo,
   *  Situação nem Data do Ato, que ficam com o valor já vigente do funcionário. */
  apenasSetorLotacao?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [historico, setHistorico] = useState<VigenciaLotacaoUI[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [novo, setNovo] = useState({
    cargo: "",
    gerenciaId: "",
    subsecao: "",
    situacaoAtiva: true,
    data: "",
    vigenciaDesde: ""
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    const lista = await api
      .get<VigenciaLotacaoUI[]>(`/ponto/gestao/funcionarios/${funcionarioId}/lotacao-historico`)
      .catch(() => []);
    setHistorico(lista ?? []);
    setCarregado(true);
  }

  function toggle() {
    setAberto((a) => {
      if (!a && !carregado) void carregar();
      return !a;
    });
  }

  async function salvar() {
    if ((!apenasSetorLotacao && !novo.cargo.trim()) || !novo.vigenciaDesde) {
      setErro(
        apenasSetorLotacao
          ? "Informe a data de início da vigência."
          : "Informe cargo e data de início da vigência."
      );
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      await api.post(`/ponto/gestao/funcionarios/${funcionarioId}/lotacao-historico`, {
        cargo: apenasSetorLotacao ? undefined : novo.cargo.trim(),
        gerenciaId: novo.gerenciaId || null,
        subsecao: novo.subsecao || null,
        situacaoAtiva: novo.situacaoAtiva,
        data: novo.data || null,
        vigenciaDesde: novo.vigenciaDesde
      });
      await carregar();
      const hoje = new Date().toISOString().slice(0, 10);
      if (novo.vigenciaDesde <= hoje) {
        onRegistrado({
          ...(apenasSetorLotacao ? {} : { cargo: novo.cargo.trim() }),
          gerenciaId: novo.gerenciaId || null,
          subsecao: novo.subsecao || null,
          cargoData: novo.data,
          lotacaoInicio: novo.vigenciaDesde
        });
      }
      setMostrarForm(false);
      setNovo({
        cargo: "",
        gerenciaId: "",
        subsecao: "",
        situacaoAtiva: true,
        data: "",
        vigenciaDesde: ""
      });
    } catch (e) {
      setErro((e as Error)?.message ?? "Erro ao registrar movimentação.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ marginTop: 4, marginBottom: 20 }}>
      <button
        type="button"
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.20)",
          background: "transparent",
          color: "var(--burgundy-600)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600
        }}
      >
        <ChevronDownIcon
          size={13}
          style={{ transform: aberto ? "rotate(180deg)" : "none", transition: "transform 140ms" }}
        />
        Histórico de Cargo e Lotação
      </button>

      {aberto && (
        <div
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.14)",
            background: "var(--cream-50)"
          }}
        >
          {!carregado ? (
            <p style={{ fontSize: 12, color: "var(--ink-500)" }}>Carregando…</p>
          ) : historico.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--ink-500)" }}>Sem movimentações registradas.</p>
          ) : (
            historico.map((h) => (
              <div
                key={h.id}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid rgba(122,30,38,0.08)",
                  fontSize: 12.5
                }}
              >
                {apenasSetorLotacao ? (
                  <strong>
                    {h.gerencia?.nome ?? "—"}
                    {h.subsecao ? ` / ${slugLabel(h.subsecao)}` : ""}
                  </strong>
                ) : (
                  <>
                    <strong>{h.cargo || "—"}</strong>
                    {h.gerencia ? ` — ${h.gerencia.nome}` : ""}
                    {h.subsecao ? ` / ${slugLabel(h.subsecao)}` : ""}
                  </>
                )}
                <div style={{ color: "var(--ink-500)", marginTop: 2 }}>
                  Data Início: {new Date(`${h.vigenciaDesde}T12:00:00`).toLocaleDateString("pt-BR")}
                  {" · "}Data Fim:{" "}
                  {h.vigenciaAte
                    ? new Date(`${h.vigenciaAte}T12:00:00`).toLocaleDateString("pt-BR")
                    : "atual"}
                  {!apenasSetorLotacao && (
                    <>
                      {" · "}
                      {h.situacaoAtiva ? "Ativo" : "Inativo"}
                      {h.data
                        ? ` · Ato de ${new Date(`${h.data}T12:00:00`).toLocaleDateString("pt-BR")}`
                        : ""}
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {!mostrarForm ? (
            <button
              type="button"
              onClick={() => setMostrarForm(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 12,
                padding: "7px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px dashed rgba(122,30,38,0.28)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600
              }}
            >
              <PlusIcon size={13} /> Registrar nova movimentação
            </button>
          ) : (
            <div
              style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
            >
              {!apenasSetorLotacao && (
                <div>
                  <FieldLabel>Cargo *</FieldLabel>
                  <input
                    type="text"
                    value={novo.cargo}
                    onChange={(e) => setNovo((n) => ({ ...n, cargo: e.target.value }))}
                    style={fieldStyle}
                  />
                </div>
              )}
              <div>
                <FieldLabel>Lotação</FieldLabel>
                <SelectWrap>
                  <select
                    value={novo.gerenciaId}
                    onChange={(e) => setNovo((n) => ({ ...n, gerenciaId: e.target.value }))}
                    style={selectStyleBase}
                  >
                    <option value="">Sem alteração de lotação</option>
                    {gerencias.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
                </SelectWrap>
              </div>
              <div>
                <FieldLabel>Setor</FieldLabel>
                <input
                  type="text"
                  value={novo.subsecao}
                  onChange={(e) => setNovo((n) => ({ ...n, subsecao: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              {!apenasSetorLotacao && (
                <>
                  <div>
                    <FieldLabel>Situação</FieldLabel>
                    <div style={{ paddingTop: 8 }}>
                      <Toggle
                        checked={novo.situacaoAtiva}
                        onChange={(v) => setNovo((n) => ({ ...n, situacaoAtiva: v }))}
                        label="Ativo nesta movimentação"
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Data do Ato</FieldLabel>
                    <input
                      type="date"
                      value={novo.data}
                      onChange={(e) => setNovo((n) => ({ ...n, data: e.target.value }))}
                      style={fieldStyle}
                    />
                  </div>
                </>
              )}
              <div>
                <FieldLabel>Vigência Desde *</FieldLabel>
                <input
                  type="date"
                  value={novo.vigenciaDesde}
                  onChange={(e) => setNovo((n) => ({ ...n, vigenciaDesde: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              {erro && (
                <p style={{ gridColumn: "1 / -1", color: "var(--red)", fontSize: 12, margin: 0 }}>
                  {erro}
                </p>
              )}
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => void salvar()}
                  disabled={salvando}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {salvando ? "Salvando…" : "Salvar movimentação"}
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarForm(false)}
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const selectStyleBase: React.CSSProperties = {
  ...fieldStyle,
  appearance: "none",
  padding: "9px 32px 9px 12px",
  cursor: "pointer"
};

export function FuncionarioFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);
  const { user, hasRole, refreshProfile } = useAuth();
  const isAdmin = !!user?.isSuperAdmin || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");
  const isRH = isAdmin || hasRole("RH_AUDITORIA");
  const isRhOuAdmin = isAdmin || hasRole("RH_AUDITORIA");
  const isNovo = !id;
  const grid = isMobile ? "1fr" : "1fr 1fr";
  const gridCols = (n: number) => (isMobile ? "1fr" : `repeat(${n}, 1fr)`);

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [jornadasDisponiveis, setJornadasDisponiveis] = useState<JornadaPeriodo[]>([]);
  const [form, setForm] = useState<FuncionarioFormState>(FORM_VAZIO);
  const [carregando, setCarregando] = useState(!isNovo);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [requerimentoAtual, setRequerimentoAtual] = useState<{
    status: string;
    criadoEm: string;
  } | null>(null);
  const [enviandoReq, setEnviandoReq] = useState(false);
  const [modalidade, setModalidade] = useState({ modoHomeOffice: false, modoHibridoLocal: false });
  const [endereco, setEndereco] = useState<EnderecoResidencial>({ raioMetros: 20 });
  const [mapaAberto, setMapaAberto] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [hibridoMaxDias, setHibridoMaxDias] = useState(2);
  const [erroSalvar, setErroSalvar] = useState("");
  const [funcionarioAtual, setFuncionarioAtual] = useState<Funcionario | null>(null);
  const [lookupApi, setLookupApi] = useState<{
    found: boolean;
    name?: string;
    email?: string;
    staffId?: number | null;
    section?: string;
    subsection?: string | null;
    gerenciaId?: string | null;
    gerenciaNome?: string | null;
  } | null>(null);
  const [apiHint, setApiHint] = useState("");

  useEffect(() => {
    api
      .get<JornadaPeriodo[]>("/ponto/config/jornadas")
      .then((jps) => setJornadasDisponiveis(jps ?? []))
      .catch(() => {});
    api
      .get<{ hibridoMaxDiasSemana: number }>("/ponto/config/sistema")
      .then((s) => {
        if (s?.hibridoMaxDiasSemana) setHibridoMaxDias(s.hibridoMaxDiasSemana);
      })
      .catch(() => {});
    api
      .get<(Gerencia & { _count: { funcionarios: number } })[]>("/ponto/gestao/gerencias")
      .then((gers) => setGerencias(gers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancel = false;
    setNaoEncontrado(false);
    if (isNovo) {
      setForm(FORM_VAZIO);
      setModalidade({ modoHomeOffice: false, modoHibridoLocal: false });
      setEndereco({ raioMetros: 20 });
      setRequerimentoAtual(null);
      setFuncionarioAtual(null);
      setLookupApi(null);
      setApiHint("");
      setCarregando(false);
    } else {
      setCarregando(true);
    }
    api
      .get<Funcionario[]>("/ponto/gestao/funcionarios")
      .then((funcs) => {
        if (cancel) return;
        const lista = funcs ?? [];
        setFuncionarios(lista);
        if (isNovo) return;
        const f = lista.find((x) => x.id === id);
        if (!f) {
          setNaoEncontrado(true);
          setCarregando(false);
          return;
        }
        setForm(formFromFuncionario(f));
        setFuncionarioAtual(f);
        setModalidade({
          modoHomeOffice: f.modoHomeOffice ?? false,
          modoHibridoLocal: f.modoHibridoLocal ?? false
        });
        setRequerimentoAtual(f.requerimentoEndereco ?? null);
        setCarregando(false);
      })
      .catch(() => {
        if (!cancel && !isNovo) {
          setNaoEncontrado(true);
          setCarregando(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, [id, isNovo]);

  useEffect(() => {
    if (!funcionarioAtual?.user) return;
    const email = emailInstitucional(
      funcionarioAtual.user.emailReal || funcionarioAtual.user.email
    );
    if (!email) return;
    let cancel = false;
    api
      .get<{
        found: boolean;
        name?: string;
        email?: string;
        staffId?: number | null;
        section?: string;
        subsection?: string | null;
        gerenciaId?: string | null;
        gerenciaNome?: string | null;
      }>(`/admin/extensions/lookup?email=${encodeURIComponent(email)}`)
      .then((hit) => {
        if (!cancel) setLookupApi(hit?.found ? hit : null);
      })
      .catch(() => {
        if (!cancel) setLookupApi(null);
      });
    return () => {
      cancel = true;
    };
  }, [funcionarioAtual]);

  useEffect(() => {
    setForm((prev) => {
      const email =
        emailInstitucional(lookupApi?.email) || emailInstitucional(prev.email) || prev.email;
      const gerenciaId =
        matchGerenciaId(gerencias, {
          gerenciaId: prev.gerenciaId,
          section: lookupApi?.section || funcionarioAtual?.section,
          nome: lookupApi?.gerenciaNome || funcionarioAtual?.gerencia?.nome
        }) || prev.gerenciaId;
      const matricula =
        matriculaPareceLogin(prev.matricula) && lookupApi?.staffId != null
          ? String(lookupApi.staffId)
          : prev.matricula;
      const subsecao = prev.subsecao || lookupApi?.subsection || "";
      const nome = prev.nome.trim() ? prev.nome : lookupApi?.name || prev.nome;
      const next = { ...prev, email, gerenciaId, matricula, subsecao, nome };
      if (
        next.email === prev.email &&
        next.gerenciaId === prev.gerenciaId &&
        next.matricula === prev.matricula &&
        next.subsecao === prev.subsecao &&
        next.nome === prev.nome
      ) {
        return prev;
      }
      return next;
    });
    if (lookupApi?.found) {
      setApiHint("Campos vazios foram preenchidos com a API de ramais. Revise e salve.");
    }
  }, [lookupApi, gerencias, funcionarioAtual]);

  useEffect(() => {
    if (!id || !isRhOuAdmin) return;
    api
      .get<EnderecoResidencial>(`/ponto/gestao/funcionarios/${id}/endereco`)
      .then((e) => {
        setEndereco(
          e
            ? { ...e, raioMetros: e.raioMetros && e.raioMetros !== 100 ? e.raioMetros : 20 }
            : { raioMetros: 20 }
        );
      })
      .catch(() => setEndereco({ raioMetros: 20 }));
  }, [id, isRhOuAdmin]);

  const cpfPreenchido = form.cpf.replace(/\D/g, "").length > 0;
  const cpfCompleto = form.cpf.replace(/\D/g, "").length === 11;
  const cpfValido = cpfCompleto && isValidCpf(form.cpf);
  const cpfInvalido = cpfPreenchido && cpfCompleto && !cpfValido;
  /* Só bloqueia CPF completo e inválido — incompleto não impede o restante do cadastro. */
  const cpfBloqueio = cpfInvalido;
  const podeSalvar =
    !!form.nome.trim() && !!form.matricula.trim() && !!form.gerenciaId && !cpfBloqueio && !salvando;
  /* Chefe de coordenação (subseção contém "coordenação"): substituto é da mesma
     subseção, não da gerência inteira — espelha a exceção do backend. */
  const ehChefeDeCoordenacao = form.isManager && !!form.subsecao && /coordena/i.test(form.subsecao);

  /* Categorias — cada seção do formulário varia por categoria (ver planejamento
     de reorganização). "catComChefe" (Empregado/Comissionado) tem Chefe/Situação
     no Cargo e Lotação; "catEstagio" (Estagiário/Jovem Aprendiz) usa a estrutura
     de Supervisor em vez de Chefe. */
  const catEmpregado = form.categoria === "CONCURSADO";
  const catComissionado = form.categoria === "ASSESSOR";
  const catEstagiario = form.categoria === "ESTAGIARIO";
  const catJovemAprendiz = form.categoria === "MENOR_APRENDIZ";
  const catComChefe = catEmpregado || catComissionado;

  function motivosBloqueio(): string[] {
    const m: string[] = [];
    if (!form.nome.trim()) m.push("Nome completo");
    if (!form.matricula.trim()) m.push("Matrícula");
    if (!form.gerenciaId) m.push("Gerência");
    if (cpfInvalido) m.push("CPF inválido");
    return m;
  }

  function enderecoTemConteudo(e: EnderecoResidencial): boolean {
    const cep = (e.cep ?? "").replace(/\D/g, "");
    const cepOk = cep.length === 8 && cep !== "00000000";
    return Boolean(
      e.logradouro?.trim() ||
      e.bairro?.trim() ||
      e.cidade?.trim() ||
      e.complemento?.trim() ||
      e.lat != null ||
      e.lng != null ||
      cepOk ||
      (e.numero?.trim() && e.numero.trim().toUpperCase() !== "S/N")
    );
  }

  function voltar() {
    navigate("/ponto/gestao");
  }

  async function solicitarEndereco() {
    if (!id) return;
    setEnviandoReq(true);
    try {
      const res = await api.post<{ status: string; criadoEm: string }>(
        `/ponto/gestao/funcionarios/${id}/requerimento-endereco`,
        {}
      );
      setRequerimentoAtual(res);
    } finally {
      setEnviandoReq(false);
    }
  }

  async function abrirMapaComGeocode() {
    if (!endereco.lat || !endereco.lng) {
      const result = await geocodificarEndereco({
        logradouro: endereco.logradouro ?? undefined,
        numero: endereco.numero ?? undefined,
        bairro: endereco.bairro ?? undefined,
        cidade: endereco.cidade ?? undefined,
        uf: endereco.uf ?? undefined,
        cep: endereco.cep ?? undefined
      });
      if (result) setEndereco((e) => ({ ...e, lat: result.lat, lng: result.lng }));
    }
    setMapaAberto(true);
  }

  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setEndereco((e) => ({
          ...e,
          cep: data.cep,
          logradouro: data.logradouro,
          bairro: data.bairro,
          cidade: data.localidade,
          uf: data.uf
        }));
      }
    } catch {
      /* silencioso */
    } finally {
      setCepLoading(false);
    }
  }

  function onMapaConfirm(r: MapResult) {
    setEndereco((e) => ({ ...e, lat: r.lat, lng: r.lng, raioMetros: r.raio }));
    setMapaAberto(false);
  }

  async function salvarModalidadeEndereco(funcId: string) {
    if (!isRhOuAdmin) return;
    await api.patch(`/ponto/gestao/funcionarios/${funcId}/modalidade`, modalidade);
    if (enderecoTemConteudo(endereco)) {
      await api.put(`/ponto/gestao/funcionarios/${funcId}/endereco`, endereco);
    }
  }

  async function salvar() {
    const bloqueios = motivosBloqueio();
    if (bloqueios.length || salvando) {
      setErroSalvar(
        bloqueios.length ? `Preencha os campos obrigatórios: ${bloqueios.join(", ")}.` : ""
      );
      return;
    }
    if (isCategoriaEstagio(form.categoria) && !form.supervisorEstagioId) {
      alert("Selecione o Supervisor de Estágio para Estagiário ou Jovem Aprendiz.");
      return;
    }
    if (isCategoriaEstagio(form.categoria)) {
      const supervisor = funcionarios.find((f) => f.id === form.supervisorEstagioId);
      if (supervisor && isCategoriaEstagio(supervisor.categoria)) {
        alert(
          "Estagiário e Jovem Aprendiz não podem ser supervisor de estágio. Escolha um efetivo, comissionado ou chefe da mesma gerência."
        );
        return;
      }
    }

    const {
      jornadaPeriodoId,
      substitutoId,
      substitutoDataInicio,
      substitutoDataFim,
      supervisorEstagioId,
      bolsaAuxilio,
      ...restForm
    } = form;

    const payload: Record<string, unknown> = {
      ...restForm,
      dataNascimento: form.dataNascimento || null,
      dataAdmissao: form.dataAdmissao || null,
      dataDesligamento: form.dataDesligamento || null,
      atividade: form.atividade || null,
      rgDataEmissao: form.rgDataEmissao || null,
      cargoData: form.cargoData || null,
      lotacaoInicio: form.lotacaoInicio || null,
      lotacaoTermino: form.lotacaoTermino || null,
      contratoInicio: form.contratoInicio || null,
      contratoTermino: form.contratoTermino || null,
      bolsaAuxilio: bolsaAuxilio || null,
      dependentes: form.dependentes.filter((d) => d.nome.trim()),
      formacoesAcademicas: form.formacoesAcademicas.filter((f) => f.curso.trim()),
      capacitacoes: form.capacitacoes.filter((c) => c.nome.trim())
    };

    if (isCategoriaEstagio(form.categoria)) {
      payload.supervisorEstagioId = supervisorEstagioId || null;
    } else {
      payload.supervisorEstagioId = null;
    }

    if (form.isManager) {
      payload.substitutoId = substitutoId || null;
      payload.substitutoDataInicio = substitutoId ? substitutoDataInicio || null : null;
      payload.substitutoDataFim = substitutoId ? substitutoDataFim || null : null;
    }

    setSalvando(true);
    setErroSalvar("");
    try {
      if (isNovo) {
        const {
          substitutoId: subId,
          substitutoDataInicio: subIni,
          substitutoDataFim: subFim,
          supervisorEstagioId: supId,
          ...createPayload
        } = payload;
        const novo = await api.post<Funcionario>("/ponto/gestao/funcionarios", createPayload);
        const followUp: Record<string, unknown> = {};
        if (form.isManager && subId) {
          followUp.substitutoId = subId;
          followUp.substitutoDataInicio = subIni;
          followUp.substitutoDataFim = subFim;
        }
        if (isCategoriaEstagio(form.categoria) && typeof supId === "string" && supId) {
          followUp.supervisorEstagioId = supId;
        }
        if (Object.keys(followUp).length) {
          await api.put(`/ponto/gestao/funcionarios/${novo.id}`, followUp);
        }
        if (isRhOuAdmin) {
          await Promise.all([
            jornadaPeriodoId
              ? api.patch(`/ponto/gestao/funcionarios/${novo.id}/jornada-periodo`, {
                  jornadaPeriodoId
                })
              : Promise.resolve(),
            salvarModalidadeEndereco(novo.id)
          ]);
        }
      } else if (id) {
        await api.put(`/ponto/gestao/funcionarios/${id}`, payload);
        if (isRhOuAdmin) {
          await Promise.all([
            api.patch(`/ponto/gestao/funcionarios/${id}/jornada-periodo`, {
              jornadaPeriodoId: jornadaPeriodoId || null
            }),
            salvarModalidadeEndereco(id)
          ]);
        }
        if (id === user?.funcionario?.id) {
          void refreshProfile();
        }
      }
      navigate("/ponto/gestao");
    } catch (e) {
      const msg = (e as Error)?.message ?? "erro desconhecido";
      setErroSalvar(msg);
      alert("Não foi possível salvar: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  const subsecoesDisponiveis = form.gerenciaId
    ? [
        ...new Set(
          funcionarios
            .filter((f) => f.gerenciaId === form.gerenciaId && f.subsecao)
            .map((f) => f.subsecao!)
        )
      ].sort()
    : [];

  const selectStyle: React.CSSProperties = {
    ...fieldStyle,
    appearance: "none",
    padding: "9px 32px 9px 12px",
    cursor: "pointer"
  };

  /* "Situação" (ativo/inativo) é usada em duas seções (Geral e Cargo e Lotação
     para Empregado/Comissionado) — extraído para não duplicar o JSX. */
  function renderSituacaoToggle() {
    return (
      <div>
        <FieldLabel>Situação</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  ativo: v,
                  dataDesligamento: v ? "" : f.dataDesligamento
                }))
              }
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "var(--radius-md)",
                border: `2px solid ${form.ativo === v ? (v ? "var(--green)" : "var(--red)") : "rgba(122,30,38,0.12)"}`,
                background:
                  form.ativo === v
                    ? v
                      ? "rgba(47,125,79,0.08)"
                      : "rgba(200,57,63,0.06)"
                    : "transparent",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: form.ativo === v ? (v ? "var(--green)" : "var(--red)") : "var(--ink-500)",
                transition: "all 140ms"
              }}
            >
              {v ? "● Ativo" : "○ Inativo"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!isRH) {
    return (
      <div style={{ maxWidth: 520, margin: "60px auto", padding: "0 16px" }}>
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.12)",
            padding: "32px 28px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)"
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-900)", margin: "0 0 8px" }}>
            Acesso restrito
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6, margin: 0 }}>
            A edição de funcionários é exclusiva para o setor de <strong>Recursos Humanos</strong> e{" "}
            <strong>administradores do sistema</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (carregando) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", color: "var(--ink-500)", padding: "40px 0" }}>
        Carregando funcionário…
      </div>
    );
  }

  if (naoEncontrado) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link
          to="/ponto/gestao"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--burgundy-600)",
            textDecoration: "none",
            fontWeight: 500,
            marginBottom: 20
          }}
        >
          <ArrowLeftIcon size={15} />
          Voltar para Gestão de Funcionários
        </Link>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Edição
        </p>
        <h1
          style={{
            fontSize: "clamp(22px,3vw,28px)",
            fontFamily: "var(--font-display)",
            lineHeight: 1.1
          }}
        >
          Funcionário <em>não encontrado</em>
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 8 }}>
          O registro pode ter sido removido ou o identificador é inválido.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Link
        to="/ponto/gestao"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--burgundy-600)",
          textDecoration: "none",
          fontWeight: 500,
          marginBottom: 20
        }}
      >
        <ArrowLeftIcon size={15} />
        Voltar para Gestão de Funcionários
      </Link>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            {isNovo ? "Cadastro" : "Edição"}
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            {isNovo ? (
              <>
                Novo <em>Funcionário</em>
              </>
            ) : (
              <>
                Editar <em>Funcionário</em>
              </>
            )}
          </h1>
          {form.nome && (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-500)",
                marginTop: 6,
                maxWidth: 560,
                lineHeight: 1.6
              }}
            >
              {form.nome}
              {form.matricula ? ` · Matrícula ${form.matricula}` : ""}
            </p>
          )}
          {apiHint && (
            <p
              style={{ fontSize: 12, color: "var(--burgundy-600)", marginTop: 8, fontWeight: 500 }}
            >
              {apiHint}
            </p>
          )}
        </div>
      </div>

      <div className="card-flat" style={{ padding: isMobile ? 16 : 28 }}>
        {/* ══════════════════ GERAL ══════════════════ */}
        <SectionTitle>Geral</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols(catComChefe ? 3 : 2),
            gap: 16,
            marginBottom: 24
          }}
        >
          <div>
            <FieldLabel>Categoria *</FieldLabel>
            <SelectWrap>
              <select
                value={form.categoria}
                onChange={(e) => {
                  const cat = e.target.value as Categoria;
                  const chefeElegivel = cat === "CONCURSADO" || cat === "ASSESSOR";
                  setForm((f) => ({
                    ...f,
                    categoria: cat,
                    ...(isCategoriaEstagio(cat) ? {} : { supervisorEstagioId: "" }),
                    ...(chefeElegivel
                      ? {}
                      : {
                          isManager: false,
                          substitutoId: "",
                          substitutoDataInicio: "",
                          substitutoDataFim: ""
                        })
                  }));
                }}
                style={selectStyle}
              >
                {(Object.keys(CAT) as Categoria[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CAT[cat].label}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </div>
          {!isNovo && renderSituacaoToggle()}
          {catComChefe && (
            <div>
              <FieldLabel>Chefe</FieldLabel>
              <button
                type="button"
                aria-pressed={form.isManager}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    isManager: !f.isManager,
                    ...(f.isManager
                      ? { substitutoId: "", substitutoDataInicio: "", substitutoDataFim: "" }
                      : {})
                  }))
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "var(--radius-md)",
                  border: `2px solid ${form.isManager ? "var(--burgundy-600)" : "rgba(122,30,38,0.12)"}`,
                  background: form.isManager ? "rgba(122,30,38,0.06)" : "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: form.isManager ? "var(--burgundy-600)" : "var(--ink-700)"
                }}
              >
                <CrownIcon size={16} />
                {form.isManager ? "É Chefe desta Lotação/Setor" : "Marcar como Chefe"}
              </button>
              <Hint>
                Característica combinável com qualquer categoria — não altera a categoria do
                funcionário.
              </Hint>
            </div>
          )}
        </div>

        {isCategoriaEstagio(form.categoria) && (
          <div
            style={{
              marginBottom: 24,
              padding: "16px 16px 8px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(30,74,122,0.22)",
              background: "rgba(30,74,122,0.04)"
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--blue-ink)",
                margin: "0 0 6px"
              }}
            >
              Supervisor de Estágio
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--ink-500)",
                margin: "0 0 12px",
                lineHeight: 1.45
              }}
            >
              Qualquer pessoa da mesma gerência (incluindo o chefe) pode supervisionar — exceto
              estagiário e jovem aprendiz. Solicitações deste{" "}
              {form.categoria === "ESTAGIARIO" ? "estagiário" : "jovem aprendiz"} serão enviadas ao
              supervisor, não ao chefe da área — salvo se o chefe também for o supervisor.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldLabel>Supervisor *</FieldLabel>
              <select
                value={form.supervisorEstagioId}
                onChange={(e) => setForm((f) => ({ ...f, supervisorEstagioId: e.target.value }))}
                disabled={!form.gerenciaId}
                style={fieldStyle}
              >
                <option value="">Selecione o supervisor</option>
                {funcionarios
                  .filter(
                    (f) =>
                      f.gerenciaId === form.gerenciaId &&
                      f.id !== id &&
                      f.ativo &&
                      f.categoria !== "ESTAGIARIO" &&
                      f.categoria !== "MENOR_APRENDIZ"
                  )
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.user?.name ?? f.matricula}
                      {f.isManager ? " (Chefe)" : ""}
                      {" — "}
                      {CAT[f.categoria]?.label ?? f.categoria}
                    </option>
                  ))}
              </select>
              {!form.gerenciaId && (
                <Hint>Selecione a gerência antes de escolher o supervisor.</Hint>
              )}
            </div>
          </div>
        )}

        {form.isManager && (
          <div
            style={{
              marginBottom: 24,
              padding: "16px 16px 8px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(91,74,158,0.22)",
              background: "rgba(91,74,158,0.04)"
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#5b4a9e",
                margin: "0 0 6px"
              }}
            >
              Chefe Substituto
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--ink-500)",
                margin: "0 0 12px",
                lineHeight: 1.45
              }}
            >
              No período informado, o titular fica inativo e o substituto assume{" "}
              {ehChefeDeCoordenacao ? "a coordenação (mesma subseção)" : "a gerência (mesma área)"}{" "}
              com as atribuições de chefe. Somente <strong>Efetivo</strong> ou{" "}
              <strong>Comissionado</strong>{" "}
              {ehChefeDeCoordenacao ? "da mesma subseção" : "da mesma gerência"} podem substituir.
              Ao término, tudo é revertido.
            </p>
            <div style={{ marginBottom: 12 }}>
              <FieldLabel>
                Substituto (Efetivo ou Comissionado da mesma{" "}
                {ehChefeDeCoordenacao ? "subseção" : "gerência"})
              </FieldLabel>
              <select
                value={form.substitutoId}
                onChange={(e) => setForm((f) => ({ ...f, substitutoId: e.target.value }))}
                disabled={!form.gerenciaId}
                style={fieldStyle}
              >
                <option value="">Nenhum (sem substituição)</option>
                {funcionarios
                  .filter(
                    (f) =>
                      f.gerenciaId === form.gerenciaId &&
                      f.id !== id &&
                      f.ativo &&
                      (f.categoria === "CONCURSADO" || f.categoria === "ASSESSOR") &&
                      (!ehChefeDeCoordenacao || f.subsecao === form.subsecao)
                  )
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.user?.name ?? f.matricula} — {CAT[f.categoria]?.label ?? f.categoria}
                    </option>
                  ))}
              </select>
              {!form.gerenciaId && (
                <Hint>Selecione a gerência antes de escolher o substituto.</Hint>
              )}
              {ehChefeDeCoordenacao && !form.subsecao && (
                <Hint>Selecione a subseção antes de escolher o substituto.</Hint>
              )}
            </div>
            {form.substitutoId && (
              <div style={{ display: "grid", gridTemplateColumns: grid, gap: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <FieldLabel>Início *</FieldLabel>
                  <input
                    type="date"
                    value={form.substitutoDataInicio}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, substitutoDataInicio: e.target.value }))
                    }
                    style={fieldStyle}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <FieldLabel>Fim *</FieldLabel>
                  <input
                    type="date"
                    value={form.substitutoDataFim}
                    onChange={(e) => setForm((f) => ({ ...f, substitutoDataFim: e.target.value }))}
                    style={fieldStyle}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ IDENTIFICAÇÃO ══════════════════ */}
        <SectionTitle>Identificação</SectionTitle>
        <div
          style={{ display: "grid", gridTemplateColumns: gridCols(3), gap: 16, marginBottom: 16 }}
        >
          <div>
            <FieldLabel>Nome e último nome *</FieldLabel>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Nome completo"
              style={fieldStyle}
            />
          </div>
          <div>
            <FieldLabel>Matrícula *</FieldLabel>
            <input
              type="text"
              value={form.matricula}
              onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))}
              placeholder="Ex: 00123 ou EST01"
              style={fieldStyle}
            />
          </div>
          <div>
            <FieldLabel>CPF</FieldLabel>
            <input
              type="text"
              value={form.cpf}
              onChange={(e) => setForm((f) => ({ ...f, cpf: formatCpf(e.target.value) }))}
              placeholder="000.000.000-00"
              maxLength={14}
              style={{
                ...fieldStyle,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.05em",
                border: `1px solid ${cpfInvalido ? "var(--red)" : cpfValido ? "var(--green)" : "rgba(122,30,38,0.14)"}`
              }}
            />
            {cpfInvalido && (
              <p
                style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--red)", fontWeight: 500 }}
              >
                CPF inválido. Verifique os dígitos.
              </p>
            )}
            {cpfValido && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 11.5,
                  color: "var(--green)",
                  fontWeight: 500
                }}
              >
                CPF válido.
              </p>
            )}
          </div>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: gridCols(4), gap: 16, marginBottom: 16 }}
        >
          <div>
            <FieldLabel>RG</FieldLabel>
            <input
              type="text"
              value={form.rg}
              onChange={(e) => setForm((f) => ({ ...f, rg: formatRg(e.target.value) }))}
              style={fieldStyle}
            />
          </div>
          <div>
            <FieldLabel>Órgão Emissor</FieldLabel>
            <input
              type="text"
              value={form.rgOrgaoEmissor}
              onChange={(e) => setForm((f) => ({ ...f, rgOrgaoEmissor: e.target.value }))}
              placeholder="SSP"
              style={fieldStyle}
            />
          </div>
          <div>
            <FieldLabel>UF do Órgão Emissor</FieldLabel>
            <input
              type="text"
              value={form.rgUf}
              onChange={(e) =>
                setForm((f) => ({ ...f, rgUf: e.target.value.toUpperCase().slice(0, 2) }))
              }
              placeholder="DF"
              maxLength={2}
              style={{ ...fieldStyle, textTransform: "uppercase" }}
            />
          </div>
          <div>
            <FieldLabel>Data de Emissão do RG</FieldLabel>
            <input
              type="date"
              value={form.rgDataEmissao}
              onChange={(e) => setForm((f) => ({ ...f, rgDataEmissao: e.target.value }))}
              style={fieldStyle}
            />
          </div>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: gridCols(3), gap: 16, marginBottom: 16 }}
        >
          <div>
            <FieldLabel>Data de Nascimento</FieldLabel>
            <input
              type="date"
              value={form.dataNascimento}
              onChange={(e) => setForm((f) => ({ ...f, dataNascimento: e.target.value }))}
              style={fieldStyle}
            />
            <Hint>Necessário para liberar o Day Off de Aniversário.</Hint>
          </div>
          <div>
            <FieldLabel>Raça</FieldLabel>
            <SelectWrap>
              <select
                value={form.raca}
                onChange={(e) => setForm((f) => ({ ...f, raca: e.target.value }))}
                style={selectStyle}
              >
                <option value="">Não informado</option>
                {RACA_OPCOES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </div>
          <div>
            <FieldLabel>Gênero</FieldLabel>
            <SelectWrap>
              <select
                value={form.genero}
                onChange={(e) => setForm((f) => ({ ...f, genero: e.target.value }))}
                style={selectStyle}
              >
                <option value="">Não informado</option>
                {GENERO_OPCOES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </div>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: gridCols(3), gap: 16, marginBottom: 8 }}
        >
          <div>
            <FieldLabel>E-mail institucional</FieldLabel>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              onBlur={() =>
                setForm((f) => ({ ...f, email: emailInstitucional(f.email) || f.email }))
              }
              placeholder="nome@cfo.org.br"
              style={fieldStyle}
            />
            <Hint>Domínio institucional @cfo.org.br (máscaras de login SSO são convertidas).</Hint>
          </div>
          <div>
            <FieldLabel>E-mail pessoal</FieldLabel>
            <input
              type="email"
              value={form.emailPessoal}
              onChange={(e) => setForm((f) => ({ ...f, emailPessoal: e.target.value }))}
              placeholder="pessoal@exemplo.com"
              style={fieldStyle}
            />
          </div>
          <div>
            <FieldLabel>Telefone</FieldLabel>
            <input
              type="text"
              value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: formatTelefone(e.target.value) }))}
              placeholder="(61) 99999-9999"
              style={fieldStyle}
            />
          </div>
        </div>

        {(form.categoria === "CONCURSADO" || form.categoria === "ASSESSOR") && (
          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Dependentes (Filhos)</FieldLabel>
            {form.dependentes.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 2 }}>
                  <FieldLabel>Nome</FieldLabel>
                </div>
                <div style={{ flex: 1 }}>
                  <FieldLabel>CPF</FieldLabel>
                </div>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Data de Nascimento</FieldLabel>
                </div>
                <div style={{ width: 32, flexShrink: 0 }} />
              </div>
            )}
            {form.dependentes.map((d, idx) => (
              <div
                key={idx}
                style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}
              >
                <input
                  type="text"
                  value={d.nome}
                  placeholder="Nome do(a) filho(a)"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      dependentes: f.dependentes.map((x, i) =>
                        i === idx ? { ...x, nome: e.target.value } : x
                      )
                    }))
                  }
                  style={{ ...fieldStyle, flex: 2 }}
                />
                <input
                  type="text"
                  value={d.cpf ?? ""}
                  placeholder="CPF do(a) filho(a)"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      dependentes: f.dependentes.map((x, i) =>
                        i === idx ? { ...x, cpf: formatCpf(e.target.value) } : x
                      )
                    }))
                  }
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <input
                  type="date"
                  value={d.dataNascimento ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      dependentes: f.dependentes.map((x, i) =>
                        i === idx ? { ...x, dataNascimento: e.target.value } : x
                      )
                    }))
                  }
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      dependentes: f.dependentes.filter((_, i) => i !== idx)
                    }))
                  }
                  aria-label="Remover dependente"
                  style={{
                    padding: 8,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(200,57,63,0.25)",
                    background: "transparent",
                    color: "var(--red)",
                    cursor: "pointer",
                    display: "flex",
                    flexShrink: 0
                  }}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  dependentes: [...f.dependentes, { nome: "", cpf: "", dataNascimento: "" }]
                }))
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px dashed rgba(122,30,38,0.28)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600
              }}
            >
              <PlusIcon size={13} /> Adicionar dependente
            </button>
          </div>
        )}

        {/* ══════════════════ CARGO E LOTAÇÃO ══════════════════ */}
        <SectionTitle>Cargo e Lotação</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols(catEmpregado || catComissionado ? 3 : 2),
            gap: 16,
            marginBottom: 16
          }}
        >
          {(catEmpregado || catComissionado) && (
            <div>
              <FieldLabel>Cargo</FieldLabel>
              <input
                type="text"
                value={form.cargo}
                onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
                style={fieldStyle}
              />
            </div>
          )}
          <div>
            <FieldLabel>Departamento *</FieldLabel>
            <SelectWrap>
              <select
                value={form.gerenciaId}
                onChange={(e) => setForm((f) => ({ ...f, gerenciaId: e.target.value }))}
                style={{
                  ...selectStyle,
                  color: form.gerenciaId ? "var(--ink-900)" : "var(--ink-500)"
                }}
              >
                <option value="">Selecione um departamento…</option>
                {gerencias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </div>
          {form.gerenciaId && subsecoesDisponiveis.length > 0 && (
            <div>
              <FieldLabel>Coordenação</FieldLabel>
              <SelectWrap>
                <select
                  value={form.subsecao}
                  onChange={(e) => setForm((f) => ({ ...f, subsecao: e.target.value }))}
                  style={{
                    ...selectStyle,
                    color: form.subsecao ? "var(--ink-900)" : "var(--ink-500)"
                  }}
                >
                  <option value="">Sem coordenação (membro direto do departamento)</option>
                  {subsecoesDisponiveis.map((s) => (
                    <option key={s} value={s}>
                      {slugLabel(s)}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            </div>
          )}
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: gridCols(3), gap: 16, marginBottom: 8 }}
        >
          <div>
            <FieldLabel>Lotação</FieldLabel>
            <input
              type="text"
              disabled
              value={`${nomeGerencia(gerencias, form.gerenciaId)}${form.subsecao ? ` / ${slugLabel(form.subsecao)}` : ""}`}
              style={{ ...fieldStyle, color: "var(--ink-500)", background: "var(--cream-50)" }}
            />
            {catComChefe && (
              <Hint>
                Chefe: {funcionarioAtual ? chefeDaLotacao(funcionarioAtual) : "—"} (somente leitura)
              </Hint>
            )}
          </div>
          <div>
            <FieldLabel>Data Início</FieldLabel>
            <input
              type="date"
              value={form.lotacaoInicio}
              onChange={(e) => setForm((f) => ({ ...f, lotacaoInicio: e.target.value }))}
              style={fieldStyle}
            />
          </div>
          <div>
            <FieldLabel>Data Fim</FieldLabel>
            <input
              type="date"
              value={form.lotacaoTermino}
              onChange={(e) => setForm((f) => ({ ...f, lotacaoTermino: e.target.value }))}
              style={fieldStyle}
            />
          </div>
        </div>

        {!isNovo && id && (
          <HistoricoLotacaoAccordion
            funcionarioId={id}
            gerencias={gerencias}
            onRegistrado={(mov) =>
              setForm((f) => ({
                ...f,
                cargo: mov.cargo ?? f.cargo,
                gerenciaId: mov.gerenciaId || f.gerenciaId,
                subsecao: mov.subsecao ?? f.subsecao,
                cargoData: mov.cargoData || f.cargoData,
                lotacaoInicio: mov.lotacaoInicio,
                lotacaoTermino: ""
              }))
            }
            apenasSetorLotacao={catEmpregado}
          />
        )}

        {/* ══════════════════ JORNADA ══════════════════ */}
        <SectionTitle>Jornada</SectionTitle>
        <div
          style={{ display: "grid", gridTemplateColumns: gridCols(3), gap: 16, marginBottom: 16 }}
        >
          {isRhOuAdmin && (
            <div>
              <FieldLabel>Data de Admissão</FieldLabel>
              <input
                type="date"
                value={form.dataAdmissao}
                onChange={(e) => setForm((f) => ({ ...f, dataAdmissao: e.target.value }))}
                style={fieldStyle}
              />
              <Hint>Usada para calcular os ciclos de férias do funcionário.</Hint>
            </div>
          )}
          <div>
            <FieldLabel>Data de Desligamento</FieldLabel>
            <input
              type="date"
              value={form.dataDesligamento}
              onChange={(e) => setForm((f) => ({ ...f, dataDesligamento: e.target.value }))}
              style={fieldStyle}
            />
            <Hint>
              Preenchida (hoje ou no passado) desativa o funcionário na hora; no futuro, desativa
              sozinho na data.
            </Hint>
          </div>
          <div>
            <FieldLabel>Atividade</FieldLabel>
            <SelectWrap>
              <select
                value={form.atividade}
                onChange={(e) =>
                  setForm((f) => ({ ...f, atividade: e.target.value as typeof f.atividade }))
                }
                style={selectStyle}
              >
                <option value="">Não informado</option>
                {ATIVIDADE_OPCOES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols(catEmpregado ? 3 : 2),
            gap: 16,
            marginBottom: 8
          }}
        >
          {catEmpregado && (
            <div>
              <FieldLabel>É fiscal?</FieldLabel>
              <div style={{ paddingTop: 8 }}>
                <Toggle
                  checked={form.isFiscal}
                  onChange={(v) => setForm((f) => ({ ...f, isFiscal: v }))}
                  label="Funcionário é fiscal"
                />
              </div>
              <Hint>Fiscal fica automaticamente isento de registro de ponto, como o Chefe.</Hint>
            </div>
          )}
          {(catEmpregado || catEstagiario || catJovemAprendiz) && isRhOuAdmin && (
            <div>
              <FieldLabel>Registro de Ponto</FieldLabel>
              <SelectWrap>
                <select
                  value={form.jornadaPeriodoId}
                  onChange={(e) => setForm((f) => ({ ...f, jornadaPeriodoId: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">Usar jornada padrão do sistema</option>
                  {jornadasDisponiveis
                    .filter((j) => j)
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nome}
                        {j.ePadrao ? " (Padrão)" : ""}
                      </option>
                    ))}
                </select>
              </SelectWrap>
              <Hint>
                Jornadas configuradas em{" "}
                <a href="/ponto/configuracoes" style={{ color: "var(--burgundy-600)" }}>
                  Configurações → Períodos
                </a>
                .
              </Hint>
            </div>
          )}
          <div>
            <FieldLabel>Vale-transporte</FieldLabel>
            <div style={{ paddingTop: 8 }}>
              <Toggle
                checked={form.valeTransporte}
                onChange={(v) => setForm((f) => ({ ...f, valeTransporte: v }))}
                label="Recebe vale-transporte"
              />
            </div>
          </div>
        </div>

        {(catEstagiario || catJovemAprendiz) && (
          <div style={{ marginTop: 16 }}>
            <FieldLabel>
              Dados do Contrato de {catEstagiario ? "Estágio" : "Jovem Aprendiz"}
            </FieldLabel>
            <div
              style={{ display: "grid", gridTemplateColumns: gridCols(4), gap: 16, marginTop: 8 }}
            >
              {catEstagiario && (
                <>
                  <div>
                    <FieldLabel>Curso</FieldLabel>
                    <input
                      type="text"
                      value={form.curso}
                      onChange={(e) => setForm((f) => ({ ...f, curso: e.target.value }))}
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Bolsa-auxílio</FieldLabel>
                    <input
                      type="number"
                      step="0.01"
                      value={form.bolsaAuxilio}
                      onChange={(e) => setForm((f) => ({ ...f, bolsaAuxilio: e.target.value }))}
                      style={fieldStyle}
                    />
                  </div>
                </>
              )}
              <div>
                <FieldLabel>Data de Início</FieldLabel>
                <input
                  type="date"
                  value={form.contratoInicio}
                  onChange={(e) => setForm((f) => ({ ...f, contratoInicio: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Data de Término{catEstagiario ? " *" : ""}</FieldLabel>
                <input
                  type="date"
                  value={form.contratoTermino}
                  onChange={(e) => setForm((f) => ({ ...f, contratoTermino: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Carga Horária</FieldLabel>
                <input
                  type="text"
                  value={form.cargaHoraria}
                  onChange={(e) => setForm((f) => ({ ...f, cargaHoraria: e.target.value }))}
                  placeholder="Ex: 20h semanais"
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Dias da Semana</FieldLabel>
                <input
                  type="text"
                  value={form.diasSemana}
                  onChange={(e) => setForm((f) => ({ ...f, diasSemana: e.target.value }))}
                  placeholder="Ex: Seg a Sex"
                  style={fieldStyle}
                />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ CAPACITAÇÃO ══════════════════ */}
        <SectionTitle>Capacitação</SectionTitle>

        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Formação Acadêmica</FieldLabel>
          {form.formacoesAcademicas.map((fa, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr 1.4fr 1fr auto",
                gap: 8,
                marginBottom: 8,
                alignItems: "center"
              }}
            >
              <SelectWrap>
                <select
                  value={fa.grauEscolaridade ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      formacoesAcademicas: f.formacoesAcademicas.map((x, i) =>
                        i === idx ? { ...x, grauEscolaridade: e.target.value } : x
                      )
                    }))
                  }
                  style={selectStyleBase}
                >
                  <option value="">Grau</option>
                  {GRAU_ESCOLARIDADE_OPCOES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </SelectWrap>
              <input
                type="text"
                value={fa.curso}
                placeholder="Curso"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    formacoesAcademicas: f.formacoesAcademicas.map((x, i) =>
                      i === idx ? { ...x, curso: e.target.value } : x
                    )
                  }))
                }
                style={fieldStyle}
              />
              <input
                type="text"
                value={fa.instituicao ?? ""}
                placeholder="Instituição"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    formacoesAcademicas: f.formacoesAcademicas.map((x, i) =>
                      i === idx ? { ...x, instituicao: e.target.value } : x
                    )
                  }))
                }
                style={fieldStyle}
              />
              <input
                type="date"
                value={fa.conclusao ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    formacoesAcademicas: f.formacoesAcademicas.map((x, i) =>
                      i === idx ? { ...x, conclusao: e.target.value } : x
                    )
                  }))
                }
                style={fieldStyle}
              />
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    formacoesAcademicas: f.formacoesAcademicas.filter((_, i) => i !== idx)
                  }))
                }
                aria-label="Remover formação"
                style={{
                  padding: 8,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(200,57,63,0.25)",
                  background: "transparent",
                  color: "var(--red)",
                  cursor: "pointer",
                  display: "flex",
                  flexShrink: 0
                }}
              >
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                formacoesAcademicas: [
                  ...f.formacoesAcademicas,
                  { grauEscolaridade: "", curso: "", instituicao: "", conclusao: "" }
                ]
              }))
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px dashed rgba(122,30,38,0.28)",
              background: "transparent",
              color: "var(--burgundy-600)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600
            }}
          >
            <PlusIcon size={13} /> Adicionar formação
          </button>
        </div>

        <div style={{ marginBottom: 8 }}>
          <FieldLabel>Cursos / Capacitações</FieldLabel>
          {form.capacitacoes.map((c, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "2fr 1.4fr 1fr auto",
                gap: 8,
                marginBottom: 8,
                alignItems: "center"
              }}
            >
              <input
                type="text"
                value={c.nome}
                placeholder="Nome do curso/capacitação"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    capacitacoes: f.capacitacoes.map((x, i) =>
                      i === idx ? { ...x, nome: e.target.value } : x
                    )
                  }))
                }
                style={fieldStyle}
              />
              <input
                type="text"
                value={c.instituicao ?? ""}
                placeholder="Instituição"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    capacitacoes: f.capacitacoes.map((x, i) =>
                      i === idx ? { ...x, instituicao: e.target.value } : x
                    )
                  }))
                }
                style={fieldStyle}
              />
              <input
                type="date"
                value={c.conclusao ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    capacitacoes: f.capacitacoes.map((x, i) =>
                      i === idx ? { ...x, conclusao: e.target.value } : x
                    )
                  }))
                }
                style={fieldStyle}
              />
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    capacitacoes: f.capacitacoes.filter((_, i) => i !== idx)
                  }))
                }
                aria-label="Remover capacitação"
                style={{
                  padding: 8,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(200,57,63,0.25)",
                  background: "transparent",
                  color: "var(--red)",
                  cursor: "pointer",
                  display: "flex",
                  flexShrink: 0
                }}
              >
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                capacitacoes: [...f.capacitacoes, { nome: "", instituicao: "", conclusao: "" }]
              }))
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px dashed rgba(122,30,38,0.28)",
              background: "transparent",
              color: "var(--burgundy-600)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600
            }}
          >
            <PlusIcon size={13} /> Adicionar curso/capacitação
          </button>
        </div>

        {isRhOuAdmin && (
          <>
            <hr
              style={{
                border: "none",
                borderTop: "1px solid rgba(122,30,38,0.08)",
                margin: "20px 0 20px"
              }}
            />

            {/* ══════════════════ MODALIDADES DE TRABALHO REMOTO ══════════════════ */}
            <SectionTitle>Modalidades de Trabalho Remoto</SectionTitle>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: 8
              }}
            >
              {(
                [
                  ["modoHomeOffice", "Home Office", "Pode registrar o ponto de casa todos os dias"],
                  [
                    "modoHibridoLocal",
                    "Híbrido",
                    `Pode trabalhar de casa até ${hibridoMaxDias} dia(s) por semana (regra global)`
                  ]
                ] as const
              ).map(([key, label, desc]) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${
                      modalidade[key] ? "rgba(122,30,38,0.28)" : "rgba(122,30,38,0.10)"
                    }`,
                    background: modalidade[key] ? "rgba(122,30,38,0.04)" : "rgba(122,30,38,0.02)"
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>
                      {label}
                    </p>
                    <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>{desc}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={modalidade[key]}
                    onClick={() =>
                      setModalidade((m) => ({
                        modoHomeOffice: key === "modoHomeOffice" ? !m[key] : false,
                        modoHibridoLocal: key === "modoHibridoLocal" ? !m[key] : false
                      }))
                    }
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                      background: modalidade[key] ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)",
                      position: "relative",
                      transition: "background 200ms"
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 3,
                        left: modalidade[key] ? 22 : 3,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 200ms",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.25)"
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* ══════════════════ ENDEREÇO ══════════════════ */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 20,
                marginBottom: 12,
                gap: 12,
                flexWrap: "wrap"
              }}
            >
              <SectionTitle>Endereço</SectionTitle>
              {!isNovo && (
                <button
                  type="button"
                  onClick={() => void solicitarEndereco()}
                  disabled={enviandoReq}
                  title="Solicitar ao funcionário que preencha o endereço residencial"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.22)",
                    background:
                      requerimentoAtual?.status === "PENDENTE"
                        ? "rgba(247,196,55,0.12)"
                        : "transparent",
                    cursor: enviandoReq ? "wait" : "pointer",
                    fontSize: 11.5,
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                    color: requerimentoAtual?.status === "PENDENTE" ? "#8a6a00" : "var(--ink-600)",
                    opacity: enviandoReq ? 0.6 : 1
                  }}
                >
                  <MapPinIcon size={13} />
                  {enviandoReq
                    ? "Enviando…"
                    : requerimentoAtual?.status === "PENDENTE"
                      ? "Aguardando resposta"
                      : requerimentoAtual?.status === "RESPONDIDO"
                        ? "Reenviar solicitação"
                        : "Solicitar Endereço"}
                </button>
              )}
            </div>
            {requerimentoAtual && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                  background:
                    requerimentoAtual.status === "PENDENTE"
                      ? "rgba(247,196,55,0.10)"
                      : "rgba(47,125,79,0.07)",
                  border: `1px solid ${
                    requerimentoAtual.status === "PENDENTE"
                      ? "rgba(247,196,55,0.30)"
                      : "rgba(47,125,79,0.18)"
                  }`,
                  color: requerimentoAtual.status === "PENDENTE" ? "#8a6a00" : "var(--green)"
                }}
              >
                {requerimentoAtual.status === "PENDENTE"
                  ? `⏳ Solicitação enviada em ${new Date(requerimentoAtual.criadoEm).toLocaleDateString("pt-BR")} — aguardando o funcionário preencher o endereço.`
                  : `✓ Funcionário respondeu a solicitação.`}
              </div>
            )}
            <p
              style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.5 }}
            >
              Endereço residencial do funcionário. Usado para validar o ponto em Home Office e
              Híbrido — raio de <strong>{endereco.raioMetros ?? 20}m</strong>.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: grid, gap: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 280px) auto",
                  gap: 8,
                  gridColumn: "1 / -1",
                  justifyContent: "start"
                }}
              >
                <div>
                  <FieldLabel>CEP</FieldLabel>
                  <input
                    type="text"
                    value={endereco.cep ?? ""}
                    onChange={(e) => setEndereco((x) => ({ ...x, cep: e.target.value }))}
                    onBlur={(e) => buscarCep(e.target.value)}
                    placeholder="00000-000"
                    style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => buscarCep(endereco.cep ?? "")}
                    disabled={cepLoading}
                    style={{
                      padding: "9px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.20)",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--burgundy-600)",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {cepLoading ? "..." : "Buscar"}
                  </button>
                </div>
              </div>
              <div>
                <FieldLabel>Logradouro</FieldLabel>
                <input
                  type="text"
                  value={endereco.logradouro ?? ""}
                  onChange={(e) => setEndereco((x) => ({ ...x, logradouro: e.target.value }))}
                  placeholder="Rua, Av..."
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Nº</FieldLabel>
                <input
                  type="text"
                  value={endereco.numero ?? ""}
                  onChange={(e) => setEndereco((x) => ({ ...x, numero: e.target.value }))}
                  placeholder="S/N"
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Complemento</FieldLabel>
                <input
                  type="text"
                  value={endereco.complemento ?? ""}
                  onChange={(e) => setEndereco((x) => ({ ...x, complemento: e.target.value }))}
                  placeholder="Apto 301, Bloco B..."
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Bairro</FieldLabel>
                <input
                  type="text"
                  value={endereco.bairro ?? ""}
                  onChange={(e) => setEndereco((x) => ({ ...x, bairro: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Cidade</FieldLabel>
                <input
                  type="text"
                  value={endereco.cidade ?? ""}
                  onChange={(e) => setEndereco((x) => ({ ...x, cidade: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>UF</FieldLabel>
                <input
                  type="text"
                  value={endereco.uf ?? ""}
                  onChange={(e) => setEndereco((x) => ({ ...x, uf: e.target.value }))}
                  placeholder="DF"
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Raio (metros)</FieldLabel>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={endereco.raioMetros ?? 20}
                  onChange={(e) => setEndereco((x) => ({ ...x, raioMetros: +e.target.value }))}
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => void abrirMapaComGeocode()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid rgba(122,30,38,0.22)",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--ink-700)",
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "var(--font-body)",
                    whiteSpace: "nowrap"
                  }}
                >
                  <MapPinIcon size={14} />
                  {endereco.lat ? "Ajustar no Mapa" : "Definir no Mapa"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              {endereco.lat && endereco.lng ? (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(47,125,79,0.07)",
                    border: "1px solid rgba(47,125,79,0.18)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    color: "var(--green)"
                  }}
                >
                  {Number(endereco.lat).toLocaleString("en-US", {
                    minimumFractionDigits: 6,
                    maximumFractionDigits: 6
                  })}
                  ,{" "}
                  {Number(endereco.lng).toLocaleString("en-US", {
                    minimumFractionDigits: 6,
                    maximumFractionDigits: 6
                  })}{" "}
                  · raio {endereco.raioMetros ?? 20}m
                </div>
              ) : (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(200,57,63,0.05)",
                    border: "1px solid rgba(200,57,63,0.15)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12,
                    color: "var(--red)"
                  }}
                >
                  Sem coordenadas — defina no mapa para validar o ponto remoto. O restante do
                  cadastro pode ser salvo mesmo sem coordenadas.
                </div>
              )}
            </div>
          </>
        )}

        <div
          style={{
            marginTop: 20,
            padding: "10px 12px",
            background: "var(--cream-50)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
            color: "var(--ink-500)"
          }}
        >
          Campos marcados com * são obrigatórios.
        </div>
        {erroSalvar && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "rgba(200,57,63,0.08)",
              border: "1px solid rgba(200,57,63,0.22)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              color: "var(--red)",
              fontWeight: 500
            }}
          >
            {erroSalvar}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          marginTop: 20,
          paddingBottom: 8,
          flexWrap: "wrap"
        }}
      >
        <button className="btn btn-ghost" onClick={voltar}>
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          onClick={() => void salvar()}
          disabled={salvando}
          style={{ opacity: podeSalvar ? 1 : 0.55 }}
        >
          {salvando ? "Salvando…" : isNovo ? "Cadastrar Funcionário" : "Salvar Alterações"}
        </button>
      </div>
      {!podeSalvar && !salvando && motivosBloqueio().length > 0 && (
        <p style={{ textAlign: "right", marginTop: 8, fontSize: 12, color: "var(--red)" }}>
          {`Preencha: ${motivosBloqueio().join(", ")}.`}
        </p>
      )}

      {mapaAberto && (
        <MapModal
          lat={endereco.lat ?? -15.7876}
          lng={endereco.lng ?? -47.904}
          raio={endereco.raioMetros ?? 20}
          titulo="Localização Residencial"
          minRaio={10}
          maxRaio={500}
          onConfirm={onMapaConfirm}
          onClose={() => setMapaAberto(false)}
        />
      )}
    </div>
  );
}

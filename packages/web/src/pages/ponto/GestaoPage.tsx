import React, { useState, useEffect } from "react";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import { MapModal, MapResult } from "../../components/MapModal";
import { geocodificarEndereco } from "../../utils/geocode";
import {
  UsersIcon,
  SearchIcon,
  Edit2Icon,
  Trash2Icon,
  XIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
  BriefcaseIcon,
  CrownIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  MapPinIcon
} from "../../components/icons";
import { ExtensionsApiPanel } from "../../components/ExtensionsApiPanel";

/* ─── Types ─── */
type Categoria = "ESTAGIARIO" | "CONCURSADO" | "ASSESSOR" | "GERENTE";

interface Gerencia {
  id: string;
  nome: string;
  sigla: string;
}
interface JornadaPeriodo {
  id: string;
  nome: string;
  ePadrao: boolean;
}

interface EnderecoResidencial {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  lat?: number | null;
  lng?: number | null;
  raioMetros: number;
}

interface Funcionario {
  id: string;
  matricula: string | null;
  cpf?: string | null;
  fotoPerfilUrl?: string | null;
  email: string;
  cargo: string;
  categoria: Categoria;
  gerenciaId: string;
  jornadaPeriodoId?: string | null;
  jornadaPeriodo?: JornadaPeriodo | null;
  modoHomeOffice?: boolean;
  modoHibridoLocal?: boolean;
  enderecoResidencial?: EnderecoResidencial | null;
  requerimentoEndereco?: {
    id: string;
    status: string;
    criadoEm: string;
    respondidoEm?: string | null;
  } | null;
  ativo: boolean;
  section?: string | null;
  subsecao?: string | null;
  isManager?: boolean;
  ramal?: string | null;
  sala?: string | null;
  andar?: string | null;
  dataNascimento?: string | null;
  user: { id: string; name: string; email: string; emailReal: string | null };
  gerencia?: { id: string; nome: string; sigla: string } | null;
}

/* Converte slug kebab-case → nome capitalizado (ex: "desenvolvimento" → "Desenvolvimento") */
function slugLabel(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Monta a linha de localização/contato apenas com os campos preenchidos.
 *  Retorna null quando não há nada a exibir. */
function infoContato(f: {
  ramal?: string | null;
  sala?: string | null;
  andar?: string | null;
}): string | null {
  const partes = [
    f.ramal ? `Ramal ${f.ramal}` : null,
    f.sala ? `Sala ${f.sala}` : null,
    f.andar ?? null
  ].filter((v): v is string => Boolean(v));
  return partes.length ? partes.join(" · ") : null;
}

const SSO_FAKE_SUFFIXES = ["@sso.local", "@pending.local"];

function resolveEmail(u: { email: string; emailReal: string | null }): string {
  if (u.emailReal) return u.emailReal;
  for (const suffix of SSO_FAKE_SUFFIXES) {
    if (u.email.endsWith(suffix)) {
      return u.email.replace(suffix, "@cfo.org.br");
    }
  }
  return u.email;
}

/* ─── CPF utils ─── */
function formatCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function isValidCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let r = (s * 10) % 11;
  if (r >= 10) r = 0;
  if (r !== +d[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  r = (s * 10) % 11;
  if (r >= 10) r = 0;
  return r === +d[10];
}

/* ─── Config de categoria ─── */
const CAT: Record<Categoria, { label: string; cor: string; bg: string; icon: React.ElementType }> =
  {
    ESTAGIARIO: {
      label: "Estagiário",
      cor: "var(--blue-ink)",
      bg: "rgba(30,74,122,0.08)",
      icon: GraduationCapIcon
    },
    CONCURSADO: {
      label: "Concursado",
      cor: "var(--green)",
      bg: "rgba(47,125,79,0.08)",
      icon: ShieldCheckIcon
    },
    ASSESSOR: {
      label: "Assessor",
      cor: "#8a6a00",
      bg: "rgba(247,196,55,0.12)",
      icon: BriefcaseIcon
    },
    GERENTE: {
      label: "Gerente",
      cor: "var(--burgundy-600)",
      bg: "rgba(122,30,38,0.08)",
      icon: CrownIcon
    }
  };

/* ─── Form vazio ─── */
const FORM_VAZIO = {
  nome: "",
  matricula: "",
  email: "",
  cpf: "",
  cargo: "",
  categoria: "CONCURSADO" as Categoria,
  gerenciaId: "",
  jornadaPeriodoId: "",
  subsecao: "",
  ativo: true,
  dataNascimento: "",
  dataAdmissao: ""
};

/* ─── Stat Card ─── */
function Stat({ valor, label, cor }: { valor: number; label: string; cor: string }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "16px 20px",
        minWidth: 110
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          fontSize: 28,
          color: cor,
          lineHeight: 1,
          marginBottom: 4
        }}
      >
        {valor}
      </p>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-500)"
        }}
      >
        {label}
      </p>
    </div>
  );
}

/* ─── Badge Categoria ─── */
function CategoriaBadge({ cat }: { cat: Categoria }) {
  const c = CAT[cat];
  const Icon = c.icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: "var(--radius-full)",
        background: c.bg,
        color: c.cor,
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: "nowrap"
      }}
    >
      <Icon size={12} />
      {c.label}
    </span>
  );
}

/* ─── Botão: Solicitar Endereço para Todos ─── */
function SolicitarEnderecoTodosBtn() {
  const [status, setStatus] = React.useState<"idle" | "loading" | "ok" | "erro">("idle");
  const [total, setTotal] = React.useState(0);

  async function solicitar() {
    if (
      !confirm(
        "Enviar solicitação de endereço residencial para todos os funcionários ativos? Eles verão um formulário na próxima vez que acessarem o registro de ponto."
      )
    )
      return;
    setStatus("loading");
    try {
      const res = await api.post<{ total: number }>(
        "/ponto/gestao/requerimento-endereco/todos",
        {}
      );
      setTotal(res?.total ?? 0);
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("erro");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <button
      onClick={() => void solicitar()}
      disabled={status === "loading"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "9px 16px",
        borderRadius: "var(--radius-md)",
        border: "1.5px solid rgba(122,30,38,0.22)",
        background:
          status === "ok"
            ? "rgba(47,125,79,0.08)"
            : status === "erro"
              ? "rgba(200,57,63,0.08)"
              : "transparent",
        cursor: status === "loading" ? "wait" : "pointer",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "var(--font-body)",
        color:
          status === "ok" ? "var(--green)" : status === "erro" ? "var(--red)" : "var(--ink-700)",
        opacity: status === "loading" ? 0.7 : 1,
        transition: "all 200ms",
        whiteSpace: "nowrap"
      }}
    >
      <MapPinIcon size={15} />
      {status === "loading"
        ? "Enviando…"
        : status === "ok"
          ? `✓ Enviado para ${total} funcionário${total !== 1 ? "s" : ""}`
          : status === "erro"
            ? "Erro ao enviar"
            : "Solicitar Endereço a Todos"}
    </button>
  );
}

/* ─── Página ─── */
export function GestaoPage() {
  const { user, hasRole, refreshProfile } = useAuth();
  const isAdmin = !!user?.isSuperAdmin || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");
  const isRH = isAdmin || hasRole("RH_AUDITORIA");
  const podeToggleAtivo = isRH;

  const isRhOuAdmin = isAdmin || hasRole("RH_AUDITORIA");
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [jornadasDisponiveis, setJornadasDisponiveis] = useState<JornadaPeriodo[]>([]);

  // Requerimento de endereço
  const [requerimentoAtual, setRequerimentoAtual] = useState<{
    status: string;
    criadoEm: string;
  } | null>(null);
  const [enviandoReq, setEnviandoReq] = useState(false);

  // Modalidade remoto + endereço
  const [modalidade, setModalidade] = useState({ modoHomeOffice: false, modoHibridoLocal: false });
  const [endereco, setEndereco] = useState<EnderecoResidencial>({ raioMetros: 20 });
  const [, setEnderecoCarregado] = useState(false);
  const [mapaAberto, setMapaAberto] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [hibridoMaxDias, setHibridoMaxDias] = useState(2);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<Categoria | "">("");
  const [filtroGerencia, setFiltroGerencia] = useState("");
  const [painel, setPainel] = useState<"novo" | "editar" | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
      .get<Funcionario[]>("/ponto/gestao/funcionarios")
      .then((funcs) => setFuncionarios(funcs ?? []))
      .catch(() => {});
    api
      .get<(Gerencia & { _count: { funcionarios: number } })[]>("/ponto/gestao/gerencias")
      .then((gers) => setGerencias(gers ?? []))
      .catch(() => {});
  }, []);

  /* Filtro */
  const lista = funcionarios.filter((f) => {
    const q = busca.toLowerCase();
    const matchBusca =
      !q ||
      (f.user?.name ?? "").toLowerCase().includes(q) ||
      (f.matricula ?? "").includes(q) ||
      (f.user?.email ?? "").toLowerCase().includes(q);
    const matchCat = !filtroCategoria || f.categoria === filtroCategoria;
    const matchGer = !filtroGerencia || f.gerenciaId === filtroGerencia;
    return matchBusca && matchCat && matchGer;
  });

  function abrirEditar(f: Funcionario) {
    setForm({
      nome: f.user?.name ?? "",
      matricula: f.matricula ?? "",
      email: f.user?.email ?? "",
      cpf: f.cpf ?? "",
      cargo: f.cargo ?? "",
      categoria: f.categoria ?? "CONCURSADO",
      gerenciaId: f.gerenciaId ?? "",
      jornadaPeriodoId: f.jornadaPeriodoId ?? "",
      subsecao: f.subsecao ?? "",
      ativo: f.ativo ?? true,
      dataNascimento: f.dataNascimento ? new Date(f.dataNascimento).toISOString().slice(0, 10) : "",
      dataAdmissao: (f as unknown as { dataAdmissao?: string | null }).dataAdmissao
        ? new Date((f as unknown as { dataAdmissao: string }).dataAdmissao)
            .toISOString()
            .slice(0, 10)
        : ""
    });
    setModalidade({
      modoHomeOffice: f.modoHomeOffice ?? false,
      modoHibridoLocal: f.modoHibridoLocal ?? false
    });
    setRequerimentoAtual(f.requerimentoEndereco ?? null);
    setEnderecoCarregado(false);
    if (isRhOuAdmin) {
      api
        .get<EnderecoResidencial>(`/ponto/gestao/funcionarios/${f.id}/endereco`)
        .then((e) => {
          setEndereco(
            e
              ? { ...e, raioMetros: e.raioMetros && e.raioMetros !== 100 ? e.raioMetros : 20 }
              : { raioMetros: 20 }
          );
          setEnderecoCarregado(true);
        })
        .catch(() => {
          setEndereco({ raioMetros: 20 });
          setEnderecoCarregado(true);
        });
    }
    setEditandoId(f.id);
    setPainel("editar");
  }

  const cpfPreenchido = form.cpf.replace(/\D/g, "").length > 0;
  const cpfBloqueio = cpfPreenchido && !isValidCpf(form.cpf);

  async function solicitarEndereco() {
    if (!editandoId) return;
    setEnviandoReq(true);
    try {
      const res = await api.post<{ status: string; criadoEm: string }>(
        `/ponto/gestao/funcionarios/${editandoId}/requerimento-endereco`,
        {}
      );
      setRequerimentoAtual(res);
      setFuncionarios((prev) =>
        prev.map((f) =>
          f.id === editandoId
            ? { ...f, requerimentoEndereco: res as typeof f.requerimentoEndereco }
            : f
        )
      );
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
    // Sempre salva o endereço quando há dados (independente do modo ativo)
    if (endereco.logradouro || endereco.lat) {
      await api.put(`/ponto/gestao/funcionarios/${funcId}/endereco`, endereco);
    }
  }

  async function salvar() {
    if (!form.nome || !form.matricula || !form.gerenciaId) return;
    if (cpfBloqueio) return;

    const { jornadaPeriodoId, ...restForm } = form;
    const payload = { ...restForm, dataNascimento: form.dataNascimento || null };

    if (painel === "novo") {
      const novo = await api.post<Funcionario>("/ponto/gestao/funcionarios", payload);
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
    } else if (editandoId) {
      await api.put(`/ponto/gestao/funcionarios/${editandoId}`, payload);
      if (isRhOuAdmin) {
        await Promise.all([
          api.patch(`/ponto/gestao/funcionarios/${editandoId}/jornada-periodo`, {
            jornadaPeriodoId: jornadaPeriodoId || null
          }),
          salvarModalidadeEndereco(editandoId)
        ]);
      }
      if (editandoId === user?.funcionario?.id) {
        void refreshProfile();
      }
    }

    // Fonte da verdade: sempre recarrega a lista completa da API após qualquer save
    const lista = await api.get<Funcionario[]>("/ponto/gestao/funcionarios");
    setFuncionarios(lista ?? []);
    setPainel(null);
  }

  async function excluir(id: string) {
    await api.delete(`/ponto/gestao/funcionarios/${id}`);
    setFuncionarios((prev) => prev.filter((f) => f.id !== id));
    setConfirmDelete(null);
  }

  async function toggleAtivo(f: Funcionario) {
    const atualizado = await api.put<Funcionario>(`/ponto/gestao/funcionarios/${f.id}`, {
      ativo: !f.ativo
    });
    if (atualizado) {
      setFuncionarios((prev) => prev.map((x) => (x.id === f.id ? atualizado : x)));
    }
  }

  const nomeGerencia = (
    id: string | null | undefined,
    gerencia?: { nome?: string | null } | null
  ) => gerencia?.nome ?? (id ? gerencias.find((g) => g.id === id)?.nome : undefined) ?? "—";

  const total = funcionarios.length;
  const estagiarios = funcionarios.filter((f) => f.categoria === "ESTAGIARIO").length;
  const concursados = funcionarios.filter((f) => f.categoria === "CONCURSADO").length;
  const assessores = funcionarios.filter((f) => f.categoria === "ASSESSOR").length;
  const gerentes = funcionarios.filter((f) => f.categoria === "GERENTE").length;

  // Acesso restrito: apenas RH_AUDITORIA e super admin/ponto-admin
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
            A página de Gestão de Funcionários é exclusiva para o setor de{" "}
            <strong>Recursos Humanos</strong> e <strong>administradores do sistema</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* ── Cabeçalho ── */}
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
            Administração
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            Gestão de <em>Funcionários</em>
          </h1>
        </div>
        {/* Solicitar endereço em massa */}
        {isRhOuAdmin && <SolicitarEnderecoTodosBtn />}
      </div>

      {/* ── Banner Sync Extensions (RH e admin) ── */}
      {isRhOuAdmin && (
        <ExtensionsApiPanel
          isAdmin={isAdmin}
          isSuperAdmin={!!user?.isSuperAdmin}
          onSyncComplete={() => {
            void api
              .get<Funcionario[]>("/ponto/gestao/funcionarios")
              .then((funcs) => setFuncionarios(funcs ?? []))
              .catch(() => {});
            void api
              .get<(Gerencia & { _count: { funcionarios: number } })[]>("/ponto/gestao/gerencias")
              .then((gers) => setGerencias(gers ?? []))
              .catch(() => {});
          }}
        />
      )}

      {/* ── Stats ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <Stat valor={total} label="Total" cor="var(--burgundy-600)" />
        <Stat valor={concursados} label="Concursados" cor="var(--green)" />
        <Stat valor={gerentes} label="Gerentes" cor="var(--burgundy-600)" />
        <Stat valor={assessores} label="Assessores" cor="#8a6a00" />
        <Stat valor={estagiarios} label="Estagiários" cor="var(--blue-ink)" />
      </div>

      {/* ── Barra de filtros ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Busca */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <SearchIcon
            size={15}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-500)",
              pointerEvents: "none"
            }}
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, matrícula ou e-mail…"
            style={{
              width: "100%",
              padding: "9px 12px 9px 36px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "#fff",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              outline: "none",
              boxSizing: "border-box"
            }}
          />
        </div>

        {/* Filtro categoria */}
        <div style={{ position: "relative" }}>
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value as Categoria | "")}
            style={{
              appearance: "none",
              padding: "9px 32px 9px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "#fff",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              color: "var(--ink-900)",
              cursor: "pointer",
              outline: "none"
            }}
          >
            <option value="">Todas as categorias</option>
            <option value="ESTAGIARIO">Estagiário</option>
            <option value="CONCURSADO">Concursado</option>
            <option value="ASSESSOR">Assessor</option>
            <option value="GERENTE">Gerente</option>
          </select>
          <ChevronDownIcon
            size={14}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "var(--ink-500)"
            }}
          />
        </div>

        {/* Filtro gerência */}
        <div style={{ position: "relative" }}>
          <select
            value={filtroGerencia}
            onChange={(e) => setFiltroGerencia(e.target.value)}
            style={{
              appearance: "none",
              padding: "9px 32px 9px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "#fff",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              color: "var(--ink-900)",
              cursor: "pointer",
              outline: "none"
            }}
          >
            <option value="">Todas as gerências</option>
            {gerencias.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={14}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "var(--ink-500)"
            }}
          />
        </div>
      </div>

      {/* ── Tabela ── */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          overflow: "hidden"
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--cream-50)",
                  borderBottom: "1px solid rgba(122,30,38,0.08)"
                }}
              >
                {["Funcionário", "Matrícula", "Categoria", "Gerência", "Situação", "Ações"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "40px",
                      textAlign: "center",
                      color: "var(--ink-500)",
                      fontSize: 14
                    }}
                  >
                    <UsersIcon
                      size={32}
                      style={{ display: "block", margin: "0 auto 8px", opacity: 0.3 }}
                    />
                    Nenhum funcionário encontrado.
                  </td>
                </tr>
              ) : (
                lista.map((f, i) => (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom:
                        i < lista.length - 1 ? "1px solid rgba(122,30,38,0.06)" : "none",
                      transition: "background 120ms"
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "rgba(122,30,38,0.02)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "transparent")
                    }
                  >
                    {/* Funcionário */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            background: f.fotoPerfilUrl ? "transparent" : "var(--burgundy-600)",
                            border: f.fotoPerfilUrl ? "2px solid var(--burgundy-600)" : "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: 13,
                            flexShrink: 0,
                            overflow: "hidden"
                          }}
                        >
                          {f.fotoPerfilUrl ? (
                            <img
                              src={f.fotoPerfilUrl}
                              alt={f.user?.name}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block"
                              }}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            (f.user?.name ?? "?")
                              .split(" ")
                              .map((n: string) => n[0])
                              .slice(0, 2)
                              .join("")
                          )}
                        </div>
                        <div>
                          <p
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: "var(--ink-900)",
                              lineHeight: 1.2
                            }}
                          >
                            {f.user?.name ?? "—"}
                          </p>
                          <p style={{ fontSize: 11.5, color: "var(--ink-500)", lineHeight: 1 }}>
                            {f.user ? resolveEmail(f.user) : "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Matrícula */}
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12.5,
                          color: "var(--ink-700)"
                        }}
                      >
                        {f.matricula}
                      </span>
                    </td>
                    {/* Categoria */}
                    <td style={{ padding: "12px 16px" }}>
                      <CategoriaBadge cat={f.categoria} />
                    </td>
                    {/* Gerência / Subseção */}
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 13, color: "var(--ink-700)", fontWeight: 500 }}>
                        {nomeGerencia(f.gerenciaId, f.gerencia)}
                        {f.subsecao && (
                          <span style={{ color: "var(--ink-400)", fontWeight: 400 }}>
                            {" / "}
                            {slugLabel(f.subsecao)}
                          </span>
                        )}
                      </span>
                      {f.isManager && (
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 10.5,
                            color: "var(--burgundy-600)",
                            fontWeight: 600
                          }}
                        >
                          Gerente da área
                        </p>
                      )}
                      {infoContato(f) && (
                        <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "var(--ink-400)" }}>
                          {infoContato(f)}
                        </p>
                      )}
                      {f.jornadaPeriodo && (
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: 10.5,
                            color: "var(--burgundy-600)",
                            fontWeight: 600
                          }}
                        >
                          {f.jornadaPeriodo.nome}
                          {f.jornadaPeriodo.ePadrao ? " ★" : ""}
                        </p>
                      )}
                    </td>
                    {/* Situação */}
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 12,
                          fontWeight: 600,
                          color: f.ativo ? "var(--green)" : "var(--ink-500)"
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: f.ativo ? "var(--green)" : "var(--gray-cfo)",
                            display: "inline-block"
                          }}
                        />
                        {f.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    {/* Ações */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          title="Editar"
                          onClick={() => abrirEditar(f)}
                          style={{
                            padding: 6,
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid rgba(122,30,38,0.14)",
                            background: "transparent",
                            cursor: "pointer",
                            color: "var(--ink-700)",
                            display: "flex",
                            alignItems: "center"
                          }}
                        >
                          <Edit2Icon size={14} />
                        </button>
                        {podeToggleAtivo && (
                          <button
                            title={f.ativo ? "Desativar funcionário" : "Ativar funcionário"}
                            onClick={() => void toggleAtivo(f)}
                            style={{
                              padding: 6,
                              borderRadius: "var(--radius-sm)",
                              border: f.ativo
                                ? "1px solid rgba(198,127,0,0.30)"
                                : "1px solid rgba(47,125,79,0.30)",
                              background: "transparent",
                              cursor: "pointer",
                              color: f.ativo ? "#92400e" : "var(--green)",
                              display: "flex",
                              alignItems: "center"
                            }}
                          >
                            {f.ativo ? <XCircleIcon size={14} /> : <CheckCircleIcon size={14} />}
                          </button>
                        )}
                        <button
                          title="Excluir"
                          onClick={() => setConfirmDelete(f.id)}
                          style={{
                            padding: 6,
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid rgba(200,57,63,0.20)",
                            background: "transparent",
                            cursor: "pointer",
                            color: "var(--red)",
                            display: "flex",
                            alignItems: "center"
                          }}
                        >
                          <Trash2Icon size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Rodapé da tabela */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid rgba(122,30,38,0.06)",
            fontSize: 12,
            color: "var(--ink-500)"
          }}
        >
          {lista.length} funcionário{lista.length !== 1 ? "s" : ""} exibido
          {lista.length !== 1 ? "s" : ""}
          {filtroCategoria || filtroGerencia || busca
            ? ` (filtrado${lista.length !== 1 ? "s" : ""} de ${total})`
            : ""}
        </div>
      </div>

      {/* ── Painel lateral — Novo / Editar ── */}
      {painel && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setPainel(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.35)", zIndex: 40 }}
          />
          {/* Drawer */}
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 440,
              maxWidth: "100vw",
              background: "#fff",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              boxShadow: "-8px 0 40px rgba(10,5,6,0.14)"
            }}
          >
            {/* Header do painel */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid rgba(122,30,38,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0
              }}
            >
              <div>
                <p className="eyebrow" style={{ marginBottom: 2 }}>
                  {painel === "novo" ? "Cadastro" : "Edição"}
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: 20,
                    color: "var(--burgundy-600)",
                    fontWeight: 400
                  }}
                >
                  {painel === "novo" ? "Novo Funcionário" : "Editar Funcionário"}
                </h2>
              </div>
              <button
                onClick={() => setPainel(null)}
                style={{
                  padding: 8,
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--ink-500)"
                }}
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Formulário */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              {/* Categoria — seleção visual */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Categoria *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {(Object.keys(CAT) as Categoria[]).map((cat) => {
                    const c = CAT[cat];
                    const Icon = c.icon;
                    const sel = form.categoria === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setForm((f) => ({ ...f, categoria: cat }))}
                        style={{
                          padding: "8px 4px",
                          borderRadius: "var(--radius-md)",
                          border: `2px solid ${sel ? c.cor : "rgba(122,30,38,0.12)"}`,
                          background: sel ? c.bg : "transparent",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 3,
                          transition: "all 140ms ease"
                        }}
                      >
                        <Icon size={16} style={{ color: sel ? c.cor : "var(--ink-500)" }} />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: sel ? c.cor : "var(--ink-700)",
                            textAlign: "center",
                            lineHeight: 1.2,
                            whiteSpace: "nowrap"
                          }}
                        >
                          {c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campos */}
              {(
                [
                  {
                    key: "nome",
                    label: "Nome completo *",
                    placeholder: "Ex: João da Silva",
                    type: "text"
                  },
                  {
                    key: "matricula",
                    label: "Matrícula *",
                    placeholder: "Ex: 00123 ou EST01",
                    type: "text"
                  },
                  {
                    key: "email",
                    label: "E-mail institucional",
                    placeholder: "nome@cfo.org.br",
                    type: "email"
                  },
                  {
                    key: "cargo",
                    label: "Cargo / Função",
                    placeholder: "Ex: Analista de RH",
                    type: "text"
                  }
                ] as { key: keyof typeof form; label: string; placeholder: string; type: string }[]
              ).map(({ key, label, placeholder, type }) => (
                <div key={key} style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 6
                    }}
                  >
                    {label}
                  </label>
                  <input
                    type={type}
                    value={String(form[key])}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13.5,
                      fontFamily: "var(--font-body)",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              ))}

              {/* CPF — com máscara e validação */}
              {(() => {
                const cpfPreenchido = form.cpf.replace(/\D/g, "").length > 0;
                const cpfCompleto = form.cpf.replace(/\D/g, "").length === 11;
                const cpfValido = cpfCompleto && isValidCpf(form.cpf);
                const cpfInvalido = cpfPreenchido && cpfCompleto && !cpfValido;
                const borderColor = cpfInvalido
                  ? "var(--red)"
                  : cpfValido
                    ? "var(--green)"
                    : "rgba(122,30,38,0.14)";
                return (
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)",
                        display: "block",
                        marginBottom: 6
                      }}
                    >
                      CPF
                    </label>
                    <input
                      type="text"
                      value={form.cpf}
                      onChange={(e) => setForm((f) => ({ ...f, cpf: formatCpf(e.target.value) }))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "var(--radius-md)",
                        border: `1px solid ${borderColor}`,
                        background: "#fff",
                        fontSize: 13.5,
                        fontFamily: "var(--font-mono)",
                        outline: "none",
                        boxSizing: "border-box",
                        letterSpacing: "0.05em"
                      }}
                    />
                    {cpfInvalido && (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 11.5,
                          color: "var(--red)",
                          fontWeight: 500
                        }}
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
                );
              })()}

              {/* Gerência */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 6
                  }}
                >
                  Gerência *
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    value={form.gerenciaId}
                    onChange={(e) => setForm((f) => ({ ...f, gerenciaId: e.target.value }))}
                    style={{
                      width: "100%",
                      appearance: "none",
                      padding: "9px 32px 9px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13.5,
                      fontFamily: "var(--font-body)",
                      color: form.gerenciaId ? "var(--ink-900)" : "var(--ink-500)",
                      cursor: "pointer",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="">Selecione uma gerência…</option>
                    {gerencias.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nome}
                      </option>
                    ))}
                  </select>
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
              </div>

              {/* Subseção — derivada dos funcionários já existentes na gerência selecionada */}
              {form.gerenciaId &&
                (() => {
                  const subsecoesDisponiveis = [
                    ...new Set(
                      funcionarios
                        .filter((f) => f.gerenciaId === form.gerenciaId && f.subsecao)
                        .map((f) => f.subsecao!)
                    )
                  ].sort();
                  if (!subsecoesDisponiveis.length) return null;
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--ink-500)",
                          display: "block",
                          marginBottom: 6
                        }}
                      >
                        Subseção
                      </label>
                      <div style={{ position: "relative" }}>
                        <select
                          value={form.subsecao}
                          onChange={(e) => setForm((f) => ({ ...f, subsecao: e.target.value }))}
                          style={{
                            width: "100%",
                            appearance: "none",
                            padding: "9px 32px 9px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid rgba(122,30,38,0.14)",
                            background: "#fff",
                            fontSize: 13.5,
                            fontFamily: "var(--font-body)",
                            color: form.subsecao ? "var(--ink-900)" : "var(--ink-500)",
                            cursor: "pointer",
                            outline: "none",
                            boxSizing: "border-box" as const
                          }}
                        >
                          <option value="">Sem subseção (membro direto da gerência)</option>
                          {subsecoesDisponiveis.map((s) => (
                            <option key={s} value={s}>
                              {slugLabel(s)}
                            </option>
                          ))}
                        </select>
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
                      <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                        Define a hierarquia completa exibida:{" "}
                        <strong>
                          {nomeGerencia(form.gerenciaId)}
                          {form.subsecao ? ` / ${slugLabel(form.subsecao)}` : ""}
                        </strong>
                      </p>
                    </div>
                  );
                })()}

              {/* Jornada de Trabalho — apenas RH/admin */}
              {isRhOuAdmin && (
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 6
                    }}
                  >
                    Jornada de Trabalho
                  </label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={form.jornadaPeriodoId}
                      onChange={(e) => setForm((f) => ({ ...f, jornadaPeriodoId: e.target.value }))}
                      style={{
                        width: "100%",
                        appearance: "none",
                        padding: "9px 32px 9px 12px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        background: "#fff",
                        fontSize: 13.5,
                        fontFamily: "var(--font-body)",
                        color: "var(--ink-900)",
                        cursor: "pointer",
                        outline: "none",
                        boxSizing: "border-box" as const
                      }}
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
                  <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                    Jornadas configuradas em{" "}
                    <a href="/ponto/configuracoes" style={{ color: "var(--burgundy-600)" }}>
                      Configurações → Períodos
                    </a>
                    .
                  </p>
                </div>
              )}

              {/* Data de Nascimento */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 6
                  }}
                >
                  Data de Nascimento
                </label>
                <input
                  type="date"
                  value={form.dataNascimento}
                  onChange={(e) => setForm((f) => ({ ...f, dataNascimento: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    background: "#fff",
                    fontSize: 13.5,
                    fontFamily: "var(--font-body)",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ink-500)" }}>
                  Necessário para liberar o Day Off de Aniversário.
                </p>
              </div>

              {/* Data de Admissão */}
              {isRhOuAdmin && (
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 6
                    }}
                  >
                    Data de Admissão
                  </label>
                  <input
                    type="date"
                    value={form.dataAdmissao}
                    onChange={(e) => setForm((f) => ({ ...f, dataAdmissao: e.target.value }))}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13.5,
                      fontFamily: "var(--font-body)",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ink-500)" }}>
                    Usada para calcular os ciclos de férias do funcionário.
                  </p>
                </div>
              )}

              {/* ── Modalidade de Trabalho Remoto (apenas RH/admin) ── */}
              {isRhOuAdmin && (
                <>
                  <hr
                    style={{
                      border: "none",
                      borderTop: "1px solid rgba(122,30,38,0.08)",
                      margin: "8px 0 16px"
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12
                    }}
                  >
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                        color: "var(--burgundy-600)",
                        margin: 0
                      }}
                    >
                      Modalidade de Trabalho Remoto
                    </p>
                    {painel === "editar" && (
                      <button
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
                          color:
                            requerimentoAtual?.status === "PENDENTE" ? "#8a6a00" : "var(--ink-600)",
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
                        border: `1px solid ${requerimentoAtual.status === "PENDENTE" ? "rgba(247,196,55,0.30)" : "rgba(47,125,79,0.18)"}`,
                        color: requerimentoAtual.status === "PENDENTE" ? "#8a6a00" : "var(--green)"
                      }}
                    >
                      {requerimentoAtual.status === "PENDENTE"
                        ? `⏳ Solicitação enviada em ${new Date(requerimentoAtual.criadoEm).toLocaleDateString("pt-BR")} — aguardando o funcionário preencher o endereço.`
                        : `✓ Funcionário respondeu a solicitação.`}
                    </div>
                  )}

                  {/* Toggles mutuamente exclusivos */}
                  {[
                    [
                      "modoHomeOffice",
                      "Home Office",
                      "Pode registrar o ponto de casa todos os dias"
                    ] as const,
                    [
                      "modoHibridoLocal",
                      "Híbrido",
                      `Pode trabalhar de casa até ${hibridoMaxDias} dia(s) por semana (regra global)`
                    ] as const
                  ].map(([key, label, desc]) => (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "12px 0",
                        borderBottom: "1px solid rgba(122,30,38,0.06)"
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>
                          {label}
                        </p>
                        <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>
                          {desc}
                        </p>
                      </div>
                      <button
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
                          background: modalidade[key]
                            ? "var(--burgundy-600)"
                            : "rgba(122,30,38,0.15)",
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

                  {/* Endereço residencial */}
                  {true && (
                    <div style={{ marginTop: 16 }}>
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          color: "var(--burgundy-600)",
                          marginBottom: 12
                        }}
                      >
                        Endereço Residencial
                      </p>
                      <p
                        style={{
                          fontSize: 11.5,
                          color: "var(--ink-500)",
                          marginBottom: 14,
                          lineHeight: 1.5
                        }}
                      >
                        Endereço residencial do funcionário. Usado para validar o ponto em Home
                        Office e Híbrido — raio de <strong>{endereco.raioMetros ?? 20}m</strong>.
                      </p>

                      {/* CEP com busca */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 8,
                          marginBottom: 12
                        }}
                      >
                        <div>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: "var(--ink-500)",
                              display: "block",
                              marginBottom: 5
                            }}
                          >
                            CEP
                          </label>
                          <input
                            type="text"
                            value={endereco.cep ?? ""}
                            onChange={(e) => setEndereco((x) => ({ ...x, cep: e.target.value }))}
                            onBlur={(e) => buscarCep(e.target.value)}
                            placeholder="00000-000"
                            style={{
                              width: "100%",
                              padding: "9px 12px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid rgba(122,30,38,0.14)",
                              fontSize: 13.5,
                              fontFamily: "var(--font-mono)",
                              outline: "none",
                              boxSizing: "border-box"
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end" }}>
                          <button
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

                      {/* Logradouro + Número */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "3fr 1fr",
                          gap: 10,
                          marginBottom: 10
                        }}
                      >
                        {[
                          ["logradouro", "Logradouro", "Rua, Av..."],
                          ["numero", "Nº", "S/N"]
                        ].map(([k, l, ph]) => (
                          <div key={k}>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                color: "var(--ink-500)",
                                display: "block",
                                marginBottom: 5
                              }}
                            >
                              {l}
                            </label>
                            <input
                              type="text"
                              value={
                                ((endereco as unknown as Record<string, unknown>)[k] as string) ??
                                ""
                              }
                              onChange={(e) => setEndereco((x) => ({ ...x, [k]: e.target.value }))}
                              placeholder={ph}
                              style={{
                                width: "100%",
                                padding: "9px 12px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid rgba(122,30,38,0.14)",
                                fontSize: 13.5,
                                fontFamily: "var(--font-body)",
                                outline: "none",
                                boxSizing: "border-box"
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Complemento */}
                      <div style={{ marginBottom: 10 }}>
                        <label
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--ink-500)",
                            display: "block",
                            marginBottom: 5
                          }}
                        >
                          Complemento
                        </label>
                        <input
                          type="text"
                          value={endereco.complemento ?? ""}
                          onChange={(e) =>
                            setEndereco((x) => ({ ...x, complemento: e.target.value }))
                          }
                          placeholder="Apto 301, Bloco B..."
                          style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid rgba(122,30,38,0.14)",
                            fontSize: 13.5,
                            fontFamily: "var(--font-body)",
                            outline: "none",
                            boxSizing: "border-box"
                          }}
                        />
                      </div>

                      {/* Bairro, Cidade, UF */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "2fr 2fr 1fr",
                          gap: 10,
                          marginBottom: 12
                        }}
                      >
                        {[
                          ["bairro", "Bairro", ""],
                          ["cidade", "Cidade", ""],
                          ["uf", "UF", "DF"]
                        ].map(([k, l, ph]) => (
                          <div key={k}>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                color: "var(--ink-500)",
                                display: "block",
                                marginBottom: 5
                              }}
                            >
                              {l}
                            </label>
                            <input
                              type="text"
                              value={
                                ((endereco as unknown as Record<string, unknown>)[k] as string) ??
                                ""
                              }
                              onChange={(e) => setEndereco((x) => ({ ...x, [k]: e.target.value }))}
                              placeholder={ph}
                              style={{
                                width: "100%",
                                padding: "9px 12px",
                                borderRadius: "var(--radius-md)",
                                border: "1px solid rgba(122,30,38,0.14)",
                                fontSize: 13.5,
                                fontFamily: "var(--font-body)",
                                outline: "none",
                                boxSizing: "border-box"
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Raio + Mapa */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          gap: 10,
                          marginBottom: 12
                        }}
                      >
                        <div style={{ width: 130 }}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              color: "var(--ink-500)",
                              display: "block",
                              marginBottom: 5
                            }}
                          >
                            Raio (metros)
                          </label>
                          <input
                            type="number"
                            min={10}
                            max={500}
                            value={endereco.raioMetros ?? 20}
                            onChange={(e) =>
                              setEndereco((x) => ({ ...x, raioMetros: +e.target.value }))
                            }
                            style={{
                              width: "100%",
                              padding: "9px 12px",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid rgba(122,30,38,0.14)",
                              fontSize: 13.5,
                              fontFamily: "var(--font-mono)",
                              outline: "none",
                              boxSizing: "border-box"
                            }}
                          />
                        </div>
                        <button
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

                      {/* Preview de coordenadas */}
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
                          Sem coordenadas — defina no mapa para validar o ponto remoto
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Situação */}
              {painel === "editar" && (
                <div style={{ marginBottom: 16 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 6
                    }}
                  >
                    Situação
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        onClick={() => setForm((f) => ({ ...f, ativo: v }))}
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
                          color:
                            form.ativo === v
                              ? v
                                ? "var(--green)"
                                : "var(--red)"
                              : "var(--ink-500)",
                          transition: "all 140ms"
                        }}
                      >
                        {v ? "● Ativo" : "○ Inativo"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                  color: "var(--ink-500)"
                }}
              >
                Campos marcados com * são obrigatórios.
              </div>
            </div>

            {/* Footer do painel */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid rgba(122,30,38,0.08)",
                display: "flex",
                gap: 10,
                flexShrink: 0
              }}
            >
              <button className="btn btn-ghost" onClick={() => setPainel(null)} style={{ flex: 1 }}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={salvar}
                disabled={!form.nome || !form.matricula || !form.gerenciaId || cpfBloqueio}
                style={{
                  flex: 2,
                  opacity:
                    !form.nome || !form.matricula || !form.gerenciaId || cpfBloqueio ? 0.5 : 1
                }}
              >
                {painel === "novo" ? "Cadastrar Funcionário" : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── MapModal para endereço residencial ── */}
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

      {/* ── Modal de confirmação de exclusão ── */}
      {confirmDelete && (
        <>
          <div
            onClick={() => setConfirmDelete(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.40)", zIndex: 60 }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              background: "#fff",
              borderRadius: "var(--radius-xl)",
              padding: 28,
              width: 340,
              zIndex: 70,
              boxShadow: "0 20px 60px rgba(10,5,6,0.20)"
            }}
          >
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 20,
                color: "var(--burgundy-600)",
                marginBottom: 8
              }}
            >
              Confirmar exclusão
            </h3>
            <p
              style={{ fontSize: 13.5, color: "var(--ink-700)", marginBottom: 20, lineHeight: 1.6 }}
            >
              Esta ação não pode ser desfeita. O funcionário será removido do sistema.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => excluir(confirmDelete!)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--red)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                Excluir
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

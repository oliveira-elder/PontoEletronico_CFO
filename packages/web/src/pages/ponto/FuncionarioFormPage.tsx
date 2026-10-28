import React, { useEffect, useState } from "react";
import { ToleranciaFechamentoFuncionario } from "../../components/banco/ToleranciaFechamento";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { MapModal, MapResult, textoBuscaEndereco } from "../../components/MapModal";
import {
  BotaoSolicitarRequerimento,
  FaixaStatusRequerimento,
  type StatusRequerimento
} from "../../components/SolicitarRequerimento";
import { REQUERIMENTO_INFO, type TipoRequerimentoCadastro } from "../../utils/requerimentos";
import { geocodificarEndereco } from "../../utils/geocode";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CrownIcon,
  MapPinIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XIcon
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

/** O cargo "A definir" é só texto de apoio: o campo fica vazio ao digitar. */
const CARGO_A_DEFINIR = "A definir";
const cargoParaCampo = (v: string) => (v.trim() === CARGO_A_DEFINIR ? "" : v);

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

const DIAS_UTEIS = ["Seg", "Ter", "Qua", "Qui", "Sex"] as const;

/** Converte o texto salvo (ex.: "Seg, Qua" ou o legado "Seg a Sex") no conjunto de dias marcados. */
function parseDiasSemana(valor: string): Set<string> {
  const norm = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const chaves = DIAS_UTEIS.map((d) => d.toLowerCase());
  const intervalo = norm.match(/(seg|ter|qua|qui|sex)\w*\s*(?:a|-|ate)\s*(seg|ter|qua|qui|sex)/);
  if (intervalo) {
    const ini = chaves.indexOf(intervalo[1]);
    const fim = chaves.indexOf(intervalo[2]);
    if (ini <= fim) return new Set(DIAS_UTEIS.slice(ini, fim + 1));
  }
  const tokens = norm.split(/[^a-z]+/).map((t) => t.slice(0, 3));
  return new Set(DIAS_UTEIS.filter((_, i) => tokens.includes(chaves[i])));
}

function DiasSemanaCheckboxes({
  value,
  onChange
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const marcados = parseDiasSemana(value);
  const alternar = (dia: string, checked: boolean) => {
    const novos = new Set(marcados);
    if (checked) novos.add(dia);
    else novos.delete(dia);
    onChange(DIAS_UTEIS.filter((d) => novos.has(d)).join(", "));
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", padding: "9px 0" }}>
      {DIAS_UTEIS.map((dia) => (
        <Toggle
          key={dia}
          label={dia}
          checked={marcados.has(dia)}
          onChange={(v) => alternar(dia, v)}
        />
      ))}
    </div>
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
  vigenciaDesde: string;
  vigenciaAte: string | null;
  gerencia?: { id: string; nome: string; sigla: string } | null;
};

export type LinhaLotacaoValor = {
  cargo: string;
  gerenciaId: string;
  subsecao: string;
  vigenciaDesde: string;
  vigenciaAte: string;
};

/** Coordenações conhecidas de um departamento (extraídas dos funcionários já lotados nele). */
function subsecoesDaGerencia(funcionarios: Funcionario[], gerenciaId: string): string[] {
  if (!gerenciaId) return [];
  return [
    ...new Set(
      funcionarios.filter((f) => f.gerenciaId === gerenciaId && f.subsecao).map((f) => f.subsecao!)
    )
  ].sort();
}

const fmtData = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—";

function hojeLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function colunasLotacao(comCargo: boolean, comEmpregado = false) {
  const base = comCargo
    ? "minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,1.2fr) 140px 140px 76px"
    : "minmax(0,1.6fr) minmax(0,1.3fr) 140px 140px 76px";
  return comEmpregado ? `minmax(0,1.4fr) 130px ${base}` : base;
}

/** Cargo e nível do efetivo: valem para o funcionário (não por período de lotação) e
 *  aparecem na mesma linha da lotação vigente. */
type CamposEmpregado = {
  cargo: string;
  nivel: "" | "MEDIO" | "SUPERIOR" | "TECNICO";
  onCargo: (v: string) => void;
  onNivel: (v: "" | "MEDIO" | "SUPERIOR" | "TECNICO") => void;
};

function CelulasEmpregado({ efetivo, rotulos }: { efetivo?: CamposEmpregado; rotulos?: boolean }) {
  if (!efetivo) {
    return (
      <>
        <span style={{ color: "var(--ink-500)" }}>—</span>
        <span style={{ color: "var(--ink-500)" }}>—</span>
      </>
    );
  }
  return (
    <>
      <div>
        {rotulos && <FieldLabel>Cargo</FieldLabel>}
        <input
          type="text"
          value={cargoParaCampo(efetivo.cargo)}
          placeholder={CARGO_A_DEFINIR}
          onChange={(e) => efetivo.onCargo(e.target.value)}
          style={fieldStyle}
        />
      </div>
      <div>
        {rotulos && <FieldLabel>Nível do cargo</FieldLabel>}
        <SelectWrap>
          <select
            value={efetivo.nivel}
            onChange={(e) =>
              efetivo.onNivel(e.target.value as "" | "MEDIO" | "SUPERIOR" | "TECNICO")
            }
            style={{
              ...selectStyleBase,
              color: efetivo.nivel ? "var(--ink-900)" : "var(--ink-500)"
            }}
          >
            <option value="">Selecione…</option>
            <option value="MEDIO">Médio</option>
            <option value="TECNICO">Técnico</option>
            <option value="SUPERIOR">Superior</option>
          </select>
        </SelectWrap>
      </div>
    </>
  );
}

function BotaoAcao({
  titulo,
  onClick,
  disabled,
  perigo,
  children
}: {
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${perigo ? "rgba(200,57,63,0.25)" : "rgba(122,30,38,0.20)"}`,
        background: "transparent",
        color: perigo ? "var(--red)" : "var(--burgundy-600)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        flexShrink: 0
      }}
    >
      {children}
    </button>
  );
}

/** Campos editáveis de uma linha de lotação (também usado no cadastro novo). */
function LinhaLotacaoCampos({
  valor,
  onChange,
  comCargo,
  fimEditavel,
  fimCalculado,
  gerencias,
  funcionarios,
  isMobile,
  comRotulos,
  acoes,
  colunaEmpregado,
  efetivo
}: {
  valor: LinhaLotacaoValor;
  onChange: (v: LinhaLotacaoValor) => void;
  comCargo: boolean;
  fimEditavel: boolean;
  fimCalculado?: string | null;
  gerencias: Gerencia[];
  funcionarios: Funcionario[];
  isMobile: boolean;
  /** Mostra o rótulo acima de cada campo (sem a linha de cabeçalho da lista). */
  comRotulos?: boolean;
  acoes?: React.ReactNode;
  /** Reserva as colunas Cargo/Nível do efetivo (preenchidas só se `efetivo` vier). */
  colunaEmpregado?: boolean;
  efetivo?: CamposEmpregado;
}) {
  const subsecoes = subsecoesDaGerencia(funcionarios, valor.gerenciaId);
  const set = (p: Partial<LinhaLotacaoValor>) => onChange({ ...valor, ...p });
  const rotulo = (t: string) => (isMobile || comRotulos ? <FieldLabel>{t}</FieldLabel> : null);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile
          ? "1fr"
          : acoes
            ? colunasLotacao(comCargo, colunaEmpregado)
            : colunasLotacao(comCargo, colunaEmpregado).replace(/ 76px$/, ""),
        gap: isMobile ? 10 : 8,
        alignItems: "end",
        padding: "8px 0"
      }}
    >
      {colunaEmpregado && <CelulasEmpregado efetivo={efetivo} rotulos={isMobile || comRotulos} />}
      {comCargo && (
        <div>
          {rotulo("Cargo")}
          <input
            type="text"
            value={cargoParaCampo(valor.cargo)}
            placeholder={CARGO_A_DEFINIR}
            onChange={(e) => set({ cargo: e.target.value })}
            style={fieldStyle}
          />
        </div>
      )}
      <div>
        {rotulo("Departamento *")}
        <SelectWrap>
          <select
            value={valor.gerenciaId}
            onChange={(e) => set({ gerenciaId: e.target.value, subsecao: "" })}
            style={{
              ...selectStyleBase,
              color: valor.gerenciaId ? "var(--ink-900)" : "var(--ink-500)"
            }}
          >
            <option value="">Selecione…</option>
            {gerencias.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </SelectWrap>
      </div>
      <div>
        {rotulo("Coordenação")}
        <SelectWrap>
          <select
            value={valor.subsecao}
            disabled={subsecoes.length === 0}
            onChange={(e) => set({ subsecao: e.target.value })}
            style={{
              ...selectStyleBase,
              color: valor.subsecao ? "var(--ink-900)" : "var(--ink-500)"
            }}
          >
            <option value="">{subsecoes.length ? "Sem coordenação" : "—"}</option>
            {subsecoes.map((s) => (
              <option key={s} value={s}>
                {slugLabel(s)}
              </option>
            ))}
          </select>
        </SelectWrap>
      </div>
      <div>
        {rotulo("Início *")}
        <input
          type="date"
          value={valor.vigenciaDesde}
          onChange={(e) => set({ vigenciaDesde: e.target.value })}
          style={fieldStyle}
        />
      </div>
      <div>
        {rotulo("Fim")}
        {fimEditavel ? (
          <input
            type="date"
            value={valor.vigenciaAte}
            onChange={(e) => set({ vigenciaAte: e.target.value })}
            style={fieldStyle}
          />
        ) : (
          <input
            type="text"
            disabled
            value={fimCalculado ? fmtData(fimCalculado) : "automático"}
            title="Calculado pelo início da lotação seguinte"
            style={{ ...fieldStyle, color: "var(--ink-500)", background: "var(--cream-50)" }}
          />
        )}
      </div>
      {acoes && <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>{acoes}</div>}
    </div>
  );
}

/**
 * Períodos de lotação do funcionário, sempre visíveis: cada linha tem editar (✎) e
 * remover (−), e "+" acrescenta um novo período. Cada ação grava na hora e devolve o
 * funcionário já sincronizado com a lotação vigente.
 */
function LotacaoLinhas({
  funcionarioId,
  comCargo,
  gerencias,
  funcionarios,
  isMobile,
  onSincronizado,
  somenteLeitura = false,
  efetivo
}: {
  funcionarioId: string;
  comCargo: boolean;
  gerencias: Gerencia[];
  funcionarios: Funcionario[];
  isMobile: boolean;
  onSincronizado: (f: Funcionario) => void;
  /** Perfil do RH sem a função "Lotação": só consulta. */
  somenteLeitura?: boolean;
  /** Cargo e nível do efetivo, na mesma linha da lotação vigente. */
  efetivo?: CamposEmpregado;
}) {
  const [linhas, setLinhas] = useState<VigenciaLotacaoUI[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null); // id | "nova"
  const [rascunho, setRascunho] = useState<LinhaLotacaoValor | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const ordenar = (l: VigenciaLotacaoUI[]) =>
    [...l].sort((a, b) => a.vigenciaDesde.localeCompare(b.vigenciaDesde));

  useEffect(() => {
    let cancel = false;
    api
      .get<VigenciaLotacaoUI[]>(`/ponto/gestao/funcionarios/${funcionarioId}/lotacao-historico`)
      .then((l) => !cancel && setLinhas(ordenar(l ?? [])))
      .catch(() => !cancel && setLinhas([]));
    return () => {
      cancel = true;
    };
  }, [funcionarioId]);

  const hoje = hojeLocalIso();
  const lista = linhas ?? [];
  const ultima = lista[lista.length - 1];
  const colunaEmpregado = !!efetivo;
  const vigenteId = (
    lista.find((l) => l.vigenciaDesde <= hoje && (!l.vigenciaAte || l.vigenciaAte >= hoje)) ??
    ultima
  )?.id;

  function iniciarEdicao(l: VigenciaLotacaoUI) {
    setErro("");
    setEditando(l.id);
    setRascunho({
      cargo: l.cargo ?? "",
      gerenciaId: l.gerenciaId ?? "",
      subsecao: l.subsecao ?? "",
      vigenciaDesde: l.vigenciaDesde,
      vigenciaAte: l.vigenciaAte ?? ""
    });
  }

  function iniciarNova() {
    setErro("");
    setEditando("nova");
    setRascunho({
      cargo: ultima?.cargo ?? "",
      gerenciaId: "",
      subsecao: "",
      vigenciaDesde: hoje,
      vigenciaAte: ""
    });
  }

  function cancelar() {
    setEditando(null);
    setRascunho(null);
    setErro("");
  }

  async function executar(
    req: () => Promise<{ historico: VigenciaLotacaoUI[]; funcionario: Funcionario }>
  ) {
    setSalvando(true);
    setErro("");
    try {
      const r = await req();
      setLinhas(ordenar(r.historico));
      onSincronizado(r.funcionario);
      cancelar();
    } catch (e) {
      setErro((e as Error)?.message ?? "Erro ao salvar a lotação.");
    } finally {
      setSalvando(false);
    }
  }

  function confirmar() {
    if (!rascunho) return;
    if (!rascunho.gerenciaId || !rascunho.vigenciaDesde) {
      setErro("Informe o departamento e a data de início.");
      return;
    }
    const eUltima = editando === "nova" || editando === ultima?.id;
    const body = {
      ...(comCargo ? { cargo: rascunho.cargo.trim() || CARGO_A_DEFINIR } : {}),
      gerenciaId: rascunho.gerenciaId,
      subsecao: rascunho.subsecao || null,
      vigenciaDesde: rascunho.vigenciaDesde,
      ...(eUltima ? { vigenciaAte: rascunho.vigenciaAte || null } : {})
    };
    const base = `/ponto/gestao/funcionarios/${funcionarioId}/lotacao-historico`;
    void executar(() =>
      editando === "nova" ? api.post(base, body) : api.patch(`${base}/${editando}`, body)
    );
  }

  function remover(l: VigenciaLotacaoUI) {
    if (!window.confirm("Remover este período de lotação?")) return;
    void executar(() =>
      api.delete(`/ponto/gestao/funcionarios/${funcionarioId}/lotacao-historico/${l.id}`)
    );
  }

  const acoesEdicao = (
    <>
      <BotaoAcao titulo="Confirmar" onClick={confirmar} disabled={salvando}>
        <CheckIcon size={14} />
      </BotaoAcao>
      <BotaoAcao titulo="Cancelar" onClick={cancelar} disabled={salvando} perigo>
        <XIcon size={14} />
      </BotaoAcao>
    </>
  );

  const cabecalho = (t: string) => (
    <span style={{ ...labelStyle, marginBottom: 0, fontSize: 11 }}>{t}</span>
  );

  return (
    <div style={{ marginBottom: 8 }}>
      {!isMobile && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: colunasLotacao(comCargo, colunaEmpregado),
            gap: 8,
            paddingBottom: 6,
            borderBottom: "1px solid rgba(122,30,38,0.10)"
          }}
        >
          {colunaEmpregado && cabecalho("Cargo")}
          {colunaEmpregado && cabecalho("Nível do cargo")}
          {comCargo && cabecalho("Cargo")}
          {cabecalho("Departamento")}
          {cabecalho("Coordenação")}
          {cabecalho("Início")}
          {cabecalho("Fim")}
          <span />
        </div>
      )}

      {linhas === null ? (
        <p style={{ fontSize: 12, color: "var(--ink-500)", padding: "10px 0" }}>Carregando…</p>
      ) : (
        lista.map((l, i) => {
          if (editando === l.id && rascunho) {
            return (
              <LinhaLotacaoCampos
                key={l.id}
                valor={rascunho}
                onChange={setRascunho}
                comCargo={comCargo}
                fimEditavel={l.id === ultima?.id}
                fimCalculado={l.vigenciaAte}
                colunaEmpregado={colunaEmpregado}
                efetivo={l.id === vigenteId ? efetivo : undefined}
                gerencias={gerencias}
                funcionarios={funcionarios}
                isMobile={isMobile}
                acoes={acoesEdicao}
              />
            );
          }
          const atual = l.vigenciaDesde <= hoje && (!l.vigenciaAte || l.vigenciaAte >= hoje);
          const departamento = l.gerencia?.nome ?? nomeGerencia(gerencias, l.gerenciaId) ?? "—";
          return (
            <div
              key={l.id}
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr auto"
                  : colunasLotacao(comCargo, colunaEmpregado),
                gap: 8,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: i < lista.length - 1 ? "1px solid rgba(122,30,38,0.08)" : undefined,
                fontSize: 13.5,
                color: "var(--ink-900)"
              }}
            >
              {isMobile ? (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {comCargo && l.cargo ? `${l.cargo} — ` : ""}
                    {departamento}
                    {atual && <SeloAtual />}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                    {l.subsecao ? `${slugLabel(l.subsecao)} · ` : ""}
                    {fmtData(l.vigenciaDesde)} – {l.vigenciaAte ? fmtData(l.vigenciaAte) : "atual"}
                  </div>
                </div>
              ) : (
                <>
                  {colunaEmpregado && (
                    <CelulasEmpregado efetivo={l.id === vigenteId ? efetivo : undefined} />
                  )}
                  {comCargo && <span>{l.cargo || "—"}</span>}
                  <span>
                    {departamento}
                    {atual && <SeloAtual />}
                  </span>
                  <span>{l.subsecao ? slugLabel(l.subsecao) : "—"}</span>
                  <span>{fmtData(l.vigenciaDesde)}</span>
                  <span>{fmtData(l.vigenciaAte)}</span>
                </>
              )}
              {somenteLeitura ? (
                <span />
              ) : (
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <BotaoAcao
                    titulo="Editar"
                    onClick={() => iniciarEdicao(l)}
                    disabled={salvando || editando !== null}
                  >
                    <PencilIcon size={14} />
                  </BotaoAcao>
                  <BotaoAcao
                    titulo={lista.length === 1 ? "É preciso ter ao menos um período" : "Remover"}
                    onClick={() => remover(l)}
                    disabled={salvando || editando !== null || lista.length === 1}
                    perigo
                  >
                    <MinusIcon size={14} />
                  </BotaoAcao>
                </div>
              )}
            </div>
          );
        })
      )}

      {editando === "nova" && rascunho && (
        <LinhaLotacaoCampos
          valor={rascunho}
          onChange={setRascunho}
          comCargo={comCargo}
          fimEditavel
          colunaEmpregado={colunaEmpregado}
          gerencias={gerencias}
          funcionarios={funcionarios}
          isMobile={isMobile}
          acoes={acoesEdicao}
        />
      )}

      {erro && <p style={{ color: "var(--red)", fontSize: 12, margin: "6px 0 0" }}>{erro}</p>}

      {editando === null && linhas !== null && !somenteLeitura && (
        <button
          type="button"
          onClick={iniciarNova}
          disabled={salvando}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 10,
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
          <PlusIcon size={13} /> Nova lotação
        </button>
      )}
    </div>
  );
}

type CessaoUI = {
  id: string;
  inicio: string;
  fim: string | null; // null = em aberto
  orgaoOrigem: string;
  orgaoDestino: string;
};

type CessaoValor = { inicio: string; fim: string; orgaoOrigem: string; orgaoDestino: string };

const COLUNAS_CESSAO = "140px 140px minmax(0,1fr) minmax(0,1fr) 76px";

/** Campos editáveis de um período de cessão (também usado no cadastro novo). */
function CessaoCampos({
  valor,
  onChange,
  isMobile,
  comRotulos,
  acoes
}: {
  valor: CessaoValor;
  onChange: (v: CessaoValor) => void;
  isMobile: boolean;
  comRotulos?: boolean;
  acoes?: React.ReactNode;
}) {
  const set = (p: Partial<CessaoValor>) => onChange({ ...valor, ...p });
  const rotulo = (t: string) => (isMobile || comRotulos ? <FieldLabel>{t}</FieldLabel> : null);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile
          ? "1fr"
          : acoes
            ? COLUNAS_CESSAO
            : "repeat(4, minmax(0, 1fr))",
        gap: isMobile ? 10 : comRotulos ? 16 : 8,
        alignItems: "end",
        padding: "8px 0"
      }}
    >
      <div>
        {rotulo("Data de Início da Cessão *")}
        <input
          type="date"
          value={valor.inicio}
          onChange={(e) => set({ inicio: e.target.value })}
          style={fieldStyle}
        />
      </div>
      <div>
        {rotulo("Data de Fim da Cessão")}
        <input
          type="date"
          value={valor.fim}
          onChange={(e) => set({ fim: e.target.value })}
          style={fieldStyle}
        />
      </div>
      <div>
        {rotulo("Órgão de Origem *")}
        <input
          type="text"
          value={valor.orgaoOrigem}
          placeholder="Ex: CFO"
          onChange={(e) => set({ orgaoOrigem: e.target.value })}
          style={fieldStyle}
        />
      </div>
      <div>
        {rotulo("Órgão de Destino *")}
        <input
          type="text"
          value={valor.orgaoDestino}
          placeholder="Ex: CRO-SP"
          onChange={(e) => set({ orgaoDestino: e.target.value })}
          style={fieldStyle}
        />
      </div>
      {acoes && <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>{acoes}</div>}
    </div>
  );
}

function pendenciasCessao(v: CessaoValor): string[] {
  return [
    !v.inicio && "Data de Início da Cessão",
    !v.orgaoOrigem.trim() && "Órgão de Origem",
    !v.orgaoDestino.trim() && "Órgão de Destino",
    !!v.inicio && !!v.fim && v.fim < v.inicio && "Data de Fim da Cessão anterior ao início"
  ].filter((x): x is string => !!x);
}

export type ResumoCessoes = { total: number; emAberto: number };

/** Períodos sem data de fim (em aberto) impedem desmarcar a cessão. */
function resumirCessoes(l: CessaoUI[]): ResumoCessoes {
  return { total: l.length, emAberto: l.filter((c) => !c.fim).length };
}

/**
 * Histórico de cessões do Efetivo, no mesmo padrão da lotação: cada linha tem
 * editar (✎) e remover (−), "+" acrescenta um período; cada ação grava na hora.
 * Com a cessão desmarcada, o histórico continua visível apenas para consulta.
 */
function CessaoLinhas({
  funcionarioId,
  isMobile,
  somenteLeitura: somenteLeituraCessao,
  somenteLeituraPerfil = false,
  onResumo,
  onSincronizado
}: {
  funcionarioId: string;
  isMobile: boolean;
  somenteLeitura: boolean;
  /** Perfil do RH sem a função "Cessão": só consulta. */
  somenteLeituraPerfil?: boolean;
  onResumo: (r: ResumoCessoes) => void;
  onSincronizado: (f: Funcionario) => void;
}) {
  const somenteLeitura = somenteLeituraCessao || somenteLeituraPerfil;
  const [linhas, setLinhas] = useState<CessaoUI[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null); // id | "nova"
  const [rascunho, setRascunho] = useState<CessaoValor | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancel = false;
    api
      .get<CessaoUI[]>(`/ponto/gestao/funcionarios/${funcionarioId}/cessoes`)
      .then((l) => {
        if (cancel) return;
        setLinhas(l ?? []);
        onResumo(resumirCessoes(l ?? []));
      })
      .catch(() => !cancel && setLinhas([]));
    return () => {
      cancel = true;
    };
  }, [funcionarioId]);

  const lista = linhas ?? [];
  const hoje = hojeLocalIso();

  // Cessão marcada sem nenhum período: já abre a primeira linha para preenchimento.
  // Ao desmarcar, descarta qualquer edição em andamento (histórico só para consulta).
  useEffect(() => {
    if (somenteLeitura) {
      if (editando !== null) cancelar();
    } else if (linhas !== null && linhas.length === 0 && editando === null) {
      iniciarNova();
    }
  }, [linhas, somenteLeitura]);

  function iniciarNova() {
    setErro("");
    setEditando("nova");
    const ultima = lista[lista.length - 1];
    setRascunho({
      inicio: "",
      fim: "",
      orgaoOrigem: ultima?.orgaoOrigem ?? "",
      orgaoDestino: ""
    });
  }

  function iniciarEdicao(c: CessaoUI) {
    setErro("");
    setEditando(c.id);
    setRascunho({
      inicio: c.inicio,
      fim: c.fim ?? "",
      orgaoOrigem: c.orgaoOrigem,
      orgaoDestino: c.orgaoDestino
    });
  }

  function cancelar() {
    setEditando(null);
    setRascunho(null);
    setErro("");
  }

  async function executar(req: () => Promise<{ cessoes: CessaoUI[]; funcionario: Funcionario }>) {
    setSalvando(true);
    setErro("");
    try {
      const r = await req();
      setLinhas(r.cessoes);
      onResumo(resumirCessoes(r.cessoes));
      onSincronizado(r.funcionario);
      cancelar();
    } catch (e) {
      setErro((e as Error)?.message ?? "Erro ao salvar a cessão.");
    } finally {
      setSalvando(false);
    }
  }

  function confirmar() {
    if (!rascunho) return;
    const faltando = pendenciasCessao(rascunho);
    if (faltando.length) {
      setErro(`Preencha: ${faltando.join(", ")}.`);
      return;
    }
    const base = `/ponto/gestao/funcionarios/${funcionarioId}/cessoes`;
    const body = { ...rascunho, fim: rascunho.fim || null };
    void executar(() =>
      editando === "nova" ? api.post(base, body) : api.patch(`${base}/${editando}`, body)
    );
  }

  function remover(c: CessaoUI) {
    if (!window.confirm("Remover este período de cessão?")) return;
    void executar(() => api.delete(`/ponto/gestao/funcionarios/${funcionarioId}/cessoes/${c.id}`));
  }

  const acoesEdicao = (
    <>
      <BotaoAcao titulo="Confirmar" onClick={confirmar} disabled={salvando}>
        <CheckIcon size={14} />
      </BotaoAcao>
      <BotaoAcao
        titulo="Cancelar"
        onClick={cancelar}
        disabled={salvando || lista.length === 0}
        perigo
      >
        <XIcon size={14} />
      </BotaoAcao>
    </>
  );

  const cabecalho = (t: string) => (
    <span style={{ ...labelStyle, marginBottom: 0, fontSize: 11 }}>{t}</span>
  );

  // Desmarcada e sem histórico: nada a mostrar.
  if (somenteLeitura && lista.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {somenteLeitura && (
        <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 6px" }}>
          Histórico de cessões (somente consulta). Marque a opção acima para registrar uma nova
          cessão.
        </p>
      )}
      {!isMobile && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLUNAS_CESSAO,
            gap: 8,
            paddingBottom: 6,
            borderBottom: "1px solid rgba(122,30,38,0.10)"
          }}
        >
          {cabecalho("Início *")}
          {cabecalho("Fim")}
          {cabecalho("Órgão de Origem *")}
          {cabecalho("Órgão de Destino *")}
          <span />
        </div>
      )}

      {linhas === null ? (
        <p style={{ fontSize: 12, color: "var(--ink-500)", padding: "10px 0" }}>Carregando…</p>
      ) : (
        lista.map((c, i) => {
          if (editando === c.id && rascunho) {
            return (
              <CessaoCampos
                key={c.id}
                valor={rascunho}
                onChange={setRascunho}
                isMobile={isMobile}
                acoes={acoesEdicao}
              />
            );
          }
          const atual = c.inicio <= hoje && (!c.fim || hoje <= c.fim);
          return (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr auto" : COLUNAS_CESSAO,
                gap: 8,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: i < lista.length - 1 ? "1px solid rgba(122,30,38,0.08)" : undefined,
                fontSize: 13.5,
                color: "var(--ink-900)"
              }}
            >
              {isMobile ? (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {c.orgaoOrigem} → {c.orgaoDestino}
                    {atual && <SeloAtual />}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                    {fmtData(c.inicio)} – {c.fim ? fmtData(c.fim) : "em aberto"}
                  </div>
                </div>
              ) : (
                <>
                  <span>{fmtData(c.inicio)}</span>
                  <span>{c.fim ? fmtData(c.fim) : "Em aberto"}</span>
                  <span>{c.orgaoOrigem}</span>
                  <span>
                    {c.orgaoDestino}
                    {atual && <SeloAtual />}
                  </span>
                </>
              )}
              {somenteLeitura ? (
                <span />
              ) : (
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <BotaoAcao
                    titulo="Editar"
                    onClick={() => iniciarEdicao(c)}
                    disabled={salvando || editando !== null}
                  >
                    <PencilIcon size={14} />
                  </BotaoAcao>
                  <BotaoAcao
                    titulo="Remover"
                    onClick={() => remover(c)}
                    disabled={salvando || editando !== null}
                    perigo
                  >
                    <MinusIcon size={14} />
                  </BotaoAcao>
                </div>
              )}
            </div>
          );
        })
      )}

      {editando === "nova" && rascunho && (
        <CessaoCampos
          valor={rascunho}
          onChange={setRascunho}
          isMobile={isMobile}
          acoes={acoesEdicao}
        />
      )}

      {erro && <p style={{ color: "var(--red)", fontSize: 12, margin: "6px 0 0" }}>{erro}</p>}

      {editando === null && linhas !== null && !somenteLeitura && (
        <button
          type="button"
          onClick={iniciarNova}
          disabled={salvando}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 10,
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
          <PlusIcon size={13} /> Nova cessão
        </button>
      )}
    </div>
  );
}

function SeloAtual() {
  return (
    <span
      style={{
        marginLeft: 8,
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: "rgba(122,30,38,0.08)",
        color: "var(--burgundy-600)",
        verticalAlign: "middle"
      }}
    >
      Atual
    </span>
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
  const { user, hasRole, refreshProfile, podeRh } = useAuth();
  /* Perfil do RH: restringe só quem acessa como RH (não Gerente de RH/super admin nem gestor). */
  const restritoPerfilRh =
    !user?.isSuperAdmin &&
    !hasRole("ponto-admin") &&
    !hasRole("PONTO_ADMIN") &&
    !hasRole("gestor") &&
    !hasRole("GESTOR_APROVACAO") &&
    hasRole("RH_AUDITORIA");
  const podeFuncao = (recurso: string) => !restritoPerfilRh || podeRh(recurso);
  const podeEditarCadastro = podeFuncao("gestao.funcionarios.editar");
  const podeLotacao = podeFuncao("gestao.funcionarios.lotacao");
  const podeCessao = podeFuncao("gestao.funcionarios.cessao");
  const podeRequerimento = podeFuncao("gestao.funcionarios.requerimento");
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

  const [requerimentoAtual, setRequerimentoAtual] = useState<StatusRequerimento>(null);
  const [enviandoReq, setEnviandoReq] = useState(false);
  /** Requerimentos de cadastro (dependentes, formação, cursos) — status por tipo. */
  const [reqsCadastro, setReqsCadastro] = useState<
    Partial<Record<TipoRequerimentoCadastro, StatusRequerimento>>
  >({});
  const [enviandoReqCadastro, setEnviandoReqCadastro] = useState<TipoRequerimentoCadastro | null>(
    null
  );
  const [modalidade, setModalidade] = useState({ modoHomeOffice: false, modoHibridoLocal: false });
  const [endereco, setEndereco] = useState<EnderecoResidencial>({ raioMetros: 20 });
  const [mapaAberto, setMapaAberto] = useState(false);
  /** Buscando as coordenadas do endereço antes de abrir o mapa ("Definir no Mapa"). */
  const [localizandoEndereco, setLocalizandoEndereco] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [hibridoMaxDias, setHibridoMaxDias] = useState(2);
  const [erroSalvar, setErroSalvar] = useState("");
  const [funcionarioAtual, setFuncionarioAtual] = useState<Funcionario | null>(null);
  /** Resumo do histórico de cessão (null = ainda não carregado). */
  const [resumoCessoes, setResumoCessoes] = useState<ResumoCessoes | null>(null);
  /* Só dá para desmarcar a cessão quando todos os períodos têm data de fim. */
  const cessaoEmAberto = (resumoCessoes?.emAberto ?? 0) > 0;
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
        setReqsCadastro(
          Object.fromEntries((f.requerimentosCadastro ?? []).map((r) => [r.tipo, r]))
        );
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
  /* CPF é obrigatório para todas as categorias: vazio, incompleto ou inválido bloqueia. */
  const cpfBloqueio = !cpfValido;
  /* Cessão marcada (só Efetivo): datas e órgãos passam a ser obrigatórios. */
  /* Cessão marcada (só Efetivo): no cadastro novo os campos do 1º período são
     obrigatórios; no existente, é preciso ter ao menos um período no histórico. */
  const cessaoAtiva = form.categoria === "CONCURSADO" && form.cedido;
  const cessaoPendencias: string[] = !cessaoAtiva
    ? []
    : isNovo
      ? pendenciasCessao({
          inicio: form.cessaoInicio,
          fim: form.cessaoFim,
          orgaoOrigem: form.cessaoOrgaoOrigem,
          orgaoDestino: form.cessaoOrgaoDestino
        })
      : resumoCessoes?.total === 0
        ? ["ao menos um período de Cessão do Efetivo"]
        : [];
  const podeSalvar =
    !!form.nome.trim() &&
    !!form.matricula.trim() &&
    !!form.gerenciaId &&
    !cpfBloqueio &&
    cessaoPendencias.length === 0 &&
    !salvando;
  /* Chefe de coordenação (subseção contém "coordenação"): substituto é da mesma
     subseção, não da gerência inteira — espelha a exceção do backend. */
  const ehChefeDeCoordenacao = form.isManager && !!form.subsecao && /coordena/i.test(form.subsecao);

  /* Categorias — cada seção do formulário varia por categoria (ver planejamento
     de reorganização). "catComChefe" (Efetivo/Comissionado) tem Chefe/Situação
     no Cargo e Lotação; "catEstagio" (Estagiário/Jovem Aprendiz) usa a estrutura
     de Supervisor em vez de Chefe. */
  const catEmpregado = form.categoria === "CONCURSADO";
  const empregadoCampos: CamposEmpregado | undefined = catEmpregado
    ? {
        cargo: form.cargo,
        nivel: form.nivelCargo,
        onCargo: (v) => setForm((f) => ({ ...f, cargo: v })),
        onNivel: (v) => setForm((f) => ({ ...f, nivelCargo: v }))
      }
    : undefined;
  const catComissionado = form.categoria === "ASSESSOR";
  const catEstagiario = form.categoria === "ESTAGIARIO";
  const catJovemAprendiz = form.categoria === "MENOR_APRENDIZ";
  const catComChefe = catEmpregado || catComissionado;

  function motivosBloqueio(): string[] {
    const m: string[] = [];
    if (!form.nome.trim()) m.push("Nome completo");
    if (!form.matricula.trim()) m.push("Matrícula");
    if (!form.gerenciaId) m.push("Gerência");
    if (!cpfPreenchido) m.push("CPF");
    else if (!cpfValido) m.push("CPF inválido ou incompleto");
    m.push(...cessaoPendencias);
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

  async function solicitarCadastro(tipo: TipoRequerimentoCadastro) {
    if (!id) return;
    setEnviandoReqCadastro(tipo);
    try {
      const res = await api.post<NonNullable<StatusRequerimento>>(
        `/ponto/gestao/funcionarios/${id}/requerimento-cadastro/${tipo}`,
        {}
      );
      setReqsCadastro((r) => ({ ...r, [tipo]: res }));
    } catch (e) {
      alert("Não foi possível enviar a solicitação: " + ((e as Error)?.message ?? ""));
    } finally {
      setEnviandoReqCadastro(null);
    }
  }

  /** Título de lista (Dependentes, Formação, Cursos) com o botão de solicitar ao funcionário. */
  function cabecalhoComRequerimento(titulo: string, tipo: TipoRequerimentoCadastro) {
    return (
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 6
          }}
        >
          <FieldLabel>{titulo}</FieldLabel>
          {!isNovo && id && podeRequerimento && (
            <BotaoSolicitarRequerimento
              status={reqsCadastro[tipo] ?? null}
              enviando={enviandoReqCadastro === tipo}
              onSolicitar={() => void solicitarCadastro(tipo)}
              rotulo="Solicitar ao funcionário"
              titulo={`Solicitar ao funcionário que informe: ${REQUERIMENTO_INFO[tipo].rotulo}`}
            />
          )}
        </div>
        {!isNovo && (
          <FaixaStatusRequerimento
            status={reqsCadastro[tipo] ?? null}
            oQue={`informar ${REQUERIMENTO_INFO[tipo].rotulo.toLowerCase()}`}
          />
        )}
      </>
    );
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
      setLocalizandoEndereco(true);
      const result = await geocodificarEndereco({
        logradouro: endereco.logradouro ?? undefined,
        numero: endereco.numero ?? undefined,
        bairro: endereco.bairro ?? undefined,
        cidade: endereco.cidade ?? undefined,
        uf: endereco.uf ?? undefined,
        cep: endereco.cep ?? undefined
      }).finally(() => setLocalizandoEndereco(false));
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
      nivelCargo: catEmpregado && form.nivelCargo ? form.nivelCargo : null,
      lotacaoInicio: form.lotacaoInicio || null,
      lotacaoTermino: form.lotacaoTermino || null,
      contratoInicio: form.contratoInicio || null,
      /* Cessão: a marcação vai sempre; os dados do período só no cadastro novo (no
         existente, os períodos são gravados pelo histórico de cessões). */
      cedido: catEmpregado && form.cedido,
      ...(isNovo && catEmpregado && form.cedido
        ? {
            cessaoInicio: form.cessaoInicio || null,
            cessaoFim: form.cessaoFim || null,
            cessaoOrgaoOrigem: form.cessaoOrgaoOrigem || null,
            cessaoOrgaoDestino: form.cessaoOrgaoDestino || null
          }
        : {}),
      contratoTermino: form.contratoTermino || null,
      bolsaAuxilio: bolsaAuxilio || null,
      dependentes: form.dependentes.filter((d) => d.nome.trim()),
      formacoesAcademicas: form.formacoesAcademicas.filter((f) => f.curso.trim()),
      capacitacoes: form.capacitacoes.filter((c) => c.nome.trim())
    };

    if (!isNovo) {
      /* Lotação de funcionário existente é gravada pelas linhas (histórico); não
         reenviar evita sobrescrever a vigência com valores antigos do formulário. */
      delete payload.gerenciaId;
      delete payload.subsecao;
      delete payload.lotacaoInicio;
      delete payload.lotacaoTermino;
      delete payload.cargoData;
      delete payload.cessaoInicio;
      delete payload.cessaoFim;
      delete payload.cessaoOrgaoOrigem;
      delete payload.cessaoOrgaoDestino;
      if (catComissionado) delete payload.cargo;
    }

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

  const selectStyle: React.CSSProperties = {
    ...fieldStyle,
    appearance: "none",
    padding: "9px 32px 9px 12px",
    cursor: "pointer"
  };

  /* "Situação" (ativo/inativo) é usada em duas seções (Geral e Cargo e Lotação
     para Efetivo/Comissionado) — extraído para não duplicar o JSX. */
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
      <div
        style={{
          maxWidth: "var(--largura-pagina)",
          margin: "0 auto",
          color: "var(--ink-500)",
          padding: "40px 0"
        }}
      >
        Carregando funcionário…
      </div>
    );
  }

  if (naoEncontrado) {
    return (
      <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
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
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
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

        {/* Observações: linha própria, abaixo de Categoria/Situação/Chefe e do Chefe Substituto. */}
        <div style={{ marginBottom: 24 }}>
          <FieldLabel>Observações</FieldLabel>
          <textarea
            value={form.observacoes}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            rows={2}
            maxLength={2000}
            placeholder="Anotações sobre o funcionário"
            style={{ ...fieldStyle, resize: "vertical", minHeight: 40, lineHeight: 1.45 }}
          />
        </div>

        {catEmpregado && (
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                ...labelStyle,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 0,
                cursor: "pointer"
              }}
            >
              <input
                type="checkbox"
                checked={form.cedido}
                disabled={!isNovo && form.cedido && cessaoEmAberto}
                title={
                  !isNovo && form.cedido && cessaoEmAberto
                    ? "Há cessão em aberto: informe a data de fim para desmarcar"
                    : undefined
                }
                onChange={(e) => setForm((f) => ({ ...f, cedido: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: "var(--burgundy-600)" }}
              />
              Cessão do Efetivo
            </label>
            {isNovo || !id ? (
              form.cedido && (
                <CessaoCampos
                  valor={{
                    inicio: form.cessaoInicio,
                    fim: form.cessaoFim,
                    orgaoOrigem: form.cessaoOrgaoOrigem,
                    orgaoDestino: form.cessaoOrgaoDestino
                  }}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      cessaoInicio: v.inicio,
                      cessaoFim: v.fim,
                      cessaoOrgaoOrigem: v.orgaoOrigem,
                      cessaoOrgaoDestino: v.orgaoDestino
                    }))
                  }
                  isMobile={isMobile}
                  comRotulos
                />
              )
            ) : (
              <CessaoLinhas
                funcionarioId={id}
                isMobile={isMobile}
                somenteLeituraPerfil={!podeCessao}
                somenteLeitura={!form.cedido}
                onResumo={setResumoCessoes}
                onSincronizado={(atualizado) => {
                  const n = formFromFuncionario(atualizado);
                  setForm((f) => ({
                    ...f,
                    cessaoInicio: n.cessaoInicio,
                    cessaoFim: n.cessaoFim,
                    cessaoOrgaoOrigem: n.cessaoOrgaoOrigem,
                    cessaoOrgaoDestino: n.cessaoOrgaoDestino
                  }));
                }}
              />
            )}
          </div>
        )}

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
            <FieldLabel>
              CPF <span style={{ color: "var(--red)" }}>*</span>
            </FieldLabel>
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
            {!cpfPreenchido && (
              <p
                style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--red)", fontWeight: 500 }}
              >
                O CPF é obrigatório.
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
              maxLength={15}
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
            {cabecalhoComRequerimento("Dependentes (Filhos)", "DEPENDENTES")}
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
        {/* Cargo e nível do efetivo ficam na mesma linha da lotação. */}
        {isNovo || !id ? (
          /* Cadastro novo: uma única linha ligada ao formulário; o histórico nasce ao salvar. */
          <LinhaLotacaoCampos
            valor={{
              cargo: form.cargo,
              gerenciaId: form.gerenciaId,
              subsecao: form.subsecao,
              vigenciaDesde: form.lotacaoInicio,
              vigenciaAte: form.lotacaoTermino
            }}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                cargo: v.cargo,
                gerenciaId: v.gerenciaId,
                subsecao: v.subsecao,
                lotacaoInicio: v.vigenciaDesde,
                lotacaoTermino: v.vigenciaAte
              }))
            }
            comCargo={catComissionado}
            colunaEmpregado={catEmpregado}
            efetivo={empregadoCampos}
            fimEditavel
            comRotulos
            gerencias={gerencias}
            funcionarios={funcionarios}
            isMobile={isMobile}
          />
        ) : (
          <LotacaoLinhas
            funcionarioId={id}
            somenteLeitura={!podeLotacao}
            efetivo={empregadoCampos}
            comCargo={catComissionado}
            gerencias={gerencias}
            funcionarios={funcionarios}
            isMobile={isMobile}
            onSincronizado={(atualizado) => {
              const n = formFromFuncionario(atualizado);
              setForm((f) => ({
                ...f,
                cargo: n.cargo,
                gerenciaId: n.gerenciaId,
                subsecao: n.subsecao,
                lotacaoInicio: n.lotacaoInicio,
                lotacaoTermino: n.lotacaoTermino
              }));
              setFuncionarioAtual((prev) =>
                prev
                  ? {
                      ...prev,
                      gerenciaId: atualizado.gerenciaId,
                      subsecao: atualizado.subsecao,
                      gerencia: atualizado.gerencia
                    }
                  : atualizado
              );
            }}
          />
        )}
        {catComChefe && (
          <div style={{ marginBottom: 20 }}>
            <Hint>
              Chefe atual: {funcionarioAtual ? chefeDaLotacao(funcionarioAtual) : "—"} (somente
              leitura)
            </Hint>
          </div>
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
              <FieldLabel>É assessor?</FieldLabel>
              <div style={{ paddingTop: 8 }}>
                <Toggle
                  checked={form.isFiscal}
                  onChange={(v) => setForm((f) => ({ ...f, isFiscal: v }))}
                  label="Funcionário é assessor"
                />
              </div>
              <Hint>Assessor fica automaticamente isento de registro de ponto, como o Chefe.</Hint>
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

        {/* Estagiário, Jovem Aprendiz e Comissionado não têm tolerância individual (vale a geral). */}
        {id && isRhOuAdmin && !catEstagiario && !catJovemAprendiz && !catComissionado && (
          <ToleranciaFechamentoFuncionario
            funcionarioId={id}
            somenteLeitura={!podeFuncao("gestao.funcionarios.banco-horas")}
          />
        )}

        {(catEstagiario || catJovemAprendiz) && (
          <div style={{ marginTop: 16 }}>
            <FieldLabel>
              {catEstagiario ? (
                "Dados do Contrato de Estágio"
              ) : (
                <strong style={{ fontWeight: 800, color: "var(--ink-900)" }}>
                  Dados do Contrato
                </strong>
              )}
            </FieldLabel>
            <div
              style={{
                display: "grid",
                // Jovem Aprendiz: datas, carga horária e dias numa única linha; a coluna
                // dos dias usa só a largura dos checkboxes e o resto fica para os rótulos
                gridTemplateColumns:
                  isMobile || catEstagiario ? gridCols(4) : "repeat(3, minmax(0, 1fr)) auto",
                gap: 16,
                marginTop: 8
              }}
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
                <FieldLabel>Data de Início{catEstagiario ? " do Curso" : ""}</FieldLabel>
                <input
                  type="date"
                  value={form.contratoInicio}
                  onChange={(e) => setForm((f) => ({ ...f, contratoInicio: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Data de Término{catEstagiario ? " do Curso *" : ""}</FieldLabel>
                <input
                  type="date"
                  value={form.contratoTermino}
                  onChange={(e) => setForm((f) => ({ ...f, contratoTermino: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Carga Horária{catEstagiario ? " da Jornada" : ""}</FieldLabel>
                <input
                  type="text"
                  value={form.cargaHoraria}
                  onChange={(e) => setForm((f) => ({ ...f, cargaHoraria: e.target.value }))}
                  placeholder="Ex: 20h semanais"
                  style={fieldStyle}
                />
              </div>
              <div style={{ gridColumn: !isMobile && catEstagiario ? "span 2" : undefined }}>
                <FieldLabel>Dias da Semana{catEstagiario ? " da Jornada" : ""}</FieldLabel>
                <DiasSemanaCheckboxes
                  value={form.diasSemana}
                  onChange={(v) => setForm((f) => ({ ...f, diasSemana: v }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ CAPACITAÇÃO ══════════════════ */}
        {(catEmpregado || catComissionado) && (
          <>
            <SectionTitle>Capacitação</SectionTitle>

            <div style={{ marginBottom: 20 }}>
              {cabecalhoComRequerimento("Formação Acadêmica", "FORMACAO_ACADEMICA")}
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
              {cabecalhoComRequerimento("Cursos / Capacitações", "CAPACITACOES")}
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
          </>
        )}

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
            <p
              style={{
                fontSize: 11.5,
                color: "var(--ink-500)",
                margin: "0 0 8px",
                lineHeight: 1.5
              }}
            >
              A modalidade vale <strong>a partir do dia em que for alterada</strong>: o ponto, o
              banco de horas e a hora extra dos dias anteriores continuam calculados como eram.
            </p>

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
              {!isNovo && podeRequerimento && (
                <BotaoSolicitarRequerimento
                  status={requerimentoAtual}
                  enviando={enviandoReq}
                  onSolicitar={() => void solicitarEndereco()}
                  rotulo="Solicitar Endereço"
                  titulo="Solicitar ao funcionário que preencha o endereço residencial"
                  icone={<MapPinIcon size={13} />}
                />
              )}
            </div>
            <FaixaStatusRequerimento status={requerimentoAtual} oQue="preencher o endereço" />
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
                  disabled={localizandoEndereco}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid rgba(122,30,38,0.22)",
                    background: "transparent",
                    cursor: localizandoEndereco ? "wait" : "pointer",
                    color: "var(--ink-700)",
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "var(--font-body)",
                    whiteSpace: "nowrap"
                  }}
                >
                  <MapPinIcon size={14} />
                  {localizandoEndereco
                    ? "Localizando endereço…"
                    : endereco.lat
                      ? "Ajustar no Mapa"
                      : "Definir no Mapa"}
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
        {(isNovo || podeEditarCadastro) && (
          <button
            className="btn btn-primary"
            onClick={() => void salvar()}
            disabled={salvando}
            style={{ opacity: podeSalvar ? 1 : 0.55 }}
          >
            {salvando ? "Salvando…" : isNovo ? "Cadastrar Funcionário" : "Salvar Alterações"}
          </button>
        )}
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
          buscaInicial={textoBuscaEndereco(endereco)}
          minRaio={10}
          maxRaio={500}
          onConfirm={onMapaConfirm}
          onClose={() => setMapaAberto(false)}
        />
      )}
    </div>
  );
}

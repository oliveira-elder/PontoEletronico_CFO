import React, { useState, useEffect } from "react";
import { MapModal } from "../../components/MapModal";
import {
  SettingsIcon,
  BuildingIcon,
  InfoIcon,
  PlusIcon,
  Trash2Icon,
  CheckCircleIcon,
  MapPinIcon,
  ShieldCheckIcon,
  UsersIcon
} from "../../components/icons";
import { api } from "../../hooks/useApi";

/* ─── Tipos ─── */
interface Provedor {
  id: string;
  nome: string;
  ip: string;
  isPrincipal: boolean;
  ativo: boolean;
}
interface Subrede {
  id: string;
  cidr: string;
  descricao: string;
}
interface AreaViagem {
  id: string;
  nome: string;
  descricao: string;
  lat: number;
  lng: number;
  raioMetros: number;
  ativa: boolean;
}

interface SistemaApi {
  nome: string;
  cnpj: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  emailInstitucional?: string;
  lat: number;
  lng: number;
  raioMetros: number;
  modoDesktop: boolean;
  modoMobile: boolean;
  modoHibrido: boolean;
  modoViagem: boolean;
  desktopCheckSubrede: boolean;
  desktopCheckGeo: boolean;
  mobileCheckSubrede: boolean;
  mobileCheckGeo: boolean;
  mobileExigirFoto: boolean;
  hibridoExigirFoto: boolean;
  // Períodos / jornada (retornados pelo backend com defaults)
  horaEntrada: string;
  horaSaida: string;
  jornadaDiariaMin: number;
  jornadaSemanalMin: number;
  diasUteis: boolean[] | string;
  toleranciaEntradaMin: number;
  toleranciaSaidaMin: number;
  toleranciaHoraExtraMin: number;
  toleranciaCalculoMin: number;
  tipoFlexibilidade: string;
  almocoPodeIniciarA: string;
  almocoPodeIniciarAte: string;
  almocoMinMin: number;
  almocoMaxMin: number;
  hibridoMaxDiasSemana: number;
  hibridoExigeAprovacao: boolean;
  viagemJanelaMinutos: number;
  viagemExigeAprovacao: boolean;
  bancoHorasLimiteMin: number;
  bancoHorasVigenciaDias: number;
}

interface Config {
  // Instituição
  nome: string;
  cnpj: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  // Geoloc
  lat: number;
  lng: number;
  raioMetros: number;
  // Modos
  modoDesktop: boolean;
  modoMobile: boolean;
  modoHibrido: boolean;
  modoViagem: boolean;
  // Desktop
  desktopCheckSubrede: boolean;
  desktopCheckGeo: boolean;
  // Mobile
  mobileCheckSubrede: boolean;
  mobileCheckGeo: boolean;
  mobileExigirFoto: boolean;
  // Híbrido / Viagem
  hibridoExigirFoto: boolean;
}

/* ─── Toggle ─── */
function Toggle({
  value,
  onChange,
  label,
  desc
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <div
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
        <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>{label}</p>
        {desc && <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          border: "none",
          cursor: "pointer",
          flexShrink: 0,
          background: value ? "var(--burgundy-600)" : "rgba(122,30,38,0.15)",
          position: "relative",
          transition: "background 200ms"
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: value ? 22 : 3,
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
  );
}

interface CampoProps {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  readOnly?: boolean;
}
/* ─── Campo de formulário ─── */
function Campo({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
  readOnly = false
}: CampoProps) {
  return (
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
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          width: "100%",
          padding: "9px 11px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.14)",
          background: readOnly ? "var(--cream-50)" : "#fff",
          fontSize: 13.5,
          fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
          outline: "none",
          boxSizing: "border-box" as const,
          color: readOnly ? "var(--ink-500)" : "var(--ink-900)"
        }}
      />
    </div>
  );
}

/* ─── Seção ─── */
function Secao({
  titulo,
  icon,
  children
}: {
  titulo: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "20px 22px",
        marginBottom: 16
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {icon && <span style={{ color: "var(--burgundy-600)" }}>{icon}</span>}
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: 17,
            color: "var(--burgundy-600)",
            fontWeight: 400
          }}
        >
          {titulo}
        </h3>
      </div>
      {children}
    </div>
  );
}

type Tab = "institucional" | "rede" | "modos" | "areas" | "periodos";

/* ─── Tipos de períodos ─── */
interface ConfigPeriodos {
  // Jornada padrão
  horaEntrada: string; // "08:00"
  horaSaida: string; // "17:00"
  jornadaDiariaMin: number; // 480
  jornadaSemanalMin: number; // 2400
  diasUteis: boolean[]; // [false,true,true,true,true,true,false] Dom→Sáb
  // Flexibilidade
  toleranciaEntradaMin: number; // 15 — minutos de atraso na entrada não considerados falta
  toleranciaSaidaMin: number; // 15 — minutos de saída antecipada não considerados falta
  toleranciaHoraExtraMin: number; // 10 — minutos além da saída não contados como hora extra
  toleranciaCalculoMin: number; // 5  — margem geral do cálculo diário (±N min = jornada OK)
  tipoFlexibilidade: "FIXO" | "ELASTICO" | "BANCO_HORAS";
  // Intervalo de almoço
  almocoPodeIniciarA: string; // "11:30"
  almocoPodeIniciarAte: string; // "13:00"
  almocoMinMin: number; // 60
  almocoMaxMin: number; // 90
  // Modo híbrido
  hibridoMaxDiasSemana: number; // 2
  hibridoExigeAprovacao: boolean;
  // Modo viagem
  viagemJanelaMinutos: number; // 120
  viagemExigeAprovacao: boolean;
  // Banco de horas
  bancoHorasLimiteMin: number; // 120 = 2h
  bancoHorasVigenciaDias: number; // 30
}

/* ═══════════════════════════════════════════════ */
export function ConfiguracoesPage() {
  const [tab, setTab] = useState<Tab>("institucional");
  const [config, setConfig] = useState<Config | null>(null);
  const [periodos, setPeriodos] = useState<ConfigPeriodos | null>(null);
  const [provedores, setProvedores] = useState<Provedor[]>([]);
  const [subredes, setSubredes] = useState<Subrede[]>([]);
  const [areas, setAreas] = useState<AreaViagem[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Mapa modal
  const [mapaModal, setMapaModal] = useState(false);
  const [mapaAreaId, setMapaAreaId] = useState<string | null>(null); // null = sede

  // Novo provedor form
  const [novoProvedor, setNovoProvedor] = useState({ nome: "", ip: "", isPrincipal: false });
  // Nova subrede form
  const [novaSubrede, setNovaSubrede] = useState({ cidr: "", descricao: "" });
  // Nova área
  const [novaArea, setNovaArea] = useState({ nome: "", descricao: "" });

  // Geocodificação automática
  const [geocodingStatus, setGeocodingStatus] = useState<"idle" | "loading" | "ok" | "erro">(
    "idle"
  );
  const [geocodingMsg, setGeocodingMsg] = useState("");

  // IP público detectado
  const [ipPublico, setIpPublico] = useState("Detectando…");

  /* Carrega dados da API ao montar */
  useEffect(() => {
    Promise.all([
      api.get<SistemaApi>("/ponto/config/sistema"),
      api.get<Provedor[]>("/ponto/config/provedores"),
      api.get<Subrede[]>("/ponto/config/subredes"),
      api.get<AreaViagem[]>("/ponto/config/areas")
    ])
      .then(([sis, provs, subs, areasApi]) => {
        if (sis) {
          setConfig({
            nome: sis.nome,
            cnpj: sis.cnpj,
            endereco: sis.endereco ?? "",
            numero: sis.numero ?? "",
            bairro: sis.bairro ?? "",
            cidade: sis.cidade ?? "",
            uf: sis.uf ?? "",
            cep: sis.cep ?? "",
            telefone: sis.telefone ?? "",
            email: sis.emailInstitucional ?? "",
            lat: sis.lat,
            lng: sis.lng,
            raioMetros: sis.raioMetros,
            modoDesktop: sis.modoDesktop,
            modoMobile: sis.modoMobile,
            modoHibrido: sis.modoHibrido,
            modoViagem: sis.modoViagem,
            desktopCheckSubrede: sis.desktopCheckSubrede,
            desktopCheckGeo: sis.desktopCheckGeo,
            mobileCheckSubrede: sis.mobileCheckSubrede,
            mobileCheckGeo: sis.mobileCheckGeo,
            mobileExigirFoto: sis.mobileExigirFoto,
            hibridoExigirFoto: sis.hibridoExigirFoto
          });
          setPeriodos({
            horaEntrada: sis.horaEntrada,
            horaSaida: sis.horaSaida,
            jornadaDiariaMin: sis.jornadaDiariaMin,
            jornadaSemanalMin: sis.jornadaSemanalMin,
            diasUteis:
              typeof sis.diasUteis === "string" ? JSON.parse(sis.diasUteis) : sis.diasUteis,
            toleranciaEntradaMin: sis.toleranciaEntradaMin,
            toleranciaSaidaMin: sis.toleranciaSaidaMin,
            toleranciaHoraExtraMin: sis.toleranciaHoraExtraMin,
            toleranciaCalculoMin: sis.toleranciaCalculoMin,
            tipoFlexibilidade: sis.tipoFlexibilidade,
            almocoPodeIniciarA: sis.almocoPodeIniciarA,
            almocoPodeIniciarAte: sis.almocoPodeIniciarAte,
            almocoMinMin: sis.almocoMinMin,
            almocoMaxMin: sis.almocoMaxMin,
            hibridoMaxDiasSemana: sis.hibridoMaxDiasSemana,
            hibridoExigeAprovacao: sis.hibridoExigeAprovacao,
            viagemJanelaMinutos: sis.viagemJanelaMinutos,
            viagemExigeAprovacao: sis.viagemExigeAprovacao,
            bancoHorasLimiteMin: sis.bancoHorasLimiteMin,
            bancoHorasVigenciaDias: sis.bancoHorasVigenciaDias
          });
        }
        setProvedores(provs ?? []);
        setSubredes(subs ?? []);
        setAreas(areasApi ?? []);
      })
      .catch(() => {
        /* config/periodos permanecem null → tela de erro */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((d) => setIpPublico(d.ip))
      .catch(() => setIpPublico("Não detectado"));
  }, []);

  function upd(k: keyof Config, v: Config[keyof Config]) {
    setConfig((c) => (c ? { ...c, [k]: v } : c));
  }

  /* Geocodificação automática via Nominatim — busca pelo endereço ou nome da instituição */
  async function geocodificar() {
    if (!config) return;
    setGeocodingStatus("loading");
    setGeocodingMsg("");

    const partes = [
      config.endereco,
      config.numero,
      config.bairro,
      config.cidade,
      config.uf,
      "Brasil"
    ]
      .filter(Boolean)
      .join(", ");

    const queries =
      partes.length > 10
        ? [partes, `${config.nome}, ${config.cidade}, Brasil`]
        : [`${config.nome}, ${config.cidade || ""}, Brasil`];

    for (const q of queries) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`,
          { headers: { "Accept-Language": "pt-BR" } }
        );
        const data = await res.json();
        if (data.length > 0) {
          const { lat, lon, display_name } = data[0];
          setConfig((c) => (c ? { ...c, lat: parseFloat(lat), lng: parseFloat(lon) } : c));
          setGeocodingStatus("ok");
          setGeocodingMsg(display_name);
          return;
        }
      } catch {
        /* tenta próxima query */
      }
    }

    setGeocodingStatus("erro");
    setGeocodingMsg("Endereço não encontrado. Ajuste o endereço ou posicione manualmente no mapa.");
  }

  async function salvarTudo() {
    if (!config || !periodos) return;
    await api.put("/ponto/config/sistema", {
      // Instituição
      nome: config.nome,
      cnpj: config.cnpj,
      endereco: config.endereco,
      numero: config.numero,
      bairro: config.bairro,
      cidade: config.cidade,
      uf: config.uf,
      cep: config.cep,
      telefone: config.telefone,
      emailInstitucional: config.email,
      // Geoloc
      lat: config.lat,
      lng: config.lng,
      raioMetros: config.raioMetros,
      // Modos
      modoDesktop: config.modoDesktop,
      modoMobile: config.modoMobile,
      modoHibrido: config.modoHibrido,
      modoViagem: config.modoViagem,
      desktopCheckSubrede: config.desktopCheckSubrede,
      desktopCheckGeo: config.desktopCheckGeo,
      mobileCheckSubrede: config.mobileCheckSubrede,
      mobileCheckGeo: config.mobileCheckGeo,
      mobileExigirFoto: config.mobileExigirFoto,
      hibridoExigirFoto: config.hibridoExigirFoto,
      // Períodos
      horaEntrada: periodos.horaEntrada,
      horaSaida: periodos.horaSaida,
      jornadaDiariaMin: periodos.jornadaDiariaMin,
      jornadaSemanalMin: periodos.jornadaSemanalMin,
      diasUteis: JSON.stringify(periodos.diasUteis),
      toleranciaEntradaMin: periodos.toleranciaEntradaMin,
      toleranciaSaidaMin: periodos.toleranciaSaidaMin,
      toleranciaHoraExtraMin: periodos.toleranciaHoraExtraMin,
      toleranciaCalculoMin: periodos.toleranciaCalculoMin,
      tipoFlexibilidade: periodos.tipoFlexibilidade,
      almocoPodeIniciarA: periodos.almocoPodeIniciarA,
      almocoPodeIniciarAte: periodos.almocoPodeIniciarAte,
      almocoMinMin: periodos.almocoMinMin,
      almocoMaxMin: periodos.almocoMaxMin,
      hibridoMaxDiasSemana: periodos.hibridoMaxDiasSemana,
      hibridoExigeAprovacao: periodos.hibridoExigeAprovacao,
      viagemJanelaMinutos: periodos.viagemJanelaMinutos,
      viagemExigeAprovacao: periodos.viagemExigeAprovacao,
      bancoHorasLimiteMin: periodos.bancoHorasLimiteMin,
      bancoHorasVigenciaDias: periodos.bancoHorasVigenciaDias
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  /* ── Provedores ── */
  async function addProvedor() {
    if (!novoProvedor.nome || !novoProvedor.ip) return;
    const novo = await api.post<Provedor>("/ponto/config/provedores", novoProvedor);
    setProvedores((p) => [...p, novo]);
    setNovoProvedor({ nome: "", ip: "", isPrincipal: false });
  }
  async function removeProvedor(id: string) {
    await api.delete(`/ponto/config/provedores/${id}`);
    setProvedores((p) => p.filter((x) => x.id !== id));
  }
  async function toggleProvedor(id: string) {
    const atualizado = await api.patch<Provedor>(`/ponto/config/provedores/${id}/toggle`);
    setProvedores((p) => p.map((x) => (x.id === id ? atualizado : x)));
  }

  /* ── Subredes ── */
  async function addSubrede() {
    if (!novaSubrede.cidr) return;
    const nova = await api.post<Subrede>("/ponto/config/subredes", novaSubrede);
    setSubredes((s) => [...s, nova]);
    setNovaSubrede({ cidr: "", descricao: "" });
  }
  async function removeSubrede(id: string) {
    await api.delete(`/ponto/config/subredes/${id}`);
    setSubredes((s) => s.filter((x) => x.id !== id));
  }

  /* ── Áreas ── */
  function addArea() {
    if (!novaArea.nome) return;
    setMapaAreaId("NEW:" + novaArea.nome + ":" + novaArea.descricao);
    setMapaModal(true);
  }
  async function removeArea(id: string) {
    await api.delete(`/ponto/config/areas/${id}`);
    setAreas((a) => a.filter((x) => x.id !== id));
  }
  async function toggleArea(id: string) {
    const atualizada = await api.patch<AreaViagem>(`/ponto/config/areas/${id}/toggle`);
    setAreas((a) => a.map((x) => (x.id === id ? atualizada : x)));
  }

  /* ── Callback do mapa ── */
  async function onMapaConfirm(res: { lat: number; lng: number; raio: number }) {
    if (mapaAreaId === null) {
      upd("lat", res.lat);
      upd("lng", res.lng);
      upd("raioMetros", res.raio);
    } else if (mapaAreaId.startsWith("NEW:")) {
      const parts = mapaAreaId.split(":");
      const nova = await api.post<AreaViagem>("/ponto/config/areas", {
        nome: parts[1],
        descricao: parts[2] ?? "",
        lat: res.lat,
        lng: res.lng,
        raioMetros: res.raio
      });
      setAreas((a) => [...a, nova]);
      setNovaArea({ nome: "", descricao: "" });
    } else {
      const atualizada = await api.patch<AreaViagem>(`/ponto/config/areas/${mapaAreaId}`, {
        lat: res.lat,
        lng: res.lng,
        raioMetros: res.raio
      });
      setAreas((a) => a.map((x) => (x.id === mapaAreaId ? atualizada : x)));
    }
  }

  /* ─── Tabs ─── */
  const TABS: { key: Tab; label: string }[] = [
    { key: "institucional", label: "Instituição" },
    { key: "rede", label: "Rede & IP" },
    { key: "periodos", label: "Períodos" },
    { key: "modos", label: "Modos de Registro" },
    { key: "areas", label: "Áreas Especiais" }
  ];

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          color: "var(--ink-500)",
          fontSize: 14
        }}
      >
        Carregando configurações…
      </div>
    );
  }

  if (!config || !periodos) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          gap: 12
        }}
      >
        <p style={{ color: "var(--red)", fontSize: 14 }}>
          ⚠️ Não foi possível carregar as configurações do sistema.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Cabeçalho */}
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
            <em>Configurações</em> do Sistema
          </h1>
        </div>
        <button className="btn btn-primary" onClick={salvarTudo} style={{ gap: 8 }}>
          {saved ? (
            <>
              <CheckCircleIcon size={16} /> Salvo!
            </>
          ) : (
            <>
              <SettingsIcon size={16} /> Salvar Configurações
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          background: "var(--cream-100)",
          borderRadius: "var(--radius-lg)",
          padding: 4,
          marginBottom: 20,
          flexWrap: "wrap"
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "9px 14px",
              borderRadius: "var(--radius-md)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 600,
              transition: "all 160ms",
              background: tab === t.key ? "#fff" : "transparent",
              color: tab === t.key ? "var(--burgundy-600)" : "var(--ink-500)",
              boxShadow: tab === t.key ? "0 1px 4px rgba(122,30,38,0.10)" : "none"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════ TAB: INSTITUIÇÃO ═══════ */}
      {tab === "institucional" && (
        <>
          <Secao titulo="Dados Institucionais" icon={<BuildingIcon size={18} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <Campo
                  label="Nome da Instituição"
                  value={config.nome}
                  onChange={(v: string) => upd("nome", v)}
                  placeholder="Conselho Federal de Odontologia"
                />
              </div>
              <Campo
                label="CNPJ"
                value={config.cnpj}
                onChange={(v: string) => upd("cnpj", v)}
                placeholder="00.000.000/0001-00"
                mono
              />
              <Campo
                label="Telefone"
                value={config.telefone}
                onChange={(v: string) => upd("telefone", v)}
                placeholder="(61) 3044-3400"
              />
              <div style={{ gridColumn: "1/-1" }}>
                <Campo
                  label="E-mail institucional"
                  value={config.email}
                  onChange={(v: string) => upd("email", v)}
                  placeholder="cfo@cfo.org.br"
                  type="email"
                />
              </div>
            </div>
          </Secao>

          <Secao titulo="Endereço" icon={<MapPinIcon size={18} />}>
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 14 }}>
              <Campo
                label="Logradouro"
                value={config.endereco}
                onChange={(v: string) => upd("endereco", v)}
                placeholder="SAUS Qd. 1 Bloco J"
              />
              <Campo
                label="Número"
                value={config.numero}
                onChange={(v: string) => upd("numero", v)}
                placeholder="S/N"
              />
              <div style={{ gridColumn: "1/-1" }}>
                <Campo
                  label="Bairro / Setor"
                  value={config.bairro}
                  onChange={(v: string) => upd("bairro", v)}
                  placeholder="Setor de Autarquias Sul"
                />
              </div>
              <Campo
                label="Cidade"
                value={config.cidade}
                onChange={(v: string) => upd("cidade", v)}
                placeholder="Brasília"
              />
              <Campo
                label="UF"
                value={config.uf}
                onChange={(v: string) => upd("uf", v)}
                placeholder="DF"
              />
              <Campo
                label="CEP"
                value={config.cep}
                onChange={(v: string) => upd("cep", v)}
                placeholder="70000-000"
                mono
              />
            </div>
          </Secao>

          <Secao titulo="Geolocalização & Perímetro" icon={<MapPinIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.6 }}>
              As coordenadas são preenchidas automaticamente a partir do endereço ou nome da
              instituição acima. Você também pode ajustar o marcador diretamente no mapa interativo.
            </p>

            {/* Botão de busca automática */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 14,
                alignItems: "flex-start",
                flexWrap: "wrap"
              }}
            >
              <button
                onClick={geocodificar}
                disabled={geocodingStatus === "loading"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "9px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--burgundy-600)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: geocodingStatus === "loading" ? "wait" : "pointer",
                  opacity: geocodingStatus === "loading" ? 0.7 : 1,
                  transition: "opacity 150ms"
                }}
              >
                <MapPinIcon size={15} />
                {geocodingStatus === "loading" ? "Buscando…" : "Buscar coordenadas pelo endereço"}
              </button>

              {/* Feedback */}
              {geocodingStatus === "ok" && (
                <div
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(47,125,79,0.08)",
                    border: "1px solid rgba(47,125,79,0.20)",
                    fontSize: 12.5,
                    color: "var(--green)",
                    lineHeight: 1.5
                  }}
                >
                  <strong>✓ Encontrado:</strong> {geocodingMsg}
                </div>
              )}
              {geocodingStatus === "erro" && (
                <div
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(200,57,63,0.06)",
                    border: "1px solid rgba(200,57,63,0.18)",
                    fontSize: 12.5,
                    color: "var(--red)",
                    lineHeight: 1.5
                  }}
                >
                  {geocodingMsg}
                </div>
              )}
            </div>

            {/* Coordenadas editáveis */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 14
              }}
            >
              <Campo
                label="Latitude"
                value={config.lat.toFixed(6)}
                onChange={(v: string) => upd("lat", parseFloat(v))}
                mono
              />
              <Campo
                label="Longitude"
                value={config.lng.toFixed(6)}
                onChange={(v: string) => upd("lng", parseFloat(v))}
                mono
              />
              <Campo
                label="Raio (metros)"
                value={String(config.raioMetros)}
                onChange={(v: string) => upd("raioMetros", parseInt(v))}
                mono
              />
            </div>

            {/* Preview + botão mapa */}
            <div
              style={{
                background: "var(--cream-50)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8
              }}
            >
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-700)" }}>
                  {config.cidade || "—"} — {config.uf || "—"}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--ink-500)",
                    marginTop: 2
                  }}
                >
                  {config.lat.toFixed(6)}, {config.lng.toFixed(6)} · raio {config.raioMetros} m
                </p>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setMapaAreaId(null);
                  setMapaModal(true);
                }}
                style={{ gap: 6, fontSize: 13, border: "1.5px solid rgba(122,30,38,0.22)" }}
              >
                <MapPinIcon size={14} />
                Ajustar no Mapa
              </button>
            </div>
          </Secao>
        </>
      )}

      {/* ═══════ TAB: REDE & IP ═══════ */}
      {tab === "rede" && (
        <>
          {/* IP público detectado */}
          <Secao titulo="IP Público desta Sessão" icon={<InfoIcon size={18} />}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div
                style={{
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--burgundy-600)",
                  letterSpacing: "0.04em"
                }}
              >
                {ipPublico}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--ink-500)", flex: 1, lineHeight: 1.6 }}>
                IP público detectado automaticamente. Use este valor como referência para configurar
                os provedores abaixo.
              </p>
            </div>
          </Secao>

          {/* Provedores */}
          <Secao titulo="Provedores de Internet" icon={<ShieldCheckIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}>
              Configure os IPs públicos dos provedores do CFO. O sistema verificará se o IP do
              computador pertence a um provedor cadastrado antes de permitir o registro de ponto
              desktop.
            </p>

            {/* Lista */}
            <div style={{ marginBottom: 16 }}>
              {provedores.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: p.ativo ? "rgba(47,125,79,0.05)" : "var(--cream-50)",
                    border: `1px solid ${p.ativo ? "rgba(47,125,79,0.15)" : "rgba(122,30,38,0.08)"}`,
                    borderRadius: "var(--radius-md)",
                    marginBottom: 8
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-900)" }}>
                        {p.nome}
                      </p>
                      {p.isPrincipal && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: "var(--burgundy-600)",
                            color: "#fff",
                            padding: "2px 7px",
                            borderRadius: "var(--radius-full)"
                          }}
                        >
                          PRINCIPAL
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12.5,
                        color: "var(--ink-500)",
                        marginTop: 2
                      }}
                    >
                      {p.ip}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: p.ativo ? "var(--green)" : "var(--gray-cfo)"
                    }}
                  >
                    {p.ativo ? "● Ativo" : "○ Inativo"}
                  </span>
                  <button
                    onClick={() => toggleProvedor(p.id)}
                    title={p.ativo ? "Desativar" : "Ativar"}
                    style={{
                      padding: 6,
                      border: "1px solid rgba(122,30,38,0.14)",
                      borderRadius: "var(--radius-sm)",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--ink-500)",
                      fontSize: 11
                    }}
                  >
                    {p.ativo ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => removeProvedor(p.id)}
                    style={{
                      padding: 6,
                      border: "1px solid rgba(200,57,63,0.20)",
                      borderRadius: "var(--radius-sm)",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--red)",
                      display: "flex"
                    }}
                  >
                    <Trash2Icon size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* Adicionar provedor */}
            <div
              style={{
                background: "var(--cream-50)",
                borderRadius: "var(--radius-md)",
                padding: "14px",
                border: "1px dashed rgba(122,30,38,0.20)"
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink-500)",
                  marginBottom: 10,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase"
                }}
              >
                Adicionar provedor redundante
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr",
                  gap: 10,
                  marginBottom: 10
                }}
              >
                <input
                  value={novoProvedor.nome}
                  onChange={(e) => setNovoProvedor((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome do provedor"
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    background: "#fff",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none"
                  }}
                />
                <input
                  value={novoProvedor.ip}
                  onChange={(e) => setNovoProvedor((p) => ({ ...p, ip: e.target.value }))}
                  placeholder="IP ex: 200.150.10.1"
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    background: "#fff",
                    fontSize: 13,
                    fontFamily: "var(--font-mono)",
                    outline: "none"
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "var(--ink-700)",
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={novoProvedor.isPrincipal}
                    onChange={(e) =>
                      setNovoProvedor((p) => ({ ...p, isPrincipal: e.target.checked }))
                    }
                    style={{ accentColor: "var(--burgundy-600)" }}
                  />
                  Marcar como principal
                </label>
                <button
                  className="btn btn-primary"
                  onClick={addProvedor}
                  style={{ gap: 6, fontSize: 13, padding: "7px 14px" }}
                >
                  <PlusIcon size={14} /> Adicionar
                </button>
              </div>
            </div>
          </Secao>

          {/* Subredes */}
          <Secao titulo="Subredes Configuradas (CIDR)" icon={<ShieldCheckIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}>
              Subredes da rede interna do CFO. O sistema valida se o computador ou celular (Wi-Fi)
              pertence a uma dessas subredes antes de permitir o registro de ponto.
            </p>

            <div style={{ marginBottom: 14 }}>
              {subredes.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: "rgba(30,74,122,0.04)",
                    border: "1px solid rgba(30,74,122,0.12)",
                    borderRadius: "var(--radius-md)",
                    marginBottom: 8
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--blue-ink)"
                      }}
                    >
                      {s.cidr}
                    </p>
                    {s.descricao && (
                      <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                        {s.descricao}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeSubrede(s.id)}
                    style={{
                      padding: 6,
                      border: "1px solid rgba(200,57,63,0.20)",
                      borderRadius: "var(--radius-sm)",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--red)",
                      display: "flex"
                    }}
                  >
                    <Trash2Icon size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div
              style={{
                background: "var(--cream-50)",
                borderRadius: "var(--radius-md)",
                padding: "14px",
                border: "1px dashed rgba(122,30,38,0.20)"
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink-500)",
                  marginBottom: 10,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase"
                }}
              >
                Adicionar subrede
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr",
                  gap: 10,
                  marginBottom: 10
                }}
              >
                <input
                  value={novaSubrede.cidr}
                  onChange={(e) => setNovaSubrede((s) => ({ ...s, cidr: e.target.value }))}
                  placeholder="Ex: 192.168.1.0/24"
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    background: "#fff",
                    fontSize: 13,
                    fontFamily: "var(--font-mono)",
                    outline: "none"
                  }}
                />
                <input
                  value={novaSubrede.descricao}
                  onChange={(e) => setNovaSubrede((s) => ({ ...s, descricao: e.target.value }))}
                  placeholder="Descrição (opcional)"
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    background: "#fff",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none"
                  }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={addSubrede}
                style={{ gap: 6, fontSize: 13, padding: "7px 14px" }}
              >
                <PlusIcon size={14} /> Adicionar Subrede
              </button>
            </div>
          </Secao>
        </>
      )}

      {/* ═══════ TAB: MODOS DE REGISTRO ═══════ */}
      {tab === "modos" && (
        <>
          {/* Desktop */}
          <Secao titulo="Computador (Desktop)" icon={<SettingsIcon size={18} />}>
            <Toggle
              value={config.modoDesktop}
              onChange={(v) => upd("modoDesktop", v)}
              label="Habilitar registro por computador"
              desc="Permite registrar o ponto via navegador desktop"
            />
            {config.modoDesktop && (
              <>
                <Toggle
                  value={config.desktopCheckSubrede}
                  onChange={(v) => upd("desktopCheckSubrede", v)}
                  label="Verificar IP do provedor"
                  desc="Compara o IP público do computador com os provedores cadastrados"
                />
                <Toggle
                  value={config.desktopCheckGeo}
                  onChange={(v) => upd("desktopCheckGeo", v)}
                  label="Verificar geolocalização (complementar)"
                  desc="Verifica se o computador está dentro do perímetro configurado. Exige permissão de localização."
                />
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "rgba(30,74,122,0.06)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12.5,
                    color: "var(--blue-ink)",
                    lineHeight: 1.6
                  }}
                >
                  <strong>Critérios de validação:</strong> IP provedor{" "}
                  {config.desktopCheckGeo && "+ Geolocalização"}. Sem exigência de fotografia para o
                  modo desktop.
                </div>
              </>
            )}
          </Secao>

          {/* Mobile */}
          <Secao titulo="Celular (Mobile)" icon={<SettingsIcon size={18} />}>
            <Toggle
              value={config.modoMobile}
              onChange={(v) => upd("modoMobile", v)}
              label="Habilitar registro por celular"
              desc="Permite registrar o ponto via aplicativo ou navegador mobile"
            />
            {config.modoMobile && (
              <>
                <Toggle
                  value={config.mobileCheckSubrede}
                  onChange={(v) => upd("mobileCheckSubrede", v)}
                  label="Verificar rede Wi-Fi (subrede)"
                  desc="Confere se o celular está conectado à rede Wi-Fi do CFO"
                />
                <Toggle
                  value={config.mobileCheckGeo}
                  onChange={(v) => upd("mobileCheckGeo", v)}
                  label="Verificar geolocalização (obrigatório para mobile)"
                  desc="O celular deve estar dentro do raio configurado na sede do CFO"
                />
                <Toggle
                  value={config.mobileExigirFoto}
                  onChange={(v) => upd("mobileExigirFoto", v)}
                  label="Exigir fotografia (biometria)"
                  desc="O funcionário deve se fotografar pela câmera frontal para confirmar o registro"
                />
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "rgba(47,125,79,0.07)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12.5,
                    color: "var(--green)",
                    lineHeight: 1.6
                  }}
                >
                  <strong>Critérios de validação:</strong> Geolocalização dentro do raio{" "}
                  {config.mobileCheckSubrede && "+ Wi-Fi/Subrede"}{" "}
                  {config.mobileExigirFoto && "+ Fotografia biométrica"}.
                </div>
              </>
            )}
          </Secao>

          {/* Híbrido */}
          <Secao titulo="Híbrido (Home Office)" icon={<SettingsIcon size={18} />}>
            <Toggle
              value={config.modoHibrido}
              onChange={(v) => upd("modoHibrido", v)}
              label="Habilitar modo híbrido"
              desc="Funcionários em regime híbrido registram o ponto de casa pelo celular"
            />
            {config.modoHibrido && (
              <>
                <Toggle
                  value={config.hibridoExigirFoto}
                  onChange={(v) => upd("hibridoExigirFoto", v)}
                  label="Exigir fotografia"
                  desc="Fotografia obrigatória para registro no modo híbrido"
                />
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "rgba(247,196,55,0.10)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12.5,
                    color: "#8a6a00",
                    lineHeight: 1.6
                  }}
                >
                  Cada funcionário deve ter o <strong>endereço residencial configurado</strong>{" "}
                  (Gestão → Funcionários). O registro é validado pela geolocalização do endereço de
                  cada um. Exclusivo por celular.
                </div>
                <div style={{ marginTop: 10 }}>
                  <a
                    href="/ponto/gestao"
                    style={{ fontSize: 13, color: "var(--burgundy-600)", fontWeight: 500 }}
                  >
                    → Gerenciar endereços residenciais dos funcionários
                  </a>
                </div>
              </>
            )}
          </Secao>

          {/* Viagem */}
          <Secao titulo="Viagem / Área Externa" icon={<MapPinIcon size={18} />}>
            <Toggle
              value={config.modoViagem}
              onChange={(v) => upd("modoViagem", v)}
              label="Habilitar modo viagem"
              desc="Permite registro em áreas externas pré-configuradas (outras cidades, eventos, etc.)"
            />
            {config.modoViagem && (
              <>
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "rgba(122,30,38,0.05)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12.5,
                    color: "var(--ink-700)",
                    lineHeight: 1.6
                  }}
                >
                  O funcionário pode registrar o ponto dentro das <strong>áreas de viagem</strong>{" "}
                  configuradas na aba "Áreas Especiais". Exclusivo por celular, com geolocalização e
                  fotografia obrigatória.
                </div>
                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 13 }}
                    onClick={() => setTab("areas")}
                  >
                    → Configurar áreas de viagem
                  </button>
                </div>
              </>
            )}
          </Secao>
        </>
      )}

      {/* ═══════ TAB: ÁREAS ESPECIAIS ═══════ */}
      {tab === "areas" && (
        <>
          <Secao titulo="Áreas de Viagem / Postos Externos" icon={<MapPinIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}>
              Configure áreas geográficas onde funcionários em viagem poderão registrar o ponto.
              Cada área tem um raio de cobertura configurável no mapa.
            </p>

            {/* Cards de áreas */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
                gap: 12,
                marginBottom: 16
              }}
            >
              {areas.map((a) => (
                <div
                  key={a.id}
                  style={{
                    background: a.ativa ? "#fff" : "var(--cream-50)",
                    border: `1px solid rgba(122,30,38,${a.ativa ? "0.10" : "0.05"})`,
                    borderRadius: "var(--radius-lg)",
                    padding: "16px 18px",
                    opacity: a.ativa ? 1 : 0.65
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 8
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
                        {a.nome}
                      </p>
                      {a.descricao && (
                        <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>
                          {a.descricao}
                        </p>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: a.ativa ? "var(--green)" : "var(--gray-cfo)",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        marginLeft: 8
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: a.ativa ? "var(--green)" : "var(--gray-cfo)",
                          display: "inline-block"
                        }}
                      />
                      {a.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      color: "var(--ink-500)",
                      marginBottom: 6
                    }}
                  >
                    {a.lat.toFixed(4)}, {a.lng.toFixed(4)} · {a.raioMetros}m
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      paddingTop: 10,
                      borderTop: "1px solid rgba(122,30,38,0.06)"
                    }}
                  >
                    <button
                      onClick={() => {
                        setMapaAreaId(a.id);
                        setMapaModal(true);
                      }}
                      title="Editar no mapa"
                      style={{
                        flex: 1,
                        padding: "6px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--ink-700)",
                        fontSize: 12,
                        fontWeight: 500,
                        fontFamily: "var(--font-body)"
                      }}
                    >
                      🗺 Editar no Mapa
                    </button>
                    <button
                      onClick={() => toggleArea(a.id)}
                      style={{
                        padding: 6,
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--ink-500)",
                        fontSize: 11
                      }}
                    >
                      {a.ativa ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => removeArea(a.id)}
                      style={{
                        padding: 6,
                        border: "1px solid rgba(200,57,63,0.20)",
                        borderRadius: "var(--radius-sm)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--red)",
                        display: "flex"
                      }}
                    >
                      <Trash2Icon size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Formulário nova área */}
            <div
              style={{
                background: "var(--cream-50)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
                border: "1px dashed rgba(122,30,38,0.22)"
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink-500)",
                  marginBottom: 12,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase"
                }}
              >
                Nova área de viagem
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr",
                  gap: 10,
                  marginBottom: 10
                }}
              >
                <input
                  value={novaArea.nome}
                  onChange={(e) => setNovaArea((a) => ({ ...a, nome: e.target.value }))}
                  placeholder="Nome ex: CRO-SP"
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    background: "#fff",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none"
                  }}
                />
                <input
                  value={novaArea.descricao}
                  onChange={(e) => setNovaArea((a) => ({ ...a, descricao: e.target.value }))}
                  placeholder="Descrição (opcional)"
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    background: "#fff",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none"
                  }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={addArea}
                disabled={!novaArea.nome}
                style={{
                  gap: 6,
                  fontSize: 13,
                  padding: "8px 16px",
                  opacity: novaArea.nome ? 1 : 0.5
                }}
              >
                <MapPinIcon size={14} />
                Definir no Mapa e Adicionar
              </button>
              <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 8 }}>
                Após clicar, um mapa interativo será aberto para você posicionar o marcador e
                definir o raio.
              </p>
            </div>
          </Secao>

          {/* Endereços residenciais */}
          <Secao titulo="Endereços Residenciais (Modo Híbrido)" icon={<UsersIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6, marginBottom: 14 }}>
              Para o modo híbrido, cada funcionário precisa ter seu endereço residencial cadastrado
              com as coordenadas geográficas e raio de cobertura. O registro de ponto home office
              será validado contra essa localização.
            </p>
            <div
              style={{
                background: "rgba(247,196,55,0.08)",
                border: "1px solid rgba(247,196,55,0.25)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                fontSize: 13,
                color: "#8a6a00",
                lineHeight: 1.6
              }}
            >
              <strong>Como configurar:</strong> Acesse{" "}
              <a href="/ponto/gestao" style={{ color: "var(--burgundy-600)", fontWeight: 500 }}>
                Gestão de Funcionários
              </a>
              , selecione o funcionário e edite seu endereço residencial. O sistema geocodificará
              automaticamente o CEP e permitirá ajuste fino no mapa.
            </div>
          </Secao>
        </>
      )}

      {/* ═══════ TAB: PERÍODOS ═══════ */}
      {tab === "periodos" && (
        <>
          {/* ── Jornada Padrão ── */}
          <Secao titulo="Jornada de Trabalho" icon={<SettingsIcon size={18} />}>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}
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
                  Hora de Entrada
                </label>
                <input
                  type="time"
                  value={periodos.horaEntrada}
                  onChange={(e) => setPeriodos((p) => ({ ...p, horaEntrada: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
              </div>
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
                  Hora de Saída
                </label>
                <input
                  type="time"
                  value={periodos.horaSaida}
                  onChange={(e) => setPeriodos((p) => ({ ...p, horaSaida: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
              </div>
            </div>

            {/* Dias úteis */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--ink-500)",
                  display: "block",
                  marginBottom: 8
                }}
              >
                Dias Úteis
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia, i) => (
                  <button
                    key={dia}
                    onClick={() =>
                      setPeriodos((p) => {
                        const d = [...p.diasUteis];
                        d[i] = !d[i];
                        return { ...p, diasUteis: d };
                      })
                    }
                    style={{
                      padding: "7px 12px",
                      borderRadius: "var(--radius-md)",
                      border: `2px solid ${periodos.diasUteis[i] ? "var(--burgundy-600)" : "rgba(122,30,38,0.14)"}`,
                      background: periodos.diasUteis[i] ? "rgba(122,30,38,0.08)" : "transparent",
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: periodos.diasUteis[i] ? "var(--burgundy-600)" : "var(--ink-500)",
                      cursor: "pointer",
                      transition: "all 140ms"
                    }}
                  >
                    {dia}
                  </button>
                ))}
              </div>
            </div>

            {/* Resumo da jornada */}
            <div
              style={{
                background: "var(--cream-50)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                display: "flex",
                gap: 20,
                flexWrap: "wrap"
              }}
            >
              {[
                {
                  label: "Jornada Diária",
                  value: `${Math.floor(periodos.jornadaDiariaMin / 60)}h${String(periodos.jornadaDiariaMin % 60).padStart(2, "0")}min`
                },
                {
                  label: "Jornada Semanal",
                  value: `${Math.floor(periodos.jornadaSemanalMin / 60)}h`
                },
                {
                  label: "Dias úteis/semana",
                  value: `${periodos.diasUteis.filter(Boolean).length} dias`
                }
              ].map((s) => (
                <div key={s.label}>
                  <p
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "var(--ink-500)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em"
                    }}
                  >
                    {s.label}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--burgundy-600)",
                      marginTop: 2
                    }}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </Secao>

          {/* ── Flexibilidade ── */}
          <Secao titulo="Flexibilidade de Horário" icon={<InfoIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}>
              Define a tolerância permitida para atrasos e saídas antecipadas sem comprometer a
              jornada. Registros dentro da tolerância são tratados como horário regular.
            </p>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}
            >
              {/* Tolerância de entrada — atraso ignorado */}
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
                  Tolerância de Entrada (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={periodos.toleranciaEntradaMin}
                  onChange={(e) =>
                    setPeriodos((p) => ({ ...p, toleranciaEntradaMin: +e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
                <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                  Atraso até este limite <strong>não é registrado como falta</strong>. Ex: 15 min →
                  entrada até 08:15 é OK
                </p>
              </div>
              {/* Tolerância de saída antecipada */}
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
                  Tolerância de Saída Antecipada (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={periodos.toleranciaSaidaMin}
                  onChange={(e) =>
                    setPeriodos((p) => ({ ...p, toleranciaSaidaMin: +e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
                <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                  Saída antecipada até este limite <strong>não é registrada como falta</strong>. Ex:
                  15 min → saída a partir das 16:45 é OK
                </p>
              </div>
              {/* Tolerância de hora extra — permanência ignorada */}
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
                  Tolerância de Hora Extra (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={periodos.toleranciaHoraExtraMin}
                  onChange={(e) =>
                    setPeriodos((p) => ({ ...p, toleranciaHoraExtraMin: +e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
                <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                  Permanência além do horário até este limite{" "}
                  <strong>não é computada como hora extra</strong>. Ex: 10 min → saída até 17:10 não
                  gera crédito
                </p>
              </div>
              {/* Margem geral do cálculo diário */}
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
                  Margem do Cálculo Diário (min)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={periodos.toleranciaCalculoMin}
                  onChange={(e) =>
                    setPeriodos((p) => ({ ...p, toleranciaCalculoMin: +e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
                <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>
                  Se o total trabalhado difere da jornada em até ±N min, o dia é considerado{" "}
                  <strong>completo</strong> (sem saldo positivo ou negativo)
                </p>
              </div>
            </div>

            {/* Resumo visual das tolerâncias */}
            <div
              style={{
                background: "rgba(122,30,38,0.04)",
                border: "1px solid rgba(122,30,38,0.10)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px"
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--burgundy-600)",
                  marginBottom: 8,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase"
                }}
              >
                Resumo da jornada com tolerâncias
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
                {[
                  {
                    label: `Entrada`,
                    hora: periodos.horaEntrada,
                    tol: `±${periodos.toleranciaEntradaMin}min`,
                    cor: "var(--green)"
                  },
                  { sep: "→ trabalho →" },
                  {
                    label: `Almoço`,
                    hora: periodos.almocoPodeIniciarA,
                    tol: `${periodos.almocoMinMin}–${periodos.almocoMaxMin}min`,
                    cor: "#8a6a00"
                  },
                  { sep: "→ trabalho →" },
                  {
                    label: `Saída`,
                    hora: periodos.horaSaida,
                    tol: `±${periodos.toleranciaSaidaMin}min / extra≤${periodos.toleranciaHoraExtraMin}min`,
                    cor: "var(--red)"
                  }
                ].map(
                  (
                    item: {
                      label?: string;
                      hora?: string;
                      tol?: string;
                      cor?: string;
                      sep?: string;
                    },
                    i
                  ) =>
                    item.sep ? (
                      <span
                        key={i}
                        style={{ fontSize: 11, color: "var(--ink-500)", margin: "0 6px" }}
                      >
                        {item.sep}
                      </span>
                    ) : (
                      <span
                        key={i}
                        style={{
                          display: "inline-flex",
                          flexDirection: "column",
                          alignItems: "center",
                          padding: "4px 8px",
                          borderRadius: "var(--radius-sm)",
                          background: "#fff",
                          border: `1px solid ${item.cor}40`
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 13,
                            fontWeight: 700,
                            color: item.cor
                          }}
                        >
                          {item.hora}
                        </span>
                        <span style={{ fontSize: 9.5, color: "var(--ink-500)" }}>{item.tol}</span>
                        <span style={{ fontSize: 9, color: "var(--ink-500)" }}>{item.label}</span>
                      </span>
                    )
                )}
              </div>
            </div>

            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--ink-500)",
                  display: "block",
                  marginBottom: 8
                }}
              >
                Tipo de Controle
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(
                  [
                    ["FIXO", "Fixo", "Horário rígido com tolerância definida"],
                    [
                      "ELASTICO",
                      "Elástico",
                      "Entrada variável, mas total de horas deve ser cumprido"
                    ],
                    ["BANCO_HORAS", "Banco de Horas", "Saldo de horas acumulado e compensado"]
                  ] as const
                ).map(([v, l, d]) => (
                  <button
                    key={v}
                    onClick={() => setPeriodos((p) => ({ ...p, tipoFlexibilidade: v }))}
                    style={{
                      flex: 1,
                      minWidth: 100,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      border: `2px solid ${periodos.tipoFlexibilidade === v ? "var(--burgundy-600)" : "rgba(122,30,38,0.12)"}`,
                      background:
                        periodos.tipoFlexibilidade === v ? "rgba(122,30,38,0.06)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left" as const
                    }}
                  >
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color:
                          periodos.tipoFlexibilidade === v
                            ? "var(--burgundy-600)"
                            : "var(--ink-700)",
                        marginBottom: 2
                      }}
                    >
                      {l}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--ink-500)", lineHeight: 1.4 }}>{d}</p>
                  </button>
                ))}
              </div>
            </div>

            {periodos.tipoFlexibilidade === "BANCO_HORAS" && (
              <div
                style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
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
                    Limite do Banco (horas)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={Math.floor(periodos.bancoHorasLimiteMin / 60)}
                    onChange={(e) =>
                      setPeriodos((p) => ({ ...p, bancoHorasLimiteMin: +e.target.value * 60 }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
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
                    Vigência (dias)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={periodos.bancoHorasVigenciaDias}
                    onChange={(e) =>
                      setPeriodos((p) => ({ ...p, bancoHorasVigenciaDias: +e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "9px 11px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      boxSizing: "border-box" as const
                    }}
                  />
                </div>
              </div>
            )}
          </Secao>

          {/* ── Intervalo do Almoço ── */}
          <Secao titulo="Intervalo do Almoço" icon={<InfoIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}>
              Define a janela de horário permitida para o início do almoço e os limites de duração
              (mínimo e máximo). O sistema valida se o intervalo está dentro desse range.
            </p>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}
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
                  Início Permitido A Partir De
                </label>
                <input
                  type="time"
                  value={periodos.almocoPodeIniciarA}
                  onChange={(e) =>
                    setPeriodos((p) => ({ ...p, almocoPodeIniciarA: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
              </div>
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
                  Início Permitido Até
                </label>
                <input
                  type="time"
                  value={periodos.almocoPodeIniciarAte}
                  onChange={(e) =>
                    setPeriodos((p) => ({ ...p, almocoPodeIniciarAte: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
              </div>
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
                  Duração Mínima (min)
                </label>
                <input
                  type="number"
                  min={30}
                  max={120}
                  value={periodos.almocoMinMin}
                  onChange={(e) => setPeriodos((p) => ({ ...p, almocoMinMin: +e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
              </div>
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
                  Duração Máxima (min)
                </label>
                <input
                  type="number"
                  min={30}
                  max={180}
                  value={periodos.almocoMaxMin}
                  onChange={(e) => setPeriodos((p) => ({ ...p, almocoMaxMin: +e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
              </div>
            </div>
            <div
              style={{
                background: "var(--cream-50)",
                borderRadius: "var(--radius-md)",
                padding: "10px 14px",
                fontSize: 12.5,
                color: "var(--ink-700)"
              }}
            >
              📌 Almoço permitido entre <strong>{periodos.almocoPodeIniciarA}</strong> e{" "}
              <strong>{periodos.almocoPodeIniciarAte}</strong>, duração de{" "}
              <strong>
                {periodos.almocoMinMin}–{periodos.almocoMaxMin} min
              </strong>
            </div>
          </Secao>

          {/* ── Modo Híbrido ── */}
          <Secao titulo="Parâmetros do Modo Híbrido" icon={<UsersIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.6 }}>
              Configurações específicas para funcionários em regime de trabalho híbrido (home office
              parcial).
            </p>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}
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
                  Máximo de dias/semana em casa
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={periodos.hibridoMaxDiasSemana}
                  onChange={(e) =>
                    setPeriodos((p) => ({ ...p, hibridoMaxDiasSemana: +e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "9px 11px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 14,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box" as const
                  }}
                />
              </div>
            </div>
            <Toggle
              value={periodos.hibridoExigeAprovacao}
              onChange={(v) => setPeriodos((p) => ({ ...p, hibridoExigeAprovacao: v }))}
              label="Exigir aprovação prévia do gestor"
              desc="O funcionário deve ter o dia híbrido aprovado antes de registrar o ponto de casa"
            />
          </Secao>

          {/* ── Modo Viagem ── */}
          <Secao titulo="Parâmetros do Modo Viagem" icon={<MapPinIcon size={18} />}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.6 }}>
              Define a janela de flexibilidade de horário para registro de ponto em áreas de viagem
              externas. O funcionário pode registrar dentro desse intervalo em relação ao horário
              padrão.
            </p>
            <div style={{ marginBottom: 14 }}>
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
                Janela de flexibilidade (minutos)
              </label>
              <input
                type="number"
                min={0}
                max={480}
                value={periodos.viagemJanelaMinutos}
                onChange={(e) =>
                  setPeriodos((p) => ({ ...p, viagemJanelaMinutos: +e.target.value }))
                }
                style={{
                  width: "100%",
                  maxWidth: 200,
                  padding: "9px 11px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.14)",
                  fontSize: 14,
                  fontFamily: "var(--font-mono)",
                  boxSizing: "border-box" as const
                }}
              />
              <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 5 }}>
                Ex: 120 min → entrada entre 06:00 e 10:00 (±2h do horário padrão 08:00) é aceita.
              </p>
            </div>
            <Toggle
              value={periodos.viagemExigeAprovacao}
              onChange={(v) => setPeriodos((p) => ({ ...p, viagemExigeAprovacao: v }))}
              label="Exigir aprovação prévia de viagem"
              desc="O gestor deve autorizar o modo viagem antes do registro ser aceito"
            />
          </Secao>
        </>
      )}

      {/* Modal de mapa */}
      {mapaModal && (
        <MapModal
          lat={
            mapaAreaId && !mapaAreaId.startsWith("NEW:")
              ? (areas.find((a) => a.id === mapaAreaId)?.lat ?? config.lat)
              : config.lat
          }
          lng={
            mapaAreaId && !mapaAreaId.startsWith("NEW:")
              ? (areas.find((a) => a.id === mapaAreaId)?.lng ?? config.lng)
              : config.lng
          }
          raio={
            mapaAreaId && !mapaAreaId.startsWith("NEW:")
              ? (areas.find((a) => a.id === mapaAreaId)?.raioMetros ?? config.raioMetros)
              : config.raioMetros
          }
          titulo={mapaAreaId === null ? "Localização da Sede CFO" : "Área de Viagem"}
          onConfirm={onMapaConfirm}
          onClose={() => setMapaModal(false)}
        />
      )}
    </div>
  );
}

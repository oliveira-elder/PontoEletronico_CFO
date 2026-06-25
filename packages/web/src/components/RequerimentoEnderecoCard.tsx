import React, { useState } from "react";
import { api } from "../hooks/useApi";
import { useAuth } from "../auth/AuthContext";
import { MapPinIcon } from "./icons";
import { MapModal } from "./MapModal";
import { geocodificarEndereco } from "../utils/geocode";

interface Props {
  onRespondido?: () => void;
}

export function RequerimentoEnderecoCard({ onRespondido }: Props) {
  const { token } = useAuth();

  const [form, setForm] = useState({
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: ""
  });
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [mapaAberto, setMapaAberto] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((f) => ({
          ...f,
          cep: data.cep ?? cep,
          logradouro: data.logradouro ?? "",
          bairro: data.bairro ?? "",
          cidade: data.localidade ?? "",
          uf: data.uf ?? ""
        }));
      }
    } catch {
      /* silencioso */
    } finally {
      setCepLoading(false);
    }
  }

  async function abrirMapa() {
    if (!lat || !lng) {
      const result = await geocodificarEndereco({
        logradouro: form.logradouro,
        numero: form.numero,
        bairro: form.bairro,
        cidade: form.cidade,
        uf: form.uf,
        cep: form.cep
      });
      if (result) {
        setLat(result.lat);
        setLng(result.lng);
      }
    }
    setMapaAberto(true);
  }

  async function enviar() {
    if (!form.logradouro.trim()) {
      setErro("Preencha ao menos o logradouro.");
      return;
    }
    setErro("");
    setEnviando(true);
    const tk = token();
    try {
      await api.post(
        "/ponto/requerimento-endereco/responder",
        { ...form, lat, lng },
        tk ?? undefined
      );
      onRespondido?.();
    } catch (e: unknown) {
      setErro((e as Error).message ?? "Erro ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "var(--radius-md)",
    border: "1px solid rgba(122,30,38,0.14)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "var(--font-body)"
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--ink-500)",
    display: "block",
    marginBottom: 4
  };

  return (
    <>
      <div
        style={{
          borderRadius: "var(--radius-lg)",
          border: "2px solid rgba(122,30,38,0.25)",
          background: "#fff",
          overflow: "hidden",
          marginBottom: 16
        }}
      >
        {/* Cabeçalho */}
        <div style={{ background: "var(--burgundy-600)", padding: "14px 18px" }}>
          <p
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
          >
            <MapPinIcon size={16} /> O RH solicita seu endereço residencial
          </p>
          <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 12, marginTop: 4 }}>
            Necessário para habilitar o registro de ponto em Home Office ou Híbrido.
          </p>
        </div>

        {/* Formulário */}
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* CEP */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <div>
              <label style={labelStyle}>CEP</label>
              <input
                type="text"
                value={form.cep}
                placeholder="00000-000"
                onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))}
                onBlur={(e) => void buscarCep(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={() => void buscarCep(form.cep)}
                disabled={cepLoading}
                style={{
                  padding: "8px 12px",
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
                {cepLoading ? "…" : "Buscar"}
              </button>
            </div>
          </div>

          {/* Logradouro + Número */}
          <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 8 }}>
            {(
              [
                ["logradouro", "Logradouro", "Rua, Av…"],
                ["numero", "Nº", "S/N"]
              ] as const
            ).map(([k, l, ph]) => (
              <div key={k}>
                <label style={labelStyle}>{l}</label>
                <input
                  type="text"
                  value={form[k]}
                  placeholder={ph}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          {/* Complemento */}
          <div>
            <label style={labelStyle}>Complemento</label>
            <input
              type="text"
              value={form.complemento}
              placeholder="Apto, Bloco…"
              onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Bairro / Cidade / UF */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 8 }}>
            {(
              [
                ["bairro", "Bairro", ""],
                ["cidade", "Cidade", ""],
                ["uf", "UF", "DF"]
              ] as const
            ).map(([k, l, ph]) => (
              <div key={k}>
                <label style={labelStyle}>{l}</label>
                <input
                  type="text"
                  value={form[k]}
                  placeholder={ph}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          {/* Localização no mapa */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8
            }}
          >
            <button
              onClick={() => void abrirMapa()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: "var(--radius-md)",
                border: "1.5px solid rgba(122,30,38,0.22)",
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink-700)"
              }}
            >
              <MapPinIcon size={14} />
              {lat ? "Ajustar Pin no Mapa" : "Definir Localização no Mapa"}
            </button>
            {lat && lng ? (
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--green)" }}>
                {lat.toFixed(5).replace(",", ".")}, {lng.toFixed(5).replace(",", ".")}
              </span>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                Sem localização — opcional, mas recomendado
              </span>
            )}
          </div>

          {erro && <p style={{ fontSize: 12, color: "var(--red)", margin: 0 }}>{erro}</p>}

          <button
            onClick={() => void enviar()}
            disabled={enviando || !form.logradouro.trim()}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background:
                enviando || !form.logradouro.trim()
                  ? "rgba(122,30,38,0.25)"
                  : "var(--burgundy-600)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: enviando || !form.logradouro.trim() ? "not-allowed" : "pointer"
            }}
          >
            {enviando ? "Enviando…" : "Confirmar Endereço"}
          </button>
        </div>
      </div>

      {mapaAberto && (
        <MapModal
          lat={lat ?? -15.7876}
          lng={lng ?? -47.904}
          raio={20}
          titulo="Minha Localização Residencial"
          hideRaio
          onConfirm={(r) => {
            setLat(r.lat);
            setLng(r.lng);
            setMapaAberto(false);
          }}
          onClose={() => setMapaAberto(false)}
        />
      )}
    </>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { XIcon } from "./icons";

interface LeafletLayer {
  addTo(map: LeafletMap): LeafletLayer;
  on(event: string, handler: (e: LeafletEvent) => void): void;
  setLatLng(ll: [number, number]): void;
  setRadius(r: number): void;
  getLatLng(): { lat: number; lng: number };
  remove(): void;
}
interface LeafletMap {
  setView(ll: [number, number], zoom?: number): LeafletMap;
  on(event: string, handler: (e: LeafletEvent) => void): void;
  remove(): void;
}
interface LeafletStatic {
  map(el: HTMLDivElement, opts: object): LeafletMap;
  tileLayer(url: string, opts: object): LeafletLayer;
  divIcon(opts: object): object;
  marker(ll: [number, number], opts: object): LeafletLayer;
  circle(ll: [number, number], opts: object): LeafletLayer;
}
interface LeafletEvent {
  target: { getLatLng(): { lat: number; lng: number } };
  latlng: { lat: number; lng: number };
}
declare const L: LeafletStatic;

export interface MapResult {
  lat: number;
  lng: number;
  raio: number;
  endereco?: string;
}

interface Props {
  lat: number;
  lng: number;
  raio: number;
  titulo?: string;
  minRaio?: number;
  maxRaio?: number;
  hideRaio?: boolean;
  onConfirm: (r: MapResult) => void;
  onClose: () => void;
}

async function nominatimSearch(
  q: string
): Promise<{ lat: number; lng: number; nome: string } | null> {
  const headers = { "Accept-Language": "pt-BR", Accept: "application/json" };

  /* Tenta detectar número no início ou fim da query para usar busca estruturada */
  const matchInicio = q.match(/^(\d+[A-Za-z]?)[,\s]+(.+)/);
  const matchFim = q.match(/^(.+?)[,\s]+(\d+[A-Za-z]?)$/);

  const candidatos: string[] = [];

  if (matchInicio) {
    const [, num, rua] = matchInicio;
    const street = `${num} ${rua.split(",")[0].trim()}`;
    const resto = rua.includes(",") ? rua.substring(rua.indexOf(",") + 1).trim() : "";
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("format", "json");
    u.searchParams.set("limit", "1");
    u.searchParams.set("countrycodes", "br");
    u.searchParams.set("addressdetails", "1");
    u.searchParams.set("street", street);
    if (resto) u.searchParams.set("city", resto.split(",")[0].trim());
    candidatos.push(u.toString());
  } else if (matchFim) {
    const [, rua, num] = matchFim;
    const partes = rua.split(",");
    const street = `${num} ${partes[0].trim()}`;
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("format", "json");
    u.searchParams.set("limit", "1");
    u.searchParams.set("countrycodes", "br");
    u.searchParams.set("addressdetails", "1");
    u.searchParams.set("street", street);
    if (partes[1]) u.searchParams.set("city", partes[1].trim());
    candidatos.push(u.toString());
  }

  /* Sempre inclui busca livre como fallback */
  candidatos.push(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br&addressdetails=0`
  );
  if (!q.toLowerCase().includes("brasil"))
    candidatos.push(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ", Brasil")}&format=json&limit=1&countrycodes=br&addressdetails=0`
    );

  for (const url of candidatos) {
    try {
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data?.length)
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          nome: data[0].display_name ?? q
        };
    } catch {
      /* próxima */
    }
  }
  return null;
}

export function MapModal({
  lat,
  lng,
  raio,
  titulo = "Configurar Localização",
  minRaio = 10,
  maxRaio = 2000,
  hideRaio = false,
  onConfirm,
  onClose
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletLayer | null>(null);
  const circleRef = useRef<LeafletLayer | null>(null);

  const [pos, setPos] = useState({ lat, lng });
  const [raioM, setRaioM] = useState(Math.max(raio, minRaio));
  const [geocoding, setGeocoding] = useState(false);
  const [enderecoDetect, setEnderecoDetect] = useState("");
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [buscaErro, setBuscaErro] = useState(false);

  /* Geocodificação reversa */
  async function reverseGeocode(la: number, ln: number) {
    setGeocoding(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${la}&lon=${ln}&format=json`,
        { headers: { "Accept-Language": "pt-BR" } }
      );
      const data = await r.json();
      setEnderecoDetect(data.display_name ?? "");
    } catch {
      /* silencioso */
    }
    setGeocoding(false);
  }

  /* Mover mapa + marcador para uma posição */
  function moverPara(la: number, ln: number) {
    markerRef.current?.setLatLng([la, ln]);
    circleRef.current?.setLatLng([la, ln]);
    leafletRef.current?.setView([la, ln], 18);
    setPos({ lat: la, lng: ln });
    reverseGeocode(la, ln);
  }

  /* Busca por endereço */
  async function buscarEndereco(e?: React.FormEvent) {
    e?.preventDefault();
    const q = busca.trim();
    if (!q) return;
    setBuscando(true);
    setBuscaErro(false);

    /* Tenta o texto digitado, depois acrescenta "Brasil" se não encontrar */
    let resultado = await nominatimSearch(q);
    if (!resultado && !q.toLowerCase().includes("brasil")) {
      resultado = await nominatimSearch(`${q}, Brasil`);
    }

    if (resultado) {
      moverPara(resultado.lat, resultado.lng);
    } else {
      setBuscaErro(true);
    }
    setBuscando(false);
  }

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: `<div style="width:32px;height:32px;background:#7a1e26;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
    const circle = L.circle([lat, lng], {
      radius: Math.max(raio, minRaio),
      color: "#7a1e26",
      fillColor: "#7a1e26",
      fillOpacity: 0.12,
      weight: 2
    }).addTo(map);

    marker.on("dragend", (e: LeafletEvent) => {
      const { lat: la, lng: ln } = e.target.getLatLng();
      circle.setLatLng([la, ln]);
      setPos({ lat: la, lng: ln });
      reverseGeocode(la, ln);
    });

    map.on("click", (e: LeafletEvent) => {
      const { lat: la, lng: ln } = e.latlng;
      marker.setLatLng([la, ln]);
      circle.setLatLng([la, ln]);
      setPos({ lat: la, lng: ln });
      reverseGeocode(la, ln);
    });

    leafletRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    reverseGeocode(lat, lng);

    return () => {
      map.remove();
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(raioM);
  }, [raioM]);

  function handleConfirm() {
    onConfirm({ lat: pos.lat, lng: pos.lng, raio: raioM, endereco: enderecoDetect });
    onClose();
  }

  const raioStep = minRaio <= 20 ? 5 : 25;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.5)", zIndex: 100 }}
      />

      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(760px,96vw)",
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          zIndex: 101,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(10,5,6,0.28)",
          maxHeight: "92vh"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid rgba(122,30,38,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "var(--gold-500)",
                marginBottom: 2
              }}
            >
              Localização
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 18,
                color: "var(--burgundy-600)",
                fontWeight: 400
              }}
            >
              {titulo}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--ink-500)"
            }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Barra de busca por endereço */}
        <form
          onSubmit={(e) => void buscarEndereco(e)}
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(122,30,38,0.06)",
            display: "flex",
            gap: 8,
            flexShrink: 0,
            background: "var(--cream-50)"
          }}
        >
          <input
            type="text"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setBuscaErro(false);
            }}
            placeholder="Buscar endereço no mapa… ex: SAUS Qd. 1 Bloco J, Brasília"
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${buscaErro ? "var(--red)" : "rgba(122,30,38,0.16)"}`,
              fontSize: 13,
              fontFamily: "var(--font-body)",
              outline: "none",
              background: "#fff"
            }}
          />
          <button
            type="submit"
            disabled={buscando || !busca.trim()}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "var(--burgundy-600)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: buscando || !busca.trim() ? "not-allowed" : "pointer",
              opacity: buscando || !busca.trim() ? 0.6 : 1,
              whiteSpace: "nowrap",
              fontFamily: "var(--font-body)"
            }}
          >
            {buscando ? "…" : "Buscar"}
          </button>
        </form>
        {buscaErro && (
          <p
            style={{
              margin: "0",
              padding: "6px 16px",
              fontSize: 11.5,
              color: "var(--red)",
              background: "rgba(200,57,63,0.05)",
              borderBottom: "1px solid rgba(200,57,63,0.12)",
              flexShrink: 0
            }}
          >
            Endereço não encontrado. Tente um texto mais específico ou clique diretamente no mapa.
          </p>
        )}

        {/* Mapa */}
        <div ref={mapRef} style={{ flex: 1, minHeight: 320 }} />

        {/* Controles */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid rgba(122,30,38,0.08)",
            flexShrink: 0,
            background: "var(--cream-50)"
          }}
        >
          <p style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 10, minHeight: 16 }}>
            {geocoding
              ? "📍 Detectando endereço…"
              : enderecoDetect
                ? `📍 ${enderecoDetect}`
                : "Clique no mapa ou arraste o marcador para ajustar a posição."}
          </p>

          {/* Coordenadas — type="text" para evitar separador decimal por locale do browser */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {(
              [
                ["Latitude", "lat"],
                ["Longitude", "lng"]
              ] as const
            ).map(([label, key]) => (
              <div key={key} style={{ flex: 1, minWidth: 130 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 4
                  }}
                >
                  {label}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pos[key].toFixed(6).replace(",", ".")}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value.replace(",", "."));
                    if (!isNaN(v)) {
                      const newPos = { ...pos, [key]: v };
                      setPos(newPos);
                      markerRef.current?.setLatLng([newPos.lat, newPos.lng]);
                      circleRef.current?.setLatLng([newPos.lat, newPos.lng]);
                      leafletRef.current?.setView([newPos.lat, newPos.lng]);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(122,30,38,0.14)",
                    fontSize: 13,
                    fontFamily: "var(--font-mono)",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            ))}
          </div>

          {/* Raio */}
          {!hideRaio && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)"
                  }}
                >
                  Raio de cobertura
                </label>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--burgundy-600)"
                  }}
                >
                  {raioM} m
                </span>
              </div>
              <input
                type="range"
                min={minRaio}
                max={maxRaio}
                step={raioStep}
                value={raioM}
                onChange={(e) => setRaioM(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--burgundy-600)" }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: "var(--ink-500)",
                  marginTop: 2
                }}
              >
                <span>{minRaio} m</span>
                <span>{Math.round(maxRaio / 4)} m</span>
                <span>{Math.round(maxRaio / 2)} m</span>
                <span>{maxRaio >= 1000 ? `${maxRaio / 1000} km` : `${maxRaio} m`}</span>
              </div>
            </div>
          )}

          {/* Ações */}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleConfirm} style={{ flex: 2 }}>
              Confirmar Localização
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { XIcon } from "./icons";

interface LeafletObj {
  map(el: HTMLDivElement, opts: object): LeafletObj;
  tileLayer(url: string, opts: object): LeafletObj;
  addTo(map: LeafletObj): LeafletObj;
  divIcon(opts: object): LeafletObj;
  marker(ll: [number, number], opts: object): LeafletObj;
  circle(ll: [number, number], opts: object): LeafletObj;
  on(event: string, handler: (e: LeafletEvent) => void): void;
  setView(ll: [number, number], zoom?: number): void;
  remove(): void;
  setLatLng(ll: [number, number]): void;
  setRadius(r: number): void;
  getLatLng(): { lat: number; lng: number };
}
interface LeafletEvent {
  target: { getLatLng(): { lat: number; lng: number } };
  latlng: { lat: number; lng: number };
}
declare const L: LeafletObj;

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
  onConfirm: (r: MapResult) => void;
  onClose: () => void;
}

export function MapModal({
  lat,
  lng,
  raio,
  titulo = "Configurar Localização",
  onConfirm,
  onClose
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletObj | null>(null);
  const markerRef = useRef<LeafletObj | null>(null);
  const circleRef = useRef<LeafletObj | null>(null);

  const [pos, setPos] = useState({ lat, lng });
  const [raioM, setRaioM] = useState(raio);
  const [geocoding, setGeocoding] = useState(false);
  const [enderecoDetect, setEnderecoDetect] = useState("");

  /* Geocodificação reversa via Nominatim (OpenStreetMap) */
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

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    /* Ícone personalizado */
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:32px;height:32px;background:#7a1e26;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
    const circle = L.circle([lat, lng], {
      radius: raio,
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

  /* Atualiza raio do círculo quando slider muda */
  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(raioM);
  }, [raioM]);

  function handleConfirm() {
    onConfirm({ lat: pos.lat, lng: pos.lng, raio: raioM, endereco: enderecoDetect });
    onClose();
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.5)", zIndex: 100 }}
      />

      {/* Modal */}
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
            padding: "16px 20px",
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

        {/* Mapa */}
        <div ref={mapRef} style={{ flex: 1, minHeight: 380 }} />

        {/* Controles */}
        <div
          style={{
            padding: "16px 20px",
            borderTop: "1px solid rgba(122,30,38,0.08)",
            flexShrink: 0,
            background: "var(--cream-50)"
          }}
        >
          {/* Endereço detectado */}
          <p style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 12, minHeight: 16 }}>
            {geocoding
              ? "📍 Detectando endereço…"
              : enderecoDetect
                ? `📍 ${enderecoDetect}`
                : "Clique ou arraste o marcador para ajustar a posição."}
          </p>

          {/* Coordenadas */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
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
                Latitude
              </label>
              <input
                type="number"
                step="0.000001"
                value={pos.lat.toFixed(6)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) {
                    setPos((p) => ({ ...p, lat: v }));
                    markerRef.current?.setLatLng([v, pos.lng]);
                    circleRef.current?.setLatLng([v, pos.lng]);
                    leafletRef.current?.setView([v, pos.lng]);
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
            <div style={{ flex: 1, minWidth: 140 }}>
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
                Longitude
              </label>
              <input
                type="number"
                step="0.000001"
                value={pos.lng.toFixed(6)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) {
                    setPos((p) => ({ ...p, lng: v }));
                    markerRef.current?.setLatLng([pos.lat, v]);
                    circleRef.current?.setLatLng([pos.lat, v]);
                    leafletRef.current?.setView([pos.lat, v]);
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
          </div>

          {/* Raio */}
          <div style={{ marginBottom: 16 }}>
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
              min={50}
              max={2000}
              step={25}
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
              <span>50 m</span>
              <span>500 m</span>
              <span>1 km</span>
              <span>2 km</span>
            </div>
          </div>

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

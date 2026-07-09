import { useEffect, useRef, useState } from "react";
import type { SistemaConfig } from "../hooks/usePontoRegistration";
import { isSafariIOS, mensagemErroWatchSafari, opcoesWatchSafari } from "../utils/geolocation";
import "leaflet/dist/leaflet.css";
import type L from "leaflet";

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const r = (x: number) => (x * Math.PI) / 180;
  const dL = r(lat2 - lat1);
  const dG = r(lng2 - lng1);
  const a = Math.sin(dL / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function verificarDentroPerimetro(
  lat: number,
  lng: number,
  cfg: SistemaConfig
): { dentro: boolean; nomeArea: string; distancia: number } {
  const temModoRemoto = !!(cfg.modoHomeOffice || cfg.modoHibridoLocal);

  if (temModoRemoto) {
    const er = cfg.enderecoResidencial;
    if (er?.lat && er?.lng) {
      const d = haversine(lat, lng, er.lat, er.lng);
      if (d <= er.raioMetros)
        return { dentro: true, nomeArea: "Residência", distancia: Math.round(d) };
    }
  }

  const distSede = haversine(lat, lng, cfg.lat, cfg.lng);
  if (distSede <= cfg.raioMetros) {
    return { dentro: true, nomeArea: "Sede (CFO)", distancia: Math.round(distSede) };
  }

  const areas = cfg.areasViagem ?? [];
  for (const area of areas) {
    const d = haversine(lat, lng, area.lat, area.lng);
    if (d <= area.raioMetros)
      return { dentro: true, nomeArea: "Área de viagem", distancia: Math.round(d) };
  }

  return { dentro: false, nomeArea: "CFO", distancia: Math.round(distSede) };
}

export interface MapaGeolocalizacaoProps {
  cfg: SistemaConfig;
  ativo: boolean;
  onStatusChange?: (status: "ok" | "fora" | "pendente") => void;
}

export function MapaGeolocalizacao({ cfg, ativo, onStatusChange }: MapaGeolocalizacaoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const userAccuracyRef = useRef<L.Circle | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const leafletRef = useRef<typeof L | null>(null);

  const [info, setInfo] = useState<{ dentro: boolean; nomeArea: string; distancia: number } | null>(
    null
  );
  const [gpsErro, setGpsErro] = useState<string | null>(null);
  const [aguardando, setAguardando] = useState(true);

  // Inicializa o mapa com Leaflet
  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    import("leaflet").then((Lmod) => {
      if (destroyed || !containerRef.current) return;
      const Lmap = Lmod.default ?? (Lmod as unknown as typeof L);
      leafletRef.current = Lmap;

      // Mapas Leaflet criam conflito se o elemento já tem o mapa instanciado
      if ((containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) return;

      const map = Lmap.map(containerRef.current, {
        center: [cfg.lat, cfg.lng],
        zoom: 17,
        zoomControl: true,
        attributionControl: true,
        dragging: true,
        scrollWheelZoom: false
      });

      Lmap.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a>',
        maxZoom: 19
      }).addTo(map);

      // Perímetro principal (CFO)
      Lmap.circle([cfg.lat, cfg.lng], {
        radius: cfg.raioMetros,
        color: "#7a1e26",
        fillColor: "#7a1e26",
        fillOpacity: 0.08,
        dashArray: "8 5",
        weight: 2.5
      })
        .addTo(map)
        .bindTooltip(`Sede — raio ${cfg.raioMetros}m`, { permanent: false, direction: "top" });

      // Perímetro residencial (home office / híbrido)
      const temModoRemoto = !!(cfg.modoHomeOffice || cfg.modoHibridoLocal);
      const er = cfg.enderecoResidencial;
      if (temModoRemoto && er?.lat && er?.lng) {
        Lmap.circle([er.lat, er.lng], {
          radius: er.raioMetros,
          color: "#2f7d4f",
          fillColor: "#2f7d4f",
          fillOpacity: 0.08,
          dashArray: "8 5",
          weight: 2.5
        })
          .addTo(map)
          .bindTooltip(`Residência — raio ${er.raioMetros}m`, {
            permanent: false,
            direction: "top"
          });
      }

      // Áreas de viagem
      for (const area of cfg.areasViagem ?? []) {
        Lmap.circle([area.lat, area.lng], {
          radius: area.raioMetros,
          color: "#1d4ed8",
          fillColor: "#1d4ed8",
          fillOpacity: 0.07,
          dashArray: "8 5",
          weight: 2
        })
          .addTo(map)
          .bindTooltip(`Área de viagem — raio ${area.raioMetros}m`, {
            permanent: false,
            direction: "top"
          });
      }

      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Rastreia a posição do usuário em tempo real
  useEffect(() => {
    if (!ativo || !navigator.geolocation) {
      if (!navigator.geolocation) setGpsErro("GPS não disponível neste dispositivo.");
      return;
    }

    const watchOpts = isSafariIOS()
      ? opcoesWatchSafari()
      : { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setAguardando(false);
        setGpsErro(null);

        const resultado = verificarDentroPerimetro(latitude, longitude, cfg);
        setInfo(resultado);
        onStatusChange?.(resultado.dentro ? "ok" : "fora");

        const Lmap = leafletRef.current;
        const map = mapRef.current;
        if (!Lmap || !map) return;

        const corDot = resultado.dentro ? "#2f7d4f" : "#c8393f";
        const corFill = resultado.dentro ? "#4ade80" : "#f87171";

        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([latitude, longitude]);
          userMarkerRef.current.setStyle({ color: corDot, fillColor: corFill });
        } else {
          userMarkerRef.current = Lmap.circleMarker([latitude, longitude], {
            radius: 9,
            color: corDot,
            fillColor: corFill,
            fillOpacity: 1,
            weight: 3
          })
            .addTo(map)
            .bindTooltip("Sua posição", { permanent: false, direction: "top" });
        }

        if (userAccuracyRef.current) {
          userAccuracyRef.current.setLatLng([latitude, longitude]);
          userAccuracyRef.current.setRadius(accuracy);
        } else {
          userAccuracyRef.current = Lmap.circle([latitude, longitude], {
            radius: accuracy,
            color: corDot,
            fillColor: corDot,
            fillOpacity: 0.08,
            weight: 1,
            dashArray: "4 3"
          }).addTo(map);
        }

        map.setView([latitude, longitude], map.getZoom(), { animate: true });
      },
      (err) => {
        setAguardando(false);
        if (isSafariIOS()) {
          setGpsErro(mensagemErroWatchSafari(err.code));
        } else if (err.code === 1) {
          setGpsErro("Permissão de localização negada.");
        } else if (err.code === 2) {
          setGpsErro("Localização indisponível. Ative o GPS.");
        } else {
          setGpsErro("Tempo limite ao obter localização.");
        }
        onStatusChange?.("pendente");
      },
      watchOpts
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [ativo]);

  const corStatus = !info ? "var(--ink-500)" : info.dentro ? "#2f7d4f" : "#c8393f";

  const bgStatus = !info
    ? "rgba(109,110,113,0.08)"
    : info.dentro
      ? "rgba(47,125,79,0.10)"
      : "rgba(200,57,63,0.08)";

  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "1px solid rgba(122,30,38,0.12)",
        marginBottom: 12,
        background: "#f4f4f0",
        isolation: "isolate" /* aprisiona os z-indices do Leaflet dentro deste elemento */,
        position: "relative",
        zIndex: 0
      }}
    >
      {/* Mapa */}
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />

      {/* Barra de status */}
      <div
        style={{
          background: bgStatus,
          borderTop: `1px solid ${corStatus}22`,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0 }}>
          {aguardando ? "⏳" : gpsErro ? "⚠️" : info?.dentro ? "✅" : "📍"}
        </span>
        <span style={{ fontSize: 12, color: corStatus, fontWeight: 600, flex: 1 }}>
          {aguardando
            ? "Obtendo localização…"
            : gpsErro
              ? gpsErro
              : info?.dentro
                ? `Dentro do perímetro — ${info.nomeArea} (${info.distancia}m)`
                : `Fora do perímetro — a ${info?.distancia}m do ${info?.nomeArea}`}
        </span>
        {/* Legenda compacta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 2,
                background: "#7a1e26",
                borderRadius: 1
              }}
            />
            <span style={{ fontSize: 9, color: "var(--ink-500)" }}>Sede</span>
          </div>
          {(cfg.modoHomeOffice || cfg.modoHibridoLocal) && cfg.enderecoResidencial?.lat && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 2,
                  background: "#2f7d4f",
                  borderRadius: 1
                }}
              />
              <span style={{ fontSize: 9, color: "var(--ink-500)" }}>Residência</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

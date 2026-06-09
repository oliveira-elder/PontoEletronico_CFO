import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "./useApi";

export type TipoRegistro = "ENTRADA" | "INICIO_INTERVALO" | "FIM_INTERVALO" | "SAIDA";
export type ModoRegistro = "DESKTOP" | "MOBILE" | "HIBRIDO" | "VIAGEM";

export interface SistemaConfig {
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
  pontoHorarioMinimo?: string;
  pontoHorarioMaximo?: string;
}

export interface RegistroConfirmado {
  id: string;
  tipo: TipoRegistro;
  tipoLabel: string;
  hora: string;
  horaCompleta: string;
  dataCompleta: string;
  latitude?: number;
  longitude?: number;
  dentroPerimetro?: boolean;
  distanciaMetros?: number;
  fotoDataUrl?: string;
  modo: ModoRegistro;
}

const TIPO_LABEL: Record<TipoRegistro, string> = {
  ENTRADA: "Iniciar Jornada",
  INICIO_INTERVALO: "Início do Almoço",
  FIM_INTERVALO: "Fim do Almoço",
  SAIDA: "Encerrar Jornada"
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const r = (x: number) => (x * Math.PI) / 180;
  const dL = r(lat2 - lat1);
  const dG = r(lng2 - lng1);
  const a = Math.sin(dL / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getCurrentPosition(): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0 // sempre leitura nova — evita cache de localização anterior
      }
    )
  );
}

async function getPublicIP(): Promise<string> {
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(5_000)
    });
    return (await r.json()).ip ?? "";
  } catch {
    return "";
  }
}

export function usePontoRegistration() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function registrar(params: {
    tipo: TipoRegistro;
    foto?: string;
    modo?: ModoRegistro;
    config: SistemaConfig;
  }): Promise<RegistroConfirmado | null> {
    setLoading(true);
    setErro(null);

    if (!params.config) {
      setErro("Configurações do sistema ainda não carregadas. Tente novamente.");
      setLoading(false);
      return null;
    }

    const cfg = params.config;
    const modo = params.modo ?? "MOBILE";
    const agora = new Date();

    try {
      /* ── 1. Geolocalização ── */
      let latitude: number | undefined;
      let longitude: number | undefined;
      let dentroPerimetro: boolean | undefined;
      let distanciaMetros: number | undefined;

      const needGeo =
        (modo === "MOBILE" && cfg.mobileCheckGeo) ||
        (modo === "DESKTOP" && cfg.desktopCheckGeo) ||
        modo === "HIBRIDO" ||
        modo === "VIAGEM";

      if (needGeo) {
        const pos = await getCurrentPosition();

        /* Mobile com geo obrigatório: GPS indisponível bloqueia o registro.
           VPN, permissão negada ou timeout não são justificativa para bypassar. */
        if (!pos && modo === "MOBILE" && cfg.mobileCheckGeo) {
          setErro(
            "Não foi possível obter sua localização GPS. " +
              "Certifique-se de que o GPS está ativo e que o navegador tem permissão de localização, e tente novamente."
          );
          setLoading(false);
          return null;
        }

        if (pos) {
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy);
          const dist = haversine(latitude, longitude, cfg.lat, cfg.lng);
          distanciaMetros = Math.round(dist);
          dentroPerimetro = dist <= cfg.raioMetros;

          if (modo === "MOBILE" && cfg.mobileCheckGeo) {
            /* Precisão insuficiente — indica "Localização Aproximada" (Android 12+)
               ou triangulação por torres de celular (erro típico de 300–2000 m).
               A margem de erro supera o raio configurado; verificação inconfiável. */
            if (accuracy > cfg.raioMetros * 4) {
              setErro(
                `Precisão do GPS insuficiente (±${accuracy}m) para verificar o perímetro de ${cfg.raioMetros}m.\n\n` +
                  `Corrija nas configurações do celular:\n` +
                  `• Android: Configurações → Apps → [Navegador] → Permissões → Localização` +
                  ` → alterar de "Localização aproximada" para "Localização precisa"\n` +
                  `• Ative também: Configurações → Localização → Precisão de localização`
              );
              setLoading(false);
              return null;
            }

            if (!dentroPerimetro) {
              setErro(
                `Você está a ${distanciaMetros}m do CFO. ` +
                  `O registro mobile exige estar dentro do raio de ${cfg.raioMetros}m.`
              );
              setLoading(false);
              return null;
            }
          }
        }
      }

      /* ── 2. IP público (desktop) ── */
      let ipOrigem = "";
      if (modo === "DESKTOP") {
        ipOrigem = await getPublicIP();
      }

      /* ── 3. Chamada à API ── */
      const bearerToken = token();
      let apiId: string | null = null;

      if (bearerToken) {
        try {
          const res = await api.post<{ id: string }>(
            "/ponto/registros",
            {
              tipo: params.tipo,
              latitude,
              longitude,
              origem: modo,
              modoRegistro: modo,
              ipOrigem: ipOrigem || undefined,
              fotoBase64: params.foto || undefined
            },
            bearerToken
          );
          apiId = res?.id ?? null;
        } catch (err: unknown) {
          // 401 em dev (sem realm Keycloak): silencia e usa mock
          if (!String((err as Error)?.message).includes("401")) throw err;
        }
      } else {
        // Dev sem token: simula latência
        await new Promise((r) => setTimeout(r, 600));
      }

      /* ── 4. Monta confirmação ── */
      const hora = `${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
      const horaCompl = `${hora}:${pad(agora.getSeconds())}`;
      const dataCompl =
        agora.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric"
        }) +
        " às " +
        horaCompl;

      return {
        id: apiId ?? crypto.randomUUID(),
        tipo: params.tipo,
        tipoLabel: TIPO_LABEL[params.tipo],
        hora,
        horaCompleta: horaCompl,
        dataCompleta: dataCompl,
        latitude,
        longitude,
        dentroPerimetro,
        distanciaMetros,
        fotoDataUrl: params.foto,
        modo
      };
    } catch (e: unknown) {
      setErro((e as Error).message ?? "Falha ao registrar ponto. Tente novamente.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { registrar, loading, erro, setErro };
}

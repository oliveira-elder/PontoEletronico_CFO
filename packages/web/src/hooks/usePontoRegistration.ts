import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "./useApi";

export type TipoRegistro =
  | "ENTRADA"
  | "INICIO_INTERVALO"
  | "FIM_INTERVALO"
  | "SAIDA"
  | "INTERROMPER_EXPEDIENTE"
  | "REINICIAR_EXPEDIENTE";
export type ModoRegistro = "DESKTOP" | "MOBILE" | "HIBRIDO" | "VIAGEM" | "HOME_OFFICE";

export interface EnderecoResidencial {
  lat: number | null;
  lng: number | null;
  raioMetros: number;
}

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
  almocoPodeIniciarA?: string;
  almocoPodeIniciarAte?: string;
  // Por usuário — retornados pelo endpoint /ponto/status
  modoHomeOffice?: boolean;
  modoHibridoLocal?: boolean;
  enderecoResidencial?: EnderecoResidencial | null;
  // Áreas de viagem ativas
  areasViagem?: Array<{ id: string; lat: number; lng: number; raioMetros: number }>;
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
  SAIDA: "Encerrar Jornada",
  INTERROMPER_EXPEDIENTE: "Interromper Expediente",
  REINICIAR_EXPEDIENTE: "Reiniciar Expediente"
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

  async function registrar(paramEntrada: {
    tipo: TipoRegistro;
    foto?: string;
    modo?: ModoRegistro;
    config: SistemaConfig;
  }): Promise<RegistroConfirmado | null> {
    setLoading(true);
    setErro(null);

    if (!paramEntrada.config) {
      setErro("Configurações do sistema ainda não carregadas. Tente novamente.");
      setLoading(false);
      return null;
    }

    let params = paramEntrada;
    const cfg = params.config;
    const modo = params.modo ?? "MOBILE";
    const agora = new Date();

    try {
      /* ── 1. Geolocalização ── */
      let latitude: number | undefined;
      let longitude: number | undefined;
      let dentroPerimetro: boolean | undefined;
      let distanciaMetros: number | undefined;

      const temModoRemoto = !!(cfg.modoHomeOffice || cfg.modoHibridoLocal);
      const modoEfetivo = temModoRemoto ? (cfg.modoHomeOffice ? "HOME_OFFICE" : "HIBRIDO") : modo;

      const needGeo =
        temModoRemoto ||
        (modo === "MOBILE" && cfg.mobileCheckGeo) ||
        (modo === "DESKTOP" && cfg.desktopCheckGeo) ||
        modo === "HIBRIDO" ||
        modo === "VIAGEM";

      if (needGeo) {
        const pos = await getCurrentPosition();

        if (!pos) {
          if (temModoRemoto) {
            setErro(
              "GPS não disponível. Para registrar o ponto remoto, o navegador precisa de acesso à localização.\n\n" +
                "Como ativar:\n" +
                "• Android Chrome: toque no ícone 🔒 na barra de endereço → Permissões → Localização → Permitir\n" +
                "• Android Chrome (bloqueado): Configurações → Privacidade → Configurações do site → Localização → Permitir\n" +
                "• iPhone Safari: Ajustes → Privacidade → Serviços de Localização → Safari → Ao usar o app\n" +
                "• iPhone Chrome: Ajustes → Chrome → Localização → Ao usar o app"
            );
          } else if (modo === "MOBILE" && cfg.mobileCheckGeo) {
            setErro(
              "Não foi possível obter sua localização GPS. " +
                "Certifique-se de que o GPS está ativo e que o navegador tem permissão de localização, e tente novamente."
            );
          }
          if (temModoRemoto || (modo === "MOBILE" && cfg.mobileCheckGeo)) {
            setLoading(false);
            return null;
          }
        }

        if (pos) {
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
          const accuracy = Math.round(pos.coords.accuracy);

          /* ── Modo remoto: verifica residencial primeiro, depois sede ── */
          if (temModoRemoto) {
            const er = cfg.enderecoResidencial;

            let dentroResidencial = false;
            if (er?.lat && er?.lng) {
              const distRes = haversine(latitude, longitude, er.lat, er.lng);
              if (accuracy > er.raioMetros * 4) {
                setErro(
                  `Precisão do GPS insuficiente (±${accuracy}m) para verificar o raio de ${er.raioMetros}m.\n\n` +
                    "Ative localização precisa:\n" +
                    "• Android: Configurações → Localização → Precisão de localização → ativar\n" +
                    "• Android Chrome: barra de endereço 🔒 → Permissões → Localização → Localização precisa\n" +
                    "• iPhone: Ajustes → Privacidade → Serviços de Localização → Safari/Chrome → Precisão Total → ativar"
                );
                setLoading(false);
                return null;
              }
              dentroResidencial = distRes <= er.raioMetros;
            }

            if (dentroResidencial) {
              /* 1. Dentro de casa */
              distanciaMetros = Math.round(haversine(latitude, longitude, er!.lat!, er!.lng!));
              dentroPerimetro = true;
            } else {
              /* 2. Tenta sede */
              const distSede = haversine(latitude, longitude, cfg.lat, cfg.lng);
              if (distSede <= cfg.raioMetros) {
                distanciaMetros = Math.round(distSede);
                dentroPerimetro = true;
                params = { ...params, modo: "MOBILE" };
              } else {
                /* 3. Tenta áreas de viagem */
                const areas = cfg.areasViagem ?? [];
                const areaOk = areas.find(
                  (a) => haversine(latitude!, longitude!, a.lat, a.lng) <= a.raioMetros
                );
                if (areaOk) {
                  distanciaMetros = Math.round(
                    haversine(latitude!, longitude!, areaOk.lat, areaOk.lng)
                  );
                  dentroPerimetro = true;
                  params = { ...params, modo: "VIAGEM" };
                } else {
                  const raioRes = er?.raioMetros ?? 20;
                  const msgRes = er?.lat
                    ? ` e a mais de ${raioRes}m do endereço residencial`
                    : " (endereço residencial sem coordenadas)";
                  const msgAreas = areas.length > 0 ? " e fora das áreas de viagem" : "";
                  setErro(
                    `Você está a ${Math.round(distSede)}m do CFO${msgRes}${msgAreas}.\n` +
                      `Deve estar na sede, em casa ou em uma área de viagem para registrar o ponto.`
                  );
                  setLoading(false);
                  return null;
                }
              }
            }
          } else {
            /* ── Modo sede: valida contra CFO ── */
            const dist = haversine(latitude, longitude, cfg.lat, cfg.lng);
            distanciaMetros = Math.round(dist);
            dentroPerimetro = dist <= cfg.raioMetros;

            if (modo === "MOBILE" && cfg.mobileCheckGeo) {
              if (accuracy > cfg.raioMetros * 4) {
                setErro(
                  `Precisão do GPS insuficiente (±${accuracy}m) para verificar o perímetro de ${cfg.raioMetros}m.\n\n` +
                    '• Android: Configurações → Apps → [Navegador] → Permissões → Localização → alterar para "Localização precisa"\n' +
                    "• Ative também: Configurações → Localização → Precisão de localização"
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
      }

      /* Sobrepõe modo para registro remoto */
      if (temModoRemoto) {
        params = { ...params, modo: modoEfetivo as ModoRegistro };
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
          const modoFinal = params.modo ?? modo;
          const res = await api.post<{ id: string }>(
            "/ponto/registros",
            {
              tipo: params.tipo,
              latitude,
              longitude,
              origem: modoFinal,
              modoRegistro: modoFinal,
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
        modo: (params.modo ?? modo) as ModoRegistro
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

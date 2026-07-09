export type GeoErroCode = 1 | 2 | 3;

export interface GeoResult {
  position: GeolocationPosition | null;
  errorCode?: GeoErroCode;
}

/** Safari no iPhone/iPad (exclui Chrome, Firefox e Edge no iOS). */
export function isSafariIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/iPhone|iPad|iPod/.test(ua)) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return false;
  return /Safari/.test(ua);
}

function getCurrentPositionOnce(opts: PositionOptions): Promise<GeoResult> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ position }),
      (err) => resolve({ position: null, errorCode: err.code as GeoErroCode }),
      opts
    );
  });
}

/** Estratégia em camadas exclusiva para Safari iOS. */
export async function getCurrentPositionSafari(): Promise<GeoResult> {
  if (!navigator.geolocation) return { position: null };

  const tentativas: PositionOptions[] = [
    { enableHighAccuracy: false, timeout: 30_000, maximumAge: 60_000 },
    { enableHighAccuracy: true, timeout: 45_000, maximumAge: 10_000 }
  ];

  let ultimoErro: GeoErroCode | undefined;
  for (const opts of tentativas) {
    const resultado = await getCurrentPositionOnce(opts);
    if (resultado.position) return resultado;
    ultimoErro = resultado.errorCode;
    if (resultado.errorCode === 1) break;
  }

  return new Promise((resolve) => {
    let encerrado = false;
    let watchId: number | null = null;

    const finalizar = (r: GeoResult) => {
      if (encerrado) return;
      encerrado = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      resolve(r);
    };

    watchId = navigator.geolocation.watchPosition(
      (p) => finalizar({ position: p }),
      (err) => finalizar({ position: null, errorCode: err.code as GeoErroCode }),
      { enableHighAccuracy: false, timeout: 30_000, maximumAge: 60_000 }
    );

    const timer = setTimeout(
      () => finalizar({ position: null, errorCode: ultimoErro ?? 3 }),
      35_000
    );
  });
}

/** Comportamento original — usado por navegadores que não são Safari iOS. */
export async function getCurrentPositionPadrao(): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0
      }
    )
  );
}

/** Obtém posição: estratégia Safari ou padrão conforme o navegador. */
export async function obterPosicaoAtual(): Promise<GeoResult> {
  if (isSafariIOS()) return getCurrentPositionSafari();
  const position = await getCurrentPositionPadrao();
  return { position };
}

/** Pré-ativação de GPS no Safari (requer gesto do usuário). */
export function primarGeolocalizacaoSafari(): Promise<GeoResult> {
  return getCurrentPositionSafari();
}

export function opcoesWatchSafari(): PositionOptions {
  return { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 };
}

export function mensagemErroGpsSafari(
  errorCode?: GeoErroCode,
  opts?: { remoto?: boolean }
): string {
  switch (errorCode) {
    case 1:
      return (
        "Permissão de localização negada no Safari.\n\n" +
        "Como ativar:\n" +
        '• Toque no ícone "aA" na barra de endereço → Configurações do Website → Localização → Permitir\n' +
        "• Ajustes → Privacidade e Segurança → Serviços de Localização → Safari → Ao usar o App\n" +
        '• Ative "Localização Precisa" para este site'
      );
    case 2:
      return (
        "Localização indisponível no Safari.\n\n" +
        "Verifique:\n" +
        "• Ajustes → Privacidade e Segurança → Serviços de Localização → ativado\n" +
        "• Modo avião desligado\n" +
        "• Navegação privada desativada (limita o GPS no Safari)"
      );
    case 3:
      return (
        "Tempo esgotado ao obter GPS no Safari.\n\n" +
        "Tente:\n" +
        '• Toque em "Ativar localização" antes de bater o ponto\n' +
        "• Aguarde alguns segundos ao ar livre ou perto de uma janela\n" +
        "• Ajustes → Safari → Localização → Permitir"
      );
    default:
      if (opts?.remoto) {
        return (
          "GPS não disponível no Safari. Para registrar o ponto remoto, o navegador precisa de acesso à localização.\n\n" +
          "Como ativar:\n" +
          '• Toque no ícone "aA" na barra de endereço → Configurações do Website → Localização → Permitir\n' +
          "• Ajustes → Privacidade e Segurança → Serviços de Localização → Safari → Ao usar o App\n" +
          '• Ative "Localização Precisa" para este site'
        );
      }
      return (
        "Não foi possível obter sua localização GPS no Safari. " +
        'Toque em "Ativar localização" acima ou ajuste as permissões nas configurações do iPhone.'
      );
  }
}

export function mensagemErroWatchSafari(code: number): string {
  switch (code) {
    case 1:
      return 'Permissão negada — toque em "Ativar localização" ou ajuste em Ajustes → Safari.';
    case 2:
      return "Localização indisponível — ative Serviços de Localização no iPhone.";
    case 3:
      return "Tempo esgotado — toque em Ativar localização e aguarde alguns segundos.";
    default:
      return "Erro ao obter localização no Safari.";
  }
}

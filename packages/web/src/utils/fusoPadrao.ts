/**
 * Fuso padrão do sistema: Brasília (America/Sao_Paulo) em TODA formatação de data/hora, qualquer que seja o fuso do
 * computador de quem acessa. Importado uma única vez, antes de tudo, em `main.tsx`.
 *
 * - Instantes (createdAt, assinadoEm...) são exibidos no horário de Brasília.
 * - Datas civis (coluna `@db.Date` chega como meia-noite UTC exata, ex.: "2025-01-21T00:00:00.000Z") são exibidas em UTC,
 *   para NÃO recuar um dia (21/01 virar 20/01).
 * Quem já informa `timeZone` explicitamente não é alterado. O registro de ponto continua usando suas próprias funções.
 */
const FUSO = "America/Sao_Paulo";

function eDataCivil(d: Date): boolean {
  const t = d.getTime();
  return Number.isFinite(t) && t % 86400000 === 0;
}

type Fmt = (
  this: Date,
  locales?: Intl.LocalesArgument,
  options?: Intl.DateTimeFormatOptions
) => string;

function comFuso(original: Fmt) {
  return function (
    this: Date,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ) {
    if (options && options.timeZone) return original.call(this, locales, options);
    const soData =
      eDataCivil(this) &&
      !(options && ("hour" in options || "minute" in options || "timeStyle" in options));
    const opts: Intl.DateTimeFormatOptions = {
      ...(options ?? {}),
      timeZone: soData ? "UTC" : FUSO
    };
    return original.call(this, locales, opts);
  };
}

const proto = Date.prototype as unknown as Record<string, Fmt>;
for (const nome of ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"]) {
  if ((proto[nome] as { __fusoBr?: boolean }).__fusoBr) continue;
  const novo = comFuso(proto[nome]);
  (novo as unknown as { __fusoBr: boolean }).__fusoBr = true;
  proto[nome] = novo;
}
export {};

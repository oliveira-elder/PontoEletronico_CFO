/** Geocodificação de endereços brasileiros via Nominatim.
 *
 *  Tenta em sequência:
 *  1. Busca estruturada: street="NUMERO LOGRADOURO" + city + state + postalcode
 *  2. Busca estruturada: street="NUMERO LOGRADOURO" + city + state (sem CEP)
 *  3. Busca estruturada: street="LOGRADOURO" + city + state (sem número)
 *  4. Texto livre: logradouro, numero, bairro, cidade, UF, Brasil
 *  5. Texto livre: logradouro, bairro, cidade, UF (sem número)
 *  6. Apenas CEP
 */
export interface GeoInput {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

export interface GeoResult {
  lat: number;
  lng: number;
}

const HEADERS = { "Accept-Language": "pt-BR", Accept: "application/json" };

async function nominatimFetch(url: string): Promise<GeoResult | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    const data = await res.json();
    if (data?.length) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    /* silencioso */
  }
  return null;
}

function structuredUrl(params: Record<string, string>): string {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "1");
  u.searchParams.set("countrycodes", "br");
  u.searchParams.set("addressdetails", "1");
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  return u.toString();
}

function freetextUrl(q: string): string {
  return `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`;
}

export async function geocodificarEndereco(input: GeoInput): Promise<GeoResult | null> {
  const { logradouro, numero, bairro, cidade, uf, cep } = input;

  // Nominatim structured: número ANTES do logradouro (padrão OSM)
  const streetComNum = [numero, logradouro].filter(Boolean).join(" ");
  const streetSemNum = logradouro ?? "";
  const cidadeStr = cidade ?? "";
  const ufStr = uf ?? "";
  const cepDigits = (cep ?? "").replace(/\D/g, "");

  const tentativas: Array<() => Promise<GeoResult | null>> = [];

  // 1. Estruturada completa (com número, CEP, cidade, UF)
  if (streetComNum && cidadeStr) {
    tentativas.push(() =>
      nominatimFetch(
        structuredUrl({
          street: streetComNum,
          city: cidadeStr,
          state: ufStr,
          postalcode: cepDigits
        })
      )
    );
  }

  // 2. Estruturada com número + cidade + UF (sem CEP)
  if (streetComNum && cidadeStr) {
    tentativas.push(() =>
      nominatimFetch(
        structuredUrl({
          street: streetComNum,
          city: cidadeStr,
          state: ufStr
        })
      )
    );
  }

  // 3. Estruturada sem número + cidade + UF
  if (streetSemNum && cidadeStr) {
    tentativas.push(() =>
      nominatimFetch(
        structuredUrl({
          street: streetSemNum,
          city: cidadeStr,
          state: ufStr
        })
      )
    );
  }

  // 4. Texto livre completo
  const livreFull = [logradouro, numero, bairro, cidadeStr, ufStr, "Brasil"]
    .filter(Boolean)
    .join(", ");
  if (livreFull) tentativas.push(() => nominatimFetch(freetextUrl(livreFull)));

  // 5. Texto livre sem número
  const livreSemNum = [logradouro, bairro, cidadeStr, ufStr, "Brasil"].filter(Boolean).join(", ");
  if (livreSemNum !== livreFull) tentativas.push(() => nominatimFetch(freetextUrl(livreSemNum)));

  // 6. CEP
  if (cepDigits) tentativas.push(() => nominatimFetch(freetextUrl(`${cepDigits}, Brasil`)));

  for (const fn of tentativas) {
    const result = await fn();
    if (result) return result;
  }

  return null;
}

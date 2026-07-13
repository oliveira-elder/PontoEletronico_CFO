import { useEffect, useState } from "react";
import { INSTITUICAO_BRANDING_DEFAULT, type InstituicaoBranding } from "../utils/instituicao";

const BASE = "/api";

let cache: InstituicaoBranding | null = null;
let inflight: Promise<InstituicaoBranding> | null = null;
let cacheVersion = 0;
const listeners = new Set<() => void>();

function normalize(data: InstituicaoBranding): InstituicaoBranding {
  return {
    ...INSTITUICAO_BRANDING_DEFAULT,
    ...data,
    nome: data.nome?.trim() || INSTITUICAO_BRANDING_DEFAULT.nome,
    cnpj: data.cnpj?.trim() || INSTITUICAO_BRANDING_DEFAULT.cnpj
  };
}

async function fetchBranding(force = false): Promise<InstituicaoBranding> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;

  const request = (async () => {
    try {
      const res = await fetch(`${BASE}/ponto/config/branding`, {
        method: "GET",
        credentials: "include"
      });
      if (!res.ok) return cache ?? INSTITUICAO_BRANDING_DEFAULT;
      const data = (await res.json()) as InstituicaoBranding;
      cache = normalize(data);
      return cache;
    } catch {
      return cache ?? INSTITUICAO_BRANDING_DEFAULT;
    } finally {
      if (inflight === request) inflight = null;
    }
  })();

  inflight = request;
  return request;
}

/** Invalida o cache (ex.: após salvar configurações da instituição). */
export function invalidateInstituicaoBranding() {
  cache = null;
  cacheVersion += 1;
  listeners.forEach((l) => l());
}

export function useInstituicaoBranding() {
  const [branding, setBranding] = useState<InstituicaoBranding>(
    () => cache ?? INSTITUICAO_BRANDING_DEFAULT
  );
  const [loading, setLoading] = useState(!cache);
  const [version, setVersion] = useState(cacheVersion);

  useEffect(() => {
    const onInvalidate = () => setVersion(cacheVersion);
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBranding(!cache).then((data) => {
      if (!cancelled) {
        setBranding(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { branding, loading };
}

/**
 * Identidade da instância (máquina virtual/servidor) que roda o REP — detectada a cada início.
 * Ordem: REP_INSTANCIA_ID (TI) → ID da instância na nuvem (metadados AWS/Azure/GCP) →
 * machine-id do hospedeiro (montado em /host/etc/machine-id) → UUID da VM (DMI) → hostname.
 * Clonar a VM (novo UUID/machine-id) ou migrar para a nuvem gera outra identidade.
 */
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { hostname } from "os";

export interface InstanciaDetectada {
  codigo: string;
  impressaoDigital: string;
  hostname: string;
  origem: Record<string, string>;
}

function ler(caminho: string): string | null {
  try {
    if (!existsSync(caminho)) return null;
    const v = readFileSync(caminho, "utf8").trim();
    return v || null;
  } catch {
    return null;
  }
}

async function metadadoNuvem(): Promise<{ provedor: string; id: string } | null> {
  const tentar = async (provedor: string, url: string, headers: Record<string, string>) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 400);
    try {
      const r = await fetch(url, { headers, signal: ctrl.signal });
      if (!r.ok) return null;
      const id = (await r.text()).trim();
      return id && id.length < 200 ? { provedor, id } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  };
  const res = await Promise.all([
    tentar(
      "azure",
      "http://169.254.169.254/metadata/instance/compute/vmId?api-version=2021-02-01&format=text",
      { Metadata: "true" }
    ),
    tentar("gcp", "http://169.254.169.254/computeMetadata/v1/instance/id", {
      "Metadata-Flavor": "Google"
    }),
    tentar("aws", "http://169.254.169.254/latest/meta-data/instance-id", {})
  ]);
  return res.find(Boolean) ?? null;
}

export async function detectarInstancia(): Promise<InstanciaDetectada> {
  const origem: Record<string, string> = {};
  const forcado = process.env.REP_INSTANCIA_ID?.trim();
  if (forcado) origem.forcado = forcado;
  else {
    const nuvem = await metadadoNuvem();
    if (nuvem) origem[`nuvem_${nuvem.provedor}`] = nuvem.id;
    const machineId = ler("/host/etc/machine-id") ?? ler("/etc/machine-id");
    if (machineId) origem.machineId = machineId;
    const uuid = ler("/sys/class/dmi/id/product_uuid");
    if (uuid) origem.vmUuid = uuid;
    /* Hostname só como último recurso: o do container muda a cada recriação. */
    if (!Object.keys(origem).length) origem.hostname = hostname();
  }
  const impressaoDigital = createHash("sha256")
    .update(
      Object.entries(origem)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("|")
    )
    .digest("hex");
  return {
    codigo: `VM-${impressaoDigital.slice(0, 12).toUpperCase()}`,
    impressaoDigital,
    hostname: hostname(),
    origem
  };
}

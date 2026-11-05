/**
 * Testa o hash do escopo do REP-P numa CÓPIA temporária (nenhum arquivo do projeto é alterado).
 *   npx ts-node -P tsconfig.json --transpile-only scripts/teste-escopo-hash.ts
 */
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import {
  calcularEscopo,
  lerManifesto,
  raizBackend,
  NOME_MANIFESTO
} from "../src/modules/rep/escopo-hash";

const real = raizBackend();
const manifesto = lerManifesto(real);
let falhas = 0;
const confere = (rotulo: string, ok: boolean) => {
  console.log(`${ok ? "OK   " : "FALHA"} ${rotulo}`);
  if (!ok) falhas++;
};

function copia(): string {
  const dir = mkdtempSync(join(tmpdir(), "rep-escopo-"));
  cpSync(join(real, NOME_MANIFESTO), join(dir, NOME_MANIFESTO));
  chmodSync(join(dir, NOME_MANIFESTO), 0o644);
  for (const rel of [...manifesto.arquivos, manifesto.modelosPrisma.arquivo]) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    cpSync(join(real, rel), join(dir, rel));
    chmodSync(join(dir, rel), 0o644); // os originais são somente leitura (lacre); a cópia precisa ser editável
  }
  return dir;
}
const editar = (dir: string, rel: string, fn: (t: string) => string) =>
  writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), "utf8")));

const base = calcularEscopo(real).hash;
let dir = copia();
confere("cópia idêntica gera o mesmo hash do projeto", calcularEscopo(dir).hash === base);
rmSync(dir, { recursive: true, force: true });

dir = copia();
editar(dir, "src/modules/rep/rep-livro.service.ts", (t) => t.replace(/\n/g, "\r\n"));
confere("fim de linha CRLF não muda o hash", calcularEscopo(dir).hash === base);
editar(dir, "src/utils/afd-campos.ts", (t) => "﻿" + t);
confere("BOM no início não muda o hash", calcularEscopo(dir).hash === base);
rmSync(dir, { recursive: true, force: true });

dir = copia();
editar(dir, "src/modules/rep/rep-livro.service.ts", (t) => t.replace("NSR", "NSX"));
confere(
  "alterar 1 caractere de rep-livro.service.ts muda o hash",
  calcularEscopo(dir).hash !== base
);
rmSync(dir, { recursive: true, force: true });

dir = copia();
editar(dir, "src/modules/rep/registro-ponto.core.ts", (t) => t + "\n// x\n");
confere("acrescentar linha ao núcleo muda o hash", calcularEscopo(dir).hash !== base);
rmSync(dir, { recursive: true, force: true });

dir = copia();
editar(dir, "prisma/schema.prisma", (t) =>
  t.replace(/^model Funcionario \{/m, "model Funcionario {\n  campoQualquerDeTeste String?")
);
confere("mudar OUTRA tabela do schema não muda o hash", calcularEscopo(dir).hash === base);
editar(dir, "prisma/schema.prisma", (t) =>
  t.replace(/^model RegistroPonto \{/m, "model RegistroPonto {\n  campoDeTeste String?")
);
confere("mudar o modelo RegistroPonto muda o hash", calcularEscopo(dir).hash !== base);
rmSync(dir, { recursive: true, force: true });

dir = copia();
rmSync(join(dir, "src/utils/instancia-rep.ts"));
const sem = calcularEscopo(dir);
confere(
  "arquivo ausente é listado e muda o hash",
  sem.ausentes.includes("src/utils/instancia-rep.ts") && sem.hash !== base
);
rmSync(dir, { recursive: true, force: true });

console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
process.exit(falhas ? 1 : 0);

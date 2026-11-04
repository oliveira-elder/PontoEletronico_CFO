import { readFileSync } from "node:fs";
import path from "node:path";

/* Os arquivos do escopo do hash do REP-P (packages/backend/rep-escopo.json) NÃO são reformatados nem
   corrigidos automaticamente no commit: prettier/eslint --fix mudariam o hash sem ninguém perceber. */
const manifesto = JSON.parse(readFileSync("packages/backend/rep-escopo.json", "utf8"));
const protegidos = new Set(
  [...manifesto.arquivos, "rep-escopo.json", "rep-escopo.lock.json"].map((rel) =>
    path.resolve("packages/backend", rel)
  )
);
const livres = (arquivos) => arquivos.filter((f) => !protegidos.has(path.resolve(f)));
const lista = (arquivos) => arquivos.map((f) => JSON.stringify(f)).join(" ");

export default {
  "*.{ts,tsx,js,jsx,json,md,yml,yaml}": (arquivos) => {
    const l = livres(arquivos);
    return l.length ? [`node node_modules/prettier/bin/prettier.cjs --write ${lista(l)}`] : [];
  },
  "*.{ts,tsx,js,jsx}": (arquivos) => {
    const l = livres(arquivos);
    return l.length ? [`node node_modules/eslint/bin/eslint.js --fix ${lista(l)}`] : [];
  }
};

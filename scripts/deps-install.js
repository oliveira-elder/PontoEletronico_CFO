#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Reinstala dependências quando node_modules pertence a outro usuário (ex.: root no Docker).
 * Renomeia pastas antigas (só exige escrita no diretório pai) e instala em diretório temporário.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const stamp = Date.now();

function renameIfExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) return;
  const backup = `${targetPath}.root.bak.${stamp}`;
  fs.renameSync(targetPath, backup);
  console.log(`${label} renomeado para ${path.basename(backup)}`);
}

renameIfExists(path.join(root, "node_modules"), "node_modules");
renameIfExists(
  path.join(root, "packages", "mobile", "node_modules"),
  "packages/mobile/node_modules"
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ponto-npm-"));
console.log(`Instalando em ${tmpDir}...`);

fs.copyFileSync(path.join(root, "package.json"), path.join(tmpDir, "package.json"));
fs.copyFileSync(path.join(root, "package-lock.json"), path.join(tmpDir, "package-lock.json"));
if (fs.existsSync(path.join(root, ".npmrc"))) {
  fs.copyFileSync(path.join(root, ".npmrc"), path.join(tmpDir, ".npmrc"));
}

const workspacePackages = ["backend", "web", "desktop", "shared"];
fs.mkdirSync(path.join(tmpDir, "packages"), { recursive: true });
for (const pkg of workspacePackages) {
  const src = path.join(root, "packages", pkg);
  if (!fs.existsSync(src)) continue;
  execSync(`cp -r "${src}" "${path.join(tmpDir, "packages", pkg)}"`, { stdio: "inherit" });
  const nested = path.join(tmpDir, "packages", pkg, "node_modules");
  if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
}

execSync("npm install", { cwd: tmpDir, stdio: "inherit" });

fs.renameSync(path.join(tmpDir, "node_modules"), path.join(root, "node_modules"));

const mobileModules = path.join(tmpDir, "packages", "mobile", "node_modules");
if (fs.existsSync(mobileModules)) {
  const dest = path.join(root, "packages", "mobile", "node_modules");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(mobileModules, dest);
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log("Executando npm audit fix...");
try {
  execSync("npm audit fix", { cwd: root, stdio: "inherit" });
} catch {
  /* pode restar vulnerabilidades sem correção automática */
}

console.log("\nResumo do audit:");
try {
  execSync("npm audit", { cwd: root, stdio: "inherit" });
} catch (err) {
  /* npm audit usa exit 1 quando há vulnerabilidades — não é falha de instalação */
  if (err.status !== 1) throw err;
  const summary = execSync(
    "npm audit --json 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const m=d.metadata?.vulnerabilities||{}; console.log('Total:', m.total||0, '(moderate:', m.moderate||0, ', high:', m.high||0, ')');\"",
    { cwd: root, encoding: "utf8" }
  );
  console.log(summary.trim());
}

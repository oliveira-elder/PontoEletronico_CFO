#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Reinstala dependências quando node_modules pertence a outro usuário (ex.: root no Docker).
 * Backups vão para /tmp (não poluem o repositório).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const stamp = Date.now();

function removeDir(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

/** Remove backups antigos no repo e em /tmp. */
function cleanupLegacyBackups() {
  const patterns = [/^node_modules\.bak\.\d+$/, /^node_modules\.root\.bak\.\d+$/];
  for (const name of fs.readdirSync(root)) {
    if (patterns.some((re) => re.test(name))) {
      removeDir(path.join(root, name));
      console.log(`Backup legado removido: ${name}`);
    }
  }
  const mobileRoot = path.join(root, "packages", "mobile");
  if (fs.existsSync(mobileRoot)) {
    for (const name of fs.readdirSync(mobileRoot)) {
      if (patterns.some((re) => re.test(name))) {
        removeDir(path.join(mobileRoot, name));
        console.log(`Backup legado removido: packages/mobile/${name}`);
      }
    }
  }
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (/^ponto-npm-bak-\d+$/.test(name)) {
      removeDir(path.join(os.tmpdir(), name));
    }
  }
}

function relocateIfExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) return;
  const backup = path.join(os.tmpdir(), `ponto-npm-bak-${stamp}-${path.basename(targetPath)}`);
  try {
    fs.renameSync(targetPath, backup);
    console.log(`${label} movido para ${backup}`);
  } catch {
    removeDir(targetPath);
    console.log(`${label} removido (rename falhou)`);
  }
}

cleanupLegacyBackups();

relocateIfExists(path.join(root, "node_modules"), "node_modules");
relocateIfExists(
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

// Remove backup desta execução e legados
for (const name of fs.readdirSync(os.tmpdir())) {
  if (name.startsWith(`ponto-npm-bak-${stamp}-`) || /^ponto-npm-bak-\d+-/.test(name)) {
    removeDir(path.join(os.tmpdir(), name));
  }
}
cleanupLegacyBackups();

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
  if (err.status !== 1) throw err;
  const summary = execSync(
    "npm audit --json 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const m=d.metadata?.vulnerabilities||{}; console.log('Total:', m.total||0, '(moderate:', m.moderate||0, ', high:', m.high||0, ')');\"",
    { cwd: root, encoding: "utf8" }
  );
  console.log(summary.trim());
}

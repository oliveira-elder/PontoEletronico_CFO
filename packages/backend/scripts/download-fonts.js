/**
 * Baixa Instrument Serif (Regular + Italic) do Google Fonts para geração de PDF.
 * Uso: node scripts/download-fonts.js
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.join(__dirname, "..", "src", "assets", "fonts");

const FONTS = [
  {
    name: "InstrumentSerif-Regular.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf"
  },
  {
    name: "InstrumentSerif-Italic.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/instrumentserif/InstrumentSerif-Italic.ttf"
  }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          download(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode} ao baixar ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const font of FONTS) {
    const dest = path.join(OUT_DIR, font.name);
    process.stdout.write(`Baixando ${font.name}... `);
    await download(font.url, dest);
    const size = fs.statSync(dest).size;
    console.log(`ok (${size} bytes)`);
  }
  console.log("Fontes salvas em:", OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

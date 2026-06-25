/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const path = require("path");

const svg = `<svg width="240" height="72" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="238" height="70" rx="8" fill="#FFF5F5" stroke="#6B0F1A" stroke-width="2"/>
  <circle cx="28" cy="36" r="16" fill="#6B0F1A"/>
  <path d="M 21 36 L 26 41 L 36 29" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="52" y="30" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#6B0F1A">Assinado digitalmente</text>
  <text x="52" y="48" font-family="Arial, Helvetica, sans-serif" font-size="9" fill="#666666">Ponto Eletrônico CFO</text>
</svg>`;

const out = path.join(__dirname, "..", "src", "assets", "selo-assinado-digital.png");

sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then(() => console.log("Selo criado:", out))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

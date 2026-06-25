/* eslint-disable @typescript-eslint/no-require-imports */
const sharp = require("sharp");
const path = require("path");

/* Ícone de certificado digital — documento com selo e fita */
const svg = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="4" width="40" height="52" rx="3" fill="#FFFFFF" stroke="#6B0F1A" stroke-width="2"/>
  <path d="M 36 4 L 48 4 L 48 16 L 36 4 Z" fill="#F3E8EA" stroke="#6B0F1A" stroke-width="1"/>
  <line x1="14" y1="18" x2="42" y2="18" stroke="#D1D5DB" stroke-width="1.5"/>
  <line x1="14" y1="24" x2="38" y2="24" stroke="#D1D5DB" stroke-width="1.5"/>
  <line x1="14" y1="30" x2="34" y2="30" stroke="#D1D5DB" stroke-width="1.5"/>
  <circle cx="28" cy="42" r="10" fill="#6B0F1A"/>
  <path d="M 23 42 L 27 46 L 34 38" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 22 56 Q 28 50 34 56" stroke="#C9A227" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="22" cy="56" r="3" fill="#C9A227"/>
  <circle cx="34" cy="56" r="3" fill="#C9A227"/>
</svg>`;

const out = path.join(__dirname, "..", "src", "assets", "certificado-digital.png");

sharp(Buffer.from(svg))
  .png()
  .toFile(out)
  .then(() => console.log("Certificado criado:", out))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

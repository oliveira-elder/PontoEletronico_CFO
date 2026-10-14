/**
 * Copia para public/ocr os arquivos do OCR (tesseract.js): worker, núcleo WebAssembly e o idioma
 * português. Assim a verificação por foto funciona sem depender de CDN/internet externa.
 * Roda antes do build e do dev (package.json).
 */
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const raiz = dirname(fileURLToPath(import.meta.url));
const destino = join(raiz, "..", "public", "ocr");
mkdirSync(join(destino, "core"), { recursive: true });
mkdirSync(join(destino, "lang"), { recursive: true });

const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json"));
const por = dirname(require.resolve("@tesseract.js-data/por/package.json"));

const copias = [
  [join(tesseract, "dist", "worker.min.js"), join(destino, "worker.min.js")],
  ...[
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-lstm.wasm",
    "tesseract-core-simd-lstm.wasm",
    "tesseract-core-lstm.js",
    "tesseract-core-simd-lstm.js"
  ].map((f) => [join(core, f), join(destino, "core", f)]),
  [join(por, "4.0.0", "por.traineddata.gz"), join(destino, "lang", "por.traineddata.gz")]
];
for (const [de, para] of copias) {
  if (!existsSync(de)) {
    console.warn(`[ocr] arquivo ausente: ${de}`);
    continue;
  }
  copyFileSync(de, para);
}
console.log(`[ocr] arquivos do OCR copiados para ${destino}`);

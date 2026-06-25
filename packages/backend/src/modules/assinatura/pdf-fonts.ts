import * as fs from "fs";
import * as path from "path";

export type PdfFontDef = {
  normal: string;
  bold: string;
  italics: string;
  bolditalics: string;
};

function resolveAssetDir(subdir: string): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "src", "assets", subdir),
    path.join(cwd, "dist", "assets", subdir),
    path.join(cwd, "packages", "backend", "src", "assets", subdir),
    path.join(cwd, "packages", "backend", "dist", "assets", subdir)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export function getPdfFonts(): Record<string, PdfFontDef> {
  const fontDir = resolveAssetDir("fonts");
  const regular = path.join(fontDir, "InstrumentSerif-Regular.ttf");
  const italic = path.join(fontDir, "InstrumentSerif-Italic.ttf");

  const fonts: Record<string, PdfFontDef> = {
    Helvetica: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique"
    }
  };

  if (fs.existsSync(regular) && fs.existsSync(italic)) {
    fonts.InstrumentSerif = {
      normal: regular,
      bold: regular,
      italics: italic,
      bolditalics: italic
    };
  }

  return fonts;
}

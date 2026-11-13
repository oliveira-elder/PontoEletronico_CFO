/** Arquivo .docx no anexo vira 400 (antes: 500). UPLOAD_DIR temporário. npx ts-node -P tsconfig.json --transpile-only scripts/teste-upload-docx.ts */
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DocumentoService } from "../src/modules/ponto/documento.service";
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "up-"));
const svc = new DocumentoService();
const docx =
  "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," +
  Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(200, 1)]).toString("base64");
const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n%%EOF").toString("base64");
(async () => {
  let r = "passou";
  await svc
    .salvarDocumento({
      funcionarioId: "f",
      solicitacaoId: "s1",
      arquivoBase64: docx,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    })
    .catch((e: Error) => (r = e.constructor.name));
  const okDocx = r === "BadRequestException";
  console.log(okDocx ? "OK    .docx recusado com 400 e mensagem clara" : `FALHA .docx => ${r}`);
  const u = await svc.salvarDocumento({
    funcionarioId: "f",
    solicitacaoId: "s2",
    arquivoBase64: pdf,
    mimeType: "application/pdf"
  });
  console.log(u.endsWith(".pdf") ? "OK    PDF continua sendo salvo" : "FALHA PDF");
  process.exit(okDocx && u.endsWith(".pdf") ? 0 : 1);
})();

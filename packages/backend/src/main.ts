import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { join } from "path";
import express from "express";
import { assinaturaValida } from "./utils/uploads-assinados";

async function bootstrap(): Promise<void> {
  /* Desabilitamos o bodyParser padrão para configurar limite maior (fotos mobile) */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false
  });

  /* Body parser com limite de 15 MB para suportar documentos/fotos em base64 */
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  /* Serve arquivos estáticos de uploads (fotos de ponto, etc.) */
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");
  /* Cabeçalhos básicos de segurança (HSTS fica no nginx, que termina o TLS). */
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  /* /uploads só é entregue com link assinado (emitido nas respostas da API a quem tem permissão). */
  app.use("/uploads", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const caminho = `/uploads${decodeURIComponent(req.path)}`;
    if (!assinaturaValida(caminho, req.query.e, req.query.s)) {
      res.status(403).json({ statusCode: 403, message: "Link de arquivo inválido ou expirado." });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  app.useStaticAssets(uploadDir, { prefix: "/uploads", dotfiles: "deny", index: false });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
}

bootstrap();

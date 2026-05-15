import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { join } from "path";
import express from "express";

async function bootstrap(): Promise<void> {
  /* Desabilitamos o bodyParser padrão para configurar limite maior (fotos mobile) */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false
  });

  /* Body parser com limite de 10 MB para suportar foto base64 (~200 KB típico) */
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  /* Serve arquivos estáticos de uploads (fotos de ponto, etc.) */
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");
  app.useStaticAssets(uploadDir, { prefix: "/uploads" });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();

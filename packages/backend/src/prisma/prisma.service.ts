import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

const MAX_RETRIES = 6;
const RETRY_DELAY_BASE_MS = 2_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.$connect();
        if (attempt > 1) this.logger.log(`Banco de dados conectado na tentativa ${attempt}.`);
        return;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          this.logger.error(`Falha ao conectar ao banco após ${MAX_RETRIES} tentativas.`);
          throw err;
        }
        const delayMs = RETRY_DELAY_BASE_MS * attempt;
        this.logger.warn(
          `Tentativa ${attempt}/${MAX_RETRIES} de conexão ao banco falhou. ` +
            `Aguardando ${delayMs / 1000}s... (${(err as Error).message})`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

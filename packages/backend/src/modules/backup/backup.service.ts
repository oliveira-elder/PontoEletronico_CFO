import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  async getNextJob(systemKey: string) {
    const job = await this.prisma.backupJob.findFirst({
      where: { systemKey, status: "PENDING" },
      orderBy: { scheduledAt: "asc" }
    });
    if (!job) return null;

    const runToken = randomBytes(32).toString("hex");
    const updated = await this.prisma.backupJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date(), runToken }
    });

    return {
      runId: updated.id,
      engine: updated.engine,
      backupMode: updated.backupMode,
      config: updated.config,
      token: runToken,
      scheduledAt: updated.scheduledAt
    };
  }

  async heartbeat(runId: string, token: string) {
    await this.assertRunToken(runId, token);
    await this.prisma.backupJob.update({
      where: { id: runId },
      data: { lastHeartbeat: new Date() }
    });
    return { ok: true };
  }

  async receiveArtifact(runId: string, token: string, filePath: string, fileSizeBytes: number) {
    await this.assertRunToken(runId, token);
    await this.prisma.backupJob.update({
      where: { id: runId },
      data: {
        status: "SUCCESS",
        completedAt: new Date(),
        artifactPath: filePath,
        artifactSize: fileSizeBytes,
        runToken: null
      }
    });
    return { ok: true, artifactPath: filePath };
  }

  async reportFailure(runId: string, token: string, message: string) {
    await this.assertRunToken(runId, token);
    await this.prisma.backupJob.update({
      where: { id: runId },
      data: { status: "FAILED", completedAt: new Date(), failureMsg: message, runToken: null }
    });
    return { ok: true };
  }

  async listJobs(systemKey?: string) {
    return this.prisma.backupJob.findMany({
      where: systemKey ? { systemKey } : undefined,
      orderBy: { scheduledAt: "desc" },
      take: 100
    });
  }

  async createManualJob(systemKey: string, engine: string, backupMode = "full") {
    return this.prisma.backupJob.create({
      data: {
        systemKey,
        engine,
        backupMode,
        scheduledAt: new Date()
      }
    });
  }

  /** JSON para colar no campo "Configuração de polling" do cadastro de sistemas no MonitorSistema */
  getMonitorPollingConfig() {
    const systemKey = process.env.API_PUBLICA_SYSTEM_KEY ?? "ponto-eletronico-cfo";
    const apiBaseUrl = (
      process.env.PUBLIC_API_BASE_URL ?? "https://192.168.100.30:12003/api"
    ).replace(/\/$/, "");
    const agentKeyConfigured = Boolean(process.env.BACKUP_AGENT_SHARED_KEY?.trim());
    const pgDumpFormat = process.env.BACKUP_PG_DUMP_FORMAT ?? "plain";
    const artifactBasename = process.env.BACKUP_ARTIFACT_BASENAME ?? "backup_sst";

    const pollingConfig = {
      schemaVersion: "v1",
      systemKey,
      apiBaseUrl,
      pollIntervalSeconds: 45,
      agentKeyHeader: "x-backup-agent-key",
      agentKey: agentKeyConfigured
        ? process.env.BACKUP_AGENT_SHARED_KEY
        : "<BACKUP_AGENT_SHARED_KEY>",
      engine: "postgresql",
      backupMode: "full",
      pgDumpFormat,
      artifactBasename,
      artifactExtension: pgDumpFormat === "plain" ? ".sql" : ".bin",
      artifactFileName:
        pgDumpFormat === "plain" ? `${artifactBasename}.sql` : `${artifactBasename}.bin`,
      maxUploadMb: parseInt(process.env.BACKUP_MAX_UPLOAD_MB ?? "512", 10),
      storagePath: process.env.BACKUP_STORAGE_PATH ?? "/data/backups",
      endpoints: {
        nextJob: `${apiBaseUrl}/backup-agent/jobs/next?systemKey=${systemKey}`,
        heartbeat: `${apiBaseUrl}/backup-agent/runs/{runId}/heartbeat`,
        artifact: `${apiBaseUrl}/backup-agent/runs/{runId}/artifact`,
        failure: `${apiBaseUrl}/backup-agent/runs/{runId}/failure`
      }
    };

    return {
      systemKey,
      apiBaseUrl,
      agentKeyConfigured,
      pollingConfig,
      pollingConfigJson: JSON.stringify(pollingConfig, null, 2),
      instructions:
        'No MonitorSistema, abra o cadastro do sistema e cole este JSON no campo "Configuração de polling (JSON)" ' +
        "da seção API de Backup. O agentKey deve ser o mesmo valor de BACKUP_AGENT_SHARED_KEY neste sistema e no Monitor."
    };
  }

  private async assertRunToken(runId: string, token: string) {
    const job = await this.prisma.backupJob.findUnique({ where: { id: runId } });
    if (!job) throw new NotFoundException("Job não encontrado.");
    if (job.runToken !== token) throw new BadRequestException("Token de run inválido.");
  }

  /* Cron para limpeza de artefatos com retenção expirada — executa à meia-noite */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredArtifacts() {
    const expiredJobs = await this.prisma.backupJob.findMany({
      where: { status: "SUCCESS", artifactPath: { not: null } }
    });

    const fs = await import("fs/promises");
    for (const job of expiredJobs) {
      const retainUntil = new Date(job.completedAt!);
      retainUntil.setDate(retainUntil.getDate() + job.retentionDays);
      if (new Date() > retainUntil && job.artifactPath) {
        await fs.unlink(job.artifactPath).catch(() => null);
        await this.prisma.backupJob.update({
          where: { id: job.id },
          data: { artifactPath: null }
        });
      }
    }
  }
}

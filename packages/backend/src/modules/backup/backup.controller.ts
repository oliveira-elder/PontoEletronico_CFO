import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Headers,
  UnauthorizedException,
  ForbiddenException,
  UseInterceptors,
  UseGuards,
  Res
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { join } from "path";
import { mkdirSync } from "fs";
import { Request, Response } from "express";
import { BackupService } from "./backup.service";

interface AuthRequest extends Request {
  user?: { isSuperAdmin?: boolean };
}

function assertAgentKey(headers: Record<string, string | string[] | undefined>) {
  const key = headers["x-backup-agent-key"] as string | undefined;
  const expected = process.env.BACKUP_AGENT_SHARED_KEY;
  if (expected && key !== expected) {
    throw new UnauthorizedException("x-backup-agent-key inválido ou ausente.");
  }
}

function extractBearerToken(authHeader?: string): string {
  if (!authHeader?.startsWith("Bearer ")) throw new UnauthorizedException("Token ausente.");
  return authHeader.slice(7);
}

@Controller()
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  /* Agente busca próximo job */
  @Get("backup-agent/jobs/next")
  async nextJob(@Req() req: Request, @Res() res: Response, @Query("systemKey") systemKey: string) {
    assertAgentKey(req.headers as Record<string, string | string[] | undefined>);
    const job = await this.backup.getNextJob(systemKey);
    if (!job) {
      return res.status(204).send();
    }
    return res.json(job);
  }

  /* Heartbeat durante backup longo */
  @Post("backup-agent/runs/:runId/heartbeat")
  async heartbeat(@Param("runId") runId: string, @Headers("authorization") auth: string) {
    return this.backup.heartbeat(runId, extractBearerToken(auth));
  }

  /* Upload do artefato de backup */
  @Post("backup-agent/runs/:runId/artifact")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (
          req: Request,
          _file: Express.Multer.File,
          cb: (err: Error | null, dest: string) => void
        ) => {
          const runId = (req.params as { runId: string }).runId;
          const dir = join(process.env.BACKUP_STORAGE_PATH ?? "/data/backups", runId);
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (
          _req: Request,
          file: Express.Multer.File,
          cb: (err: Error | null, name: string) => void
        ) => cb(null, file.originalname)
      }),
      limits: { fileSize: parseInt(process.env.BACKUP_MAX_UPLOAD_MB ?? "2048") * 1024 * 1024 }
    })
  )
  async uploadArtifact(
    @Param("runId") runId: string,
    @Headers("authorization") auth: string,
    @Body() _body: unknown,
    @Req() _req: Request
  ) {
    // O arquivo vem via @UploadedFile mas não podemos usar o decorator com os outros — lemos do req
    const file = (_req as Request & { file?: Express.Multer.File }).file;
    if (!file) throw new UnauthorizedException("Arquivo não recebido.");
    return this.backup.receiveArtifact(runId, extractBearerToken(auth), file.path, file.size);
  }

  /* Relatar falha */
  @Post("backup-agent/runs/:runId/failure")
  async failure(
    @Param("runId") runId: string,
    @Headers("authorization") auth: string,
    @Body("message") message: string
  ) {
    return this.backup.reportFailure(runId, extractBearerToken(auth), message);
  }

  /* Admin: listar jobs */
  @Get("logs/backup/jobs")
  @UseGuards(AuthGuard("jwt"))
  async listJobs(@Req() req: AuthRequest, @Query("systemKey") systemKey?: string) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.backup.listJobs(systemKey);
  }

  /* Admin: criar job manual */
  @Post("logs/backup/jobs")
  @UseGuards(AuthGuard("jwt"))
  async createJob(
    @Req() req: AuthRequest,
    @Body() body: { systemKey: string; engine: string; backupMode?: string }
  ) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.backup.createManualJob(body.systemKey, body.engine, body.backupMode);
  }

  /* Admin: JSON de polling para cadastro no MonitorSistema */
  @Get("logs/backup/polling-config")
  @UseGuards(AuthGuard("jwt"))
  pollingConfig(@Req() req: AuthRequest) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.backup.getMonitorPollingConfig();
  }
}

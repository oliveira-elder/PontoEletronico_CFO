import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Query,
  HttpCode,
  UnauthorizedException,
  Req,
  ForbiddenException,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { IngestService } from "./ingest.service";
import { IngestEventDto } from "./dto/ingest-event.dto";
import { MonitorDestinationService } from "./monitor-destination.service";
import { MonitorAuditIngestService } from "./monitor-audit-ingest.service";
import { SaveMonitorDestinationDto } from "./dto/save-monitor-destination.dto";

interface AuthRequest extends Request {
  user?: { isSuperAdmin?: boolean };
}

@Controller()
export class IngestController {
  constructor(
    private readonly ingest: IngestService,
    private readonly monitorDest: MonitorDestinationService,
    private readonly monitorAudit: MonitorAuditIngestService
  ) {}

  @Post("ingest/push-http")
  @HttpCode(202)
  async pushHttp(@Req() req: Request, @Body() dto: IngestEventDto) {
    const key = req.headers["x-ingest-key"] as string | undefined;
    const expected = process.env.INGEST_SHARED_KEY;
    if (expected && key !== expected) {
      throw new UnauthorizedException("x-ingest-key inválido ou ausente.");
    }
    return this.ingest.pushHttp(dto);
  }

  @Get("logs/ingest/events")
  @UseGuards(AuthGuard("jwt"))
  async listEvents(
    @Req() req: AuthRequest,
    @Query("systemKey") systemKey?: string,
    @Query("limit") limit?: string
  ) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.ingest.listEvents(systemKey, limit ? parseInt(limit) : 100);
  }

  @Get("logs/ingest/config")
  @UseGuards(AuthGuard("jwt"))
  getConfig(@Req() req: AuthRequest) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.monitorDest.getConfig();
  }

  @Get("logs/ingest/local-ip")
  @UseGuards(AuthGuard("jwt"))
  getLocalIp(@Req() req: AuthRequest) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return { ip: this.monitorDest.getLocalIpv4() };
  }

  @Put("logs/ingest/destination")
  @UseGuards(AuthGuard("jwt"))
  saveDestination(@Req() req: AuthRequest, @Body() dto: SaveMonitorDestinationDto) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.monitorDest.saveDestination(dto);
  }

  @Delete("logs/ingest/destination")
  @UseGuards(AuthGuard("jwt"))
  removeDestination(@Req() req: AuthRequest) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.monitorDest.removePanelOverride();
  }

  @Post("logs/ingest/test-connection")
  @UseGuards(AuthGuard("jwt"))
  async testConnection(@Req() req: AuthRequest) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.monitorAudit.testConnectivity();
  }

  @Get("logs/ingest/polling-config")
  @UseGuards(AuthGuard("jwt"))
  getPollingConfig(@Req() req: AuthRequest) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
    return this.monitorDest.getMonitorCadastroConfig();
  }
}

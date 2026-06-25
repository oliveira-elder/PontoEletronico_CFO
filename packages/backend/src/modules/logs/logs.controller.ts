import {
  Controller,
  Get,
  Query,
  Res,
  Req,
  ForbiddenException,
  Sse,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Observable, interval, map, merge } from "rxjs";
import { Response, Request } from "express";
import { LogsService } from "./logs.service";
import { LogsSseService } from "./logs.sse.service";
import { FilterLogsDto } from "./dto/filter-logs.dto";

interface AuthRequest extends Request {
  user?: { isSuperAdmin?: boolean };
}

function assertSuperAdmin(req: AuthRequest) {
  if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
}

@Controller("logs")
@UseGuards(AuthGuard("jwt"))
export class LogsController {
  constructor(
    private readonly logs: LogsService,
    private readonly sse: LogsSseService
  ) {}

  @Get("entries")
  async entries(@Req() req: AuthRequest, @Query() filter: FilterLogsDto) {
    assertSuperAdmin(req);
    return this.logs.listEntries(filter);
  }

  @Get("dashboard")
  async dashboard(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.logs.getDashboard();
  }

  @Get("performance")
  async performance(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.logs.getPerformance();
  }

  @Get("metrics/system")
  systemMetrics(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.logs.getSystemMetrics();
  }

  @Get("export/csv")
  async exportCsv(@Req() req: AuthRequest, @Query() filter: FilterLogsDto, @Res() res: Response) {
    assertSuperAdmin(req);
    return this.logs.exportCsv(filter, res);
  }

  @Sse("stream")
  stream(@Req() req: AuthRequest): Observable<MessageEvent> {
    assertSuperAdmin(req);

    // Heartbeat a cada 15s para evitar timeout de proxy
    const heartbeat$ = interval(15000).pipe(
      map(() => new MessageEvent("heartbeat", { data: JSON.stringify({ ts: Date.now() }) }))
    );

    return merge(this.sse.events$, heartbeat$);
  }
}

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FilterLogsDto } from "./dto/filter-logs.dto";
import { Response } from "express";
import { formatDateTimeBrasilia } from "../../utils/horario-brasilia";

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(f: FilterLogsDto) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};
    if (f.category) where.category = f.category;
    if (f.method) where.method = f.method.toUpperCase();
    if (f.statusCode) where.statusCode = f.statusCode;
    if (f.username) where.username = { contains: f.username, mode: "insensitive" };
    if (f.path) where.path = { contains: f.path, mode: "insensitive" };
    if (f.tracker) where.tracker = f.tracker;
    if (f.from || f.to) {
      where.createdAt = {};
      if (f.from) where.createdAt.gte = new Date(f.from);
      if (f.to) where.createdAt.lte = new Date(f.to);
    }
    return where;
  }

  async listEntries(f: FilterLogsDto) {
    const limit = f.limit ?? 50;
    const page = f.page ?? 0;
    const where = this.buildWhere(f);

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page * limit,
        take: limit,
        select: {
          id: true,
          tracker: true,
          category: true,
          method: true,
          path: true,
          action: true,
          statusCode: true,
          durationMs: true,
          ipAddress: true,
          username: true,
          actorUserId: true,
          payload: true,
          createdAt: true
        }
      })
    ]);

    return { total, page, limit, items };
  }

  async getDashboard() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [volumeDiario, categoryCounts, topPaths, topUsers, totals] = await Promise.all([
      // Volume diário por categoria nos últimos 30 dias
      // Usa "createdAt" com aspas pois Prisma cria colunas camelCase no PostgreSQL
      this.prisma.$queryRaw<{ date: string; category: string; count: bigint }[]>`
        SELECT TO_CHAR(DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') as date,
               category,
               COUNT(*) as count
        FROM "AuditLog"
        WHERE "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("createdAt" AT TIME ZONE 'America/Sao_Paulo'), category
        ORDER BY date ASC
      `,

      // Contagem por categoria (total)
      this.prisma.auditLog.groupBy({
        by: ["category"],
        _count: { id: true },
        where: { createdAt: { gte: thirtyDaysAgo } }
      }),

      // Top 10 paths
      this.prisma.$queryRaw<{ path: string; count: bigint }[]>`
        SELECT path, COUNT(*) as count
        FROM "AuditLog"
        WHERE "createdAt" >= ${thirtyDaysAgo} AND path IS NOT NULL
        GROUP BY path
        ORDER BY count DESC
        LIMIT 10
      `,

      // Top 10 usuários
      this.prisma.$queryRaw<{ username: string; count: bigint }[]>`
        SELECT username, COUNT(*) as count
        FROM "AuditLog"
        WHERE "createdAt" >= ${thirtyDaysAgo} AND username IS NOT NULL
        GROUP BY username
        ORDER BY count DESC
        LIMIT 10
      `,

      // Totais globais
      this.prisma.auditLog.aggregate({
        _count: { id: true },
        _avg: { durationMs: true },
        where: { createdAt: { gte: thirtyDaysAgo } }
      })
    ]);

    return {
      volumeDiario: volumeDiario.map((r) => ({
        date: String(r.date).slice(0, 10),
        category: r.category,
        count: Number(r.count)
      })),
      categoryCounts: categoryCounts.map((c) => ({
        category: c.category,
        count: c._count.id
      })),
      topPaths: topPaths.map((r) => ({ path: r.path, count: Number(r.count) })),
      topUsers: topUsers.map((r) => ({ username: r.username, count: Number(r.count) })),
      totalRequests: totals._count.id,
      avgLatencyMs: Math.round(totals._avg.durationMs ?? 0)
    };
  }

  async getPerformance() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [volumePorHora, latenciaPorHora, percentis, taxaErro] = await Promise.all([
      // Volume por hora nas últimas 24h
      this.prisma.$queryRaw<{ hour: Date; count: bigint }[]>`
        SELECT (DATE_TRUNC('hour', "createdAt" AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') as hour,
               COUNT(*) as count
        FROM "AuditLog"
        WHERE "createdAt" >= ${twentyFourHoursAgo}
        GROUP BY DATE_TRUNC('hour', "createdAt" AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY hour ASC
      `,

      // Latência média por hora
      this.prisma.$queryRaw<{ hour: Date; avg_ms: number | null }[]>`
        SELECT (DATE_TRUNC('hour', "createdAt" AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') as hour,
               AVG("durationMs") as avg_ms
        FROM "AuditLog"
        WHERE "createdAt" >= ${twentyFourHoursAgo} AND "durationMs" IS NOT NULL
        GROUP BY DATE_TRUNC('hour', "createdAt" AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY hour ASC
      `,

      // P50, P95, Max
      this.prisma.$queryRaw<{ p50: number | null; p95: number | null; max_ms: number | null }[]>`
        SELECT
          PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY "durationMs") as p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "durationMs") as p95,
          MAX("durationMs") as max_ms
        FROM "AuditLog"
        WHERE "createdAt" >= ${twentyFourHoursAgo} AND "durationMs" IS NOT NULL
      `,

      // Taxa de erro
      this.prisma.$queryRaw<{ total: bigint; errors: bigint; failures: bigint }[]>`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN category = 'ERROR' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN category = 'FAILURE' THEN 1 ELSE 0 END) as failures
        FROM "AuditLog"
        WHERE "createdAt" >= ${twentyFourHoursAgo}
      `
    ]);

    const p = percentis[0] ?? { p50: null, p95: null, max_ms: null };
    const t = taxaErro[0] ?? { total: 0n, errors: 0n, failures: 0n };
    const total = Number(t.total);
    const errors = Number(t.errors);
    const failures = Number(t.failures);

    return {
      volumePorHora: volumePorHora.map((r) => ({
        hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
        count: Number(r.count)
      })),
      latenciaPorHora: latenciaPorHora.map((r) => ({
        hour: r.hour instanceof Date ? r.hour.toISOString() : String(r.hour),
        avgMs: Math.round(Number(r.avg_ms ?? 0))
      })),
      p50: Math.round(Number(p.p50 ?? 0)),
      p95: Math.round(Number(p.p95 ?? 0)),
      maxMs: Math.round(Number(p.max_ms ?? 0)),
      totalRequests: total,
      totalErrors: errors,
      totalFailures: failures,
      taxaErro: total > 0 ? ((errors / total) * 100).toFixed(2) : "0.00",
      taxaFalha: total > 0 ? ((failures / total) * 100).toFixed(2) : "0.00"
    };
  }

  getSystemMetrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      memoryHeapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      cpuUserMs: Math.round(cpu.user / 1000),
      cpuSystemMs: Math.round(cpu.system / 1000),
      timestamp: new Date().toISOString()
    };
  }

  async exportCsv(f: FilterLogsDto, res: Response): Promise<void> {
    const where = this.buildWhere(f);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="logs-${Date.now()}.csv"`);

    const header =
      "timestamp,tracker,category,method,path,statusCode,durationMs,username,ipAddress\n";
    res.write("﻿" + header); // BOM para UTF-8 no Excel

    const BATCH = 500;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const rows = await this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          createdAt: true,
          tracker: true,
          category: true,
          method: true,
          path: true,
          statusCode: true,
          durationMs: true,
          username: true,
          ipAddress: true
        }
      });

      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      hasMore = rows.length === BATCH;

      const chunk = rows
        .map((r) =>
          [
            formatDateTimeBrasilia(r.createdAt),
            r.tracker ?? "",
            r.category,
            r.method ?? "",
            `"${(r.path ?? "").replace(/"/g, '""')}"`,
            r.statusCode ?? "",
            r.durationMs ?? "",
            r.username ?? "",
            r.ipAddress ?? ""
          ].join(",")
        )
        .join("\n");

      res.write(chunk + "\n");
    }

    res.end();
  }
}

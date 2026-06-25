import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { IngestEventDto } from "./dto/ingest-event.dto";

@Injectable()
export class IngestService {
  constructor(private readonly prisma: PrismaService) {}

  async pushHttp(dto: IngestEventDto) {
    const existing = await this.prisma.ingestEvent.findUnique({
      where: { eventId: dto.eventId },
      select: { id: true }
    });

    if (existing) {
      // Idempotência: mesmo eventId já processado
      return { received: true, duplicate: true };
    }

    await this.prisma.ingestEvent.create({
      data: {
        eventId: dto.eventId,
        schemaVersion: dto.schemaVersion,
        timestamp: new Date(dto.timestamp),
        systemKey: dto.systemKey,
        environment: dto.environment,
        serviceName: dto.serviceName,
        operation: dto.operation,
        status: dto.status,
        severity: dto.severity,
        message: dto.message,
        errorCode: dto.errorCode ?? null,
        traceId: dto.traceId ?? null,
        correlationId: dto.correlationId ?? null,
        redirectUrl: dto.redirectUrl ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userContext: (dto.userContext as any) ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: (dto.metadata as any) ?? null
      }
    });

    return { received: true, duplicate: false };
  }

  async listEvents(systemKey?: string, limit = 100) {
    return this.prisma.ingestEvent.findMany({
      where: systemKey ? { systemKey } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }
}

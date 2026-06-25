import { Module } from "@nestjs/common";
import { IngestController } from "./ingest.controller";
import { IngestService } from "./ingest.service";
import { MonitorDestinationService } from "./monitor-destination.service";
import { MonitorAuditIngestService } from "./monitor-audit-ingest.service";

@Module({
  controllers: [IngestController],
  providers: [IngestService, MonitorDestinationService, MonitorAuditIngestService],
  exports: [MonitorAuditIngestService]
})
export class IngestModule {}

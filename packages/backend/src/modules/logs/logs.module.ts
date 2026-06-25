import { Module, Global } from "@nestjs/common";
import { LogsController } from "./logs.controller";
import { LogsService } from "./logs.service";
import { LogsSseService } from "./logs.sse.service";

@Global()
@Module({
  controllers: [LogsController],
  providers: [LogsService, LogsSseService],
  exports: [LogsSseService]
})
export class LogsModule {}

import { Module } from "@nestjs/common";
import { ApiTokensController, PublicApiController } from "./api-servidora.controller";
import { ApiServidoraService } from "./api-servidora.service";
import { ApiTokenGuard } from "./guards/api-token.guard";

@Module({
  controllers: [ApiTokensController, PublicApiController],
  providers: [ApiServidoraService, ApiTokenGuard]
})
export class ApiServidoraModule {}

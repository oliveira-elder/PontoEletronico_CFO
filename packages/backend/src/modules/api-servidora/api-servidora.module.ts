import { Module } from "@nestjs/common";
import {
  ApiTokensController,
  PublicApiController,
  ApiServidoraAdminController
} from "./api-servidora.controller";
import { ApiServidoraService } from "./api-servidora.service";
import { ApiTokenGuard } from "./guards/api-token.guard";

@Module({
  controllers: [ApiTokensController, PublicApiController, ApiServidoraAdminController],
  providers: [ApiServidoraService, ApiTokenGuard],
  exports: [ApiServidoraService]
})
export class ApiServidoraModule {}

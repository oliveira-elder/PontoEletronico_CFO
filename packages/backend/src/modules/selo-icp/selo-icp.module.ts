import { Module } from "@nestjs/common";
import { SeloIcpService } from "./selo-icp.service";

@Module({
  providers: [SeloIcpService],
  exports: [SeloIcpService]
})
export class SeloIcpModule {}

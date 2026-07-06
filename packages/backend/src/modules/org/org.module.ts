import { Module } from "@nestjs/common";
import { OrgController } from "./org.controller";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [OrgController]
})
export class OrgModule {}

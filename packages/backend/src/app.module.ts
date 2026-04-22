import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { OrgModule } from "./modules/org/org.module";
import { AreaModulesModule } from "./modules/area-modules/area-modules.module";
import { ContentModule } from "./modules/content/content.module";
import { GlpiModule } from "./modules/glpi/glpi.module";
import { ChatModule } from "./modules/chat/chat.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    OrgModule,
    AreaModulesModule,
    ContentModule,
    GlpiModule,
    ChatModule,
    RealtimeModule
  ]
})
export class AppModule {}

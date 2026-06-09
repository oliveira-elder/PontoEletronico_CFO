import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditLogInterceptor } from "./interceptors/audit-log.interceptor";
import { AuthModule } from "./modules/auth/auth.module";
import { OrgModule } from "./modules/org/org.module";
import { AreaModulesModule } from "./modules/area-modules/area-modules.module";
import { ContentModule } from "./modules/content/content.module";
import { GlpiModule } from "./modules/glpi/glpi.module";
import { ChatModule } from "./modules/chat/chat.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { PontoModule } from "./modules/ponto/ponto.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuditoriaModule } from "./modules/auditoria/auditoria.module";
import { ExtensionsModule } from "./modules/extensions/extensions.module";

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
    RealtimeModule,
    PontoModule,
    AdminModule,
    AuditoriaModule,
    ExtensionsModule
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor }]
})
export class AppModule {}

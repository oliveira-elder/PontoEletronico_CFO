import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, APP_FILTER } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { RepModule } from "./modules/rep/rep.module";
import { ArquivosFiscaisModule } from "./modules/arquivos-fiscais/arquivos-fiscais.module";
import { ComprovanteModule } from "./modules/comprovante/comprovante.module";
import { TermosUsoModule } from "./modules/termos-uso/termos-uso.module";
import { AuditLogInterceptor } from "./interceptors/audit-log.interceptor";
import { AuditLogWriterService } from "./common/audit-log-writer.service";
import { AuthFailureLogFilter } from "./interceptors/auth-failure-log.filter";
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
import { RequisicaoRhModule } from "./modules/requisicao-rh/requisicao-rh.module";
import { SaudeOcupacionalModule } from "./modules/saude-ocupacional/saude-ocupacional.module";
import { LogsModule } from "./modules/logs/logs.module";
import { IngestModule } from "./modules/ingest/ingest.module";
import { BackupModule } from "./modules/backup/backup.module";
import { ApiServidoraModule } from "./modules/api-servidora/api-servidora.module";
import { AssinaturaModule } from "./modules/assinatura/assinatura.module";
import { NotificacaoModule } from "./modules/notificacao/notificacao.module";
import { SistemaModule } from "./modules/sistema/sistema.module";
import { PerfisRhModule } from "./modules/perfis-rh/perfis-rh.module";

@Module({
  imports: [
    RepModule,
    ArquivosFiscaisModule,
    ComprovanteModule,
    TermosUsoModule,
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
    LogsModule,
    PontoModule,
    AdminModule,
    AuditoriaModule,
    ExtensionsModule,
    RequisicaoRhModule,
    SaudeOcupacionalModule,
    IngestModule,
    BackupModule,
    ApiServidoraModule,
    AssinaturaModule,
    NotificacaoModule,
    SistemaModule,
    PerfisRhModule
  ],
  providers: [
    AuditLogWriterService,
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_FILTER, useClass: AuthFailureLogFilter }
  ]
})
export class AppModule {}

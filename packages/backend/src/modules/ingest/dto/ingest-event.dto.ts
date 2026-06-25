import { IsString, IsDateString, IsIn, IsOptional, IsObject } from "class-validator";

export class IngestEventDto {
  @IsString() eventId!: string;
  @IsIn(["v1"]) schemaVersion!: string;
  @IsDateString() timestamp!: string;
  @IsString() systemKey!: string;
  @IsIn(["dev", "homolog", "prod"]) environment!: string;
  @IsString() serviceName!: string;
  @IsString() operation!: string;
  @IsIn(["SUCCESS", "FAILURE", "ERROR"]) status!: string;
  @IsIn(["INFO", "WARN", "ERROR", "CRITICAL"]) severity!: string;
  @IsString() message!: string;

  @IsOptional() @IsString() errorCode?: string;
  @IsOptional() @IsString() traceId?: string;
  @IsOptional() @IsString() correlationId?: string;
  @IsOptional() @IsString() redirectUrl?: string;
  @IsOptional() @IsObject() userContext?: Record<string, unknown>;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

import { IsOptional, IsString, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class FilterLogsDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsInt() @Type(() => Number) statusCode?: number;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() path?: string;
  @IsOptional() @IsString() tracker?: string;
  /** Busca livre: casa com path/ação/usuário OU com o assunto do endpoint no catálogo
   *  (ex.: "aprovar solicitação" encontra os endpoints de aprovação mesmo sem o
   *  usuário conhecer a URL exata). */
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) @Type(() => Number) limit?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) page?: number;
}

import { IsOptional, IsString, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class FilterLogsDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsInt() @Type(() => Number) statusCode?: number;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() path?: string;
  @IsOptional() @IsString() tracker?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) @Type(() => Number) limit?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) page?: number;
}

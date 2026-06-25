import { IsEnum, IsOptional, IsNumber, IsString, Min, Max } from "class-validator";

export enum TipoPontoDto {
  ENTRADA = "ENTRADA",
  INICIO_INTERVALO = "INICIO_INTERVALO",
  FIM_INTERVALO = "FIM_INTERVALO",
  SAIDA = "SAIDA",
  INTERROMPER_EXPEDIENTE = "INTERROMPER_EXPEDIENTE",
  REINICIAR_EXPEDIENTE = "REINICIAR_EXPEDIENTE"
}

export enum OrigemPontoDto {
  WEB = "WEB",
  MOBILE = "MOBILE",
  DESKTOP = "DESKTOP",
  TOTEM = "TOTEM"
}

export class CreateRegistroDto {
  @IsEnum(TipoPontoDto)
  tipo!: TipoPontoDto;

  @IsOptional()
  @IsEnum(OrigemPontoDto)
  origem?: OrigemPontoDto;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsString()
  fotoBase64?: string;

  @IsOptional()
  @IsString()
  modoRegistro?: string;
}

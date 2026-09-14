import { IsEnum, IsOptional, IsNumber, IsString, Min, Max, IsIn } from "class-validator";

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

/** Origem do dispositivo + modos de trabalho enviados por clientes antigos no campo origem. */
export const ORIGENS_REGISTRO_ACEITAS = [
  "WEB",
  "MOBILE",
  "DESKTOP",
  "TOTEM",
  "HIBRIDO",
  "VIAGEM",
  "HOME_OFFICE"
] as const;

export class CreateRegistroDto {
  @IsEnum(TipoPontoDto)
  tipo!: TipoPontoDto;

  @IsOptional()
  @IsIn(ORIGENS_REGISTRO_ACEITAS)
  origem?: string;

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
  @IsNumber()
  @Min(0)
  precisaoMetros?: number;

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

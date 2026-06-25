import { IsIn, IsInt, IsString, Max, Min } from "class-validator";

export class SaveMonitorDestinationDto {
  @IsIn(["http", "https"])
  scheme!: "http" | "https";

  @IsString()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;
}

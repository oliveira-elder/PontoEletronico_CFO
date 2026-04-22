export type SystemArea = "RH" | "TI" | "FINANCEIRO" | "GERAL";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  areaCodes: SystemArea[];
}

export interface PublicationRuleDto {
  moduleCode: string;
  areaCode: SystemArea;
  allowPublicIndex: boolean;
}

export interface ChatRequestDto {
  areaCode?: SystemArea;
  message: string;
}

export interface ChatResponseDto {
  source: "global" | "area" | "fallback";
  answer: string;
}

import { Injectable } from "@nestjs/common";

interface ChatRule {
  areaCode?: string;
  intent: string;
  patterns: string[];
  answer: string;
}

@Injectable()
export class ChatService {
  private rules: ChatRule[] = [
    {
      intent: "beneficios",
      patterns: ["beneficio", "plano de saude", "vale"],
      answer: "Consulte o modulo RH > Beneficios para regras atualizadas."
    },
    {
      areaCode: "TI",
      intent: "senha",
      patterns: ["senha", "acesso", "login"],
      answer: "Para TI: abra chamado de reset de senha no GLPI com prioridade normal."
    }
  ];

  answer(message: string, areaCode?: string) {
    const normalized = message.toLowerCase();
    const byArea = this.rules
      .filter((rule) => !rule.areaCode || rule.areaCode === areaCode)
      .find((rule) => rule.patterns.some((pattern) => normalized.includes(pattern)));

    if (byArea) {
      return {
        source: byArea.areaCode ? "area" : "global",
        answer: byArea.answer
      };
    }

    return {
      source: "fallback",
      answer: "Nao encontrei uma resposta direta. Deseja abrir chamado no GLPI?"
    };
  }
}

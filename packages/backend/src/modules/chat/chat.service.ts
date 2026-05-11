import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async answer(message: string, areaCode?: string) {
    const normalized = message.toLowerCase();

    /* Carrega regras do banco; se areaCode foi informado,
       traz regras globais (areaId null) + regras dessa área. */
    const rules = await this.prisma.chatRule.findMany({
      where: areaCode ? { OR: [{ areaId: null }, { area: { code: areaCode } }] } : { areaId: null },
      include: { intent: true, area: { select: { code: true } } },
      orderBy: { priority: "asc" }
    });

    const match = rules.find((r) =>
      r.intent.patterns.some((p) => normalized.includes(p.toLowerCase()))
    );

    if (match) {
      return {
        source: match.areaId ? "area" : "global",
        answer: match.answer
      };
    }

    return {
      source: "fallback",
      answer: "Nao encontrei uma resposta direta. Deseja abrir chamado no GLPI?"
    };
  }
}

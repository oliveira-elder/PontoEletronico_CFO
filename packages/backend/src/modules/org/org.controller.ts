import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("org")
export class OrgController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("areas")
  listAreas() {
    return this.prisma.area.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" }
    });
  }
}

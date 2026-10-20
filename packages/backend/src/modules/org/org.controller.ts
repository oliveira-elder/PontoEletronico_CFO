import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import { PrismaService } from "../../prisma/prisma.service";

@Controller("org")
@UseGuards(AuthGuard("jwt"))
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

import { Controller, Get } from "@nestjs/common";

@Controller("org")
export class OrgController {
  @Get("areas")
  listAreas() {
    return [
      { code: "RH", name: "Recursos Humanos" },
      { code: "TI", name: "Tecnologia da Informacao" },
      { code: "FINANCEIRO", name: "Financeiro" }
    ];
  }
}

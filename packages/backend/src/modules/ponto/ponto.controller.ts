import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PontoService } from "./ponto.service";
import { CreateRegistroDto } from "./dto/create-registro.dto";

@Controller("ponto")
@UseGuards(AuthGuard("jwt"))
export class PontoController {
  constructor(private readonly pontoService: PontoService) {}

  /** GET /api/ponto/status — estado atual do usuário logado */
  @Get("status")
  getStatus(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getStatusAtual(req.user.sub);
  }

  /** POST /api/ponto/registros — bater ponto */
  @Post("registros")
  baterPonto(@Req() req: { user: { sub: string } }, @Body() dto: CreateRegistroDto) {
    return this.pontoService.baterPonto(req.user.sub, dto);
  }

  /** GET /api/ponto/historico?mes=5&ano=2026 */
  @Get("historico")
  getHistorico(
    @Req() req: { user: { sub: string } },
    @Query("mes", new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) mes: number,
    @Query("ano", new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) ano: number
  ) {
    return this.pontoService.getHistorico(req.user.sub, mes, ano);
  }

  /** GET /api/ponto/relatorio?mes=5&ano=2026 */
  @Get("relatorio")
  getRelatorio(
    @Req() req: { user: { sub: string } },
    @Query("mes", new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) mes: number,
    @Query("ano", new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) ano: number
  ) {
    return this.pontoService.getRelatorio(req.user.sub, mes, ano);
  }

  /** GET /api/ponto/solicitacoes */
  @Get("solicitacoes")
  getSolicitacoes(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getSolicitacoes(req.user.sub);
  }

  /** POST /api/ponto/solicitacoes */
  @Post("solicitacoes")
  criarSolicitacao(
    @Req() req: { user: { sub: string } },
    @Body() body: { tipo: string; dataReferencia: string; descricao: string }
  ) {
    return this.pontoService.criarSolicitacao(req.user.sub, body);
  }
}

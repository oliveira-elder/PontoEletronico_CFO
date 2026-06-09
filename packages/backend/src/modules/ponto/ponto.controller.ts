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
import { FeriadosService } from "./feriados.service";
import { CreateRegistroDto } from "./dto/create-registro.dto";

@Controller("ponto")
@UseGuards(AuthGuard("jwt"))
export class PontoController {
  constructor(
    private readonly pontoService: PontoService,
    private readonly feriadosService: FeriadosService
  ) {}

  @Get("status")
  getStatus(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getStatusAtual(req.user.sub);
  }

  @Post("registros")
  baterPonto(@Req() req: { user: { sub: string } }, @Body() dto: CreateRegistroDto) {
    return this.pontoService.baterPonto(req.user.sub, dto);
  }

  @Get("historico")
  getHistorico(
    @Req() req: { user: { sub: string } },
    @Query("mes", new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) mes: number,
    @Query("ano", new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) ano: number
  ) {
    return this.pontoService.getHistorico(req.user.sub, mes, ano);
  }

  @Get("relatorio")
  getRelatorio(
    @Req() req: { user: { sub: string } },
    @Query("mes", new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) mes: number,
    @Query("ano", new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) ano: number
  ) {
    return this.pontoService.getRelatorio(req.user.sub, mes, ano);
  }

  @Get("solicitacoes")
  getSolicitacoes(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getSolicitacoes(req.user.sub);
  }

  @Post("solicitacoes")
  criarSolicitacao(
    @Req() req: { user: { sub: string } },
    @Body()
    body: {
      tipo: string;
      dataReferencia: string;
      dataInicio?: string;
      dataFim?: string;
      descricao: string;
      metadados?: Record<string, unknown>;
    }
  ) {
    return this.pontoService.criarSolicitacao(req.user.sub, body);
  }

  @Get("registros-do-dia")
  getRegistrosDoDia(@Req() req: { user: { sub: string } }, @Query("data") data: string) {
    return this.pontoService.getRegistrosDoDia(req.user.sub, data);
  }

  @Get("feriados")
  getFeriados(@Query("ano") anoStr?: string) {
    const ano = anoStr ? parseInt(anoStr) : new Date().getFullYear();
    return this.feriadosService.getFeriadosDoAno(ano);
  }

  @Post("minha-foto/solicitar-atualizacao")
  solicitarAtualizacaoFoto(@Req() req: { user: { sub: string } }) {
    return this.pontoService.solicitarAtualizacaoFotoPerfil(req.user.sub);
  }
}

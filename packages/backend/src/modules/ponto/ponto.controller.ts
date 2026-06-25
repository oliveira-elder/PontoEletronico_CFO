import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
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
import { FeriadoConfigService } from "./feriado-config.service";
import { CreateRegistroDto } from "./dto/create-registro.dto";

@Controller("ponto")
@UseGuards(AuthGuard("jwt"))
export class PontoController {
  constructor(
    private readonly pontoService: PontoService,
    private readonly feriadosService: FeriadosService,
    private readonly feriadoConfigService: FeriadoConfigService
  ) {}

  @Get("meu-perfil")
  getMeuPerfil(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getMeuPerfil(req.user.sub);
  }

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

  @Get("banco-horas")
  getBancoHoras(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getBancoHoras(req.user.sub);
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

  @Patch("solicitacoes/:id/documento-retorno")
  enviarDocumentoRetorno(
    @Req() req: { user: { sub: string } },
    @Param("id") id: string,
    @Body() body: { documentoBase64: string; mimeType?: string }
  ) {
    return this.pontoService.enviarDocumentoRetorno(
      req.user.sub,
      id,
      body.documentoBase64,
      body.mimeType
    );
  }

  @Patch("solicitacoes/:id/documento")
  editarDocumento(
    @Req() req: { user: { sub: string } },
    @Param("id") id: string,
    @Body() body: { documentoBase64: string; mimeType?: string }
  ) {
    return this.pontoService.editarDocumentoSolicitacao(
      req.user.sub,
      id,
      body.documentoBase64,
      body.mimeType
    );
  }

  @Get("registros-do-dia")
  getRegistrosDoDia(@Req() req: { user: { sub: string } }, @Query("data") data: string) {
    return this.pontoService.getRegistrosDoDia(req.user.sub, data);
  }

  @Get("feriado-hoje")
  getFeriadoHoje(): Promise<{ bloqueado: boolean; nome?: string }> {
    return this.feriadoConfigService.isBloqueado(new Date());
  }

  @Get("feriados")
  getFeriados(@Query("ano") anoStr?: string) {
    const ano = anoStr ? parseInt(anoStr) : new Date().getFullYear();
    return this.feriadosService.getFeriadosDoAno(ano);
  }

  @Get("ferias/saldo")
  getSaldoFerias(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getSaldoFerias(req.user.sub);
  }

  @Get("requerimento-endereco")
  getRequerimentoEndereco(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getRequerimentoEndereco(req.user.sub);
  }

  @Post("requerimento-endereco/responder")
  responderRequerimentoEndereco(
    @Req() req: { user: { sub: string } },
    @Body()
    body: {
      cep?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      lat?: number | null;
      lng?: number | null;
    }
  ) {
    return this.pontoService.responderRequerimentoEndereco(req.user.sub, body);
  }

  @Post("minha-foto/solicitar-atualizacao")
  solicitarAtualizacaoFoto(@Req() req: { user: { sub: string } }) {
    return this.pontoService.solicitarAtualizacaoFotoPerfil(req.user.sub);
  }

  @Get("documentos-rh")
  listarDocumentosRh(@Req() req: { user: { sub: string } }) {
    return this.pontoService.listarDocumentosRh(req.user.sub);
  }

  @Post("documentos-rh")
  enviarDocumentoRh(
    @Req() req: { user: { sub: string } },
    @Body()
    body: {
      descricao: string;
      arquivoBase64: string;
      mimeType?: string;
      nomeArquivo?: string;
    }
  ) {
    return this.pontoService.enviarDocumentoRh(req.user.sub, body);
  }
}

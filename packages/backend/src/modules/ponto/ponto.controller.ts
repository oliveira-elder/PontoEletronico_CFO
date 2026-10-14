import {
  metaAssinaturaDaRequisicao,
  type RequisicaoComOrigem
} from "../../common/assinatura-request.util";
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
    @Req() req: { user: { sub: string; isSuperAdmin?: boolean } },
    @Query("mes", new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) mes: number,
    @Query("ano", new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) ano: number
  ) {
    return this.pontoService.getHistorico(req.user.sub, mes, ano, !!req.user.isSuperAdmin);
  }

  @Get("relatorio")
  getRelatorio(
    @Req() req: { user: { sub: string; isSuperAdmin?: boolean } },
    @Query("mes", new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) mes: number,
    @Query("ano", new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) ano: number
  ) {
    return this.pontoService.getRelatorio(req.user.sub, mes, ano, !!req.user.isSuperAdmin);
  }

  @Get("banco-horas")
  getBancoHoras(@Req() req: { user: { sub: string } }, @Query("cicloInicio") cicloInicio?: string) {
    return this.pontoService.getBancoHoras(req.user.sub, cicloInicio);
  }

  @Get("abono/cota")
  getCotaAbono(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getCotaAbono(req.user.sub);
  }

  @Get("banco-horas/credito")
  getCreditoBanco(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getCreditoBanco(req.user.sub);
  }

  @Post("banco-horas/credito/simular")
  simularCreditoBanco(
    @Req() req: { user: { sub: string } },
    @Body()
    body: {
      periodos: Array<{
        dataInicio: string;
        dataFim?: string;
        horarioInicio?: string | null;
        horarioFim?: string | null;
      }>;
    }
  ) {
    return this.pontoService.simularCreditoBanco(req.user.sub, body);
  }

  @Get("licenca/tipos")
  getTiposLicenca(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getTiposLicenca(req.user.sub);
  }

  @Get("solicitacoes")
  getSolicitacoes(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getSolicitacoes(req.user.sub);
  }

  @Get("atestado-do-dia")
  getAtestadoDoDia(@Req() req: { user: { sub: string } }, @Query("data") data: string) {
    return this.pontoService.getMeuAtestadoDoDia(req.user.sub, data);
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

  /** Funcionário assina pelo sistema um documento de férias (índice na lista do RH). */
  @Post("solicitacoes/:id/ferias/documentos/:indice/assinar")
  assinarDocumentoFerias(
    @Req() req: { user: { sub: string } } & RequisicaoComOrigem,
    @Param("id") id: string,
    @Param("indice") indice: string,
    @Body() body: { aceite?: boolean }
  ) {
    return this.pontoService.assinarDocumentoFerias(
      req.user.sub,
      id,
      Number(indice),
      !!body?.aceite,
      metaAssinaturaDaRequisicao(req)
    );
  }

  /** Funcionário rejeita um documento de férias com justificativa (volta ao RH). */
  @Post("solicitacoes/:id/ferias/documentos/:indice/rejeitar")
  rejeitarDocumentoFerias(
    @Req() req: { user: { sub: string } },
    @Param("id") id: string,
    @Param("indice") indice: string,
    @Body() body: { justificativa?: string }
  ) {
    return this.pontoService.rejeitarDocumentoFerias(
      req.user.sub,
      id,
      Number(indice),
      body?.justificativa ?? ""
    );
  }

  /** Assina um documento da rodada do 2º/3º período das férias. */
  @Post("solicitacoes/:id/ferias/rodadas/:ordem/documentos/:indice/assinar")
  assinarDocumentoRodadaFerias(
    @Req() req: { user: { sub: string } } & RequisicaoComOrigem,
    @Param("id") id: string,
    @Param("ordem") ordem: string,
    @Param("indice") indice: string,
    @Body() body: { aceite?: boolean }
  ) {
    return this.pontoService.assinarDocumentoRodadaFerias(
      req.user.sub,
      id,
      Number(ordem),
      Number(indice),
      !!body?.aceite,
      metaAssinaturaDaRequisicao(req)
    );
  }

  /** Rejeita um documento da rodada do 2º/3º período (volta ao RH). */
  @Post("solicitacoes/:id/ferias/rodadas/:ordem/documentos/:indice/rejeitar")
  rejeitarDocumentoRodadaFerias(
    @Req() req: { user: { sub: string } },
    @Param("id") id: string,
    @Param("ordem") ordem: string,
    @Param("indice") indice: string,
    @Body() body: { justificativa?: string }
  ) {
    return this.pontoService.rejeitarDocumentoRodadaFerias(
      req.user.sub,
      id,
      Number(ordem),
      Number(indice),
      body?.justificativa ?? ""
    );
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

  /** Local apurado das batidas do dia e se ele dá direito ao limite diário de HE. */
  @Get("hora-extra/local-do-dia")
  getLocalDoDiaHoraExtra(@Req() req: { user: { sub: string } }, @Query("data") data: string) {
    return this.pontoService.getLocalDoDiaHoraExtra(req.user.sub, data);
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

  /** Feriados e dias úteis para a regra de vedação do início das férias. */
  @Get("ferias/calendario")
  getCalendarioFerias(
    @Req() req: { user: { sub: string } },
    @Query("de") de: string,
    @Query("ate") ate: string
  ) {
    return this.pontoService.getCalendarioFerias(req.user.sub, de, ate);
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

  @Get("requerimento-cadastro")
  getRequerimentosCadastro(@Req() req: { user: { sub: string } }) {
    return this.pontoService.getRequerimentosCadastro(req.user.sub);
  }

  @Post("requerimento-cadastro/:tipo/responder")
  responderRequerimentoCadastro(
    @Req() req: { user: { sub: string } },
    @Param("tipo") tipo: string,
    @Body() body: { itens?: Array<Record<string, string | null>>; semRegistros?: boolean }
  ) {
    return this.pontoService.responderRequerimentoCadastro(
      req.user.sub,
      tipo,
      body as Parameters<PontoService["responderRequerimentoCadastro"]>[2]
    );
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

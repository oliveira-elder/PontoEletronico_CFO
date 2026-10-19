import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Response } from "express";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { RepLivroService } from "../rep/rep-livro.service";
import { RepPService, type RegistroInpiDto } from "../rep/rep-p.service";
import { SeloIcpService } from "../selo-icp/selo-icp.service";
import { gerarAtestadoTecnico, type TipoAtestado } from "./atestado-tecnico";
import { versaoDoSistema } from "../rep/rep-p.service";

interface AuthRequest {
  user: { sub: string; name?: string };
}

/** Configuração do REP-P (Portaria MTP 671/2021, arts. 78 e 91): identificação, registro no INPI e virada. */
@Controller("ponto/config")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class RepPController {
  constructor(
    private readonly repP: RepPService,
    private readonly livro: RepLivroService,
    private readonly selo: SeloIcpService,
    private readonly prisma: PrismaService
  ) {}

  private async autor(req: AuthRequest) {
    const u = await this.prisma.user.findFirst({
      where: { externalId: req.user.sub },
      select: { id: true, name: true }
    });
    return { id: u?.id ?? null, nome: u?.name ?? req.user.name ?? null };
  }

  @RecursoRh("configuracoes.institucional.rep-p")
  @Get("rep-p")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async situacao() {
    const [identificacao, estado, livro, vigencias] = await Promise.all([
      this.repP.identificacao(),
      this.repP.estado(),
      this.livro.situacao(),
      this.repP.vigencias()
    ]);
    const icp = this.selo.status();
    return {
      identificacao,
      estado,
      livro: {
        nsrAtual: livro.nsrAtual,
        marcacoes: livro.marcacoes,
        eventos: livro.eventos,
        bloqueio: livro.bloqueio,
        instanciaAtual: livro.instanciaAtual,
        verificacaoCadeia: livro.verificacaoCadeia
      },
      certificadoIcp: {
        instalado: !!icp.caminhoCertificado && !!icp.validadeAte,
        titular: icp.titular,
        validadeAte: icp.validadeAte,
        motivo: icp.motivo
      },
      vigencias
    };
  }

  @RecursoRh("configuracoes.institucional.rep-p")
  @Put("rep-p")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  salvar(@Body() body: Record<string, unknown>) {
    return this.repP.salvarIdentificacao(body ?? {});
  }

  @RecursoRh("configuracoes.institucional.rep-p")
  @Post("rep-p/iniciar-operacao")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async iniciar(
    @Body() body: { inicio?: string; confirmacao?: string },
    @Request() req: AuthRequest
  ) {
    if (body?.confirmacao !== "INICIAR") {
      throw new BadRequestException('Confirme a virada digitando "INICIAR".');
    }
    const icp = this.selo.status();
    if (!icp.caminhoCertificado || !icp.validadeAte) {
      throw new BadRequestException(
        "Instale o certificado e-CNPJ A1 (ICP-Brasil) antes de iniciar o REP-P: AFD, AEJ e comprovantes precisam ser assinados."
      );
    }
    if (new Date(icp.validadeAte) < new Date()) {
      throw new BadRequestException("O certificado e-CNPJ A1 está vencido.");
    }
    return this.repP.iniciarOperacao(
      body.inicio ? new Date(body.inicio) : undefined,
      await this.autor(req)
    );
  }

  /** Atestado Técnico e Termo de Responsabilidade (art. 89) preenchido, para assinatura com e-CPF. */
  @RecursoRh("configuracoes.institucional.rep-p")
  @Get("rep-p/atestado")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async atestado(@Query("tipo") tipoQ: string | undefined, @Res() res: Response) {
    const tipo: TipoAtestado = tipoQ === "PTRP" ? "PTRP" : "REP_P";
    const [c, reg] = await Promise.all([
      this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } }),
      this.prisma.registroProgramaInpi.findFirst({ orderBy: { createdAt: "desc" } })
    ]);
    if (!c) throw new BadRequestException("Configuração da instituição não encontrada.");
    const cnpj = (c.cnpj ?? "").replace(/\D/g, "");
    const pdf = await gerarAtestadoTecnico({
      tipo,
      desenvolvedor: {
        razao: c.ptrpDesenvolvedorRazao || c.nome,
        cnpj: (c.ptrpDesenvolvedorCnpj ?? "").replace(/\D/g, "") || cnpj
      },
      destinatario: { razao: c.nome, cnpj },
      programa: { identificador: c.ptrpNome, versao: versaoDoSistema() },
      inpi: {
        registro: (c.repInpiRegistro ?? "").replace(/\D/g, "") || null,
        certificado: reg?.certificadoNumero
          ? `${reg.certificadoNumero}${reg.certificadoData ? ` (${reg.certificadoData.split("-").reverse().join("/")})` : ""}`
          : null
      }
    });
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Atestado-Tecnico-${tipo === "REP_P" ? "REP-P" : "PTRP"}.pdf"`
    });
    res.send(pdf);
  }

  /* ─── Registro no INPI ─── */

  @RecursoRh("configuracoes.institucional.rep-p")
  @Get("registro-inpi")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  registro() {
    return this.repP.registroInpi();
  }

  @RecursoRh("configuracoes.institucional.rep-p")
  @Put("registro-inpi")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async salvarRegistro(@Body() body: RegistroInpiDto, @Request() req: AuthRequest) {
    return this.repP.salvarRegistroInpi(body ?? {}, await this.autor(req));
  }

  @RecursoRh("configuracoes.institucional.rep-p")
  @Post("registro-inpi/certificado-pdf")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  salvarCertificado(@Body() body: { arquivoBase64?: string; nome?: string }) {
    return this.repP.salvarCertificadoPdf(String(body?.arquivoBase64 ?? ""), body?.nome);
  }

  @RecursoRh("configuracoes.institucional.rep-p")
  @Get("registro-inpi/certificado-pdf")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async baixarCertificado(@Res() res: Response) {
    const { buffer, nome } = await this.repP.baixarCertificadoPdf();
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`
    });
    res.send(buffer);
  }
}

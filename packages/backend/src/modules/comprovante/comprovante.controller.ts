import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Response } from "express";
import { ComprovanteService } from "./comprovante.service";

interface AuthRequest {
  user: { sub: string };
}

/** Comprovante de Registro de Ponto do Trabalhador (arts. 79 e 80): cada trabalhador vê só os seus. */
@Controller("ponto/comprovantes")
@UseGuards(AuthGuard("jwt"))
export class ComprovanteController {
  constructor(private readonly service: ComprovanteService) {}

  @Get()
  listar(
    @Req() req: AuthRequest,
    @Query("horas") horas?: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string
  ) {
    return this.service.listar(req.user.sub, {
      horas: horas ? Number(horas) : undefined,
      mes: mes ? Number(mes) : undefined,
      ano: ano ? Number(ano) : undefined
    });
  }

  @Get("ultimas-48h")
  async ultimas48h(@Req() req: AuthRequest, @Res() res: Response) {
    const zip = await this.service.zipUltimas48h(req.user.sub);
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="Comprovantes-ultimas-48h.zip"'
    });
    res.send(zip);
  }

  @Get(":nsr/pdf")
  async pdf(
    @Param("nsr", ParseIntPipe) nsr: number,
    @Req() req: AuthRequest,
    @Res() res: Response
  ) {
    const { buffer, nome } = await this.service.pdf(nsr, req.user.sub);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, max-age=0"
    });
    res.send(buffer);
  }
}

/** Verificação PÚBLICA do comprovante pelo hash da marcação (QR Code): dados mínimos, limitada por IP. */
@Controller("ponto/verificar-marcacao")
export class VerificacaoMarcacaoController {
  private readonly tentativas = new Map<string, number[]>();

  constructor(private readonly service: ComprovanteService) {}

  private limitar(req: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
    const xff = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ?? req.ip ?? "?";
    const agora = Date.now();
    const janela = (this.tentativas.get(ip) ?? []).filter((t) => agora - t < 60_000);
    if (janela.length >= 20) {
      throw new HttpException("Muitas consultas. Aguarde um minuto.", HttpStatus.TOO_MANY_REQUESTS);
    }
    janela.push(agora);
    this.tentativas.set(ip, janela);
  }

  /** Conferência pelo conteúdo do arquivo (texto do PDF ou OCR da foto). */
  @Post("conteudo")
  conteudo(
    @Body() body: { hash?: string; registro?: string; linhas?: string[]; origem?: "pdf" | "ocr" },
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }
  ) {
    this.limitar(req);
    return this.service.compararConteudo(body ?? {});
  }

  /** Conferência pelo arquivo: o navegador calcula o SHA-256 e envia só o hash. */
  @Get("arquivo/:sha256")
  arquivo(
    @Param("sha256") sha256: string,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }
  ) {
    this.limitar(req);
    return this.service.verificarArquivo(sha256);
  }

  @Get(":hash")
  verificar(
    @Param("hash") hash: string,
    @Query("r") r: string | undefined,
    @Query("p") p: string | undefined,
    @Query("t") t: string | undefined,
    @Query("s") s: string | undefined,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }
  ) {
    this.limitar(req);
    return this.service.verificarPorHash(hash, { r, p, t, s });
  }
}

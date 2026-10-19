import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import { from, Observable } from "rxjs";
import { mergeMap } from "rxjs/operators";
import { TermosUsoService } from "./termos-uso.service";

/**
 * Bloqueio por Termos de Uso pendentes: com uma versão publicada sem aceite, a API responde 428
 * (TERMOS_PENDENTES) — EXCETO o registro de ponto e o que ele precisa (Portaria 671, art. 74:
 * a marcação não pode ser restringida), a autenticação, os próprios termos e a verificação pública.
 */
const ISENTAS: RegExp[] = [
  /^\/auth(\/|$)/,
  /^\/termos-uso(\/|$)/,
  /^\/ponto\/config\/termos-uso(\/|$)/,
  /^\/ponto\/(registros|status|hora|comprovantes|verificar|verificar-marcacao|feriado-hoje|minha-foto)(\/|$)/,
  /^\/ponto\/perfis-rh\/minhas$/,
  /^\/ponto\/config\/(sistema|areas)$/,
  /^\/notificacao\/contagem$/
];

@Injectable()
export class TermosPendentesInterceptor implements NestInterceptor {
  constructor(private readonly termos: TermosUsoService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== "http") return next.handle();
    const req = ctx.switchToHttp().getRequest<{
      user?: { sub?: string };
      originalUrl?: string;
      url?: string;
    }>();
    const sub = req.user?.sub;
    if (!sub || sub.startsWith("@")) return next.handle();
    const caminho = (req.originalUrl ?? req.url ?? "").split("?")[0].replace(/^\/api/, "");
    if (ISENTAS.some((r) => r.test(caminho))) return next.handle();
    return from(this.termos.pendente(sub)).pipe(
      mergeMap((pendente) => {
        if (pendente) {
          throw new HttpException(
            {
              statusCode: 428,
              code: "TERMOS_PENDENTES",
              message: "Aceite os Termos de Uso para continuar usando o sistema."
            },
            428
          );
        }
        return next.handle();
      })
    );
  }
}

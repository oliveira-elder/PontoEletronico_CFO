import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, map } from "rxjs";
import { assinarSeUpload, mapearTextos, removerAssinatura } from "../utils/uploads-assinados";

/**
 * Entrada: remove a assinatura de links /uploads devolvidos pelo front (o banco guarda o caminho simples).
 * Saída: assina os links /uploads presentes na resposta JSON.
 */
@Injectable()
export class UploadsAssinadosInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== "http") return next.handle();
    const req = ctx.switchToHttp().getRequest<{ body?: unknown }>();
    if (req.body) req.body = mapearTextos(req.body, removerAssinatura);
    return next.handle().pipe(map((resp) => mapearTextos(resp, assinarSeUpload)));
  }
}

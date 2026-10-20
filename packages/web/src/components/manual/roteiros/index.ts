import type { Roteiro } from "../tipos";
import { aprovarSolicitacao } from "./aprovar-solicitacao";
import { assinarEspelho } from "./assinar-espelho";
import {
  responderRequisicao,
  enviarExame,
  atualizarDados,
  verBancoHoras
} from "./banco-requisicoes";
import { intervaloEPausas } from "./jornada-dia";
import {
  consultarHistorico,
  entenderHoras,
  esqueciRegistrar,
  verComprovantes
} from "./jornada-consulta";
import { aceitarTermos, conhecerMenu, entrarSistema, lerNotificacoes } from "./primeiros-passos";
import { registrarEntrada } from "./registrar-entrada";
import { gerarAfd, liberarBanco } from "./rh";
import { enviarAtestado, pedirAbono } from "./solicitacoes";
import {
  acompanharSolicitacoes,
  enviarDocumentoRh,
  pedirDayOff,
  pedirFerias,
  pedirHoraExtra,
  pedirLicenca
} from "./solicitacoes-extra";
import { validarDocumento } from "./validar-documento";

export const ROTEIROS: Record<string, Roteiro> = Object.fromEntries(
  [
    entrarSistema,
    conhecerMenu,
    aceitarTermos,
    lerNotificacoes,
    registrarEntrada,
    intervaloEPausas,
    verComprovantes,
    consultarHistorico,
    entenderHoras,
    esqueciRegistrar,
    pedirAbono,
    enviarAtestado,
    pedirLicenca,
    pedirDayOff,
    pedirFerias,
    pedirHoraExtra,
    enviarDocumentoRh,
    acompanharSolicitacoes,
    verBancoHoras,
    assinarEspelho,
    validarDocumento,
    responderRequisicao,
    enviarExame,
    atualizarDados,
    aprovarSolicitacao,
    liberarBanco,
    gerarAfd
  ].map((r) => [r.id, r])
);

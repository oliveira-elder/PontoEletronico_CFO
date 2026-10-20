import React from "react";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DownloadIcon,
  Edit2Icon,
  FileTextIcon,
  FilterIcon,
  TrendingUpIcon
} from "../../icons";
import { Cabecalho } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";

const LINHAS: string[][] = [
  ["01/09/2026", "Ter", "08:01", "12:02", "13:03", "17:04", "—", "8h02", "+0h02"],
  ["02/09/2026", "Qua", "07:58", "12:00", "13:01", "17:00", "—", "8h02", "+0h02"],
  ["03/09/2026", "Qui", "08:05", "12:10", "13:12", "17:05", "—", "8h00", "0h00"],
  ["04/09/2026", "Sex", "08:00", "12:00", "13:00", "17:02", "—", "8h02", "+0h02"],
  ["05/09/2026", "Sáb", "—", "—", "—", "—", "—", "—", "—"],
  ["06/09/2026", "Dom", "—", "—", "—", "—", "—", "—", "—"],
  ["07/09/2026", "Seg", "—", "—", "—", "—", "—", "—", "—"],
  ["08/09/2026", "Ter", "08:03", "12:01", "13:02", "17:03", "—", "8h01", "+0h01"],
  ["09/09/2026", "Qua", "08:00", "12:05", "13:06", "17:00", "—", "8h00", "0h00"],
  ["10/09/2026", "Qui", "07:57", "12:00", "13:00", "17:01", "—", "8h02", "+0h02"],
  ["11/09/2026", "Sex", "08:02", "12:03", "13:04", "17:02", "—", "8h00", "0h00"]
];

function Banner({ e }: { e: Estado }) {
  if (e.assinado)
    return (
      <div
        style={{
          background: "#EFF6FF",
          border: "1px solid #3B82F6",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}
      >
        <CheckCircleIcon size={18} style={{ color: "#2563EB" }} />
        <span data-alvo="banner" style={{ fontSize: 13.5, color: "#1E40AF" }}>
          <strong>Você assinou em 02/10/2026.</strong> Aguardando assinatura do chefe.
        </span>
      </div>
    );
  return (
    <div
      style={{
        background: "#FEF3C7",
        border: "1px solid #F59E0B",
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 16
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AlertCircleIcon size={18} style={{ color: "#D97706" }} />
        <span style={{ fontSize: 13.5, color: "#92400E", flex: 1 }} data-alvo="banner">
          <strong>Quadro pronto para assinatura.</strong> Revise os registros abaixo e assine para
          confirmar.
        </span>
        <span
          className="btn btn-sm"
          data-alvo="btn-assinar-quadro"
          style={{ background: "#D97706", color: "#fff", gap: 6 }}
        >
          <Edit2Icon size={13} />
          Assinar Quadro
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          background: "#FFFBEB",
          border: "1px solid #D97706",
          borderLeft: "4px solid #B45309",
          borderRadius: 8,
          color: "#92400E",
          fontSize: 13,
          fontWeight: 700
        }}
      >
        Atenção: depois de assinar, não será mais possível solicitar correção deste período.
      </div>
    </div>
  );
}

export function Historico({ e, semBanner }: { e: Estado; semBanner?: boolean }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Cabecalho
        antes="Histórico de"
        em="Frequência"
        direita={
          <>
            <span className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
              <FilterIcon size={14} /> Filtros
            </span>
            <span className="btn btn-ghost btn-sm" data-alvo="btn-banco-h" style={{ gap: 6 }}>
              <TrendingUpIcon size={14} /> Banco de Horas
            </span>
            <span className="btn btn-ghost btn-sm" data-alvo="btn-comprovantes" style={{ gap: 6 }}>
              <FileTextIcon size={14} /> Comprovantes
            </span>
            <span className="btn btn-ghost btn-sm" data-alvo="btn-exportar-pdf" style={{ gap: 6 }}>
              <DownloadIcon size={14} /> Exportar PDF
            </span>
          </>
        }
      />
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            maxWidth: 360,
            margin: "0 auto 10px"
          }}
        >
          <span
            className="btn-icon"
            data-alvo="btn-mes-ant"
            style={{ background: "#fff", border: "1px solid rgba(122,30,38,0.12)" }}
          >
            <ArrowLeftIcon size={16} />
          </span>
          <div
            data-alvo="nome-mes"
            style={{
              flex: 1,
              textAlign: "center",
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: 20,
              color: "var(--burgundy-600)"
            }}
          >
            {e.mes === "agosto" ? "agosto de 2026" : "setembro de 2026"}{" "}
            <ChevronDownIcon size={14} style={{ opacity: 0.5 }} />
          </div>
          <span
            className="btn-icon"
            data-alvo="btn-mes-prox"
            style={{ background: "#fff", border: "1px solid rgba(122,30,38,0.12)" }}
          >
            <ArrowRightIcon size={16} />
          </span>
        </div>
        <div
          data-alvo="badges-resumo"
          style={{ display: "flex", gap: 8, justifyContent: "center" }}
        >
          <span className="badge badge-gray">Período 8h/dia</span>
          <span className="badge badge-green">22 dias OK</span>
          <span className="badge badge-gray">176h30 trabalhadas</span>
          <span className="badge badge-green">Saldo: +0h30</span>
          <span className="badge badge-green">Total: +4h10</span>
        </div>
      </div>
      {!semBanner && <Banner e={e} />}
      <div className="card-flat" data-alvo="tabela-hist" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table-cfo" style={{ width: "100%" }}>
          <thead>
            <tr>
              {[
                "Data",
                "Dia",
                "Entrada",
                "Início Interv.",
                "Fim Interv.",
                "Saída",
                "Pausa",
                "Horas",
                "Saldo",
                "Status"
              ].map((h, i) => (
                <th key={h} data-alvo={`col-${i}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINHAS.map((l, li) => (
              <tr key={l[0]} data-alvo={`linha-${li}`}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{l[0]}</td>
                <td style={{ color: "var(--ink-500)", fontSize: 13 }}>{l[1]}</td>
                {l.slice(2, 9).map((c, i) => (
                  <td
                    key={i}
                    style={{ fontFamily: i < 4 ? "var(--font-mono)" : undefined, fontSize: 13 }}
                  >
                    {c}
                  </td>
                ))}
                <td>
                  {l[2] === "—" ? (
                    <span className={`badge ${l[1] === "Seg" ? "badge-blue" : "badge-gray"}`}>
                      {l[1] === "Seg" ? "Feriado" : "Fim de semana"}
                    </span>
                  ) : (
                    <span className="badge badge-green">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModalAssinar() {
  return (
    <div className="mk-sombra" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "28px 28px 24px",
          width: 460,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)"
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            marginBottom: 4,
            color: "var(--burgundy-700)"
          }}
        >
          Assinar Quadro
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 20 }}>setembro de 2026</p>
        <div
          data-alvo="resumo-quadro"
          style={{
            background: "#f9fafb",
            borderRadius: 8,
            padding: "14px 16px",
            marginBottom: 20,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px 20px"
          }}
        >
          {[
            ["Dias trabalhados", "22", undefined],
            ["Total de horas", "176h30", undefined],
            ["Saldo do mês", "+0h30", "#15803D"],
            ["Banco de horas (total)", "+4h10", "#15803D"]
          ].map(([l, v, c]) => (
            <div key={l as string}>
              <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>{l}</p>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: c as string | undefined
                }}
              >
                {v}
              </p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-600)", marginBottom: 12, lineHeight: 1.6 }}>
          Ao assinar, confirmo que li e estou de acordo com os registros de ponto acima referentes
          ao período indicado.
        </p>
        <div
          style={{
            marginBottom: 24,
            padding: "10px 12px",
            background: "#FEF3C7",
            border: "1px solid #D97706",
            borderLeft: "4px solid #B45309",
            borderRadius: 8,
            color: "#92400E",
            fontSize: 13,
            fontWeight: 700
          }}
        >
          Atenção: depois de assinar, não será mais possível solicitar correção deste período.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <span className="btn btn-ghost btn-sm">Cancelar</span>
          <span
            className="btn btn-primary btn-sm"
            data-alvo="btn-confirmar-assinatura"
            style={{
              gap: 6,
              background: "var(--burgundy-700)",
              borderColor: "var(--burgundy-700)"
            }}
          >
            <Edit2Icon size={13} /> Assinar Quadro
          </span>
        </div>
      </div>
    </div>
  );
}

export const assinarEspelho: Roteiro = {
  id: "assinar-espelho",
  titulo: "Assinar o Espelho do mês",
  altura: 780,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="historico" e={e}>
        <Historico e={e} />
      </Shell>
      {e.modal && <ModalAssinar />}
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "banner",
      legenda:
        "Depois do fim do mês, abra o Histórico daquele mês. Quando a folha estiver liberada aparece “Quadro pronto para assinatura”."
    },
    {
      acao: "aguardar",
      legenda:
        "Revise os registros do mês na tabela: horários, horas e saldo. Se algo estiver errado, peça a correção ANTES de assinar."
    },
    {
      acao: "clicar",
      alvo: "btn-assinar-quadro",
      set: { modal: true },
      legenda: "Clique em “Assinar Quadro”."
    },
    {
      acao: "mover",
      alvo: "resumo-quadro",
      legenda:
        "Confira o resumo: dias trabalhados, total de horas, saldo do mês e banco de horas. Atenção: depois de assinar, não é mais possível pedir correção do mês."
    },
    {
      acao: "clicar",
      alvo: "btn-confirmar-assinatura",
      set: { modal: false, assinado: true },
      legenda: "Confirme em “Assinar Quadro”. A folha segue para a assinatura do seu chefe."
    },
    {
      acao: "mover",
      alvo: "banner",
      legenda:
        "O aviso azul mostra “Você assinou… Aguardando assinatura do chefe”. Quando o chefe assinar, a folha aparece em “Folhas assinadas”."
    }
  ]
};

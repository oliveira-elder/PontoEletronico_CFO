import React from "react";
import {
  CalendarIcon,
  FileTextIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  TrashIcon,
  UploadIcon
} from "../../icons";
import { Campo, rotuloEstilo } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";
import { Historico } from "./assinar-espelho";

/* ───────── D1. Banco de horas ───────── */

const DIAS: [string, string, string, string][] = [
  ["01/09/2026", "Ter", "8h02", "+0h02"],
  ["02/09/2026", "Qua", "8h02", "+0h02"],
  ["03/09/2026", "Qui", "8h00", "0h00"],
  ["04/09/2026", "Sex", "8h02", "+0h02"]
];

function PaginaBanco({ e }: { e: Estado }) {
  const aberto = !!e.mesAberto;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Ponto Eletrônico
        </p>
        <h1 style={{ fontSize: 28, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
          Evolução do Banco de <em>Horas</em>
        </h1>
      </div>

      <div className="card-flat" style={{ marginBottom: 16 }} data-alvo="card-saldo">
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          Saldo Atual do Ciclo
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <p style={{ fontSize: 44, fontFamily: "var(--font-display)", lineHeight: 1 }}>+4h10</p>
          <span className="badge badge-green">Positivo</span>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-700)" }}
          data-alvo="ciclo-info"
        >
          <CalendarIcon size={14} style={{ color: "var(--burgundy-600)" }} />
          <p style={{ fontSize: 13 }}>Ciclo desde 01/09/2026 · próxima zeragem em 31/08/2027</p>
        </div>
      </div>

      <div className="card-flat" style={{ marginBottom: 16 }} data-alvo="card-liberado">
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          Tempo liberado pelo RH
        </p>
        <p
          style={{
            fontSize: 34,
            fontFamily: "var(--font-display)",
            lineHeight: 1,
            marginBottom: 6
          }}
        >
          4h00
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-700)" }}>
          Disponível para abono (4h00 até 17/04/2027). Para usar, abra Solicitações → Abono e marque
          “Usar o tempo liberado pelo RH”. O tempo liberado já foi descontado do saldo acima.
        </p>
      </div>

      <div className="card-flat" style={{ marginBottom: 16 }}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Detalhamento mensal
        </p>
        <div
          style={{ border: "1px solid rgba(122,30,38,0.12)", borderRadius: "var(--radius-md)" }}
          data-alvo="card-mes"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
            <span
              style={{
                flex: 1,
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 18,
                color: "var(--burgundy-600)"
              }}
            >
              setembro de 2026
            </span>
            <span className="badge badge-gray">Trabalhado: 176h30</span>
            <span className="badge badge-green">Saldo do mês: +0h30</span>
            <span className="badge badge-green">Acumulado: +4h10</span>
            <span style={{ fontSize: 14, color: "var(--ink-500)" }}>{aberto ? "▲" : "▼"}</span>
          </div>
          {aberto && (
            <div style={{ padding: "0 14px 12px" }} data-alvo="detalhe-mes">
              <table className="table-cfo" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    {["Data", "Dia", "Trabalhado", "Saldo do dia"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DIAS.map((d) => (
                    <tr key={d[0]}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{d[0]}</td>
                      <td style={{ color: "var(--ink-500)", fontSize: 13 }}>{d[1]}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{d[2]}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{d[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card-flat" data-alvo="card-ciclos">
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          Ciclos anteriores
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-500)" }}>
          Histórico dos ciclos encerrados. Assine as folhas mensais já fechadas (você e o chefe da
          área). Use Relatório para baixar o PDF do período do ciclo.
        </p>
      </div>
    </div>
  );
}

export const verBancoHoras: Roteiro = {
  id: "banco",
  titulo: "Ver o banco de horas",
  altura: 960,
  estadoInicial: { pagina: "historico" },
  render: (e) => (
    <Shell ativo="historico" e={e}>
      {e.pagina === "historico" ? <Historico e={e} semBanner /> : <PaginaBanco e={e} />}
    </Shell>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "btn-banco-h",
      legenda: "O banco de horas fica no Histórico, no botão “Banco de Horas” (no alto, à direita)."
    },
    {
      acao: "clicar",
      alvo: "btn-banco-h",
      set: { pagina: "banco" },
      legenda: "Clique nele: abre “Evolução do Banco de Horas”."
    },
    {
      acao: "mover",
      alvo: "card-saldo",
      legenda:
        "“Saldo Atual do Ciclo” é o que você tem agora. Verde/“Positivo” = horas a seu favor; vermelho/“Negativo” = horas a compensar."
    },
    {
      acao: "mover",
      alvo: "ciclo-info",
      legenda:
        "Aqui estão o início do ciclo e a data da próxima zeragem, quando o saldo é encerrado e o ciclo recomeça."
    },
    {
      acao: "mover",
      alvo: "card-liberado",
      legenda:
        "Se o RH liberou tempo do seu banco, aparece “Tempo liberado pelo RH”, com o prazo de validade. Use-o em um pedido de abono antes de vencer."
    },
    {
      acao: "clicar",
      alvo: "card-mes",
      set: { mesAberto: true },
      legenda:
        "Em “Detalhamento mensal”, clique em um mês para abrir: ele mostra o trabalhado, o saldo do mês e o acumulado."
    },
    {
      acao: "mover",
      alvo: "detalhe-mes",
      legenda: "A tabela mostra, dia a dia, quanto você trabalhou e o saldo do dia."
    },
    {
      acao: "mover",
      alvo: "card-ciclos",
      legenda:
        "“Ciclos anteriores” guarda o histórico dos ciclos encerrados, com as folhas assinadas e o relatório em PDF."
    }
  ]
};

/* ───────── E1. Requisições do RH ───────── */

function CabecalhoRequisicoes({ pendentes }: { pendentes: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 20
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            color: "var(--burgundy-600)",
            fontSize: 22,
            fontWeight: 400,
            marginBottom: 4
          }}
        >
          Minhas Requisições do RH
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-500)" }}>
          {pendentes > 0 ? (
            <span>
              <strong style={{ color: "#8a6a00" }}>{pendentes} pendente(s)</strong>
            </span>
          ) : (
            "Todas as requisições foram respondidas."
          )}
        </p>
      </div>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          border: "1px solid rgba(122,30,38,0.2)",
          borderRadius: "var(--radius-md)",
          background: "#fff",
          fontSize: 12
        }}
      >
        <RefreshCwIcon size={13} /> Atualizar
      </span>
    </div>
  );
}

function CartaoRequisicao({ e }: { e: Estado }) {
  const aberta = !!e.aberta;
  const respondida = !!e.respondida;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.10)",
        overflow: "hidden"
      }}
    >
      <div
        data-alvo="req-cabecalho"
        style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px" }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "#1e5c3814",
            color: "#1e5c38",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 2
          }}
        >
          <FileTextIcon size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: "var(--radius-full)",
                background: "#1e5c3818",
                color: "#1e5c38"
              }}
            >
              Assinatura de Documentos
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "var(--radius-full)",
                background: respondida ? "rgba(47,125,79,0.12)" : "rgba(247,196,55,0.18)",
                color: respondida ? "#1e5c38" : "#8a6a00"
              }}
            >
              {respondida ? "Respondido" : "Pendente"}
            </span>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600 }}>
            Declaração de dependentes do imposto de renda
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-500)" }}>
            Enviado por Ana Costa em 15/10/2026
          </p>
          <p style={{ fontSize: 11, color: "#b45309", fontWeight: 600, marginTop: 3 }}>
            Prazo: 25/10/2026
          </p>
        </div>
        <span style={{ fontSize: 18, color: "#cbd5e1" }}>{aberta ? "▲" : "▼"}</span>
      </div>
      {aberta && (
        <div style={{ borderTop: "1px solid rgba(122,30,38,0.08)", padding: 16 }}>
          <p
            style={{ fontSize: 13, color: "var(--ink-700)", marginBottom: 14, lineHeight: 1.55 }}
            data-alvo="req-descricao"
          >
            Preencha, assine e devolva a declaração em anexo até a data limite.
          </p>
          <div style={{ marginBottom: 16 }}>
            <span
              data-alvo="req-doc"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                border: "1px solid rgba(122,30,38,0.22)",
                borderRadius: "var(--radius-md)",
                fontSize: 12.5,
                color: "var(--burgundy-600)"
              }}
            >
              📄 Ver documento — Documento do RH
            </span>
          </div>
          {respondida ? (
            <div
              style={{
                padding: "10px 12px",
                background: "rgba(47,125,79,0.07)",
                border: "1px solid rgba(47,125,79,0.2)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                color: "#1e5c38"
              }}
              data-alvo="req-resposta-ok"
            >
              ✓ Resposta enviada em 20/10/2026
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-700)" }}>Sua resposta</p>
              <Campo id="req-texto" e={e} area placeholder="Observações (opcional)..." />
              <span
                data-alvo="req-anexo"
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 14px",
                  border: "1px dashed rgba(122,30,38,0.3)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--cream-50)",
                  fontSize: 13,
                  color: "var(--ink-600, #4b5563)"
                }}
              >
                <UploadIcon size={14} />
                {e.anexado ? "declaracao-assinada.pdf" : "Anexar arquivo (PDF ou imagem)"}
              </span>
              <span
                data-alvo="btn-enviar-resp"
                style={{
                  alignSelf: "flex-start",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "9px 20px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--burgundy-600)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600
                }}
              >
                <SendIcon size={14} /> Enviar Resposta
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const responderRequisicao: Roteiro = {
  id: "requisicoes-rh",
  titulo: "Responder requisições do RH",
  altura: 900,
  estadoInicial: {},
  render: (e) => (
    <Shell ativo="inicio" e={{ ...e, sinoN: e.respondida ? 0 : 1 }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <CabecalhoRequisicoes pendentes={e.respondida ? 0 : 1} />
        <CartaoRequisicao e={e} />
      </div>
    </Shell>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "req-cabecalho",
      legenda:
        "Em “Minhas Requisições do RH” aparecem os pedidos que o RH enviou a você. A etiqueta “Pendente” mostra o que falta responder; o prazo vem logo abaixo do título."
    },
    {
      acao: "clicar",
      alvo: "req-cabecalho",
      set: { aberta: true },
      legenda: "Clique na requisição para abri-la."
    },
    { acao: "mover", alvo: "req-descricao", legenda: "Leia a descrição do que o RH pede." },
    {
      acao: "mover",
      alvo: "req-doc",
      legenda: "Se houver documento do RH, clique em “Ver documento” para abri-lo."
    },
    {
      acao: "digitar",
      alvo: "req-texto",
      valor: "Declaração assinada em anexo.",
      legenda: "Em “Sua resposta”, escreva uma observação, se quiser."
    },
    {
      acao: "clicar",
      alvo: "req-anexo",
      set: { anexado: true },
      legenda: "Clique em “Anexar arquivo (PDF ou imagem)” e escolha o seu arquivo."
    },
    {
      acao: "clicar",
      alvo: "btn-enviar-resp",
      set: { respondida: true },
      legenda: "Clique em “Enviar Resposta”. É preciso enviar um arquivo ou escrever uma resposta."
    },
    {
      acao: "mover",
      alvo: "req-resposta-ok",
      legenda: "Pronto: aparece “Resposta enviada” e a etiqueta muda para “Respondido”."
    }
  ]
};

/* ───────── E2. Exame ocupacional ───────── */

function CardExame({ e }: { e: Estado }) {
  const enviado = !!e.exameEnviado;
  return (
    <div
      style={{
        border: "1px dashed rgba(122,30,38,0.30)",
        borderRadius: "var(--radius-lg)",
        background: "rgba(122,30,38,0.02)",
        padding: "14px 16px"
      }}
      data-alvo="card-exame"
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--burgundy-600)" }}>
            🩺 Meu exame médico periódico
          </p>
          <p style={{ marginTop: 6, fontSize: 13 }}>
            <span
              style={{
                padding: "2px 9px",
                borderRadius: 999,
                background: "rgba(247,196,55,0.18)",
                color: "#8a6a00",
                fontWeight: 700,
                fontSize: 11.5
              }}
            >
              A vencer
            </span>{" "}
            Último exame: <strong>12/11/2025</strong> · próximo vencimento:{" "}
            <strong>12/11/2026</strong> (em 23 dia(s))
          </p>
          {enviado && (
            <p
              style={{ marginTop: 6, fontSize: 12.5, color: "#1a4f7a" }}
              data-alvo="exame-aguardando"
            >
              ⏳ Exame enviado, aguardando a conferência do RH.
            </p>
          )}
        </div>
        <span
          className="btn btn-primary btn-sm"
          data-alvo="btn-enviar-exame"
          style={{ opacity: enviado ? 0.5 : 1 }}
        >
          Enviar meu exame
        </span>
      </div>
    </div>
  );
}

function ModalExame({ e }: { e: Estado }) {
  return (
    <div className="mk-sombra" style={{ background: "rgba(10,5,6,0.50)" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: 700,
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(10,5,6,0.20)"
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, var(--burgundy-700) 0%, var(--burgundy-600) 100%)",
            padding: "20px 24px"
          }}
        >
          <p
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase"
            }}
          >
            Saúde ocupacional
          </p>
          <h2
            style={{
              color: "#fff",
              fontSize: 18,
              margin: "4px 0 0",
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontWeight: 400
            }}
          >
            Enviar meu exame médico periódico
          </h2>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Campo id="ex-data" e={e} rotulo="Data do exame" obrigatorio data />
            <Campo id="ex-medico" e={e} rotulo="Médico (opcional)" />
            <Campo id="ex-clinica" e={e} rotulo="Clínica (opcional)" />
          </div>
          <div>
            <label style={rotuloEstilo}>
              ASO — Atestado de Saúde Ocupacional <span style={{ color: "var(--red)" }}>*</span>
            </label>
            <span
              data-alvo="ex-aso"
              className="btn btn-ghost btn-sm"
              style={{ border: "1px dashed rgba(122,30,38,0.3)" }}
            >
              📎 {e.anexado ? "aso-2026.pdf" : "Anexar o ASO (PDF ou imagem)"}
            </span>
          </div>
          <Campo id="ex-obs" e={e} rotulo="Observação (opcional)" area />
          <p style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
            Dado de saúde (LGPD): só você e o RH autorizado veem este documento. O exame passa a
            valer depois da conferência do RH.
          </p>
          <span
            className="btn btn-primary"
            data-alvo="btn-enviar-aso"
            style={{ justifyContent: "center" }}
          >
            Enviar exame para conferência
          </span>
        </div>
      </div>
    </div>
  );
}

export const enviarExame: Roteiro = {
  id: "exame",
  titulo: "Enviar o exame ocupacional",
  altura: 860,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="inicio" e={e}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <CabecalhoRequisicoes pendentes={0} />
          <CardExame e={e} />
        </div>
      </Shell>
      {!!e.modal && <ModalExame e={e} />}
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "card-exame",
      legenda:
        "Em “Minhas Requisições do RH” fica o cartão “Meu exame médico periódico”: mostra a situação (por exemplo “A vencer”), o último exame e o próximo vencimento."
    },
    {
      acao: "clicar",
      alvo: "btn-enviar-exame",
      set: { modal: true },
      legenda: "Depois de fazer o exame, clique em “Enviar meu exame”."
    },
    {
      acao: "digitar",
      alvo: "ex-data",
      valor: "20/10/2026",
      legenda: "Informe a “Data do exame”. Médico e clínica são opcionais."
    },
    {
      acao: "clicar",
      alvo: "ex-aso",
      set: { anexado: true },
      legenda: "Anexe o ASO — Atestado de Saúde Ocupacional (PDF ou imagem). É obrigatório."
    },
    {
      acao: "clicar",
      alvo: "btn-enviar-aso",
      set: { modal: false, exameEnviado: true },
      legenda:
        "Clique em “Enviar exame para conferência”. É um dado de saúde: só você e o RH autorizado veem o documento."
    },
    {
      acao: "mover",
      alvo: "exame-aguardando",
      legenda:
        "O cartão mostra “Exame enviado, aguardando a conferência do RH”. O exame passa a valer quando o RH confirmar; se devolver, o motivo aparece aqui e você reenvia."
    }
  ]
};

/* ───────── E3. Atualizar dados cadastrais ───────── */

function CartaoDependentes({ e }: { e: Estado }) {
  const linhas = e.add ? 1 : 0;
  const colunas = "2fr 1.2fr 1fr auto";
  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "2px solid rgba(122,30,38,0.25)",
        background: "#fff",
        overflow: "hidden"
      }}
    >
      <div style={{ background: "var(--burgundy-600)", padding: "14px 18px" }}>
        <p
          style={{ color: "#fff", fontWeight: 700, fontSize: 14, display: "flex", gap: 8 }}
          data-alvo="dep-titulo"
        >
          <span aria-hidden>👨‍👧</span> O RH solicita: Dependentes
        </p>
        <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 12, marginTop: 4 }}>
          Confira os registros abaixo, corrija, adicione ou remova o que for preciso e confirme.
        </p>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {linhas > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: colunas, gap: 8 }}>
            {["Nome *", "CPF", "Nascimento"].map((h) => (
              <span key={h} style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-700)" }}>
                {h}
              </span>
            ))}
            <span />
          </div>
        )}
        {linhas > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: colunas, gap: 8, alignItems: "end" }}>
            <Campo id="dep-nome" e={e} />
            <Campo id="dep-cpf" e={e} placeholder="000.000.000-00" />
            <Campo id="dep-nasc" e={e} data />
            <span
              style={{
                height: 34,
                width: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(200,57,63,0.25)",
                color: "var(--red)"
              }}
            >
              <TrashIcon size={14} />
            </span>
          </div>
        )}
        <span
          data-alvo="btn-adicionar"
          style={{
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px dashed rgba(122,30,38,0.28)",
            color: "var(--burgundy-600)",
            fontSize: 12,
            fontWeight: 600
          }}
        >
          <PlusIcon size={13} /> Adicionar
        </span>
        {linhas === 0 && (
          <label
            data-alvo="check-sem"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
          >
            <input type="checkbox" readOnly checked={!!e.sem} style={{ width: 16, height: 16 }} />{" "}
            Não possuo dependentes
          </label>
        )}
        <p
          data-alvo="dep-aviso"
          style={{
            padding: "9px 12px",
            borderRadius: "var(--radius-md)",
            background: "rgba(247,196,55,0.12)",
            border: "1px solid rgba(247,196,55,0.45)",
            color: "#6b5200",
            fontSize: 12.5,
            lineHeight: 1.5
          }}
        >
          <strong>Atenção:</strong> Os documentos originais devem ser apresentados no setor de
          Recursos Humanos: a certidão de nascimento e o CPF dos dependentes.
        </p>
        <span
          data-alvo="btn-confirmar-dep"
          style={{
            width: "100%",
            textAlign: "center",
            padding: 10,
            borderRadius: "var(--radius-md)",
            background: "var(--burgundy-600)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600
          }}
        >
          Confirmar Dependentes
        </span>
      </div>
    </div>
  );
}

export const atualizarDados: Roteiro = {
  id: "dados",
  titulo: "Atualizar endereço, dependentes e formação",
  altura: 860,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="inicio" e={e}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <CabecalhoRequisicoes pendentes={e.confirmado ? 0 : 1} />
          {e.confirmado ? (
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(47,125,79,0.07)",
                border: "1px solid rgba(47,125,79,0.2)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                color: "#1e5c38"
              }}
              data-alvo="dep-ok"
            >
              ✓ Dependentes confirmados. Obrigado!
            </div>
          ) : (
            <CartaoDependentes e={e} />
          )}
        </div>
      </Shell>
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "dep-titulo",
      legenda:
        "Quando o RH precisa atualizar um cadastro (endereço, dependentes, formação ou cursos), aparece um cartão vinho no alto de “Minhas Requisições do RH”: “O RH solicita: …”."
    },
    {
      acao: "clicar",
      alvo: "btn-adicionar",
      set: { add: true },
      legenda:
        "Clique em “Adicionar” para incluir um registro. Os já cadastrados vêm preenchidos: corrija ou remova (lixeira) o que estiver errado."
    },
    {
      acao: "digitar",
      alvo: "dep-nome",
      valor: "Lucas Souza",
      legenda: "Preencha os campos (o asterisco * marca os obrigatórios)."
    },
    {
      acao: "digitar",
      alvo: "dep-cpf",
      valor: "123.456.789-09",
      legenda: "O CPF é conferido: se for inválido, o sistema avisa."
    },
    {
      acao: "digitar",
      alvo: "dep-nasc",
      valor: "10/03/2018",
      legenda: "Informe a data de nascimento."
    },
    {
      acao: "mover",
      alvo: "dep-aviso",
      legenda:
        "Leia o aviso amarelo: os documentos originais precisam ser apresentados ao RH. O cadastro no sistema não os substitui."
    },
    {
      acao: "clicar",
      alvo: "btn-confirmar-dep",
      set: { confirmado: true },
      legenda:
        "Clique em “Confirmar Dependentes”. Se não houver nada a informar, marque “Não possuo dependentes” (sem registros) e confirme."
    },
    {
      acao: "mover",
      alvo: "dep-ok",
      legenda:
        "O pedido sai da lista de pendências. O mesmo roteiro vale para Formação Acadêmica, Cursos/Capacitações e Endereço."
    }
  ]
};

import React from "react";
import { PlusIcon, RefreshCwIcon } from "../../icons";
import { BotaoAnexo, Cabecalho, Campo, Janela, rotuloEstilo, SucessoJanela } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";

export const TIPOS: [string, string, string][] = [
  ["CORRECAO_PONTO", "🕐", "Correção de Ponto"],
  ["ATESTADO", "🏥", "Atestado Médico"],
  ["FERIAS", "🌴", "Férias"],
  ["LICENCA", "📋", "Licença e Outros"],
  ["ABONO", "📆", "Abono"],
  ["DAY_OFF", "🎂", "Day Off de Aniversário"],
  ["HORA_EXTRA", "⏱️", "Hora Extra"],
  ["ENVIO_DOCUMENTO_RH", "📎", "Envio de Documento ao RH"]
];

export const FILTROS = [
  "Todas",
  "🌴 Férias",
  "Pendentes",
  "Aguardando RH",
  "Aguardando seu documento",
  "Aprovadas",
  "Rej. Chefe",
  "Rej. RH"
];

export function Cartao({
  emoji,
  tipo,
  sub,
  status,
  cls,
  texto,
  cor
}: {
  emoji: string;
  tipo: string;
  sub: string;
  status: string;
  cls: string;
  texto: string;
  cor: string;
}) {
  return (
    <div className="card-flat" style={{ borderLeft: `3px solid ${cor}` }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{emoji}</span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{tipo}</p>
            <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>{sub}</p>
          </div>
        </div>
        <span className={`badge ${cls}`}>{status}</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.6 }}>{texto}</p>
    </div>
  );
}

export function Pagina({
  nova,
  filtro = 0,
  lista
}: {
  e?: Estado;
  nova?: React.ReactNode;
  filtro?: number;
  lista?: React.ReactNode;
}) {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <Cabecalho
        antes="Solicitações e"
        em="Justificativas"
        direita={
          <>
            <span className="btn btn-ghost btn-sm">
              <RefreshCwIcon size={14} />
            </span>
            <span className="btn btn-primary btn-sm" data-alvo="btn-nova">
              <PlusIcon size={15} /> Nova solicitação
            </span>
          </>
        }
      />
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {FILTROS.map((f, i) => (
          <span
            key={f}
            data-alvo={`filtro-${i}`}
            style={{
              padding: "5px 12px",
              borderRadius: "var(--radius-full)",
              fontSize: 12,
              fontWeight: i === filtro ? 700 : 500,
              border:
                i === filtro ? "1.5px solid var(--burgundy-600)" : "1px solid rgba(122,30,38,0.18)",
              background: i === filtro ? "var(--burgundy-600)" : "#fff",
              color: i === filtro ? "#fff" : "var(--ink-700)"
            }}
          >
            {f}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {lista ?? (
          <>
            {nova}
            <Cartao
              emoji="🕐"
              tipo="Correção de Ponto"
              sub="Ref: 14/10/2026"
              status="Aprovada"
              cls="badge-green"
              texto="Entrada 08:10 → 08:00. Sua justificativa: esqueci de registrar a entrada."
              cor="#16a34a"
            />
          </>
        )}
      </div>
    </div>
  );
}

export function Seletor() {
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16 }}>
        Selecione o tipo de solicitação:
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {TIPOS.map(([id, emoji, label]) => (
          <div
            key={id}
            data-alvo={`tipo-${id}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "16px 10px",
              border: "1.5px solid rgba(122,30,38,0.15)",
              borderRadius: "var(--radius-lg)",
              background: "#fff"
            }}
          >
            <span style={{ fontSize: 26 }}>{emoji}</span>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)",
                textAlign: "center",
                lineHeight: 1.3
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export function BotaoEnviar({ id = "btn-enviar" }: { id?: string }) {
  return (
    <span className="btn btn-primary" data-alvo={id} style={{ justifyContent: "center" }}>
      Enviar Solicitação
    </span>
  );
}

const atalho: React.CSSProperties = {
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px solid rgba(122,30,38,0.18)",
  background: "#fff",
  color: "var(--ink-600)",
  fontSize: 11.5,
  fontWeight: 600
};

/* ───────── Abono ───────── */

function FormAbono({ e }: { e: Estado }) {
  const temData = !!e["abono-data"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          padding: "10px 12px",
          background: "rgba(37,99,235,0.05)",
          border: "1px solid rgba(37,99,235,0.15)",
          borderRadius: "var(--radius-md)",
          fontSize: 12,
          color: "var(--ink-700)",
          lineHeight: 1.5
        }}
        data-alvo="caixa-abono"
      >
        <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e40af" }}>
          ℹ️ Como funciona o abono
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            Pode ser pedido para <strong>datas passadas ou futuras</strong>.
          </li>
          <li>
            Hora <strong>00:00 a 23:59 = dia inteiro</strong>. Mude a hora só se o abono for{" "}
            <strong>parcial</strong>.
          </li>
          <li>
            O <strong>documento é opcional</strong> (imagem ou PDF), mas ajuda o chefe e o RH.
          </li>
          <li>
            O pedido passa pelo <strong>chefe</strong> e depois pelo <strong>RH</strong>. Só depois
            de aprovado o abono vale no ponto e no banco de horas.
          </li>
        </ul>
      </div>

      <div
        style={{
          padding: "10px 12px",
          background: "rgba(22,128,61,0.06)",
          border: "1px solid rgba(22,128,61,0.25)",
          borderRadius: "var(--radius-md)",
          fontSize: 12,
          color: "var(--ink-700)",
          lineHeight: 1.5
        }}
        data-alvo="caixa-credito"
      >
        <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#166534" }}>
          ⏱ Tempo liberado pelo RH: 10h00 disponíveis
        </p>
        <p style={{ margin: "0 0 6px" }}>
          O RH liberou este tempo do seu banco de horas para você usar como abono. O pedido segue o
          fluxo normal (chefe e RH); o tempo fica reservado até a decisão.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked readOnly />
          <strong>Usar o tempo liberado pelo RH neste abono (prioritário)</strong>
        </label>
        {temData && (
          <p style={{ margin: "6px 0 0" }}>
            Este abono consome <strong>8h00</strong> do tempo liberado; sobram <strong>2h00</strong>
            .
          </p>
        )}
      </div>

      <div
        style={{
          padding: "10px 12px",
          border: "1px solid rgba(122,30,38,0.12)",
          borderRadius: "var(--radius-md)",
          background: "var(--cream-50)"
        }}
      >
        <strong style={{ fontSize: 12.5, color: "var(--burgundy-600)" }}>
          Período 1{" "}
          <span style={{ fontWeight: 500, color: "var(--ink-500)" }}>
            · {temData ? "dia inteiro" : "informe as datas"}
          </span>
        </strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr",
            gap: 6,
            marginTop: 8
          }}
        >
          <Campo id="abono-data" e={e} rotulo="Data inicial" obrigatorio data />
          <Campo id="abono-fim" e={e} rotulo="Data final" data />
          <Campo id="abono-hi" e={{ "abono-hi": "00:00" }} rotulo="Hora inicial" />
          <Campo id="abono-hf" e={{ "abono-hf": "23:59" }} rotulo="Hora final" />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <span style={atalho} data-alvo="atalho-dia">
            Dia inteiro
          </span>
          <span style={atalho}>☀️ Matutino (08:00–12:00)</span>
          <span style={atalho}>🌆 Vespertino (13:00–18:00)</span>
        </div>
      </div>
      <span className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>
        + Adicionar período
      </span>

      <div>
        <label style={rotuloEstilo}>Documento (opcional)</label>
        <BotaoAnexo id="abono-anexo" texto="📎 Anexar documento (imagem ou PDF)" />
      </div>
      <Campo
        id="abono-motivo"
        e={e}
        rotulo="Descrição / Justificativa"
        obrigatorio
        area
        placeholder="Descreva o motivo..."
      />
      <BotaoEnviar />
    </div>
  );
}

export const pedirAbono: Roteiro = {
  id: "pedir-abono",
  titulo: "Pedir abono",
  altura: 1120,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="solicitacoes" e={e}>
        <Pagina
          e={e}
          nova={
            e.enviado ? (
              <Cartao
                emoji="📆"
                tipo="Abono"
                sub="17/10/2026 · Aberta 20/10/2026 · 📎 doc. anexado"
                status="Aguardando Chefe"
                cls="badge-amber"
                texto="Consulta médica pela manhã."
                cor="var(--amber)"
              />
            ) : null
          }
        />
      </Shell>
      {e.modal && !e.sucesso && (
        <Janela
          titulo={e.tipo === "ABONO" ? "📆 Abono" : "Nova Solicitação"}
          voltar={e.tipo === "ABONO"}
        >
          {e.tipo === "ABONO" ? <FormAbono e={e} /> : <Seletor />}
        </Janela>
      )}
      {e.sucesso && (
        <SucessoJanela titulo="Solicitação enviada!" texto="Aguardando análise do chefe." />
      )}
    </>
  ),
  passos: [
    {
      acao: "clicar",
      alvo: "btn-nova",
      set: { modal: true },
      legenda: "Em Solicitações, clique em “+ Nova solicitação”."
    },
    {
      acao: "clicar",
      alvo: "tipo-ABONO",
      set: { tipo: "ABONO" },
      legenda: "Escolha o tipo “Abono”."
    },
    {
      acao: "mover",
      alvo: "caixa-abono",
      legenda:
        "Leia o quadro “Como funciona o abono”: serve para datas passadas ou futuras, dia inteiro ou parcial."
    },
    {
      acao: "mover",
      alvo: "caixa-credito",
      legenda:
        "Se o RH liberou tempo do seu banco de horas, ele aparece aqui e é usado primeiro no abono."
    },
    {
      acao: "digitar",
      alvo: "abono-data",
      valor: "17/10/2026",
      legenda:
        "Informe a “Data inicial” (e a final, se forem vários dias). O sistema calcula quanto tempo será consumido."
    },
    {
      acao: "clicar",
      alvo: "atalho-dia",
      legenda:
        "Para abono de um dia inteiro mantenha 00:00 a 23:59 (“Dia inteiro”); para parcial, ajuste as horas ou use os atalhos."
    },
    {
      acao: "clicar",
      alvo: "abono-anexo",
      set: { anexado: true },
      legenda: "O documento é opcional (imagem ou PDF), mas ajuda o chefe e o RH."
    },
    {
      acao: "digitar",
      alvo: "abono-motivo",
      valor: "Consulta médica pela manhã.",
      legenda: "Preencha a “Descrição / Justificativa”: é obrigatória."
    },
    {
      acao: "clicar",
      alvo: "btn-enviar",
      set: { sucesso: true },
      legenda: "Clique em “Enviar Solicitação”."
    },
    {
      acao: "aguardar",
      set: { sucesso: false, modal: false, enviado: true },
      legenda:
        "O pedido aparece na lista como “Aguardando Chefe”. Depois vem “Aguardando RH” e, por fim, “Aprovada”."
    }
  ]
};

/* ───────── Atestado ───────── */

function FormAtestado({ e }: { e: Estado }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Campo id="at-ini" e={e} rotulo="Data Inicial" obrigatorio data />
        <Campo id="at-fim" e={e} rotulo="Data Final" data />
      </div>
      {!!e["at-ini"] && (
        <p style={{ fontSize: 12, color: "var(--ink-500)" }}>
          Duração: <strong>1 dia</strong> — dia inteiro ou período
        </p>
      )}
      <div>
        <label style={rotuloEstilo}>Período do atestado (atalhos)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="btn btn-ghost btn-sm">☀️ Matutino (08:00–12:00)</span>
          <span className="btn btn-ghost btn-sm">🌆 Vespertino (13:00–18:00)</span>
        </div>
      </div>
      <div>
        <label style={rotuloEstilo}>Documento do atestado (foto ou PDF)</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <BotaoAnexo id="at-upload" texto="📎 Upload (imagem ou PDF)" />
          {!!e.anexado && (
            <span style={{ fontSize: 12, color: "var(--ink-500)" }}>✓ atestado.pdf</span>
          )}
        </div>
      </div>
      <div>
        <Campo id="at-cid" e={e} rotulo="CID" obrigatorio placeholder="Ex.: Z13" />
        <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "4px 0 0" }}>
          Informe 1 letra seguida de 2 números (ex.: Z13). Se o documento trouxer 3 números (Z136 ou
          Z13.6), informe só Z13: é a mesma categoria.
        </p>
        <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "2px 0 0" }}>
          Informação de saúde protegida (LGPD): fica visível apenas para o RH.
        </p>
      </div>
      <Campo
        id="at-motivo"
        e={e}
        rotulo="Descrição / Justificativa"
        obrigatorio
        area
        placeholder="Descreva o motivo..."
      />
      <BotaoEnviar id="btn-enviar-at" />
    </div>
  );
}

export const enviarAtestado: Roteiro = {
  id: "enviar-atestado",
  titulo: "Enviar um atestado",
  altura: 960,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="solicitacoes" e={e}>
        <Pagina
          e={e}
          nova={
            e.enviado ? (
              <Cartao
                emoji="🏥"
                tipo="Atestado Médico"
                sub="20/10/2026 · Aberta 20/10/2026 · 📎 doc. anexado"
                status="Aguardando Chefe"
                cls="badge-amber"
                texto="Consulta e repouso."
                cor="var(--amber)"
              />
            ) : null
          }
        />
      </Shell>
      {e.modal && !e.sucesso && (
        <Janela
          titulo={e.tipo === "ATESTADO" ? "🏥 Atestado Médico" : "Nova Solicitação"}
          voltar={e.tipo === "ATESTADO"}
        >
          {e.tipo === "ATESTADO" ? <FormAtestado e={e} /> : <Seletor />}
        </Janela>
      )}
      {e.sucesso && (
        <SucessoJanela titulo="Solicitação enviada!" texto="Aguardando análise do chefe." />
      )}
    </>
  ),
  passos: [
    {
      acao: "clicar",
      alvo: "btn-nova",
      set: { modal: true },
      legenda: "Em Solicitações, clique em “+ Nova solicitação”."
    },
    {
      acao: "clicar",
      alvo: "tipo-ATESTADO",
      set: { tipo: "ATESTADO" },
      legenda: "Escolha “Atestado Médico”."
    },
    {
      acao: "digitar",
      alvo: "at-ini",
      valor: "20/10/2026",
      legenda:
        "Informe a “Data Inicial” e, se for mais de um dia, a “Data Final”. Para atestado de poucas horas, use os atalhos Matutino/Vespertino ou ajuste o horário."
    },
    {
      acao: "clicar",
      alvo: "at-upload",
      set: { anexado: true },
      legenda: "Anexe a foto nítida ou o PDF do atestado (“Upload”)."
    },
    {
      acao: "digitar",
      alvo: "at-cid",
      valor: "J11",
      legenda:
        "Digite o CID do atestado: 1 letra e 2 números (ex.: J11). Se vier com 3 números (J110 ou J11.0), use só J11. É uma informação de saúde protegida: só o RH vê."
    },
    {
      acao: "digitar",
      alvo: "at-motivo",
      valor: "Consulta e repouso.",
      legenda: "Preencha a “Descrição / Justificativa”."
    },
    {
      acao: "clicar",
      alvo: "btn-enviar-at",
      set: { sucesso: true },
      legenda: "Clique em “Enviar Solicitação”: o chefe dará ciência e o RH fará a análise."
    },
    {
      acao: "aguardar",
      set: { sucesso: false, modal: false, enviado: true },
      legenda: "O atestado aparece na lista como “Aguardando Chefe”."
    }
  ]
};

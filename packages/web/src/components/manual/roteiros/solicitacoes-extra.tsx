import React from "react";
import { BotaoAnexo, Campo, Janela, Selecao, SucessoJanela, rotuloEstilo } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Passo, Roteiro } from "../tipos";
import { BotaoEnviar, Cartao, Pagina, Seletor } from "./solicitacoes";

/**
 * Fábrica das animações de "Nova solicitação": abre o modal, escolhe o tipo, preenche o formulário
 * (passos específicos), envia e mostra o cartão na lista.
 */
function solicitacao(o: {
  id: string;
  titulo: string;
  tipo: string;
  tituloModal: string;
  altura: number;
  form: (e: Estado) => React.ReactNode;
  passosForm: Passo[];
  enviarId: string;
  sucesso: { titulo: string; texto: string };
  cartao: React.ReactNode;
  legendaFinal: string;
}): Roteiro {
  return {
    id: o.id,
    titulo: o.titulo,
    altura: o.altura,
    estadoInicial: {},
    render: (e) => (
      <>
        <Shell ativo="solicitacoes" e={e}>
          <Pagina e={e} lista={e.enviado ? o.cartao : undefined} />
        </Shell>
        {e.modal && !e.sucesso && (
          <Janela
            titulo={e.tipo === o.tipo ? o.tituloModal : "Nova Solicitação"}
            voltar={e.tipo === o.tipo}
          >
            {e.tipo === o.tipo ? o.form(e) : <Seletor />}
          </Janela>
        )}
        {e.sucesso && <SucessoJanela titulo={o.sucesso.titulo} texto={o.sucesso.texto} />}
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
        alvo: `tipo-${o.tipo}`,
        set: { tipo: o.tipo },
        legenda: `Escolha “${o.tituloModal.replace(/^\S+\s/, "")}”.`
      },
      ...o.passosForm,
      {
        acao: "clicar",
        alvo: o.enviarId,
        set: { sucesso: true },
        legenda: "Clique no botão de enviar."
      },
      {
        acao: "aguardar",
        set: { sucesso: false, modal: false, enviado: true },
        legenda: o.legendaFinal
      }
    ]
  };
}

const Caixa = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <div
    data-alvo={id}
    style={{
      padding: "12px 14px",
      background: "rgba(37,99,235,0.05)",
      border: "1px solid rgba(37,99,235,0.18)",
      borderRadius: "var(--radius-md)",
      fontSize: 12.5,
      color: "var(--ink-700)",
      lineHeight: 1.55
    }}
  >
    {children}
  </div>
);

/* ───────── C3. Licença ───────── */

const TIPOS_LIC = [
  "Licença Nojo (até 2 dias)",
  "Licença Gala (até 3 dias)",
  "Doação de Sangue (até 1 dia)"
];

export const pedirLicenca = solicitacao({
  id: "licenca",
  titulo: "Pedir uma licença",
  tipo: "LICENCA",
  tituloModal: "📋 Licença e Outros",
  altura: 1060,
  enviarId: "btn-enviar-lic",
  sucesso: { titulo: "Solicitação enviada!", texto: "Aguardando análise do chefe." },
  legendaFinal:
    "A licença aparece na lista como “Aguardando Chefe”. Depois passa pelo RH; aprovada, os dias ficam registrados como afastamento.",
  cartao: (
    <Cartao
      emoji="📋"
      tipo="Licença e Outros"
      sub="Licença Gala · 20/10/2026 a 22/10/2026 · 📎 doc. anexado"
      status="Aguardando Chefe"
      cls="badge-amber"
      texto="Casamento no dia 20/10."
      cor="var(--amber)"
    />
  ),
  form: (e) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Selecao
        id="lic-tipo"
        e={e}
        rotulo="Tipo de licença"
        obrigatorio
        vazio="Selecione o tipo de licença"
        opcoes={TIPOS_LIC}
      />
      {!!e["lic-tipo"] && (
        <Caixa id="lic-info">
          <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e40af" }}>
            ℹ️ Licença Gala: até 3 dias
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              Contagem em <strong>dias corridos</strong>, em um único período contínuo.
            </li>
            <li>Documento comprobatório obrigatório.</li>
            <li>Anexe a certidão de casamento.</li>
            <li>
              O pedido passa pelo <strong>chefe</strong> e depois pelo <strong>RH</strong>.
            </li>
          </ul>
        </Caixa>
      )}
      <div
        style={{
          padding: "10px 12px",
          border: "1px solid rgba(122,30,38,0.12)",
          borderRadius: "var(--radius-md)",
          background: "var(--cream-50)"
        }}
      >
        <strong style={{ fontSize: 12.5, color: "var(--burgundy-600)" }}>Período 1</strong>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <Campo id="lic-ini" e={e} rotulo="Data inicial" obrigatorio data />
          <Campo id="lic-fim" e={e} rotulo="Data final" data />
        </div>
      </div>
      <div>
        <label style={rotuloEstilo}>Documento</label>
        <BotaoAnexo id="lic-anexo" texto="📎 Anexar documento (imagem ou PDF)" />
        {!!e.anexado && (
          <span style={{ fontSize: 12, color: "var(--ink-500)", marginLeft: 8 }}>
            ✓ certidao.pdf
          </span>
        )}
      </div>
      <Campo
        id="lic-motivo"
        e={e}
        rotulo="Descrição / Justificativa"
        obrigatorio
        area
        placeholder="Descreva o motivo..."
      />
      <BotaoEnviar id="btn-enviar-lic" />
    </div>
  ),
  passosForm: [
    {
      acao: "selecionar",
      alvo: "lic-tipo",
      valor: "Licença Gala (até 3 dias)",
      legenda: "Escolha o tipo de licença na lista. Entre parênteses aparece o limite de dias."
    },
    {
      acao: "mover",
      alvo: "lic-info",
      legenda:
        "O quadro azul explica as regras do tipo escolhido: como os dias são contados, se exige documento e o que anexar."
    },
    { acao: "digitar", alvo: "lic-ini", valor: "20/10/2026", legenda: "Informe a “Data inicial”…" },
    {
      acao: "digitar",
      alvo: "lic-fim",
      valor: "22/10/2026",
      legenda: "… e a “Data final”, respeitando o limite de dias do tipo."
    },
    {
      acao: "clicar",
      alvo: "lic-anexo",
      set: { anexado: true },
      legenda: "Anexe o documento exigido (aqui, a certidão de casamento)."
    },
    {
      acao: "digitar",
      alvo: "lic-motivo",
      valor: "Casamento no dia 20/10.",
      legenda: "Preencha a “Descrição / Justificativa”."
    }
  ]
});

/* ───────── C4. Day off ───────── */

export const pedirDayOff = solicitacao({
  id: "day-off",
  titulo: "Day Off de Aniversário",
  tipo: "DAY_OFF",
  tituloModal: "🎂 Day Off de Aniversário",
  altura: 880,
  enviarId: "btn-enviar-do",
  sucesso: { titulo: "Solicitação enviada!", texto: "Aguardando análise do chefe." },
  legendaFinal: "O pedido aparece “Aguardando Chefe” e depois segue ao RH.",
  cartao: (
    <Cartao
      emoji="🎂"
      tipo="Day Off de Aniversário"
      sub="23/10/2026 · Aberta 20/10/2026"
      status="Aguardando Chefe"
      cls="badge-amber"
      texto="Vou aproveitar o dia com a família."
      cor="var(--amber)"
    />
  ),
  form: (e) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        data-alvo="do-info"
        style={{
          padding: "12px 14px",
          background: "rgba(122,30,38,0.04)",
          border: "1px solid rgba(122,30,38,0.12)",
          borderRadius: "var(--radius-md)",
          fontSize: 12.5,
          lineHeight: 1.5
        }}
      >
        🎂 Seu mês de aniversário é <strong>outubro</strong>. Escolha qualquer dia útil desse mês
        para o seu day off.
      </div>
      <div>
        <Campo id="do-dia" e={e} rotulo="Dia do Day Off" obrigatorio data larg={220} />
        <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "4px 0 0" }}>
          Permitido apenas em outubro de 2026.
        </p>
      </div>
      <Campo
        id="do-motivo"
        e={e}
        rotulo="Descrição / Justificativa"
        obrigatorio
        area
        placeholder="Descreva como pretende usufruir do seu day off de aniversário..."
      />
      <BotaoEnviar id="btn-enviar-do" />
    </div>
  ),
  passosForm: [
    {
      acao: "mover",
      alvo: "do-info",
      legenda:
        "O formulário mostra o seu mês de aniversário. Se a data de nascimento não estiver cadastrada, ele avisa e o RH precisa cadastrá-la."
    },
    {
      acao: "digitar",
      alvo: "do-dia",
      valor: "23/10/2026",
      legenda: "Escolha um dia útil desse mês."
    },
    {
      acao: "digitar",
      alvo: "do-motivo",
      valor: "Vou aproveitar o dia com a família.",
      legenda: "Descreva como pretende usar o day off."
    }
  ]
});

/* ───────── C5. Férias ───────── */

export const pedirFerias = solicitacao({
  id: "ferias",
  titulo: "Marcar férias",
  tipo: "FERIAS",
  tituloModal: "🌴 Férias",
  altura: 1240,
  enviarId: "btn-enviar-fe",
  sucesso: { titulo: "Solicitação enviada!", texto: "Aguardando análise do chefe." },
  legendaFinal:
    "O pedido segue ao chefe e ao RH. Depois da aprovação do chefe, o RH envia o Aviso e o Recibo de Férias para você assinar no sistema.",
  cartao: (
    <Cartao
      emoji="🌴"
      tipo="Férias"
      sub="Ciclo 1 · 2 períodos · Vender 10 dias · Aberta 20/10/2026"
      status="Aguardando Chefe"
      cls="badge-amber"
      texto="Férias de fim de ano."
      cor="var(--amber)"
    />
  ),
  form: (e) => {
    const n = (k: string) => (e[k] ? 15 : 0);
    const gozo = n("fe-ini1") + n("fe-ini2");
    const venda = e["fe-venda"] ? 10 : 0;
    const restam = 30 - gozo - venda;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(22,128,61,0.06)",
            border: "1px solid rgba(22,128,61,0.25)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            lineHeight: 1.5
          }}
          data-alvo="fe-ciclo"
        >
          Configurando <strong>ciclo 1</strong> (30 dias a programar). Na primeira solicitação,
          informe todos os períodos até Restam = 0.
        </div>
        <div
          data-alvo="fe-regras"
          style={{
            padding: "10px 12px",
            background: "var(--cream-50)",
            border: "1px solid rgba(122,30,38,0.12)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
            color: "var(--ink-600, #4b5563)",
            lineHeight: 1.5
          }}
        >
          <strong>Regras:</strong> até 3 períodos de gozo · todos os períodos mín. 5 dias · ao menos
          1 período deve ter ≥ 14 dias · venda máx. 10 dias · antecedência mín. 30 dias.
        </div>
        <div>
          <label style={rotuloEstilo}>Dias a vender (abono pecuniário) — máx. 10</label>
          <Campo id="fe-venda" e={e} larg={120} placeholder="0" />
        </div>
        {[1, 2].map((i) => (
          <div
            key={i}
            style={{
              padding: "10px 12px",
              border: "1px solid rgba(122,30,38,0.12)",
              borderRadius: "var(--radius-md)",
              background: "var(--cream-50)"
            }}
          >
            <strong style={{ fontSize: 12.5, color: "var(--burgundy-600)" }}>{i}º Período</strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr auto",
                gap: 8,
                marginTop: 8,
                alignItems: "end"
              }}
            >
              <Campo id={`fe-ini${i}`} e={e} rotulo="Início" data />
              <Campo id={`fe-fim${i}`} e={e} rotulo="Fim" data />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  textAlign: "center",
                  minWidth: 52,
                  paddingBottom: 8
                }}
              >
                {e[`fe-ini${i}`] ? "15d" : "—"}
              </span>
            </div>
          </div>
        ))}
        <span className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>
          + Adicionar período
        </span>
        <div
          data-alvo="fe-resumo"
          style={{
            display: "flex",
            gap: 22,
            padding: "10px 14px",
            border: "1px solid rgba(122,30,38,0.12)",
            borderRadius: "var(--radius-md)"
          }}
        >
          {[
            ["Gozo", gozo],
            ["Venda", venda],
            ["Total", gozo + venda],
            ["Restam", restam]
          ].map(([l, v]) => (
            <div key={l as string}>
              <p style={{ fontSize: 10, textTransform: "uppercase", color: "#9ca3af" }}>{l}</p>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: l === "Restam" ? (restam === 0 ? "#15803D" : "#B45309") : undefined
                }}
              >
                {v}
              </p>
            </div>
          ))}
        </div>
        {restam !== 0 && (
          <p style={{ fontSize: 12, color: "var(--red)" }}>
            Para enviar a primeira solicitação, Restam deve ser igual a 0.
          </p>
        )}
        <Campo
          id="fe-motivo"
          e={e}
          rotulo="Descrição / Justificativa"
          area
          placeholder="Informações adicionais (opcional)..."
        />
        <BotaoEnviar id="btn-enviar-fe" />
      </div>
    );
  },
  passosForm: [
    {
      acao: "mover",
      alvo: "fe-ciclo",
      legenda:
        "O quadro verde mostra o ciclo de férias que você está configurando e quantos dias há para programar."
    },
    {
      acao: "mover",
      alvo: "fe-regras",
      legenda:
        "Leia as regras: quantidade e tamanho dos períodos, venda de dias e antecedência mínima. O sistema confere tudo ao enviar."
    },
    {
      acao: "digitar",
      alvo: "fe-venda",
      valor: "10",
      legenda: "Se quiser vender dias (abono pecuniário), informe quantos — no máximo 10."
    },
    {
      acao: "digitar",
      alvo: "fe-ini1",
      valor: "15/12/2026",
      legenda: "No “1º Período”, informe a data de início…"
    },
    {
      acao: "digitar",
      alvo: "fe-fim1",
      valor: "29/12/2026",
      legenda: "… e a data de fim. À direita aparece o total de dias do período."
    },
    {
      acao: "digitar",
      alvo: "fe-ini2",
      valor: "04/01/2027",
      legenda: "Preencha o “2º Período” (use “+ Adicionar período” para um terceiro)."
    },
    {
      acao: "mover",
      alvo: "fe-resumo",
      legenda:
        "No resumo, “Restam” precisa chegar a 0 (gozo + venda = 30). Se não chegar, o sistema avisa e não deixa enviar."
    }
  ]
});

/* ───────── C6. Hora extra ───────── */

export const pedirHoraExtra = solicitacao({
  id: "hora-extra",
  titulo: "Hora extra",
  tipo: "HORA_EXTRA",
  tituloModal: "⏱️ Hora Extra",
  altura: 900,
  enviarId: "btn-enviar-he",
  sucesso: { titulo: "Solicitação enviada!", texto: "Aguardando análise do chefe." },
  legendaFinal: "O pedido segue ao chefe e ao RH. Aprovado, o tempo entra no banco de horas.",
  cartao: (
    <Cartao
      emoji="⏱️"
      tipo="Hora Extra"
      sub="21/10/2026 · 2h00 · Aberta 20/10/2026"
      status="Aguardando Chefe"
      cls="badge-amber"
      texto="Fechamento do relatório mensal."
      cor="var(--amber)"
    />
  ),
  form: (e) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        data-alvo="he-info"
        style={{
          padding: "12px 14px",
          background: "rgba(122,30,38,0.04)",
          border: "1px solid rgba(122,30,38,0.12)",
          borderRadius: "var(--radius-md)",
          fontSize: 12.5,
          lineHeight: 1.5
        }}
      >
        ⏱️ Use este formulário para solicitar <strong>antecipadamente</strong> horas extras ao seu
        chefe. O mínimo permitido é <strong>2h00</strong>, conforme configuração do sistema.
      </div>
      <Campo id="he-data" e={e} rotulo="Data da Hora Extra" obrigatorio data larg={220} />
      <div>
        <label style={rotuloEstilo}>
          Tempo Extra Estimado <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Campo id="he-h" e={e} larg={72} placeholder="0" />
          <span style={{ fontSize: 13, color: "var(--ink-500)" }}>h</span>
          <Campo id="he-m" e={e} larg={72} placeholder="0" />
          <span style={{ fontSize: 13, color: "var(--ink-500)" }}>min</span>
        </div>
        {!!e["he-h"] && (
          <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 4 }} data-alvo="he-total">
            Total: <strong>2h00</strong>
          </p>
        )}
      </div>
      <Campo
        id="he-motivo"
        e={e}
        rotulo="Motivo / Justificativa"
        obrigatorio
        area
        placeholder="Descreva o motivo da hora extra solicitada…"
      />
      <BotaoEnviar id="btn-enviar-he" />
    </div>
  ),
  passosForm: [
    {
      acao: "mover",
      alvo: "he-info",
      legenda:
        "Peça a hora extra ANTES de fazê-la. O tempo mínimo é definido pela configuração do sistema. (Se passar do limite ao registrar a saída, o sistema também cria o pedido sozinho.)"
    },
    {
      acao: "digitar",
      alvo: "he-data",
      valor: "21/10/2026",
      legenda: "Informe a data da hora extra."
    },
    { acao: "digitar", alvo: "he-h", valor: "2", legenda: "Informe o tempo estimado: horas…" },
    { acao: "digitar", alvo: "he-m", valor: "0", legenda: "… e minutos." },
    {
      acao: "mover",
      alvo: "he-total",
      legenda:
        "O total aparece embaixo. Abaixo do mínimo, o campo fica vermelho e o envio é bloqueado."
    },
    {
      acao: "digitar",
      alvo: "he-motivo",
      valor: "Fechamento do relatório mensal.",
      legenda: "Explique o motivo."
    }
  ]
});

/* ───────── C7. Documento ao RH ───────── */

export const enviarDocumentoRh = solicitacao({
  id: "documento-rh",
  titulo: "Enviar um documento ao RH",
  tipo: "ENVIO_DOCUMENTO_RH",
  tituloModal: "📎 Envio de Documento ao RH",
  altura: 860,
  enviarId: "btn-enviar-dr",
  sucesso: { titulo: "Solicitação enviada!", texto: "Documento encaminhado ao RH para análise." },
  legendaFinal: "O pedido vai direto ao RH e aparece como “Aguardando RH”.",
  cartao: (
    <Cartao
      emoji="📎"
      tipo="Envio de Documento ao RH"
      sub="Aberta 20/10/2026 · 📎 doc. anexado"
      status="Aguardando RH"
      cls="badge-blue"
      texto="Declaração de matrícula do curso."
      cor="#2563eb"
    />
  ),
  form: (e) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.5 }}>
        Envie documentos ao setor de RH com uma breve descrição (comprovantes, declarações, etc.). A
        solicitação vai direto para análise do RH.
      </p>
      <Campo
        id="dr-desc"
        e={e}
        rotulo="Descrição do documento"
        obrigatorio
        area
        placeholder="Descreva o documento que está enviando…"
      />
      <div>
        <label style={rotuloEstilo}>
          Arquivo (imagem ou PDF) <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <div
          data-alvo="dr-arquivo"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            border: "1.5px dashed rgba(122,30,38,0.22)",
            background: "rgba(122,30,38,0.03)",
            fontSize: 13
          }}
        >
          <span style={{ fontSize: 18 }}>📎</span>
          <span style={{ flex: 1 }}>{e.anexado ? "declaracao.pdf" : "Selecionar arquivo…"}</span>
        </div>
      </div>
      <span
        className="btn btn-primary"
        data-alvo="btn-enviar-dr"
        style={{ justifyContent: "center" }}
      >
        Enviar ao RH
      </span>
    </div>
  ),
  passosForm: [
    {
      acao: "digitar",
      alvo: "dr-desc",
      valor: "Declaração de matrícula do curso.",
      legenda: "Descreva o documento que está enviando (mínimo de 3 caracteres)."
    },
    {
      acao: "clicar",
      alvo: "dr-arquivo",
      set: { anexado: true },
      legenda: "Clique em “Selecionar arquivo…” e escolha a imagem ou o PDF."
    }
  ]
});

/* ───────── C8. Acompanhar ───────── */

const TODOS: { filtros: number[]; node: React.ReactNode }[] = [
  {
    filtros: [2],
    node: (
      <Cartao
        key="a"
        emoji="📆"
        tipo="Abono"
        sub="17/10/2026 · Aberta 20/10/2026"
        status="Aguardando Chefe"
        cls="badge-amber"
        texto="Consulta médica pela manhã."
        cor="var(--amber)"
      />
    )
  },
  {
    filtros: [3],
    node: (
      <Cartao
        key="b"
        emoji="🏥"
        tipo="Atestado Médico"
        sub="14/10/2026 · Aberta 14/10/2026 · 📎 doc. anexado"
        status="Aguardando RH"
        cls="badge-blue"
        texto="Consulta e repouso."
        cor="#2563eb"
      />
    )
  },
  {
    filtros: [4],
    node: (
      <Cartao
        key="c"
        emoji="🏥"
        tipo="Atestado Médico"
        sub="10/10/2026 · Aberta 10/10/2026"
        status="Aguardando seu documento"
        cls="badge-amber"
        texto="O RH enviou a guia médica: devolva o documento de retorno da consulta."
        cor="var(--amber)"
      />
    )
  },
  {
    filtros: [5],
    node: (
      <Cartao
        key="d"
        emoji="🕐"
        tipo="Correção de Ponto"
        sub="Ref: 02/10/2026"
        status="Aprovada"
        cls="badge-green"
        texto="Entrada 08:10 → 08:00. Sua justificativa: esqueci de registrar a entrada."
        cor="#16a34a"
      />
    )
  },
  {
    filtros: [6],
    node: (
      <Cartao
        key="e"
        emoji="📆"
        tipo="Abono"
        sub="01/10/2026 · Aberta 01/10/2026"
        status="Rejeitada pelo Chefe"
        cls="badge-red"
        texto="Motivo da rejeição (chefe): data com muitos pedidos da equipe; reenvie para outro dia."
        cor="#dc2626"
      />
    )
  }
];

export const acompanharSolicitacoes: Roteiro = {
  id: "acompanhar",
  titulo: "Acompanhar e entender a situação",
  altura: 900,
  estadoInicial: { filtro: 0 },
  render: (e) => {
    const f = Number(e.filtro ?? 0);
    const itens = TODOS.filter((t) => f === 0 || t.filtros.includes(f)).map((t) => t.node);
    return (
      <Shell ativo="solicitacoes" e={e}>
        <Pagina e={e} filtro={f} lista={<>{itens}</>} />
      </Shell>
    );
  },
  passos: [
    {
      acao: "mover",
      alvo: "filtro-0",
      legenda:
        "Em Solicitações, a lista mostra todos os seus pedidos, do mais novo ao mais antigo. Cada um tem uma etiqueta colorida com a situação."
    },
    {
      acao: "clicar",
      alvo: "filtro-2",
      set: { filtro: 2 },
      legenda:
        "“Pendentes”: aguardando a decisão do seu chefe (etiqueta amarela “Aguardando Chefe”)."
    },
    {
      acao: "clicar",
      alvo: "filtro-3",
      set: { filtro: 3 },
      legenda: "“Aguardando RH”: o chefe já aprovou; o RH vai analisar (etiqueta azul)."
    },
    {
      acao: "clicar",
      alvo: "filtro-4",
      set: { filtro: 4 },
      legenda:
        "“Aguardando seu documento”: o RH precisa de um arquivo seu — por exemplo, o retorno da consulta de um atestado. Abra o pedido e envie."
    },
    {
      acao: "clicar",
      alvo: "filtro-5",
      set: { filtro: 5 },
      legenda: "“Aprovadas”: concluídas e já aplicadas (etiqueta verde)."
    },
    {
      acao: "clicar",
      alvo: "filtro-6",
      set: { filtro: 6 },
      legenda:
        "“Rej. Chefe” e “Rej. RH”: pedidos recusados (etiqueta vermelha). Leia o motivo no próprio cartão e, se for o caso, faça um novo pedido."
    },
    {
      acao: "clicar",
      alvo: "filtro-0",
      set: { filtro: 0 },
      legenda:
        "Volte a “Todas” para ver tudo de novo. Você também recebe um aviso no sino a cada mudança de situação."
    }
  ]
};

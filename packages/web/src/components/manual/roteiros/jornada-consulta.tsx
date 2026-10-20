import React from "react";
import { FileTextIcon } from "../../icons";
import { Campo, Janela, SucessoJanela } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";
import { Historico } from "./assinar-espelho";
import { VisualizadorComprovante } from "./registrar-entrada";
import { BotaoEnviar, Cartao, Pagina, Seletor } from "./solicitacoes";

/* ───────── B3. Comprovantes ───────── */

function Comprovantes() {
  const itens: [string, string, string][] = [
    ["Iniciar Jornada", "000123456", "08:02"],
    ["Início do Almoço", "000123890", "12:03"],
    ["Fim do Almoço", "000124011", "13:04"]
  ];
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <p className="eyebrow" style={{ marginBottom: 6 }}>
        Registro de ponto
      </p>
      <h1 style={{ fontSize: 30, lineHeight: 1.1 }}>
        Meus <em>comprovantes</em>
      </h1>
      <p style={{ color: "var(--ink-500)", fontSize: 14, margin: "6px 0 18px" }}>
        Cada marcação gera um Comprovante de Registro de Ponto do Trabalhador, disponível logo após
        o registro (Portaria MTP nº 671/2021, arts. 79 e 80).
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <span className="btn btn-sm btn-primary" data-alvo="chip-48h">
          Últimas 48 horas
        </span>
        <span className="btn btn-sm btn-ghost" data-alvo="chip-mes">
          Este mês
        </span>
        <span
          data-alvo="periodo"
          style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}
        >
          De{" "}
          <span
            style={{ border: "1px solid rgba(122,30,38,0.2)", borderRadius: 6, padding: "4px 8px" }}
          >
            dd/mm/aaaa
          </span>{" "}
          até{" "}
          <span
            style={{ border: "1px solid rgba(122,30,38,0.2)", borderRadius: 6, padding: "4px 8px" }}
          >
            dd/mm/aaaa
          </span>
          <span className="btn btn-sm btn-ghost">Pesquisar</span>
        </span>
        <span style={{ flex: 1 }} />
        <span className="btn btn-ghost btn-sm" data-alvo="btn-zip">
          ⬇ Baixar as últimas 48 horas (ZIP)
        </span>
      </div>
      <p
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--ink-500)",
          margin: "0 0 8px"
        }}
      >
        20/10/2026 · segunda-feira
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {itens.map(([r, nsr, h], i) => (
          <div
            key={nsr}
            data-alvo={`comp-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 14px",
              background: "#fff",
              border: "1px solid rgba(122,30,38,0.10)",
              borderRadius: "var(--radius-md)"
            }}
          >
            <FileTextIcon size={18} style={{ color: "var(--burgundy-600)" }} />
            <span style={{ flex: 1 }}>
              <strong style={{ fontSize: 14 }}>{r}</strong>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-500)" }}>
                NSR {nsr}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600 }}>
              {h}
            </span>
            <span style={{ fontSize: 12, color: "var(--burgundy-600)", fontWeight: 600 }}>
              Abrir
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const verComprovantes: Roteiro = {
  id: "comprovantes",
  titulo: "Comprovantes de registro",
  altura: 860,
  estadoInicial: { pagina: "historico" },
  render: (e) => (
    <>
      <Shell ativo="historico" e={e}>
        {e.pagina === "historico" ? <Historico e={e} semBanner /> : <Comprovantes />}
      </Shell>
      {!!e.visualizar && <VisualizadorComprovante />}
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "btn-comprovantes",
      legenda: "Os comprovantes ficam no Histórico, no botão “Comprovantes” (no alto, à direita)."
    },
    {
      acao: "clicar",
      alvo: "btn-comprovantes",
      set: { pagina: "comprovantes" },
      legenda: "Clique em “Comprovantes”: abre a página “Meus comprovantes”."
    },
    {
      acao: "mover",
      alvo: "chip-48h",
      legenda: "Por padrão aparecem as “Últimas 48 horas”. “Este mês” mostra o mês todo."
    },
    {
      acao: "mover",
      alvo: "periodo",
      legenda: "Para outro intervalo, preencha “De … até …” e clique em “Pesquisar”."
    },
    {
      acao: "mover",
      alvo: "btn-zip",
      legenda: "“Baixar as últimas 48 horas (ZIP)” traz todos os comprovantes recentes de uma vez."
    },
    {
      acao: "clicar",
      alvo: "comp-1",
      set: { visualizar: true },
      legenda:
        "Cada marcação é uma linha, com o nome do registro, o NSR e a hora. Clique na linha para abrir o comprovante."
    },
    {
      acao: "mover",
      alvo: "btn-baixar",
      legenda:
        "Use “Baixar PDF” para guardar. O PDF é assinado digitalmente; a tela mostra uma marca d'água com o seu nome."
    }
  ]
};

/* ───────── B4. Histórico ───────── */

export const consultarHistorico: Roteiro = {
  id: "historico",
  titulo: "Consultar o histórico do mês",
  altura: 860,
  estadoInicial: {},
  render: (e) => (
    <Shell ativo="historico" e={e}>
      <Historico e={e} semBanner />
    </Shell>
  ),
  passos: [
    {
      acao: "clicar",
      alvo: "menu-historico",
      set: { menuAberto: true },
      legenda: "No menu lateral, abra “Histórico” — o Histórico de Frequência."
    },
    {
      acao: "mover",
      alvo: "nome-mes",
      set: { menuAberto: false },
      legenda: "No meio da tela está o mês exibido."
    },
    {
      acao: "clicar",
      alvo: "btn-mes-ant",
      set: { mes: "agosto" },
      legenda:
        "Use a seta ◀ para ver o mês anterior (e ▶ para voltar). Você também pode clicar no nome do mês para escolher outro."
    },
    {
      acao: "mover",
      alvo: "badges-resumo",
      legenda:
        "Os selos resumem o mês: dias OK, faltas ou inconsistências, horas trabalhadas e o saldo do banco."
    },
    {
      acao: "mover",
      alvo: "tabela-hist",
      legenda:
        "A tabela mostra cada dia: Data, Dia, Entrada, Início e Fim do intervalo, Saída, Pausa, Horas, Saldo e Status."
    },
    {
      acao: "mover",
      alvo: "linha-2",
      legenda:
        "Dias com alerta ficam em destaque (por exemplo, registro incompleto): peça a correção em Solicitações."
    },
    {
      acao: "mover",
      alvo: "btn-comprovantes",
      legenda: "No alto: “Comprovantes” abre os comprovantes de cada marcação."
    },
    {
      acao: "clicar",
      alvo: "btn-exportar-pdf",
      legenda: "“Exportar PDF” baixa o relatório do mês exibido (rascunho, sem assinaturas)."
    }
  ]
};

/* ───────── B5. Entender horas e saldo ───────── */

export const entenderHoras: Roteiro = {
  id: "horas",
  titulo: "Entender horas e saldo",
  altura: 860,
  estadoInicial: {},
  render: (e) => (
    <Shell ativo="historico" e={e}>
      <Historico e={e} semBanner />
    </Shell>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "linha-1",
      legenda: "Vamos ler um dia: 02/09. Cada coluna mostra o horário que você de fato registrou."
    },
    {
      acao: "mover",
      alvo: "col-2",
      legenda:
        "“Entrada”: 07:58. O sistema aceita uma pequena tolerância (padrão de 5 minutos) antes e depois do horário: dentro dela, conta como se fosse no horário certo."
    },
    {
      acao: "mover",
      alvo: "col-3",
      legenda:
        "“Início Interv.” e “Fim Interv.”: o almoço. Ele vale, no mínimo, 60 minutos para o cálculo — voltar antes não aumenta as suas horas."
    },
    {
      acao: "mover",
      alvo: "col-5",
      legenda:
        "“Saída”: o fim da jornada. Se o almoço não foi registrado, o sistema deduz o mínimo e anota no dia."
    },
    {
      acao: "mover",
      alvo: "col-7",
      legenda: "“Horas”: o total trabalhado no dia, já sem o almoço."
    },
    {
      acao: "mover",
      alvo: "col-8",
      legenda:
        "“Saldo”: a diferença entre as horas do dia e a sua jornada (8h). Positivo = horas a mais; negativo = a menos."
    },
    {
      acao: "mover",
      alvo: "badges-resumo",
      legenda:
        "No alto, “Saldo” é a soma do mês e “Total”, o seu banco de horas acumulado. Feriados, abonos, atestados e férias não geram saldo negativo."
    }
  ]
};

/* ───────── B6. Esqueci de registrar ───────── */

function FormCorrecao({ e }: { e: Estado }) {
  const tem = !!e["cp-data"];
  const reg: [string, string, string, string][] = [
    ["🟢", "Entrada", "08:00", "cp-entrada"],
    ["🟡", "Início Intervalo", "12:00", "cp-ini"],
    ["🔵", "Fim Intervalo", "13:01", "cp-fim"],
    ["🔴", "Saída", "—", "cp-saida"]
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Campo id="cp-data" e={e} rotulo="Data de referência" data larg={220} />
      <p style={{ fontSize: 11.5, color: "#9ca3af" }}>
        Somente dias anteriores ao dia de hoje. O dia corrente e datas futuras não podem ser
        corrigidos.
      </p>
      {tem && (
        <div data-alvo="tabela-correcao">
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-500)",
              marginBottom: 6
            }}
          >
            Registros do dia
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 130px",
              gap: "0 12px",
              padding: "6px 10px",
              background: "rgba(122,30,38,0.04)",
              borderRadius: "var(--radius-md)",
              marginBottom: 4
            }}
          >
            {["Tipo de registro", "Atual", "Corrigir para"].map((h) => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-500)" }}>
                {h}
              </span>
            ))}
          </div>
          {reg.map(([em, l, atual, id]) => (
            <div
              key={id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 130px",
                gap: "0 12px",
                padding: "8px 10px",
                alignItems: "center",
                borderBottom: "1px solid rgba(122,30,38,0.06)"
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {em} {l}
              </span>
              <span
                style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-500)" }}
              >
                {atual}
              </span>
              <Campo id={id} e={e} placeholder="--:--" />
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 6 }}>
            Horário permitido: 06:00 – 23:59 (Brasília). Deixe em branco para não alterar.
          </p>
        </div>
      )}
      <Campo
        id="cp-motivo"
        e={e}
        rotulo="Descrição / Justificativa"
        obrigatorio
        area
        placeholder="Explique o motivo da correção..."
      />
      <BotaoEnviar id="btn-enviar-cp" />
    </div>
  );
}

export const esqueciRegistrar: Roteiro = {
  id: "esqueci",
  titulo: "Esqueci de registrar",
  altura: 1080,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="solicitacoes" e={e}>
        <Pagina
          e={e}
          lista={
            e.enviado ? (
              <>
                <Cartao
                  emoji="🕐"
                  tipo="Correção de Ponto"
                  sub="Ref: 17/10/2026"
                  status="Aguardando Chefe"
                  cls="badge-amber"
                  texto="Saída: incluir 17:02. Sua justificativa: esqueci de registrar a saída."
                  cor="var(--amber)"
                />
                <Cartao
                  emoji="🕐"
                  tipo="Correção de Ponto"
                  sub="Ref: 14/10/2026"
                  status="Aprovada"
                  cls="badge-green"
                  texto="Entrada 08:10 → 08:00."
                  cor="#16a34a"
                />
              </>
            ) : undefined
          }
        />
      </Shell>
      {e.modal && !e.sucesso && (
        <Janela
          titulo={e.tipo === "CORRECAO_PONTO" ? "🕐 Correção de Ponto" : "Nova Solicitação"}
          voltar={e.tipo === "CORRECAO_PONTO"}
        >
          {e.tipo === "CORRECAO_PONTO" ? <FormCorrecao e={e} /> : <Seletor />}
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
      legenda:
        "Esqueceu de registrar algum horário? Em Solicitações, clique em “+ Nova solicitação”."
    },
    {
      acao: "clicar",
      alvo: "tipo-CORRECAO_PONTO",
      set: { tipo: "CORRECAO_PONTO" },
      legenda: "Escolha “Correção de Ponto”."
    },
    {
      acao: "digitar",
      alvo: "cp-data",
      valor: "17/10/2026",
      legenda: "Informe a data de referência. Só vale para dias anteriores a hoje."
    },
    {
      acao: "mover",
      alvo: "tabela-correcao",
      legenda:
        "A tabela mostra o que está registrado (“Atual”) e o que você quer (“Corrigir para”). Aqui faltou a saída."
    },
    {
      acao: "digitar",
      alvo: "cp-saida",
      valor: "17:02",
      legenda:
        "Digite o horário correto no campo da linha que precisa de ajuste. As linhas em branco não são alteradas."
    },
    {
      acao: "digitar",
      alvo: "cp-motivo",
      valor: "Esqueci de registrar a saída.",
      legenda: "Explique o motivo da correção."
    },
    {
      acao: "clicar",
      alvo: "btn-enviar-cp",
      set: { sucesso: true },
      legenda: "Clique em “Enviar Solicitação”. Ela vai ao seu chefe."
    },
    {
      acao: "aguardar",
      set: { sucesso: false, modal: false, enviado: true },
      legenda:
        "O pedido aparece “Aguardando Chefe”. Quando ele aprovar, a correção já é aplicada no seu histórico. Lembre: só dá para corrigir antes de assinar a folha do mês."
    }
  ]
};

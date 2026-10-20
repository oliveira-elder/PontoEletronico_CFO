import React from "react";
import {
  ActivityIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  InboxIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  UsersIcon
} from "../../icons";
import { Campo } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";

const ABAS_AUDITORIA = [
  ["Funcionários", <UsersIcon key="1" size={14} />],
  ["Registros", <ClockIcon key="2" size={14} />],
  ["Solicitações", <InboxIcon key="3" size={14} />],
  ["Afastamentos", <CalendarIcon key="4" size={14} />],
  ["Banco de Horas", <TrendingUpIcon key="5" size={14} />],
  ["Logs", <ShieldCheckIcon key="6" size={14} />],
  ["Validações", <CheckCircleIcon key="7" size={14} />],
  ["Saúde Ocupacional", <ActivityIcon key="8" size={14} />]
] as const;

function CabecalhoAuditoria({ botaoFiscal }: { botaoFiscal?: boolean }) {
  return (
    <>
      <div style={{ marginBottom: 20, position: "relative" }}>
        {botaoFiscal && (
          <span
            className="btn btn-primary btn-sm"
            data-alvo="btn-fiscais"
            style={{ position: "absolute", right: 0, top: 4 }}
          >
            ⬇ Arquivos fiscais (AFD / AEJ)
          </span>
        )}
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          RH / Compliance
        </p>
        <h1 style={{ fontSize: 28, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
          Auditoria de <em>Frequência</em>
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>
          Consulte registros, históricos, solicitações, afastamentos e períodos de todos os
          funcionários. Exporte qualquer dado em CSV.
        </p>
      </div>
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 18,
          borderBottom: "2px solid rgba(122,30,38,0.08)"
        }}
      >
        {ABAS_AUDITORIA.map(([l, ic], i) => (
          <span
            key={l}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-md) var(--radius-md) 0 0",
              background: i === 0 ? "var(--burgundy-600)" : "transparent",
              color: i === 0 ? "#fff" : "var(--ink-500)",
              fontWeight: 600,
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap"
            }}
          >
            {ic}
            {l}
          </span>
        ))}
      </div>
    </>
  );
}

/* ───────── Liberar tempo do banco ───────── */

function Metrica({ r, v, cor }: { r: string; v: string; cor?: string }) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: "0.10em"
        }}
      >
        {r}
      </p>
      <p style={{ fontSize: 16, fontWeight: 700, color: cor ?? "var(--ink-900)" }}>{v}</p>
    </div>
  );
}

function PainelBanco({ e }: { e: Estado }) {
  const lib = !!e.liberado;
  return (
    <div
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        border: "1px dashed rgba(122,30,38,0.30)",
        borderRadius: "var(--radius-lg)",
        background: "rgba(122,30,38,0.02)"
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
      >
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--burgundy-600)" }}>
            🏢 Tempo do banco liberado pelo RH
          </p>
          <p style={{ marginTop: 2, fontSize: 11.5, color: "var(--ink-500)" }}>
            Libere um tempo do saldo positivo para o funcionário usar como abono (Solicitações →
            Abono). O tempo é descontado do banco na hora e vale até a data que você definir, mesmo
            depois da zeragem do ciclo. Não é um agendamento de abono.
          </p>
        </div>
        <span className="btn btn-primary btn-sm" data-alvo="btn-liberar">
          ＋ Liberar tempo para abono
        </span>
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        <Metrica r="Saldo do banco" v={lib ? "8h30" : "12h30"} cor="#2f7d4f" />
        <Metrica r="Ainda liberável" v={lib ? "8h30" : "12h30"} />
        <Metrica r="Disponível ao funcionário" v={lib ? "4h00" : "0h00"} />
        <Metrica r="Já usado em abono" v="0h00" />
      </div>
      {lib && (
        <p style={{ fontSize: 12.5, color: "var(--green)" }} data-alvo="msg-liberado">
          Tempo liberado: 4h00 até 17/04/2027. O funcionário foi avisado.
        </p>
      )}
    </div>
  );
}

function PaginaDetalhe({ e }: { e: Estado }) {
  const subs = [
    "Registros de Ponto",
    "Histórico",
    "Solicitações",
    "Férias",
    "Afastamentos",
    "Banco de Horas",
    "Documentos",
    "Folhas assinadas"
  ];
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <CabecalhoAuditoria />
      <div
        className="card-flat"
        style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--burgundy-600)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700
          }}
        >
          M
        </div>
        <div>
          <p style={{ fontWeight: 700 }}>Maria Souza</p>
          <p style={{ fontSize: 12, color: "var(--ink-500)" }}>
            mat. 1234 · Gerência Administrativa
          </p>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid rgba(122,30,38,0.08)",
          marginBottom: 14
        }}
      >
        {subs.map((s) => {
          const ativo = (e.sub ?? "Registros de Ponto") === s;
          return (
            <span
              key={s}
              data-alvo={s === "Banco de Horas" ? "sub-banco" : undefined}
              style={{
                padding: "7px 12px",
                fontSize: 12.5,
                fontWeight: ativo ? 700 : 500,
                color: ativo ? "var(--burgundy-600)" : "var(--ink-500)",
                borderBottom: ativo ? "2px solid var(--burgundy-600)" : "2px solid transparent",
                marginBottom: -2
              }}
            >
              {s}
            </span>
          );
        })}
      </div>
      {e.sub === "Banco de Horas" && <PainelBanco e={e} />}
    </div>
  );
}

function ModalLiberar({ e }: { e: Estado }) {
  return (
    <div className="mk-sombra" style={{ background: "rgba(10,5,6,0.50)" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: 860,
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
            Banco de horas
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
            Liberar tempo para abono
          </h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginTop: 2 }}>
            Liberável agora: 12h30
          </p>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Tempo a liberar</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                <Campo id="lib-h" e={e} larg={64} placeholder="0" />
                <span>h</span>
                <Campo id="lib-m" e={e} larg={64} placeholder="0" />
                <span>min</span>
              </div>
              <span className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>
                Liberar tudo (12h30)
              </span>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Válido até</label>
              <div style={{ marginTop: 4 }}>
                <Campo id="lib-val" e={e} data />
              </div>
              <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                O abono precisa ser tirado até esta data. Pode passar da zeragem do ciclo. Sugestão:
                180 dias.
              </span>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Justificativa do RH</label>
              <div style={{ marginTop: 4 }}>
                <Campo id="lib-just" e={e} area placeholder="Obrigatória, mín. 10 caracteres" />
              </div>
            </div>
          </div>
          {!!e["lib-h"] && (
            <p style={{ fontSize: 12.5 }} data-alvo="resumo-lib">
              Resumo: o banco passa de <strong>12h30</strong> para <strong>8h30</strong> e o
              funcionário ganha <strong>4h00</strong> para abono
              {e["lib-val"] ? ` até ${e["lib-val"]}` : ""}.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <span className="btn btn-secondary btn-sm">Cancelar</span>
            <span className="btn btn-primary btn-sm" data-alvo="btn-confirmar-lib">
              Confirmar liberação
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const liberarBanco: Roteiro = {
  id: "liberar-banco",
  titulo: "Liberar tempo do banco de horas",
  altura: 820,
  estadoInicial: { sub: "Registros de Ponto" },
  render: (e) => (
    <>
      <Shell ativo="auditoria" e={e} perfil="rh" usuario="Ana Costa">
        <PaginaDetalhe e={e} />
      </Shell>
      {e.modal && <ModalLiberar e={e} />}
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "sub-banco",
      legenda:
        "Em Auditoria › Funcionários, abra a ficha do funcionário. Os dados ficam em abas; escolha “Banco de Horas”."
    },
    {
      acao: "clicar",
      alvo: "sub-banco",
      set: { sub: "Banco de Horas" },
      legenda:
        "Clique na aba “Banco de Horas”. O painel “Tempo do banco liberado pelo RH” só aparece para quem tem essa função no perfil do RH."
    },
    {
      acao: "clicar",
      alvo: "btn-liberar",
      set: { modal: true },
      legenda: "Clique em “＋ Liberar tempo para abono” (só habilita com saldo positivo)."
    },
    {
      acao: "digitar",
      alvo: "lib-h",
      valor: "4",
      legenda:
        "Informe o tempo a liberar em horas e minutos (mínimo de 15 minutos) — ou use “Liberar tudo”."
    },
    {
      acao: "digitar",
      alvo: "lib-val",
      valor: "17/04/2027",
      legenda:
        "Defina “Válido até”: a data limite para o funcionário usar o abono (sugestão: 180 dias). Pode passar da zeragem do ciclo."
    },
    {
      acao: "digitar",
      alvo: "lib-just",
      valor: "Compensação de horas trabalhadas em evento.",
      legenda: "A justificativa do RH é obrigatória (mínimo de 10 caracteres)."
    },
    {
      acao: "mover",
      alvo: "resumo-lib",
      legenda:
        "O resumo mostra o efeito: o banco é debitado na hora e o funcionário ganha o tempo para abono."
    },
    {
      acao: "clicar",
      alvo: "btn-confirmar-lib",
      set: { modal: false, liberado: true },
      legenda:
        "Clique em “Confirmar liberação”. O funcionário é avisado e passa a ver o tempo no pedido de abono."
    }
  ]
};

/* ───────── AFD / AEJ ───────── */

function PaginaAuditoriaFiscal() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <CabecalhoAuditoria botaoFiscal />
      <div className="card-flat" style={{ color: "var(--ink-500)", fontSize: 13 }}>
        Lista de funcionários…
      </div>
    </div>
  );
}

function ModalFiscal({ e }: { e: Estado }) {
  const rotulo: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4
  };
  const tipo = (e.tipoArq as string) || "AFD";
  return (
    <div className="mk-sombra" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: 640,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)"
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <p style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700 }}>
            PORTARIA MTP Nº 671/2021 · REP-P + PTRP
          </p>
          <h3 style={{ margin: "2px 0 0", fontFamily: "var(--font-display)", fontSize: 19 }}>
            Arquivos fiscais (AFD / AEJ)
          </h3>
        </div>
        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["AFD", "AEJ"].map((t) => (
              <span
                key={t}
                data-alvo={`aba-${t}`}
                className={tipo === t ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
              >
                {t}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-600, #4b5563)", lineHeight: 1.5 }}>
            {tipo === "AFD"
              ? "Arquivo Fonte de Dados — as marcações ORIGINAIS registradas no REP, por NSR (Portaria MTP 671/2021, art. 81)."
              : "Arquivo Eletrônico de Jornada — a jornada tratada pelo PTRP: marcações (originais, incluídas e desconsideradas, com motivo), horário contratual, ausências e banco de horas (art. 83)."}
          </p>
          <div>
            <span style={rotulo}>Período</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Campo id="fi-ini" e={e} larg={150} data />
              <span style={{ fontSize: 12 }}>a</span>
              <Campo id="fi-fim" e={e} larg={150} data />
              <span className="btn btn-ghost btn-sm">Mês anterior</span>
              <span className="btn btn-ghost btn-sm">Mês atual</span>
            </div>
          </div>
          <div>
            <span style={rotulo}>Funcionários</span>
            <div style={{ display: "flex", gap: 14, fontSize: 12.5 }} data-alvo="escopo">
              <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input type="radio" checked readOnly /> Todos (AFD oficial do REP)
              </label>
              <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input type="radio" readOnly /> Por gerência
              </label>
              <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input type="radio" readOnly /> Selecionar funcionários
              </label>
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked readOnly /> Assinar com certificado ICP-Brasil (CAdES,
            arquivo .p7s destacado — art. 88)
          </label>
          {!!e["fi-fim"] && (
            <p style={{ fontSize: 12, color: "#15803D" }} data-alvo="pronto">
              ✓ Pronto para gerar · 120 funcionário(s) · NSR atual 123456
            </p>
          )}
          {!!e.baixado && (
            <p style={{ fontSize: 12.5, color: "#15803D" }}>
              ✓ Arquivo gerado e baixado (ZIP com o arquivo, a assinatura .p7s e o LEIA-ME).
            </p>
          )}
        </div>
        <div
          style={{
            padding: "12px 22px",
            borderTop: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8
          }}
        >
          <span className="btn btn-ghost">Fechar</span>
          <span className="btn btn-primary" data-alvo="btn-gerar-fiscal">
            Gerar e baixar {tipo} (ZIP)
          </span>
        </div>
      </div>
    </div>
  );
}

export const gerarAfd: Roteiro = {
  id: "gerar-afd",
  titulo: "Gerar o AFD e o AEJ",
  altura: 780,
  estadoInicial: { tipoArq: "AFD" },
  render: (e) => (
    <>
      <Shell ativo="auditoria" e={e} perfil="rh" usuario="Ana Costa">
        <PaginaAuditoriaFiscal />
      </Shell>
      {e.modal && <ModalFiscal e={e} />}
    </>
  ),
  passos: [
    {
      acao: "clicar",
      alvo: "btn-fiscais",
      set: { modal: true },
      legenda:
        "Em Auditoria, clique em “⬇ Arquivos fiscais (AFD / AEJ)” (só aparece para quem tem essa função no perfil do RH)."
    },
    {
      acao: "mover",
      alvo: "aba-AFD",
      legenda:
        "Escolha o arquivo: AFD (marcações originais do REP, por NSR) ou AEJ (jornada tratada)."
    },
    {
      acao: "digitar",
      alvo: "fi-ini",
      valor: "01/09/2026",
      legenda: "Informe o período — data inicial…"
    },
    {
      acao: "digitar",
      alvo: "fi-fim",
      valor: "30/09/2026",
      legenda:
        "… e data final (ou use “Mês anterior” / “Mês atual”). O sistema confere as pendências."
    },
    {
      acao: "mover",
      alvo: "escopo",
      legenda:
        "“Todos (AFD oficial do REP)” gera o arquivo para a fiscalização. “Por gerência” ou “Selecionar funcionários” geram apenas um extrato, que não substitui o AFD oficial."
    },
    {
      acao: "mover",
      alvo: "pronto",
      legenda:
        "“✓ Pronto para gerar” indica que não há bloqueios. Se houver, eles são listados em vermelho; avisos aparecem em amarelo."
    },
    {
      acao: "clicar",
      alvo: "btn-gerar-fiscal",
      set: { baixado: true },
      legenda:
        "Clique em “Gerar e baixar AFD (ZIP)”. O ZIP traz o arquivo, a assinatura .p7s e um LEIA-ME com o resumo e o SHA-256."
    }
  ]
};

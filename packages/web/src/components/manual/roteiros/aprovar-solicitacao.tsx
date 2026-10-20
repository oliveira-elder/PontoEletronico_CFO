import React from "react";
import { CheckCircleIcon, Edit2Icon, XCircleIcon } from "../../icons";
import { Campo } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";

function Stat({
  label,
  val,
  color,
  bg
}: {
  label: string;
  val: number | string;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "14px 18px"
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 11,
          color: "var(--ink-500)",
          fontWeight: 600,
          lineHeight: 1.3
        }}
      >
        {label}
      </p>
      <span
        style={{
          fontSize: 28,
          fontWeight: 800,
          fontFamily: "var(--font-display)",
          background: bg,
          color,
          borderRadius: "var(--radius-md)",
          padding: "2px 10px"
        }}
      >
        {val}
      </span>
    </div>
  );
}

function Pedido({
  id,
  nome,
  mat,
  tipo,
  resumo,
  ref_,
  just,
  atestado
}: {
  id: string;
  nome: string;
  mat: string;
  tipo: string;
  resumo: string;
  ref_: string;
  just: string;
  atestado?: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "16px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start"
      }}
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
          fontWeight: 700,
          flexShrink: 0
        }}
      >
        {nome[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{nome}</span>
          <span style={{ fontSize: 11, color: "var(--ink-500)" }}>mat. {mat}</span>
          <span
            style={{
              background: "rgba(122,30,38,0.07)",
              color: "var(--burgundy-600)",
              borderRadius: 4,
              padding: "1px 7px",
              fontSize: 11,
              fontWeight: 600
            }}
          >
            Gerência Administrativa
          </span>
          <span className="badge badge-amber">Aguardando Chefe</span>
        </div>
        <p
          style={{
            margin: "0 0 6px",
            fontSize: 13.5,
            color: "var(--ink-800, #222)",
            lineHeight: 1.5,
            fontWeight: 500
          }}
        >
          {resumo}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span className="badge badge-gray">{tipo}</span>
          <span style={{ fontSize: 11, color: "var(--ink-400, #9ca3af)" }}>Ref.: {ref_}</span>
          <span style={{ fontSize: 11, color: "var(--ink-400, #9ca3af)" }}>
            Enviado em 20/10/2026 08:40
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: "var(--ink-600, #4b5563)",
            lineHeight: 1.5,
            borderLeft: "3px solid rgba(122,30,38,0.12)",
            paddingLeft: 10,
            fontStyle: "italic"
          }}
        >
          "{just}"
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <span
          data-alvo={`btn-aprovar-${id}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 14px",
            borderRadius: "var(--radius-md)",
            background: atestado ? "#6B0F1A" : "#16a34a",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600
          }}
        >
          {atestado ? (
            <>
              <Edit2Icon size={14} /> Ter Ciência
            </>
          ) : (
            <>
              <CheckCircleIcon size={14} /> Aprovar
            </>
          )}
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 14px",
            borderRadius: "var(--radius-md)",
            background: "#fff",
            border: "1px solid rgba(220,38,38,0.4)",
            color: "#dc2626",
            fontSize: 12,
            fontWeight: 600
          }}
        >
          <XCircleIcon size={14} /> Rejeitar
        </span>
      </div>
    </div>
  );
}

function Pagina({ e }: { e: Estado }) {
  const aprovouA = !!e.aprovadoA;
  const aprovouB = !!e.aprovadoB;
  const pend = 2 - (aprovouA ? 1 : 0) - (aprovouB ? 1 : 0);
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <p
          className="eyebrow"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--burgundy-600)",
            margin: "0 0 4px"
          }}
        >
          Gestão
        </p>
        <h1 style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Aprovações
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
          Etapa do chefe de área — aprovação inicial da equipe.
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[`Chefe de Área${pend ? ` (${pend})` : ""}`, "Assinaturas de Quadro"].map((l, i) => (
          <span
            key={l}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-full)",
              border: i === 0 ? "2px solid var(--burgundy-600)" : "1px solid rgba(122,30,38,0.18)",
              background: i === 0 ? "var(--burgundy-600)" : "#fff",
              color: i === 0 ? "#fff" : "var(--ink-700)",
              fontSize: 12.5,
              fontWeight: 600
            }}
          >
            {l}
          </span>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 18
        }}
      >
        <Stat label="Aguardando minha aprovação" val={pend} color="#92400e" bg="#fef3c7" />
        <Stat
          label="Aprovadas por mim (encam. ao RH)"
          val={aprovouA || aprovouB ? 1 + (aprovouA && aprovouB ? 1 : 0) : 0}
          color="#065f46"
          bg="#d1fae5"
        />
        <Stat label="Rejeitadas por mim" val={0} color="#7a1e26" bg="#fee2e2" />
        <Stat label="Funcionários na equipe" val={12} color="#1e3a5f" bg="#dbeafe" />
      </div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 14,
          borderBottom: "1px solid rgba(122,30,38,0.1)"
        }}
      >
        {[`Aguardando Aprovação${pend ? ` (${pend})` : ""}`, "Histórico"].map((l, i) => (
          <span
            key={l}
            style={{
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: i === 0 ? 700 : 500,
              color: i === 0 ? "var(--burgundy-600)" : "var(--ink-500)",
              borderBottom: i === 0 ? "2px solid var(--burgundy-600)" : "2px solid transparent",
              marginBottom: -1
            }}
          >
            {l}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!aprovouA && (
          <Pedido
            id="a"
            nome="Maria Souza"
            mat="1234"
            tipo="Abono"
            resumo="Solicita abono em 17/10/2026 (dia inteiro)."
            ref_="17/10/2026"
            just="Consulta médica pela manhã."
          />
        )}
        {!aprovouB && (
          <Pedido
            id="b"
            nome="João Pereira"
            mat="5678"
            tipo="Atestado Médico"
            resumo="Atestado médico de 20/10/2026 a 21/10/2026."
            ref_="20/10/2026"
            just="Repouso médico."
            atestado
          />
        )}
        {aprovouA && aprovouB && (
          <p style={{ textAlign: "center", color: "var(--ink-500)", padding: 20 }}>
            Nenhuma solicitação aguardando aprovação.
          </p>
        )}
      </div>
    </div>
  );
}

function Confirmacao({ e }: { e: Estado }) {
  const ciencia = e.modal === "ciencia";
  const cor = ciencia ? "#6B0F1A" : "#16a34a";
  const claro = ciencia ? "rgba(107,15,26,0.07)" : "rgba(22,163,74,0.08)";
  const borda = ciencia ? "rgba(107,15,26,0.22)" : "rgba(22,163,74,0.25)";
  return (
    <div className="mk-sombra" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: 480,
          overflow: "hidden",
          boxShadow: "0 12px 40px rgba(0,0,0,0.3)"
        }}
      >
        <div
          style={{
            background: claro,
            borderBottom: `1px solid ${borda}`,
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <span style={{ fontSize: 22 }}>{ciencia ? "✍️" : "✅"}</span>
          <strong style={{ color: cor, fontSize: 16 }}>
            {ciencia ? "Ter Ciência — Assinatura Digital" : "Confirmar Aprovação"}
          </strong>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 14, fontWeight: 600, textAlign: "center" }}>
            {ciencia
              ? "Confirma ciência deste atestado com assinatura digital?"
              : "Você confirma a aprovação desta solicitação?"}
          </p>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--ink-600, #4b5563)",
              textAlign: "center",
              lineHeight: 1.55,
              margin: "-8px 0 0"
            }}
          >
            {ciencia
              ? "Ao confirmar, sua assinatura digital será aplicada no canto superior esquerdo de todas as páginas do atestado (imagem será convertida em PDF, se necessário) e o documento será encaminhado ao RH."
              : "Após aprovação, a solicitação será encaminhada ao RH para análise final."}
          </p>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)"
              }}
            >
              Observação para o RH (opcional)
            </label>
            <Campo
              id="obs"
              e={e}
              area
              placeholder="Deixe uma observação para o analista de RH, se necessário..."
            />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <span
              style={{
                padding: "10px 20px",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink-600, #4b5563)"
              }}
            >
              Cancelar
            </span>
            <span
              data-alvo="btn-confirmar"
              style={{
                padding: "10px 24px",
                borderRadius: "var(--radius-md)",
                background: cor,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 7
              }}
            >
              {ciencia ? (
                <>
                  <Edit2Icon size={14} /> Confirmar ciência e assinar
                </>
              ) : (
                <>✅ Sim, aprovar</>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const aprovarSolicitacao: Roteiro = {
  id: "aprovar-solicitacao",
  titulo: "Aprovar solicitações da equipe",
  altura: 900,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="aprovacoes" e={e} perfil="chefe" usuario="Carlos Lima">
        <Pagina e={e} />
      </Shell>
      {!!e.modal && <Confirmacao e={e} />}
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "menu-aprovacoes",
      set: { menuAberto: true },
      legenda: "Chefes e gerentes veem “Aprovações” no menu. Passe o mouse no menu e clique nele."
    },
    {
      acao: "clicar",
      alvo: "menu-aprovacoes",
      set: { menuAberto: false },
      legenda:
        "Em “Chefe de Área” ficam os pedidos da sua equipe aguardando a sua decisão. Você só vê pedidos de quem trabalha com você."
    },
    {
      acao: "mover",
      alvo: "btn-aprovar-a",
      legenda: "Leia o pedido: quem pediu, o tipo, as datas, a justificativa e os anexos."
    },
    {
      acao: "clicar",
      alvo: "btn-aprovar-a",
      set: { modal: "aprovar" },
      legenda: "Clique em “Aprovar” (ou “Rejeitar”, que exige o motivo)."
    },
    {
      acao: "digitar",
      alvo: "obs",
      valor: "De acordo.",
      legenda: "Escreva uma observação para o RH, se quiser."
    },
    {
      acao: "clicar",
      alvo: "btn-confirmar",
      set: { modal: "", aprovadoA: true, obs: "" },
      legenda: "Confirme em “Sim, aprovar”. O pedido segue para o RH."
    },
    {
      acao: "clicar",
      alvo: "btn-aprovar-b",
      set: { modal: "ciencia" },
      legenda:
        "Em um atestado o botão é “Ter Ciência”: a sua assinatura digital é aplicada no documento."
    },
    {
      acao: "clicar",
      alvo: "btn-confirmar",
      set: { modal: "", aprovadoB: true },
      legenda:
        "Confirme em “Confirmar ciência e assinar”. O atestado vai ao RH com a sua assinatura."
    }
  ]
};

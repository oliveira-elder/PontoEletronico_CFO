import React from "react";
import { PauseIcon, PlayIcon } from "../../icons";
import { Cabecalho } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";
import { DATA_EXTENSO, Passos } from "./registrar-entrada";

type Fase = "MANHA" | "ALMOCO" | "TARDE" | "PAUSA" | "ENCERRADA";

const FASES: Record<
  Fase,
  {
    rotulo: string;
    fundo: string;
    borda: string;
    texto: string;
    ponto: string;
    n: number;
    proximo: string;
    cor: string;
    desc: string;
  }
> = {
  MANHA: {
    rotulo: "Trabalhando",
    fundo: "rgba(74, 222, 128, 0.24)",
    borda: "rgba(134, 239, 172, 0.65)",
    texto: "#bbf7d0",
    ponto: "#4ade80",
    n: 1,
    proximo: "Início do Almoço",
    cor: "#8a6a00",
    desc: "Vá para o almoço ou interrompa o expediente, se necessário"
  },
  ALMOCO: {
    rotulo: "Intervalo de almoço",
    fundo: "rgba(251, 191, 36, 0.26)",
    borda: "rgba(253, 224, 71, 0.6)",
    texto: "#fde68a",
    ponto: "#facc15",
    n: 2,
    proximo: "Fim do Almoço",
    cor: "var(--blue-ink)",
    desc: "Intervalo de almoço em andamento"
  },
  TARDE: {
    rotulo: "Trabalhando (pós-almoço)",
    fundo: "rgba(74, 222, 128, 0.24)",
    borda: "rgba(134, 239, 172, 0.65)",
    texto: "#bbf7d0",
    ponto: "#4ade80",
    n: 3,
    proximo: "Encerrar Jornada",
    cor: "var(--red)",
    desc: "Encerre a jornada ou interrompa o expediente, se necessário"
  },
  PAUSA: {
    rotulo: "Expediente pausado",
    fundo: "rgba(251, 191, 36, 0.26)",
    borda: "rgba(253, 224, 71, 0.6)",
    texto: "#fde68a",
    ponto: "#facc15",
    n: 3,
    proximo: "Reiniciar Jornada",
    cor: "var(--gray-cfo)",
    desc: "Retome o expediente para continuar trabalhando"
  },
  ENCERRADA: {
    rotulo: "Jornada encerrada",
    fundo: "rgba(96, 165, 250, 0.24)",
    borda: "rgba(147, 197, 253, 0.55)",
    texto: "#bfdbfe",
    ponto: "#60a5fa",
    n: 4,
    proximo: "",
    cor: "var(--blue-ink)",
    desc: "Jornada do dia encerrada"
  }
};

const BG: Record<string, string> = {
  "#8a6a00": "var(--burgundy-600)",
  "var(--blue-ink)": "var(--blue-ink)",
  "var(--red)": "#8b1d23",
  "var(--gray-cfo)": "#5a5b5e"
};

function Botoes({ fase }: { fase: Fase }) {
  const base: React.CSSProperties = {
    fontSize: 15,
    minHeight: 54,
    justifyContent: "center",
    gap: 8
  };
  if (fase === "ENCERRADA") return null;
  const grande = (id: string, texto: string, cor: string, w: number, icone?: React.ReactNode) => (
    <span
      className="btn btn-primary"
      data-alvo={id}
      style={{ ...base, flex: `${w} 1 0%`, background: BG[cor] ?? "var(--burgundy-600)" }}
    >
      {icone}
      {texto}
    </span>
  );
  const pausa = (
    <span
      className="btn btn-primary"
      data-alvo="btn-pausa"
      title="Interromper Expediente"
      style={{ ...base, flex: "20 1 0%", background: "#5a5b5e", padding: "0 6px" }}
    >
      <PauseIcon size={20} />
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {fase === "MANHA" && (
        <>
          {grande("btn-inicio-almoco", "Início do Almoço", "#8a6a00", 80)}
          {pausa}
        </>
      )}
      {fase === "ALMOCO" && grande("btn-fim-almoco", "Fim do Almoço", "var(--blue-ink)", 100)}
      {fase === "TARDE" && (
        <>
          {grande("btn-encerrar", "Encerrar Jornada", "var(--red)", 80)}
          {pausa}
        </>
      )}
      {fase === "PAUSA" &&
        grande(
          "btn-reiniciar",
          "Reiniciar Jornada",
          "var(--gray-cfo)",
          100,
          <PlayIcon size={16} />
        )}
    </div>
  );
}

function Linha({ rotulo, hora, cor }: { rotulo: string; hora: string; cor: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0" }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: cor,
          boxShadow: `0 0 0 3px ${cor}20`
        }}
      />
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{rotulo}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13.5 }}>{hora}</span>
      <span style={{ fontSize: 11.5, color: "var(--burgundy-600)", fontWeight: 600 }}>
        Comprovante
      </span>
    </div>
  );
}

export function PaginaRegistrar({ fase, hora, e }: { fase: Fase; hora: string; e: Estado }) {
  const f = FASES[fase];
  const feitos: [string, string, string][] = [["Iniciar Jornada", "08:02", "var(--green)"]];
  if (["ALMOCO", "TARDE", "PAUSA", "ENCERRADA"].includes(fase))
    feitos.push(["Início do Almoço", "12:03", "#8a6a00"]);
  if (["TARDE", "PAUSA", "ENCERRADA"].includes(fase))
    feitos.push(["Fim do Almoço", "13:04", "var(--blue-ink)"]);
  if (fase === "PAUSA") feitos.push(["Interromper Expediente", "15:30", "var(--gray-cfo)"]);
  if (fase === "ENCERRADA") feitos.push(["Encerrar Jornada", "17:03", "var(--red)"]);
  void e;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <Cabecalho antes="Registrar" em="Ponto" />
      <div
        style={{
          background: "var(--burgundy-900)",
          borderRadius: "var(--radius-xl)",
          padding: "32px 24px",
          marginBottom: 14,
          textAlign: "center",
          position: "relative",
          overflow: "hidden"
        }}
        data-alvo="relogio"
      >
        <div
          style={{
            position: "absolute",
            top: -50,
            right: -50,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(122,30,38,0.25)"
          }}
        />
        <p style={{ color: "var(--gold-500)", marginBottom: 6, fontSize: 12, fontWeight: 600 }}>
          {DATA_EXTENSO}
        </p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 68,
            color: "#fff",
            lineHeight: 1,
            marginBottom: 14
          }}
        >
          {hora}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          <div
            data-alvo="estado"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 14px",
              borderRadius: "var(--radius-full)",
              background: f.fundo,
              border: `1px solid ${f.borda}`
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.ponto }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: f.texto }}>{f.rotulo}</span>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              borderRadius: "var(--radius-full)",
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.42)"
            }}
          >
            <span style={{ fontSize: 11 }}>🖥</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>Desktop</span>
          </div>
        </div>
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: "16px 16px 12px",
          marginBottom: 14
        }}
      >
        <Passos n={f.n} />
        <div style={{ textAlign: "center", paddingTop: 10 }}>
          {fase !== "ENCERRADA" ? (
            <>
              <p
                style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 500 }}
                data-alvo="proximo-label"
              >
                Próximo registro:
              </p>
              <p data-alvo="proximo" style={{ fontSize: 14, fontWeight: 700, color: f.cor }}>
                {f.proximo}
              </p>
              <p style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{f.desc}</p>
            </>
          ) : (
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--blue-ink)" }}>
              ✅ Jornada completa para hoje
            </p>
          )}
        </div>
      </div>
      {fase === "ENCERRADA" ? (
        <div
          style={{
            background: "rgba(30,74,122,0.05)",
            border: "1px solid rgba(30,74,122,0.15)",
            borderRadius: "var(--radius-lg)",
            padding: "20px 16px",
            marginBottom: 14,
            textAlign: "center"
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--blue-ink)", marginBottom: 8 }}>
            Jornada do dia encerrada
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.6 }}>
            Todos os registros foram efetuados. Para corrigir algum registro, abra uma solicitação.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <span
              style={{
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                background: "var(--burgundy-600)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600
              }}
            >
              Ver Histórico
            </span>
            <span
              style={{
                padding: "10px 18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                color: "var(--burgundy-600)",
                fontSize: 13,
                fontWeight: 600
              }}
            >
              Solicitar correção
            </span>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <Botoes fase={fase} />
        </div>
      )}
      <div
        data-alvo="registros-hoje"
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: 16
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            color: "var(--burgundy-600)",
            fontSize: 15,
            marginBottom: 10
          }}
        >
          Registros de Hoje ({feitos.length}/4)
        </p>
        {feitos.map(([r, h, c]) => (
          <Linha key={r} rotulo={r} hora={h} cor={c} />
        ))}
      </div>
    </div>
  );
}

const faseDe = (e: Estado): Fase => (e.fase as Fase) ?? "MANHA";
const horaDe = (f: Fase) =>
  ({
    MANHA: "12:03:10",
    ALMOCO: "12:03:40",
    TARDE: "13:04:22",
    PAUSA: "15:30:05",
    ENCERRADA: "17:03:18"
  })[f];

export const intervaloEPausas: Roteiro = {
  id: "intervalo",
  titulo: "Almoço, pausas e encerramento",
  altura: 960,
  estadoInicial: { fase: "MANHA" },
  render: (e) => (
    <Shell ativo="registrar" e={e}>
      <PaginaRegistrar fase={faseDe(e)} hora={horaDe(faseDe(e))} e={e} />
    </Shell>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "estado",
      legenda:
        "Durante a manhã o estado é “Trabalhando”. O texto “Próximo registro” mostra a ação da vez: “Início do Almoço”."
    },
    {
      acao: "clicar",
      alvo: "btn-inicio-almoco",
      set: { fase: "ALMOCO" },
      legenda: "Na hora do almoço (janela padrão das 11:30 às 13:00) clique em “Início do Almoço”."
    },
    {
      acao: "mover",
      alvo: "estado",
      legenda:
        "O estado muda para “Intervalo de almoço”. O intervalo vale, no mínimo, 60 minutos para o cálculo das horas, mesmo que você volte antes."
    },
    {
      acao: "clicar",
      alvo: "btn-fim-almoco",
      set: { fase: "TARDE" },
      legenda: "Ao voltar, clique em “Fim do Almoço”."
    },
    {
      acao: "mover",
      alvo: "btn-pausa",
      legenda:
        "À tarde aparecem “Encerrar Jornada” e, ao lado, o botão de pausa (⏸) para uma interrupção curta, como uma consulta rápida."
    },
    {
      acao: "clicar",
      alvo: "btn-pausa",
      set: { fase: "PAUSA" },
      legenda: "Clique no botão ⏸: o expediente fica pausado."
    },
    {
      acao: "clicar",
      alvo: "btn-reiniciar",
      set: { fase: "TARDE" },
      legenda: "Ao voltar, clique em “Reiniciar Jornada”."
    },
    {
      acao: "clicar",
      alvo: "btn-encerrar",
      set: { fase: "ENCERRADA" },
      legenda: "No fim do expediente, clique em “Encerrar Jornada”."
    },
    {
      acao: "mover",
      alvo: "registros-hoje",
      legenda:
        "A tela mostra “Jornada do dia encerrada” e a lista “Registros de Hoje (4/4)”, cada um com o seu comprovante."
    }
  ]
};

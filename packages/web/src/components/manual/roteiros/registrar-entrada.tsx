import React from "react";
import {
  ArrowRightIcon,
  BarChart2Icon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  InfoIcon,
  ShieldCheckIcon,
  SunsetIcon
} from "../../icons";
import { Cabecalho } from "../telas/pecas";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";

export const DATA_EXTENSO = "segunda-feira, 20 de outubro de 2026";

export function Passos({ n }: { n: number }) {
  const itens = ["Entrada", "Almoço", "Retorno", "Saída"];
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {itens.map((l, i) => {
        const feito = i < n;
        const atual = i === n;
        const cor = feito ? "var(--green)" : atual ? "var(--burgundy-600)" : "var(--gray-cfo)";
        return (
          <React.Fragment key={l}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                flex: 1
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: feito
                    ? "var(--green)"
                    : atual
                      ? "var(--burgundy-600)"
                      : "rgba(109,110,113,0.15)",
                  border: `2px solid ${cor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {feito ? (
                  <CheckCircleIcon size={14} style={{ color: "#fff" }} />
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: atual ? "#fff" : "var(--ink-500)"
                    }}
                  >
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: cor
                }}
              >
                {l}
              </span>
            </div>
            {i < 3 && (
              <div
                style={{
                  height: 2,
                  flex: 1,
                  background: i < n ? "var(--green)" : "rgba(122,30,38,0.10)",
                  marginBottom: 18
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function InicioPagina({ registros = [] }: { registros?: [string, string][] }) {
  const trab = registros.length > 0;
  const stat = (l: string, v: string, sub: string) => (
    <div
      style={{
        background: "var(--cream-50)",
        borderRadius: "var(--radius-md)",
        padding: 14,
        border: "1px solid rgba(122,30,38,0.08)"
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--ink-500)",
          marginBottom: 8
        }}
      >
        {l}
      </p>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{v}</p>
      <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 3 }}>{sub}</p>
    </div>
  );
  const icone = (cor: string, bg: string, filho: React.ReactNode) => (
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: cor,
        flexShrink: 0
      }}
    >
      {filho}
    </span>
  );
  const titulo = (t: string) => (
    <p
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--ink-500)"
      }}
    >
      {t}
    </p>
  );
  const numero = (v: string, cor?: string) => (
    <p
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 26,
        color: cor ?? "var(--ink-900)",
        lineHeight: 1
      }}
    >
      {v}
    </p>
  );
  const sub = (t: string) => (
    <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 4 }}>{t}</p>
  );
  const divisor = <div style={{ width: 1, background: "rgba(122,30,38,0.10)", flexShrink: 0 }} />;
  const dias: [string, string, number, string][] = [
    ["Seg", "19", 8.1 * 60, "OK"],
    ["Ter", "20", trab ? 2 : 0, "HOJE"],
    ["Qua", "21", 0, "FUTURO"],
    ["Qui", "22", 0, "FUTURO"],
    ["Sex", "23", 0, "FUTURO"]
  ];
  const hm = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Painel Principal
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16
          }}
        >
          <div>
            <h1 style={{ fontSize: 30, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
              Bom dia, <em>Maria</em>!
            </h1>
            <p style={{ color: "var(--ink-500)", marginTop: 4, fontSize: 14 }}>
              Segunda-feira, 20 de outubro de 2026
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`badge badge-destaque ${trab ? "badge-green" : "badge-gray"}`}>
              <span className={`dot ${trab ? "dot-green" : "dot-gray"}`} />
              {trab ? "Trabalhando" : "Aguardando início"}
            </span>
            <span className="btn btn-ghost btn-sm" data-alvo="btn-validar">
              <ShieldCheckIcon size={15} /> Validar documento
            </span>
            <span className="btn btn-primary btn-sm" data-alvo="btn-baterponto">
              <ClockIcon size={15} /> Bater Ponto
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
          marginBottom: 24
        }}
      >
        <div
          className="card-flat"
          style={{
            background: "var(--burgundy-900)",
            border: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px 16px",
            gap: 8
          }}
        >
          <p className="eyebrow" style={{ color: "var(--gold-500)" }}>
            Agora
          </p>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 38,
              color: "#fff",
              letterSpacing: "-0.02em",
              lineHeight: 1
            }}
          >
            08:02:41
          </p>
          <span
            className={`badge badge-on-dark ${trab ? "badge-green" : "badge-gray"}`}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            <span
              className={`dot ${trab ? "dot-green" : "dot-gray"}`}
              style={{ width: 6, height: 6 }}
            />
            {trab ? "Trabalhando" : "Aguardando início"}
          </span>
        </div>
        <div className="card-flat" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {titulo("Horas Hoje")}
            {icone("var(--burgundy-600)", "rgba(122,30,38,0.08)", <ClockIcon size={18} />)}
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
            <div style={{ flex: 1 }}>
              {numero(trab ? "0h02" : "0h00")}
              {sub("de 8h00 esperadas")}
            </div>
            {divisor}
            <div style={{ flex: 1 }}>
              {numero(trab ? "-7h58" : "-8h00", "var(--red)")}
              {sub("horas a cumprir")}
            </div>
          </div>
        </div>
        <div
          className="card-flat"
          data-alvo="card-banco-inicio"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {titulo("Banco de Horas")}
            {icone("var(--green)", "rgba(47,125,79,0.08)", <BarChart2Icon size={18} />)}
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
            <div style={{ flex: 1 }}>
              {numero("+4h10")}
              {sub("acumulado")}
            </div>
            {divisor}
            <div style={{ flex: 1 }}>
              {numero("+0h30")}
              {sub("Setembro")}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
          gap: 16,
          marginBottom: 24,
          alignItems: "stretch"
        }}
      >
        <div
          className="card-flat"
          data-alvo="card-registros-hoje"
          style={{ display: "flex", flexDirection: "column" }}
        >
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              marginBottom: 14
            }}
          >
            Registros de Hoje
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {registros.map(([r, h]) => (
              <div
                key={r}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 12px",
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.07)"
                }}
              >
                <ClockIcon size={16} style={{ color: "var(--burgundy-600)", flexShrink: 0 }} />
                <p
                  style={{
                    flex: 1,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--ink-500)"
                  }}
                >
                  {r}
                </p>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--burgundy-600)",
                    background: "#fff",
                    border: "1px solid rgba(122,30,38,0.22)",
                    borderRadius: 999
                  }}
                >
                  <FileTextIcon size={12} /> Comprovante
                </span>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500 }}>{h}</p>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 12px",
                background: "rgba(122,30,38,0.04)",
                borderRadius: "var(--radius-md)",
                border: "1.5px dashed rgba(122,30,38,0.20)"
              }}
            >
              <SunsetIcon size={16} style={{ color: "var(--burgundy-600)", opacity: 0.5 }} />
              <p style={{ fontSize: 12, color: "var(--ink-500)", flex: 1 }}>
                Próximo: {trab ? "Início do Almoço" : "Iniciar Jornada"}
              </p>
              <ArrowRightIcon size={14} style={{ color: "var(--burgundy-600)" }} />
            </div>
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--ink-500)",
                marginTop: "auto",
                paddingTop: 6
              }}
            >
              Meus comprovantes <ArrowRightIcon size={12} />
            </p>
          </div>
        </div>
        <div className="card-flat" style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              marginBottom: 20,
              paddingBottom: 20,
              borderBottom: "1px solid rgba(122,30,38,0.08)"
            }}
            data-alvo="card-semana"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    color: "var(--burgundy-600)",
                    fontSize: 18
                  }}
                >
                  Essa Semana
                </p>
                <span
                  style={{ fontSize: 12, color: "var(--ink-500)", fontFamily: "var(--font-mono)" }}
                >
                  19–25/10
                </span>
              </div>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: "var(--ink-500)"
                }}
              >
                Ver histórico <ArrowRightIcon size={12} />
              </span>
            </div>
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}
            >
              {dias.map(([d]) => (
                <p
                  key={d}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    textAlign: "center"
                  }}
                >
                  {d}
                </p>
              ))}
              {dias.map(([d, n, m, st]) => (
                <div
                  key={d + n}
                  style={{
                    background:
                      st === "OK"
                        ? "rgba(47,125,79,0.08)"
                        : st === "HOJE"
                          ? "rgba(122,30,38,0.06)"
                          : "var(--cream-50)",
                    border:
                      st === "HOJE"
                        ? "2px solid var(--burgundy-600)"
                        : st === "OK"
                          ? "1px solid rgba(47,125,79,0.20)"
                          : "1px solid rgba(122,30,38,0.08)",
                    borderRadius: "var(--radius-md)",
                    padding: "7px 2px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3
                  }}
                >
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: st === "HOJE" ? "var(--burgundy-600)" : "var(--ink-900)",
                      lineHeight: 1
                    }}
                  >
                    {n}
                  </p>
                  <div
                    style={{
                      width: "70%",
                      height: 4,
                      background: "rgba(122,30,38,0.08)",
                      borderRadius: 2
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (m / 480) * 100)}%`,
                        height: "100%",
                        background: st === "OK" ? "var(--green)" : "var(--burgundy-600)",
                        borderRadius: 2
                      }}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: st === "FUTURO" ? "var(--ink-500)" : "var(--ink-700)"
                    }}
                  >
                    {st === "FUTURO" ? "—" : hm(m)}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div data-alvo="card-requisicoes-inicio">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    color: "var(--burgundy-600)",
                    fontSize: 15
                  }}
                >
                  Requisições do RH
                </p>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(247,196,55,0.22)",
                    color: "#8a6a00"
                  }}
                >
                  1 nova(s)
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--burgundy-600)" }}>
                Ver todas →
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "rgba(122,30,38,0.04)",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.14)"
              }}
            >
              {icone("var(--burgundy-600)", "rgba(122,30,38,0.08)", <FileTextIcon size={16} />)}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>
                  Declaração de dependentes do imposto de renda
                </p>
                <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>15/10/2026</p>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "rgba(247,196,55,0.18)",
                  color: "#8a6a00"
                }}
              >
                Novo
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card-flat">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20
          }}
        >
          <div>
            <p className="eyebrow">Resumo do Mês</p>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontStyle: "italic",
                color: "var(--burgundy-600)",
                marginTop: 4
              }}
            >
              outubro de 2026
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className="btn btn-ghost btn-sm">Banco de Horas</span>
            <span className="btn btn-ghost btn-sm">Ver relatório completo</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          {stat("Horas Trabalhadas", "8h10", "de 104h00")}
          {stat("Horas Extras", "+0h30", "acumuladas")}
          {stat("Dias Trabalhados", "1", "de 17 úteis no mês")}
          {stat("Saldo Mensal", "+0h30", "a favor")}
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
              Progresso (1 de 5 dias úteis)
            </span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>20%</span>
          </div>
          <div style={{ height: 6, background: "rgba(122,30,38,0.08)", borderRadius: 3 }}>
            <div
              style={{
                width: "20%",
                height: "100%",
                background: "var(--burgundy-600)",
                borderRadius: 3
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            background: "rgba(47,125,79,0.06)",
            border: "1px solid rgba(47,125,79,0.15)",
            borderRadius: "var(--radius-md)"
          }}
        >
          <CheckCircleIcon size={18} style={{ color: "var(--green)" }} />
          <p style={{ fontSize: 13, color: "var(--ink-700)" }}>
            Ponto em dia — nenhuma pendência registrada para o período atual.
          </p>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            background: "rgba(247,196,55,0.08)",
            border: "1px solid rgba(247,196,55,0.25)",
            borderRadius: "var(--radius-md)"
          }}
        >
          <InfoIcon size={18} style={{ color: "#8a6a00" }} />
          <p style={{ fontSize: 13, color: "var(--ink-700)" }}>
            Próximo registro pendente:{" "}
            <strong>{trab ? "Início do Almoço" : "Iniciar Jornada"}</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

function Registrar({ e }: { e: Estado }) {
  const feito = !!e.feito;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <Cabecalho antes="Registrar" em="Ponto" />

      <div
        data-alvo="relogio"
        style={{
          background: "var(--burgundy-900)",
          borderRadius: "var(--radius-xl)",
          padding: "32px 24px",
          marginBottom: 14,
          textAlign: "center",
          position: "relative",
          overflow: "hidden"
        }}
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
        <p
          style={{
            color: "var(--gold-500)",
            marginBottom: 6,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em"
          }}
        >
          {DATA_EXTENSO}
        </p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 68,
            color: "#fff",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            marginBottom: 14
          }}
        >
          08:02:41
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 14px",
              borderRadius: "var(--radius-full)",
              background: feito ? "rgba(74, 222, 128, 0.24)" : "rgba(255, 255, 255, 0.16)",
              border: `1px solid ${feito ? "rgba(134, 239, 172, 0.65)" : "rgba(255, 255, 255, 0.4)"}`
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: feito ? "#4ade80" : "#e5e7eb"
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: feito ? "#bbf7d0" : "#f3f4f6" }}>
              {feito ? "Trabalhando" : "Aguardando início"}
            </span>
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
        <Passos n={0} />
        <div style={{ textAlign: "center", paddingTop: 10 }}>
          <p style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 500 }}>
            Próximo registro:
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--green)" }}>Iniciar Jornada</p>
          <p style={{ fontSize: 11.5, color: "var(--ink-500)" }}>Início do expediente</p>
        </div>
      </div>

      <div
        data-alvo="verificacoes"
        style={{
          background: "var(--cream-50)",
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          marginBottom: 14,
          border: "1px solid rgba(122,30,38,0.08)"
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-500)",
            marginBottom: 8
          }}
        >
          Verificações desta sessão
        </p>
        {[
          ["📍", "Geolocalização (complementar)", "N/A"],
          ["🌐", "IP do provedor corporativo", "⏳ Aguardando"],
          ["📷", "Foto biométrica", "N/A"]
        ].map(([ic, l, s]) => (
          <div
            key={l}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 13, opacity: s === "N/A" ? 0.35 : 1 }}>{ic}</span>
              <span
                style={{
                  fontSize: 12,
                  color: s === "N/A" ? "var(--ink-400, #9ca3af)" : "var(--ink-700)"
                }}
              >
                {l}
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>{s}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <span
          className="btn btn-primary"
          data-alvo="btn-iniciar"
          style={{
            flex: "100 1 0%",
            fontSize: 15,
            minHeight: 54,
            background: "#1e5c38",
            justifyContent: "center"
          }}
        >
          Iniciar Jornada
        </span>
      </div>
    </div>
  );
}

function Confirmado() {
  const linhas: [string, string][] = [
    ["Registro", "Iniciar Jornada"],
    ["Modo", "🖥 Desktop"]
  ];
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
      <div
        style={{
          width: 420,
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(10,5,6,0.14)"
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #5c1519 0%, var(--burgundy-600) 100%)",
            padding: "28px 24px 24px",
            textAlign: "center"
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.20)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px"
            }}
          >
            <CheckCircleIcon size={36} style={{ color: "#fff" }} />
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "#fff",
              fontSize: 22,
              fontWeight: 400
            }}
          >
            Registro Confirmado!
          </h2>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 4 }}>
            Iniciar Jornada
          </p>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ marginBottom: 18 }}>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                fontWeight: 700,
                color: "var(--green)",
                lineHeight: 1,
                marginBottom: 4
              }}
            >
              08:02:41
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.5 }}>{DATA_EXTENSO}</p>
          </div>
          <div
            style={{
              background: "var(--cream-50)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              marginBottom: 16
            }}
          >
            {linhas.map(([l, v]) => (
              <div
                key={l}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "5px 0",
                  borderBottom: "1px solid rgba(122,30,38,0.06)"
                }}
              >
                <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{l}</span>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <div
            style={{
              background: "rgba(200,57,63,0.05)",
              border: "1px solid rgba(200,57,63,0.15)",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              marginBottom: 18,
              display: "flex",
              gap: 8
            }}
          >
            <InfoIcon size={13} style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11.5, color: "var(--red)", lineHeight: 1.6 }}>
              Registro não pode ser desfeito. Para correções, use <strong>Solicitações</strong>.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span
              data-alvo="btn-comprovante"
              style={{
                display: "flex",
                justifyContent: "center",
                padding: 13,
                borderRadius: "var(--radius-md)",
                background: "#0F0F10",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700
              }}
            >
              Visualizar comprovante
            </span>
            <span
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                padding: 13,
                borderRadius: "var(--radius-md)",
                background: "var(--burgundy-600)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700
              }}
            >
              Ver Histórico <ArrowRightIcon size={15} />
            </span>
            <span
              style={{
                textAlign: "center",
                padding: 11,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.18)",
                color: "var(--ink-500)",
                fontSize: 14
              }}
            >
              Registrar outro ponto
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VisualizadorComprovante() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(20,20,20,0.85)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 16,
        gap: 10
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: 640
        }}
      >
        <strong style={{ flex: 1, fontSize: 14 }}>Comprovante · Iniciar Jornada 08:02</strong>
        <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
          Visualização protegida · marca d'água com o seu nome
        </span>
        <span className="btn btn-primary btn-sm" data-alvo="btn-baixar">
          Baixar PDF
        </span>
        <span className="btn btn-ghost btn-sm">Fechar</span>
      </div>
      <div
        style={{
          width: 430,
          background: "#fff",
          padding: "18px 20px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
          fontSize: 11.5
        }}
      >
        <p style={{ fontWeight: 700, fontSize: 13, textAlign: "center" }}>
          COMPROVANTE DE REGISTRO DE PONTO DO TRABALHADOR
        </p>
        <p style={{ textAlign: "center", color: "var(--ink-500)", marginBottom: 10 }}>
          Portaria MTP nº 671/2021 · REP-P
        </p>
        {[
          ["Empregador", "Conselho Federal de Odontologia"],
          ["Trabalhador", "Maria Souza"],
          ["Data e hora", "20/10/2026 08:02"],
          ["NSR", "000123456"],
          ["Nº do comprovante", "CRP-000123456-1a2b3c4d"]
        ].map(([l, v]) => (
          <div
            key={l}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "3px 0",
              borderBottom: "1px solid #eee"
            }}
          >
            <span style={{ color: "var(--ink-500)" }}>{l}</span>
            <span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
        <p style={{ marginTop: 10, color: "var(--green)", fontWeight: 700 }}>
          ✓ Assinado digitalmente (ICP-Brasil)
        </p>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-24deg)",
            color: "rgba(0,0,0,0.07)",
            fontSize: 26,
            fontWeight: 700,
            pointerEvents: "none"
          }}
        >
          Maria Souza
        </div>
      </div>
    </div>
  );
}

export const registrarEntrada: Roteiro = {
  id: "registrar-entrada",
  titulo: "Registrar a entrada",
  altura: 900,
  estadoInicial: { pagina: "inicio" },
  render: (e) => (
    <>
      <Shell ativo={e.pagina === "inicio" ? "inicio" : "registrar"} e={e}>
        {e.pagina === "inicio" && <InicioPagina />}
        {e.pagina === "registrar" && <Registrar e={e} />}
        {e.pagina === "confirmado" && <Confirmado />}
      </Shell>
      {e.comprovante && <VisualizadorComprovante />}
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "menu-registrar",
      set: { menuAberto: true },
      legenda:
        "Passe o mouse sobre a barra vinho à esquerda: ela se abre e mostra o nome de cada tela."
    },
    {
      acao: "clicar",
      alvo: "menu-registrar",
      set: { pagina: "registrar", menuAberto: false },
      legenda:
        "Clique em “Registrar Ponto”. (Na página Início, o botão “Bater Ponto” leva ao mesmo lugar.)"
    },
    {
      acao: "mover",
      alvo: "relogio",
      legenda: "O relógio e o dia mostrados são do servidor — o horário do seu computador não vale."
    },
    {
      acao: "mover",
      alvo: "verificacoes",
      legenda:
        "Em “Verificações desta sessão” o sistema confere rede, localização e foto, conforme o seu modo de registro."
    },
    {
      acao: "clicar",
      alvo: "btn-iniciar",
      set: { feito: true, pagina: "confirmado" },
      legenda:
        "Clique no botão da ação indicada em “Próximo registro” — aqui, “Iniciar Jornada”. Ao longo do dia ele muda: Início do Almoço, Fim do Almoço, Encerrar Jornada."
    },
    {
      acao: "mover",
      alvo: "btn-comprovante",
      legenda:
        "“Registro Confirmado!”: o horário foi gravado pelo servidor. O registro não pode ser desfeito; correções são pedidas em Solicitações."
    },
    {
      acao: "clicar",
      alvo: "btn-comprovante",
      set: { comprovante: true },
      legenda: "Clique em “Visualizar comprovante” para ver o comprovante assinado digitalmente."
    },
    { acao: "mover", alvo: "btn-baixar", legenda: "Use “Baixar PDF” para guardar o comprovante." }
  ]
};

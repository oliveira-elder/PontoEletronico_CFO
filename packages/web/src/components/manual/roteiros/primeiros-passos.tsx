import React from "react";
import { BellIcon, CheckCircleIcon, ClockIcon, KeyIcon, LogInIcon } from "../../icons";
import { Shell } from "../telas/Shell";
import type { Estado, Roteiro } from "../tipos";
import { InicioPagina } from "./registrar-entrada";

/* ───────── A1. Entrar no sistema ───────── */

function Login({ e }: { e: Estado }) {
  return (
    <div
      style={{
        width: 1280,
        minHeight: "inherit",
        background: "var(--cream-50)",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div
        style={{
          background: "#fff",
          height: 72,
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          gap: 14,
          boxShadow: "0 2px 16px rgba(10,5,6,0.07)"
        }}
      >
        <img src="/logo.png" alt="" style={{ height: 36, width: "auto" }} />
        <div style={{ width: 1, height: 44, background: "rgba(122,30,38,0.10)" }} />
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 17,
              lineHeight: 1.2
            }}
          >
            Ponto Eletrônico
          </p>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              marginTop: 2
            }}
          >
            Controle de Frequência
          </p>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24
        }}
      >
        <div
          style={{
            width: 460,
            background: "#fff",
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(10,5,6,0.14)"
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(135deg, var(--burgundy-700) 0%, var(--burgundy-600) 100%)",
              padding: "20px 32px 24px",
              textAlign: "center"
            }}
          >
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                color: "#fff",
                fontSize: 26,
                margin: "0 0 2px",
                fontWeight: 400
              }}
            >
              Ponto Eletrônico
            </h1>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.55)"
              }}
            >
              Acesso restrito a servidores do CFO
            </p>
            <p
              style={{ fontFamily: "var(--font-mono)", fontSize: 38, color: "#fff", marginTop: 12 }}
            >
              08:00:12
            </p>
          </div>
          <div style={{ padding: 32 }}>
            <p
              style={{
                fontSize: 13.5,
                color: "var(--ink-500)",
                textAlign: "center",
                marginBottom: 28,
                lineHeight: 1.6
              }}
            >
              Utilize sua conta institucional para acessar o sistema. A autenticação é realizada com
              segurança pelo Keycloak SSO.
            </p>
            <span
              className="btn btn-primary"
              data-alvo="btn-acessar"
              style={{ width: "100%", fontSize: 15, padding: "14px 22px", marginBottom: 12 }}
            >
              <LogInIcon size={18} /> Acessar o Sistema
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 12px" }}>
              <div style={{ flex: 1, height: 1, background: "var(--cream-200)" }} />
              <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 500 }}>ou</span>
              <div style={{ flex: 1, height: 1, background: "var(--cream-200)" }} />
            </div>
            <span
              data-alvo="btn-reg-login"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "13px 22px",
                borderRadius: "var(--radius-md)",
                border: "2px solid var(--burgundy-600)",
                color: "var(--burgundy-600)",
                fontSize: 15,
                fontWeight: 600
              }}
            >
              <ClockIcon size={18} /> Registrar Ponto
            </span>
            <p
              style={{
                fontSize: 11.5,
                color: "var(--ink-500)",
                textAlign: "center",
                marginTop: 14,
                lineHeight: 1.5
              }}
            >
              Ambas as ações exigem autenticação com sua conta institucional.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          {["Não Repúdio", "PKCE S256", "Keycloak SSO"].map((b) => (
            <span
              key={b}
              className="chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(122,30,38,0.06)",
                color: "var(--burgundy-600)",
                border: "1px solid rgba(122,30,38,0.14)"
              }}
            >
              <KeyIcon size={12} /> {b}
            </span>
          ))}
        </div>
      </div>
      {e.pagina === "sso" && null}
    </div>
  );
}

function PaginaSso({ e }: { e: Estado }) {
  const campo = (id: string, rotulo: string, senha?: boolean) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {rotulo}
      </label>
      <div
        data-alvo={id}
        style={{
          border: "1px solid #ced4da",
          borderRadius: 6,
          padding: "10px 12px",
          fontSize: 14,
          background: "#fff",
          minHeight: 42
        }}
      >
        <span className={e.__digitando === id ? "mk-caret" : undefined}>
          {senha ? "•".repeat(String(e[id] ?? "").length) : (e[id] as string)}
        </span>
      </div>
    </div>
  );
  return (
    <div
      style={{
        width: 1280,
        minHeight: "inherit",
        background: "#dfe1e5",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div
        style={{
          background: "#f1f3f4",
          height: 40,
          display: "flex",
          alignItems: "center",
          padding: "0 14px"
        }}
      >
        <div
          style={{
            flex: 1,
            background: "#fff",
            borderRadius: 16,
            padding: "5px 14px",
            fontSize: 12.5,
            color: "#555"
          }}
        >
          🔒 sso.cfo.org.br — Autenticação institucional
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center", paddingTop: 80 }}>
        <div
          style={{
            width: 400,
            background: "#fff",
            borderRadius: 10,
            padding: 32,
            height: "fit-content",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12)"
          }}
        >
          <img
            src="/logo.png"
            alt=""
            style={{ height: 40, margin: "0 auto 18px", display: "block" }}
          />
          <h2 style={{ textAlign: "center", fontSize: 20, marginBottom: 18 }}>
            Entrar na sua conta
          </h2>
          {campo("sso-user", "Usuário")}
          {campo("sso-senha", "Senha", true)}
          <span
            data-alvo="btn-entrar-sso"
            style={{
              display: "block",
              textAlign: "center",
              background: "var(--burgundy-600)",
              color: "#fff",
              borderRadius: 6,
              padding: "11px 0",
              fontWeight: 600
            }}
          >
            Entrar
          </span>
          <p style={{ fontSize: 11.5, color: "#6b7280", textAlign: "center", marginTop: 12 }}>
            É o mesmo usuário e senha da rede do CFO.
          </p>
        </div>
      </div>
    </div>
  );
}

export const entrarSistema: Roteiro = {
  id: "entrar",
  titulo: "Entrar e sair do sistema",
  altura: 760,
  estadoInicial: { pagina: "login" },
  render: (e) => {
    if (e.pagina === "login") return <Login e={e} />;
    if (e.pagina === "sso") return <PaginaSso e={e} />;
    return (
      <Shell ativo="inicio" e={e}>
        <InicioPagina />
      </Shell>
    );
  },
  passos: [
    {
      acao: "mover",
      alvo: "btn-acessar",
      legenda:
        "Abra o endereço do sistema no navegador. Esta é a tela de entrada. Há dois botões: “Acessar o Sistema” e “Registrar Ponto” — os dois pedem a sua conta institucional."
    },
    {
      acao: "clicar",
      alvo: "btn-acessar",
      set: { pagina: "sso" },
      legenda:
        "Clique em “Acessar o Sistema”. Você será levado à página de login do CFO (a aparência pode variar um pouco)."
    },
    {
      acao: "digitar",
      alvo: "sso-user",
      valor: "maria.souza",
      legenda: "Digite o seu usuário — é o mesmo da rede do CFO."
    },
    {
      acao: "digitar",
      alvo: "sso-senha",
      valor: "minhasenha",
      legenda: "Digite a sua senha. Os caracteres aparecem como pontinhos, por segurança."
    },
    {
      acao: "clicar",
      alvo: "btn-entrar-sso",
      set: { pagina: "inicio" },
      legenda: "Clique em “Entrar”."
    },
    {
      acao: "mover",
      alvo: "btn-baterponto",
      legenda:
        "Pronto: você chegou à página Início, com o seu nome no topo. Para sair, use sempre “Sair” (no celular, o botão de saída no topo); em computador compartilhado, saia ao terminar."
    }
  ]
};

/* ───────── A2. Conhecer o menu ───────── */

export const conhecerMenu: Roteiro = {
  id: "menu",
  titulo: "Conhecer o menu e a página Início",
  altura: 760,
  estadoInicial: {},
  render: (e) => (
    <Shell ativo="inicio" e={e}>
      <InicioPagina />
    </Shell>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "menu-lateral",
      legenda: "À esquerda fica a barra vinho do menu. Ela começa recolhida, só com ícones."
    },
    {
      acao: "mover",
      alvo: "menu-inicio",
      set: { menuAberto: true },
      legenda: "Passe o mouse sobre ela: a barra se abre e mostra o nome de cada tela."
    },
    {
      acao: "mover",
      alvo: "menu-registrar",
      legenda: "“Registrar Ponto”: onde você marca entrada, almoço e saída."
    },
    {
      acao: "mover",
      alvo: "menu-historico",
      legenda: "“Histórico”: os seus registros e horas, mês a mês."
    },
    {
      acao: "mover",
      alvo: "menu-folhas",
      legenda: "“Folhas assinadas”: as folhas de ponto mensais já assinadas."
    },
    {
      acao: "mover",
      alvo: "menu-solicitacoes",
      legenda: "“Solicitações”: pedidos de correção, abono, atestado, férias e outros."
    },
    { acao: "mover", alvo: "menu-manual", legenda: "“Manual do usuário”: este guia." },
    {
      acao: "mover",
      alvo: "btn-sino",
      set: { menuAberto: false, sinoN: 3 },
      legenda:
        "No topo, o sino mostra os seus avisos (o número vermelho é a quantidade de não lidos)."
    },
    {
      acao: "mover",
      alvo: "btn-ajuda",
      legenda: "O botão de livro abre a ajuda: leva ao manual, no assunto da tela em que você está."
    },
    {
      acao: "mover",
      alvo: "btn-termos",
      legenda: "O escudo abre os Termos de Uso e o histórico dos seus aceites."
    },
    {
      acao: "mover",
      alvo: "btn-validar",
      legenda: "Na página Início, “Validar documento” confere um PDF emitido pelo sistema."
    },
    {
      acao: "mover",
      alvo: "btn-baterponto",
      legenda: "E “Bater Ponto” leva direto à tela de registro."
    }
  ]
};

/* ───────── A3. Termos de Uso ───────── */

const PARAGRAFOS = [
  "1. Finalidade. Este sistema registra a jornada de trabalho dos servidores do CFO e apoia os processos do RH.",
  "2. Dados tratados. São tratados nome, matrícula, CPF, registros de ponto, localização no momento do registro e documentos enviados.",
  "3. Segurança. Os documentos assinados recebem selo digital e podem ser verificados na página pública.",
  "4. Seus direitos. Você pode consultar os seus registros, comprovantes e aceites a qualquer momento.",
  "5. Registro de ponto. O registro de ponto não depende do aceite destes termos."
];

function TermosModal({ e }: { e: Estado }) {
  if (e.aceito)
    return (
      <div
        className="mk-sombra"
        style={{ background: "rgba(10,5,6,0.62)", alignItems: "center", paddingTop: 0 }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            width: 480,
            padding: 24,
            textAlign: "center",
            boxShadow: "0 16px 60px rgba(10,5,6,0.35)"
          }}
        >
          <div style={{ fontSize: 36, color: "#15803D" }}>✓</div>
          <h2 style={{ fontFamily: "var(--font-display)", margin: "4px 0 10px" }}>
            Termos aceitos
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-700)" }}>
            Maria Souza — Matrícula nº 1234
            <br />
            Versão 2 · aceito em 20/10/2026 08:03
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "10px 0 16px" }}>
            Código do aceite: <span style={{ fontFamily: "var(--font-mono)" }}>TU-2-7F3A9C21</span>
          </p>
          <span className="btn btn-primary" data-alvo="btn-continuar">
            Continuar
          </span>
        </div>
      </div>
    );
  const leu = !!e.leu;
  return (
    <div
      className="mk-sombra"
      style={{ background: "rgba(10,5,6,0.62)", alignItems: "center", paddingTop: 0 }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          width: 760,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 60px rgba(10,5,6,0.35)",
          overflow: "hidden"
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(122,30,38,0.12)" }}>
          <p className="eyebrow">Aceite obrigatório · versão 2</p>
          <strong style={{ fontSize: 16 }}>Termos de Uso e Política de Privacidade</strong>
        </div>
        <div
          data-alvo="texto-termos"
          style={{
            height: 230,
            overflow: "hidden",
            padding: "16px 22px",
            background: "#fffdfb",
            fontSize: 13.5,
            lineHeight: 1.6
          }}
        >
          <div
            style={{ transform: leu ? "translateY(-120px)" : "none", transition: "transform 0.9s" }}
          >
            {PARAGRAFOS.map((t) => (
              <p key={t} style={{ marginBottom: 12 }}>
                {t}
              </p>
            ))}
            {PARAGRAFOS.map((t) => (
              <p key={t + "b"} style={{ marginBottom: 12 }}>
                {t}
              </p>
            ))}
          </div>
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(122,30,38,0.12)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            Aceite de: <strong>Maria Souza</strong> — Matrícula nº <strong>1234</strong>
          </p>
          <label
            data-alvo="check-aceite"
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 13,
              opacity: leu ? 1 : 0.55
            }}
          >
            <input type="checkbox" readOnly checked={!!e.marcou} style={{ marginTop: 3 }} />
            Li e aceito os Termos de Uso (versão 2). Reconheço que este aceite é registrado com meu
            nome, matrícula, data, hora, endereço IP e navegador.
          </label>
          {!leu && (
            <p style={{ margin: "4px 0 0 24px", fontSize: 11.5, color: "var(--ink-500)" }}>
              Role o texto até o fim para habilitar o aceite.
            </p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <span
              className="btn btn-primary"
              data-alvo="btn-aceitar"
              style={{ opacity: leu && e.marcou ? 1 : 0.55 }}
            >
              Aceitar e continuar
            </span>
            <span className="btn btn-ghost" data-alvo="btn-reg-agora">
              Registrar ponto agora
            </span>
            <span style={{ flex: 1 }} />
            <span className="btn btn-ghost btn-sm">Sair</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const aceitarTermos: Roteiro = {
  id: "termos",
  titulo: "Aceitar os Termos de Uso",
  altura: 760,
  estadoInicial: {},
  render: (e) => (
    <>
      <Shell ativo="inicio" e={e}>
        <InicioPagina />
      </Shell>
      <TermosModal e={e} />
    </>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "texto-termos",
      legenda:
        "Quando o CFO publica uma versão nova dos Termos, esta janela aparece ao entrar. Leia o texto."
    },
    {
      acao: "aguardar",
      set: { leu: true },
      legenda:
        "Role o texto com o mouse até o fim. Enquanto não chegar lá, a caixa de aceite fica apagada."
    },
    {
      acao: "clicar",
      alvo: "check-aceite",
      set: { marcou: true },
      legenda:
        "Marque a caixa “Li e aceito os Termos de Uso”. O aceite é registrado com o seu nome, matrícula, data, hora e navegador."
    },
    {
      acao: "clicar",
      alvo: "btn-aceitar",
      set: { aceito: true },
      legenda: "Clique em “Aceitar e continuar”."
    },
    {
      acao: "mover",
      alvo: "btn-continuar",
      legenda:
        "Guarde o código do aceite, se quiser. Você poderá rever os seus aceites depois, no botão do escudo, no topo."
    },
    {
      acao: "clicar",
      alvo: "btn-continuar",
      set: { aceito: false, fechado: true },
      legenda:
        "Clique em “Continuar”. Dica: se precisar registrar o ponto antes de aceitar, use “Registrar ponto agora” — o registro nunca é bloqueado."
    }
  ]
};

/* ───────── A4. Notificações ───────── */

function PaginaNotificacoes({ e }: { e: Estado }) {
  const lida = !!e.todasLidas;
  const aberta = !!e.aberta;
  const item = (
    id: string,
    titulo: string,
    corpo: string,
    quando: string,
    naoLida: boolean,
    abre?: boolean
  ) => (
    <div
      data-alvo={id}
      style={{
        display: "flex",
        gap: 14,
        padding: abre ? "18px 18px" : "14px 16px",
        borderRadius: "var(--radius-md)",
        border: "2px solid",
        borderColor: abre
          ? "var(--burgundy-600)"
          : naoLida
            ? "rgba(122,30,38,0.18)"
            : "rgba(122,30,38,0.07)",
        background: abre ? "rgba(122,30,38,0.06)" : naoLida ? "rgba(122,30,38,0.03)" : "#fff",
        alignItems: "flex-start"
      }}
    >
      <div style={{ paddingTop: 5 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: naoLida ? "var(--burgundy-600)" : "transparent",
            border: naoLida ? "none" : "1.5px solid rgba(122,30,38,0.18)"
          }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <p
          style={{
            fontSize: abre ? 15 : 13.5,
            fontWeight: naoLida || abre ? 600 : 400,
            marginBottom: 3
          }}
        >
          {titulo}
        </p>
        <p style={{ fontSize: 12.5, color: "var(--ink-500)", marginBottom: 4 }}>{corpo}</p>
        {abre && (
          <span
            data-alvo="btn-abrir-atalho"
            className="btn btn-ghost btn-sm"
            style={{
              margin: "4px 0 8px",
              border: "1px solid rgba(122,30,38,0.25)",
              color: "var(--burgundy-700)"
            }}
          >
            Abrir: Histórico — Assinar quadro
          </span>
        )}
        <p style={{ fontSize: 11, color: "#9ca3af" }}>{abre ? "20/10/2026 às 06:00" : quando}</p>
      </div>
    </div>
  );
  const nao = lida ? 0 : aberta ? 2 : 3;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BellIcon size={22} style={{ color: "var(--burgundy-600)" }} />
          <div>
            <h1 style={{ fontSize: 26, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
              <em>Notificações</em>
            </h1>
            {nao > 0 && (
              <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{nao} não lidas</p>
            )}
          </div>
        </div>
        {nao > 0 && (
          <span className="btn btn-ghost btn-sm" data-alvo="btn-marcar-todas" style={{ gap: 6 }}>
            <CheckCircleIcon size={15} /> Marcar todas como lidas
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {item(
          "notif-1",
          "Folha de ponto de setembro/2026 aguarda a sua assinatura",
          "Abra o Histórico para revisar e assinar.",
          "há 2 horas",
          !lida && !aberta ? true : false,
          aberta
        )}
        {item(
          "notif-2",
          "Solicitação de abono aprovada",
          "Seu abono de 17/10/2026 foi aprovado pelo RH.",
          "ontem",
          !lida
        )}
        {item(
          "notif-3",
          "Novo tempo de banco de horas liberado",
          "O RH liberou 4h00 para uso em abono.",
          "há 3 dias",
          !lida
        )}
      </div>
    </div>
  );
}

export const lerNotificacoes: Roteiro = {
  id: "notificacoes",
  titulo: "Ler as notificações",
  altura: 760,
  estadoInicial: { pagina: "inicio", sinoN: 3 },
  render: (e) => (
    <Shell ativo="inicio" e={{ ...e, sinoN: e.todasLidas ? 0 : e.sinoN }}>
      {e.pagina === "inicio" ? <InicioPagina /> : <PaginaNotificacoes e={e} />}
    </Shell>
  ),
  passos: [
    {
      acao: "mover",
      alvo: "badge-sino",
      legenda:
        "O sino, no topo, avisa quando há novidades. O número vermelho é a quantidade de notificações não lidas."
    },
    {
      acao: "clicar",
      alvo: "btn-sino",
      set: { sinoAberto: true },
      legenda: "Clique no sino: abre uma caixa com o aviso mais recente."
    },
    {
      acao: "mover",
      alvo: "popover-sino",
      legenda: "Aqui você vê o título, um resumo e há quanto tempo chegou."
    },
    {
      acao: "clicar",
      alvo: "ver-todas",
      set: { sinoAberto: false, pagina: "notificacoes" },
      legenda: "Clique em “Ver todas as notificações →” para abrir a lista completa."
    },
    {
      acao: "mover",
      alvo: "notif-2",
      legenda: "As bolinhas vinho indicam as que você ainda não leu."
    },
    {
      acao: "clicar",
      alvo: "notif-1",
      set: { aberta: true },
      legenda:
        "Clique em uma notificação para abri-la: ela aumenta e mostra o texto completo e a data."
    },
    {
      acao: "mover",
      alvo: "btn-abrir-atalho",
      legenda: "Quando houver atalho, o botão “Abrir: …” leva direto à tela do assunto."
    },
    {
      acao: "clicar",
      alvo: "btn-marcar-todas",
      set: { aberta: false, todasLidas: true },
      legenda: "Para limpar o contador de uma vez, use “Marcar todas como lidas”."
    }
  ]
};

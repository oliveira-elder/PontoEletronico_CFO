import React, { useEffect, useState } from "react";
import { api } from "../../hooks/useApi";
import { TextoTermo } from "../../components/termos/TextoTermo";

interface Vigente {
  termo: { versao: number; titulo: string; conteudo: string; publicadoEm: string | null } | null;
  aceite: { aceitoEm: string; codigo: string; nome: string; matricula: string | null } | null;
  usuario: { nome: string; matricula: string | null };
}

interface MeuAceite {
  aceitoEm: string;
  codigo: string;
  termo: { versao: number; titulo: string; status: string };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Termos de Uso vigentes e o histórico dos aceites do próprio usuário. */
export function TermosUsoPage() {
  const [vig, setVig] = useState<Vigente | null>(null);
  const [meus, setMeus] = useState<MeuAceite[]>([]);
  useEffect(() => {
    api
      .get<Vigente>("/termos-uso/vigente")
      .then(setVig)
      .catch(() => undefined);
    api
      .get<MeuAceite[]>("/termos-uso/meus-aceites")
      .then(setMeus)
      .catch(() => undefined);
  }, []);

  return (
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
      <p className="eyebrow" style={{ marginBottom: 6 }}>
        Ponto Eletrônico
      </p>
      <h1
        style={{
          fontSize: "clamp(22px,3vw,28px)",
          fontFamily: "var(--font-display)",
          lineHeight: 1.1
        }}
      >
        Termos de <em>uso</em>
      </h1>
      {!vig ? (
        <p style={{ color: "var(--ink-500)" }}>Carregando…</p>
      ) : !vig.termo ? (
        <p style={{ color: "var(--ink-500)" }}>Ainda não há Termos de Uso publicados.</p>
      ) : (
        <>
          <div
            style={{
              margin: "12px 0 16px",
              padding: "10px 14px",
              borderRadius: 10,
              fontSize: 13,
              background: vig.aceite ? "#F0FDF4" : "#FFFBEB",
              border: `1px solid ${vig.aceite ? "#BBF7D0" : "#FDE68A"}`
            }}
          >
            Versão {vig.termo.versao}
            {vig.termo.publicadoEm ? ` · publicada em ${fmt(vig.termo.publicadoEm)}` : ""}
            <br />
            {vig.aceite ? (
              <>
                ✓ Aceita por <strong>{vig.aceite.nome}</strong>
                {vig.aceite.matricula ? ` — Matrícula nº ${vig.aceite.matricula}` : ""} em{" "}
                {fmt(vig.aceite.aceitoEm)} · código{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>{vig.aceite.codigo}</span>
              </>
            ) : (
              "Aceite pendente."
            )}
          </div>
          <div className="card-flat">
            <TextoTermo conteudo={vig.termo.conteudo} />
          </div>
        </>
      )}
      {meus.length > 0 && (
        <div className="card-flat" style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 14 }}>Meus aceites</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {meus.map((m) => (
              <li key={m.codigo}>
                Versão {m.termo.versao} ({m.termo.status === "PUBLICADO" ? "vigente" : "anterior"})
                — {fmt(m.aceitoEm)} ·{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{m.codigo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

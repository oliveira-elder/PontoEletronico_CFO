import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../hooks/useApi";
import { VisualizadorPdfProtegido } from "./VisualizadorPdfProtegido";
import { nomeArquivoRelatorioMes, nomeDoMes } from "../../utils/nomeArquivo";

interface Folha {
  id: string;
  mes: number;
  ano: number;
  status: string;
  assinadoFuncionarioEm: string | null;
  assinadoGestorEm: string | null;
  assinadoGestorNome: string | null;
  bancoHorasSaldoTotalMinutos: number | null;
}

interface Resposta {
  assinadas: Folha[];
  emAndamento: Folha[];
}

const fmtDataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "—";

const ROTULO: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--ink-600)"
};
const CAMPO: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid rgba(122,30,38,0.2)",
  borderRadius: 8,
  fontSize: 13,
  background: "#fff"
};

const fmtHM = (min: number) =>
  `${min < 0 ? "-" : "+"}${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}`;

/**
 * Folhas de ponto **totalmente assinadas** (funcionário + chefe): documento final pronto para
 * baixar e imprimir. As que ainda faltam assinar aparecem separadas, sem download.
 * Usada pelo funcionário (Folhas assinadas) e pelo RH (Auditoria → Funcionário).
 */
export function FolhasAssinadasLista({
  listaUrl,
  downloadUrl,
  token,
  nomePessoa
}: {
  listaUrl: string;
  /** Rota do PDF da folha (`/ponto/assinaturas/:id/pdf` ou `/auditoria/assinaturas/:id/pdf`). */
  downloadUrl: (id: string) => string;
  token?: string;
  /** Preenchido quando o arquivo é de outra pessoa (vai no nome do arquivo). */
  nomePessoa?: string;
}) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<Folha | null>(null);
  /* Filtros (no navegador): ano, intervalo de meses e situação. */
  const [filtroAno, setFiltroAno] = useState("");
  const [mesDe, setMesDe] = useState("");
  const [mesAte, setMesAte] = useState("");
  const [situacao, setSituacao] = useState<"TODAS" | "ASSINADAS" | "PENDENTES">("TODAS");

  const carregar = useCallback(() => {
    api
      .get<Resposta>(listaUrl, token)
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e: Error) => setErro(e.message || "Não foi possível carregar as folhas."));
  }, [listaUrl, token]);
  useEffect(carregar, [carregar]);

  async function baixar(f: Folha) {
    setBaixando(f.id);
    try {
      await api.download(
        downloadUrl(f.id),
        nomeArquivoRelatorioMes(f.mes, f.ano, { nomePessoa }),
        token
      );
    } catch (e) {
      alert("Erro ao baixar a folha: " + ((e as Error)?.message ?? "desconhecido"));
    } finally {
      setBaixando(null);
    }
  }

  if (erro) return <p style={{ color: "var(--red)", fontSize: 13 }}>⚠ {erro}</p>;
  if (!dados) return <p style={{ color: "var(--ink-500)", fontSize: 13 }}>Carregando…</p>;

  const chave = (f: Folha) => `${f.ano}-${String(f.mes).padStart(2, "0")}`;
  const passa = (f: Folha) =>
    (!filtroAno || String(f.ano) === filtroAno) &&
    (!mesDe || chave(f) >= mesDe) &&
    (!mesAte || chave(f) <= mesAte);
  const assinadas = situacao === "PENDENTES" ? [] : dados.assinadas.filter(passa);
  const emAndamento = situacao === "ASSINADAS" ? [] : dados.emAndamento.filter(passa);
  const anos = [...new Set([...dados.assinadas, ...dados.emAndamento].map((f) => f.ano))].sort(
    (a, b) => b - a
  );
  const filtrando = !!(filtroAno || mesDe || mesAte || situacao !== "TODAS");

  const porAno = new Map<number, Folha[]>();
  for (const f of assinadas) porAno.set(f.ano, [...(porAno.get(f.ano) ?? []), f]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {visualizando && (
        <VisualizadorPdfProtegido
          caminho={downloadUrl(visualizando.id)}
          titulo={`Relatório ${nomeDoMes(visualizando.mes)} ${visualizando.ano}`}
          onClose={() => setVisualizando(null)}
        />
      )}
      <div
        style={{
          padding: "10px 14px",
          background: "rgba(22,128,61,0.06)",
          border: "1px solid rgba(22,128,61,0.22)",
          borderRadius: "var(--radius-md)",
          fontSize: 12.5,
          color: "var(--ink-700)",
          lineHeight: 1.5
        }}
      >
        <strong style={{ color: "#166534" }}>✓ Folha totalmente assinada</strong> é o documento
        final: leva a assinatura do funcionário e do chefe, com data, hora e código de
        autenticidade. Pode ser baixada e impressa como o papel assinado.
      </div>

      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-end",
          padding: "10px 12px",
          background: "var(--cream-50)",
          border: "1px solid rgba(122,30,38,0.08)",
          borderRadius: "var(--radius-md)"
        }}
      >
        <label style={ROTULO}>
          Ano
          <select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)} style={CAMPO}>
            <option value="">Todos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label style={ROTULO}>
          De (mês)
          <input
            type="month"
            value={mesDe}
            onChange={(e) => setMesDe(e.target.value)}
            style={CAMPO}
          />
        </label>
        <label style={ROTULO}>
          Até (mês)
          <input
            type="month"
            value={mesAte}
            onChange={(e) => setMesAte(e.target.value)}
            style={CAMPO}
          />
        </label>
        <label style={ROTULO}>
          Situação
          <select
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as typeof situacao)}
            style={CAMPO}
          >
            <option value="TODAS">Todas</option>
            <option value="ASSINADAS">Totalmente assinadas</option>
            <option value="PENDENTES">Falta assinar</option>
          </select>
        </label>
        {filtrando && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFiltroAno("");
              setMesDe("");
              setMesAte("");
              setSituacao("TODAS");
            }}
          >
            Limpar filtros
          </button>
        )}
        {mesDe && mesAte && mesDe > mesAte && (
          <span style={{ fontSize: 12, color: "#991B1B" }}>O mês inicial é depois do final.</span>
        )}
      </div>

      {situacao === "PENDENTES" ? null : assinadas.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
          {filtrando
            ? "Nenhuma folha totalmente assinada com esses filtros."
            : "Ainda não há folhas totalmente assinadas."}
        </p>
      ) : (
        [...porAno.entries()].map(([ano, folhas]) => (
          <div key={ano}>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--ink-500)"
              }}
            >
              {ano}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {folhas.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    padding: "10px 12px",
                    border: "1px solid rgba(22,128,61,0.25)",
                    borderRadius: "var(--radius-md)",
                    background: "#fff"
                  }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <strong style={{ textTransform: "capitalize", fontSize: 14 }}>
                      Relatório {nomeDoMes(f.mes)} {f.ano}
                    </strong>{" "}
                    <span className="badge badge-green">Totalmente assinada</span>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 3 }}>
                      Funcionário: {fmtDataHora(f.assinadoFuncionarioEm)} · Chefe
                      {f.assinadoGestorNome ? ` (${f.assinadoGestorNome})` : ""}:{" "}
                      {fmtDataHora(f.assinadoGestorEm)}
                      {f.bancoHorasSaldoTotalMinutos !== null
                        ? ` · Banco: ${fmtHM(f.bancoHorasSaldoTotalMinutos)}`
                        : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setVisualizando(f)}
                  >
                    👁 Visualizar
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={baixando === f.id}
                    onClick={() => void baixar(f)}
                  >
                    {baixando === f.id ? "Baixando…" : "⬇ Baixar folha assinada (PDF)"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {situacao === "PENDENTES" && emAndamento.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
          Nenhuma folha pendente de assinatura com esses filtros.
        </p>
      )}
      {emAndamento.length > 0 && (
        <div>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--ink-500)"
            }}
          >
            AINDA FALTA ASSINAR
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {emAndamento.map((f) => (
              <div
                key={f.id}
                style={{
                  padding: "8px 12px",
                  border: "1px solid rgba(198,127,0,0.30)",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(198,127,0,0.04)",
                  fontSize: 13
                }}
              >
                <strong style={{ textTransform: "capitalize" }}>
                  {nomeDoMes(f.mes)} {f.ano}
                </strong>{" "}
                —{" "}
                {f.status === "PENDENTE_GESTOR"
                  ? "assinada pelo funcionário, aguardando o chefe"
                  : "aguardando a assinatura do funcionário"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

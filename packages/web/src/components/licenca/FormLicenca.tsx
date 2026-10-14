import React, { useEffect, useMemo, useState } from "react";
import { useApiSolicitante } from "../solicitacao/SolicitanteContext";
import { InputHorario } from "../ponto/InputHorario";
import { instanteCivilBrasilia, normalizarHorarioParcial } from "../../utils/horario-brasilia";

export interface TipoLicencaFuncionario {
  id: string;
  nome: string;
  resumo: string;
  modoDuracao: "LIMITE" | "FIXO" | "LIVRE";
  limiteDias: number | null;
  prorrogacaoDias: number | null;
  contagem: "CORRIDOS" | "UTEIS";
  consecutivos: boolean;
  unidade: "DIAS" | "OCORRENCIAS";
  janelaMeses: number | null;
  limiteNaJanela: number | null;
  permiteParcial: boolean;
  exigeDocumento: boolean;
  orientacao: string | null;
  efeito: "AFASTAMENTO" | "REDUCAO_JORNADA";
  reducaoMaxPct: number | null;
  datasUsadas: string[];
}

interface Linha {
  dataInicio: string;
  dataFim: string;
  horaInicio: string;
  horaFim: string;
}

const linhaVazia = (): Linha => ({ dataInicio: "", dataFim: "", horaInicio: "", horaFim: "" });
const fmtBr = (iso: string) => iso.split("-").reverse().join("/");

function somaDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function somaMeses(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}
function dias(inicio: string, fim: string): string[] {
  const out: string[] = [];
  for (let d = inicio; d <= fim && out.length < 800; d = somaDias(d, 1)) out.push(d);
  return out;
}
const fimLinha = (l: Linha) => l.dataFim || l.dataInicio;
const ehParcial = (l: Linha) =>
  !!l.horaInicio && !!l.horaFim && !(l.horaInicio === "00:00" && l.horaFim === "23:59");

/**
 * Solicitação de licença por tipo (dropdown). As regras vêm das Configurações; o servidor
 * confere tudo de novo (aqui é só orientação ao vivo).
 */
export function FormLicenca({
  onSubmit,
  enviando
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  enviando: boolean;
}) {
  const [tipos, setTipos] = useState<TipoLicencaFuncionario[] | null>(null);
  const [tipoId, setTipoId] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [comProrrogacao, setComProrrogacao] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [documentoBase64, setDocumentoBase64] = useState<string | null>(null);
  const [documentoMime, setDocumentoMime] = useState("application/pdf");
  const [nomeArquivo, setNomeArquivo] = useState("");

  const apiSol = useApiSolicitante();
  useEffect(() => {
    apiSol
      .get<TipoLicencaFuncionario[]>("/ponto/licenca/tipos")
      .then((l) => setTipos(l ?? []))
      .catch(() => setTipos([]));
  }, [apiSol]);

  const tipo = useMemo(() => tipos?.find((t) => t.id === tipoId) ?? null, [tipos, tipoId]);

  const trocarTipo = (id: string) => {
    setTipoId(id);
    setLinhas([linhaVazia()]);
    setComProrrogacao(false);
  };

  const atualizar = (i: number, campos: Partial<Linha>) =>
    setLinhas((prev) =>
      prev.map((l, k) => {
        if (k !== i) return l;
        const nova = { ...l, ...campos };
        /* Vários dias = dia inteiro. */
        if (nova.dataInicio && nova.dataFim && nova.dataFim !== nova.dataInicio) {
          nova.horaInicio = "";
          nova.horaFim = "";
        }
        return nova;
      })
    );

  /* Duração fixa: o fim é calculado (início + dias − 1). */
  const totalFixo = tipo
    ? (tipo.limiteDias ?? 0) + (comProrrogacao ? (tipo.prorrogacaoDias ?? 0) : 0)
    : 0;
  const fixoAuto = !!tipo && tipo.modoDuracao === "FIXO" && tipo.consecutivos && totalFixo > 0;
  const linhasEfetivas = linhas.map((l, i) =>
    fixoAuto && i === 0 && l.dataInicio
      ? { ...l, dataFim: somaDias(l.dataInicio, totalFixo - 1) }
      : l
  );

  const preenchidas = linhasEfetivas.every((l) => l.dataInicio);
  const unidades = useMemo(() => {
    if (!tipo) return 0;
    if (tipo.unidade === "OCORRENCIAS") return linhasEfetivas.filter((l) => l.dataInicio).length;
    return linhasEfetivas.reduce((t, l) => {
      if (!l.dataInicio) return t;
      const ds = dias(l.dataInicio, fimLinha(l));
      return (
        t +
        (tipo.contagem === "UTEIS"
          ? ds.filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())).length
          : ds.length)
      );
    }, 0);
  }, [tipo, linhasEfetivas]);

  const primeiraData = linhasEfetivas
    .map((l) => l.dataInicio)
    .filter(Boolean)
    .sort()[0];
  const usadosNaJanela = useMemo(() => {
    if (!tipo?.janelaMeses || !primeiraData) return 0;
    const ini = somaMeses(primeiraData, -tipo.janelaMeses);
    return tipo.datasUsadas.filter((d) => d > ini && d <= primeiraData).length;
  }, [tipo, primeiraData]);

  /* Erros ao vivo (o servidor repete a conferência). */
  const erros: string[] = [];
  if (tipo && preenchidas) {
    linhasEfetivas.forEach((l, i) => {
      if (fimLinha(l) < l.dataInicio)
        erros.push(`Período ${i + 1}: data final anterior à inicial.`);
      if (ehParcial(l) && fimLinha(l) !== l.dataInicio) {
        erros.push(`Período ${i + 1}: horário parcial só em período de 1 dia.`);
      }
      if (ehParcial(l) && l.horaFim <= l.horaInicio) {
        erros.push(`Período ${i + 1}: a hora final deve ser depois da inicial.`);
      }
      if (ehParcial(l) && !tipo.permiteParcial && tipo.efeito !== "REDUCAO_JORNADA") {
        erros.push("Este tipo não aceita horário parcial.");
      }
      if (tipo.efeito === "REDUCAO_JORNADA" && (fimLinha(l) !== l.dataInicio || !ehParcial(l))) {
        erros.push(`Período ${i + 1}: informe um dia com o horário dispensado.`);
      }
    });
    const limite =
      tipo.modoDuracao !== "LIVRE" && tipo.limiteDias && tipo.efeito !== "REDUCAO_JORNADA"
        ? tipo.limiteDias + (comProrrogacao ? (tipo.prorrogacaoDias ?? 0) : 0)
        : null;
    if (limite !== null && unidades > limite) {
      erros.push(`O limite é de ${limite}; o pedido tem ${unidades}.`);
    }
    if (
      tipo.janelaMeses &&
      tipo.limiteNaJanela &&
      usadosNaJanela + unidades > tipo.limiteNaJanela
    ) {
      erros.push(
        `Frequência: no máximo ${tipo.limiteNaJanela} a cada ${tipo.janelaMeses} meses (você já usou ${usadosNaJanela}).`
      );
    }
    if (tipo.exigeDocumento && !documentoBase64) erros.push("Anexe o documento comprobatório.");
  }

  const podeEnviar = !!tipo && preenchidas && erros.length === 0 && !!descricao.trim() && !enviando;

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setDocumentoMime(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => setDocumentoBase64(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const enviar = () => {
    if (!tipo || !podeEnviar) return;
    const inicios = linhasEfetivas.map((l) => l.dataInicio).sort();
    const fins = linhasEfetivas.map(fimLinha).sort();
    onSubmit({
      tipo: "LICENCA",
      dataReferencia: instanteCivilBrasilia(inicios[0], "12:00:00").toISOString(),
      dataInicio: instanteCivilBrasilia(inicios[0], "00:00:00").toISOString(),
      dataFim: instanteCivilBrasilia(fins[fins.length - 1], "23:59:59").toISOString(),
      descricao: descricao.trim(),
      metadados: {
        tipoLicencaId: tipo.id,
        comProrrogacao,
        periodos: linhasEfetivas.map((l) => ({
          dataInicio: instanteCivilBrasilia(l.dataInicio, "00:00:00").toISOString(),
          dataFim: instanteCivilBrasilia(fimLinha(l), "23:59:59").toISOString(),
          horarioInicio: ehParcial(l)
            ? normalizarHorarioParcial(l.horaInicio) || l.horaInicio
            : null,
          horarioFim: ehParcial(l) ? normalizarHorarioParcial(l.horaFim) || l.horaFim : null
        })),
        ...(documentoBase64 ? { documentoBase64, documentoMime, nomeArquivo } : {})
      }
    });
  };

  const labelBase: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ink-700)",
    display: "block",
    marginBottom: 4
  };
  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    boxSizing: "border-box"
  };
  const multiplos = !!tipo && (!tipo.consecutivos || tipo.efeito === "REDUCAO_JORNADA");
  const aceitaHora = !!tipo && (tipo.permiteParcial || tipo.efeito === "REDUCAO_JORNADA");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={labelBase} htmlFor="licenca-tipo">
          Tipo de licença <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <select
          id="licenca-tipo"
          style={input}
          value={tipoId}
          onChange={(e) => trocarTipo(e.target.value)}
        >
          <option value="">{tipos === null ? "Carregando…" : "Selecione o tipo de licença"}</option>
          {(tipos ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} ({t.resumo})
            </option>
          ))}
        </select>
        {tipos && tipos.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "4px 0 0" }}>
            Nenhum tipo de licença disponível para a sua categoria. Procure o RH.
          </p>
        )}
      </div>

      {tipo && (
        <div
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
          <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e40af" }}>
            ℹ️ {tipo.nome}: {tipo.resumo}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {tipo.efeito === "AFASTAMENTO" && tipo.modoDuracao !== "LIVRE" && tipo.limiteDias ? (
              <li>
                Contagem em{" "}
                <strong>{tipo.contagem === "UTEIS" ? "dias úteis" : "dias corridos"}</strong>
                {tipo.consecutivos
                  ? ", em um único período contínuo."
                  : ", podendo ser em vários períodos."}
              </li>
            ) : null}
            {tipo.janelaMeses && tipo.limiteNaJanela ? (
              <li>
                Frequência: no máximo {tipo.limiteNaJanela} a cada {tipo.janelaMeses} meses — você
                já usou <strong>{usadosNaJanela}</strong>
                {primeiraData ? ` (a partir de ${fmtBr(primeiraData)})` : ""}.
              </li>
            ) : null}
            {tipo.permiteParcial && <li>Pode ser pedida por horário (parcial) em um único dia.</li>}
            {tipo.exigeDocumento && <li>Documento comprobatório obrigatório.</li>}
            {tipo.orientacao && <li>{tipo.orientacao}</li>}
            <li>
              O pedido passa pelo <strong>chefe</strong> e depois pelo <strong>RH</strong>.
            </li>
          </ul>
        </div>
      )}

      {tipo && tipo.prorrogacaoDias ? (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <input
            type="checkbox"
            checked={comProrrogacao}
            onChange={(e) => setComProrrogacao(e.target.checked)}
          />
          <span>
            Incluir prorrogação de <strong>{tipo.prorrogacaoDias} dias</strong> (total{" "}
            {(tipo.limiteDias ?? 0) + tipo.prorrogacaoDias} dias)
          </span>
        </label>
      ) : null}

      {tipo &&
        linhasEfetivas.map((l, i) => {
          const variosDias = !!l.dataInicio && fimLinha(l) !== l.dataInicio;
          return (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                border: "1px solid rgba(122,30,38,0.12)",
                borderRadius: "var(--radius-md)",
                background: "var(--cream-50)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8
                }}
              >
                <strong style={{ fontSize: 12.5, color: "var(--burgundy-600)" }}>
                  {multiplos ? `Período ${i + 1}` : "Período da licença"}
                </strong>
                {multiplos && linhas.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Remover período ${i + 1}`}
                    onClick={() => setLinhas((p) => p.filter((_, k) => k !== i))}
                  >
                    −
                  </button>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: aceitaHora
                    ? "repeat(auto-fit, minmax(130px, 1fr))"
                    : "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 8
                }}
              >
                <div>
                  <label style={labelBase}>
                    Data inicial <span style={{ color: "var(--red)" }}>*</span>
                  </label>
                  <input
                    type="date"
                    style={input}
                    value={linhas[i].dataInicio}
                    onChange={(e) => atualizar(i, { dataInicio: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelBase}>
                    Data final {fixoAuto && i === 0 ? "(automática)" : ""}
                  </label>
                  <input
                    type="date"
                    style={{ ...input, opacity: fixoAuto && i === 0 ? 0.7 : 1 }}
                    value={l.dataFim}
                    min={l.dataInicio || undefined}
                    disabled={fixoAuto && i === 0}
                    onChange={(e) => atualizar(i, { dataFim: e.target.value })}
                  />
                </div>
                {aceitaHora && (
                  <>
                    <div>
                      <label style={labelBase}>Hora inicial</label>
                      <InputHorario
                        style={{ ...input, opacity: variosDias ? 0.6 : 1 }}
                        value={linhas[i].horaInicio}
                        disabled={variosDias}
                        onChange={(v) => atualizar(i, { horaInicio: v })}
                      />
                    </div>
                    <div>
                      <label style={labelBase}>Hora final</label>
                      <InputHorario
                        style={{ ...input, opacity: variosDias ? 0.6 : 1 }}
                        value={linhas[i].horaFim}
                        disabled={variosDias}
                        onChange={(v) => atualizar(i, { horaFim: v })}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

      {tipo && multiplos && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setLinhas((p) => [...p, linhaVazia()])}
        >
          + Adicionar período
        </button>
      )}

      {tipo && preenchidas && tipo.efeito === "AFASTAMENTO" && (
        <p style={{ fontSize: 12.5, margin: 0, color: "var(--ink-700)" }}>
          Esta licença usa{" "}
          <strong>
            {unidades} {tipo.unidade === "OCORRENCIAS" ? "ocorrência(s)" : "dia(s)"}
          </strong>
          {tipo.modoDuracao !== "LIVRE" && tipo.limiteDias
            ? ` de ${tipo.limiteDias + (comProrrogacao ? (tipo.prorrogacaoDias ?? 0) : 0)}`
            : ""}
          .
        </p>
      )}

      {erros.length > 0 && (
        <div
          style={{
            fontSize: 12,
            color: "var(--red)",
            display: "flex",
            flexDirection: "column",
            gap: 2
          }}
        >
          {[...new Set(erros)].map((e) => (
            <span key={e}>⚠ {e}</span>
          ))}
        </div>
      )}

      {tipo && (
        <div>
          <label style={labelBase}>
            Documento {tipo.exigeDocumento ? "" : "(opcional)"}
            {tipo.exigeDocumento && <span style={{ color: "var(--red)" }}> *</span>}
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="file"
              id="licenca-arquivo"
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={handleArquivo}
            />
            <label
              htmlFor="licenca-arquivo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                border: "1px solid rgba(122,30,38,0.22)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--burgundy-600)",
                background: "#fff"
              }}
            >
              📎 Anexar documento (imagem ou PDF)
            </label>
            {nomeArquivo && (
              <span style={{ fontSize: 12, color: "var(--ink-500)" }}>✓ {nomeArquivo}</span>
            )}
          </div>
        </div>
      )}

      <div>
        <label style={labelBase}>
          Descrição / Justificativa <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <textarea
          style={{ ...input, resize: "vertical" }}
          rows={3}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva o motivo..."
        />
      </div>

      <button className="btn btn-primary" disabled={!podeEnviar} onClick={enviar}>
        {enviando ? "Enviando…" : "Enviar Solicitação"}
      </button>
    </div>
  );
}

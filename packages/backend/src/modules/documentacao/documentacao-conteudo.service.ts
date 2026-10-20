import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import JSZip from "jszip";
import { join } from "path";
import { DocumentacaoBancoService } from "./documentacao-banco.service";
import { DocumentacaoGeradaService, type RotaDoc } from "./documentacao-gerada.service";
import { DocumentacaoService } from "./documentacao.service";

export type Gerada = "api" | "banco" | "stack" | "jobs" | "ambiente" | "cobertura";

export interface SecaoIndice {
  id: string;
  grupo: string;
  titulo: string;
  arquivo?: string;
  gerada?: Gerada;
  /** Para "banco": der (diagramas) ou dicionario (tabelas). */
  vista?: "der" | "dicionario";
}

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const esc = (t: string | null | undefined) =>
  String(t ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");

/** Índice, leitura segura das seções (lista fechada), busca, cobertura, exportação e revisões automáticas. */
@Injectable()
export class DocumentacaoConteudoService {
  private ultimaVerificacao = 0;
  private verificando: Promise<void> | null = null;

  constructor(
    private readonly gerada: DocumentacaoGeradaService,
    private readonly banco: DocumentacaoBancoService,
    private readonly base: DocumentacaoService
  ) {}

  private dirDocs() {
    return join(this.gerada.raiz(), "docs", "tecnica");
  }

  indice(): SecaoIndice[] {
    try {
      return JSON.parse(readFileSync(join(this.dirDocs(), "indice.json"), "utf8")) as SecaoIndice[];
    } catch {
      return [];
    }
  }

  private lerMarkdown(s: SecaoIndice): string | null {
    // Só arquivos declarados no índice, sempre dentro de docs/tecnica (sem caminho livre).
    if (!s.arquivo || !/^[a-z0-9][a-z0-9/_-]*\.md$/i.test(s.arquivo) || s.arquivo.includes(".."))
      return null;
    try {
      return readFileSync(join(this.dirDocs(), s.arquivo), "utf8");
    } catch {
      return null;
    }
  }

  ambienteDescricoes() {
    try {
      return JSON.parse(readFileSync(join(this.dirDocs(), "ambiente.json"), "utf8")) as Record<
        string,
        { funcao: string; obrigatoria?: boolean }
      >;
    } catch {
      return {};
    }
  }

  secao(id: string) {
    const s = this.indice().find((x) => x.id === id);
    if (!s) return null;
    const md = this.lerMarkdown(s);
    return {
      ...s,
      tipo: s.gerada ? ("gerada" as const) : ("markdown" as const),
      markdown: md,
      hash: md ? sha(md).slice(0, 12) : null
    };
  }

  dadosGerados(tipo: Gerada) {
    switch (tipo) {
      case "api":
        return { rotas: this.gerada.rotas() };
      case "banco":
        return this.banco.banco();
      case "stack":
        return this.gerada.stack();
      case "jobs":
        return { jobs: this.gerada.jobs() };
      case "ambiente":
        return { variaveis: this.gerada.ambiente(this.ambienteDescricoes()) };
      case "cobertura":
        return this.cobertura();
    }
  }

  /* ───────────── Busca ───────────── */

  busca(termo: string) {
    const q = termo.trim().toLowerCase();
    if (q.length < 2) return [];
    const achados: {
      tipo: string;
      titulo: string;
      trecho: string;
      secao: string;
      ancora?: string;
    }[] = [];
    for (const s of this.indice()) {
      if (s.titulo.toLowerCase().includes(q))
        achados.push({ tipo: "seção", titulo: s.titulo, trecho: s.grupo, secao: s.id });
      const md = s.arquivo ? this.lerMarkdown(s) : null;
      if (!md) continue;
      const linhas = md.split("\n");
      let n = 0;
      for (let i = 0; i < linhas.length && n < 3; i++) {
        if (!linhas[i].toLowerCase().includes(q)) continue;
        n++;
        achados.push({
          tipo: "texto",
          titulo: s.titulo,
          trecho: linhas[i]
            .replace(/[#*`|>]/g, "")
            .trim()
            .slice(0, 160),
          secao: s.id
        });
      }
    }
    for (const r of this.gerada.rotas()) {
      const alvo =
        `${r.metodo} ${r.caminho} ${r.titulo ?? ""} ${r.descricao ?? ""} ${r.controlador} ${r.funcao}`.toLowerCase();
      if (alvo.includes(q) && achados.filter((a) => a.tipo === "endpoint").length < 40)
        achados.push({
          tipo: "endpoint",
          titulo: `${r.metodo} ${r.caminho}`,
          trecho: r.titulo ?? r.controlador,
          secao: "apis",
          ancora: r.id
        });
    }
    for (const t of this.banco.banco().tabelas) {
      if (t.nome.toLowerCase().includes(q) || (t.descricao ?? "").toLowerCase().includes(q))
        achados.push({
          tipo: "tabela",
          titulo: t.nome,
          trecho: t.descricao ?? "",
          secao: "banco-dicionario",
          ancora: t.nome
        });
      else {
        const c = t.campos.find((x) => x.nome.toLowerCase().includes(q));
        if (c)
          achados.push({
            tipo: "campo",
            titulo: `${t.nome}.${c.nome}`,
            trecho: c.tipo,
            secao: "banco-dicionario",
            ancora: t.nome
          });
      }
    }
    return achados.slice(0, 120);
  }

  /* ───────────── Cobertura ───────────── */

  cobertura() {
    const indice = this.indice();
    const rotas = this.gerada.rotas();
    const banco = this.banco.banco();
    const semArquivo = indice
      .filter((s) => s.arquivo && this.lerMarkdown(s) === null)
      .map((s) => s.id);
    const semDescricaoRota = rotas.filter((r) => !r.titulo).map((r) => r.id);
    const ambiente = this.gerada.ambiente(this.ambienteDescricoes());
    return {
      secoes: indice.length,
      secoesSemArquivo: semArquivo,
      rotas: rotas.length,
      rotasSemDescricao: semDescricaoRota,
      tabelas: banco.totais.tabelas,
      tabelasSemDominio: banco.cobertura.semDominio,
      tabelasSemDescricao: banco.cobertura.semDescricao,
      variaveisSemDescricao: ambiente.filter((v) => !v.funcao).map((v) => v.nome),
      ok:
        !semArquivo.length &&
        !banco.cobertura.semDominio.length &&
        !banco.cobertura.modelosInexistentes.length
    };
  }

  /* ───────────── Revisões automáticas ───────────── */

  private retrato() {
    const rotas = this.gerada.rotas();
    const banco = this.banco.banco();
    const stack = this.gerada.stack();
    const secoes: Record<string, string> = {};
    for (const s of this.indice()) {
      const md = s.arquivo ? this.lerMarkdown(s) : null;
      if (md) secoes[s.id] = sha(md).slice(0, 12);
    }
    return {
      rotas: rotas.map((r) => `${r.id}|${r.acesso}|${r.papeis.join(",")}`),
      tabelas: Object.fromEntries(
        banco.tabelas.map((t) => [t.nome, t.campos.map((c) => `${c.nome}:${c.tipo}`)])
      ),
      deps: stack.pacotes.flatMap((p) =>
        p.dependencias.map((d) => `${p.pacote}:${d.nome}@${d.instalada ?? d.faixa}`)
      ),
      jobs: this.gerada.jobs().map((j) => `${j.classe}.${j.metodo}@${j.agenda}`),
      secoes
    };
  }

  private resumo(
    ant: ReturnType<DocumentacaoConteudoService["retrato"]>,
    nov: ReturnType<DocumentacaoConteudoService["retrato"]>
  ) {
    const itens: string[] = [];
    const lista = (
      nome: string,
      a: string[],
      b: string[],
      fmt: (x: string) => string = (x) => x
    ) => {
      const sa = new Set(a);
      const sb = new Set(b);
      const mais = b.filter((x) => !sa.has(x));
      const menos = a.filter((x) => !sb.has(x));
      const tr = (arr: string[]) =>
        arr.slice(0, 5).map(fmt).join("; ") + (arr.length > 5 ? ` e mais ${arr.length - 5}` : "");
      if (mais.length) itens.push(`+${mais.length} ${nome} (${tr(mais)})`);
      if (menos.length) itens.push(`−${menos.length} ${nome} (${tr(menos)})`);
    };
    lista("endpoint(s)/permissão", ant.rotas, nov.rotas, (x) => x.split("|")[0]);
    const tNovas = Object.keys(nov.tabelas).filter((t) => !(t in ant.tabelas));
    const tRem = Object.keys(ant.tabelas).filter((t) => !(t in nov.tabelas));
    if (tNovas.length) itens.push(`+${tNovas.length} tabela(s) (${tNovas.join(", ")})`);
    if (tRem.length) itens.push(`−${tRem.length} tabela(s) (${tRem.join(", ")})`);
    for (const t of Object.keys(nov.tabelas)) {
      if (!(t in ant.tabelas)) continue;
      const a = new Set(ant.tabelas[t]);
      const b = new Set(nov.tabelas[t]);
      const mais = nov.tabelas[t].filter((x) => !a.has(x)).map((x) => x.split(":")[0]);
      const menos = ant.tabelas[t].filter((x) => !b.has(x)).map((x) => x.split(":")[0]);
      const alter = mais.filter((m) => menos.includes(m));
      const so = (arr: string[]) => arr.filter((m) => !alter.includes(m));
      if (so(mais).length) itens.push(`campo(s) adicionado(s) em ${t}: ${so(mais).join(", ")}`);
      if (so(menos).length) itens.push(`campo(s) removido(s) de ${t}: ${so(menos).join(", ")}`);
      if (alter.length) itens.push(`campo(s) alterado(s) em ${t}: ${alter.join(", ")}`);
    }
    lista("dependência(s)/versão(ões)", ant.deps, nov.deps);
    lista("rotina(s) agendada(s)", ant.jobs, nov.jobs);
    const secs = Object.keys(nov.secoes).filter((s) => ant.secoes[s] !== nov.secoes[s]);
    if (secs.length) itens.push(`texto(s) revisado(s): ${secs.join(", ")}`);
    return itens.length ? `Atualização automática: ${itens.join("; ")}.` : null;
  }

  /** Compara o código atual com o último retrato e, se mudou, grava uma revisão automática. */
  async verificarAtualizacoes(): Promise<void> {
    if (Date.now() - this.ultimaVerificacao < 60_000) return;
    if (this.verificando) return this.verificando;
    this.verificando = (async () => {
      try {
        const nov = this.retrato();
        const hash = sha(JSON.stringify(nov));
        const ult = await this.base.ultimoSnapshot();
        if (ult?.hash === hash) return;
        const resumo = ult ? this.resumo(ult.conteudo as unknown as typeof nov, nov) : null;
        await this.base.registrarAutomatica(hash, nov, resumo);
      } finally {
        this.ultimaVerificacao = Date.now();
        this.verificando = null;
      }
    })();
    return this.verificando;
  }

  /* ───────────── Markdown das partes geradas (impressão/exportação) ───────────── */

  mdGerada(tipo: Gerada, vista?: "der" | "dicionario"): string {
    if (tipo === "api") return this.mdApis(this.gerada.rotas());
    if (tipo === "banco") return this.mdBanco(vista);
    if (tipo === "stack") return this.mdStack();
    if (tipo === "jobs")
      return (
        "| Classe | Método | Agenda (cron) | Fuso |\n|---|---|---|---|\n" +
        this.gerada
          .jobs()
          .map(
            (j) =>
              `| ${j.classe} | ${j.metodo} | \`${j.agenda}\` | ${j.fusoHorario ?? "servidor"} |`
          )
          .join("\n")
      );
    if (tipo === "cobertura") {
      const c = this.cobertura();
      const lista = (t: string, l: string[]) => `- ${t}: ${l.length ? l.join(", ") : "nenhuma"}`;
      return [
        `- Seções: ${c.secoes} · Rotas: ${c.rotas} · Tabelas: ${c.tabelas}`,
        lista("Seções sem arquivo", c.secoesSemArquivo),
        lista("Rotas sem descrição no catálogo", c.rotasSemDescricao),
        lista("Tabelas sem domínio", c.tabelasSemDominio),
        lista("Tabelas sem descrição", c.tabelasSemDescricao),
        lista("Variáveis de ambiente sem descrição", c.variaveisSemDescricao)
      ].join("\n");
    }
    return (
      "| Variável | Função | Usada em |\n|---|---|---|\n" +
      this.gerada
        .ambiente(this.ambienteDescricoes())
        .map((v) => `| \`${v.nome}\` | ${esc(v.funcao) || "—"} | ${esc(v.usadaEm.join(", "))} |`)
        .join("\n")
    );
  }

  private mdApis(rotas: RotaDoc[]): string {
    const porCtrl = new Map<string, RotaDoc[]>();
    for (const r of rotas) porCtrl.set(r.controlador, [...(porCtrl.get(r.controlador) ?? []), r]);
    const out: string[] = [];
    for (const [c, lista] of porCtrl) {
      out.push(`### ${c}\n`);
      out.push("| Método | Caminho | Acesso | Descrição | Lê | Grava |\n|---|---|---|---|---|---|");
      for (const r of lista) {
        const acesso =
          r.acesso === "publico"
            ? "Público"
            : r.acesso === "papeis"
              ? r.papeis.join(", ")
              : "Autenticado";
        out.push(
          `| ${r.metodo} | \`${r.caminho}\` | ${esc(acesso)}${r.recursosRh.length ? ` (RH: ${r.recursosRh.join(", ")})` : ""} | ${esc(r.titulo ?? "—")} | ${esc(r.tabelasLeitura.join(", "))} | ${esc(r.tabelasEscrita.join(", "))} |`
        );
      }
      out.push("");
    }
    return out.join("\n");
  }

  private mdBanco(vista?: "der" | "dicionario"): string {
    const b = this.banco.banco();
    const out: string[] = [
      `Tabelas: ${b.totais.tabelas} · Enums: ${b.totais.enums} · Relações: ${b.totais.relacoes}\n`
    ];
    if (vista !== "dicionario") {
      out.push("### Diagrama geral\n\n```mermaid\n" + b.geral + "\n```\n");
      for (const d of b.dominios) {
        out.push(`### ${d.titulo}\n\n${d.descricao}\n\n\`\`\`mermaid\n${d.mermaid}\n\`\`\`\n`);
      }
      if (vista === "der") return out.join("\n");
    }
    for (const t of b.tabelas) {
      out.push(`### ${t.nome}\n\n${t.descricao ?? ""}\n`);
      out.push(
        "| Campo | Tipo | Obrig. | Chave | Padrão | Referência |\n|---|---|---|---|---|---|"
      );
      for (const c of t.campos)
        out.push(
          `| ${c.nome} | ${c.tipo}${c.lista ? "[]" : ""} | ${c.obrigatorio ? "sim" : "não"} | ${c.chave.join(", ")} | ${esc(c.padrao)} | ${esc(c.referencia)} |`
        );
      out.push("");
    }
    out.push("### Enums\n");
    for (const e of b.enums) out.push(`- **${e.nome}**: ${e.valores.join(", ")}`);
    return out.join("\n");
  }

  private mdStack(): string {
    const s = this.gerada.stack();
    const out = [
      `Node ${s.node} · Prisma ${s.prisma ?? "—"} · Sistema ${s.sistema ?? "—"}\n`,
      "### Serviços (Docker Compose)\n"
    ];
    out.push("| Serviço | Imagem | Portas/expõe | Depende de |\n|---|---|---|---|");
    for (const v of s.servicos)
      out.push(
        `| ${v.nome} | ${esc(v.imagem ?? (v.construido ? "build local" : "—"))} | ${esc([...v.portas, ...v.expoe].join(", "))} | ${esc(v.dependeDe.join(", "))} |`
      );
    for (const p of s.pacotes) {
      out.push(`\n### ${p.pacote} (${p.versao ?? "—"})\n`);
      out.push("| Dependência | Faixa | Instalada |\n|---|---|---|");
      for (const d of p.dependencias)
        out.push(`| ${d.nome} | ${d.faixa} | ${d.instalada ?? "—"} |`);
    }
    return out.join("\n");
  }

  /** Documento único em Markdown (capa com autoria, revisões e todas as seções). */
  async exportarMarkdown(): Promise<{ nome: string; md: string }> {
    const a = await this.base.autoria();
    const revs = await this.base.revisoes();
    const out: string[] = [
      "# Documentação Técnica — Sistema de Ponto Eletrônico (CFO)\n",
      `**Versão da documentação:** ${a.versaoAtual}  `,
      `**Autor:** ${a.autor}  `,
      `**Data de entrega:** ${a.dataEntrega}  `,
      `**Local de desenvolvimento:** ${a.local}  `,
      `**Gerente responsável:** ${a.gerenteResponsavel}  `,
      `**Solicitação de desenvolvimento:** ${a.solicitacao}\n`,
      "## Revisões\n",
      "| Versão | Tipo | Desenvolvedor | Revisor | Data | Comentário | Situação |\n|---|---|---|---|---|---|---|",
      ...revs.map(
        (r) =>
          `| ${r.versao} | ${r.tipo === "AUTOMATICA" ? "automática" : "manual"} | ${esc(r.desenvolvedor)} | ${esc(r.revisor)} | ${r.dataRevisao} | ${esc(r.comentario)} | ${r.anuladaEm ? `ANULADA: ${esc(r.motivoAnulacao)}` : "vigente"} |`
      ),
      ""
    ];
    let grupo = "";
    for (const s of this.indice()) {
      if (s.grupo !== grupo) {
        grupo = s.grupo;
        out.push(`\n# ${grupo}\n`);
      }
      out.push(`\n## ${s.titulo}\n`);
      const texto = this.lerMarkdown(s);
      if (texto) out.push(texto);
      if (s.gerada) out.push(this.mdGerada(s.gerada, s.vista));
      else if (!texto) out.push("_Seção ainda não escrita._");
    }
    return { nome: `documentacao-tecnica-v${a.versaoAtual}.md`, md: out.join("\n") };
  }

  async exportarZip(): Promise<{ nome: string; buffer: Buffer }> {
    const { nome, md } = await this.exportarMarkdown();
    const zip = new JSZip();
    zip.file(nome, md);
    let n = 0;
    for (const s of this.indice()) {
      n++;
      const corpo = [this.lerMarkdown(s) ?? "", s.gerada ? this.mdGerada(s.gerada, s.vista) : ""]
        .filter(Boolean)
        .join("\n\n");
      zip.file(`secoes/${String(n).padStart(2, "0")}-${s.id}.md`, `# ${s.titulo}\n\n${corpo}\n`);
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return { nome: nome.replace(/\.md$/, ".zip"), buffer };
  }
}

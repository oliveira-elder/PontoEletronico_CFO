import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { DocumentacaoGeradaService } from "./documentacao-gerada.service";

type Campo = Prisma.DMMF.Field;
type Modelo = Prisma.DMMF.Model;

interface Dominio {
  id: string;
  titulo: string;
  descricao: string;
  modelos: string[];
}

export interface TabelaDoc {
  nome: string;
  descricao: string | null;
  dominios: string[];
  campos: {
    nome: string;
    tipo: string;
    obrigatorio: boolean;
    lista: boolean;
    padrao: string | null;
    chave: string[];
    referencia: string | null;
    descricao: string | null;
  }[];
  indices: { tipo: string; campos: string[] }[];
  relacoes: { campo: string; para: string; lista: boolean }[];
}

const TIPO_MERMAID: Record<string, string> = {
  String: "string",
  Int: "int",
  BigInt: "bigint",
  Boolean: "boolean",
  DateTime: "datetime",
  Float: "float",
  Decimal: "decimal",
  Json: "json",
  Bytes: "bytes"
};

@Injectable()
export class DocumentacaoBancoService {
  constructor(private readonly gerada: DocumentacaoGeradaService) {}

  private json<T>(arquivo: string, padrao: T): T {
    try {
      return JSON.parse(
        readFileSync(join(this.gerada.raiz(), "docs", "tecnica", arquivo), "utf8")
      ) as T;
    } catch {
      return padrao;
    }
  }

  private tipoMermaid(c: Campo): string {
    if (c.isList) return "list";
    return TIPO_MERMAID[c.type] ?? c.type.replace(/\W/g, "_");
  }

  private entidade(m: Modelo): string {
    const pks = new Set(m.primaryKey?.fields ?? []);
    const unicos = new Set<string>();
    for (const u of m.uniqueFields ?? []) if (u.length === 1) unicos.add(u[0]);
    const fks = new Set<string>();
    for (const c of m.fields)
      if (c.kind === "object") for (const f of c.relationFromFields ?? []) fks.add(f);
    const linhas = m.fields
      .filter((c) => c.kind !== "object")
      .map((c) => {
        const chaves: string[] = [];
        if (c.isId || pks.has(c.name)) chaves.push("PK");
        if (fks.has(c.name)) chaves.push("FK");
        if (c.isUnique || unicos.has(c.name)) chaves.push("UK");
        return `    ${this.tipoMermaid(c)} ${c.name}${chaves.length ? " " + chaves.join(", ") : ""}`;
      });
    return `  ${m.name} {\n${linhas.join("\n")}\n  }`;
  }

  private relacoes(
    modelos: readonly Modelo[],
    rotulos: Record<string, string>,
    filtro?: Set<string>
  ): string[] {
    const linhas: string[] = [];
    for (const m of modelos) {
      for (const c of m.fields) {
        if (c.kind !== "object" || !c.relationFromFields?.length) continue;
        if (filtro && !filtro.has(m.name) && !filtro.has(c.type)) continue;
        const fk = m.fields.find((f) => f.name === c.relationFromFields?.[0]);
        const unico =
          !!fk?.isUnique || (m.uniqueFields ?? []).some((u) => u.length === 1 && u[0] === fk?.name);
        const lado = c.isRequired ? "||" : "|o";
        const filho = unico ? "o|" : "o{";
        const rotulo = rotulos[`${m.name}:${c.type}`] ?? c.name;
        linhas.push(`  ${c.type} ${lado}--${filho} ${m.name} : "${rotulo.replace(/"/g, "'")}"`);
      }
    }
    return [...new Set(linhas)];
  }

  banco() {
    const dm = Prisma.dmmf.datamodel;
    const dominios = this.json<{ dominios: Dominio[] }>("banco-dominios.json", {
      dominios: []
    }).dominios;
    const descricoes = this.json<Record<string, string>>("banco-descricoes.json", {});
    const rotulos = this.json<Record<string, string>>("banco-rotulos.json", {});
    const porNome = new Map(dm.models.map((m) => [m.name, m]));

    const dominiosDe = new Map<string, string[]>();
    for (const d of dominios)
      for (const n of d.modelos) dominiosDe.set(n, [...(dominiosDe.get(n) ?? []), d.id]);
    const semDominio = dm.models.map((m) => m.name).filter((n) => !dominiosDe.has(n));
    const modelosInexistentes = dominios.flatMap((d) => d.modelos.filter((n) => !porNome.has(n)));

    const diagramas = dominios.map((d) => {
      const modelos = d.modelos.map((n) => porNome.get(n)).filter((m): m is Modelo => !!m);
      const filtro = new Set(modelos.map((m) => m.name));
      const rels = this.relacoes(dm.models, rotulos, filtro);
      const vistos = new Set<string>(filtro);
      const externos = new Set<string>();
      for (const r of rels) {
        const p = /^ {2}(\w+) \S+ (\w+) :/.exec(r);
        if (p) for (const n of [p[1], p[2]]) if (!vistos.has(n)) externos.add(n);
      }
      const mermaid =
        "erDiagram\n" +
        modelos.map((m) => this.entidade(m)).join("\n") +
        "\n" +
        [...externos].map((n) => `  ${n} {\n  }`).join("\n") +
        (externos.size ? "\n" : "") +
        rels.join("\n");
      return {
        id: d.id,
        titulo: d.titulo,
        descricao: d.descricao,
        modelos: modelos.map((m) => m.name),
        mermaid
      };
    });

    const geral =
      "erDiagram\n" +
      dm.models.map((m) => `  ${m.name} {\n  }`).join("\n") +
      "\n" +
      this.relacoes(dm.models, rotulos).join("\n");

    const indicesDe = (m: Modelo) => {
      const out: { tipo: string; campos: string[] }[] = [];
      if (m.primaryKey) out.push({ tipo: "PK composta", campos: [...m.primaryKey.fields] });
      for (const u of m.uniqueFields ?? []) out.push({ tipo: "único", campos: [...u] });
      const idx = (
        dm as unknown as { indexes?: { model: string; type: string; fields: { name: string }[] }[] }
      ).indexes;
      for (const i of idx ?? [])
        if (i.model === m.name && i.type !== "unique")
          out.push({
            tipo: i.type === "fulltext" ? "texto" : "índice",
            campos: i.fields.map((f) => f.name)
          });
      return out;
    };

    const tabelas: TabelaDoc[] = dm.models.map((m) => {
      const fks = new Map<string, string>();
      for (const c of m.fields)
        if (c.kind === "object")
          for (const f of c.relationFromFields ?? [])
            fks.set(f, `${c.type}.${c.relationToFields?.[0] ?? "id"}`);
      return {
        nome: m.name,
        descricao: descricoes[m.name] ?? null,
        dominios: dominiosDe.get(m.name) ?? [],
        campos: m.fields
          .filter((c) => c.kind !== "object")
          .map((c) => {
            const chave: string[] = [];
            if (c.isId) chave.push("PK");
            if (fks.has(c.name)) chave.push("FK");
            if (c.isUnique) chave.push("UK");
            const padrao =
              c.hasDefaultValue && c.default !== undefined
                ? typeof c.default === "object"
                  ? `${(c.default as { name?: string }).name ?? "valor"}()`
                  : String(c.default)
                : null;
            return {
              nome: c.name,
              tipo: c.kind === "enum" ? `enum ${c.type}` : c.type,
              obrigatorio: c.isRequired,
              lista: c.isList,
              padrao,
              chave,
              referencia: fks.get(c.name) ?? null,
              descricao: c.documentation ?? null
            };
          }),
        indices: indicesDe(m),
        relacoes: m.fields
          .filter((c) => c.kind === "object")
          .map((c) => ({ campo: c.name, para: c.type, lista: c.isList }))
      };
    });

    const enums = dm.enums.map((e) => ({ nome: e.name, valores: e.values.map((v) => v.name) }));

    return {
      geradoEm: new Date().toISOString(),
      totais: {
        tabelas: dm.models.length,
        enums: dm.enums.length,
        relacoes: this.relacoes(dm.models, rotulos).length
      },
      geral,
      dominios: diagramas,
      tabelas,
      enums,
      cobertura: {
        semDominio,
        modelosInexistentes,
        semDescricao: tabelas.filter((t) => !t.descricao).map((t) => t.nome)
      }
    };
  }
}

import { Injectable } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { ENDPOINT_CATALOG } from "../logs/endpoint-catalog";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RECURSO_RH_KEY } from "../auth/recurso-rh.decorator";

/* Constantes de metadados do NestJS/@nestjs/schedule (não exportadas publicamente). */
const PATH_METADATA = "path";
const METHOD_METADATA = "method";
const GUARDS_METADATA = "__guards__";
const HTTP_CODE_METADATA = "__httpCode__";
const ROUTE_ARGS_METADATA = "__routeArguments__";
const CRON_OPTIONS = "SCHEDULE_CRON_OPTIONS";
const SCHEDULER_NAME = "SCHEDULER_NAME";
const METODOS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD"];
const TIPO_PARAM: Record<number, string> = {
  3: "body",
  4: "query",
  5: "param",
  6: "headers",
  7: "file",
  8: "files"
};
const OPS_LEITURA = new Set([
  "findMany",
  "findFirst",
  "findUnique",
  "findFirstOrThrow",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy"
]);
const OPS_ESCRITA = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany"
]);

export interface RotaDoc {
  id: string;
  metodo: string;
  caminho: string;
  controlador: string;
  modulo: string;
  funcao: string;
  titulo: string | null;
  descricao: string | null;
  categoria: string | null;
  acesso: "publico" | "autenticado" | "papeis";
  papeis: string[];
  recursosRh: string[];
  guardas: string[];
  parametros: { origem: string; nome: string | null; tipo: string | null }[];
  statusHttp: number | null;
  tabelasLeitura: string[];
  tabelasEscrita: string[];
  consultas: string[];
  sqlCru: boolean;
}

export interface JobDoc {
  classe: string;
  metodo: string;
  nome: string | null;
  agenda: string;
  fusoHorario: string | null;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const normaliza = (...partes: string[]) =>
  "/" + partes.join("/").split("/").filter(Boolean).join("/");

/** Descobre, por reflexão em tempo de execução, o que o sistema expõe (rotas, jobs, stack, ambiente). */
@Injectable()
export class DocumentacaoGeradaService {
  private cacheRotas: { em: number; dados: RotaDoc[] } | null = null;
  private readonly cacheAnalise = new Map<string, AnaliseDados>();

  constructor(private readonly modules: ModulesContainer) {}

  /** Raiz do repositório (onde estão docker-compose.yml e packages/). */
  raiz(): string {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      if (existsSync(join(dir, "docker-compose.yml")) && existsSync(join(dir, "packages")))
        return dir;
      const pai = resolve(dir, "..");
      if (pai === dir) break;
      dir = pai;
    }
    return resolve(process.cwd(), "../..");
  }

  private modelos(): { nome: string; chave: string }[] {
    return Prisma.dmmf.datamodel.models.map((m) => ({ nome: m.name, chave: lowerFirst(m.name) }));
  }

  /* ───────────── Rotas ───────────── */

  rotas(): RotaDoc[] {
    if (this.cacheRotas && Date.now() - this.cacheRotas.em < 5 * 60_000)
      return this.cacheRotas.dados;
    const catalogo = new Map(
      ENDPOINT_CATALOG.map((e) => [`${e.method.toUpperCase()} ${normaliza(e.pathPattern)}`, e])
    );
    const modelos = this.modelos();
    const lista: RotaDoc[] = [];

    for (const modulo of this.modules.values()) {
      const nomeModulo = modulo.metatype?.name ?? "Modulo";
      for (const wrapper of modulo.controllers.values()) {
        const tipo = wrapper.metatype as (new (...a: never[]) => unknown) | null;
        const instancia = wrapper.instance as Record<string, unknown> | undefined;
        if (!tipo || !instancia) continue;
        const prefixoRaw = Reflect.getMetadata(PATH_METADATA, tipo) as
          | string
          | string[]
          | undefined;
        const prefixo = Array.isArray(prefixoRaw) ? prefixoRaw[0] : (prefixoRaw ?? "");
        const guardasClasse = this.guardas(Reflect.getMetadata(GUARDS_METADATA, tipo));
        const rolesClasse = Reflect.getMetadata(ROLES_KEY, tipo) as string[] | undefined;
        const rhClasse = Reflect.getMetadata(RECURSO_RH_KEY, tipo) as string[] | undefined;

        for (const nome of Object.getOwnPropertyNames(tipo.prototype)) {
          if (nome === "constructor") continue;
          const fn = Object.getOwnPropertyDescriptor(tipo.prototype, nome)?.value as unknown;
          if (typeof fn !== "function") continue;
          const codigoMetodo = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
          if (codigoMetodo === undefined) continue;
          const caminhoRaw = Reflect.getMetadata(PATH_METADATA, fn) as
            | string
            | string[]
            | undefined;
          const caminho = normaliza(
            "api",
            prefixo,
            (Array.isArray(caminhoRaw) ? caminhoRaw[0] : caminhoRaw) === "/"
              ? ""
              : String((Array.isArray(caminhoRaw) ? caminhoRaw[0] : caminhoRaw) ?? "")
          );
          const metodo = METODOS[codigoMetodo] ?? "GET";
          const guardas = [
            ...new Set([
              ...guardasClasse,
              ...this.guardas(Reflect.getMetadata(GUARDS_METADATA, fn))
            ])
          ];
          const papeis =
            (Reflect.getMetadata(ROLES_KEY, fn) as string[] | undefined) ?? rolesClasse ?? [];
          const recursosRh =
            (Reflect.getMetadata(RECURSO_RH_KEY, fn) as string[] | undefined) ?? rhClasse ?? [];
          const autenticada = guardas.some((g) => g.startsWith("AuthGuard"));
          const acesso: RotaDoc["acesso"] = !autenticada
            ? "publico"
            : papeis.length
              ? "papeis"
              : "autenticado";

          const caminhoSemApi = caminho.replace(/^\/api/, "") || "/";
          const cat = catalogo.get(`${metodo} ${caminhoSemApi}`);
          const analise = this.analisar(instancia, nome, modelos);

          const tiposParam = (Reflect.getMetadata("design:paramtypes", tipo.prototype, nome) ??
            []) as { name?: string }[];
          const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, tipo, nome) ?? {}) as Record<
            string,
            { index: number; data?: string }
          >;
          const parametros = Object.entries(args)
            .map(([chave, v]) => ({
              origem: TIPO_PARAM[Number(chave.split(":")[0])] ?? "outro",
              nome: typeof v.data === "string" ? v.data : null,
              tipo: tiposParam[v.index]?.name ?? null,
              indice: v.index
            }))
            .filter((p) => p.origem !== "outro")
            .sort((a, b) => a.indice - b.indice)
            .map(({ origem, nome: n, tipo: t }) => ({ origem, nome: n, tipo: t }));

          lista.push({
            id: `${metodo} ${caminho}`,
            metodo,
            caminho,
            controlador: tipo.name,
            modulo: nomeModulo,
            funcao: nome,
            titulo: cat?.titulo ?? null,
            descricao: cat?.descricao ?? null,
            categoria: cat?.categoria ?? null,
            acesso,
            papeis,
            recursosRh,
            guardas,
            parametros,
            statusHttp: (Reflect.getMetadata(HTTP_CODE_METADATA, fn) as number | undefined) ?? null,
            tabelasLeitura: [...analise.leitura].sort(),
            tabelasEscrita: [...analise.escrita].sort(),
            consultas: [...analise.consultas].sort(),
            sqlCru: analise.sqlCru
          });
        }
      }
    }
    lista.sort((a, b) => a.caminho.localeCompare(b.caminho) || a.metodo.localeCompare(b.metodo));
    this.cacheRotas = { em: Date.now(), dados: lista };
    return lista;
  }

  private guardas(valor: unknown): string[] {
    if (!Array.isArray(valor)) return [];
    return valor.map((g) => {
      const alvo = g as { name?: string; prototype?: Record<string, unknown> };
      // AuthGuard("jwt") gera uma classe com nome aleatório: reconhecida pelos métodos do passport.
      if (
        typeof alvo?.prototype?.handleRequest === "function" &&
        typeof alvo.prototype.logIn === "function"
      )
        return "AuthGuard(jwt)";
      return alvo?.name ?? "Guard";
    });
  }

  /* ─ Análise de código (reflexão sobre o JS compilado: funciona em dev e em produção) ─ */

  private analisar(
    dono: Record<string, unknown>,
    metodo: string,
    modelos: { nome: string; chave: string }[]
  ): AnaliseDados {
    const vazio = (): AnaliseDados => ({
      leitura: new Set(),
      escrita: new Set(),
      consultas: new Set(),
      sqlCru: false
    });
    const total = vazio();
    const visitados = new Set<string>();
    const nomesModelo = new Map(modelos.map((m) => [m.chave, m.nome]));
    const nomesTabela = new Set(modelos.map((m) => m.nome));

    const visita = (obj: Record<string, unknown>, nomeMetodo: string, prof: number) => {
      const proto = Object.getPrototypeOf(obj) as Record<string, unknown> | null;
      const fn = proto?.[nomeMetodo];
      if (typeof fn !== "function") return;
      const id = `${proto?.constructor?.name}.${nomeMetodo}`;
      if (visitados.has(id)) return;
      visitados.add(id);
      const fonte = Function.prototype.toString.call(fn);
      let a = this.cacheAnalise.get(id);
      if (!a) {
        a = vazio();
        for (const m of fonte.matchAll(
          /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\.(\w+)\.(\w+)\(/g
        )) {
          const modelo = nomesModelo.get(m[2]);
          if (!modelo) continue;
          if (OPS_LEITURA.has(m[3])) a.leitura.add(modelo);
          else if (OPS_ESCRITA.has(m[3])) a.escrita.add(modelo);
          else continue;
          a.consultas.add(`${modelo}.${m[3]}`);
        }
        if (/\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)/.test(fonte)) {
          a.sqlCru = true;
          for (const m of fonte.matchAll(/\b(FROM|JOIN|INTO|UPDATE)\s+"?([A-Za-z_]\w*)"?/g)) {
            if (!nomesTabela.has(m[2])) continue;
            (m[1] === "FROM" || m[1] === "JOIN" ? a.leitura : a.escrita).add(m[2]);
            a.consultas.add(`SQL ${m[1]} ${m[2]}`);
          }
        }
        this.cacheAnalise.set(id, a);
      }
      for (const x of a.leitura) total.leitura.add(x);
      for (const x of a.escrita) total.escrita.add(x);
      for (const x of a.consultas) total.consultas.add(x);
      total.sqlCru ||= a.sqlCru;
      if (prof >= 3) return;
      for (const m of fonte.matchAll(/\bthis\.(\w+)\.(\w+)\(/g)) {
        const alvo = obj[m[1]];
        if (alvo && typeof alvo === "object")
          visita(alvo as Record<string, unknown>, m[2], prof + 1);
      }
      for (const m of fonte.matchAll(/\bthis\.(\w+)\(/g)) visita(obj, m[1], prof + 1);
    };
    visita(dono, metodo, 0);
    return total;
  }

  /* ───────────── Rotinas agendadas ───────────── */

  jobs(): JobDoc[] {
    const lista: JobDoc[] = [];
    for (const modulo of this.modules.values()) {
      for (const wrapper of modulo.providers.values()) {
        const tipo = wrapper.metatype as (new (...a: never[]) => unknown) | null;
        if (!tipo?.prototype || typeof tipo !== "function") continue;
        for (const nome of Object.getOwnPropertyNames(tipo.prototype)) {
          const fn = Object.getOwnPropertyDescriptor(tipo.prototype, nome)?.value as unknown;
          if (typeof fn !== "function") continue;
          const op = Reflect.getMetadata(CRON_OPTIONS, fn) as
            | { cronTime?: string; timeZone?: string }
            | undefined;
          if (!op?.cronTime) continue;
          lista.push({
            classe: tipo.name,
            metodo: nome,
            nome: (Reflect.getMetadata(SCHEDULER_NAME, fn) as string | undefined) ?? null,
            agenda: String(op.cronTime),
            fusoHorario: op.timeZone ?? null
          });
        }
      }
    }
    return lista.sort(
      (a, b) => a.classe.localeCompare(b.classe) || a.metodo.localeCompare(b.metodo)
    );
  }

  /* ───────────── Stack ───────────── */

  stack() {
    const raiz = this.raiz();
    const lerPkg = (caminho: string) => {
      try {
        return JSON.parse(readFileSync(caminho, "utf8")) as {
          name?: string;
          version?: string;
          engines?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
      } catch {
        return null;
      }
    };
    const instalada = (pacote: string) =>
      lerPkg(join(raiz, "node_modules", pacote, "package.json"))?.version ?? null;
    const pacotes = ["backend", "web", "shared"]
      .map((p) => ({ dir: p, pkg: lerPkg(join(raiz, "packages", p, "package.json")) }))
      .filter((x) => x.pkg)
      .map(({ dir, pkg }) => ({
        pacote: pkg?.name ?? dir,
        versao: pkg?.version ?? null,
        dependencias: Object.entries(pkg?.dependencies ?? {})
          .map(([nome, faixa]) => ({ nome, faixa, instalada: instalada(nome) }))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
        desenvolvimento: Object.entries(pkg?.devDependencies ?? {})
          .map(([nome, faixa]) => ({ nome, faixa, instalada: instalada(nome) }))
          .sort((a, b) => a.nome.localeCompare(b.nome))
      }));
    const raizPkg = lerPkg(join(raiz, "package.json"));
    return {
      node: process.version,
      sistema: raizPkg?.version ?? null,
      engines: raizPkg?.engines ?? {},
      prisma: Prisma.prismaVersion?.client ?? null,
      pacotes,
      servicos: this.compose(raiz)
    };
  }

  /** Lê o docker-compose.yml sem expor `environment` (só estrutura). */
  private compose(raiz: string) {
    let texto = "";
    try {
      texto = readFileSync(join(raiz, "docker-compose.yml"), "utf8");
    } catch {
      return [];
    }
    const servicos: {
      nome: string;
      imagem: string | null;
      construido: boolean;
      portas: string[];
      expoe: string[];
      volumes: string[];
      dependeDe: string[];
      perfis: string[];
    }[] = [];
    const linhas = texto.replace(/\r/g, "").split("\n");
    let dentro = false;
    let atual: (typeof servicos)[number] | null = null;
    let chave: string | null = null;
    for (const linha of linhas) {
      if (/^services:/.test(linha)) {
        dentro = true;
        continue;
      }
      if (dentro && /^\S/.test(linha)) break;
      if (!dentro) continue;
      const s = /^ {2}([\w-]+):\s*$/.exec(linha);
      if (s) {
        atual = {
          nome: s[1],
          imagem: null,
          construido: false,
          portas: [],
          expoe: [],
          volumes: [],
          dependeDe: [],
          perfis: []
        };
        servicos.push(atual);
        chave = null;
        continue;
      }
      if (!atual) continue;
      const k = /^ {4}([\w-]+):\s*(.*)$/.exec(linha);
      if (k) {
        chave = k[1];
        const v = k[2].replace(/^["']|["']$/g, "");
        if (chave === "image") atual.imagem = v;
        if (chave === "build") atual.construido = true;
        continue;
      }
      const item = /^ {6}-\s*(.+?)\s*$/.exec(linha);
      if (item && chave) {
        const v = item[1].replace(/^["']|["']$/g, "");
        if (chave === "ports") atual.portas.push(v);
        else if (chave === "expose") atual.expoe.push(v);
        else if (chave === "volumes") atual.volumes.push(v.replace(/:ro$/, " (somente leitura)"));
        else if (chave === "profiles") atual.perfis.push(v);
        else if (chave === "depends_on") atual.dependeDe.push(v);
        continue;
      }
      const dep = /^ {6}([\w-]+):\s*$/.exec(linha);
      if (dep && chave === "depends_on") atual.dependeDe.push(dep[1]);
    }
    return servicos;
  }

  /* ───────────── Variáveis de ambiente (só nomes) ───────────── */

  ambiente(descricoes: Record<string, { funcao: string; obrigatoria?: boolean }>) {
    const raiz = this.raiz();
    const achados = new Map<string, Set<string>>();
    const varre = (dir: string) => {
      let nomes: string[] = [];
      try {
        nomes = readdirSync(dir);
      } catch {
        return;
      }
      for (const n of nomes) {
        const p = join(dir, n);
        let st;
        try {
          st = statSync(p);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          if (n !== "node_modules" && n !== "dist") varre(p);
        } else if (/\.(ts|tsx)$/.test(n) && !/\.spec\./.test(n)) {
          const txt = readFileSync(p, "utf8");
          for (const m of txt.matchAll(
            /(?:process\.env\.|import\.meta\.env\.|(?:config|configService)\??\.(?:get|getOrThrow)(?:<[^>]*>)?\(\s*["'])([A-Z][A-Z0-9_]{2,})/g
          )) {
            if (["DEV", "PROD", "MODE", "SSR", "BASE_URL"].includes(m[1])) continue;
            const set = achados.get(m[1]) ?? new Set<string>();
            set.add(
              p
                .replace(raiz + "/", "")
                .split("/")
                .slice(1, 4)
                .join("/")
            );
            achados.set(m[1], set);
          }
        }
      }
    };
    varre(join(raiz, "packages", "backend", "src"));
    varre(join(raiz, "packages", "web", "src"));
    return [...achados.entries()]
      .map(([nome, usos]) => ({
        nome,
        usadaEm: [...usos].sort().slice(0, 4),
        funcao: descricoes[nome]?.funcao ?? null,
        obrigatoria: descricoes[nome]?.obrigatoria ?? null
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }
}

interface AnaliseDados {
  leitura: Set<string>;
  escrita: Set<string>;
  consultas: Set<string>;
  sqlCru: boolean;
}

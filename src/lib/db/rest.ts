import "server-only";

import { asRole, asSystem, getEngine, type Engine, type RequestRole, type Row, type Tx } from "./engine";

/**
 * supabase-js'in PostgREST'e gönderdiği isteklerin uygulamada kullanılan alt
 * kümesini SQL'e çevirir: select (iç içe ilişkiler ve `count` dahil), filtreler
 * (eq, neq, gt, gte, lt, lte, like, ilike, is, in, not, or), order, limit,
 * offset, insert, upsert, update, delete. Tablo ve kolon adları katalogdan
 * doğrulanır; değerler her zaman parametre olarak geçer. Satır erişimini
 * Postgres RLS belirler.
 */

type Catalog = {
  columns: Map<string, Map<string, string>>;
  primaryKeys: Map<string, string[]>;
  foreignKeys: { table: string; columns: string[]; refTable: string; refColumns: string[] }[];
};

export class RestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: string | null = null,
    public hint: string | null = null,
  ) {
    super(message);
  }
}

const catalogs = new WeakMap<Engine, Promise<Catalog>>();

async function loadCatalog(): Promise<Catalog> {
  const engine = await getEngine();
  let catalog = catalogs.get(engine);
  if (!catalog) {
    catalog = asSystem(async (tx) => {
      const columns = await tx.query<{ rel: string; col: string; type: string }>(
        `select c.relname as rel, a.attname as col, a.atttypid::regtype::text as type
           from pg_attribute a
           join pg_class c on c.oid = a.attrelid
          where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
            and a.attnum > 0 and not a.attisdropped`,
      );
      const keys = await tx.query<{ rel: string; type: string; cols: string[]; ref: string | null; refcols: string[] | null }>(
        `select c.conrelid::regclass::text as rel, c.contype::text as type,
                array(select attname::text from unnest(c.conkey) with ordinality k(n, o)
                        join pg_attribute on attrelid = c.conrelid and attnum = k.n order by k.o) as cols,
                c.confrelid::regclass::text as ref,
                array(select attname::text from unnest(c.confkey) with ordinality k(n, o)
                        join pg_attribute on attrelid = c.confrelid and attnum = k.n order by k.o) as refcols
           from pg_constraint c
          where c.connamespace = 'public'::regnamespace and c.contype in ('p', 'f')`,
      );

      const result: Catalog = { columns: new Map(), primaryKeys: new Map(), foreignKeys: [] };
      for (const { rel, col, type } of columns.rows) {
        if (!result.columns.has(rel)) result.columns.set(rel, new Map());
        result.columns.get(rel)!.set(col, type);
      }
      for (const key of keys.rows) {
        if (key.type === "p") result.primaryKeys.set(key.rel, key.cols);
        else if (key.ref) {
          result.foreignKeys.push({ table: key.rel, columns: key.cols, refTable: key.ref, refColumns: key.refcols ?? [] });
        }
      }
      return result;
    });
    catalogs.set(engine, catalog);
    catalog.catch(() => catalogs.delete(engine));
  }
  return catalog;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

function quote(ident: string): string {
  if (!IDENT.test(ident)) throw new RestError(400, "PGRST100", `Geçersiz ad: ${ident}`);
  return `"${ident}"`;
}

function columnType(catalog: Catalog, table: string, column: string): string {
  const type = catalog.columns.get(table)?.get(column);
  if (!type) throw new RestError(400, "42703", `column ${table}.${column} does not exist`);
  return type;
}

function requireRelation(catalog: Catalog, table: string) {
  if (!IDENT.test(table) || !catalog.columns.has(table)) {
    throw new RestError(404, "42P01", `relation "public.${table}" does not exist`);
  }
}

// ---------------------------------------------------------------------------
// select ayrıştırma
// ---------------------------------------------------------------------------

type SelectNode =
  | { kind: "star" }
  | { kind: "count" }
  | { kind: "column"; name: string; alias: string }
  | { kind: "embed"; relation: string; alias: string; children: SelectNode[] };

function splitTopLevel(input: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const char of input) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "(") depth++;
    if (!quoted && char === ")") depth--;
    if (!quoted && depth === 0 && char === separator) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (depth !== 0 || quoted) throw new RestError(400, "PGRST100", "Ayrıştırılamayan ifade");
  parts.push(current);
  return parts;
}

function parseSelect(input: string): SelectNode[] {
  return splitTopLevel(input.trim() || "*")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): SelectNode => {
      if (part === "*") return { kind: "star" };
      if (part === "count") return { kind: "count" };
      const embed = /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(?:!inner)?\(([\s\S]*)\)$/.exec(part);
      if (embed) {
        return { kind: "embed", relation: embed[2], alias: embed[1] ?? embed[2], children: parseSelect(embed[3]) };
      }
      const column = /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)$/.exec(part);
      if (column) return { kind: "column", name: column[2], alias: column[1] ?? column[2] };
      throw new RestError(400, "PGRST100", `Desteklenmeyen select ifadesi: ${part}`);
    });
}

type Builder = { catalog: Catalog; params: unknown[]; aliasCounter: number };

function param(builder: Builder, value: unknown): string {
  builder.params.push(value);
  return `$${builder.params.length}`;
}

function jsonObject(pairs: string[]): string {
  if (pairs.length === 0) return "'{}'::jsonb";
  // jsonb_build_object en fazla 100 argüman alır.
  const chunks: string[] = [];
  for (let i = 0; i < pairs.length; i += 40) {
    chunks.push(`jsonb_build_object(${pairs.slice(i, i + 40).join(", ")})`);
  }
  return chunks.join(" || ");
}

function objectSql(builder: Builder, table: string, alias: string, nodes: SelectNode[]): string {
  const pairs: string[] = [];
  let star = false;

  for (const node of nodes) {
    if (node.kind === "star") star = true;
    else if (node.kind === "count") throw new RestError(400, "PGRST100", "count yalnızca ilişki içinde kullanılabilir");
    else if (node.kind === "column") {
      columnType(builder.catalog, table, node.name);
      pairs.push(`'${node.alias}', ${alias}.${quote(node.name)}`);
    } else {
      pairs.push(`'${node.alias}', ${embedSql(builder, table, alias, node)}`);
    }
  }

  const object = jsonObject(pairs);
  return star ? `(to_jsonb(${alias}) || ${object})` : object;
}

function embedSql(
  builder: Builder,
  parentTable: string,
  parentAlias: string,
  node: Extract<SelectNode, { kind: "embed" }>,
): string {
  const { catalog } = builder;
  requireRelation(catalog, node.relation);

  const manyToOne = catalog.foreignKeys.filter((fk) => fk.table === parentTable && fk.refTable === node.relation);
  const oneToMany = catalog.foreignKeys.filter((fk) => fk.table === node.relation && fk.refTable === parentTable);
  if (manyToOne.length + oneToMany.length !== 1) {
    throw new RestError(
      400,
      manyToOne.length + oneToMany.length === 0 ? "PGRST200" : "PGRST201",
      `'${parentTable}' ile '${node.relation}' arasında tek bir ilişki bulunamadı`,
    );
  }

  const alias = `t${++builder.aliasCounter}`;
  const from = `public.${quote(node.relation)} ${alias}`;

  if (manyToOne.length === 1) {
    const fk = manyToOne[0];
    const where = fk.columns
      .map((column, i) => `${alias}.${quote(fk.refColumns[i])} = ${parentAlias}.${quote(column)}`)
      .join(" and ");
    return `(select ${objectSql(builder, node.relation, alias, node.children)} from ${from} where ${where} limit 1)`;
  }

  const fk = oneToMany[0];
  const where = fk.columns
    .map((column, i) => `${alias}.${quote(column)} = ${parentAlias}.${quote(fk.refColumns[i])}`)
    .join(" and ");

  if (node.children.length === 1 && node.children[0].kind === "count") {
    return `(select jsonb_build_array(jsonb_build_object('count', count(*))) from ${from} where ${where})`;
  }
  return `(select coalesce(jsonb_agg(${objectSql(builder, node.relation, alias, node.children)}), '[]'::jsonb) from ${from} where ${where})`;
}

// ---------------------------------------------------------------------------
// filtreler
// ---------------------------------------------------------------------------

const OPERATORS: Record<string, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "like",
  ilike: "ilike",
};

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function parseList(raw: string): string[] {
  if (!raw.startsWith("(") || !raw.endsWith(")")) {
    throw new RestError(400, "PGRST100", "in listesi parantez içinde olmalı");
  }
  const inner = raw.slice(1, -1);
  if (inner === "") return [];
  return splitTopLevel(inner).map((value) => {
    const trimmed = value.trim();
    return trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1).replace(/\\(.)/g, "$1")
      : trimmed;
  });
}

function conditionSql(builder: Builder, table: string, alias: string, column: string, expression: string): string {
  const type = columnType(builder.catalog, table, column);
  const target = `${alias}.${quote(column)}`;

  let negate = false;
  let rest = expression;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }

  const dot = rest.indexOf(".");
  if (dot === -1) throw new RestError(400, "PGRST100", `Geçersiz filtre: ${column}=${expression}`);
  const operator = rest.slice(0, dot);
  const value = rest.slice(dot + 1);

  let sql: string;
  if (operator === "is") {
    const literal = { null: "null", true: "true", false: "false", unknown: "unknown" }[value.toLowerCase()];
    if (!literal) throw new RestError(400, "PGRST100", `is için geçersiz değer: ${value}`);
    sql = `${target} is ${literal}`;
  } else if (operator === "in") {
    const values = parseList(value);
    sql = values.length === 0
      ? "false"
      : `${target} in (${values.map((v) => `${param(builder, v)}::text::${type}`).join(", ")})`;
  } else if (operator === "like" || operator === "ilike") {
    sql = `${target}::text ${OPERATORS[operator]} ${param(builder, value.replaceAll("*", "%"))}::text`;
  } else if (OPERATORS[operator]) {
    sql = `${target} ${OPERATORS[operator]} ${param(builder, value)}::text::${type}`;
  } else {
    throw new RestError(400, "PGRST100", `Desteklenmeyen operatör: ${operator}`);
  }

  return negate ? `not (${sql})` : sql;
}

function logicalSql(builder: Builder, table: string, alias: string, joiner: "or" | "and", raw: string): string {
  const parts = parseListRaw(raw).map((part) => {
    const nested = /^(not\.)?(or|and)(\([\s\S]*\))$/.exec(part);
    if (nested) {
      const sql = logicalSql(builder, table, alias, nested[2] as "or" | "and", nested[3]);
      return nested[1] ? `not ${sql}` : sql;
    }
    const dot = part.indexOf(".");
    if (dot === -1) throw new RestError(400, "PGRST100", `Geçersiz filtre: ${part}`);
    return conditionSql(builder, table, alias, part.slice(0, dot), part.slice(dot + 1));
  });
  return parts.length === 0 ? "true" : `(${parts.join(` ${joiner} `)})`;
}

function parseListRaw(raw: string): string[] {
  if (!raw.startsWith("(") || !raw.endsWith(")")) throw new RestError(400, "PGRST100", "Mantıksal filtre parantez içinde olmalı");
  return splitTopLevel(raw.slice(1, -1)).map((part) => part.trim()).filter(Boolean);
}

function whereSql(builder: Builder, table: string, alias: string, search: URLSearchParams): string {
  const conditions: string[] = [];
  for (const [key, value] of search) {
    if (RESERVED_PARAMS.has(key)) continue;
    if (key === "or" || key === "and") conditions.push(logicalSql(builder, table, alias, key, value));
    else if (key === "not.or" || key === "not.and") {
      conditions.push(`not ${logicalSql(builder, table, alias, key.slice(4) as "or" | "and", value)}`);
    } else conditions.push(conditionSql(builder, table, alias, key, value));
  }
  return conditions.length ? `where ${conditions.join(" and ")}` : "";
}

function orderSql(builder: Builder, table: string, alias: string, raw: string | null): string {
  if (!raw) return "";
  const terms = raw.split(",").map((term) => {
    const [column, ...modifiers] = term.split(".");
    columnType(builder.catalog, table, column);
    let sql = `${alias}.${quote(column)}`;
    for (const modifier of modifiers) {
      if (modifier === "asc" || modifier === "desc") sql += ` ${modifier}`;
      else if (modifier === "nullsfirst") sql += " nulls first";
      else if (modifier === "nullslast") sql += " nulls last";
      else throw new RestError(400, "PGRST100", `Geçersiz sıralama: ${term}`);
    }
    return sql;
  });
  return `order by ${terms.join(", ")}`;
}

function limitSql(search: URLSearchParams): string {
  const limit = search.get("limit");
  const offset = search.get("offset");
  let sql = "";
  if (limit !== null) {
    if (!/^\d+$/.test(limit)) throw new RestError(400, "PGRST100", "Geçersiz limit");
    sql += ` limit ${limit}`;
  }
  if (offset !== null) {
    if (!/^\d+$/.test(offset)) throw new RestError(400, "PGRST100", "Geçersiz offset");
    sql += ` offset ${offset}`;
  }
  return sql;
}

// ---------------------------------------------------------------------------
// istek işleme
// ---------------------------------------------------------------------------

export type RestRequest = {
  method: string;
  table: string;
  search: URLSearchParams;
  headers: Headers;
  body: unknown;
  role: RequestRole;
  claims: Row;
};

export type RestResponse = { status: number; body: string | null; headers: Record<string, string> };

function preferences(headers: Headers) {
  const prefer = headers.get("prefer") ?? "";
  return {
    representation: prefer.includes("return=representation"),
    count: /count=(exact|planned|estimated)/.test(prefer),
    ignoreDuplicates: prefer.includes("resolution=ignore-duplicates"),
    mergeDuplicates: prefer.includes("resolution=merge-duplicates"),
  };
}

async function readJson(tx: Tx, sql: string, params: unknown[]): Promise<{ body: string; count: number }> {
  const { rows } = await tx.query<{ body: string; n: number | string }>(sql, params);
  return { body: rows[0]?.body ?? "[]", count: Number(rows[0]?.n ?? 0) };
}

function writeColumns(catalog: Catalog, table: string, rows: Row[], explicit: string | null): string[] {
  const columns = explicit
    ? explicit.split(",").map((c) => c.replace(/^"|"$/g, ""))
    : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  for (const column of columns) columnType(catalog, table, column);
  return columns;
}

export async function handleRest(request: RestRequest): Promise<RestResponse> {
  const catalog = await loadCatalog();
  const { method, table, search, headers } = request;
  requireRelation(catalog, table);

  const builder: Builder = { catalog, params: [], aliasCounter: 0 };
  const prefer = preferences(headers);
  const select = parseSelect(search.get("select") ?? "*");
  const relation = `public.${quote(table)}`;

  const result = await asRole(request.role, request.claims, async (tx) => {
    if (method === "GET" || method === "HEAD") {
      const where = whereSql(builder, table, "t0", search);
      const order = orderSql(builder, table, "t0", search.get("order"));
      const object = objectSql(builder, table, "t0", select);
      const query = `select ${object} as o from ${relation} t0 ${where} ${order}${limitSql(search)}`;
      const data = method === "HEAD"
        ? { body: "[]", count: 0 }
        : await readJson(tx, `select coalesce(jsonb_agg(q.o), '[]'::jsonb)::text as body, count(*) as n from (${query}) q`, builder.params);
      // Okuma sorgusundaki tek parametre kaynağı WHERE; sayım aynı parametreleri kullanır.
      const total = prefer.count
        ? Number((await tx.query<{ n: string }>(`select count(*) as n from ${relation} t0 ${where}`, builder.params)).rows[0].n)
        : null;
      return { ...data, total, status: 200 };
    }

    if (method === "POST") {
      const rows = (Array.isArray(request.body) ? request.body : [request.body]) as Row[];
      const columns = writeColumns(catalog, table, rows, search.get("columns"));
      const quoted = columns.map(quote).join(", ");
      const payload = param(builder, JSON.stringify(rows));

      let conflict = "";
      if (prefer.mergeDuplicates || prefer.ignoreDuplicates) {
        const target = search.get("on_conflict")?.split(",") ?? catalog.primaryKeys.get(table) ?? [];
        target.forEach((column) => columnType(catalog, table, column));
        const updates = columns.filter((c) => !target.includes(c)).map((c) => `${quote(c)} = excluded.${quote(c)}`);
        conflict = prefer.ignoreDuplicates || updates.length === 0
          ? `on conflict (${target.map(quote).join(", ")}) do nothing`
          : `on conflict (${target.map(quote).join(", ")}) do update set ${updates.join(", ")}`;
      }

      const object = objectSql(builder, table, "t0", select);
      const sql = `with t0 as (
          insert into ${relation} (${quoted})
          select ${quoted} from json_populate_recordset(null::${relation}, ${payload}::text::json)
          ${conflict}
          returning *
        ) select coalesce(jsonb_agg(${object}), '[]'::jsonb)::text as body, count(*) as n from t0`;
      return { ...(await readJson(tx, sql, builder.params)), total: null, status: 201 };
    }

    if (method === "PATCH") {
      const values = request.body as Row;
      const columns = writeColumns(catalog, table, [values], null);
      if (columns.length === 0) throw new RestError(400, "PGRST102", "Güncellenecek kolon yok");
      const payload = param(builder, JSON.stringify(values));
      const where = whereSql(builder, table, "u", search);
      const object = objectSql(builder, table, "t0", select);
      const sql = `with t0 as (
          update ${relation} u set ${columns.map((c) => `${quote(c)} = v.${quote(c)}`).join(", ")}
          from json_populate_record(null::${relation}, ${payload}::text::json) v
          ${where}
          returning u.*
        ) select coalesce(jsonb_agg(${object}), '[]'::jsonb)::text as body, count(*) as n from t0`;
      return { ...(await readJson(tx, sql, builder.params)), total: null, status: 200 };
    }

    if (method === "DELETE") {
      const where = whereSql(builder, table, "u", search);
      const object = objectSql(builder, table, "t0", select);
      const sql = `with t0 as (delete from ${relation} u ${where} returning u.*)
        select coalesce(jsonb_agg(${object}), '[]'::jsonb)::text as body, count(*) as n from t0`;
      return { ...(await readJson(tx, sql, builder.params)), total: null, status: 200 };
    }

    throw new RestError(405, "PGRST117", `Desteklenmeyen yöntem: ${method}`);
  });

  const responseHeaders: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (result.total !== null) {
    responseHeaders["content-range"] = `${result.count ? `0-${result.count - 1}` : "*"}/${result.total}`;
  }

  if (method === "HEAD") return { status: 200, body: null, headers: responseHeaders };

  const isRead = method === "GET";
  if (!isRead && !prefer.representation) {
    return { status: method === "POST" ? 201 : 204, body: null, headers: responseHeaders };
  }

  if (headers.get("accept")?.includes("application/vnd.pgrst.object+json")) {
    const rows = JSON.parse(result.body) as unknown[];
    if (rows.length !== 1) {
      throw new RestError(
        406,
        "PGRST116",
        "JSON object requested, multiple (or no) rows returned",
        `The result contains ${rows.length} rows`,
      );
    }
    return { status: result.status, body: JSON.stringify(rows[0]), headers: responseHeaders };
  }

  return { status: result.status, body: result.body, headers: responseHeaders };
}

const PG_STATUS: Record<string, number> = {
  "23505": 409,
  "23503": 409,
  "23514": 400,
  "23502": 400,
  "22P02": 400,
  "22023": 400,
  "P0001": 400,
  "42501": 403,
  "42P01": 404,
  "42703": 400,
};

/** Postgres hatasını PostgREST'in hata gövdesine çevirir. */
export function restErrorResponse(error: unknown, role: RequestRole): RestResponse {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (error instanceof RestError) {
    return {
      status: error.status,
      headers,
      body: JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }),
    };
  }

  const pg = error as { code?: string; message?: string; detail?: string; hint?: string };
  if (typeof pg?.code === "string" && /^[0-9A-Z]{5}$/.test(pg.code)) {
    let status = PG_STATUS[pg.code] ?? (pg.code.startsWith("22") || pg.code.startsWith("23") ? 400 : 500);
    if (pg.code === "42501" && role === "anon") status = 401;
    return {
      status,
      headers,
      body: JSON.stringify({ code: pg.code, message: pg.message ?? "", details: pg.detail ?? null, hint: pg.hint ?? null }),
    };
  }

  console.error("Veritabanı isteği işlenemedi:", error);
  return { status: 500, headers, body: JSON.stringify({ code: "PGRST000", message: "Beklenmeyen hata", details: null, hint: null }) };
}

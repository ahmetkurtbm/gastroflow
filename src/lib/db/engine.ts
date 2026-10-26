import "server-only";

import { compatSql, migrationNames, migrationSql, seedSql } from "./bootstrap";
import { isDemoMode } from "./mode";

export type Row = Record<string, unknown>;

export interface Tx {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Engine {
  /** Sorguları tek bir transaction içinde çalıştırır; hata olursa geri alır. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

// Demo verisi bu süreden sonra tohum hâline döner.
const DEMO_RESET_MS = 6 * 60 * 60 * 1000;

async function createPostgresEngine(connectionString: string): Promise<Engine> {
  const { Pool } = (await import("pg")).default;
  const pool = new Pool({ connectionString, max: 10 });

  return {
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({ query: (sql, params) => client.query(sql, params) as never });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function createDemoEngine(): Promise<Engine> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");

  const db = await PGlite.create({ extensions: { pgcrypto, citext } });
  await db.exec(compatSql());
  for (const name of migrationNames()) {
    await db.exec(migrationSql(name));
  }
  await db.exec(seedSql());

  return {
    transaction: (fn) => db.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) as never })),
  };
}

type EngineCache = { engine: Promise<Engine>; createdAt: number };
const globalCache = globalThis as { __gastroflowEngine?: EngineCache };

export function getEngine(): Promise<Engine> {
  const cached = globalCache.__gastroflowEngine;
  const demo = isDemoMode();
  if (cached && !(demo && Date.now() - cached.createdAt > DEMO_RESET_MS)) {
    return cached.engine;
  }

  const engine = demo ? createDemoEngine() : createPostgresEngine(process.env.DATABASE_URL!);
  globalCache.__gastroflowEngine = { engine, createdAt: Date.now() };
  engine.catch(() => {
    if (globalCache.__gastroflowEngine?.engine === engine) delete globalCache.__gastroflowEngine;
  });
  return engine;
}

export type RequestRole = "anon" | "authenticated" | "service_role";

/** RLS'in okuduğu rol ve JWT claim'leri transaction süresince ayarlanır. */
export async function asRole<T>(
  role: RequestRole,
  claims: Row,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const engine = await getEngine();
  return engine.transaction(async (tx) => {
    await tx.query(
      "select set_config('search_path', 'public, extensions', true), set_config('request.jwt.claims', $1, true), set_config('role', $2, true)",
      [JSON.stringify(claims), role],
    );
    return fn(tx);
  });
}

/** Yetki denetimi gerektirmeyen iç işler (kimlik doğrulama, katalog) için. */
export async function asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const engine = await getEngine();
  return engine.transaction(async (tx) => {
    await tx.query("select set_config('search_path', 'public, extensions', true)");
    return fn(tx);
  });
}

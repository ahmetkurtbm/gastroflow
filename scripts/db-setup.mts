// Yerel Postgres'i kurar: uyumluluk katmanı (db/compat.sql), bekleyen migration'lar
// ve (veritabanı boşsa) demo verisi.
//
//   npm run db:setup          eksik olanı uygular, var olan veriye dokunmaz
//   npm run db:setup -- --reset   şemaları silip baştan kurar

import pg from "pg";

import { compatSql, migrationNames, migrationSql, seedSql } from "../src/lib/db/bootstrap.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL tanımlı değil (.env.local ya da ortam değişkeni).");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const client = new pg.Client({ connectionString: url });
await client.connect();

async function exists(sql: string): Promise<boolean> {
  const { rows } = await client.query(sql);
  return rows.length > 0;
}

try {
  if (reset) {
    await client.query(`
      drop schema if exists public, auth, storage, cron, extensions, gastroflow_meta cascade;
      drop publication if exists supabase_realtime;
      create schema public;
      grant all on schema public to public;
    `);
    console.log("Şemalar silindi.");
  }

  if (!(await exists("select 1 from pg_namespace where nspname = 'auth'"))) {
    await client.query(compatSql());
    console.log("Uyumluluk katmanı kuruldu.");
  }

  await client.query(`
    create schema if not exists gastroflow_meta;
    create table if not exists gastroflow_meta.migrations (name text primary key, applied_at timestamptz not null default now());
  `);
  const { rows } = await client.query<{ name: string }>("select name from gastroflow_meta.migrations");
  const applied = new Set(rows.map((row) => row.name));

  for (const name of migrationNames()) {
    if (applied.has(name)) continue;
    await client.query("begin");
    try {
      await client.query(migrationSql(name));
      await client.query("insert into gastroflow_meta.migrations (name) values ($1)", [name]);
      await client.query("commit");
      console.log(`Migration uygulandı: ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`${name}: ${(error as Error).message}`);
    }
  }

  if (!(await exists("select 1 from public.tenants limit 1"))) {
    await client.query(seedSql());
    console.log("Demo verisi yüklendi. Giriş: patron@demo.gastroflow / demo1234");
  }

  console.log("Veritabanı hazır.");
} finally {
  await client.end();
}

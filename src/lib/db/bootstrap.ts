import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Bu modül hem uygulamadan hem `scripts/db-setup.ts`'ten yüklenir; yalnızca Node API'leri kullanır.

const DB_DIR = path.join(process.cwd(), "db");

function read(file: string): string {
  return readFileSync(path.join(DB_DIR, file), "utf8");
}

/** Migration'ların beklediği roller, auth/storage şemaları ve yardımcı fonksiyonlar. */
export function compatSql(): string {
  return read("compat.sql");
}

export function migrationNames(): string[] {
  return readdirSync(path.join(DB_DIR, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** pg_cron her kurulumda bulunmadığı için eklentiyi kurmaz; `cron.schedule` compat.sql'de tanımlı. */
export function migrationSql(name: string): string {
  return read(path.join("migrations", name)).replace(/create extension if not exists pg_cron;/i, "");
}

export function seedSql(): string {
  return read("seed.sql");
}

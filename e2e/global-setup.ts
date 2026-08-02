import { writeFile } from "node:fs/promises";
import path from "node:path";

process.loadEnvFile?.(".env.local");

import { adminClient, createTestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");

/**
 * Testler başlamadan önce iki bağımsız kiracı kurar: biri sipariş→ödeme
 * yaşam döngüsü senaryosu için, diğeri kiracı izolasyonu senaryosunun
 * "başka işletme" tarafı için. Kimlikler `.state.json`'a yazılır; testler
 * bunu okuyup giriş yapar. `global-teardown.ts` ikisini de siler.
 */
export default async function globalSetup() {
  const admin = adminClient();
  const [orderFlow, isolationOther] = await Promise.all([
    createTestTenant(admin, "order-flow"),
    createTestTenant(admin, "isolation-b"),
  ]);

  await writeFile(STATE_PATH, JSON.stringify({ orderFlow, isolationOther }, null, 2));
}

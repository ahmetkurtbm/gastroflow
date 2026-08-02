import { readFile, rm } from "node:fs/promises";
import path from "node:path";

process.loadEnvFile?.(".env.local");

import { adminClient, destroyTestTenant, type TestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");

export default async function globalTeardown() {
  const raw = await readFile(STATE_PATH, "utf8").catch(() => null);
  if (!raw) return;

  const state = JSON.parse(raw) as { orderFlow: TestTenant; isolationOther: TestTenant };
  const admin = adminClient();

  await Promise.all([
    destroyTestTenant(admin, state.orderFlow),
    destroyTestTenant(admin, state.isolationOther),
  ]);

  await rm(STATE_PATH, { force: true });
}

import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { login } from "./helpers";
import type { TestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");

async function readState() {
  const raw = await readFile(STATE_PATH, "utf8");
  return JSON.parse(raw) as { orderFlow: TestTenant; isolationOther: TestTenant };
}

// docs/HARITA.md §9, S-izolasyon senaryosuna karşılık gelir: bu, RLS'in
// pgTAP'ta zaten kanıtlanmış davranışının gerçek tarayıcıda ve gerçek HTTP
// isteğiyle de geçerli olduğunu doğrular — sunucu bileşeni/action katmanının
// yanlışlıkla tenant_id filtresi atlamadığından emin olmak için.
test("kiracı izolasyonu: bir işletmenin kullanıcısı diğerinin masasını salon ekranında göremez", async ({
  page,
}) => {
  const { orderFlow, isolationOther } = await readState();

  await login(page, orderFlow);
  await page.goto("/pos");
  await expect(page.getByText(orderFlow.tableName)).toBeVisible();
  await expect(page.getByText(isolationOther.tableName)).not.toBeVisible();

  await page.getByRole("button", { name: "Çıkış" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, isolationOther);
  await page.goto("/pos");
  await expect(page.getByText(isolationOther.tableName)).toBeVisible();
  await expect(page.getByText(orderFlow.tableName)).not.toBeVisible();
});

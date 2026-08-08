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

// docs/HARITA.md §9, S1 senaryosuna karşılık gelir: masa aç → ürün ekle →
// mutfağa gönder → kasada öde → adisyon kapanır.
test("adisyon: masa aç → ürün ekle → mutfağa gönder → öde → kapat", async ({ page }) => {
  const { orderFlow } = await readState();

  await login(page, orderFlow);

  await page.goto("/pos");
  await expect(page.getByText(orderFlow.tableName)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(orderFlow.tableName) }).click();

  await expect(page).toHaveURL(/\/pos\/masa\//);
  await page.getByRole("button", { name: "Test Ürün" }).click();

  // Önce iyimser (henüz senkronlanmamış) satır görünür, ardından sunucudan
  // gelen gerçek satır (durum: "Gönderilmedi") onu geçersiz kılar.
  await expect(page.getByText("Gönderilmedi")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Mutfağa gönder/ }).click();
  await expect(page.getByText("Mutfakta")).toBeVisible({ timeout: 10_000 });

  await page.goto("/cash");
  // `.first()` yerine masa adına göre seçiyoruz: offline-cold-start.spec.ts
  // aynı kiracıda ikinci bir masada ödenmemiş bir adisyon bırakıyor (bkz.
  // supabase-admin.ts secondaryTableName) — kasa listesinde ikisi de görünür.
  await page.getByRole("link", { name: new RegExp(orderFlow.tableName) }).click();

  await expect(page).toHaveURL(/\/cash\//);
  await page.getByRole("button", { name: "Tamamı" }).click();
  await page.getByLabel("Ödeme sonrası masayı kapat").check();
  await page.getByRole("button", { name: "Ödemeyi al" }).click();

  await expect(page.getByText("Bu adisyon tamamen ödendi ve kapatıldı.")).toBeVisible({
    timeout: 10_000,
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { login } from "./helpers";
import { adminClient, type TestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");

async function readState() {
  const raw = await readFile(STATE_PATH, "utf8");
  return JSON.parse(raw) as { orderFlow: TestTenant; isolationOther: TestTenant };
}

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Geri bildirim: mobil sayım ekranı tüm hammaddeleri tek dev formda
// gösteriyordu — telefonda pratik değildi, offline dayanıklılığı da yoktu.
// Bu test sayfa sayfa akışı (8'li gruplar, bkz. count-form.tsx PAGE_SIZE) ve
// her sayfanın gerçekten kaydedildiğini (stock_movements'a düştüğünü) uçtan
// uca kanıtlıyor.
test("mobil sayım: sayfa sayfa kaydedilir, her sayfa hareketleri ledger'a düşer", async ({
  page,
}) => {
  const { orderFlow } = await readState();
  const admin = adminClient();

  const { data: location } = await admin
    .from("stock_locations")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: "E2E Depo" })
    .select("id")
    .single();

  // Sıfır dolgulu numaralar: "E2E-Ham-01" regex'i "E2E-Ham-10"nun da alt
  // dizesi OLMASIN diye — aksi hâlde getByLabel iki etikete birden eşleşirdi.
  const itemNames = Array.from({ length: 10 }, (_, i) => `E2E-Ham-${String(i + 1).padStart(2, "0")}`);
  const { data: items } = await admin
    .from("inventory_items")
    .insert(
      itemNames.map((name) => ({
        tenant_id: orderFlow.tenantId,
        name,
        base_unit: "kg",
        cost_per_base_unit: 10,
      })),
    )
    .select("id, name")
    .order("name");

  await login(page, orderFlow);
  await page.goto(`/inventory/sayim?location=${location!.id}`);

  await expect(page.getByText("Sayfa 1 / 2")).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.getByLabel(new RegExp(itemNames[i])).fill(String(i + 1));
  }
  await page.getByRole("button", { name: "Kaydet ve ileri →" }).click();

  await expect(page.getByText("Sayfa 2 / 2")).toBeVisible({ timeout: 10_000 });
  for (let i = 8; i < 10; i++) {
    await page.getByLabel(new RegExp(itemNames[i])).fill(String(i + 1));
  }
  await page.getByRole("button", { name: "Sayımı bitir" }).click();

  await expect(page.getByText("Sayım tamamlandı, 2 sayfa kaydedildi.")).toBeVisible({
    timeout: 10_000,
  });

  // Sunucu tarafını da doğrula: her ürün için tam olarak bir count_adjustment
  // hareketi düşmüş olmalı. "Tamamlandı" mesajı senkron TAMAMLANMADAN önce
  // görünür (bkz. useOfflineCount — savePage kuyruğa atıp senkronu arka
  // planda başlatır, beklemez); bu yüzden burada bekleyerek doğruluyoruz.
  await expect
    .poll(
      async () => {
        const { count } = await admin
          .from("stock_movements")
          .select("id", { count: "exact", head: true })
          .eq("location_id", location!.id)
          .eq("movement_type", "count_adjustment");
        return count;
      },
      { timeout: 10_000 },
    )
    .toBe(items!.length);
});

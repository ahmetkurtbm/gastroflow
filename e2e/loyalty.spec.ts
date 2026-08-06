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

// Geri bildirim: rakiplerin çoğunda sadakat/puan sistemi vardı, bizde yoktu.
// Bu test iki adisyon üzerinden uçtan uca doğruluyor: (1) telefonla bağlanan
// bir müşteri tam ödeme yapınca 1 puan/10 TL oranında puan KAZANIYOR
// (`earnPointsForOrder`), (2) aynı müşteri sonraki adisyonda o puanları
// KULLANINCA toplam gerçekten düşüyor (`redeemPointsForOrder`) — ikisi de
// `v_customer_points` görünümünden (ledger toplamı) doğrulanıyor.
test("sadakat: ödeme puan kazandırır, sonraki adisyonda o puan indirim olarak kullanılabilir", async ({ page }) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();
  const phone = `5${String(suffix).slice(-9)}`;

  const itemName = `E2E-Sadakat-Urun-${suffix}`;
  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E Sadakat Kategori ${suffix}` })
    .select("id")
    .single();
  const { data: item } = await admin
    .from("menu_items")
    .insert({ tenant_id: orderFlow.tenantId, category_id: category!.id, name: itemName })
    .select("id")
    .single();
  await admin.from("menu_prices").insert({ tenant_id: orderFlow.tenantId, menu_item_id: item!.id, branch_id: null, price: 100 });

  // `tables.name` en fazla 30 karakter kabul ediyor (bkz. migration 0008) —
  // tam zaman damgası yerine kısaltılmış bir sonek kullanıyoruz.
  const shortSuffix = suffix.toString().slice(-8);
  const { data: tableA } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Sad-A-${shortSuffix}` })
    .select("id")
    .single();
  const { data: tableB } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Sad-B-${shortSuffix}` })
    .select("id")
    .single();

  await login(page, orderFlow);

  // --- Birinci adisyon: müşteriyi bağla, tam öde, puan KAZANsın. ---
  await page.goto(`/pos/masa/${tableA!.id}`);
  await page.getByRole("button", { name: "Adisyon aç" }).click();
  await page.getByRole("button", { name: new RegExp(itemName) }).click();
  await expect(page.getByText("Gönderilmedi")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Mutfağa gönder/ }).click();
  await expect(page.getByText("Mutfakta")).toBeVisible({ timeout: 10_000 });

  const { data: orderA } = await admin.from("orders").select("id").eq("table_id", tableA!.id).single();
  await page.goto(`/cash/${orderA!.id}`);
  await page.getByPlaceholder("Telefon (sadakat)").fill(phone);
  await page.getByRole("button", { name: "Bağla" }).click();
  await expect(page.getByText(phone)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Tamamı" }).click();
  await page.getByRole("button", { name: "Ödemeyi al" }).click();
  await expect(page.getByText("Bu adisyon tamamen ödendi ve kapatıldı.")).toBeVisible({ timeout: 10_000 });

  const { data: customer } = await admin.from("customers").select("id").eq("phone", phone).single();
  const { data: balanceAfterEarn } = await admin
    .from("v_customer_points")
    .select("balance")
    .eq("customer_id", customer!.id)
    .single();
  // 100 TL ödeme → 1 puan / 10 TL oranıyla 10 puan.
  expect(balanceAfterEarn!.balance).toBe(10);

  // --- İkinci adisyon: aynı müşteri, kazandığı puanı KULLANsın. ---
  await page.goto(`/pos/masa/${tableB!.id}`);
  await page.getByRole("button", { name: "Adisyon aç" }).click();
  await page.getByRole("button", { name: new RegExp(itemName) }).click();
  await expect(page.getByText("Gönderilmedi")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Mutfağa gönder/ }).click();
  await expect(page.getByText("Mutfakta")).toBeVisible({ timeout: 10_000 });

  const { data: orderB } = await admin.from("orders").select("id").eq("table_id", tableB!.id).single();
  await page.goto(`/cash/${orderB!.id}`);
  await page.getByPlaceholder("Telefon (sadakat)").fill(phone);
  await page.getByRole("button", { name: "Bağla" }).click();
  await expect(page.getByText("10 puan")).toBeVisible({ timeout: 10_000 });

  await page.getByPlaceholder("Puan").fill("10");
  await page.getByRole("button", { name: "Puan kullan" }).click();
  await expect(page.getByText("10 puan")).toBeVisible({ timeout: 10_000 });
  // 100 TL - 10 puan × 1 TL = 90 TL. İki kez görünür (Toplam + Kalan bakiye).
  await expect(page.getByText("₺90,00").first()).toBeVisible();

  const { data: balanceAfterRedeem } = await admin
    .from("v_customer_points")
    .select("balance")
    .eq("customer_id", customer!.id)
    .single();
  expect(balanceAfterRedeem!.balance).toBe(0);
});

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

// Geri bildirim: tutarı sıfırlanmış (tamamen ikram/indirimle karşılanmış)
// bir adisyon normal ödeme formundan ASLA kapanamıyordu — "amount" alanı
// sıfırdan büyük olmak zorunda, kasiyer hiçbir tutar giremiyordu. Bu test
// 0 TL'lik bir ürünle adisyon açıp "Adisyonu kapat (0 ₺)" butonunun
// göründüğünü ve gerçekten kapattığını kanıtlıyor.
test("0 TL adisyon: ödeme almadan 'Adisyonu kapat' ile kapanır", async ({ page }) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();

  const itemName = `E2E-Sifir-Urun-${suffix}`;
  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E Sifir Kategori ${suffix}` })
    .select("id")
    .single();
  const { data: item } = await admin
    .from("menu_items")
    .insert({ tenant_id: orderFlow.tenantId, category_id: category!.id, name: itemName })
    .select("id")
    .single();
  await admin.from("menu_prices").insert({ tenant_id: orderFlow.tenantId, menu_item_id: item!.id, branch_id: null, price: 0 });

  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Sifir-Masa-${suffix}` })
    .select("id")
    .single();

  await login(page, orderFlow);
  await page.goto(`/pos/masa/${table!.id}`);
  await page.getByRole("button", { name: "Adisyon aç" }).click();
  await page.getByRole("button", { name: new RegExp(itemName) }).click();
  await expect(page.getByText("Gönderilmedi")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Mutfağa gönder/ }).click();
  await expect(page.getByText("Mutfakta")).toBeVisible({ timeout: 10_000 });

  const { data: order } = await admin.from("orders").select("id").eq("table_id", table!.id).single();
  await page.goto(`/cash/${order!.id}`);

  await expect(page.getByText("Tahsil edilecek bir tutar yok")).toBeVisible();
  const closeButton = page.getByRole("button", { name: "Masayı/Adisyonu Kapat" });
  await expect(closeButton).toBeVisible();
  await closeButton.click();

  await expect(page.getByText("Bu adisyon tamamen ödendi ve kapatıldı.")).toBeVisible({ timeout: 10_000 });

  const { data: closedOrder } = await admin.from("orders").select("status").eq("id", order!.id).single();
  expect(closedOrder!.status).toBe("closed");
});

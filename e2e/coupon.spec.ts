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

// Geri bildirim: rakiplerin çoğunda kupon/kampanya indirim kodu vardı,
// bizde yoktu. Bu test /settings/kuponlar'dan gerçek arayüzden bir kupon
// oluşturup (%20 indirim), bir adisyonda ödeme ekranında kodu girip
// toplamın gerçekten indirimli tutara düştüğünü ve tahsil edilen tutarın da
// buna eşit olduğunu uçtan uca kanıtlıyor.
test("kupon: oluşturulur, ödeme ekranında uygulanınca toplam indirimli tutara düşer", async ({ page }) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();

  const itemName = `E2E-Kupon-Urun-${suffix}`;
  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E Kupon Kategori ${suffix}` })
    .select("id")
    .single();
  const { data: item } = await admin
    .from("menu_items")
    .insert({ tenant_id: orderFlow.tenantId, category_id: category!.id, name: itemName })
    .select("id")
    .single();
  await admin.from("menu_prices").insert({ tenant_id: orderFlow.tenantId, menu_item_id: item!.id, branch_id: null, price: 200 });

  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Kupon-Masa-${suffix}` })
    .select("id")
    .single();

  const couponCode = `E2EKUPON${suffix}`;

  await login(page, orderFlow);

  // Kuponu admin ekranından oluştur.
  await page.goto("/settings/kuponlar");
  await page.getByLabel("Kod (ör. YAZ2026)").fill(couponCode);
  await page.getByLabel("Tür").selectOption("percent");
  await page.getByLabel("Değer").fill("20");
  await page.getByRole("button", { name: "Kupon oluştur" }).click();
  await expect(page.getByText(couponCode)).toBeVisible({ timeout: 10_000 });

  // Adisyon aç, ürünü ekle, mutfağa gönder.
  await page.goto(`/pos/masa/${table!.id}`);
  await page.getByRole("button", { name: "Adisyon aç" }).click();
  await expect(page).toHaveURL(new RegExp(`/pos/masa/${table!.id}`));
  await page.getByRole("button", { name: new RegExp(itemName) }).click();
  await expect(page.getByText("Gönderilmedi")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Mutfağa gönder/ }).click();
  await expect(page.getByText("Mutfakta")).toBeVisible({ timeout: 10_000 });

  const { data: order } = await admin.from("orders").select("id").eq("table_id", table!.id).single();

  await page.goto(`/cash/${order!.id}`);
  await page.getByPlaceholder("Kupon kodu").fill(couponCode);
  await page.getByRole("button", { name: "Uygula" }).click();
  await expect(page.getByText(`Kupon ${couponCode}`, { exact: true })).toBeVisible({ timeout: 10_000 });

  // 200 TL'nin %20'si = 40 TL indirim → toplam 160 TL. İki kez görünür
  // (Toplam satırı + Kalan bakiye, henüz ödeme alınmadığı için ikisi eşit).
  await expect(page.getByText("₺160,00").first()).toBeVisible();

  await page.getByRole("button", { name: "Tamamı" }).click();
  await page.getByRole("button", { name: "Ödemeyi al" }).click();
  await expect(page.getByText("Bu adisyon tamamen ödendi ve kapatıldı.")).toBeVisible({ timeout: 10_000 });

  const { data: payments } = await admin.from("payments").select("amount").eq("order_id", order!.id);
  const totalPaid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  expect(totalPaid).toBe(160);

  const { data: redemption } = await admin
    .from("coupon_redemptions")
    .select("discount_amount")
    .eq("order_id", order!.id)
    .single();
  expect(Number(redemption!.discount_amount)).toBe(40);
});

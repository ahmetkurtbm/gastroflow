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

// Geri bildirim: "büyük menü = burger+patates+içecek tek fiyat" gibi paket
// ürünler yoktu — her ürün tekil satılıyordu. Bu test /recipes/kombo'da
// gerçek arayüzden bir kombo oluşturup (2 bileşen, kasıtlı olarak
// bileşenlerin toplamından DÜŞÜK bir kampanya fiyatıyla), POS'ta seçilince
// her bileşenin kombonun fiyatına ORANTILI (allocateProportional) bir
// birim fiyatla ayrı order_lines satırına dönüştüğünü uçtan uca kanıtlıyor.
test("kombo: oluşturulur, POS'ta seçilince bileşenlere orantılı fiyatla ayrılır", async ({ page }) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();

  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E Kombo Kategori ${suffix}` })
    .select("id")
    .single();
  const burgerName = `E2E-Burger-${suffix}`;
  const friesName = `E2E-Patates-${suffix}`;
  const { data: items } = await admin
    .from("menu_items")
    .insert([
      { tenant_id: orderFlow.tenantId, category_id: category!.id, name: burgerName },
      { tenant_id: orderFlow.tenantId, category_id: category!.id, name: friesName },
    ])
    .select("id, name");
  const burger = items!.find((i) => i.name === burgerName)!;
  const fries = items!.find((i) => i.name === friesName)!;
  await admin.from("menu_prices").insert([
    { tenant_id: orderFlow.tenantId, menu_item_id: burger.id, branch_id: null, price: 80 },
    { tenant_id: orderFlow.tenantId, menu_item_id: fries.id, branch_id: null, price: 40 },
  ]);

  const comboName = `E2E-Kombo-${suffix}`;

  await login(page, orderFlow);
  await page.goto("/recipes/kombo");

  await page.getByLabel("Kombo adı (ör. Büyük Menü)").fill(comboName);
  // Bileşenlerin toplamı (80+40=120) yerine kasıtlı olarak 100 — kampanya
  // fiyatının bileşen fiyatlarından DÜŞÜK olabildiğini ve oranın korunduğunu
  // (66,67 + 33,33 = 100) kanıtlamak için.
  await page.getByLabel("Kombo fiyatı (₺)").fill("100");

  const rows = page.locator("form").filter({ has: page.getByRole("button", { name: "Kombo oluştur" }) });
  const selects = rows.getByRole("combobox");
  // İlk spinbutton (nth(0)) "Kombo fiyatı" alanı — bileşen miktar alanları
  // nth(1)'den başlıyor.
  const quantityInputs = rows.getByRole("spinbutton");
  await selects.nth(0).selectOption({ label: burgerName });
  await quantityInputs.nth(1).fill("1");

  await page.getByRole("button", { name: "+ Bileşen ekle" }).click();
  await selects.nth(1).selectOption({ label: friesName });
  await quantityInputs.nth(2).fill("1");

  await page.getByRole("button", { name: "Kombo oluştur" }).click();
  await expect(page.getByText(comboName)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(`1× ${burgerName} + 1× ${friesName}`)).toBeVisible();

  // POS: masa aç, komboyu seç.
  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Kombo-Masa-${suffix}` })
    .select("id")
    .single();
  await page.goto(`/pos/masa/${table!.id}`);
  await page.getByRole("button", { name: "Adisyon aç" }).click();
  await expect(page).toHaveURL(new RegExp(`/pos/masa/${table!.id}`));

  await page.getByRole("button", { name: new RegExp(comboName) }).click();
  // `getByText(burgerName)` sepette VE soldaki menü ızgarasında (kendi tekil
  // ürün kartı olarak) iki kez eşleşir — sepete (aside) daralt.
  const cart = page.locator("aside");
  await expect(cart.getByText(burgerName)).toBeVisible({ timeout: 10_000 });
  await expect(cart.getByText(friesName)).toBeVisible();

  // Sunucu tarafında doğrula: iki satır, toplamı TAM 100, oran korunmuş.
  const { data: order } = await admin.from("orders").select("id").eq("table_id", table!.id).single();
  const { data: lines } = await admin
    .from("order_lines")
    .select("menu_item_id, quantity, unit_price, note")
    .eq("order_id", order!.id)
    .order("unit_price", { ascending: false });

  expect(lines).toHaveLength(2);
  const total = lines!.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0);
  expect(Math.round(total * 100) / 100).toBe(100);
  expect(lines!.every((l) => l.note === `Kombo: ${comboName}`)).toBe(true);
  // 80:40 oranı = 2:1 → daha pahalı bileşen (burger) daha büyük payı almalı.
  expect(Number(lines![0].unit_price)).toBeGreaterThan(Number(lines![1].unit_price));
});

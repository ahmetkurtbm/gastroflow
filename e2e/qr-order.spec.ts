import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { adminClient, type TestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");

async function readState() {
  const raw = await readFile(STATE_PATH, "utf8");
  return JSON.parse(raw) as { orderFlow: TestTenant; isolationOther: TestTenant };
}

// Geri bildirim: rakiplerin çoğunda masaya QR kod yapıştırılıp müşterinin
// kendi telefonundan sipariş verebilmesi vardı, bizde yoktu. Bu test GİRİŞ
// YAPMADAN (bkz. hiçbir `login()` çağrısı yok) `/siparis/masa/[qrToken]`'a
// gidip bir ürün seçip sipariş gönderiyor, sonra sunucu tarafında satırın
// gerçekten `pending` (mutfağa DOĞRUDAN gitmemiş, personel onayı bekliyor)
// olarak adisyona yazıldığını doğruluyor.
test("QR sipariş: kimlik doğrulaması olmadan menü görünür, sepet 'beklemede' olarak adisyona yazılır", async ({
  page,
}) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();

  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E QR Kategori ${suffix}` })
    .select("id")
    .single();
  const itemName = `E2E-QR-Urun-${suffix}`;
  const { data: item } = await admin
    .from("menu_items")
    .insert({ tenant_id: orderFlow.tenantId, category_id: category!.id, name: itemName })
    .select("id")
    .single();
  await admin
    .from("menu_prices")
    .insert({ tenant_id: orderFlow.tenantId, menu_item_id: item!.id, branch_id: null, price: 45 });

  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-QR-Masa-${suffix}` })
    .select("id, qr_token")
    .single();

  // Geçersiz/uydurma token → menü değil, açık bir hata.
  await page.goto("/siparis/masa/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("Bu QR kod artık geçerli değil")).toBeVisible();

  // Geçerli token — hiçbir login() çağrısı yok, bu bilerek: müşteri hiç
  // hesap açmadan/giriş yapmadan sipariş verebilmeli.
  await page.goto(`/siparis/masa/${table!.qr_token}`);
  const addButton = page.getByRole("button", { name: new RegExp(itemName) });
  await expect(addButton).toBeVisible();
  await addButton.click();

  const submitButton = page.getByRole("button", { name: /Siparişi gönder/ });
  await expect(submitButton).toBeVisible();
  await submitButton.click();

  await expect(page.getByText(/Siparişiniz alındı/)).toBeVisible({ timeout: 10_000 });

  // Sunucu tarafında doğrula: adisyon açıldı, satır PENDING (mutfağa
  // doğrudan gitmedi — personel POS'ta "Mutfağa gönder"e basmalı).
  const { data: order } = await admin
    .from("orders")
    .select("id, status, table_id")
    .eq("table_id", table!.id)
    .single();
  expect(order!.status).toBe("open");

  const { data: lines } = await admin
    .from("order_lines")
    .select("menu_item_id, quantity, unit_price, status, note")
    .eq("order_id", order!.id);
  expect(lines).toHaveLength(1);
  expect(lines![0].menu_item_id).toBe(item!.id);
  expect(Number(lines![0].quantity)).toBe(1);
  expect(Number(lines![0].unit_price)).toBe(45);
  expect(lines![0].status).toBe("pending");
  expect(lines![0].note).toBe("QR sipariş");
});

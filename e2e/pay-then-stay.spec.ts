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

// Geri bildirim: "önden öde, oturmaya devam et" modelinde ödeme adisyonu
// OTOMATİK kapatmamalı — aksi hâlde masa boş görünür, müşteri hâlâ
// otururken başka birine açılabilir. Bu test tam ödeme sonrası (kutucuk
// işaretlenmeden) adisyonun AÇIK kaldığını, "Masayı/Adisyonu Kapat"
// düğmesinin göründüğünü ve müşteri gerçekten kalkınca elle kapatılabildiğini
// kanıtlıyor.
test("önden öde: ödeme sonrası kutucuk işaretlenmezse adisyon açık kalır, elle kapatılabilir", async ({
  page,
}) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();

  const itemName = `E2E-Onden-Ode-${suffix}`;
  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E Onden Ode Kategori ${suffix}` })
    .select("id")
    .single();
  const { data: item } = await admin
    .from("menu_items")
    .insert({ tenant_id: orderFlow.tenantId, category_id: category!.id, name: itemName })
    .select("id")
    .single();
  await admin.from("menu_prices").insert({ tenant_id: orderFlow.tenantId, menu_item_id: item!.id, branch_id: null, price: 50 });

  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Onden-Masa-${suffix}` })
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

  // Kutucuğu İŞARETLEMEDEN tam ödeme yap.
  await page.getByRole("button", { name: "Tamamı" }).click();
  await page.getByRole("button", { name: "Ödemeyi al" }).click();

  await expect(page.getByRole("button", { name: "Masayı/Adisyonu Kapat" })).toBeVisible({ timeout: 10_000 });

  const { data: stillOpen } = await admin.from("orders").select("status").eq("id", order!.id).single();
  expect(stillOpen!.status).toBe("open");

  // Müşteri gerçekten kalkınca kasiyer elle kapatır.
  await page.getByRole("button", { name: "Masayı/Adisyonu Kapat" }).click();
  await expect(page.getByText("Bu adisyon tamamen ödendi ve kapatıldı.")).toBeVisible({ timeout: 10_000 });

  const { data: closed } = await admin.from("orders").select("status").eq("id", order!.id).single();
  expect(closed!.status).toBe("closed");
});

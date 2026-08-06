import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";

import { login } from "./helpers";
import { adminClient, type TestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");

async function readState() {
  const raw = await readFile(STATE_PATH, "utf8");
  return JSON.parse(raw) as { orderFlow: TestTenant; isolationOther: TestTenant };
}

async function buildTestWorkbook(filePath: string, rows: [string, number, string][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tedarikçi Fiyat Listesi");
  sheet.columns = [
    { header: "Hammadde Adı", key: "name" },
    { header: "Fiyat (₺)", key: "price" },
    { header: "Tedarikçi SKU", key: "sku" },
  ];
  for (const [name, price, sku] of rows) sheet.addRow({ name, price, sku });
  await workbook.xlsx.writeFile(filePath);
}

// Geri bildirim: tedarikçiden WhatsApp/mailden gelen fiyat listesi elle
// giriliyordu. Bu test gerçek bir hammadde + tedarikçi oluşturup, o
// hammaddeyi içeren bir Excel yükleyip fiyatın supplier_items'a doğru
// yazıldığını kanıtlıyor — ayrıca sistemde OLMAYAN bir hammadde adı içeren
// ikinci bir satırın (otomatik hammadde açmadan) sessizce atlandığını da.
test("tedarikçi fiyat listesi: Excel'den içe aktarılır, bilinmeyen hammadde atlanır", async ({ page }) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();
  const filePath = path.join(os.tmpdir(), `gastroflow-e2e-tedarikci-${suffix}.xlsx`);
  const ingredientName = `E2E-Tedarikci-Un-${suffix}`;
  const supplierName = `E2E Tedarikçi ${suffix}`;

  const { data: ingredient } = await admin
    .from("inventory_items")
    .insert({ tenant_id: orderFlow.tenantId, name: ingredientName, base_unit: "kg", cost_per_base_unit: 10 })
    .select("id")
    .single();
  const { data: supplier } = await admin
    .from("suppliers")
    .insert({ tenant_id: orderFlow.tenantId, name: supplierName })
    .select("id")
    .single();

  await buildTestWorkbook(filePath, [
    [ingredientName, 31.75, "UN-XYZ"],
    [`E2E-Olmayan-Hammadde-${suffix}`, 5, "YOK"],
  ]);

  await login(page, orderFlow);
  await page.goto(`/purchasing/tedarikciler/${supplier!.id}`);
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole("button", { name: "Yükle" }).click();

  await expect(page.getByText(/1 yeni, 0 güncellendi/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("li").filter({ hasText: ingredientName })).toBeVisible();

  const { data: supplierItem } = await admin
    .from("supplier_items")
    .select("price, supplier_sku")
    .eq("supplier_id", supplier!.id)
    .eq("inventory_item_id", ingredient!.id)
    .single();
  expect(Number(supplierItem!.price)).toBe(31.75);
  expect(supplierItem!.supplier_sku).toBe("UN-XYZ");
});

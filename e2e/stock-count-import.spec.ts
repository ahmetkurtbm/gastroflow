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

async function buildTestWorkbook(filePath: string, rows: [string, number][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sayım");
  sheet.columns = [
    { header: "Hammadde Adı", key: "name" },
    { header: "Sayılan Miktar", key: "counted" },
  ];
  for (const [name, counted] of rows) sheet.addRow({ name, counted });
  await workbook.xlsx.writeFile(filePath);
}

// Geri bildirim: bazı işletmeler sayımı kağıtta/Excel'de yapıp sonradan
// sisteme giriyor. Bu test hiç stok hareketi olmayan (bakiyesi 0) bir
// hammadde için "12 sayıldı" diyen bir Excel yükleyip +12'lik bir
// count_adjustment hareketinin gerçekten ledger'a düştüğünü kanıtlıyor —
// recordCount'taki (elle giriş) AYNI fark hesabı.
test("stok sayım: Excel'den içe aktarılır, fark count_adjustment olarak yazılır", async ({ page }) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();
  const filePath = path.join(os.tmpdir(), `gastroflow-e2e-sayim-${suffix}.xlsx`);
  const ingredientName = `E2E-Sayim-Un-${suffix}`;

  const { data: ingredient } = await admin
    .from("inventory_items")
    .insert({ tenant_id: orderFlow.tenantId, name: ingredientName, base_unit: "kg", cost_per_base_unit: 10 })
    .select("id")
    .single();
  const { data: location } = await admin
    .from("stock_locations")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Depo-${suffix}` })
    .select("id")
    .single();

  await buildTestWorkbook(filePath, [[ingredientName, 12]]);

  await login(page, orderFlow);
  await page.goto(`/inventory/sayim?location=${location!.id}`);
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole("button", { name: "Yükle" }).click();

  await expect(page.getByText(/1 yeni/)).toBeVisible({ timeout: 15_000 });

  const { data: movement } = await admin
    .from("stock_movements")
    .select("quantity, movement_type")
    .eq("location_id", location!.id)
    .eq("inventory_item_id", ingredient!.id)
    .eq("movement_type", "count_adjustment")
    .single();
  expect(Number(movement!.quantity)).toBe(12);
});

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

async function buildTestWorkbook(filePath: string, rows: [string, string, number][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Hammaddeler");
  sheet.columns = [
    { header: "Ad", key: "name" },
    { header: "Birim", key: "unit" },
    { header: "Maliyet (TL/birim)", key: "cost" },
  ];
  for (const [name, unit, cost] of rows) sheet.addRow({ name, unit, cost });
  await workbook.xlsx.writeFile(filePath);
}

// Geri bildirim: rakiplerin çoğunda "şablon indir → doldur → yükle" deseni
// var, bizde toplu ürün/hammadde girişi tek tek formdu. Bu test hem şablon
// indirme uç noktasının (proxy'nin PATH_ACCESS'inde tanımsız olduğu için
// önceden sessizce yönlendiriyordu — düzeltildi) gerçekten çalıştığını, hem
// de gerçek bir .xlsx dosyasının yüklenip hammadde satırlarına dönüştüğünü
// uçtan uca kanıtlıyor.
test("Excel içe aktarma: hammadde şablonu indirilebilir, yüklenen dosya satır olur", async ({ page }) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();
  // Repoyu kirletmemek için os.tmpdir()'e yazılıyor — e2e/fixtures/ yalnızca
  // kalıcı, git'e commit'lenmiş sabit dosyalar için (bkz. test-image.png).
  const filePath = path.join(os.tmpdir(), `gastroflow-e2e-hammadde-${suffix}.xlsx`);
  const itemName = `E2E-Excel-Un-${suffix}`;

  await buildTestWorkbook(filePath, [[itemName, "kg", 27.5]]);

  await login(page, orderFlow);

  // Şablon indirme uç noktası proxy tarafından yönlendirilmemeli.
  const templateResponse = await page.request.get("/api/export/hammaddeler?template=1");
  expect(templateResponse.status()).toBe(200);
  expect(templateResponse.headers()["content-type"]).toContain("spreadsheetml");

  await page.goto("/recipes/malzemeler");
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole("button", { name: "Yükle" }).click();

  await expect(page.getByText(/1 yeni, 0 güncellendi/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(itemName)).toBeVisible();

  const { data: item } = await admin
    .from("inventory_items")
    .select("base_unit, cost_per_base_unit")
    .eq("tenant_id", orderFlow.tenantId)
    .eq("name", itemName)
    .single();
  expect(item!.base_unit).toBe("kg");
  expect(Number(item!.cost_per_base_unit)).toBe(27.5);
});

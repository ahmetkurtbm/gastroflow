import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { login } from "./helpers";
import type { TestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");

async function readState() {
  const raw = await readFile(STATE_PATH, "utf8");
  return JSON.parse(raw) as { orderFlow: TestTenant; isolationOther: TestTenant };
}

// Faz 7 backlog maddesi: /pos "Ayarlar → Salon ve masalar bölümünden ekle"
// diyordu ama böyle bir ekran yoktu (tables/areas yalnızca SQL ile
// ekleniyordu). Bu test /settings/salon'un gerçekten bir alan + masa
// oluşturabildiğini VE yeni masanın salon ekranında (/pos) göründüğünü
// kanıtlıyor — sessizce kaybolan "alansız masa" hatasının da düzeldiğini
// dolaylı olarak doğrular (yeni masa her zaman bir alanla oluşturuluyor).
test("salon yönetimi: yeni alan + masa oluşturulup salon ekranında görünür", async ({ page }) => {
  const { orderFlow } = await readState();
  const areaName = `E2E Alan ${Date.now()}`;
  const tableName = `E2E-${Date.now()}`;

  await login(page, orderFlow);
  await page.goto("/settings/salon");

  await page.getByLabel("Yeni alan (ör. Bahçe, Teras)").fill(areaName);
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await expect(page.getByRole("heading", { name: areaName })).toBeVisible({ timeout: 10_000 });

  const areaSection = page.locator("section").filter({ has: page.getByRole("heading", { name: areaName }) });
  await areaSection.getByLabel("Masa adı").fill(tableName);
  await areaSection.getByLabel("Kişi").fill("6");
  await areaSection.getByRole("button", { name: "Masa ekle" }).click();
  // Yönetim listesindeki satırı hedefliyoruz — masa henüz konumlanmadığı
  // için canvas'ın "yerleştirilmemiş masalar" tepsisinde de aynı adla bir
  // düğme beliriyor (bkz. floor-canvas.tsx), `getByText` ikisiyle de eşleşirdi.
  await expect(areaSection.locator("li").filter({ hasText: tableName })).toBeVisible({
    timeout: 10_000,
  });

  await page.goto("/pos");
  await expect(page.getByText(tableName)).toBeVisible();
});

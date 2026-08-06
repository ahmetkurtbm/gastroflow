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

function toLocalInputValue(date: Date): string {
  // <input type="datetime-local"> yerel saat bekliyor, ISO string'in "Z"li
  // hâlini değil — dakika hassasiyetine kadar elle biçimlendiriyoruz.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Geri bildirim: kasa/vardiya oturumu vardı ama "kim ne zaman çalışacak"
// PLANLAMASI yoktu. Bu test /settings/vardiyalar'dan gerçek arayüzden bir
// vardiya oluşturup "Yaklaşan vardiyalar" listesinde göründüğünü, sonra
// silinince kaybolduğunu kanıtlıyor.
test("vardiya planlama: oluşturulur yaklaşanlarda görünür, silinince kaybolur", async ({ page }) => {
  const { orderFlow } = await readState();

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(10, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow.getTime() + 8 * 60 * 60 * 1000);
  const noteText = `E2E vardiya notu ${Date.now()}`;

  await login(page, orderFlow);
  await page.goto("/settings/vardiyalar");

  await page.getByLabel("Personel").selectOption({ index: 1 });
  await page.getByLabel("Şube").selectOption({ index: 0 });
  await page.getByLabel("Başlangıç").fill(toLocalInputValue(tomorrow));
  await page.getByLabel("Bitiş").fill(toLocalInputValue(tomorrowEnd));
  await page.getByLabel("Not (opsiyonel)").fill(noteText);
  await page.getByRole("button", { name: "Vardiya ekle" }).click();

  const row = page.locator("li").filter({ hasText: noteText });
  await expect(row).toBeVisible({ timeout: 10_000 });

  await row.getByRole("button", { name: "Sil" }).click();
  await expect(row).not.toBeVisible({ timeout: 10_000 });
});

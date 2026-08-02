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

test("dil değiştirici: TR/EN arasında geçiş kabuk metnini ve POS ekranını değiştirir", async ({ page }) => {
  const { orderFlow } = await readState();

  await login(page, orderFlow);
  await expect(page.getByRole("link", { name: "Raporlar" })).toBeVisible();

  await page.getByRole("button", { name: "en", exact: true }).click();
  await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.goto("/pos");
  await expect(page.getByText("Floor")).toBeVisible();

  // Geri TR'ye dön — sonraki testler varsayılan dili bekliyor.
  await page.getByRole("button", { name: "tr", exact: true }).click();
  await expect(page.getByRole("link", { name: "Raporlar" })).toBeVisible();
});

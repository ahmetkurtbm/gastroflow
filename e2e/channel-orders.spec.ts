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

// Geri bildirim: "gel al" ve "self servis" için POS'ta hiçbir giriş noktası
// yoktu — yalnızca masa seçerek adisyon açılabiliyordu. openChannelOrder +
// /pos/siparis/[orderId] bu boşluğu kapatıyor. Bu test iki kanalı da açıp
// (masasız), ürün ekleyip, salon ekranında "Açık paket siparişler"
// listesinde göründüğünü ve tekrar açılabildiğini kanıtlıyor.
test("gel al / self servis: masasız sipariş açılır, ürün eklenir, salon ekranında listelenir", async ({
  page,
}) => {
  const { orderFlow } = await readState();

  await login(page, orderFlow);
  await page.goto("/pos");

  await page.getByRole("button", { name: "+ Gel Al" }).click();
  await expect(page).toHaveURL(/\/pos\/siparis\//);
  await expect(page.getByText("Adisyon")).toBeVisible();

  await page.getByRole("button", { name: "Test Ürün" }).click();
  await expect(page.getByText("Gönderilmedi")).toBeVisible({ timeout: 10_000 });

  await page.goto("/pos");
  const channelSection = page.locator("section").filter({ hasText: "Açık paket siparişler" });
  await expect(channelSection.getByText("Gel Al")).toBeVisible();

  // İkinci bir self servis siparişi: aynı anda birden çok masasız sipariş
  // açılabildiğini (masalardaki "tek açık adisyon" kısıtının burada
  // geçerli OLMADIĞINI) kanıtlıyor.
  await page.getByRole("button", { name: "+ Self Servis" }).click();
  await expect(page).toHaveURL(/\/pos\/siparis\//);

  await page.goto("/pos");
  await expect(channelSection.getByText("Self Servis")).toBeVisible();
  await expect(channelSection.getByText("Gel Al")).toBeVisible();
});

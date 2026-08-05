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

// `devices["iPhone 13"]` WebKit motoru gerektirir — bu proje yalnızca
// chromium kurulu (bkz. playwright.config.ts); mobil görünümü chromium'un
// kendi cihaz emülasyonuyla (viewport + dokunma) taklit ediyoruz.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Kullanıcı geri bildirimi: masaüstündeki dikey menü mobilde yatay kaydırmalı
// bir şeride dönüşüyordu, kullanışlı değildi. Artık hamburger → kayar menü
// (bkz. src/components/mobile-nav-drawer.tsx). Bu test gerçek bir mobil
// viewport'ta (iPhone 13 emülasyonu) menünün açılıp kapandığını ve
// gezinmenin çalıştığını kanıtlıyor.
test("mobil menü: hamburger açılır, bağlantıya dokununca kapanıp yönlendirir", async ({ page }) => {
  const { orderFlow } = await readState();

  await login(page, orderFlow);
  await expect(page.getByRole("link", { name: "Raporlar" })).not.toBeVisible();

  await page.getByRole("button", { name: "Menüyü aç" }).click();
  const drawerLink = page.getByRole("link", { name: "Sipariş Al" });
  await expect(drawerLink).toBeVisible();

  await drawerLink.click();
  await expect(page).toHaveURL(/\/pos$/);
  // Sayfa değişince panel kendiliğinden kapanmalı.
  await expect(page.getByRole("link", { name: "Sipariş Al" })).not.toBeVisible();

  // Tekrar aç, bu kez arka plana dokunarak kapat. Backdrop elemanı görsel
  // olarak panelin ARKASINDA (ekranın tamamını kaplıyor ama panel üstünde
  // duruyor) — varsayılan "elemanın ortasına tıkla" davranışı panelin
  // altına denk gelir, panel dışındaki (sağdaki karanlık) noktayı hedefliyoruz.
  await page.getByRole("button", { name: "Menüyü aç" }).click();
  await expect(page.getByRole("link", { name: "Kasa" })).toBeVisible();
  await page
    .getByRole("button", { name: "Menüyü kapat" })
    .first()
    .click({ position: { x: 370, y: 20 } });
  await expect(page.getByRole("link", { name: "Kasa" })).not.toBeVisible();
});

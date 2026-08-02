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

// AGENTS.md "Offline kuyruk — kapsam sınırı" bunu açık bir sınır olarak
// belgeliyordu: sayfa navigasyonu service worker olmadan offline çalışamaz.
// public/sw.js bunu bir sayfa ÖNCE ONLINE ziyaret edildiyse kapatıyor —
// bu test tam olarak o iddiayı kanıtlıyor: aç → önbellekle → çevrimdışına
// geç → SOĞUK BAŞLANGIÇ (tam sayfa reload) yap → hâlâ render olduğunu doğrula.
test("PWA: bir kez ziyaret edilen sipariş ekranı, soğuk başlangıçta çevrimdışı da açılır", async ({
  page,
  context,
}) => {
  const { orderFlow } = await readState();

  await login(page, orderFlow);
  await page.goto("/pos");
  // Kendi masasını kullanır (order-lifecycle.spec.ts'in masasıyla çakışmasın —
  // aynı çalıştırmada aynı kiracıyı paylaşıyorlar, bkz. global-setup.ts).
  await page.getByRole("button", { name: new RegExp(orderFlow.secondaryTableName) }).click();
  await expect(page).toHaveURL(/\/pos\/masa\//);
  const orderUrl = page.url();

  // Service worker'ın kurulup fetch'leri önbelleklemesini bekle.
  await page.waitForFunction(() =>
    navigator.serviceWorker.getRegistration().then((r) => Boolean(r?.active)),
  );
  // İlk yükleme sırasında SW henüz kontrolde olmayabilir (ilk kayıtta
  // sayfa zaten yüklenmişti) — kontrolü garantiye almak için bir kez daha
  // yenile, bu geçiş SW'yi devreye sokar ve isteği önbelleğe yazdırır.
  await page.reload();
  await page.waitForLoadState("networkidle");

  await context.setOffline(true);
  await page.reload();

  // Sunucudan RSC verisi çekemediği hâlde sepet ekranı (masa başlığı) hâlâ
  // görünüyor olmalı — bu, tarayıcının varsayılan "İnternet yok" hata
  // sayfası DEĞİL, service worker'ın önbellekten verdiği gerçek uygulama
  // kabuğu demek.
  await expect(page.getByText("Sepet boş. Soldan ürün seç.")).toBeVisible({ timeout: 10_000 });

  await context.setOffline(false);
  expect(page.url()).toBe(orderUrl);
});

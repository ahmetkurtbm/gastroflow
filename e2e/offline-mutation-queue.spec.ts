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

// Faz 2'den beri var olan offline kuyruğun ("zaten açık bir sipariş
// ekranında bağlantı kesilirse ürün ekleme kaybolmaz") daha önce yalnızca
// `fake-indexeddb` ile birim testte (queue.test.ts) ve service worker'ın
// SAYFA önbelleklemesi (offline-cold-start.spec.ts) uçtan uca kanıtlanmıştı
// — ama gerçek bir tarayıcıda GERÇEK ağ kesintisiyle MUTASYON kuyruklama
// hiç doğrulanmamıştı. Bu test tam olarak onu yapıyor: bağlantıyı gerçekten
// kes, ürün ekle, kuyrukta kaldığını (hem ekranda hem kabuktaki genel
// göstergede) doğrula, bağlan, sunucuya gerçekten yazıldığını kontrol et.
test("offline mutasyon kuyruğu: bağlantı kesilirken eklenen ürün kaybolmaz, bağlanınca sunucuya yazılır", async ({
  page,
  context,
}) => {
  const { orderFlow } = await readState();
  const admin = adminClient();

  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Offline-${Date.now()}` })
    .select("id")
    .single();

  await login(page, orderFlow);
  await page.goto(`/pos/masa/${table!.id}`);
  await page.getByRole("button", { name: "Adisyon aç" }).click();
  await expect(page).toHaveURL(new RegExp(`/pos/masa/${table!.id}`));
  // Bağlantıyı kesmeden ÖNCE sayfa (ve AddItemButton'ı hydrate eden JS
  // chunk'ları) tamamen yüklenmiş olmalı — aksi hâlde offline'a geçiş JS
  // yüklemesini yarıda keser, buton hiç interaktif olmaz (bkz.
  // offline-cold-start.spec.ts'teki aynı desen).
  await page.waitForLoadState("networkidle");

  const { data: order } = await admin.from("orders").select("id").eq("table_id", table!.id).single();

  await context.setOffline(true);

  await page.getByRole("button", { name: "Test Ürün" }).click();

  // Ekrandaki sepet banner'ı VE kabuktaki genel gösterge (header) ikisi de
  // "çevrimdışı" demeli — göstergenin gerçekten global olduğunun kanıtı.
  await expect(page.getByText(/Çevrimdışı — 1 işlem/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Çevrimdışı" }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Gönderiliyor…")).toBeVisible();

  // Sunucu tarafında HENÜZ hiçbir şey yazılmamış olmalı — asıl garanti bu.
  const { count: beforeCount } = await admin
    .from("order_lines")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order!.id);
  expect(beforeCount).toBe(0);

  await context.setOffline(false);

  // Bağlantı gelince otomatik senkronlanmalı: iyimser satır gerçek satırla
  // değişir ("Gönderiliyor…" kaybolur, "Gönderilmedi" durumu belirir).
  await expect(page.getByText("Gönderiliyor…")).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Gönderilmedi")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("status").filter({ hasText: "Çevrimdışı" })).toHaveCount(0);

  await expect
    .poll(
      async () => {
        const { count } = await admin
          .from("order_lines")
          .select("id", { count: "exact", head: true })
          .eq("order_id", order!.id);
        return count;
      },
      { timeout: 10_000 },
    )
    .toBe(1);
});

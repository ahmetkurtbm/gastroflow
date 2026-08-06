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

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

// Sistematik mobil düzen taraması: her ana ekranı 375px genişlikte açıp
// `document.documentElement.scrollWidth`'in viewport'u AŞMADIĞINI doğrular.
// Tek tek dosya okumak yerine gerçek render'ı ölçüyoruz — bir tablo/grid
// önbelleğe alma sırasında yeniden taşırsa bu test hemen yakalar.
const ROUTES = [
  "/pos",
  "/orders",
  "/kds",
  "/cash",
  "/inventory",
  "/inventory/zayiat",
  "/inventory/transfer",
  "/inventory/varyans",
  "/inventory/sayim",
  "/recipes",
  "/recipes/malzemeler",
  "/recipes/yeni",
  "/purchasing",
  "/purchasing/tedarikciler",
  "/purchasing/yeni",
  "/reports",
  "/m",
  "/approvals",
  "/audit",
  "/settings",
  "/settings/salon",
  "/settings/personel",
];

test("mobil düzen taşması: ana ekranlarda yatay kaydırma olmamalı (375px)", async ({ page }) => {
  // ~24 sayfayı `networkidle` bekleyerek tek tek geziyor — varsayılan 30s
  // test bütçesi bu kadar sayfa ziyareti için yeterli değil (tek bir
  // interaktif senaryo değil, sistematik bir tarama).
  test.setTimeout(90_000);

  const { orderFlow } = await readState();
  const admin = adminClient();

  // POS sipariş ekranı (dolu sepet) ve ödeme ekranı (hızlı bölüşüm
  // düğmeleri) en yüksek taşma riski taşıyan iki dinamik ekran — kullanıcı
  // geri bildirimi tam olarak buralara işaret ediyordu. UI üzerinden değil,
  // doğrudan veri yazarak (load-test.mjs'teki desen) hazırlıyoruz.
  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Overflow-${Date.now()}` })
    .select("id")
    .single();
  const { data: order } = await admin
    .from("orders")
    .insert({
      tenant_id: orderFlow.tenantId,
      branch_id: orderFlow.branchId,
      table_id: table!.id,
      client_key: crypto.randomUUID(),
    })
    .select("id")
    .single();
  await admin.from("order_lines").insert([
    {
      tenant_id: orderFlow.tenantId,
      order_id: order!.id,
      menu_item_id: orderFlow.menuItemId,
      quantity: 2,
      unit_price: 100,
      client_key: crypto.randomUUID(),
    },
    {
      tenant_id: orderFlow.tenantId,
      order_id: order!.id,
      menu_item_id: orderFlow.menuItemId,
      quantity: 1,
      unit_price: 100,
      client_key: crypto.randomUUID(),
    },
  ]);

  await login(page, orderFlow);

  const dynamicRoutes = [`/pos/masa/${table!.id}`, `/cash/${order!.id}`];
  const overflowing: string[] = [];

  for (const route of [...ROUTES, ...dynamicRoutes]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });

    // 1px tolerans: alt piksel yuvarlaması bazı tarayıcılarda gerçek bir
    // taşma olmadan da 1px fark üretebiliyor.
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      overflowing.push(`${route} (scrollWidth=${overflow.scrollWidth}, viewport=${overflow.clientWidth})`);
    }
  }

  expect(overflowing, `Yatay taşan ekranlar:\n${overflowing.join("\n")}`).toEqual([]);
});

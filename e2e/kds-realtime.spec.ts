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

// KDS'nin realtime kanalı her olayda TÜM açık biletleri yeniden çekiyordu
// (refetch()) — yoğun serviste (dakikada onlarca durum değişimi) gereksiz
// sorgu yükü demekti. Artık yalnızca değişen satırı yamalıyor: yeni bir
// bilet (INSERT) tek satır sorgusuyla eklenir, durum değişimi (UPDATE) hiç
// sorgu atmadan yerinde güncellenir. Bu test doğrudan veritabanına yazıp
// (POS akışını simüle ederek) sayfa HİÇ YENİLENMEDEN ekranın güncellendiğini
// kanıtlıyor — yani gerçekten realtime çalışıyor, tam sayfa yeniden
// yükleme/refetch'e bağlı değil.
test("KDS realtime: yeni bilet sayfa yenilenmeden belirir, durum değişimi yerinde güncellenir", async ({
  page,
}) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const itemName = `E2E-KDS-${Date.now()}`;

  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E KDS Kategori ${Date.now()}` })
    .select("id")
    .single();
  const { data: menuItem } = await admin
    .from("menu_items")
    .insert({ tenant_id: orderFlow.tenantId, category_id: category!.id, name: itemName })
    .select("id")
    .single();
  // Kendi masasını yaratıyoruz — paylaşılan seed masaların (tableId/
  // secondaryTableId) başka spec'ler tarafından açık bırakılmış olma
  // ihtimali var (bkz. offline-cold-start.spec.ts), "tek açık adisyon"
  // kısıtına çarpmamak için.
  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-KDS-Masa-${Date.now()}` })
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
  const { data: line } = await admin
    .from("order_lines")
    .insert({
      tenant_id: orderFlow.tenantId,
      order_id: order!.id,
      menu_item_id: menuItem!.id,
      quantity: 1,
      unit_price: 50,
      client_key: crypto.randomUUID(),
    })
    .select("id")
    .single();

  await login(page, orderFlow);
  await page.goto("/kds");

  // Henüz "pending" — KDS'de görünmemeli.
  await expect(page.getByText(itemName)).not.toBeVisible();

  // Realtime websocket kanalının abone olması (channel.subscribe()) bir
  // ağ round-trip'i — sayfa yüklendi diye kanalın da hazır olduğu garanti
  // değil. Değişikliği tetiklemeden önce küçük bir tampon.
  await page.waitForTimeout(2_000);

  // POS'un sendToKitchen'ının yaptığı UPDATE'i taklit ediyoruz. Sayfa hiç
  // yenilenmiyor — yalnızca realtime kanal bunu yakalayıp INSERT-yolunu
  // (tek satır sorgusu) tetiklemeli.
  await admin.from("order_lines").update({ status: "sent" }).eq("id", line!.id);

  const bekliyorColumn = page.locator("section").filter({ has: page.getByRole("heading", { name: "Bekliyor" }) });
  await expect(bekliyorColumn.getByText(itemName)).toBeVisible({ timeout: 10_000 });

  // Şimdi durum değişimi (UPDATE-yolu: yerinde yama, sorgu yok) — bilet
  // "Hazırlanıyor" sütununa geçmeli, "Bekliyor"dan kaybolmalı.
  await admin.from("order_lines").update({ status: "preparing" }).eq("id", line!.id);

  const hazirlaniyorColumn = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Hazırlanıyor" }) });
  await expect(hazirlaniyorColumn.getByText(itemName)).toBeVisible({ timeout: 10_000 });
  await expect(bekliyorColumn.getByText(itemName)).not.toBeVisible();
});

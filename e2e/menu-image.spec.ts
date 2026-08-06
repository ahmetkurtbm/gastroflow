import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { login } from "./helpers";
import { adminClient, type TestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");
const IMAGE_PATH = path.join(__dirname, "fixtures", "test-image.png");

async function readState() {
  const raw = await readFile(STATE_PATH, "utf8");
  return JSON.parse(raw) as { orderFlow: TestTenant; isolationOther: TestTenant };
}

// Geri bildirim: dokunmatik POS ızgarasında sadece isim vardı, fotoğraf
// yoktu — kalabalık bir serviste ürün tanıma büyük ölçüde görsele dayanır.
// Bu test /recipes/[id]'den gerçek bir dosya yükleyip (Supabase Storage'a),
// POS ızgarasında o görselin gerçekten belirdiğini kanıtlıyor.
test("ürün görseli: yüklenir, POS ızgarasında görünür", async ({ page }) => {
  const { orderFlow } = await readState();
  const admin = adminClient();
  const suffix = Date.now();

  const itemName = `E2E-Gorsel-Urun-${suffix}`;
  const { data: category } = await admin
    .from("categories")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E Görsel Kategori ${suffix}` })
    .select("id")
    .single();
  const { data: item } = await admin
    .from("menu_items")
    .insert({ tenant_id: orderFlow.tenantId, category_id: category!.id, name: itemName })
    .select("id")
    .single();
  await admin.from("menu_prices").insert({ tenant_id: orderFlow.tenantId, menu_item_id: item!.id, branch_id: null, price: 30 });

  const { data: inventoryItem } = await admin
    .from("inventory_items")
    .insert({ tenant_id: orderFlow.tenantId, name: `E2E-Görsel-Hammadde-${suffix}`, base_unit: "g", cost_per_base_unit: 0.01 })
    .select("id")
    .single();
  const { data: recipe } = await admin
    .from("recipes")
    .insert({ tenant_id: orderFlow.tenantId, menu_item_id: item!.id, name: `E2E-Görsel-Reçete-${suffix}` })
    .select("id")
    .single();
  const { data: version } = await admin
    .from("recipe_versions")
    .insert({
      tenant_id: orderFlow.tenantId,
      recipe_id: recipe!.id,
      version_no: 1,
      status: "active",
      yield_quantity: 1,
      yield_unit: "adet",
      activated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  await admin.from("recipe_lines").insert({
    tenant_id: orderFlow.tenantId,
    recipe_version_id: version!.id,
    line_no: 1,
    component_type: "ingredient",
    inventory_item_id: inventoryItem!.id,
    quantity: 10,
    unit: "g",
    waste_percent: 0,
  });

  const { data: table } = await admin
    .from("tables")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E-Görsel-Masa-${suffix}` })
    .select("id")
    .single();

  await login(page, orderFlow);
  await page.goto(`/recipes/${recipe!.id}`);
  await expect(page.getByText("Ürün görseli")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(IMAGE_PATH);
  await page.getByRole("button", { name: "Yükle" }).click();
  await expect(page.getByRole("button", { name: "Değiştir" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Görseli kaldır" })).toBeVisible();

  const { data: menuItem } = await admin.from("menu_items").select("image_url").eq("id", item!.id).single();
  expect(menuItem!.image_url).toContain("menu-images");

  await page.goto(`/pos/masa/${table!.id}`);
  await page.getByRole("button", { name: "Adisyon aç" }).click();
  await expect(page).toHaveURL(new RegExp(`/pos/masa/${table!.id}`));

  const productButton = page.getByRole("button", { name: new RegExp(itemName) });
  await expect(productButton).toBeVisible();
  await expect(productButton.locator("img")).toHaveAttribute("src", /menu-images/);
});

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`e2e: eksik ortam değişkeni ${name}`);
  return value;
}

export function adminClient() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type TestTenant = {
  tenantId: string;
  branchId: string;
  tableId: string;
  tableName: string;
  menuItemId: string;
  userId: string;
  email: string;
  password: string;
};

/**
 * Playwright e2e testleri için tek kullanımlık bir kiracı kurar: şube, tek
 * masa, satılabilir bir ürün, kasa oturumu ve "owner" rolünde giriş yapabilen
 * bir kullanıcı. `scripts/load-test.mjs`'teki aynı desen — kendi verisini
 * yaratır, `global-teardown.ts` sonunda siler; paylaşımlı geliştirme
 * projesini kirletmez.
 */
export async function createTestTenant(admin: ReturnType<typeof adminClient>, label: string): Promise<TestTenant> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const slug = `e2e-${label}-${suffix}`;
  const email = `e2e-${label}-${suffix}@example.invalid`;
  const password = randomUUID();

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ name: `E2E ${label}`, slug })
    .select("id")
    .single();
  if (tenantError) throw new Error(`tenant: ${tenantError.message}`);

  const { data: branch, error: branchError } = await admin
    .from("branches")
    .insert({ tenant_id: tenant.id, name: "Merkez" })
    .select("id")
    .single();
  if (branchError) throw new Error(`branch: ${branchError.message}`);

  const { data: userRes, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `E2E ${label}` },
  });
  if (userError) throw new Error(`user: ${userError.message}`);
  const userId = userRes.user.id;

  const { error: memberError } = await admin.from("memberships").insert({
    user_id: userId,
    tenant_id: tenant.id,
    branch_id: branch.id,
    role: "owner",
  });
  if (memberError) throw new Error(`membership: ${memberError.message}`);

  // Masa yönetimi için henüz bir Ayarlar ekranı yok (Faz 8'e kadar tables/areas
  // SQL ile kuruluyor) — gerçek kurulumu taklit etmek için önce bir alan açıyoruz.
  // Not: `loadFloorPlan` yalnızca `areas` tablosundaki satırları döner; area_id'si
  // olmayan bir masa salon ekranında hiç görünmez (bkz. src/lib/orders/queries.ts).
  const { data: area, error: areaError } = await admin
    .from("areas")
    .insert({ tenant_id: tenant.id, branch_id: branch.id, name: "Salon" })
    .select("id")
    .single();
  if (areaError) throw new Error(`area: ${areaError.message}`);

  const tableName = `E2E-${label}`;
  const { data: table, error: tableError } = await admin
    .from("tables")
    .insert({ tenant_id: tenant.id, branch_id: branch.id, area_id: area.id, name: tableName })
    .select("id")
    .single();
  if (tableError) throw new Error(`table: ${tableError.message}`);

  const { data: category, error: categoryError } = await admin
    .from("categories")
    .insert({ tenant_id: tenant.id, name: "Yiyecek" })
    .select("id")
    .single();
  if (categoryError) throw new Error(`category: ${categoryError.message}`);

  const { data: menuItem, error: menuItemError } = await admin
    .from("menu_items")
    .insert({ tenant_id: tenant.id, category_id: category.id, name: "Test Ürün" })
    .select("id")
    .single();
  if (menuItemError) throw new Error(`menu_item: ${menuItemError.message}`);

  const { error: priceError } = await admin
    .from("menu_prices")
    .insert({ tenant_id: tenant.id, menu_item_id: menuItem.id, branch_id: null, price: 100 });
  if (priceError) throw new Error(`menu_price: ${priceError.message}`);

  const { error: cashError } = await admin.from("cash_sessions").insert({
    tenant_id: tenant.id,
    branch_id: branch.id,
    opening_float: 0,
    opened_by: userId,
  });
  if (cashError) throw new Error(`cash_session: ${cashError.message}`);

  return {
    tenantId: tenant.id,
    branchId: branch.id,
    tableId: table.id,
    tableName,
    menuItemId: menuItem.id,
    userId,
    email,
    password,
  };
}

export async function destroyTestTenant(admin: ReturnType<typeof adminClient>, tenant: TestTenant) {
  await admin.from("tenants").delete().eq("id", tenant.tenantId);
  await admin.auth.admin.deleteUser(tenant.userId);
}

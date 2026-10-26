import { currentPrices } from "@/core/pricing";
import { createClient } from "@/lib/db/client";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export type ComboAdminItem = {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
};

export type ComboAdmin = {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  items: ComboAdminItem[];
};

/** Ayarlar/Reçeteler → Kombolar ekranı için: tüm kombolar + bileşenleri. */
export async function loadCombosAdmin(): Promise<ComboAdmin[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("combos")
    .select("id, name, price, is_active, combo_items(menu_item_id, quantity, menu_items(name))")
    .order("name");

  return (data ?? []).map((combo) => ({
    id: combo.id,
    name: combo.name,
    price: toNumber(combo.price),
    isActive: combo.is_active,
    items: (combo.combo_items ?? []).map((item) => ({
      menuItemId: item.menu_item_id,
      menuItemName: item.menu_items?.name ?? "Bilinmeyen ürün",
      quantity: toNumber(item.quantity),
    })),
  }));
}

/** Kombo oluşturma formundaki ürün seçimi için — tüm aktif menü ürünleri. */
export async function loadMenuItemOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("menu_items")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export type SellableComboItem = {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  /** Bileşenin kombosuz birim fiyatı; orantılı dağıtımın ağırlığı. */
  unitPrice: number;
};

export type SellableCombo = {
  id: string;
  name: string;
  price: number;
  items: SellableComboItem[];
};

/**
 * POS'ta gösterilecek satılabilir kombolar. Bileşenlerinden biri satışta
 * değilse ya da fiyatı yoksa kombo listelenmez; aksi hâlde orantılı fiyat
 * dağıtımı yapılamaz. `scope` QR ekranının servis istemcisi içindir.
 */
export async function loadSellableCombos(
  branchId: string,
  scope?: { client: SupabaseClient; tenantId: string },
): Promise<SellableCombo[]> {
  const supabase = scope?.client ?? (await createClient());

  let combosQuery = supabase
    .from("combos")
    .select("id, name, price, combo_items(menu_item_id, quantity, menu_items(name, is_active))")
    .eq("is_active", true);
  let pricesQuery = supabase
    .from("menu_prices")
    .select("menu_item_id, price, branch_id, valid_from")
    .or(`branch_id.eq.${branchId},branch_id.is.null`);

  if (scope) {
    combosQuery = combosQuery.eq("tenant_id", scope.tenantId);
    pricesQuery = pricesQuery.eq("tenant_id", scope.tenantId);
  }

  const [combosResult, pricesResult] = await Promise.all([combosQuery.order("name"), pricesQuery]);

  const priceByItem = currentPrices(pricesResult.data ?? [], branchId);

  const combos: SellableCombo[] = [];
  for (const combo of combosResult.data ?? []) {
    const rawItems = combo.combo_items ?? [];
    if (rawItems.length === 0) continue;

    const items: SellableComboItem[] = [];
    let allPriced = true;
    for (const item of rawItems) {
      const unitPrice = priceByItem.get(item.menu_item_id)?.price;
      if (unitPrice === undefined || !item.menu_items?.is_active) {
        allPriced = false;
        break;
      }
      items.push({
        menuItemId: item.menu_item_id,
        menuItemName: item.menu_items?.name ?? "Bilinmeyen ürün",
        quantity: toNumber(item.quantity),
        unitPrice,
      });
    }
    if (!allPriced) continue;

    combos.push({ id: combo.id, name: combo.name, price: toNumber(combo.price), items });
  }

  return combos;
}

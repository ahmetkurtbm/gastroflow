import { createClient } from "@/lib/supabase/server";

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
  /** Bu bileşenin normal (kombosuz) birim fiyatı — orantılı dağıtımın
   * ağırlığı bunun üzerinden hesaplanır (bkz. `allocateProportional`). */
  unitPrice: number;
};

export type SellableCombo = {
  id: string;
  name: string;
  /** Kombonun TOPLAM sabit fiyatı. */
  price: number;
  items: SellableComboItem[];
};

/**
 * POS'ta gösterilecek, satılabilir kombolar.
 *
 * Bir bileşenin şube için tanımlı fiyatı yoksa o kombo listeden ATLANIR —
 * `allocateProportional`'ın orantı hesaplayabilmesi için her bileşenin bir
 * ağırlığı (normal fiyatı) olmalı; fiyatsız bir bileşen sessizce 0 TL'ye
 * "kombo bedava" gibi davranırdı, bu yanıltıcı olurdu.
 */
export async function loadSellableCombos(branchId: string): Promise<SellableCombo[]> {
  const supabase = await createClient();

  const [combosResult, pricesResult] = await Promise.all([
    supabase
      .from("combos")
      .select("id, name, price, combo_items(menu_item_id, quantity, menu_items(name))")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("menu_prices")
      .select("menu_item_id, price, branch_id, valid_from")
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
      .order("valid_from", { ascending: false }),
  ]);

  const priceByItem = new Map<string, number>();
  for (const row of pricesResult.data ?? []) {
    if (row.branch_id === branchId) {
      priceByItem.set(row.menu_item_id, toNumber(row.price));
    } else if (!priceByItem.has(row.menu_item_id)) {
      priceByItem.set(row.menu_item_id, toNumber(row.price));
    }
  }

  const combos: SellableCombo[] = [];
  for (const combo of combosResult.data ?? []) {
    const rawItems = combo.combo_items ?? [];
    if (rawItems.length === 0) continue;

    const items: SellableComboItem[] = [];
    let allPriced = true;
    for (const item of rawItems) {
      const unitPrice = priceByItem.get(item.menu_item_id);
      if (unitPrice === undefined) {
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

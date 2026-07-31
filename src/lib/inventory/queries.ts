import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export type StockRow = {
  itemId: string;
  itemName: string;
  baseUnit: string;
  locationId: string;
  locationName: string;
  balance: number;
  reorderPoint: number | null;
  isLow: boolean;
};

/**
 * Her (hammadde × lokasyon) çifti için anlık bakiye.
 *
 * Bakiye `v_stock_balance`'tan geliyor — o da `stock_movements` defterinin
 * `SUM(quantity)`'si. Tabloya değil görünüme bakmamızın sebebi: anlık stok
 * hiçbir yerde AYRI bir sayı olarak SAKLANMIYOR, her seferinde defterden
 * türetiliyor. Bu, "bakiye kolonu ile defter birbirinden sapar" hatasını
 * yapısal olarak imkânsız kılıyor.
 */
export async function loadStockOverview(): Promise<StockRow[]> {
  const supabase = await createClient();

  const [itemsResult, locationsResult, balancesResult, parLevelsResult] = await Promise.all([
    supabase.from("inventory_items").select("id, name, base_unit").eq("is_active", true).order("name"),
    supabase.from("stock_locations").select("id, name").eq("is_active", true).order("name"),
    supabase.from("v_stock_balance").select("location_id, inventory_item_id, balance"),
    supabase.from("par_levels").select("location_id, inventory_item_id, reorder_point"),
  ]);

  const locationById = new Map((locationsResult.data ?? []).map((l) => [l.id, l.name]));
  const balanceByKey = new Map(
    (balancesResult.data ?? []).map((b) => [
      `${b.location_id}:${b.inventory_item_id}`,
      toNumber(b.balance),
    ]),
  );
  const reorderByKey = new Map(
    (parLevelsResult.data ?? []).map((p) => [
      `${p.location_id}:${p.inventory_item_id}`,
      toNumber(p.reorder_point),
    ]),
  );

  const rows: StockRow[] = [];
  for (const item of itemsResult.data ?? []) {
    for (const [locationId, locationName] of locationById) {
      const key = `${locationId}:${item.id}`;
      // Hiç hareketi olmayan bir (ürün, lokasyon) çifti için satır üretmiyoruz —
      // aksi hâlde her yeni hammadde her lokasyonda "0" satırıyla listeyi şişirirdi.
      if (!balanceByKey.has(key) && !reorderByKey.has(key)) continue;

      const balance = balanceByKey.get(key) ?? 0;
      const reorderPoint = reorderByKey.get(key) ?? null;

      rows.push({
        itemId: item.id,
        itemName: item.name,
        baseUnit: item.base_unit,
        locationId,
        locationName,
        balance,
        reorderPoint,
        isLow: reorderPoint !== null && balance <= reorderPoint,
      });
    }
  }

  rows.sort((a, b) => a.itemName.localeCompare(b.itemName, "tr"));
  return rows;
}

export type LowStockRow = {
  itemName: string;
  locationName: string;
  balance: number;
  reorderPoint: number;
  baseUnit: string;
};

export async function loadLowStock(): Promise<LowStockRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_low_stock")
    .select("item_name, location_name, balance, reorder_point, base_unit")
    .order("item_name");

  return (data ?? []).map((row) => ({
    itemName: row.item_name,
    locationName: row.location_name,
    balance: toNumber(row.balance),
    reorderPoint: toNumber(row.reorder_point),
    baseUnit: row.base_unit,
  }));
}

export type MovementRow = {
  id: string;
  itemName: string;
  locationName: string;
  movementType: string;
  quantity: number;
  baseUnit: string;
  note: string | null;
  createdAt: string;
};

export async function loadRecentMovements(limit = 50): Promise<MovementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_movements")
    .select(
      "id, movement_type, quantity, note, created_at, inventory_items(name, base_unit), stock_locations(name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    itemName: row.inventory_items?.name ?? "Bilinmeyen ürün",
    locationName: row.stock_locations?.name ?? "Bilinmeyen lokasyon",
    movementType: row.movement_type,
    quantity: toNumber(row.quantity),
    baseUnit: row.inventory_items?.base_unit ?? "",
    note: row.note,
    createdAt: row.created_at,
  }));
}

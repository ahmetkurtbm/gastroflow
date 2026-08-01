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
    itemName: row.item_name ?? "Bilinmeyen kalem",
    locationName: row.location_name ?? "Bilinmeyen depo",
    balance: toNumber(row.balance),
    reorderPoint: toNumber(row.reorder_point),
    baseUnit: row.base_unit ?? "",
  }));
}

export type StockPickLists = {
  items: { id: string; name: string; baseUnit: string }[];
  locations: { id: string; name: string }[];
};

/** Zayiat/transfer/sayım formlarının dropdown'ları için ortak liste. */
export async function loadStockPickLists(): Promise<StockPickLists> {
  const supabase = await createClient();
  const [itemsResult, locationsResult] = await Promise.all([
    supabase.from("inventory_items").select("id, name, base_unit").eq("is_active", true).order("name"),
    supabase.from("stock_locations").select("id, name").eq("is_active", true).order("name"),
  ]);

  return {
    items: (itemsResult.data ?? []).map((i) => ({ id: i.id, name: i.name, baseUnit: i.base_unit })),
    locations: (locationsResult.data ?? []).map((l) => ({ id: l.id, name: l.name })),
  };
}

export type WasteRow = {
  id: string;
  itemName: string;
  locationName: string;
  quantity: number;
  baseUnit: string;
  reason: string;
  note: string | null;
  createdAt: string;
};

export async function loadRecentWaste(limit = 30): Promise<WasteRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_movements")
    .select(
      "id, quantity, waste_reason, note, created_at, inventory_items(name, base_unit), stock_locations(name)",
    )
    .eq("movement_type", "waste")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    itemName: row.inventory_items?.name ?? "Bilinmeyen ürün",
    locationName: row.stock_locations?.name ?? "Bilinmeyen lokasyon",
    quantity: toNumber(row.quantity),
    baseUnit: row.inventory_items?.base_unit ?? "",
    reason: row.waste_reason ?? "other",
    note: row.note,
    createdAt: row.created_at,
  }));
}

export type TransferRow = {
  id: string;
  itemName: string;
  baseUnit: string;
  quantity: number;
  fromLocationName: string;
  toLocationName: string;
  note: string | null;
  createdAt: string;
};

/**
 * `stock_movements`'ta bir transferin iki bacağı (`transfer_out` +
 * `transfer_in`) aynı `reference_id`'yi paylaşır — burada eşleştirip tek bir
 * "Depo A → Depo B" satırına dönüştürüyoruz (bkz. `recordTransfer`).
 */
export async function loadRecentTransfers(limit = 30): Promise<TransferRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_movements")
    .select(
      "reference_id, movement_type, quantity, note, created_at, inventory_items(name, base_unit), stock_locations(name)",
    )
    .in("reference_type", ["stock_transfer_out", "stock_transfer_in"])
    .order("created_at", { ascending: false })
    .limit(limit * 2);

  type Leg = NonNullable<typeof data>[number];
  const byRef = new Map<string, { out?: Leg; in?: Leg }>();
  for (const row of data ?? []) {
    if (!row.reference_id) continue;
    const entry = byRef.get(row.reference_id) ?? {};
    if (row.movement_type === "transfer_out") entry.out = row;
    else if (row.movement_type === "transfer_in") entry.in = row;
    byRef.set(row.reference_id, entry);
  }

  const rows: TransferRow[] = [];
  for (const [refId, entry] of byRef) {
    // Çift her iki bacakla da tam gelmeliydi; eksikse (ör. limit sınırı iki
    // bacağı ayırdıysa) satırı atla — yanlış/eksik bilgi göstermektense hiç
    // göstermemek daha güvenli.
    if (!entry.out || !entry.in) continue;
    rows.push({
      id: refId,
      itemName: entry.out.inventory_items?.name ?? "Bilinmeyen ürün",
      baseUnit: entry.out.inventory_items?.base_unit ?? "",
      quantity: toNumber(entry.in.quantity),
      fromLocationName: entry.out.stock_locations?.name ?? "Bilinmeyen lokasyon",
      toLocationName: entry.in.stock_locations?.name ?? "Bilinmeyen lokasyon",
      note: entry.out.note,
      createdAt: entry.out.created_at,
    });
  }

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
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

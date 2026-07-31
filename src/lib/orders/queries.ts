import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export type FloorTable = {
  id: string;
  name: string;
  seats: number;
  openOrder: {
    id: string;
    orderNo: number | null;
    openedAt: string;
    guestCount: number | null;
    total: number;
    pendingCount: number;
  } | null;
};

export type FloorArea = {
  id: string;
  name: string;
  tables: FloorTable[];
};

/**
 * Kat planı: alan → masa → (varsa) açık adisyon özeti.
 *
 * Tek sorguda toplam tutarı almak yerine satırları çekip burada topluyoruz;
 * sebep basit — masa sayısı bir restoranda onlarca, satır sayısı yüzlerce
 * değil, veritabanında agregasyon burada kazandıracak kadar veri yok.
 */
export async function loadFloorPlan(): Promise<FloorArea[]> {
  const supabase = await createClient();

  const [areasResult, tablesResult, ordersResult] = await Promise.all([
    supabase.from("areas").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("tables").select("id, name, seats, area_id").eq("is_active", true).order("name"),
    supabase
      .from("orders")
      .select(
        "id, table_id, order_no, opened_at, guest_count, order_lines(quantity, unit_price, status)",
      )
      .eq("status", "open"),
  ]);

  const orderByTable = new Map<string, FloorTable["openOrder"]>();
  for (const order of ordersResult.data ?? []) {
    if (!order.table_id) continue;
    const lines = order.order_lines ?? [];
    const total = lines.reduce(
      (sum, line) => sum + toNumber(line.quantity) * toNumber(line.unit_price),
      0,
    );
    orderByTable.set(order.table_id, {
      id: order.id,
      orderNo: order.order_no,
      openedAt: order.opened_at,
      guestCount: order.guest_count,
      total,
      pendingCount: lines.filter((l) => l.status === "pending").length,
    });
  }

  const tablesByArea = new Map<string | null, FloorTable[]>();
  for (const table of tablesResult.data ?? []) {
    const list = tablesByArea.get(table.area_id) ?? [];
    list.push({
      id: table.id,
      name: table.name,
      seats: table.seats,
      openOrder: orderByTable.get(table.id) ?? null,
    });
    tablesByArea.set(table.area_id, list);
  }

  return (areasResult.data ?? []).map((area) => ({
    id: area.id,
    name: area.name,
    tables: tablesByArea.get(area.id) ?? [],
  }));
}

export type MenuCategory = {
  id: string;
  name: string;
  items: { id: string; name: string; price: number | null }[];
};

/** POS'ta gösterilecek satılabilir ürünler; fiyatı olmayan ürün gösterilmez. */
export async function loadSellableMenu(branchId: string): Promise<MenuCategory[]> {
  const supabase = await createClient();

  const [categoriesResult, itemsResult, pricesResult] = await Promise.all([
    supabase.from("categories").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("menu_items").select("id, name, category_id").eq("is_active", true).order("sort_order"),
    supabase
      .from("menu_prices")
      .select("menu_item_id, price, branch_id, valid_from")
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
      .order("valid_from", { ascending: false }),
  ]);

  const priceByItem = new Map<string, number>();
  for (const row of pricesResult.data ?? []) {
    // Şubeye özel fiyat varsa onu tercih et; ilk görülen (en yeni) genel
    // fiyatı yalnızca şubeye özel bir tanesi henüz yoksa kullan.
    if (row.branch_id === branchId) {
      priceByItem.set(row.menu_item_id, toNumber(row.price));
    } else if (!priceByItem.has(row.menu_item_id)) {
      priceByItem.set(row.menu_item_id, toNumber(row.price));
    }
  }

  const itemsByCategory = new Map<string | null, MenuCategory["items"]>();
  for (const item of itemsResult.data ?? []) {
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push({ id: item.id, name: item.name, price: priceByItem.get(item.id) ?? null });
    itemsByCategory.set(item.category_id, list);
  }

  return (categoriesResult.data ?? [])
    .map((category) => ({
      id: category.id,
      name: category.name,
      items: (itemsByCategory.get(category.id) ?? []).filter((i) => i.price !== null),
    }))
    .filter((category) => category.items.length > 0);
}

export type OrderLineView = {
  id: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  status: string;
  note: string | null;
};

export type OrderView = {
  id: string;
  orderNo: number | null;
  tableId: string | null;
  tableName: string | null;
  guestCount: number | null;
  lines: OrderLineView[];
  total: number;
};

export async function loadOpenOrderForTable(tableId: string): Promise<OrderView | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_no, table_id, guest_count, tables(name), order_lines(id, quantity, unit_price, status, note, menu_items(name))",
    )
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle();

  if (!order) return null;

  const lines: OrderLineView[] = (order.order_lines ?? [])
    .map((line) => ({
      id: line.id,
      menuItemName: line.menu_items?.name ?? "Bilinmeyen ürün",
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unit_price),
      status: line.status,
      note: line.note,
    }))
    // Yeni eklenenler altta değil üstte görünsün; garson son eklediğini arar.
    .reverse();

  return {
    id: order.id,
    orderNo: order.order_no,
    tableId: order.table_id,
    tableName: order.tables?.name ?? null,
    guestCount: order.guest_count,
    lines,
    total: lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0),
  };
}

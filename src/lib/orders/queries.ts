import { createClient } from "@/lib/supabase/server";

import { effectiveUnitPrice } from "./types";
import type { MenuCategory, MenuModifierGroup, OrderLineView, OrderView } from "./types";

export type {
  MenuCategory,
  MenuModifier,
  MenuModifierGroup,
  OrderLineModifierView,
  OrderLineView,
  OrderView,
} from "./types";
export { effectiveUnitPrice } from "./types";

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
        "id, table_id, order_no, opened_at, guest_count, order_lines(quantity, unit_price, status, order_line_modifiers(price_delta))",
      )
      .eq("status", "open"),
  ]);

  const orderByTable = new Map<string, FloorTable["openOrder"]>();
  for (const order of ordersResult.data ?? []) {
    if (!order.table_id) continue;
    const lines = order.order_lines ?? [];
    const total = lines.reduce((sum, line) => {
      const modifierTotal = (line.order_line_modifiers ?? []).reduce(
        (s, m) => s + toNumber(m.price_delta),
        0,
      );
      return sum + toNumber(line.quantity) * (toNumber(line.unit_price) + modifierTotal);
    }, 0);
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

/** POS'ta gösterilecek satılabilir ürünler; fiyatı olmayan ürün gösterilmez. */
export async function loadSellableMenu(branchId: string): Promise<MenuCategory[]> {
  const supabase = await createClient();

  const [categoriesResult, itemsResult, pricesResult] = await Promise.all([
    supabase.from("categories").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase
      .from("menu_items")
      .select(
        "id, name, category_id, modifier_groups(id, name, min_select, max_select, sort_order, modifiers(id, name, price_delta, sort_order, is_active))",
      )
      .eq("is_active", true)
      .order("sort_order"),
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
    const modifierGroups: MenuModifierGroup[] = [...(item.modifier_groups ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((group) => ({
        id: group.id,
        name: group.name,
        minSelect: group.min_select,
        maxSelect: group.max_select,
        modifiers: [...(group.modifiers ?? [])]
          .filter((m) => m.is_active)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((m) => ({ id: m.id, name: m.name, priceDelta: toNumber(m.price_delta) })),
      }))
      // Seçeneği olmayan grup POS'ta gösterilemez.
      .filter((group) => group.modifiers.length > 0);

    list.push({
      id: item.id,
      name: item.name,
      price: priceByItem.get(item.id) ?? null,
      modifierGroups,
    });
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

export async function loadOpenOrderForTable(tableId: string): Promise<OrderView | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_no, table_id, guest_count, tables(name), order_lines(id, quantity, unit_price, status, note, menu_items(name), order_line_modifiers(name, price_delta))",
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
      modifiers: (line.order_line_modifiers ?? []).map((m) => ({
        name: m.name,
        priceDelta: toNumber(m.price_delta),
      })),
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
    total: lines.reduce((sum, l) => sum + l.quantity * effectiveUnitPrice(l), 0),
  };
}

export type KitchenTicket = {
  id: string;
  menuItemName: string;
  quantity: number;
  /** Modifier adları, virgülle ayrılmış (ör. "Büyük boy"). Mutfağın hangi
   * boy/varyantı hazırlayacağını bilmesi için — fiyat farkı burada önemsiz,
   * yalnızca ad gösterilir. */
  modifierSummary: string | null;
  note: string | null;
  status: "sent" | "preparing" | "ready";
  tableName: string | null;
  orderNo: number | null;
  /** ISO zaman damgası. Süre sayacı bunu kullanır; sorgu yalnızca
   * gönderilmiş satırları getirdiği için null olamaz. */
  sentAt: string;
};

/**
 * Mutfak kuyruğu: gönderilmiş ama henüz servis edilmemiş satırlar.
 *
 * `sent_at` sıralı — mutfak en eski siparişi en üstte görmeli, aksi hâlde
 * en yeni sipariş sürekli önce hazırlanır ve eski sipariş unutulur.
 */
export async function loadKitchenQueue(): Promise<KitchenTicket[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("order_lines")
    .select(
      "id, quantity, note, status, sent_at, menu_items(name), orders(order_no, tables(name)), order_line_modifiers(name)",
    )
    .in("status", ["sent", "preparing", "ready"])
    .order("sent_at", { ascending: true });

  return (data ?? []).map((line) => ({
    id: line.id,
    menuItemName: line.menu_items?.name ?? "Bilinmeyen ürün",
    quantity: toNumber(line.quantity),
    modifierSummary:
      (line.order_line_modifiers ?? []).length > 0
        ? line.order_line_modifiers.map((m) => m.name).join(", ")
        : null,
    note: line.note,
    status: line.status as KitchenTicket["status"],
    tableName: line.orders?.tables?.name ?? null,
    orderNo: line.orders?.order_no ?? null,
    sentAt: line.sent_at as string,
  }));
}

export type OrderTrackingLine = {
  id: string;
  menuItemName: string;
  quantity: number;
  status: string;
  sentAt: string | null;
};

export type OrderTrackingSummary = {
  id: string;
  orderNo: number | null;
  tableId: string | null;
  tableName: string | null;
  guestCount: number | null;
  openedAt: string;
  total: number;
  lines: OrderTrackingLine[];
};

/**
 * `/orders` sipariş takip ekranı için açık adisyonların özeti.
 *
 * RLS zaten şube kısıtını uyguluyor (`orders_select`): garson yalnızca
 * kendi şubesinin adisyonlarını görür, müdür/patron hepsini görür — burada
 * ayrıca rol filtresi eklemiyoruz, veritabanı sınırı zaten yeterli.
 */
export async function loadOpenOrdersTracking(): Promise<OrderTrackingSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_no, table_id, guest_count, opened_at, tables(name), order_lines(id, quantity, unit_price, status, sent_at, menu_items(name), order_line_modifiers(price_delta))",
    )
    .eq("status", "open")
    .order("opened_at", { ascending: true });

  return (data ?? []).map((order) => {
    const lines = order.order_lines ?? [];
    const total = lines.reduce((sum, line) => {
      const modifierTotal = (line.order_line_modifiers ?? []).reduce(
        (s, m) => s + toNumber(m.price_delta),
        0,
      );
      return sum + toNumber(line.quantity) * (toNumber(line.unit_price) + modifierTotal);
    }, 0);

    return {
      id: order.id,
      orderNo: order.order_no,
      tableId: order.table_id,
      tableName: order.tables?.name ?? null,
      guestCount: order.guest_count,
      openedAt: order.opened_at,
      total,
      lines: lines.map((line) => ({
        id: line.id,
        menuItemName: line.menu_items?.name ?? "Bilinmeyen ürün",
        quantity: toNumber(line.quantity),
        status: line.status,
        sentAt: line.sent_at,
      })),
    };
  });
}

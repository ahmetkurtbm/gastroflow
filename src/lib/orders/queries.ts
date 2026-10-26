import { currentPrices } from "@/core/pricing";
import { createClient } from "@/lib/db/client";

import { applyLineDiscount, lineTotal, pickActiveDiscount } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
import type { LineDiscountView, MenuCategory, MenuModifierGroup, OrderLineView, OrderView } from "./types";

export type {
  LineDiscountView,
  MenuCategory,
  MenuModifier,
  MenuModifierGroup,
  OrderLineModifierView,
  OrderLineView,
  OrderView,
} from "./types";
export { effectiveUnitPrice, lineTotal } from "./types";

const DISCOUNT_SELECT = "line_discounts(id, kind, value, status, reason, created_at)";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export type FloorTable = {
  id: string;
  name: string;
  seats: number;
  posX: number | null;
  posY: number | null;
  isVertical: boolean;
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

/** Kat planı: alan → masa → (varsa) açık adisyon özeti. */
export async function loadFloorPlan(): Promise<FloorArea[]> {
  const supabase = await createClient();

  const [areasResult, tablesResult, ordersResult] = await Promise.all([
    supabase.from("areas").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    supabase
      .from("tables")
      .select("id, name, seats, area_id, pos_x, pos_y, is_vertical")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("orders")
      .select(
        `id, table_id, order_no, opened_at, guest_count, order_lines(quantity, unit_price, status, order_line_modifiers(price_delta), ${DISCOUNT_SELECT})`,
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
      const base = toNumber(line.quantity) * (toNumber(line.unit_price) + modifierTotal);
      return sum + applyLineDiscount(base, pickActiveDiscount(line.line_discounts ?? []));
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
      posX: table.pos_x === null ? null : Number(table.pos_x),
      posY: table.pos_y === null ? null : Number(table.pos_y),
      isVertical: table.is_vertical,
      openOrder: orderByTable.get(table.id) ?? null,
    });
    tablesByArea.set(table.area_id, list);
  }

  const areas = (areasResult.data ?? []).map((area) => ({
    id: area.id,
    name: area.name,
    tables: tablesByArea.get(area.id) ?? [],
  }));

  // Alanı silinmiş masalar (area_id null) ayrı bir grupta gösterilir.
  const unassigned = tablesByArea.get(null) ?? [];
  if (unassigned.length > 0) {
    areas.push({ id: "unassigned", name: "Diğer", tables: unassigned });
  }

  return areas;
}

/**
 * POS'ta gösterilecek satılabilir ürünler; fiyatı olmayan ürün gösterilmez.
 *
 * QR sipariş ekranı bunu oturumsuz, RLS'i atlayan servis istemcisiyle çağırır;
 * o yüzden `scope` verildiğinde kiracı filtresi zorunludur.
 */
export async function loadSellableMenu(
  branchId: string,
  scope?: { client: SupabaseClient; tenantId: string },
): Promise<MenuCategory[]> {
  const supabase = scope?.client ?? (await createClient());

  let categoriesQuery = supabase.from("categories").select("id, name, sort_order").eq("is_active", true);
  let itemsQuery = supabase
    .from("menu_items")
    .select(
      "id, name, category_id, image_url, modifier_groups(id, name, min_select, max_select, sort_order, modifiers(id, name, price_delta, sort_order, is_active))",
    )
    .eq("is_active", true);
  let pricesQuery = supabase
    .from("menu_prices")
    .select("menu_item_id, price, branch_id, valid_from")
    .or(`branch_id.eq.${branchId},branch_id.is.null`);

  if (scope) {
    categoriesQuery = categoriesQuery.eq("tenant_id", scope.tenantId);
    itemsQuery = itemsQuery.eq("tenant_id", scope.tenantId);
    pricesQuery = pricesQuery.eq("tenant_id", scope.tenantId);
  }

  const [categoriesResult, itemsResult, pricesResult] = await Promise.all([
    categoriesQuery.order("sort_order"),
    itemsQuery.order("sort_order"),
    pricesQuery,
  ]);

  const priceByItem = currentPrices(pricesResult.data ?? [], branchId);

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
      price: priceByItem.get(item.id)?.price ?? null,
      modifierGroups,
      imageUrl: item.image_url,
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
      `id, order_no, table_id, guest_count, tables(name), order_lines(id, quantity, unit_price, status, note, menu_items(name), order_line_modifiers(name, price_delta), ${DISCOUNT_SELECT})`,
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
      discount: pickActiveDiscount(line.line_discounts ?? []),
    }))
    .reverse();

  return {
    id: order.id,
    orderNo: order.order_no,
    tableId: order.table_id,
    tableName: order.tables?.name ?? null,
    guestCount: order.guest_count,
    lines,
    total: lines.reduce((sum, l) => sum + lineTotal(l), 0),
  };
}

/** `loadOpenOrderForTable`'ın masasız (Gel Al / Self Servis) karşılığı. */
export async function loadOpenOrderById(orderId: string): Promise<OrderView | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, order_no, table_id, guest_count, tables(name), order_lines(id, quantity, unit_price, status, note, menu_items(name), order_line_modifiers(name, price_delta), ${DISCOUNT_SELECT})`,
    )
    .eq("id", orderId)
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
      discount: pickActiveDiscount(line.line_discounts ?? []),
    }))
    .reverse();

  return {
    id: order.id,
    orderNo: order.order_no,
    tableId: order.table_id,
    tableName: order.tables?.name ?? null,
    guestCount: order.guest_count,
    lines,
    total: lines.reduce((sum, l) => sum + lineTotal(l), 0),
  };
}

export type ChannelOrderSummary = {
  id: string;
  orderNo: number | null;
  channel: "takeaway" | "self_service";
  openedAt: string;
  total: number;
};

/** Salon ekranında "devam et" olarak listelenecek, masasız açık siparişler. */
export async function loadOpenChannelOrders(): Promise<ChannelOrderSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      `id, order_no, channel, opened_at, order_lines(quantity, unit_price, status, order_line_modifiers(price_delta), ${DISCOUNT_SELECT})`,
    )
    .is("table_id", null)
    .eq("status", "open")
    .order("opened_at", { ascending: false });

  return (data ?? [])
    .filter((o): o is typeof o & { channel: "takeaway" | "self_service" } =>
      o.channel === "takeaway" || o.channel === "self_service",
    )
    .map((order) => {
      const lines = order.order_lines ?? [];
      const total = lines.reduce((sum, line) => {
        const modifierTotal = (line.order_line_modifiers ?? []).reduce(
          (s, m) => s + toNumber(m.price_delta),
          0,
        );
        const base = toNumber(line.quantity) * (toNumber(line.unit_price) + modifierTotal);
        return sum + applyLineDiscount(base, pickActiveDiscount(line.line_discounts ?? []));
      }, 0);

      return {
        id: order.id,
        orderNo: order.order_no,
        channel: order.channel,
        openedAt: order.opened_at,
        total,
      };
    });
}

export type KitchenTicket = {
  id: string;
  menuItemName: string;
  quantity: number;
  /** Modifier adları, virgülle ayrılmış (ör. "Büyük boy"). */
  modifierSummary: string | null;
  note: string | null;
  status: "sent" | "preparing" | "ready";
  tableName: string | null;
  orderNo: number | null;
  /** ISO zaman damgası; yalnızca gönderilmiş satırlar geldiği için null olamaz. */
  sentAt: string;
};

/** Mutfak kuyruğu: gönderilmiş ama servis edilmemiş satırlar, en eskisi üstte. */
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
  discount: LineDiscountView | null;
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

/** `/orders` ekranı için açık adisyon özeti; şube kısıtı RLS'tedir. */
export async function loadOpenOrdersTracking(): Promise<OrderTrackingSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      `id, order_no, table_id, guest_count, opened_at, tables(name), order_lines(id, quantity, unit_price, status, sent_at, menu_items(name), order_line_modifiers(price_delta), ${DISCOUNT_SELECT})`,
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
      const base = toNumber(line.quantity) * (toNumber(line.unit_price) + modifierTotal);
      return sum + applyLineDiscount(base, pickActiveDiscount(line.line_discounts ?? []));
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
        discount: pickActiveDiscount(line.line_discounts ?? []),
      })),
    };
  });
}

export type PendingDiscountRequest = {
  id: string;
  kind: "comp" | "percent" | "amount";
  value: number;
  reason: string;
  createdAt: string;
  requestedByName: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  tableName: string | null;
  orderNo: number | null;
};

/**
 * `/approvals` için bekleyen ikram/iskonto istekleri. `requested_by` auth.users'a
 * bağlı olduğu için istekçi adı ayrı sorguyla eşleştirilir.
 */
export async function loadPendingDiscounts(): Promise<PendingDiscountRequest[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("line_discounts")
    .select(
      "id, kind, value, reason, created_at, requested_by, order_lines(quantity, unit_price, menu_items(name), orders(order_no, tables(name)))",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const requests = data ?? [];
  const requesterIds = [...new Set(requests.map((r) => r.requested_by))];

  const namesById = new Map<string, string>();
  if (requesterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", requesterIds);
    for (const p of profiles ?? []) namesById.set(p.id, p.full_name);
  }

  return requests.map((r) => ({
    id: r.id,
    kind: r.kind,
    value: toNumber(r.value),
    reason: r.reason,
    createdAt: r.created_at,
    requestedByName: namesById.get(r.requested_by) ?? "Bilinmeyen personel",
    menuItemName: r.order_lines?.menu_items?.name ?? "Bilinmeyen ürün",
    quantity: toNumber(r.order_lines?.quantity),
    unitPrice: toNumber(r.order_lines?.unit_price),
    tableName: r.order_lines?.orders?.tables?.name ?? null,
    orderNo: r.order_lines?.orders?.order_no ?? null,
  }));
}

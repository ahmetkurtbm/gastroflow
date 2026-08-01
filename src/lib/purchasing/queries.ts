import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export type SupplierRow = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  leadTimeDays: number;
  isActive: boolean;
  itemCount: number;
};

export async function loadSuppliers(): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id, name, contact_name, phone, email, lead_time_days, is_active, supplier_items(count)")
    .order("name");

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    contactName: s.contact_name,
    phone: s.phone,
    email: s.email,
    leadTimeDays: s.lead_time_days,
    isActive: s.is_active,
    itemCount: s.supplier_items?.[0]?.count ?? 0,
  }));
}

export type SupplierItemRow = {
  id: string;
  itemId: string;
  itemName: string;
  baseUnit: string;
  supplierSku: string | null;
  price: number;
  minOrderQuantity: number;
};

export async function loadSupplierItems(supplierId: string): Promise<SupplierItemRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supplier_items")
    .select("id, supplier_sku, price, min_order_quantity, inventory_items(id, name, base_unit)")
    .eq("supplier_id", supplierId)
    .order("id");

  return (data ?? []).map((r) => ({
    id: r.id,
    itemId: r.inventory_items?.id ?? "",
    itemName: r.inventory_items?.name ?? "Bilinmeyen ürün",
    baseUnit: r.inventory_items?.base_unit ?? "",
    supplierSku: r.supplier_sku,
    price: toNumber(r.price),
    minOrderQuantity: toNumber(r.min_order_quantity),
  }));
}

export type ReorderSuggestion = {
  itemId: string;
  itemName: string;
  baseUnit: string;
  locationName: string;
  balance: number;
  reorderPoint: number;
  suggestedQuantity: number;
  supplierId: string | null;
  supplierName: string | null;
  unitPrice: number | null;
};

/**
 * Kritik seviyenin altındaki ürünler + (varsa) tedarikçi/fiyat önerisi.
 *
 * Önerilen miktar = par_level'daki üst sınıra (varsa) ya da eşiğin iki
 * katına tamamlayacak kadar. Birden fazla tedarikçisi olan bir üründe İLK
 * bulunan tercih ediliyor — çoklu tedarikçi kıyaslaması (en ucuz/en hızlı)
 * kapsam dışı, tek-tedarikçili küçük işletme senaryosu için yeterli.
 */
export async function loadReorderSuggestions(): Promise<ReorderSuggestion[]> {
  const supabase = await createClient();
  const [lowStockResult, parLevelsResult, supplierItemsResult] = await Promise.all([
    supabase
      .from("v_low_stock")
      .select("inventory_item_id, item_name, location_id, location_name, balance, reorder_point, base_unit"),
    supabase.from("par_levels").select("inventory_item_id, location_id, max_quantity"),
    supabase.from("supplier_items").select("inventory_item_id, supplier_id, price, suppliers(name)"),
  ]);

  const maxByKey = new Map(
    (parLevelsResult.data ?? []).map((p) => [
      `${p.location_id}:${p.inventory_item_id}`,
      p.max_quantity !== null ? toNumber(p.max_quantity) : null,
    ]),
  );

  const supplierByItem = new Map<string, { supplierId: string; supplierName: string; price: number }>();
  for (const si of supplierItemsResult.data ?? []) {
    if (!supplierByItem.has(si.inventory_item_id)) {
      supplierByItem.set(si.inventory_item_id, {
        supplierId: si.supplier_id,
        supplierName: si.suppliers?.name ?? "Bilinmeyen tedarikçi",
        price: toNumber(si.price),
      });
    }
  }

  const withItemId = (lowStockResult.data ?? []).filter(
    (row): row is typeof row & { inventory_item_id: string } => row.inventory_item_id !== null,
  );

  return withItemId.map((row) => {
    const balance = toNumber(row.balance);
    const reorderPoint = toNumber(row.reorder_point);
    const max = maxByKey.get(`${row.location_id}:${row.inventory_item_id}`) ?? reorderPoint * 2;
    const supplier = supplierByItem.get(row.inventory_item_id) ?? null;

    return {
      itemId: row.inventory_item_id,
      itemName: row.item_name ?? "Bilinmeyen ürün",
      baseUnit: row.base_unit ?? "",
      locationName: row.location_name ?? "Bilinmeyen lokasyon",
      balance,
      reorderPoint,
      suggestedQuantity: Math.max(0, max - balance),
      supplierId: supplier?.supplierId ?? null,
      supplierName: supplier?.supplierName ?? null,
      unitPrice: supplier?.price ?? null,
    };
  });
}

export type PurchaseOrderRow = {
  id: string;
  supplierName: string;
  status: string;
  requestedAt: string;
  lineCount: number;
  totalAmount: number;
};

export async function loadPurchaseOrders(limit = 30): Promise<PurchaseOrderRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select("id, status, requested_at, suppliers(name), po_lines(quantity, unit_price)")
    .order("requested_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((po) => ({
    id: po.id,
    supplierName: po.suppliers?.name ?? "Bilinmeyen tedarikçi",
    status: po.status,
    requestedAt: po.requested_at,
    lineCount: (po.po_lines ?? []).length,
    totalAmount: (po.po_lines ?? []).reduce((s, l) => s + toNumber(l.quantity) * toNumber(l.unit_price), 0),
  }));
}

export type PurchaseOrderDetail = {
  id: string;
  status: string;
  supplierId: string;
  supplierName: string;
  supplierLeadTimeDays: number;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  receivedByName: string | null;
  receivedAt: string | null;
  note: string | null;
  lines: {
    id: string;
    itemId: string;
    itemName: string;
    baseUnit: string;
    quantity: number;
    unitPrice: number;
    receivedQuantity: number | null;
  }[];
  totalAmount: number;
};

export async function loadPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  const supabase = await createClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select(
      "id, status, note, requested_by, requested_at, decided_by, decided_at, received_by, received_at, suppliers(id, name, lead_time_days), po_lines(id, inventory_item_id, quantity, unit_price, received_quantity, inventory_items(name, base_unit))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!po) return null;

  const userIds = [po.requested_by, po.decided_by, po.received_by].filter(
    (x): x is string => !!x,
  );
  const namesById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    for (const p of profiles ?? []) namesById.set(p.id, p.full_name);
  }

  const lines = (po.po_lines ?? []).map((l) => ({
    id: l.id,
    itemId: l.inventory_item_id,
    itemName: l.inventory_items?.name ?? "Bilinmeyen ürün",
    baseUnit: l.inventory_items?.base_unit ?? "",
    quantity: toNumber(l.quantity),
    unitPrice: toNumber(l.unit_price),
    receivedQuantity: l.received_quantity !== null ? toNumber(l.received_quantity) : null,
  }));

  return {
    id: po.id,
    status: po.status,
    supplierId: po.suppliers?.id ?? "",
    supplierName: po.suppliers?.name ?? "Bilinmeyen tedarikçi",
    supplierLeadTimeDays: po.suppliers?.lead_time_days ?? 0,
    requestedByName: namesById.get(po.requested_by) ?? "Bilinmeyen personel",
    requestedAt: po.requested_at,
    decidedByName: po.decided_by ? (namesById.get(po.decided_by) ?? "Bilinmeyen personel") : null,
    decidedAt: po.decided_at,
    receivedByName: po.received_by ? (namesById.get(po.received_by) ?? "Bilinmeyen personel") : null,
    receivedAt: po.received_at,
    note: po.note,
    lines,
    totalAmount: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
  };
}

export type PendingPurchaseOrder = {
  id: string;
  supplierName: string;
  requestedByName: string;
  requestedAt: string;
  totalAmount: number;
};

/** `/m` mobil panelindeki "bekleyen onaylar" akışı için — yalnızca onay bekleyenler. */
export async function loadPendingPurchaseOrders(): Promise<PendingPurchaseOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select("id, requested_by, requested_at, suppliers(name), po_lines(quantity, unit_price)")
    .eq("status", "pending_approval")
    .order("requested_at", { ascending: true });

  const rows = data ?? [];
  const requesterIds = [...new Set(rows.map((r) => r.requested_by))];
  const namesById = new Map<string, string>();
  if (requesterIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", requesterIds);
    for (const p of profiles ?? []) namesById.set(p.id, p.full_name);
  }

  return rows.map((po) => ({
    id: po.id,
    supplierName: po.suppliers?.name ?? "Bilinmeyen tedarikçi",
    requestedByName: namesById.get(po.requested_by) ?? "Bilinmeyen personel",
    requestedAt: po.requested_at,
    totalAmount: (po.po_lines ?? []).reduce((s, l) => s + toNumber(l.quantity) * toNumber(l.unit_price), 0),
  }));
}

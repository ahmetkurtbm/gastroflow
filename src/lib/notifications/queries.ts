import { createClient } from "@/lib/supabase/server";

export const EVENT_TYPES = [
  "low_stock",
  "negative_stock",
  "approval_pending",
  "po_approved",
  "cash_shortage",
  "day_end_summary",
  "weekly_cost_report",
] as const;

export type NotificationEventType = (typeof EVENT_TYPES)[number];

export const DEFAULT_RECIPIENT_ROLES: Record<NotificationEventType, string[]> = {
  low_stock: ["storekeeper", "manager"],
  negative_stock: ["manager", "owner"],
  approval_pending: ["manager", "owner"],
  po_approved: ["storekeeper"],
  cash_shortage: ["owner"],
  day_end_summary: ["owner", "accountant"],
  weekly_cost_report: ["owner"],
};

export type NotificationRuleRow = {
  eventType: NotificationEventType;
  isEnabled: boolean;
  recipientRoles: string[];
  /** Tenant hiç kural kaydetmediyse varsayılan roller gösteriliyor — bu satır DB'de yok. */
  isDefault: boolean;
};

/**
 * Yedi olay tipinin tümü için bir satır döner — tenant bazı olaylar için
 * kural kaydetmemiş olabilir, o durumda varsayılan roller gösterilir.
 * Ayarlar ekranında "hiç yapılandırılmamış" ile "boş alıcı listesiyle
 * kapatılmış" arasındaki fark böyle görünür kalır.
 */
export async function loadNotificationRules(): Promise<NotificationRuleRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_rules")
    .select("event_type, is_enabled, recipient_roles");

  const byEvent = new Map(
    (data ?? []).map((r) => [
      r.event_type as NotificationEventType,
      { isEnabled: r.is_enabled, recipientRoles: r.recipient_roles },
    ]),
  );

  return EVENT_TYPES.map((eventType) => {
    const existing = byEvent.get(eventType);
    if (existing) {
      return {
        eventType,
        isEnabled: existing.isEnabled,
        recipientRoles: existing.recipientRoles,
        isDefault: false,
      };
    }
    return {
      eventType,
      isEnabled: true,
      recipientRoles: DEFAULT_RECIPIENT_ROLES[eventType],
      isDefault: true,
    };
  });
}

export type OutboxRow = {
  id: string;
  eventType: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
};

export async function loadRecentOutbox(limit = 30): Promise<OutboxRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_outbox")
    .select("id, event_type, status, created_at, processed_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    status: r.status,
    createdAt: r.created_at,
    processedAt: r.processed_at,
  }));
}

export type LogRow = {
  id: string;
  eventType: string;
  recipientEmail: string;
  recipientRole: string | null;
  subject: string;
  body: string;
  status: string;
  error: string | null;
  sentAt: string;
};

export async function loadRecentNotificationLog(limit = 30): Promise<LogRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_log")
    .select("id, event_type, recipient_email, recipient_role, subject, body, status, error, sent_at")
    .order("sent_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    recipientEmail: r.recipient_email,
    recipientRole: r.recipient_role,
    subject: r.subject,
    body: r.body,
    status: r.status,
    error: r.error,
    sentAt: r.sent_at,
  }));
}

export type AlertRow = {
  id: string;
  eventType: NotificationEventType;
  status: string;
  createdAt: string;
  title: string;
  detail: string;
};

const ALERT_TITLE: Record<NotificationEventType, string> = {
  low_stock: "Kritik stok",
  negative_stock: "Negatif stok",
  approval_pending: "Onay bekliyor",
  po_approved: "Sipariş onaylandı",
  cash_shortage: "Kasa sayım farkı",
  day_end_summary: "Gün sonu özeti",
  weekly_cost_report: "Haftalık maliyet raporu",
};

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

/**
 * `/m` mobil panelindeki olay akışı — `notification_outbox`'ı olduğu gibi
 * gösteriyor (ayrı bir "olay geçmişi" tablosu yok, ihtiyaç da yok: outbox
 * zaten "neler oldu"nun tam kaydı, bkz. Faz 5). Ürün/lokasyon/tedarikçi
 * adlarını payload'daki kimliklerden toplu (N+1 değil) çözüyor.
 */
export async function loadRecentAlerts(limit = 15): Promise<AlertRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_outbox")
    .select("id, event_type, status, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = data ?? [];

  const itemIds = new Set<string>();
  const locationIds = new Set<string>();
  const supplierIds = new Set<string>();
  for (const r of rows) {
    const p = r.payload as Record<string, unknown>;
    if (typeof p.itemId === "string") itemIds.add(p.itemId);
    if (typeof p.locationId === "string") locationIds.add(p.locationId);
    if (typeof p.supplierId === "string") supplierIds.add(p.supplierId);
  }

  const [itemsResult, locationsResult, suppliersResult] = await Promise.all([
    itemIds.size > 0
      ? supabase.from("inventory_items").select("id, name, base_unit").in("id", [...itemIds])
      : Promise.resolve({ data: [] as { id: string; name: string; base_unit: string }[] }),
    locationIds.size > 0
      ? supabase.from("stock_locations").select("id, name").in("id", [...locationIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supplierIds.size > 0
      ? supabase.from("suppliers").select("id, name").in("id", [...supplierIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const itemById = new Map((itemsResult.data ?? []).map((i) => [i.id, i]));
  const locationById = new Map((locationsResult.data ?? []).map((l) => [l.id, l.name]));
  const supplierById = new Map((suppliersResult.data ?? []).map((s) => [s.id, s.name]));

  return rows.map((r) => {
    const eventType = r.event_type as NotificationEventType;
    const p = r.payload as Record<string, unknown>;
    let detail = "";

    switch (eventType) {
      case "low_stock":
      case "negative_stock": {
        const item = typeof p.itemId === "string" ? itemById.get(p.itemId) : undefined;
        const locationName =
          typeof p.locationId === "string" ? (locationById.get(p.locationId) ?? "Bilinmeyen lokasyon") : "";
        const balance = typeof p.balance === "number" ? p.balance : Number(p.balance ?? 0);
        detail = `${item?.name ?? "Bilinmeyen ürün"} (${locationName}) — bakiye ${balance} ${item?.base_unit ?? ""}`;
        break;
      }
      case "approval_pending":
        detail =
          p.kind === "purchase_order"
            ? `Satın alma siparişi${
                typeof p.supplierId === "string" ? ` — ${supplierById.get(p.supplierId) ?? "Bilinmeyen tedarikçi"}` : ""
              }`
            : "İkram/indirim isteği";
        break;
      case "po_approved":
        detail =
          typeof p.supplierId === "string"
            ? `${supplierById.get(p.supplierId) ?? "Bilinmeyen tedarikçi"} siparişi onaylandı`
            : "Sipariş onaylandı";
        break;
      case "cash_shortage": {
        const diff = typeof p.diff === "number" ? p.diff : Number(p.diff ?? 0);
        detail = `Fark: ${diff > 0 ? "+" : ""}${formatLira(diff)}`;
        break;
      }
      case "day_end_summary":
        detail = "Bir kasa oturumu kapandı";
        break;
      case "weekly_cost_report":
        detail = "Haftalık rapor hazır";
        break;
    }

    return {
      id: r.id,
      eventType,
      status: r.status,
      createdAt: r.created_at,
      title: ALERT_TITLE[eventType] ?? eventType,
      detail,
    };
  });
}

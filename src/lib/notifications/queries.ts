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

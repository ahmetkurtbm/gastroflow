// =============================================================================
// process-notifications — bildirim kuyruğu işleyicisi (MOCK gönderici)
// =============================================================================
// `notification_outbox`'taki `pending` satırları alır, alıcıları
// `notification_rules` (yoksa makul varsayılan roller) üzerinden çözer,
// ve GERÇEKTEN MAIL GÖNDERMEDEN `notification_log`'a "gönderilmiş gibi"
// yazar. Gerçek gönderim (Resend vb.) eklenince değişecek TEK yer burası —
// şema ve tetikleyiciler hiç değişmeyecek.
//
// service_role ile çalışır: RLS'i bilerek atlıyor (bu bir arka plan
// işçisi, kullanıcı oturumu yok) ama yalnızca bu iki tabloya dokunuyor.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

type EventType =
  | "low_stock"
  | "negative_stock"
  | "approval_pending"
  | "po_approved"
  | "cash_shortage"
  | "day_end_summary"
  | "weekly_cost_report";

// Plan §7'deki olay → varsayılan alıcı tablosu. Bir tenant kendi
// notification_rules satırını eklerse o öncelikli, eklemezse bu geçerli.
const DEFAULT_RECIPIENT_ROLES: Record<EventType, string[]> = {
  low_stock: ["storekeeper", "manager"],
  negative_stock: ["manager", "owner"],
  approval_pending: ["manager", "owner"],
  po_approved: ["storekeeper"],
  cash_shortage: ["owner"],
  day_end_summary: ["owner", "accountant"],
  weekly_cost_report: ["owner"],
};

function money(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: pending, error: pendingError } = await supabase
    .from("notification_outbox")
    .select("id, tenant_id, event_type, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (pendingError) {
    return new Response(JSON.stringify({ error: pendingError.message }), { status: 500 });
  }

  let processed = 0;
  let sentEmails = 0;

  for (const item of pending ?? []) {
    const eventType = item.event_type as EventType;
    const payload = (item.payload ?? {}) as Record<string, unknown>;

    const { data: rule } = await supabase
      .from("notification_rules")
      .select("is_enabled, recipient_roles")
      .eq("tenant_id", item.tenant_id)
      .eq("event_type", eventType)
      .maybeSingle();

    if (rule && rule.is_enabled === false) {
      // Kural bilerek kapatılmış — kuyruktan düş, hiç göndermeye çalışma.
      await supabase
        .from("notification_outbox")
        .update({ status: "sent", processed_at: new Date().toISOString() })
        .eq("id", item.id);
      processed++;
      continue;
    }

    const roles =
      rule?.recipient_roles && rule.recipient_roles.length > 0
        ? rule.recipient_roles
        : DEFAULT_RECIPIENT_ROLES[eventType];

    const recipients: { email: string; role: string }[] = [];
    if (roles.length > 0) {
      const { data: members } = await supabase
        .from("memberships")
        .select("user_id, role")
        .eq("tenant_id", item.tenant_id)
        .eq("is_active", true)
        .in("role", roles);

      for (const m of members ?? []) {
        const { data: userResult } = await supabase.auth.admin.getUserById(m.user_id);
        const email = userResult?.user?.email;
        if (email) recipients.push({ email, role: m.role });
      }
    }

    const { subject, body } = await renderTemplate(supabase, eventType, payload);

    if (recipients.length === 0) {
      await supabase.from("notification_log").insert({
        tenant_id: item.tenant_id,
        outbox_id: item.id,
        event_type: eventType,
        recipient_email: "(alıcı yok)",
        recipient_role: null,
        subject,
        body,
        status: "failed",
        error: "Bu olay için etkin bir bildirim kuralı/alıcı bulunamadı.",
      });
      await supabase
        .from("notification_outbox")
        .update({ status: "failed", processed_at: new Date().toISOString(), attempts: 1 })
        .eq("id", item.id);
      processed++;
      continue;
    }

    for (const r of recipients) {
      // MOCK: burada gerçek bir mail servisi (ör. Resend) çağrılacaktı.
      // Şimdilik "gönderilseydi ne olurdu" kaydı düşülüyor.
      await supabase.from("notification_log").insert({
        tenant_id: item.tenant_id,
        outbox_id: item.id,
        event_type: eventType,
        recipient_email: r.email,
        recipient_role: r.role,
        subject,
        body,
        status: "sent",
      });
      sentEmails++;
    }

    await supabase
      .from("notification_outbox")
      .update({ status: "sent", processed_at: new Date().toISOString(), attempts: 1 })
      .eq("id", item.id);
    processed++;
  }

  return new Response(JSON.stringify({ processed, sentEmails }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function renderTemplate(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  eventType: EventType,
  payload: Record<string, unknown>,
): Promise<{ subject: string; body: string }> {
  switch (eventType) {
    case "low_stock":
    case "negative_stock": {
      const [{ data: item }, { data: location }] = await Promise.all([
        supabase.from("inventory_items").select("name, base_unit").eq("id", payload.itemId).maybeSingle(),
        supabase.from("stock_locations").select("name").eq("id", payload.locationId).maybeSingle(),
      ]);
      const itemName = item?.name ?? "Bilinmeyen ürün";
      const locationName = location?.name ?? "Bilinmeyen lokasyon";
      const balance = Number(payload.balance ?? 0);
      const unit = item?.base_unit ?? "";
      if (eventType === "negative_stock") {
        return {
          subject: `Negatif stok: ${itemName}`,
          body: `${itemName} (${locationName}) bakiyesi ${balance} ${unit} — negatife düştü. Ledger'ı kontrol et.`,
        };
      }
      return {
        subject: `Kritik stok: ${itemName}`,
        body: `${itemName} (${locationName}) kritik seviyenin altına düştü. Bakiye: ${balance} ${unit}, eşik: ${payload.reorderPoint} ${unit}.`,
      };
    }
    case "approval_pending": {
      if (payload.kind === "purchase_order") {
        const { data: supplier } = await supabase
          .from("suppliers")
          .select("name")
          .eq("id", payload.supplierId)
          .maybeSingle();
        return {
          subject: "Satın alma siparişi onay bekliyor",
          body: `${supplier?.name ?? "Bilinmeyen tedarikçi"} için oluşturulan sipariş onayını bekliyor.`,
        };
      }
      return {
        subject: "İkram/indirim isteği onay bekliyor",
        body: "Bir sipariş satırında ikram/indirim isteği onay bekliyor.",
      };
    }
    case "po_approved": {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", payload.supplierId)
        .maybeSingle();
      return {
        subject: "Satın alma siparişi onaylandı",
        body: `${supplier?.name ?? "Bilinmeyen tedarikçi"} siparişi onaylandı, mal kabule hazır.`,
      };
    }
    case "cash_shortage": {
      const diff = Number(payload.diff ?? 0);
      return {
        subject: "Kasa sayım farkı",
        body: `Beklenen ${money(Number(payload.expected ?? 0))}, sayılan ${money(Number(payload.counted ?? 0))} — fark ${money(diff)}.`,
      };
    }
    case "day_end_summary":
      return {
        subject: "Gün sonu özeti",
        body: "Bir kasa oturumu kapandı. Detaylar için Kasa ekranına bak.",
      };
    case "weekly_cost_report":
      return {
        subject: "Haftalık maliyet raporu",
        body: "Haftalık maliyet ve varyans raporun hazır. Detaylar için Raporlar ekranına bak.",
      };
    default:
      return { subject: "Bildirim", body: "" };
  }
}

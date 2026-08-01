"use client";

import { useActionState } from "react";

import { APP_ROLES, ROLE_LABEL, type AppRole } from "@/lib/auth/access";
import { updateNotificationRule, type ActionState } from "@/lib/notifications/actions";
import type { NotificationEventType, NotificationRuleRow } from "@/lib/notifications/queries";

const initial: ActionState = {};

const EVENT_LABEL: Record<NotificationEventType, string> = {
  low_stock: "Kritik stok",
  negative_stock: "Negatif stok",
  approval_pending: "Onay bekliyor",
  po_approved: "Satın alma siparişi onaylandı",
  cash_shortage: "Kasa sayım farkı",
  day_end_summary: "Gün sonu özeti",
  weekly_cost_report: "Haftalık maliyet raporu",
};

// Bu olayları alabilecek anlamlı roller — herkese gönderilmez (ör. garsona
// kasa açığı bildirimi göstermenin bir anlamı yok).
const RELEVANT_ROLES: AppRole[] = APP_ROLES.filter((r) => r !== "waiter" && r !== "chef");

export function RuleRow({ rule }: { rule: NotificationRuleRow }) {
  const [state, action] = useActionState(updateNotificationRule, initial);

  return (
    <form action={action} className="border-b border-line px-4 py-3 last:border-0">
      <input type="hidden" name="eventType" value={rule.eventType} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{EVENT_LABEL[rule.eventType]}</p>
          {rule.isDefault ? <p className="text-xs text-ink-muted">Varsayılan ayarlar kullanılıyor</p> : null}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" name="isEnabled" defaultChecked={rule.isEnabled} className="accent-brand-600" />
          Etkin
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-3">
        {RELEVANT_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-1.5 text-xs text-ink">
            <input
              type="checkbox"
              name="recipientRoles"
              value={role}
              defaultChecked={rule.recipientRoles.includes(role)}
              className="accent-brand-600"
            />
            {ROLE_LABEL[role]}
          </label>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Kaydet
        </button>
        {state.ok ? <span className="text-xs text-ok">Kaydedildi</span> : null}
        {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}

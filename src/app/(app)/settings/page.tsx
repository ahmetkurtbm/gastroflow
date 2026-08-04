import type { Metadata } from "next";
import Link from "next/link";

import { loadNotificationRules, loadRecentNotificationLog, loadRecentOutbox } from "@/lib/notifications/queries";

import { QueuePanel } from "./queue-panel";
import { RuleRow } from "./rule-row";

export const metadata: Metadata = { title: "Ayarlar" };

const EVENT_LABEL: Record<string, string> = {
  low_stock: "Kritik stok",
  negative_stock: "Negatif stok",
  approval_pending: "Onay bekliyor",
  po_approved: "Satın alma siparişi onaylandı",
  cash_shortage: "Kasa sayım farkı",
  day_end_summary: "Gün sonu özeti",
  weekly_cost_report: "Haftalık maliyet raporu",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Bekliyor",
  sent: "Gönderildi",
  failed: "Başarısız",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "text-warn",
  sent: "text-ok",
  failed: "text-danger",
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export default async function SettingsPage() {
  const [rules, outbox, log] = await Promise.all([
    loadNotificationRules(),
    loadRecentOutbox(20),
    loadRecentNotificationLog(20),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-ink">Ayarlar</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Personel ve entegrasyon ayarları sonraki bir aşamada eklenecek. Şimdilik
        salon/masa yönetimi, bildirim kuralları ve kuyruğu burada.
      </p>

      <Link
        href="/settings/salon"
        className="mb-6 flex items-center justify-between rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-brand-400"
      >
        Salon ve masalar
        <span className="text-ink-muted">→</span>
      </Link>

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Bildirim kuralları
        </h2>
        {rules.map((rule) => (
          <RuleRow key={rule.eventType} rule={rule} />
        ))}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Bildirim kuyruğu</h2>
        <p className="mb-3 text-xs text-ink-muted">
          Gerçek mail gönderilmiyor (mock) — &quot;gönderilseydi ne olurdu&quot; kaydı
          aşağıdaki günlükte tutuluyor. Normalde bu işi bir zamanlayıcı otomatik yapar;
          bu buton onsuz canlı denemek için.
        </p>
        <QueuePanel />

        {outbox.length > 0 ? (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {outbox.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{EVENT_LABEL[o.eventType] ?? o.eventType}</span>
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  {dateFormatter.format(new Date(o.createdAt))}
                  <span className={`font-medium ${STATUS_CLASS[o.status] ?? ""}`}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Gönderim günlüğü
        </h2>
        {log.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Henüz işlenen bildirim yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {log.map((l) => (
              <li key={l.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink">{l.subject}</span>
                  <span className={`text-xs font-medium ${STATUS_CLASS[l.status] ?? ""}`}>
                    {STATUS_LABEL[l.status] ?? l.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {l.recipientEmail}
                  {l.recipientRole ? ` (${l.recipientRole})` : ""} · {dateFormatter.format(new Date(l.sentAt))}
                </p>
                {l.error ? <p className="mt-0.5 text-xs text-danger">{l.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

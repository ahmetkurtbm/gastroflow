import type { Metadata } from "next";
import Link from "next/link";

import { PoDecisionButtons } from "@/app/(app)/purchasing/[poId]/po-actions";
import { formatQuantity } from "@/core/units";
import { loadLatestCashSession } from "@/lib/cash/queries";
import { getServerDictionary } from "@/lib/i18n/server";
import { loadLowStock } from "@/lib/inventory/queries";
import { loadRecentAlerts, type NotificationEventType } from "@/lib/notifications/queries";
import { loadPendingDiscounts } from "@/lib/orders/queries";
import { loadPendingPurchaseOrders } from "@/lib/purchasing/queries";
import { loadTodayRevenue } from "@/lib/reports/queries";

import { DiscountDecisionButtons } from "./discount-decision-buttons";

export const metadata: Metadata = { title: "Patron Paneli" };

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  meal_card: "Yemek kartı",
  on_account: "Açık hesap",
};

const ALERT_CLASS: Record<NotificationEventType, string> = {
  low_stock: "border-warn/40 bg-warn/5",
  negative_stock: "border-danger/40 bg-danger/5",
  approval_pending: "border-warn/40 bg-warn/5",
  po_approved: "border-ok/40 bg-ok/5",
  cash_shortage: "border-danger/40 bg-danger/5",
  day_end_summary: "border-line bg-surface-raised",
  weekly_cost_report: "border-line bg-surface-raised",
};

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function formatDiscount(kind: string, value: number): string {
  if (kind === "comp") return "İkram (tamamı bedava)";
  if (kind === "percent") return `%${value} indirim`;
  return `${formatLira(value)} indirim`;
}

const timeFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export default async function MobilePanelPage() {
  const [revenue, discountRequests, poRequests, lowStock, alerts, cashSession, { dict }] = await Promise.all([
    loadTodayRevenue(),
    loadPendingDiscounts(),
    loadPendingPurchaseOrders(),
    loadLowStock(),
    loadRecentAlerts(15),
    loadLatestCashSession(),
    getServerDictionary(),
  ]);

  const pendingCount = discountRequests.length + poRequests.length;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{dict.m.title}</h1>

      {/* Canlı ciro */}
      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <p className="text-xs text-ink-muted">Bugünkü ciro</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{formatLira(revenue.total)}</p>
        {revenue.byMethod.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {revenue.byMethod.map((m) => (
              <span key={m.method}>
                {METHOD_LABEL[m.method] ?? m.method}: <span className="tabular-nums text-ink">{formatLira(m.amount)}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">Bugün henüz ödeme alınmadı.</p>
        )}
      </section>

      {/* Kasa oturumu özeti */}
      <Link
        href="/cash"
        className="block rounded-xl border border-line bg-surface-raised p-4 hover:border-brand-400"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-muted">Kasa durumu</p>
          <span
            className={`text-xs font-medium ${
              cashSession?.status === "open" ? "text-ok" : "text-ink-muted"
            }`}
          >
            {cashSession?.status === "open" ? "Açık" : cashSession ? "Kapalı" : "Hiç açılmadı"}
          </span>
        </div>
        {cashSession ? (
          <p className="mt-1 text-sm text-ink">
            {cashSession.openedByName} · {timeFormatter.format(new Date(cashSession.openedAt))}
          </p>
        ) : null}
      </Link>

      {/* Bekleyen onaylar */}
      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Bekleyen onaylar {pendingCount > 0 ? `(${pendingCount})` : ""}
        </h2>
        {pendingCount === 0 ? (
          <p className="text-sm text-ink-muted">Bekleyen onay yok.</p>
        ) : (
          <ul className="space-y-3">
            {discountRequests.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-3">
                <p className="text-sm text-ink">
                  {r.quantity}× {r.menuItemName}
                  {r.tableName ? ` · Masa ${r.tableName}` : ""}
                </p>
                <p className="mt-0.5 text-xs font-medium text-warn">{formatDiscount(r.kind, r.value)}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{r.requestedByName} · {r.reason}</p>
                <div className="mt-2">
                  <DiscountDecisionButtons discountId={r.id} />
                </div>
              </li>
            ))}
            {poRequests.map((po) => (
              <li key={po.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-ink">{po.supplierName}</p>
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatLira(po.totalAmount)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {po.requestedByName} · {timeFormatter.format(new Date(po.requestedAt))}
                </p>
                <div className="mt-2">
                  <PoDecisionButtons poId={po.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Kritik stok */}
      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Kritik stok {lowStock.length > 0 ? `(${lowStock.length})` : ""}
        </h2>
        {lowStock.length === 0 ? (
          <p className="text-sm text-ink-muted">Kritik seviyede ürün yok.</p>
        ) : (
          <ul className="space-y-1.5">
            {lowStock.map((row, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  {row.itemName} <span className="text-ink-muted">· {row.locationName}</span>
                </span>
                <span className="tabular-nums text-warn">
                  {formatQuantity(row.balance, row.baseUnit)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/purchasing" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
          Satın Alma&apos;ya git →
        </Link>
      </section>

      {/* Olay akışı */}
      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Son olaylar</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-ink-muted">Henüz bir olay yok.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className={`rounded-lg border p-2.5 ${ALERT_CLASS[a.eventType]}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-ink">{a.title}</p>
                  <p className="text-xs text-ink-muted">{timeFormatter.format(new Date(a.createdAt))}</p>
                </div>
                {a.detail ? <p className="mt-0.5 text-xs text-ink-muted">{a.detail}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

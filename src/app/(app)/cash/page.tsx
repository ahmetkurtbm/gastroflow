import type { Metadata } from "next";
import Link from "next/link";

import { formatMoney, isZero } from "@/core/money";
import { requireAppUser } from "@/lib/auth/current-user";
import { loadOpenOrdersForCash } from "@/lib/cash/queries";

export const metadata: Metadata = { title: "Kasa" };

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default async function CashPage() {
  await requireAppUser();
  const orders = await loadOpenOrdersForCash();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">Kasa</h1>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
          Açık adisyon yok.
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => {
            const hasPartialPayment = !isZero(order.paid);
            return (
              <li key={order.id}>
                <Link
                  href={`/cash/${order.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised p-4 transition-colors hover:border-brand-400"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {order.tableName ? `Masa ${order.tableName}` : "Adisyon"}
                      {order.orderNo ? ` · #${order.orderNo}` : ""}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {minutesSince(order.openedAt)} dk
                      {hasPartialPayment ? " · kısmi ödeme alındı" : ""}
                    </p>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-ink">
                    {formatMoney(order.total)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

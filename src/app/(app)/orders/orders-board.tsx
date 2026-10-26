"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { OrderTrackingSummary } from "@/lib/orders/queries";
import { useLiveRefresh } from "@/lib/live-refresh";

const STATUS_LABEL: Record<string, string> = {
  pending: "Gönderilmedi",
  sent: "Mutfakta",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  served: "Servis edildi",
  cancelled: "İptal",
};

/** Bir satır "gecikmiş" sayılır: gönderilmiş/hazırlanıyor ama 15 dk'dır beklemede. */
const LATE_THRESHOLD_MINUTES = 15;

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function tableUrgencyClass(minutes: number, hasLateLine: boolean): string {
  if (hasLateLine || minutes >= 45) return "border-danger/60 bg-danger/5";
  if (minutes >= 20) return "border-warn/60 bg-warn/5";
  return "border-line";
}

function OrderCard({ order }: { order: OrderTrackingSummary }) {
  const [, forceTick] = useState(0);

  // Süre sayaçlarının canlı kalması için periyodik yeniden render.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const openMinutes = minutesSince(order.openedAt);
  const activeLines = order.lines.filter((l) => l.status !== "cancelled" && l.status !== "served");
  const lateLines = activeLines.filter(
    (l) => l.sentAt && ["sent", "preparing"].includes(l.status) && minutesSince(l.sentAt) >= LATE_THRESHOLD_MINUTES,
  );

  return (
    <li className={`rounded-xl border-2 bg-surface-raised p-4 ${tableUrgencyClass(openMinutes, lateLines.length > 0)}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {order.tableName ? `Masa ${order.tableName}` : "Paket"}
            {order.orderNo ? ` · #${order.orderNo}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {order.guestCount ? `${order.guestCount} kişi · ` : ""}
            {openMinutes} dk açık
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
          {formatLira(order.total)}
        </span>
      </div>

      {activeLines.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line pt-2">
          {activeLines.map((line) => {
            const isLate = lateLines.some((l) => l.id === line.id);
            return (
              <li key={line.id} className="flex items-center justify-between text-xs">
                <span className={isLate ? "font-medium text-danger" : "text-ink"}>
                  {line.quantity}× {line.menuItemName}
                  {line.discount?.status === "pending" ? (
                    <span className="ml-1.5 text-warn">· onay bekliyor</span>
                  ) : null}
                  {line.discount?.status === "approved" ? (
                    <span className="ml-1.5 text-ok">
                      · {line.discount.kind === "comp" ? "ikram" : "indirimli"}
                    </span>
                  ) : null}
                </span>
                <span className={isLate ? "font-medium text-danger" : "text-ink-muted"}>
                  {STATUS_LABEL[line.status] ?? line.status}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        {order.tableId ? (
          <Link
            href={`/pos/masa/${order.tableId}`}
            className="flex-1 rounded-lg border border-line px-3 py-1.5 text-center text-xs font-medium text-ink hover:bg-surface-sunken"
          >
            Masaya git
          </Link>
        ) : null}
        <Link
          href={`/cash/${order.id}`}
          className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-brand-700"
        >
          Ödeme al
        </Link>
      </div>
    </li>
  );
}

export function OrdersBoard({ orders }: { orders: OrderTrackingSummary[] }) {
  useLiveRefresh();

  if (orders.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-muted">
        Açık adisyon yok.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </ul>
  );
}

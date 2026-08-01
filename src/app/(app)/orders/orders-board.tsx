"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { OrderTrackingSummary } from "@/lib/orders/queries";
import { applyLineDiscount, pickActiveDiscount } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/client";

const DISCOUNT_SELECT = "line_discounts(id, kind, value, status, reason, created_at)";

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

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
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

export function OrdersBoard({
  initialOrders,
  tenantId,
}: {
  initialOrders: OrderTrackingSummary[];
  tenantId: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    async function refetch() {
      const { data } = await supabase
        .from("orders")
        .select(
          `id, order_no, table_id, guest_count, opened_at, tables(name), order_lines(id, quantity, unit_price, status, sent_at, menu_items(name), order_line_modifiers(price_delta), ${DISCOUNT_SELECT})`,
        )
        .eq("status", "open")
        .order("opened_at", { ascending: true });

      setOrders(
        (data ?? []).map((order) => {
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
        }),
      );
    }

    // KDS panosuyla aynı desen: RLS zaten şube/tenant sınırını uyguluyor,
    // buradaki filtre yalnızca gereksiz olay trafiğini azaltıyor.
    const channel = supabase
      .channel("orders-tracking")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` },
        () => void refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_lines", filter: `tenant_id=eq.${tenantId}` },
        () => void refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "line_discounts", filter: `tenant_id=eq.${tenantId}` },
        () => void refetch(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, tenantId]);

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

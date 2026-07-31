"use client";

import { useTransition } from "react";

import { removeOrderLine, sendToKitchen } from "@/lib/orders/actions";
import type { OrderView } from "@/lib/orders/queries";

const STATUS_LABEL: Record<string, string> = {
  pending: "Gönderilmedi",
  sent: "Mutfakta",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  served: "Servis edildi",
  cancelled: "İptal",
};

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + " ₺";
}

export function Cart({ order }: { order: OrderView }) {
  const [pending, startTransition] = useTransition();
  const pendingCount = order.lines.filter((l) => l.status === "pending").length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">
          {order.tableName ? `Masa ${order.tableName}` : "Adisyon"}
          {order.orderNo ? ` · #${order.orderNo}` : ""}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {order.lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Sepet boş. Soldan ürün seç.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {order.lines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    <span className="font-medium tabular-nums">{line.quantity}×</span>{" "}
                    {line.menuItemName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {STATUS_LABEL[line.status] ?? line.status}
                    {line.note ? ` · ${line.note}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-ink">
                    {formatLira(line.quantity * line.unitPrice)}
                  </span>
                  {line.status === "pending" ? (
                    <form
                      action={(fd) => startTransition(() => removeOrderLine(fd))}
                    >
                      <input type="hidden" name="id" value={line.id} />
                      <button
                        type="submit"
                        aria-label={`${line.menuItemName} satırını kaldır`}
                        className="rounded p-1 text-ink-muted hover:bg-danger/10 hover:text-danger"
                      >
                        ✕
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-ink-muted">Toplam</span>
          <span className="text-lg font-bold tabular-nums text-ink">
            {formatLira(order.total)}
          </span>
        </div>

        <form action={(fd) => startTransition(() => sendToKitchen(fd))}>
          <input type="hidden" name="orderId" value={order.id} />
          <button
            type="submit"
            disabled={pendingCount === 0 || pending}
            className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pendingCount > 0
              ? `Mutfağa gönder (${pendingCount})`
              : "Gönderilecek ürün yok"}
          </button>
        </form>
      </div>
    </div>
  );
}

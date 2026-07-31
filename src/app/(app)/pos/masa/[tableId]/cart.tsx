"use client";

import { useTransition } from "react";

import type { OptimisticLine } from "@/lib/offline/use-offline-order";
import { removeOrderLine } from "@/lib/orders/actions";
import type { OrderLineView, OrderView } from "@/lib/orders/queries";

const STATUS_LABEL: Record<string, string> = {
  pending: "Gönderilmedi",
  sent: "Mutfakta",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  served: "Servis edildi",
  cancelled: "İptal",
};

function formatLira(value: number): string {
  // maximumFractionDigits AÇIKÇA verilmezse Intl, minimumFractionDigits: 2
  // ile birlikte 3 ondalık haneye kadar gösterebiliyor (ör. 46,667 ₺).
  // Para birimi için bu bir gösterim hatası — kasadaki bölüşüm testinde
  // gerçekten yaşandı.
  return (
    value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " ₺"
  );
}

export function Cart({
  order,
  optimisticLines,
  isOnline,
  queueCount,
  onSendToKitchen,
  onCancelOptimistic,
}: {
  order: OrderView;
  optimisticLines: OptimisticLine[];
  isOnline: boolean;
  queueCount: number;
  onSendToKitchen: () => void;
  onCancelOptimistic: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const pendingCount = order.lines.filter((l) => l.status === "pending").length;
  const total =
    order.total + optimisticLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">
          {order.tableName ? `Masa ${order.tableName}` : "Adisyon"}
          {order.orderNo ? ` · #${order.orderNo}` : ""}
        </h2>
      </div>

      {!isOnline || queueCount > 0 ? (
        <div
          role="status"
          className={`px-4 py-2 text-xs font-medium ${
            isOnline
              ? "bg-warn/10 text-warn"
              : "bg-danger/10 text-danger"
          }`}
        >
          {isOnline
            ? `Senkronize ediliyor… (${queueCount})`
            : `Çevrimdışı — ${queueCount} işlem bağlantı gelince gönderilecek`}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {order.lines.length === 0 && optimisticLines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Sepet boş. Soldan ürün seç.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {optimisticLines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    <span className="font-medium tabular-nums">{line.quantity}×</span>{" "}
                    {line.menuItemName}
                  </p>
                  <p className="text-xs text-warn">Gönderiliyor…</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-ink-muted">
                    {formatLira(line.quantity * line.unitPrice)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCancelOptimistic(line.id)}
                    aria-label={`${line.menuItemName} satırını iptal et`}
                    className="rounded p-1 text-ink-muted hover:bg-danger/10 hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}

            {order.lines.map((line: OrderLineView) => (
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
                        disabled={!isOnline}
                        aria-label={`${line.menuItemName} satırını kaldır`}
                        className="rounded p-1 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
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
            {formatLira(total)}
          </span>
        </div>

        <button
          type="button"
          onClick={onSendToKitchen}
          disabled={(pendingCount === 0 && optimisticLines.length === 0) || pending}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pendingCount + optimisticLines.length > 0
            ? `Mutfağa gönder (${pendingCount + optimisticLines.length})`
            : "Gönderilecek ürün yok"}
        </button>
      </div>
    </div>
  );
}

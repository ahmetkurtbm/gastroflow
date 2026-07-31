"use client";

import Link from "next/link";

import { useOfflineOrder } from "@/lib/offline/use-offline-order";
import type { MenuCategory, OrderView } from "@/lib/orders/queries";

import { AddItemButton } from "./add-item-button";
import { Cart } from "./cart";

export function OrderScreen({
  order,
  categories,
  tenantId,
  userId,
}: {
  order: OrderView;
  categories: MenuCategory[];
  tenantId: string;
  userId: string;
}) {
  const {
    isOnline,
    queueCount,
    optimisticLines,
    addItem,
    sendToKitchen,
    cancelOptimistic,
  } = useOfflineOrder(order.id);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col md:flex-row md:gap-4">
      <div className="flex-1 overflow-y-auto md:pr-2">
        <Link href="/pos" className="text-sm text-ink-muted hover:text-ink">
          ← Salon
        </Link>

        {categories.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
            Satılabilir ürün yok. Reçeteler → menü ürününe fiyat tanımla.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {categories.map((category) => (
              <section key={category.id}>
                <h2 className="mb-2 text-sm font-semibold text-ink-muted">
                  {category.name}
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {category.items.map((item) => (
                    <AddItemButton
                      key={item.id}
                      name={item.name}
                      price={item.price ?? 0}
                      onAdd={() =>
                        void addItem({
                          tenantId,
                          userId,
                          menuItemId: item.id,
                          menuItemName: item.name,
                          unitPrice: item.price ?? 0,
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <aside className="mt-4 shrink-0 rounded-xl border border-line bg-surface-raised md:mt-0 md:w-80">
        <Cart
          order={order}
          optimisticLines={optimisticLines}
          isOnline={isOnline}
          queueCount={queueCount}
          onSendToKitchen={() => void sendToKitchen(tenantId)}
          onCancelOptimistic={(id) => void cancelOptimistic(id)}
        />
      </aside>
    </div>
  );
}

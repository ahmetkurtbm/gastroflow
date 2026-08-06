"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatMoney, money } from "@/core/money";
import type { SellableCombo } from "@/lib/combos/queries";
import { useOfflineOrder } from "@/lib/offline/use-offline-order";
import { useI18n } from "@/lib/i18n/provider";
import { addComboToOrder } from "@/lib/orders/actions";
import type { MenuCategory, OrderView } from "@/lib/orders/types";

import { AddItemButton } from "./add-item-button";
import { Cart } from "./cart";
import { ModifierPicker } from "./modifier-picker";

type MenuItem = MenuCategory["items"][number];

export function OrderScreen({
  order,
  categories,
  combos,
  tenantId,
  userId,
}: {
  order: OrderView;
  categories: MenuCategory[];
  combos: SellableCombo[];
  tenantId: string;
  userId: string;
}) {
  const { dict } = useI18n();
  const router = useRouter();
  const {
    isOnline,
    queueCount,
    optimisticLines,
    addItem,
    sendToKitchen,
    cancelOptimistic,
  } = useOfflineOrder(order.id);

  // Kombo ekleme offline kuyruğa BİLEREK dahil değil — bileşenlere ayırmak
  // (fiyat/reçete okuma) sunucuda oluyor, kuyruktaki tek bir "form gönder"
  // çağrısıyla aynı basitlikte değil. Çevrimdışıyken buton devre dışı kalır.
  const [comboPending, startComboTransition] = useTransition();
  const [comboError, setComboError] = useState<string | null>(null);

  function handleAddCombo(comboId: string) {
    setComboError(null);
    startComboTransition(async () => {
      const formData = new FormData();
      formData.set("orderId", order.id);
      formData.set("comboId", comboId);
      const result = await addComboToOrder({}, formData);
      if (result.error) {
        setComboError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  // Seçenek grubu olan bir ürüne dokununca, sepete direkt eklemeden önce bu
  // panel açılır. Seçeneksiz ürünler eskisi gibi tek dokunuşla eklenir.
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);

  function handleTap(item: MenuItem) {
    if (item.modifierGroups.length > 0) {
      setPickerItem(item);
      return;
    }
    void addItem({
      tenantId,
      userId,
      menuItemId: item.id,
      menuItemName: item.name,
      unitPrice: item.price ?? 0,
    });
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col md:flex-row md:gap-4">
      <div className="flex-1 overflow-y-auto md:pr-2">
        <Link href="/pos" className="text-sm text-ink-muted hover:text-ink">
          {dict.pos.backToFloor}
        </Link>

        {combos.length > 0 ? (
          <section className="mt-4">
            <h2 className="mb-2 text-sm font-semibold text-ink-muted">Kombolar</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {combos.map((combo) => (
                <button
                  key={combo.id}
                  type="button"
                  disabled={comboPending || !isOnline}
                  onClick={() => handleAddCombo(combo.id)}
                  className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-dashed border-brand-400 bg-brand-50/30 p-3 text-left transition-colors hover:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-ink">{combo.name}</span>
                  <span className="text-xs text-ink-muted">
                    {combo.items.map((i) => `${i.quantity}× ${i.menuItemName}`).join(" + ")}
                  </span>
                  <span className="text-xs tabular-nums font-semibold text-brand-700">
                    {formatMoney(money(combo.price))}
                  </span>
                </button>
              ))}
            </div>
            {comboError ? (
              <p role="alert" className="mt-2 text-xs text-danger">
                {comboError}
              </p>
            ) : null}
          </section>
        ) : null}

        {categories.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
            {dict.pos.noItems}
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
                      imageUrl={item.imageUrl}
                      hasOptions={item.modifierGroups.length > 0}
                      onAdd={() => handleTap(item)}
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

      {pickerItem ? (
        <ModifierPicker
          itemName={pickerItem.name}
          basePrice={pickerItem.price ?? 0}
          groups={pickerItem.modifierGroups}
          onCancel={() => setPickerItem(null)}
          onConfirm={({ ids, summary, extraPrice }) => {
            void addItem({
              tenantId,
              userId,
              menuItemId: pickerItem.id,
              menuItemName: pickerItem.name,
              unitPrice: (pickerItem.price ?? 0) + extraPrice,
              modifierIds: ids,
              modifierSummary: summary,
            });
            setPickerItem(null);
          }}
        />
      ) : null}
    </div>
  );
}

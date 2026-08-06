"use client";

import { useState, useTransition } from "react";

import { formatMoney, money } from "@/core/money";
import type { SellableCombo } from "@/lib/combos/queries";
import type { MenuCategory } from "@/lib/orders/types";
import { placeQrOrder } from "@/lib/qr-order/actions";

type CartLine =
  | { key: string; type: "item"; id: string; name: string; unitPrice: number; quantity: number }
  | { key: string; type: "combo"; id: string; name: string; unitPrice: number };

/**
 * Müşterinin kendi telefonundan sipariş ekranı — sepet TAMAMEN yerel state'te
 * tutulur, "Siparişi gönder"e basana kadar sunucuya hiçbir şey yazılmaz.
 * Personel POS ekranındaki sepetin (bkz. `../pos/masa/[tableId]/cart.tsx`)
 * aksine offline kuyruğa BAĞLI DEĞİL — bu sayfa oturumsuz, `useOfflineOrder`
 * tenant/kullanıcı kimliği gerektiriyor, burada ikisi de yok.
 */
export function QrOrderScreen({
  qrToken,
  tableName,
  categories,
  combos,
}: {
  qrToken: string;
  tableName: string;
  categories: MenuCategory[];
  combos: SellableCombo[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function addItem(item: MenuCategory["items"][number]) {
    setSent(false);
    setCart((prev) => {
      const existing = prev.find((l) => l.type === "item" && l.id === item.id);
      if (existing && existing.type === "item") {
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { key: crypto.randomUUID(), type: "item", id: item.id, name: item.name, unitPrice: item.price ?? 0, quantity: 1 },
      ];
    });
  }

  function addCombo(combo: SellableCombo) {
    setSent(false);
    setCart((prev) => [
      ...prev,
      { key: crypto.randomUUID(), type: "combo", id: combo.id, name: combo.name, unitPrice: combo.price },
    ]);
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function changeQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key && l.type === "item" ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.type !== "item" || l.quantity > 0),
    );
  }

  const total = cart.reduce(
    (sum, l) => sum + l.unitPrice * (l.type === "item" ? l.quantity : 1),
    0,
  );

  function handleSubmit() {
    setError(null);
    const payload = cart.map((l) =>
      l.type === "item"
        ? { type: "item" as const, menuItemId: l.id, quantity: l.quantity }
        : { type: "combo" as const, comboId: l.id },
    );

    startTransition(async () => {
      const formData = new FormData();
      formData.set("qrToken", qrToken);
      formData.set("cart", JSON.stringify(payload));
      const result = await placeQrOrder({}, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setCart([]);
        setSent(true);
      }
    });
  }

  return (
    <div className="pb-32">
      <h1 className="text-xl font-bold tracking-tight text-ink">
        Gastro<span className="text-brand-600">Flow</span>
      </h1>
      <p className="mt-1 text-sm text-ink-muted">{tableName} · Menüden seçip sepete ekleyin</p>

      {sent ? (
        <div role="status" className="mt-4 rounded-xl border border-brand-400 bg-brand-50/40 p-4 text-sm text-ink">
          Siparişiniz alındı, personel onayladığında hazırlanmaya başlayacak. Başka bir şey isterseniz
          menüden eklemeye devam edebilirsiniz.
        </div>
      ) : null}

      {combos.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-muted">Kombolar</h2>
          <div className="grid grid-cols-2 gap-2">
            {combos.map((combo) => (
              <button
                key={combo.id}
                type="button"
                onClick={() => addCombo(combo)}
                className="flex h-full flex-col items-start gap-1 rounded-xl border border-dashed border-brand-400 bg-brand-50/30 p-3 text-left transition-colors hover:border-brand-500"
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
        </section>
      ) : null}

      {categories.length === 0 && combos.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
          Şu anda satılabilir bir ürün yok.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {categories.map((category) => (
            <section key={category.id}>
              <h2 className="mb-2 text-sm font-semibold text-ink-muted">{category.name}</h2>
              <div className="grid grid-cols-2 gap-2">
                {category.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item)}
                    className="flex flex-col items-start gap-1 rounded-xl border border-line bg-surface-raised p-3 text-left transition-colors hover:border-brand-400"
                  >
                    <span className="text-sm font-medium text-ink">{item.name}</span>
                    <span className="text-xs tabular-nums text-ink-muted">
                      {formatMoney(money(item.price ?? 0))}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface-raised p-4 shadow-lg">
          <div className="mx-auto max-w-lg">
            <ul className="mb-3 max-h-40 space-y-1.5 overflow-y-auto text-sm">
              {cart.map((line) => (
                <li key={line.key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-ink">
                    {line.type === "item" ? `${line.quantity}× ` : ""}
                    {line.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-ink-muted">
                      {formatMoney(money(line.unitPrice * (line.type === "item" ? line.quantity : 1)))}
                    </span>
                    {line.type === "item" ? (
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.key, -1)}
                        className="text-ink-muted hover:text-ink"
                        aria-label={`${line.name} adedini azalt`}
                      >
                        −
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="text-ink-muted hover:text-ink"
                        aria-label={`${line.name} sil`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {error ? (
              <p role="alert" className="mb-2 text-xs text-danger">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={pending}
              onClick={handleSubmit}
              className="flex w-full items-center justify-between rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{pending ? "Gönderiliyor…" : "Siparişi gönder"}</span>
              <span className="tabular-nums">{formatMoney(money(total))}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

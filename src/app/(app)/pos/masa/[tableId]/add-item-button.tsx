"use client";

import { useActionState, useRef } from "react";

import { addOrderLine, type ActionState } from "@/lib/orders/actions";

const initial: ActionState = {};

/**
 * Tek dokunuşla sepete ekleme.
 *
 * Bilerek bir modal veya form açmıyoruz: garson kalabalık bir serviste ürüne
 * dokunup devam edebilmeli. Not eklemek gerekiyorsa sepetteki satırdan yapılır.
 */
export function AddItemButton({
  orderId,
  itemId,
  name,
  price,
}: {
  orderId: string;
  itemId: string;
  name: string;
  price: number;
}) {
  const [state, action] = useActionState(addOrderLine, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="menuItemId" value={itemId} />
      <input type="hidden" name="quantity" value="1" />
      <button
        type="submit"
        className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-line bg-surface-raised p-3 text-left transition-colors hover:border-brand-400 active:bg-brand-50"
      >
        <span className="text-sm font-medium text-ink">{name}</span>
        <span className="text-xs tabular-nums text-ink-muted">
          {price.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          ₺
        </span>
      </button>
      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

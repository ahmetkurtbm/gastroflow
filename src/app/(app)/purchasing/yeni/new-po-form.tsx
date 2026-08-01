"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton, Textarea, TextInput } from "@/components/ui/form";
import { createPurchaseOrder, type ActionState } from "@/lib/purchasing/actions";
import type { SupplierItemRow } from "@/lib/purchasing/queries";

const initial: ActionState = {};

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

export function NewPoForm({
  supplierId,
  items,
  prefillItemId,
  prefillQty,
}: {
  supplierId: string;
  items: SupplierItemRow[];
  prefillItemId?: string;
  prefillQty?: string;
}) {
  const [state, action] = useActionState(createPurchaseOrder, initial);

  return (
    <form action={action} className="rounded-xl border border-line bg-surface-raised">
      <input type="hidden" name="supplierId" value={supplierId} />
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-ink">{item.itemName}</p>
              <p className="text-xs text-ink-muted">
                {formatLira(item.price)} / {item.baseUnit}
                {item.minOrderQuantity > 0 ? ` · min ${item.minOrderQuantity} ${item.baseUnit}` : ""}
              </p>
            </div>
            <div className="w-28 shrink-0">
              <TextInput
                name={`qty_${item.itemId}`}
                type="number"
                step="0.001"
                min="0"
                placeholder="—"
                defaultValue={item.itemId === prefillItemId ? prefillQty : undefined}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-line p-4">
        <Field label="Not (opsiyonel)" htmlFor="note">
          <Textarea id="note" name="note" rows={2} maxLength={300} />
        </Field>
        <FormError message={state.error} />
        <SubmitButton>Siparişi oluştur</SubmitButton>
      </div>
    </form>
  );
}

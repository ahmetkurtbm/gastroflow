"use client";

import { useActionState } from "react";

import { Field, FormError, Select, SubmitButton, Textarea, TextInput } from "@/components/ui/form";
import { recordWaste, type ActionState } from "@/lib/inventory/actions";
import type { StockPickLists } from "@/lib/inventory/queries";

const initial: ActionState = {};

const REASON_LABEL: Record<string, string> = {
  spoilage: "Bozulma",
  prep_error: "Hazırlık/pişirme hatası",
  dropped: "Düşürüldü / kırıldı",
  expired: "Son kullanma tarihi geçti",
  customer_return: "Müşteri iadesi",
  other: "Diğer",
};

export function WasteForm({ picks }: { picks: StockPickLists }) {
  const [state, action] = useActionState(recordWaste, initial);

  if (picks.items.length === 0 || picks.locations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
        Önce hammadde ve lokasyon tanımlamalısın.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface-raised p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hammadde" htmlFor="inventoryItemId">
          <Select id="inventoryItemId" name="inventoryItemId" required>
            {picks.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.baseUnit})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lokasyon" htmlFor="locationId">
          <Select id="locationId" name="locationId" required>
            {picks.locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Miktar" htmlFor="quantity">
          <TextInput
            id="quantity"
            name="quantity"
            type="number"
            step="0.001"
            min="0.001"
            required
          />
        </Field>
        <Field label="Sebep" htmlFor="reason">
          <Select id="reason" name="reason" defaultValue="spoilage" required>
            {Object.entries(REASON_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Not (opsiyonel)" htmlFor="note">
        <Textarea id="note" name="note" rows={2} maxLength={300} />
      </Field>

      <FormError message={state.error} />

      <SubmitButton>Zayiat kaydet</SubmitButton>
      {state.ok ? <p className="text-sm text-ok">Kaydedildi.</p> : null}
    </form>
  );
}

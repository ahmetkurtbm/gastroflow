"use client";

import { useActionState } from "react";

import { Field, FormError, Select, SubmitButton, Textarea, TextInput } from "@/components/ui/form";
import { recordTransfer, type ActionState } from "@/lib/inventory/actions";
import type { StockPickLists } from "@/lib/inventory/queries";

const initial: ActionState = {};

export function TransferForm({ picks }: { picks: StockPickLists }) {
  const [state, action] = useActionState(recordTransfer, initial);

  if (picks.locations.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
        Transfer için en az iki lokasyon gerekli. Ayarlar&apos;dan ikinci bir depo/mutfak/bar tanımla.
      </p>
    );
  }
  if (picks.items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
        Önce hammadde tanımlamalısın.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface-raised p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nereden" htmlFor="fromLocationId">
          <Select id="fromLocationId" name="fromLocationId" defaultValue={picks.locations[0]?.id} required>
            {picks.locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nereye" htmlFor="toLocationId">
          <Select id="toLocationId" name="toLocationId" defaultValue={picks.locations[1]?.id} required>
            {picks.locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

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
        <Field label="Miktar" htmlFor="quantity">
          <TextInput id="quantity" name="quantity" type="number" step="0.001" min="0.001" required />
        </Field>
      </div>

      <Field label="Not (opsiyonel)" htmlFor="note">
        <Textarea id="note" name="note" rows={2} maxLength={300} />
      </Field>

      <FormError message={state.error} />

      <SubmitButton>Transferi kaydet</SubmitButton>
      {state.ok ? <p className="text-sm text-ok">Kaydedildi.</p> : null}
    </form>
  );
}

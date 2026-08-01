"use client";

import { useActionState } from "react";

import { Field, FormError, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { addSupplierItem, type ActionState } from "@/lib/purchasing/actions";

const initial: ActionState = {};

export function SupplierItemForm({
  supplierId,
  items,
}: {
  supplierId: string;
  items: { id: string; name: string; baseUnit: string }[];
}) {
  const [state, action] = useActionState(addSupplierItem, initial);

  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-muted">Önce hammadde tanımlamalısın.</p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="supplierId" value={supplierId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hammadde" htmlFor="inventoryItemId">
          <Select id="inventoryItemId" name="inventoryItemId" required>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.baseUnit})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tedarikçi kodu (opsiyonel)" htmlFor="supplierSku">
          <TextInput id="supplierSku" name="supplierSku" maxLength={60} />
        </Field>
        <Field label="Fiyat (₺/birim)" htmlFor="price">
          <TextInput id="price" name="price" type="number" step="0.01" min="0" required />
        </Field>
        <Field label="Min. sipariş miktarı" htmlFor="minOrderQuantity">
          <TextInput id="minOrderQuantity" name="minOrderQuantity" type="number" step="0.001" min="0" defaultValue="0" />
        </Field>
      </div>

      <FormError message={state.error} />
      {state.ok ? <p className="text-sm text-ok">Fiyat listesine eklendi.</p> : null}

      <SubmitButton>Listeye ekle</SubmitButton>
    </form>
  );
}

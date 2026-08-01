"use client";

import { useActionState } from "react";

import { Field, FormError, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { receiveGoods, type ActionState } from "@/lib/purchasing/actions";
import type { PurchaseOrderDetail } from "@/lib/purchasing/queries";

const initial: ActionState = {};

export function ReceiveForm({
  po,
  locations,
}: {
  po: PurchaseOrderDetail;
  locations: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(receiveGoods, initial);

  if (locations.length === 0) {
    return <p className="text-sm text-ink-muted">Önce en az bir stok lokasyonu tanımlamalısın.</p>;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="poId" value={po.id} />

      <Field label="Malın gireceği lokasyon" htmlFor="locationId">
        <Select id="locationId" name="locationId" required>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-lg border border-line">
        <ul className="divide-y divide-line">
          {po.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-ink">{line.itemName}</p>
                <p className="text-xs text-ink-muted">
                  Sipariş edilen: {line.quantity} {line.baseUnit}
                </p>
              </div>
              <div className="w-28 shrink-0">
                <TextInput
                  name={`received_${line.id}`}
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue={line.quantity}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <FormError message={state.error} />

      <SubmitButton>Mal kabulü tamamla</SubmitButton>
      <p className="text-xs text-ink-muted">
        Değiştirmediğin satırlar sipariş edilen miktarla aynı kabul edilir.
      </p>
    </form>
  );
}

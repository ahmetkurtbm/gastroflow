"use client";

import { useActionState, useState } from "react";

import { Field, FormError, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { createCombo, type ActionState } from "@/lib/combos/actions";

const initial: ActionState = {};

let nextRowId = 1;

/**
 * Kombo oluşturma formu — dinamik satır listesi (ürün + miktar).
 *
 * "Ürünler" reçetedeki gibi tek bir alan değil, N tane {menuItemId, quantity}
 * çifti — bu yüzden `useActionState`'in tek FormData'sına birden çok
 * `menuItemId`/`quantity` alanı aynı isimle basılıyor (bkz. `formData.getAll`
 * kullanan `createCombo`), sıradaki değerler eşleşiyor.
 */
export function ComboForm({ menuItems }: { menuItems: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createCombo, initial);
  const [rowIds, setRowIds] = useState<number[]>([nextRowId++]);

  return (
    <form action={action} className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kombo adı (ör. Büyük Menü)" htmlFor="name">
          <TextInput id="name" name="name" required maxLength={120} />
        </Field>
        <Field label="Kombo fiyatı (₺)" htmlFor="price">
          <TextInput id="price" name="price" type="number" step="0.01" min="0" required />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Bileşenler</p>
        {rowIds.map((id, index) => (
          <div key={id} className="flex items-end gap-2">
            <div className="flex-1">
              {index === 0 ? <label className="mb-1 block text-xs text-ink-muted">Ürün</label> : null}
              <Select name="menuItemId" required defaultValue="">
                <option value="" disabled>
                  Seç…
                </option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-20">
              {index === 0 ? <label className="mb-1 block text-xs text-ink-muted">Adet</label> : null}
              <TextInput name="quantity" type="number" min="1" step="1" defaultValue="1" required />
            </div>
            {rowIds.length > 1 ? (
              <button
                type="button"
                onClick={() => setRowIds((prev) => prev.filter((r) => r !== id))}
                aria-label="Bu bileşeni kaldır"
                className="mb-0.5 rounded-lg p-2 text-ink-muted hover:bg-danger/10 hover:text-danger"
              >
                ✕
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRowIds((prev) => [...prev, nextRowId++])}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          + Bileşen ekle
        </button>
      </div>

      <FormError message={state.error} />
      <SubmitButton>Kombo oluştur</SubmitButton>
    </form>
  );
}

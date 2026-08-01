"use client";

import { useActionState } from "react";

import { FormError, SubmitButton, TextInput } from "@/components/ui/form";
import { recordCount, type ActionState } from "@/lib/inventory/actions";

const initial: ActionState = {};

/**
 * Körleme sayım formu — bilinçli olarak sistemdeki bakiyeyi GÖSTERMEZ.
 * Sayan kişi rafta ne görürse onu yazar; fark sunucuda hesaplanır (bkz.
 * `recordCount`). Fiyat/miktar tahmin etmeye çalışmasın diye böyle.
 */
export function CountForm({
  locationId,
  items,
}: {
  locationId: string;
  items: { id: string; name: string; baseUnit: string }[];
}) {
  const [state, action] = useActionState(recordCount, initial);

  return (
    <form action={action} className="rounded-xl border border-line bg-surface-raised">
      <input type="hidden" name="locationId" value={locationId} />
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <label htmlFor={`qty_${item.id}`} className="text-sm text-ink">
              {item.name} <span className="text-ink-muted">({item.baseUnit})</span>
            </label>
            <div className="w-28 shrink-0">
              <TextInput
                id={`qty_${item.id}`}
                name={`qty_${item.id}`}
                type="number"
                step="0.001"
                min="0"
                placeholder="—"
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-line p-4">
        <FormError message={state.error} />
        {state.ok ? <p className="text-sm text-ok">Sayım kaydedildi, farklar deftere yazıldı.</p> : null}
        <SubmitButton>Sayımı kaydet</SubmitButton>
        <p className="text-xs text-ink-muted">
          Boş bıraktığın ürünler bu oturumda sayılmamış sayılır — istersen sayfayı
          bölüp devam edebilirsin.
        </p>
      </div>
    </form>
  );
}

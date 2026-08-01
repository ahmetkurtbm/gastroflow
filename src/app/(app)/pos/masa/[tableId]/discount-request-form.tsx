"use client";

import { useActionState, useEffect, useState } from "react";

import { Field, FormError, Select, SubmitButton, Textarea, TextInput } from "@/components/ui/form";
import { requestLineDiscount, type ActionState } from "@/lib/orders/actions";

const initial: ActionState = {};

/**
 * İkram/iskonto isteği paneli.
 *
 * Müdür/patron için istek anında onaylanmış sayılır (RLS bunu zorunlu kılar,
 * bkz. migration 0011); diğer roller için "onay bekliyor" olarak açılır ve
 * fiyata `/approvals`'tan onaylanana kadar yansımaz. Bu ayrımı burada
 * göstermiyoruz — sunucu zaten doğru durumu yazıyor, kullanıcı sonucu
 * satırdaki etiketten görecek.
 */
export function DiscountRequestForm({
  orderLineId,
  itemName,
  onClose,
}: {
  orderLineId: string;
  itemName: string;
  onClose: () => void;
}) {
  const [state, action] = useActionState(requestLineDiscount, initial);
  const [kind, setKind] = useState<"comp" | "percent" | "amount">("comp");

  useEffect(() => {
    if (state.ok) onClose();
    // onClose kasıtlı olarak dependency değil — her render'da yeniden
    // tetiklenmesin diye yalnızca state.ok değişince çalışsın istiyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${itemName} için ikram/indirim isteği`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-surface-raised p-5 sm:rounded-2xl">
        <h2 className="text-base font-semibold text-ink">İkram / İndirim</h2>
        <p className="mt-0.5 text-sm text-ink-muted">{itemName}</p>

        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="orderLineId" value={orderLineId} />
          <input type="hidden" name="kind" value={kind} />

          <Field label="Tür" htmlFor="kind-select">
            <Select
              id="kind-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="comp">İkram (tamamı bedava)</option>
              <option value="percent">Yüzde indirim</option>
              <option value="amount">Tutar indirim (₺)</option>
            </Select>
          </Field>

          {kind !== "comp" ? (
            <Field label={kind === "percent" ? "Yüzde (%)" : "Tutar (₺)"} htmlFor="value">
              <TextInput
                id="value"
                name="value"
                type="number"
                step="0.01"
                min="0"
                max={kind === "percent" ? 100 : undefined}
                required
              />
            </Field>
          ) : null}

          <Field label="Gerekçe" htmlFor="reason">
            <Textarea id="reason" name="reason" rows={2} minLength={3} maxLength={200} required />
          </Field>

          <FormError message={state.error} />

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"
            >
              Vazgeç
            </button>
            <div className="flex-1">
              <SubmitButton>Gönder</SubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

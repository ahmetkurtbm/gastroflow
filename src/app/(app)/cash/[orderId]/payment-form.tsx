"use client";

import { useActionState, useState } from "react";

import { Field, FormError, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { recordPayment, type ActionState } from "@/lib/cash/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const initial: ActionState = {};

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  meal_card: "Yemek kartı",
  on_account: "Açık hesap",
};

export function PaymentForm({
  orderId,
  remainingLira,
  splitSuggestions,
  dict,
}: {
  orderId: string;
  remainingLira: number;
  splitSuggestions: { parts: number; shareLira: number }[];
  dict: Dictionary["cash"];
}) {
  const [state, action] = useActionState(recordPayment, initial);
  const [amount, setAmount] = useState(remainingLira.toFixed(2));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />

      {splitSuggestions.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Hızlı bölüşüm</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAmount(remainingLira.toFixed(2))}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken"
            >
              {dict.fullAmount}
            </button>
            {splitSuggestions.map(({ parts, shareLira }) => (
              <button
                key={parts}
                type="button"
                onClick={() => setAmount(shareLira.toFixed(2))}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken"
              >
                {parts} kişi (
                {shareLira.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                ₺)
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tutar (TL)" htmlFor="amount">
          <TextInput
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="Ödeme yöntemi" htmlFor="method">
          <Select id="method" name="method" defaultValue="cash">
            {Object.entries(METHOD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Varsayılan KAPALI: masaya önden ödeyip oturmaya devam eden müşteri
          modelini kırmamak için ödeme artık adisyonu otomatik kapatmıyor
          (bkz. `recordPayment`'ın doc-comment'i) — kasiyer isterse klasik
          "öde ve bitir" akışını burada işaretleyerek geri açabiliyor. */}
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="closeAfterPayment" value="true" className="h-4 w-4 rounded border-line" />
        Ödeme sonrası masayı kapat
      </label>

      <FormError message={state.error} />

      <SubmitButton>{dict.payButton}</SubmitButton>
    </form>
  );
}

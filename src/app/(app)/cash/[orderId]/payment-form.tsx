"use client";

import { useActionState, useState } from "react";

import { Field, FormError, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { recordPayment, type ActionState } from "@/lib/cash/actions";

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
}: {
  orderId: string;
  remainingLira: number;
  splitSuggestions: { parts: number; shareLira: number }[];
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
              Tamamı
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

      <FormError message={state.error} />

      <SubmitButton>Ödemeyi al</SubmitButton>
    </form>
  );
}

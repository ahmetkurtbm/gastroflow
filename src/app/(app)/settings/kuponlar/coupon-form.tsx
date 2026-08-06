"use client";

import { useActionState } from "react";

import { Field, FormError, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { createCoupon, type ActionState } from "@/lib/coupons/actions";

const initial: ActionState = {};

export function CouponForm() {
  const [state, action] = useActionState(createCoupon, initial);

  return (
    <form action={action} className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kod (ör. YAZ2026)" htmlFor="code">
          <TextInput id="code" name="code" required maxLength={30} placeholder="YAZ2026" />
        </Field>
        <Field label="Tür" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue="percent">
            <option value="percent">Yüzde (%)</option>
            <option value="amount">Sabit tutar (₺)</option>
          </Select>
        </Field>
        <Field label="Değer" htmlFor="value">
          <TextInput id="value" name="value" type="number" step="0.01" min="0.01" required />
        </Field>
        <Field label="Maks. kullanım (opsiyonel)" htmlFor="maxUses">
          <TextInput id="maxUses" name="maxUses" type="number" step="1" min="1" />
        </Field>
        <Field label="Son geçerlilik tarihi (opsiyonel)" htmlFor="validUntil">
          <TextInput id="validUntil" name="validUntil" type="date" />
        </Field>
      </div>
      <FormError message={state.error} />
      <SubmitButton>Kupon oluştur</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton, TextInput } from "@/components/ui/form";
import { addSupplier, type ActionState } from "@/lib/purchasing/actions";

const initial: ActionState = {};

export function SupplierForm() {
  const [state, action] = useActionState(addSupplier, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface-raised p-5">
      <h2 className="text-sm font-semibold text-ink">Yeni tedarikçi</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ad" htmlFor="name">
          <TextInput id="name" name="name" required maxLength={120} />
        </Field>
        <Field label="Yetkili" htmlFor="contactName">
          <TextInput id="contactName" name="contactName" maxLength={120} />
        </Field>
        <Field label="Telefon" htmlFor="phone">
          <TextInput id="phone" name="phone" maxLength={30} />
        </Field>
        <Field label="E-posta" htmlFor="email">
          <TextInput id="email" name="email" type="email" maxLength={200} />
        </Field>
        <Field label="Teslim süresi (gün)" htmlFor="leadTimeDays">
          <TextInput id="leadTimeDays" name="leadTimeDays" type="number" min="0" defaultValue="1" required />
        </Field>
      </div>

      <FormError message={state.error} />
      {state.ok ? <p className="text-sm text-ok">Tedarikçi eklendi.</p> : null}

      <SubmitButton>Tedarikçi ekle</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { Field, FormError, Select, SubmitButton, TextInput } from "@/components/ui/form";
import { createShift, type ActionState } from "@/lib/shifts/actions";

const initial: ActionState = {};

export function ShiftForm({
  staff,
  branches,
}: {
  staff: { userId: string; fullName: string }[];
  branches: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createShift, initial);

  return (
    <form action={action} className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Personel" htmlFor="userId">
          <Select id="userId" name="userId" required defaultValue="">
            <option value="" disabled>
              Seç…
            </option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Şube" htmlFor="branchId">
          <Select id="branchId" name="branchId" required defaultValue={branches[0]?.id ?? ""}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Başlangıç" htmlFor="startsAt">
          <TextInput id="startsAt" name="startsAt" type="datetime-local" required />
        </Field>
        <Field label="Bitiş" htmlFor="endsAt">
          <TextInput id="endsAt" name="endsAt" type="datetime-local" required />
        </Field>
      </div>
      <Field label="Not (opsiyonel)" htmlFor="note">
        <TextInput id="note" name="note" maxLength={200} placeholder="ör. mutfak istasyonu" />
      </Field>
      <FormError message={state.error} />
      <SubmitButton>Vardiya ekle</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton, TextInput } from "@/components/ui/form";
import { addArea, type ActionState } from "@/lib/floor/actions";

const initial: ActionState = {};

export function AddAreaForm() {
  const [state, action] = useActionState(addArea, initial);

  return (
    <form action={action} className="space-y-3 p-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Yeni alan (ör. Bahçe, Teras)" htmlFor="area-name">
            <TextInput id="area-name" name="name" required maxLength={60} />
          </Field>
        </div>
        <SubmitButton>Ekle</SubmitButton>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

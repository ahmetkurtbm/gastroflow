"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton, TextInput } from "@/components/ui/form";
import { addTable, type ActionState } from "@/lib/floor/actions";

const initial: ActionState = {};

export function AddTableForm({ areaId }: { areaId: string }) {
  const [state, action] = useActionState(addTable, initial);

  return (
    <form action={action} className="space-y-2 px-4 py-3">
      <input type="hidden" name="areaId" value={areaId} />
      <div className="flex items-end gap-2">
        <div className="w-24">
          <Field label="Masa adı" htmlFor={`table-name-${areaId}`}>
            <TextInput id={`table-name-${areaId}`} name="name" required maxLength={30} />
          </Field>
        </div>
        <div className="w-20">
          <Field label="Kişi" htmlFor={`table-seats-${areaId}`}>
            <TextInput
              id={`table-seats-${areaId}`}
              name="seats"
              type="number"
              min={1}
              max={60}
              defaultValue={4}
              required
            />
          </Field>
        </div>
        <SubmitButton variant="secondary">Masa ekle</SubmitButton>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

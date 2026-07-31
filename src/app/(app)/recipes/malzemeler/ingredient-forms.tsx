"use client";

import { useActionState } from "react";

import {
  Field,
  FormError,
  Select,
  SubmitButton,
  TextInput,
} from "@/components/ui/form";
import {
  addConversion,
  createIngredient,
  updateIngredient,
  type ActionState,
} from "@/lib/recipes/actions";

const initial: ActionState = {};

/** Sık kullanılan evrensel birimler; ambalaj birimleri serbest metin. */
const BASE_UNIT_OPTIONS = [
  { value: "kg", label: "kilogram (kg)" },
  { value: "g", label: "gram (g)" },
  { value: "lt", label: "litre (lt)" },
  { value: "ml", label: "mililitre (ml)" },
  { value: "adet", label: "adet" },
];

export function CreateIngredientForm() {
  const [state, action] = useActionState(createIngredient, initial);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Hammadde adı" htmlFor="name">
          <TextInput id="name" name="name" required placeholder="Mozzarella" />
        </Field>
        <Field label="Temel birim" htmlFor="baseUnit" hint="Stok ve maliyetin tutulduğu birim">
          <Select id="baseUnit" name="baseUnit" defaultValue="kg">
            {BASE_UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Birim maliyet (TL)" htmlFor="costPerBaseUnit">
          <TextInput
            id="costPerBaseUnit"
            name="costPerBaseUnit"
            type="number"
            step="0.0001"
            min="0"
            defaultValue="0"
            required
          />
        </Field>
      </div>

      <FormError message={state.error} />
      <SubmitButton>Hammadde ekle</SubmitButton>
    </form>
  );
}

export function EditIngredientForm({
  id,
  name,
  baseUnit,
  costPerBaseUnit,
}: {
  id: string;
  name: string;
  baseUnit: string;
  costPerBaseUnit: number;
}) {
  const [state, action] = useActionState(updateIngredient, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Hammadde adı" htmlFor="edit-name">
          <TextInput id="edit-name" name="name" defaultValue={name} required />
        </Field>
        <Field label="Temel birim" htmlFor="edit-unit">
          <TextInput id="edit-unit" name="baseUnit" defaultValue={baseUnit} required />
        </Field>
        <Field label="Birim maliyet (TL)" htmlFor="edit-cost">
          <TextInput
            id="edit-cost"
            name="costPerBaseUnit"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={costPerBaseUnit}
            required
          />
        </Field>
      </div>

      <FormError message={state.error} />
      {state.ok ? (
        <p className="text-sm text-ok">Kaydedildi.</p>
      ) : null}
      <SubmitButton>Kaydet</SubmitButton>
    </form>
  );
}

export function AddConversionForm({ inventoryItemId }: { inventoryItemId: string }) {
  const [state, action] = useActionState(addConversion, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
      <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <Field label="1 birim" htmlFor="fromUnit">
          <TextInput id="fromUnit" name="fromUnit" placeholder="koli" required />
        </Field>
        <Field label="şu kadar eder" htmlFor="factor">
          <TextInput
            id="factor"
            name="factor"
            type="number"
            step="0.000001"
            min="0.000001"
            placeholder="24"
            required
          />
        </Field>
        <Field label="şu birimden" htmlFor="toUnit">
          <TextInput id="toUnit" name="toUnit" placeholder="adet" required />
        </Field>
        <SubmitButton variant="secondary">Ekle</SubmitButton>
      </div>

      <FormError message={state.error} />
    </form>
  );
}

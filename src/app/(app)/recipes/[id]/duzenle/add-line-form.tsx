"use client";

import { useActionState, useState } from "react";

import {
  Field,
  FormError,
  Select,
  SubmitButton,
  TextInput,
} from "@/components/ui/form";
import { addRecipeLine, type ActionState } from "@/lib/recipes/actions";

const initial: ActionState = {};

export type ComponentOption = {
  id: string;
  name: string;
  /** Hammaddede temel birim, yarı mamulde çıktı birimi — varsayılan olarak dolar. */
  defaultUnit: string;
};

export function AddLineForm({
  versionId,
  ingredients,
  subRecipes,
}: {
  versionId: string;
  ingredients: ComponentOption[];
  subRecipes: ComponentOption[];
}) {
  const [state, action] = useActionState(addRecipeLine, initial);
  const [type, setType] = useState<"ingredient" | "sub_recipe">("ingredient");

  const options = type === "ingredient" ? ingredients : subRecipes;
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");

  const selected = options.find((o) => o.id === selectedId) ?? options[0];

  function switchType(next: "ingredient" | "sub_recipe") {
    setType(next);
    const nextOptions = next === "ingredient" ? ingredients : subRecipes;
    setSelectedId(nextOptions[0]?.id ?? "");
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="componentType" value={type} />

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => switchType("ingredient")}
          className={`rounded-lg px-3 py-1.5 ${
            type === "ingredient"
              ? "bg-brand-600 text-white"
              : "border border-line text-ink-muted"
          }`}
        >
          Hammadde
        </button>
        <button
          type="button"
          onClick={() => switchType("sub_recipe")}
          disabled={subRecipes.length === 0}
          className={`rounded-lg px-3 py-1.5 disabled:opacity-40 ${
            type === "sub_recipe"
              ? "bg-brand-600 text-white"
              : "border border-line text-ink-muted"
          }`}
        >
          Yarı mamul
        </button>
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {type === "ingredient"
            ? "Önce hammadde tanımlamalısın."
            : "Tanımlı yarı mamul yok."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <div className="sm:col-span-2">
            <Field label="Malzeme" htmlFor="componentId">
              <Select
                id="componentId"
                name="componentId"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Miktar" htmlFor="quantity">
            <TextInput
              id="quantity"
              name="quantity"
              type="number"
              step="0.000001"
              min="0.000001"
              required
            />
          </Field>

          <Field label="Birim" htmlFor="unit">
            <TextInput
              id="unit"
              name="unit"
              key={selected?.id}
              defaultValue={selected?.defaultUnit ?? ""}
              required
            />
          </Field>

          <Field label="Fire %" htmlFor="wastePercent">
            <TextInput
              id="wastePercent"
              name="wastePercent"
              type="number"
              step="0.01"
              min="0"
              max="99.99"
              defaultValue="0"
            />
          </Field>
        </div>
      )}

      <FormError message={state.error} />

      {options.length > 0 ? <SubmitButton>Satır ekle</SubmitButton> : null}
    </form>
  );
}

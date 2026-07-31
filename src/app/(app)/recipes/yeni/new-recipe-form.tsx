"use client";

import { useActionState, useState } from "react";

import {
  Field,
  FormError,
  Select,
  SubmitButton,
  TextInput,
} from "@/components/ui/form";
import { createRecipe, type ActionState } from "@/lib/recipes/actions";

const initial: ActionState = {};

export function NewRecipeForm({
  availableMenuItems,
}: {
  availableMenuItems: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createRecipe, initial);
  const [kind, setKind] = useState<"sold" | "sub">("sold");
  const [linkMode, setLinkMode] = useState<"existing" | "new">(
    availableMenuItems.length > 0 ? "existing" : "new",
  );

  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-ink-muted">Reçete türü</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["sold", "Satılan ürün", "Menüde yer alan, müşteriye satılan ürün"],
              ["sub", "Yarı mamul", "Sos, hamur gibi başka reçetelerde kullanılan ara ürün"],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex-1 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                kind === value
                  ? "border-brand-500 bg-brand-50/40"
                  : "border-line hover:bg-surface-sunken"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              <span className="block text-sm font-medium text-ink">{label}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Reçete adı" htmlFor="name">
        <TextInput id="name" name="name" required placeholder="Margarita Pizza" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Çıktı miktarı"
          htmlFor="yieldQuantity"
          hint="Bu reçete bir kez uygulandığında ne kadar ürün çıkar?"
        >
          <TextInput
            id="yieldQuantity"
            name="yieldQuantity"
            type="number"
            step="0.000001"
            min="0.000001"
            defaultValue="1"
            required
          />
        </Field>
        <Field label="Çıktı birimi" htmlFor="yieldUnit">
          <TextInput
            id="yieldUnit"
            name="yieldUnit"
            defaultValue={kind === "sold" ? "adet" : "g"}
            required
          />
        </Field>
      </div>

      {kind === "sold" ? (
        <div className="space-y-3 rounded-lg border border-line p-4">
          <p className="text-xs font-medium text-ink-muted">Menü ürünü</p>

          {availableMenuItems.length > 0 ? (
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setLinkMode("existing")}
                className={`rounded-lg px-3 py-1.5 ${
                  linkMode === "existing"
                    ? "bg-brand-600 text-white"
                    : "border border-line text-ink-muted"
                }`}
              >
                Mevcut ürün
              </button>
              <button
                type="button"
                onClick={() => setLinkMode("new")}
                className={`rounded-lg px-3 py-1.5 ${
                  linkMode === "new"
                    ? "bg-brand-600 text-white"
                    : "border border-line text-ink-muted"
                }`}
              >
                Yeni ürün
              </button>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              Reçetesi olmayan menü ürünü yok; yeni bir tane oluşturulacak.
            </p>
          )}

          {linkMode === "existing" && availableMenuItems.length > 0 ? (
            <Field label="Ürün seç" htmlFor="menuItemId">
              <Select id="menuItemId" name="menuItemId" required>
                {availableMenuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Ürün adı" htmlFor="newMenuItemName">
                <TextInput
                  id="newMenuItemName"
                  name="newMenuItemName"
                  placeholder="Margarita Pizza"
                />
              </Field>
              <Field label="Kategori" htmlFor="categoryName">
                <TextInput
                  id="categoryName"
                  name="categoryName"
                  placeholder="Pizzalar"
                  defaultValue="Genel"
                />
              </Field>
              <Field label="Satış fiyatı (TL)" htmlFor="newMenuItemPrice">
                <TextInput
                  id="newMenuItemPrice"
                  name="newMenuItemPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="180"
                />
              </Field>
            </div>
          )}
        </div>
      ) : null}

      <FormError message={state.error} />

      <div className="flex items-center gap-3">
        <SubmitButton>Reçeteyi oluştur</SubmitButton>
        <p className="text-xs text-ink-muted">
          Taslak olarak açılır; malzemeleri ekledikten sonra yayınlarsın.
        </p>
      </div>
    </form>
  );
}

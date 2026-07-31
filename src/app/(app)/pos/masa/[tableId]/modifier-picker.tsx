"use client";

import { useState } from "react";

import type { MenuModifierGroup } from "@/lib/orders/types";

/**
 * Modifier seçim paneli.
 *
 * Tek grup + tek zorunlu seçim (min=max=1) radio, birden fazla seçime izin
 * veren gruplar checkbox. Zorunlu bir grupta seçim yapılmadan "Ekle"
 * çalışmaz — sunucu tarafında bu kural ZORLANMIYOR (bilinçli: modifier
 * seçimi menü tasarımı, güvenlik sınırı değil; RLS zaten hangi kullanıcının
 * hangi tabloya yazabileceğini koruyor).
 */
export function ModifierPicker({
  itemName,
  basePrice,
  groups,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  basePrice: number;
  groups: MenuModifierGroup[];
  onConfirm: (selection: { ids: string[]; summary: string | null; extraPrice: number }) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  function toggle(group: MenuModifierGroup, modifierId: string) {
    setError(null);
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.maxSelect === 1) {
        // Radio davranışı: aynı seçime tekrar tıklayınca kaldırılabilsin
        // (grup opsiyonelse), değilse başka seçime geçilsin.
        const next = current[0] === modifierId ? [] : [modifierId];
        return { ...prev, [group.id]: next };
      }
      const has = current.includes(modifierId);
      if (has) {
        return { ...prev, [group.id]: current.filter((id) => id !== modifierId) };
      }
      if (current.length >= group.maxSelect) return prev; // sınır aşılmasın
      return { ...prev, [group.id]: [...current, modifierId] };
    });
  }

  function handleConfirm() {
    for (const group of groups) {
      const count = selected[group.id]?.length ?? 0;
      if (count < group.minSelect) {
        setError(`"${group.name}" için en az ${group.minSelect} seçim yapmalısın.`);
        return;
      }
    }

    const chosen = groups.flatMap((group) =>
      (selected[group.id] ?? []).map((id) => group.modifiers.find((m) => m.id === id)!),
    );

    onConfirm({
      ids: chosen.map((m) => m.id),
      summary: chosen.length > 0 ? chosen.map((m) => m.name).join(", ") : null,
      extraPrice: chosen.reduce((sum, m) => sum + m.priceDelta, 0),
    });
  }

  const extraPrice = groups
    .flatMap((g) => (selected[g.id] ?? []).map((id) => g.modifiers.find((m) => m.id === id)))
    .reduce((sum, m) => sum + (m?.priceDelta ?? 0), 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${itemName} seçenekleri`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface-raised p-5 sm:rounded-2xl">
        <h2 className="text-base font-semibold text-ink">{itemName}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          Taban fiyat{" "}
          {basePrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
        </p>

        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <fieldset key={group.id}>
              <legend className="mb-2 text-sm font-medium text-ink">
                {group.name}
                {group.minSelect > 0 ? (
                  <span className="ml-1.5 text-xs font-normal text-danger">zorunlu</span>
                ) : null}
              </legend>
              <div className="space-y-1.5">
                {group.modifiers.map((modifier) => {
                  const checked = (selected[group.id] ?? []).includes(modifier.id);
                  return (
                    <label
                      key={modifier.id}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        checked
                          ? "border-brand-500 bg-brand-50/40"
                          : "border-line hover:bg-surface-sunken"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={group.maxSelect === 1 ? "radio" : "checkbox"}
                          name={group.id}
                          checked={checked}
                          onChange={() => toggle(group, modifier.id)}
                          className="accent-brand-600"
                        />
                        {modifier.name}
                      </span>
                      {modifier.priceDelta !== 0 ? (
                        <span className="tabular-nums text-ink-muted">
                          {modifier.priceDelta > 0 ? "+" : ""}
                          {modifier.priceDelta.toLocaleString("tr-TR")} ₺
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Ekle ·{" "}
            {(basePrice + extraPrice).toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            ₺
          </button>
        </div>
      </div>
    </div>
  );
}

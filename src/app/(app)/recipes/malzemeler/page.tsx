import type { Metadata } from "next";
import Link from "next/link";

import { formatRate } from "@/core/money";
import { createClient } from "@/lib/supabase/server";

import { CreateIngredientForm } from "./ingredient-forms";

export const metadata: Metadata = { title: "Hammaddeler" };

export default async function IngredientsPage() {
  const supabase = await createClient();

  const [itemsResult, conversionsResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, name, base_unit, cost_per_base_unit")
      .order("name"),
    supabase.from("item_unit_conversions").select("inventory_item_id"),
  ]);

  const conversionCount = new Map<string, number>();
  for (const row of conversionsResult.data ?? []) {
    conversionCount.set(
      row.inventory_item_id,
      (conversionCount.get(row.inventory_item_id) ?? 0) + 1,
    );
  }

  const items = itemsResult.data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink">
        ← Reçeteler
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Hammaddeler</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Satın alınan ve reçetelerde kullanılan malzemeler. Maliyet, temel birim
          başına girilir; reçetede başka bir birim kullanacaksan malzemeye
          dönüşüm tanımla.
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Yeni hammadde</h2>
        <CreateIngredientForm />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">
          Tanımlı hammaddeler ({items.length})
        </h2>

        {items.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
            Henüz hammadde eklenmemiş.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Hammadde</th>
                  <th scope="col" className="px-4 py-3 font-medium">Birim</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Maliyet</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Dönüşüm</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/recipes/malzemeler/${item.id}`}
                        className="font-medium text-ink underline-offset-4 hover:underline"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{item.base_unit}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {formatRate(Number(item.cost_per_base_unit))} / {item.base_unit}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                      {conversionCount.get(item.id) ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

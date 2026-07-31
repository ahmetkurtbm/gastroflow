import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/ui/form";
import { deleteConversion } from "@/lib/recipes/actions";
import { createClient } from "@/lib/supabase/server";

import { AddConversionForm, EditIngredientForm } from "../ingredient-forms";

export const metadata: Metadata = { title: "Hammadde" };

export default async function IngredientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [itemResult, conversionsResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, name, base_unit, cost_per_base_unit")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("item_unit_conversions")
      .select("id, from_unit, to_unit, factor")
      .eq("inventory_item_id", id)
      .order("from_unit"),
  ]);

  const item = itemResult.data;
  if (!item) notFound();

  const conversions = conversionsResult.data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/recipes/malzemeler"
        className="text-sm text-ink-muted hover:text-ink"
      >
        ← Hammaddeler
      </Link>

      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight text-ink">
        {item.name}
      </h1>

      <section className="rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Bilgiler</h2>
        <EditIngredientForm
          id={item.id}
          name={item.name}
          baseUnit={item.base_unit}
          costPerBaseUnit={Number(item.cost_per_base_unit)}
        />
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="text-sm font-semibold text-ink">Birim dönüşümleri</h2>
        <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
          Bu malzemeye özel dönüşümler. Ambalaj (1 koli = 24 adet), yoğunluk
          (1 lt zeytinyağı = 916 g) veya birim ağırlık (1 adet yumurta = 55 g).
          Reçetede temel birimden farklı bir birim kullanacaksan buraya bir
          dönüşüm eklemen gerekir — sistem tahmin yürütmez, hata verir.
        </p>

        {conversions.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {conversions.map((conversion) => (
              <li
                key={conversion.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
              >
                <span className="text-sm text-ink">
                  1 {conversion.from_unit} ={" "}
                  <span className="font-medium tabular-nums">
                    {Number(conversion.factor).toLocaleString("tr-TR", {
                      maximumFractionDigits: 6,
                    })}
                  </span>{" "}
                  {conversion.to_unit}
                </span>
                <form action={deleteConversion}>
                  <input type="hidden" name="id" value={conversion.id} />
                  <SubmitButton variant="danger">Sil</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink-muted">Henüz dönüşüm tanımlanmamış.</p>
        )}

        <AddConversionForm inventoryItemId={item.id} />
      </section>
    </div>
  );
}

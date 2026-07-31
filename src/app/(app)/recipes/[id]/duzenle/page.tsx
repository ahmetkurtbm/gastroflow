import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/ui/form";
import { formatMoney, money } from "@/core/money";
import { formatQuantity } from "@/core/units";
import {
  createDraftVersion,
  deleteRecipeLine,
  publishVersion,
} from "@/lib/recipes/actions";
import { loadCatalog, safeCost } from "@/lib/recipes/catalog";
import { createClient } from "@/lib/supabase/server";

import { AddLineForm, type ComponentOption } from "./add-line-form";

export const metadata: Metadata = { title: "Reçete düzenle" };

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, name, menu_item_id")
    .eq("id", id)
    .maybeSingle();

  if (!recipe) notFound();

  const { data: versions } = await supabase
    .from("recipe_versions")
    .select("id, version_no, status, yield_quantity, yield_unit")
    .eq("recipe_id", id)
    .order("version_no", { ascending: false });

  const draft = versions?.find((v) => v.status === "draft");

  // Taslak yoksa: yayınlanmış reçete dondurulmuştur, düzenlemenin tek yolu
  // yeni bir versiyon açmaktır.
  if (!draft) {
    const active = versions?.find((v) => v.status === "active");
    return (
      <div className="mx-auto max-w-2xl">
        <Link href={`/recipes/${id}`} className="text-sm text-ink-muted hover:text-ink">
          ← {recipe.name}
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">
          {recipe.name}
        </h1>
        <div className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
          <h2 className="text-sm font-semibold text-ink">
            Bu reçete yayınlanmış durumda
          </h2>
          <p className="mt-2 mb-4 text-sm leading-relaxed text-ink-muted">
            Yayınlanmış versiyonlar değiştirilemez — geçmiş maliyet raporlarının
            bozulmaması için. Düzenlemek istiyorsan yeni bir versiyon açılır ve
            {active ? ` v${active.version_no}` : " mevcut"} satırları oraya kopyalanır.
            Yayınlayana kadar hesaplar eski versiyondan yapılmaya devam eder.
          </p>
          <form action={createDraftVersion}>
            <input type="hidden" name="recipeId" value={id} />
            <SubmitButton>Yeni versiyon aç</SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  const [{ data: lines }, { data: ingredientRows }, { data: recipeRows }] =
    await Promise.all([
      supabase
        .from("recipe_lines")
        .select("id, line_no, component_type, inventory_item_id, sub_recipe_id, quantity, unit, waste_percent")
        .eq("recipe_version_id", draft.id)
        .order("line_no"),
      supabase
        .from("inventory_items")
        .select("id, name, base_unit")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("recipes")
        .select("id, name, menu_item_id, recipe_versions(yield_unit, status)")
        .eq("is_active", true)
        .neq("id", id)
        .order("name"),
    ]);

  const ingredientById = new Map(
    (ingredientRows ?? []).map((row) => [row.id, row] as const),
  );
  const recipeById = new Map((recipeRows ?? []).map((row) => [row.id, row] as const));

  const ingredientOptions: ComponentOption[] = (ingredientRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    defaultUnit: row.base_unit,
  }));

  // Yarı mamuller: menü ürününe bağlı olmayan reçeteler.
  const subRecipeOptions: ComponentOption[] = (recipeRows ?? [])
    .filter((row) => row.menu_item_id === null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      defaultUnit:
        row.recipe_versions?.find((v) => v.status === "active")?.yield_unit ??
        row.recipe_versions?.[0]?.yield_unit ??
        "g",
    }));

  // Taslağın canlı maliyeti — yayınlamadan önce görebilmek için.
  const { catalog } = await loadCatalog({ preferDraftFor: id });
  const cost = safeCost(id, catalog);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/recipes/${id}`} className="text-sm text-ink-muted hover:text-ink">
        ← {recipe.name}
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {recipe.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Taslak v{draft.version_no} · Çıktı{" "}
            {formatQuantity(Number(draft.yield_quantity), draft.yield_unit)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-ink-muted">Güncel maliyet</p>
          <p className="text-lg font-bold tabular-nums text-ink">
            {cost.ok ? formatMoney(money(cost.cost)) : "—"}
          </p>
        </div>
      </div>

      {!cost.ok ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn"
        >
          {cost.error}
        </p>
      ) : null}

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
          Malzemeler
        </h2>

        {(lines ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            Henüz malzeme eklenmemiş.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {(lines ?? []).map((line) => {
              const label =
                line.component_type === "ingredient"
                  ? (ingredientById.get(line.inventory_item_id ?? "")?.name ??
                    "Bilinmeyen hammadde")
                  : (recipeById.get(line.sub_recipe_id ?? "")?.name ??
                    "Bilinmeyen yarı mamul");
              const waste = Number(line.waste_percent);

              return (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {label}
                      {line.component_type === "sub_recipe" ? (
                        <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-muted">
                          yarı mamul
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatQuantity(Number(line.quantity), line.unit)}
                      {waste > 0 ? ` · fire %${waste}` : ""}
                    </p>
                  </div>

                  <form action={deleteRecipeLine}>
                    <input type="hidden" name="id" value={line.id} />
                    <SubmitButton variant="danger">Sil</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Malzeme ekle</h2>
        <AddLineForm
          versionId={draft.id}
          ingredients={ingredientOptions}
          subRecipes={subRecipeOptions}
        />
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Birim, malzemenin kendi biriminden farklı olabilir — ama arada bir
          dönüşüm tanımlı olmalı. Örneğin kilogramla fiyatlanan zeytinyağını
          reçetede gram olarak kullanmak için hammadde kartında yoğunluk
          tanımlaman gerekir.{" "}
          <Link href="/recipes/malzemeler" className="underline underline-offset-2">
            Hammaddeler
          </Link>
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="text-sm font-semibold text-ink">Yayınla</h2>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-ink-muted">
          Yayınladığında bu versiyon dondurulur ve maliyet hesapları buna göre
          yapılır. Varsa önceki aktif versiyon otomatik arşivlenir.
        </p>

        {/*
          Maliyeti hesaplanamayan reçete yayınlanamaz. Yayınlansaydı dondurulmuş
          ve maliyeti sürekli hata veren bir versiyon oluşurdu; düzeltmek için
          yeni versiyon açmak gerekirdi. Hatayı taslakken yakalamak çok daha ucuz.
        */}
        {cost.ok && (lines ?? []).length > 0 ? (
          <form action={publishVersion}>
            <input type="hidden" name="versionId" value={draft.id} />
            <SubmitButton>Versiyonu yayınla</SubmitButton>
          </form>
        ) : (
          <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
            {(lines ?? []).length === 0
              ? "Yayınlamadan önce en az bir malzeme ekle."
              : "Maliyet hesaplanamadığı için yayınlanamaz. Yukarıdaki uyarıyı gider."}
          </p>
        )}
      </section>
    </div>
  );
}

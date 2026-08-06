import type { Metadata } from "next";
import Link from "next/link";

import { ExcelImportForm } from "@/components/ui/excel-import-form";
import { formatRate, money, formatMoney } from "@/core/money";
import { foodCostRatio } from "@/core/recipe";
import { formatQuantity } from "@/core/units";
import { importMenuItems } from "@/lib/recipes/actions";
import { loadCatalog, safeCost } from "@/lib/recipes/catalog";

export const metadata: Metadata = { title: "Reçeteler" };

const percentFormatter = new Intl.NumberFormat("tr-TR", {
  style: "percent",
  maximumFractionDigits: 1,
});

/**
 * Food cost oranını renklendirir.
 * Sektörde tipik hedef %25–35. Üstü ya fiyat düşük, ya porsiyon cömert,
 * ya da tedarik maliyeti kaçmış demektir.
 */
function ratioTone(ratio: number): string {
  if (ratio <= 0.35) return "text-ok";
  if (ratio <= 0.45) return "text-warn";
  return "text-danger";
}

export default async function RecipesPage() {
  const { catalog, summaries } = await loadCatalog();

  const rows = summaries.map((summary) => ({
    summary,
    cost: safeCost(summary.id, catalog),
  }));

  const sold = rows.filter((r) => !r.summary.isSubRecipe);
  const subRecipes = rows.filter((r) => r.summary.isSubRecipe);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Reçeteler ve maliyet
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Maliyetler yayınlanmış reçete versiyonlarından hesaplanır. Bir reçeteyi
            değiştirmek yeni versiyon açar; geçmiş raporlar olduğu gibi kalır.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Link
            href="/recipes/malzemeler"
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
          >
            Hammaddeler
          </Link>
          <Link
            href="/recipes/kombo"
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
          >
            Kombolar
          </Link>
          <Link
            href="/recipes/yeni"
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Yeni reçete
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Excel ile toplu ürün/fiyat ekle veya güncelle
        </h2>
        <p className="px-4 pt-3 text-xs leading-relaxed text-ink-muted">
          Yalnızca ürün, kategori, fiyat ve KDV — reçete/maliyet burada oluşmaz,
          içe aktardıktan sonra reçetesini &quot;Yeni reçete&quot;den ekleyebilirsin.
        </p>
        <ExcelImportForm
          action={importMenuItems}
          templateHref="/api/export/menu-urunleri?template=1"
          exportHref="/api/export/menu-urunleri"
        />
      </section>

      {summaries.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
          Henüz yayınlanmış reçete yok.
        </p>
      ) : (
        <div className="space-y-6">
          <RecipeTable
            title="Satılan ürünler"
            emptyLabel="Menü ürününe bağlı reçete yok."
            rows={sold}
            showFoodCost
          />
          <RecipeTable
            title="Yarı mamuller"
            description="Doğrudan satılmayan ara ürünler: sos, hamur, marine et. Diğer reçetelerin içinde kullanılırlar."
            emptyLabel="Yarı mamul yok."
            rows={subRecipes}
          />
        </div>
      )}
    </div>
  );
}

type Row = {
  summary: Awaited<ReturnType<typeof loadCatalog>>["summaries"][number];
  cost: ReturnType<typeof safeCost>;
};

function RecipeTable({
  title,
  description,
  emptyLabel,
  rows,
  showFoodCost = false,
}: {
  title: string;
  description?: string;
  emptyLabel: string;
  rows: Row[];
  showFoodCost?: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description ? (
        <p className="mt-1 mb-2 text-xs leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-2 rounded-xl border border-line bg-surface-raised px-4 py-6 text-center text-sm text-ink-muted">
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Reçete</th>
                <th scope="col" className="px-4 py-3 font-medium">Çıktı</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Maliyet</th>
                {showFoodCost ? (
                  <>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Satış</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Food cost</th>
                  </>
                ) : (
                  <th scope="col" className="px-4 py-3 text-right font-medium">Birim maliyet</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ summary, cost }) => (
                <tr key={summary.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/recipes/${summary.id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {summary.name}
                    </Link>
                    <span className="ml-2 text-xs text-ink-muted">
                      v{summary.versionNo}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                    {formatQuantity(summary.yieldQuantity, summary.yieldUnit)}
                  </td>

                  {cost.ok ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink">
                        {formatMoney(money(cost.cost))}
                      </td>
                      {showFoodCost ? (
                        <>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink-muted">
                            {summary.sellingPrice === null
                              ? "—"
                              : formatMoney(money(summary.sellingPrice))}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                            {summary.sellingPrice ? (
                              <span
                                className={ratioTone(
                                  foodCostRatio(cost.cost, summary.sellingPrice),
                                )}
                              >
                                {percentFormatter.format(
                                  foodCostRatio(cost.cost, summary.sellingPrice),
                                )}
                              </span>
                            ) : (
                              <span className="text-ink-muted">—</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink-muted">
                          {formatRate(cost.costPerYieldUnit)} / {summary.yieldUnit}
                        </td>
                      )}
                    </>
                  ) : (
                    <td
                      colSpan={showFoodCost ? 3 : 2}
                      className="px-4 py-3 text-right text-xs text-danger"
                    >
                      {cost.error}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

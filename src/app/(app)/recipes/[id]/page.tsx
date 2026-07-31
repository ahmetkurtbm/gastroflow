import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { formatMoney, formatRate, money } from "@/core/money";
import {
  costOfRecipe,
  foodCostRatio,
  priceForTargetFoodCost,
  type CostBreakdown,
  type CostLine,
} from "@/core/recipe";
import { formatQuantity } from "@/core/units";
import { loadCatalog } from "@/lib/recipes/catalog";

export const metadata: Metadata = { title: "Reçete maliyeti" };

const percentFormatter = new Intl.NumberFormat("tr-TR", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Fire uygulanmışsa kaç birim fazladan harcandığını anlatır. */
function wasteNote(line: CostLine): string | null {
  const extra = line.effectiveQuantity - line.quantity;
  if (extra <= 0.0001) return null;
  return `fire dahil ${formatQuantity(line.effectiveQuantity, line.unit)}`;
}

function BreakdownRows({
  breakdown,
  depth = 0,
}: {
  breakdown: CostBreakdown;
  depth?: number;
}) {
  // Her kalem, varsa kendi alt içeriğiyle BİRLİKTE render edilir.
  // Önce tüm kalemleri, sonra tüm alt ağaçları basmak ağacı okunamaz yapıyordu:
  // hamurun malzemeleri mozzarellanın altında görünüyordu.
  return (
    <>
      {breakdown.lines.map((line, index) => {
        const note = wasteNote(line);
        return (
          <Fragment key={`${breakdown.recipeId}-${index}`}>
          <tr className="border-b border-line last:border-0">
            <td className="px-4 py-2.5">
              <div style={{ paddingLeft: `${depth * 16}px` }}>
                <span className={depth > 0 ? "text-ink-muted" : "text-ink"}>
                  {line.breakdown ? "▾ " : ""}
                  {line.label}
                </span>
                {note ? (
                  <span className="ml-2 text-xs text-warn">{note}</span>
                ) : null}
              </div>
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
              {formatQuantity(line.quantity, line.unit)}
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-ink">
              {formatRate(line.cost)}
            </td>
            <td className="px-4 py-2.5">
              {/* Payı sayı yerine çubukla göstermek, "hangi kalem bizi
                  yiyor?" sorusunu bir bakışta cevaplıyor. */}
              <div className="flex items-center gap-2">
                <div
                  aria-hidden
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
                >
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.round(line.share * 100)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-muted">
                  {percentFormatter.format(line.share)}
                </span>
              </div>
            </td>
          </tr>

          {line.breakdown ? (
            <BreakdownRows breakdown={line.breakdown} depth={depth + 1} />
          ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { catalog, summaries } = await loadCatalog();

  const summary = summaries.find((s) => s.id === id);
  if (!summary) notFound();

  let breakdown: CostBreakdown;
  try {
    breakdown = costOfRecipe(id, catalog);
  } catch (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink">
          ← Reçeteler
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-ink">{summary.name}</h1>
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          Maliyet hesaplanamadı:{" "}
          {error instanceof Error ? error.message : "bilinmeyen hata"}
        </p>
      </div>
    );
  }

  const ratio = summary.sellingPrice
    ? foodCostRatio(breakdown.totalCost, summary.sellingPrice)
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/recipes" className="text-sm text-ink-muted hover:text-ink">
        ← Reçeteler
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {summary.name}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Versiyon {summary.versionNo} · Çıktı{" "}
          {formatQuantity(summary.yieldQuantity, summary.yieldUnit)}
          {summary.isSubRecipe ? " · Yarı mamul" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Toplam maliyet" value={formatMoney(money(breakdown.totalCost))} />
        <Tile
          label={`Birim (${summary.yieldUnit})`}
          value={formatRate(breakdown.costPerYieldUnit)}
        />
        <Tile
          label="Satış fiyatı"
          value={
            summary.sellingPrice === null
              ? "—"
              : formatMoney(money(summary.sellingPrice))
          }
        />
        <Tile
          label="Food cost"
          value={ratio === null ? "—" : percentFormatter.format(ratio)}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Maliyet dökümü</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Kalem</th>
                <th scope="col" className="px-4 py-3 font-medium">Miktar</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Tutar</th>
                <th scope="col" className="px-4 py-3 font-medium">Pay</th>
              </tr>
            </thead>
            <tbody>
              <BreakdownRows breakdown={breakdown} />
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Girintili satırlar yarı mamullerin içeriğidir. Yüzdeler her seviyenin
          kendi toplamına göre hesaplanır.
        </p>
      </section>

      {ratio !== null ? <PriceSimulation cost={breakdown.totalCost} /> : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

/** Hedef food cost oranına göre olması gereken satış fiyatı. */
function PriceSimulation({ cost }: { cost: number }) {
  const targets = [0.25, 0.3, 0.35];

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-raised p-5">
      <h2 className="text-sm font-semibold text-ink">Hedef fiyat</h2>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-ink-muted">
        Bu maliyetle, seçilen food cost oranına ulaşmak için gereken satış fiyatı.
      </p>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {targets.map((target) => (
          <div key={target}>
            <dt className="text-xs text-ink-muted">
              %{Math.round(target * 100)} hedef
            </dt>
            <dd className="text-base font-semibold tabular-nums text-ink">
              {formatMoney(money(priceForTargetFoodCost(cost, target)))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

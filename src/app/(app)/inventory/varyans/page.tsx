import type { Metadata } from "next";
import Link from "next/link";

import { formatQuantity } from "@/core/units";
import { loadVarianceReport } from "@/lib/inventory/queries";

export const metadata: Metadata = { title: "Varyans Raporu" };

const PERIOD_DAYS = 30;

function varianceClass(percent: number | null): string {
  if (percent === null) return "text-ink-muted";
  if (Math.abs(percent) < 2) return "text-ok";
  if (percent < 0) return "text-danger";
  return "text-warn";
}

export default async function VariancePage() {
  const rows = await loadVarianceReport(PERIOD_DAYS);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/inventory" className="text-sm text-ink-muted hover:text-ink">
        ← Stok
      </Link>

      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Teorik / Fiili Varyans Raporu</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {`Son ${PERIOD_DAYS} gün.`}{" "}
          &quot;Teorik tüketim&quot; reçeteye göre satıştan
          düşülmesi gereken miktar. &quot;Sayım farkı&quot;, kayıtlı satış ve
          zayiattan sonra fiziksel sayımda bulunan AÇIKLANAMAYAN sapma —
          negatifse rafta olması gerekenden az çıkmış demektir.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-muted">
          Bu dönemde hiçbir hammaddede satış, zayiat ya da sayım hareketi yok.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Hammadde</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Teorik tüketim</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Kayıtlı zayiat</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Sayım farkı</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.itemId} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink">{row.itemName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatQuantity(row.theoreticalUsage, row.baseUnit)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatQuantity(row.loggedWaste, row.baseUnit)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${varianceClass(row.variancePercent)}`}
                  >
                    {row.countVariance > 0 ? "+" : ""}
                    {formatQuantity(row.countVariance, row.baseUnit)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${varianceClass(row.variancePercent)}`}
                  >
                    {row.variancePercent === null
                      ? "—"
                      : `${row.variancePercent > 0 ? "+" : ""}${row.variancePercent.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

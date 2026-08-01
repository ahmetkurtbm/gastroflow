import type { Metadata } from "next";
import Link from "next/link";

import { formatQuantity } from "@/core/units";
import { loadRecentWaste, loadStockPickLists } from "@/lib/inventory/queries";

import { WasteForm } from "./waste-form";

export const metadata: Metadata = { title: "Zayiat Girişi" };

const REASON_LABEL: Record<string, string> = {
  spoilage: "Bozulma",
  prep_error: "Hazırlık/pişirme hatası",
  dropped: "Düşürüldü / kırıldı",
  expired: "Son kullanma tarihi geçti",
  customer_return: "Müşteri iadesi",
  other: "Diğer",
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export default async function WastePage() {
  const [picks, recentWaste] = await Promise.all([loadStockPickLists(), loadRecentWaste(30)]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/inventory" className="text-sm text-ink-muted hover:text-ink">
        ← Stok
      </Link>

      <h1 className="mt-2 mb-6 text-2xl font-bold tracking-tight text-ink">Zayiat Girişi</h1>

      <WasteForm picks={picks} />

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Son zayiat kayıtları
        </h2>
        {recentWaste.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Henüz zayiat kaydı yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recentWaste.map((row) => (
              <li key={row.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink">
                    {row.itemName} <span className="text-ink-muted">· {row.locationName}</span>
                  </span>
                  <span className="tabular-nums text-danger">
                    {formatQuantity(row.quantity, row.baseUnit)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {REASON_LABEL[row.reason] ?? row.reason}
                  {row.note ? ` · ${row.note}` : ""} · {dateFormatter.format(new Date(row.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

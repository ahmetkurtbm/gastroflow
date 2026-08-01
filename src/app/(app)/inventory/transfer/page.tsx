import type { Metadata } from "next";
import Link from "next/link";

import { formatQuantity } from "@/core/units";
import { loadRecentTransfers, loadStockPickLists } from "@/lib/inventory/queries";

import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "Depolar Arası Transfer" };

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export default async function TransferPage() {
  const [picks, recentTransfers] = await Promise.all([
    loadStockPickLists(),
    loadRecentTransfers(30),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/inventory" className="text-sm text-ink-muted hover:text-ink">
        ← Stok
      </Link>

      <h1 className="mt-2 mb-6 text-2xl font-bold tracking-tight text-ink">Depolar Arası Transfer</h1>

      <TransferForm picks={picks} />

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Son transferler
        </h2>
        {recentTransfers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Henüz transfer kaydı yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recentTransfers.map((row) => (
              <li key={row.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink">
                    {row.fromLocationName} → {row.toLocationName}
                  </span>
                  <span className="tabular-nums text-ink">
                    {formatQuantity(row.quantity, row.baseUnit)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {row.itemName}
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

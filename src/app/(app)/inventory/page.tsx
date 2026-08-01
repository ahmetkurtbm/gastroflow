import type { Metadata } from "next";
import Link from "next/link";

import { formatQuantity } from "@/core/units";
import { loadLowStock, loadRecentMovements, loadStockOverview } from "@/lib/inventory/queries";

export const metadata: Metadata = { title: "Stok" };

const MOVEMENT_LABEL: Record<string, string> = {
  purchase_in: "Alış",
  sale_out: "Satış",
  waste: "Zayiat",
  transfer_in: "Transfer (giriş)",
  transfer_out: "Transfer (çıkış)",
  production_in: "Üretim (çıktı)",
  production_out: "Üretim (girdi)",
  count_adjustment: "Sayım düzeltmesi",
  reversal: "Geri alma",
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export default async function InventoryPage() {
  const [overview, lowStock, movements] = await Promise.all([
    loadStockOverview(),
    loadLowStock(),
    loadRecentMovements(30),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Stok</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Bakiye bir sayı olarak saklanmıyor; her satırın altındaki hareket
            defterinden anlık hesaplanıyor. Satıştan düşüm, adisyon kapanınca
            reçeteye göre otomatik yazılır.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Link
            href="/inventory/varyans"
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Varyans raporu
          </Link>
          <Link
            href="/inventory/sayim"
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Sayım
          </Link>
          <Link
            href="/inventory/transfer"
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Transfer
          </Link>
          <Link
            href="/inventory/zayiat"
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Zayiat gir
          </Link>
        </div>
      </div>

      {lowStock.length > 0 ? (
        <section className="mb-6 rounded-xl border border-warn/40 bg-warn/10 p-4">
          <h2 className="mb-2 text-sm font-semibold text-warn">
            Kritik seviyenin altında ({lowStock.length})
          </h2>
          <ul className="space-y-1">
            {lowStock.map((row, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  {row.itemName}{" "}
                  <span className="text-ink-muted">· {row.locationName}</span>
                </span>
                <span className="tabular-nums text-warn">
                  {formatQuantity(row.balance, row.baseUnit)} / eşik{" "}
                  {formatQuantity(row.reorderPoint, row.baseUnit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Anlık bakiye
        </h2>
        {overview.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Henüz hiçbir hammaddede hareket yok.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Hammadde</th>
                  <th scope="col" className="px-4 py-3 font-medium">Lokasyon</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {overview.map((row) => (
                  <tr
                    key={`${row.locationId}-${row.itemId}`}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-2.5 text-ink">{row.itemName}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{row.locationName}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        row.isLow ? "font-semibold text-warn" : "text-ink"
                      }`}
                    >
                      {formatQuantity(row.balance, row.baseUnit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Son hareketler
        </h2>
        {movements.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Henüz hareket kaydı yok.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Zaman</th>
                  <th scope="col" className="px-4 py-3 font-medium">Hammadde</th>
                  <th scope="col" className="px-4 py-3 font-medium">Tür</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Miktar</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-muted">
                      {dateFormatter.format(new Date(m.createdAt))}
                    </td>
                    <td className="px-4 py-2.5 text-ink">{m.itemName}</td>
                    <td className="px-4 py-2.5 text-ink-muted">
                      {MOVEMENT_LABEL[m.movementType] ?? m.movementType}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        m.quantity < 0 ? "text-danger" : "text-ok"
                      }`}
                    >
                      {m.quantity > 0 ? "+" : ""}
                      {formatQuantity(m.quantity, m.baseUnit)}
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

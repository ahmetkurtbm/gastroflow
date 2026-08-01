import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadStockPickLists } from "@/lib/inventory/queries";
import { loadSupplierItems, loadSuppliers } from "@/lib/purchasing/queries";

import { SupplierItemForm } from "./supplier-item-form";

export const metadata: Metadata = { title: "Tedarikçi" };

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const [suppliers, items, picks] = await Promise.all([
    loadSuppliers(),
    loadSupplierItems(supplierId),
    loadStockPickLists(),
  ]);

  const supplier = suppliers.find((s) => s.id === supplierId);
  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/purchasing/tedarikciler" className="text-sm text-ink-muted hover:text-ink">
        ← Tedarikçiler
      </Link>

      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{supplier.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {supplier.contactName ? `${supplier.contactName} · ` : ""}
          {supplier.phone ? `${supplier.phone} · ` : ""}
          {supplier.email ? `${supplier.email} · ` : ""}
          {supplier.leadTimeDays} gün teslim süresi
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Fiyat listesine ekle</h2>
        <SupplierItemForm supplierId={supplier.id} items={picks.items} />
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Fiyat listesi</h2>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Bu tedarikçinin fiyat listesinde henüz ürün yok.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-ink">
                  {item.itemName}
                  {item.supplierSku ? (
                    <span className="ml-1.5 text-xs text-ink-muted">#{item.supplierSku}</span>
                  ) : null}
                </span>
                <span className="tabular-nums text-ink-muted">
                  {formatLira(item.price)} / {item.baseUnit}
                  {item.minOrderQuantity > 0 ? ` · min ${item.minOrderQuantity} ${item.baseUnit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

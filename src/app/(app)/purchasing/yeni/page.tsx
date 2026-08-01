import type { Metadata } from "next";
import Link from "next/link";

import { loadSupplierItems, loadSuppliers } from "@/lib/purchasing/queries";

import { NewPoForm } from "./new-po-form";

export const metadata: Metadata = { title: "Yeni Sipariş" };

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; item?: string; qty?: string }>;
}) {
  const { supplier, item, qty } = await searchParams;
  const suppliers = await loadSuppliers();

  if (suppliers.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">Yeni Sipariş</h1>
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
          Önce{" "}
          <Link href="/purchasing/tedarikciler" className="font-medium text-brand-600 hover:underline">
            bir tedarikçi ekle
          </Link>
          .
        </p>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link href="/purchasing" className="text-sm text-ink-muted hover:text-ink">
          ← Satın Alma
        </Link>
        <h1 className="mt-2 mb-4 text-2xl font-bold tracking-tight text-ink">Yeni Sipariş</h1>
        <p className="mb-4 text-sm text-ink-muted">Hangi tedarikçiden sipariş vereceksin?</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {suppliers.map((s) => (
            <li key={s.id}>
              <Link
                href={`/purchasing/yeni?supplier=${s.id}`}
                className="block rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm font-medium text-ink hover:border-brand-400"
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const selectedSupplier = suppliers.find((s) => s.id === supplier);
  const items = await loadSupplierItems(supplier);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/purchasing/yeni" className="text-sm text-ink-muted hover:text-ink">
        ← Tedarikçi seç
      </Link>

      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Yeni Sipariş · {selectedSupplier?.name ?? "Bilinmeyen tedarikçi"}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Miktar girdiğin ürünler siparişe eklenir; boş bıraktıkların dahil edilmez.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
          Bu tedarikçinin fiyat listesinde ürün yok.{" "}
          <Link href={`/purchasing/tedarikciler/${supplier}`} className="font-medium text-brand-600 hover:underline">
            Fiyat listesine ekle
          </Link>
          .
        </p>
      ) : (
        <NewPoForm supplierId={supplier} items={items} prefillItemId={item} prefillQty={qty} />
      )}
    </div>
  );
}

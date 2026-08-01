import type { Metadata } from "next";
import Link from "next/link";

import { loadSuppliers } from "@/lib/purchasing/queries";

import { SupplierForm } from "./supplier-form";

export const metadata: Metadata = { title: "Tedarikçiler" };

export default async function SuppliersPage() {
  const suppliers = await loadSuppliers();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/purchasing" className="text-sm text-ink-muted hover:text-ink">
        ← Satın Alma
      </Link>

      <h1 className="mt-2 mb-6 text-2xl font-bold tracking-tight text-ink">Tedarikçiler</h1>

      <SupplierForm />

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Tedarikçi listesi</h2>
        {suppliers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Henüz tedarikçi eklenmedi.</p>
        ) : (
          <ul className="divide-y divide-line">
            {suppliers.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/purchasing/tedarikciler/${s.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-sunken"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{s.name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {s.contactName ? `${s.contactName} · ` : ""}
                      {s.phone ? `${s.phone} · ` : ""}
                      {s.leadTimeDays} gün teslim
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted">{s.itemCount} ürün</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

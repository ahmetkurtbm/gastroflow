import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ExcelImportForm } from "@/components/ui/excel-import-form";
import { importStockCount } from "@/lib/inventory/actions";
import { loadStockPickLists } from "@/lib/inventory/queries";

import { CountForm } from "./count-form";

export const metadata: Metadata = { title: "Sayım" };

export default async function CountPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  const picks = await loadStockPickLists();

  if (picks.locations.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">Sayım</h1>
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
          Önce en az bir lokasyon tanımlamalısın.
        </p>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">Sayım</h1>
        <p className="mb-4 text-sm text-ink-muted">Hangi lokasyonu sayacaksın?</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {picks.locations.map((loc) => (
            <li key={loc.id}>
              <Link
                href={`/inventory/sayim?location=${loc.id}`}
                className="block rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm font-medium text-ink hover:border-brand-400"
              >
                {loc.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const selectedLocation = picks.locations.find((l) => l.id === location);
  if (!selectedLocation) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/inventory/sayim" className="text-sm text-ink-muted hover:text-ink">
        ← Lokasyon seç
      </Link>

      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Sayım · {selectedLocation.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Rafta ne görüyorsan onu yaz — sistemdeki bakiye burada bilinçli olarak
          gösterilmiyor. Fark otomatik hesaplanıp deftere yazılır.
        </p>
      </div>

      {picks.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
          Önce hammadde tanımlamalısın.
        </p>
      ) : (
        <>
          <CountForm locationId={selectedLocation.id} items={picks.items} />

          <section className="mt-6 rounded-xl border border-line bg-surface-raised">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
              Kağıtta/Excel&apos;de sayıldıysa, toplu yükle
            </h2>
            <ExcelImportForm
              action={importStockCount}
              templateHref="/api/export/sayim-sablonu"
              hiddenFields={{ locationId: selectedLocation.id }}
            />
          </section>
        </>
      )}
    </div>
  );
}

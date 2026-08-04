import type { Metadata } from "next";
import Link from "next/link";

import { deleteArea, deleteTable } from "@/lib/floor/actions";
import { loadFloorAdmin } from "@/lib/floor/queries";

import { AddAreaForm } from "./add-area-form";
import { AddTableForm } from "./add-table-form";

export const metadata: Metadata = { title: "Salon ve Masalar" };

/**
 * Alan (salon/bahçe/teras) ve masa yönetimi.
 *
 * Faz 0-7'de bu veriler yalnızca SQL ile ekleniyordu (bkz. supabase/seed.sql);
 * `/pos` ekranı "Ayarlar → Salon ve masalar bölümünden ekle" diyordu ama
 * böyle bir ekran yoktu. Bu sayfa o boşluğu kapatıyor.
 */
export default async function SalonSettingsPage() {
  const areas = await loadFloorAdmin();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/settings" className="text-sm text-ink-muted hover:text-ink">
        ← Ayarlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight text-ink">Salon ve Masalar</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Her masa bir alana ait olmalı — alansız bir masa salon ekranında görünmez.
      </p>

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Yeni alan
        </h2>
        <AddAreaForm />
      </section>

      {areas.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
          Henüz alan tanımlanmamış. Yukarıdan bir tane ekle (ör. &quot;Salon&quot;).
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {areas.map((area) => (
            <section key={area.id} className="rounded-xl border border-line bg-surface-raised">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">{area.name}</h2>
                <form action={deleteArea}>
                  <input type="hidden" name="id" value={area.id} />
                  <button
                    type="submit"
                    className="text-xs text-danger hover:underline"
                    title={
                      area.tables.length > 0
                        ? "Bu alandaki masalar silinmez, yalnızca alansız kalır"
                        : undefined
                    }
                  >
                    Alanı sil
                  </button>
                </form>
              </div>

              {area.tables.length > 0 ? (
                <ul className="divide-y divide-line">
                  {area.tables.map((table) => (
                    <li key={table.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-ink">
                        {table.name} <span className="text-ink-muted">· {table.seats} kişilik</span>
                      </span>
                      <form action={deleteTable}>
                        <input type="hidden" name="id" value={table.id} />
                        <button type="submit" className="text-xs text-danger hover:underline">
                          Sil
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-sm text-ink-muted">Bu alanda henüz masa yok.</p>
              )}

              <div className="border-t border-line">
                <AddTableForm areaId={area.id} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

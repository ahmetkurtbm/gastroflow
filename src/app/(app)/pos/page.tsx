import type { Metadata } from "next";
import Link from "next/link";

import { formatMoney, money } from "@/core/money";
import { requireAppUser } from "@/lib/auth/current-user";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getServerDictionary } from "@/lib/i18n/server";
import { loadFloorPlan } from "@/lib/orders/queries";
import { openTable } from "@/lib/orders/actions";

export const metadata: Metadata = { title: "Sipariş Al" };

/** "12:47" değil "18 dk" — garson saat değil geçen süreyle ilgilenir. */
function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default async function PosFloorPlanPage() {
  await requireAppUser();
  const [areas, { dict }] = await Promise.all([loadFloorPlan(), getServerDictionary()]);

  const hasAnyTable = areas.some((a) => a.tables.length > 0);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">
        {dict.pos.floorTitle}
      </h1>

      {!hasAnyTable ? (
        <p className="rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
          {dict.pos.noTables}
        </p>
      ) : (
        <div className="space-y-8">
          {areas
            .filter((area) => area.tables.length > 0)
            .map((area) => (
              <section key={area.id}>
                <h2 className="mb-3 text-sm font-semibold text-ink-muted">
                  {area.name}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {area.tables.map((table) => (
                    <TableCard key={table.id} table={table} dict={dict.pos} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function TableCard({
  table,
  dict,
}: {
  table: Awaited<ReturnType<typeof loadFloorPlan>>[number]["tables"][number];
  dict: Dictionary["pos"];
}) {
  const { openOrder } = table;

  if (!openOrder) {
    return (
      <form action={openTable}>
        <input type="hidden" name="tableId" value={table.id} />
        <button
          type="submit"
          className="flex w-full flex-col items-start gap-1 rounded-xl border border-line bg-surface-raised p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/30"
        >
          <span className="text-lg font-bold text-ink">{table.name}</span>
          <span className="text-xs text-ink-muted">
            {table.seats} {dict.seats}
          </span>
          <span className="mt-2 text-xs font-medium text-ok">{dict.empty}</span>
        </button>
      </form>
    );
  }

  const minutes = minutesSince(openOrder.openedAt);
  // Uzun süredir açık masa görsel olarak öne çıksın — garson unutup unutmadığını
  // sorgulamadan bir bakışta görsün.
  const urgent = minutes >= 60;

  return (
    <Link
      href={`/pos/masa/${table.id}`}
      className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
        urgent
          ? "border-warn/50 bg-warn/10"
          : "border-brand-300 bg-brand-50/50 hover:bg-brand-50"
      }`}
    >
      <span className="text-lg font-bold text-ink">{table.name}</span>
      <span className="text-xs text-ink-muted">
        {minutes} dk
        {openOrder.pendingCount > 0 ? ` · ${openOrder.pendingCount} gönderilmedi` : ""}
      </span>
      <span className="mt-2 text-sm font-semibold tabular-nums text-ink">
        {formatMoney(money(openOrder.total))}
      </span>
    </Link>
  );
}

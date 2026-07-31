import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAppUser } from "@/lib/auth/current-user";
import { openTable } from "@/lib/orders/actions";
import { loadOpenOrderForTable, loadSellableMenu } from "@/lib/orders/queries";
import { createClient } from "@/lib/supabase/server";

import { AddItemButton } from "./add-item-button";
import { Cart } from "./cart";

export const metadata: Metadata = { title: "Sipariş" };

export default async function TableOrderPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;
  await requireAppUser();

  const supabase = await createClient();
  const { data: table } = await supabase
    .from("tables")
    .select("id, name, branch_id")
    .eq("id", tableId)
    .maybeSingle();

  if (!table) notFound();

  const order = await loadOpenOrderForTable(tableId);

  // Adisyon henüz açılmamış (doğrudan bağlantıyla gelinmiş olabilir).
  if (!order) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <p className="mb-4 text-sm text-ink-muted">
          Masa {table.name} için açık adisyon yok.
        </p>
        <form action={openTable}>
          <input type="hidden" name="tableId" value={table.id} />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Adisyon aç
          </button>
        </form>
      </div>
    );
  }

  const categories = await loadSellableMenu(table.branch_id);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col md:flex-row md:gap-4">
      <div className="flex-1 overflow-y-auto md:pr-2">
        <Link href="/pos" className="text-sm text-ink-muted hover:text-ink">
          ← Salon
        </Link>

        {categories.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">
            Satılabilir ürün yok. Reçeteler → menü ürününe fiyat tanımla.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {categories.map((category) => (
              <section key={category.id}>
                <h2 className="mb-2 text-sm font-semibold text-ink-muted">
                  {category.name}
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {category.items.map((item) => (
                    <AddItemButton
                      key={item.id}
                      orderId={order.id}
                      itemId={item.id}
                      name={item.name}
                      price={item.price ?? 0}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <aside className="mt-4 shrink-0 rounded-xl border border-line bg-surface-raised md:mt-0 md:w-80">
        <Cart order={order} />
      </aside>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadSellableCombos } from "@/lib/combos/queries";
import { requireAppUser } from "@/lib/auth/current-user";
import { openTable } from "@/lib/orders/actions";
import { loadOpenOrderForTable, loadSellableMenu } from "@/lib/orders/queries";
import { createClient } from "@/lib/supabase/server";

import { OrderScreen } from "./order-screen";

export const metadata: Metadata = { title: "Sipariş" };

export default async function TableOrderPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;
  const user = await requireAppUser();

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

  const [categories, combos] = await Promise.all([
    loadSellableMenu(table.branch_id),
    loadSellableCombos(table.branch_id),
  ]);

  return (
    <OrderScreen
      order={order}
      categories={categories}
      combos={combos}
      tenantId={user.tenantId}
      userId={user.userId}
    />
  );
}

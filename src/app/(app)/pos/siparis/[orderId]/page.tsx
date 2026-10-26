import type { Metadata } from "next";
import Link from "next/link";

import { loadSellableCombos } from "@/lib/combos/queries";
import { requireAppUser } from "@/lib/auth/current-user";
import { loadOpenOrderById, loadSellableMenu } from "@/lib/orders/queries";

import { OrderScreen } from "../../masa/[tableId]/order-screen";

export const metadata: Metadata = { title: "Sipariş" };

/** Masasız sipariş ekranı (Gel Al / Self Servis); adisyon id'siyle aynı `OrderScreen`. */
export default async function ChannelOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const user = await requireAppUser();

  const order = await loadOpenOrderById(orderId);

  if (!order) {
    // Masasız sipariş yalnızca openChannelOrder ile açılır; kapandıysa yeniden açılmaz.
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <p className="mb-4 text-sm text-ink-muted">
          Bu sipariş artık açık değil (kapatılmış ya da hiç var olmamış).
        </p>
        <Link
          href="/pos"
          className="inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          ← Salon
        </Link>
      </div>
    );
  }

  const [categories, combos] = await Promise.all([
    loadSellableMenu(user.branchId ?? ""),
    loadSellableCombos(user.branchId ?? ""),
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

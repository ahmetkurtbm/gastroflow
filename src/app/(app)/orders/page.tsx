import type { Metadata } from "next";

import { requireAppUser } from "@/lib/auth/current-user";
import { loadOpenOrdersTracking } from "@/lib/orders/queries";

import { OrdersBoard } from "./orders-board";

export const metadata: Metadata = { title: "Siparişler" };

export default async function OrdersPage() {
  await requireAppUser();
  const orders = await loadOpenOrdersTracking();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">Siparişler</h1>
      <OrdersBoard orders={orders} />
    </div>
  );
}

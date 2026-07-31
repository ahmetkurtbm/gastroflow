import type { Metadata } from "next";

import { requireAppUser } from "@/lib/auth/current-user";
import { loadKitchenQueue } from "@/lib/orders/queries";

import { KdsBoard } from "./kds-board";

export const metadata: Metadata = { title: "Mutfak" };

export default async function KdsPage() {
  const user = await requireAppUser();
  const tickets = await loadKitchenQueue();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">Mutfak</h1>
      <KdsBoard initialTickets={tickets} tenantId={user.tenantId} />
    </div>
  );
}

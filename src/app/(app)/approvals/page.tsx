import type { Metadata } from "next";

import { requireAppUser } from "@/lib/auth/current-user";
import { loadPendingDiscounts } from "@/lib/orders/queries";

import { ApprovalsList } from "./approvals-list";

export const metadata: Metadata = { title: "Onaylar" };

export default async function ApprovalsPage() {
  await requireAppUser();
  const requests = await loadPendingDiscounts();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">Onaylar</h1>
      <ApprovalsList requests={requests} />
    </div>
  );
}

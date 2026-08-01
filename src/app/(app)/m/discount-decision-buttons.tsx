"use client";

import { useTransition } from "react";

import { decideLineDiscount } from "@/lib/orders/actions";

export function DiscountDecisionButtons({ discountId }: { discountId: string }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    const fd = new FormData();
    fd.set("id", discountId);
    fd.set("decision", decision);
    startTransition(() => decideLineDiscount(fd));
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("rejected")}
        className="flex-1 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reddet
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("approved")}
        className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Onayla
      </button>
    </div>
  );
}

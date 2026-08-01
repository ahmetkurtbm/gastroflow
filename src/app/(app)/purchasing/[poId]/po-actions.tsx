"use client";

import { useTransition } from "react";

import { cancelPurchaseOrder, decidePurchaseOrder } from "@/lib/purchasing/actions";

export function PoDecisionButtons({ poId }: { poId: string }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    const fd = new FormData();
    fd.set("poId", poId);
    fd.set("decision", decision);
    startTransition(() => decidePurchaseOrder(fd));
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("rejected")}
        className="flex-1 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reddet
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("approved")}
        className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Onayla
      </button>
    </div>
  );
}

export function PoCancelButton({ poId }: { poId: string }) {
  const [pending, startTransition] = useTransition();

  function cancel() {
    const fd = new FormData();
    fd.set("poId", poId);
    startTransition(() => cancelPurchaseOrder(fd));
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={cancel}
      className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
    >
      İptal et
    </button>
  );
}

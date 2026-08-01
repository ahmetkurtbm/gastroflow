"use client";

import { useTransition } from "react";

import { decideLineDiscount } from "@/lib/orders/actions";
import type { PendingDiscountRequest } from "@/lib/orders/queries";

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function describeDiscount(request: PendingDiscountRequest): string {
  if (request.kind === "comp") return "İkram (tamamı bedava)";
  if (request.kind === "percent") return `%${request.value} indirim`;
  return `${formatLira(request.value)} indirim`;
}

function RequestCard({ request }: { request: PendingDiscountRequest }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    const fd = new FormData();
    fd.set("id", request.id);
    fd.set("decision", decision);
    startTransition(() => decideLineDiscount(fd));
  }

  return (
    <li className="rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {request.quantity}× {request.menuItemName}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {request.tableName ? `Masa ${request.tableName}` : "Paket"}
            {request.orderNo ? ` · #${request.orderNo}` : ""} · {request.requestedByName}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-warn">{describeDiscount(request)}</span>
      </div>

      <p className="mt-2 text-sm text-ink">{request.reason}</p>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("rejected")}
          className="flex-1 rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reddet
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("approved")}
          className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Onayla
        </button>
      </div>
    </li>
  );
}

export function ApprovalsList({ requests }: { requests: PendingDiscountRequest[] }) {
  if (requests.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-muted">
        Bekleyen onay yok.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </ul>
  );
}

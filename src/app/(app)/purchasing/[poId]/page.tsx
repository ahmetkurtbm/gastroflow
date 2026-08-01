import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadStockPickLists } from "@/lib/inventory/queries";
import { requireAppUser } from "@/lib/auth/current-user";
import { loadPurchaseOrder } from "@/lib/purchasing/queries";

import { PoCancelButton, PoDecisionButtons } from "./po-actions";
import { ReceiveForm } from "./receive-form";

export const metadata: Metadata = { title: "Sipariş Detayı" };

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  received: "Teslim alındı",
  cancelled: "İptal edildi",
};

const STATUS_CLASS: Record<string, string> = {
  pending_approval: "bg-warn/15 text-warn",
  approved: "bg-ok/15 text-ok",
  rejected: "bg-danger/15 text-danger",
  received: "bg-surface-sunken text-ink-muted",
  cancelled: "bg-surface-sunken text-ink-muted",
};

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  const { poId } = await params;
  const user = await requireAppUser();
  const po = await loadPurchaseOrder(poId);
  if (!po) notFound();

  const isManager = user.role === "owner" || user.role === "manager";
  const canReceive = isManager || user.role === "storekeeper";

  const picks = po.status === "approved" ? await loadStockPickLists() : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/purchasing" className="text-sm text-ink-muted hover:text-ink">
        ← Satın Alma
      </Link>

      <div className="mt-2 mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{po.supplierName}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[po.status] ?? ""}`}>
            {STATUS_LABEL[po.status] ?? po.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {po.requestedByName} talep etti · {dateFormatter.format(new Date(po.requestedAt))} ·{" "}
          {po.supplierLeadTimeDays} gün teslim süresi
        </p>
        {po.note ? <p className="mt-1 text-sm text-ink-muted">Not: {po.note}</p> : null}
      </div>

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Kalemler</h2>
        <ul className="divide-y divide-line">
          {po.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-ink">{line.itemName}</span>
              <span className="tabular-nums text-ink-muted">
                {line.quantity} {line.baseUnit} × {formatLira(line.unitPrice)}
                {line.receivedQuantity !== null ? (
                  <span
                    className={`ml-2 ${
                      line.receivedQuantity === line.quantity ? "text-ok" : "text-warn"
                    }`}
                  >
                    · {line.receivedQuantity} {line.baseUnit} teslim alındı
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-sm font-semibold text-ink">Toplam</span>
          <span className="text-lg font-bold tabular-nums text-ink">{formatLira(po.totalAmount)}</span>
        </div>
      </section>

      {po.decidedByName ? (
        <p className="mt-3 text-xs text-ink-muted">
          {po.decidedByName} · {po.decidedAt ? dateFormatter.format(new Date(po.decidedAt)) : ""}
        </p>
      ) : null}
      {po.receivedByName ? (
        <p className="mt-1 text-xs text-ink-muted">
          Mal kabul: {po.receivedByName} · {po.receivedAt ? dateFormatter.format(new Date(po.receivedAt)) : ""}
        </p>
      ) : null}

      {po.status === "pending_approval" && isManager ? (
        <section className="mt-4 rounded-xl border border-line bg-surface-raised p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Onay</h2>
          <PoDecisionButtons poId={po.id} />
        </section>
      ) : null}

      {po.status === "approved" && canReceive && picks ? (
        <section className="mt-4 rounded-xl border border-line bg-surface-raised p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Mal kabul</h2>
          <ReceiveForm po={po} locations={picks.locations} />
        </section>
      ) : null}

      {(po.status === "pending_approval" || po.status === "approved") && canReceive ? (
        <div className="mt-4">
          <PoCancelButton poId={po.id} />
        </div>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { formatQuantity } from "@/core/units";
import { loadPurchaseOrders, loadReorderSuggestions, loadSuppliers } from "@/lib/purchasing/queries";

export const metadata: Metadata = { title: "Satın Alma" };

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  received: "Teslim alındı",
  cancelled: "İptal",
};

const STATUS_CLASS: Record<string, string> = {
  pending_approval: "text-warn",
  approved: "text-ok",
  rejected: "text-danger",
  received: "text-ink-muted",
  cancelled: "text-ink-muted",
};

function formatLira(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export default async function PurchasingPage() {
  const [suggestions, orders, suppliers] = await Promise.all([
    loadReorderSuggestions(),
    loadPurchaseOrders(30),
    loadSuppliers(),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Satın Alma</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Tedarikçi fiyat listesinden sipariş oluştur, müdür/patron onaylasın,
            mal geldiğinde kabul et — stok otomatik girer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Link
            href="/purchasing/tedarikciler"
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Tedarikçiler
          </Link>
          <Link
            href="/purchasing/yeni"
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Yeni sipariş
          </Link>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <section className="mb-6 rounded-xl border border-warn/40 bg-warn/10 p-4">
          <h2 className="mb-2 text-sm font-semibold text-warn">
            Kritik seviyenin altında, sipariş önerisi ({suggestions.length})
          </h2>
          <ul className="space-y-1.5">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-ink">
                  {s.itemName} <span className="text-ink-muted">· {s.locationName}</span>
                </span>
                <span className="flex items-center gap-2 text-ink-muted">
                  <span className="tabular-nums">
                    {formatQuantity(s.balance, s.baseUnit)} / eşik {formatQuantity(s.reorderPoint, s.baseUnit)}
                  </span>
                  {s.supplierId ? (
                    <Link
                      href={`/purchasing/yeni?supplier=${s.supplierId}&item=${s.itemId}&qty=${s.suggestedQuantity}`}
                      className="rounded-lg bg-warn/20 px-2 py-1 text-xs font-semibold text-warn hover:bg-warn/30"
                    >
                      {s.supplierName}&apos;dan {formatQuantity(s.suggestedQuantity, s.baseUnit)} sipariş oluştur
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-muted">tedarikçi tanımlı değil</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-muted">
          Önce{" "}
          <Link href="/purchasing/tedarikciler" className="font-medium text-brand-600 hover:underline">
            bir tedarikçi ekle
          </Link>
          .
        </p>
      ) : (
        <section className="rounded-xl border border-line bg-surface-raised">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Siparişler</h2>
          {orders.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">Henüz sipariş yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {orders.map((po) => (
                <li key={po.id}>
                  <Link
                    href={`/purchasing/${po.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-sunken"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">{po.supplierName}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {po.lineCount} kalem · {dateFormatter.format(new Date(po.requestedAt))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-ink">{formatLira(po.totalAmount)}</p>
                      <p className={`mt-0.5 text-xs font-medium ${STATUS_CLASS[po.status] ?? "text-ink-muted"}`}>
                        {STATUS_LABEL[po.status] ?? po.status}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

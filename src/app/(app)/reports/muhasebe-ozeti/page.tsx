import type { Metadata } from "next";
import Link from "next/link";

import { formatMoney, money } from "@/core/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Muhasebe Özeti" };

const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Istanbul",
});
const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  meal_card: "Yemek kartı",
  on_account: "Açık hesap",
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Muhasebeciye WhatsApp/mailden gönderilecek dönemlik ciro dökümü —
 * ödeme yöntemi bazında, gün gün. Aynı export mantığı `/api/export/muhasebe-ozeti`'nde;
 * o rotanın doc-comment'i "neden KDV kırılımı yok / neden Logo/Mikro/Luca
 * uyumlu demiyoruz" gerekçesini açıklıyor.
 */
export default async function AccountingSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : isoDaysAgo(30);
  const toDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : isoDaysAgo(0);

  const supabase = await createClient();
  const { data: payments } = await supabase
    .from("payments")
    .select("amount, method, received_at")
    .gte("received_at", `${fromDate}T00:00:00`)
    .lte("received_at", `${toDate}T23:59:59`)
    .order("received_at");

  const totalByDay = new Map<string, number>();
  const totalByMethod = new Map<string, number>();
  for (const p of payments ?? []) {
    const day = p.received_at.slice(0, 10);
    const amount = Number(p.amount);
    totalByDay.set(day, (totalByDay.get(day) ?? 0) + amount);
    totalByMethod.set(p.method, (totalByMethod.get(p.method) ?? 0) + amount);
  }
  const days = [...totalByDay.entries()].sort(([a], [b]) => b.localeCompare(a));
  const grandTotal = [...totalByDay.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/reports" className="text-sm text-ink-muted hover:text-ink">
        ← Raporlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight text-ink">Muhasebe Özeti</h1>
      <p className="mb-6 text-sm leading-relaxed text-ink-muted">
        Ödeme yöntemi bazında, gün gün ciro dökümü — mali müşavire göndermek için. KDV kırılımı
        ve belirli bir muhasebe yazılımına özel format yok; genel, düz bir döküm.
      </p>

      <form className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-raised p-4">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-muted">
            Başlangıç
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={fromDate}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-muted">
            Bitiş
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={toDate}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
        >
          Filtrele
        </button>
        <a
          href={`/api/export/muhasebe-ozeti?from=${fromDate}&to=${toDate}`}
          className="ml-auto rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Excel indir
        </a>
      </form>

      <section className="mb-6 rounded-xl border border-line bg-surface-raised p-5 text-center">
        <p className="text-xs text-ink-muted">
          {fromDate} – {toDate}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{formatMoney(money(grandTotal))}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-4">
          {[...totalByMethod.entries()].map(([method, amount]) => (
            <div key={method}>
              <p className="text-xs text-ink-muted">{METHOD_LABEL[method] ?? method}</p>
              <p className="text-sm font-semibold tabular-nums text-ink">{formatMoney(money(amount))}</p>
            </div>
          ))}
        </div>
      </section>

      {days.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-muted">
          Bu aralıkta ödeme yok.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Gün</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {days.map(([date, amount]) => (
                <tr key={date} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink">
                    {dayFormatter.format(new Date(`${date}T00:00:00`))}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                    {formatMoney(money(amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { ExcelImportForm } from "@/components/ui/excel-import-form";
import { formatMoney, money } from "@/core/money";
import { importFiscalReceipts } from "@/lib/fiscal/actions";
import { loadReconciliation } from "@/lib/fiscal/queries";

export const metadata: Metadata = { title: "Fiş Mutabakatı" };

const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Istanbul",
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * GastroFlow'un kendi kaydettiği ciro ile Excel'le toplu girilen yazarkasa
 * fişlerinin toplamını karşılaştırır (bkz. migration 0020'nin doc-comment'i:
 * ÖKC entegrasyonu mock, iki sistem arasında elle çift giriş var — bu ekran
 * o çift girişin tutup tutmadığını denetler).
 */
export default async function FiscalReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : isoDaysAgo(30);
  const toDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : isoDaysAgo(0);

  const reconciliation = await loadReconciliation(fromDate, toDate);
  const isBalanced = Math.abs(reconciliation.difference) < 0.01;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/reports" className="text-sm text-ink-muted hover:text-ink">
        ← Raporlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight text-ink">Fiş Mutabakatı</h1>
      <p className="mb-6 text-sm leading-relaxed text-ink-muted">
        GastroFlow&apos;un kendi kayıtlı cirosu ile ayrı yazarkasadan Excel&apos;le toplu girilen
        fişlerin toplamı karşılaştırılıyor. Fark varsa ya bir satış yazarkasaya geçirilmemiş,
        ya da bir fiş buraya girilmemiş demektir.
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
      </form>

      <section className="mb-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Fişleri Excel&apos;den içe aktar
        </h2>
        <ExcelImportForm
          action={importFiscalReceipts}
          templateHref="/api/export/fis-sablonu?template=1"
          exportHref="/api/export/fis-sablonu"
        />
      </section>

      <section
        className={`mb-6 rounded-xl border p-5 text-center ${
          isBalanced ? "border-ok/30 bg-ok/10" : "border-danger/30 bg-danger/10"
        }`}
      >
        <p className="text-xs text-ink-muted">
          {fromDate} – {toDate}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-ink-muted">GastroFlow</p>
            <p className="text-lg font-bold tabular-nums text-ink">
              {formatMoney(money(reconciliation.gastroflowTotal))}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Fişler</p>
            <p className="text-lg font-bold tabular-nums text-ink">
              {formatMoney(money(reconciliation.receiptsTotal))}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Fark</p>
            <p className={`text-lg font-bold tabular-nums ${isBalanced ? "text-ok" : "text-danger"}`}>
              {formatMoney(money(reconciliation.difference))}
            </p>
          </div>
        </div>
      </section>

      {reconciliation.days.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-muted">
          Bu aralıkta ne satış ne fiş var.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Gün</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">GastroFlow</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Fişler</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Fark</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.days.map((day) => {
                const dayBalanced = Math.abs(day.difference) < 0.01;
                return (
                  <tr key={day.date} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-ink">
                      {dayFormatter.format(new Date(`${day.date}T00:00:00`))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                      {formatMoney(money(day.gastroflowTotal))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                      {formatMoney(money(day.receiptsTotal))}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                        dayBalanced ? "text-ok" : "text-danger"
                      }`}
                    >
                      {formatMoney(money(day.difference))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import { useOfflineCount } from "@/lib/offline/use-offline-count";

const PAGE_SIZE = 8;

/**
 * Körleme, sayfa sayfa sayım formu — bilinçli olarak sistemdeki bakiyeyi
 * GÖSTERMEZ. Sayan kişi rafta ne görürse onu yazar; fark sunucuda
 * hesaplanır (bkz. `recordCount`).
 *
 * Ürünler sabit boyutlu sayfalara bölünüyor: uzun bir hammadde listesini tek
 * ekranda kaydırmak (özellikle telefonda) hem yorucu hem hataya açık —
 * "hangi satırdaydım" kaybolabiliyor. Her sayfa "İleri" ile ayrı ayrı,
 * offline kuyruğa (bkz. `useOfflineCount`) kaydediliyor; bağlantı kesikse
 * bile sayım kaybolmaz, bağlantı gelince arka planda senkronlanır.
 */
export function CountForm({
  locationId,
  items,
}: {
  locationId: string;
  items: { id: string; name: string; baseUnit: string }[];
}) {
  const { isOnline, queueCount, savePage } = useOfflineCount(locationId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [savedPages, setSavedPages] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);

  const pages = useMemo(() => {
    const chunks: { id: string; name: string; baseUnit: string }[][] = [];
    for (let i = 0; i < items.length; i += PAGE_SIZE) {
      chunks.push(items.slice(i, i + PAGE_SIZE));
    }
    return chunks;
  }, [items]);

  const currentPage = pages[pageIndex] ?? [];
  const isLastPage = pageIndex === pages.length - 1;

  async function handleAdvance() {
    setSaving(true);
    try {
      const entries = currentPage
        .filter((item) => values[item.id] !== undefined && values[item.id] !== "")
        .map((item) => ({ itemId: item.id, quantity: values[item.id] }));
      await savePage(entries);
      setSavedPages((prev) => new Set(prev).add(pageIndex));

      if (isLastPage) {
        setFinished(true);
      } else {
        setPageIndex((i) => i + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  if (finished) {
    return (
      <div className="rounded-xl border border-ok/30 bg-ok/10 p-6 text-center">
        <p className="text-sm font-medium text-ink">
          Sayım tamamlandı, {pages.length} sayfa kaydedildi.
        </p>
        {queueCount > 0 ? (
          <p className="mt-1 text-xs text-warn">
            {queueCount} sayfa henüz sunucuya ulaşmadı — bağlantı gelince otomatik gönderilecek.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface-raised">
      {!isOnline || queueCount > 0 ? (
        <div
          role="status"
          className={`px-4 py-2 text-xs font-medium ${
            isOnline ? "bg-warn/10 text-warn" : "bg-danger/10 text-danger"
          }`}
        >
          {isOnline
            ? `Senkronize ediliyor… (${queueCount})`
            : `Çevrimdışı — ${queueCount} sayfa bağlantı gelince gönderilecek`}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-medium text-ink">
          Sayfa {pageIndex + 1} / {pages.length}
        </span>
        {savedPages.has(pageIndex) ? (
          <span className="text-xs font-medium text-ok">Bu sayfa kaydedildi ✓</span>
        ) : null}
      </div>

      <ul className="divide-y divide-line">
        {currentPage.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <label htmlFor={`qty_${item.id}`} className="text-sm text-ink">
              {item.name} <span className="text-ink-muted">({item.baseUnit})</span>
            </label>
            <input
              id={`qty_${item.id}`}
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              placeholder="—"
              value={values[item.id] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [item.id]: e.target.value }))}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-right text-sm text-ink"
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3 border-t border-line p-4">
        {pageIndex > 0 ? (
          <button
            type="button"
            onClick={() => setPageIndex((i) => i - 1)}
            disabled={saving}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-60"
          >
            ← Geri
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleAdvance}
          disabled={saving}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Kaydediliyor…" : isLastPage ? "Sayımı bitir" : "Kaydet ve ileri →"}
        </button>
      </div>
    </div>
  );
}

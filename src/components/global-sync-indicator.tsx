"use client";

import { useGlobalSyncStatus } from "@/lib/offline/use-global-sync-status";

/**
 * Kabuktaki her ekranda görünen bağlantı/kuyruk rozeti.
 *
 * Temiz kalsın diye çevrimiçi ve kuyruk boşken HİÇBİR ŞEY göstermiyor —
 * yalnızca dikkat gerektiren iki durumda beliriyor: çevrimdışı, ya da
 * bekleyen bir mutasyon var. Bu, ekranı terk edip başka bir sayfaya geçmiş
 * bir garsonun/depo görevlisinin bile "senkron oldu mu?" sorusuna cevap
 * bulmasını sağlıyor.
 */
export function GlobalSyncIndicator() {
  const { isOnline, pendingCount } = useGlobalSyncStatus();

  if (isOnline && pendingCount === 0) return null;

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isOnline ? "bg-warn/15 text-warn" : "bg-danger/15 text-danger"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-warn" : "bg-danger"}`} />
      {isOnline ? `Senkronize ediliyor… (${pendingCount})` : "Çevrimdışı"}
    </span>
  );
}

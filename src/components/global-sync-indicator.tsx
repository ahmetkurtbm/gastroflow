"use client";

import { useGlobalSyncStatus } from "@/lib/offline/use-global-sync-status";

/** Yalnızca çevrimdışıyken ya da bekleyen mutasyon varken görünen bağlantı rozeti. */
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

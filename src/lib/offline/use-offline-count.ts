"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { drainQueue, enqueueRecordCountPage, listQueue } from "./queue";

function subscribeToOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
function getOnlineSnapshot() {
  return navigator.onLine;
}
function getOnlineServerSnapshot() {
  return true;
}

/**
 * Sayım ekranının offline durumu (`useOfflineOrder` ile aynı desen). Girdiler
 * zaten yerel state'te olduğu için iyimser satır yoktur.
 */
export function useOfflineCount(locationId: string) {
  const router = useRouter();
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [queueCount, setQueueCount] = useState(0);
  const syncingRef = useRef(false);
  // Sync meşgulken gelen çağrı not edilir ve bitince tekrar denenir.
  const resyncRequestedRef = useRef(false);

  const refreshQueueView = useCallback(async () => {
    const all = await listQueue();
    setQueueCount(all.filter((m) => m.kind === "record_count_page").length);
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) {
      resyncRequestedRef.current = true;
      return;
    }
    syncingRef.current = true;
    try {
      do {
        resyncRequestedRef.current = false;
        const { syncedCount } = await drainQueue();
        await refreshQueueView();
        if (syncedCount > 0) router.refresh();
      } while (resyncRequestedRef.current);
    } finally {
      syncingRef.current = false;
    }
  }, [refreshQueueView, router]);

  useEffect(() => {
    if (isOnline) void sync();
  }, [isOnline, sync]);

  const savePage = useCallback(
    async (entries: { itemId: string; quantity: string }[]) => {
      if (entries.length === 0) return;
      await enqueueRecordCountPage({ locationId, entries });
      await refreshQueueView();
      void sync();
    },
    [locationId, refreshQueueView, sync],
  );

  return { isOnline, queueCount, savePage };
}

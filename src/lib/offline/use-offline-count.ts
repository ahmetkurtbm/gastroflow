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
 * Sayım ekranının offline durumu — `useOfflineOrder`'daki aynı desen
 * (bkz. o dosyadaki `useSyncExternalStore` yorumu: sunucu/istemci hydration
 * uyuşmazlığını önlüyor).
 *
 * POS'tan farkı: burada "iyimser satır" gösterecek bir şey yok — sayfadaki
 * girdiler zaten yerel state'te (kullanıcı yazdığı an ekranda), kaydetme
 * yalnızca o sayfayı kuyruğa atıp arkaplanda senkronlamak.
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
  // `sync()` başlarken kuyruğu bir kerede okuyor (`drainQueue` içinde); o
  // anda çalışan bir sync varsa yeni çağrı sessizce atlanıyordu — ama
  // atlanan çağrının EKLEDİĞİ mutasyon (ör. bir sonraki sayım sayfası) hiç
  // işlenmeden kuyrukta kalabiliyordu (yalnızca isOnline değişince ya da
  // bir sonraki savePage çağrısına kadar). Bu bayrak, meşgulken gelen
  // isteği not eder; mevcut sync bitince otomatik tekrar dener.
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

  // `sync()` her koşulda `refreshQueueView()`'ı içeriden çağırıyor (bkz.
  // yukarısı) — bu yüzden mount'ta kuyruk görünümünü ayrıca yüklemeye gerek
  // yok, bu tek effect ikisini de karşılıyor.
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

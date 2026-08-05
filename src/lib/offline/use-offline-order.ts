"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import {
  cancelQueuedMutation,
  drainQueue,
  enqueueAddLine,
  enqueueSendToKitchen,
  listQueue,
} from "./queue";
import type { QueuedMutation } from "./types";

export type OptimisticLine = {
  id: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  modifierSummary: string | null;
};

/**
 * `navigator.onLine`'a hydration-güvenli erişim.
 *
 * Sunucuda `navigator` yok; istemcide de mount ANINDA gerçek değeri okumak
 * sunucunun ürettiği HTML'den (her zaman "çevrimiçi" varsayar) farklı çıkıp
 * React hydration uyuşmazlığı üretebilirdi. `useSyncExternalStore` bunun için
 * var: `getServerSnapshot` sunucuyla birebir aynı değeri (`true`) döner,
 * gerçek değer yalnızca hydration TAMAMLANDIKTAN sonraki bir render'da
 * `getSnapshot`'tan okunur.
 */
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
 * Bir sipariş ekranının offline durumunu yönetir.
 *
 * Üç şeyi birlikte tutar: bağlantı durumu, henüz senkronlanmamış mutasyon
 * sayısı, ve henüz sunucuya ulaşmamış ürünlerin iyimser (optimistic)
 * görünümü. Senkron başarılı olduğunda `router.refresh()` çağrılır — bu,
 * sunucudan taze veriyi çeker ve iyimser satırların üstüne yazar; yani
 * "iyimser satır" hep GEÇİCİ bir kaplama, tek doğruluk kaynağı sunucu.
 */
export function useOfflineOrder(orderId: string) {
  const router = useRouter();
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [queueCount, setQueueCount] = useState(0);
  const [optimisticLines, setOptimisticLines] = useState<OptimisticLine[]>([]);
  const syncingRef = useRef(false);
  // `sync()` meşgulken gelen bir çağrı sessizce atlanırsa, o çağrının
  // eklediği mutasyon (ör. hızlı art arda "ürün ekle" + "mutfağa gönder")
  // bir sonraki tetiklemeye kadar kuyrukta asılı kalabilirdi. Bu bayrak
  // meşgulken geleni not eder; mevcut sync bitince otomatik tekrar dener.
  const resyncRequestedRef = useRef(false);

  const refreshQueueView = useCallback(async () => {
    const all = await listQueue();
    setQueueCount(all.length);
    setOptimisticLines(
      all
        .filter(
          (m): m is Extract<QueuedMutation, { kind: "add_line" }> =>
            m.kind === "add_line" && m.orderId === orderId,
        )
        .map((m) => ({
          id: m.id,
          menuItemName: m.menuItemName,
          quantity: m.quantity,
          unitPrice: m.unitPrice,
          modifierSummary: m.modifierSummary,
        })),
    );
  }, [orderId]);

  const sync = useCallback(async () => {
    // Aynı anda iki drain çalışmasın: `online` olayı ve manuel tetikleme
    // aynı anda gelirse aynı mutasyon iki kere denenmez (zararsız olurdu ama
    // gereksiz istek). Meşgulken gelen çağrı KAYBOLMUYOR — mevcut sync
    // bitince `resyncRequestedRef` sayesinde otomatik tekrar deniyor.
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
        if (syncedCount > 0) {
          router.refresh();
        }
      } while (resyncRequestedRef.current);
    } finally {
      syncingRef.current = false;
    }
  }, [refreshQueueView, router]);

  // `isOnline` mount'ta (sunucuyla eşleşen `true` varsayımından gerçek değere)
  // ya da bir `online` olayıyla değiştiğinde kuyruğu boşaltmayı dener —
  // `sync()` zaten offline'sa hiçbir şey yapmıyor, o yüzden ayrım gerekmiyor.
  useEffect(() => {
    if (isOnline) void sync();
  }, [isOnline, sync]);

  useEffect(() => {
    // `online`/`offline` olayları bazı ağlarda güvenilir tetiklenmiyor
    // (ör. wifi bağlı ama internet yok). Güvenlik ağı olarak düşük sıklıkta
    // yeniden dene — sık değil ki gereksiz istek yığmasın.
    const interval = setInterval(() => {
      if (navigator.onLine) void sync();
    }, 30_000);

    return () => clearInterval(interval);
  }, [sync]);

  const addItem = useCallback(
    async (input: {
      tenantId: string;
      userId: string;
      menuItemId: string;
      menuItemName: string;
      unitPrice: number;
      modifierIds?: readonly string[];
      modifierSummary?: string | null;
    }) => {
      await enqueueAddLine({
        tenantId: input.tenantId,
        orderId,
        menuItemId: input.menuItemId,
        menuItemName: input.menuItemName,
        quantity: 1,
        unitPrice: input.unitPrice,
        modifierIds: input.modifierIds,
        modifierSummary: input.modifierSummary,
        userId: input.userId,
      });
      await refreshQueueView();
      void sync();
    },
    [orderId, refreshQueueView, sync],
  );

  const sendToKitchen = useCallback(
    async (tenantId: string) => {
      await enqueueSendToKitchen({ tenantId, orderId });
      await refreshQueueView();
      void sync();
    },
    [orderId, refreshQueueView, sync],
  );

  const cancelOptimistic = useCallback(
    async (id: string) => {
      await cancelQueuedMutation(id);
      await refreshQueueView();
    },
    [refreshQueueView],
  );

  return {
    isOnline,
    queueCount,
    optimisticLines,
    addItem,
    sendToKitchen,
    cancelOptimistic,
    sync,
  };
}

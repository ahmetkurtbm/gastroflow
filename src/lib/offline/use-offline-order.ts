"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [queueCount, setQueueCount] = useState(0);
  const [optimisticLines, setOptimisticLines] = useState<OptimisticLine[]>([]);
  const syncingRef = useRef(false);

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
    // gereksiz istek).
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const { syncedCount } = await drainQueue();
      await refreshQueueView();
      if (syncedCount > 0) {
        router.refresh();
      }
    } finally {
      syncingRef.current = false;
    }
  }, [refreshQueueView, router]);

  useEffect(() => {
    // `sync()` kuyruğu boşaltmayı DENER (offline'sa hiçbir şey yapmaz) ve
    // her koşulda kuyruk görünümünü tazeler — mount'ta ayrıca ayrı bir
    // "yükle" çağrısına gerek yok.
    const timer = setTimeout(() => void sync(), 0);

    function handleOnline() {
      setIsOnline(true);
      void sync();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // `online`/`offline` olayları bazı ağlarda güvenilir tetiklenmiyor
    // (ör. wifi bağlı ama internet yok). Güvenlik ağı olarak düşük sıklıkta
    // yeniden dene — sık değil ki gereksiz istek yığmasın.
    const interval = setInterval(() => {
      if (navigator.onLine) void sync();
    }, 30_000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca mount'ta kurulur
  }, []);

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

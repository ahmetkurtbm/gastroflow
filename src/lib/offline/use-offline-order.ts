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

/** Hydration uyumlu `navigator.onLine`; sunucu ve ilk render `true` varsayar. */
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
 * Sipariş ekranının offline durumu: bağlantı, bekleyen mutasyon sayısı ve
 * sunucuya henüz ulaşmamış ürünlerin iyimser görünümü. Senkron sonrası
 * `router.refresh()` sunucu verisini geri getirir.
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
  // Sync meşgulken gelen çağrı not edilir ve bitince tekrar denenir.
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

  useEffect(() => {
    if (isOnline) void sync();
  }, [isOnline, sync]);

  useEffect(() => {
    // `online` olayı her ağda güvenilir değil; düşük sıklıkla yeniden dene.
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

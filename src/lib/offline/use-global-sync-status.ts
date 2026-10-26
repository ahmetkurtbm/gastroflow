"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { listQueue } from "./queue";

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
 * Uygulama kabuğundaki genel bağlantı ve kuyruk göstergesi. Yalnızca gözlemler;
 * senkronu mutasyonun ait olduğu ekranın hook'u yapar.
 */
export function useGlobalSyncStatus() {
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const all = await listQueue();
      if (!cancelled) setPendingCount(all.length);
    }

    void refresh();
    const interval = setInterval(() => void refresh(), 4_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { isOnline, pendingCount };
}

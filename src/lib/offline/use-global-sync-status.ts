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
 * Uygulama kabuğundaki GENEL bağlantı/kuyruk göstergesi.
 *
 * `useOfflineOrder`/`useOfflineCount`'tan farkı: bu hook hiçbir şeyi
 * SENKRONLAMIYOR, yalnızca GÖZLEMLİYOR — hangi ekranda olursa olsun
 * ("Sipariş Al" ekranından çıkıp Raporlar'a geçmiş olsa bile) personel
 * "bağlantım var mı, bekleyen bir işlem var mı" sorusunun cevabını görsün
 * diye. Gerçek senkronu, o mutasyonun ait olduğu ekranın kendi hook'u
 * (kullanıcı o ekrana dönünce) yapar.
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
    // Pasif bir gösterge — aktif senkron denemiyor, yalnızca kuyruk
    // uzunluğunu düşük sıklıkta tazeliyor. Gerçek senkron ilgili ekranın
    // hook'undan tetiklendiğinde bu sayı da bir sonraki turda güncellenir.
    const interval = setInterval(() => void refresh(), 4_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { isOnline, pendingCount };
}

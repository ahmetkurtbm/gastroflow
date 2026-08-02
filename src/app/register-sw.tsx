"use client";

import { useEffect } from "react";

/**
 * App-shell service worker'ını kaydeder (bkz. public/sw.js).
 *
 * Sayfa içeriği üretmediği için sunucu bileşeni olamaz — `navigator` yalnızca
 * tarayıcıda var. Kayıt başarısız olursa (ör. eski tarayıcı, gizli sekme
 * bazı kısıtlamaları) sessizce yutuyoruz: service worker olmadan uygulama
 * zaten normal (yalnızca offline-first değil) çalışmaya devam eder.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker kaydı başarısız:", error);
    });
  }, []);

  return null;
}

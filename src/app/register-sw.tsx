"use client";

import { useEffect } from "react";

/** Service worker'ı kaydeder; kayıt başarısızsa uygulama offline özelliği olmadan çalışır. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker kaydı başarısız:", error);
    });
  }, []);

  return null;
}

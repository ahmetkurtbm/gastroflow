"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Sayfanın sunucu verisini, sekme görünürken belirli aralıklarla yeniden çeker. */
export function useLiveRefresh(intervalMs = 4000) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
}

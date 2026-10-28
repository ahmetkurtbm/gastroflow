"use client";

import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Chrome/Edge'in kurulum olayı; standart tiplerde yok. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "unknown" | "standalone" | "ios" | "other";

const noopSubscribe = () => () => {};

function detectPlatform(): Platform {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "standalone";
  const ios =
    /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}

/**
 * Ana ekrana ekleme: Chrome/Edge/Android'de kurulum penceresini açar, iOS'ta
 * (Safari kurulum olayını desteklemez) adımları gösterir, uygulama zaten tam
 * ekran çalışıyorsa "yüklü" der.
 */
export function InstallApp({ dict, tone = "light" }: { dict: Dictionary["install"]; tone?: "light" | "dark" }) {
  // Cihaz bilgisi yalnızca tarayıcıda okunur; sunucu çiziminde "unknown".
  const platform = useSyncExternalStore(noopSubscribe, detectPlatform, () => "unknown" as Platform);
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const state =
    platform === "unknown"
      ? "unknown"
      : installed || platform === "standalone"
        ? "installed"
        : event
          ? "promptable"
          : platform === "ios"
            ? "ios"
            : "manual";

  const muted = tone === "dark" ? "text-slate-300" : "text-ink-muted";

  if (state === "unknown") return <div className="h-11" />;

  if (state === "installed") {
    return (
      <p className={`flex items-center gap-2 text-sm font-medium ${tone === "dark" ? "text-white" : "text-ink"}`}>
        <CheckCircle2 aria-hidden="true" size={18} className="text-ok" />
        {dict.installed}
      </p>
    );
  }

  if (state === "promptable") {
    return (
      <button
        type="button"
        onClick={async () => {
          if (!event) return;
          await event.prompt();
          const { outcome } = await event.userChoice;
          if (outcome === "accepted") setInstalled(true);
          setEvent(null);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        <Download aria-hidden="true" size={16} />
        {dict.button}
      </button>
    );
  }

  if (state === "ios") {
    return (
      <ol className={`space-y-2 text-sm ${muted}`}>
        <li className="flex items-center gap-2">
          <Share aria-hidden="true" size={16} className="shrink-0" />
          {dict.iosShare}
        </li>
        <li className="flex items-center gap-2">
          <SquarePlus aria-hidden="true" size={16} className="shrink-0" />
          {dict.iosAdd}
        </li>
      </ol>
    );
  }

  return <p className={`text-sm ${muted}`}>{dict.manual}</p>;
}

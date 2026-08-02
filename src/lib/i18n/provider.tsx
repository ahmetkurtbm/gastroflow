"use client";

import { createContext, useContext } from "react";

import type { Dictionary, Locale } from "./dictionaries";

const I18nContext = createContext<{ locale: Locale; dict: Dictionary } | null>(null);

/** Sunucudan gelen sözlüğü client bileşen ağacına aktarır — her client
 * bileşenin ayrı ayrı çerez okuyup sözlük seçmesi gerekmez, hydration'da
 * sunucu/istemci arasında dil uyuşmazlığı riski de olmaz. */
export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={{ locale, dict }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n(), I18nProvider dışında çağrıldı.");
  }
  return ctx;
}

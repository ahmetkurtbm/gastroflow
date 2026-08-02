import { cookies } from "next/headers";

import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, getDictionary, type Locale } from "./dictionaries";

/** Aktif dili çerezden okur. Çerez yoksa/bozuksa varsayılana düşer. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  return (LOCALES as readonly string[]).includes(raw ?? "") ? (raw as Locale) : DEFAULT_LOCALE;
}

export async function getServerDictionary() {
  const locale = await getLocale();
  return { locale, dict: getDictionary(locale) };
}

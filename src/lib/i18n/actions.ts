"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { LOCALE_COOKIE, LOCALES, type Locale } from "./dictionaries";

/** Dil değiştirici. Sunucu bileşenleri çerezi okuyup ilgili sözlüğü seçtiği
 * için, dil değişince tüm ağacın yeniden render olması yeterli — ayrı bir
 * çeviri yükleme/route değişimi gerekmez. */
export async function setLocale(formData: FormData) {
  const value = formData.get("locale");
  if (typeof value !== "string" || !(LOCALES as readonly string[]).includes(value)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, value as Locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}

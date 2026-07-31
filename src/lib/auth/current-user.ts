import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { parseAppClaims, type AppClaims } from "./access";

/**
 * Oturumdaki kullanıcının uygulama kimliği (tenant + şube + rol).
 *
 * `getClaims()` token'ı imzasıyla doğrular. `getSession()` kullanmıyoruz:
 * o, çerezdeki veriyi doğrulamadan okur ve sahte oturuma kanabilir.
 *
 * `null` dönmesinin iki sebebi olabilir:
 *   1. Kullanıcı giriş yapmamış.
 *   2. Giriş yapmış ama aktif bir üyeliği yok (claim yazılmamış) — yeni davet
 *      edilip henüz işletmeye bağlanmamış personel bu durumda.
 * İkisini ayırmak için `getAuthUserId()` kullan.
 */
export async function getAppUser(): Promise<AppClaims | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return parseAppClaims(data?.claims);
}

/** Oturum var mı? (Üyeliği olmasa bile.) */
export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}

/**
 * Korumalı sayfalarda kullan. Kimlik yoksa girişe yollar.
 *
 * Not: `proxy.ts` zaten aynı kontrolü yapıyor. Bu ikinci kontrol bilinçli —
 * proxy'nin matcher'ından düşen bir rota olursa sayfa savunmasız kalmasın.
 */
export async function requireAppUser(): Promise<AppClaims> {
  const user = await getAppUser();
  if (!user) redirect("/login");
  return user;
}

import { redirect } from "next/navigation";

import { createClient } from "@/lib/db/client";

import { canAccessPath, parseAppClaims, type AppClaims } from "./access";

/**
 * Oturumdaki kullanıcının kiracı, şube ve rolü. `getClaims()` token'ı imzasıyla
 * doğrular. Giriş yoksa ya da aktif üyelik yoksa `null` döner; ikisini ayırmak
 * için `getAuthUserId()` kullanılır.
 */
export async function getAppUser(): Promise<AppClaims | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return parseAppClaims(data?.claims);
}

/** Oturum var mı (üyelik olmasa bile)? */
export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}

/** Kimlik yoksa girişe yönlendirir; proxy matcher'ından kaçan rotalar için ikinci kontrol. */
export async function requireAppUser(): Promise<AppClaims> {
  const user = await getAppUser();
  if (!user) redirect("/login");
  return user;
}

/** Kullanıcı verilen ekrana erişebiliyorsa döndürür, erişemiyorsa `null`. */
export async function requirePathAccess(path: string): Promise<AppClaims | null> {
  const user = await requireAppUser();
  return canAccessPath(user.role, path) ? user : null;
}

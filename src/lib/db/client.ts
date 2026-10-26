import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { INTERNAL_API_URL, inProcessFetch } from "./handler";
import { ANON_KEY, serviceRoleKey } from "./jwt";

/** Oturumdaki kullanıcının kimliğiyle çalışan, RLS'e tabi sunucu istemcisi. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(INTERNAL_API_URL, ANON_KEY, {
    global: { fetch: inProcessFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component çerez yazamaz; oturumu proxy.ts tazeler.
        }
      },
    },
  });
}

/**
 * RLS'i atlayan istemci; her kiracının her satırını okur ve yazar. Yalnızca
 * kullanıcı kimliğiyle yapılamayan işler içindir (QR sipariş, stok düşümü,
 * personel hesabı). Kiracı kimliği asla istemci girdisinden alınmaz.
 */
export function createServiceRoleClient() {
  return createServerClient<Database>(INTERNAL_API_URL, serviceRoleKey(), {
    global: { fetch: inProcessFetch },
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Herkese açık bucket'taki bir dosyanın tarayıcıdan erişilen yolu. */
export function publicFilePath(publicUrl: string): string {
  return new URL(publicUrl).pathname;
}

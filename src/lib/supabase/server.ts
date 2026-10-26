import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv, getServerEnv } from "@/lib/env";

import type { Database } from "./database.types";

/** Oturumdaki kullanıcının kimliğiyle çalışan, RLS'e tabi sunucu istemcisi. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
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
    },
  );
}

/**
 * RLS'i atlayan istemci; her kiracının her satırını okur ve yazar. Yalnızca
 * kullanıcı kimliğiyle yapılamayan işler içindir (QR sipariş, stok düşümü,
 * personel hesabı). Kiracı kimliği asla istemci girdisinden alınmaz.
 */
export function createServiceRoleClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Bu istemci yalnızca sunucu ortamında kullanılabilir.",
    );
  }

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

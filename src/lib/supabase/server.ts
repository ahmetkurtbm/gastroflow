import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv, getServerEnv } from "@/lib/env";

/**
 * Sunucu tarafı Supabase istemcisi (Server Component / Server Action / Route Handler).
 *
 * `anon` anahtarını kullanır — yani RLS yine devrede. Kullanıcının oturumu
 * çerezden okunur, dolayısıyla sorgular o kullanıcının kimliğiyle çalışır.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
            // Server Component içinden çerez yazılamaz. Oturum yenilemeyi
            // middleware üstlendiği için bunu yutmak güvenli.
          }
        },
      },
    },
  );
}

/**
 * RLS'i BYPASS EDEN istemci. Her satırı görür, her satırı yazar.
 *
 * Sadece kullanıcı kimliğiyle yapılamayacak işler için: bildirim kuyruğunu işleyen
 * worker, cron ile üretilen özet raporlar, tenant provizyonu.
 *
 * Kurallar:
 * - Bir Client Component'ten ASLA import edilmez ("server-only" bunu build'de zorlar).
 * - Kullanıcıdan gelen bir girdiyle doğrudan filtre kurulmaz; tenant_id her zaman
 *   sunucunun kendi doğruladığı oturumdan gelir.
 * - Kullanmadan önce sor: bu gerçekten RLS ile yapılamıyor mu?
 */
export function createServiceRoleClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Bu istemci yalnızca sunucu ortamında kullanılabilir.",
    );
  }

  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      // Servis anahtarı bir kullanıcıyı temsil etmez; oturum çerezi tutmaz.
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

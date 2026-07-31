import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";

/**
 * Tarayıcı tarafı Supabase istemcisi.
 *
 * Yalnızca `anon` anahtarını kullanır; eriştiği her satır RLS politikalarından
 * geçer. Yani buradan yapılan bir sorgu kötü niyetli de olsa başka bir tenant'ın
 * verisini getiremez — güvenlik bu dosyada değil, veritabanında zorlanır.
 */
export function createClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

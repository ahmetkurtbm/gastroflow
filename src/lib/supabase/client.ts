import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";

import type { Database } from "./database.types";

/** Tarayıcı istemcisi; yalnızca publishable anahtarı kullanır, her satır RLS'ten geçer. */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

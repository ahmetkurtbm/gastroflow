import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { clientEnv } from "@/lib/env";

/**
 * Oturumu tazeler ve isteği yapan kullanıcıyı döndürür.
 *
 * Middleware'de yapılmasının sebebi: Server Component'ler çerez yazamaz, dolayısıyla
 * access token'ın yenilenmesi için tek uygun yer burası.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
          // KRİTİK: bu başlıklar yazılmazsa bir ara katman (CDN/reverse proxy)
          // oturum çerezi taşıyan yanıtı önbelleğe alabilir ve bir kullanıcının
          // token'ını başka bir kullanıcıya servis edebilir.
          for (const [key, headerValue] of Object.entries(headers)) {
            response.headers.set(key, headerValue);
          }
        },
      },
    },
  );

  // `getClaims()` token'ı doğrulayıp claim'leri döndürür. `getSession()` KULLANMA:
  // o, çerezdeki veriyi doğrulamadan okur ve sahte oturuma kanabilir.
  const { data } = await supabase.auth.getClaims();

  return data?.claims ?? null;
}

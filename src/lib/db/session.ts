import { createServerClient } from "@supabase/ssr";
import { type NextRequest, type NextResponse } from "next/server";

import { INTERNAL_API_URL, inProcessFetch } from "./handler";
import { ANON_KEY } from "./jwt";

/** Oturumu tazeler ve kullanıcının claim'lerini döndürür; Server Component çerez yazamaz. */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(INTERNAL_API_URL, ANON_KEY, {
    global: { fetch: inProcessFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        // Oturum çerezi taşıyan yanıt bir CDN tarafından önbelleğe alınıp başkasına sunulmasın.
        for (const [key, headerValue] of Object.entries(headers)) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });

  // `getSession()` çerezi doğrulamadan okur; `getClaims()` imzayı doğrular.
  const { data } = await supabase.auth.getClaims();

  return data?.claims ?? null;
}

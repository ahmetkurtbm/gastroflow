import { NextResponse, type NextRequest } from "next/server";

import { clientEnv } from "@/lib/env";
import { updateSession } from "@/lib/supabase/session";
import {
  ROLE_HOME,
  canAccessPath,
  isPublicPath,
  parseAppClaims,
} from "@/lib/auth/access";

/**
 * Next.js 16'da bu dosya `middleware.ts` değil `proxy.ts`; dışa aktarılan
 * fonksiyonun adı da `proxy` olmak zorunda.
 *
 * Üç iş yapıyor:
 *   1. Her istek için taze nonce üretip CSP başlığını kurar.
 *   2. Supabase oturumunu tazeler (Server Component'ler çerez yazamadığı için
 *      bunun yapılabileceği tek yer burası).
 *   3. Rol bazlı yönlendirme yapar.
 *
 * (3) bir güvenlik katmanı DEĞİLDİR — kullanıcıyı göremeyeceği ekrana boşuna
 * göndermemek içindir. Verinin korunması RLS'in işi.
 *
 * Not: nonce kullanmak tüm sayfaları dinamik render'a zorlar. Bu uygulamada
 * kayıp yok; POS, mutfak ekranı ve raporların hepsi zaten kullanıcıya özel.
 */

const SUPABASE_ORIGIN = new URL(clientEnv.NEXT_PUBLIC_SUPABASE_URL).origin;
const SUPABASE_WS_ORIGIN = SUPABASE_ORIGIN.replace(/^https/, "wss");

function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string, isDev: boolean) {
  return [
    "default-src 'self'",
    // 'strict-dynamic': nonce'lu script'in yüklediği script'ler de güvenilir sayılır,
    // böylece Next'in chunk yükleyicisi çalışır ama sayfaya enjekte edilen bir
    // <script> çalışmaz. Dev'de React hata ayıklama için eval kullanıyor.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind ve Next satır içi stil üretiyor. Stil için nonce zinciri kurmak
    // pratikte kırılgan; CSS enjeksiyonu XSS'e kıyasla çok düşük riskli.
    "style-src 'self' 'unsafe-inline'",
    // blob: + data: → kamerayla çekilen fatura görselinin önizlemesi.
    `img-src 'self' blob: data: ${SUPABASE_ORIGIN}`,
    "font-src 'self' data:",
    // wss: → Realtime (mutfak ekranı, canlı sipariş akışı).
    `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = generateNonce();
  const csp = buildCsp(nonce, isDev);

  // Next, CSP başlığını okuyup nonce'u kendi <script> etiketlerine kendisi
  // ekliyor; bu yüzden ikisini de istek başlığına koymak gerekiyor.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);

  // Oturum tazeleme response'a çerez yazabilir; bu yüzden aşağıda response'u
  // yeniden oluşturmuyoruz — aksi hâlde yenilenen token kaybolur.
  const claims = await updateSession(request, response);
  const app = parseAppClaims(claims);
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    // Oturumu açık kullanıcıyı giriş sayfasında oyalamayalım.
    if (app && pathname === "/login") {
      return NextResponse.redirect(new URL(ROLE_HOME[app.role], request.url));
    }
    return response;
  }

  if (!app) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(app.role, pathname)) {
    // 403 yerine kendi ana ekranına yolluyoruz: garson yanlışlıkla /reports'a
    // düşerse hata ekranı değil, POS ekranı görmeli.
    return NextResponse.redirect(new URL(ROLE_HOME[app.role], request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Statik varlıklar hariç her istek.
     *
     * Prefetch istekleri bilerek DIŞLANMADI: prefetch de sayfa içeriği getirir,
     * yetki kontrolünden geçmezse korumalı içerik önden çekilebilirdi.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

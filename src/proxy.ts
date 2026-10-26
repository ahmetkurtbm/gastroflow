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
 * Her istekte CSP nonce'u üretir, Supabase oturumunu tazeler ve rol bazlı
 * yönlendirme yapar. Yönlendirme güvenlik katmanı değildir; veriyi RLS korur.
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
    // strict-dynamic: nonce'lu script'in yüklediği chunk'lar çalışır, enjekte edilen script çalışmaz.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind ve Next satır içi stil ürettiği için style-src unsafe-inline.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${SUPABASE_ORIGIN}`,
    "font-src 'self' data:",
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

  // Next nonce'u istek başlığındaki CSP'den okuyup kendi script'lerine ekler.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);

  // Tazelenen oturum çerezi bu response'a yazılır; response yeniden oluşturulmamalı.
  const claims = await updateSession(request, response);
  const app = parseAppClaims(claims);
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
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
    // 403 yerine rolün ana ekranına yönlendir.
    return NextResponse.redirect(new URL(ROLE_HOME[app.role], request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Statik varlıklar hariç her istek; prefetch de korumalı içerik çektiği için dahil.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

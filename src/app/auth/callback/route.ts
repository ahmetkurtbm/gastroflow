import { NextResponse, type NextRequest } from "next/server";

import { ROLE_HOME, parseAppClaims } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/** Supabase e-posta bağlantılarının (`?code=`) dönüş adresi; kod oturuma çevrilir. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Süresi dolmuş ya da kullanılmış kod: ayrıntı vermeden girişe yönlendir.
    return NextResponse.redirect(`${origin}/login`);
  }

  const { data } = await supabase.auth.getClaims();
  const app = parseAppClaims(data?.claims);

  return NextResponse.redirect(
    `${origin}${app ? ROLE_HOME[app.role] : "/login"}`,
  );
}

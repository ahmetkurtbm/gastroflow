import { NextResponse, type NextRequest } from "next/server";

import { ROLE_HOME, parseAppClaims } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/**
 * E-posta bağlantılarının dönüş adresi: personel daveti, e-posta doğrulama,
 * şifre sıfırlama. Supabase `?code=` ile buraya döner, biz kodu oturuma çeviririz.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Kod süresi dolmuş veya kullanılmış olabilir. Sebebi kullanıcıya
    // ayrıntısıyla söylemiyoruz; girişe yollamak yeterli ve daha güvenli.
    return NextResponse.redirect(`${origin}/login`);
  }

  const { data } = await supabase.auth.getClaims();
  const app = parseAppClaims(data?.claims);

  // Üyeliği yoksa /login "işletmeye bağlanmadınız" ekranını gösterecek.
  return NextResponse.redirect(
    `${origin}${app ? ROLE_HOME[app.role] : "/login"}`,
  );
}

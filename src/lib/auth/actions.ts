"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { ROLE_HOME, parseAppClaims } from "./access";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

/**
 * E-posta + şifre ile giriş.
 *
 * Hata mesajı bilerek geneldir ("e-posta veya şifre hatalı"). "Bu e-posta kayıtlı
 * değil" demek, saldırgana hangi adreslerin sistemde olduğunu tek tek sorgulama
 * imkânı verirdi (kullanıcı sayımı / user enumeration).
 */
export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "E-posta veya şifre hatalı." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "E-posta veya şifre hatalı." };
  }

  // Giriş başarılı; artık token'da claim'ler var. Kullanıcıyı kendi ana
  // ekranına yolluyoruz — garsonu rapor sayfasına düşürmenin anlamı yok.
  const { data } = await supabase.auth.getClaims();
  const app = parseAppClaims(data?.claims);

  // redirect() bir istisna fırlatarak çalışır; try/catch içine alınmamalı.
  redirect(app ? ROLE_HOME[app.role] : "/login");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

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

/** E-posta ve şifreyle giriş. Hata mesajı, kayıtlı e-postaları sızdırmamak için geneldir. */
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

  // Kullanıcı rolünün ana ekranına yönlendirilir.
  const { data } = await supabase.auth.getClaims();
  const app = parseAppClaims(data?.claims);

  // redirect() istisna fırlatarak çalışır; try/catch içinde olmamalı.
  redirect(app ? ROLE_HOME[app.role] : "/login");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

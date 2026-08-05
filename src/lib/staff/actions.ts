"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { APP_ROLES } from "@/lib/auth/access";
import { requireAppUser } from "@/lib/auth/current-user";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export type AddStaffState = { error?: string; created?: { email: string; password: string } };

function fail(error: unknown): AddStaffState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

function generateTempPassword(): string {
  // URL-safe, 12 karakter — ekranda bir kez gösterilip elle iletiliyor
  // (mail/SMS entegrasyonu yok). Personel giriş yaptıktan sonra kendi
  // şifresini değiştirebilir (Supabase Auth'un kendi akışı).
  return randomBytes(9).toString("base64url");
}

const addStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email(),
  role: z.enum(APP_ROLES),
  branchId: z.uuid().nullable(),
});

/**
 * Yeni personel ekler: hem auth.users'ta hesap açar hem memberships'e yazar.
 *
 * İki adım da başarılı olmalı — biri başarısız olursa öbürü GERİ ALINIR.
 * `auth.users` oluşturma yalnızca service_role ile yapılabilir (RLS'in
 * erişemeyeceği bir şema); `memberships` yazımı ise BİLEREK normal, oturumlu
 * istemciyle yapılıyor — hem RLS'in `is_owner()` kontrolünden gerçekten
 * geçsin, hem `audit_log`'a doğru aktör (auth.uid()) yazılsın. service_role
 * ile yazılsaydı denetim kaydı "kim ekledi" sorusunu cevapsız bırakırdı.
 */
export async function addStaffMember(
  _previous: AddStaffState,
  formData: FormData,
): Promise<AddStaffState> {
  try {
    const input = addStaffSchema.parse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      role: formData.get("role"),
      branchId: formData.get("branchId") || null,
    });

    const user = await requireAppUser();
    const admin = createServiceRoleClient();
    const password = generateTempPassword();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });

    if (createError) {
      if (createError.code === "email_exists") {
        return { error: "Bu e-posta ile zaten bir hesap var." };
      }
      return { error: createError.message };
    }

    const supabase = await createClient();
    const { error: memberError } = await supabase.from("memberships").insert({
      user_id: created.user.id,
      tenant_id: user.tenantId,
      branch_id: input.branchId,
      role: input.role,
    });

    if (memberError) {
      // Üyelik yazılamadıysa sahipsiz bir auth.users satırı bırakmayalım —
      // aksi hâlde "üyeliği olmayan oturum" ekranına düşen, kimsenin
      // bilmediği bir hesap kalırdı.
      await admin.auth.admin.deleteUser(created.user.id);
      if (memberError.code === "42501") {
        return { error: "Bu işlemi yapma yetkin yok." };
      }
      return { error: memberError.message };
    }

    revalidatePath("/settings/personel");
    return { created: { email: input.email, password } };
  } catch (error) {
    return fail(error);
  }
}

const staffIdSchema = z.object({ id: z.uuid() });

/**
 * Personeli pasif eder (silmez — `audit_log` ve geçmiş üyelik kaydı kalır,
 * işten ayrılan biri geri dönerse yeniden aktive edilebilir).
 *
 * Not: JWT claim'leri ~1 saatlik token ömrü boyunca önbellekte kalır (bkz.
 * migration 0004) — pasif edilen personelin mevcut oturumu, token yenilenene
 * ya da yeniden giriş yapana kadar erişmeye devam edebilir. Anında iptal
 * gerekiyorsa Supabase Dashboard → Authentication'dan kullanıcı oturumları
 * elle sonlandırılmalı.
 */
export async function deactivateStaffMember(formData: FormData) {
  const { id } = staffIdSchema.parse({ id: formData.get("id") });
  const supabase = await createClient();

  const { error } = await supabase.from("memberships").update({ is_active: false }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/personel");
}

export async function reactivateStaffMember(formData: FormData) {
  const { id } = staffIdSchema.parse({ id: formData.get("id") });
  const supabase = await createClient();

  const { error } = await supabase.from("memberships").update({ is_active: true }).eq("id", id);
  if (error) {
    // 23505 = unique_violation → memberships_one_active_per_user: bu kişinin
    // zaten başka bir aktif üyeliği var (ör. iki kez eklenmiş).
    if (error.code === "23505") {
      throw new Error("Bu kişinin zaten aktif bir üyeliği var.");
    }
    throw new Error(error.message);
  }

  revalidatePath("/settings/personel");
}

const changeRoleSchema = z.object({ id: z.uuid(), role: z.enum(APP_ROLES) });

export async function changeStaffRole(formData: FormData) {
  const input = changeRoleSchema.parse({
    id: formData.get("id"),
    role: formData.get("role"),
  });
  const supabase = await createClient();

  const { error } = await supabase
    .from("memberships")
    .update({ role: input.role })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/personel");
}

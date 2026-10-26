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

// Ekranda bir kez gösterilip elle iletilir; personel girişten sonra değiştirir.
function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

const addStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email(),
  role: z.enum(APP_ROLES),
  branchId: z.uuid().nullable(),
});

/**
 * Yeni personel ekler: auth.users'ta hesap açar ve memberships'e yazar.
 *
 * Hesap açma service role gerektirir, bu yüzden önce çağıranın patron olduğu
 * doğrulanır. Üyelik ise oturumlu istemciyle yazılır ki RLS'teki `is_owner()`
 * kontrolünden de geçsin ve denetim kaydına doğru kişi düşsün. Üyelik
 * yazılamazsa açılan hesap geri silinir.
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
    if (user.role !== "owner") {
      return { error: "Bu işlemi yapma yetkin yok." };
    }

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
      console.error("Personel hesabı açılamadı:", createError);
      return { error: "Hesap açılamadı, tekrar deneyin." };
    }

    const supabase = await createClient();
    const { error: memberError } = await supabase.from("memberships").insert({
      user_id: created.user.id,
      tenant_id: user.tenantId,
      branch_id: input.branchId,
      role: input.role,
    });

    if (memberError) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
      if (rollbackError) {
        console.error(`Üyeliği yazılamayan hesap silinemedi (${created.user.id}):`, rollbackError);
      }
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
 * Personeli pasif eder; üyelik ve denetim geçmişi silinmez. JWT claim'leri
 * token yenilenene kadar (~1 saat) geçerli kalır; anında kesmek için oturum
 * Supabase panelinden sonlandırılmalıdır.
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

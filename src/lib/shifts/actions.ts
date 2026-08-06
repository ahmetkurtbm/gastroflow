"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean };

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

const createShiftSchema = z
  .object({
    userId: z.uuid(),
    branchId: z.uuid(),
    startsAt: z.string().min(1, "Başlangıç zorunlu"),
    endsAt: z.string().min(1, "Bitiş zorunlu"),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(), {
    message: "Bitiş, başlangıçtan sonra olmalı",
    path: ["endsAt"],
  });

/** Yetki kontrolü RLS'in işi (`shift_schedules_insert`, `is_manager()`) — burada tekrarlanmıyor. */
export async function createShift(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = createShiftSchema.parse({
      userId: formData.get("userId"),
      branchId: formData.get("branchId"),
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt"),
      note: formData.get("note") || undefined,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { error } = await supabase.from("shift_schedules").insert({
      tenant_id: user.tenantId,
      branch_id: input.branchId,
      user_id: input.userId,
      starts_at: new Date(input.startsAt).toISOString(),
      ends_at: new Date(input.endsAt).toISOString(),
      note: input.note ?? null,
      created_by: user.userId,
    });

    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/settings/vardiyalar");
  return { ok: true };
}

export async function deleteShift(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  const { error } = await supabase.from("shift_schedules").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/vardiyalar");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAppUser } from "@/lib/auth/current-user";
import { addDaysToDateStr, istanbulWallTimeToUtcIso } from "@/lib/shifts/queries";
import { createClient } from "@/lib/supabase/server";

/** `<input type="datetime-local">`'ın "YYYY-MM-DDTHH:mm" çıktısını UTC'ye çevirir. */
function datetimeLocalToUtcIso(value: string): string {
  const [dateStr, timeStr] = value.split("T");
  return istanbulWallTimeToUtcIso(dateStr, timeStr);
}

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
      starts_at: datetimeLocalToUtcIso(input.startsAt),
      ends_at: datetimeLocalToUtcIso(input.endsAt),
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

const weekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz hafta");

/**
 * Haftalık tablo görünümünün tek "Haftayı kaydet" butonu — tüm hafta × tüm
 * personel hücrelerini tek seferde yazar.
 *
 * Hücre bazında ekle/sil/güncelle ayrımı yapmak yerine, o hafta + o şubeye
 * ait TÜM vardiyaları silip formdan geleni yeniden yazıyoruz — tutarlı bir
 * anlık görüntü kurmanın en az hataya açık yolu. Bunun bilinçli bedeli: bu
 * haftada `createShift`'ten (not alanıyla) eklenmiş tekil bir vardiya varsa
 * o da silinir — sayfadaki uyarı metni bunu açıkça söylüyor.
 */
export async function saveWeekSchedule(formData: FormData): Promise<void> {
  const weekStart = weekStartSchema.parse(formData.get("weekStart"));
  const branchId = z.uuid().parse(formData.get("branchId"));

  const user = await requireAppUser();
  const supabase = await createClient();

  const rows: {
    tenant_id: string;
    branch_id: string;
    user_id: string;
    starts_at: string;
    ends_at: string;
    created_by: string;
  }[] = [];

  for (const [key, value] of formData.entries()) {
    const match = key.match(/^start-(.+)-(\d)$/);
    if (!match || typeof value !== "string" || value === "") continue;
    const [, userId, dayStr] = match;
    const end = formData.get(`end-${userId}-${dayStr}`);
    if (typeof end !== "string" || end === "" || end <= value) continue; // boş ya da bitiş<=başlangıç → geçersiz hücre, atla

    const dateStr = addDaysToDateStr(weekStart, Number(dayStr));
    rows.push({
      tenant_id: user.tenantId,
      branch_id: branchId,
      user_id: userId,
      starts_at: istanbulWallTimeToUtcIso(dateStr, value),
      ends_at: istanbulWallTimeToUtcIso(dateStr, end),
      created_by: user.userId,
    });
  }

  const weekStartIso = istanbulWallTimeToUtcIso(weekStart, "00:00");
  const weekEndIso = istanbulWallTimeToUtcIso(addDaysToDateStr(weekStart, 7), "00:00");

  const { error: deleteError } = await supabase
    .from("shift_schedules")
    .delete()
    .eq("branch_id", branchId)
    .gte("starts_at", weekStartIso)
    .lt("starts_at", weekEndIso);
  if (deleteError) throw new Error(deleteError.message);

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("shift_schedules").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/settings/vardiyalar");
}

export async function deleteShift(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  const { error } = await supabase.from("shift_schedules").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/vardiyalar");
}

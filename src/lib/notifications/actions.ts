"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { APP_ROLES } from "@/lib/auth/access";
import { requireAppUser } from "@/lib/auth/current-user";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

import { EVENT_TYPES } from "./queries";

export type ActionState = { error?: string; ok?: boolean; processed?: number };

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

const ruleSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  isEnabled: z.coerce.boolean(),
  recipientRoles: z.array(z.enum(APP_ROLES)),
});

/** Bir olay tipinin bildirim kuralını kaydeder (var olan satırın üstüne yazar). */
export async function updateNotificationRule(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = ruleSchema.parse({
      eventType: formData.get("eventType"),
      isEnabled: formData.get("isEnabled") === "on",
      recipientRoles: formData.getAll("recipientRoles"),
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { error } = await supabase.from("notification_rules").upsert(
      {
        tenant_id: user.tenantId,
        event_type: input.eventType,
        is_enabled: input.isEnabled,
        recipient_roles: input.recipientRoles,
      },
      { onConflict: "tenant_id,event_type" },
    );

    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/settings", "layout");
  return { ok: true };
}

/**
 * Bildirim kuyruğunu şimdi işler — `process-notifications` Edge Function'ını
 * çağırır. Normalde bu bir zamanlayıcı (ör. pg_cron + pg_net) ya da harici
 * bir cron tarafından tetiklenir; bu buton, o altyapı olmadan akışı canlı
 * göstermek/denemek için var.
 */
export async function processNotificationQueue(): Promise<ActionState> {
  try {
    await requireAppUser();
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.functions.invoke("process-notifications", {
      method: "POST",
    });

    if (error) return { error: error.message };

    revalidatePath("/settings", "layout");
    return { ok: true, processed: data?.processed ?? 0 };
  } catch (error) {
    return fail(error);
  }
}

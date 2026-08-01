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

const wasteSchema = z.object({
  locationId: z.uuid(),
  inventoryItemId: z.uuid(),
  quantity: z.coerce.number().positive("Miktar sıfırdan büyük olmalı"),
  reason: z.enum(["spoilage", "prep_error", "dropped", "expired", "customer_return", "other"]),
  note: z.string().trim().max(300).optional(),
});

/**
 * Zayiat kaydı açar — ledger'a negatif bir `waste` hareketi yazar.
 *
 * Miktar formdan pozitif girilir (kullanıcı "2 kg attım" der, eksi işaretini
 * kendisi düşünmesin); satıra yazılırken işaret burada çevrilir.
 */
export async function recordWaste(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = wasteSchema.parse({
      locationId: formData.get("locationId"),
      inventoryItemId: formData.get("inventoryItemId"),
      quantity: formData.get("quantity"),
      reason: formData.get("reason"),
      note: formData.get("note") || undefined,
    });

    const user = await requireAppUser();
    if (!user.branchId) {
      return { error: "Şube ataması olmayan kullanıcı zayiat giremez." };
    }
    const supabase = await createClient();

    const { error } = await supabase.from("stock_movements").insert({
      tenant_id: user.tenantId,
      branch_id: user.branchId,
      location_id: input.locationId,
      inventory_item_id: input.inventoryItemId,
      movement_type: "waste",
      quantity: -Math.abs(input.quantity),
      waste_reason: input.reason,
      note: input.note,
      created_by: user.userId,
    });

    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/inventory", "layout");
  return { ok: true };
}

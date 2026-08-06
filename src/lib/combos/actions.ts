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

const createComboSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.coerce.number().min(0),
  menuItemIds: z.array(z.uuid()).min(1, "En az bir ürün seçmelisin"),
  quantities: z.array(z.coerce.number().positive()),
});

/**
 * Yeni kombo oluşturur: `combos` + bileşen sayısı kadar `combo_items`.
 *
 * İkisi ayrı INSERT — aralarında bir transaction yok (PostgREST tek istekte
 * çoklu tablo transaction'ı desteklemiyor). Bileşen eklemesi başarısız
 * olursa yarım kalan komboyu geri alıyoruz — aksi hâlde bileşensiz, POS'ta
 * hiçbir işe yaramayan "hayalet" bir kombo kalırdı.
 */
export async function createCombo(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const menuItemIds = formData.getAll("menuItemId").map(String);
    const quantities = formData.getAll("quantity").map(String);

    const input = createComboSchema.parse({
      name: formData.get("name"),
      price: formData.get("price"),
      menuItemIds,
      quantities,
    });

    if (input.menuItemIds.length !== input.quantities.length) {
      return { error: "Ürün/miktar eşleşmiyor." };
    }

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: combo, error: comboError } = await supabase
      .from("combos")
      .insert({ tenant_id: user.tenantId, name: input.name, price: input.price })
      .select("id")
      .single();

    if (comboError) {
      if (comboError.code === "23505") return { error: "Bu isimde bir kombo zaten var." };
      return { error: comboError.message };
    }

    const { error: itemsError } = await supabase.from("combo_items").insert(
      input.menuItemIds.map((menuItemId, i) => ({
        tenant_id: user.tenantId,
        combo_id: combo.id,
        menu_item_id: menuItemId,
        quantity: input.quantities[i],
      })),
    );

    if (itemsError) {
      await supabase.from("combos").delete().eq("id", combo.id);
      return { error: itemsError.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/recipes/kombo");
  revalidatePath("/pos", "layout");
  return { ok: true };
}

export async function deleteCombo(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  const { error } = await supabase.from("combos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/recipes/kombo");
  revalidatePath("/pos", "layout");
}

export async function toggleComboActive(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  const supabase = await createClient();

  const { error } = await supabase.from("combos").update({ is_active: !isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/recipes/kombo");
  revalidatePath("/pos", "layout");
}

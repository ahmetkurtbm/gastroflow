"use server";

import { randomUUID } from "node:crypto";

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

const areaSchema = z.object({ name: z.string().trim().min(1).max(60) });

export async function addArea(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = areaSchema.parse({ name: formData.get("name") });
    const user = await requireAppUser();
    if (!user.branchId) {
      return { error: "Şube ataması olmayan kullanıcı alan ekleyemez." };
    }
    const supabase = await createClient();

    const { error } = await supabase.from("areas").insert({
      tenant_id: user.tenantId,
      branch_id: user.branchId,
      name: input.name,
    });

    if (error) {
      // 23505 = unique_violation → (branch_id, name) çifti zaten var.
      if (error.code === "23505") return { error: "Bu isimde bir alan zaten var." };
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/settings/salon");
  return { ok: true };
}

/**
 * Bir alanı siler. `tables.area_id` FK'si `on delete set null` — alandaki
 * masalar silinmez, yalnızca alansız kalır. Salon ekranı bunları "Diğer"
 * grubunda gösterir (bkz. `src/lib/orders/queries.ts` `loadFloorPlan`), yani
 * bir masa asla sessizce kaybolmaz; yalnızca yeniden gruplanması gerekir.
 */
export async function deleteArea(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  const { error } = await supabase.from("areas").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/salon");
  revalidatePath("/pos");
}

const tableSchema = z.object({
  areaId: z.uuid(),
  name: z.string().trim().min(1).max(30),
  seats: z.coerce.number().int().min(1).max(60),
});

export async function addTable(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = tableSchema.parse({
      areaId: formData.get("areaId"),
      name: formData.get("name"),
      seats: formData.get("seats") || 4,
    });
    const user = await requireAppUser();
    if (!user.branchId) {
      return { error: "Şube ataması olmayan kullanıcı masa ekleyemez." };
    }
    const supabase = await createClient();

    const { error } = await supabase.from("tables").insert({
      tenant_id: user.tenantId,
      branch_id: user.branchId,
      area_id: input.areaId,
      name: input.name,
      seats: input.seats,
    });

    if (error) {
      if (error.code === "23505") return { error: "Bu isimde bir masa zaten var." };
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/settings/salon");
  revalidatePath("/pos");
  return { ok: true };
}

export async function deleteTable(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  // Açık adisyonu olan bir masa silinemez — `orders.table_id` `on delete set
  // null`, yani silme "başarılı" olur ama adisyon sahipsiz kalırdı. RLS bunu
  // engellemiyor (foreign key kısıtı yok, `set null` izin veriyor), bu yüzden
  // burada açıkça kontrol ediyoruz.
  const { data: openOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("table_id", id)
    .eq("status", "open")
    .maybeSingle();

  if (openOrder) {
    throw new Error("Bu masada açık bir adisyon var, önce kapatılmalı.");
  }

  const { error } = await supabase.from("tables").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/salon");
  revalidatePath("/pos");
}

/** Masayı yatay/dikey arasında çevirir — uzun masalar duvara dik durabiliyor. */
export async function toggleTableOrientation(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const isVertical = formData.get("isVertical") === "true";
  const supabase = await createClient();

  const { error } = await supabase
    .from("tables")
    .update({ is_vertical: !isVertical })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/salon");
  revalidatePath("/pos");
}

const positionSchema = z.object({
  id: z.uuid(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

/**
 * Sürükle-bırak editöründen (bkz. floor-canvas.tsx) gelen konum kaydı.
 *
 * Form action değil — sürükleme bittiğinde doğrudan bir fonksiyon çağrısı
 * gibi çağrılıyor (Next.js Server Action'ları client bileşenlere prop olarak
 * geçilip form dışında da çağrılabilir). Sık sürüklemede her pikselde değil,
 * yalnızca bırakıldığında (pointerup) bir kez çağrılıyor — gereksiz istek
 * yığmasın diye.
 */
export async function updateTablePosition(id: string, x: number, y: number): Promise<void> {
  const input = positionSchema.parse({ id, x, y });
  const supabase = await createClient();

  const { error } = await supabase
    .from("tables")
    .update({ pos_x: input.x, pos_y: input.y })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/salon");
  revalidatePath("/pos");
}

/**
 * Bir masanın QR sipariş bağlantısını (`qr_token`) yeniler.
 *
 * Eski token o an geçersiz kalır — masaya yapıştırılmış QR kod fotoğraflanıp
 * paylaşılmışsa ya da tükenmez kalemle çizilmiş kod fiziksel olarak yıpranıp
 * yenisi basılacaksa buradan tek tuşla eski bağlantı kapatılır. `tables_update`
 * politikası zaten yalnızca `is_manager()` ile yazmaya izin veriyor (bkz.
 * migration 0009 `rls_policy_hygiene`) — burada ayrıca rol kontrolü YOK.
 */
export async function regenerateTableQrToken(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  const { error } = await supabase
    .from("tables")
    .update({ qr_token: randomUUID() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/salon");
}

/** Bir masayı "yerleştirilmemiş" durumuna geri döndürür. */
export async function unplaceTable(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  const { error } = await supabase
    .from("tables")
    .update({ pos_x: null, pos_y: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/salon");
  revalidatePath("/pos");
}

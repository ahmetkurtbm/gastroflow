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

const transferSchema = z
  .object({
    fromLocationId: z.uuid(),
    toLocationId: z.uuid(),
    inventoryItemId: z.uuid(),
    quantity: z.coerce.number().positive("Miktar sıfırdan büyük olmalı"),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, {
    message: "Kaynak ve hedef lokasyon aynı olamaz.",
    path: ["toLocationId"],
  });

/**
 * Depolar arası transfer — ledger'a bir çıkış (`transfer_out`) ve bir giriş
 * (`transfer_in`) satırı birlikte yazar.
 *
 * İkisi TEK bir insert çağrısıyla (çok satırlı VALUES) gönderiliyor —
 * Postgres bunu tek atomik işlem olarak uygular, yani ya ikisi de yazılır
 * ya hiçbiri; "çıkış yazıldı ama giriş yazılamadı" durumu imkânsız.
 *
 * İki bacak aynı `reference_id`'yi (transfer kimliği) paylaşır ama farklı
 * `reference_type` kullanır (`stock_transfer_out` / `stock_transfer_in`) —
 * `stock_movements_reference_item_unique` kısıtı (reference_type,
 * reference_id, item) üçlüsüne göre çalıştığı için bu iki satır çakışmaz,
 * ama aynı transferin tekrar gönderilmesi (ör. çift tıklama) her iki
 * bacakta da ayrı ayrı engellenir.
 */
export async function recordTransfer(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = transferSchema.parse({
      fromLocationId: formData.get("fromLocationId"),
      toLocationId: formData.get("toLocationId"),
      inventoryItemId: formData.get("inventoryItemId"),
      quantity: formData.get("quantity"),
      note: formData.get("note") || undefined,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: locations } = await supabase
      .from("stock_locations")
      .select("id, branch_id")
      .in("id", [input.fromLocationId, input.toLocationId]);

    const fromLocation = locations?.find((l) => l.id === input.fromLocationId);
    const toLocation = locations?.find((l) => l.id === input.toLocationId);
    if (!fromLocation || !toLocation) {
      return { error: "Lokasyon bulunamadı." };
    }

    const transferId = randomUUID();
    const { error } = await supabase.from("stock_movements").insert([
      {
        tenant_id: user.tenantId,
        branch_id: fromLocation.branch_id,
        location_id: input.fromLocationId,
        inventory_item_id: input.inventoryItemId,
        movement_type: "transfer_out",
        quantity: -Math.abs(input.quantity),
        reference_type: "stock_transfer_out",
        reference_id: transferId,
        note: input.note,
        created_by: user.userId,
      },
      {
        tenant_id: user.tenantId,
        branch_id: toLocation.branch_id,
        location_id: input.toLocationId,
        inventory_item_id: input.inventoryItemId,
        movement_type: "transfer_in",
        quantity: Math.abs(input.quantity),
        reference_type: "stock_transfer_in",
        reference_id: transferId,
        note: input.note,
        created_by: user.userId,
      },
    ]);

    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/inventory", "layout");
  return { ok: true };
}

/**
 * Fiziksel sayım — körleme: form ekranı mevcut bakiyeyi göstermez, sayan
 * kişi ne görürse onu yazar. Sunucu tarafında sayılan miktarla sistemdeki
 * bakiye arasındaki farkı hesaplayıp `count_adjustment` hareketi yazar.
 *
 * Boş bırakılan ürünler atlanır (o oturumda sayılmadı demektir) — bu,
 * ekranın "sayfa sayfa kaydet" akışının temel taşı: mobil sayım ekranı
 * (bkz. src/lib/offline/use-offline-count.ts) ürünleri sayfalara bölüp her
 * sayfayı ayrı bir çağrıyla, yalnızca o sayfadaki `qty_<id>` alanlarıyla
 * gönderiyor. Fark sıfırsa hareket hiç yazılmaz, ledger'ı anlamsız sıfır
 * kayıtlarla şişirmez.
 *
 * `batchId` idempotency anahtarı: aynı sayfa iki kez gönderilirse (offline
 * kuyruktan yeniden deneme, ya da yanıt ağda kaybolup istemci tekrar
 * denerse) `stock_movements`'taki `(reference_type, reference_id,
 * inventory_item_id)` kısıtı ikinci denemeyi reddeder — depletion'daki aynı
 * desen (bkz. migration 0010).
 */
export async function recordCount(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const locationId = z.uuid().parse(formData.get("locationId"));
    const batchId = z.uuid().parse(formData.get("batchId"));
    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: location } = await supabase
      .from("stock_locations")
      .select("id, branch_id")
      .eq("id", locationId)
      .maybeSingle();
    if (!location) return { error: "Lokasyon bulunamadı." };

    const { data: items } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("is_active", true);
    if (!items || items.length === 0) return { error: "Tanımlı hammadde yok." };

    const { data: balances } = await supabase
      .from("v_stock_balance")
      .select("inventory_item_id, balance")
      .eq("location_id", locationId);
    const balanceByItem = new Map(
      (balances ?? []).map((b) => [b.inventory_item_id, Number(b.balance)]),
    );

    const rows: {
      tenant_id: string;
      branch_id: string;
      location_id: string;
      inventory_item_id: string;
      movement_type: "count_adjustment";
      quantity: number;
      note: string;
      created_by: string;
      reference_type: string;
      reference_id: string;
    }[] = [];

    for (const item of items) {
      const raw = formData.get(`qty_${item.id}`);
      if (raw === null || raw === "") continue;

      const counted = Number(raw);
      if (!Number.isFinite(counted) || counted < 0) {
        return { error: "Sayım miktarları negatif olamaz." };
      }

      const current = balanceByItem.get(item.id) ?? 0;
      const delta = counted - current;
      if (Math.abs(delta) < 1e-9) continue;

      rows.push({
        tenant_id: user.tenantId,
        branch_id: location.branch_id,
        location_id: locationId,
        inventory_item_id: item.id,
        movement_type: "count_adjustment",
        quantity: delta,
        note: `Sayım: sistemde ${current}, sayılan ${counted}`,
        created_by: user.userId,
        reference_type: "stock_count",
        reference_id: batchId,
      });
    }

    if (rows.length === 0) {
      return { ok: true };
    }

    const { error } = await supabase.from("stock_movements").insert(rows);
    if (error) {
      // 23505 = unique_violation → bu sayfa (aynı batchId) daha önce zaten
      // kaydedilmiş (offline kuyruktan yeniden deneme, ya da yanıt ağda
      // kaybolup istemci tekrar denedi). "Zaten yapılmış" say, hata dönme —
      // aksi hâlde kuyruk bu sayfayı sonsuza dek yeniden denerdi.
      if (error.code === "23505") return { ok: true };
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/inventory", "layout");
  return { ok: true };
}

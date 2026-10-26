"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAppUser } from "@/lib/auth/current-user";
import { parseWorkbookRows, type ImportResult } from "@/lib/excel/workbook";
import { createClient } from "@/lib/db/client";

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

/** Zayiat kaydı açar; formda pozitif girilen miktar ledger'a negatif yazılır. */
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
 * Depolar arası transfer. Çıkış ve giriş satırları tek insert'te yazılır, yani
 * ikisi birlikte ya yazılır ya yazılmaz. Aynı transferin tekrar gönderilmesi
 * `stock_movements_reference_item_unique` kısıtıyla engellenir.
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
 * Körleme fiziksel sayım: ekran mevcut bakiyeyi göstermez, fark sunucuda
 * hesaplanıp `count_adjustment` olarak yazılır. Boş bırakılan ve farkı sıfır
 * olan ürünler atlanır; mobil ekran sayfa sayfa gönderebilir.
 *
 * `batchId` idempotency anahtarıdır: aynı sayfanın tekrar gönderimi
 * `stock_movements` unique kısıtına takılır.
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
      // 23505: bu sayfa zaten kaydedilmiş; kuyruk sonsuza kadar denemesin.
      if (error.code === "23505") return { ok: true };
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/inventory", "layout");
  return { ok: true };
}

const importCountRowSchema = z.object({
  itemName: z.string().trim().min(1).max(120),
  counted: z.coerce.number().min(0),
});

/** Fiziksel sayımı Excel'den içe aktarır; `recordCount` ile aynı körleme ve fark hesabı. */
export async function importStockCount(
  _previous: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  try {
    const locationId = z.uuid().parse(formData.get("locationId"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Bir dosya seç." };
    }

    const user = await requireAppUser();
    const rows = await parseWorkbookRows(file);
    if (rows.length === 0) return { error: "Dosyada satır bulunamadı." };

    const supabase = await createClient();
    const batchId = randomUUID();

    const { data: location } = await supabase
      .from("stock_locations")
      .select("id, branch_id")
      .eq("id", locationId)
      .maybeSingle();
    if (!location) return { error: "Lokasyon bulunamadı." };

    const [{ data: items }, { data: balances }] = await Promise.all([
      supabase.from("inventory_items").select("id, name").eq("tenant_id", user.tenantId).eq("is_active", true),
      supabase.from("v_stock_balance").select("inventory_item_id, balance").eq("location_id", locationId),
    ]);
    const itemIdByName = new Map((items ?? []).map((i) => [i.name.trim().toLowerCase(), i.id]));
    const balanceByItem = new Map((balances ?? []).map((b) => [b.inventory_item_id, Number(b.balance)]));

    const movementRows: {
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
    let skipped = 0;

    for (const row of rows) {
      const parsed = importCountRowSchema.safeParse({
        itemName: row["Hammadde Adı"],
        counted: row["Sayılan Miktar"],
      });
      if (!parsed.success) {
        skipped++;
        continue;
      }
      const inventoryItemId = itemIdByName.get(parsed.data.itemName.trim().toLowerCase());
      if (!inventoryItemId) {
        skipped++;
        continue;
      }

      const current = balanceByItem.get(inventoryItemId) ?? 0;
      const delta = parsed.data.counted - current;
      if (Math.abs(delta) < 1e-9) continue;

      movementRows.push({
        tenant_id: user.tenantId,
        branch_id: location.branch_id,
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        movement_type: "count_adjustment",
        quantity: delta,
        note: `Sayım (Excel): sistemde ${current}, sayılan ${parsed.data.counted}`,
        created_by: user.userId,
        reference_type: "stock_count",
        reference_id: batchId,
      });
    }

    if (movementRows.length > 0) {
      const { error } = await supabase.from("stock_movements").insert(movementRows);
      if (error) return { error: error.message };
    }

    revalidatePath("/inventory", "layout");
    return { ok: true, created: movementRows.length, skipped };
  } catch (error) {
    return fail(error);
  }
}

"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(200).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365),
});

export async function addSupplier(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = supplierSchema.parse({
      name: formData.get("name"),
      contactName: formData.get("contactName") || undefined,
      phone: formData.get("phone") || undefined,
      email: formData.get("email") || undefined,
      leadTimeDays: formData.get("leadTimeDays") || 1,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { error } = await supabase.from("suppliers").insert({
      tenant_id: user.tenantId,
      name: input.name,
      contact_name: input.contactName,
      phone: input.phone,
      email: input.email,
      lead_time_days: input.leadTimeDays,
    });

    if (error) {
      if (error.code === "23505") return { error: "Bu isimde bir tedarikçi zaten var." };
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/purchasing", "layout");
  return { ok: true };
}

const supplierItemSchema = z.object({
  supplierId: z.uuid(),
  inventoryItemId: z.uuid(),
  price: z.coerce.number().min(0),
  minOrderQuantity: z.coerce.number().min(0).optional(),
  supplierSku: z.string().trim().max(60).optional(),
});

export async function addSupplierItem(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = supplierItemSchema.parse({
      supplierId: formData.get("supplierId"),
      inventoryItemId: formData.get("inventoryItemId"),
      price: formData.get("price"),
      minOrderQuantity: formData.get("minOrderQuantity") || 0,
      supplierSku: formData.get("supplierSku") || undefined,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { error } = await supabase.from("supplier_items").insert({
      tenant_id: user.tenantId,
      supplier_id: input.supplierId,
      inventory_item_id: input.inventoryItemId,
      price: input.price,
      min_order_quantity: input.minOrderQuantity,
      supplier_sku: input.supplierSku,
    });

    if (error) {
      if (error.code === "23505") {
        return { error: "Bu ürün zaten bu tedarikçinin fiyat listesinde var." };
      }
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/purchasing", "layout");
  return { ok: true };
}

const createPOSchema = z.object({
  supplierId: z.uuid(),
  note: z.string().trim().max(300).optional(),
});

/**
 * Yeni satın alma siparişi oluşturur — her zaman `pending_approval` olarak
 * açılır (müdür/patron dahil, bkz. migration 0014: onay her zaman ayrı bir
 * adımdır; ikram/iskonto akışının aksine burada gerçek para taahhüdü var).
 *
 * `redirect()` bilerek try/catch DIŞINDA çağrılıyor — Next.js redirect'i
 * içeride fırlatılan özel bir istisna ile çalışır, bir catch bloğu bunu
 * yutup normal bir hataya çevirirse yönlendirme hiç gerçekleşmez.
 */
async function buildPurchaseOrder(formData: FormData): Promise<{ error: string } | { poId: string }> {
  try {
    const input = createPOSchema.parse({
      supplierId: formData.get("supplierId"),
      note: formData.get("note") || undefined,
    });

    const user = await requireAppUser();
    if (!user.branchId) {
      return { error: "Şube ataması olmayan kullanıcı sipariş oluşturamaz." };
    }
    const supabase = await createClient();

    const { data: items } = await supabase
      .from("supplier_items")
      .select("inventory_item_id, price")
      .eq("supplier_id", input.supplierId);
    if (!items || items.length === 0) {
      return { error: "Bu tedarikçinin fiyat listesinde ürün yok." };
    }

    const lines: { inventory_item_id: string; quantity: number; unit_price: number }[] = [];
    for (const item of items) {
      const raw = formData.get(`qty_${item.inventory_item_id}`);
      if (raw === null || raw === "") continue;
      const qty = Number(raw);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      lines.push({
        inventory_item_id: item.inventory_item_id,
        quantity: qty,
        unit_price: Number(item.price),
      });
    }

    if (lines.length === 0) {
      return { error: "En az bir ürün için miktar girmelisin." };
    }

    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .insert({
        tenant_id: user.tenantId,
        branch_id: user.branchId,
        supplier_id: input.supplierId,
        requested_by: user.userId,
        note: input.note,
        client_key: randomUUID(),
      })
      .select("id")
      .maybeSingle();

    if (poError || !po) return { error: poError?.message ?? "Sipariş oluşturulamadı." };

    const { error: linesError } = await supabase.from("po_lines").insert(
      lines.map((l) => ({
        tenant_id: user.tenantId,
        po_id: po.id,
        inventory_item_id: l.inventory_item_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })),
    );

    if (linesError) return { error: linesError.message };

    return { poId: po.id };
  } catch (error) {
    const state = fail(error);
    return { error: state.error ?? "Beklenmeyen bir hata oluştu." };
  }
}

export async function createPurchaseOrder(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await buildPurchaseOrder(formData);
  if ("error" in result) return { error: result.error };

  revalidatePath("/purchasing", "layout");
  redirect(`/purchasing/${result.poId}`);
}

const decideSchema = z.object({
  poId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});

/** Müdür/patron onay bekleyen bir siparişi onaylar/reddeder — geçiş kuralı DB tetikleyicisinde. */
export async function decidePurchaseOrder(formData: FormData) {
  const input = decideSchema.parse({
    poId: formData.get("poId"),
    decision: formData.get("decision"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: input.decision })
    .eq("id", input.poId)
    .eq("status", "pending_approval");

  if (error) throw new Error(error.message);
  revalidatePath("/purchasing", "layout");
}

export async function cancelPurchaseOrder(formData: FormData) {
  const poId = z.uuid().parse(formData.get("poId"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", poId)
    .in("status", ["pending_approval", "approved"]);

  if (error) throw new Error(error.message);
  revalidatePath("/purchasing", "layout");
}

const receiveSchema = z.object({
  poId: z.uuid(),
  locationId: z.uuid(),
});

/**
 * Mal kabul — onaylanmış bir siparişi kapatır ve alınan miktarları stoğa
 * `purchase_in` olarak yazar.
 *
 * Girilmeyen (boş bırakılan) satırlar SİPARİŞ EDİLEN miktarla aynı kabul
 * edilir — depo elemanı yalnızca FARK olan ürünlere dokunsun diye.
 */
export async function receiveGoods(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = receiveSchema.parse({
      poId: formData.get("poId"),
      locationId: formData.get("locationId"),
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: po } = await supabase
      .from("purchase_orders")
      .select("id, branch_id, status")
      .eq("id", input.poId)
      .maybeSingle();
    if (!po || po.status !== "approved") {
      return { error: "Bu sipariş mal kabule hazır değil." };
    }

    const { data: lines } = await supabase
      .from("po_lines")
      .select("id, inventory_item_id, quantity")
      .eq("po_id", input.poId);
    if (!lines || lines.length === 0) return { error: "Siparişte satır yok." };

    const receivedByLine = new Map<string, number>();
    for (const line of lines) {
      const raw = formData.get(`received_${line.id}`);
      const received = raw !== null && raw !== "" ? Number(raw) : Number(line.quantity);
      if (!Number.isFinite(received) || received < 0) {
        return { error: "Alınan miktarlar negatif olamaz." };
      }
      receivedByLine.set(line.id, received);
    }

    for (const line of lines) {
      const receivedQuantity = receivedByLine.get(line.id) ?? 0;
      const { error } = await supabase
        .from("po_lines")
        .update({ received_quantity: receivedQuantity })
        .eq("id", line.id);
      if (error) return { error: error.message };
    }

    const { error: statusError } = await supabase
      .from("purchase_orders")
      .update({ status: "received" })
      .eq("id", input.poId)
      .eq("status", "approved");
    if (statusError) return { error: statusError.message };

    const movements = lines
      .map((line) => ({
        line,
        receivedQuantity: receivedByLine.get(line.id) ?? 0,
      }))
      .filter((l) => l.receivedQuantity > 0)
      .map((l) => ({
        tenant_id: user.tenantId,
        branch_id: po.branch_id,
        location_id: input.locationId,
        inventory_item_id: l.line.inventory_item_id,
        movement_type: "purchase_in" as const,
        quantity: l.receivedQuantity,
        reference_type: "goods_receipt",
        reference_id: po.id,
        created_by: user.userId,
      }));

    if (movements.length > 0) {
      const { error: movementError } = await supabase.from("stock_movements").insert(movements);
      // Sipariş zaten 'received' işaretlendi; stok yazımı başarısız olursa
      // (ör. bu mal kabul ikinci kez deneniyorsa, unique kısıt engeller)
      // hatayı yutuyoruz — aynı desen recordPayment/depleteOrderStock'ta da var.
      if (movementError) {
        console.error(`Mal kabul stok yazımı başarısız (PO ${input.poId}):`, movementError);
      }
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/purchasing", "layout");
  revalidatePath("/inventory", "layout");
  return { ok: true };
}

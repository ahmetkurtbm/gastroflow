"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { allocateProportional, money, toLira } from "@/core/money";
import { currentPrices } from "@/core/pricing";
import { requireAppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

// `client_key` çift gönderime karşı korur: offline kuyruk aynı mutasyonu
// tekrar denediğinde `(order_id, client_key)` unique kısıtına takılır.

export type ActionState = { error?: string; ok?: boolean };

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

/** Masaya adisyon açar. Masa başına tek açık adisyon kuralı veritabanı kısıtındadır. */
export async function openTable(formData: FormData) {
  const tableId = z.uuid().parse(formData.get("tableId"));
  const user = await requireAppUser();
  const supabase = await createClient();

  const { data: table } = await supabase
    .from("tables")
    .select("branch_id")
    .eq("id", tableId)
    .maybeSingle();

  if (!table) throw new Error("Masa bulunamadı.");

  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle();

  if (existing) {
    redirect(`/pos/masa/${tableId}`);
  }

  const { error } = await supabase.from("orders").insert({
    tenant_id: user.tenantId,
    branch_id: table.branch_id,
    table_id: tableId,
    opened_by: user.userId,
    client_key: randomUUID(),
  });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  revalidatePath("/pos");
  redirect(`/pos/masa/${tableId}`);
}

const openChannelSchema = z.object({
  channel: z.enum(["takeaway", "self_service"]),
});

/** Masasız sipariş (Gel Al / Self Servis) açar; her çağrı yeni bir adisyondur. */
export async function openChannelOrder(formData: FormData) {
  const input = openChannelSchema.parse({ channel: formData.get("channel") });
  const user = await requireAppUser();
  if (!user.branchId) {
    throw new Error("Şube ataması olmayan kullanıcı sipariş açamaz.");
  }
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      tenant_id: user.tenantId,
      branch_id: user.branchId,
      channel: input.channel,
      opened_by: user.userId,
      client_key: randomUUID(),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/pos");
  redirect(`/pos/siparis/${order.id}`);
}

const addLineSchema = z.object({
  orderId: z.uuid(),
  menuItemId: z.uuid(),
  quantity: z.coerce.number().positive().max(999),
  note: z.string().trim().max(200).optional(),
  clientKey: z.uuid().optional(),
  // Yalnızca kimlikler alınır; ad ve fiyat farkı veritabanından okunur.
  modifierIds: z.array(z.uuid()).optional(),
});

export async function addOrderLine(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = addLineSchema.parse({
      orderId: formData.get("orderId"),
      menuItemId: formData.get("menuItemId"),
      quantity: formData.get("quantity") || 1,
      note: formData.get("note") || undefined,
      clientKey: formData.get("clientKey") || undefined,
      modifierIds: formData.getAll("modifierIds").length > 0
        ? formData.getAll("modifierIds")
        : undefined,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, branch_id, status")
      .eq("id", input.orderId)
      .maybeSingle();

    if (!order || order.status !== "open") {
      return { error: "Bu adisyon artık açık değil." };
    }

    const { data: menuItem } = await supabase
      .from("menu_items")
      .select("id")
      .eq("id", input.menuItemId)
      .eq("is_active", true)
      .maybeSingle();

    if (!menuItem) {
      return { error: "Bu ürün artık satışta değil." };
    }

    const { data: priceRows } = await supabase
      .from("menu_prices")
      .select("menu_item_id, price, vat_rate, branch_id, valid_from")
      .eq("menu_item_id", input.menuItemId)
      .or(`branch_id.eq.${order.branch_id},branch_id.is.null`);

    const price = currentPrices(priceRows ?? [], order.branch_id).get(input.menuItemId);

    if (!price) {
      return { error: "Bu ürünün tanımlı bir fiyatı yok." };
    }

    // Satış anındaki reçete versiyonu satırda dondurulur; stok düşümü onu kullanır.
    const { data: recipe } = await supabase
      .from("recipes")
      .select("id, recipe_versions(id, status)")
      .eq("menu_item_id", input.menuItemId)
      .maybeSingle();

    const recipeVersionId =
      recipe?.recipe_versions?.find((v) => v.status === "active")?.id ?? null;

    // Seçenekler bu ürünün gruplarından olmalı ve grup kurallarına uymalı.
    const { data: groups } = await supabase
      .from("modifier_groups")
      .select("id, name, min_select, max_select, modifiers(id, name, price_delta, is_active)")
      .eq("menu_item_id", input.menuItemId);

    const selectedIds = new Set(input.modifierIds ?? []);
    if (selectedIds.size !== (input.modifierIds?.length ?? 0)) {
      return { error: "Aynı seçenek birden fazla kez seçilemez." };
    }

    const modifiers: { name: string; price_delta: number }[] = [];
    for (const group of groups ?? []) {
      const chosen = (group.modifiers ?? []).filter((m) => m.is_active && selectedIds.has(m.id));
      if (chosen.length < group.min_select || chosen.length > group.max_select) {
        return { error: `"${group.name}" için seçim eksik ya da fazla.` };
      }
      for (const m of chosen) {
        modifiers.push({ name: m.name, price_delta: m.price_delta });
        selectedIds.delete(m.id);
      }
    }
    if (selectedIds.size > 0) {
      return { error: "Seçilen seçeneklerden biri artık geçerli değil." };
    }
    const unitTotal = price.price + modifiers.reduce((sum, m) => sum + Number(m.price_delta), 0);
    if (unitTotal < 0) {
      return { error: "Seçeneklerle birlikte ürün fiyatı sıfırın altına düşemez." };
    }

    const lineClientKey = input.clientKey ?? randomUUID();

    const { data: insertedLine, error } = await supabase
      .from("order_lines")
      .insert({
        tenant_id: user.tenantId,
        order_id: input.orderId,
        menu_item_id: input.menuItemId,
        quantity: input.quantity,
        unit_price: price.price,
        ...(price.vatRate !== null ? { vat_rate: price.vatRate } : {}),
        recipe_version_id: recipeVersionId,
        note: input.note,
        created_by: user.userId,
        client_key: lineClientKey,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      // 23505: aynı client_key ile satır zaten var, yani kuyruk aynı isteği
      // ikinci kez gönderdi. Hata dönülürse kuyruk sonsuza kadar yeniden dener.
      if (error.code === "23505") {
        revalidatePath("/pos", "layout");
        return { ok: true };
      }
      return { error: error.message };
    }

    if (modifiers.length > 0 && insertedLine) {
      const { error: modifierError } = await supabase.from("order_line_modifiers").insert(
        modifiers.map((m) => ({
          tenant_id: user.tenantId,
          order_line_id: insertedLine.id,
          name: m.name,
          price_delta: m.price_delta,
        })),
      );
      if (modifierError) {
        console.error(`Modifier eklenemedi (satır ${insertedLine.id}):`, modifierError);
      }
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/pos", "layout");
  return { ok: true };
}

const addComboSchema = z.object({
  orderId: z.uuid(),
  comboId: z.uuid(),
});

/**
 * Komboyu adisyona ekler. Kombo bileşenlerine ayrılır ve her biri sıradan bir
 * satır olur; kombo fiyatı bileşenlerin güncel fiyatlarına orantılı dağıtılır.
 */
export async function addComboToOrder(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = addComboSchema.parse({
      orderId: formData.get("orderId"),
      comboId: formData.get("comboId"),
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, branch_id, status")
      .eq("id", input.orderId)
      .maybeSingle();
    if (!order || order.status !== "open") {
      return { error: "Bu adisyon artık açık değil." };
    }

    const { data: combo } = await supabase
      .from("combos")
      .select("id, name, price, is_active, combo_items(menu_item_id, quantity, menu_items(is_active))")
      .eq("id", input.comboId)
      .maybeSingle();
    if (!combo || !combo.is_active) {
      return { error: "Bu kombo artık satılamıyor." };
    }
    const comboItems = combo.combo_items ?? [];
    if (comboItems.length === 0) {
      return { error: "Bu komboda ürün tanımlı değil." };
    }
    if (comboItems.some((item) => !item.menu_items?.is_active)) {
      return { error: "Kombodaki ürünlerden biri artık satışta değil." };
    }

    const itemIds = comboItems.map((i) => i.menu_item_id);

    const [pricesResult, recipesResult] = await Promise.all([
      supabase
        .from("menu_prices")
        .select("menu_item_id, price, vat_rate, branch_id, valid_from")
        .in("menu_item_id", itemIds)
        .or(`branch_id.eq.${order.branch_id},branch_id.is.null`),
      supabase
        .from("recipes")
        .select("menu_item_id, recipe_versions(id, status)")
        .in("menu_item_id", itemIds),
    ]);

    const priceByItem = currentPrices(pricesResult.data ?? [], order.branch_id);
    if (comboItems.some((item) => !priceByItem.has(item.menu_item_id))) {
      return { error: "Kombo bileşenlerinden birinin fiyatı tanımlı değil." };
    }

    const recipeVersionByItem = new Map<string, string | null>();
    for (const recipe of recipesResult.data ?? []) {
      if (!recipe.menu_item_id) continue;
      const active = recipe.recipe_versions?.find((v) => v.status === "active");
      recipeVersionByItem.set(recipe.menu_item_id, active?.id ?? null);
    }

    // PostgREST numeric değerleri string döndürebilir; hepsi Number() ile sarılır.
    const quantityByItem = new Map(comboItems.map((item) => [item.menu_item_id, Number(item.quantity)]));
    const weights = comboItems.map((item) =>
      money(priceByItem.get(item.menu_item_id)!.price * quantityByItem.get(item.menu_item_id)!),
    );
    const allocated = allocateProportional(money(Number(combo.price)), weights);

    const rows = comboItems.map((item, index) => {
      const vatRate = priceByItem.get(item.menu_item_id)!.vatRate;
      return {
        tenant_id: user.tenantId,
        order_id: input.orderId,
        menu_item_id: item.menu_item_id,
        quantity: quantityByItem.get(item.menu_item_id)!,
        unit_price: toLira(allocated[index]!) / quantityByItem.get(item.menu_item_id)!,
        ...(vatRate !== null ? { vat_rate: vatRate } : {}),
        recipe_version_id: recipeVersionByItem.get(item.menu_item_id) ?? null,
        note: `Kombo: ${combo.name}`,
        created_by: user.userId,
        client_key: randomUUID(),
      };
    });

    const { error } = await supabase.from("order_lines").insert(rows);
    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/pos", "layout");
  return { ok: true };
}

export async function removeOrderLine(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  // Mutfağa gönderilmiş satır silinemez; onun için ikram/iptal onayı gerekir.
  const { error } = await supabase
    .from("order_lines")
    .delete()
    .eq("id", id)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
  revalidatePath("/pos", "layout");
}

// Mutfak adım atlayamaz: sent → preparing → ready → served.
const KITCHEN_TRANSITIONS = {
  sent: "preparing",
  preparing: "ready",
  ready: "served",
} as const;

const advanceSchema = z.object({
  id: z.uuid(),
  from: z.enum(["sent", "preparing", "ready"]),
});

/** Mutfak ekranındaki bir bileti bir sonraki adıma taşır. */
export async function advanceKitchenTicket(formData: FormData) {
  const input = advanceSchema.parse({
    id: formData.get("id"),
    from: formData.get("from"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("order_lines")
    .update({ status: KITCHEN_TRANSITIONS[input.from] })
    // Aynı bileti eşzamanlı ilerleten ikinci istek 0 satır günceller.
    .eq("id", input.id)
    .eq("status", input.from);

  if (error) throw new Error(error.message);
  revalidatePath("/kds");
  revalidatePath("/pos", "layout");
  revalidatePath("/orders");
}

const requestDiscountSchema = z.object({
  orderLineId: z.uuid(),
  kind: z.enum(["comp", "percent", "amount"]),
  value: z.coerce.number().min(0).max(1_000_000),
  reason: z.string().trim().min(3).max(200),
});

/**
 * Satıra ikram/iskonto isteği açar. Müdür ve patronun isteği doğrudan onaylı
 * açılır; diğer rollerinki onay bekler. Yetki sınırı RLS'tedir.
 */
export async function requestLineDiscount(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = requestDiscountSchema.parse({
      orderLineId: formData.get("orderLineId"),
      kind: formData.get("kind"),
      value: formData.get("kind") === "comp" ? 0 : formData.get("value") || 0,
      reason: formData.get("reason"),
    });

    const user = await requireAppUser();
    const isManager = user.role === "owner" || user.role === "manager";
    const supabase = await createClient();

    const { error } = await supabase.from("line_discounts").insert({
      tenant_id: user.tenantId,
      order_line_id: input.orderLineId,
      kind: input.kind,
      value: input.kind === "comp" ? 0 : input.value,
      reason: input.reason,
      requested_by: user.userId,
      status: isManager ? "approved" : "pending",
      decided_by: isManager ? user.userId : null,
    });

    if (error) {
      if (error.code === "23505") {
        return { error: "Bu üründe zaten bekleyen bir ikram/indirim isteği var." };
      }
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/pos", "layout");
  revalidatePath("/orders");
  revalidatePath("/cash", "layout");
  revalidatePath("/approvals");
  return { ok: true };
}

const decideDiscountSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});

/** Müdür/patron bekleyen bir ikram/iskonto isteğini onaylar veya reddeder. */
export async function decideLineDiscount(formData: FormData) {
  const input = decideDiscountSchema.parse({
    id: formData.get("id"),
    decision: formData.get("decision"),
  });

  const user = await requireAppUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("line_discounts")
    .update({ status: input.decision, decided_by: user.userId })
    .eq("id", input.id)
    .eq("status", "pending");

  if (error) throw new Error(error.message);

  revalidatePath("/approvals");
  revalidatePath("/pos", "layout");
  revalidatePath("/orders");
  revalidatePath("/cash", "layout");
}

export async function sendToKitchen(formData: FormData) {
  const orderId = z.uuid().parse(formData.get("orderId"));
  const supabase = await createClient();

  const { error } = await supabase
    .from("order_lines")
    .update({ status: "sent" })
    .eq("order_id", orderId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
  revalidatePath("/pos", "layout");
  revalidatePath("/kds");
  revalidatePath("/orders");
}

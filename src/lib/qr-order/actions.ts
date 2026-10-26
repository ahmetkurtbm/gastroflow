"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { allocateProportional, money, toLira } from "@/core/money";
import { currentPrices } from "@/core/pricing";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean };

const GENERIC_ERROR = "Sipariş gönderilemedi, lütfen tekrar deneyin ya da garsona haber verin.";

// Bu uç kimlik doğrulamasız; masa başına bir zaman penceresinde kabul edilen
// satır sayısı sınırlı tutulur ki QR kodun fotoğrafını çeken biri uzaktan
// adisyonu dolduramasın.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_LINES_PER_WINDOW = 50;

const cartLineSchema = z.union([
  z.object({
    type: z.literal("item"),
    menuItemId: z.uuid(),
    quantity: z.coerce.number().int().positive().max(20),
  }),
  z.object({
    type: z.literal("combo"),
    comboId: z.uuid(),
  }),
]);

const placeOrderSchema = z.object({
  qrToken: z.uuid(),
  cart: z
    .string()
    .max(20_000)
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Sepet okunamadı." });
        return z.NEVER;
      }
    })
    .pipe(z.array(cartLineSchema).min(1, "Sepet boş.").max(50, "Sepette çok fazla satır var.")),
});

type LineDraft = {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  vat_rate?: number;
  recipe_version_id: string | null;
  note: string;
};

/**
 * QR menüden gelen sepeti adisyona yazar.
 *
 * Oturum olmadığı için service role kullanılır; güvenlik sınırı `qr_token`.
 * Kiracı, şube, fiyat ve reçete bilgisinin tamamı token'dan bulunan masadan
 * okunur, istemciden yalnızca ürün kimlikleri ve adetler alınır. Satırlar
 * `pending` açılır ve personel onaylayana kadar mutfağa gitmez.
 */
export async function placeQrOrder(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = placeOrderSchema.parse({
      qrToken: formData.get("qrToken"),
      cart: formData.get("cart"),
    });

    const supabase = createServiceRoleClient();

    const { data: table } = await supabase
      .from("tables")
      .select("id, tenant_id, branch_id, is_active")
      .eq("qr_token", input.qrToken)
      .maybeSingle();

    if (!table || !table.is_active) {
      return { error: "Bu QR kod artık geçerli değil." };
    }

    const itemLines = input.cart.filter((l) => l.type === "item");
    const comboLines = input.cart.filter((l) => l.type === "combo");

    const comboIds = [...new Set(comboLines.map((l) => l.comboId))];
    const { data: combos } = comboIds.length > 0
      ? await supabase
          .from("combos")
          .select("id, name, price, is_active, combo_items(menu_item_id, quantity)")
          .eq("tenant_id", table.tenant_id)
          .in("id", comboIds)
      : { data: [] };
    const comboById = new Map((combos ?? []).map((c) => [c.id, c]));

    const allItemIds = [
      ...new Set([
        ...itemLines.map((l) => l.menuItemId),
        ...(combos ?? []).flatMap((c) => (c.combo_items ?? []).map((i) => i.menu_item_id)),
      ]),
    ];

    const [activeItemsResult, pricesResult, recipesResult] = allItemIds.length > 0
      ? await Promise.all([
          supabase
            .from("menu_items")
            .select("id")
            .eq("tenant_id", table.tenant_id)
            .eq("is_active", true)
            .in("id", allItemIds),
          supabase
            .from("menu_prices")
            .select("menu_item_id, price, vat_rate, branch_id, valid_from")
            .eq("tenant_id", table.tenant_id)
            .in("menu_item_id", allItemIds)
            .or(`branch_id.eq.${table.branch_id},branch_id.is.null`),
          supabase
            .from("recipes")
            .select("menu_item_id, recipe_versions(id, status)")
            .eq("tenant_id", table.tenant_id)
            .in("menu_item_id", allItemIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const activeItemIds = new Set((activeItemsResult.data ?? []).map((i) => i.id));
    const priceByItem = currentPrices(pricesResult.data ?? [], table.branch_id);
    const recipeVersionByItem = new Map<string, string | null>();
    for (const recipe of recipesResult.data ?? []) {
      if (!recipe.menu_item_id) continue;
      const active = recipe.recipe_versions?.find((v) => v.status === "active");
      recipeVersionByItem.set(recipe.menu_item_id, active?.id ?? null);
    }

    const isSellable = (itemId: string) => activeItemIds.has(itemId) && priceByItem.has(itemId);
    const vatOf = (itemId: string) => {
      const vatRate = priceByItem.get(itemId)!.vatRate;
      return vatRate !== null ? { vat_rate: vatRate } : {};
    };

    const drafts: LineDraft[] = [];

    for (const line of itemLines) {
      if (!isSellable(line.menuItemId)) {
        return { error: "Sepetteki bir ürün artık satılamıyor." };
      }
      drafts.push({
        menu_item_id: line.menuItemId,
        quantity: line.quantity,
        unit_price: priceByItem.get(line.menuItemId)!.price,
        ...vatOf(line.menuItemId),
        recipe_version_id: recipeVersionByItem.get(line.menuItemId) ?? null,
        note: "QR sipariş",
      });
    }

    for (const line of comboLines) {
      const combo = comboById.get(line.comboId);
      if (!combo || !combo.is_active) {
        return { error: "Sepetteki bir kombo artık satılamıyor." };
      }
      const comboItems = combo.combo_items ?? [];
      if (comboItems.length === 0 || comboItems.some((item) => !isSellable(item.menu_item_id))) {
        return { error: "Sepetteki bir kombo artık satılamıyor." };
      }

      const quantityByItem = new Map(comboItems.map((item) => [item.menu_item_id, Number(item.quantity)]));
      const weights = comboItems.map((item) =>
        money(priceByItem.get(item.menu_item_id)!.price * quantityByItem.get(item.menu_item_id)!),
      );
      const allocated = allocateProportional(money(Number(combo.price)), weights);

      comboItems.forEach((item, index) => {
        const quantity = quantityByItem.get(item.menu_item_id)!;
        drafts.push({
          menu_item_id: item.menu_item_id,
          quantity,
          unit_price: toLira(allocated[index]!) / quantity,
          ...vatOf(item.menu_item_id),
          recipe_version_id: recipeVersionByItem.get(item.menu_item_id) ?? null,
          note: `Kombo: ${combo.name}`,
        });
      });
    }

    const orderId = await findOrOpenOrder(supabase, table);
    if (!orderId) return { error: GENERIC_ERROR };

    const { count: recentLines } = await supabase
      .from("order_lines")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .is("created_by", null)
      .gte("created_at", new Date(Date.now() - RATE_WINDOW_MS).toISOString());

    if ((recentLines ?? 0) + drafts.length > MAX_LINES_PER_WINDOW) {
      return { error: "Bu masadan kısa sürede çok fazla sipariş geldi. Lütfen garsona haber verin." };
    }

    const { error } = await supabase.from("order_lines").insert(
      drafts.map((draft) => ({
        ...draft,
        tenant_id: table.tenant_id,
        order_id: orderId,
        client_key: randomUUID(),
      })),
    );
    if (error) {
      console.error("QR sipariş satırları yazılamadı:", error);
      return { error: GENERIC_ERROR };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Sepet geçersiz." };
    }
    console.error("QR sipariş hatası:", error);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/pos", "layout");
  return { ok: true };
}

/** Masadaki açık adisyonu döndürür; yoksa açar. Aynı masa tek hesaptır. */
async function findOrOpenOrder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  table: { id: string; tenant_id: string; branch_id: string },
): Promise<string | null> {
  const findOpen = async () => {
    const { data } = await supabase
      .from("orders")
      .select("id")
      .eq("table_id", table.id)
      .eq("status", "open")
      .maybeSingle();
    return data?.id ?? null;
  };

  const existing = await findOpen();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("orders")
    .insert({
      tenant_id: table.tenant_id,
      branch_id: table.branch_id,
      table_id: table.id,
      client_key: randomUUID(),
    })
    .select("id")
    .single();

  if (!error) return created.id;
  // 23505: aynı anda başka bir müşteri adisyonu açtı; onunkini kullan.
  if (error.code === "23505") return findOpen();
  console.error("QR adisyon açılamadı:", error);
  return null;
}

"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { allocateProportional, money, toLira } from "@/core/money";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean };

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Sepet geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

// Personelin tablet POS'unda `addOrderLine`/`addComboToOrder`'ın tersine,
// burada bir defada BİRDEN FAZLA satır tek istekte gönderiliyor — müşteri
// önce sepetini dolduruyor, sonra tek "Siparişi gönder" dokunuşuyla hepsini
// yolluyor. Miktar üst sınırı personel ekranındakinden (999) düşük (20) —
// bu, kimlik doğrulaması olmayan bir uçtan gelen anormal büyüklükte bir
// siparişin (ör. otomatik bir bot) etkisini sınırlamak için kasıtlı.
const cartLineSchema = z.union([
  z.object({
    type: z.literal("item"),
    menuItemId: z.uuid(),
    quantity: z.coerce.number().positive().max(20),
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

/**
 * QR menüden gelen sepeti adisyona yazar.
 *
 * Kimliği doğrulanmamış bir uçtan çağrılıyor — bu yüzden `requireAppUser()`
 * YOK, `createServiceRoleClient()` (RLS bypass) VAR. Güvenlik sınırı tamamen
 * burada: `qr_token` geçerli ve masa aktif olmalı; tenant/branch/fiyat/reçete
 * bilgisinin TAMAMI bu fonksiyon içinde, token üzerinden bulunan masadan
 * okunuyor — istemciden gelen HİÇBİR kimlik alanı (tenant, branch, fiyat)
 * kabul edilmiyor.
 *
 * Satırlar `pending` durumunda açılır — `addOrderLine`'daki gibi mutfağa
 * doğrudan gitmez. Personel POS ekranında (bkz. `/pos/masa/[tableId]`)
 * sepeti görüp "Mutfağa gönder"e basana kadar bekler; bu, müşterinin yanlış
 * dokunuşla mutfağı meşgul etmesini engelleyen kasıtlı bir sürtünme.
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

    // Aynı masada tek açık adisyon kuralı `openTable`'daki gibi burada da
    // geçerli — masada personelin açtığı bir adisyon varsa müşterinin
    // sepeti ONA eklenir (aynı masa = aynı hesap).
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("table_id", table.id)
      .eq("status", "open")
      .maybeSingle();

    let orderId = existingOrder?.id ?? null;
    if (!orderId) {
      const { data: created, error: createError } = await supabase
        .from("orders")
        .insert({
          tenant_id: table.tenant_id,
          branch_id: table.branch_id,
          table_id: table.id,
          client_key: randomUUID(),
        })
        .select("id")
        .single();

      if (createError) {
        // 23505 = unique_violation → iki müşteri aynı anda ilk siparişi
        // gönderdi, biri kazandı. Kaybedeni hataya düşürmek yerine az önce
        // oluşan adisyonu buluyoruz.
        if (createError.code === "23505") {
          const { data: raceWinner } = await supabase
            .from("orders")
            .select("id")
            .eq("table_id", table.id)
            .eq("status", "open")
            .maybeSingle();
          orderId = raceWinner?.id ?? null;
        }
        if (!orderId) return { error: createError.message };
      } else {
        orderId = created.id;
      }
    }

    if (!orderId) {
      return { error: "Adisyon oluşturulamadı, tekrar deneyin." };
    }

    const itemLines = input.cart.filter((l) => l.type === "item");
    const comboLines = input.cart.filter((l) => l.type === "combo");

    const rows: {
      tenant_id: string;
      order_id: string;
      menu_item_id: string;
      quantity: number;
      unit_price: number;
      recipe_version_id: string | null;
      note: string | null;
      client_key: string;
    }[] = [];

    if (itemLines.length > 0) {
      const itemIds = [...new Set(itemLines.map((l) => l.menuItemId))];
      const [pricesResult, recipesResult] = await Promise.all([
        supabase
          .from("menu_prices")
          .select("menu_item_id, price, branch_id, valid_from")
          .eq("tenant_id", table.tenant_id)
          .in("menu_item_id", itemIds)
          .or(`branch_id.eq.${table.branch_id},branch_id.is.null`)
          .order("valid_from", { ascending: false }),
        supabase
          .from("recipes")
          .select("menu_item_id, recipe_versions(id, status)")
          .eq("tenant_id", table.tenant_id)
          .in("menu_item_id", itemIds),
      ]);

      const priceByItem = new Map<string, number>();
      for (const row of pricesResult.data ?? []) {
        if (row.branch_id === table.branch_id) {
          priceByItem.set(row.menu_item_id, Number(row.price));
        } else if (!priceByItem.has(row.menu_item_id)) {
          priceByItem.set(row.menu_item_id, Number(row.price));
        }
      }

      const recipeVersionByItem = new Map<string, string | null>();
      for (const recipe of recipesResult.data ?? []) {
        if (!recipe.menu_item_id) continue;
        const active = recipe.recipe_versions?.find((v) => v.status === "active");
        recipeVersionByItem.set(recipe.menu_item_id, active?.id ?? null);
      }

      for (const line of itemLines) {
        const price = priceByItem.get(line.menuItemId);
        // Fiyatsız (satılamaz) bir ürün sepete asla giremezdi (QR menü onu
        // hiç göstermiyor), ama sepet JSON'u istemci tarafında üretiliyor —
        // biri isterse elle uydurma bir menuItemId gönderebilir. Sessizce
        // atlamak yerine tüm gönderimi reddediyoruz.
        if (price === undefined) {
          return { error: "Sepetteki bir ürün artık satılamıyor." };
        }
        rows.push({
          tenant_id: table.tenant_id,
          order_id: orderId,
          menu_item_id: line.menuItemId,
          quantity: line.quantity,
          unit_price: price,
          recipe_version_id: recipeVersionByItem.get(line.menuItemId) ?? null,
          note: "QR sipariş",
          client_key: randomUUID(),
        });
      }
    }

    if (comboLines.length > 0) {
      const comboIds = [...new Set(comboLines.map((l) => l.comboId))];
      const { data: combos } = await supabase
        .from("combos")
        .select("id, name, price, is_active, combo_items(menu_item_id, quantity)")
        .eq("tenant_id", table.tenant_id)
        .in("id", comboIds);

      const comboById = new Map((combos ?? []).map((c) => [c.id, c]));
      const allComboItemIds = [
        ...new Set((combos ?? []).flatMap((c) => (c.combo_items ?? []).map((i) => i.menu_item_id))),
      ];

      const [pricesResult, recipesResult] = await Promise.all([
        allComboItemIds.length > 0
          ? supabase
              .from("menu_prices")
              .select("menu_item_id, price, branch_id, valid_from")
              .eq("tenant_id", table.tenant_id)
              .in("menu_item_id", allComboItemIds)
              .or(`branch_id.eq.${table.branch_id},branch_id.is.null`)
              .order("valid_from", { ascending: false })
          : Promise.resolve({ data: [] }),
        allComboItemIds.length > 0
          ? supabase
              .from("recipes")
              .select("menu_item_id, recipe_versions(id, status)")
              .eq("tenant_id", table.tenant_id)
              .in("menu_item_id", allComboItemIds)
          : Promise.resolve({ data: [] }),
      ]);

      const priceByItem = new Map<string, number>();
      for (const row of pricesResult.data ?? []) {
        if (row.branch_id === table.branch_id) {
          priceByItem.set(row.menu_item_id, Number(row.price));
        } else if (!priceByItem.has(row.menu_item_id)) {
          priceByItem.set(row.menu_item_id, Number(row.price));
        }
      }
      const recipeVersionByItem = new Map<string, string | null>();
      for (const recipe of recipesResult.data ?? []) {
        if (!recipe.menu_item_id) continue;
        const active = recipe.recipe_versions?.find((v) => v.status === "active");
        recipeVersionByItem.set(recipe.menu_item_id, active?.id ?? null);
      }

      for (const line of comboLines) {
        const combo = comboById.get(line.comboId);
        if (!combo || !combo.is_active) {
          return { error: "Sepetteki bir kombo artık satılamıyor." };
        }
        const comboItems = combo.combo_items ?? [];
        if (comboItems.some((item) => !priceByItem.has(item.menu_item_id))) {
          return { error: "Kombo bileşenlerinden birinin fiyatı tanımlı değil." };
        }

        const quantityByItem = new Map(comboItems.map((item) => [item.menu_item_id, Number(item.quantity)]));
        const weights = comboItems.map((item) =>
          money(priceByItem.get(item.menu_item_id)! * quantityByItem.get(item.menu_item_id)!),
        );
        const allocated = allocateProportional(money(Number(combo.price)), weights);

        comboItems.forEach((item, index) => {
          const quantity = quantityByItem.get(item.menu_item_id)!;
          rows.push({
            tenant_id: table.tenant_id,
            order_id: orderId!,
            menu_item_id: item.menu_item_id,
            quantity,
            unit_price: toLira(allocated[index]!) / quantity,
            recipe_version_id: recipeVersionByItem.get(item.menu_item_id) ?? null,
            note: `Kombo: ${combo.name}`,
            client_key: randomUUID(),
          });
        });
      }
    }

    const { error } = await supabase.from("order_lines").insert(rows);
    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/pos", "layout");
  return { ok: true };
}

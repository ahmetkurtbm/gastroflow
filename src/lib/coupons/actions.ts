"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { compare, money, multiply, toLira } from "@/core/money";
import { requireAppUser } from "@/lib/auth/current-user";
import { loadOrderForPayment } from "@/lib/cash/queries";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean };

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

// -----------------------------------------------------------------------------
// Kupon yönetimi (Ayarlar → Kuponlar)
// -----------------------------------------------------------------------------

const createCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,30}$/, "Kod yalnızca büyük harf ve rakam içermeli"),
  kind: z.enum(["percent", "amount"]),
  value: z.coerce.number().positive("Sıfırdan büyük olmalı"),
  maxUses: z.coerce.number().int().positive().optional(),
  validUntil: z.string().optional(),
});

export async function createCoupon(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = createCouponSchema.parse({
      code: formData.get("code"),
      kind: formData.get("kind"),
      value: formData.get("value"),
      maxUses: formData.get("maxUses") || undefined,
      validUntil: formData.get("validUntil") || undefined,
    });
    if (input.kind === "percent" && input.value > 100) {
      return { error: "Yüzde indirim 100'den büyük olamaz." };
    }

    const user = await requireAppUser();
    const supabase = await createClient();

    const { error } = await supabase.from("coupons").insert({
      tenant_id: user.tenantId,
      code: input.code,
      kind: input.kind,
      value: input.value,
      max_uses: input.maxUses ?? null,
      valid_until: input.validUntil ? new Date(input.validUntil).toISOString() : null,
    });

    if (error) {
      if (error.code === "23505") return { error: "Bu kod zaten kullanılıyor." };
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/settings/kuponlar");
  return { ok: true };
}

export async function toggleCouponActive(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  const supabase = await createClient();

  const { error } = await supabase.from("coupons").update({ is_active: !isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/kuponlar");
}

export async function deleteCoupon(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  const { error } = await supabase.from("coupons").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings/kuponlar");
}

// -----------------------------------------------------------------------------
// Ödeme ekranında kupon uygulama
// -----------------------------------------------------------------------------

const applyCouponSchema = z.object({
  orderId: z.uuid(),
  code: z.string().trim().min(1).max(30),
});

/**
 * Ödeme ekranında girilen kodu adisyona uygular.
 *
 * İndirim tutarı BURADA, uygulama anındaki toplam üzerinden hesaplanıp
 * `coupon_redemptions.discount_amount`'a DONDURULUYOR — kuponun değeri daha
 * sonra değişse (ör. müdür yüzdeyi düzenlese) bile geçmiş bir ödemenin
 * tutarı geriye dönük değişmez. Aynı `unit_price` dondurma prensibi
 * (`addOrderLine`, migration 0012'deki kombo notu).
 *
 * `unique (order_id)` kısıtı (migration 0015) bir adisyona en fazla bir
 * kupon uygulanmasını veritabanı seviyesinde garanti ediyor — burada ayrıca
 * "zaten var mı" kontrolü YOK, 23505'i anlaşılır bir hataya çeviriyoruz.
 */
export async function applyCouponToOrder(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = applyCouponSchema.parse({
      orderId: formData.get("orderId"),
      code: formData.get("code"),
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", input.orderId)
      .maybeSingle();
    if (!order || order.status !== "open") {
      return { error: "Bu adisyon artık açık değil." };
    }

    const code = input.code.toUpperCase();
    const { data: coupon } = await supabase
      .from("coupons")
      .select("id, kind, value, is_active, max_uses, valid_until")
      .eq("code", code)
      .maybeSingle();
    if (!coupon || !coupon.is_active) {
      return { error: "Kupon kodu geçersiz." };
    }
    if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
      return { error: "Kuponun süresi dolmuş." };
    }
    if (coupon.max_uses !== null) {
      const { count } = await supabase
        .from("coupon_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("coupon_id", coupon.id);
      if ((count ?? 0) >= coupon.max_uses) {
        return { error: "Kupon kullanım limitine ulaştı." };
      }
    }

    const paymentInfo = await loadOrderForPayment(input.orderId);
    if (!paymentInfo) return { error: "Adisyon bulunamadı." };

    const rawDiscount =
      coupon.kind === "percent"
        ? multiply(paymentInfo.total, Number(coupon.value) / 100)
        : money(Number(coupon.value));
    // Kupon, faturanın toplamından fazla indirim yapamaz — "borç" negatif
    // bakiyeye dönüşmesin.
    const discount = compare(rawDiscount, paymentInfo.total) > 0 ? paymentInfo.total : rawDiscount;

    const { error } = await supabase.from("coupon_redemptions").insert({
      tenant_id: user.tenantId,
      coupon_id: coupon.id,
      order_id: input.orderId,
      discount_amount: toLira(discount),
      redeemed_by: user.userId,
    });

    if (error) {
      if (error.code === "23505") return { error: "Bu adisyona zaten bir kupon uygulanmış." };
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/cash", "layout");
  return { ok: true };
}

/** Ödeme tamamlanmadan önce yanlış girilen kupon kaldırılabilir. */
export async function removeCouponFromOrder(formData: FormData) {
  const orderId = z.uuid().parse(formData.get("orderId"));
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "open") {
    throw new Error("Bu adisyon artık açık değil.");
  }

  const { error } = await supabase.from("coupon_redemptions").delete().eq("order_id", orderId);
  if (error) throw new Error(error.message);

  revalidatePath("/cash", "layout");
}

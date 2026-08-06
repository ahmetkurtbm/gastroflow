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

// 1 puan = 1 TL değerinde kullanılır (bkz. `src/lib/cash/queries.ts`'teki
// aynı sabit); her 10 TL'lik ödeme 1 puan kazandırır (küsurat aşağı
// yuvarlanır). Portfolyo ölçeğinde sabit bir oran yeterli — tenant başına
// ayarlanabilir bir oran Faz 8'in (çok işletme ayarları) işi.
const POINTS_PER_LIRA_SPENT = 1 / 10;

const attachSchema = z.object({
  orderId: z.uuid(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+][0-9 ]{6,19}$/, "Telefon numarası geçersiz"),
  name: z.string().trim().max(80).optional(),
});

/**
 * Adisyona bir müşteri bağlar — telefon numarasıyla bulur, yoksa oluşturur.
 *
 * Tekrar çağrılırsa (kasiyer yanlış numara girip düzeltirse) `orders.customer_id`
 * sessizce ÜZERİNE YAZILIR — henüz puan kullanılmadıysa bunun bir sakıncası
 * yok. Puan kullanıldıktan sonra müşteri değiştirmek anlamlı değil zaten
 * (o puanlar ilk müşterinin adına ledger'a yazıldı), bu yüzden ayrıca
 * engellenmiyor — kasiyer akışında bu sıra zaten doğal olarak gelmiyor.
 */
export async function attachCustomerToOrder(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = attachSchema.parse({
      orderId: formData.get("orderId"),
      phone: formData.get("phone"),
      name: formData.get("name") || undefined,
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

    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", input.phone)
      .maybeSingle();

    let customerId = existing?.id ?? null;
    if (!customerId) {
      const { data: created, error: createError } = await supabase
        .from("customers")
        .insert({ tenant_id: user.tenantId, phone: input.phone, name: input.name ?? null })
        .select("id")
        .single();
      if (createError) {
        if (createError.code === "23505") {
          // Yarış: iki kasiyer aynı yeni numarayı aynı anda kaydetti.
          const { data: raceWinner } = await supabase
            .from("customers")
            .select("id")
            .eq("phone", input.phone)
            .maybeSingle();
          customerId = raceWinner?.id ?? null;
        }
        if (!customerId) return { error: createError.message };
      } else {
        customerId = created.id;
      }
    }

    const { error } = await supabase
      .from("orders")
      .update({ customer_id: customerId })
      .eq("id", input.orderId);
    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/cash", "layout");
  return { ok: true };
}

const redeemSchema = z.object({
  orderId: z.uuid(),
  points: z.coerce.number().int().positive("Sıfırdan büyük olmalı"),
});

/**
 * Adisyona bağlı müşterinin puanını harcayıp faturaya indirim olarak yazar.
 *
 * Bakiye kontrolü ile puan düşme kaydı arasında TEORİK bir yarış var (iki eş
 * zamanlı istek aynı bakiyeyi görüp ikisi de yeterli sanabilir) — kasiyer
 * tarafından, düşük hacimli bir işlem olduğu için (bkz. aynı kabul
 * `recordPayment`'taki "iki ödeme isteği yarışıp" notu) burada da kabul
 * edilebilir bir risk.
 */
export async function redeemPointsForOrder(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = redeemSchema.parse({
      orderId: formData.get("orderId"),
      points: formData.get("points"),
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, status, customer_id")
      .eq("id", input.orderId)
      .maybeSingle();
    if (!order || order.status !== "open") {
      return { error: "Bu adisyon artık açık değil." };
    }
    if (!order.customer_id) {
      return { error: "Önce bir müşteri bağla." };
    }

    const { data: existingRedemption } = await supabase
      .from("loyalty_transactions")
      .select("id")
      .eq("order_id", input.orderId)
      .eq("kind", "redeem")
      .maybeSingle();
    if (existingRedemption) {
      return { error: "Bu adisyonda zaten puan kullanılmış." };
    }

    const { data: balanceRow } = await supabase
      .from("v_customer_points")
      .select("balance")
      .eq("customer_id", order.customer_id)
      .maybeSingle();
    const balance = balanceRow?.balance ?? 0;
    if (input.points > balance) {
      return { error: `Yetersiz bakiye — müşteride ${balance} puan var.` };
    }

    const { error } = await supabase.from("loyalty_transactions").insert({
      tenant_id: user.tenantId,
      customer_id: order.customer_id,
      order_id: input.orderId,
      kind: "redeem",
      points_delta: -input.points,
      created_by: user.userId,
    });
    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/cash", "layout");
  return { ok: true };
}

/** Ödemenin gerçekleştiği miktara göre puan kazandırır — `recordPayment` bir adisyon tam ödenince çağırır. */
export async function earnPointsForOrder(params: {
  tenantId: string;
  orderId: string;
  customerId: string;
  paidLira: number;
  userId: string;
}): Promise<void> {
  const points = Math.floor(params.paidLira * POINTS_PER_LIRA_SPENT);
  if (points <= 0) return;

  const supabase = await createClient();
  const { error } = await supabase.from("loyalty_transactions").insert({
    tenant_id: params.tenantId,
    customer_id: params.customerId,
    order_id: params.orderId,
    kind: "earn",
    points_delta: points,
    created_by: params.userId,
  });
  if (error) throw new Error(error.message);
}

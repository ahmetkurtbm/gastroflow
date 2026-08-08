"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { compare, isZero, toLira } from "@/core/money";
import { requireAppUser } from "@/lib/auth/current-user";
import { loadOrderForPayment } from "@/lib/cash/queries";
import { depleteOrderStock } from "@/lib/inventory/depletion";
import { fiscalDeviceAdapter } from "@/lib/integrations";
import { earnPointsForOrder } from "@/lib/loyalty/actions";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean };

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

const paymentSchema = z.object({
  orderId: z.uuid(),
  method: z.enum(["cash", "card", "meal_card", "on_account"]),
  amount: z.coerce.number().positive("Tutar sıfırdan büyük olmalı"),
  closeAfterPayment: z.enum(["true", "false"]).optional(),
});

/**
 * Bir adisyonu fiilen kapatır: durumu günceller, sonra stok düşümü/ÖKC
 * fişi/sadakat puanı gibi YAN ETKİLERİ best-effort dener. `recordPayment`
 * (kasiyer "ödeme sonrası kapat"ı işaretlediyse) ve `closeOrder` (masa
 * önceden ödenmiş, müşteri kalkınca elle kapatılıyor) İKİSİ de bunu çağırır
 * — kapanış NASIL tetiklendiyse tetiklensin aynı tamamlama mantığı çalışsın
 * diye tek yerde.
 */
async function finalizeOrderClose(params: {
  orderId: string;
  tenantId: string;
  userId: string;
  customerId: string | null;
  totalLira: number;
  orderNo: number | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<void> {
  const { orderId, tenantId, userId, customerId, totalLira, orderNo, supabase } = params;

  const { error: closeError } = await supabase
    .from("orders")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "open");
  if (closeError) return; // Zaten kapalıysa (yarış) sessizce çık — idempotent.

  // Üçü de best-effort YAN ETKİ: biri başarısız olsa bile adisyon zaten
  // kapandı, kasiyeriyi/müşteriyi burada bekletmiyoruz, yalnızca günlüğe
  // düşüyor. `depleteOrderStock`'un kendi idempotency kısıtı (bkz. migration
  // 0010) aynı adisyonun iki kez kapanmaya çalışmasını da güvenli kılıyor.
  try {
    await depleteOrderStock(orderId);
  } catch (depletionError) {
    console.error(`Stok düşümü başarısız (adisyon ${orderId}):`, depletionError);
  }
  try {
    await fiscalDeviceAdapter.printReceipt({ orderId, orderNo, totalAmount: totalLira });
  } catch (fiscalError) {
    console.error(`ÖKC fişi kesilemedi (adisyon ${orderId}):`, fiscalError);
  }
  if (customerId) {
    try {
      await earnPointsForOrder({ tenantId, orderId, customerId, paidLira: totalLira, userId });
    } catch (loyaltyError) {
      console.error(`Puan kazandırılamadı (adisyon ${orderId}):`, loyaltyError);
    }
  }
}

/**
 * Ödeme kaydeder.
 *
 * ESKİDEN toplam ödenen tutar adisyon tutarına ulaşınca adisyon OTOMATİK
 * kapanıyordu — bu, "masaya önden öde, sonra da otur/sipariş vermeye devam
 * et" modelini kırıyordu: adisyon kapanınca masa "boş" görünüyor, aslında
 * müşteri hâlâ oturuyor. Şimdi varsayılan davranış kapatmamak; kasiyer
 * müşteri gerçekten kalkınca `closeOrder`'ı ayrıca çağırıyor. Klasik
 * "masa sonda öder" akışı için kolaylık kaybolmasın diye kasiyer ödeme
 * formunda "Ödeme sonrası masayı kapat"ı işaretleyebiliyor —
 * `closeAfterPayment` o zaman "true" geliyor ve eski davranış (tam ödenince
 * anında kapanış) opt-in olarak çalışıyor.
 */
export async function recordPayment(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = paymentSchema.parse({
      orderId: formData.get("orderId"),
      method: formData.get("method"),
      amount: formData.get("amount"),
      closeAfterPayment: formData.get("closeAfterPayment") || undefined,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, status, branch_id, customer_id")
      .eq("id", input.orderId)
      .maybeSingle();

    if (!order || order.status !== "open") {
      return { error: "Bu adisyon artık açık değil." };
    }

    // Her ödeme açık bir kasa oturumuna bağlanmak ZORUNDA — aksi hâlde gün
    // sonu kapanışında "bu vardiyada ne kadar nakit girdi" sorusunun cevabı
    // zaman aralığı tahminine kalırdı (bkz. migration 0012).
    const { data: session } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("branch_id", order.branch_id)
      .eq("status", "open")
      .maybeSingle();

    if (!session) {
      return { error: "Önce kasa oturumu (vardiya) açmalısın." };
    }

    const { error } = await supabase.from("payments").insert({
      tenant_id: user.tenantId,
      order_id: input.orderId,
      method: input.method,
      amount: input.amount,
      received_by: user.userId,
      cash_session_id: session.id,
      client_key: randomUUID(),
    });

    if (error) return { error: error.message };

    if (input.closeAfterPayment === "true") {
      const updated = await loadOrderForPayment(input.orderId);
      if (updated && compare(updated.paid, updated.total) >= 0) {
        await finalizeOrderClose({
          orderId: input.orderId,
          tenantId: user.tenantId,
          userId: user.userId,
          customerId: order.customer_id,
          totalLira: toLira(updated.total),
          orderNo: updated.orderNo,
          supabase,
        });
      }
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/cash", "layout");
  revalidatePath("/pos", "layout");
  return { ok: true };
}

/**
 * Bir adisyonu elle kapatır — iki durumda kullanılabilir: (1) tutar zaten
 * sıfır (tamamı ikram/kupon/puanla karşılanmış, `recordPayment`den hiç
 * geçemez çünkü `amount` sıfırdan büyük olmak zorunda), (2) tam ödenmiş ama
 * kasiyer "ödeme sonrası kapat"ı işaretlemediği için açık kalmış (masa
 * önceden ödenip müşteri hâlâ oturuyorken kullanılan asıl senaryo — müşteri
 * kalkınca kasiyer burada kapatır).
 *
 * İkisinde de kontrol AYNI: sunucunun kendi hesapladığı `remaining` sıfır
 * olmalı — kasiyerin "zaten ödendi" beyanına güvenilmiyor.
 */
export async function closeOrder(formData: FormData): Promise<void> {
  const orderId = z.uuid().parse(formData.get("orderId"));
  const user = await requireAppUser();
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("customer_id")
    .eq("id", orderId)
    .maybeSingle();

  const updated = await loadOrderForPayment(orderId);
  if (!updated || updated.status !== "open") return;
  if (!isZero(updated.remaining)) {
    throw new Error("Bu adisyonda ödenmemiş bir bakiye var, önce ödeme alınmalı.");
  }

  await finalizeOrderClose({
    orderId,
    tenantId: user.tenantId,
    userId: user.userId,
    customerId: order?.customer_id ?? null,
    totalLira: toLira(updated.total),
    orderNo: updated.orderNo,
    supabase,
  });

  revalidatePath("/cash", "layout");
  revalidatePath("/pos", "layout");
}

const openSessionSchema = z.object({
  openingFloat: z.coerce.number().min(0).max(1_000_000),
});

/** Kasa oturumu (vardiya) açar. Şube başına tek açık oturum kısıtı DB'de. */
export async function openCashSession(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = openSessionSchema.parse({
      openingFloat: formData.get("openingFloat") || 0,
    });

    const user = await requireAppUser();
    if (!user.branchId) {
      return { error: "Şube ataması olmayan kullanıcı kasa oturumu açamaz." };
    }
    const supabase = await createClient();

    const { error } = await supabase.from("cash_sessions").insert({
      tenant_id: user.tenantId,
      branch_id: user.branchId,
      opening_float: input.openingFloat,
      opened_by: user.userId,
    });

    if (error) {
      // 23505 = unique_violation → bu şubede zaten açık bir oturum var
      // (bkz. `cash_sessions_one_open_per_branch`).
      if (error.code === "23505") {
        return { error: "Zaten açık bir kasa oturumu var." };
      }
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/cash", "layout");
  return { ok: true };
}

const closeSessionSchema = z.object({
  sessionId: z.uuid(),
  countedCash: z.coerce.number().min(0).max(10_000_000),
  note: z.string().trim().max(300).optional(),
});

/** Kasa oturumunu kapatır — sayılan nakit girilir, fark raporu buradan hesaplanır. */
export async function closeCashSession(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = closeSessionSchema.parse({
      sessionId: formData.get("sessionId"),
      countedCash: formData.get("countedCash") || 0,
      note: formData.get("note") || undefined,
    });

    const user = await requireAppUser();
    const supabase = await createClient();

    const { error } = await supabase
      .from("cash_sessions")
      .update({
        status: "closed",
        counted_cash: input.countedCash,
        closed_by: user.userId,
        note: input.note,
      })
      .eq("id", input.sessionId)
      .eq("status", "open");

    if (error) return { error: error.message };
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/cash", "layout");
  return { ok: true };
}

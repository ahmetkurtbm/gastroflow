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
 * Adisyonu kapatır, ardından stok düşümü, ÖKC fişi ve sadakat puanını
 * best-effort dener. `recordPayment` ve `closeOrder` ikisi de bunu kullanır.
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

  // Yan etkiler best-effort: adisyon zaten kapandı, hatalar yalnızca loglanır.
  // Stok düşümünün idempotency kısıtı çift kapanışa karşı korur.
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
 * Ödeme kaydeder. Varsayılan olarak adisyonu kapatmaz (önden ödeyip oturmaya
 * devam eden masa için); `closeAfterPayment` işaretliyse tam ödenince kapatır.
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

    // Her ödeme açık bir kasa oturumuna bağlanır; gün sonu nakit hesabı buna dayanır.
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
 * Adisyonu elle kapatır: tutarı sıfır olan ya da tam ödenip açık kalan masa
 * için. Kalan tutar sunucuda hesaplanır ve sıfır olmalıdır.
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

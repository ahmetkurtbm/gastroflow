"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { compare, toLira } from "@/core/money";
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
});

/**
 * Ödeme kaydeder. Toplam ödenen tutar adisyon tutarına ulaşınca (ya da
 * geçince) adisyonu otomatik kapatır.
 *
 * Bu iki adım (ödeme ekleme + kapanış kontrolü) tek bir veritabanı işlemi
 * DEĞİL — PostgREST üzerinden çok adımlı işlem yazmak bu ölçekte gereksiz
 * karmaşıklık. Sakınca yok: kapanış kontrolü idempotent (zaten kapalı bir
 * adisyonu "kapat" demek zararsız) ve ödeme kaydı zaten tamamlanmış oluyor —
 * en kötü ihtimalle adisyon bir sonraki sayfa yüklemesinde kapanır.
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

    const updated = await loadOrderForPayment(input.orderId);
    if (updated && compare(updated.paid, updated.total) >= 0) {
      const { error: closeError } = await supabase
        .from("orders")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", input.orderId)
        .eq("status", "open");

      // İki ödeme isteği yarışıp ikisi de "tam ödendi" görse ve ikisi de
      // depletion'ı tetiklese bile sorun değil: stok_movements'taki
      // (reference_type, reference_id, ürün) unique kısıtı ikinci denemeyi
      // sessizce atlıyor (bkz. depleteOrderStock). Satır sayısına göre
      // gate'lemeye gerek yok — idempotency zaten alt katmanda garantili.
      //
      // Hata YUTULUYOR, ödeme başarısızlığına dönüştürülmüyor: ödeme zaten
      // kaydedildi ve adisyon zaten kapandı — kasiyerin ekranında "ödeme
      // başarısız" görünmesi burada gerçekleşmedi. Stok düşümü bir YAN ETKİ;
      // başarısız olursa (ör. service_role henüz yapılandırılmadıysa) gerçek
      // bir hata olarak günlüğe düşer ama müşteriyi kasada bekletmez.
      if (!closeError) {
        try {
          await depleteOrderStock(input.orderId);
        } catch (depletionError) {
          console.error(
            `Stok düşümü başarısız (adisyon ${input.orderId}):`,
            depletionError,
          );
        }

        // ÖKC fişi de aynı desende bir YAN ETKİ: gerçek cihaz bağlanana
        // kadar mock adaptör yalnızca günlüğe yazıyor (bkz.
        // src/lib/integrations). Başarısız olsa bile ödemeyi geri almıyoruz.
        try {
          await fiscalDeviceAdapter.printReceipt({
            orderId: input.orderId,
            orderNo: updated.orderNo,
            totalAmount: toLira(updated.total),
          });
        } catch (fiscalError) {
          console.error(`ÖKC fişi kesilemedi (adisyon ${input.orderId}):`, fiscalError);
        }

        // Sadakat puanı da aynı desende bir YAN ETKİ — kazanamamak ödemeyi
        // geri almaz, yalnızca günlüğe düşer.
        if (order.customer_id) {
          try {
            await earnPointsForOrder({
              tenantId: user.tenantId,
              orderId: input.orderId,
              customerId: order.customer_id,
              paidLira: toLira(updated.total),
              userId: user.userId,
            });
          } catch (loyaltyError) {
            console.error(`Puan kazandırılamadı (adisyon ${input.orderId}):`, loyaltyError);
          }
        }
      }
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/cash", "layout");
  revalidatePath("/pos", "layout");
  return { ok: true };
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

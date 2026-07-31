"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { compare } from "@/core/money";
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
      .select("id, status")
      .eq("id", input.orderId)
      .maybeSingle();

    if (!order || order.status !== "open") {
      return { error: "Bu adisyon artık açık değil." };
    }

    const { error } = await supabase.from("payments").insert({
      tenant_id: user.tenantId,
      order_id: input.orderId,
      method: input.method,
      amount: input.amount,
      received_by: user.userId,
      client_key: randomUUID(),
    });

    if (error) return { error: error.message };

    const updated = await loadOrderForPayment(input.orderId);
    if (updated && compare(updated.paid, updated.total) >= 0) {
      await supabase
        .from("orders")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", input.orderId)
        .eq("status", "open");
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/cash", "layout");
  revalidatePath("/pos", "layout");
  return { ok: true };
}

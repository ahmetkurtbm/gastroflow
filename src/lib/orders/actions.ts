"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Sipariş yazma işlemleri.
 *
 * `addOrderLine` ve `sendToKitchen`, hem normal (çevrimiçi form) çağrısında
 * hem de `src/lib/offline` kuyruğu tarafından yeniden denemede kullanılıyor.
 * `client_key`, çift gönderime karşı tek koruma: kuyruk tarafı üretip
 * gönderiyorsa onu, yoksa sunucu kendisi üretiyor. Bkz. migration 0008'deki
 * `(order_id, client_key)` unique kısıtı.
 */

export type ActionState = { error?: string; ok?: boolean };

function fail(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

/**
 * Bir masaya yeni adisyon açar ve sipariş ekranına yönlendirir.
 *
 * "Aynı masada tek açık adisyon" kuralı veritabanı kısıtında (bkz. migration
 * 0008, `orders_one_open_per_table`). Burada tekrar kontrol ETMİYORUZ —
 * iki garson aynı masayı aynı anda açmaya çalışırsa ikincisi kısıttan döner,
 * biz onu 42501/23505 diye ayırt etmeden anlaşılır mesaja çeviriyoruz.
 */
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

const addLineSchema = z.object({
  orderId: z.uuid(),
  menuItemId: z.uuid(),
  quantity: z.coerce.number().positive().max(999),
  note: z.string().trim().max(200).optional(),
  // Offline kuyruğu bu anahtarı kendisi üretip gönderir; sağlanmazsa (normal
  // çevrimiçi form gönderimi) sunucu üretir. Anahtarı istemcinin üretmesinin
  // sebebi: bağlantı kesilip yeniden denendiğinde AYNI mutasyonun iki kez
  // kayıt açmaması. Sunucu her denemede yeni anahtar üretseydi, kaç kez
  // denendiği kadar satır oluşurdu.
  clientKey: z.uuid().optional(),
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

    // Fiyatı SATIR ANINDA dondurmak için güncel fiyatı burada okuyoruz.
    // Şubeye özel fiyat varsa o, yoksa genel fiyat (branch_id IS NULL) geçerli.
    const { data: prices } = await supabase
      .from("menu_prices")
      .select("price, vat_rate, branch_id, valid_from")
      .eq("menu_item_id", input.menuItemId)
      .or(`branch_id.eq.${order.branch_id},branch_id.is.null`)
      .order("valid_from", { ascending: false });

    const price =
      prices?.find((p) => p.branch_id === order.branch_id) ??
      prices?.find((p) => p.branch_id === null);

    if (!price) {
      return { error: "Bu ürünün tanımlı bir fiyatı yok." };
    }

    // Aktif reçete versiyonunu da dondurulacak şekilde okuyoruz — Faz 3'teki
    // stok düşümü, satışın yapıldığı andaki gramajı kullanacak.
    const { data: recipe } = await supabase
      .from("recipes")
      .select("id, recipe_versions(id, status)")
      .eq("menu_item_id", input.menuItemId)
      .maybeSingle();

    const recipeVersionId =
      recipe?.recipe_versions?.find((v) => v.status === "active")?.id ?? null;

    const { error } = await supabase.from("order_lines").insert({
      tenant_id: user.tenantId,
      order_id: input.orderId,
      menu_item_id: input.menuItemId,
      quantity: input.quantity,
      unit_price: price.price,
      vat_rate: price.vat_rate,
      recipe_version_id: recipeVersionId,
      note: input.note,
      created_by: user.userId,
      client_key: input.clientKey ?? randomUUID(),
    });

    if (error) {
      // 23505 = unique_violation → (order_id, client_key) çifti zaten var.
      // Offline kuyruğun aynı mutasyonu ikinci kez denediği anlamına gelir;
      // bu bir hata değil, "zaten yapıldı" demektir. Hata döndürseydik kuyruk
      // sonsuza dek bu mutasyonu denemeye devam ederdi.
      if (error.code === "23505") {
        revalidatePath("/pos", "layout");
        return { ok: true };
      }
      return { error: error.message };
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/pos", "layout");
  return { ok: true };
}

export async function removeOrderLine(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const supabase = await createClient();

  // Yalnızca mutfağa gönderilmemiş satır silinebilir. Gönderilmiş bir ürünü
  // "silmek" mutfağın hazırladığı bir şeyi izsiz kaybettirirdi — o durumda
  // iptal, onay gerektiren bir aksiyondur (Faz 5/6'da eklenecek).
  const { error } = await supabase
    .from("order_lines")
    .delete()
    .eq("id", id)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
  revalidatePath("/pos", "layout");
}

const KITCHEN_TRANSITIONS = {
  // key: mevcut durum → değer: izin verilen sonraki durum.
  // Mutfak sırayı atlayamaz (sent'ten doğrudan served'e geçemez); bu, "unutulan"
  // bir siparişin fark edilmeden servis edilmiş sayılmasını engeller.
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
    // `.eq("status", input.from)`: iki kişi aynı bileti aynı anda ilerletirse
    // ikinci istek 0 satır günceller — sessizce iki adım atlanmaz.
    .eq("id", input.id)
    .eq("status", input.from);

  if (error) throw new Error(error.message);
  revalidatePath("/kds");
  revalidatePath("/pos", "layout");
  revalidatePath("/orders");
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

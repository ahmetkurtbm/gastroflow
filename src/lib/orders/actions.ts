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
  // Yalnızca KİMLİKLERİ alıyoruz — ad ve fiyat farkı istemciden gelmiyor.
  // Aksi hâlde biri formu manipüle edip "büyük boy" seçip fiyat farkını
  // 0 olarak gönderebilirdi. Gerçek ad/fiyat aşağıda veritabanından okunup
  // dondurulur (menü fiyatıyla aynı prensip).
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

    // Modifier ad/fiyatını burada, veritabanından okuyup dondurüyoruz —
    // istemciden gelen değere güvenmiyoruz.
    let modifiers: { name: string; price_delta: number }[] = [];
    if (input.modifierIds && input.modifierIds.length > 0) {
      const { data: modifierRows } = await supabase
        .from("modifiers")
        .select("id, name, price_delta")
        .in("id", input.modifierIds)
        .eq("is_active", true);

      if (!modifierRows || modifierRows.length !== input.modifierIds.length) {
        return { error: "Seçilen seçeneklerden biri artık geçerli değil." };
      }
      modifiers = modifierRows.map((m) => ({ name: m.name, price_delta: m.price_delta }));
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
        vat_rate: price.vat_rate,
        recipe_version_id: recipeVersionId,
        note: input.note,
        created_by: user.userId,
        client_key: lineClientKey,
      })
      .select("id")
      .maybeSingle();

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

    if (modifiers.length > 0 && insertedLine) {
      const { error: modifierError } = await supabase.from("order_line_modifiers").insert(
        modifiers.map((m) => ({
          tenant_id: user.tenantId,
          order_line_id: insertedLine.id,
          name: m.name,
          price_delta: m.price_delta,
        })),
      );
      // Ana satır zaten eklendi; modifier eklenemezse akışı durdurmuyoruz
      // ama günlüğe düşüyoruz — sessizce yutulursa fiyat farkı kaybolurdu.
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

const requestDiscountSchema = z.object({
  orderLineId: z.uuid(),
  kind: z.enum(["comp", "percent", "amount"]),
  value: z.coerce.number().min(0).max(1_000_000),
  reason: z.string().trim().min(3).max(200),
});

/**
 * Bir satıra ikram/iskonto isteği açar.
 *
 * Müdür/patron kendi isteğini anında ONAYLANMIŞ olarak açar — kendi kendini
 * onaylatmasına gerek yok, RLS zaten yalnızca bu iki rolün bunu yapmasına
 * izin veriyor (bkz. migration 0011, `line_discounts_insert`). Diğer roller
 * (garson, kasa) isteği BEKLEYEN olarak açar; müdür/patron `/approvals`'tan
 * karar verene kadar fiyata yansımaz.
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
      // 23505 = unique_violation → bu satırda zaten bekleyen bir istek var
      // (bkz. `line_discounts_one_pending_per_line`).
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

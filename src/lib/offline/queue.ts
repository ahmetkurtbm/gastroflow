import { addOrderLine, sendToKitchen } from "@/lib/orders/actions";

import { withStore } from "./db";
import type { QueuedMutation, SyncOutcome } from "./types";

/**
 * Offline sipariş kuyruğu.
 *
 * Kapsamı bilerek dar tutuldu: bu, zaten açık olan bir sipariş ekranında
 * bağlantı kesildiğinde ürün eklemeyi ve mutfağa göndermeyi kesintisiz
 * sürdürür. YENİ BİR MASA AÇMAK bu kapsamda değil — çünkü bu bir Server
 * Component uygulaması ve her navigasyon (yeni sayfaya geçiş) sunucudan
 * RSC verisi çekmeyi gerektirir; service worker olmadan hiçbir navigasyon
 * offline çalışmaz. Tam "soğuk başlangıç" offline desteği (app-shell
 * önbellekleme) ayrı ve daha büyük bir iş — bkz. proje panosu.
 *
 * Mutasyonlar mevcut Server Action'ları (addOrderLine, sendToKitchen)
 * ÇAĞIRARAK senkronlanır — Supabase'e doğrudan bağlanıp fiyat/reçete
 * mantığını burada tekrarlamıyoruz. Sunucu aksiyonunu doğrudan bir fonksiyon
 * gibi çağırmak da bir ağ isteğidir (Next.js bunu "Server Reference" olarak
 * sunucuya POST eder); dolayısıyla offline'ken bu da tıpkı form gönderimi
 * gibi başarısız olur ve kuyrukta bekler — asıl kazanç, başarısızlığı
 * SESSİZCE KAYBETMEK yerine yakalayıp saklamak.
 */

async function put(mutation: QueuedMutation): Promise<void> {
  await withStore("readwrite", (store) => store.put(mutation));
}

/**
 * Sıralama için tekil, kesin artan bir zaman damgası üretir.
 *
 * Yalnızca `Date.now()` YETMEZ: iki `enqueue*` çağrısı aynı milisaniyede
 * tamamlanabilir (test ortamında neredeyse her zaman olur), bu durumda
 * IndexedDB indeksindeki sıra garanti edilmez ve "mutfağa gönder" isteği,
 * ondan önce eklenmesi gereken ürün satırından önce işlenebilir — bu tam
 * olarak `drainQueue`'nun engellemeye çalıştığı hata. Aynı milisaniye
 * içindeki art arda çağrılar için sayaç, gerçek sırayı korur.
 */
let sequence = 0;
function nextTimestamp(): number {
  return Date.now() * 1000 + (sequence++ % 1000);
}

export async function enqueueAddLine(input: {
  tenantId: string;
  orderId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  modifierIds?: readonly string[];
  modifierSummary?: string | null;
  userId: string;
}): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    id: crypto.randomUUID(),
    kind: "add_line",
    createdAt: nextTimestamp(),
    tenantId: input.tenantId,
    orderId: input.orderId,
    menuItemId: input.menuItemId,
    menuItemName: input.menuItemName,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    modifierIds: input.modifierIds ?? [],
    modifierSummary: input.modifierSummary ?? null,
    userId: input.userId,
  };
  await put(mutation);
  return mutation;
}

export async function enqueueSendToKitchen(input: {
  tenantId: string;
  orderId: string;
}): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    id: crypto.randomUUID(),
    kind: "send_to_kitchen",
    createdAt: nextTimestamp(),
    tenantId: input.tenantId,
    orderId: input.orderId,
  };
  await put(mutation);
  return mutation;
}

export async function listQueue(): Promise<QueuedMutation[]> {
  const all = (await withStore("readonly", (store) =>
    store.index("createdAt").getAll(),
  )) as QueuedMutation[] | undefined;
  return all ?? [];
}

async function removeFromQueue(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

/**
 * Henüz senkronlanmamış bir mutasyonu kuyruktan iptal eder.
 *
 * Yalnızca kuyrukta bekleyen (sunucuya hiç ulaşmamış) bir eklemeyi geri
 * almak için güvenlidir — sunucuya ulaşmış bir satırı silmek `removeOrderLine`
 * server action'ının işi ve bağlantı gerektirir.
 */
export async function cancelQueuedMutation(id: string): Promise<void> {
  await removeFromQueue(id);
}

/**
 * Kuyruğu sırayla (FIFO) boşaltır.
 *
 * Sıra korunmalı: bir ürünü eklemeden mutfağa gönderemezsin. İlk başarısızlıkta
 * durur — kalan mutasyonlar kuyrukta bekler, bir sonraki tetiklemede baştan
 * (kaldığı yerden) denenir. "Bazılarını atlayıp devam et" YAPILMAZ; bağlantı
 * kesikken atlanan bir ekleme sessizce kaybolmuş olurdu.
 */
export async function drainQueue(
  onOutcome?: (outcome: SyncOutcome) => void,
): Promise<{ syncedCount: number }> {
  const pending = await listQueue();
  let syncedCount = 0;

  for (const mutation of pending) {
    const outcome = await syncOne(mutation);
    onOutcome?.(outcome);

    if (outcome.status === "failed") break;

    await removeFromQueue(mutation.id);
    syncedCount += 1;
  }

  return { syncedCount };
}

async function syncOne(mutation: QueuedMutation): Promise<SyncOutcome> {
  try {
    if (mutation.kind === "add_line") {
      const formData = new FormData();
      formData.set("orderId", mutation.orderId);
      formData.set("menuItemId", mutation.menuItemId);
      formData.set("quantity", String(mutation.quantity));
      formData.set("clientKey", mutation.id);
      for (const modifierId of mutation.modifierIds) {
        formData.append("modifierIds", modifierId);
      }

      const result = await addOrderLine({}, formData);
      if (result.error) {
        return { status: "failed", mutation, error: result.error };
      }
      return { status: "synced", mutation };
    }

    // send_to_kitchen: sendToKitchen(formData) hata durumunda fırlatır,
    // başarı durumunda bir şey döndürmez.
    const formData = new FormData();
    formData.set("orderId", mutation.orderId);
    await sendToKitchen(formData);
    return { status: "synced", mutation };
  } catch (error) {
    return {
      status: "failed",
      mutation,
      error: error instanceof Error ? error.message : "Senkronizasyon hatası.",
    };
  }
}

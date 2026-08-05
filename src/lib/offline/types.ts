/**
 * Kuyruğa alınan mutasyonlar (sipariş VE sayım).
 *
 * `id` aynı zamanda sunucudaki idempotency anahtarıdır (`client_key` ya da
 * `batchId`). Aynı mutasyon iki kez senkronlansa bile (ağ kesilip yeniden
 * denense, ya da sekme kapanıp açılsa) veritabanındaki unique kısıt ikinci
 * denemeyi ya reddeder ya da (bizim ele aldığımız şekilde) "zaten yapılmış"
 * sayar. Sipariş satırları için bkz. supabase/migrations/0008
 * (`client_key`); sayım için bkz. 0010 (`reference_type`/`reference_id`).
 */
export type QueuedMutation =
  | {
      readonly id: string;
      readonly kind: "add_line";
      readonly createdAt: number;
      readonly tenantId: string;
      readonly orderId: string;
      readonly menuItemId: string;
      readonly menuItemName: string;
      readonly quantity: number;
      /** Ürün fiyatı + seçilen modifier'ların TOPLAM farkı — yalnızca
       * OPTİMİSTİK gösterim için. Sunucu ad/fiyatı kendi okuyup dondurur. */
      readonly unitPrice: number;
      readonly modifierIds: readonly string[];
      readonly modifierSummary: string | null;
      readonly userId: string;
    }
  | {
      readonly id: string;
      readonly kind: "send_to_kitchen";
      readonly createdAt: number;
      readonly tenantId: string;
      readonly orderId: string;
    }
  | {
      readonly id: string;
      readonly kind: "record_count_page";
      readonly createdAt: number;
      readonly locationId: string;
      /** Sayfadaki her satır: hammadde id'si + sayılan miktar (string —
       * input değeri aynen taşınır, sunucu ayrıştırır). */
      readonly entries: readonly { itemId: string; quantity: string }[];
    };

export type SyncOutcome =
  | { readonly status: "synced"; readonly mutation: QueuedMutation; readonly realId?: string }
  | { readonly status: "failed"; readonly mutation: QueuedMutation; readonly error: string };

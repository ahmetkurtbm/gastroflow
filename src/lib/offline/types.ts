/**
 * Kuyruğa alınan sipariş mutasyonları.
 *
 * `id` aynı zamanda sunucudaki `client_key`'dir — bu, kuyruğun idempotency
 * garantisinin kaynağı. Aynı mutasyon iki kez senkronlansa bile (ağ kesilip
 * yeniden denense, ya da sekme kapanıp açılsa) veritabanındaki unique kısıt
 * ikinci denemeyi ya reddeder ya da (bizim ele aldığımız şekilde) "zaten
 * yapılmış" sayar. Bkz. supabase/migrations/0008 — `orders`/`order_lines`
 * tablolarındaki `client_key` kısıtları.
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
    };

export type SyncOutcome =
  | { readonly status: "synced"; readonly mutation: QueuedMutation; readonly realId?: string }
  | { readonly status: "failed"; readonly mutation: QueuedMutation; readonly error: string };

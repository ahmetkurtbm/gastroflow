/**
 * Kuyruğa alınan sipariş ve sayım mutasyonları. `id` sunucudaki idempotency
 * anahtarıdır (`client_key` ya da `batchId`); tekrar gönderim unique kısıta takılır.
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
      /** Ürün fiyatı ve modifier farkları; yalnızca iyimser gösterim için. */
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
      /** Hammadde id'si ve sayılan miktar (girdi metni, sunucu ayrıştırır). */
      readonly entries: readonly { itemId: string; quantity: string }[];
    };

export type SyncOutcome =
  | { readonly status: "synced"; readonly mutation: QueuedMutation; readonly realId?: string }
  | { readonly status: "failed"; readonly mutation: QueuedMutation; readonly error: string };

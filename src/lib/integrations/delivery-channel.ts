/**
 * Paket sipariş platformu (Yemeksepeti/Getir/Trendyol Go vb.) entegrasyon arayüzü.
 *
 * Her platformun kendi webhook şeması ve kimlik doğrulaması var — kapsam
 * dışı. Amaç: platformdan gelen bir siparişi `orders` tablosundaki
 * `channel='delivery'` satırına çevirmek (§5 veri modelinde zaten var) ve
 * durum güncellemelerini geri platforma iletmek. Gerçek bir webhook
 * alıcısı (Route Handler) bağlanınca `parseIncomingOrder` girdi şemasını
 * gerçek payload'a göre dolduracak; adisyon oluşturma mantığı
 * (`src/lib/orders/actions.ts`) DEĞİŞMEYECEK — bu adaptör yalnızca "dış
 * formatı iç formata çevirme" katmanı.
 */

export type IncomingChannelOrder = {
  channelOrderId: string;
  channelName: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  customerNote: string | null;
};

export type ChannelOrderStatus = "accepted" | "preparing" | "ready" | "picked_up" | "cancelled";

export interface DeliveryChannelAdapter {
  readonly channelName: string;
  parseIncomingOrder(payload: unknown): IncomingChannelOrder;
  pushStatusUpdate(channelOrderId: string, status: ChannelOrderStatus): Promise<void>;
}

export class MockDeliveryChannelAdapter implements DeliveryChannelAdapter {
  constructor(readonly channelName: string) {}

  parseIncomingOrder(payload: unknown): IncomingChannelOrder {
    const p = (payload ?? {}) as Partial<IncomingChannelOrder>;
    return {
      channelOrderId: p.channelOrderId ?? crypto.randomUUID(),
      channelName: this.channelName,
      items: p.items ?? [],
      customerNote: p.customerNote ?? null,
    };
  }

  async pushStatusUpdate(channelOrderId: string, status: ChannelOrderStatus): Promise<void> {
    console.log(`[MOCK ${this.channelName}] Sipariş ${channelOrderId} → ${status}`);
  }
}

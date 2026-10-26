/**
 * Paket sipariş platformu (Yemeksepeti, Getir, Trendyol Go) arayüzü. Platform
 * siparişini `channel='delivery'` adisyonuna çevirir ve durumu geri iletir.
 * Gerçek webhook entegrasyonu yok; şu an mock çalışır.
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

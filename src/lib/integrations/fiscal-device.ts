/**
 * ÖKC (Yeni Nesil Ödeme Kaydedici Cihaz) arayüzü. Gerçek cihaz bağlantısı
 * üreticiyle anlaşma ve cihaza özel protokol gerektirir; şu an mock çalışır.
 */

export type FiscalReceiptInput = {
  orderId: string;
  orderNo: number | null;
  /** TL, KDV dahil toplam. */
  totalAmount: number;
};

export type FiscalReceiptResult = {
  receiptNumber: string;
  issuedAt: string;
};

export interface FiscalDeviceAdapter {
  /** Adisyon kapanınca yasal fiş kesilmesi için çağrılır. */
  printReceipt(input: FiscalReceiptInput): Promise<FiscalReceiptResult>;
}

export class MockFiscalDeviceAdapter implements FiscalDeviceAdapter {
  async printReceipt(input: FiscalReceiptInput): Promise<FiscalReceiptResult> {
    const receiptNumber = `MOCK-OKC-${input.orderId.slice(0, 8)}`;
    console.log(
      `[MOCK ÖKC] Fiş kesildi: #${input.orderNo ?? "?"} — ${input.totalAmount.toFixed(2)} ₺ (${receiptNumber})`,
    );
    return { receiptNumber, issuedAt: new Date().toISOString() };
  }
}

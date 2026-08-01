/**
 * ÖKC (Yeni Nesil Ödeme Kaydedici Cihaz) entegrasyon arayüzü.
 *
 * 7524 sayılı Kanun kapsamında yeme-içme işletmelerinde YN ÖKC kullanımı
 * ve adisyon yazılımıyla entegrasyonu zorunlu (bkz. PLAN.md §1.3). Gerçek
 * bir cihazla konuşmak, cihaz üreticisiyle ticari anlaşma + cihaza özel
 * bir protokol (çoğunlukla yerel ağda XML/JSON tabanlı bir API) gerektirir
 * — bu bilinçli olarak kapsam dışı. Arayüz hazır; gerçek cihaz bağlanınca
 * yalnızca `MockFiscalDeviceAdapter`'ın yerine gerçek implementasyon geçer,
 * çağıran kod (`src/lib/cash/actions.ts`) hiç değişmez.
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

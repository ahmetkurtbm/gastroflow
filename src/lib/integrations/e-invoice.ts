/**
 * e-Arşiv fatura entegrasyon arayüzü (GİB).
 *
 * Belirli ciro eşiğini aşan işletmeler için e-Arşiv fatura zorunlu
 * (bkz. PLAN.md §1.3). Gerçek entegrasyon GİB'in web servisiyle karşılıklı
 * sertifika/imza gerektirir — kapsam dışı. Perakende satışların büyük
 * çoğunluğunda zaten müşteri vergi numarası vermez; bu durumda ÖKC fişi
 * yasal olarak yeterlidir, e-Arşiv'e hiç gerek yoktur — adaptör bu ayrımı
 * (`buyerTaxId` yoksa `skipped`) kendi içinde yapıyor.
 */

export type EInvoiceInput = {
  orderId: string;
  totalAmount: number;
  buyerTaxId?: string;
  buyerName?: string;
};

export type EInvoiceResult = {
  invoiceId: string;
  status: "submitted" | "skipped";
};

export interface EInvoiceAdapter {
  submitInvoice(input: EInvoiceInput): Promise<EInvoiceResult>;
}

export class MockEInvoiceAdapter implements EInvoiceAdapter {
  async submitInvoice(input: EInvoiceInput): Promise<EInvoiceResult> {
    if (!input.buyerTaxId) {
      return { invoiceId: "", status: "skipped" };
    }
    const invoiceId = `MOCK-EARSIV-${input.orderId.slice(0, 8)}`;
    console.log(`[MOCK e-Arşiv] Fatura oluşturuldu: ${invoiceId} (${input.buyerName ?? "isimsiz"})`);
    return { invoiceId, status: "submitted" };
  }
}

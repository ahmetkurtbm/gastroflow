/**
 * e-Arşiv fatura arayüzü (GİB). Gerçek entegrasyon GİB sertifikası gerektirir;
 * şu an mock çalışır. Vergi numarası yoksa fatura gerekmez (`skipped`).
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

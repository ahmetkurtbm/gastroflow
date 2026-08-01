import "server-only";

import { MockDeliveryChannelAdapter, type DeliveryChannelAdapter } from "./delivery-channel";
import { MockEInvoiceAdapter, type EInvoiceAdapter } from "./e-invoice";
import { MockFiscalDeviceAdapter, type FiscalDeviceAdapter } from "./fiscal-device";

/**
 * Aktif adaptörler — bugün üçü de mock. Gerçek bir donanım/servis
 * bağlanınca değişecek TEK yer burası; çağıran kod yalnızca arayüzü
 * bilir, hangi implementasyonun çalıştığını bilmez (bkz. PLAN.md §0
 * "adapter arayüzü + mock" ilkesi).
 */
export const fiscalDeviceAdapter: FiscalDeviceAdapter = new MockFiscalDeviceAdapter();
export const eInvoiceAdapter: EInvoiceAdapter = new MockEInvoiceAdapter();
export const deliveryChannelAdapters: DeliveryChannelAdapter[] = [
  new MockDeliveryChannelAdapter("Yemeksepeti"),
  new MockDeliveryChannelAdapter("Getir"),
  new MockDeliveryChannelAdapter("Trendyol Go"),
];

export type { EInvoiceAdapter, EInvoiceInput, EInvoiceResult } from "./e-invoice";
export type { FiscalDeviceAdapter, FiscalReceiptInput, FiscalReceiptResult } from "./fiscal-device";
export type {
  ChannelOrderStatus,
  DeliveryChannelAdapter,
  IncomingChannelOrder,
} from "./delivery-channel";

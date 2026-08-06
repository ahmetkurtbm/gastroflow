/**
 * Sipariş tipleri ve saf yardımcı fonksiyonlar — sunucu bağımlılığı YOK.
 *
 * Bilerek `queries.ts`'den ayrı: `queries.ts` `@/lib/supabase/server`'ı
 * (dolayısıyla `next/headers`'ı) import ediyor, bu da onu yalnızca Server
 * Component'lerden kullanılabilir kılıyor. `cart.tsx` gibi bir Client
 * Component `effectiveUnitPrice`'a ihtiyaç duyduğunda `queries.ts`'den
 * import ederse, server-only zincir client paketine sızıp build'i kırıyor —
 * gerçekten yaşandı. Tip ve saf hesaplamalar burada, ikisi de rahatça
 * import edebilir.
 */

export type OrderLineModifierView = { name: string; priceDelta: number };

export type LineDiscountView = {
  id: string;
  kind: "comp" | "percent" | "amount";
  value: number;
  status: "pending" | "approved" | "rejected";
  reason: string;
};

export type OrderLineView = {
  id: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  modifiers: OrderLineModifierView[];
  status: string;
  note: string | null;
  /** Bu satırdaki en güncel ikram/iskonto isteği (varsa) — reddedilmiş bir
   * istek daha yeni bir istekle değiştirilene kadar gösterilmez. */
  discount: LineDiscountView | null;
};

/** Modifier farkları dahil, tek adedin gerçek fiyatı. */
export function effectiveUnitPrice(line: OrderLineView): number {
  return line.unitPrice + line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
}

/**
 * ONAYLANMIŞ bir ikram/iskontoyu ham tutara uygular. Bekleyen bir istek
 * tutarı DEĞİŞTİRMEZ — onaylanana kadar müşteri normal fiyatı öder, aksi
 * hâlde biri "ikram istedim" deyip onay beklerken bedava yemiş gibi görünürdü.
 */
export function applyLineDiscount(amount: number, discount: LineDiscountView | null): number {
  if (!discount || discount.status !== "approved") return amount;
  if (discount.kind === "comp") return 0;
  if (discount.kind === "percent") return Math.max(0, amount * (1 - discount.value / 100));
  return Math.max(0, amount - discount.value);
}

/** Satırın gerçek tutarı: modifier farkları + onaylanmış indirim dahil. */
export function lineTotal(line: OrderLineView): number {
  return applyLineDiscount(line.quantity * effectiveUnitPrice(line), line.discount);
}

export type OrderView = {
  id: string;
  orderNo: number | null;
  tableId: string | null;
  tableName: string | null;
  guestCount: number | null;
  lines: OrderLineView[];
  total: number;
};

/** `line_discounts` sorgu satırlarından "şu an geçerli" olanı seçer. */
export function pickActiveDiscount(
  rows: readonly {
    id: string;
    kind: string;
    value: number | string;
    status: string;
    reason: string;
    created_at: string;
  }[],
): LineDiscountView | null {
  if (!rows || rows.length === 0) return null;
  const latest = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  return {
    id: latest.id,
    kind: latest.kind as LineDiscountView["kind"],
    value: typeof latest.value === "number" ? latest.value : Number(latest.value),
    status: latest.status as LineDiscountView["status"],
    reason: latest.reason,
  };
}

export type MenuModifier = { id: string; name: string; priceDelta: number };
export type MenuModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: MenuModifier[];
};
export type MenuCategory = {
  id: string;
  name: string;
  items: {
    id: string;
    name: string;
    price: number | null;
    modifierGroups: MenuModifierGroup[];
    imageUrl: string | null;
  }[];
};

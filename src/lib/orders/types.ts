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

export type OrderLineView = {
  id: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  modifiers: OrderLineModifierView[];
  status: string;
  note: string | null;
};

/** Modifier farkları dahil, tek adedin gerçek fiyatı. */
export function effectiveUnitPrice(line: OrderLineView): number {
  return line.unitPrice + line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
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
  }[];
};

import { compare, money, subtract, ZERO, type Money } from "@/core/money";
import { applyLineDiscount, pickActiveDiscount, type LineDiscountView } from "@/lib/orders/types";
import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

const DISCOUNT_SELECT = "line_discounts(id, kind, value, status, reason, created_at)";

/** Modifier farkları + onaylanmış ikram/iskonto dahil, satırın gerçek tutarı. */
function lineTotal(
  quantity: number,
  unitPrice: number,
  modifiers: { price_delta: string | number }[] | null | undefined,
  discountRows: {
    id: string;
    kind: string;
    value: number | string;
    status: string;
    reason: string;
    created_at: string;
  }[] | null | undefined,
): number {
  const modifierTotal = (modifiers ?? []).reduce((sum, m) => sum + toNumber(m.price_delta), 0);
  const base = quantity * (unitPrice + modifierTotal);
  return applyLineDiscount(base, pickActiveDiscount(discountRows ?? []));
}

export type CashSessionView = {
  id: string;
  status: "open" | "closed";
  openingFloat: number;
  openedAt: string;
  openedByName: string;
  closedAt: string | null;
  closedByName: string | null;
  countedCash: number | null;
  note: string | null;
  totalsByMethod: { method: string; amount: number }[];
  totalPayments: number;
  /** Nakit için beklenen tutar: başlangıç bozukluğu + bu oturumda alınan nakit. */
  expectedCash: number;
};

/**
 * `/cash` ekranının üst kısmı: en son açılan kasa oturumu — açıksa canlı
 * özet, kapalıysa son gün sonu raporu olarak gösterilir. Şube bazlı DEĞİL,
 * tenant genelinde en yeni oturum — bu portfolyo ölçeğinde (tek şube)
 * yeterli; çok şubeli senaryoda şube filtresi eklenir (bkz. plan §0.1 Faz 9).
 */
export async function loadLatestCashSession(): Promise<CashSessionView | null> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("cash_sessions")
    .select("id, status, opening_float, opened_at, opened_by, closed_at, closed_by, counted_cash, note")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return null;

  const { data: payments } = await supabase
    .from("payments")
    .select("method, amount")
    .eq("cash_session_id", session.id);

  const totalsMap = new Map<string, number>();
  for (const p of payments ?? []) {
    totalsMap.set(p.method, (totalsMap.get(p.method) ?? 0) + toNumber(p.amount));
  }
  const totalsByMethod = [...totalsMap.entries()].map(([method, amount]) => ({ method, amount }));
  const totalPayments = totalsByMethod.reduce((s, t) => s + t.amount, 0);

  const userIds = [session.opened_by, session.closed_by].filter((id): id is string => !!id);
  const namesById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    for (const p of profiles ?? []) namesById.set(p.id, p.full_name);
  }

  return {
    id: session.id,
    status: session.status,
    openingFloat: toNumber(session.opening_float),
    openedAt: session.opened_at,
    openedByName: namesById.get(session.opened_by) ?? "Bilinmeyen personel",
    closedAt: session.closed_at,
    closedByName: session.closed_by ? (namesById.get(session.closed_by) ?? "Bilinmeyen personel") : null,
    countedCash: session.counted_cash !== null ? toNumber(session.counted_cash) : null,
    note: session.note,
    totalsByMethod,
    totalPayments,
    expectedCash: toNumber(session.opening_float) + (totalsMap.get("cash") ?? 0),
  };
}

export type OpenOrderSummary = {
  id: string;
  orderNo: number | null;
  tableName: string | null;
  openedAt: string;
  total: Money;
  paid: Money;
};

/** Kasa ekranındaki liste: açık adisyonlar ve kalan bakiyeleri. */
export async function loadOpenOrdersForCash(): Promise<OpenOrderSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      `id, order_no, opened_at, tables(name), order_lines(quantity, unit_price, order_line_modifiers(price_delta), ${DISCOUNT_SELECT}), payments(amount)`,
    )
    .eq("status", "open")
    .order("opened_at", { ascending: true });

  return (data ?? []).map((order) => {
    const total = (order.order_lines ?? []).reduce(
      (sum, l) =>
        sum +
        lineTotal(toNumber(l.quantity), toNumber(l.unit_price), l.order_line_modifiers, l.line_discounts),
      0,
    );
    const paid = (order.payments ?? []).reduce((sum, p) => sum + toNumber(p.amount), 0);

    return {
      id: order.id,
      orderNo: order.order_no,
      tableName: order.tables?.name ?? null,
      openedAt: order.opened_at,
      total: money(total),
      paid: money(paid),
    };
  });
}

export type PaymentView = {
  id: string;
  method: string;
  amount: Money;
  receivedAt: string;
};

export type OrderForPayment = {
  id: string;
  orderNo: number | null;
  tableName: string | null;
  guestCount: number | null;
  status: string;
  lines: {
    menuItemName: string;
    quantity: number;
    unitPrice: number;
    modifiers: { name: string; priceDelta: number }[];
    discount: LineDiscountView | null;
    /** Modifier + onaylanmış indirim dahil satır tutarı — kasadaki listelerde
     * tekrar tekrar aynı hesabı yapmamak için burada hazır tutuluyor. */
    total: number;
  }[];
  payments: PaymentView[];
  total: Money;
  paid: Money;
  remaining: Money;
};

export async function loadOrderForPayment(orderId: string): Promise<OrderForPayment | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, order_no, guest_count, status, tables(name), order_lines(quantity, unit_price, menu_items(name), order_line_modifiers(name, price_delta), ${DISCOUNT_SELECT}), payments(id, method, amount, received_at)`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const lines = (order.order_lines ?? []).map((l) => {
    const modifiers = (l.order_line_modifiers ?? []).map((m) => ({
      name: m.name,
      priceDelta: toNumber(m.price_delta),
    }));
    const discount = pickActiveDiscount(l.line_discounts ?? []);
    const base =
      toNumber(l.quantity) * (toNumber(l.unit_price) + modifiers.reduce((s, m) => s + m.priceDelta, 0));

    return {
      menuItemName: l.menu_items?.name ?? "Bilinmeyen ürün",
      quantity: toNumber(l.quantity),
      unitPrice: toNumber(l.unit_price),
      modifiers,
      discount,
      total: applyLineDiscount(base, discount),
    };
  });

  const total = money(lines.reduce((sum, l) => sum + l.total, 0));
  const paid = money(
    (order.payments ?? []).reduce((sum, p) => sum + toNumber(p.amount), 0),
  );

  return {
    id: order.id,
    orderNo: order.order_no,
    tableName: order.tables?.name ?? null,
    guestCount: order.guest_count,
    status: order.status,
    lines,
    payments: (order.payments ?? [])
      .map((p) => ({
        id: p.id,
        method: p.method,
        amount: money(toNumber(p.amount)),
        receivedAt: p.received_at,
      }))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
    total,
    paid,
    remaining: compare(total, paid) > 0 ? subtract(total, paid) : ZERO,
  };
}

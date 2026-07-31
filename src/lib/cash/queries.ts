import { compare, money, subtract, ZERO, type Money } from "@/core/money";
import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
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
      "id, order_no, opened_at, tables(name), order_lines(quantity, unit_price), payments(amount)",
    )
    .eq("status", "open")
    .order("opened_at", { ascending: true });

  return (data ?? []).map((order) => {
    const total = (order.order_lines ?? []).reduce(
      (sum, l) => sum + toNumber(l.quantity) * toNumber(l.unit_price),
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
  lines: { menuItemName: string; quantity: number; unitPrice: number }[];
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
      "id, order_no, guest_count, status, tables(name), order_lines(quantity, unit_price, menu_items(name)), payments(id, method, amount, received_at)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const lines = (order.order_lines ?? []).map((l) => ({
    menuItemName: l.menu_items?.name ?? "Bilinmeyen ürün",
    quantity: toNumber(l.quantity),
    unitPrice: toNumber(l.unit_price),
  }));

  const total = money(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
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

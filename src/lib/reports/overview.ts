import "server-only";

import { createClient } from "@/lib/db/client";

const DAYS = 14;
const TOP_ITEMS_DAYS = 7;

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

const istanbulDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** İstanbul takvim günü, YYYY-AA-GG. */
function dayKey(date: Date): string {
  return istanbulDay.format(date);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export type Overview = {
  today: { revenue: number; payments: number; orders: number; averageTicket: number };
  openOrders: number;
  pendingApprovals: number;
  lowStock: number;
  daily: { day: string; revenue: number }[];
  methods: { method: string; amount: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
};

/** Patron/müdür ana ekranı: bugünün özeti, son 14 günün cirosu ve son 7 günün dağılımları. */
export async function loadOverview(): Promise<Overview> {
  const supabase = await createClient();
  // 14 gün öncesinin İstanbul gece yarısı: sabit +03:00 ofsetiyle.
  const since = `${dayKey(daysAgo(DAYS - 1))}T00:00:00+03:00`;
  const topSince = `${dayKey(daysAgo(TOP_ITEMS_DAYS - 1))}T00:00:00+03:00`;

  const [payments, openOrders, pendingDiscounts, pendingOrders, lowStock, lines] = await Promise.all([
    supabase.from("payments").select("order_id, method, amount, received_at").gte("received_at", since),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("line_discounts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    supabase.from("v_low_stock").select("inventory_item_id", { count: "exact", head: true }),
    supabase
      .from("order_lines")
      .select("quantity, unit_price, menu_items(name)")
      .gte("created_at", topSince)
      .neq("status", "cancelled"),
  ]);

  const todayKey = dayKey(new Date());
  const weekStart = dayKey(daysAgo(TOP_ITEMS_DAYS - 1));
  const daily = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i--) daily.set(dayKey(daysAgo(i)), 0);

  const methods = new Map<string, number>();
  const todayOrders = new Set<string>();
  let todayRevenue = 0;
  let todayPayments = 0;

  for (const payment of payments.data ?? []) {
    const amount = toNumber(payment.amount);
    const key = dayKey(new Date(payment.received_at));
    if (daily.has(key)) daily.set(key, daily.get(key)! + amount);
    if (key >= weekStart) methods.set(payment.method, (methods.get(payment.method) ?? 0) + amount);
    if (key === todayKey) {
      todayRevenue += amount;
      todayPayments += 1;
      todayOrders.add(payment.order_id);
    }
  }

  const items = new Map<string, { quantity: number; revenue: number }>();
  for (const line of lines.data ?? []) {
    const name = line.menu_items?.name ?? "Bilinmeyen ürün";
    const quantity = toNumber(line.quantity);
    const current = items.get(name) ?? { quantity: 0, revenue: 0 };
    items.set(name, { quantity: current.quantity + quantity, revenue: current.revenue + quantity * toNumber(line.unit_price) });
  }

  return {
    today: {
      revenue: todayRevenue,
      payments: todayPayments,
      orders: todayOrders.size,
      averageTicket: todayOrders.size ? todayRevenue / todayOrders.size : 0,
    },
    openOrders: openOrders.count ?? 0,
    pendingApprovals: (pendingDiscounts.count ?? 0) + (pendingOrders.count ?? 0),
    lowStock: lowStock.count ?? 0,
    daily: [...daily.entries()].map(([day, revenue]) => ({ day, revenue })),
    methods: [...methods.entries()]
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount),
    topItems: [...items.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5),
  };
}

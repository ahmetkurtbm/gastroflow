import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export type DailyChannelReconciliation = {
  date: string;
  gastroflowTotal: number;
  settlementsTotal: number;
  difference: number;
};

export type ChannelReconciliation = {
  days: DailyChannelReconciliation[];
  gastroflowTotal: number;
  settlementsTotal: number;
  difference: number;
};

/**
 * Paket kanallarının kayıtlı cirosunu platform hakediş raporlarıyla karşılaştırır.
 * Masa siparişleri platform raporunda olmadığı için dışarıda bırakılır.
 */
export async function loadChannelReconciliation(
  fromDate: string,
  toDate: string,
): Promise<ChannelReconciliation> {
  const supabase = await createClient();

  const { data: channelOrders } = await supabase
    .from("orders")
    .select("id")
    .in("channel", ["takeaway", "self_service"]);
  const orderIds = (channelOrders ?? []).map((o) => o.id);

  const [{ data: payments }, { data: settlements }] = await Promise.all([
    orderIds.length > 0
      ? supabase
          .from("payments")
          .select("amount, received_at")
          .in("order_id", orderIds)
          .gte("received_at", `${fromDate}T00:00:00`)
          .lte("received_at", `${toDate}T23:59:59`)
      : Promise.resolve({ data: [] }),
    supabase
      .from("channel_settlements")
      .select("amount, settlement_date")
      .gte("settlement_date", fromDate)
      .lte("settlement_date", toDate),
  ]);

  const gastroflowByDay = new Map<string, number>();
  for (const p of payments ?? []) {
    const day = p.received_at.slice(0, 10);
    gastroflowByDay.set(day, (gastroflowByDay.get(day) ?? 0) + toNumber(p.amount));
  }
  const settlementsByDay = new Map<string, number>();
  for (const s of settlements ?? []) {
    settlementsByDay.set(
      s.settlement_date,
      (settlementsByDay.get(s.settlement_date) ?? 0) + toNumber(s.amount),
    );
  }

  const allDays = [...new Set([...gastroflowByDay.keys(), ...settlementsByDay.keys()])].sort();
  const days: DailyChannelReconciliation[] = allDays.map((date) => {
    const gastroflowTotal = gastroflowByDay.get(date) ?? 0;
    const settlementsTotal = settlementsByDay.get(date) ?? 0;
    return { date, gastroflowTotal, settlementsTotal, difference: gastroflowTotal - settlementsTotal };
  });

  const gastroflowTotal = days.reduce((sum, d) => sum + d.gastroflowTotal, 0);
  const settlementsTotal = days.reduce((sum, d) => sum + d.settlementsTotal, 0);

  return { days, gastroflowTotal, settlementsTotal, difference: gastroflowTotal - settlementsTotal };
}

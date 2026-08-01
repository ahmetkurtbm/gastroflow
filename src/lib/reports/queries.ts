import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Türkiye DST uygulamıyor (2016'dan beri sabit UTC+3) — bu yüzden "bugün
 * 00:00 İstanbul" hesabı sabit +03:00 ofsetiyle güvenle yapılabilir,
 * saat dilimi kütüphanesi gerekmez.
 */
function istanbulStartOfDayISO(): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${ymd}T00:00:00+03:00`;
}

export type RevenueSummary = {
  total: number;
  byMethod: { method: string; amount: number }[];
  paymentCount: number;
};

/** Bugünün cirosu (İstanbul günü, 00:00'dan şu ana) — tüm şubeler, tüm ödeme yöntemleri. */
export async function loadTodayRevenue(): Promise<RevenueSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("method, amount")
    .gte("received_at", istanbulStartOfDayISO());

  const byMethodMap = new Map<string, number>();
  for (const p of data ?? []) {
    byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + toNumber(p.amount));
  }
  const byMethod = [...byMethodMap.entries()].map(([method, amount]) => ({ method, amount }));

  return {
    total: byMethod.reduce((s, m) => s + m.amount, 0),
    byMethod,
    paymentCount: (data ?? []).length,
  };
}

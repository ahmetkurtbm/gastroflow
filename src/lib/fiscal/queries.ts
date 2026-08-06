import { createClient } from "@/lib/supabase/server";

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export type DailyReconciliation = {
  date: string;
  gastroflowTotal: number;
  receiptsTotal: number;
  difference: number;
};

export type Reconciliation = {
  days: DailyReconciliation[];
  gastroflowTotal: number;
  receiptsTotal: number;
  difference: number;
};

/**
 * GastroFlow'un kendi kayıtlı cirosuyla, dışarıdan (Excel'le) girilen
 * yazarkasa fişlerinin toplamını gün gün karşılaştırır.
 *
 * ÖKC entegrasyonu mock olduğu için (bkz. migration 0020) bu iki rakam
 * BAĞIMSIZ iki kaynaktan geliyor — biri tutmuyorsa ya kasiyer bir satışı
 * yazarkasaya geçirmeyi unutmuş, ya da fişi burada girmeyi. Fark ne kadar
 * büyükse o kadar acil bakılması gereken bir gün demek.
 */
export async function loadReconciliation(fromDate: string, toDate: string): Promise<Reconciliation> {
  const supabase = await createClient();

  const [{ data: payments }, { data: receipts }] = await Promise.all([
    supabase
      .from("payments")
      .select("amount, received_at")
      .gte("received_at", `${fromDate}T00:00:00`)
      .lte("received_at", `${toDate}T23:59:59`),
    supabase
      .from("fiscal_receipts")
      .select("amount, receipt_date")
      .gte("receipt_date", fromDate)
      .lte("receipt_date", toDate),
  ]);

  const gastroflowByDay = new Map<string, number>();
  for (const p of payments ?? []) {
    const day = p.received_at.slice(0, 10);
    gastroflowByDay.set(day, (gastroflowByDay.get(day) ?? 0) + toNumber(p.amount));
  }
  const receiptsByDay = new Map<string, number>();
  for (const r of receipts ?? []) {
    receiptsByDay.set(r.receipt_date, (receiptsByDay.get(r.receipt_date) ?? 0) + toNumber(r.amount));
  }

  const allDays = [...new Set([...gastroflowByDay.keys(), ...receiptsByDay.keys()])].sort();
  const days: DailyReconciliation[] = allDays.map((date) => {
    const gastroflowTotal = gastroflowByDay.get(date) ?? 0;
    const receiptsTotal = receiptsByDay.get(date) ?? 0;
    return { date, gastroflowTotal, receiptsTotal, difference: gastroflowTotal - receiptsTotal };
  });

  const gastroflowTotal = days.reduce((sum, d) => sum + d.gastroflowTotal, 0);
  const receiptsTotal = days.reduce((sum, d) => sum + d.receiptsTotal, 0);

  return { days, gastroflowTotal, receiptsTotal, difference: gastroflowTotal - receiptsTotal };
}

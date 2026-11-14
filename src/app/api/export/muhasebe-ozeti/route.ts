import { NextResponse } from "next/server";

import { requirePathAccess } from "@/lib/auth/current-user";
import { parseDateRange } from "@/lib/excel/date-range";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/db/client";

const COLUMNS = [
  { header: "Tarih", key: "date", width: 14 },
  { header: "Ödeme Yöntemi", key: "method", width: 16 },
  { header: "Tutar (₺)", key: "amount", width: 14 },
];

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  meal_card: "Yemek kartı",
  on_account: "Açık hesap",
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Muhasebe için ödeme yöntemi bazında günlük ciro dökümü. Belirli bir muhasebe
 * yazılımının biçimi iddia edilmez; düz bir dökümdür.
 */
export async function GET(request: Request) {
  if (!(await requirePathAccess("/reports"))) {
    return new NextResponse(null, { status: 403 });
  }
  const url = new URL(request.url);
  // Değerler dosya adına yazıldığı için yalnızca YYYY-MM-DD kabul edilir.
  const range = parseDateRange(url.searchParams.get("from"), url.searchParams.get("to"), {
    from: isoDaysAgo(30),
    to: isoDaysAgo(0),
  });
  if (!range) {
    return new NextResponse("Tarih YYYY-MM-DD biçiminde olmalı.", { status: 400 });
  }
  const { from: fromDate, to: toDate } = range;

  const supabase = await createClient();
  const { data: payments } = await supabase
    .from("payments")
    .select("amount, method, received_at")
    .gte("received_at", `${fromDate}T00:00:00`)
    .lte("received_at", `${toDate}T23:59:59`)
    .order("received_at");

  const totalByDayMethod = new Map<string, number>();
  for (const p of payments ?? []) {
    const key = `${p.received_at.slice(0, 10)}|${p.method}`;
    totalByDayMethod.set(key, (totalByDayMethod.get(key) ?? 0) + Number(p.amount));
  }

  const rows = [...totalByDayMethod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, amount]) => {
      const [date, method] = key.split("|");
      return { date, method: METHOD_LABEL[method] ?? method, amount };
    });

  const buffer = await buildWorkbookBuffer(`Muhasebe Özeti ${fromDate}–${toDate}`, COLUMNS, rows);
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="muhasebe-ozeti-${fromDate}-${toDate}.xlsx"`,
    },
  });
}

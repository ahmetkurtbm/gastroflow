import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/supabase/server";

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
 * Muhasebeciye günlük/dönemlik ciro dökümü — ödeme yöntemi bazında, gün gün.
 *
 * BİLEREK "Logo/Mikro/Luca uyumlu" diye iddia ETMİYORUZ: her muhasebe
 * yazılımının gerçek içe aktarım sütun formatı farklı ve doğrulayabildiğimiz
 * bir örnek yok — yanlış bir format iddiasıyla göndermek, hiç göndermemekten
 * kötü. Bu genel, düz bir döküm; muhasebeci kendi sistemine göre uyarlıyor.
 * KDV kırılımı da YOK aynı sebeple — tahmini bir KDV rakamı üretmek, gerçek
 * muhasebe hatasına yol açabilecek bir riski göze almaktan daha kötü.
 */
export async function GET(request: Request) {
  await requireAppUser();
  const url = new URL(request.url);
  const fromDate = url.searchParams.get("from") ?? isoDaysAgo(30);
  const toDate = url.searchParams.get("to") ?? isoDaysAgo(0);

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

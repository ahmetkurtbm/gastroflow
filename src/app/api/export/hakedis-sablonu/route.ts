import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  { header: "Tarih", key: "date", width: 14 },
  { header: "Platform", key: "platform", width: 18 },
  { header: "Tutar (₺)", key: "amount", width: 14 },
];

/** Paket platformu hakediş şablonu/dışa aktarımı — `?template=1` boş örnek satır. */
export async function GET(request: Request) {
  await requireAppUser();
  const isTemplate = new URL(request.url).searchParams.get("template") === "1";

  let rows: Record<string, string | number>[] = [];
  if (isTemplate) {
    const today = new Date().toISOString().slice(0, 10);
    rows = [{ date: today, platform: "Yemeksepeti", amount: 2340.75 }];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("channel_settlements")
      .select("settlement_date, platform, amount")
      .order("settlement_date", { ascending: false });
    rows = (data ?? []).map((r) => ({
      date: r.settlement_date,
      platform: r.platform,
      amount: Number(r.amount),
    }));
  }

  const buffer = await buildWorkbookBuffer("Hakediş", COLUMNS, rows);
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hakedis${isTemplate ? "-sablon" : ""}.xlsx"`,
    },
  });
}

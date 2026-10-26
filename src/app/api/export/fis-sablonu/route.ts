import { NextResponse } from "next/server";

import { requirePathAccess } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/db/client";

const COLUMNS = [
  { header: "Tarih", key: "date", width: 14 },
  { header: "Fiş No", key: "receiptNo", width: 16 },
  { header: "Tutar (₺)", key: "amount", width: 14 },
];

/** Yazarkasa fişi şablonu (`?template=1`) ya da içe aktarılmış fişlerin dökümü. */
export async function GET(request: Request) {
  if (!(await requirePathAccess("/reports"))) {
    return new NextResponse(null, { status: 403 });
  }
  const isTemplate = new URL(request.url).searchParams.get("template") === "1";

  let rows: Record<string, string | number>[] = [];
  if (isTemplate) {
    const today = new Date().toISOString().slice(0, 10);
    rows = [{ date: today, receiptNo: "0001", amount: 1250.5 }];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("fiscal_receipts")
      .select("receipt_date, receipt_no, amount")
      .order("receipt_date", { ascending: false });
    rows = (data ?? []).map((r) => ({
      date: r.receipt_date,
      receiptNo: r.receipt_no ?? "",
      amount: Number(r.amount),
    }));
  }

  const buffer = await buildWorkbookBuffer("Fişler", COLUMNS, rows);
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fisler${isTemplate ? "-sablon" : ""}.xlsx"`,
    },
  });
}

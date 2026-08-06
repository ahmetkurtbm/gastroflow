import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  { header: "Hammadde Adı", key: "name", width: 30 },
  { header: "Sayılan Miktar", key: "counted", width: 16 },
];

/**
 * Sayım şablonu — KÖRLEME: sistemdeki mevcut bakiye buraya BİLEREK
 * yazılmıyor (bkz. `count-form.tsx`'teki aynı prensip), yalnızca hammadde
 * adları var, "Sayılan Miktar" boş. Bu yüzden `?template=1` dışında bir
 * mod yok — "mevcut veriyi indir" burada anlamsız, sayım her seferinde
 * sıfırdan bir olay.
 */
export async function GET() {
  await requireAppUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("inventory_items")
    .select("name")
    .eq("is_active", true)
    .order("name");
  const rows = (data ?? []).map((i) => ({ name: i.name, counted: "" }));

  const buffer = await buildWorkbookBuffer("Sayım", COLUMNS, rows);
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sayim-sablonu.xlsx"`,
    },
  });
}

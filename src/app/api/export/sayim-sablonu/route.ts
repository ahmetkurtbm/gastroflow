import { NextResponse } from "next/server";

import { requirePathAccess } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  { header: "Hammadde Adı", key: "name", width: 30 },
  { header: "Sayılan Miktar", key: "counted", width: 16 },
];

/** Körleme sayım şablonu: mevcut bakiye yazılmaz, yalnızca hammadde adları vardır. */
export async function GET() {
  if (!(await requirePathAccess("/inventory"))) {
    return new NextResponse(null, { status: 403 });
  }
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

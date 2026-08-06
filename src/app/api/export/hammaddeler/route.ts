import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  { header: "Ad", key: "name", width: 30 },
  { header: "Birim", key: "unit", width: 12 },
  { header: "Maliyet (TL/birim)", key: "cost", width: 18 },
];

/** Hammadde listesini Excel olarak indirir — `?template=1` boş örnek şablon. */
export async function GET(request: Request) {
  await requireAppUser();
  const isTemplate = new URL(request.url).searchParams.get("template") === "1";

  let rows: Record<string, string | number>[] = [];
  if (isTemplate) {
    rows = [{ name: "Un", unit: "kg", cost: 22.5 }];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("inventory_items")
      .select("name, base_unit, cost_per_base_unit")
      .eq("is_active", true)
      .order("name");
    rows = (data ?? []).map((i) => ({
      name: i.name,
      unit: i.base_unit,
      cost: Number(i.cost_per_base_unit),
    }));
  }

  const buffer = await buildWorkbookBuffer("Hammaddeler", COLUMNS, rows);
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hammaddeler${isTemplate ? "-sablon" : ""}.xlsx"`,
    },
  });
}

import { NextResponse } from "next/server";

import { requirePathAccess } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/db/client";

const COLUMNS = [
  { header: "Hammadde Adı", key: "name", width: 30 },
  { header: "Fiyat (₺)", key: "price", width: 12 },
  { header: "Tedarikçi SKU", key: "sku", width: 18 },
  { header: "Min. Sipariş", key: "minOrder", width: 14 },
];

/** Tedarikçinin fiyat listesi: `?template=1` boş şablon. `supplierId` zorunludur. */
export async function GET(request: Request) {
  if (!(await requirePathAccess("/purchasing"))) {
    return new NextResponse(null, { status: 403 });
  }
  const url = new URL(request.url);
  const isTemplate = url.searchParams.get("template") === "1";
  const supplierId = url.searchParams.get("supplierId");
  if (!supplierId) {
    return NextResponse.json({ error: "supplierId gerekli." }, { status: 400 });
  }

  let rows: Record<string, string | number>[] = [];
  if (isTemplate) {
    rows = [{ name: "Un", price: 22.5, sku: "UN-001", minOrder: 25 }];
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("supplier_items")
      .select("price, supplier_sku, min_order_quantity, inventory_items(name)")
      .eq("supplier_id", supplierId)
      .order("id");
    rows = (data ?? []).map((row) => ({
      name: row.inventory_items?.name ?? "",
      price: Number(row.price),
      sku: row.supplier_sku ?? "",
      minOrder: Number(row.min_order_quantity),
    }));
  }

  const buffer = await buildWorkbookBuffer("Tedarikçi Fiyat Listesi", COLUMNS, rows);
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tedarikci-fiyatlari${isTemplate ? "-sablon" : ""}.xlsx"`,
    },
  });
}

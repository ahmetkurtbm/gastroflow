import { NextResponse } from "next/server";

import { currentPrices } from "@/core/pricing";
import { requirePathAccess } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/db/client";

const COLUMNS = [
  { header: "Ürün Adı", key: "name", width: 30 },
  { header: "Kategori", key: "category", width: 20 },
  { header: "Fiyat (₺)", key: "price", width: 12 },
  { header: "KDV (%)", key: "vat", width: 10 },
];

/** Menü ürünleri: `?template=1` boş şablon, aksi hâlde mevcut menü aynı biçimde. */
export async function GET(request: Request) {
  if (!(await requirePathAccess("/recipes"))) {
    return new NextResponse(null, { status: 403 });
  }
  const isTemplate = new URL(request.url).searchParams.get("template") === "1";

  let rows: Record<string, string | number>[] = [];
  if (isTemplate) {
    rows = [{ name: "Örnek Ürün", category: "Ana Yemek", price: 150, vat: 10 }];
  } else {
    const supabase = await createClient();
    const [{ data: items }, { data: prices }] = await Promise.all([
      supabase.from("menu_items").select("id, name, categories(name)").eq("is_active", true).order("name"),
      supabase
        .from("menu_prices")
        .select("menu_item_id, price, vat_rate, branch_id, valid_from")
        .is("branch_id", null),
    ]);
    // Toplu düzenleme yalnızca genel (şubesiz) fiyatları kapsar.
    const priceByItem = currentPrices(prices ?? [], null);
    rows = (items ?? []).map((item) => {
      const priceInfo = priceByItem.get(item.id);
      return {
        name: item.name,
        category: item.categories?.name ?? "",
        price: priceInfo?.price ?? "",
        vat: priceInfo?.vatRate ?? "",
      };
    });
  }

  const buffer = await buildWorkbookBuffer("Menü Ürünleri", COLUMNS, rows);
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="menu-urunleri${isTemplate ? "-sablon" : ""}.xlsx"`,
    },
  });
}

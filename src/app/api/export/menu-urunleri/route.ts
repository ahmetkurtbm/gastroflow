import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  { header: "Ürün Adı", key: "name", width: 30 },
  { header: "Kategori", key: "category", width: 20 },
  { header: "Fiyat (₺)", key: "price", width: 12 },
  { header: "KDV (%)", key: "vat", width: 10 },
];

/**
 * Menü ürünlerini Excel olarak indirir — hem "boş şablon" (query'siz)
 * hem "mevcut menüyü dışa aktar/toplu düzenle" (aynı format) aynı yol.
 * `?template=1` ile boş, örnek bir satırlı şablon döner.
 */
export async function GET(request: Request) {
  await requireAppUser();
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
        .is("branch_id", null)
        .order("valid_from", { ascending: false }),
    ]);
    // Yalnızca genel (şubesiz) fiyat dışa aktarılıyor — şube bazlı istisnalar
    // bu toplu düzenleme akışının kapsamı dışında, elle yönetilmeye devam eder.
    const priceByItem = new Map<string, { price: number; vat: number }>();
    for (const p of prices ?? []) {
      if (!priceByItem.has(p.menu_item_id)) {
        priceByItem.set(p.menu_item_id, { price: Number(p.price), vat: Number(p.vat_rate) });
      }
    }
    rows = (items ?? []).map((item) => {
      const priceInfo = priceByItem.get(item.id);
      return {
        name: item.name,
        category: item.categories?.name ?? "",
        price: priceInfo?.price ?? "",
        vat: priceInfo?.vat ?? "",
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

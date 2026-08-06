import {
  costOfRecipe,
  type Catalog,
  type Ingredient,
  type Recipe,
  type RecipeLine,
} from "@/core/recipe";
import type { UnitConversion } from "@/core/units";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Veritabanı ile saf maliyet motoru (`src/core`) arasındaki köprü.
 *
 * Motor veritabanı bilmiyor — bilerek. Bu dosya tek yönlü bir çevirmen:
 * satırları okur, `Catalog` tipine dönüştürür. Motorun testleri bu katmana
 * hiç uğramadan çalışabildiği için maliyet matematiği veritabanı olmadan
 * doğrulanabiliyor.
 *
 * Sayısal alanlar hakkında: PostgREST `numeric` kolonlarını STRING olarak
 * taşıyor (hassasiyet kaybolmasın diye). Number()'a çevirmeyi unutmak,
 * "600" + 380 = "600380" gibi sessiz saçmalıklara yol açar.
 */

export type RecipeSummary = {
  id: string;
  name: string;
  menuItemId: string | null;
  versionId: string;
  versionNo: number;
  status: "draft" | "active" | "archived";
  yieldQuantity: number;
  yieldUnit: string;
  /** Menü ürününe bağlıysa güncel satış fiyatı (TL). */
  sellingPrice: number | null;
  /** Satılan bir ürün mü, yoksa yarı mamul mü? */
  isSubRecipe: boolean;
  /** Menü ürününün fotoğrafı (varsa) — bkz. migration 0014. */
  imageUrl: string | null;
};

export type CatalogSnapshot = {
  catalog: Catalog;
  summaries: RecipeSummary[];
};

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * İşletmenin tüm aktif reçetelerini ve hammaddelerini tek seferde okur.
 *
 * Reçete ağacı özyinelemeli olduğu için parça parça okumak N+1 sorgu
 * doğururdu; motorun zaten tamamına ihtiyacı var.
 */
export async function loadCatalog(
  options: {
    /**
     * Bu reçete için (varsa) YAYINLANMAMIŞ taslak versiyonu kullan.
     *
     * Düzenleme ekranında maliyeti canlı göstermek için: malzeme eklerken
     * maliyetin nereye gittiğini görmek, yayınladıktan sonra öğrenmekten
     * çok daha faydalı.
     */
    preferDraftFor?: string;
    /**
     * Alternatif Supabase istemcisi. Varsayılan, çağıran kullanıcının oturumunu
     * (ve RLS'ini) kullanır. `createServiceRoleClient()` geçirmek gerekiyorsa
     * sebebi şu olmalı: çağıran, `can_read_costs()` yetkisi olmayan bir rol
     * (ör. kasiyer) adına ÇALIŞAN bir sistem sürecidir — bkz.
     * src/lib/inventory/depletion.ts.
     */
    client?: SupabaseClient<Database>;
  } = {},
): Promise<CatalogSnapshot> {
  const supabase = options.client ?? (await createClient());

  const [itemsResult, conversionsResult, recipesResult, versionsResult, pricesResult, menuItemsResult] =
    await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, name, base_unit, cost_per_base_unit")
        .eq("is_active", true),
      supabase
        .from("item_unit_conversions")
        .select("inventory_item_id, from_unit, to_unit, factor"),
      supabase.from("recipes").select("id, name, menu_item_id").eq("is_active", true),
      supabase
        .from("recipe_versions")
        .select(
          "id, recipe_id, version_no, status, yield_quantity, yield_unit, recipe_lines(line_no, component_type, inventory_item_id, sub_recipe_id, quantity, unit, waste_percent)",
        )
        .in("status", options.preferDraftFor ? ["active", "draft"] : ["active"]),
      supabase
        .from("menu_prices")
        .select("menu_item_id, price, valid_from")
        .order("valid_from", { ascending: false }),
      supabase.from("menu_items").select("id, image_url"),
    ]);

  const conversionsByItem = new Map<string, UnitConversion[]>();
  for (const row of conversionsResult.data ?? []) {
    const list = conversionsByItem.get(row.inventory_item_id) ?? [];
    list.push({
      from: row.from_unit,
      to: row.to_unit,
      factor: toNumber(row.factor),
    });
    conversionsByItem.set(row.inventory_item_id, list);
  }

  const ingredients: Ingredient[] = (itemsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    costUnit: row.base_unit,
    costPerUnit: toNumber(row.cost_per_base_unit),
    conversions: conversionsByItem.get(row.id) ?? [],
  }));

  // Bir menü ürününün güncel fiyatı = valid_from'u en yeni olan kayıt.
  // Sorgu zaten tarihe göre azalan sıralı, ilk gördüğümüz doğru olan.
  const priceByMenuItem = new Map<string, number>();
  for (const row of pricesResult.data ?? []) {
    if (!priceByMenuItem.has(row.menu_item_id)) {
      priceByMenuItem.set(row.menu_item_id, toNumber(row.price));
    }
  }

  const recipeMeta = new Map(
    (recipesResult.data ?? []).map((row) => [row.id, row] as const),
  );
  const imageUrlByMenuItem = new Map(
    (menuItemsResult.data ?? []).map((row) => [row.id, row.image_url] as const),
  );

  const recipes: Recipe[] = [];
  const summaries: RecipeSummary[] = [];

  // Reçete başına tek versiyon seç. Hedef reçetede taslak varsa onu, aksi
  // hâlde yayınlanmış olanı kullan. Aynı reçetenin iki versiyonunu birden
  // motora vermek "yinelenen kimlik" hatası verirdi.
  type VersionRow = NonNullable<typeof versionsResult.data>[number];
  const chosen = new Map<string, VersionRow>();
  for (const version of versionsResult.data ?? []) {
    // Düzenlenen reçetede taslağı, diğerlerinde yayınlanmış olanı isteriz.
    // Yayınlanmamış bir yarı mamul de listeye girer (tek versiyonu taslaksa);
    // aksi hâlde onu kullanan reçete "bulunamadı" hatası verirdi.
    const wanted =
      options.preferDraftFor === version.recipe_id ? "draft" : "active";

    const current = chosen.get(version.recipe_id);
    if (!current) {
      chosen.set(version.recipe_id, version);
    } else if (version.status === wanted && current.status !== wanted) {
      chosen.set(version.recipe_id, version);
    }
  }

  for (const version of chosen.values()) {
    const meta = recipeMeta.get(version.recipe_id);
    if (!meta) continue; // Pasife alınmış reçetenin versiyonu

    const lines: RecipeLine[] = [...(version.recipe_lines ?? [])]
      .sort((a, b) => a.line_no - b.line_no)
      .map((line) => ({
        ref:
          line.component_type === "ingredient"
            ? { kind: "ingredient" as const, id: line.inventory_item_id ?? "" }
            : { kind: "recipe" as const, id: line.sub_recipe_id ?? "" },
        quantity: toNumber(line.quantity),
        unit: line.unit,
        wastePercent: toNumber(line.waste_percent),
      }));

    recipes.push({
      id: meta.id,
      name: meta.name,
      yieldQuantity: toNumber(version.yield_quantity),
      yieldUnit: version.yield_unit,
      lines,
    });

    summaries.push({
      id: meta.id,
      name: meta.name,
      menuItemId: meta.menu_item_id,
      versionId: version.id,
      versionNo: version.version_no,
      status: version.status,
      yieldQuantity: toNumber(version.yield_quantity),
      yieldUnit: version.yield_unit,
      sellingPrice: meta.menu_item_id
        ? (priceByMenuItem.get(meta.menu_item_id) ?? null)
        : null,
      isSubRecipe: meta.menu_item_id === null,
      imageUrl: meta.menu_item_id ? (imageUrlByMenuItem.get(meta.menu_item_id) ?? null) : null,
    });
  }

  summaries.sort((a, b) => {
    // Satılan ürünler önce, sonra yarı mamuller; her grup kendi içinde alfabetik.
    if (a.isSubRecipe !== b.isSubRecipe) return a.isSubRecipe ? 1 : -1;
    return a.name.localeCompare(b.name, "tr");
  });

  return { catalog: { ingredients, recipes }, summaries };
}

export type RecipeCostResult =
  | { ok: true; cost: number; costPerYieldUnit: number }
  | { ok: false; error: string };

/**
 * Maliyeti hesaplar ama hata fırlatmaz.
 *
 * Liste ekranında tek bir bozuk reçetenin (eksik dönüşüm tanımı, döngü)
 * tüm sayfayı çökertmesini istemiyoruz; o satır hatasını gösterip diğerleri
 * çalışmaya devam etsin.
 */
export function safeCost(recipeId: string, catalog: Catalog): RecipeCostResult {
  try {
    const breakdown = costOfRecipe(recipeId, catalog);
    return {
      ok: true,
      cost: breakdown.totalCost,
      costPerYieldUnit: breakdown.costPerYieldUnit,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Maliyet hesaplanamadı.",
    };
  }
}

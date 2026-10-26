import {
  costOfRecipe,
  type Catalog,
  type Ingredient,
  type Recipe,
  type RecipeLine,
} from "@/core/recipe";
import { currentPrices } from "@/core/pricing";
import type { UnitConversion } from "@/core/units";
import { createClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Veritabanı satırlarını saf maliyet motorunun (`src/core`) `Catalog` tipine
 * çevirir. PostgREST `numeric` değerlerini string döndürdüğü için hepsi
 * sayıya çevrilir.
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
  imageUrl: string | null;
};

export type CatalogSnapshot = {
  catalog: Catalog;
  summaries: RecipeSummary[];
};

function toNumber(value: string | number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** İşletmenin aktif reçetelerini ve hammaddelerini tek seferde okur; ağaç özyinelemeli. */
export async function loadCatalog(
  options: {
    /** Bu reçetenin yayınlanmamış taslağını kullan (düzenlerken canlı maliyet için). */
    preferDraftFor?: string;
    /**
     * Varsayılan istemci çağıranın RLS'ine tabidir. Service role yalnızca
     * maliyet okuma yetkisi olmayan bir rol adına çalışan sistem süreci
     * içindir (bkz. inventory/depletion.ts).
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
        .select("menu_item_id, price, branch_id, valid_from"),
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

  // Maliyet ekranı şubeden bağımsızdır; genel menü fiyatı kullanılır.
  const priceByMenuItem = new Map(
    [...currentPrices(pricesResult.data ?? [], null)].map(([id, p]) => [id, p.price] as const),
  );

  const recipeMeta = new Map(
    (recipesResult.data ?? []).map((row) => [row.id, row] as const),
  );
  const imageUrlByMenuItem = new Map(
    (menuItemsResult.data ?? []).map((row) => [row.id, row.image_url] as const),
  );

  const recipes: Recipe[] = [];
  const summaries: RecipeSummary[] = [];

  // Reçete başına tek versiyon: düzenlenende taslak, diğerlerinde yayınlanmış.
  type VersionRow = NonNullable<typeof versionsResult.data>[number];
  const chosen = new Map<string, VersionRow>();
  for (const version of versionsResult.data ?? []) {
    // Tek versiyonu taslak olan yarı mamul de listeye girer; yoksa onu kullanan
    // reçete "bulunamadı" hatası verirdi.
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

/** Maliyeti hata fırlatmadan hesaplar; bozuk bir reçete listeyi çökertmesin. */
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

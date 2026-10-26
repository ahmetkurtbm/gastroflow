import "server-only";

import { explodeToIngredients } from "@/core/recipe";
import { convert } from "@/core/units";
import { loadCatalog } from "@/lib/recipes/catalog";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Adisyon kapanınca satıştan stok düşer. Her satır satış anında dondurulan
 * reçete versiyonuyla açılır. Ödemenin sistem yan etkisi olduğu için service
 * role kullanılır; kasiyere stok yazma yetkisi verilmez.
 */

type LineToProcess = {
  orderLineId: string;
  recipeVersionId: string;
  quantitySold: number;
};

export async function depleteOrderStock(orderId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: order } = await supabase
    .from("orders")
    .select("tenant_id, branch_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const { data: lines } = await supabase
    .from("order_lines")
    .select("id, recipe_version_id, quantity, status")
    .eq("order_id", orderId)
    .neq("status", "cancelled")
    .not("recipe_version_id", "is", null);

  const toProcess: LineToProcess[] = (lines ?? [])
    .filter((l): l is typeof l & { recipe_version_id: string } => l.recipe_version_id !== null)
    .map((l) => ({
      orderLineId: l.id,
      recipeVersionId: l.recipe_version_id,
      quantitySold: Number(l.quantity),
    }));

  if (toProcess.length === 0) return;

  // Şube başına şimdilik tek stok lokasyonu var.
  const { data: location } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("branch_id", order.branch_id)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!location) return; // Şube için henüz lokasyon tanımlanmamış — sessizce atla.

  const { catalog } = await loadCatalog({ client: supabase });
  const recipesById = new Map(catalog.recipes.map((r) => [r.id, r]));
  const ingredientsById = new Map(catalog.ingredients.map((i) => [i.id, i]));

  const versionIds = [...new Set(toProcess.map((l) => l.recipeVersionId))];
  const { data: versions } = await supabase
    .from("recipe_versions")
    .select(
      "id, recipe_id, yield_quantity, yield_unit, recipe_lines(component_type, inventory_item_id, sub_recipe_id, quantity, unit, waste_percent)",
    )
    .in("id", versionIds);

  for (const version of versions ?? []) {
    const recipe = recipesById.get(version.recipe_id);
    if (!recipe) continue; // Reçete o sırada pasife alınmış olabilir.

    // Üst reçete dondurulmuş satırlarıyla değiştirilir; alt reçeteler güncel
    // aktif versiyondan okunur.
    recipesById.set(version.recipe_id, {
      ...recipe,
      yieldQuantity: Number(version.yield_quantity),
      yieldUnit: version.yield_unit,
      lines: (version.recipe_lines ?? []).map((line) => ({
        ref:
          line.component_type === "ingredient"
            ? { kind: "ingredient" as const, id: line.inventory_item_id ?? "" }
            : { kind: "recipe" as const, id: line.sub_recipe_id ?? "" },
        quantity: Number(line.quantity),
        unit: line.unit,
        wastePercent: Number(line.waste_percent),
      })),
    });
  }

  const patchedCatalog = { ingredients: catalog.ingredients, recipes: [...recipesById.values()] };

  // Unique kısıt idempotency sağlar: aynı satır ikinci kez işlenirse 23505 döner.
  for (const line of toProcess) {
    const version = versions?.find((v) => v.id === line.recipeVersionId);
    if (!version) continue;

    let needed: Map<string, { quantity: number; unit: string }>;
    try {
      needed = explodeToIngredients(version.recipe_id, patchedCatalog, line.quantitySold);
    } catch {
      // Bozuk reçete bu satırı atlatır; hata /recipes ekranında görünür.
      continue;
    }

    for (const [inventoryItemId, usage] of needed) {
      const item = ingredientsById.get(inventoryItemId);
      if (!item) continue;

      const quantityInBaseUnit = convert(
        usage.quantity,
        usage.unit,
        item.costUnit,
        item.conversions ?? [],
      );

      const { error } = await supabase.from("stock_movements").insert({
        tenant_id: order.tenant_id,
        branch_id: order.branch_id,
        location_id: location.id,
        inventory_item_id: inventoryItemId,
        movement_type: "sale_out",
        quantity: -quantityInBaseUnit,
        reference_type: "order_line",
        reference_id: line.orderLineId,
      });

      if (error && error.code !== "23505") {
        throw new Error(
          `Stok düşümü başarısız (satır ${line.orderLineId}, ürün ${item.name}): ${error.message}`,
        );
      }
    }
  }
}

import "server-only";

import { explodeToIngredients } from "@/core/recipe";
import { convert } from "@/core/units";
import { loadCatalog } from "@/lib/recipes/catalog";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Satıştan otomatik stok düşümü.
 *
 * Adisyon kapandığında çağrılır (bkz. `src/lib/cash/actions.ts`). Her satırın
 * reçetesi, SATIŞ ANINDA DONDURULMUŞ versiyonuyla (`order_lines.recipe_version_id`)
 * açılır — "dün satılan pizza dünkü gramajıyla düşülmeli" ilkesi.
 *
 * Reçete matematiği tekrar yazılmıyor: `explodeToIngredients` (src/core/recipe.ts,
 * Faz 1'de test edilmiş) aynen kullanılıyor. Buradaki tek iş, dondurulmuş
 * versiyonun satırlarını geçici olarak kataloğa yerleştirip mevcut motoru
 * çağırmak.
 *
 * `service_role` KULLANILIYOR: depletion bir garsonun/kasiyerin doğrudan
 * eylemi değil, ödemenin bir YAN ETKİSİ. Kasiyere stok yazma yetkisi vermek
 * (RLS `can_write_stock()`) gerçek yetkilerini gereksiz genişletirdi.
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

  // Ana depo: Faz 3'ün bu ilk sürümünde şube başına tek lokasyon kullanılıyor.
  // Mutfak/bar arası transfer ayrı bir iş (bkz. proje panosu) — o geldiğinde
  // "hangi lokasyondan düşülür" sorusu reçeteye bağlı hâle gelecek.
  const { data: location } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("branch_id", order.branch_id)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!location) return; // Şube için henüz lokasyon tanımlanmamış — sessizce atla.

  // `loadCatalog()` normalde çağıranın oturumunu kullanır ve `can_read_costs()`
  // gerektirir — kasiyer/garson bu yetkiye sahip değil. Depletion bir sistem
  // yan etkisi olduğu için burada da service_role kullanıyoruz.
  const { catalog } = await loadCatalog({ client: supabase });
  const recipesById = new Map(catalog.recipes.map((r) => [r.id, r]));
  const ingredientsById = new Map(catalog.ingredients.map((i) => [i.id, i]));

  // Dondurulmuş versiyonların gerçek satırlarını çek; her biri farklı bir
  // recipe_id'ye (menü ürününe) ait olabilir.
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

    // Katalogdaki (güncel aktif) versiyonu, dondurulmuş versiyonun satırlarıyla
    // GEÇİCİ olarak değiştiriyoruz. Alt reçeteler (sos, hamur) hâlâ güncel aktif
    // versiyonlarından okunur — bilinçli basitleştirme: alt reçete değişikliği
    // üst reçeteninki kadar sık olmuyor ve her satışın tüm ağacını versiyonlamak
    // bu aşamada gereksiz karmaşıklık olurdu.
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

  // reference_type/reference_id/inventory_item_id üzerindeki unique kısıt
  // idempotency'yi sağlıyor: aynı satırı iki kez işlemek (ör. ödeme kapanışı
  // yeniden denenirse) ikinci denemede 23505 döner, biz onu yutuyoruz.
  for (const line of toProcess) {
    const version = versions?.find((v) => v.id === line.recipeVersionId);
    if (!version) continue;

    let needed: Map<string, { quantity: number; unit: string }>;
    try {
      needed = explodeToIngredients(version.recipe_id, patchedCatalog, line.quantitySold);
    } catch {
      // Bozuk/döngüsel reçete: bu satırı atla, diğerlerini engelleme. Sorun
      // /recipes ekranında zaten görünür oluyor (safeCost aynı hatayı yakalar).
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

      // 23505 = zaten işlenmiş, sorun değil. Başka bir hata sessizce yutulmaz.
      if (error && error.code !== "23505") {
        throw new Error(
          `Stok düşümü başarısız (satır ${line.orderLineId}, ürün ${item.name}): ${error.message}`,
        );
      }
    }
  }
}

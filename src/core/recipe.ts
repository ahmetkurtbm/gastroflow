/**
 * Reçete ağacı ve maliyet hesabı.
 *
 * Bir menü ürününün gerçek maliyeti, hammaddelerinin ve yarı mamullerinin
 * ağacını sonuna kadar açmakla bulunur. "Margarita pizza" → hamur (yarı mamul)
 * + mozzarella + sos (yarı mamul) → sos da domates + zeytinyağı + tuz...
 *
 * Hesap sadece bir sayı değil, bir DÖKÜM döndürür. Sebebi: patron "bu pizza neden
 * 40 lira maliyetli?" diye sorduğunda cevabın "peynir %60'ını yiyor" olması gerekiyor.
 * Tek sayı veren sistemler bu soruya cevap veremiyor.
 *
 * Para birimi notu: buradaki tüm tutarlar ondalık TL (`number`). Ara değerler
 * çok küçük olabildiği için `Money`'ye yuvarlanmıyor — bkz. `money.ts` başındaki
 * açıklama. Yuvarlama yalnızca gösterim ve kayıt anında yapılır.
 */

import { convert, type UnitCode, type UnitConversion } from "./units";

/** Ağaç bu derinliği aşarsa tanımda bir sorun var demektir. */
const MAX_DEPTH = 12;

export class RecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeError";
  }
}

export type Ingredient = {
  readonly id: string;
  readonly name: string;
  /** Maliyetin tanımlı olduğu birim, ör. "kg". */
  readonly costUnit: UnitCode;
  /** `costUnit` başına TL. Ör. 30 → kg'ı 30 TL. */
  readonly costPerUnit: number;
  /** Ambalaj, yoğunluk, birim ağırlık gibi ürüne özel dönüşümler. */
  readonly conversions?: readonly UnitConversion[];
};

export type RecipeLine = {
  /** Hammadde mi, yarı mamul mü? */
  readonly ref:
    | { readonly kind: "ingredient"; readonly id: string }
    | { readonly kind: "recipe"; readonly id: string };
  readonly quantity: number;
  readonly unit: UnitCode;
  /**
   * Fire yüzdesi (0–100). Reçetedeki miktar TEMİZLENMİŞ/KULLANILABİLİR miktardır;
   * fire, ona ulaşmak için ne kadar ham malzeme gerektiğini belirler.
   *
   * Örnek: 100 g doğranmış soğan, %20 fire → 100 ÷ 0,8 = 125 g ham soğan almalısın.
   *
   * DİKKAT: yaygın hata `100 × 1,20 = 120` hesabıdır. Yanlıştır ve maliyeti
   * sistematik olarak olduğundan düşük gösterir. Fire arttıkça sapma büyür:
   * %50 fire'de doğru cevap 200, yanlış cevap 150'dir.
   */
  readonly wastePercent?: number;
};

export type Recipe = {
  readonly id: string;
  readonly name: string;
  /** Bu reçete bir kez uygulandığında kaç birim çıktı verir. */
  readonly yieldQuantity: number;
  readonly yieldUnit: UnitCode;
  readonly lines: readonly RecipeLine[];
};

export type Catalog = {
  readonly ingredients: readonly Ingredient[];
  readonly recipes: readonly Recipe[];
};

export type CostLine = {
  readonly label: string;
  /** Reçetede yazan miktar (fire hariç). */
  readonly quantity: number;
  readonly unit: UnitCode;
  /** Fire dahil, gerçekte tüketilen miktar. */
  readonly effectiveQuantity: number;
  readonly cost: number;
  /** Bu satırın reçete toplamındaki payı (0–1). */
  readonly share: number;
  /** Yarı mamulse alt dökümü. */
  readonly breakdown?: CostBreakdown;
};

export type CostBreakdown = {
  readonly recipeId: string;
  readonly name: string;
  /** Reçetenin tamamının (yieldQuantity kadar çıktının) maliyeti. */
  readonly totalCost: number;
  /** 1 `yieldUnit` çıktının maliyeti. */
  readonly costPerYieldUnit: number;
  readonly yieldQuantity: number;
  readonly yieldUnit: UnitCode;
  readonly lines: readonly CostLine[];
};

function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) {
      throw new RecipeError(`Katalogda yinelenen kimlik: ${item.id}.`);
    }
    map.set(item.id, item);
  }
  return map;
}

/**
 * Fire uygulanmış gerçek miktar.
 *
 * `kullanılabilir ÷ (1 − fire)` — yani "elime bu kadar temiz ürün geçmesi için
 * ne kadar ham ürün harcamalıyım?" sorusunun cevabı.
 */
export function applyWaste(quantity: number, wastePercent = 0): number {
  if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent >= 100) {
    throw new RecipeError(
      `Fire yüzdesi 0 ile 100 arasında olmalı (100 hariç): ${wastePercent}.`,
    );
  }
  return quantity / (1 - wastePercent / 100);
}

function costOfIngredientLine(
  ingredient: Ingredient,
  line: RecipeLine,
): { effectiveQuantity: number; cost: number } {
  const effectiveQuantity = applyWaste(line.quantity, line.wastePercent);

  // Reçetedeki birimi, malzemenin fiyatlandığı birime çeviriyoruz.
  // Çevrilemiyorsa hata veriyoruz — tahmin yürütmek yanlış maliyet demek.
  const quantityInCostUnit = convert(
    effectiveQuantity,
    line.unit,
    ingredient.costUnit,
    ingredient.conversions ?? [],
  );

  return {
    effectiveQuantity,
    cost: quantityInCostUnit * ingredient.costPerUnit,
  };
}

function build(
  recipeId: string,
  recipes: Map<string, Recipe>,
  ingredients: Map<string, Ingredient>,
  ancestry: readonly string[],
): CostBreakdown {
  const recipe = recipes.get(recipeId);
  if (!recipe) {
    throw new RecipeError(`Reçete bulunamadı: ${recipeId}.`);
  }

  // Döngü kontrolü: A → B → A tanımı sonsuz özyinelemeye girerdi.
  if (ancestry.includes(recipeId)) {
    throw new RecipeError(
      `Reçete kendini içeriyor: ${[...ancestry, recipeId].join(" → ")}.`,
    );
  }
  if (ancestry.length >= MAX_DEPTH) {
    throw new RecipeError(
      `Reçete ağacı çok derin (${MAX_DEPTH} kat). Tanımda bir hata olabilir.`,
    );
  }
  if (!Number.isFinite(recipe.yieldQuantity) || recipe.yieldQuantity <= 0) {
    throw new RecipeError(
      `"${recipe.name}" reçetesinin çıktı miktarı sıfırdan büyük olmalı: ${recipe.yieldQuantity}.`,
    );
  }

  const nextAncestry = [...ancestry, recipeId];

  const partial = recipe.lines.map((line) => {
    if (line.ref.kind === "ingredient") {
      const ingredient = ingredients.get(line.ref.id);
      if (!ingredient) {
        throw new RecipeError(
          `"${recipe.name}" reçetesinde tanımsız hammadde: ${line.ref.id}.`,
        );
      }
      const { effectiveQuantity, cost } = costOfIngredientLine(ingredient, line);
      return { label: ingredient.name, line, effectiveQuantity, cost };
    }

    const breakdown = build(line.ref.id, recipes, ingredients, nextAncestry);
    const effectiveQuantity = applyWaste(line.quantity, line.wastePercent);

    // Alt reçetenin birim maliyeti kendi çıktı biriminde tanımlı; istenen
    // miktarı o birime çeviriyoruz (ör. sos reçetesi lt üretiyor, pizza ml istiyor).
    const quantityInYieldUnit = convert(
      effectiveQuantity,
      line.unit,
      breakdown.yieldUnit,
    );

    return {
      label: breakdown.name,
      line,
      effectiveQuantity,
      cost: quantityInYieldUnit * breakdown.costPerYieldUnit,
      breakdown,
    };
  });

  const totalCost = partial.reduce((sum, item) => sum + item.cost, 0);

  const lines: CostLine[] = partial.map((item) => ({
    label: item.label,
    quantity: item.line.quantity,
    unit: item.line.unit,
    effectiveQuantity: item.effectiveQuantity,
    cost: item.cost,
    // Sıfır maliyetli reçetede 0/0 = NaN olmasın.
    share: totalCost === 0 ? 0 : item.cost / totalCost,
    breakdown: item.breakdown,
  }));

  return {
    recipeId: recipe.id,
    name: recipe.name,
    totalCost,
    costPerYieldUnit: totalCost / recipe.yieldQuantity,
    yieldQuantity: recipe.yieldQuantity,
    yieldUnit: recipe.yieldUnit,
    lines,
  };
}

/** Bir reçetenin maliyet dökümünü, yarı mamulleri de açarak hesaplar. */
export function costOfRecipe(recipeId: string, catalog: Catalog): CostBreakdown {
  return build(
    recipeId,
    indexById(catalog.recipes),
    indexById(catalog.ingredients),
    [],
  );
}

/**
 * Food cost oranı: maliyetin satış fiyatına bölümü (0–1).
 *
 * Sektörde tipik hedef %25–35'tir. Bunun üstü ya fiyatın düşük ya porsiyonun
 * cömert ya da tedarik maliyetinin kaçmış olduğunu söyler.
 */
export function foodCostRatio(cost: number, sellingPriceLira: number): number {
  if (!Number.isFinite(sellingPriceLira) || sellingPriceLira <= 0) {
    throw new RecipeError(
      `Satış fiyatı sıfırdan büyük olmalı: ${sellingPriceLira}.`,
    );
  }
  return cost / sellingPriceLira;
}

/** Hedef food cost oranına ulaşmak için gereken satış fiyatı. */
export function priceForTargetFoodCost(
  cost: number,
  targetRatio: number,
): number {
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio > 1) {
    throw new RecipeError(
      `Hedef oran 0 ile 1 arasında olmalı: ${targetRatio}.`,
    );
  }
  return cost / targetRatio;
}

/**
 * Ağacı düzleştirip hammadde bazında toplam tüketimi verir.
 *
 * Stok düşümü (Faz 3) bunu kullanacak: bir pizza satıldığında hangi hammaddeden
 * kaç birim düşüleceği buradan çıkıyor. Aynı hammadde ağacın farklı dallarında
 * geçiyorsa (sosta da, üstünde de zeytinyağı) miktarlar toplanır.
 */
export function explodeToIngredients(
  recipeId: string,
  catalog: Catalog,
  outputQuantity?: number,
): Map<string, { quantity: number; unit: UnitCode; name: string }> {
  const ingredients = indexById(catalog.ingredients);
  const recipes = indexById(catalog.recipes);
  const totals = new Map<string, { quantity: number; unit: UnitCode; name: string }>();

  const walk = (id: string, multiplier: number, ancestry: readonly string[]) => {
    const recipe = recipes.get(id);
    if (!recipe) throw new RecipeError(`Reçete bulunamadı: ${id}.`);
    if (ancestry.includes(id)) {
      throw new RecipeError(
        `Reçete kendini içeriyor: ${[...ancestry, id].join(" → ")}.`,
      );
    }
    if (ancestry.length >= MAX_DEPTH) {
      throw new RecipeError(`Reçete ağacı çok derin (${MAX_DEPTH} kat).`);
    }

    const nextAncestry = [...ancestry, id];

    for (const line of recipe.lines) {
      const effective = applyWaste(line.quantity, line.wastePercent) * multiplier;

      if (line.ref.kind === "ingredient") {
        const ingredient = ingredients.get(line.ref.id);
        if (!ingredient) {
          throw new RecipeError(
            `"${recipe.name}" reçetesinde tanımsız hammadde: ${line.ref.id}.`,
          );
        }

        const existing = totals.get(ingredient.id);
        if (existing) {
          // Farklı dallarda farklı birim kullanılmış olabilir; ilk görülen
          // birime çeviriyoruz ki toplam anlamlı olsun.
          existing.quantity += convert(
            effective,
            line.unit,
            existing.unit,
            ingredient.conversions ?? [],
          );
        } else {
          totals.set(ingredient.id, {
            quantity: effective,
            unit: line.unit,
            name: ingredient.name,
          });
        }
        continue;
      }

      const sub = recipes.get(line.ref.id);
      if (!sub) throw new RecipeError(`Reçete bulunamadı: ${line.ref.id}.`);

      // Alt reçeteden ne kadar çıktı istendiğini, onun kendi çıktı biriminde
      // hesaplayıp "kaç kez uygulanmalı" katsayısına çeviriyoruz.
      const neededInYieldUnit = convert(effective, line.unit, sub.yieldUnit);
      walk(sub.id, neededInYieldUnit / sub.yieldQuantity, nextAncestry);
    }
  };

  const root = recipes.get(recipeId);
  if (!root) throw new RecipeError(`Reçete bulunamadı: ${recipeId}.`);

  const batches = (outputQuantity ?? root.yieldQuantity) / root.yieldQuantity;
  walk(recipeId, batches, []);

  return totals;
}

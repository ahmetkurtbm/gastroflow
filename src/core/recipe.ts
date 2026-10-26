/**
 * Reçete ağacı ve maliyet hesabı. Yarı mamuller sonuna kadar açılır ve sonuç
 * tek bir sayı değil, satır satır bir döküm olarak döner. Tutarlar ondalık TL'dir;
 * ara değerler `Money`'ye yuvarlanmaz (bkz. money.ts).
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
   * Fire yüzdesi (0–100). Reçetedeki miktar temizlenmiş miktardır; ham miktar
   * `miktar ÷ (1 − fire)` ile bulunur (%20 fire'de 100 g → 125 g, 120 g değil).
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

/** Fire uygulanmış ham miktar: `kullanılabilir ÷ (1 − fire)`. */
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

    // Alt reçetenin maliyeti kendi çıktı birimindedir (sos lt üretir, pizza ml ister).
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

/** Food cost oranı: maliyet ÷ satış fiyatı (0–1). */
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
 * Ağacı düzleştirip hammadde bazında toplam tüketimi verir; stok düşümü bunu
 * kullanır. Aynı hammadde farklı dallarda geçiyorsa miktarlar toplanır.
 */export function explodeToIngredients(
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
          // Dallar farklı birim kullanabilir; toplam ilk görülen birimde tutulur.
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

      // İstenen miktar alt reçetenin kaç kez uygulanacağına çevrilir.
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

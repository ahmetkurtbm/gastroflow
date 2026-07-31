import { describe, expect, it } from "vitest";

import {
  RecipeError,
  applyWaste,
  costOfRecipe,
  explodeToIngredients,
  foodCostRatio,
  priceForTargetFoodCost,
  type Catalog,
} from "./recipe";

/**
 * Gerçekçi bir örnek: Margarita pizza.
 * Hamur ve sos yarı mamul; sos da kendi içinde hammaddelerden oluşuyor.
 */
const catalog: Catalog = {
  ingredients: [
    { id: "un", name: "Un", costUnit: "kg", costPerUnit: 30 },
    { id: "su", name: "Su", costUnit: "lt", costPerUnit: 0 },
    { id: "maya", name: "Maya", costUnit: "kg", costPerUnit: 200 },
    { id: "tuz", name: "Tuz", costUnit: "kg", costPerUnit: 10 },
    { id: "mozzarella", name: "Mozzarella", costUnit: "kg", costPerUnit: 300 },
    { id: "domates", name: "Domates", costUnit: "kg", costPerUnit: 40 },
    {
      id: "zeytinyagi",
      name: "Zeytinyağı",
      costUnit: "lt",
      costPerUnit: 250,
      // Yoğunluk: reçetede gram, fiyat litre üzerinden.
      conversions: [{ from: "lt", to: "g", factor: 916 }],
    },
  ],
  recipes: [
    {
      id: "hamur",
      name: "Pizza hamuru",
      yieldQuantity: 1000,
      yieldUnit: "g",
      lines: [
        { ref: { kind: "ingredient", id: "un" }, quantity: 600, unit: "g" },
        { ref: { kind: "ingredient", id: "su" }, quantity: 380, unit: "ml" },
        { ref: { kind: "ingredient", id: "maya" }, quantity: 5, unit: "g" },
        { ref: { kind: "ingredient", id: "tuz" }, quantity: 15, unit: "g" },
      ],
    },
    {
      id: "sos",
      name: "Pizza sosu",
      yieldQuantity: 1,
      yieldUnit: "lt",
      lines: [
        {
          ref: { kind: "ingredient", id: "domates" },
          quantity: 1000,
          unit: "g",
          // Domatesin kabuğu ve sapı atılıyor.
          wastePercent: 10,
        },
        { ref: { kind: "ingredient", id: "zeytinyagi" }, quantity: 50, unit: "g" },
        { ref: { kind: "ingredient", id: "tuz" }, quantity: 10, unit: "g" },
      ],
    },
    {
      id: "margarita",
      name: "Margarita pizza",
      yieldQuantity: 1,
      yieldUnit: "adet",
      lines: [
        { ref: { kind: "recipe", id: "hamur" }, quantity: 250, unit: "g" },
        { ref: { kind: "recipe", id: "sos" }, quantity: 80, unit: "ml" },
        { ref: { kind: "ingredient", id: "mozzarella" }, quantity: 150, unit: "g" },
      ],
    },
  ],
};

describe("applyWaste", () => {
  it("firesiz miktarı değiştirmez", () => {
    expect(applyWaste(100)).toBe(100);
    expect(applyWaste(100, 0)).toBe(100);
  });

  it("kullanılabilir miktara ulaşmak için gereken ham miktarı verir", () => {
    // 100 g temiz soğan için %20 fire varsa 125 g ham soğan gerekir.
    // Yaygın YANLIŞ hesap 100 × 1,20 = 120 verirdi.
    expect(applyWaste(100, 20)).toBe(125);
    expect(applyWaste(100, 50)).toBe(200);
    expect(applyWaste(100, 10)).toBeCloseTo(111.111, 3);
  });

  it("geçersiz fire yüzdesini reddeder", () => {
    expect(() => applyWaste(100, -5)).toThrow(RecipeError);
    expect(() => applyWaste(100, 100)).toThrow(RecipeError);
    expect(() => applyWaste(100, 150)).toThrow(RecipeError);
  });
});

describe("basit reçete maliyeti", () => {
  it("hamurun maliyetini hesaplar", () => {
    const cost = costOfRecipe("hamur", catalog);
    // un 0,6 kg × 30 = 18 | su 0 | maya 0,005 × 200 = 1 | tuz 0,015 × 10 = 0,15
    expect(cost.totalCost).toBeCloseTo(19.15, 10);
    expect(cost.costPerYieldUnit).toBeCloseTo(0.01915, 10);
    expect(cost.yieldUnit).toBe("g");
  });

  it("payları toplamı 1 eder", () => {
    const cost = costOfRecipe("hamur", catalog);
    const total = cost.lines.reduce((sum, l) => sum + l.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("en pahalı kalemi görünür kılar", () => {
    const cost = costOfRecipe("hamur", catalog);
    const un = cost.lines.find((l) => l.label === "Un");
    expect(un?.share).toBeGreaterThan(0.9);
  });
});

describe("fire ve birim dönüşümü", () => {
  it("fireyi maliyete yansıtır", () => {
    const cost = costOfRecipe("sos", catalog);
    const domates = cost.lines.find((l) => l.label === "Domates");
    // 1000 g ÷ 0,9 = 1111,11 g ham domates
    expect(domates?.effectiveQuantity).toBeCloseTo(1111.111, 3);
    expect(domates?.cost).toBeCloseTo(44.444, 3);
  });

  it("yoğunlukla gram→litre çevirip fiyatlandırır", () => {
    const cost = costOfRecipe("sos", catalog);
    const yag = cost.lines.find((l) => l.label === "Zeytinyağı");
    // 50 g ÷ 916 g/lt × 250 TL/lt
    expect(yag?.cost).toBeCloseTo(13.646, 3);
  });
});

describe("yarı mamullü ağaç", () => {
  it("margaritanın maliyetini uçtan uca hesaplar", () => {
    const cost = costOfRecipe("margarita", catalog);

    // hamur: 250 g × 0,01915 = 4,7875
    // sos:   80 ml → 0,08 lt × (44,444 + 13,646 + 0,1) = 0,08 × 58,190 = 4,655
    // peynir:150 g = 0,15 kg × 300 = 45
    expect(cost.totalCost).toBeCloseTo(54.443, 2);
  });

  it("alt dökümü de döndürür", () => {
    const cost = costOfRecipe("margarita", catalog);
    const sos = cost.lines.find((l) => l.label === "Pizza sosu");
    expect(sos?.breakdown).toBeDefined();
    expect(sos?.breakdown?.lines.map((l) => l.label)).toEqual([
      "Domates",
      "Zeytinyağı",
      "Tuz",
    ]);
  });

  it("peynirin baskın kalem olduğunu gösterir", () => {
    const cost = costOfRecipe("margarita", catalog);
    const peynir = cost.lines.find((l) => l.label === "Mozzarella");
    // Patronun "neden pahalı?" sorusunun cevabı bu olmalı.
    expect(peynir?.share).toBeGreaterThan(0.8);
  });
});

describe("hatalı tanımlar", () => {
  it("kendini içeren reçeteyi reddeder", () => {
    const dongusel: Catalog = {
      ingredients: [],
      recipes: [
        {
          id: "a",
          name: "A",
          yieldQuantity: 1,
          yieldUnit: "adet",
          lines: [{ ref: { kind: "recipe", id: "b" }, quantity: 1, unit: "adet" }],
        },
        {
          id: "b",
          name: "B",
          yieldQuantity: 1,
          yieldUnit: "adet",
          lines: [{ ref: { kind: "recipe", id: "a" }, quantity: 1, unit: "adet" }],
        },
      ],
    };
    // Sonsuz döngüye girmeden, anlaşılır bir hata vermeli.
    expect(() => costOfRecipe("a", dongusel)).toThrow(/kendini içeriyor/);
  });

  it("doğrudan kendini çağıran reçeteyi reddeder", () => {
    const kendine: Catalog = {
      ingredients: [],
      recipes: [
        {
          id: "a",
          name: "A",
          yieldQuantity: 1,
          yieldUnit: "adet",
          lines: [{ ref: { kind: "recipe", id: "a" }, quantity: 1, unit: "adet" }],
        },
      ],
    };
    expect(() => costOfRecipe("a", kendine)).toThrow(/kendini içeriyor/);
  });

  it("tanımsız hammaddeyi reddeder", () => {
    const eksik: Catalog = {
      ingredients: [],
      recipes: [
        {
          id: "a",
          name: "A",
          yieldQuantity: 1,
          yieldUnit: "adet",
          lines: [{ ref: { kind: "ingredient", id: "yok" }, quantity: 1, unit: "g" }],
        },
      ],
    };
    expect(() => costOfRecipe("a", eksik)).toThrow(/tanımsız hammadde/);
  });

  it("sıfır çıktılı reçeteyi reddeder", () => {
    const sifir: Catalog = {
      ingredients: [],
      recipes: [
        { id: "a", name: "A", yieldQuantity: 0, yieldUnit: "g", lines: [] },
      ],
    };
    expect(() => costOfRecipe("a", sifir)).toThrow(/çıktı miktarı/);
  });

  it("yinelenen kimliği reddeder", () => {
    const cift: Catalog = {
      ingredients: [
        { id: "un", name: "Un", costUnit: "kg", costPerUnit: 30 },
        { id: "un", name: "Un 2", costUnit: "kg", costPerUnit: 40 },
      ],
      recipes: [],
    };
    expect(() => costOfRecipe("a", cift)).toThrow(/yinelenen kimlik/);
  });

  it("çevrilemeyen birimi reddeder", () => {
    const cevrilemez: Catalog = {
      ingredients: [{ id: "un", name: "Un", costUnit: "kg", costPerUnit: 30 }],
      recipes: [
        {
          id: "a",
          name: "A",
          yieldQuantity: 1,
          yieldUnit: "adet",
          // Un kg ile fiyatlanmış ama reçetede litre isteniyor: yoğunluk yok.
          lines: [{ ref: { kind: "ingredient", id: "un" }, quantity: 1, unit: "lt" }],
        },
      ],
    };
    expect(() => costOfRecipe("a", cevrilemez)).toThrow(/yoğunluk|birim ağırlık/);
  });
});

describe("explodeToIngredients", () => {
  it("ağacı hammadde bazında düzleştirir", () => {
    const totals = explodeToIngredients("margarita", catalog);

    expect(totals.get("mozzarella")).toEqual({
      quantity: 150,
      unit: "g",
      name: "Mozzarella",
    });
    // 250 g hamur = toplam hamurun 1/4'ü → 600 g unun 1/4'ü
    expect(totals.get("un")?.quantity).toBeCloseTo(150, 10);
  });

  it("aynı hammadde farklı dallarda geçiyorsa toplar", () => {
    // Tuz hem hamurda hem sosta var.
    const totals = explodeToIngredients("margarita", catalog);
    // hamurdan: 15 g × 0,25 = 3,75 | sostan: 10 g × 0,08 = 0,8
    expect(totals.get("tuz")?.quantity).toBeCloseTo(4.55, 10);
  });

  it("istenen çıktı miktarına göre ölçekler", () => {
    const bir = explodeToIngredients("margarita", catalog);
    const on = explodeToIngredients("margarita", catalog, 10);
    expect(on.get("mozzarella")?.quantity).toBeCloseTo(
      (bir.get("mozzarella")?.quantity ?? 0) * 10,
      10,
    );
  });

  it("döngüde sonsuza gitmez", () => {
    const dongusel: Catalog = {
      ingredients: [],
      recipes: [
        {
          id: "a",
          name: "A",
          yieldQuantity: 1,
          yieldUnit: "adet",
          lines: [{ ref: { kind: "recipe", id: "a" }, quantity: 1, unit: "adet" }],
        },
      ],
    };
    expect(() => explodeToIngredients("a", dongusel)).toThrow(/kendini içeriyor/);
  });
});

describe("food cost", () => {
  it("maliyet/fiyat oranını verir", () => {
    expect(foodCostRatio(30, 100)).toBe(0.3);
  });

  it("hedef orana göre fiyat önerir", () => {
    // 54,44 TL maliyet, %30 hedef → ~181,48 TL
    expect(priceForTargetFoodCost(54.44, 0.3)).toBeCloseTo(181.467, 3);
  });

  it("geçersiz fiyat ve oranı reddeder", () => {
    expect(() => foodCostRatio(30, 0)).toThrow(RecipeError);
    expect(() => priceForTargetFoodCost(30, 0)).toThrow(RecipeError);
    expect(() => priceForTargetFoodCost(30, 1.5)).toThrow(RecipeError);
  });
});

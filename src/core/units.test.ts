import { describe, expect, it } from "vitest";

import {
  UnitConversionError,
  canConvert,
  convert,
  dimensionOf,
  formatQuantity,
  type UnitConversion,
} from "./units";

describe("evrensel dönüşümler", () => {
  it("kütle birimlerini çevirir", () => {
    expect(convert(1, "kg", "g")).toBe(1000);
    expect(convert(2.5, "kg", "g")).toBe(2500);
    expect(convert(500, "g", "kg")).toBe(0.5);
  });

  it("hacim birimlerini çevirir", () => {
    expect(convert(1, "lt", "ml")).toBe(1000);
    expect(convert(250, "ml", "lt")).toBe(0.25);
    expect(convert(1, "lt", "cl")).toBe(100);
    expect(convert(5, "cl", "ml")).toBe(50);
  });

  it("aynı birime çevirince miktarı değiştirmez", () => {
    expect(convert(7.3, "kg", "kg")).toBe(7.3);
  });

  it("sıfır miktarı korur", () => {
    expect(convert(0, "kg", "g")).toBe(0);
  });

  it("gidiş-dönüşte değeri korur", () => {
    const grams = convert(2.4, "kg", "g");
    expect(convert(grams, "g", "kg")).toBeCloseTo(2.4, 10);
  });
});

describe("boyut ihlalleri", () => {
  it("kütle ile hacim arasında yoğunluk olmadan çevirmeyi reddeder", () => {
    // Bu testin varlık sebebi: sessizce 1 kg = 1 lt varsaymak, maliyeti
    // fark edilmeden bozan klasik hatadır.
    expect(() => convert(1, "kg", "lt")).toThrow(UnitConversionError);
    expect(() => convert(1, "kg", "lt")).toThrow(/yoğunluk|birim ağırlık/);
  });

  it("adet ile gram arasında birim ağırlık olmadan çevirmeyi reddeder", () => {
    expect(() => convert(3, "adet", "g")).toThrow(UnitConversionError);
  });

  it("bilinmeyen birimi reddeder", () => {
    expect(() => convert(1, "kg", "fıçı")).toThrow(UnitConversionError);
  });

  it("geçersiz miktarı reddeder", () => {
    expect(() => convert(Number.NaN, "kg", "g")).toThrow(UnitConversionError);
    expect(() => convert(Number.POSITIVE_INFINITY, "kg", "g")).toThrow(
      UnitConversionError,
    );
  });
});

describe("ürüne özel dönüşümler", () => {
  const kola: UnitConversion[] = [{ from: "koli", to: "adet", factor: 24 }];
  const cips: UnitConversion[] = [{ from: "koli", to: "paket", factor: 12 }];

  it("ambalaj birimini çevirir", () => {
    expect(convert(2, "koli", "adet", kola)).toBe(48);
    expect(convert(48, "adet", "koli", kola)).toBe(2);
  });

  it("aynı 'koli' adı ürüne göre farklı anlama gelir", () => {
    // Motorun var oluş sebebi: 'koli' evrensel bir birim DEĞİL.
    expect(convert(1, "koli", "adet", kola)).toBe(24);
    expect(convert(1, "koli", "paket", cips)).toBe(12);
    // Kola bağlamında 'paket' diye bir şey yok:
    expect(() => convert(1, "koli", "paket", kola)).toThrow(UnitConversionError);
  });

  it("yoğunlukla kütle-hacim köprüsü kurar", () => {
    const zeytinyagi: UnitConversion[] = [
      { from: "lt", to: "g", factor: 916 },
    ];
    expect(convert(1, "lt", "g", zeytinyagi)).toBe(916);
    // Zincirin sonunda tek bölme yapıldığı için tam çıkıyor.
    expect(convert(2, "lt", "kg", zeytinyagi)).toBe(1.832);
    expect(convert(916, "g", "lt", zeytinyagi)).toBe(1);
  });

  it("birim ağırlıkla adet-kütle köprüsü kurar", () => {
    const yumurta: UnitConversion[] = [{ from: "adet", to: "g", factor: 55 }];
    expect(convert(12, "adet", "g", yumurta)).toBe(660);
    expect(convert(1100, "g", "adet", yumurta)).toBe(20);
    // 1,1 sayısının kendisi ikili tabanda tam değil; buradaki sapma dönüşümden
    // değil girdiden geliyor, o yüzden yaklaşık karşılaştırma doğru olan.
    expect(convert(1.1, "kg", "adet", yumurta)).toBeCloseTo(20, 10);
  });
});

describe("zincirli dönüşümler", () => {
  // Gerçek senaryo: tedarikçiden koli alınır, depoda adet sayılır,
  // reçetede gram kullanılır.
  const konserve: UnitConversion[] = [
    { from: "koli", to: "adet", factor: 12 },
    { from: "adet", to: "g", factor: 400 },
  ];

  it("koli → gram zincirini kurar", () => {
    expect(convert(1, "koli", "g", konserve)).toBe(4800);
    expect(convert(1, "koli", "kg", konserve)).toBe(4.8);
  });

  it("zinciri ters yönde de kurar", () => {
    expect(convert(9600, "g", "koli", konserve)).toBe(2);
  });

  it("döngüsel tanımda sonsuz döngüye girmez", () => {
    const dongusel: UnitConversion[] = [
      { from: "a", to: "b", factor: 2 },
      { from: "b", to: "c", factor: 3 },
      { from: "c", to: "a", factor: 1 / 6 },
    ];
    expect(convert(1, "a", "c", dongusel)).toBe(6);
  });

  it("en kısa yolu seçer", () => {
    // a → b doğrudan 10; a → c → b ise 2 × 5 = 10. İkisi de aynı sonucu
    // vermeli, ama BFS doğrudan kenarı kullanmalı.
    const conversions: UnitConversion[] = [
      { from: "a", to: "b", factor: 10 },
      { from: "a", to: "c", factor: 2 },
      { from: "c", to: "b", factor: 5 },
    ];
    expect(convert(3, "a", "b", conversions)).toBe(30);
  });
});

describe("bozuk dönüşüm tanımları", () => {
  it("sıfır veya negatif katsayıyı reddeder", () => {
    expect(() => convert(1, "koli", "adet", [{ from: "koli", to: "adet", factor: 0 }])).toThrow(
      UnitConversionError,
    );
    expect(() => convert(1, "koli", "adet", [{ from: "koli", to: "adet", factor: -5 }])).toThrow(
      UnitConversionError,
    );
  });

  it("bir birimin kendisine dönüşümünü reddeder", () => {
    expect(() =>
      convert(1, "kg", "g", [{ from: "kg", to: "kg", factor: 2 }]),
    ).toThrow(UnitConversionError);
  });
});

describe("canConvert", () => {
  it("mümkün olanı doğrular, olmayanı reddeder", () => {
    expect(canConvert("kg", "g")).toBe(true);
    expect(canConvert("kg", "lt")).toBe(false);
    expect(canConvert("koli", "adet", [{ from: "koli", to: "adet", factor: 6 }])).toBe(true);
  });

  it("bozuk tanımda hata fırlatmaz, false döner", () => {
    expect(canConvert("koli", "adet", [{ from: "koli", to: "adet", factor: 0 }])).toBe(
      false,
    );
  });
});

describe("dimensionOf", () => {
  it("evrensel birimlerin boyutunu bilir", () => {
    expect(dimensionOf("kg")).toBe("mass");
    expect(dimensionOf("lt")).toBe("volume");
    expect(dimensionOf("adet")).toBe("count");
  });

  it("ambalaj birimlerinin boyutu yoktur", () => {
    expect(dimensionOf("koli")).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("Türkçe sayı biçimi kullanır", () => {
    expect(formatQuantity(1250.5, "g")).toBe("1.250,5 g");
    expect(formatQuantity(0.25, "kg")).toBe("0,25 kg");
  });
});

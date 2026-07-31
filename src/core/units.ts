/**
 * Birim dönüşüm motoru.
 *
 * Neden ayrı ve merkezi bir motor:
 * Restoran maliyet sistemlerinde en sık sessizce bozulan yer birim dönüşümüdür.
 * Tedarikçiden "koli" alırsın, depoda "adet" sayarsın, reçetede "gram" kullanırsın.
 * Bu zinciri her ekranda tekrar tekrar kurmak, er ya da geç birinin ters çevirmesiyle
 * sonuçlanır — ve yanlış maliyet, yanlış kâr raporu demektir. Fark edilmesi aylar sürer.
 *
 * İki tür dönüşüm var ve karıştırılmamaları şart:
 *
 *   1. EVRENSEL — fizik sabiti. 1 kg her zaman 1000 g'dır.
 *      `BASE_UNITS` içinde tanımlı.
 *
 *   2. ÜRÜNE ÖZEL — ürüne göre değişir, evrensel değildir:
 *        · Ambalaj: 1 koli kola = 24 adet, ama 1 koli cips = 12 paket
 *        · Yoğunluk: 1 lt su = 1000 g, ama 1 lt zeytinyağı = 916 g
 *        · Birim ağırlık: 1 adet yumurta = 55 g
 *      Bunlar `UnitConversion[]` olarak dışarıdan verilir.
 *
 * "koli"yi evrensel bir birim yapmak, bu motorun engellemek için var olduğu hatanın
 * ta kendisidir.
 */

export type Dimension = "mass" | "volume" | "count";

export type BaseUnit = {
  readonly code: string;
  readonly dimension: Dimension;
  /** Bu birimin, kendi boyutunun temel biriminden kaç tanesi olduğu. */
  readonly toBase: number;
  readonly label: string;
};

/**
 * Evrensel birimler. Temel birimler: gram, mililitre, adet.
 *
 * Buraya "koli", "paket", "kasa" gibi ambalaj birimleri EKLENMEZ — onlar ürüne
 * özeldir ve `UnitConversion` ile verilir.
 */
export const BASE_UNITS = {
  g: { code: "g", dimension: "mass", toBase: 1, label: "gram" },
  kg: { code: "kg", dimension: "mass", toBase: 1000, label: "kilogram" },
  ml: { code: "ml", dimension: "volume", toBase: 1, label: "mililitre" },
  cl: { code: "cl", dimension: "volume", toBase: 10, label: "santilitre" },
  lt: { code: "lt", dimension: "volume", toBase: 1000, label: "litre" },
  adet: { code: "adet", dimension: "count", toBase: 1, label: "adet" },
} as const satisfies Record<string, BaseUnit>;

export type BaseUnitCode = keyof typeof BASE_UNITS;

/** Ambalaj birimleri de olabildiği için birim kodu serbest metindir. */
export type UnitCode = string;

/** Her boyutun temel birimi — dönüşümlerin buluşma noktası. */
const DIMENSION_BASE: Record<Dimension, BaseUnitCode> = {
  mass: "g",
  volume: "ml",
  count: "adet",
};

/**
 * Ürüne özel dönüşüm: `1 from = factor × to`.
 *
 * Örnek: `{ from: "koli", to: "adet", factor: 24 }` → 1 koli 24 adettir.
 */
export type UnitConversion = {
  readonly from: UnitCode;
  readonly to: UnitCode;
  readonly factor: number;
};

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitConversionError";
  }
}

function isBaseUnit(code: UnitCode): code is BaseUnitCode {
  return Object.hasOwn(BASE_UNITS, code);
}

export function getBaseUnit(code: UnitCode): BaseUnit | null {
  return isBaseUnit(code) ? BASE_UNITS[code] : null;
}

/** Bir birimin boyutu; ambalaj birimlerinin boyutu yoktur (null). */
export function dimensionOf(code: UnitCode): Dimension | null {
  return getBaseUnit(code)?.dimension ?? null;
}

/**
 * Kenar, çarpanı KESİR olarak taşır: geçiş `× mul ÷ div` demektir.
 *
 * Neden tek bir ondalık çarpan değil: ters yönlü geçişlerde `1/400` gibi ikili
 * tabanda tam gösterilemeyen sayılar oluşuyor ve zincir uzadıkça hata birikiyor.
 * 9600 g → koli hesabı 2 yerine 1,9999999999999998 veriyordu.
 *
 * Pay ve paydayı ayrı biriktirip bölmeyi en sona bıraktığımızda, çarpanlar
 * tam sayı olduğu sürece (ki ambalaj ve birim ağırlıklarda neredeyse hep öyledir)
 * sonuç tam çıkıyor.
 */
type Edge = { readonly to: UnitCode; readonly mul: number; readonly div: number };

/** Biriken çarpan: gerçek değeri `num / den`. */
type Ratio = { readonly num: number; readonly den: number };

/**
 * Dönüşüm grafiğini kurar.
 *
 * Düğümler birimler, kenarlar çarpanlardır. Evrensel birimler kendi temel
 * birimlerine bağlanır; ürüne özel dönüşümler ek kenar olarak eklenir ve her
 * kenar çift yönlü kurulur (koli→adet varsa adet→koli de vardır).
 */
function buildGraph(conversions: readonly UnitConversion[]): Map<UnitCode, Edge[]> {
  const graph = new Map<UnitCode, Edge[]>();

  const addEdge = (from: UnitCode, to: UnitCode, mul: number, div: number) => {
    const edges = graph.get(from);
    if (edges) {
      edges.push({ to, mul, div });
    } else {
      graph.set(from, [{ to, mul, div }]);
    }
  };

  for (const unit of Object.values(BASE_UNITS)) {
    const base = DIMENSION_BASE[unit.dimension];
    if (unit.code === base) continue;
    addEdge(unit.code, base, unit.toBase, 1);
    addEdge(base, unit.code, 1, unit.toBase);
  }

  for (const conversion of conversions) {
    if (!Number.isFinite(conversion.factor) || conversion.factor <= 0) {
      throw new UnitConversionError(
        `Geçersiz dönüşüm katsayısı: 1 ${conversion.from} = ${conversion.factor} ${conversion.to}. Katsayı sıfırdan büyük olmalı.`,
      );
    }
    if (conversion.from === conversion.to) {
      throw new UnitConversionError(
        `Bir birim kendisine dönüştürülemez: ${conversion.from}.`,
      );
    }
    addEdge(conversion.from, conversion.to, conversion.factor, 1);
    addEdge(conversion.to, conversion.from, 1, conversion.factor);
  }

  return graph;
}

/**
 * `from` biriminden `to` birimine geçiş çarpanını bulur.
 *
 * Genişlik öncelikli arama kullanır: en kısa dönüşüm zincirini seçer, böylece
 * kayan nokta hatası mümkün olan en az adımda birikir. Ziyaret edilen düğümler
 * işaretlendiği için döngüsel tanımlar (koli→adet, adet→koli) sonsuz döngüye girmez.
 */
function findFactor(
  from: UnitCode,
  to: UnitCode,
  conversions: readonly UnitConversion[],
): Ratio | null {
  if (from === to) return { num: 1, den: 1 };

  const graph = buildGraph(conversions);
  const visited = new Set<UnitCode>([from]);
  let frontier: Array<{ unit: UnitCode; ratio: Ratio }> = [
    { unit: from, ratio: { num: 1, den: 1 } },
  ];

  while (frontier.length > 0) {
    const next: Array<{ unit: UnitCode; ratio: Ratio }> = [];

    for (const { unit, ratio } of frontier) {
      for (const edge of graph.get(unit) ?? []) {
        if (visited.has(edge.to)) continue;

        const nextRatio: Ratio = {
          num: ratio.num * edge.mul,
          den: ratio.den * edge.div,
        };
        if (edge.to === to) return nextRatio;

        visited.add(edge.to);
        next.push({ unit: edge.to, ratio: nextRatio });
      }
    }

    frontier = next;
  }

  return null;
}

/**
 * Miktarı bir birimden diğerine çevirir.
 *
 * @param conversions Ürüne özel dönüşümler (ambalaj, yoğunluk, birim ağırlık).
 * @throws {UnitConversionError} Dönüşüm mümkün değilse — sessizce yanlış sayı
 *   döndürmektense hata vermek yeğdir. `kg → lt` yoğunluk verilmeden çevrilemez.
 */
export function convert(
  quantity: number,
  from: UnitCode,
  to: UnitCode,
  conversions: readonly UnitConversion[] = [],
): number {
  if (!Number.isFinite(quantity)) {
    throw new UnitConversionError(`Geçersiz miktar: ${quantity}.`);
  }

  const ratio = findFactor(from, to, conversions);

  if (ratio === null) {
    const fromDim = dimensionOf(from);
    const toDim = dimensionOf(to);

    // En sık karşılaşılan durum bu; kullanıcıya ne yapması gerektiğini söyle.
    if (fromDim && toDim && fromDim !== toDim) {
      throw new UnitConversionError(
        `${from} → ${to} dönüşümü için ürüne özel bir tanım gerekiyor (yoğunluk veya birim ağırlık). Örnek: 1 lt zeytinyağı = 916 g.`,
      );
    }

    throw new UnitConversionError(
      `${from} → ${to} dönüşümü tanımlı değil. Ürün kartına bir dönüşüm ekleyin (örnek: 1 koli = 24 adet).`,
    );
  }

  // Bölmeyi sona bırakıyoruz: `9600 × 1 ÷ 4800` tam 2 verir,
  // `9600 × (1/400) × (1/12)` ise 1,9999999999999998.
  return (quantity * ratio.num) / ratio.den;
}

/** Dönüşüm mümkün mü? Form doğrulamasında hata fırlatmadan sormak için. */
export function canConvert(
  from: UnitCode,
  to: UnitCode,
  conversions: readonly UnitConversion[] = [],
): boolean {
  try {
    return findFactor(from, to, conversions) !== null;
  } catch {
    // Bozuk dönüşüm tanımı da "çevrilemez" sayılır.
    return false;
  }
}

const quantityFormatter = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 3,
});

/** Miktarı Türkçe biçimde gösterir: `1.250,5 g`. */
export function formatQuantity(quantity: number, unit: UnitCode): string {
  return `${quantityFormatter.format(quantity)} ${unit}`;
}

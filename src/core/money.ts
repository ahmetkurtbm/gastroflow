/**
 * Para, veritabanındaki `numeric(14,4)` ile aynı ölçekte, 1/10.000 TL'lik tam
 * sayı olarak tutulur; float yuvarlama hatası kasa mutabakatına yansımasın.
 *
 * `Money` saklanan ve girilen tutarlar içindir (fiyat, ödeme, kasa sayımı).
 * Birim maliyet gibi çok küçük ara değerler `number` kalır; 4 haneye
 * yuvarlanırsa sıfıra düşerler. Yalnızca sonuç `Money`'ye çevrilir.
 */

const SCALE = 10_000;

declare const moneyBrand: unique symbol;

/** 1/10.000 TL biriminde tam sayı. Doğrudan aritmetik yapma, fonksiyonları kullan. */
export type Money = number & { readonly [moneyBrand]: true };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Yarımı sıfırdan uzağa yuvarlar; `Math.round` negatiflerde -0,5'i -0 yapar. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** TL cinsinden ondalık bir sayıdan para üretir. */
export function money(lira: number): Money {
  if (!Number.isFinite(lira)) {
    throw new MoneyError(`Geçersiz tutar: ${lira}.`);
  }

  const scaled = roundHalfAwayFromZero(lira * SCALE);

  if (!Number.isSafeInteger(scaled)) {
    throw new MoneyError(`Tutar taşıyor: ${lira}.`);
  }

  return scaled as Money;
}

export const ZERO = 0 as Money;

/** Para değerini TL cinsinden ondalık sayıya çevirir (gösterim ve hesap için). */
export function toLira(value: Money): number {
  return value / SCALE;
}

/** Veritabanından gelen `numeric` değerini okur; PostgREST bunu string döndürür. */
export function parseMoney(value: string | number): Money {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(parsed)) {
    throw new MoneyError(`Tutar okunamadı: ${String(value)}.`);
  }
  return money(parsed);
}

/** Veritabanına yazmak için `numeric` uyumlu metin üretir. */
export function toNumericString(value: Money): string {
  return toLira(value).toFixed(4);
}

export function add(...values: readonly Money[]): Money {
  return values.reduce<number>((sum, v) => sum + v, 0) as Money;
}

export function subtract(a: Money, b: Money): Money {
  return (a - b) as Money;
}

export function negate(value: Money): Money {
  return -value as Money;
}

/** Tutarı bir adede/miktara çarpar. Sonuç kuruşun 1/100'üne yuvarlanır. */
export function multiply(value: Money, quantity: number): Money {
  if (!Number.isFinite(quantity)) {
    throw new MoneyError(`Geçersiz çarpan: ${quantity}.`);
  }
  return roundHalfAwayFromZero(value * quantity) as Money;
}

/** Tutarı böler ve ondalık TL döndürür; birim maliyet `Money`'ye yuvarlanınca sıfırlanabilir. */
export function divideToRate(value: Money, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor === 0) {
    throw new MoneyError(`Geçersiz bölen: ${divisor}.`);
  }
  return toLira(value) / divisor;
}

export function isZero(value: Money): boolean {
  return value === 0;
}

export function compare(a: Money, b: Money): number {
  return a - b;
}

/** Tutarı eşit ve kalansız paylara böler; artık baştaki paylara dağıtılır, toplam korunur. */
export function allocate(value: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`Pay sayısı en az 1 tam sayı olmalı: ${parts}.`);
  }

  const base = Math.trunc(value / parts);
  const remainder = value - base * parts;
  const step = value < 0 ? -1 : 1;

  return Array.from({ length: parts }, (_, index) => {
    const extra = index < Math.abs(remainder) ? step : 0;
    return (base + extra) as Money;
  });
}

/**
 * Tutarı ağırlıklara orantılı ve kalansız paylara böler (kombo fiyatının
 * bileşenlere dağıtımı). En büyük artık yöntemi kullanılır, toplam korunur.
 * Ağırlıkların hepsi sıfırsa eşit bölünür.
 */
export function allocateProportional(value: Money, weights: readonly Money[]): Money[] {
  if (weights.length === 0) {
    throw new MoneyError("En az bir ağırlık gerekli.");
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) {
    return allocate(value, weights.length);
  }

  const raw = weights.map((w) => (value * w) / totalWeight);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = value - floors.reduce((sum, f) => sum + f, 0);

  const order = raw
    .map((r, index) => ({ index, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }

  return result as Money[];
}

const formatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1.234,50 ₺` */
export function formatMoney(value: Money): string {
  return formatter.format(toLira(value));
}

const rateFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Birim maliyet gibi küçük tutarları 4 haneye kadar gösterir: `0,0300 ₺`. */
export function formatRate(lira: number): string {
  return rateFormatter.format(lira);
}

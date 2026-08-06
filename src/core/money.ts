/**
 * Para tipi.
 *
 * Para, 1/10.000 TL'lik tam sayı birimlerinde tutulur — veritabanındaki
 * `numeric(14,4)` ile birebir aynı ölçek. Float kullanılmaz: 0,1 + 0,2 = 0,30000000000000004
 * hesabı gün sonu kasa mutabakatında bir kuruşluk fark olarak geri döner ve
 * o farkı arayan kişi saatini kaybeder.
 *
 * ÖNEMLİ AYRIM — bu tip her yerde kullanılmaz:
 *
 *   · `Money`  → SAKLANAN ve GİRİLEN tutarlar: menü fiyatı, fatura satırı,
 *                ödeme, kasa sayımı. Kullanıcının gördüğü kesin değerler.
 *
 *   · `number` → TÜRETİLEN ara değerler: birim maliyet (TL/gram gibi),
 *                reçete ağacındaki ara toplamlar. Bunlar çok küçük olabilir
 *                (0,00003 TL/g) ve 4 haneye yuvarlanırsa sıfıra düşüp maliyeti
 *                yok ederdi. Ara hesap ondalık yapılır, YALNIZCA sonuç `Money`'ye
 *                yuvarlanır.
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

/**
 * Yarımı sıfırdan uzağa yuvarlar (0,5 → 1; -0,5 → -1).
 *
 * `Math.round` negatiflerde artı sonsuza yuvarlıyor (-0,5 → -0), yani iade ve
 * indirim satırlarında bir kuruşluk asimetri üretirdi.
 */
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

/**
 * Veritabanından gelen `numeric` değerini okur.
 * Postgres `numeric` alanlarını JSON'a string olarak taşır (hassasiyet kaybolmasın diye).
 */
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

/**
 * Tutarı böler ve sonucu ondalık TL olarak döndürür.
 *
 * Bilerek `Money` döndürmüyor: birim maliyet hesabında (paket fiyatı ÷ gram)
 * sonuç çoğu zaman 4 haneden küçüktür ve `Money`'ye yuvarlansa sıfıra düşerdi.
 */
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

/**
 * Bir tutarı kalansız paylara böler.
 *
 * Hesap bölmede (Faz 2) gerekiyor: 100 TL'yi 3 kişiye bölünce 33,33 + 33,33 + 33,33
 * = 99,99 eder ve 1 kuruş buharlaşır. Bu fonksiyon artığı baştan başlayarak
 * dağıtır, böylece parçaların toplamı her zaman bütüne eşit kalır.
 */
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
 * Bir tutarı AĞIRLIKLARA ORANTILI, kalansız paylara böler.
 *
 * `allocate()`'ten farkı: o eşit böler (hesap bölme — 3 kişiye 33,33+33,33+33,34),
 * bu ORANTILI böler (kombo/menü kampanyası — "Büyük Menü" 120 TL'yi normalde
 * 80 TL'lik burger + 40 TL'lik patatese, ağırlıklarıyla orantılı olarak 80+40
 * yerine kombonun indirimli TOPLAMına göre yeniden ölçeklenmiş halde dağıtır).
 *
 * "En büyük artık" (largest remainder) yöntemi: önce her payı aşağı yuvarla,
 * kalan birimleri en büyük kesirli artığı olan paylara sırayla dağıt. Böylece
 * toplam her zaman `value`'ya eşit kalır — hiçbir kuruş kaybolmaz/fazla gelmez.
 * Tüm ağırlıklar sıfırsa (ör. bileşenlerden hiçbirinin fiyatı tanımlı değil)
 * eşit bölüşüme düşülür.
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

/**
 * Birim maliyet gibi çok küçük olabilen türetilmiş tutarları gösterir.
 * `0,0300 ₺` — normal para biçimiyle gösterilse `0,03 ₺` olur ve un ile
 * baharatın maliyeti aynı görünürdü.
 */
export function formatRate(lira: number): string {
  return rateFormatter.format(lira);
}

import { describe, expect, it } from "vitest";

import {
  MoneyError,
  ZERO,
  add,
  allocate,
  allocateProportional,
  divideToRate,
  formatMoney,
  formatRate,
  money,
  multiply,
  negate,
  parseMoney,
  subtract,
  toLira,
  toNumericString,
} from "./money";

describe("money / toLira", () => {
  it("TL değerini korur", () => {
    expect(toLira(money(12.34))).toBe(12.34);
    expect(toLira(money(0))).toBe(0);
    expect(toLira(money(-5.5))).toBe(-5.5);
  });

  it("dört ondalık haneye kadar tutar", () => {
    expect(toLira(money(0.0001))).toBe(0.0001);
    expect(toLira(money(1234.5678))).toBe(1234.5678);
  });

  it("dört haneden fazlasını yuvarlar", () => {
    expect(toLira(money(0.00005))).toBe(0.0001);
    expect(toLira(money(0.00004))).toBe(0);
  });

  it("yarımı sıfırdan uzağa yuvarlar, negatifte de simetrik", () => {
    // Math.round(-0.5) === -0 olduğu için bu davranışı elle sağlıyoruz.
    expect(toLira(money(-0.00005))).toBe(-0.0001);
  });

  it("geçersiz değerleri reddeder", () => {
    expect(() => money(Number.NaN)).toThrow(MoneyError);
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => money(1e15)).toThrow(MoneyError);
  });
});

describe("toplama ve çıkarma", () => {
  it("float hatasına düşmez", () => {
    // Float ile 0,1 + 0,2 = 0,30000000000000004 olurdu.
    expect(toLira(add(money(0.1), money(0.2)))).toBe(0.3);
  });

  it("uzun listelerde birikimli hata yapmaz", () => {
    const kurusluk = Array.from({ length: 1000 }, () => money(0.01));
    expect(toLira(add(...kurusluk))).toBe(10);
  });

  it("boş toplama sıfırdır", () => {
    expect(add()).toBe(ZERO);
  });

  it("çıkarma ve işaret değiştirme", () => {
    expect(toLira(subtract(money(100), money(33.33)))).toBe(66.67);
    expect(toLira(negate(money(12.5)))).toBe(-12.5);
  });
});

describe("multiply", () => {
  it("adetle çarpar", () => {
    expect(toLira(multiply(money(12.5), 3))).toBe(37.5);
  });

  it("ondalık miktarla çarpar", () => {
    expect(toLira(multiply(money(30), 0.15))).toBe(4.5);
  });

  it("geçersiz çarpanı reddeder", () => {
    expect(() => multiply(money(10), Number.NaN)).toThrow(MoneyError);
  });
});

describe("divideToRate", () => {
  it("birim maliyet üretir", () => {
    // 30 TL'lik 1 kg un → gram başına 0,03 TL
    expect(divideToRate(money(30), 1000)).toBe(0.03);
  });

  it("çok küçük birim maliyetleri sıfıra düşürmez", () => {
    // Bu, `Money` döndürseydi 4 haneye yuvarlanıp SIFIR olurdu ve
    // ucuz malzemelerin maliyeti hesaptan tamamen düşerdi.
    const rate = divideToRate(money(5), 1_000_000);
    expect(rate).toBe(0.000005);
    expect(rate).toBeGreaterThan(0);
  });

  it("sıfıra bölmeyi reddeder", () => {
    expect(() => divideToRate(money(10), 0)).toThrow(MoneyError);
  });
});

describe("allocate", () => {
  it("kuruş kaybetmeden böler", () => {
    const parts = allocate(money(100), 3);
    expect(parts).toHaveLength(3);
    expect(toLira(add(...parts))).toBe(100);
  });

  it("artığı baştan dağıtır", () => {
    const parts = allocate(money(0.1), 3).map(toLira);
    expect(parts).toEqual([0.0334, 0.0333, 0.0333]);
  });

  it("tam bölünende eşit dağıtır", () => {
    expect(allocate(money(90), 3).map(toLira)).toEqual([30, 30, 30]);
  });

  it("negatif tutarda da toplamı korur", () => {
    const parts = allocate(money(-100), 3);
    expect(toLira(add(...parts))).toBe(-100);
  });

  it("tek paya bölmek tutarı korur", () => {
    expect(allocate(money(33.33), 1).map(toLira)).toEqual([33.33]);
  });

  it("geçersiz pay sayısını reddeder", () => {
    expect(() => allocate(money(10), 0)).toThrow(MoneyError);
    expect(() => allocate(money(10), 2.5)).toThrow(MoneyError);
  });
});

describe("allocateProportional", () => {
  it("ağırlıklara orantılı, kuruş kaybetmeden böler", () => {
    // Kombo: 120 TL'lik "Büyük Menü" — normal fiyatları 80 TL (burger) ve
    // 40 TL (patates) olan iki bileşene 2:1 oranında dağılmalı.
    const parts = allocateProportional(money(120), [money(80), money(40)]);
    expect(parts.map(toLira)).toEqual([80, 40]);
    expect(toLira(add(...parts))).toBe(120);
  });

  it("tam bölünmeyen oranda artığı en büyük kesire dağıtır, toplam korunur", () => {
    const parts = allocateProportional(money(100), [money(33), money(33), money(34)]);
    expect(toLira(add(...parts))).toBe(100);
  });

  it("tüm ağırlıklar sıfırsa eşit bölüşüme düşer", () => {
    const parts = allocateProportional(money(90), [ZERO, ZERO, ZERO]);
    expect(parts.map(toLira)).toEqual([30, 30, 30]);
  });

  it("indirimli kombo fiyatı bileşen fiyatları toplamından düşük olabilir", () => {
    // Bileşenler toplamda 100 TL ama kombo 80 TL'ye satılıyor — oran korunur.
    const parts = allocateProportional(money(80), [money(60), money(40)]);
    expect(parts.map(toLira)).toEqual([48, 32]);
    expect(toLira(add(...parts))).toBe(80);
  });

  it("boş ağırlık listesini reddeder", () => {
    expect(() => allocateProportional(money(10), [])).toThrow(MoneyError);
  });
});

describe("veritabanı gidiş-dönüşü", () => {
  it("numeric metnini okur", () => {
    // Postgres numeric alanlarını string olarak taşıyor.
    expect(toLira(parseMoney("1234.5678"))).toBe(1234.5678);
    expect(toLira(parseMoney(42))).toBe(42);
  });

  it("numeric metnine yazar", () => {
    expect(toNumericString(money(1234.5))).toBe("1234.5000");
    expect(toNumericString(money(0.0001))).toBe("0.0001");
  });

  it("gidiş-dönüşte değeri korur", () => {
    const original = money(987.6543);
    expect(parseMoney(toNumericString(original))).toBe(original);
  });

  it("okunamayan değeri reddeder", () => {
    expect(() => parseMoney("abc")).toThrow(MoneyError);
  });
});

describe("biçimlendirme", () => {
  it("parayı Türkçe biçimde gösterir", () => {
    expect(formatMoney(money(1234.5))).toBe("₺1.234,50");
    expect(formatMoney(ZERO)).toBe("₺0,00");
  });

  it("birim maliyeti daha hassas gösterir", () => {
    // Normal para biçiminde ikisi de "0,03 ₺" görünür ve ayırt edilemezdi.
    expect(formatRate(0.03)).toBe("₺0,03");
    expect(formatRate(0.0325)).toBe("₺0,0325");
  });
});

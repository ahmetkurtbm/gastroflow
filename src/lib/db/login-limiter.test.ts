import { describe, expect, it } from "vitest";

import {
  AttemptCounter,
  LOCKOUT_MS,
  LoginLimiter,
  MAX_FAILED_LOGINS,
  MAX_FAILED_LOGINS_PER_IP,
  clientIp,
} from "./login-limiter";

describe("AttemptCounter", () => {
  it("sınır dolunca reddeder, süre geçince sıfırlar", () => {
    const counter = new AttemptCounter(2, 1000, 100);
    expect(counter.consume("a", 0)).toBe(true);
    expect(counter.consume("a", 1)).toBe(true);
    expect(counter.consume("a", 2)).toBe(false);
    expect(counter.consume("a", 1003)).toBe(true);
  });

  it("reddedilen deneme kilit süresini uzatmaz", () => {
    const counter = new AttemptCounter(1, 1000, 100);
    counter.consume("a", 0);
    counter.consume("a", 900);
    expect(counter.consume("a", 1001)).toBe(true);
  });

  it("anahtar sayısını sınırlar: önce süresi geçenler, sonra en eski atılır", () => {
    const counter = new AttemptCounter(5, 1000, 3);
    counter.consume("a", 0);
    counter.consume("b", 10);
    counter.consume("c", 20);
    counter.consume("d", 2000); // a, b, c süresi geçmiş
    expect(counter.size).toBe(1);

    const full = new AttemptCounter(5, 10_000, 3);
    for (const key of ["a", "b", "c", "d", "e"]) full.consume(key, 0);
    expect(full.size).toBe(3);
  });

  it("iade edilen hak sayaçtan düşer", () => {
    const counter = new AttemptCounter(1, 1000, 10);
    counter.consume("a", 0);
    counter.refund("a");
    expect(counter.consume("a", 1)).toBe(true);
  });
});

describe("LoginLimiter", () => {
  it("paralel yanlış denemeler sınırı aşamaz", async () => {
    const limiter = new LoginLimiter();
    const verify = async () => {
      const attempt = limiter.begin("x@y.z", null, false);
      if (!attempt) return "blocked";
      await Promise.resolve(); // şifre doğrulaması (await)
      return "failed";
    };
    const results = await Promise.all(Array.from({ length: 50 }, verify));
    expect(results.filter((r) => r === "failed")).toHaveLength(MAX_FAILED_LOGINS);
  });

  it("başarılı giriş e-posta sayacını sıfırlar", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) limiter.begin("x@y.z", null, false);
    limiter.begin("x@y.z", null, false)!.succeed();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) expect(limiter.begin("x@y.z", null, false)).not.toBeNull();
    expect(limiter.begin("x@y.z", null, false)).toBeNull();
  });

  it("muaf hesap kilitlenmez", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < MAX_FAILED_LOGINS * 3; i++) expect(limiter.begin("demo@x", null, true)).not.toBeNull();
  });

  it("IP başına toplam sınır e-postadan bağımsızdır; başarılı giriş IP hakkını iade eder", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < MAX_FAILED_LOGINS_PER_IP; i++) {
      expect(limiter.begin(`u${i}@y.z`, "1.2.3.4", false)).not.toBeNull();
    }
    expect(limiter.begin("yeni@y.z", "1.2.3.4", false)).toBeNull();
    expect(limiter.begin("yeni@y.z", "5.6.7.8", false)).not.toBeNull();

    const other = new LoginLimiter();
    for (let i = 0; i < MAX_FAILED_LOGINS_PER_IP * 2; i++) other.begin("ok@y.z", "9.9.9.9", true)!.succeed();
    expect(other.begin("ok@y.z", "9.9.9.9", true)).not.toBeNull();
  });

  it("kilit süresi dolunca açılır", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) limiter.begin("x@y.z", null, false, 0);
    expect(limiter.begin("x@y.z", null, false, 1)).toBeNull();
    expect(limiter.begin("x@y.z", null, false, LOCKOUT_MS + 1)).not.toBeNull();
  });
});

describe("clientIp", () => {
  it("Vercel başlığını, sonra x-real-ip'yi, sonra x-forwarded-for'un ilk değerini kullanır", () => {
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBeNull();
  });
});

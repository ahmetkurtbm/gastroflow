import { describe, expect, it } from "vitest";

import { DEMO_MAX_BYTES, DEMO_MAX_OBJECTS, demoQuotaError } from "./storage-quota";

describe("demoQuotaError", () => {
  it("sınır altındaki yüklemeyi kabul eder", () => {
    expect(demoQuotaError({ count: 10, bytes: 1000 }, 500, null)).toBeNull();
  });

  it("nesne sayısı sınırını aşan yeni yüklemeyi reddeder", () => {
    expect(demoQuotaError({ count: DEMO_MAX_OBJECTS, bytes: 0 }, 1, null)).toMatch(/dosya/);
  });

  it("mevcut dosyanın üzerine yazmak sayıyı artırmaz", () => {
    expect(demoQuotaError({ count: DEMO_MAX_OBJECTS, bytes: 1000 }, 900, 1000)).toBeNull();
  });

  it("toplam boyut sınırını aşan yüklemeyi reddeder", () => {
    expect(demoQuotaError({ count: 1, bytes: DEMO_MAX_BYTES - 10 }, 11, null)).toMatch(/MB/);
    expect(demoQuotaError({ count: 1, bytes: DEMO_MAX_BYTES }, 10, 10)).toBeNull();
  });
});

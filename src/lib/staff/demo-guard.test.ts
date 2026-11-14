import { describe, expect, it } from "vitest";

import { isProtectedDemoAccount } from "./demo-guard";

describe("isProtectedDemoAccount", () => {
  it("demo modunda tohum hesapları korur", () => {
    expect(isProtectedDemoAccount("patron@demo.gastroflow", true)).toBe(true);
    expect(isProtectedDemoAccount(" Garson@Demo.Gastroflow ", true)).toBe(true);
  });

  it("demo modu dışında ya da başka hesapları korumaz", () => {
    expect(isProtectedDemoAccount("patron@demo.gastroflow", false)).toBe(false);
    expect(isProtectedDemoAccount("yeni@ornek.com", true)).toBe(false);
    expect(isProtectedDemoAccount(null, true)).toBe(false);
  });
});

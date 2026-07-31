import { describe, expect, it } from "vitest";

import {
  APP_ROLES,
  ROLE_HOME,
  canAccessPath,
  isPublicPath,
  parseAppClaims,
  type AppRole,
} from "./access";

describe("isPublicPath", () => {
  it("giriş ve kök yolu herkese açıktır", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
  });

  it("korumalı yolları açık saymaz", () => {
    expect(isPublicPath("/reports")).toBe(false);
    expect(isPublicPath("/pos")).toBe(false);
  });

  it("önek benzerliğine kanmaz", () => {
    // "/loginhack" ile "/login" korumasını atlamaya çalışmak.
    expect(isPublicPath("/loginhack")).toBe(false);
    expect(isPublicPath("/authorize-me")).toBe(false);
  });
});

describe("canAccessPath", () => {
  it("garson POS'a girer, raporlara giremez", () => {
    expect(canAccessPath("waiter", "/pos")).toBe(true);
    expect(canAccessPath("waiter", "/pos/table/12")).toBe(true);
    expect(canAccessPath("waiter", "/reports")).toBe(false);
    expect(canAccessPath("waiter", "/recipes")).toBe(false);
  });

  it("maliyet ekranları garson ve kasiyere kapalıdır", () => {
    for (const role of ["waiter", "cashier"] as const) {
      expect(canAccessPath(role, "/recipes")).toBe(false);
      expect(canAccessPath(role, "/reports")).toBe(false);
      expect(canAccessPath(role, "/purchasing")).toBe(false);
    }
  });

  it("denetim kaydını yalnızca patron görür", () => {
    expect(canAccessPath("owner", "/audit")).toBe(true);
    for (const role of APP_ROLES.filter((r) => r !== "owner")) {
      expect(canAccessPath(role, "/audit")).toBe(false);
    }
  });

  it("ayarları yalnızca patron görür", () => {
    expect(canAccessPath("owner", "/settings")).toBe(true);
    expect(canAccessPath("manager", "/settings")).toBe(false);
  });

  it("tanımsız yol hiçbir role açık değildir (deny-by-default)", () => {
    for (const role of APP_ROLES) {
      expect(canAccessPath(role, "/gizli-panel")).toBe(false);
      expect(canAccessPath(role, "/api/internal")).toBe(false);
    }
  });

  it("önek benzerliğiyle yetki sızdırmaz", () => {
    // "/posta" ile "/pos" iznini kapmaya çalışmak.
    expect(canAccessPath("waiter", "/posta")).toBe(false);
    expect(canAccessPath("manager", "/reportsx")).toBe(false);
  });
});

describe("ROLE_HOME", () => {
  it("her rolün gidebileceği bir ana ekranı vardır", () => {
    for (const role of APP_ROLES) {
      const home = ROLE_HOME[role];
      expect(home).toBeTruthy();
      expect(canAccessPath(role, home)).toBe(true);
    }
  });
});

describe("parseAppClaims", () => {
  const valid = {
    sub: "11111111-1111-4111-8111-111111111111",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    branch_id: "33333333-3333-4333-8333-333333333333",
    app_role: "manager" satisfies AppRole,
  };

  it("geçerli claim'leri çözer", () => {
    expect(parseAppClaims(valid)).toEqual({
      userId: valid.sub,
      tenantId: valid.tenant_id,
      branchId: valid.branch_id,
      role: "manager",
    });
  });

  it("branch_id opsiyoneldir (merkez kullanıcısı bir şubeye bağlı olmayabilir)", () => {
    const { branch_id: _omitted, ...withoutBranch } = valid;
    expect(parseAppClaims(withoutBranch)?.branchId).toBeNull();
  });

  it("tenant_id yoksa reddeder", () => {
    const { tenant_id: _omitted, ...withoutTenant } = valid;
    expect(parseAppClaims(withoutTenant)).toBeNull();
  });

  it("bilinmeyen rolü reddeder", () => {
    expect(parseAppClaims({ ...valid, app_role: "superadmin" })).toBeNull();
  });

  it("null/undefined/çöp girdide çökmez", () => {
    expect(parseAppClaims(null)).toBeNull();
    expect(parseAppClaims(undefined)).toBeNull();
    expect(parseAppClaims("token")).toBeNull();
    expect(parseAppClaims({})).toBeNull();
  });
});

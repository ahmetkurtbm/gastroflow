import { expect, type Page } from "@playwright/test";

import type { TestTenant } from "./supabase-admin";

export async function login(page: Page, tenant: Pick<TestTenant, "email" | "password">) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(tenant.email);
  await page.getByLabel("Şifre").fill(tenant.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  // Owner rolü /reports'a düşer (bkz. src/lib/auth/access.ts ROLE_HOME).
  await expect(page).toHaveURL(/\/reports/);
}

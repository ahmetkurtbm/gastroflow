import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { login } from "./helpers";
import { adminClient, type TestTenant } from "./supabase-admin";

const STATE_PATH = path.join(__dirname, ".state.json");

async function readState() {
  const raw = await readFile(STATE_PATH, "utf8");
  return JSON.parse(raw) as { orderFlow: TestTenant; isolationOther: TestTenant };
}

// Faz 7 sonrası backlog maddesi: personel eklemenin tek yolu SQL çalıştırmaktı
// — bir restoran sahibi kendi başına garson/müdür ekleyemiyordu. Bu test
// /settings/personel'in gerçekten bir hesap açıp (auth.users + memberships)
// listede gösterdiğini, rolü değiştirebildiğini ve pasif edebildiğini
// kanıtlıyor.
test("personel yönetimi: yeni personel eklenir, rolü değişir, pasif edilir", async ({ page }) => {
  const { orderFlow } = await readState();
  const email = `e2e-staff-${Date.now()}@example.invalid`;

  await login(page, orderFlow);
  await page.goto("/settings/personel");

  await page.getByLabel("Ad soyad").fill("E2E Test Garson");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Rol").selectOption("waiter");
  await page.getByRole("button", { name: "Personel ekle" }).click();

  // Şifre yalnızca bir kez gösteriliyor — bu, hesabın gerçekten oluştuğunun kanıtı.
  await expect(page.getByText(new RegExp(`${email} için hesap oluşturuldu`))).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Kaydettim, kapat" }).click();

  const row = page.locator("li").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("E2E Test Garson")).toBeVisible();

  await row.getByRole("combobox").selectOption("manager");
  await expect(row.getByRole("combobox")).toHaveValue("manager", { timeout: 10_000 });

  await row.getByRole("button", { name: "Pasif et" }).click();
  await expect(row.getByText("Pasif")).toBeVisible({ timeout: 10_000 });
  await expect(row.getByRole("button", { name: "Aktive et" })).toBeVisible();

  // Temizlik: `global-teardown.ts` yalnızca seed edilen owner kullanıcılarını
  // biliyor — bu testin oluşturduğu auth.users satırı tenant silinince
  // (memberships cascade) kendiliğinden gitmez, elle silinmesi gerekiyor.
  const admin = adminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", orderFlow.tenantId)
    .eq("role", "manager")
    .neq("user_id", orderFlow.userId)
    .maybeSingle();
  if (membership) {
    await admin.auth.admin.deleteUser(membership.user_id);
  }
});

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

// Geri bildirim: masa düzeni değiştirmenin (görsel/sürükle-bırak yerleşim)
// hiç yolu yoktu. Bu test iki adımı da kanıtlıyor: (1) yerleştirilmemiş bir
// masayı "seç → canvas'a dokun" ile ilk kez konumlandırmak, (2) yerleşmiş
// bir masayı sürükleyerek TAŞIMAK — ikisi de pos_x/pos_y'yi veritabanına
// yazıyor (bkz. updateTablePosition), ve tüm masalar yerleşince /pos'un
// ızgara yerine gerçek yerleşimi (canvas) göstermeye geçtiğini doğruluyor.
test("masa düzeni: yerleştirme ve sürükleyerek taşıma /pos'ta görsel canvas'a yansır", async ({
  page,
}) => {
  const { orderFlow } = await readState();
  const admin = adminClient();

  const { data: area } = await admin
    .from("areas")
    .insert({ tenant_id: orderFlow.tenantId, branch_id: orderFlow.branchId, name: `E2E Düzen ${Date.now()}` })
    .select("id, name")
    .single();
  const { data: table } = await admin
    .from("tables")
    .insert({
      tenant_id: orderFlow.tenantId,
      branch_id: orderFlow.branchId,
      area_id: area!.id,
      name: `E2E-Duzen-${Date.now()}`,
    })
    .select("id")
    .single();

  await login(page, orderFlow);
  await page.goto("/settings/salon");

  const areaSection = page.locator("section").filter({ has: page.getByRole("heading", { name: area!.name } ) });
  const canvas = areaSection.locator(".relative.h-72");
  const canvasBox = (await canvas.boundingBox())!;

  // 1) Yerleştirilmemiş masayı seç, canvas'ın ortasına dokun.
  const unplacedChip = areaSection.locator("button", { hasText: /E2E-Duzen-/ });
  await unplacedChip.click();
  await canvas.click({ position: { x: canvasBox.width / 2, y: canvasBox.height / 2 } });

  await expect
    .poll(async () => {
      const { data } = await admin.from("tables").select("pos_x, pos_y").eq("id", table!.id).single();
      return data?.pos_x !== null && data?.pos_y !== null;
    }, { timeout: 10_000 })
    .toBe(true);

  // 2) Şimdi yerleşmiş masayı sürükleyerek başka bir noktaya taşı.
  const chip = canvas.getByRole("button", { name: new RegExp(`E2E-Duzen-`) });
  const chipBox = (await chip.boundingBox())!;
  const startX = chipBox.x + chipBox.width / 2;
  const startY = chipBox.y + chipBox.height / 2;
  const targetX = canvasBox.x + canvasBox.width * 0.8;
  const targetY = canvasBox.y + canvasBox.height * 0.8;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(
      async () => {
        const { data } = await admin.from("tables").select("pos_x, pos_y").eq("id", table!.id).single();
        return data?.pos_x ?? null;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(60);

  // 3) /pos'ta bu alandaki TEK masa yerleşmiş olduğu için canvas görünümüne
  // geçmeli (ızgara değil) — bkz. pos/page.tsx "allPlaced".
  await page.goto("/pos");
  const posCanvas = page.locator("h2", { hasText: area!.name }).locator("xpath=following-sibling::div[1]");
  await expect(posCanvas).toHaveClass(/relative/);
});

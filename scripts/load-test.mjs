#!/usr/bin/env node
// =============================================================================
// Yük testi — "yoğun servis" simülasyonu (Faz 7)
// =============================================================================
// Gerçek bir cuma akşamını taklit eder: WAITERS sanal garson, aynı anda farklı
// masalarda adisyon açar, ürün ekler, mutfağa gönderir, öder. Bunu Next.js
// katmanını atlayıp doğrudan PostgREST'e (supabase-js + anon key, oturum açmış
// kullanıcı olarak) karşı çalıştırıyoruz — çünkü Next.js sunucusu durumsuz ve
// yatay ölçeklenir, gerçek darboğaz her zaman veritabanı/RLS katmanıdır.
//
// Test kendi tek kullanımlık kiracısını (tenant) yaratır, sonunda siler
// (tenant_id → cascade). Bu yüzden pgTAP testlerini kirleten "paylaşımlı canlı
// DB" sorunundan etkilenmez.
//
// Kullanım:
//   node scripts/load-test.mjs [--waiters=15] [--rounds=4] [--lines=3]
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const WAITERS = Number(args.waiters ?? 15);
const ROUNDS = Number(args.rounds ?? 4);
const LINES_PER_ORDER = Number(args.lines ?? 3);
const PRICE = 100;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error(
    "Eksik ortam değişkeni: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local'dan yükle).",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Gecikme örneklemesi
// ---------------------------------------------------------------------------
const samples = { openOrder: [], addLine: [], sendToKitchen: [], payment: [] };
const errors = [];
let orderNoRaces = 0;

async function timed(bucket, fn) {
  const start = performance.now();
  const result = await fn();
  samples[bucket].push(performance.now() - start);
  return result;
}

function percentile(arr, p) {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function report(name, arr) {
  if (arr.length === 0) {
    console.log(`  ${name.padEnd(14)} — hiç örnek yok`);
    return;
  }
  console.log(
    `  ${name.padEnd(14)} n=${String(arr.length).padEnd(5)} p50=${percentile(arr, 50).toFixed(0)}ms` +
      ` p95=${percentile(arr, 95).toFixed(0)}ms p99=${percentile(arr, 99).toFixed(0)}ms max=${Math.max(...arr).toFixed(0)}ms`,
  );
}

// ---------------------------------------------------------------------------
// 1. Kurulum: tek kullanımlık kiracı, şube, katalog, N masa, 1 patron kullanıcı
// ---------------------------------------------------------------------------
async function setup() {
  const slug = `yuk-testi-${Date.now()}`;
  const email = `yuktest-${Date.now()}@example.invalid`;
  const password = randomUUID();

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ name: "Yük Testi", slug })
    .select("id")
    .single();
  if (tenantError) throw new Error(`tenant: ${tenantError.message}`);

  const { data: branch, error: branchError } = await admin
    .from("branches")
    .insert({ tenant_id: tenant.id, name: "Merkez" })
    .select("id")
    .single();
  if (branchError) throw new Error(`branch: ${branchError.message}`);

  const { data: userRes, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Yük Testi Patron" },
  });
  if (userError) throw new Error(`user: ${userError.message}`);
  const userId = userRes.user.id;

  const { error: memberError } = await admin.from("memberships").insert({
    user_id: userId,
    tenant_id: tenant.id,
    branch_id: branch.id,
    role: "owner",
  });
  if (memberError) throw new Error(`membership: ${memberError.message}`);

  const { data: category, error: categoryError } = await admin
    .from("categories")
    .insert({ tenant_id: tenant.id, name: "Yiyecek" })
    .select("id")
    .single();
  if (categoryError) throw new Error(`category: ${categoryError.message}`);

  const { data: menuItem, error: menuItemError } = await admin
    .from("menu_items")
    .insert({ tenant_id: tenant.id, category_id: category.id, name: "Test Ürün" })
    .select("id")
    .single();
  if (menuItemError) throw new Error(`menu_item: ${menuItemError.message}`);

  const { error: priceError } = await admin
    .from("menu_prices")
    .insert({ tenant_id: tenant.id, menu_item_id: menuItem.id, branch_id: null, price: PRICE });
  if (priceError) throw new Error(`menu_price: ${priceError.message}`);

  const tableRows = Array.from({ length: WAITERS }, (_, i) => ({
    tenant_id: tenant.id,
    branch_id: branch.id,
    name: `T${i + 1}`,
  }));
  const { data: tables, error: tablesError } = await admin
    .from("tables")
    .insert(tableRows)
    .select("id");
  if (tablesError) throw new Error(`tables: ${tablesError.message}`);

  const { error: cashError } = await admin.from("cash_sessions").insert({
    tenant_id: tenant.id,
    branch_id: branch.id,
    opening_float: 0,
    opened_by: userId,
  });
  if (cashError) throw new Error(`cash_session: ${cashError.message}`);

  return { tenant, branch, userId, email, password, menuItemId: menuItem.id, tables };
}

async function cleanup(ctx) {
  await admin.from("tenants").delete().eq("id", ctx.tenant.id);
  await admin.auth.admin.deleteUser(ctx.userId);
}

// ---------------------------------------------------------------------------
// 2. Bir garsonun bir masada tek "servis turu": aç → ürün ekle → mutfağa
//    gönder → öde → kapat. `client`, sign-in olmuş bir kullanıcı oturumu.
// ---------------------------------------------------------------------------
async function runTableRound(client, ctx, tableId) {
  const { data: order, error: orderError } = await timed("openOrder", () =>
    client
      .from("orders")
      .insert({
        tenant_id: ctx.tenant.id,
        branch_id: ctx.branch.id,
        table_id: tableId,
        client_key: randomUUID(),
      })
      .select("id")
      .single(),
  );
  if (orderError) {
    // order_no ataması (max+1) yarış altında çakışabilir — bu, testin
    // bulmaya çalıştığı gerçek eşzamanlılık davranışı; çöktürmek yerine sayıyoruz.
    if (orderError.code === "23505") orderNoRaces++;
    throw orderError;
  }

  const lineResults = await Promise.allSettled(
    Array.from({ length: LINES_PER_ORDER }, () =>
      timed("addLine", () =>
        client
          .from("order_lines")
          .insert({
            tenant_id: ctx.tenant.id,
            order_id: order.id,
            menu_item_id: ctx.menuItemId,
            quantity: 1,
            unit_price: PRICE,
            client_key: randomUUID(),
          })
          .select("id")
          .single(),
      ),
    ),
  );
  const lineFailures = lineResults.filter(
    (r) => r.status === "rejected" || r.value?.error,
  );
  if (lineFailures.length > 0) {
    throw new Error(`addLine: ${lineFailures.length} satır reddedildi`);
  }

  const { error: sendError } = await timed("sendToKitchen", () =>
    client.from("order_lines").update({ status: "sent" }).eq("order_id", order.id).eq("status", "pending"),
  );
  if (sendError) throw sendError;

  const { error: payError } = await timed("payment", () =>
    client.from("payments").insert({
      tenant_id: ctx.tenant.id,
      order_id: order.id,
      method: "cash",
      amount: PRICE * LINES_PER_ORDER,
      client_key: randomUUID(),
    }),
  );
  if (payError) throw payError;

  const { error: closeError } = await client
    .from("orders")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "open");
  if (closeError) throw closeError;
}

// ---------------------------------------------------------------------------
// 3. Idempotency-altında-yarış testi: aynı client_key'i eşzamanlı iki kez gönder
// ---------------------------------------------------------------------------
async function runIdempotencyRaceTest(client, ctx, orderId) {
  const key = randomUUID();
  const attempt = () =>
    client.from("order_lines").insert({
      tenant_id: ctx.tenant.id,
      order_id: orderId,
      menu_item_id: ctx.menuItemId,
      quantity: 1,
      unit_price: 1,
      client_key: key,
    });

  const results = await Promise.allSettled([attempt(), attempt()]);
  const succeeded = results.filter((r) => r.status === "fulfilled" && !r.value.error).length;
  const conflicted = results.filter(
    (r) => r.status === "fulfilled" && r.value.error?.code === "23505",
  ).length;

  return succeeded === 1 && conflicted === 1;
}

// ---------------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Yük testi başlıyor: ${WAITERS} garson × ${ROUNDS} tur × ${LINES_PER_ORDER} ürün/adisyon\n`);

  const ctx = await setup();
  console.log(`Kiracı hazır: ${ctx.tenant.id} (${WAITERS} masa, 1 patron)`);

  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({
    email: ctx.email,
    password: ctx.password,
  });
  if (signInError) {
    await cleanup(ctx);
    throw new Error(`giriş: ${signInError.message}`);
  }

  const start = performance.now();
  const waiterTasks = ctx.tables.map((table) =>
    (async () => {
      for (let round = 0; round < ROUNDS; round++) {
        try {
          await runTableRound(client, ctx, table.id);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    })(),
  );
  await Promise.all(waiterTasks);
  const wallMs = performance.now() - start;

  // Idempotency-altında-yarış: yeni bir adisyon açıp aynı satırı iki kez
  // eşzamanlı denemeyi kanıtla.
  const { data: raceOrder, error: raceOrderError } = await client
    .from("orders")
    .insert({ tenant_id: ctx.tenant.id, branch_id: ctx.branch.id, client_key: randomUUID() })
    .select("id")
    .single();
  let idempotencyOk = false;
  if (!raceOrderError) {
    idempotencyOk = await runIdempotencyRaceTest(client, ctx, raceOrder.id);
  }

  // Sonuç sayıları — gerçekten kaç adisyon/satır/ödeme kalıcı oldu.
  const { count: orderCount } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenant.id);
  const { count: lineCount } = await admin
    .from("order_lines")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenant.id);
  const { count: paymentCount } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenant.id);

  await cleanup(ctx);

  const totalRounds = WAITERS * ROUNDS;
  const successfulOrders = (orderCount ?? 0) - 1; // -1: yarış testi için açılan ek adisyon
  const errorRate = errors.length / totalRounds;

  console.log(`\nSüre: ${(wallMs / 1000).toFixed(1)}s — ${totalRounds} tur, ${WAITERS} eşzamanlı garson\n`);
  console.log("Gecikme dağılımı:");
  report("Adisyon açma", samples.openOrder);
  report("Ürün ekleme", samples.addLine);
  report("Mutfağa gönder", samples.sendToKitchen);
  report("Ödeme", samples.payment);

  console.log(
    `\nSonuç: ${successfulOrders}/${totalRounds} adisyon tamamlandı (${lineCount} satır, ${paymentCount} ödeme).`,
  );
  console.log(`order_no çakışması (beklenen eşzamanlılık yarışı): ${orderNoRaces}`);
  console.log(
    `Idempotency (aynı client_key eşzamanlı 2× gönderim → tam 1 kalıcı): ${idempotencyOk ? "GEÇTİ" : "BAŞARISIZ"}`,
  );
  console.log(`Hata oranı: ${(errorRate * 100).toFixed(1)}% (${errors.length}/${totalRounds})`);
  if (errors.length > 0) {
    console.log("\nÖrnek hatalar:");
    for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);
  }

  const pass = idempotencyOk && errorRate < 0.05;
  console.log(`\n${pass ? "✅ YÜK TESTİ GEÇTİ" : "❌ YÜK TESTİ BAŞARISIZ"}`);
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  console.error("Yük testi çöktü:", error);
  process.exit(1);
});

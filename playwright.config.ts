import { defineConfig, devices } from "@playwright/test";

// Next.js dev sunucusu .env.local'i kendisi okur; ama bu config dosyası ve
// global-setup/teardown Next'in DIŞINDA, doğrudan Node ile çalışıyor —
// SUPABASE_SERVICE_ROLE_KEY gibi değişkenlere onlar da ihtiyaç duyuyor.
process.loadEnvFile?.(".env.local");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    // 3000 bu makinede başka bir yerel servis (Grafana) tarafından kullanılıyor —
    // e2e için ayrı bir port.
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Sadece saf mantık test edilir (erişim kuralları, birim dönüşümü, maliyet,
    // reçete patlatma). Veritabanı davranışı pgTAP ile supabase/tests altında
    // test edilir — orası bu koşucunun işi değil.
    include: ["src/**/*.test.ts"],
  },
});

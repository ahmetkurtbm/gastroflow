import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deno çalışma zamanı — Next.js app'in TS/ESLint kapsamının dışında
    // (bkz. tsconfig.json exclude), ayrı bir runtime, ayrı kurallar.
    "supabase/functions/**",
  ]),
  {
    rules: {
      // Alt çizgiyle başlayan değişkenler "bilerek kullanılmıyor" demektir.
      // Bir nesneden alan çıkarmak için destructuring kullanırken gerekiyor:
      //   const { tenant_id: _omitted, ...rest } = row;
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;

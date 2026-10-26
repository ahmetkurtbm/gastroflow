import { randomBytes } from "node:crypto";

import type { NextConfig } from "next";

// CSP her istekte yeni nonce gerektirdiği için src/proxy.ts içinde üretilir.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // AUTH_SECRET verilmezse oturum token'ları bu build'e özgü anahtarla imzalanır.
  env: { GASTROFLOW_BUILD_SECRET: randomBytes(32).toString("hex") },

  serverExternalPackages: ["@electric-sql/pglite", "pg"],

  // Migration ve tohum dosyaları çalışma anında okunur; sunucu paketine dahil edilmeli.
  outputFileTracingIncludes: {
    "/**/*": [
      "./db/compat.sql",
      "./db/seed.sql",
      "./db/migrations/*.sql",
      "./node_modules/@electric-sql/pglite/dist/{pglite.wasm,pglite.data,initdb.wasm,pgcrypto.tar.gz,citext.tar.gz}",
    ],
  },

  typescript: { ignoreBuildErrors: false },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Eski service worker önbellekte kalırsa yeni dağıtım kullanıcıya ulaşmaz.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;

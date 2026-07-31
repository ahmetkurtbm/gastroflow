import type { NextConfig } from "next";

/**
 * Statik güvenlik başlıkları.
 *
 * CSP burada DEĞİL, `src/middleware.ts` içinde üretilir: her istek için taze bir
 * nonce gerekiyor ve statik config'ten nonce üretilemez.
 */
const securityHeaders = [
  // Tarayıcıya "bu siteye bir daha asla http ile bağlanma" der.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Clickjacking. CSP'deki frame-ancestors ile birlikte çift kemer.
  { key: "X-Frame-Options", value: "DENY" },
  // Content-Type tahminini kapatır (yüklenen fatura görselleri için önemli).
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kamera açık: fatura/irsaliye tarama ekranı kullanacak. Gerisi kapalı.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Sunucu sürümünü sızdırmayalım.
  poweredByHeader: false,

  // Tip hatası build'i kırar. Bunu asla `true` yapma.
  // (Next 16'da `eslint` anahtarı kaldırıldı; lint ayrı komut olarak çalışır.)
  typescript: { ignoreBuildErrors: false },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

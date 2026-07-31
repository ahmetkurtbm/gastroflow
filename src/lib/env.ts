import { z } from "zod";

/**
 * Ortam değişkeni doğrulaması.
 *
 * Amaç: yanlış yapılandırmayı ilk istekte değil, uygulama ayağa kalkarken yakalamak.
 * Eksik bir anahtarla canlıya çıkmak, restoran servis açtıktan sonra fark edilecek
 * bir hata demek.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: "Geçerli bir Supabase URL'i olmalı" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20, "Publishable key eksik veya hatalı"),
});

const serverSchema = z.object({
  // DİKKAT: bu anahtar RLS'i tamamen bypass eder. Asla NEXT_PUBLIC_ öneki alamaz,
  // asla client bileşenine import edilemez. Sadece Server Action / Route Handler /
  // Edge Function içinde kullanılır.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
});

/**
 * Next.js `process.env.X` ifadelerini build sırasında değiştirir; bu yüzden
 * değişkenlere tek tek, açıkça erişmek zorundayız. `process.env` objesini
 * dinamik olarak dolaşmak client tarafında çalışmaz.
 */
function readClientEnv() {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Ortam değişkenleri hatalı. .env.example dosyasını .env.local olarak kopyalayıp doldur.\n" +
        z.prettifyError(parsed.error),
    );
  }

  return parsed.data;
}

export const clientEnv = readClientEnv();

/** Sadece sunucu tarafında çağır. Client bileşeninden çağırmak build'i kırar. */
export function getServerEnv() {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Sunucu ortam değişkenleri hatalı.\n" + z.prettifyError(parsed.error),
    );
  }

  return parsed.data;
}

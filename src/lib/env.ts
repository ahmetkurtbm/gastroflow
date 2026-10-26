import { z } from "zod";

// Yanlış yapılandırma ilk istekte değil, uygulama açılırken yakalansın.

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: "Geçerli bir Supabase URL'i olmalı" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20, "Publishable key eksik veya hatalı"),
});

const serverSchema = z.object({
  // RLS'i tamamen atlar; asla NEXT_PUBLIC_ öneki almaz, istemciye girmez.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
});

// Next `process.env.X` ifadelerini build'de değiştirdiği için değişkenler tek tek okunur.
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

// Doldurulmamış opsiyonel anahtarlar `X=""` olarak durur; zod `.optional()` boş
// string'i kabul etmediği için undefined'a çevrilir.
function emptyToUndefined(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

/** Yalnızca sunucuda çağrılır. */
export function getServerEnv() {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY),
    RESEND_API_KEY: emptyToUndefined(process.env.RESEND_API_KEY),
  });

  if (!parsed.success) {
    throw new Error(
      "Sunucu ortam değişkenleri hatalı.\n" + z.prettifyError(parsed.error),
    );
  }

  return parsed.data;
}

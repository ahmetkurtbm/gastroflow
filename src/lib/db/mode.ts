/**
 * `DATABASE_URL` tanımlıysa uygulama o Postgres'e bağlanır (yerel Docker).
 * Tanımlı değilse süreç içinde çalışan PGlite'a demo verisi yüklenir (Vercel).
 */
export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}
